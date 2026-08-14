# Klöschinski Toolbox

Browser-Erweiterung der Klöschinski IT Lösungen GmbH für den Techniker-Alltag —
in zwei Varianten: **Chromium** (Chrome, Brave, Edge) und **Firefox**.

## Funktionen (Module, einzeln abschaltbar)

| Modul | Beschreibung |
|---|---|
| KI-Umformulierer | Markierten Text per Rechtsklick mit KI umformulieren, korrigieren oder übersetzen (Claude / OpenAI / InnoGPT, eigener API-Key) |
| Kontextmenü-Suchen | Markierten Text in der DATEV Wissensplattform, bei Google oder in InnoGPT nachschlagen |
| Ticket-Vorlagen | Textbausteine mit einem Klick in das „Email senden“-Fenster des Ticketsystems einfügen |
| Ticket-Termin & Wartezeit | Outlook-Termin aus dem Ticket erstellen (ICS oder Outlook Web), „Nicht erreicht“-Eintrag, Anfahrtsplanung, Wartezeit-Ampel |
| MS Account Cleaner | Gemerkte Konten auf der Microsoft-Anmeldeseite in einem Rutsch entfernen (mit Whitelist) |
| KI-Chat | Chat-Seite mit dem konfigurierten KI-Anbieter, direkt aus dem Popup |

Dazu ein Popup mit Start-Leiste, konfigurierbaren Schnellzugriffen, M365-Admin-Links
(öffnen im privaten Fenster), DATEV-Portalen sowie Ticket-, Kunden- und Websuche.

## Installation

### Chromium (Chrome / Brave / Edge)

**Empfohlen — Chrome Web Store** (automatische Updates):
<https://chromewebstore.google.com/detail/bcfhfhhmhgklpjodflnakgligkpglpoc>

**Alternativ — ohne Store („Bypass“-Variante, keine automatischen Updates):**
1. ZIP `kl-toolbox-chromium-v<version>.zip` aus [`releases/`](releases/) herunterladen und entpacken
2. `chrome://extensions` (bzw. `brave://extensions`, `edge://extensions`) öffnen
3. „Entwicklermodus“ aktivieren → „Entpackte Erweiterung laden“ → entpackten Ordner wählen

### Firefox

1. Aktuelle `kl-toolbox-firefox-v<version>.xpi` aus [`releases/`](releases/) herunterladen
2. Datei in Firefox öffnen (oder per Drag & Drop ins Fenster ziehen) und Installation bestätigen
3. Updates kommen danach automatisch über dieses Repo (`releases/updates.json`)

Die .xpi ist von Mozilla signiert (AMO, Kanal „Nicht gelistet“).

## Einrichtung

Die Erweiterung wird bewusst als **neutrale Hülle** ausgeliefert — ohne interne
Links und URL-Vorlagen. Nach der Installation:

1. Optionen öffnen → **Sicherung → Alle Einstellungen importieren**
2. Die intern verteilte Settings-Datei auswählen (nicht in diesem Repo;
   Struktur siehe [`settings-example.json`](settings-example.json))
3. Eigene API-Keys für die KI-Module eintragen
4. Für private M365-Fenster: in der Erweiterungsverwaltung „Im Inkognito-Modus
   zulassen“ bzw. „In privaten Fenstern ausführen“ aktivieren

Der Import führt zusammen: Nur die in der Datei enthaltenen Einstellungen werden
überschrieben, vorhandene API-Keys bleiben erhalten.

## Repo-Struktur

```
chromium/     Quellcode + Manifest fuer Chrome/Brave/Edge (fuehrende Variante)
firefox/      generierte Firefox-Variante (Build-Script, eigenes Manifest)
releases/     Verteil-Artefakte: chromium-ZIP, signierte Firefox-.xpi, updates.json
Build-All.ps1 Build: firefox/ synchronisieren, ZIPs bauen, updates.json erzeugen
```

## Build & Release (intern)

```powershell
.\Build-All.ps1
```

1. Script bauen lassen → `releases/kl-toolbox-chromium-v<ver>.zip` (zugleich Store-Upload-ZIP)
   und `dist/kl-toolbox-firefox-v<ver>.zip` (AMO-Upload)
2. Chromium-ZIP in der [Chrome-Devconsole](https://chrome.google.com/webstore/devconsole) einreichen
3. Firefox-ZIP bei [AMO](https://addons.mozilla.org/developers/) hochladen (Kanal „Nicht gelistet“),
   signierte .xpi herunterladen und als `kl-toolbox-firefox-v<ver>.xpi` nach `dist/` legen
4. `Build-All.ps1` erneut ausführen → .xpi wandert nach `releases/`, `updates.json` wird aktualisiert
5. Committen und pushen — dieses Repo muss öffentlich bleiben (Firefox-Update-Check ist anonym)
