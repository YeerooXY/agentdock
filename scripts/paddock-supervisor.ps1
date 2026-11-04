# Paddock supervisor: restarts the development copy of Paddock with the latest
# code and keeps it running for a fixed time while the owner is away.
#
# Lessons from the 2 November watchdog (.build/restart-watchdog-20261102-152257):
# it stopped Paddock, then aborted because the old process still looked alive
# for a moment, and never relaunched. Here nothing after the stop step can
# abort: every failure leads to another launch attempt a minute later, and
# repeated failures of the new code switch to a known-good rollback copy.
#
# Run as a scheduled task (independent of Paddock's process tree):
#   powershell -File paddock-supervisor.ps1 -Root <run folder>
# The run folder holds config.json; status.json and supervisor.log are written there.
# Create a file named "stop" in the run folder to end supervision early.
param([Parameter(Mandatory = $true)][string]$Root)
$ErrorActionPreference = 'Continue'
$config = Get-Content -LiteralPath (Join-Path $Root 'config.json') -Raw | ConvertFrom-Json
$logFile = Join-Path $Root 'supervisor.log'
$state = [ordered]@{ phase = 'starting'; mode = 'new'; launches = 0; newFailures = 0; lastHealthyAt = $null; startedAt = (Get-Date).ToString('o'); until = (Get-Date).AddHours([double]$config.hours).ToString('o') }

function Log([string]$text) { "$((Get-Date).ToString('yyyy-MM-dd HH:mm:ss')) $text" | Add-Content -LiteralPath $logFile -Encoding utf8 }
function Save { $state.at = (Get-Date).ToString('o'); $state | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $Root 'status.json') -Encoding utf8 }
function AppFolder { if ($state.mode -eq 'rollback') { $config.rollbackFolder } else { $config.appFolder } }
# Main Electron processes of either copy (child processes carry --type=).
function MainProcesses {
  @(Get-CimInstance Win32_Process -Filter "Name = 'electron.exe'" -ErrorAction SilentlyContinue | Where-Object {
    $_.CommandLine -and $_.CommandLine -notmatch '--type=' -and $_.CommandLine -notmatch '--smoke-test' -and
    ($_.CommandLine -like "*$($config.appFolder)*" -or $_.CommandLine -like "*$($config.rollbackFolder)*")
  })
}
function PhoneReady([int]$processId) {
  # Only judge the phone listener when the Tailscale address exists on this PC.
  $hasAddress = @(Get-NetIPAddress -IPAddress $config.mobileHost -ErrorAction SilentlyContinue).Count -gt 0
  if (-not $config.mobileEnabled -or -not $hasAddress) { return $true }
  @(Get-NetTCPConnection -State Listen -LocalPort $config.mobilePort -ErrorAction SilentlyContinue | Where-Object { $_.OwningProcess -eq $processId }).Count -gt 0
}
function StopAll {
  foreach ($p in MainProcesses) {
    Log "Stopping Paddock process $($p.ProcessId)."
    & (Join-Path $env:SystemRoot 'System32\taskkill.exe') /PID $p.ProcessId /T /F 2>&1 | Out-Null
  }
  # Give Windows time to release the old process. Never abort here.
  for ($i = 0; $i -lt 30 -and @(MainProcesses).Count; $i++) { Start-Sleep -Seconds 2 }
  if (@(MainProcesses).Count) { Log 'An old Paddock process is still visible; continuing anyway.' }
}
function Launch {
  Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
  Remove-Item Env:NODE_OPTIONS -ErrorAction SilentlyContinue
  $folder = AppFolder
  try {
    $p = Start-Process -FilePath $config.exe -ArgumentList ('"' + $folder + '"') -WorkingDirectory $folder -PassThru
    $state.launches++; $state.lastLaunchAt = (Get-Date).ToString('o'); Log "Launched $($state.mode) copy ($folder) as process $($p.Id)."; Save
  } catch { Log "Launch failed: $($_.Exception.Message)" }
}
# Waits up to $seconds for a main process that stays up and has the phone listener.
function WaitHealthy([int]$seconds) {
  $deadline = (Get-Date).AddSeconds($seconds); $missing = 0
  while ((Get-Date) -lt $deadline) {
    Start-Sleep -Seconds 3
    $main = MainProcesses | Select-Object -First 1
    # A copy that exits at startup is a failure now, not after the full wait.
    if (-not $main) { if (++$missing -ge 6) { return $false }; continue } else { $missing = 0 }
    if (PhoneReady $main.ProcessId) {
      Start-Sleep -Seconds 20
      if (Get-Process -Id $main.ProcessId -ErrorAction SilentlyContinue) { return $true }
    }
  }
  return $false
}
# Copies Paddock's own startup errors since a launch into this log, so a
# failed start says why. The supervisor never edits Paddock's data: on
# 3 November it rewrote a task file in a form Paddock could not read, which
# stopped every start for 13 hours.
function ReportStartupErrors([datetime]$since) {
  $file = Join-Path $config.dataFolder 'logs\main.log'
  if (-not (Test-Path -LiteralPath $file)) { return }
  $cutoff = $since.ToUniversalTime()
  foreach ($line in (Get-Content -LiteralPath $file -Tail 200)) {
    if ($line -match '^(\S+) ERROR (.+)$') {
      $at = [datetime]::MinValue
      if ([datetime]::TryParse($Matches[1], [ref]$at) -and $at.ToUniversalTime() -ge $cutoff) { Log "Paddock reported: $($Matches[2])" }
    }
  }
}

