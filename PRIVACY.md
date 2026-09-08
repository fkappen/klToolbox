# Datenschutzerklärung — klToolbox (Browser-Erweiterung)

*Privacy Policy for the klToolbox browser extension — English summary at the bottom.*

**Stand:** 07.09.2026
**Verantwortlich für die Erweiterung:** Felix Kappen (Entwickler)
**Kontakt:** über die im jeweiligen Store-Eintrag hinterlegte Support-E-Mail oder
<https://github.com/fkappen/klToolbox/issues>

Diese Datenschutzerklärung gilt ausschließlich für die Browser-Erweiterung
**klToolbox** (Chrome Web Store / Firefox Add-ons).

## 1. Grundsatz: Keine Datenerhebung durch den Entwickler

Der Entwickler betreibt **keine eigenen Server** und erhält, speichert oder
verarbeitet **keinerlei Daten** aus der Nutzung der Erweiterung. Es gibt keine
Telemetrie, kein Tracking, keine Analyse-Dienste und keine Werbung.

## 2. Welche Daten die Erweiterung lokal verarbeitet

Die folgenden Daten verbleiben **ausschließlich lokal im Browser**
(`chrome.storage.local`) und verlassen das Gerät nicht:

- Einstellungen (Links, Vorlagen, Farben, Modul-Schalter, Konfiguration)
- API-Schlüssel, die der Nutzer selbst für KI-Anbieter hinterlegt
- die Unterhaltungen des KI-Chats (30 Tage Aufbewahrung, einzeln löschbar)
- eine lokale Token-Verbrauchsstatistik der KI-Funktionen (Aufbewahrung 1 Jahr)
- der Clipper-Verlauf (Titel/URL geclippter Artikel, 30 Tage)
- automatische lokale Konfigurations-Sicherungen (30 Tage, zum Wiederherstellen)

Der **Artikel-Clipper** bereinigt die aktuelle Seite auf ausdrückliche
Nutzeraktion vollständig **lokal** (Extraktion mit der mitgelieferten
Mozilla-Readability-Bibliothek); Exporte gehen in die Zwischenablage, als
Datei-Download oder in das lokale E-Mail-Programm des Nutzers.

Auf Seiten des vom Nutzer konfigurierten Ticketsystems liest die Erweiterung
Seiteninhalte (z. B. Kundenname, Ticketnummer, Einträge) **ausschließlich
lokal**, um dort Funktionen wie Textvorlagen, Terminerstellung oder die
Wartezeit-Anzeige bereitzustellen. Dazu gehört auch das Mitlesen der Daten,
die das Ticketsystem beim Öffnen eines Tickets selbst vom eigenen Server lädt
(Ticket-Stammdaten und Ansprechpartner des Kunden); die Erweiterung stellt
dafür keine eigenen Anfragen und hält diese Daten nur im Arbeitsspeicher der
jeweiligen Seite. Diese Inhalte werden nicht an den
Entwickler oder Dritte übertragen — mit der einzigen, unten beschriebenen
Ausnahme der ausdrücklich vom Nutzer ausgelösten KI-Funktionen.

## 3. Übertragung an KI-Anbieter (nur auf ausdrückliche Nutzeraktion)

Die KI-Funktionen (Text umformulieren, KI-Chat, KI-Antwortentwurf,
Zusammenfassungen und Übersetzungen im Clipper) übertragen den **vom Nutzer markierten Text bzw. die vom
Nutzer angestoßenen Inhalte** (z. B. den sichtbaren Ticketverlauf beim
Antwortentwurf) an **einen** der folgenden, vom Nutzer ausgewählten
KI-Anbieter — ausschließlich zur Erzeugung des angeforderten Ergebnisses:

- Anthropic (api.anthropic.com) — [Datenschutz](https://www.anthropic.com/privacy)
- OpenAI (api.openai.com) — [Datenschutz](https://openai.com/privacy)
- InnoGPT (app.innogpt.de) — Datenschutzhinweise des Anbieters
- Azure OpenAI (\*.openai.azure.com) — eine Azure-Ressource des eigenen
  Microsoft-Tenants ([Microsoft-Datenschutz](https://privacy.microsoft.com))

Dabei gilt:

- Die Übertragung erfolgt **nur nach ausdrücklicher Nutzeraktion** (Klick auf
  eine KI-Funktion), niemals automatisch oder im Hintergrund.
- Der Anbieter wird **vom Nutzer bzw. seiner Organisation ausgewählt und
  konfiguriert**, indem ein **eigener API-Schlüssel** hinterlegt wird. Ohne
  hinterlegten Schlüssel und ohne die einmalige, ausdrückliche **Zustimmung in
  den Einstellungen** findet keine Übertragung statt.
- Die Anfrage geht **direkt vom Browser des Nutzers** an den gewählten
  Anbieter; der Entwickler ist an der Übertragung nicht beteiligt und kann sie
  nicht einsehen.
- Für die Verarbeitung beim jeweiligen KI-Anbieter gelten dessen
  Datenschutzbestimmungen und die Vereinbarungen des API-Schlüssel-Inhabers
  mit diesem Anbieter.

## 4. Optionale Anbindung an Microsoft 365 (Kalender)

Die Erweiterung kann Termine aus dem Ticketsystem **direkt im Outlook-Kalender
des angemeldeten Nutzers** anlegen. Diese Funktion ist **optional** und
vollständig inaktiv, solange sie nicht eingerichtet ist.

- **Einrichtung:** Der Nutzer (bzw. dessen Organisation) hinterlegt in den
  Einstellungen die Kennung einer **eigenen App-Registrierung in Microsoft
  Entra ID** (Tenant, Client-ID) und startet die Anmeldung mit „Verbinden".
  Die Anmeldung läuft über den Standard-Anmeldedialog von Microsoft
  (OAuth 2.0 mit PKCE, Browser-Schnittstelle `identity`); die Erweiterung
  sieht **kein Passwort**. Erst dabei werden die Zugriffe auf
  `login.microsoftonline.com` und `graph.microsoft.com` angefordert.
- **Berechtigung:** ausschließlich die delegierten Berechtigungen
  `Calendars.ReadWrite` (der **eigene Kalender** des angemeldeten Kontos) und
  `Calendars.ReadWrite.Shared` (Kalender, die dem Nutzer von Kollegen
  **ausdrücklich freigegeben** wurden — dort lassen sich Termine für den
  jeweiligen Kollegen anlegen; ohne Freigabe kein Zugriff). Optional und
  standardmäßig aus: `User.ReadBasic.All` (Namen und E-Mail-Adressen der
  Nutzer des eigenen Tenants lesen, um freigegebene Kollegen-Kalender zu
  finden) sowie `Mail.Send` (eine Terminbestätigung im Namen des Nutzers an
  den im Ticket genannten Ansprechpartner senden; Inhalt = die vom Nutzer
  gepflegte Vorlage mit Termin- und Ticketangaben, landet in dessen
  „Gesendete Elemente“) — beide nur, wenn der Nutzer sie in den
  Einstellungen einschaltet; ohne Mail-Berechtigung wird die Bestätigung im
  Mailprogramm des Nutzers geöffnet und von ihm selbst gesendet. Für die Verfügbarkeitsanzeige von Kollegen wird die
  Frei/Belegt-Auskunft genutzt, die Microsoft 365 innerhalb einer Organisation
  ohnehin bereitstellt (`getSchedule`); es werden keine fremden Kalender
  gelesen oder verändert.
- **Was übertragen wird — nur auf ausdrückliche Nutzeraktion:** Beim Anlegen,
  Verschieben oder Absagen eines Termins gehen die Termindaten (Betreff,
  Beschreibung mit Ticketangaben, Zeit, Ort, ggf. die E-Mail-Adresse des
  einzuladenden Ansprechpartners oder Kollegen) direkt vom Browser des
  Nutzers an Microsoft Graph, also in dessen eigenes Microsoft-365-Konto.
  Für die Kalenderansicht werden die Termine des eigenen Kalenders bzw. die
  Frei/Belegt-Zeiten eines gewählten Kollegen für die angezeigte Woche
  abgerufen und **nur angezeigt, nicht gespeichert**.
- **Lokal gespeichert:** die Anmeldetoken (Zugriffs-/Aktualisierungstoken)
  sowie die Kennungen der angelegten Termine je Ticket — ausschließlich im
  lokalen Browserspeicher, sie werden **nicht exportiert** und mit „Trennen"
  bzw. „Alles zurücksetzen" gelöscht.
- Der Entwickler ist an dieser Kommunikation **nicht beteiligt** und erhält
  keine Daten. Es gilt die Datenschutzerklärung von Microsoft für das
  jeweilige Microsoft-365-Konto.

## 5. Weitere Netzwerkzugriffe

- **Favicons:** Für die Link-Kacheln lädt die Erweiterung Website-Symbole —
  zunächst direkt vom jeweiligen Ziel-Host (`/favicon.ico`), ersatzweise über
  den Favicon-Dienst von Google (`www.google.com/s2/favicons`). Dabei wird dem
  jeweiligen Dienst der **Hostname** des konfigurierten Links übermittelt,
  keine weiteren Daten.
- **Updates (Firefox):** Die Firefox-Variante prüft auf neue Versionen über
  eine statische Datei auf GitHub (`raw.githubusercontent.com`); dabei werden
  keine Nutzerdaten übertragen.
- **Microsoft 365 (optional):** siehe Abschnitt 4 — nur nach Einrichtung und
  Anmeldung durch den Nutzer.
- Es finden **keine weiteren** Netzwerkzugriffe statt.

## 6. Keine Weitergabe, kein Verkauf, Limited Use

Nutzerdaten werden **nicht verkauft**, nicht an Dritte weitergegeben (außer der
in Abschnitt 3 beschriebenen, vom Nutzer ausgelösten Übertragung an den von ihm
gewählten KI-Anbieter sowie der in Abschnitt 4 beschriebenen, ebenfalls vom
Nutzer ausgelösten Übertragung in dessen eigenes Microsoft-365-Konto), nicht für Werbung, Kreditwürdigkeitsprüfungen oder
andere Zwecke genutzt. Die Verwendung aller gehandhabten Daten beschränkt sich
auf die **für den Nutzer sichtbaren Kernfunktionen** der Erweiterung
(„Limited Use").

## 7. Berechtigungen (Kurzüberblick)

| Berechtigung | Zweck |
|---|---|
| `storage` | Einstellungen lokal speichern; Managed Storage für Unternehmensvorgaben |
| `contextMenus` | Rechtsklick-Einträge (KI-Funktionen, Suchen) |
| `scripting`, `activeTab` | Ergebnis in das vom Nutzer gewählte Feld einfügen; Ticket-Funktionen auf der vom Nutzer freigegebenen Website |
| `clipboardWrite` | Fallback: Ergebnis in die Zwischenablage kopieren |
| optionale Host-Berechtigung | Zugriff auf das vom Nutzer konfigurierte Ticketsystem — nur nach ausdrücklicher Zustimmung, nur für diese eine Website |
| `sidePanel` (Chromium) | optionale Seitenleisten-Darstellung |
| `identity` | optionale Microsoft-365-Anmeldung über den Microsoft-Anmeldedialog (OAuth 2.0); nur nach Einrichtung durch den Nutzer |
| optionale Hosts `login.microsoftonline.com`, `graph.microsoft.com` | Token-Abruf und Kalenderzugriff für die optionale Microsoft-365-Anbindung — erst beim Klick auf „Verbinden“ angefordert |

## 8. Rechte und Löschung

Alle lokal gespeicherten Daten können jederzeit in den Einstellungen der
Erweiterung eingesehen, geändert, exportiert oder über „Alles zurücksetzen"
vollständig gelöscht werden; das Deinstallieren der Erweiterung entfernt sie
ebenfalls. Da der Entwickler keine Daten erhebt, liegen bei ihm keine
personenbezogenen Daten vor, die beauskunftet oder gelöscht werden könnten.

## 9. Änderungen

Änderungen an dieser Datenschutzerklärung werden in diesem Dokument
veröffentlicht (Versionsverlauf über die Git-Historie einsehbar).

---

## English summary

The klToolbox extension does **not collect any data** for its developer: no
telemetry, no tracking, no developer-operated servers. All settings, API keys
and the AI chat history are stored **locally** in the browser. Page content of
the user-configured ticket system is processed locally only. The **only**
transmission of user data happens when the user explicitly triggers an AI
feature: the selected text (or the user-initiated content) is sent directly
from the user's browser to **one** AI provider (Anthropic, OpenAI or InnoGPT)
that the user has chosen and configured with **their own API key** — solely to
produce the requested result, and only after a one-time explicit consent in
the extension settings. Favicons are fetched from the link's host or Google's
favicon service (hostname only). An **optional Microsoft 365 integration** lets the user create appointments in their **own** Outlook calendar: it is inactive until the user enters their organisation's Entra app registration and signs in through Microsoft's standard login (OAuth 2.0/PKCE via the `identity` API, delegated `Calendars.ReadWrite` and `Calendars.ReadWrite.Shared` only - own calendar and calendars explicitly shared with the user); appointment data is sent directly from the browser to the user's own Microsoft 365 account, calendar data is displayed only, and tokens stay in local storage. No data is sold or shared beyond this; use of
all handled data is limited to the extension's user-facing core functionality
(Limited Use). All local data can be deleted at any time via the settings or
by uninstalling the extension.
