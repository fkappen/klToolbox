# Datenschutzerklärung — klToolbox (Browser-Erweiterung)

*Privacy Policy for the klToolbox browser extension — English summary at the bottom.*

**Stand:** 16.08.2026
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
- der Verlauf des KI-Chats (löschbar über „Neuer Chat")

Der **Artikel-Clipper** bereinigt die aktuelle Seite auf ausdrückliche
Nutzeraktion vollständig **lokal** (Extraktion mit der mitgelieferten
Mozilla-Readability-Bibliothek); Exporte gehen in die Zwischenablage, als
Datei-Download oder in das lokale E-Mail-Programm des Nutzers.

Auf Seiten des vom Nutzer konfigurierten Ticketsystems liest die Erweiterung
Seiteninhalte (z. B. Kundenname, Ticketnummer, Einträge) **ausschließlich
lokal**, um dort Funktionen wie Textvorlagen, Terminerstellung oder die
Wartezeit-Anzeige bereitzustellen. Diese Inhalte werden nicht an den
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

## 4. Weitere Netzwerkzugriffe

- **Favicons:** Für die Link-Kacheln lädt die Erweiterung Website-Symbole —
  zunächst direkt vom jeweiligen Ziel-Host (`/favicon.ico`), ersatzweise über
  den Favicon-Dienst von Google (`www.google.com/s2/favicons`). Dabei wird dem
  jeweiligen Dienst der **Hostname** des konfigurierten Links übermittelt,
  keine weiteren Daten.
- **Updates (Firefox):** Die Firefox-Variante prüft auf neue Versionen über
  eine statische Datei auf GitHub (`raw.githubusercontent.com`); dabei werden
  keine Nutzerdaten übertragen.
- Es finden **keine weiteren** Netzwerkzugriffe statt.

## 5. Keine Weitergabe, kein Verkauf, Limited Use

Nutzerdaten werden **nicht verkauft**, nicht an Dritte weitergegeben (außer der
in Abschnitt 3 beschriebenen, vom Nutzer ausgelösten Übertragung an den von ihm
gewählten KI-Anbieter), nicht für Werbung, Kreditwürdigkeitsprüfungen oder
andere Zwecke genutzt. Die Verwendung aller gehandhabten Daten beschränkt sich
auf die **für den Nutzer sichtbaren Kernfunktionen** der Erweiterung
(„Limited Use").

## 6. Berechtigungen (Kurzüberblick)

| Berechtigung | Zweck |
|---|---|
| `storage` | Einstellungen lokal speichern; Managed Storage für Unternehmensvorgaben |
| `contextMenus` | Rechtsklick-Einträge (KI-Funktionen, Suchen) |
| `scripting`, `activeTab` | Ergebnis in das vom Nutzer gewählte Feld einfügen; Ticket-Funktionen auf der vom Nutzer freigegebenen Website |
| `clipboardWrite` | Fallback: Ergebnis in die Zwischenablage kopieren |
| optionale Host-Berechtigung | Zugriff auf das vom Nutzer konfigurierte Ticketsystem — nur nach ausdrücklicher Zustimmung, nur für diese eine Website |
| `sidePanel` (Chromium) | optionale Seitenleisten-Darstellung |

## 7. Rechte und Löschung

Alle lokal gespeicherten Daten können jederzeit in den Einstellungen der
Erweiterung eingesehen, geändert, exportiert oder über „Alles zurücksetzen"
vollständig gelöscht werden; das Deinstallieren der Erweiterung entfernt sie
ebenfalls. Da der Entwickler keine Daten erhebt, liegen bei ihm keine
personenbezogenen Daten vor, die beauskunftet oder gelöscht werden könnten.

## 8. Änderungen

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
favicon service (hostname only). No data is sold or shared beyond this; use of
all handled data is limited to the extension's user-facing core functionality
(Limited Use). All local data can be deleted at any time via the settings or
by uninstalling the extension.
