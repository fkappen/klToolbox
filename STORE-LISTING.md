# Chrome Web Store — Einreichungs-Unterlagen

```
version = 1.1.0
datum   = 2026-08-13
autor   = Felix Kappen
```

---

## Devconsole-Schnellausfüllung (deutsche Texte, 1:1 einfügbar)

**Symbolbild (Store-Symbol):** `icon128.png` aus diesem Ordner hochladen (128×128 PNG).

**Beschreibung des alleinigen Zwecks:**
> Interne Produktivitäts-Toolbox für Mitarbeiter des IT-Dienstleisters Klöschinski: Umformulieren markierter Texte über einen vom Nutzer konfigurierten KI-Anbieter (eigener API-Schlüssel des Nutzers), Textvorlagen und Terminerstellung für das firmeninterne Ticketsystem, konfigurierbare Schnellzugriffs-Links sowie ein manuell ausgelöster Aufräum-Button für gemerkte Konten auf der Microsoft-Anmeldeseite.

**Begründung „activeTab":**
> Wird benötigt, um nach einer vom Nutzer ausgelösten Kontextmenü-Aktion den umformulierten Text in das zuvor markierte Textfeld des aktiven Tabs zurückzuschreiben. Zugriff erfolgt ausschließlich auf den aktiven Tab und nur nach ausdrücklicher Nutzeraktion.

**Begründung „clipboardWrite":**
> Fallback-Funktion: Kann der umformulierte Text nicht direkt in das Eingabefeld eingefügt werden, wird er in die Zwischenablage kopiert, damit der Nutzer ihn manuell einfügen kann. Die Zwischenablage wird nur beschrieben, nie gelesen.

**Begründung „contextMenus":**
> Stellt die Rechtsklick-Menüeinträge bereit (Umformulieren, Korrigieren, Übersetzen), über die der Nutzer die Bearbeitung des markierten Textes startet. Ohne Kontextmenü ist die Kernfunktion nicht nutzbar.

**Begründung „scripting":**
> Fügt nach der vom Nutzer gewählten Kontextmenü-Aktion das Ergebnis in das ausgewählte Eingabefeld des aktiven Tabs ein und zeigt kurze Statushinweise an. Skripte werden ausschließlich nach ausdrücklicher Nutzeraktion und nur im aktiven Tab ausgeführt.

**Begründung „storage":**
> Speichert die Einstellungen des Nutzers ausschließlich lokal im Browser (chrome.storage.local): API-Schlüssel, Textvorlagen, Linklisten und Termin-Vorlagen. Es werden keine Daten an den Entwickler oder Dritte übertragen.

**Begründung Hostberechtigungen:**
> api.anthropic.com / api.openai.com / app.innogpt.de: Der vom Nutzer markierte Text wird nur auf dessen ausdrückliche Aktion und mit dessen eigenem API-Schlüssel an den gewählten KI-Anbieter gesendet, ausschließlich zur Erzeugung des umformulierten Textes. — sc.kloeschinski.de: firmeninternes Ticketsystem; die Erweiterung fügt dort lediglich Buttons für Textvorlagen und Terminerstellung in die Oberfläche ein. — login.microsoftonline.com / login.live.com / login.microsoft.com: Ein sichtbarer, ausschließlich per Klick ausgelöster Button entfernt gemerkte Konten über das seiteneigene „Abmelden und vergessen"-Menü; es werden keine Anmeldedaten gelesen, gespeichert oder übertragen.

**Remote Code:** Option **„Nein, ich verwende keinen Remote-Code"** auswählen. Falls dennoch ein Begründungsfeld erscheint:
> Es wird kein Remote-Code verwendet; sämtlicher ausführbarer Code ist im Erweiterungspaket enthalten. Extern geladen werden ausschließlich Favicon-Bilddateien (keine Skripte).

**Datennutzung (Zertifizierung unten auf dem Tab):** Alle drei Zusicherungs-Häkchen setzen (kein Verkauf von Daten, keine zweckfremde Nutzung/Weitergabe, keine Nutzung für Kreditwürdigkeit) — zutreffend, da alle Daten lokal bleiben bzw. nur auf Nutzeraktion an den vom Nutzer gewählten KI-Anbieter gehen.

Alle Texte zum Copy-Paste für die Einreichung unter https://chrome.google.com/webstore/devconsole (einmalig 5 USD Registrierungsgebühr, Google-Konto nötig — am besten ein Firmen-Google-Konto, nicht privat).

---

## Schritt-für-Schritt

1. **Entwicklerkonto** anlegen: devconsole öffnen → 5 USD zahlen → Verifizierung abwarten
2. `Build-StoreZip.ps1` ausführen → erzeugt `dist\kloeschinski-toolbox-v<version>.zip`
3. Devconsole → **Neues Element** → ZIP hochladen
4. Store-Eintrag ausfüllen (Texte unten), **Screenshots** hochladen (siehe Checkliste)
5. **Datenschutz-Tab** ausfüllen (Begründungen unten)
6. **Sichtbarkeit: „Nicht gelistet"** wählen
7. Zur Überprüfung einreichen (Erstreview: Stunden bis wenige Tage)
8. Nach Freigabe: Install-Link an die Kollegen verteilen; danach Optionen → Settings-JSON importieren

**Updates künftig:** Version im `manifest.json` erhöhen → `Build-StoreZip.ps1` → ZIP in der Devconsole hochladen → einreichen. Die Kollegen bekommen das Update automatisch (Browser prüft mehrmals täglich).

---

