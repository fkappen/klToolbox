// Version
// version = "2.8.0"  (Modul Popup, klToolbox)
// datum   = "2026-11-11"
// autor   = "FK"
//
// Popup am Extension-Icon: Start-Leiste, Schnellzugriffe (Favicons),
// M365-Admin-Links (privates Fenster) und Ticketnummern-Suche.
//
// Aufbau in EINEM Zug: alle Einstellungen kommen mit einer einzigen
// Storage-Abfrage (vorher elf getrennte, jede verzoegerte den ersten
// Aufbau), danach wird die Oberflaeche synchron gebaut.

// DATEV Wissensplattform ist eine oeffentliche Hersteller-URL -> Default ok.
// Ergebnis-Route verifiziert 2026-08-13 (%SUCHE% = Suchbegriff).
const DATEV_SEARCH_DEFAULT = "https://wissensplattform.apps.datev.de/help/search/helpcenter?q=%SUCHE%";
const DATEV_DOC_DEFAULT = "https://wissensplattform.apps.datev.de/help/document/%DOKNR%";

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

// Alle Schluessel, die das Popup braucht - EINE Abfrage beim Start
const POPUP_DEFAULTS = {
    theme: "auto",
    brandName: "", brandPrimary: "", brandAccent: "", brandIcon: "", brandIconDark: "",
    sections: null,
    defaultSearch: "datev", linkTemplate: "", kundenLinkTemplate: "",
    // Kundenkontext: "Name = URL" je Zeile mit {kundennr}/{kunde}
    kundenZiele: "",
    datevDocTemplate: DATEV_DOC_DEFAULT, datevSearchTemplate: DATEV_SEARCH_DEFAULT,
    modChat: true, modClipper: true, provider: "dgpt",
    dgptApiKey: "", innogptApiKey: "", azureApiKey: "",
    // Favicons: Google-Dienst als letzter Rueckfall erlauben (Optionen)
    faviconExtern: true,
    // je Host, was zuletzt ein Symbol lieferte: { host: [kennung, zeit] }
    faviconMerk: {}
};
let settings = Object.assign({}, POPUP_DEFAULTS);

const SEARCH_LABELS = { datev: "DATEV", google: "Google", innogpt: "KI" };
const PROVIDER_LABELS = { dgpt: "DeutschlandGPT", innogpt: "InnoGPT", azure: "Azure KI" };

// Lucide-Icons (ISC) kommen aus icons.js (klIcon) - inline, kein CDN

function $(id) {
    return document.getElementById(id);
}

function setButtonContent(btn, icon, label) {
    btn.textContent = "";
    const svg = icon ? klIcon(icon, 16) : null;
    if (svg) {
        btn.appendChild(svg);
    }
    btn.appendChild(document.createTextNode(label));
}

// ---------------------------------------------------------------- Favicons
// WICHTIG fuer die Ladezeit: Chromium zeigt ein Popup erst, wenn die Seite
// ihr erstes Laden beendet hat. Jeder Bildabruf, der VOR dem load-Ereignis
// startet, haelt die Anzeige auf - auch per new Image(). Gemessen am
// 2026-10-02: alle Hosts erreichbar = ~300 ms, EIN nicht erreichbarer Host
// (kein VPN, Server in Wartung) = 21 s bis das Popup erscheint.
//
// Deshalb zweistufig:
//  1. VOR load nur der Favicon-Speicher des Browsers (chrome.favicon, lokal,
//     wenige ms; nur Chromium). Liefert er das Standard-Symbol (Seite nie
//     besucht), zaehlt das als "nichts gefunden".
//  2. NACH load - das Popup steht dann schon - das Netz: /favicon.ico vom
//     Host, danach der Google-Dienst (nur wenn in den Optionen erlaubt),
//     jeweils mit Zeitlimit. Bis dahin steht ein Platzhalter in der Kachel,
//     am Ende notfalls der Buchstabe.
// Je Host wird gemerkt, was zuletzt klappte ("f" lokal, "i" favicon.ico,
// "g" Google, "x" nichts) - "x" spart 12 h lang die Netzversuche.
const FAVICON_API = (() => {
    try {
        return (chrome.runtime.getManifest().permissions || []).indexOf("favicon") !== -1;
    } catch (err) {
        return false;
    }
})();
const LOKAL_TIMEOUT_MS = 1500;
const NETZ_TIMEOUT_MS = 4000;
const MERK_OK_MS = 7 * 24 * 3600 * 1000;
const MERK_LEER_MS = 12 * 3600 * 1000;
const merkNeu = {};
let merkTimer = null;

