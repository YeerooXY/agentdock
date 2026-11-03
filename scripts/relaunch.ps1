# Relaunch the development copy of Paddock with the latest code, with an
# automatic fallback to a known-good version, then keep it running.
#
#   powershell -ExecutionPolicy Bypass -File scripts\relaunch.ps1                  # fallback: last good version
#   powershell -ExecutionPolicy Bypass -File scripts\relaunch.ps1 -Fallback ede5216 # fallback: this commit
#   ... -Hours 16      keep Paddock running for this long (default 16; 0 = only switch once)
#   ... -Fallback      also accepts "none" to skip the fallback copy
#   ... -DelaySeconds  wait before stopping Paddock (lets an agent finish its reply)
#
# Nothing is stopped until the new code has built. The switch itself runs as a
# Windows scheduled task (scripts\paddock-supervisor.ps1), so it continues after
# Paddock and the console that started it have closed. Results are written to
# .build\relaunch\<time>\status.json and supervisor.log; create a file named
# "stop" there to end supervision early.
param([string]$Fallback = '', [double]$Hours = 16, [string[]]$DismissTasks = @(), [int]$DelaySeconds = 0)
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$exe = Join-Path $repo 'node_modules\electron\dist\electron.exe'
$node = (Get-Command node -ErrorAction Stop).Source
$runs = Join-Path $repo '.build\relaunch'; New-Item -ItemType Directory -Force -Path $runs | Out-Null
$lastGoodFile = Join-Path $runs 'last-good.txt'
function RepoGit { & git.exe -C $repo @args; if ($LASTEXITCODE) { throw "git $args failed." } }

if (-not (Test-Path $exe)) { throw 'Electron is not installed in node_modules. Run npm install first.' }
$newCommit = (RepoGit rev-parse --short HEAD).Trim()

# Fallback copy: a detached worktree of a known-good commit sharing node_modules.
if (-not $Fallback -and (Test-Path $lastGoodFile)) { $Fallback = (Get-Content $lastGoodFile -Raw).Trim() }
$fallbackFolder = ''
if ($Fallback -and $Fallback -ne 'none') {
  $sha = (RepoGit rev-parse --short "$Fallback^{commit}").Trim()
  $fallbackFolder = Join-Path $repo ".build\rollback-$sha"
  if (-not (Test-Path (Join-Path $fallbackFolder 'electron\main.cjs'))) { RepoGit worktree add --detach $fallbackFolder $sha | Out-Null }
  if (-not (Test-Path (Join-Path $fallbackFolder 'node_modules'))) { New-Item -ItemType Junction -Path (Join-Path $fallbackFolder 'node_modules') -Target (Join-Path $repo 'node_modules') | Out-Null }
  if (-not (Test-Path (Join-Path $fallbackFolder 'dist\index.html'))) {
    Push-Location $fallbackFolder; try { & $node node_modules/vite/bin/vite.js build | Out-Null; if ($LASTEXITCODE) { throw 'The fallback copy did not build.' } } finally { Pop-Location }
  }
  Write-Host "Fallback: $sha ($fallbackFolder)"
} else { Write-Host 'No fallback copy. Pass -Fallback <commit> to add one.' }

# Build the new code before anything is stopped.
Push-Location $repo; try { & $node node_modules/vite/bin/vite.js build | Out-Null; if ($LASTEXITCODE) { throw 'The new code did not build. Paddock was left running.' } } finally { Pop-Location }
foreach ($file in 'electron\main.cjs', 'electron\sessions.cjs', 'electron\mobile.cjs') { & $node --check (Join-Path $repo $file); if ($LASTEXITCODE) { throw "$file has a syntax error. Paddock was left running." } }

$data = Join-Path $env:APPDATA 'Paddock'
$mobile = try { Get-Content (Join-Path $data 'mobile.json') -Raw | ConvertFrom-Json } catch { $null }
$run = Join-Path $runs (Get-Date -Format 'yyyyMMdd-HHmmss'); New-Item -ItemType Directory -Path $run | Out-Null
[ordered]@{
  exe = $exe; appFolder = $repo; rollbackFolder = $(if ($fallbackFolder) { $fallbackFolder } else { $repo }); dataFolder = $data
  mobileEnabled = [bool]$mobile.enabled; mobileHost = [string]$mobile.host; mobilePort = $(if ($mobile.port) { [int]$mobile.port } else { 47831 })
  hours = $Hours; startDelaySeconds = $DelaySeconds; newCommit = $newCommit; lastGoodFile = $lastGoodFile; dismissTasks = $DismissTasks
} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $run 'config.json') -Encoding utf8

# A scheduled task runs outside Paddock's process tree, in this user's desktop session.
$name = 'Paddock relaunch ' + (Split-Path $run -Leaf)
$supervisor = Join-Path $PSScriptRoot 'paddock-supervisor.ps1'
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$supervisor`" -Root `"$run`""
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Hours ([Math]::Max(1, [Math]::Ceiling($Hours + 1)))) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $name -Action $action -Settings $settings -Principal $principal -Force | Out-Null
Start-ScheduledTask -TaskName $name
Write-Host "Relaunch started: new $newCommit. Status: $run\status.json"
