# dev/ – Prüf-Harness

Werkzeuge für die Entwicklung. Nichts hiervon landet im Paket (`Build-All.ps1`
verpackt nur `chromium/` bzw. `firefox/`).

## Render-Popup.ps1

Rendert `chromium/popup.html` ohne installierte Erweiterung als Screenshot,
je einmal hell, dunkel und „Automatisch“:

```powershell
.\dev\Render-Popup.ps1
# Ausgabe: dev\out\popup-light.png, popup-dark.png, popup-auto.png
```

Grundlage sind die neutralen Beispieldaten in `sample-settings.json`. Eigene
Einstellungen (etwa der Firmen-Export aus Optionen → Sicherung) kommen nach
`dev/local-settings.json` – die Datei bleibt per `.gitignore` lokal und
überlagert die Beispieldaten. Alternativ `-Settings <datei.json>`.

Der Harness ersetzt die Erweiterungs-API durch `fake-chrome.js` (Attrappe:
Storage liefert die Beispieldaten, alles andere sind Leerfunktionen). Er
braucht einen Chromium-Browser (Edge, Chrome oder Brave werden gesucht,
sonst `-Browser <pfad>`).

Hell und dunkel werden über die Einstellung `theme` der Erweiterung erzwungen,
nicht über Browser-Schalter – die greifen im Headless-Modus nicht zuverlässig.
