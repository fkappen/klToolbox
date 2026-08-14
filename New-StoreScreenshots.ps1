#Version
$version = "1.0.0"
$datum = "2026-08-14"
$autor = "FK"

# Erzeugt die Store-Grafiken (neutral, klToolbox-Design) nach screenshots\:
#   store-screenshot-1280x800.png  (Chrome Web Store, bevorzugte Groesse)
#   store-screenshot-640x400.png   (Chrome Web Store, kleine Variante / AMO)
#   promo-tile-440x280.png         (Chrome Web Store, kleines Promo-Tile)

Set-StrictMode -Version Latest

Add-Type -AssemblyName System.Drawing

$colPrimary = [System.Drawing.ColorTranslator]::FromHtml("#46626F")
$colDark = [System.Drawing.ColorTranslator]::FromHtml("#2C3E47")
$colAccent = [System.Drawing.ColorTranslator]::FromHtml("#7D939E")

$features = @(
    "KI-Umformulierer per Rechtsklick",
    "Ticket-Vorlagen mit Anrede-Platzhalter",
    "Outlook-Termin aus dem Ticket",
    "Wartezeit-Ampel und Schnellzugriffe",
    "KI-Chat und MS Account Cleaner"
)

function New-StoreImage {
    param(
        [int]$ImgW,
        [int]$ImgH,
        [string]$OutFile,
        [bool]$WithFeatures
    )

    $bmp = New-Object System.Drawing.Bitmap($ImgW, $ImgH)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = "AntiAlias"
    $g.TextRenderingHint = "AntiAliasGridFit"

    # Hintergrund: diagonaler Verlauf
    $rect = New-Object System.Drawing.Rectangle(0, 0, $ImgW, $ImgH)
    $grad = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect, $colPrimary, $colDark, 35)
    $g.FillRectangle($grad, $rect)

    # Akzentlinie unten
    $accBrush = New-Object System.Drawing.SolidBrush($colAccent)
    $g.FillRectangle($accBrush, 0, $ImgH - [int]($ImgH * 0.015), $ImgW, [int]($ImgH * 0.015))

    $scale = $ImgH / 800.0

    # Icon-Kachel (abgerundetes Quadrat mit "kT")
    $iconSize = [int](170 * $scale)
    $iconX = [int](90 * $scale)
    $iconY = [int](90 * $scale)
    $rad = [int]($iconSize * 0.22)
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path.AddArc($iconX, $iconY, $rad * 2, $rad * 2, 180, 90)
    $path.AddArc($iconX + $iconSize - $rad * 2, $iconY, $rad * 2, $rad * 2, 270, 90)
    $path.AddArc($iconX + $iconSize - $rad * 2, $iconY + $iconSize - $rad * 2, $rad * 2, $rad * 2, 0, 90)
    $path.AddArc($iconX, $iconY + $iconSize - $rad * 2, $rad * 2, $rad * 2, 90, 90)
    $path.CloseFigure()
    $white = [System.Drawing.Brushes]::White
    $g.FillPath($white, $path)
    $fmt = New-Object System.Drawing.StringFormat
    $fmt.Alignment = "Center"
    $fmt.LineAlignment = "Center"
    $fontIcon = New-Object System.Drawing.Font("Segoe UI", [int](70 * $scale), [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
    $iconBrush = New-Object System.Drawing.SolidBrush($colPrimary)
    $iconTextY = [single]($iconY + (4 * $scale))
    $iconRect = New-Object System.Drawing.RectangleF([single]$iconX, $iconTextY, [single]$iconSize, [single]$iconSize)
    $g.DrawString("kT", $fontIcon, $iconBrush, $iconRect, $fmt)

    # Titel + Untertitel
    $fmtLeft = New-Object System.Drawing.StringFormat
    $fmtLeft.Alignment = "Near"
    $fontTitle = New-Object System.Drawing.Font("Segoe UI", [int](86 * $scale), [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
    $titleX = [single]($iconX + $iconSize + (50 * $scale))
    $titleY = [single]($iconY - (6 * $scale))
    $titleW = [single]($ImgW - $titleX)
    $titleH = [single](120 * $scale)
    $rTitle = New-Object System.Drawing.RectangleF($titleX, $titleY, $titleW, $titleH)
    $g.DrawString("klToolbox", $fontTitle, $white, $rTitle, $fmtLeft)
    $fontSub = New-Object System.Drawing.Font("Segoe UI", [int](30 * $scale), [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
    $subBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(220, 255, 255, 255))
    $subX = [single]($titleX + (6 * $scale))
    $subY = [single]($iconY + (118 * $scale))
    $subH = [single](60 * $scale)
    $rSub = New-Object System.Drawing.RectangleF($subX, $subY, $titleW, $subH)
    $g.DrawString("Werkzeuge für IT-Service-Teams", $fontSub, $subBrush, $rSub, $fmtLeft)

    # Feature-Liste
    if ($WithFeatures) {
        $fontFeat = New-Object System.Drawing.Font("Segoe UI", [int](34 * $scale), [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
        $featY = [int](360 * $scale)
        $lineH = [int](74 * $scale)
        foreach ($feat in $features) {
            $dotSize = [int](16 * $scale)
            $g.FillEllipse($accBrush, [int](100 * $scale), $featY + [int](16 * $scale), $dotSize, $dotSize)
            $featX = [single](140 * $scale)
            $featW = [single]($ImgW - (200 * $scale))
            $rFeat = New-Object System.Drawing.RectangleF($featX, [single]$featY, $featW, [single]$lineH)
            $g.DrawString($feat, $fontFeat, $white, $rFeat, $fmtLeft)
            $featY += $lineH
        }
    }

    $g.Dispose()
    $bmp.Save($OutFile, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Host ("Erzeugt: " + $OutFile)
}

try {
    $outDir = Join-Path $PSScriptRoot "screenshots"
    if (-not (Test-Path $outDir)) {
        New-Item -ItemType Directory -Path $outDir | Out-Null
    }
    New-StoreImage -ImgW 1280 -ImgH 800 -OutFile (Join-Path $outDir "store-screenshot-1280x800.png") -WithFeatures $true
    New-StoreImage -ImgW 640 -ImgH 400 -OutFile (Join-Path $outDir "store-screenshot-640x400.png") -WithFeatures $true
    New-StoreImage -ImgW 440 -ImgH 280 -OutFile (Join-Path $outDir "promo-tile-440x280.png") -WithFeatures $false
}
catch {
    Write-Error $_
}