// Netzabrufe duerfen erst starten, wenn der Browser das Popup gezeigt hat
let seiteGeladen = document.readyState === "complete";
const nachLoadWartende = [];
function gibNetzFrei() {
    if (seiteGeladen) {
        return;
    }
    seiteGeladen = true;
    for (const weiter of nachLoadWartende.splice(0)) {
        weiter();
    }
}
function nachDemLaden() {
    return new Promise((resolve) => {
        if (seiteGeladen) {
            resolve();
        } else {
            nachLoadWartende.push(resolve);
        }
    });
}
// einen Takt nach load: erst soll der Browser das Popup zeichnen
window.addEventListener("load", () => setTimeout(gibNetzFrei, 0));
// Sicherheitsnetz, falls load ausbleibt
setTimeout(gibNetzFrei, 5000);

function ladeBild(url, timeoutMs) {
    return new Promise((resolve) => {
        const img = new Image();
        let fertig = false;
        let timer = null;
        const ende = (ok) => {
            if (fertig) {
                return;
            }
            fertig = true;
            clearTimeout(timer);
            resolve(ok && img.naturalWidth > 0 ? img : null);
        };
        timer = setTimeout(() => ende(false), timeoutMs);
        img.addEventListener("load", () => ende(true));
        img.addEventListener("error", () => ende(false));
        img.alt = "";
        img.src = url;
    });
}

function faviconLokalUrl(pageUrl) {
    return chrome.runtime.getURL("/_favicon/") + "?pageUrl=" + encodeURIComponent(pageUrl) + "&size=32";
}

// Kennung eines Bildes (16x16 abgetastet) - zum Erkennen des Standard-
// Symbols. Bilder aus dem eigenen Paket-Ursprung lassen sich auslesen.
function bildSignatur(img) {
    try {
        const c = document.createElement("canvas");
        c.width = 16;
        c.height = 16;
        const ctx = c.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, 16, 16);
        const d = ctx.getImageData(0, 0, 16, 16).data;
        let h = 0;
        for (let i = 0; i < d.length; i++) {
            h = (h * 31 + d[i]) | 0;
        }
        return String(h);
    } catch (err) {
        return null;
    }
}

// Standard-Symbol des Browsers fuer eine garantiert unbekannte Adresse
const globusSignatur = FAVICON_API
    ? ladeBild(faviconLokalUrl("https://kein-symbol.klt.invalid/"), LOKAL_TIMEOUT_MS).then((img) => (img ? bildSignatur(img) : null))
    : Promise.resolve(null);

function gemerkteQuelle(host) {
    const m = settings.faviconMerk;
    if (!m || typeof m !== "object" || !host || !Array.isArray(m[host])) {
        return "";
    }
    const q = String(m[host][0] || "");
    const alter = Date.now() - Number(m[host][1] || 0);
    return alter <= (q === "x" ? MERK_LEER_MS : MERK_OK_MS) ? q : "";
}

function merkeQuelle(host, q) {
    if (!host || gemerkteQuelle(host) === q) {
        return;
    }
    merkNeu[host] = [q, Date.now()];
    clearTimeout(merkTimer);
    merkTimer = setTimeout(() => {
        const alt = (settings.faviconMerk && typeof settings.faviconMerk === "object") ? settings.faviconMerk : {};
        const neu = Object.assign({}, alt, merkNeu);
        settings.faviconMerk = neu;
        try {
            chrome.storage.local.set({ faviconMerk: neu });
        } catch (err) {
            console.warn("klToolbox: Favicon-Quellen nicht gespeichert:", err);
        }
    }, 600);
}

