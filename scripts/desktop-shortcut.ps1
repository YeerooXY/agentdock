$projectDir = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$executable = Join-Path $projectDir 'node_modules\electron\dist\electron.exe'
if (-not (Test-Path -LiteralPath $executable)) { throw 'Install and build Agent Dock first.' }
# Electron writes both the icon and the AppUserModelID; WScript shortcuts leave
# the latter empty, so Windows can group the running app under Electron.
$helper = Join-Path $PSScriptRoot 'desktop-shortcut.cjs'
$process = Start-Process -FilePath $executable -ArgumentList ('"' + $helper + '"') -WorkingDirectory $projectDir -WindowStyle Hidden -Wait -PassThru
if ($process.ExitCode -ne 0) { throw 'Agent Dock shortcuts could not be saved.' }
