// Version
// version = "2.4.0"  (Modul Popup, klToolbox)
// datum   = "2026-09-17"
// autor   = "FK"
//
// Popup am Extension-Icon: Start-Leiste, Schnellzugriffe (Favicons via Web),
// M365-Admin-Links (privates Fenster) und Ticketnummern-Suche.

// DATEV Wissensplattform ist eine oeffentliche Hersteller-URL -> Default ok.
// Ergebnis-Route verifiziert 2026-08-13 (%SUCHE% = Suchbegriff).
const DATEV_SEARCH_DEFAULT = "https://wissensplattform.apps.datev.de/help/search/helpcenter?q=%SUCHE%";

// Popup-Bereiche: frei definierbar (Optionen -> Popup-Bereiche). Neutrale
// Auslieferung: nur die oeffentlichen DATEV-Portale - Firmen-Bereiche
// kommen per Settings-Import.
const DEFAULT_SECTIONS = [
    {
        name: "DATEV",
        links: [
            { name: "MyUpdates", url: "https://apps.datev.de/myupdates" },
            { name: "Tickets", url: "https://apps.datev.de/servicekontakt-online/contacts" },
            { name: "ServiceTAN", url: "https://apps.datev.de/servicekontakt-online/service-tan" },
            { name: "MyPartner", url: "https://apps.datev.de/xrm-mypartner/standorte" },
            { name: "PARTNERasp", url: "https://secure11.datev.de/partneraspkundenportal/" }
        ]
    }
];

// Favicon-Kette: 1. favicon.ico direkt vom Host (erreicht auch interne
// Seiten), 2. Google-Favicon-Dienst, 3. Buchstaben-Kachel.
function attachIcon(btn, url, name) {
    const img = document.createElement("img");
    img.alt = "";
    let origin = null;
    let host = "";
    try {
        const u = new URL(url);
        origin = u.origin;
        host = u.hostname;
    } catch (err) {
        origin = null;
    }

    let stage = 0;
    const letterTile = () => {
        const span = document.createElement("span");
        span.className = "letter";
        span.textContent = (name || "?").charAt(0).toUpperCase();
        btn.replaceChild(span, img);
    };
    img.addEventListener("error", () => {
        stage++;
        if (stage === 1) {
            img.src = "https://www.google.com/s2/favicons?domain=" + encodeURIComponent(host) + "&sz=32";
        } else {
            letterTile();
        }
    });
    if (origin) {
        img.src = origin + "/favicon.ico";
    } else {
        stage = 1;
        img.src = "https://www.google.com/s2/favicons?domain=" + encodeURIComponent(host) + "&sz=32";
    }
    btn.appendChild(img);
}

function makeTile(link, isPrivate) {
    const btn = document.createElement("button");
    btn.className = "tile" + (isPrivate ? " private" : "");
    btn.title = link.url + (isPrivate ? " (privates Fenster)" : "");

    attachIcon(btn, link.url, link.name);

    const span = document.createElement("span");
    span.textContent = link.name;
    btn.appendChild(span);
    btn.addEventListener("click", () => {
        if (isPrivate) {
            openPrivate(link.url);
        } else {
            chrome.tabs.create({ url: link.url });
            window.close();
        }
    });
    return btn;
}

function openPrivate(url) {
    chrome.windows.create({ url: url, incognito: true }, () => {
        if (chrome.runtime.lastError) {
            document.getElementById("hint").textContent =
                "Privates Fenster nicht möglich - bitte erlauben: Brave: brave://extensions -> Details -> \"Im Inkognito-Modus zulassen\"; Firefox: about:addons -> Erweiterung -> \"In privaten Fenstern ausführen\".";
        } else {
            window.close();
        }
    });
}

