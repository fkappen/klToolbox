// Version
// version = "2.0.0"
// datum   = "2026-08-13"
// autor   = "FK"
//
// Kombinierte Options-Seite: KI-Umformulierer, Ticket-Termin, Ticket-Vorlagen.
// Die Storage-Keys entsprechen den frueheren Einzel-Extensions.

// Neutrale Auslieferung: guenstige Modelle, kein Kontext - firmenspezifische
// Vorgaben (kiKontext, Branding, Links) kommen erst per Settings-Import/GPO.
const KI_DEFAULTS = {
    provider: "claude",
    claudeApiKey: "",
    claudeModel: "claude-haiku-4-5",
    openaiApiKey: "",
    openaiModel: "gpt-4o-mini",
    innogptApiKey: "",
    innogptModel: "gpt-5",
    kiKontext: "",
    // Einmalige, ausdrueckliche Zustimmung zur Uebertragung an den
    // KI-Anbieter (CWS-Vorgabe: Offenlegung + Consent in der Oberflaeche)
    kiConsent: false,
    azureEndpoint: "",
    azureDeployment: "",
    azureApiKey: "",
    azureApiVersion: "2024-06-01"
};

// Modell-Auswahl: Dropdown mit Presets (Preisstufe relativ) + "Eigenes
// Modell..." fuer alles, was nicht in der Liste steht. Quelle der Wahrheit
// bleibt das (versteckte) Textfeld - saveKi liest weiterhin nur das Input.
const MODEL_PRESETS = {
    claude: ["claude-haiku-4-5", "claude-sonnet-5", "claude-opus-5", "claude-fable-5"],
    openai: ["gpt-4o-mini", "gpt-4o"],
    innogpt: ["claude-haiku-4-5", "claude-sonnet-5", "claude-opus-5", "claude-fable-5",
        "gpt-5-mini", "gpt-5", "gpt-5.5", "gpt-4o-mini", "gpt-4o",
        "gemini-2.5-flash", "gemini-2.5-pro", "deepseek-v3", "mistral-large-3"]
};

function initModelSelect(prefix) {
    const sel = document.getElementById(prefix + "ModelSel");
    const inp = document.getElementById(prefix + "Model");
    const current = (inp.value || "").trim();
    if (MODEL_PRESETS[prefix].includes(current)) {
        sel.value = current;
        inp.style.display = "none";
    } else {
        sel.value = "__custom";
        inp.style.display = "block";
    }
}

function wireModelSelect(prefix) {
    const sel = document.getElementById(prefix + "ModelSel");
    const inp = document.getElementById(prefix + "Model");
    sel.addEventListener("change", () => {
        if (sel.value === "__custom") {
            inp.style.display = "block";
            inp.focus();
        } else {
            inp.value = sel.value;
            inp.style.display = "none";
        }
    });
}

// Feinschalter fuer die Inline-Erweiterungen im Ticketsystem -
// Checkboxen speichern sofort (wie die Module)
const FT_DEFAULTS = {
    ftTermin: true,
    ftNichtErreicht: true,
    ftAbo: true,
    ftAnfahrt: true,
    ftMakros: true,
    ftWaitBadge: true,
    ftWaitList: true,
    ftVorlagenMail: true,
    ftKiAntwort: true,
    ftVorlagenEintrag: true,
    ftFehlercodes: true
};

// Branding (Name + zwei Farben) kommt per Settings-Import; ohne Import
// bleibt der neutrale Look. Dunkle Variante wird automatisch abgeleitet.
const BRAND_DEFAULTS = { brandName: "", brandPrimary: "", brandAccent: "", brandIcon: "" };

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

function applyBrand(items) {
    // Symmetrisch: leere Werte setzen den neutralen Zustand wieder her
    // (wichtig fuer "Alles zuruecksetzen", solange die Seite offen ist).
    const root = document.documentElement;
    if (items.brandPrimary) {
        root.style.setProperty("--klt-p", items.brandPrimary);
        root.style.setProperty("--klt-pd", shadeColor(items.brandPrimary, -0.2));
    } else {
        root.style.removeProperty("--klt-p");
        root.style.removeProperty("--klt-pd");
    }
    if (items.brandAccent) {
        root.style.setProperty("--klt-a", items.brandAccent);
    } else {
        root.style.removeProperty("--klt-a");
    }
    const t = document.getElementById("brandTitle");
    if (t) {
        t.textContent = (items.brandName ? items.brandName : "klToolbox") + " – Optionen";
    }
    const img = document.querySelector("h1 img");
    if (img) {
        img.src = items.brandIcon ? items.brandIcon : "icon32.png";
    }
}

// Kompletter Reset in den neutralen Auslieferungszustand - inkl. Widerruf
// der Ticketsystem-Berechtigung. Hinweis: Sind GPO-Vorgaben (Managed
// Storage) aktiv, werden diese beim naechsten Browserstart neu uebernommen.
function resetAllSettings() {
    if (!confirm("Wirklich ALLE Einstellungen zurücksetzen?\n\nEntfernt werden: API-Keys, Links, Vorlagen, Branding und die Ticketsystem-Konfiguration samt Website-Berechtigung. Die Extension ist danach wieder im neutralen Auslieferungszustand.")) {
        return;
    }
    chrome.storage.local.get({ linkTemplate: "" }, (items) => {
        let origin = null;
        try {
            origin = new URL(items.linkTemplate).origin;
        } catch (err) {
            origin = null;
        }
        const finish = () => {
            chrome.storage.local.clear(() => {
                // background raeumt auf: Ticket-Scripts deregistrieren,
                // Toolbar-Icon zurueck auf neutral (via storage.onChanged)
                chrome.runtime.sendMessage({ type: "syncTicketScripts" }, () => {
                    flashStatus("statusSettings");
                    loadAll();
                    updateHostPermissionUi();
                });
            });
        };
        if (origin) {
            chrome.permissions.remove({ origins: [origin + "/*"] }, finish);
        } else {
            finish();
        }
    });
}

