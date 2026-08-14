#Version
$version = "2.0.0"
$datum = "2026-08-14"
$autor = "FK"

# Verteilt die klToolbox per Richtlinien-Registry (HKLM) an Chrome, Edge,
# Brave und Firefox:
#   - Force-Install der Extension (Chromium: Chrome Web Store, Firefox: xpi aus dem Repo)
#   - Managed Storage "defaultsJson" mit den Vorgaben aus einer INTERN
#     verteilten Defaults-Datei (liegt bewusst NICHT in diesem Repo)
#
# Einsatz: als Computer-Startskript in einer GPO, per RMM oder manuell als
# Admin. Die Registry-Pfade entsprechen GPP-Registry-Eintraegen (README.md).
#
# WICHTIG: -ExtensionId ist die ID des Chrome-Web-Store-Eintrags. Nach einer
# Neu-Einreichung aendert sie sich - dann hier den neuen Standardwert pflegen.
#
# Parameter:
#   -Browsers      Teilmenge aus Chrome, Edge, Brave, Firefox (Standard: alle)
#   -DefaultsPath  Pfad zur internen Defaults-JSON (PFLICHT fuer defaultsJson)
#   -ExtensionId   Chrome-Web-Store-ID der klToolbox

param(
    [ValidateSet("Chrome", "Edge", "Brave", "Firefox")]
    [string[]]$Browsers = @("Chrome", "Edge", "Brave", "Firefox"),
    [Parameter(Mandatory = $true)]
    [string]$DefaultsPath,
    [string]$ExtensionId = "NEUE_STORE_ID_HIER_EINTRAGEN"
)

Set-StrictMode -Version Latest

$geckoId = "app@kltoolbox.dev"
$cwsUpdateUrl = "https://clients2.google.com/service/update2/crx"
$repoRawBase = "https://raw.githubusercontent.com/fkappen/klToolbox/main/releases/"

$chromiumTargets = @{
    Chrome = "HKLM:\SOFTWARE\Policies\Google\Chrome"
    Edge   = "HKLM:\SOFTWARE\Policies\Microsoft\Edge"
    Brave  = "HKLM:\SOFTWARE\Policies\BraveSoftware\Brave"
}

function Ensure-Key {
    param([string]$Path)
    if (-not (Test-Path $Path)) {
        New-Item -Path $Path -Force | Out-Null
    }
}