function attachIcon(btn, url, name) {
    let origin = null;
    let host = "";
    try {
        const u = new URL(url);
        origin = u.origin;
        host = u.hostname;
    } catch (err) {
        origin = null;
    }

    // Platzhalter sofort - die Kachel hat damit von Anfang an ihre Groesse
    let aktuell = document.createElement("span");
    aktuell.className = "icon-ph";
    btn.appendChild(aktuell);
    const ersetze = (knoten) => {
        if (aktuell.parentNode === btn) {
            btn.replaceChild(knoten, aktuell);
            aktuell = knoten;
        }
    };
    const buchstabe = () => {
        const span = document.createElement("span");
        span.className = "letter";
        span.textContent = (name || "?").charAt(0).toUpperCase();
        ersetze(span);
    };

    (async () => {
        const gemerkt = gemerkteQuelle(host);

        // 1. lokal (haelt die Anzeige nur Millisekunden auf)
        if (FAVICON_API) {
            const img = await ladeBild(faviconLokalUrl(url), LOKAL_TIMEOUT_MS);
            if (img) {
                const sig = bildSignatur(img);
                const globus = await globusSignatur;
                if (sig === null || globus === null || sig !== globus) {
                    ersetze(img);
                    merkeQuelle(host, "f");
                    return;
                }
            }
        }

        // Zuletzt nichts gefunden: Buchstabe sofort, Netz erst nach Ablauf wieder
        if (gemerkt === "x") {
            buchstabe();
            return;
        }

        // 2. Netz - erst wenn das Popup steht
        await nachDemLaden();
        const netz = [];
        if (origin) {
            netz.push(["i", origin + "/favicon.ico"]);
        }
        if (settings.faviconExtern !== false && host) {
            netz.push(["g", "https://www.google.com/s2/favicons?domain=" + encodeURIComponent(host) + "&sz=32"]);
        }
        if (gemerkt === "g" && netz.length === 2) {
            netz.reverse();
        }
        for (const [kennung, quelle] of netz) {
            const img = await ladeBild(quelle, NETZ_TIMEOUT_MS);
            if (img) {
                ersetze(img);
                merkeQuelle(host, kennung);
                return;
            }
        }
        buchstabe();
        merkeQuelle(host, "x");
    })().catch((err) => {
        console.warn("klToolbox: Kachel-Symbol nicht ladbar:", err);
        buchstabe();
    });
}

// ---------------------------------------------------------------- Kacheln
function makeTile(link, isPrivate) {
    const btn = document.createElement("button");
    btn.className = "tile" + (isPrivate ? " private" : "");
    btn.title = (link.name ? link.name + "\n" : "") + link.url + (isPrivate ? " (privates Fenster)" : "");
    btn.dataset.name = String(link.name || "").toLowerCase();

    // Reihenfolge: gewaehltes Symbol -> Favicon-Kette -> Buchstabe
    const symbol = klIcon(link.icon, 20);
    if (symbol) {
        symbol.setAttribute("class", "sym");
        btn.appendChild(symbol);
    } else {
        attachIcon(btn, link.url, link.name);
    }

    const span = document.createElement("span");
    span.className = "label";
    // Umbruchstellen an Wortfugen anbieten ("Support|Connect", "PARTNER|asp"),
    // damit lange Namen nicht mitten im Wort mit einem Restbuchstaben umbrechen
    const teile = String(link.name || "").split(/(?<=\p{Ll})(?=\p{Lu})|(?<=\p{Lu}{3})(?=\p{Ll}{2})/u);
    teile.forEach((teil, i) => {
        if (i > 0) {
            span.appendChild(document.createElement("wbr"));
        }
        span.appendChild(document.createTextNode(teil));
    });
    btn.appendChild(span);
    if (isPrivate) {
        const priv = klIcon("eye-off", 10);
        if (priv) {
            priv.setAttribute("class", "priv");
            btn.appendChild(priv);
        }
    }
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
            $("hint").textContent =
                "Privates Fenster nicht möglich - bitte erlauben: Brave: brave://extensions -> Details -> \"Im Inkognito-Modus zulassen\"; Firefox: about:addons -> Erweiterung -> \"In privaten Fenstern ausführen\".";
        } else {
            window.close();
        }
    });
}