const TERMIN_DEFAULTS = {
    subjectTemplate: "%KUNDE% - %TICKETNR% - %BEZEICHNUNG%",
    bodyTemplate: "Ansprechpartner: %ANSPRECHPARTNER%\nTelefon: %TELEFON%\nE-Mail: %EMAIL%\n\nTicket: %TICKETLINK%",
    linkTemplate: "",
    kundenLinkTemplate: "",
    datevSearchTemplate: "https://wissensplattform.apps.datev.de/help/search/helpcenter?q=%SUCHE%",
    selBezeichnung: "input.css-uzb1jv",
    selAnsprechpartner: "input.css-4utdaq",
    defaultDurationMin: 60,
    autoStatus: true,
    nichtErreichtText: "Nicht erreicht.",
    firmenAdresse: "",
    defaultTerminart: "telefon"
};

// Module (abschaltbare Funktionsbereiche) - Checkboxen speichern sofort
const MODULE_DEFAULTS = {
    modKi: true,
    modSuche: true,
    modTicket: true,
    modCleaner: true,
    modChat: true,
    modClipper: true
};

// Popup-Bereiche: frei definierbar (Name + Links mit Start-/Privat-Haken).
// Neutrale Auslieferung: nur die oeffentlichen DATEV-Portale - Firmen-
// Bereiche kommen per Settings-Import.
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

let templates = [];
let sections = [];
let kiActions = [];
let makros = [];
let entryTemplates = [];

// ---------------------------------------------------------------- Laden

function loadAll() {
    chrome.storage.local.get(Object.assign({}, KI_DEFAULTS, TERMIN_DEFAULTS, MODULE_DEFAULTS, BRAND_DEFAULTS, FT_DEFAULTS, {
        sidebarMode: false,
        defaultSearch: "datev",
        templates: [],
        entryTemplates: [],
        sections: null,
        cleanerWhitelist: [],
        customKiActions: [],
        makros: []
    }), (items) => {
        applyBrand(items);
        kiActions = Array.isArray(items.customKiActions) ? items.customKiActions : [];
        renderKiActions();
        makros = Array.isArray(items.makros) ? items.makros : [];
        renderMakros();
        entryTemplates = Array.isArray(items.entryTemplates) ? items.entryTemplates : [];
        renderEntryTemplates();
        renderStatus();
        // Module + Feinschalter
        for (const key of Object.keys(MODULE_DEFAULTS)) {
            document.getElementById(key).checked = items[key] !== false;
        }
        for (const key of Object.keys(FT_DEFAULTS)) {
            document.getElementById(key).checked = items[key] !== false;
        }
        document.getElementById("sidebarMode").checked = items.sidebarMode === true;
        document.getElementById("defaultSearch").value = ["datev", "google", "innogpt"].includes(items.defaultSearch) ? items.defaultSearch : "datev";
        // Cleaner-Whitelist (Array -> eine Zeile pro Eintrag)
        document.getElementById("cleanerWhitelist").value =
            (Array.isArray(items.cleanerWhitelist) ? items.cleanerWhitelist : []).join("\n");
        // KI
        document.querySelector('input[name="provider"][value="' + items.provider + '"]').checked = true;
        document.getElementById("claudeApiKey").value = items.claudeApiKey;
        document.getElementById("claudeModel").value = items.claudeModel;
        document.getElementById("openaiApiKey").value = items.openaiApiKey;
        document.getElementById("openaiModel").value = items.openaiModel;
        document.getElementById("innogptApiKey").value = items.innogptApiKey;
        document.getElementById("innogptModel").value = items.innogptModel;
        initModelSelect("claude");
        initModelSelect("openai");
        initModelSelect("innogpt");
        document.getElementById("azureEndpoint").value = items.azureEndpoint;
        document.getElementById("azureDeployment").value = items.azureDeployment;
        document.getElementById("azureApiKey").value = items.azureApiKey;
        document.getElementById("azureApiVersion").value = items.azureApiVersion;
        renderUsage();
        renderBackups();
        document.getElementById("kiKontext").value = items.kiKontext;
        document.getElementById("kiConsent").checked = items.kiConsent === true;
        // Termin
        document.getElementById("subjectTemplate").value = items.subjectTemplate;
        document.getElementById("bodyTemplate").value = items.bodyTemplate;
        document.getElementById("linkTemplate").value = items.linkTemplate;
        document.getElementById("kundenLinkTemplate").value = items.kundenLinkTemplate;
        document.getElementById("datevSearchTemplate").value = items.datevSearchTemplate;
        document.getElementById("selBezeichnung").value = items.selBezeichnung;
        document.getElementById("selAnsprechpartner").value = items.selAnsprechpartner;
        document.getElementById("defaultDurationMin").value = String(items.defaultDurationMin);
        document.getElementById("autoStatus").checked = items.autoStatus !== false;
        document.getElementById("nichtErreichtText").value = items.nichtErreichtText;
        document.getElementById("firmenAdresse").value = items.firmenAdresse;
        document.getElementById("defaultTerminart").value = items.defaultTerminart;
        // Vorlagen
        templates = Array.isArray(items.templates) ? items.templates : [];
        renderTemplates();
        // Popup-Bereiche
        sections = Array.isArray(items.sections)
            ? items.sections
            : JSON.parse(JSON.stringify(DEFAULT_SECTIONS));
        renderSections();
    });
}

function flashStatus(id) {
    const el = document.getElementById(id);
    el.textContent = "Gespeichert ✓";
    setTimeout(() => { el.textContent = ""; }, 2000);
}

// ---------------------------------------------------------------- KI

