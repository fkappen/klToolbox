# Erzeugt aus Registry.template.xml eine fertige GPP-Registry-Datei fuer die
# klToolbox-Verteilung. Die Ausgabedatei enthaelt die INTERNE Defaults-JSON
# und gehoert deshalb NICHT in dieses Repo - Standard-Ausgabeort ist der
# Ordner der Defaults-Datei.
#
# Import in die GPO: Gruppenrichtlinienverwaltungs-Editor ->
# Computerkonfiguration -> Einstellungen -> Windows-Einstellungen ->
# Registrierung -> die erzeugte XML-Datei per Drag & Drop in die rechte
# Flaeche ziehen (legt die Sammlung "klToolbox" mit allen Eintraegen an).
#
# Parameter:
#   -DefaultsPath  Pfad zur internen Defaults-JSON (PFLICHT)
#   -ExtensionId   Chrome-Web-Store-ID der klToolbox (PFLICHT)
#   -OutFile       Ausgabedatei (Standard: <DefaultsOrdner>\klToolbox-GPO-Registry.xml)

param(
    [Parameter(Mandatory = $true)]
    [string]$DefaultsPath,
    [Parameter(Mandatory = $true)]
    [string]$ExtensionId,
    [string]$OutFile = ""
)

#Version
$version = "1.0.0"
$datum = "2026-08-14"
$autor = "FK"

Set-StrictMode -Version Latest

$geckoId = "app@kltoolbox.dev"
$updatesUrl = "https://raw.githubusercontent.com/fkappen/klToolbox/main/releases/updates.json"

try {
    # ------------------------------------------- Eingaben
    $defaultsObj = Get-Content -LiteralPath $DefaultsPath -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($null -eq $defaultsObj) {
        throw "Defaults-JSON konnte nicht gelesen werden."
    }
    $defaultsCompact = $defaultsObj | ConvertTo-Json -Compress -Depth 10

    # Aktuellste signierte Firefox-Version aus dem Repo ermitteln
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
    $ffSettingsJson = ""
    try {
        $updates = (Invoke-WebRequest -Uri $updatesUrl -UseBasicParsing).Content | ConvertFrom-Json
        $entries = @($updates.addons.$geckoId.updates)
        if ($entries.Count -gt 0) {
            $latest = $entries | Sort-Object { [version]$_.version } | Select-Object -Last 1
            $ffObj = New-Object PSObject
            $ffObj | Add-Member -NotePropertyName $geckoId -NotePropertyValue ([PSCustomObject]@{
                installation_mode = "force_installed"
                install_url = $latest.update_link
            })
            $ffSettingsJson = $ffObj | ConvertTo-Json -Compress -Depth 6
            Write-Host ("Firefox: signierte Version " + $latest.version + " aus updates.json")
        }
    }
    catch {
        Write-Warning ("updates.json nicht erreichbar/leer - Firefox-ExtensionSettings-Eintrag wird uebersprungen: " + $_.Exception.Message)
    }

    # ------------------------------------------- Template fuellen
    $templatePath = Join-Path $PSScriptRoot "Registry.template.xml"
    $xml = Get-Content -LiteralPath $templatePath -Raw -Encoding UTF8

    # XML-Attribut-Escaping (&, <, >, ", ')
    $escDefaults = [System.Security.SecurityElement]::Escape($defaultsCompact)
    $xml = $xml.Replace("__EXTENSION_ID__", $ExtensionId)
    $xml = $xml.Replace("__DEFAULTS_JSON__", $escDefaults)

    if ([string]::IsNullOrWhiteSpace($ffSettingsJson)) {
        # Kompletten ExtensionSettings-Registry-Block entfernen
        $xml = $xml -replace '(?s)\s*<Registry [^>]*name="ExtensionSettings".*?</Registry>', ""
    } else {
        $xml = $xml.Replace("__FF_EXTENSION_SETTINGS__", [System.Security.SecurityElement]::Escape($ffSettingsJson))
    }

    # ------------------------------------------- Schreiben
    if ([string]::IsNullOrWhiteSpace($OutFile)) {
        $OutFile = Join-Path (Split-Path -Parent (Resolve-Path $DefaultsPath)) "klToolbox-GPO-Registry.xml"
    }
    [System.IO.File]::WriteAllText($OutFile, $xml, (New-Object System.Text.UTF8Encoding($false)))
    Write-Host ("Erzeugt: " + $OutFile) -ForegroundColor Green
    Write-Host ""
    Write-Host "Import: GPO-Editor -> Computerkonfiguration -> Einstellungen -> Registrierung"
    Write-Host "        -> Datei per Drag & Drop in die rechte Flaeche ziehen."
    Write-Host "ACHTUNG: Der Firefox-ExtensionSettings-Eintrag UEBERSCHREIBT eine evtl. schon"
    Write-Host "         vorhandene ExtensionSettings-Richtlinie - dann stattdessen das"
    Write-Host "         Deploy-Script verwenden (das merged) oder manuell zusammenfuehren."
}
catch {
    Write-Error $_
}