function render(s) {
    const sections = Array.isArray(s.sections) ? s.sections : DEFAULT_SECTIONS;
    const host = $("sectionsHost");
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
            const auge = klIcon("eye-off", 10);
            if (auge) {
                note.appendChild(auge);
            }
            note.appendChild(document.createTextNode("privates Fenster"));
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

    // Start sitzt als Pille im Kopf - ohne Start-Links ausgeblendet
    $("startBtn").style.display = startLinks.length > 0 ? "flex" : "none";

    // Popups sind auf 600 px Hoehe gedeckelt und duerfen nicht scrollen:
    // passt der Inhalt nicht, Kacheln und Abstaende verdichten
    if (!document.body.classList.contains("panel")) {
        document.body.classList.remove("dense");
        if (document.body.scrollHeight > 600) {
            document.body.classList.add("dense");
        }
    }

    $("startBtn").addEventListener("click", () => {
        if (startLinks.length === 0) {
            $("hint").textContent = "Keine Start-Seiten markiert (Optionen → Popup-Bereiche).";
            return;
        }
        for (const l of startLinks) {
            chrome.tabs.create({ url: l.url, active: false });
        }
        window.close();
    });
}

// ---------------------------------------------------------------- Kundenkontext
// Ist der aktive Tab eine Ticketansicht, liefert das Content-Script Kunde und
// Nummer (Nachricht "ticketKontext"). Das Popup zeigt sie ueber den Bereichen
// mit je einem Knopf pro Ziel: Kundenlink-Vorlage + Liste "Kundenziele".
// Laeuft erst, wenn das Popup steht - haelt die Anzeige nicht auf.
function kundenZiele(s) {
    const ziele = [];
    if ((s.kundenLinkTemplate || "").trim()) {
        ziele.push({ name: "Kunde", url: s.kundenLinkTemplate.trim() });
    }
    for (const zeile of String(s.kundenZiele || "").split(/\r?\n/)) {
        const m = /^([^=]+)=(.+)$/.exec(zeile);
        if (m && m[1].trim() && /^https?:\/\//i.test(m[2].trim())) {
            ziele.push({ name: m[1].trim(), url: m[2].trim() });
        }
    }
    return ziele;
}

function zeigeKontext(k) {
    const host = $("kontext");
    const ziele = kundenZiele(settings);
    if (!k || !k.kundennr || ziele.length === 0) {
        return;
    }
    host.textContent = "";
    const kunde = document.createElement("div");
    kunde.className = "kunde";
    kunde.textContent = k.kundennr + (k.kunde ? " – " + k.kunde : "");
    kunde.title = kunde.textContent + (k.ticketnr ? "\nTicket " + k.ticketnr : "");
    host.appendChild(kunde);
    const reihe = document.createElement("div");
    reihe.className = "ziele";
    for (const z of ziele) {
        const b = document.createElement("button");
        b.textContent = z.name;
        const url = z.url
            .replace(/%KDNR%|\{kundennr\}/gi, encodeURIComponent(k.kundennr))
            .replace(/\{kunde\}/gi, encodeURIComponent(k.kunde || ""));
        b.title = url;
        b.addEventListener("click", () => {
            chrome.tabs.create({ url: url });
            window.close();
        });
        reihe.appendChild(b);
    }
    host.appendChild(reihe);
    host.style.display = "flex";
    if (!document.body.classList.contains("panel") && document.body.scrollHeight > 600) {
        document.body.classList.add("dense");
    }
}

function ladeKontext() {
    try {
        if (!chrome.tabs || typeof chrome.tabs.query !== "function") {
            return;
        }
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (chrome.runtime.lastError || !tabs || !tabs[0] || typeof tabs[0].id !== "number") {
                return;
            }
            chrome.tabs.sendMessage(tabs[0].id, { type: "ticketKontext" }, (res) => {
                // kein Ticket-Tab: kein Empfaenger - das ist der Normalfall
                if (chrome.runtime.lastError || !res || !res.ok) {
                    return;
                }
                zeigeKontext(res.kontext);
            });
        });
    } catch (err) {
        console.warn("klToolbox: Kundenkontext nicht abrufbar:", err);
    }
}

