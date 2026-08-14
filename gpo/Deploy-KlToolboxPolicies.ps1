#Version
$version = "1.0.0"
$datum = "2026-08-14"
$autor = "Felix Kappen"

# Verteilt die Kloeschinski Toolbox per Richtlinien-Registry (HKLM) an
# Chrome, Edge, Brave und Firefox:
#   - Force-Install der Extension (Chromium: Chrome Web Store, Firefox: xpi aus dem Repo)
#   - Managed Storage "defaultsJson" mit den Vorgaben aus releases/kloeschinski-defaults.json
#
# Einsatz: als Computer-Startskript in einer GPO, per RMM oder manuell als
# Admin auf einer Maschine. Die Registry-Pfade sind identisch zu dem, was
# GPP-Registry-Einträge in einer GPO setzen wuerden (siehe README.md).
#
# Parameter:
#   -Browsers      Teilmenge aus Chrome, Edge, Brave, Firefox (Standard: alle)
#   -DefaultsPath  Pfad zur kloeschinski-defaults.json (Standard: ..\releases\ oder Download aus dem Repo)

param(
    [ValidateSet("Chrome", "Edge", "Brave", "Firefox")]
    [string[]]$Browsers = @("Chrome", "Edge", "Brave", "Firefox"),
    [string]$DefaultsPath = ""
)

Set-StrictMode -Version Latest

$extensionId = "bcfhfhhmhgklpjodflnakgligkpglpoc"
$geckoId = "toolbox@kloeschinski.de"
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

    # ------------------------------------------- Defaults-JSON beschaffen
    $defaultsRaw = $null
    if (-not [string]::IsNullOrWhiteSpace($DefaultsPath)) {
        $defaultsRaw = Get-Content -LiteralPath $DefaultsPath -Raw -Encoding UTF8
    } else {
        $local = Join-Path (Split-Path $PSScriptRoot -Parent) "releases\kloeschinski-defaults.json"
        if (Test-Path $local) {
            $defaultsRaw = Get-Content -LiteralPath $local -Raw -Encoding UTF8
        } else {
            [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
            $defaultsRaw = (Invoke-WebRequest -Uri ($repoRawBase + "kloeschinski-defaults.json") -UseBasicParsing).Content
        }
    }
    $defaultsObj = $defaultsRaw | ConvertFrom-Json
    if ($null -eq $defaultsObj) {
        throw "Defaults-JSON konnte nicht gelesen werden."
    }
    # Kompakt (eine Zeile) fuer den Registry-Wert
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
        $flEntry = $extensionId + ";" + $cwsUpdateUrl
        $existing = Get-Item -LiteralPath $flKey
        $found = $false
        $maxIdx = 0
        foreach ($name in $existing.GetValueNames()) {
            $val = [string]$existing.GetValue($name)
            $idx = 0
            if ([int]::TryParse($name, [ref]$idx) -and $idx -gt $maxIdx) {
                $maxIdx = $idx
            }
            if ($val -like ($extensionId + "*")) {
                Set-ItemProperty -LiteralPath $flKey -Name $name -Value $flEntry
                $found = $true
            }
        }
        if (-not $found) {
            Set-ItemProperty -LiteralPath $flKey -Name ([string]($maxIdx + 1)) -Value $flEntry
        }

        # Managed Storage: defaultsJson
        $polKey = Join-Path $base ("3rdparty\extensions\" + $extensionId + "\policy")
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
}
catch {
    Write-Error $_
}
