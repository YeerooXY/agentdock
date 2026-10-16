param([string]$Installer)
$ErrorActionPreference = 'Stop'
$repoDir = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
if (-not $Installer) {
  $version = (Get-Content (Join-Path $repoDir 'package.json') -Raw | ConvertFrom-Json).version
  $Installer = Join-Path $repoDir "release\Agent-Dock-$version-Setup-x64.exe"
}
$Installer = (Resolve-Path -LiteralPath $Installer).Path
$uninstallRoots = @(
  'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall',
  'HKCU:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall',
  'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall',
  'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall'
)
function Get-DockInstall {
  @($uninstallRoots | Where-Object { Test-Path $_ } | ForEach-Object { Get-ChildItem $_ } | Get-ItemProperty | Where-Object { $_.DisplayName -eq 'Agent Dock' })
}
if ((Get-DockInstall).Count) { throw 'An installed copy of Agent Dock already exists. Test on a clean Windows account instead.' }
$testParent = (Resolve-Path (Join-Path $repoDir 'test-data')).Path
$workDir = Join-Path $testParent ('Installer check ' + [guid]::NewGuid().ToString('N'))
$installDir = Join-Path $workDir 'Chosen app folder'
New-Item -ItemType Directory -Path $workDir | Out-Null
function Assert-TestPath([string]$target) {
  $full = [IO.Path]::GetFullPath($target)
  if (-not $full.StartsWith($testParent + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Test path is outside test-data.' }
}
Assert-TestPath $workDir
Assert-TestPath $installDir
$shortcuts = @(
  (Join-Path ([Environment]::GetFolderPath('DesktopDirectory')) 'Agent Dock.lnk'),
  (Join-Path ([Environment]::GetFolderPath('Programs')) 'Agent Dock.lnk')
)
$backups = @{}
foreach ($shortcut in $shortcuts) {
  if (Test-Path -LiteralPath $shortcut) { $backups[$shortcut] = [IO.File]::ReadAllBytes($shortcut) }
}
try {
  $process = Start-Process -FilePath $Installer -ArgumentList @('/S', '/currentuser', '--no-desktop-shortcut', "/D=$installDir") -WindowStyle Hidden -PassThru
  if (-not $process.WaitForExit(60000)) { throw 'Installer did not finish within 60 seconds.' }
  if ($process.ExitCode -ne 0) { throw "Installer exited with $($process.ExitCode)." }
  $exe = Join-Path $installDir 'Agent Dock.exe'
  if (-not (Test-Path -LiteralPath $exe)) { throw 'Installer did not use the chosen destination.' }
  $registered = @(Get-DockInstall)
  if ($registered.Count -ne 1 -or -not $registered[0].UninstallString.Contains($installDir)) { throw ('Windows uninstall registration is incorrect: ' + ($registered | Select-Object DisplayName,UninstallString,PSPath | ConvertTo-Json -Compress)) }
  $link = (New-Object -ComObject WScript.Shell).CreateShortcut($shortcuts[1])
  if ($link.TargetPath -ne $exe) { throw 'The Start menu shortcut points to the wrong executable.' }
  & node (Join-Path $PSScriptRoot 'packaged-smoke.cjs') "--app=$exe"
  if ($LASTEXITCODE -ne 0) { throw 'The installed application failed its smoke test.' }
  & node (Join-Path $PSScriptRoot 'workbench-smoke.cjs') "--app=$exe"
  if ($LASTEXITCODE -ne 0) { throw 'The installed gallery, inbox, website review or console move checks failed.' }
} finally {
  try {
    $uninstaller = Join-Path $installDir 'Uninstall Agent Dock.exe'
    if (Test-Path -LiteralPath $uninstaller) {
      Assert-TestPath $installDir
      $process = Start-Process -FilePath $uninstaller -ArgumentList @('/S', '/currentuser', "_?=$installDir") -WindowStyle Hidden -PassThru
      if (-not $process.WaitForExit(60000)) { throw 'Uninstaller did not finish within 60 seconds.' }
      if ($process.ExitCode -ne 0) { throw "Uninstaller exited with $($process.ExitCode)." }
    }
  } finally {
    foreach ($shortcut in $shortcuts) {
      if ($backups.ContainsKey($shortcut)) { [IO.File]::WriteAllBytes($shortcut, $backups[$shortcut]) }
      elseif (Test-Path -LiteralPath $shortcut) { Remove-Item -LiteralPath $shortcut }
    }
  }
}
if ((Get-DockInstall).Count) { throw 'Uninstaller left a Windows uninstall registration behind.' }
if (Test-Path -LiteralPath (Join-Path $installDir 'Agent Dock.exe')) { throw 'Uninstaller left the application behind.' }
Assert-TestPath $workDir
Remove-Item -LiteralPath $workDir -Recurse -Force
Write-Output 'PASS: per-user install in a chosen folder, Start menu shortcut, installed app checks, and clean uninstall. Existing shortcuts restored.'