// ---------------------------------------------------------------- Einheitliche Suche
// EIN Feld: 5 Ziffern = Kunde, 6 = Ticket, 7 = DATEV-Dokument, sonst Websuche
// (Enter-Ziel konfigurierbar). Der Button wechselt Beschriftung + Farbe.

let defaultSearch = "datev";
let hasTicketUrl = false;
let hasKundenUrl = false;
let hasDatevDoc = true;

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

// Tippen filtert die Kacheln: ohne erkannte Nummer treten alle Kacheln
// zurueck, deren Name den Text nicht enthaelt. Liefert die passenden Kacheln
// (leer bei leerem Feld oder erkannter Nummer - dann ist kein Filter aktiv).
function filterTiles() {
    const text = $("searchInput").value.trim().toLowerCase();
    const aktiv = text.length > 0 && classifyQuery(text) === "web";
    const treffer = [];
    for (const tile of document.querySelectorAll("#sectionsHost .tile")) {
        const passt = aktiv && (tile.dataset.name || "").indexOf(text) !== -1;
        tile.classList.toggle("dim", aktiv && !passt);
        if (passt) {
            treffer.push(tile);
        }
    }
    return treffer;
}

function updateSearchGo() {
    const nummer = $("searchInput").value.trim();
    const mode = classifyQuery(nummer);
    const btn = $("searchGo");
    const engines = document.querySelector(".search-btns");
    filterTiles();
    if (mode === "ticket" || mode === "kunde" || mode === "datevdoc") {
        // Nummer erkannt: farbiger Aktions-Button, Suchziele ausblenden
        btn.style.display = "flex";
        engines.style.display = "none";
        if (mode === "ticket") {
            btn.className = "btn-primary";
            setButtonContent(btn, "ticket", "Ticket " + nummer + " öffnen");
        } else if (mode === "kunde") {
            btn.className = "btn-primary kunde";
            setButtonContent(btn, "user", "Kunde " + nummer + " öffnen");
        } else {
            btn.className = "btn-secondary web";
            setButtonContent(btn, "file-text", "Dokument " + nummer + " öffnen");
        }
    } else {
        // Freitext/leer: nur die drei Suchziele (Enter = Standard-Ziel)
        btn.style.display = "none";
        engines.style.display = "flex";
    }
}

function runSearch() {
    const value = $("searchInput").value.trim();
    if (!value) {
        $("hint").textContent = "Bitte Suchbegriff oder Nummer eingeben.";
        return;
    }
    const mode = classifyQuery(value);
    if (mode === "datevdoc") {
        const tpl = settings.datevDocTemplate || DATEV_DOC_DEFAULT;
        chrome.tabs.create({ url: tpl.replace(/%DOKNR%/g, encodeURIComponent(value)) });
        window.close();
        return;
    }
    if (mode === "ticket") {
        if (!settings.linkTemplate) {
            $("hint").textContent = "Ticketlink-Vorlage fehlt - Einstellungen importieren (Optionen).";
            return;
        }
        chrome.tabs.create({ url: settings.linkTemplate.replace(/%TICKETNR%/g, value) });
        window.close();
        return;
    }
    if (mode === "kunde") {
        if (!settings.kundenLinkTemplate) {
            $("hint").textContent = "Kundenlink-Vorlage fehlt - Einstellungen importieren (Optionen).";
            return;
        }
        chrome.tabs.create({ url: settings.kundenLinkTemplate.replace(/%KDNR%/g, value) });
        window.close();
        return;
    }
    doSearch(defaultSearch);
}

// Enter im Suchfeld: erkannte Nummer -> oeffnen; passt der Text auf genau
// EINE Kachel -> diese oeffnen; sonst Standard-Suchziel.
function runEnter() {
    const value = $("searchInput").value.trim();
    if (value && classifyQuery(value) === "web") {
        const treffer = filterTiles();
        if (treffer.length === 1) {
            treffer[0].click();
            return;
        }
    }
    runSearch();
}