function saveKi() {
    const consent = document.getElementById("kiConsent").checked;
    const anyKey = document.getElementById("claudeApiKey").value.trim() ||
        document.getElementById("openaiApiKey").value.trim() ||
        document.getElementById("innogptApiKey").value.trim();
    if (anyKey && !consent) {
        alert("Bitte zuerst der Datenübertragung an den KI-Anbieter zustimmen (Häkchen oben im KI-Bereich) - ohne Zustimmung bleiben die KI-Funktionen deaktiviert.");
    }
    const cleanActions = kiActions
        .map((a) => ({ name: (a.name || "").trim(), prompt: (a.prompt || "").trim() }))
        .filter((a) => a.name.length > 0 && a.prompt.length > 0);
    kiActions = cleanActions;
    chrome.storage.local.set({
        kiConsent: consent,
        provider: document.querySelector('input[name="provider"]:checked').value,
        claudeApiKey: document.getElementById("claudeApiKey").value.trim(),
        claudeModel: document.getElementById("claudeModel").value.trim() || KI_DEFAULTS.claudeModel,
        openaiApiKey: document.getElementById("openaiApiKey").value.trim(),
        openaiModel: document.getElementById("openaiModel").value.trim() || KI_DEFAULTS.openaiModel,
        innogptApiKey: document.getElementById("innogptApiKey").value.trim(),
        innogptModel: document.getElementById("innogptModel").value.trim() || KI_DEFAULTS.innogptModel,
        azureEndpoint: document.getElementById("azureEndpoint").value.trim(),
        azureDeployment: document.getElementById("azureDeployment").value.trim(),
        azureApiKey: document.getElementById("azureApiKey").value.trim(),
        azureApiVersion: document.getElementById("azureApiVersion").value.trim() || KI_DEFAULTS.azureApiVersion,
        kiKontext: document.getElementById("kiKontext").value.trim(),
        customKiActions: cleanActions
    }, () => {
        flashStatus("statusKi");
        renderKiActions();
    });
}

// ---------------------------------------------------------------- Auto-Backup / Restore

function renderBackups() {
    chrome.storage.local.get({ configBackups: [] }, (s) => {
        const sel = document.getElementById("backupSel");
        sel.textContent = "";
        const backups = Array.isArray(s.configBackups) ? s.configBackups : [];
        if (backups.length === 0) {
            const opt = document.createElement("option");
            opt.value = "";
            opt.textContent = "Noch keine automatische Sicherung vorhanden";
            sel.appendChild(opt);
            document.getElementById("backupRestore").disabled = true;
            return;
        }
        document.getElementById("backupRestore").disabled = false;
        backups.forEach((b) => {
            const opt = document.createElement("option");
            opt.value = String(b.ts);
            opt.textContent = new Date(b.ts).toLocaleString("de-DE", {
                day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit"
            }) + " Uhr (" + Object.keys(b.data || {}).length + " Einstellungen)";
            sel.appendChild(opt);
        });
    });
}

function restoreBackup() {
    const ts = Number(document.getElementById("backupSel").value);
    if (!ts) {
        return;
    }
    chrome.storage.local.get({ configBackups: [] }, (s) => {
        const backup = (Array.isArray(s.configBackups) ? s.configBackups : []).find((b) => b && b.ts === ts);
        if (!backup || !backup.data) {
            alert("Sicherung nicht gefunden.");
            return;
        }
        const when = new Date(backup.ts).toLocaleString("de-DE");
        if (!confirm("Konfiguration auf den Stand vom " + when + " zurücksetzen?\n\nDie aktuellen Einstellungen werden mit der Sicherung überschrieben (Chat-Verlauf und Statistik bleiben unberührt).")) {
            return;
        }
        chrome.storage.local.set(backup.data, () => {
            flashStatus("statusBackup");
            loadAll();
            updateHostPermissionUi();
        });
    });
}

// ---------------------------------------------------------------- Token-Statistik

// Preisliste in EUR je 1 Mio. Tokens [Eingabe, Ausgabe] - Richtwerte
// (Stand 08/2026, Basis InnoGPT-Preisliste; die APIs liefern keine Preise).
// Match: exakte Modell-ID oder als Teilstring (deckt Azure-Deployment-Namen
// wie "gpt-4o-mini-prod" ab).
const PRICE_TABLE = {
    "claude-haiku-4-5": [1.11, 5.57],
    "claude-sonnet-5": [3.34, 16.70],
    "claude-opus-5": [5.57, 27.83],
    "claude-fable-5": [11.13, 55.66],
    "gpt-4o-mini": [0.17, 0.65],
    "gpt-4o": [2.98, 11.94],
    "gpt-5.5": [4.68, 28.05],
    "gpt-5-mini": [0.26, 2.06],
    "gpt-5": [1.29, 10.29],
    "gemini-2.5-flash": [0.47, 2.82],
    "gemini-2.5-pro": [1.18, 9.37],
    "deepseek-v3": [0.20, 1.01],
    "mistral-large-3": [0.51, 1.52]
};

// Azure OpenAI: verifizierte EUR-Listenpreise aus der Azure Retail Prices API
// (prices.azure.com, Global-Standard-Deployment, Region Sweden Central, Stand 08/2026).
const AZURE_PRICE_TABLE = {
    "gpt-4o-mini": [0.10, 0.50],
    "gpt-4o": [2.20, 8.78],
    "gpt-4.1-mini": [0.40, 1.40],
    "gpt-4.1-nano": [0.10, 0.40],
    "gpt-4.1": [1.80, 7.00],
    "gpt-5-mini": [0.22, 1.76],
    "gpt-5-nano": [0.04, 0.35],
    "gpt-5-chat": [1.10, 8.78],
    "gpt-5.1": [1.10, 8.78],
    "gpt-5.2": [1.54, 12.29],
    "gpt-5.5": [4.39, 26.33],
    "gpt-5": [1.10, 8.78],
    "o3": [1.80, 7.00],
    "o4-mini": [1.00, 3.90]
};

