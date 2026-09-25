// Version
// version = "1.1.0"  (Modul Hilfe, klToolbox)
// datum   = "2026-09-25"
// autor   = "FK"
//
// Farbschema (Optionen -> Darstellung) und Branding (Name/Farben/Logo aus
// den Settings) auf die Hilfe-Seite anwenden; ohne Import bleibt der
// neutrale Look. Die Tokens sind dieselben wie im Popup.

function shadeColor(hex, pct) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
    if (!m) {
        return hex;
    }
    const n = parseInt(m[1], 16);
    const f = (v) => Math.max(0, Math.min(255, Math.round(v * (1 + pct))));
    const r = f((n >> 16) & 255), g = f((n >> 8) & 255), b = f(n & 255);
    return "#" + ((r << 16) | (g << 8) | b).toString(16).padStart(6, "0");
}

function tintColor(hex, pct) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
    if (!m) {
        return hex;
    }
    const n = parseInt(m[1], 16);
    const f = (v) => Math.max(0, Math.min(255, Math.round(v + (255 - v) * pct)));
    const r = f((n >> 16) & 255), g = f((n >> 8) & 255), b = f(n & 255);
    return "#" + ((r << 16) | (g << 8) | b).toString(16).padStart(6, "0");
}

function applyTheme(theme) {
    const root = document.documentElement;
    if (theme === "light" || theme === "dark") {
        root.dataset.theme = theme;
    } else {
        delete root.dataset.theme;
    }
}

chrome.storage.local.get({ theme: "auto", brandName: "", brandPrimary: "", brandAccent: "", brandIcon: "", brandIconDark: "" }, (items) => {
    const root = document.documentElement;
    applyTheme(items.theme);
    if (items.brandPrimary) {
        root.style.setProperty("--brand-p", items.brandPrimary);
        root.style.setProperty("--brand-p-100", tintColor(items.brandPrimary, 0.9));
        root.style.setProperty("--brand-p-300", tintColor(items.brandPrimary, 0.4));
        root.style.setProperty("--brand-p-600", shadeColor(items.brandPrimary, -0.15));
        root.style.setProperty("--brand-p-700", shadeColor(items.brandPrimary, -0.3));
    }
    if (items.brandAccent) {
        root.style.setProperty("--brand-a", items.brandAccent);
        root.style.setProperty("--brand-a-600", shadeColor(items.brandAccent, -0.14));
    }
    if (items.brandName) {
        document.getElementById("brandTitle").textContent = items.brandName + " – Hilfe";
    }
    if (items.brandIcon) {
        const light = document.querySelector(".brand-light");
        const dark = document.querySelector(".brand-dark");
        if (light) {
            light.src = items.brandIcon;
        }
        if (dark) {
            dark.src = items.brandIconDark || items.brandIcon;
        }
        const fav = document.querySelector("link[rel='icon']");
        if (fav) {
            fav.href = items.brandIcon;
        }
    }
});

chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.theme) {
        applyTheme(changes.theme.newValue);
    }
});
