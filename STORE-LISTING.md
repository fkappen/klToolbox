# Store-Einreichung: klToolbox

Texte für Chrome Web Store Devconsole und addons.mozilla.org (AMO).
Beide Listings: Sichtbarkeit **„Nicht gelistet“ / unlisted** (interne Verteilung per Link).

## Name

klToolbox

## Kurzbeschreibung (≤132 Zeichen)

Kommt aus `chromium/manifest.json` (`description`) — Änderungen daran
brauchen ein neues Paket. Aktueller Stand, nicht beanstandet:

Werkzeuge für IT-Service-Teams: KI-Textbearbeitung, Ticket-Helfer, Schnellzugriffe, KI-Chat und Konto-Aufräumer.

## Beschreibung (lang)

> ⚠️ **Nicht wieder Marken- oder Formatlisten einbauen** — siehe Abschnitt
> „Keyword-Spam" weiter unten (Ablehnung „Yellow Argon", 08/2026).

klToolbox bündelt Alltagswerkzeuge für IT-Service-Teams in einer Erweiterung.

**KI-Textbearbeitung** — Markierten Text per Rechtsklick überarbeiten lassen: umformulieren, förmlicher oder lockerer fassen, kürzen, Rechtschreibung korrigieren oder übersetzen. Eigene Aktionen mit eigenem Prompt lassen sich ergänzen. Das Ergebnis ersetzt die Markierung direkt im Eingabefeld. Die Anfrage geht mit dem eigenen API-Schlüssel an den selbst gewählten Anbieter; unterstützt werden Anthropic, OpenAI, InnoGPT und Azure OpenAI. Ohne hinterlegten Schlüssel und ohne ausdrückliche Zustimmung in den Optionen wird nichts übertragen.

**KI-Chat** — Eine eigene Chat-Seite mit dem eingerichteten Anbieter. Der Gesprächsverlauf der letzten 30 Tage bleibt ausschließlich lokal gespeichert; eine Übersicht zeigt den angefallenen Verbrauch samt Kostenschätzung.

**Artikel aufbereiten** — Bereitet den Artikel einer Webseite ohne Werbung und ohne eingebettete Fremdinhalte lesbar auf. Das Ergebnis lässt sich mit Formatierung in die Zwischenablage übernehmen, als Datei sichern, drucken oder per E-Mail weitergeben; auf Wunsch fasst die KI ihn zusammen oder übersetzt ihn. Die zuletzt aufbereiteten Seiten bleiben 30 Tage lokal abrufbar.

**Suche** — Ein Eingabefeld im Popup erkennt Ticket- und Kundennummern, sobald ein Ticketsystem eingerichtet ist, und sucht andernfalls im Web oder in einer hinterlegten Wissensdatenbank. Markierten Text kann man per Rechtsklick nachschlagen.

**Ticket-Helfer (optional)** — Ergänzt das selbst eingerichtete Ticketsystem um Textvorlagen für Antworten und Einträge mit passender Anrede, um Termine samt Anfahrt direkt aus dem Ticket heraus, um eine farbige Wartezeitanzeige, um Aktionsfolgen auf Knopfdruck und um eine Routenplanung. Eingebunden wird das System erst, nachdem seine Adresse eingetragen und der Zugriff darauf ausdrücklich erlaubt wurde.

**Konten aufräumen** — Auf der Anmeldeseite von Microsoft entfernt ein sichtbarer Knopf nach Rückfrage die dort gemerkten Konten über das seiteneigene Menü. Mit Windows verbundene und selbst geschützte Konten bleiben erhalten.

**Weiteres** — Optionale Seitenleiste, frei bestückbare Schnellzugriffe, Links in privaten Fenstern, tägliche lokale Sicherung der Einstellungen mit Wiederherstellung sowie eine ausführliche eingebaute Hilfe.

Die Erweiterung wird ohne Voreinstellungen ausgeliefert und erhebt keine Daten. Einstellungen kommen per Import oder über eine Unternehmensrichtlinie. Datenschutzerklärung: https://github.com/fkappen/klToolbox/blob/main/PRIVACY.md

## Beschreibung (englische Fassung, falls ein EN-Listing gepflegt wird)

klToolbox bundles everyday tools for IT service teams in a single extension.

**AI text editing** — Have selected text reworked from the right-click menu: rephrase it, make it more formal or more casual, shorten it, correct spelling, or translate it. Custom actions with your own prompt can be added. The result replaces the selection directly in the input field. The request is sent with your own API key to the provider you choose; Anthropic, OpenAI, InnoGPT and Azure OpenAI are supported. Nothing is transmitted without a stored key and your explicit consent in the options.

**AI chat** — A dedicated chat page using the provider you set up. The conversation history of the past 30 days is stored locally only, and an overview shows the usage incurred along with an estimated cost.

**Article reader** — Prepares the article on a web page for reading, without advertising and without embedded third-party content. The result can be taken into the clipboard with its formatting, saved as a file, printed, or passed on by e-mail; on request the AI summarises or translates it. Recently prepared pages remain available locally for 30 days.

**Search** — A single input field in the popup recognises ticket and customer numbers once a ticket system has been set up, and otherwise searches the web or a knowledge base you configure. Selected text can be looked up from the right-click menu.

**Ticket helper (optional)** — Adds text templates for replies and entries with a matching salutation to the ticket system you set up, along with appointments including the journey there, a colour-coded waiting-time indicator, action sequences at the press of a button, and route planning. The system is only integrated once its address has been entered and access to it explicitly granted.

**Tidying up accounts** — On the Microsoft sign-in page, a visible button removes the accounts remembered there via the page's own menu, after confirmation. Accounts connected to Windows and those you protect yourself are kept.

**More** — An optional sidebar, freely arranged quick links, links in private windows, a daily local backup of your settings with restore, and comprehensive built-in help.

The extension ships without preset configuration and collects no data. Settings arrive by import or through an enterprise policy. Privacy policy: https://github.com/fkappen/klToolbox/blob/main/PRIVACY.md

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

## Keyword-Spam (WICHTIG — Ablehnungsgrund „Yellow Argon" 08/2026)

Die Beschreibung wurde abgelehnt wegen „überflüssiger und/oder irrelevanter
Keywords". Beanstandet war wörtlich diese Stelle aus dem Clipper-Absatz:

> OneNote/Word/Outlook), Markdown, HTML file, print/PDF,

**Regel für alle künftigen Texte:** keine Aufzählungen von Fremdprodukt-Namen
und keine Listen von Datei-/Exportformaten. Statt „formatiert in die
Zwischenablage (OneNote/Word/Outlook), Markdown, HTML-Datei, Drucken/PDF"
also „mit Formatierung in die Zwischenablage übernehmen, als Datei sichern,
drucken oder per E-Mail weitergeben".

Fremdnamen nur, wo sie technisch unvermeidbar sind, und höchstens einmal:
- KI-Anbieter (Anthropic/OpenAI/InnoGPT/Azure OpenAI) — sind die tatsächlich
  angesprochenen Endpunkte, daher relevant; in einem Satz, nicht als Liste.
- Microsoft/Windows — die Anmeldeseite, auf der der Konten-Aufräumer arbeitet.
- Entfernt wurden: OneNote, Word, Outlook, ICS, Markdown, HTML, PDF, DATEV
  Wissensplattform, „Social-Media".

Kein Einspruch — die Beanstandung ist inhaltlich zutreffend; Widersprüche
riskieren den Publisher-Status. Es genügt, den Listing-Text zu korrigieren
und erneut einzureichen; das Paket selbst ist unverändert gültig.

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