function matchPrice(table, m) {
    if (table[m]) {
        return table[m];
    }
    // Teilstring-Match: laengste passende ID gewinnt (gpt-4o-mini vor gpt-4o;
    // deckt Azure-Deployment-Namen wie "gpt-4o-mini-prod"). Kurze Keys (<4
    // Zeichen, z. B. "o3") nur exakt, sonst falsche Treffer in anderen Namen.
    let best = null;
    for (const key of Object.keys(table)) {
        if (key.length >= 4 && m.indexOf(key) !== -1 && (!best || key.length > best.length)) {
            best = key;
        }
    }
    return best ? table[best] : null;
}

function priceFor(model, provider) {
    const m = String(model || "").toLowerCase();
    if (!m) {
        return null;
    }
    if (provider === "azure") {
        const p = matchPrice(AZURE_PRICE_TABLE, m);
        if (p) {
            return p;
        }
    }
    return matchPrice(PRICE_TABLE, m);
}

function renderUsage() {
    chrome.storage.local.get({
        kiUsage: [],
        claudeModel: "claude-haiku-4-5", openaiModel: "gpt-4o-mini",
        innogptModel: "gpt-5", azureDeployment: ""
    }, (s) => {
        const events = Array.isArray(s.kiUsage) ? s.kiUsage : [];
        // Alt-Events ohne Modellangabe: aktuelles Modell des Anbieters als Schaetzung
        const providerModel = { claude: s.claudeModel, openai: s.openaiModel, innogpt: s.innogptModel, azure: s.azureDeployment };
        const now = Date.now();
        const fmt = (n) => n.toLocaleString("de-DE");
        const fmtEur = (v) => (v > 0 && v < 0.005)
            ? "< 0,01 €"
            : v.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
        const windows = [
            ["24 Stunden", 1],
            ["7 Tage", 7],
            ["30 Tage", 30],
            ["1 Jahr", 365]
        ];
        const body = document.getElementById("usageBody");
        body.textContent = "";
        for (const [label, days] of windows) {
            const cutoff = now - days * 24 * 3600 * 1000;
            let calls = 0;
            let tokIn = 0;
            let tokOut = 0;
            let cost = 0;
            for (const e of events) {
                if (e && e.ts >= cutoff) {
                    calls++;
                    tokIn += e.i || 0;
                    tokOut += e.o || 0;
                    const price = priceFor(e.m || providerModel[e.p] || "", e.p);
                    if (price) {
                        cost += (e.i || 0) / 1e6 * price[0] + (e.o || 0) / 1e6 * price[1];
                    }
                }
            }
            const tr = document.createElement("tr");
            const cells = [label, fmt(calls), fmt(tokIn), fmt(tokOut), fmt(tokIn + tokOut), fmtEur(cost)];
            cells.forEach((text, i) => {
                const td = document.createElement("td");
                td.textContent = text;
                td.style.cssText = i === 0
                    ? "padding:4px 8px 4px 0; font-weight:600;"
                    : "padding:4px 8px; text-align:right;" + (i === 5 ? " font-weight:600;" : "");
                tr.appendChild(td);
            });
            body.appendChild(tr);
        }
    });
}

// ---------------------------------------------------------------- Eigene KI-Aktionen

function renderKiActions() {
    const list = document.getElementById("kiActionList");
    list.textContent = "";
    kiActions.forEach((a, i) => {
        const box = document.createElement("div");
        box.className = "tpl";

        const name = document.createElement("input");
        name.type = "text";
        name.placeholder = "Name im Kontextmenü, z. B. „In Stichpunkte“";
        name.value = a.name || "";
        name.addEventListener("input", () => { kiActions[i].name = name.value; });

        const prompt = document.createElement("textarea");
        prompt.style.minHeight = "60px";
        prompt.placeholder = "Aufgabe für die KI, z. B. „Fasse den Text in knappen Stichpunkten zusammen.“";
        prompt.value = a.prompt || "";
        prompt.addEventListener("input", () => { kiActions[i].prompt = prompt.value; });

        const row = document.createElement("div");
        row.className = "row";
        const del = document.createElement("button");
        del.className = "danger";
        del.textContent = "Löschen";
        del.addEventListener("click", () => {
            kiActions.splice(i, 1);
            renderKiActions();
        });
        row.appendChild(del);

        box.appendChild(name);
        box.appendChild(prompt);
        box.appendChild(row);
        list.appendChild(box);
    });
}

// ---------------------------------------------------------------- Eintrags-Vorlagen

function renderEntryTemplates() {
    const list = document.getElementById("entryTplList");
    list.textContent = "";
    entryTemplates.forEach((t, i) => {
        const box = document.createElement("div");
        box.className = "tpl";

        const name = document.createElement("input");
        name.type = "text";
        name.placeholder = "Name der Eintrags-Vorlage";
        name.value = t.name || "";
        name.addEventListener("input", () => { entryTemplates[i].name = name.value; });

        const text = document.createElement("textarea");
        text.style.minHeight = "60px";
        text.placeholder = "Eintragstext… ({datum}/{zeit} möglich)";
        text.value = t.text || "";
        text.addEventListener("input", () => { entryTemplates[i].text = text.value; });

        const row = document.createElement("div");
        row.className = "row";
        const del = document.createElement("button");
        del.className = "danger";
        del.textContent = "Löschen";
        del.addEventListener("click", () => {
            entryTemplates.splice(i, 1);
            renderEntryTemplates();
        });
        row.appendChild(del);

        box.appendChild(name);
        box.appendChild(text);
        box.appendChild(row);
        list.appendChild(box);
    });
}

function saveEntryTemplates() {
    const clean = entryTemplates
        .map((t) => ({ name: (t.name || "").trim(), text: (t.text || "").trim() }))
        .filter((t) => t.name.length > 0 && t.text.length > 0);
    entryTemplates = clean;
    // Leere Liste speichern = beim naechsten Oeffnen laden die Defaults neu
    chrome.storage.local.set({ entryTemplates: clean }, () => {
        flashStatus("statusEntryTpl");
        renderEntryTemplates();
    });
}

// ---------------------------------------------------------------- Aktions-Makros

