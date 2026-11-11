param(
    [string]$OutFile = "",
    [string]$LucideVersion = "0.468.0"
)

#Version
$version = "1.0.0"
$datum = "2026-11-11"
$autor = "Felix Kappen"

# Erzeugt chromium/icons.js: Lucide-Icons (ISC) als Inline-SVG-Inhalt.
# Quelle: unpkg.com/lucide-static@<Version>/icons/<name>.svg

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

try {
    if ([string]::IsNullOrWhiteSpace($OutFile)) {
        $OutFile = Join-Path (Split-Path -Parent $PSScriptRoot) "chromium\icons.js"
    }
    # Funktions-Icons (Popup, Ticket-Module)
    $funktion = @(
        "play", "search", "bot", "scissors", "eraser", "eye-off", "settings", "circle-help",
        "ticket", "user", "file-text", "calendar", "calendar-plus", "phone-off", "bell", "car",
        "zap", "clock", "hourglass", "chevron-left", "chevron-right", "chevron-down",
        "refresh-cw", "triangle-alert", "alarm-clock", "timer", "clipboard-list", "hand",
        "sparkles", "map-pin", "building-2", "check", "x", "phone", "filter", "keyboard", "star", "chevron-up"
    )
    # Auswahl fuer "Symbol" je Link (Optionen -> Popup-Bereiche): Name = Anzeigetext
    $auswahl = [ordered]@{
        "globe" = "Globus"; "house" = "Haus"; "star" = "Stern"; "mail" = "E-Mail"
        "calendar" = "Kalender"; "message-square" = "Nachricht"; "phone" = "Telefon"; "headset" = "Support"
        "life-buoy" = "Hilfe"; "ticket" = "Ticket"; "user" = "Person"; "users" = "Personen"
        "building-2" = "Firma"; "briefcase" = "Aktentasche"; "handshake" = "Partner"; "server" = "Server"
        "monitor" = "Bildschirm"; "laptop" = "Notebook"; "hard-drive" = "Laufwerk"; "database" = "Datenbank"
        "cloud" = "Cloud"; "network" = "Netzwerk"; "wifi" = "WLAN"; "printer" = "Drucker"
        "shield" = "Schild"; "shield-check" = "Schild mit Haken"; "lock" = "Schloss"; "key-round" = ("Schl" + [char]0xFC + "ssel")
        "book-open" = "Buch"; "file-text" = "Dokument"; "folder" = "Ordner"; "clipboard-list" = "Liste"
        "download" = "Download"; "refresh-cw" = "Aktualisieren"; "settings" = "Zahnrad"; "wrench" = "Werkzeug"
        "terminal" = "Konsole"; "code" = "Code"; "chart-column" = "Diagramm"; "receipt" = "Beleg"
        "euro" = "Euro"; "credit-card" = "Karte"; "box" = "Paket"; "bot" = "KI"
    }

    $namen = @($funktion + @($auswahl.Keys) | Select-Object -Unique | Sort-Object)
    $zeilen = New-Object System.Collections.Generic.List[string]
    foreach ($n in $namen) {
        $url = "https://unpkg.com/lucide-static@$LucideVersion/icons/$n.svg"
        $r = Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 30
        $m = [regex]::Match([string]$r.Content, '(?s)<svg[^>]*>(.*)</svg>')
        if (-not $m.Success) {
            throw "Kein SVG-Inhalt fuer $n"
        }
        # Kindelemente einzeilig, ohne Leerraum zwischen den Tags
        $innen = ($m.Groups[1].Value -replace '\s*\r?\n\s*', '' -replace '\s+/>', '/>').Trim()
        if ($innen -match "['\\]" -or $innen -notmatch '^(<(path|circle|rect|line|polyline|polygon|ellipse)\s[^<>]*/>)+$') {
            throw "Unerwarteter SVG-Inhalt fuer ${n}: $innen"
        }
        $zeilen.Add("    ""$n"": '$innen'")
        Write-Host "ok  $n"
    }

    $wahl = New-Object System.Collections.Generic.List[string]
    foreach ($k in $auswahl.Keys) {
        $wahl.Add("    [""$k"", ""$($auswahl[$k])""]")
    }

    $nl = "`n"
    $text = @(
        "// Version",
        "// version = ""1.1.0""  (Modul Icons, klToolbox)",
        "// datum   = ""$datum""",
        "// autor   = ""FK""",
        "//",
        "// Lucide-Icons (https://lucide.dev, ISC-Lizenz), Stand lucide-static $LucideVersion.",
        "// Nur der Inhalt des <svg>-Elements; klIcon() baut daraus ein Inline-SVG",
        "// (2 px Strich, currentColor). Kein CDN, kein Icon-Font.",
        "// ERZEUGT - nicht von Hand aendern (Generator: Build-Icons.ps1).",
        "",
        "var KL_ICONS = {",
        ($zeilen -join (",$nl")),
        "};",
        "",
        "// Auswahl fuer das Feld ""Symbol"" je Link: [Name, Anzeigetext]",
        "var KL_LINK_ICONS = [",
        ($wahl -join (",$nl")),
        "];",
        "",
        "// Inline-SVG zu einem Icon-Namen; null, wenn der Name unbekannt ist.",
        "// DOMParser statt innerHTML (AMO-Linter).",
        "function klIcon(name, size) {",
        "    if (!name || !Object.prototype.hasOwnProperty.call(KL_ICONS, name)) {",
        "        return null;",
        "    }",
        "    var px = size || 16;",
        "    var quelle = '<svg xmlns=""http://www.w3.org/2000/svg"" viewBox=""0 0 24 24"" fill=""none"" stroke=""currentColor"" stroke-width=""2"" stroke-linecap=""round"" stroke-linejoin=""round"" aria-hidden=""true"">' + KL_ICONS[name] + '</svg>';",
        "    var doc = new DOMParser().parseFromString(quelle, ""image/svg+xml"");",
        "    var svg = document.importNode(doc.documentElement, true);",
        "    svg.setAttribute(""class"", ""ico"");",
        "    svg.setAttribute(""width"", String(px));",
        "    svg.setAttribute(""height"", String(px));",
        "    return svg;",
        "}",
        "",
        "// Inhalt eines Elements als ""Symbol + Text"" setzen (nachIcon = Symbol",
        "// hinter dem Text). Merkt sich beides am Element, damit ein Knopf nach",
        "// einer Zwischenmeldung mit klIconRestore() zurueckgesetzt werden kann.",
        "// Klasse klt-ico statt ico: laeuft auch in fremden Seiten (Content-Scripts).",
        "function klIconText(el, name, text, size, nachIcon) {",
        "    el.textContent = """";",
        "    var svg = klIcon(name, size || 14);",
        "    if (svg) {",
        "        svg.setAttribute(""class"", ""klt-ico"");",
        "    }",
        "    if (svg && !nachIcon) {",
        "        el.appendChild(svg);",
        "    }",
        "    el.appendChild(document.createTextNode(text));",
        "    if (svg && nachIcon) {",
        "        el.appendChild(svg);",
        "    }",
        "    el.__kltIcon = [name, text, size || 14, nachIcon === true];",
        "}",
        "",
        "function klIconRestore(el, merk) {",
        "    if (merk) {",
        "        klIconText(el, merk[0], merk[1], merk[2], merk[3]);",
        "    }",
        "}",
        ""
    ) -join $nl

    $utf8 = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($OutFile, $text, $utf8)
    Write-Host "$($namen.Count) Icons -> $OutFile"
}
catch {
    Write-Error $_
}