// Freitextsuche: ein Feld, drei Ziele (DATEV / Google / KI-Chat)
function doSearch(target) {
    const term = $("searchInput").value.replace(/\s+/g, " ").trim();
    if (!term) {
        $("hint").textContent = "Bitte einen Suchbegriff eingeben.";
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
    const tpl = settings.datevSearchTemplate || DATEV_SEARCH_DEFAULT;
    chrome.tabs.create({ url: tpl.replace(/%SUCHE%/g, encodeURIComponent(term)) });
    window.close();
}

function setupSearch(s) {
    const input = $("searchInput");
    input.focus();
    input.addEventListener("input", updateSearchGo);
    input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            runEnter();
        }
    });
    // Fokusring erst nach der ersten Taste zulassen (siehe popup.html)
    // - reine Umschalttasten zaehlen nicht (Bildschirmfoto-Kuerzel, Alt+Tab)
    const nurUmschalter = ["Shift", "Control", "Alt", "AltGraph", "Meta", "OS", "PrintScreen"];
    const merkeTaste = (e) => {
        if (nurUmschalter.indexOf(e.key) !== -1) {
            return;
        }
        document.body.classList.add("kbd");
        document.removeEventListener("keydown", merkeTaste);
    };
    document.addEventListener("keydown", merkeTaste);
    $("searchGo").addEventListener("click", runSearch);
    $("sDatev").addEventListener("click", () => doSearch("datev"));
    $("sGoogle").addEventListener("click", () => doSearch("google"));
    $("sInno").addEventListener("click", () => doSearch("innogpt"));

    if (SEARCH_LABELS[s.defaultSearch]) {
        defaultSearch = s.defaultSearch;
    }
    hasTicketUrl = !!(s.linkTemplate || "").trim();
    hasKundenUrl = !!(s.kundenLinkTemplate || "").trim();
    hasDatevDoc = !!(s.datevDocTemplate || "").trim();
    // Standard-Ziel markieren (das nimmt auch die Enter-Taste)
    const map = { datev: "sDatev", google: "sGoogle", innogpt: "sInno" };
    for (const id of Object.values(map)) {
        $(id).classList.remove("default");
    }
    const target = $(map[defaultSearch]);
    if (target) {
        target.classList.add("default");
        target.title += " (Enter)";
    }
    updateSearchGo();
}

// ---------------------------------------------------------------- Werkzeuge
function chatVerfuegbar(s) {
    // KI-Chat nur, wenn Modul aktiv UND fuer den gewaehlten Anbieter ein
    // API-Key hinterlegt ist
    const keyMap = { dgpt: s.dgptApiKey, innogpt: s.innogptApiKey, azure: s.azureApiKey };
    return s.modChat !== false && !!(keyMap[s.provider] || "").trim();
}

function setupTools(s) {
    $("openChat").addEventListener("click", (e) => {
        e.preventDefault();
        chrome.tabs.create({ url: chrome.runtime.getURL("chat.html") });
        window.close();
    });
    $("clearData").addEventListener("click", (e) => {
        e.preventDefault();
        openClearBrowsingData();
    });
    $("clipPage").addEventListener("click", (e) => {
        e.preventDefault();
        chrome.runtime.sendMessage({ type: "clipPage" });
        window.close();
    });
    if (s.modClipper === false) {
        $("clipPage").style.display = "none";
    }
    // Inkognito-Reset nur anbieten, wenn das Popup in einem privaten
    // Fenster geoeffnet wurde (erfordert "Im Inkognito-Modus zulassen").
    try {
        chrome.windows.getCurrent((w) => {
            if (w && w.incognito) {
                $("resetIncognito").style.display = "inline-flex";
            }
        });
    } catch (err) {
        console.warn("klToolbox: Fensterstatus nicht abrufbar:", err);
    }
    $("resetIncognito").addEventListener("click", (e) => {
        e.preventDefault();
        resetIncognito();
    });
    $("openOptions").addEventListener("click", (e) => {
        e.preventDefault();
        chrome.runtime.openOptionsPage();
        window.close();
    });
    $("openHelp").addEventListener("click", (e) => {
        e.preventDefault();
        chrome.tabs.create({ url: chrome.runtime.getURL("help.html") });
        window.close();
    });

    // Der dritte Such-Button traegt den Namen des gewaehlten Anbieters
    // (Frage geht an den KI-Chat mit ebendiesem).
    if (!chatVerfuegbar(s)) {
        $("openChat").style.display = "none";
        $("sInno").style.display = "none";
    } else {
        const label = PROVIDER_LABELS[s.provider] || "KI";
        const btn = $("sInno");
        btn.textContent = label;
        btn.title = "Im KI-Chat fragen (" + label + ")" + (btn.classList.contains("default") ? " (Enter)" : "");
        SEARCH_LABELS.innogpt = label;
    }
}

