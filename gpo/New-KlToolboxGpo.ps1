[CmdletBinding(SupportsShouldProcess = $true)]
param(
    # Name der Ziel-GPO (wird mit -CreateGpo angelegt, sonst muss sie existieren)
    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$GpoName,

    # Vorgabe-Datei (Settings-Export bzw. defaults.json) - wird als defaultsJson
    # (Managed Storage) in die GPO geschrieben. Enthaelt meist interne Links ->
    # nicht ins Repo legen.
    [Parameter(Mandatory = $true)]
    [string]$DefaultsPath,

    # Chrome-Web-Store-ID der klToolbox (Standard = veroeffentlichter Eintrag;
    # seit 3.37.0 durch den 'key' im Manifest auch bei entpackter Installation gleich).
    [string]$ExtensionId = "npichgjhimegeeldmiocainbdckannba",

    [ValidateSet("Chrome", "Edge", "Brave", "Firefox")]
    [string[]]$Browsers = @("Chrome", "Edge", "Brave", "Firefox"),

    # Firefox: xpi-Adresse fuer den Force-Install. Leer = aktuellste signierte
    # Version aus releases/updates.json des Repos.
    [string]$FirefoxInstallUrl = "",

    # Nur die Vorgaben (defaultsJson) schreiben, keinen Force-Install
    [switch]$SkipForceInstall,

    [string]$Domain,
    [string]$Server,

    # GPO anlegen, falls sie fehlt
    [switch]$CreateGpo
)

#Version
$version = "1.0.1"
$datum = "2026-09-08"
$autor = "FK"

<#
.SYNOPSIS
    Legt eine Gruppenrichtlinie an bzw. befuellt sie, die die klToolbox samt
    Vorgabe-Einstellungen verteilt (Computerkonfiguration, Richtlinien-Registry).

.DESCRIPTION
    Schreibt fuer Chrome, Edge, Brave und Firefox die Registry-Richtlinien unter
    HKLM\SOFTWARE\Policies\... direkt in die GPO (Set-GPRegistryValue):
      - ExtensionInstallForcelist (Chromium) bzw. ExtensionSettings (Firefox)
      - Managed Storage "defaultsJson" mit dem Inhalt der Vorgabe-Datei
    Vorhandene Forcelist-Nummern und eine bestehende Firefox-ExtensionSettings-
    Richtlinie in der GPO werden zusammengefuehrt, nicht ueberschrieben.

    Voraussetzung: RSAT-Modul GroupPolicy (auf einem DC oder Admin-Rechner).
    Die GPO danach mit der Computer-OU verknuepfen; die Browser lesen die
    Richtlinien beim naechsten Start (chrome://policy, edge://policy,
    about:policies).

.EXAMPLE
    .\New-KlToolboxGpo.ps1 -GpoName "klToolbox" -DefaultsPath "\\srv\intern\kltoolbox-defaults.json" -ExtensionId "abcdefghijklmnopabcdefghijklmnop" -CreateGpo

.EXAMPLE
    .\New-KlToolboxGpo.ps1 -GpoName "klToolbox" -DefaultsPath ".\defaults.json" -Browsers Firefox -WhatIf
#>

Set-StrictMode -Version Latest

$geckoId = "app@kltoolbox.dev"
$cwsUpdateUrl = "https://clients2.google.com/service/update2/crx"
$updatesUrl = "https://raw.githubusercontent.com/fkappen/klToolbox/main/releases/updates.json"

$chromiumTargets = @{
    Chrome = "HKLM\SOFTWARE\Policies\Google\Chrome"
    Edge   = "HKLM\SOFTWARE\Policies\Microsoft\Edge"
    Brave  = "HKLM\SOFTWARE\Policies\BraveSoftware\Brave"
}

try {
    Import-Module GroupPolicy -ErrorAction Stop
}
catch {
    Write-Error "Modul 'GroupPolicy' nicht verfuegbar. Script auf einem DC oder mit RSAT-GPMC ausfuehren. $_"
    return
}

$gpParams = @{}
if (-not [string]::IsNullOrWhiteSpace($Domain)) { $gpParams['Domain'] = $Domain }
if (-not [string]::IsNullOrWhiteSpace($Server)) { $gpParams['Server'] = $Server }