try {
    $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    if (-not $isAdmin) {
        throw "Bitte als Administrator ausfuehren (HKLM-Richtlinien)."
    }
    if ($ExtensionId -eq "NEUE_STORE_ID_HIER_EINTRAGEN") {
        throw "Chrome-Web-Store-ID fehlt (-ExtensionId) - nach der Store-Einreichung eintragen."
    }

    # ------------------------------------------- Defaults-JSON laden (intern)
    $defaultsRaw = Get-Content -LiteralPath $DefaultsPath -Raw -Encoding UTF8
    $defaultsObj = $defaultsRaw | ConvertFrom-Json
    if ($null -eq $defaultsObj) {
        throw "Defaults-JSON konnte nicht gelesen werden."
    }
    $defaultsCompact = $defaultsObj | ConvertTo-Json -Compress -Depth 10
    Write-Host ("Defaults geladen (" + $defaultsCompact.Length + " Zeichen)")

    # ------------------------------------------- Chromium (Chrome/Edge/Brave)
    foreach ($browser in $Browsers) {
        if (-not $chromiumTargets.ContainsKey($browser)) {
            continue
        }
        $base = $chromiumTargets[$browser]

        # Force-Install: vorhandene Nummern respektieren, eigene ID nur einmal
        $flKey = Join-Path $base "ExtensionInstallForcelist"
        Ensure-Key $flKey
        $flEntry = $ExtensionId + ";" + $cwsUpdateUrl
        $existing = Get-Item -LiteralPath $flKey
        $found = $false
        $maxIdx = 0
        foreach ($name in $existing.GetValueNames()) {
            $val = [string]$existing.GetValue($name)
            $idx = 0
            if ([int]::TryParse($name, [ref]$idx) -and $idx -gt $maxIdx) {
                $maxIdx = $idx
            }
            if ($val -like ($ExtensionId + "*")) {
                Set-ItemProperty -LiteralPath $flKey -Name $name -Value $flEntry
                $found = $true
            }
        }
        if (-not $found) {
            Set-ItemProperty -LiteralPath $flKey -Name ([string]($maxIdx + 1)) -Value $flEntry
        }

        # Managed Storage: defaultsJson
        $polKey = Join-Path $base ("3rdparty\extensions\" + $ExtensionId + "\policy")
        Ensure-Key $polKey
        Set-ItemProperty -LiteralPath $polKey -Name "defaultsJson" -Value $defaultsCompact
        Write-Host ($browser + ": Force-Install + defaultsJson gesetzt") -ForegroundColor Green
    }

    # ------------------------------------------- Firefox
    if ($Browsers -contains "Firefox") {
        $ffBase = "HKLM:\SOFTWARE\Policies\Mozilla\Firefox"
        Ensure-Key $ffBase

        # Aktuellste signierte xpi aus der updates.json des Repos ermitteln
        [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
        $updates = (Invoke-WebRequest -Uri ($repoRawBase + "updates.json") -UseBasicParsing).Content | ConvertFrom-Json
        $entries = @($updates.addons.$geckoId.updates)
        if ($entries.Count -eq 0) {
            throw "Keine signierte Firefox-Version in updates.json gefunden."
        }
        $latest = $entries | Sort-Object { [version]$_.version } | Select-Object -Last 1
        Write-Host ("Firefox: aktuellste signierte Version " + $latest.version)

        # ExtensionSettings: bestehende Richtlinie mergen statt ueberschreiben
        $ffSettings = $null
        $existingRaw = (Get-ItemProperty -LiteralPath $ffBase -Name "ExtensionSettings" -ErrorAction SilentlyContinue).ExtensionSettings
        if (-not [string]::IsNullOrWhiteSpace($existingRaw)) {
            try {
                $ffSettings = $existingRaw | ConvertFrom-Json
            }
            catch {
                Write-Warning "Vorhandene ExtensionSettings sind kein gueltiges JSON - Sicherung nach ExtensionSettings_backup."
                Set-ItemProperty -LiteralPath $ffBase -Name "ExtensionSettings_backup" -Value $existingRaw
                $ffSettings = $null
            }
        }
        if ($null -eq $ffSettings) {
            $ffSettings = New-Object PSObject
        }
        $ourEntry = [PSCustomObject]@{
            installation_mode = "force_installed"
            install_url = $latest.update_link
        }
        $ffSettings | Add-Member -NotePropertyName $geckoId -NotePropertyValue $ourEntry -Force
        Set-ItemProperty -LiteralPath $ffBase -Name "ExtensionSettings" -Value ($ffSettings | ConvertTo-Json -Compress -Depth 6)

        # Managed Storage (3rdparty-Policy)
        $ffPolKey = Join-Path $ffBase ("3rdparty\Extensions\" + $geckoId)
        Ensure-Key $ffPolKey
        Set-ItemProperty -LiteralPath $ffPolKey -Name "defaultsJson" -Value $defaultsCompact
        Write-Host "Firefox: Force-Install + defaultsJson gesetzt" -ForegroundColor Green
    }

    Write-Host ""
    Write-Host "Fertig. Browser einmal komplett neu starten; Chromium-Richtlinien unter"
    Write-Host "chrome://policy bzw. edge://policy pruefen, Firefox unter about:policies."
    Write-Host "Hinweis: Die optionale Ticketsystem-Berechtigung muss je Nutzer einmal in den"
    Write-Host "Optionen bestaetigt werden (Button erscheint nach Uebernahme der Vorgaben)."
}
catch {
    Write-Error $_
}
