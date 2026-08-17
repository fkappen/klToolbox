param(
    # GitHub-Release erstellen (Tag v<ver>, ZIPs/.xpi als Assets)
    [switch]$Release,
    # Optionale Release-Notes (Markdown). Ohne Angabe: neutraler Standardtext.
    [string]$Notes = ""
)

#Version
$version = "2.1.0"
$datum = "2026-08-17"
$autor = "Felix Kappen"

# Gesamt-Build der klToolbox:
#   1. firefox/  aus chromium/ synchronisieren (Firefox-Manifest einsetzen)
#   2. dist/kl-toolbox-chromium-v<ver>.zip  (Store-Upload UND Bypass-Install)
#   3. dist/kl-toolbox-firefox-v<ver>.zip   (AMO-Upload)
#   4. -Release: GitHub-Release v<ver> anlegen, ZIPs + signierte .xpi als Assets
#   5. releases/updates.json erzeugen (Repo-xpi-Dateien + Release-Assets)
#
# dist/ ist nicht committet - Pakete werden NICHT mehr ins Repo gelegt,
# sondern als GitHub-Release-Assets veroeffentlicht (Build-All.ps1 -Release).
# Alte, bereits committete .xpi in releases/ bleiben liegen (deren
# update_link zeigt auf die Raw-URL); updates.json bleibt an der festen
# Raw-URL, weil sie in den signierten .xpi als update_url eingebrannt ist.
#
# Die Signierung der .xpi macht Mozilla (AMO, Kanal "Nicht gelistet"):
# Firefox-ZIP hochladen, signierte .xpi herunterladen, als
# kl-toolbox-firefox-v<ver>.xpi nach dist\ legen, Script mit -Release
# erneut ausfuehren.
#
# Authentifizierung: Token kommt aus dem Git Credential Manager
# (git credential fill) - derselbe Browser-Login, den auch git push nutzt.
# Fehlt ein gespeichertes Token, oeffnet GCM das Browser-Login-Fenster.

Set-StrictMode -Version Latest

$updateUrl = "https://raw.githubusercontent.com/fkappen/klToolbox/main/releases/updates.json"
$xpiBaseUrl = "https://raw.githubusercontent.com/fkappen/klToolbox/main/releases/"
$geckoId = "app@kltoolbox.dev"

function Get-RepoSlug {
    $url = (& git remote get-url origin 2>$null | Select-Object -First 1)
    if ($null -ne $url -and $url -match "github\.com[:/]+([^/]+/[^/\s]+?)(\.git)?$") {
        return $Matches[1]
    }
    return "fkappen/klToolbox"
}

# Token aus dem Git Credential Manager holen (Browser-Login-Flow von git).
function Get-GitHubToken {
    $out = "protocol=https`nhost=github.com`n" | & git credential fill 2>$null
    $token = ""
    foreach ($line in @($out)) {
        if ($line -match "^password=(.+)$") {
            $token = $Matches[1]
        }
    }
    if ([string]::IsNullOrWhiteSpace($token)) {
        throw "Kein GitHub-Token vom Git Credential Manager erhalten - einmal 'git push' ausfuehren (Browser-Login), dann erneut versuchen."
    }
    return $token
}

function Invoke-GitHubApi {
    param(
        [string]$Method,
        [string]$Uri,
        [string]$Token,
        $Body = $null,
        [string]$InFile = "",
        [string]$ContentType = ""
    )
    $headers = @{
        "Authorization" = "Bearer " + $Token
        "Accept" = "application/vnd.github+json"
        "X-GitHub-Api-Version" = "2022-11-28"
    }
    $req = @{ Method = $Method; Uri = $Uri; Headers = $headers; UseBasicParsing = $true }
    if (-not [string]::IsNullOrWhiteSpace($InFile)) {
        $req["InFile"] = $InFile
        $req["ContentType"] = $ContentType
    } elseif ($null -ne $Body) {
        $req["Body"] = ($Body | ConvertTo-Json -Depth 6)
        $req["ContentType"] = "application/json"
    }
    return Invoke-RestMethod @req
}