# Richtlinienwert in der GPO setzen (REG_SZ), mit -WhatIf-Unterstuetzung
function Set-PolValue {
    param(
        [Parameter(Mandatory = $true)] [string]$Key,
        [Parameter(Mandatory = $true)] [string]$ValueName,
        [Parameter(Mandatory = $true)] [string]$Value,
        [string]$Info = ""
    )
    if (-not $PSCmdlet.ShouldProcess("$GpoName : $Key\$ValueName", "Richtlinienwert setzen")) {
        return
    }
    $null = Set-GPRegistryValue @gpParams -Name $GpoName -Key $Key -ValueName $ValueName -Type String -Value $Value -ErrorAction Stop
    Write-Host ("  OK   {0,-8} {1}" -f $Info, ($Key -replace '^HKLM\\SOFTWARE\\Policies\\', '') + "\" + $ValueName)
}

# Vorhandenen Richtlinienwert lesen (leer, wenn nicht gesetzt)
function Get-PolValue {
    param(
        [Parameter(Mandatory = $true)] [string]$Key,
        [Parameter(Mandatory = $true)] [string]$ValueName
    )
    try {
        $v = Get-GPRegistryValue @gpParams -Name $GpoName -Key $Key -ValueName $ValueName -ErrorAction Stop
        if ($null -ne $v) { return [string]$v.Value }
    }
    catch {
        Write-Verbose "Kein vorhandener Wert $Key\$ValueName : $_"
    }
    return ""
}

try {
    # ------------------------------------------- Vorgaben laden
    if (-not (Test-Path -LiteralPath $DefaultsPath)) {
        throw "Vorgabe-Datei nicht gefunden: $DefaultsPath"
    }
    $defaultsObj = Get-Content -LiteralPath $DefaultsPath -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($null -eq $defaultsObj) {
        throw "Vorgabe-Datei konnte nicht als JSON gelesen werden."
    }
    $defaultsCompact = $defaultsObj | ConvertTo-Json -Compress -Depth 10
    $anzahl = 0
    if ($null -ne $defaultsObj.PSObject.Properties['settings']) {
        $anzahl = @($defaultsObj.settings.PSObject.Properties).Count
    } else {
        $anzahl = @($defaultsObj.PSObject.Properties).Count
    }
    Write-Host ("Vorgaben geladen: {0} Einstellungen, {1} Zeichen" -f $anzahl, $defaultsCompact.Length) -ForegroundColor Cyan

    $chromiumWanted = @($Browsers | Where-Object { $chromiumTargets.ContainsKey($_) })
    if ($chromiumWanted.Count -gt 0 -and [string]::IsNullOrWhiteSpace($ExtensionId)) {
        Write-Warning "Keine -ExtensionId angegeben - Chrome/Edge/Brave werden uebersprungen (Force-Install und Vorgaben brauchen die Store-ID)."
        $chromiumWanted = @()
    }
    if ($ExtensionId -and $ExtensionId -notmatch '^[a-p]{32}$') {
        throw "Ungueltige Erweiterungs-ID '$ExtensionId' (32 Zeichen a-p, aus der Chrome-Devconsole bzw. chrome://extensions)."
    }

    # ------------------------------------------- GPO ermitteln / anlegen
    $gpo = $null
    try {
        $gpo = Get-GPO -Name $GpoName @gpParams -ErrorAction Stop
    }
    catch {
        $gpo = $null
    }
    if ($null -eq $gpo) {
        if (-not $CreateGpo) {
            throw "GPO '$GpoName' nicht gefunden. Mit -CreateGpo anlegen lassen oder Namen pruefen."
        }
        if ($PSCmdlet.ShouldProcess($GpoName, "GPO anlegen")) {
            $gpo = New-GPO -Name $GpoName -Comment "klToolbox: Force-Install + Vorgaben (New-KlToolboxGpo.ps1 v$version)" @gpParams -ErrorAction Stop
            Write-Host "GPO angelegt: $GpoName" -ForegroundColor Green
        }
    }
    else {
        Write-Host "GPO gefunden: $($gpo.DisplayName) [$($gpo.Id)]" -ForegroundColor Cyan
    }

    # ------------------------------------------- Chromium (Chrome / Edge / Brave)
    foreach ($browser in $chromiumWanted) {
        $base = $chromiumTargets[$browser]
        Write-Host ""
        Write-Host ">> $browser" -ForegroundColor Cyan

        if (-not $SkipForceInstall) {
            # Forcelist: vorhandene Nummern in der GPO respektieren, eigene ID nur einmal
            $flKey = "$base\ExtensionInstallForcelist"
            $flEntry = $ExtensionId + ";" + $cwsUpdateUrl
            $existing = @()
            try {
                $existing = @(Get-GPRegistryValue @gpParams -Name $GpoName -Key $flKey -ErrorAction Stop)
            }
            catch {
                $existing = @()
            }
            $found = $null
            $maxIdx = 0
            foreach ($e in $existing) {
                if ($null -eq $e -or [string]::IsNullOrWhiteSpace($e.ValueName)) { continue }
                $n = 0
                if ([int]::TryParse($e.ValueName, [ref]$n) -and $n -gt $maxIdx) { $maxIdx = $n }
                if ([string]$e.Value -like ($ExtensionId + ";*")) { $found = $e.ValueName }
            }
            if ($null -ne $found) {
                Set-PolValue -Key $flKey -ValueName $found -Value $flEntry -Info "Force"
            } else {
                Set-PolValue -Key $flKey -ValueName ([string]($maxIdx + 1)) -Value $flEntry -Info "Force"
            }
        }

        Set-PolValue -Key "$base\3rdparty\extensions\$ExtensionId\policy" -ValueName "defaultsJson" -Value $defaultsCompact -Info "Vorgaben"
    }

    # ------------------------------------------- Firefox
    if ($Browsers -contains "Firefox") {
        Write-Host ""
        Write-Host ">> Firefox" -ForegroundColor Cyan
        $ffBase = "HKLM\SOFTWARE\Policies\Mozilla\Firefox"

        if (-not $SkipForceInstall) {
            $installUrl = $FirefoxInstallUrl
            if ([string]::IsNullOrWhiteSpace($installUrl)) {
                [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
                $updates = (Invoke-WebRequest -Uri $updatesUrl -UseBasicParsing -ErrorAction Stop).Content | ConvertFrom-Json
                $entries = @($updates.addons.$geckoId.updates)
                if ($entries.Count -eq 0) {
                    throw "Keine signierte Firefox-Version in updates.json gefunden - -FirefoxInstallUrl angeben oder -SkipForceInstall."
                }
                $latest = $entries | Sort-Object { [version]$_.version } | Select-Object -Last 1
                $installUrl = $latest.update_link
                Write-Host ("   aktuellste signierte Version: " + $latest.version)
            }

            # ExtensionSettings in der GPO mergen statt ueberschreiben
            $ffSettings = $null
            $existingRaw = Get-PolValue -Key $ffBase -ValueName "ExtensionSettings"
            if (-not [string]::IsNullOrWhiteSpace($existingRaw)) {
                try {
                    $ffSettings = $existingRaw | ConvertFrom-Json
                }
                catch {
                    Write-Warning "Vorhandene ExtensionSettings in der GPO sind kein gueltiges JSON und werden ersetzt (alter Wert im Verbose-Log)."
                    Write-Verbose $existingRaw
                    $ffSettings = $null
                }
            }
            if ($null -eq $ffSettings) {
                $ffSettings = New-Object PSObject
            }
            $ourEntry = [PSCustomObject]@{
                installation_mode = "force_installed"
                install_url       = $installUrl
            }
            $ffSettings | Add-Member -NotePropertyName $geckoId -NotePropertyValue $ourEntry -Force
            Set-PolValue -Key $ffBase -ValueName "ExtensionSettings" -Value ($ffSettings | ConvertTo-Json -Compress -Depth 6) -Info "Force"
        }

        Set-PolValue -Key "$ffBase\3rdparty\Extensions\$geckoId" -ValueName "defaultsJson" -Value $defaultsCompact -Info "Vorgaben"
    }

    Write-Host ""
    Write-Host "Fertig." -ForegroundColor Green
    Write-Host "Naechste Schritte:" -ForegroundColor Yellow
    Write-Host "  1. GPO mit der Computer-OU verknuepfen (Richtlinien liegen in der Computerkonfiguration)."
    Write-Host "  2. Auf einem Client 'gpupdate /force', Browser komplett neu starten."
    Write-Host "  3. Pruefen: chrome://policy, edge://policy, brave://policy bzw. about:policies."
    Write-Host "  4. Die optionale Ticketsystem-Berechtigung bestaetigt jeder Nutzer einmal in den Optionen."
    Write-Host "  Vorgaben aendern: Datei anpassen, Script erneut ausfuehren (ueberschreibt defaultsJson)."
}
catch {
    Write-Error $_
}
