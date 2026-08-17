# Store-Einreichung: klToolbox

Texte für Chrome Web Store Devconsole und addons.mozilla.org (AMO).
Beide Listings: Sichtbarkeit **„Nicht gelistet“ / unlisted** (interne Verteilung per Link).

## Name

klToolbox

## Kurzbeschreibung (≤132 Zeichen)

Werkzeuge für IT-Service-Teams: KI-Textbearbeitung, Artikel-Clipper, Ticket-Helfer, KI-Chat, Schnellzugriffe und Konto-Aufräumer.

## Beschreibung (lang)

klToolbox bündelt Alltagswerkzeuge für IT-Service-Teams in einer Erweiterung:

**KI-Textbearbeitung** — Markierten Text per Rechtsklick umformulieren, formeller oder lockerer fassen, kürzen, Rechtschreibung korrigieren oder übersetzen; eigene Aktionen mit eigenem Prompt definierbar. Das Ergebnis ersetzt die Markierung direkt im Eingabefeld. Funktioniert mit dem eigenen API-Schlüssel bei Anthropic (Claude), OpenAI, InnoGPT oder Azure OpenAI (Ressource im eigenen Microsoft-Tenant). Ohne Schlüssel und ohne ausdrückliche Zustimmung in den Optionen findet keine Übertragung statt.

**KI-Chat** — Chat-Seite mit dem konfigurierten Anbieter, Unterhaltungs-Verlauf der letzten 30 Tage (nur lokal gespeichert). Token-Statistik mit Kosten-Richtwerten in den Optionen.

**Artikel-Clipper** — Liest Artikel werbefrei und sauber formatiert aus (ohne Videos und Social-Media-Einbettungen). Export: formatiert in die Zwischenablage (OneNote/Word/Outlook), Markdown, HTML-Datei, Drucken/PDF, per E-Mail teilen; auf Wunsch per KI zusammenfassen oder übersetzen. Clip-Verlauf 30 Tage, lokal.

**Suche** — Ein Suchfeld im Popup: erkennt Ticket- und Kundennummern (sobald ein Ticketsystem konfiguriert ist) und sucht sonst im Web, in der DATEV Wissensplattform oder per KI. Markierten Text per Rechtsklick nachschlagen.

