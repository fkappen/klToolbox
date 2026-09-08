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

    # Nur die Vorgaben (defaultsJson) schreiben, keine automatische Installation
    [Alias("SkipForceInstall")]
    [switch]$SkipInstall,

    # Standard = "normal_installed": wird automatisch installiert, der Nutzer
    # darf sie aber deaktivieren/entfernen. -Erzwingen = "force_installed"
    # (Nutzer kann nichts aendern, Testinstallationen mit gleicher ID werden
    # verdraengt).
    [switch]$Erzwingen,

    # Standard: Symbol in der Browser-Symbolleiste anheften (Chrome/Brave
    # toolbar_pin=force_pinned, Edge toolbar_state=force_shown ab Edge 103,
    # Firefox default_area=navbar ab Firefox 113 - dort nur Vorgabe, Nutzer
    # koennen es verschieben). -NichtAnheften laesst die Symbolleiste in Ruhe.
    [switch]$NichtAnheften,

    [string]$Domain,
    [string]$Server,

    # GPO anlegen, falls sie fehlt
    [switch]$CreateGpo
)

#Version
$version = "1.2.0"
$datum = "2026-09-08"
$autor = "FK"

<#
.SYNOPSIS
    Legt eine Gruppenrichtlinie an bzw. befuellt sie, die die klToolbox samt
    Vorgabe-Einstellungen verteilt (Computerkonfiguration, Richtlinien-Registry).

.DESCRIPTION
    Schreibt fuer Chrome, Edge, Brave und Firefox die Registry-Richtlinien unter
    HKLM\SOFTWARE\Policies\... direkt in die GPO (Set-GPRegistryValue):
      - ExtensionSettings (JSON) mit installation_mode "normal_installed":
        automatische Installation, Nutzer darf deaktivieren/entfernen
        (-Erzwingen: "force_installed")
      - Managed Storage "defaultsJson" mit dem Inhalt der Vorgabe-Datei
    Eine bestehende ExtensionSettings-Richtlinie in der GPO wird zusammen-
    gefuehrt, nicht ueberschrieben. Aeltere Forcelist-Eintraege dieser
    Erweiterung (frueherer Script-Stand) werden entfernt.

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

$installMode = if ($Erzwingen) { "force_installed" } else { "normal_installed" }

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

