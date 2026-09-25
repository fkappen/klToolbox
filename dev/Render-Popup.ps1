param(
    [string]$Browser = "",
    [string]$Settings = "",
    [int]$Width = 380,
    [int]$Height = 640
)

#Version
$version = "1.0.0"
$datum = "2026-09-25"
$autor = "Felix Kappen"

<#
.SYNOPSIS
    Rendert das Popup (chromium/popup.html) ohne Browser-Erweiterung als
    Screenshot - hell, dunkel und "Automatisch" - ueber Headless-Chromium.

.DESCRIPTION
    Baut in dev/out/harness eine Kopie des Popups, haengt dev/fake-chrome.js
    (Attrappe der Erweiterungs-API) davor und setzt Beispieldaten ein:
    dev/sample-settings.json, ueberlagert von dev/local-settings.json, falls
    vorhanden (bleibt per .gitignore lokal - dort kann der Firmen-Export
    liegen). Ergebnis: dev/out/popup-light.png, popup-dark.png, popup-auto.png.

    Erzwungen hell/dunkel entsteht ueber die Einstellung "theme" der
    Erweiterung, nicht ueber Browser-Schalter (die greifen im Headless-
    Modus nicht zuverlaessig).

.PARAMETER Browser
    Pfad zu msedge.exe / chrome.exe / brave.exe. Ohne Angabe wird gesucht.

.PARAMETER Settings
    Zusaetzliche Einstellungs-Datei (JSON, Export-Format oder rohes Objekt),
    die ueber sample + local gelegt wird.
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

try {
    $devDir = $PSScriptRoot
    $root = Split-Path -Parent $devDir
    $chromium = Join-Path $root "chromium"
    $outDir = Join-Path $devDir "out"
    $work = Join-Path $outDir "harness"

    if (-not (Test-Path $chromium)) {
        throw "chromium/ nicht gefunden unter $root"
    }
    if (Test-Path $work) {
        Remove-Item -LiteralPath $work -Recurse -Force -Confirm:$false
    }
    New-Item -ItemType Directory -Path $work -Force | Out-Null

    # ------------------------------------------------ Browser finden
    if ([string]::IsNullOrWhiteSpace($Browser)) {
        $kandidaten = @(
            "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
            "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
            "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
            "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
            "$env:ProgramFiles\BraveSoftware\Brave-Browser\Application\brave.exe",
            "$env:LOCALAPPDATA\BraveSoftware\Brave-Browser\Application\brave.exe"
        )
        foreach ($k in $kandidaten) {
            if (Test-Path $k) {
                $Browser = $k
                break
            }
        }
    }
    if ([string]::IsNullOrWhiteSpace($Browser) -or -not (Test-Path $Browser)) {
        throw "Kein Chromium-Browser gefunden - Pfad per -Browser angeben."
    }
    Write-Host "Browser: $Browser"

    # ------------------------------------------------ Einstellungen zusammenfuehren
    function Read-SettingsFile([string]$Path) {
        $j = Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($null -ne $j.PSObject.Properties["settings"] -and $null -ne $j.settings) {
            return $j.settings
        }
        return $j
    }
    $daten = @{}
    $quellen = @((Join-Path $devDir "sample-settings.json"), (Join-Path $devDir "local-settings.json"))
    if (-not [string]::IsNullOrWhiteSpace($Settings)) {
        $quellen += $Settings
    }
    foreach ($q in $quellen) {
        if (-not (Test-Path $q)) {
            continue
        }
        $obj = Read-SettingsFile $q
        foreach ($p in $obj.PSObject.Properties) {
            if ($p.Name -like "_*") {
                continue
            }
            $daten[$p.Name] = $p.Value
        }
        Write-Host "Einstellungen: $q"
    }

    # ------------------------------------------------ Harness bauen
    foreach ($f in @("popup.html", "popup.js", "icon32.png", "dosis-latin.woff2", "dosis-latin-ext.woff2")) {
        Copy-Item -LiteralPath (Join-Path $chromium $f) -Destination $work
    }
    $vorlage = Get-Content -LiteralPath (Join-Path $devDir "fake-chrome.js") -Raw -Encoding UTF8
    $html = Get-Content -LiteralPath (Join-Path $work "popup.html") -Raw -Encoding UTF8
    $utf8 = New-Object System.Text.UTF8Encoding($false)

    $varianten = @{ auto = $null; light = "light"; dark = "dark" }
    foreach ($name in @("auto", "light", "dark")) {
        $d = @{} + $daten
        if ($null -ne $varianten[$name]) {
            $d["theme"] = $varianten[$name]
        }
        $json = ($d | ConvertTo-Json -Depth 10 -Compress)
        [System.IO.File]::WriteAllText((Join-Path $work "fake-chrome-$name.js"), $vorlage.Replace("/*__DATA__*/{}", $json), $utf8)
        $seite = $html.Replace('<script src="popup.js"></script>', "<script src=""fake-chrome-$name.js""></script><script src=""popup.js""></script>")
        [System.IO.File]::WriteAllText((Join-Path $work "popup-$name.html"), $seite, $utf8)
    }

    # ------------------------------------------------ Rendern
    foreach ($name in @("auto", "light", "dark")) {
        $url = "file:///" + ((Join-Path $work "popup-$name.html") -replace "\\", "/")
        $png = Join-Path $outDir "popup-$name.png"
        $ud = Join-Path $work "ud-$name"
        # Start-Process (PS 5.1) reiht die Argumente nur mit Leerzeichen
        # aneinander - Pfade mit Leerzeichen muessen selbst in Anfuehrungs-
        # zeichen stehen, sonst zerfallen sie.
        $args = @(
            "--headless=new", "--disable-gpu", "--no-first-run", "--hide-scrollbars",
            "--user-data-dir=""$ud""", "--window-size=$Width,$Height", "--virtual-time-budget=4000",
            "--screenshot=""$png""", """$url"""
        )
        $p = Start-Process -FilePath $Browser -ArgumentList $args -PassThru -Wait -WindowStyle Hidden
        if ($p.ExitCode -ne 0 -or -not (Test-Path $png)) {
            Write-Warning "Render $name fehlgeschlagen (ExitCode $($p.ExitCode))"
        } else {
            Write-Host ("{0,-6} -> {1}" -f $name, $png) -ForegroundColor Green
        }
    }
}
catch {
    Write-Error $_
}