function renderMakros() {
    const list = document.getElementById("makroList");
    list.textContent = "";
    makros.forEach((m, i) => {
        const box = document.createElement("div");
        box.className = "tpl";

        const name = document.createElement("input");
        name.type = "text";
        name.placeholder = "Makro-Name, z. B. „Nicht erreicht + wiedervorlegen“";
        name.value = m.name || "";
        name.addEventListener("input", () => { makros[i].name = name.value; });

        const eintrag = document.createElement("textarea");
        eintrag.style.minHeight = "60px";
        eintrag.placeholder = "Eintragstext (optional, {datum}/{zeit} möglich)";
        eintrag.value = m.eintrag || "";
        eintrag.addEventListener("input", () => { makros[i].eintrag = eintrag.value; });

        const row = document.createElement("div");
        row.className = "mk-row";

        const status = document.createElement("input");
        status.type = "text";
        status.style.flex = "1";
        status.placeholder = "Status setzen (optional, exakter Dropdown-Text)";
        status.value = m.status || "";
        status.addEventListener("input", () => { makros[i].status = status.value; });

        const aboLabel = document.createElement("label");
        const abo = document.createElement("input");
        abo.type = "checkbox";
        abo.checked = m.abonnieren === true;
        abo.addEventListener("change", () => { makros[i].abonnieren = abo.checked; });
        aboLabel.appendChild(abo);
        aboLabel.appendChild(document.createTextNode(" Abonnieren"));

        const closeLabel = document.createElement("label");
        const closeCb = document.createElement("input");
        closeCb.type = "checkbox";
        closeCb.checked = m.schliessen === true;
        closeCb.addEventListener("change", () => { makros[i].schliessen = closeCb.checked; });
        closeLabel.appendChild(closeCb);
        closeLabel.appendChild(document.createTextNode(" Ticket-Fenster danach schließen"));

        const del = document.createElement("button");
        del.className = "danger";
        del.textContent = "Löschen";
        del.addEventListener("click", () => {
            makros.splice(i, 1);
            renderMakros();
        });

        row.appendChild(status);
        row.appendChild(aboLabel);
        row.appendChild(closeLabel);
        row.appendChild(del);

        box.appendChild(name);
        box.appendChild(eintrag);
        box.appendChild(row);
        list.appendChild(box);
    });
}

function saveMakros() {
    const clean = makros
        .map((m) => ({
            name: (m.name || "").trim(),
            eintrag: (m.eintrag || "").trim(),
            status: (m.status || "").trim(),
            abonnieren: m.abonnieren === true,
            schliessen: m.schliessen === true
        }))
        .filter((m) => m.name.length > 0 && (m.eintrag.length > 0 || m.status.length > 0 || m.abonnieren || m.schliessen));
    makros = clean;
    chrome.storage.local.set({ makros: clean }, () => {
        flashStatus("statusMakro");
        renderMakros();
    });
}

// ---------------------------------------------------------------- Status-Uebersicht

function renderStatus() {
    const list = document.getElementById("statusList");
    const row = (ok, label, detail) => {
        const d = document.createElement("div");
        const mark = document.createElement("span");
        mark.className = ok ? "ok" : "warn";
        mark.textContent = ok ? "✓" : "✗";
        d.appendChild(mark);
        d.appendChild(document.createTextNode(label + (detail ? " – " + detail : "")));
        list.appendChild(d);
    };
    list.textContent = "";

    chrome.storage.local.get(Object.assign({}, KI_DEFAULTS, MODULE_DEFAULTS, {
        linkTemplate: "", brandName: ""
    }), (s) => {
        const version = chrome.runtime.getManifest().version;
        row(true, "klToolbox v" + version);

        const keyMap = { claude: s.claudeApiKey, openai: s.openaiApiKey, innogpt: s.innogptApiKey, azure: s.azureApiKey };
        const hasKey = !!(keyMap[s.provider] || "").trim();
        row(hasKey, "KI-Anbieter: " + s.provider, hasKey ? "API-Key hinterlegt" : "kein API-Key hinterlegt");
        row(s.kiConsent === true, "KI-Datenübertragung", s.kiConsent === true ? "Zustimmung erteilt" : "Zustimmung fehlt (KI-Funktionen deaktiviert)");

        let origin = null;
        try {
            origin = new URL(s.linkTemplate).origin;
        } catch (err) {
            origin = null;
        }
        if (!origin) {
            row(false, "Ticketsystem", "nicht konfiguriert (Einstellungen importieren)");
            finishStatus(list, row, s);
        } else {
            chrome.permissions.contains({ origins: [origin + "/*"] }, (granted) => {
                row(granted, "Ticketsystem: " + new URL(origin).hostname,
                    granted ? "Zugriff erteilt, Module aktiv" : "Zugriff NICHT erteilt (Button unter Sicherung)");
                finishStatus(list, row, s);
            });
        }
    });
}

function finishStatus(list, row, s) {
    const modKeys = Object.keys(MODULE_DEFAULTS);
    const active = modKeys.filter((k) => s[k] !== false).length;
    row(active > 0, "Module: " + active + " von " + modKeys.length + " aktiv");
    row(!!s.brandName, "Branding", s.brandName ? "„" + s.brandName + "“ importiert" : "neutral (keine Vorgaben importiert)");
    // GPO-Vorgaben (Managed Storage) - Firefox wirft ohne Richtlinie einen Fehler
    try {
        chrome.storage.managed.get(null, (items) => {
            const hasGpo = !chrome.runtime.lastError && items && typeof items.defaultsJson === "string" && items.defaultsJson.length > 0;
            row(true, "GPO-Vorgaben: " + (hasGpo ? "aktiv (Managed Storage)" : "keine"));
        });
    } catch (err) {
        row(true, "GPO-Vorgaben: keine");
    }
}

// ---------------------------------------------------------------- Termin