function render() {
    chrome.storage.local.get({ sections: null }, (items) => {
        const sections = Array.isArray(items.sections) ? items.sections : DEFAULT_SECTIONS;
        const host = document.getElementById("sectionsHost");
        host.textContent = "";

        const startLinks = [];
        let anyLink = false;

        for (const sec of sections) {
            const links = (Array.isArray(sec.links) ? sec.links : []).filter((l) => l && l.url);
            if (!sec || !sec.name || links.length === 0) {
                continue;
            }
            anyLink = true;
            const section = document.createElement("div");
            section.className = "section";
            const h = document.createElement("h2");
            h.textContent = sec.name;
            if (links.some((l) => l.privat === true)) {
                const note = document.createElement("span");
                note.className = "note";
                note.textContent = "gestrichelt = privates Fenster";
                h.appendChild(note);
            }
            section.appendChild(h);

            const grid = document.createElement("div");
            grid.className = "grid";
            for (const link of links) {
                grid.appendChild(makeTile(link, link.privat === true));
                if (link.start === true) {
                    startLinks.push(link);
                }
            }
            section.appendChild(grid);
            host.appendChild(section);
        }

        if (!anyLink) {
            const d = document.createElement("div");
            d.className = "empty";
            d.textContent = "Noch keine Bereiche – in den Optionen anlegen oder Einstellungen importieren.";
            host.appendChild(d);
        }

        // Popups sind auf 600 px Hoehe gedeckelt und duerfen nicht scrollen:
        // passt der Inhalt nicht, Kacheln und Abstaende verdichten
        if (!document.body.classList.contains("panel")) {
            document.body.classList.remove("dense");
            if (document.body.scrollHeight > 600) {
                document.body.classList.add("dense");
            }
        }

        document.getElementById("startBtn").addEventListener("click", () => {
            if (startLinks.length === 0) {
                document.getElementById("hint").textContent = "Keine Start-Seiten markiert (Optionen → Popup-Bereiche).";
                return;
            }
            for (const l of startLinks) {
                chrome.tabs.create({ url: l.url, active: false });
            }
            window.close();
        });
    });
}

// ---------------------------------------------------------------- Einheitliche Suche
// EIN Feld: 5 Ziffern = Kunde, 6 = Ticket, 7 = DATEV-Dokument, sonst Websuche
// (Enter-Ziel konfigurierbar). Der Button wechselt Beschriftung + Farbe.

let defaultSearch = "datev";
let hasTicketUrl = false;
let hasKundenUrl = false;
let hasDatevDoc = true;
const DATEV_DOC_DEFAULT = "https://wissensplattform.apps.datev.de/help/document/%DOKNR%";
const SEARCH_LABELS = { datev: "DATEV", google: "Google", innogpt: "KI" };

// Lucide-Icons (ISC) fuer den dynamischen Such-Button - inline, kein CDN
const SVG_HEAD = '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';
const ICONS = {
    ticket: SVG_HEAD + '<path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M13 5v2"/><path d="M13 17v2"/><path d="M13 11v2"/></svg>',
    user: SVG_HEAD + '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
    "file-text": SVG_HEAD + '<path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>'
};

function setButtonContent(btn, icon, label) {
    btn.textContent = "";
    if (icon && ICONS[icon]) {
        const t = document.createElement("template");
        t.innerHTML = ICONS[icon];
        btn.appendChild(t.content.firstChild);
    }
    btn.appendChild(document.createTextNode(label));
}
const PROVIDER_LABELS = { dgpt: "DeutschlandGPT", innogpt: "InnoGPT", azure: "Azure KI" };

// Farbschema: "auto" (System), "light", "dark" - Optionen -> Darstellung.
// Wirkt ueber html[data-theme] auf color-scheme, die Tokens sind
// light-dark()-Paare. Aenderungen in den Optionen greifen sofort.
function applyTheme(theme) {
    const root = document.documentElement;
    if (theme === "light" || theme === "dark") {
        root.dataset.theme = theme;
    } else {
        delete root.dataset.theme;
    }
}
try {
    chrome.storage.local.get({ theme: "auto" }, (s) => applyTheme(s.theme));
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === "local" && changes.theme) {
            applyTheme(changes.theme.newValue);
        }
    });
} catch (err) {
    console.warn("klToolbox: Farbschema nicht gesetzt:", err);
}

// GPO-Vorgaben ggf. nachziehen (erster Start nach Richtlinien-Installation);
// kommen sie dabei an, wird das Popup einmal neu aufgebaut
try {
    chrome.runtime.sendMessage({ type: "managedDefaultsCheck" }, () => { void chrome.runtime.lastError; });
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === "local" && changes.managedDefaultsApplied) {
            location.reload();
        }
    });
} catch (err) {
    console.warn("klToolbox: Vorgaben-Pruefung nicht angestossen:", err);
}