## Store-Eintrag

**Name:** Klöschinski Toolbox

**Kurzbeschreibung** (aus dem Manifest, max. 132 Zeichen):
> KI-Umformulierer, Ticket-Vorlagen & -Termine (Venabo), M365-Schnellzugriffe, MS Account Cleaner und KI-Chat.

**Ausführliche Beschreibung:**
> Interne Browser-Toolbox der J. Klöschinski IT-Systeme GmbH & Co. KG für den Techniker-Alltag.
>
> Funktionen:
> • KI-Umformulierer: markierten Text per Rechtsklick umformulieren, korrigieren oder übersetzen (Claude, ChatGPT oder InnoGPT — eigener API-Key erforderlich)
> • Ticket-Vorlagen: Textbausteine im E-Mail-Fenster des Ticketsystems einfügen
> • Ticket-Termin: Outlook-Termin direkt aus dem angezeigten Ticket erstellen (ICS oder Outlook Web), inkl. Status-Automatik und „Nicht erreicht"-Eintrag
> • Popup: Start-Leiste, Schnellzugriffe, M365-Admin-Links (privates Fenster), Ticket-/Kundensuche
> • KI-Chat: direkter Chat mit dem konfigurierten KI-Anbieter
> • MS Account Cleaner: gemerkte Konten auf der Microsoft-Anmeldeseite per Knopfdruck entfernen
>
> Hinweis: Dieses Add-on ist für die interne Nutzung durch Mitarbeiter konzipiert. Die Ticket-Funktionen setzen Zugriff auf das interne Ticketsystem voraus; die KI-Funktionen erfordern einen eigenen API-Schlüssel des jeweiligen Anbieters.

**Kategorie:** Produktivität → Tools für den Arbeitsablauf
**Sprache:** Deutsch

---

## Screenshot-Checkliste (mind. 1, Format 1280×800 oder 640×400 PNG)

1. Popup geöffnet (Start-Leiste + Kacheln) — Fenster auf 1280×800 zuschneiden
2. Vorlagen-Panel im „Email senden"-Fenster
3. Termin-Panel im Ticket
4. KI-Chat
(Tipp: Win+Shift+S, dann in Paint auf 1280×800 bringen. Keine Kundendaten im Bild — Demo-Ticket verwenden!)

---

## Datenschutz-Tab (Data Usage Disclosure)

**Einziger Zweck (Single purpose):**
> Internal productivity toolbox for employees of an IT service provider: text rewriting via AI providers (user-supplied API key), text templates and appointment creation for the company ticket system, quick links, and a cleanup button for remembered accounts on the Microsoft sign-in page.

**Berechtigungs-Begründungen (Permission justifications):**

| Berechtigung | Begründung (EN, zum Einfügen) |
|---|---|
| `contextMenus` | Adds right-click menu entries to rewrite/translate the selected text. |
| `storage` | Stores user settings locally: API keys, text templates, link lists, appointment templates. |
| `scripting` + `activeTab` | After the user picks a context-menu action, the rewritten text is inserted back into the field the user selected, on the active tab only. |
| `clipboardWrite` | Fallback: if inline insertion is not possible, the result is copied to the clipboard so the user can paste it. |
| Host `api.anthropic.com`, `api.openai.com`, `app.innogpt.de` | The selected text is sent to the AI provider chosen by the user, using the user's own API key, solely to generate the rewritten text. |
| Content script `sc.kloeschinski.de` | Company-internal ticket system: adds template/appointment buttons to its toolbar. |
| Content scripts `login.microsoftonline.com`, `login.live.com`, `login.microsoft.com` | Adds a user-triggered button on the Microsoft account-picker page that removes remembered accounts via the page's own "Forget" menu. Runs only on explicit button click; no credentials are read or transmitted. |

**Datennutzung (Häkchen im Formular):**
- Verkauf von Daten an Dritte: **Nein**
- Nutzung/Weitergabe für Zwecke außerhalb des Einzelzwecks: **Nein**
- Nutzung zur Bonitätsprüfung/Kreditvergabe: **Nein**
- „Website content" wird verarbeitet: **Ja** — vom Nutzer markierter Text wird auf ausdrückliche Aktion an den vom Nutzer konfigurierten KI-Anbieter gesendet; keine Speicherung durch die Extension
- „Authentication information": API-Keys werden **nur lokal** gespeichert (chrome.storage.local), nie an uns übertragen

**Privacy-Policy-URL:** https://www.kloeschinski.de/ds
(dort ggf. einen Absatz ergänzen: „Die Browser-Erweiterung Klöschinski Toolbox speichert alle Einstellungen ausschließlich lokal im Browser. Vom Nutzer markierter Text wird nur auf ausdrückliche Aktion an den vom Nutzer gewählten KI-Anbieter (Anthropic, OpenAI oder InnoGPT) übertragen. Es findet keine Datenerhebung durch Klöschinski statt.")

**Remote Code:** Nein (kein Nachladen von Skripten; Favicons sind reine Bilder)

---

## Review-Notizen (Feld „Notes for reviewer")

> This is an internal tool for employees of J. Klöschinski IT-Systeme GmbH (IT service provider, kloeschinski.de), published unlisted.
> - The content scripts on Microsoft login pages only add a visible button; account removal uses the page's own "Sign out and forget" menu and runs exclusively on user click.
> - sc.kloeschinski.de is our internal ticket system; reviewers cannot log in, the scripts only add toolbar buttons there.
> - AI features require the user's own API key (entered in the options); no key is bundled.
