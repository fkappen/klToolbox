// Version
// version = "2.0.0"
// datum   = "2026-08-13"
// autor   = "Felix Kappen"
//
// Kombinierte Options-Seite: KI-Umformulierer, Ticket-Termin, Ticket-Vorlagen.
// Die Storage-Keys entsprechen den frueheren Einzel-Extensions.

const KI_DEFAULTS = {
    provider: "claude",
    claudeApiKey: "",
    claudeModel: "claude-opus-5",
    openaiApiKey: "",
    openaiModel: "gpt-4o-mini",
    innogptApiKey: "",
    innogptModel: "gpt-5",
    kiKontext: "Wir sind ein IT-Dienstleister. Formuliere freundlich und professionell."
};

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
    modVorlagen: true,
    modTermin: true,
    modCleaner: true,
    modChat: true
};

// Bewusst KEINE Firmen-URLs im Store-Paket: Links und URL-Vorlagen kommen
// erst per Settings-Import (Sicherung -> Importieren).
const DEFAULT_QUICKLINKS = [];
const DEFAULT_M365LINKS = [];

// Oeffentliche DATEV-Portale (keine Firmen-/Tenant-Infos) -> Defaults ok
const DEFAULT_DATEVLINKS = [
    { name: "MyUpdates", url: "https://apps.datev.de/myupdates" },
    { name: "Tickets", url: "https://apps.datev.de/servicekontakt-online/contacts" },
    { name: "ServiceTAN", url: "https://apps.datev.de/servicekontakt-online/service-tan" },
    { name: "MyPartner", url: "https://apps.datev.de/xrm-mypartner/standorte" },
    { name: "PARTNERasp", url: "https://secure11.datev.de/partneraspkundenportal/" }
];

let templates = [];
let quickLinks = [];
let m365Links = [];
let datevLinks = [];

// ---------------------------------------------------------------- Laden

function loadAll() {
    chrome.storage.local.get(Object.assign({}, KI_DEFAULTS, TERMIN_DEFAULTS, MODULE_DEFAULTS, {
        templates: [],
        quickLinks: DEFAULT_QUICKLINKS,
        m365Links: DEFAULT_M365LINKS,
        datevLinks: DEFAULT_DATEVLINKS,
        cleanerWhitelist: []
    }), (items) => {
        // Module
        for (const key of Object.keys(MODULE_DEFAULTS)) {
            document.getElementById(key).checked = items[key] !== false;
        }
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
        document.getElementById("kiKontext").value = items.kiKontext;
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
        // Links
        quickLinks = Array.isArray(items.quickLinks) ? items.quickLinks : DEFAULT_QUICKLINKS;
        m365Links = Array.isArray(items.m365Links) ? items.m365Links : DEFAULT_M365LINKS;
        datevLinks = Array.isArray(items.datevLinks) ? items.datevLinks : DEFAULT_DATEVLINKS;
        renderLinks();
    });
}

function flashStatus(id) {
    const el = document.getElementById(id);
    el.textContent = "Gespeichert ✓";
    setTimeout(() => { el.textContent = ""; }, 2000);
}

// ---------------------------------------------------------------- KI