function classifyQuery(value) {
    // Ticket-/Kunden-Erkennung nur, wenn das jeweilige Linkziel auch
    // konfiguriert ist (neutrale Installation: alles ist Websuche)
    const t = value.trim();
    // Feste Laengen: 5 Ziffern = Kunde, 6 = Ticket, 7 = DATEV-Dokumentnummer.
    if (/^\d{7}$/.test(t) && hasDatevDoc) {
        return "datevdoc";
    }
    if (/^\d{6}$/.test(t) && hasTicketUrl) {
        return "ticket";
    }
    if (/^\d{5}$/.test(t) && hasKundenUrl) {
        return "kunde";
    }
    return "web";
}

function updateSearchGo() {
    const mode = classifyQuery(document.getElementById("searchInput").value);
    const btn = document.getElementById("searchGo");
    const engines = document.querySelector(".search-btns");
    if (mode === "ticket" || mode === "kunde" || mode === "datevdoc") {
        // Nummer erkannt: farbiger Aktions-Button, Suchziele ausblenden
        btn.style.display = "flex";
        engines.style.display = "none";
        if (mode === "ticket") {
            btn.className = "btn-primary";
            setButtonContent(btn, "ticket", "Ticket öffnen");
        } else if (mode === "kunde") {
            btn.className = "btn-primary kunde";
            setButtonContent(btn, "user", "Kunde öffnen");
        } else {
            btn.className = "btn-secondary web";
            setButtonContent(btn, "file-text", "Dokument öffnen");
        }
    } else {
        // Freitext/leer: nur die drei Suchziele (Enter = Standard-Ziel)
        btn.style.display = "none";
        engines.style.display = "flex";
    }
}

function runSearch() {
    const value = document.getElementById("searchInput").value.trim();
    if (!value) {
        document.getElementById("hint").textContent = "Bitte Suchbegriff oder Nummer eingeben.";
        return;
    }
    const mode = classifyQuery(value);
    if (mode === "datevdoc") {
        chrome.storage.local.get({ datevDocTemplate: DATEV_DOC_DEFAULT }, (items) => {
            const tpl = items.datevDocTemplate || DATEV_DOC_DEFAULT;
            chrome.tabs.create({ url: tpl.replace(/%DOKNR%/g, encodeURIComponent(value)) });
            window.close();
        });
        return;
    }
    if (mode === "ticket") {
        chrome.storage.local.get({ linkTemplate: "" }, (items) => {
            if (!items.linkTemplate) {
                document.getElementById("hint").textContent = "Ticketlink-Vorlage fehlt - Einstellungen importieren (Optionen).";
                return;
            }
            chrome.tabs.create({ url: items.linkTemplate.replace(/%TICKETNR%/g, value) });
            window.close();
        });
        return;
    }
    if (mode === "kunde") {
        chrome.storage.local.get({ kundenLinkTemplate: "" }, (items) => {
            if (!items.kundenLinkTemplate) {
                document.getElementById("hint").textContent = "Kundenlink-Vorlage fehlt - Einstellungen importieren (Optionen).";
                return;
            }
            chrome.tabs.create({ url: items.kundenLinkTemplate.replace(/%KDNR%/g, value) });
            window.close();
        });
        return;
    }
    doSearch(defaultSearch);
}

// Branding: Name + Farben kommen per Settings-Import; ohne bleibt es neutral.
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

// Aufhellen Richtung Weiss (0..1) - fuer die hellen Stufen der Primaerfarbe
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

function applyBrand() {
    chrome.storage.local.get({ brandName: "", brandPrimary: "", brandAccent: "", brandIcon: "", brandIconDark: "" }, (items) => {
        const root = document.documentElement;
        if (items.brandIcon) {
            // Marke fuer hell und dunkel; brandIconDark (optional) nur im Dark Mode
            document.querySelector(".brand-light").src = items.brandIcon;
            document.querySelector(".brand-dark").src = items.brandIconDark || items.brandIcon;
        }
        if (items.brandPrimary) {
            // Nur die Basis-Variablen setzen - hell/dunkel leiten die
            // Rollen (Flaeche, Text, Linie) im Stylesheet selbst ab
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
            const parts = items.brandName.split(" ");
            document.getElementById("brandName").textContent = parts[0];
            document.getElementById("brandSub").textContent = parts.slice(1).join(" ");
        }
    });
}