Log "Supervisor started for $($config.hours) hours."; Save
# Lets the console that started the relaunch finish its reply first.
if ($config.startDelaySeconds) { Start-Sleep -Seconds ([int]$config.startDelaySeconds) }
# Switch to the new code.
$state.phase = 'switching'; Save
StopAll
for ($attempt = 1; $attempt -le 4; $attempt++) {
  if ($attempt -eq 3 -and $state.mode -eq 'new') { $state.mode = 'rollback'; Log 'New code did not become ready twice; switching to the rollback copy.'; StopAll }
  if (-not @(MainProcesses).Count) { Launch }
  if (WaitHealthy 150) {
    $state.lastHealthyAt = (Get-Date).ToString('o'); Log "Healthy ($($state.mode) copy)."
    # A healthy new copy becomes the fallback for the next relaunch.
    if ($state.mode -eq 'new' -and $config.newCommit -and $config.lastGoodFile) { Set-Content -LiteralPath $config.lastGoodFile -Value $config.newCommit -Encoding ascii; Log "Recorded $($config.newCommit) as the last good version." }
    break
  }
  if ($state.mode -eq 'new') { $state.newFailures++ }
  Log "Not ready after attempt $attempt."; ReportStartupErrors $state.lastLaunchAt
  StopAll
}
# Keep it running.
$state.phase = 'supervising'; Save
$recentCrashes = New-Object System.Collections.ArrayList; $failedInRow = 0
while ((Get-Date) -lt [datetime]$state.until) {
  if (Test-Path -LiteralPath (Join-Path $Root 'stop')) { Log 'Stop file found; ending supervision.'; break }
  Start-Sleep -Seconds 60
  if (@(MainProcesses).Count) { $state.lastHealthyAt = (Get-Date).ToString('o'); $failedInRow = 0; Save; continue }
  # One empty process query is not proof: on 3 November a single miss started
  # a second copy while Paddock was running. Confirm after ten seconds.
  Start-Sleep -Seconds 10
  if (@(MainProcesses).Count) { Log 'A process check missed Paddock once; it is running.'; continue }
  # After five failed starts in a row, try every ten minutes instead of every minute.
  if ($failedInRow -ge 5 -and $state.lastLaunchAt -and ((Get-Date) - [datetime]$state.lastLaunchAt).TotalMinutes -lt 10) { continue }
  Log 'Paddock is not running; relaunching.'
  [void]$recentCrashes.Add((Get-Date))
  $window = (Get-Date).AddMinutes(-30)
  $count = @($recentCrashes | Where-Object { $_ -gt $window }).Count
  if ($state.mode -eq 'new' -and $count -ge 3) { $state.mode = 'rollback'; Log 'Three stops in 30 minutes; switching to the rollback copy.' }
  Launch
  if (WaitHealthy 150) { $failedInRow = 0 } else { $failedInRow++; ReportStartupErrors $state.lastLaunchAt }
}
$state.phase = 'finished'; Save; Log 'Supervisor finished.'