function saveTermin() {
    chrome.storage.local.set({
        subjectTemplate: document.getElementById("subjectTemplate").value.trim() || TERMIN_DEFAULTS.subjectTemplate,
        bodyTemplate: document.getElementById("bodyTemplate").value || TERMIN_DEFAULTS.bodyTemplate,
        linkTemplate: document.getElementById("linkTemplate").value.trim(),
        kundenLinkTemplate: document.getElementById("kundenLinkTemplate").value.trim(),
        datevSearchTemplate: document.getElementById("datevSearchTemplate").value.trim() || TERMIN_DEFAULTS.datevSearchTemplate,
        selBezeichnung: document.getElementById("selBezeichnung").value.trim() || TERMIN_DEFAULTS.selBezeichnung,
        selAnsprechpartner: document.getElementById("selAnsprechpartner").value.trim() || TERMIN_DEFAULTS.selAnsprechpartner,
        defaultDurationMin: Number(document.getElementById("defaultDurationMin").value) || TERMIN_DEFAULTS.defaultDurationMin,
        autoStatus: document.getElementById("autoStatus").checked,
        nichtErreichtText: document.getElementById("nichtErreichtText").value.trim() || TERMIN_DEFAULTS.nichtErreichtText,
        firmenAdresse: document.getElementById("firmenAdresse").value.trim(),
        defaultTerminart: document.getElementById("defaultTerminart").value
    }, () => flashStatus("statusTermin"));
}

// ---------------------------------------------------------------- Vorlagen

function renderTemplates() {
    const list = document.getElementById("tplList");
    list.textContent = "";

    templates.forEach((t, i) => {
        const box = document.createElement("div");
        box.className = "tpl";

        const name = document.createElement("input");
        name.type = "text";
        name.placeholder = "Name der Vorlage";
        name.value = t.name || "";
        name.addEventListener("input", () => { templates[i].name = name.value; });

        const text = document.createElement("textarea");
        text.placeholder = "Vorlagentext…";
        text.value = t.text || "";
        text.addEventListener("input", () => { templates[i].text = text.value; });

        const row = document.createElement("div");
        row.className = "row";

        const moveWrap = document.createElement("div");
        const up = document.createElement("button");
        up.className = "secondary";
        up.textContent = "↑";
        up.addEventListener("click", () => { moveTemplate(i, -1); });
        const down = document.createElement("button");
        down.className = "secondary";
        down.textContent = "↓";
        down.style.marginLeft = "6px";
        down.addEventListener("click", () => { moveTemplate(i, 1); });
        moveWrap.appendChild(up);
        moveWrap.appendChild(down);

        const del = document.createElement("button");
        del.className = "danger";
        del.textContent = "Löschen";
        del.addEventListener("click", () => {
            templates.splice(i, 1);
            renderTemplates();
        });

        row.appendChild(moveWrap);
        row.appendChild(del);
        box.appendChild(name);
        box.appendChild(text);
        box.appendChild(row);
        list.appendChild(box);
    });
}

function moveTemplate(i, dir) {
    const j = i + dir;
    if (j < 0 || j >= templates.length) {
        return;
    }
    const tmp = templates[i];
    templates[i] = templates[j];
    templates[j] = tmp;
    renderTemplates();
}

function saveTemplates() {
    const clean = templates
        .map((t) => ({ name: (t.name || "").trim(), text: t.text || "" }))
        .filter((t) => t.name.length > 0 || t.text.trim().length > 0);
    templates = clean;
    chrome.storage.local.set({ templates: clean }, () => {
        flashStatus("statusTpl");
        renderTemplates();
    });
}