# Bestehende ExtensionSettings-JSON (String) um unseren Eintrag ergaenzen
function Merge-ExtensionSettings {
    param(
        [string]$Existing,
        [Parameter(Mandatory = $true)] [string]$Id,
        [Parameter(Mandatory = $true)] $Entry
    )
    $obj = $null
    if (-not [string]::IsNullOrWhiteSpace($Existing)) {
        try {
            $obj = $Existing.TrimStart([char]0xFEFF) | ConvertFrom-Json
        }
        catch {
            Write-Warning "Vorhandene ExtensionSettings in der GPO sind kein gueltiges JSON und werden ersetzt (alter Wert im Verbose-Log)."
            Write-Verbose $Existing
            $obj = $null
        }
    }
    if ($null -eq $obj) {
        $obj = New-Object PSObject
    }
    $obj | Add-Member -NotePropertyName $Id -NotePropertyValue $Entry -Force
    return $obj
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
    # Anfuehrungszeichen aus der interaktiven Abfrage entfernen (werden dort Teil des Pfads)
    $DefaultsPath = $DefaultsPath.Trim().Trim('"').Trim("'")
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
        Write-Warning "Keine -ExtensionId angegeben - Chrome/Edge/Brave werden uebersprungen (Installation und Vorgaben brauchen die Store-ID)."
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
            $gpo = New-GPO -Name $GpoName -Comment "klToolbox: Installation + Vorgaben (New-KlToolboxGpo.ps1 v$version)" @gpParams -ErrorAction Stop
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

        if (-not $SkipInstall) {
            # ExtensionSettings (JSON-Richtlinie): normal_installed = automatisch
            # installiert, vom Nutzer deaktivierbar. Bestehende Eintraege anderer
            # Erweiterungen in der GPO bleiben erhalten.
            $eintrag = [ordered]@{
                installation_mode = $installMode
                update_url        = $cwsUpdateUrl
            }
            if (-not $NichtAnheften) {
                # Edge kennt toolbar_state (force_shown/default_shown/default_hidden),
                # Chrome und Brave toolbar_pin (force_pinned/default_unpinned)
                if ($browser -eq "Edge") { $eintrag["toolbar_state"] = "force_shown" } else { $eintrag["toolbar_pin"] = "force_pinned" }
            }
            $esSettings = Merge-ExtensionSettings -Existing (Get-PolValue -Key $base -ValueName "ExtensionSettings") -Id $ExtensionId -Entry ([PSCustomObject]$eintrag)
            Set-PolValue -Key $base -ValueName "ExtensionSettings" -Value ($esSettings | ConvertTo-Json -Compress -Depth 6) -Info $installMode

            # Alten Forcelist-Eintrag dieser Erweiterung entfernen (frueherer Script-Stand),
            # sonst erzwingt er die Installation trotz normal_installed
            $flKey = "$base\ExtensionInstallForcelist"
            $existing = @()
            try {
                $existing = @(Get-GPRegistryValue @gpParams -Name $GpoName -Key $flKey -ErrorAction Stop)
            }
            catch {
                $existing = @()
            }
            foreach ($e in $existing) {
                if ($null -ne $e -and [string]$e.Value -like ($ExtensionId + ";*")) {
                    if ($PSCmdlet.ShouldProcess("$GpoName : $flKey\$($e.ValueName)", "alten Forcelist-Eintrag entfernen")) {
                        $null = Remove-GPRegistryValue @gpParams -Name $GpoName -Key $flKey -ValueName $e.ValueName -ErrorAction Stop
                        Write-Host ("  WEG  Forcelist " + ($flKey -replace '^HKLM\\SOFTWARE\\Policies\\', '') + "\" + $e.ValueName)
                    }
                }
            }
        }

        Set-PolValue -Key "$base\3rdparty\extensions\$ExtensionId\policy" -ValueName "defaultsJson" -Value $defaultsCompact -Info "Vorgaben"
    }

    # ------------------------------------------- Firefox
    if ($Browsers -contains "Firefox") {
        Write-Host ""
        Write-Host ">> Firefox" -ForegroundColor Cyan
        $ffBase = "HKLM\SOFTWARE\Policies\Mozilla\Firefox"

        if (-not $SkipInstall) {
            $installUrl = $FirefoxInstallUrl
            if ([string]::IsNullOrWhiteSpace($installUrl)) {
                [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
                # updates.json kommt mit UTF-8-BOM - ConvertFrom-Json unter PS 5.1 stolpert
                # darueber ("Ungueltiger JSON-Primitiv") -> BOM abschneiden
                $updatesRaw = [string](Invoke-WebRequest -Uri $updatesUrl -UseBasicParsing -ErrorAction Stop).Content
                $updates = $updatesRaw.TrimStart([char]0xFEFF) | ConvertFrom-Json
                $entries = @($updates.addons.$geckoId.updates)
                if ($entries.Count -eq 0) {
                    throw "Keine signierte Firefox-Version in updates.json gefunden - -FirefoxInstallUrl angeben oder -SkipInstall."
                }
                $latest = $entries | Sort-Object { [version]$_.version } | Select-Object -Last 1
                $installUrl = $latest.update_link
                Write-Host ("   aktuellste signierte Version: " + $latest.version)
            }

            # ExtensionSettings in der GPO mergen statt ueberschreiben
            $ffEintrag = [ordered]@{
                installation_mode = $installMode
                install_url       = $installUrl
            }
            if (-not $NichtAnheften) {
                $ffEintrag["default_area"] = "navbar"   # Firefox >= 113, nur Vorgabe
            }
            $ffSettings = Merge-ExtensionSettings -Existing (Get-PolValue -Key $ffBase -ValueName "ExtensionSettings") -Id $geckoId -Entry ([PSCustomObject]$ffEintrag)
            Set-PolValue -Key $ffBase -ValueName "ExtensionSettings" -Value ($ffSettings | ConvertTo-Json -Compress -Depth 6) -Info $installMode
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
    Write-Host ("  Installationsmodus: " + $installMode + $(if ($installMode -eq "normal_installed") { " (Nutzer duerfen die Erweiterung deaktivieren)" } else { " (Nutzer koennen nichts aendern)" }))
    Write-Host ("  Symbolleiste: " + $(if ($NichtAnheften) { "keine Vorgabe" } else { "angeheftet (Chrome/Brave/Edge erzwungen, Firefox Vorgabe)" }))
    Write-Host "  Browser nach der Richtlinienaenderung KOMPLETT beenden (auch Hintergrundprozesse) - sonst zeigt die Erweiterungsseite den alten Zustand."
    Write-Host "  Vorgaben aendern: Datei anpassen, Script erneut ausfuehren (ueberschreibt defaultsJson)."
}
catch {
    Write-Error $_
}
