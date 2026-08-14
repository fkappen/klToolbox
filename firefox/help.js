// Version
// version = "1.0.0"  (Modul Hilfe, klToolbox)
//
// Wendet das Branding (Name/Farben/Logo aus den Settings) auf die
// Hilfe-Seite an; ohne Import bleibt der neutrale Look.

chrome.storage.local.get({ brandName: "", brandPrimary: "", brandAccent: "", brandIcon: "" }, (items) => {
    const root = document.documentElement;
    if (items.brandPrimary) {
        const m = /^#?([0-9a-f]{6})$/i.exec(String(items.brandPrimary).trim());
        root.style.setProperty("--klt-p", items.brandPrimary);
        if (m) {
            const n = parseInt(m[1], 16);
            const f = (v) => Math.max(0, Math.min(255, Math.round(v * 0.8)));
            const d = ((f((n >> 16) & 255) << 16) | (f((n >> 8) & 255) << 8) | f(n & 255));
            root.style.setProperty("--klt-pd", "#" + d.toString(16).padStart(6, "0"));
        }
    }
    if (items.brandAccent) {
        root.style.setProperty("--klt-a", items.brandAccent);
    }
    if (items.brandName) {
        document.getElementById("brandTitle").textContent = items.brandName + " – Hilfe";
    }
    if (items.brandIcon) {
        const img = document.querySelector("h1 img");
        if (img) {
            img.src = items.brandIcon;
        }
        const fav = document.querySelector("link[rel='icon']");
        if (fav) {
            fav.href = items.brandIcon;
        }
    }
});
