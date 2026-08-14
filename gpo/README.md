# GPO-Verteilung der klToolbox

Verteilt die Extension **inklusive Vorgabe-Einstellungen** (Managed Storage)
an Chrome, Edge, Brave und Firefox.

Alle vier Browser lesen ihre Richtlinien direkt aus der Registry unter
`HKLM\SOFTWARE\Policies\…` — ADMX-Templates sind praktisch für die GPO-Konsole,
aber nicht zwingend: **GPP-Registrierungseinträge** (Computerkonfiguration →
Einstellungen → Registrierung) mit den Werten unten reichen vollständig aus.

Die Vorgabe-Datei (Defaults-JSON mit internen Links/Branding) wird **intern**
verteilt und liegt bewusst nicht in diesem Repo.

## Variante A: Script

[`Deploy-KlToolboxPolicies.ps1`](Deploy-KlToolboxPolicies.ps1) setzt alle Werte
(als Admin ausführen; per GPO-Startskript, RMM oder manuell):

```powershell
.\Deploy-KlToolboxPolicies.ps1 -DefaultsPath "\\pfad\zur\defaults.json" -ExtensionId "<Store-ID>"
```

Es respektiert vorhandene `ExtensionInstallForcelist`-Nummern und merged eine
bestehende Firefox-`ExtensionSettings`-Richtlinie, statt sie zu überschreiben.

## Variante B: GPP-Registrierungseinträge (manuell in der GPO)

`<ID>` = Chrome-Web-Store-ID der klToolbox (nach Einreichung aus der Devconsole) ·
Firefox-ID: `app@kltoolbox.dev`

### Force-Install (Chromium)

| Browser | Schlüssel (HKLM) | Wertname | Typ | Wert |
|---|---|---|---|---|
| Chrome | `SOFTWARE\Policies\Google\Chrome\ExtensionInstallForcelist` | `1`* | REG_SZ | `<ID>;https://clients2.google.com/service/update2/crx` |
| Edge | `SOFTWARE\Policies\Microsoft\Edge\ExtensionInstallForcelist` | `1`* | REG_SZ | gleicher Wert |
| Brave | `SOFTWARE\Policies\BraveSoftware\Brave\ExtensionInstallForcelist` | `1`* | REG_SZ | gleicher Wert |

\* nächste freie Nummer verwenden, falls dort schon andere Erweiterungen stehen.

### Vorgabe-Einstellungen (Chromium, Managed Storage)

Jeweils Schlüssel `…\3rdparty\extensions\<ID>\policy` unter dem Browser-Pfad
oben, Wertname **`defaultsJson`** (REG_SZ), Inhalt: die interne Defaults-JSON
als **eine Zeile** (das Script komprimiert automatisch).

### Firefox

Schlüssel `SOFTWARE\Policies\Mozilla\Firefox`:

- **`ExtensionSettings`** (REG_SZ) — Achtung, existiert ggf. schon → mergen:
  ```json
  {"app@kltoolbox.dev":{"installation_mode":"force_installed","install_url":"https://raw.githubusercontent.com/fkappen/klToolbox/main/releases/kl-toolbox-firefox-v<version>.xpi"}}
  ```
- **Vorgaben**: Schlüssel `SOFTWARE\Policies\Mozilla\Firefox\3rdparty\Extensions\app@kltoolbox.dev`,
  Wertname `defaultsJson` (REG_SZ), Inhalt wie bei Chromium.

## Wie die Vorgaben in der Extension wirken

Die Extension liest `defaultsJson` beim Browserstart aus dem Managed Storage
und übernimmt die Schlüssel in die lokalen Einstellungen — **einmal pro
Richtlinien-Stand**. Benutzer dürfen danach weiter anpassen; erst wenn sich der
Richtlinienwert ändert, wird neu übernommen. API-Keys bleiben unberührt.

Die **optionale Ticketsystem-Berechtigung** kann eine Richtlinie nicht erteilen —
jeder Benutzer bestätigt sie einmal in den Optionen (Button erscheint, sobald
die Vorgaben eine Ticketsystem-URL enthalten).

## Prüfen & Stolpersteine

- Kontrolle: `chrome://policy` / `edge://policy` / `brave://policy` bzw.
  `about:policies` in Firefox; die Extension loggt
  `[Toolbox] GPO-Vorgaben uebernommen` in der Service-Worker-Konsole.
- Browser nach dem Setzen einmal **komplett** neu starten.
- Chromium-Force-Install lädt aus dem Chrome Web Store → Clients brauchen Internet.
- Firefox installiert die xpi aus `install_url`; Folge-Updates über die
  `updates.json` dieses Repos.
- Brave-`3rdparty`-Durchreichung und das Firefox-`3rdparty`-Registry-Format
  vor dem Rollout auf einer Testmaschine mit dem Script verifizieren.
