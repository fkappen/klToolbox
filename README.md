# klToolbox

Browser-Erweiterung für IT-Service-Teams — in zwei Varianten: **Chromium**
(Chrome, Brave, Edge) und **Firefox**. Datenschutz: siehe
[PRIVACY.md](PRIVACY.md).

Die Erweiterung wird als **neutrale Hülle** ausgeliefert: keine vorbelegten
Links, kein Branding, keine Firmendaten. Konfiguration (Schnellzugriffe,
Ticketsystem-URL, Vorlagen, Farben/Name) kommt erst per Settings-Import oder
zentral per Gruppenrichtlinie (Managed Storage).

## Funktionen (Module, einzeln abschaltbar)

| Modul | Beschreibung |
|---|---|
| KI-Umformulierer | Markierten Text per Rechtsklick mit KI umformulieren, korrigieren oder übersetzen (Claude / OpenAI / InnoGPT, eigener API-Key) |
| Kontextmenü-Suchen | Markierten Text in der DATEV Wissensplattform, bei Google oder in InnoGPT nachschlagen |
| Ticket-Vorlagen | Textbausteine mit einem Klick in das Mail-Fenster des (konfigurierten) Ticketsystems einfügen — mit Platzhaltern wie `{anrede}` |
| Ticket-Termin & Wartezeit | Outlook-Termin aus dem Ticket erstellen (ICS oder Outlook Web), „Nicht erreicht“-Eintrag, Abonnieren, Anfahrtsplanung, Wartezeit-Ampel |
| MS Account Cleaner | Gemerkte Konten auf der Microsoft-Anmeldeseite in einem Rutsch entfernen (mit Whitelist) |
| KI-Chat | Chat-Seite mit dem konfigurierten KI-Anbieter, direkt aus dem Popup |

Dazu ein Popup mit Start-Leiste, konfigurierbaren Schnellzugriffen, Links, die
in privaten Fenstern öffnen, DATEV-Portalen sowie Ticket-, Kunden- und Websuche.

## Ticketsystem-Anbindung

Das Ticketsystem steht **nicht** im Manifest. Nach dem Settings-Import (die
Konfiguration enthält die Ticketsystem-URL) fragt die Erweiterung einmalig um
Erlaubnis für genau diese Website (optionale Host-Berechtigung); erst dann
werden die Ticket-Module dort per `scripting.registerContentScripts` aktiv.

## Installation

### Chromium (Chrome / Brave / Edge)

**Empfohlen:** über den Chrome Web Store (automatische Updates) — Link wird
intern verteilt.

**Alternativ — ohne Store („Bypass“, keine automatischen Updates):**
1. ZIP `kl-toolbox-chromium-v<version>.zip` aus [`releases/`](releases/) entpacken
2. `chrome://extensions` → „Entwicklermodus“ → „Entpackte Erweiterung laden“

### Firefox

Aktuelle `kl-toolbox-firefox-v<version>.xpi` aus [`releases/`](releases/) in
Firefox öffnen. Updates kommen danach automatisch über dieses Repo
(`releases/updates.json`). Die .xpi ist von Mozilla signiert (AMO, „Nicht gelistet“).

## Einrichtung

1. Optionen öffnen → **Sicherung → Importieren (aktualisieren)** mit der intern
   verteilten Konfigurationsdatei
2. Button **„Zugriff auf Ticketsystem erlauben“** klicken (erscheint nach dem Import)
3. Eigene API-Keys für die KI-Module eintragen
4. Für private Fenster: in der Erweiterungsverwaltung „Im Inkognito-Modus
   zulassen“ bzw. „In privaten Fenstern ausführen“ aktivieren

Zentrale Verteilung per Gruppenrichtlinie (Force-Install + Vorgaben): siehe [`gpo/`](gpo/).

Microsoft-365-Kalenderanbindung (Termine direkt in Outlook): App-Registrierung im eigenen Tenant per [`setup/New-KlToolboxEntraApp.ps1`](setup/New-KlToolboxEntraApp.ps1) anlegen (Single-Page Application, delegierte Kalender-Berechtigungen, Admin-Consent; optional `-MitVerzeichnis` fuer die Kollegenliste und `-MitMail` fuer Terminbestaetigungen), Tenant- und Client-ID in die Vorgabe-Datei uebernehmen, dann in den Optionen unter „Microsoft 365“ verbinden.

## Repo-Struktur

```
chromium/     Quellcode + Manifest fuer Chrome/Brave/Edge (fuehrende Variante)
firefox/      generierte Firefox-Variante (Build-Script, eigenes Manifest)
releases/     Verteil-Artefakte: chromium-ZIP, signierte Firefox-.xpi, updates.json
gpo/          GPO-Verteilung: Force-Install + Vorgaben via Managed Storage (New-KlToolboxGpo.ps1 legt die GPO direkt an)
setup/        New-KlToolboxEntraApp.ps1: Entra-App-Registrierung fuer die Microsoft-365-Kalenderanbindung
Build-All.ps1 Build: firefox/ synchronisieren, ZIPs bauen, updates.json erzeugen
```

## Build & Release

1. Version in `chromium/manifest.json` erhöhen, `.\Build-All.ps1` ausführen
2. `releases/kl-toolbox-chromium-v<ver>.zip` in der Chrome-Devconsole einreichen
3. `releases/kl-toolbox-firefox-v<ver>.zip` bei AMO hochladen („Nicht gelistet“),
   signierte .xpi als `kl-toolbox-firefox-v<ver>.xpi` nach `dist/` legen
4. `Build-All.ps1` erneut → .xpi wandert nach `releases/`, `updates.json` wird erzeugt
5. Committen und pushen — das Repo muss öffentlich bleiben (Firefox-Update-Check ist anonym)

## Datenquellen der Anrede-Erkennung

`chromium/vornamen-data.js` (rund 10.000 Vornamen mit Geschlechtszuordnung) ist aus amtlichen, offen lizenzierten Vornamen-Statistiken generiert. Ein Name gilt nur als weiblich bzw. maennlich, wenn er in den Quellen zu mindestens 92 % so vergeben wird; alle anderen werden bewusst neutral behandelt.

| Quelle | Datensatz | Lizenz |
|---|---|---|
| Bundesamt fuer Statistik (CH) | Vornamen der Bevoelkerung nach Geschlecht, 2025 | Quellenangabe (BFS) |
| Statbel (BE) | Voornamen van de totale bevolking, 2026 | CC BY 4.0 |
| Ministerstwo Cyfryzacji (PL) | Imiona w rejestrze PESEL, osoby zyjace, 2026 | CC0 1.0 |
| Statistik Austria (AT) | Vornamen der Geborenen 1984-2025 | CC BY 4.0 |
| Insee (FR) | Fichier des prenoms, 2025 | Licence Ouverte 2.0 |
| Amt fuer Statistik Berlin-Brandenburg / LABO (DE) | Haeufige Vornamen Berlin 2012-2023 | CC BY 3.0 DE |
| Stadt Koeln (DE) | Vornamenstatistik 2019-2023 | dl-de/zero-2-0 |
| Statistiska centralbyran (SE) | Namn med minst tva barare, Tilltalsnamn 2022 | CC0 |
| Office for National Statistics (UK) | Baby names in England and Wales, 2025 | OGL v3.0 |

Die Namen liegen normalisiert vor (klein, ae/oe/ue/ss, ohne Akzente, erster Bestandteil bei Doppelnamen); die Quelldaten selbst sind nicht Teil des Repos.