// Browser-eigenen "Browserdaten loeschen"-Dialog oeffnen. Extensions
// duerfen chrome://-Seiten zwar nicht lesen, aber per tabs.create oeffnen.
// Firefox erlaubt about:-Seiten nicht -> Hinweis auf das Tastenkuerzel.
function openClearBrowsingData() {
    const ua = navigator.userAgent;
    if (ua.includes("Firefox")) {
        $("hint").textContent =
            "Firefox erlaubt das Öffnen der Einstellungen nicht - bitte Strg+Umschalt+Entf drücken.";
        return;
    }
    const url = ua.includes("Edg/")
        ? "edge://settings/clearBrowserData"
        : "chrome://settings/clearBrowserData";
    chrome.tabs.create({ url: url }, () => {
        if (chrome.runtime.lastError) {
            $("hint").textContent =
                "Konnte den Dialog nicht öffnen - bitte Strg+Umschalt+Entf drücken.";
        } else {
            window.close();
        }
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

// ---------------------------------------------------------------- Darstellung
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

function applyBrand(items) {
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
        $("brandName").textContent = parts[0];
        $("brandSub").textContent = parts.slice(1).join(" ");
    }
    // Ohne Namenszusatz steht die Versionsnummer in der Unterzeile
    if (!$("brandSub").textContent.trim()) {
        let ver = "";
        try {
            ver = chrome.runtime.getManifest().version || "";
        } catch (err) {
            console.warn("klToolbox: Version nicht lesbar:", err);
        }
        $("brandSub").textContent = ver ? "v" + ver : "";
    }
}

// ---------------------------------------------------------------- Start
function init(s) {
    settings = s;
    applyTheme(s.theme);
    applyBrand(s);
    // Seitenleisten-Modus: volle Breite + eingebetteter KI-Chat unten
    if (new URLSearchParams(location.search).has("panel")) {
        document.body.classList.add("panel");
        if (chatVerfuegbar(s)) {
            $("chatFrame").src = chrome.runtime.getURL("chat.html");
        } else {
            $("chatFrame").style.display = "none";
        }
        // In der dauerhaften Leiste nicht das Panel schliessen beim Klick:
        // window.close() ist im Side Panel wirkungslos - unkritisch.
    }
    render(s);
    setupSearch(s);
    setupTools(s);
}

try {
    chrome.storage.local.get(POPUP_DEFAULTS, (s) => {
        const start = () => init(s);
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", start);
        } else {
            start();
        }
    });
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== "local") {
            return;
        }
        if (changes.theme) {
            applyTheme(changes.theme.newValue);
        }
        // GPO-Vorgaben kamen an (erster Start nach Richtlinien-Installation):
        // Popup einmal neu aufbauen
        if (changes.managedDefaultsApplied) {
            location.reload();
        }
    });
    // GPO-Vorgaben ggf. nachziehen - weckt den Hintergrund-Dienst, deshalb
    // erst wenn das Popup steht (teilt sich den Prozess mit dem Popup)
    nachDemLaden().then(() => {
        ladeKontext();
        try {
            chrome.runtime.sendMessage({ type: "managedDefaultsCheck" }, () => { void chrome.runtime.lastError; });
            // Altlast aus 3.43.0 (anderes Format) entfernen
            chrome.storage.local.remove("faviconQuelle");
        } catch (err) {
            console.warn("klToolbox: Vorgaben-Pruefung nicht angestossen:", err);
        }
    });
} catch (err) {
    console.warn("klToolbox: Popup-Start fehlgeschlagen:", err);
}
