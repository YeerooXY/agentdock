$projectDir = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$executable = Join-Path $projectDir 'node_modules\electron\dist\electron.exe'
if (-not (Test-Path -LiteralPath $executable)) { throw 'Install and build Agent Dock first.' }
$desktopDir = [Environment]::GetFolderPath('Desktop')
$shell = New-Object -ComObject WScript.Shell
$startMenuDir = [Environment]::GetFolderPath('Programs')
$locations = @($desktopDir,$startMenuDir) | Select-Object -Unique
foreach ($location in $locations) {
  $shortcutPath = Join-Path $location 'Agent Dock.lnk'
  if (Test-Path -LiteralPath $shortcutPath) {
    $existing = $shell.CreateShortcut($shortcutPath)
    if ($existing.TargetPath -ne $executable) { throw "A different shortcut already exists at $shortcutPath; it was preserved." }
  }
  $shortcut = $shell.CreateShortcut($shortcutPath)
  $shortcut.TargetPath = $executable
  $shortcut.Arguments = '"' + $projectDir + '"'
  $shortcut.WorkingDirectory = $projectDir
  $shortcut.Description = 'Open the Agent Dock dashboard'
  $shortcut.IconLocation = Join-Path $projectDir 'assets\icon.ico'
  $shortcut.Save()
  Write-Output $shortcutPath
}
