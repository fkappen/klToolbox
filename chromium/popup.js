// Version
// version = "2.0.0"  (Modul Popup, klToolbox)
// datum   = "2026-08-13"
// autor   = "Felix Kappen"
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
// Seiten wie PSU/CIPP), 2. Google-Favicon-Dienst, 3. Buchstaben-Kachel.
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
        span.textContent = (name || "?").charAt(0).toUpperCase();
        span.style.cssText = "width:24px;height:24px;border-radius:4px;background:#2b579a;color:#fff;" +
            "display:flex;align-items:center;justify-content:center;font:700 13px/1 system-ui;";
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
            const h = document.createElement("h2");
            h.textContent = sec.name;
            if (links.some((l) => l.privat === true)) {
                const note = document.createElement("span");
                note.style.cssText = "color:#9aa7b0; text-transform:none;";
                note.textContent = " (gestrichelt = privates Fenster)";
                h.appendChild(note);
            }
            host.appendChild(h);

            const grid = document.createElement("div");
            grid.className = "grid";
            for (const link of links) {
                grid.appendChild(makeTile(link, link.privat === true));
                if (link.start === true) {
                    startLinks.push(link);
                }
            }
            host.appendChild(grid);
        }

        if (!anyLink) {
            const d = document.createElement("div");
            d.style.cssText = "color:#9aa7b0; font-size:12px; padding:8px 2px;";
            d.textContent = "Noch keine Bereiche – in den Optionen anlegen oder Einstellungen importieren.";
            host.appendChild(d);
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

// ---------------------------------------------------------------- Ticket-Suche

function openTicket() {
    const raw = document.getElementById("ticketNr").value;
    const nr = raw.replace(/\D/g, "");
    if (!nr) {
        document.getElementById("hint").textContent = "Bitte eine Ticketnummer eingeben.";
        return;
    }
    chrome.storage.local.get({ linkTemplate: "" }, (items) => {
        if (!items.linkTemplate) {
            document.getElementById("hint").textContent = "Ticketlink-Vorlage fehlt - Einstellungen importieren (Optionen).";
            return;
        }
        chrome.tabs.create({ url: items.linkTemplate.replace(/%TICKETNR%/g, nr) });
        window.close();
    });
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

function applyBrand() {
    chrome.storage.local.get({ brandName: "", brandPrimary: "", brandAccent: "", brandIcon: "" }, (items) => {
        const root = document.documentElement;
        if (items.brandIcon) {
            document.querySelector(".brand img").src = items.brandIcon;
        }
        if (items.brandPrimary) {
            root.style.setProperty("--kl-blau", items.brandPrimary);
            root.style.setProperty("--kl-blau-dunkel", shadeColor(items.brandPrimary, -0.2));
        }
        if (items.brandAccent) {
            root.style.setProperty("--kl-gruen", items.brandAccent);
            root.style.setProperty("--kl-gruen-dunkel", shadeColor(items.brandAccent, -0.2));
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
        chrome.storage.local.get({ modChat: true }, (s) => {
            if (s.modChat !== false) {
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
    const input = document.getElementById("ticketNr");
    input.focus();
    input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            openTicket();
        }
    });
    document.getElementById("open").addEventListener("click", openTicket);
    const kdInput = document.getElementById("kundenNr");
    kdInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            openKunde();
        }
    });
    document.getElementById("openKunde").addEventListener("click", openKunde);
    const webInput = document.getElementById("webSuche");
    webInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            doSearch("datev");
        }
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
            document.getElementById("clipSep").style.display = "none";
        }
    });
    // Inkognito-Reset nur anbieten, wenn das Popup in einem privaten
    // Fenster geoeffnet wurde (erfordert "Im Inkognito-Modus zulassen").
    chrome.windows.getCurrent((w) => {
        if (w && w.incognito) {
            document.getElementById("incogSep").style.display = "";
            document.getElementById("resetIncognito").style.display = "";
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

    // Modul "KI-Chat" deaktiviert -> Chat-Link und InnoGPT-Suche ausblenden
    // (die InnoGPT-Suche laeuft ueber dieselbe Chat-Seite)
    chrome.storage.local.get({ modChat: true }, (items) => {
        if (items.modChat === false) {
            document.getElementById("openChat").style.display = "none";
            document.getElementById("chatSep").style.display = "none";
            document.getElementById("sInno").style.display = "none";
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
    const term = document.getElementById("webSuche").value.replace(/\s+/g, " ").trim();
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
        // Kein URL-Suchparameter bei InnoGPT -> eigener KI-Chat mit Override
        chrome.tabs.create({
            url: chrome.runtime.getURL("chat.html") + "?provider=innogpt&q=" + encodeURIComponent(term)
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
function openKunde() {
    const nr = document.getElementById("kundenNr").value.replace(/\D/g, "");
    if (!nr) {
        document.getElementById("hint").textContent = "Bitte eine Kundennummer eingeben.";
        return;
    }
    chrome.storage.local.get({ kundenLinkTemplate: "" }, (items) => {
        if (!items.kundenLinkTemplate) {
            document.getElementById("hint").textContent = "Kundenlink-Vorlage fehlt - Einstellungen importieren (Optionen).";
            return;
        }
        chrome.tabs.create({ url: items.kundenLinkTemplate.replace(/%KDNR%/g, nr) });
        window.close();
    });
}