try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 -bor [Net.SecurityProtocolType]::Tls13

    $root = $PSScriptRoot
    $chromiumDir = Join-Path $root "chromium"
    $firefoxDir = Join-Path $root "firefox"
    $releasesDir = Join-Path $root "releases"
    $distDir = Join-Path $root "dist"
    $slug = Get-RepoSlug

    foreach ($d in @($releasesDir, $distDir)) {
        if (-not (Test-Path $d)) {
            New-Item -ItemType Directory -Path $d | Out-Null
        }
    }

    $manifest = Get-Content -LiteralPath (Join-Path $chromiumDir "manifest.json") -Raw -Encoding UTF8 | ConvertFrom-Json
    $ver = $manifest.version
    Write-Host "=== klToolbox v$ver - Build ===" -ForegroundColor Cyan

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

    # ------------------------------------------- 2. Chromium-ZIP (dist/)
    $chromiumZipName = "kl-toolbox-chromium-v" + $ver + ".zip"
    $chromiumZip = Join-Path $distDir $chromiumZipName
    if (Test-Path $chromiumZip) {
        Remove-Item -LiteralPath $chromiumZip -Force -Confirm:$false
    }
    Compress-Archive -Path (Join-Path $chromiumDir "*") -DestinationPath $chromiumZip -CompressionLevel Optimal
    Write-Host "Chromium-ZIP: dist\$chromiumZipName (Store-Upload + Bypass)" -ForegroundColor Green

    # ------------------------------------------- 3. Firefox-ZIP (dist/, AMO)
    $firefoxZipName = "kl-toolbox-firefox-v" + $ver + ".zip"
    $firefoxZip = Join-Path $distDir $firefoxZipName
    if (Test-Path $firefoxZip) {
        Remove-Item -LiteralPath $firefoxZip -Force -Confirm:$false
    }
    Compress-Archive -Path (Join-Path $firefoxDir "*") -DestinationPath $firefoxZip -CompressionLevel Optimal
    Write-Host "Firefox-ZIP:  dist\$firefoxZipName (AMO-Upload)" -ForegroundColor Green

    # ------------------------------------------- 4. signierte .xpi (dist/)
    $xpiName = "kl-toolbox-firefox-v" + $ver + ".xpi"
    $xpiSource = Join-Path $distDir $xpiName
    $hasXpi = Test-Path $xpiSource
    if (-not $hasXpi) {
        Write-Warning "Noch keine signierte .xpi fuer v$ver in dist\ (AMO-Signierung ausstehend)."
    }

    # ------------------------------------------- 5. GitHub-Release (-Release)
    if ($Release) {
        $token = Get-GitHubToken
        $tag = "v" + $ver
        $rel = $null
        try {
            $rel = Invoke-GitHubApi -Method Get -Uri "https://api.github.com/repos/$slug/releases/tags/$tag" -Token $token
            Write-Host "Release $tag existiert bereits - Assets werden aktualisiert."
        } catch {
            $body = @{
                tag_name = $tag
                target_commitish = "main"
                name = "klToolbox " + $tag
                body = if ([string]::IsNullOrWhiteSpace($Notes)) { "klToolbox v$ver - Pakete fuer Chromium (Chrome/Edge/Brave) und Firefox." } else { $Notes }
                draft = $false
                prerelease = $false
            }
            $rel = Invoke-GitHubApi -Method Post -Uri "https://api.github.com/repos/$slug/releases" -Token $token -Body $body
            Write-Host "GitHub-Release $tag angelegt: $($rel.html_url)" -ForegroundColor Green
        }

        $assets = @(@{ file = $chromiumZip; name = $chromiumZipName; type = "application/zip" },
                    @{ file = $firefoxZip; name = $firefoxZipName; type = "application/zip" })
        if ($hasXpi) {
            $assets += @{ file = $xpiSource; name = $xpiName; type = "application/x-xpinstall" }
        }
        foreach ($a in $assets) {
            # gleichnamiges Asset ersetzen (Re-Run derselben Version)
            $existing = Invoke-GitHubApi -Method Get -Uri "https://api.github.com/repos/$slug/releases/$($rel.id)/assets" -Token $token
            foreach ($e in @($existing)) {
                if ($null -ne $e -and $e.name -eq $a.name) {
                    Invoke-GitHubApi -Method Delete -Uri "https://api.github.com/repos/$slug/releases/assets/$($e.id)" -Token $token | Out-Null
                }
            }
            Invoke-GitHubApi -Method Post -Token $token -InFile $a.file -ContentType $a.type `
                -Uri ("https://uploads.github.com/repos/$slug/releases/$($rel.id)/assets?name=" + [uri]::EscapeDataString($a.name)) | Out-Null
            Write-Host ("Asset hochgeladen: " + $a.name) -ForegroundColor Green
        }
    }

    # ------------------------------------------- 6. updates.json erzeugen
    # Quellen: .xpi-Dateien im Repo (alte Versionen, Raw-URL) + .xpi-Assets
    # aller GitHub-Releases (neue Versionen). Asset-URL gewinnt bei Dubletten.
    $entries = @{}
    Get-ChildItem -LiteralPath $releasesDir -File | Where-Object { $_.Name -match '^kl-toolbox-firefox-v([0-9\.]+)\.xpi$' } | ForEach-Object {
        $null = $_.Name -match '^kl-toolbox-firefox-v([0-9\.]+)\.xpi$'
        $entries[$Matches[1]] = $xpiBaseUrl + $_.Name
    }
    try {
        $rels = Invoke-RestMethod -Uri "https://api.github.com/repos/$slug/releases" -UseBasicParsing
        foreach ($r in @($rels)) {
            foreach ($a in @($r.assets)) {
                if ($null -ne $a -and $a.name -match '^kl-toolbox-firefox-v([0-9\.]+)\.xpi$') {
                    $entries[$Matches[1]] = $a.browser_download_url
                }
            }
        }
    } catch {
        Write-Warning ("Release-Assets konnten nicht gelistet werden (updates.json nur aus releases\): " + $_.Exception.Message)
    }
    if ($entries.Count -gt 0) {
        $updates = @()
        foreach ($k in ($entries.Keys | Sort-Object { [version]$_ })) {
            $updates += @{ version = $k; update_link = $entries[$k] }
        }
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
        Write-Warning "Keine .xpi gefunden - updates.json nicht erzeugt."
    }

    Write-Host ""
    Write-Host "Naechste Schritte:"
    Write-Host "  Chromium: dist\$chromiumZipName in der Chrome-Devconsole einreichen"
    Write-Host "  Firefox:  dist\$firefoxZipName bei AMO hochladen (Nicht gelistet),"
    Write-Host "            signierte .xpi als $xpiName nach dist\ legen,"
    Write-Host "            dann: .\Build-All.ps1 -Release  (Release + Assets + updates.json)"
    Write-Host "  Danach:   git add/commit/push fuer updates.json (Repo muss oeffentlich bleiben)"
}
catch {
    Write-Error $_
}
