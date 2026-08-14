# GPO-Verteilung der Klöschinski Toolbox

Verteilt die Extension **inklusive Vorgabe-Einstellungen** (Managed Storage,
ab Toolbox **v2.17.0**) an Chrome, Edge, Brave und Firefox.

Alle vier Browser lesen ihre Richtlinien direkt aus der Registry unter
`HKLM\SOFTWARE\Policies\…` — ADMX-Templates sind praktisch für die GPO-Konsole,
aber nicht zwingend: **GPP-Registrierungseinträge** (Computerkonfiguration →
Einstellungen → Registrierung) mit den Werten unten reichen vollständig aus.

## Variante A: Script

[`Deploy-KlToolboxPolicies.ps1`](Deploy-KlToolboxPolicies.ps1) setzt alle Werte
(als Admin ausführen; per GPO-Startskript, RMM oder manuell). Es respektiert
vorhandene `ExtensionInstallForcelist`-Nummern und merged eine bestehende
Firefox-`ExtensionSettings`-Richtlinie, statt sie zu überschreiben.

```powershell
.\Deploy-KlToolboxPolicies.ps1                        # alle vier Browser
.\Deploy-KlToolboxPolicies.ps1 -Browsers Chrome,Edge  # Teilmenge
```

## Variante B: GPP-Registrierungseinträge (manuell in der GPO)

Extension-ID: `bcfhfhhmhgklpjodflnakgligkpglpoc` · Firefox-ID: `toolbox@kloeschinski.de`

### Force-Install (Chromium)

| Browser | Schlüssel (HKLM) | Wertname | Typ | Wert |
|---|---|---|---|---|
| Chrome | `SOFTWARE\Policies\Google\Chrome\ExtensionInstallForcelist` | `1`* | REG_SZ | `bcfhfhhmhgklpjodflnakgligkpglpoc;https://clients2.google.com/service/update2/crx` |
| Edge | `SOFTWARE\Policies\Microsoft\Edge\ExtensionInstallForcelist` | `1`* | REG_SZ | gleicher Wert |
| Brave | `SOFTWARE\Policies\BraveSoftware\Brave\ExtensionInstallForcelist` | `1`* | REG_SZ | gleicher Wert |

\* nächste freie Nummer verwenden, falls dort schon andere Erweiterungen stehen.

### Vorgabe-Einstellungen (Chromium, Managed Storage)

| Browser | Schlüssel (HKLM) |
|---|---|
| Chrome | `SOFTWARE\Policies\Google\Chrome\3rdparty\extensions\bcfhfhhmhgklpjodflnakgligkpglpoc\policy` |
| Edge | `SOFTWARE\Policies\Microsoft\Edge\3rdparty\extensions\bcfhfhhmhgklpjodflnakgligkpglpoc\policy` |
| Brave | `SOFTWARE\Policies\BraveSoftware\Brave\3rdparty\extensions\bcfhfhhmhgklpjodflnakgligkpglpoc\policy` |

Jeweils Wertname **`defaultsJson`** (REG_SZ), Inhalt: die
[`releases/kloeschinski-defaults.json`](../releases/kloeschinski-defaults.json)
als **eine Zeile** (das Script erledigt das Komprimieren automatisch).

### Firefox

Schlüssel `SOFTWARE\Policies\Mozilla\Firefox`:

- **`ExtensionSettings`** (REG_SZ) — Achtung, existiert ggf. schon → mergen:
  ```json
  {"toolbox@kloeschinski.de":{"installation_mode":"force_installed","install_url":"https://raw.githubusercontent.com/fkappen/klToolbox/main/releases/kl-toolbox-firefox-v<version>.xpi"}}
  ```
- **Vorgaben**: Schlüssel `SOFTWARE\Policies\Mozilla\Firefox\3rdparty\Extensions\toolbox@kloeschinski.de`,
  Wertname `defaultsJson` (REG_SZ), Inhalt wie bei Chromium.

## Wie die Vorgaben in der Extension wirken

Die Extension liest `defaultsJson` beim Browserstart aus dem Managed Storage
und übernimmt die Schlüssel in die lokalen Einstellungen — **einmal pro
Richtlinien-Stand** (gemerkt über den Inhalt). Benutzer dürfen danach weiter
anpassen; erst wenn der Admin den Richtlinienwert ändert, wird neu übernommen.
API-Keys sind nicht Teil der Defaults und bleiben immer unberührt.

## Prüfen & Stolpersteine

- Kontrolle: `chrome://policy` / `edge://policy` / `brave://policy` („3rd-party“-
  Bereich) bzw. `about:policies` in Firefox; die Extension loggt
  `[Toolbox] GPO-Vorgaben uebernommen` in der Service-Worker-Konsole.
- Browser müssen nach dem Setzen einmal **komplett** neu gestartet werden.
- Chromium-Force-Install lädt aus dem Chrome Web Store → Clients brauchen
  Internet (DATEVnet: Proxy beachtet Invoke-WebRequest, der Browser sowieso).
- Firefox installiert die xpi-Version aus `install_url`; Folge-Updates kommen
  über die `updates.json` des Repos (Update-Kanal ab der auf klToolbox
  signierten Version).
- Brave-`3rdparty`-Durchreichung und das Firefox-`3rdparty`-Registry-Format
  sind plausibel dokumentiert, aber bei uns noch **nicht am lebenden System
  verifiziert** — vor dem Rollout auf einer Testmaschine mit dem Script prüfen.
