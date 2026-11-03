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
  for ($i = 0; $i -lt 30 -and (MainProcesses).Count; $i++) { Start-Sleep -Seconds 2 }
  if ((MainProcesses).Count) { Log 'An old Paddock process is still visible; continuing anyway.' }
}
function Launch {
  Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
  Remove-Item Env:NODE_OPTIONS -ErrorAction SilentlyContinue
  $folder = AppFolder
  try {
    $p = Start-Process -FilePath $config.exe -ArgumentList ('"' + $folder + '"') -WorkingDirectory $folder -PassThru
    $state.launches++; Log "Launched $($state.mode) copy ($folder) as process $($p.Id)."; Save
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
function DismissFailedTask {
  # Pi's empty meter task: close it while Paddock is stopped, with a reason.
  foreach ($id in @($config.dismissTasks)) {
    if (-not $id) { continue }
    $file = Join-Path $config.dataFolder "tasks\$id.json"
    try {
      $job = Get-Content -LiteralPath $file -Raw | ConvertFrom-Json
      if (-not $job.dismissedAt) {
        $now = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
        $job | Add-Member -NotePropertyName dismissedAt -NotePropertyValue $now -Force
        if (-not $job.acknowledgedAt) { $job | Add-Member -NotePropertyName acknowledgedAt -NotePropertyValue $now -Force }
        $job | Add-Member -NotePropertyName dismissReason -NotePropertyValue 'Worker made no changes; the meter was written directly (commit 83f98cb).' -Force
        $job | Add-Member -NotePropertyName dismissedBy -NotePropertyValue 'agent' -Force
        $tmp = "$file.tmp"; ($job | ConvertTo-Json -Depth 100) | Set-Content -LiteralPath $tmp -Encoding utf8; Move-Item -LiteralPath $tmp -Destination $file -Force
        Log "Closed task $id."
      }
    } catch { Log "Could not close task ${id}: $($_.Exception.Message)" }
  }
}

Log "Supervisor started for $($config.hours) hours."; Save
# Switch to the new code.
$state.phase = 'switching'; Save
StopAll
if (-not (MainProcesses).Count) { DismissFailedTask }
for ($attempt = 1; $attempt -le 4; $attempt++) {
  if ($attempt -eq 3 -and $state.mode -eq 'new') { $state.mode = 'rollback'; Log 'New code did not become ready twice; switching to the rollback copy.'; StopAll }
  if (-not (MainProcesses).Count) { Launch }
  if (WaitHealthy 150) {
    $state.lastHealthyAt = (Get-Date).ToString('o'); Log "Healthy ($($state.mode) copy)."
    # A healthy new copy becomes the fallback for the next relaunch.
    if ($state.mode -eq 'new' -and $config.newCommit -and $config.lastGoodFile) { Set-Content -LiteralPath $config.lastGoodFile -Value $config.newCommit -Encoding ascii; Log "Recorded $($config.newCommit) as the last good version." }
    break
  }
  if ($state.mode -eq 'new') { $state.newFailures++ }
  Log "Not ready after attempt $attempt."
  StopAll
}
# Keep it running.
$state.phase = 'supervising'; Save
$recentCrashes = New-Object System.Collections.ArrayList
while ((Get-Date) -lt [datetime]$state.until) {
  if (Test-Path -LiteralPath (Join-Path $Root 'stop')) { Log 'Stop file found; ending supervision.'; break }
  Start-Sleep -Seconds 60
  if ((MainProcesses).Count) { $state.lastHealthyAt = (Get-Date).ToString('o'); Save; continue }
  Log 'Paddock is not running; relaunching.'
  [void]$recentCrashes.Add((Get-Date))
  $window = (Get-Date).AddMinutes(-30)
  $count = @($recentCrashes | Where-Object { $_ -gt $window }).Count
  if ($state.mode -eq 'new' -and $count -ge 3) { $state.mode = 'rollback'; Log 'Three stops in 30 minutes; switching to the rollback copy.' }
  Launch
  [void](WaitHealthy 150)
}
$state.phase = 'finished'; Save; Log 'Supervisor finished.'
