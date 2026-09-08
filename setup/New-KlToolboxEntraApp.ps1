param(
    # Ruecksprungadressen aus klToolbox -> Optionen -> Microsoft 365
    # (je Browser eine, z. B. https://<extension-id>.chromiumapp.org/)
    [Parameter(Mandatory)]
    [string[]]$RedirectUri,
    [string]$AppName = "klToolbox Kalender",
    [string]$TenantId = "",
    # Zusaetzlich User.ReadBasic.All (delegiert): klToolbox kann dann alle
    # Nutzer des Tenants als Kollegen-Kandidaten lesen (Optionen-Schalter
    # "Kollegen aus dem Verzeichnis ermitteln")
    [switch]$MitVerzeichnis,
    # Zusaetzlich Mail.Send (delegiert): Terminbestaetigung direkt aus der
    # Erweiterung im Namen des Nutzers senden (Optionen-Schalter)
    [switch]$MitMail,
    [switch]$UseDeviceCode
)

#Version
$version = "1.4.0"
$datum = "2026-09-08"
$autor = "FK"

<#
.SYNOPSIS
    Legt die Entra-App-Registrierung fuer die klToolbox-Kalenderanbindung an
    (Termin direkt in Outlook / Microsoft Graph) und erteilt den Admin-Consent.

.DESCRIPTION
    - Plattform "Single-Page Application" mit den uebergebenen Redirect-URIs
      (Pflicht: der Browser sendet beim Token-Abruf einen Origin-Header,
      jeder andere Plattformtyp endet in AADSTS9002326)
    - Delegierte Graph-Berechtigungen: openid, profile, offline_access,
      Calendars.ReadWrite (eigener Kalender) und Calendars.ReadWrite.Shared
      (nur Kalender, die dem Nutzer von Kollegen freigegeben wurden)
    - Kein Client-Secret (Public Client mit PKCE)
    - Idempotent: vorhandene App gleichen Namens wird aktualisiert
      (Redirect-URIs werden zusammengefuehrt), Consent wird nachgezogen.
    Ausgabe: Tenant-ID + Client-ID als Snippet fuer die Vorgabe-Datei.

.EXAMPLE
    .\New-KlToolboxEntraApp.ps1 -RedirectUri "https://abcdefghijklmnop.chromiumapp.org/"
    .\New-KlToolboxEntraApp.ps1 -RedirectUri "https://abc.chromiumapp.org/" -MitVerzeichnis -MitMail
    .\New-KlToolboxEntraApp.ps1 -RedirectUri "https://abc.chromiumapp.org/","https://xyz.extensions.allizom.org/" -UseDeviceCode
#>

#Requires -Modules Microsoft.Graph.Authentication, Microsoft.Graph.Applications, Microsoft.Graph.Identity.SignIns

Set-StrictMode -Version Latest

$graphAppId = "00000003-0000-0000-c000-000000000000"   # Microsoft Graph
$scopes = @("openid", "profile", "offline_access", "Calendars.ReadWrite", "Calendars.ReadWrite.Shared")
if ($MitVerzeichnis) {
    $scopes += "User.ReadBasic.All"
}
if ($MitMail) {
    $scopes += "Mail.Send"
}

