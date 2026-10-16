# Rasterize the geometric mark in assets/icon.svg for Windows shortcuts and tray.
Add-Type -AssemblyName System.Drawing
$assetDir = Join-Path $PSScriptRoot '..\assets'
New-Item -ItemType Directory -Path $assetDir -Force | Out-Null
$bitmap = New-Object System.Drawing.Bitmap 256,256
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.Clear([System.Drawing.Color]::Transparent)
$bounds = [System.Drawing.Rectangle]::new(8,8,240,240)
$surface = [System.Drawing.Drawing2D.LinearGradientBrush]::new($bounds,[System.Drawing.ColorTranslator]::FromHtml('#152035'),[System.Drawing.ColorTranslator]::FromHtml('#221425'),45)
$accent = [System.Drawing.Drawing2D.LinearGradientBrush]::new($bounds,[System.Drawing.ColorTranslator]::FromHtml('#89b4ff'),[System.Drawing.ColorTranslator]::FromHtml('#f19cda'),45)
$outline = [System.Drawing.Pen]::new([System.Drawing.ColorTranslator]::FromHtml('#80749a'),2)
$pen = [System.Drawing.Pen]::new($accent,12)
$pen.StartCap = $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
$plate = [System.Drawing.Drawing2D.GraphicsPath]::new()
$plate.AddArc(8,8,120,120,180,90)
$plate.AddArc(128,8,120,120,270,90)
$plate.AddArc(128,128,120,120,0,90)
$plate.AddArc(8,128,120,120,90,90)
$plate.CloseFigure()
$graphics.FillPath($surface,$plate)
$graphics.DrawPath($outline,$plate)
$mark = [System.Drawing.Drawing2D.GraphicsPath]::new()
$mark.AddLine(88,43,63,43); $mark.AddArc(43,43,40,40,270,-90); $mark.AddLine(43,63,43,88)
$mark.StartFigure(); $mark.AddLine(168,43,193,43); $mark.AddArc(173,43,40,40,270,90); $mark.AddLine(213,63,213,88)
$mark.StartFigure(); $mark.AddLine(213,168,213,193); $mark.AddArc(173,173,40,40,0,90); $mark.AddLine(193,213,168,213)
$mark.StartFigure(); $mark.AddLine(88,213,63,213); $mark.AddArc(43,173,40,40,90,90); $mark.AddLine(43,193,43,168)
$star = [System.Drawing.PointF[]]@([System.Drawing.PointF]::new(128,68),[System.Drawing.PointF]::new(146,110),[System.Drawing.PointF]::new(188,128),[System.Drawing.PointF]::new(146,146),[System.Drawing.PointF]::new(128,188),[System.Drawing.PointF]::new(110,146),[System.Drawing.PointF]::new(68,128),[System.Drawing.PointF]::new(110,110))
$graphics.DrawPath($pen,$mark)
$graphics.DrawPolygon($pen,$star)
$bitmap.Save((Join-Path $assetDir 'icon.png'),[System.Drawing.Imaging.ImageFormat]::Png)
$icon = [System.Drawing.Icon]::FromHandle($bitmap.GetHicon())
$stream = [System.IO.File]::Create((Join-Path $assetDir 'icon.ico'))
$icon.Save($stream)
$stream.Dispose(); $icon.Dispose(); $mark.Dispose(); $plate.Dispose(); $pen.Dispose(); $outline.Dispose(); $accent.Dispose(); $surface.Dispose(); $graphics.Dispose(); $bitmap.Dispose()