function saveKi() {
    chrome.storage.local.set({
        provider: document.querySelector('input[name="provider"]:checked').value,
        claudeApiKey: document.getElementById("claudeApiKey").value.trim(),
        claudeModel: document.getElementById("claudeModel").value.trim() || KI_DEFAULTS.claudeModel,
        openaiApiKey: document.getElementById("openaiApiKey").value.trim(),
        openaiModel: document.getElementById("openaiModel").value.trim() || KI_DEFAULTS.openaiModel,
        innogptApiKey: document.getElementById("innogptApiKey").value.trim(),
        innogptModel: document.getElementById("innogptModel").value.trim() || KI_DEFAULTS.innogptModel,
        kiKontext: document.getElementById("kiKontext").value.trim()
    }, () => flashStatus("statusKi"));
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

// ---------------------------------------------------------------- Links (Schnellzugriffe + M365)

// mode: "start" (Start-Haken) | "privat" (Privat-Haken) | null
function linkRow(list, i, mode) {
    const row = document.createElement("div");
    row.style.cssText = "display:flex; gap:6px; margin-bottom:6px; align-items:center;";

    const name = document.createElement("input");
    name.type = "text";
    name.placeholder = "Name";
    name.value = list[i].name || "";
    name.style.flex = "1";
    name.addEventListener("input", () => { list[i].name = name.value; });

    const url = document.createElement("input");
    url.type = "text";
    url.placeholder = "https://…";
    url.value = list[i].url || "";
    url.style.flex = "2";
    url.addEventListener("input", () => { list[i].url = url.value; });

    row.appendChild(name);
    row.appendChild(url);

    if (mode === "start" || mode === "privat") {
        const cbLabel = document.createElement("label");
        cbLabel.style.cssText = "display:flex; align-items:center; gap:4px; font-weight:400; margin:0; white-space:nowrap;";
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.style.width = "auto";
        if (mode === "start") {
            cb.checked = list[i].start !== false;
            cb.addEventListener("change", () => { list[i].start = cb.checked; });
        } else {
            cb.checked = list[i].privat !== false;
            cb.addEventListener("change", () => { list[i].privat = cb.checked; });
        }
        cbLabel.appendChild(cb);
        cbLabel.appendChild(document.createTextNode(mode === "start" ? "Start" : "Privat"));
        row.appendChild(cbLabel);
    }

    const del = document.createElement("button");
    del.className = "danger";
    del.textContent = "✕";
    del.title = "Löschen";
    del.addEventListener("click", () => {
        list.splice(i, 1);
        renderLinks();
    });
    row.appendChild(del);
    return row;
}

function renderLinks() {
    const quickBox = document.getElementById("quickList");
    quickBox.textContent = "";
    quickLinks.forEach((l, i) => quickBox.appendChild(linkRow(quickLinks, i, "start")));

    const m365Box = document.getElementById("m365List");
    m365Box.textContent = "";
    m365Links.forEach((l, i) => m365Box.appendChild(linkRow(m365Links, i, "privat")));

    const datevBox = document.getElementById("datevList");
    datevBox.textContent = "";
    datevLinks.forEach((l, i) => datevBox.appendChild(linkRow(datevLinks, i, null)));
}

function saveLinks() {
    const cleanQuick = quickLinks
        .map((l) => ({ name: (l.name || "").trim(), url: (l.url || "").trim(), start: l.start !== false }))
        .filter((l) => l.url.length > 0);
    const cleanM365 = m365Links
        .map((l) => ({ name: (l.name || "").trim(), url: (l.url || "").trim(), privat: l.privat !== false }))
        .filter((l) => l.url.length > 0);
    const cleanDatev = datevLinks
        .map((l) => ({ name: (l.name || "").trim(), url: (l.url || "").trim() }))
        .filter((l) => l.url.length > 0);
    quickLinks = cleanQuick;
    m365Links = cleanM365;
    datevLinks = cleanDatev;
    chrome.storage.local.set({ quickLinks: cleanQuick, m365Links: cleanM365, datevLinks: cleanDatev }, () => {
        flashStatus("statusLinks");
        renderLinks();
    });
}

// ---------------------------------------------------------------- Sicherung (alle Einstellungen)

function exportAllSettings() {
    chrome.storage.local.get(null, (items) => {
        const payload = {
            _extension: "Kloeschinski",
            _exportiert: new Date().toISOString(),
            settings: items
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "kloeschinski-settings.json";
        a.click();
        URL.revokeObjectURL(a.href);
    });
}

function importAllSettings(file) {
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
            if (!confirm("Folgende Einstellungen werden aus der Datei übernommen (vorhandene gleichnamige werden überschrieben, alle übrigen - z. B. API-Keys - bleiben erhalten):\n\n" + keys + "\n\nFortfahren?")) {
                return;
            }
            chrome.storage.local.set(settings, () => {
                flashStatus("statusSettings");
                loadAll();
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
    document.getElementById("quickAdd").addEventListener("click", () => {
        quickLinks.push({ name: "", url: "", start: true });
        renderLinks();
    });
    document.getElementById("m365Add").addEventListener("click", () => {
        m365Links.push({ name: "", url: "" });
        renderLinks();
    });
    document.getElementById("datevAdd").addEventListener("click", () => {
        datevLinks.push({ name: "", url: "" });
        renderLinks();
    });
    document.getElementById("linksSave").addEventListener("click", saveLinks);
    document.getElementById("settingsExport").addEventListener("click", exportAllSettings);
    document.getElementById("settingsImport").addEventListener("click", () => {
        document.getElementById("settingsImportFile").click();
    });
    document.getElementById("settingsImportFile").addEventListener("change", (e) => {
        if (e.target.files && e.target.files[0]) {
            importAllSettings(e.target.files[0]);
            e.target.value = "";
        }
    });
    // Module: Checkboxen speichern sofort (kein eigener Speichern-Button)
    for (const key of Object.keys(MODULE_DEFAULTS)) {
        document.getElementById(key).addEventListener("change", (e) => {
            const update = {};
            update[key] = e.target.checked;
            chrome.storage.local.set(update, () => flashStatus("statusModule"));
        });
    }
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