document.addEventListener("DOMContentLoaded", () => {
    // Seitenleisten-Modus: volle Breite + eingebetteter KI-Chat unten
    const isPanel = new URLSearchParams(location.search).has("panel");
    if (isPanel) {
        document.body.classList.add("panel");
        chrome.storage.local.get({
            modChat: true, provider: "dgpt",
            dgptApiKey: "", innogptApiKey: "", azureApiKey: ""
        }, (s) => {
            const keyMap = { dgpt: s.dgptApiKey, innogpt: s.innogptApiKey, azure: s.azureApiKey };
            if (s.modChat !== false && !!(keyMap[s.provider] || "").trim()) {
                document.getElementById("chatFrame").src = chrome.runtime.getURL("chat.html");
            } else {
                document.getElementById("chatFrame").style.display = "none";
            }
        });
        // In der dauerhaften Leiste nicht das Panel schliessen beim Klick:
        // window.close() ist im Side Panel wirkungslos - unkritisch.
    }
    applyBrand();
    render();
    const input = document.getElementById("searchInput");
    input.focus();
    input.addEventListener("input", updateSearchGo);
    input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            runSearch();
        }
    });
    document.getElementById("searchGo").addEventListener("click", runSearch);
    chrome.storage.local.get({ defaultSearch: "datev", linkTemplate: "", kundenLinkTemplate: "", datevDocTemplate: DATEV_DOC_DEFAULT }, (s) => {
        if (SEARCH_LABELS[s.defaultSearch]) {
            defaultSearch = s.defaultSearch;
        }
        hasTicketUrl = !!(s.linkTemplate || "").trim();
        hasKundenUrl = !!(s.kundenLinkTemplate || "").trim();
        hasDatevDoc = !!(s.datevDocTemplate || "").trim();
        // Standard-Ziel markieren (das nimmt auch die Enter-Taste)
        const map = { datev: "sDatev", google: "sGoogle", innogpt: "sInno" };
        for (const id of Object.values(map)) {
            document.getElementById(id).classList.remove("default");
        }
        const target = document.getElementById(map[defaultSearch]);
        if (target) {
            target.classList.add("default");
            target.title += " (Enter)";
        }
        updateSearchGo();
    });
    document.getElementById("sDatev").addEventListener("click", () => doSearch("datev"));
    document.getElementById("sGoogle").addEventListener("click", () => doSearch("google"));
    document.getElementById("sInno").addEventListener("click", () => doSearch("innogpt"));
    document.getElementById("openChat").addEventListener("click", (e) => {
        e.preventDefault();
        chrome.tabs.create({ url: chrome.runtime.getURL("chat.html") });
        window.close();
    });
    document.getElementById("clearData").addEventListener("click", (e) => {
        e.preventDefault();
        openClearBrowsingData();
    });
    document.getElementById("clipPage").addEventListener("click", (e) => {
        e.preventDefault();
        chrome.runtime.sendMessage({ type: "clipPage" });
        window.close();
    });
    chrome.storage.local.get({ modClipper: true }, (s) => {
        if (s.modClipper === false) {
            document.getElementById("clipPage").style.display = "none";
        }
    });
    // Inkognito-Reset nur anbieten, wenn das Popup in einem privaten
    // Fenster geoeffnet wurde (erfordert "Im Inkognito-Modus zulassen").
    chrome.windows.getCurrent((w) => {
        if (w && w.incognito) {
            document.getElementById("resetIncognito").style.display = "inline-flex";
        }
    });
    document.getElementById("resetIncognito").addEventListener("click", (e) => {
        e.preventDefault();
        resetIncognito();
    });
    document.getElementById("openOptions").addEventListener("click", (e) => {
        e.preventDefault();
        chrome.runtime.openOptionsPage();
        window.close();
    });
    document.getElementById("openHelp").addEventListener("click", (e) => {
        e.preventDefault();
        chrome.tabs.create({ url: chrome.runtime.getURL("help.html") });
        window.close();
    });

    // KI-Chat nur zeigen, wenn Modul aktiv UND fuer den gewaehlten Anbieter
    // ein API-Key hinterlegt ist; der dritte Such-Button traegt den Namen
    // des gewaehlten Anbieters (Frage geht an den KI-Chat mit ebendiesem).
    chrome.storage.local.get({
        modChat: true, provider: "dgpt",
        dgptApiKey: "", innogptApiKey: "", azureApiKey: ""
    }, (items) => {
        const keyMap = { dgpt: items.dgptApiKey, innogpt: items.innogptApiKey, azure: items.azureApiKey };
        const chatOk = items.modChat !== false && !!(keyMap[items.provider] || "").trim();
        if (!chatOk) {
            document.getElementById("openChat").style.display = "none";
            document.getElementById("sInno").style.display = "none";
        } else {
            const label = PROVIDER_LABELS[items.provider] || "KI";
            const btn = document.getElementById("sInno");
            btn.textContent = label;
            btn.title = "Im KI-Chat fragen (" + label + ")" + (btn.classList.contains("default") ? " (Enter)" : "");
            SEARCH_LABELS.innogpt = label;
        }
    });
});

