Add-Type -AssemblyName System.Drawing
$assetDir = Join-Path $PSScriptRoot '..\assets'
New-Item -ItemType Directory -Path $assetDir -Force | Out-Null
$bitmap = New-Object System.Drawing.Bitmap 128,128
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.Clear([System.Drawing.Color]::FromArgb(22,31,23))
$brush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(185,232,136))
foreach ($x in @(25,70)) {
  foreach ($y in @(25,70)) { $graphics.FillRectangle($brush,$x,$y,33,33) }
}
$bitmap.Save((Join-Path $assetDir 'icon.png'),[System.Drawing.Imaging.ImageFormat]::Png)
$icon = [System.Drawing.Icon]::FromHandle($bitmap.GetHicon())
$stream = [System.IO.File]::Create((Join-Path $assetDir 'icon.ico'))
$icon.Save($stream)
$stream.Dispose()
$icon.Dispose()
$brush.Dispose()
$graphics.Dispose()
$bitmap.Dispose()
