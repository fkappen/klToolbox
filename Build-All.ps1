#Version
$version = "2.0.0"
$datum = "2026-08-14"
$autor = "Felix Kappen"

# Gesamt-Build der Kloeschinski Toolbox im klToolbox-Repo:
#   1. firefox/  aus chromium/ synchronisieren (Firefox-Manifest einsetzen)
#   2. releases/kl-toolbox-chromium-v<ver>.zip  (Store-Upload UND Bypass-Install)
#   3. releases/kl-toolbox-firefox-v<ver>.zip   (AMO-Upload)
#   4. signierte dist/kl-toolbox-firefox-v<ver>.xpi -> releases/ uebernehmen
#   5. releases/updates.json aus allen vorhandenen .xpi-Dateien erzeugen
#
# dist/ (nicht committet) dient nur noch als Ablage fuer die von AMO
# signierte .xpi, bevor der naechste Build sie nach releases/ uebernimmt.
#
# Die Signierung der .xpi macht Mozilla (AMO, Kanal "Nicht gelistet"):
# Firefox-ZIP hochladen, signierte .xpi herunterladen, als
# kl-toolbox-firefox-v<ver>.xpi nach dist\ legen, Script erneut ausfuehren.

Set-StrictMode -Version Latest

$updateUrl = "https://raw.githubusercontent.com/fkappen/klToolbox/main/releases/updates.json"
$xpiBaseUrl = "https://raw.githubusercontent.com/fkappen/klToolbox/main/releases/"
$geckoId = "toolbox@kloeschinski.de"

try {
    $root = $PSScriptRoot
    $chromiumDir = Join-Path $root "chromium"
    $firefoxDir = Join-Path $root "firefox"
    $releasesDir = Join-Path $root "releases"
    $distDir = Join-Path $root "dist"

    foreach ($d in @($releasesDir, $distDir)) {
        if (-not (Test-Path $d)) {
            New-Item -ItemType Directory -Path $d | Out-Null
        }
    }

    $manifest = Get-Content -LiteralPath (Join-Path $chromiumDir "manifest.json") -Raw -Encoding UTF8 | ConvertFrom-Json
    $ver = $manifest.version
    Write-Host "=== Kloeschinski Toolbox v$ver - Build ===" -ForegroundColor Cyan

    # ------------------------------------------- 1. firefox/ synchronisieren
    if (Test-Path $firefoxDir) {
        Remove-Item -LiteralPath $firefoxDir -Recurse -Force -Confirm:$false
    }
    New-Item -ItemType Directory -Path $firefoxDir | Out-Null
    Get-ChildItem -LiteralPath $chromiumDir -File | Where-Object { $_.Name -ne "manifest.json" } | ForEach-Object {
        Copy-Item -LiteralPath $_.FullName -Destination $firefoxDir
    }
    $ffManifest = Get-Content -LiteralPath (Join-Path $root "manifest.firefox.json") -Raw -Encoding UTF8
    $ffManifest = $ffManifest.Replace("__VERSION__", $ver).Replace("__UPDATE_URL__", $updateUrl)
    # UTF-8 mit BOM, damit Umlaute im Manifest ueberall sauber gelesen werden
    [System.IO.File]::WriteAllText((Join-Path $firefoxDir "manifest.json"), $ffManifest, (New-Object System.Text.UTF8Encoding($true)))
    Write-Host "firefox/ synchronisiert (update_url -> releases/updates.json)"

    # ------------------------------------------- 2. Chromium-ZIP (releases/)
    $chromiumZip = Join-Path $releasesDir ("kl-toolbox-chromium-v" + $ver + ".zip")
    if (Test-Path $chromiumZip) {
        Remove-Item -LiteralPath $chromiumZip -Force -Confirm:$false
    }
    Compress-Archive -Path (Join-Path $chromiumDir "*") -DestinationPath $chromiumZip -CompressionLevel Optimal
    Write-Host "Chromium-ZIP: releases\kl-toolbox-chromium-v$ver.zip (Store-Upload + Bypass)" -ForegroundColor Green

    # ------------------------------------------- 3. Firefox-ZIP (releases/, AMO)
    $firefoxZip = Join-Path $releasesDir ("kl-toolbox-firefox-v" + $ver + ".zip")
    if (Test-Path $firefoxZip) {
        Remove-Item -LiteralPath $firefoxZip -Force -Confirm:$false
    }
    Compress-Archive -Path (Join-Path $firefoxDir "*") -DestinationPath $firefoxZip -CompressionLevel Optimal
    Write-Host "Firefox-ZIP:  releases\kl-toolbox-firefox-v$ver.zip (AMO-Upload)" -ForegroundColor Green

    # ------------------------------------------- 4. signierte .xpi einsammeln
    $xpiName = "kl-toolbox-firefox-v" + $ver + ".xpi"
    $xpiSource = Join-Path $distDir $xpiName
    if (Test-Path $xpiSource) {
        Copy-Item -LiteralPath $xpiSource -Destination (Join-Path $releasesDir $xpiName) -Force
        Write-Host "Signierte .xpi -> releases\$xpiName uebernommen" -ForegroundColor Green
    } else {
        Write-Warning "Noch keine signierte .xpi fuer v$ver in dist\ (AMO-Signierung ausstehend)."
    }

    # ------------------------------------------- 5. updates.json erzeugen
    # Alle in releases/ vorhandenen signierten Versionen listen -
    # Firefox waehlt selbst die hoechste kompatible Version.
    $updates = @()
    Get-ChildItem -LiteralPath $releasesDir -File | Where-Object { $_.Name -match '^kl-toolbox-firefox-v([0-9\.]+)\.xpi$' } | ForEach-Object {
        $null = $_.Name -match '^kl-toolbox-firefox-v([0-9\.]+)\.xpi$'
        $updates += @{
            version = $Matches[1]
            update_link = $xpiBaseUrl + $_.Name
        }
    }
    if ($updates.Count -gt 0) {
        $updatesJson = @{
            addons = @{
                $geckoId = @{
                    updates = $updates
                }
            }
        } | ConvertTo-Json -Depth 6
        [System.IO.File]::WriteAllText((Join-Path $releasesDir "updates.json"), $updatesJson, (New-Object System.Text.UTF8Encoding($true)))
        Write-Host ("releases\updates.json erzeugt (" + $updates.Count + " Version(en))")
    } else {
        Write-Warning "Keine .xpi in releases\ - updates.json nicht erzeugt."
    }

    Write-Host ""
    Write-Host "Naechste Schritte:"
    Write-Host "  Chromium: releases\kl-toolbox-chromium-v$ver.zip in der Chrome-Devconsole einreichen"
    Write-Host "  Firefox:  releases\kl-toolbox-firefox-v$ver.zip bei AMO hochladen (Nicht gelistet),"
    Write-Host "            signierte .xpi als $xpiName nach dist\ legen, Script erneut ausfuehren"
    Write-Host "  Danach:   git add/commit/push (Repo muss oeffentlich bleiben)"
}
catch {
    Write-Error $_
}