function exportTemplates() {
    const blob = new Blob([JSON.stringify(templates, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "ticket-vorlagen.json";
    a.click();
    URL.revokeObjectURL(a.href);
}

function importTemplates(file) {
    const reader = new FileReader();
    reader.onload = () => {
        try {
            const data = JSON.parse(String(reader.result));
            if (!Array.isArray(data)) {
                throw new Error("JSON muss ein Array sein.");
            }
            const valid = data.filter((t) => t && typeof t.name === "string" && typeof t.text === "string");
            if (valid.length === 0) {
                throw new Error("Keine gültigen Vorlagen gefunden (erwartet: [{name, text}, …]).");
            }
            templates = valid;
            renderTemplates();
            saveTemplates();
        } catch (err) {
            alert("Import fehlgeschlagen: " + err.message);
        }
    };
    reader.readAsText(file, "utf-8");
}

// ---------------------------------------------------------------- Popup-Bereiche

function sectionLinkRow(links, i) {
    const row = document.createElement("div");
    row.style.cssText = "display:flex; gap:6px; margin-bottom:6px; align-items:center;";

    const name = document.createElement("input");
    name.type = "text";
    name.placeholder = "Name";
    name.value = links[i].name || "";
    name.style.flex = "1";
    name.addEventListener("input", () => { links[i].name = name.value; });

    const url = document.createElement("input");
    url.type = "text";
    url.placeholder = "https://…";
    url.value = links[i].url || "";
    url.style.flex = "2";
    url.addEventListener("input", () => { links[i].url = url.value; });

    const cbBox = (label, key) => {
        const cbLabel = document.createElement("label");
        cbLabel.style.cssText = "display:flex; align-items:center; gap:4px; font-weight:400; margin:0; white-space:nowrap;";
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.style.width = "auto";
        cb.checked = links[i][key] === true;
        cb.addEventListener("change", () => { links[i][key] = cb.checked; });
        cbLabel.appendChild(cb);
        cbLabel.appendChild(document.createTextNode(label));
        return cbLabel;
    };

    const del = document.createElement("button");
    del.className = "danger";
    del.textContent = "✕";
    del.title = "Link löschen";
    del.addEventListener("click", () => {
        links.splice(i, 1);
        renderSections();
    });

    row.appendChild(name);
    row.appendChild(url);
    row.appendChild(cbBox("Start", "start"));
    row.appendChild(cbBox("Privat", "privat"));
    row.appendChild(del);
    return row;
}

function renderSections() {
    const host = document.getElementById("sectionList");
    host.textContent = "";
    sections.forEach((sec, si) => {
        if (!Array.isArray(sec.links)) {
            sec.links = [];
        }
        const box = document.createElement("div");
        box.className = "tpl";

        const head = document.createElement("div");
        head.style.cssText = "display:flex; gap:6px; align-items:center; margin-bottom:8px;";

        const name = document.createElement("input");
        name.type = "text";
        name.placeholder = "Bereichs-Name, z. B. „Schnellzugriffe“";
        name.value = sec.name || "";
        name.style.cssText = "flex:1; font-weight:600;";
        name.addEventListener("input", () => { sections[si].name = name.value; });

        const up = document.createElement("button");
        up.className = "secondary";
        up.textContent = "↑";
        up.title = "Nach oben";
        up.disabled = si === 0;
        up.addEventListener("click", () => {
            const t = sections[si - 1];
            sections[si - 1] = sections[si];
            sections[si] = t;
            renderSections();
        });

        const down = document.createElement("button");
        down.className = "secondary";
        down.textContent = "↓";
        down.title = "Nach unten";
        down.disabled = si === sections.length - 1;
        down.addEventListener("click", () => {
            const t = sections[si + 1];
            sections[si + 1] = sections[si];
            sections[si] = t;
            renderSections();
        });

        const del = document.createElement("button");
        del.className = "danger";
        del.textContent = "Bereich löschen";
        del.addEventListener("click", () => {
            if (sec.links.length === 0 || confirm("Bereich „" + (sec.name || "ohne Name") + "“ mit " + sec.links.length + " Link(s) löschen?")) {
                sections.splice(si, 1);
                renderSections();
            }
        });

        head.appendChild(name);
        head.appendChild(up);
        head.appendChild(down);
        head.appendChild(del);
        box.appendChild(head);

        sec.links.forEach((l, li) => box.appendChild(sectionLinkRow(sec.links, li)));

        const addLink = document.createElement("button");
        addLink.className = "secondary";
        addLink.textContent = "+ Link";
        addLink.addEventListener("click", () => {
            sec.links.push({ name: "", url: "", start: false, privat: false });
            renderSections();
        });
        box.appendChild(addLink);

        host.appendChild(box);
    });
}

function saveSections() {
    const clean = sections
        .map((sec) => ({
            name: (sec.name || "").trim(),
            links: (Array.isArray(sec.links) ? sec.links : [])
                .map((l) => ({
                    name: (l.name || "").trim(),
                    url: (l.url || "").trim(),
                    start: l.start === true,
                    privat: l.privat === true
                }))
                .filter((l) => l.url.length > 0)
        }))
        .filter((sec) => sec.name.length > 0 && sec.links.length > 0);
    sections = clean;
    chrome.storage.local.set({ sections: clean }, () => {
        flashStatus("statusLinks");
        renderSections();
    });
}

// ---------------------------------------------------------------- Sicherung (alle Einstellungen)

function exportAllSettings() {
    chrome.storage.local.get(null, (items) => {
        const payload = {
            _extension: "klToolbox",
            _exportiert: new Date().toISOString(),
            settings: items
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "kltoolbox-settings.json";
        a.click();
        URL.revokeObjectURL(a.href);
    });
}

// Host-Berechtigung fuer das (per Import konfigurierte) Ticketsystem: Das
// Ticketsystem steht bewusst NICHT im Manifest - erst die optionale
// Berechtigung (Nutzer-Klick) aktiviert die Ticket-Module dort.
function updateHostPermissionUi(highlight) {
    chrome.storage.local.get({ linkTemplate: "" }, (items) => {
        let origin = null;
        try {
            origin = new URL(items.linkTemplate).origin;
        } catch (err) {
            origin = null;
        }
        const row = document.getElementById("grantHostRow");
        if (!origin) {
            row.style.display = "none";
            return;
        }
        const match = origin + "/*";
        chrome.permissions.contains({ origins: [match] }, (granted) => {
            row.style.display = granted ? "none" : "flex";
            if (!granted) {
                const host = new URL(origin).hostname;
                document.getElementById("grantHost").textContent = "Zugriff auf " + host + " erlauben";
                if (highlight) {
                    // Nach dem Import unuebersehbar machen: Die Browser-
                    // Berechtigungsabfrage darf erst auf einen echten Klick
                    // folgen (User-Geste), automatisch geht es nicht.
                    row.scrollIntoView({ behavior: "smooth", block: "center" });
                    row.style.outline = "3px solid #b58900";
                    row.style.outlineOffset = "4px";
                    setTimeout(() => {
                        row.style.outline = "";
                        row.style.outlineOffset = "";
                    }, 6000);
                    alert("Fast fertig!\n\nDamit die Ticket-Module (Vorlagen, Termin, Wartezeit) aktiv werden, bitte jetzt den markierten Button\n\n„Zugriff auf " + host + " erlauben“\n\nklicken und die Abfrage des Browsers bestätigen.");
                }
            }
        });
    });
}

function grantTicketHostPermission() {
    chrome.storage.local.get({ linkTemplate: "" }, (items) => {
        let origin = null;
        try {
            origin = new URL(items.linkTemplate).origin;
        } catch (err) {
            return;
        }
        chrome.permissions.request({ origins: [origin + "/*"] }, (granted) => {
            if (granted) {
                chrome.runtime.sendMessage({ type: "syncTicketScripts" }, () => {
                    flashStatus("statusSettings");
                    updateHostPermissionUi();
                    renderStatus();
                    alert("Zugriff erteilt - die Ticket-Module sind jetzt aktiv.\n\nBereits geöffnete Ticket-Tabs bitte einmal neu laden (F5).");
                });
            }
        });
    });
}

// mode: "merge" = aktualisieren (zusammenfuehren), "replace" = ueberschreiben
function importAllSettings(file, mode) {
    const reader = new FileReader();
    reader.onload = () => {
        try {
            const data = JSON.parse(String(reader.result));
            // Akzeptiert das Export-Format ({settings: {...}}) und rohe Objekte
            const settings = (data && typeof data === "object" && data.settings && typeof data.settings === "object")
                ? data.settings
                : data;
            if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
                throw new Error("JSON muss ein Einstellungs-Objekt sein.");
            }
            const keys = Object.keys(settings).join(", ");
            if (mode === "replace") {
                if (!confirm("ÜBERSCHREIBEN: Sämtliche vorhandenen Einstellungen werden GELÖSCHT und durch den Dateiinhalt ersetzt.\n\nNicht in der Datei enthaltene Einstellungen (z. B. API-Keys) gehen dabei verloren!\n\nDie Datei enthält:\n" + keys + "\n\nWirklich fortfahren?")) {
                    return;
                }
                chrome.storage.local.clear(() => {
                    chrome.storage.local.set(settings, () => {
                        flashStatus("statusSettings");
                        loadAll();
                        updateHostPermissionUi(true);
                    });
                });
                return;
            }
            if (!confirm("AKTUALISIEREN: Folgende Einstellungen werden aus der Datei übernommen (vorhandene gleichnamige werden ersetzt, alle übrigen - z. B. API-Keys - bleiben erhalten):\n\n" + keys + "\n\nFortfahren?")) {
                return;
            }
            chrome.storage.local.set(settings, () => {
                flashStatus("statusSettings");
                loadAll();
                updateHostPermissionUi(true);
            });
        } catch (err) {
            alert("Import fehlgeschlagen: " + err.message);
        }
    };
    reader.readAsText(file, "utf-8");
}

// ---------------------------------------------------------------- Init

document.addEventListener("DOMContentLoaded", () => {
    loadAll();
    document.getElementById("saveKi").addEventListener("click", saveKi);
    wireModelSelect("claude");
    wireModelSelect("openai");
    wireModelSelect("innogpt");
    document.getElementById("saveTermin").addEventListener("click", saveTermin);
    document.getElementById("tplAdd").addEventListener("click", () => {
        templates.push({ name: "", text: "" });
        renderTemplates();
        window.scrollTo(0, document.body.scrollHeight);
    });
    document.getElementById("tplSave").addEventListener("click", saveTemplates);
    document.getElementById("tplExport").addEventListener("click", exportTemplates);
    document.getElementById("tplImport").addEventListener("click", () => {
        document.getElementById("tplImportFile").click();
    });
    document.getElementById("tplImportFile").addEventListener("change", (e) => {
        if (e.target.files && e.target.files[0]) {
            importTemplates(e.target.files[0]);
            e.target.value = "";
        }
    });
    document.getElementById("sectionAdd").addEventListener("click", () => {
        sections.push({ name: "", links: [{ name: "", url: "", start: false, privat: false }] });
        renderSections();
        window.scrollTo(0, document.body.scrollHeight / 2);
    });
    document.getElementById("sectionsSave").addEventListener("click", saveSections);
    document.getElementById("settingsExport").addEventListener("click", exportAllSettings);
    document.getElementById("backupRestore").addEventListener("click", restoreBackup);
    document.getElementById("grantHost").addEventListener("click", grantTicketHostPermission);
    document.getElementById("settingsReset").addEventListener("click", resetAllSettings);
    document.getElementById("kiActionAdd").addEventListener("click", () => {
        kiActions.push({ name: "", prompt: "" });
        renderKiActions();
    });
    document.getElementById("makroAdd").addEventListener("click", () => {
        makros.push({ name: "", eintrag: "", status: "", abonnieren: false });
        renderMakros();
    });
    document.getElementById("makroSave").addEventListener("click", saveMakros);
    updateHostPermissionUi();
    // Falls die Ticket-URL erst spaeter ankommt (z. B. GPO-Vorgaben)
    chrome.storage.onChanged.addListener((ch, area) => {
        if (area === "local" && ch.linkTemplate) {
            updateHostPermissionUi();
        }
    });
    let importMode = "merge";
    document.getElementById("settingsImport").addEventListener("click", () => {
        importMode = "merge";
        document.getElementById("settingsImportFile").click();
    });
    document.getElementById("settingsImportReplace").addEventListener("click", () => {
        importMode = "replace";
        document.getElementById("settingsImportFile").click();
    });
    document.getElementById("settingsImportFile").addEventListener("change", (e) => {
        if (e.target.files && e.target.files[0]) {
            importAllSettings(e.target.files[0], importMode);
            e.target.value = "";
        }
    });
    // Module + Feinschalter: Checkboxen speichern sofort
    for (const key of Object.keys(MODULE_DEFAULTS)) {
        document.getElementById(key).addEventListener("change", (e) => {
            const update = {};
            update[key] = e.target.checked;
            chrome.storage.local.set(update, () => flashStatus("statusModule"));
        });
    }
    for (const key of Object.keys(FT_DEFAULTS)) {
        document.getElementById(key).addEventListener("change", (e) => {
            const update = {};
            update[key] = e.target.checked;
            chrome.storage.local.set(update, () => flashStatus("statusFt"));
        });
    }
    document.getElementById("sidebarMode").addEventListener("change", (e) => {
        chrome.storage.local.set({ sidebarMode: e.target.checked }, () => flashStatus("statusView"));
    });
    document.getElementById("defaultSearch").addEventListener("change", (e) => {
        chrome.storage.local.set({ defaultSearch: e.target.value }, () => flashStatus("statusView"));
    });
    document.getElementById("entryTplAdd").addEventListener("click", () => {
        entryTemplates.push({ name: "", text: "" });
        renderEntryTemplates();
    });
    document.getElementById("entryTplSave").addEventListener("click", saveEntryTemplates);
    document.getElementById("saveCleaner").addEventListener("click", saveCleaner);
});

// ---------------------------------------------------------------- Cleaner

function saveCleaner() {
    const list = document.getElementById("cleanerWhitelist").value
        .split("\n")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    chrome.storage.local.set({ cleanerWhitelist: list }, () => {
        flashStatus("statusCleaner");
    });
}