try {
    foreach ($u in $RedirectUri) {
        if ($u -notmatch '^https://[a-z0-9\-\.]+/$') {
            throw "Redirect-URI '$u' hat nicht die Form https://<host>/ (mit abschliessendem Schraegstrich, wie in den klToolbox-Optionen angezeigt)."
        }
    }

    # ---------------------------------------------------------- Anmeldung
    $connect = @{
        Scopes      = @("Application.ReadWrite.All", "DelegatedPermissionGrant.ReadWrite.All")
        NoWelcome   = $true
        ErrorAction = "Stop"
    }
    if (-not [string]::IsNullOrWhiteSpace($TenantId)) { $connect["TenantId"] = $TenantId }
    if ($UseDeviceCode) { $connect["UseDeviceCode"] = $true }
    Connect-MgGraph @connect
    $ctx = Get-MgContext
    Write-Host ("Angemeldet: {0} @ {1}" -f $ctx.Account, $ctx.TenantId) -ForegroundColor Cyan

    # ---------------------------------------------------------- Graph-Scopes aufloesen (IDs nicht raten)
    $graphSp = Get-MgServicePrincipal -Filter "appId eq '$graphAppId'" -ErrorAction Stop | Select-Object -First 1
    if ($null -eq $graphSp) { throw "Service Principal von Microsoft Graph nicht gefunden." }
    $resourceAccess = @()
    foreach ($s in $scopes) {
        $perm = $graphSp.Oauth2PermissionScopes | Where-Object { $_.Value -eq $s } | Select-Object -First 1
        if ($null -eq $perm) { throw "Delegierte Berechtigung '$s' auf Microsoft Graph nicht gefunden." }
        $resourceAccess += @{ id = $perm.Id; type = "Scope" }
    }
    $required = @(@{ resourceAppId = $graphAppId; resourceAccess = $resourceAccess })

    # ---------------------------------------------------------- App anlegen / aktualisieren
    $app = Get-MgApplication -Filter "displayName eq '$($AppName.Replace("'", "''"))'" -ErrorAction Stop | Select-Object -First 1
    if ($null -eq $app) {
        Write-Host ">> App-Registrierung '$AppName' anlegen" -ForegroundColor Cyan
        $app = New-MgApplication -DisplayName $AppName -SignInAudience "AzureADMyOrg" `
            -Spa @{ RedirectUris = $RedirectUri } `
            -RequiredResourceAccess $required `
            -IsFallbackPublicClient:$false -ErrorAction Stop
    } else {
        Write-Host ">> App-Registrierung '$AppName' existiert - Redirect-URIs und Berechtigungen aktualisieren" -ForegroundColor Cyan
        $existing = @()
        if ($null -ne $app.Spa -and $null -ne $app.Spa.RedirectUris) { $existing = @($app.Spa.RedirectUris) }
        $merged = @($existing + $RedirectUri | Select-Object -Unique)
        Update-MgApplication -ApplicationId $app.Id -Spa @{ RedirectUris = $merged } `
            -RequiredResourceAccess $required -ErrorAction Stop
        $app = Get-MgApplication -ApplicationId $app.Id -ErrorAction Stop
    }
    Write-Host ("   Client-ID: {0}" -f $app.AppId)
    Write-Host ("   SPA-Redirects: {0}" -f (($app.Spa.RedirectUris) -join ", "))

    # ---------------------------------------------------------- Service Principal (Enterprise App)
    $sp = Get-MgServicePrincipal -Filter "appId eq '$($app.AppId)'" -ErrorAction Stop | Select-Object -First 1
    if ($null -eq $sp) {
        $sp = New-MgServicePrincipal -AppId $app.AppId -ErrorAction Stop
        Write-Host "   Enterprise-App angelegt"
    }

    # ---------------------------------------------------------- Admin-Consent (tenantweit, delegiert)
    $scopeString = ($scopes -join " ")
    $grant = Get-MgOauth2PermissionGrant -Filter "clientId eq '$($sp.Id)' and consentType eq 'AllPrincipals'" -ErrorAction Stop |
        Where-Object { $_.ResourceId -eq $graphSp.Id } | Select-Object -First 1
    if ($null -eq $grant) {
        New-MgOauth2PermissionGrant -BodyParameter @{
            clientId    = $sp.Id
            consentType = "AllPrincipals"
            resourceId  = $graphSp.Id
            scope       = $scopeString
        } -ErrorAction Stop | Out-Null
        Write-Host "   Admin-Consent erteilt: $scopeString" -ForegroundColor Green
    } elseif ($grant.Scope.Trim() -ne $scopeString) {
        Update-MgOauth2PermissionGrant -OAuth2PermissionGrantId $grant.Id -Scope $scopeString -ErrorAction Stop
        Write-Host "   Admin-Consent aktualisiert: $scopeString" -ForegroundColor Green
    } else {
        Write-Host "   Admin-Consent bereits vorhanden"
    }

    # ---------------------------------------------------------- Ergebnis
    Write-Host ""
    Write-Host "Fuer die Vorgabe-Datei (Settings-Import / defaultsJson) bzw. Optionen -> Microsoft 365:" -ForegroundColor Cyan
    Write-Host ('        "m365Tenant": "{0}",' -f $ctx.TenantId)
    Write-Host ('        "m365ClientId": "{0}",' -f $app.AppId)
    Write-Host ""
    Write-Host "Weitere Browser spaeter: Script mit deren Redirect-URI erneut ausfuehren (wird zusammengefuehrt)." -ForegroundColor DarkGray
}
catch {
    Write-Error $_
}