// Browser-eigenen "Browserdaten loeschen"-Dialog oeffnen. Extensions
// duerfen chrome://-Seiten zwar nicht lesen, aber per tabs.create oeffnen.
// Firefox erlaubt about:-Seiten nicht -> Hinweis auf das Tastenkuerzel.
function openClearBrowsingData() {
    const ua = navigator.userAgent;
    if (ua.includes("Firefox")) {
        document.getElementById("hint").textContent =
            "Firefox erlaubt das Öffnen der Einstellungen nicht - bitte Strg+Umschalt+Entf drücken.";
        return;
    }
    const url = ua.includes("Edg/")
        ? "edge://settings/clearBrowserData"
        : "chrome://settings/clearBrowserData";
    chrome.tabs.create({ url: url }, () => {
        if (chrome.runtime.lastError) {
            document.getElementById("hint").textContent =
                "Konnte den Dialog nicht öffnen - bitte Strg+Umschalt+Entf drücken.";
        } else {
            window.close();
        }
    });
}

// Freitextsuche: ein Feld, drei Ziele (DATEV / Google / InnoGPT)
function doSearch(target) {
    const term = document.getElementById("searchInput").value.replace(/\s+/g, " ").trim();
    if (!term) {
        document.getElementById("hint").textContent = "Bitte einen Suchbegriff eingeben.";
        return;
    }
    if (target === "google") {
        chrome.tabs.create({ url: "https://www.google.com/search?q=" + encodeURIComponent(term) });
        window.close();
        return;
    }
    if (target === "innogpt") {
        // "KI"-Ziel: Frage im eigenen KI-Chat mit dem KONFIGURIERTEN
        // Anbieter stellen (kein Provider-Override mehr)
        chrome.tabs.create({
            url: chrome.runtime.getURL("chat.html") + "?q=" + encodeURIComponent(term)
        });
        window.close();
        return;
    }
    chrome.storage.local.get({ datevSearchTemplate: DATEV_SEARCH_DEFAULT }, (items) => {
        const tpl = items.datevSearchTemplate || DATEV_SEARCH_DEFAULT;
        chrome.tabs.create({ url: tpl.replace(/%SUCHE%/g, encodeURIComponent(term)) });
        window.close();
    });
}

// Inkognito-Reset: der Background schliesst alle privaten Fenster und
// oeffnet sofort ein frisches - die Sitzung (Cookies, Logins) ist damit
// zurueckgesetzt, ohne dass der Nutzer manuell schliessen/neu oeffnen muss.
function resetIncognito() {
    if (!confirm("Inkognito-Sitzung zurücksetzen?\n\nCookies, Logins und Website-Daten der privaten Sitzung werden verworfen; ein frisches privates Fenster öffnet sich automatisch. Offene private Tabs gehen dabei verloren.")) {
        return;
    }
    chrome.runtime.sendMessage({ type: "resetIncognito" });
}

// Kundensuche: URL-Vorlage kommt per Settings-Import (Platzhalter %KDNR%)
