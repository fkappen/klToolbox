# Store-Einreichung: klToolbox

Texte für Chrome Web Store Devconsole und addons.mozilla.org (AMO).
Beide Listings: Sichtbarkeit **„Nicht gelistet“ / unlisted** (interne Verteilung per Link).

## Name

klToolbox

## Kurzbeschreibung (≤132 Zeichen)

Werkzeuge für IT-Service-Teams: KI-Textbearbeitung, Ticket-Helfer, Schnellzugriffe, KI-Chat und Konto-Aufräumer.

## Beschreibung (lang)

klToolbox bündelt Alltagswerkzeuge für IT-Service-Teams:

- **KI-Umformulierer**: Markierten Text per Rechtsklick umformulieren, korrigieren oder übersetzen — mit eigenem API-Key bei Anthropic, OpenAI oder InnoGPT. Das Ergebnis ersetzt die Markierung direkt im Eingabefeld.
- **Kontextmenü-Suchen**: Markierten Text (z. B. eine Fehlermeldung) in der DATEV Wissensplattform, bei Google oder per KI nachschlagen.
- **Ticket-Vorlagen und Ticket-Termin**: Textbausteine und Termin-Erstellung für das firmeneigene Ticketsystem. Das Ticketsystem wird vom Nutzer konfiguriert und erst nach ausdrücklicher Erlaubnis (optionale Berechtigung) eingebunden.
- **Popup**: konfigurierbare Schnellzugriffe, Links in privaten Fenstern, Ticket-/Kunden-/Websuche.
- **KI-Chat**: Chat-Seite mit dem konfigurierten Anbieter.
- **MS Account Cleaner**: Entfernt auf der Microsoft-Kontoauswahl gemerkte Konten über das seiteneigene Menü — nur per sichtbarem Button, mit Whitelist.

Die Erweiterung wird neutral ausgeliefert; Einstellungen kommen per Import oder Unternehmensrichtlinie (Managed Storage).

## Devconsole-Schnellausfüllung (Datenschutz-Tab)

**Einziger Zweck (Single Purpose):**
> Werkzeugsammlung für IT-Service-Teams: KI-gestützte Textbearbeitung, Textvorlagen/Termin-Helfer für ein vom Nutzer konfiguriertes Ticketsystem, Schnellzugriffe und das Entfernen gemerkter Konten auf der Microsoft-Anmeldeseite.

**Begründung Berechtigungen:**
- `contextMenus`: Rechtsklick-Einträge für Umformulieren und Suchen.
- `storage`: Speichert Einstellungen (Anbieter, API-Keys, Vorlagen, Links) lokal; Managed Storage für Unternehmensvorgaben.
- `scripting` + `activeTab`: Fügt das KI-Ergebnis in das vom Nutzer gewählte Feld des aktiven Tabs ein; registriert die Ticket-Module für die vom Nutzer freigegebene Website.
- `clipboardWrite`: Fallback — Ergebnis in die Zwischenablage, wenn direktes Einfügen nicht möglich ist.

**Begründung Hostberechtigungen:**
> api.anthropic.com / api.openai.com / app.innogpt.de: Der vom Nutzer markierte Text wird nur auf dessen ausdrückliche Aktion und mit dessen eigenem API-Schlüssel an den gewählten KI-Anbieter gesendet, ausschließlich zur Erzeugung des Ergebnisses. — login.microsoftonline.com / login.live.com / login.microsoft.com: Ein sichtbarer, ausschließlich per Klick ausgelöster Button entfernt gemerkte Konten über das seiteneigene „Abmelden und vergessen“-Menü; es werden keine Anmeldedaten gelesen, gespeichert oder übertragen. — Optionale Hostberechtigung (https://*/*): Der Nutzer konfiguriert die URL seines internen Ticketsystems; nur für genau diese Website wird nach ausdrücklicher Zustimmung Zugriff angefordert, um dort Vorlagen-/Termin-Buttons einzublenden. Ohne Konfiguration und Zustimmung wird keine Website berührt.

**Remote Code:** Nein. Es werden keine Skripte nachgeladen; alle Inhalte liegen im Paket.

**Datennutzung:** Keine Erhebung durch den Entwickler. API-Aufrufe erfolgen direkt vom Browser des Nutzers zum von ihm gewählten KI-Anbieter mit seinem eigenen Schlüssel.

## AMO (Firefox) — Reviewer-Hinweise

| Permission | Reason |
|---|---|
| `contextMenus` | Right-click actions for AI text rewriting and searches. |
| `storage` | Local settings (provider, API keys, templates, links); managed storage for enterprise defaults. |
| `scripting` + `activeTab` | Inserts the AI result into the field the user selected; registers ticket-system content scripts for the origin the user explicitly granted. |
| `clipboardWrite` | Fallback: copy result to clipboard if inline insertion is impossible. |
| Host `api.anthropic.com`, `api.openai.com`, `app.innogpt.de` | Selected text is sent to the AI provider chosen by the user, with the user's own API key, solely to generate the result. |
| Optional host (`https://*/*`) | The user configures the URL of their internal ticket system; access is requested for that single origin only, after explicit consent, to add template/appointment buttons there. No site is touched without configuration and consent. |
| Content scripts `login.microsoftonline.com`, `login.live.com`, `login.microsoft.com` | User-triggered button on the Microsoft account picker that removes remembered accounts via the page's own "Forget" menu. No credentials are read or transmitted. |

- The internal ticket system cannot be visited by reviewers; the content scripts only add UI buttons there and are inert without the user-granted origin.
- `data_collection_permissions.required = ["websiteContent"]`: selected text is transmitted only to the user's own AI provider on explicit action.