**Ticket-Helfer (optional)** — Für das firmeneigene, vom Nutzer konfigurierte Ticketsystem: E-Mail- und Eintrags-Vorlagen mit automatischer Anrede und Tagesgruß, Outlook-Termin aus dem Ticket (ICS oder Outlook Web, inkl. Anfahrts-Termin und „Mit Vorbehalt"), Wartezeit-Ampeln in Ticket und Liste, Aktions-Makros, Fehlercode-Verlinkung, Routenplanung. Das Ticketsystem wird erst eingebunden, nachdem der Nutzer die URL eingetragen und den Zugriff auf genau diese Website ausdrücklich erlaubt hat (optionale Berechtigung).

**MS Account Cleaner** — Entfernt auf der Microsoft-Kontoauswahl gemerkte Konten über das seiteneigene „Vergessen"-Menü — nur per sichtbarem Button und nach Bestätigung. Konten „Mit Windows verbunden" und Whitelist-Einträge bleiben erhalten.

**Sonstiges** — Optionale Seitenleiste, frei konfigurierbare Popup-Bereiche (Schnellzugriffe), Links in privaten Fenstern, automatische lokale Sicherung der Einstellungen (30 Tage) mit Wiederherstellung, ausführliche eingebaute Hilfe.

Die Erweiterung wird neutral ausgeliefert und erhebt keine Daten; Einstellungen kommen per Import oder Unternehmensrichtlinie (Managed Storage). Datenschutzerklärung: https://github.com/fkappen/klToolbox/blob/main/PRIVACY.md

## Datenschutz (WICHTIG — Ablehnungsgrund „Purple Nickel" 08/2026)

**Datenschutzerklärungs-URL** (Devconsole → Datenschutz):
```
https://github.com/fkappen/klToolbox/blob/main/PRIVACY.md
```
NICHT die Firmen-/Inhaberwebsite verlinken — CWS verlangt eine eigenständige,
extension-spezifische Erklärung, auf die der Link DIREKT führt.

**Datennutzung (Privacy practices / „Welche Nutzerdaten…"):**
- ☑ **Website-Inhalte** (Website content) ankreuzen — Begründung: Der vom
  Nutzer markierte Text bzw. von ihm angestoßene Seiteninhalte werden auf
  ausdrückliche Aktion an den vom Nutzer konfigurierten KI-Anbieter
  übertragen (eigener API-Schlüssel; ohne Einrichtung und ohne die
  Zustimmung in den Optionen findet keine Übertragung statt).
- Alle übrigen Kategorien: **nicht** ankreuzen.
- Die drei Zusicherungen bestätigen (kein Verkauf, keine zweckfremde
  Nutzung/Weitergabe, keine Kreditwürdigkeits-/Kreditvergabezwecke).

**In-Product-Disclosure:** Seit v3.8.0 zeigt der KI-Bereich der Optionen eine
sichtbare Offenlegung mit Zustimmungs-Checkbox; ohne Zustimmung blockiert die
Erweiterung jede Übertragung (Fehlermeldung verweist auf die Optionen). Damit
sind Offenlegung + Einwilligung VOR der ersten Übertragung erfüllt.

## Devconsole-Schnellausfüllung (Datenschutz-Tab)

**Einziger Zweck (Single Purpose):**
> Werkzeugsammlung für IT-Service-Teams: KI-gestützte Textbearbeitung, Textvorlagen/Termin-Helfer für ein vom Nutzer konfiguriertes Ticketsystem, Schnellzugriffe und das Entfernen gemerkter Konten auf der Microsoft-Anmeldeseite.

**Begründung Berechtigungen:**
- `contextMenus`: Rechtsklick-Einträge für Umformulieren und Suchen.
- `storage`: Speichert Einstellungen (Anbieter, API-Keys, Vorlagen, Links) lokal; Managed Storage für Unternehmensvorgaben.
- `scripting` + `activeTab`: Fügt das KI-Ergebnis in das vom Nutzer gewählte Feld des aktiven Tabs ein; registriert die Ticket-Module für die vom Nutzer freigegebene Website.
- `clipboardWrite`: Fallback — Ergebnis in die Zwischenablage, wenn direktes Einfügen nicht möglich ist.

**Begründung Hostberechtigungen:**
> api.anthropic.com / api.openai.com / app.innogpt.de / *.openai.azure.com: Der vom Nutzer markierte Text wird nur auf dessen ausdrückliche Aktion, nach Zustimmung in den Einstellungen und mit dessen eigenem API-Schlüssel an den gewählten KI-Anbieter gesendet (bei Azure OpenAI an die vom Nutzer konfigurierte Ressource des eigenen Microsoft-Tenants), ausschließlich zur Erzeugung des Ergebnisses. — login.microsoftonline.com / login.live.com / login.microsoft.com: Ein sichtbarer, ausschließlich per Klick ausgelöster Button entfernt gemerkte Konten über das seiteneigene „Abmelden und vergessen“-Menü; es werden keine Anmeldedaten gelesen, gespeichert oder übertragen. — Optionale Hostberechtigung (https://*/*): Der Nutzer konfiguriert die URL seines internen Ticketsystems; nur für genau diese Website wird nach ausdrücklicher Zustimmung Zugriff angefordert, um dort Vorlagen-/Termin-Buttons einzublenden. Ohne Konfiguration und Zustimmung wird keine Website berührt.

**Remote Code:** Nein. Es werden keine Skripte nachgeladen; alle Inhalte liegen im Paket.

**Datennutzung:** Kategorie „Website-Inhalte" wird gehandhabt (siehe oben) — keine Erhebung durch den Entwickler. API-Aufrufe erfolgen direkt vom Browser des Nutzers zum von ihm gewählten und mit eigenem Schlüssel konfigurierten KI-Anbieter, erst nach Zustimmung in den Optionen.

## Testanweisungen (Devconsole → „Anleitungen zum Testen", max. 500 Zeichen)

Kurzfassung zum Einreichen (492 Zeichen, Englisch):

```
Works without account/login; ships neutral. AI actions (context menu, chat, clipper) need the user's OWN API key AND the consent checkbox in Options > KI - without both nothing is transmitted (error toast). Test: add key, tick consent, select text, right-click > "KI: Text bearbeiten". Ticket module is inert until the user enters their ticket URL and grants the optional host permission ("Zugriff erlauben"). Account cleaner only clicks the MS login page's own "Forget" menu. No remote code.
```

Ausführliche Fassung (Hintergrund, z. B. für Review-Rückfragen oder AMO-Notizen):

```
The extension ships "neutral" and works without any account or login.
Settings are stored locally only (chrome.storage.local); enterprise
defaults can come via managed storage. Privacy policy:
https://github.com/fkappen/klToolbox/blob/main/PRIVACY.md

1. AI features (context menu "KI: Text bearbeiten", AI chat, summarize/
   translate in the clipper) require the user's OWN API key (Anthropic,
   OpenAI, InnoGPT or Azure OpenAI) AND an explicit consent checkbox in
   Options -> "KI". Without key + consent, every AI action shows an error
   toast and NOTHING is transmitted. To test end-to-end, enter any
   Anthropic or OpenAI API key, tick the consent checkbox, select text on
   any page -> right-click -> "KI: Text bearbeiten" -> "Umformulieren":
   the selection is replaced by the AI result. The request goes directly
   from the browser to the provider chosen by the user - no developer
   server is involved.

2. Article clipper: open any news article -> toolbar popup -> clipper
   button (or right-click -> page context menu). A clean reader view
   opens with copy/export buttons. Needs no configuration; uses
   activeTab only.

3. One search field in the popup: plain terms open a web search; ticket/
   customer number detection only activates after the user configures
   their internal ticket system URLs in the options.

4. Ticket-system module: built for a company-internal ticket system that
   is not publicly reachable. It is fully inert until the user (a) enters
   the ticket URL in Options and (b) explicitly grants the optional host
   permission via the "Zugriff erlauben" button (Chrome then shows the
   permission prompt for that single origin). Without that grant no
   content script is registered on any site. You can verify the flow with
   any https URL.

5. MS Account Cleaner: on https://login.microsoftonline.com with
   remembered accounts ("Pick an account" screen), a red button
   "Alle Konten entfernen" appears bottom right. After an explicit
   confirmation dialog it removes remembered accounts by clicking the
   page's own "Forget" menu items. Accounts "Connected to Windows" and
   whitelisted accounts are skipped. No credentials are read, stored or
   transmitted. Without remembered accounts the button stays hidden.

6. No remote code: all scripts/resources are bundled. Network requests
   are limited to the user-initiated AI calls described in (1) and
   favicons for user-configured quick links.
```

## AMO (Firefox) — Reviewer-Hinweise

| Permission | Reason |
|---|---|
| `contextMenus` | Right-click actions for AI text rewriting and searches. |
| `storage` | Local settings (provider, API keys, templates, links); managed storage for enterprise defaults. |
| `scripting` + `activeTab` | Inserts the AI result into the field the user selected; registers ticket-system content scripts for the origin the user explicitly granted. |
| `clipboardWrite` | Fallback: copy result to clipboard if inline insertion is impossible. |
| Host `api.anthropic.com`, `api.openai.com`, `app.innogpt.de`, `*.openai.azure.com` | Selected text is sent to the AI provider chosen by the user, with the user's own API key, solely to generate the result. Azure OpenAI targets a resource in the user's own Microsoft tenant, configured by the user. |
| Optional host (`https://*/*`) | The user configures the URL of their internal ticket system; access is requested for that single origin only, after explicit consent, to add template/appointment buttons there. No site is touched without configuration and consent. |
| Content scripts `login.microsoftonline.com`, `login.live.com`, `login.microsoft.com` | User-triggered button on the Microsoft account picker that removes remembered accounts via the page's own "Forget" menu. No credentials are read or transmitted. |

- The internal ticket system cannot be visited by reviewers; the content scripts only add UI buttons there and are inert without the user-granted origin.
- `data_collection_permissions.required = ["websiteContent"]`: selected text is transmitted only to the user's own AI provider on explicit action.
