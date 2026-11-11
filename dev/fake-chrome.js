// Attrappe der Browser-Erweiterungs-API fuer den Popup-Harness
// (dev/Render-Popup.ps1). DATA setzt das Render-Script ein; alles andere
// sind Leerfunktionen, damit popup.js ohne Browser-Kontext durchlaeuft.
const DATA = /*__DATA__*/{};

window.chrome = {
    storage: {
        local: {
            get: (defs, cb) => {
                const out = {};
                const keys = (defs && typeof defs === "object" && !Array.isArray(defs)) ? Object.keys(defs) : Object.keys(DATA);
                for (const k of keys) {
                    out[k] = (k in DATA) ? DATA[k] : defs[k];
                }
                cb(out);
            },
            set: (obj, cb) => { if (cb) { cb(); } }
        },
        onChanged: { addListener: () => {} }
    },
    runtime: {
        sendMessage: (m, cb) => { if (cb) { cb(); } },
        getURL: (p) => p,
        getManifest: () => ({ permissions: [], version: "0.0.0" }),
        lastError: null,
        openOptionsPage: () => {}
    },
    tabs: {
        create: () => {},
        // Kundenkontext: "demoKontext" aus den Beispieldaten spielt ein offenes Ticket vor
        query: (q, cb) => cb([{ id: 1 }]),
        sendMessage: (id, m, cb) => cb({ ok: true, kontext: DATA.demoKontext || null })
    },
    windows: { getCurrent: (cb) => cb({ incognito: false }), create: () => {} }
};
