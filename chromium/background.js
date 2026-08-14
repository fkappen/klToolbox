// Version
// version = "1.1.0"
// datum   = "2026-07-29"
// autor   = "Felix Kappen"
//
// Service Worker: Kontextmenü, API-Aufrufe (Claude/OpenAI), Ergebnis-Injection.

const ACTIONS = {
    rewrite: {
        title: "Umformulieren (verbessern)",
        instruction: "Formuliere den Text besser: klarer, flüssiger und natürlicher. Behalte Inhalt, Ton und ungefähre Länge bei."
    },
    formal: {
        title: "Formeller",
        instruction: "Formuliere den Text formeller und professioneller, z. B. für geschäftliche E-Mails."
    },
    casual: {
        title: "Lockerer",
        instruction: "Formuliere den Text lockerer und freundlicher, ohne unprofessionell zu wirken."
    },
    shorter: {
        title: "Kürzer",
        instruction: "Kürze den Text deutlich, ohne wichtige Informationen zu verlieren."
    },
    fix: {
        title: "Rechtschreibung & Grammatik korrigieren",
        instruction: "Korrigiere ausschließlich Rechtschreibung, Grammatik und Zeichensetzung. Ändere Formulierungen nur, wenn sie sprachlich falsch sind."
    },
    to_de: {
        title: "Ins Deutsche übersetzen",
        instruction: "Übersetze den Text ins Deutsche. Gib nur die Übersetzung zurück."
    },
    to_en: {
        title: "Ins Englische übersetzen",
        instruction: "Übersetze den Text ins Englische. Gib nur die Übersetzung zurück."
    }
};

const SYSTEM_PROMPT =
    "Du bist ein Textassistent in einer Browser-Erweiterung. " +
    "Du erhältst einen markierten Text und eine Aufgabe. " +
    "Gib AUSSCHLIESSLICH den überarbeiteten Text zurück - ohne Anführungszeichen, " +
    "ohne Einleitung, ohne Erklärungen, ohne Markdown-Codeblöcke. " +
    "Behalte die Sprache des Originaltextes bei (außer bei Übersetzungsaufgaben). " +
    "Behalte vorhandene Zeilenumbrüche und Absatzstruktur sinnvoll bei.";

// Neutrale Auslieferung: guenstige Modelle vorbelegt, kein Kontext -
// firmenspezifische Vorgaben kommen erst per Settings-Import/GPO.
const DEFAULTS = {
    provider: "claude",
    claudeApiKey: "",
    claudeModel: "claude-haiku-4-5",
    openaiApiKey: "",
    openaiModel: "gpt-4o-mini",
    innogptApiKey: "",
    innogptModel: "gpt-5",
    kiKontext: ""
};

// System-Prompt inkl. konfigurierbarem Kontext (Optionen)
function buildSystemPrompt(settings) {
    const kontext = (settings.kiKontext || "").trim();
    if (!kontext) {
        return SYSTEM_PROMPT;
    }
    return SYSTEM_PROMPT + "\n\nKontext zum Absender (bei Ton und Formulierung berücksichtigen): " + kontext;
}

// InnoGPT ist OpenAI-kompatibel (https://docs.innogpt.de -> Entwickler & API)
const INNOGPT_BASE_URL = "https://app.innogpt.de/api/ext/v1";

// ---------------------------------------------------------------- Kontextmenü

const DATEV_SEARCH_DEFAULT = "https://wissensplattform.apps.datev.de/help/search/helpcenter?q=%SUCHE%";

// Migration: alten (unverifizierten) Standard aus 2.10/2.11.0 ersetzen
chrome.storage.local.get({ datevSearchTemplate: "" }, (items) => {
    if (items.datevSearchTemplate === "https://apps.datev.de/knowledge/professional/search?q=%SUCHE%") {
        chrome.storage.local.set({ datevSearchTemplate: DATEV_SEARCH_DEFAULT });
    }
});

// Module (Optionen -> "Module"): abschaltbare Funktionsbereiche
const MODULE_DEFAULTS = {
    modKi: true,        // KI-Umformulierer (Kontextmenue)
    modSuche: true,     // Kontextmenue-Suchen (DATEV/Google/InnoGPT)
    modVorlagen: true,  // Ticket-Vorlagen
    modTermin: true,    // Ticket-Termin/Wartezeit/Anfahrt
    modCleaner: true,   // MS Account Cleaner
    modChat: true       // KI-Chat (Popup)
};

function rebuildMenus() {
    chrome.storage.local.get(MODULE_DEFAULTS, (mods) => {
        chrome.contextMenus.removeAll(() => {
            if (mods.modKi !== false) {
                chrome.contextMenus.create({
                    id: "ki_parent",
                    title: "KI: Text bearbeiten",
                    contexts: ["selection"]
                });
                for (const [id, action] of Object.entries(ACTIONS)) {
                    chrome.contextMenus.create({
                        id: "ki_" + id,
                        parentId: "ki_parent",
                        title: action.title,
                        contexts: ["selection"]
                    });
                }
            }
            if (mods.modSuche !== false) {
                // Markierten Text (z. B. Fehlermeldung) in der DATEV Wissensplattform suchen
                chrome.contextMenus.create({
                    id: "datev_suche",
                    title: "In DATEV Wissensplattform suchen: „%s“",
                    contexts: ["selection"]
                });
                chrome.contextMenus.create({
                    id: "google_suche",
                    title: "In Google suchen: „%s“",
                    contexts: ["selection"]
                });
                chrome.contextMenus.create({
                    id: "innogpt_suche",
                    title: "In InnoGPT fragen: „%s“",
                    contexts: ["selection"]
                });
            }
        });
    });
}

chrome.runtime.onInstalled.addListener(rebuildMenus);
if (chrome.runtime.onStartup) {
    chrome.runtime.onStartup.addListener(rebuildMenus);
}

// Modul-Schalter geaendert -> Menues sofort anpassen
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && (changes.modKi || changes.modSuche)) {
        rebuildMenus();
    }
});

// ---------------------------------------------------------------- Ticket-Modul (dynamisch)
//
// Das Ticketsystem steht NICHT im Manifest (neutrale Auslieferung, interne
// Hostnamen bleiben unsichtbar). Stattdessen: Die Ticket-URL kommt per
// Settings-Import (linkTemplate), die Optionsseite holt die optionale
// Host-Berechtigung ein, und hier werden die Content-Scripts zur Laufzeit
// fuer genau diesen Origin registriert.

const TICKET_SCRIPT_ID = "kltoolbox-ticket";

function ticketOriginFromSettings(items) {
    try {
        return new URL(items.linkTemplate).origin;
    }
    catch (err) {
        return null;
    }
}

async function syncTicketContentScripts() {
    try {
        const items = await new Promise((resolve) => {
            chrome.storage.local.get({ linkTemplate: "" }, resolve);
        });
        const origin = ticketOriginFromSettings(items);
        const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [TICKET_SCRIPT_ID] })
            .catch(() => []);
        if (!origin) {
            if (existing.length > 0) {
                await chrome.scripting.unregisterContentScripts({ ids: [TICKET_SCRIPT_ID] });
            }
            return;
        }
        const match = origin + "/*";
        const granted = await chrome.permissions.contains({ origins: [match] });
        if (!granted) {
            console.warn("klToolbox: Host-Berechtigung fuer " + match +
                " fehlt - in den Optionen (Sicherung) erteilen, dann werden die Ticket-Module aktiv.");
            return;
        }
        const desired = {
            id: TICKET_SCRIPT_ID,
            matches: [match],
            js: ["content-vorlagen.js", "content-termin.js"],
            css: ["content.css"],
            allFrames: true,
            runAt: "document_idle",
            persistAcrossSessions: true
        };
        if (existing.length > 0) {
            await chrome.scripting.updateContentScripts([desired]);
        } else {
            await chrome.scripting.registerContentScripts([desired]);
        }
        console.log("klToolbox: Ticket-Module registriert fuer " + match);
    }
    catch (err) {
        console.error("klToolbox: Registrierung der Ticket-Module fehlgeschlagen:", err);
    }
}

syncTicketContentScripts();
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.linkTemplate) {
        syncTicketContentScripts();
    }
});
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg && msg.type === "syncTicketScripts") {
        syncTicketContentScripts().then(() => sendResponse({ ok: true }));
        return true;
    }
    return false;
});

// ---------------------------------------------------------------- Managed Storage (GPO)
//
// Administratoren koennen per Richtlinie den Schluessel "defaultsJson"
// setzen (Chromium: 3rdparty-Extension-Policy, Firefox: 3rdparty-Policy;
// siehe gpo/ im Repo). Inhalt: JSON im Format der Defaults-JSON (interne Verteilung)
// (komplette Datei oder nur das settings-Objekt). Die Vorgaben werden in
// storage.local uebernommen, sobald sich der Richtlinienwert aendert -
// danach darf der Benutzer weiter anpassen, bis der Admin eine neue
// Version der Vorgaben verteilt (Verhalten wie der Settings-Import).

function applyManagedDefaults() {
    if (!chrome.storage.managed) {
        return;
    }
    chrome.storage.managed.get(null, (items) => {
        // Firefox wirft hier einen Fehler, wenn keine Richtlinie existiert
        if (chrome.runtime.lastError) {
            return;
        }
        const raw = items && items.defaultsJson;
        if (!raw || typeof raw !== "string") {
            return;
        }
        let parsed = null;
        try {
            parsed = JSON.parse(raw);
        } catch (err) {
            console.error("[Toolbox] GPO-defaultsJson ist kein gueltiges JSON:", err);
            return;
        }
        const settings = (parsed && typeof parsed === "object" && parsed.settings && typeof parsed.settings === "object")
            ? parsed.settings
            : parsed;
        if (!settings || typeof settings !== "object") {
            return;
        }
        chrome.storage.local.get({ managedDefaultsApplied: "" }, (st) => {
            if (st.managedDefaultsApplied === raw) {
                return; // dieser Richtlinien-Stand wurde schon uebernommen
            }
            const update = Object.assign({}, settings, { managedDefaultsApplied: raw });
            chrome.storage.local.set(update, () => {
                console.log("[Toolbox] GPO-Vorgaben uebernommen (" + Object.keys(settings).length + " Schluessel)");
            });
        });
    });
}

applyManagedDefaults();
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "managed") {
        applyManagedDefaults();
    }
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    // DATEV-Suche: markierten Text an die Wissensplattform uebergeben
    if (info.menuItemId === "datev_suche") {
        const term = (info.selectionText || "").replace(/\s+/g, " ").trim().slice(0, 255);
        if (!term) {
            return;
        }
        chrome.storage.local.get({ datevSearchTemplate: DATEV_SEARCH_DEFAULT }, (items) => {
            const tpl = items.datevSearchTemplate || DATEV_SEARCH_DEFAULT;
            chrome.tabs.create({ url: tpl.replace(/%SUCHE%/g, encodeURIComponent(term)) });
        });
        return;
    }

    // Google-Suche mit markiertem Text
    if (info.menuItemId === "google_suche") {
        const term = (info.selectionText || "").replace(/\s+/g, " ").trim();
        if (term) {
            chrome.tabs.create({ url: "https://www.google.com/search?q=" + encodeURIComponent(term) });
        }
        return;
    }

    // InnoGPT hat keinen URL-Suchparameter (offizielle Doku geprueft) ->
    // eigener KI-Chat mit Provider-Override, Frage wird automatisch gesendet.
    if (info.menuItemId === "innogpt_suche") {
        const term = (info.selectionText || "").replace(/\s+/g, " ").trim();
        if (term) {
            chrome.tabs.create({
                url: chrome.runtime.getURL("chat.html") + "?provider=innogpt&q=" + encodeURIComponent(term)
            });
        }
        return;
    }

    const actionId = String(info.menuItemId).replace(/^ki_/, "");
    const action = ACTIONS[actionId];
    if (!action || !tab || !tab.id) {
        return;
    }

    try {
        // Selektion direkt aus der Seite holen (info.selectionText verliert Zeilenumbrüche)
        const selection = await getSelectionFromPage(tab.id);
        const text = (selection && selection.trim().length > 0) ? selection : (info.selectionText || "");

        if (!text || text.trim().length === 0) {
            await showToast(tab.id, "Kein Text markiert.", true);
            return;
        }
        if (text.length > 50000) {
            await showToast(tab.id, "Markierter Text ist zu lang (max. 50.000 Zeichen).", true);
            return;
        }

        await showToast(tab.id, "KI formuliert um…", false);

        const settings = await getSettings();
        const result = await callProvider(settings, action.instruction, text);

        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: replaceSelectionInPage,
            args: [result]
        });
    } catch (err) {
        const msg = (err && err.message) ? err.message : String(err);
        try {
            await showToast(tab.id, "Fehler: " + msg, true);
        } catch (e) {
            console.error("Toast fehlgeschlagen:", e);
        }
        console.error("KI Text-Umformulierer:", err);
    }
});

// ---------------------------------------------------------------- KI-Chat (chat.html)

const CHAT_SYSTEM =
    "Du bist ein hilfreicher KI-Assistent. " +
    "Antworte auf Deutsch, präzise und praxisnah.";

function buildChatSystem(settings) {
    const kontext = (settings.kiKontext || "").trim();
    return kontext ? CHAT_SYSTEM + "\n\nKontext: " + kontext : CHAT_SYSTEM;
}

async function chatProvider(settings, messages) {
    let system = buildChatSystem(settings);
    if (settings.provider === "innogpt") {
        // Laut InnoGPT-Doku wird die Websuche per Prompt aktiviert
        system += "\nNutze bei Bedarf die Websuche für aktuelle Informationen.";
    }

    if (settings.provider === "claude") {
        if (!settings.claudeApiKey) {
            throw new Error("Kein Anthropic API-Key hinterlegt (Optionen).");
        }
        const res = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
                "content-type": "application/json",
                "x-api-key": settings.claudeApiKey,
                "anthropic-version": "2023-06-01",
                "anthropic-dangerous-direct-browser-access": "true"
            },
            body: JSON.stringify({
                model: settings.claudeModel || DEFAULTS.claudeModel,
                max_tokens: 8192,
                system: system,
                messages: messages
            })
        });
        if (!res.ok) {
            const body = await res.text().catch(() => "");
            throw new Error("Anthropic API " + res.status + ": " + shorten(body));
        }
        const data = await res.json();
        if (data.stop_reason === "refusal") {
            throw new Error("Anfrage wurde vom Modell abgelehnt.");
        }
        const out = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
        if (!out) {
            throw new Error("Leere Antwort von der Anthropic API.");
        }
        return out.trim();
    }

    // OpenAI-kompatibel (OpenAI / InnoGPT)
    const isInno = settings.provider === "innogpt";
    const apiKey = isInno ? settings.innogptApiKey : settings.openaiApiKey;
    if (!apiKey) {
        throw new Error("Kein " + (isInno ? "InnoGPT" : "OpenAI") + " API-Key hinterlegt (Optionen).");
    }
    const baseUrl = isInno ? INNOGPT_BASE_URL : "https://api.openai.com/v1";
    const model = isInno
        ? (settings.innogptModel || DEFAULTS.innogptModel)
        : (settings.openaiModel || DEFAULTS.openaiModel);

    const res = await fetch(baseUrl + "/chat/completions", {
        method: "POST",
        headers: {
            "content-type": "application/json",
            "authorization": "Bearer " + apiKey
        },
        body: JSON.stringify({
            model: model,
            messages: [{ role: "system", content: system }].concat(messages)
        })
    });
    if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error((isInno ? "InnoGPT" : "OpenAI") + " API " + res.status + ": " + shorten(body));
    }
    const data = await res.json();
    const out = data.choices && data.choices[0] && data.choices[0].message ? data.choices[0].message.content : "";
    if (!out) {
        throw new Error("Leere Antwort von der API.");
    }
    return out.trim();
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg && msg.type === "kiChat" && Array.isArray(msg.messages)) {
        (async () => {
            try {
                const settings = await getSettings();
                // Provider-Override (z. B. Kontextmenue "In InnoGPT fragen")
                if (msg.provider === "claude" || msg.provider === "openai" || msg.provider === "innogpt") {
                    settings.provider = msg.provider;
                }
                const text = await chatProvider(settings, msg.messages);
                sendResponse({ ok: true, text: text, provider: settings.provider });
            } catch (err) {
                sendResponse({ ok: false, error: (err && err.message) ? err.message : String(err) });
            }
        })();
        return true; // asynchrone Antwort
    }
    return false;
});

// ---------------------------------------------------------------- Einstellungen

function getSettings() {
    return new Promise((resolve) => {
        chrome.storage.local.get(DEFAULTS, (items) => resolve(items));
    });
}

// ---------------------------------------------------------------- API-Aufrufe

async function callProvider(settings, instruction, text) {
    if (settings.provider === "openai") {
        if (!settings.openaiApiKey) {
            throw new Error("Kein OpenAI API-Key hinterlegt (Erweiterungs-Optionen öffnen).");
        }
        return callOpenAICompatible({
            baseUrl: "https://api.openai.com/v1",
            apiKey: settings.openaiApiKey,
            model: settings.openaiModel || DEFAULTS.openaiModel,
            label: "OpenAI",
            system: buildSystemPrompt(settings)
        }, instruction, text);
    }
    if (settings.provider === "innogpt") {
        if (!settings.innogptApiKey) {
            throw new Error("Kein InnoGPT API-Key hinterlegt (Erweiterungs-Optionen öffnen).");
        }
        return callOpenAICompatible({
            baseUrl: INNOGPT_BASE_URL,
            apiKey: settings.innogptApiKey,
            model: settings.innogptModel || DEFAULTS.innogptModel,
            label: "InnoGPT",
            system: buildSystemPrompt(settings)
        }, instruction, text);
    }
    if (!settings.claudeApiKey) {
        throw new Error("Kein Anthropic API-Key hinterlegt (Erweiterungs-Optionen öffnen).");
    }
    return callClaude(settings, instruction, text);
}

async function callClaude(settings, instruction, text) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
            "content-type": "application/json",
            "x-api-key": settings.claudeApiKey,
            "anthropic-version": "2023-06-01",
            "anthropic-dangerous-direct-browser-access": "true"
        },
        body: JSON.stringify({
            model: settings.claudeModel || DEFAULTS.claudeModel,
            max_tokens: 8192,
            system: buildSystemPrompt(settings),
            output_config: { effort: "low" },
            messages: [
                { role: "user", content: "Aufgabe: " + instruction + "\n\nText:\n" + text }
            ]
        })
    });

    if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error("Anthropic API " + res.status + ": " + shorten(body));
    }

    const data = await res.json();
    if (data.stop_reason === "refusal") {
        throw new Error("Anfrage wurde vom Modell abgelehnt.");
    }
    const out = (data.content || [])
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("");
    if (!out) {
        throw new Error("Leere Antwort von der Anthropic API.");
    }
    return out.trim();
}

// Gemeinsamer Aufruf fuer alle OpenAI-kompatiblen Endpunkte (OpenAI, InnoGPT)
async function callOpenAICompatible(cfg, instruction, text) {
    const res = await fetch(cfg.baseUrl + "/chat/completions", {
        method: "POST",
        headers: {
            "content-type": "application/json",
            "authorization": "Bearer " + cfg.apiKey
        },
        body: JSON.stringify({
            model: cfg.model,
            messages: [
                { role: "system", content: cfg.system || SYSTEM_PROMPT },
                { role: "user", content: "Aufgabe: " + instruction + "\n\nText:\n" + text }
            ]
        })
    });

    if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(cfg.label + " API " + res.status + ": " + shorten(body));
    }

    const data = await res.json();
    const out = data.choices && data.choices[0] && data.choices[0].message
        ? data.choices[0].message.content
        : "";
    if (!out) {
        throw new Error("Leere Antwort von der " + cfg.label + " API.");
    }
    return out.trim();
}

function shorten(s) {
    return s && s.length > 300 ? s.slice(0, 300) + "…" : s;
}

// ---------------------------------------------------------------- Seiten-Injection

async function getSelectionFromPage(tabId) {
    const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
            const el = document.activeElement;
            if (el && (el.tagName === "TEXTAREA" || el.tagName === "INPUT")) {
                const start = el.selectionStart, end = el.selectionEnd;
                if (typeof start === "number" && typeof end === "number" && start !== end) {
                    return el.value.substring(start, end);
                }
            }
            const sel = window.getSelection();
            return sel ? sel.toString() : "";
        }
    });
    return results && results[0] ? results[0].result : "";
}

async function showToast(tabId, message, isError) {
    await chrome.scripting.executeScript({
        target: { tabId },
        func: (msg, error) => {
            let toast = document.getElementById("__ki_rewrite_toast");
            if (!toast) {
                toast = document.createElement("div");
                toast.id = "__ki_rewrite_toast";
                toast.style.cssText =
                    "position:fixed;bottom:20px;right:20px;z-index:2147483647;" +
                    "padding:10px 16px;border-radius:8px;font:13px/1.4 system-ui,sans-serif;" +
                    "box-shadow:0 4px 16px rgba(0,0,0,.25);max-width:360px;color:#fff;";
                document.documentElement.appendChild(toast);
            }
            toast.style.background = error ? "#b3261e" : "#1a1a2e";
            toast.textContent = msg;
            clearTimeout(toast.__hideTimer);
            toast.__hideTimer = setTimeout(() => toast.remove(), error ? 8000 : 30000);
        },
        args: [message, !!isError]
    });
}

// Wird als Funktion in die Seite injiziert - muss vollständig self-contained sein.
function replaceSelectionInPage(newText) {
    const toast = document.getElementById("__ki_rewrite_toast");
    if (toast) {
        toast.remove();
    }

    // Fall 1: Input / Textarea
    const el = document.activeElement;
    if (el && (el.tagName === "TEXTAREA" ||
        (el.tagName === "INPUT" && /^(text|search|url|tel|email)$/i.test(el.type)))) {
        const start = el.selectionStart, end = el.selectionEnd;
        if (typeof start === "number" && typeof end === "number" && start !== end) {
            el.setRangeText(newText, start, end, "end");
            el.dispatchEvent(new Event("input", { bubbles: true }));
            el.dispatchEvent(new Event("change", { bubbles: true }));
            return;
        }
    }

    // Fall 2: contenteditable (Outlook Web, Teams, Gmail, ...)
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
        const range = sel.getRangeAt(0);
        const container = range.commonAncestorContainer;
        const host = (container.nodeType === Node.ELEMENT_NODE ? container : container.parentElement);
        const editable = host ? host.closest('[contenteditable="true"], [contenteditable=""]') : null;
        if (editable) {
            range.deleteContents();
            const lines = newText.split("\n");
            const frag = document.createDocumentFragment();
            lines.forEach((line, i) => {
                if (i > 0) {
                    frag.appendChild(document.createElement("br"));
                }
                frag.appendChild(document.createTextNode(line));
            });
            range.insertNode(frag);
            sel.collapseToEnd();
            editable.dispatchEvent(new InputEvent("input", { bubbles: true }));
            return;
        }
    }

    // Fall 3: nicht editierbarer Text -> Overlay mit Kopieren-Button
    const old = document.getElementById("__ki_rewrite_overlay");
    if (old) {
        old.remove();
    }
    const box = document.createElement("div");
    box.id = "__ki_rewrite_overlay";
    box.style.cssText =
        "position:fixed;bottom:20px;right:20px;z-index:2147483647;width:420px;max-width:90vw;" +
        "background:#1a1a2e;color:#fff;border-radius:10px;box-shadow:0 8px 32px rgba(0,0,0,.35);" +
        "font:13px/1.5 system-ui,sans-serif;padding:14px;";

    const label = document.createElement("div");
    label.textContent = "Umformulierter Text:";
    label.style.cssText = "font-weight:600;margin-bottom:8px;";

    const content = document.createElement("div");
    content.textContent = newText;
    content.style.cssText =
        "white-space:pre-wrap;max-height:40vh;overflow:auto;background:rgba(255,255,255,.08);" +
        "border-radius:6px;padding:10px;user-select:text;";

    const bar = document.createElement("div");
    bar.style.cssText = "display:flex;gap:8px;margin-top:10px;justify-content:flex-end;";

    const copyBtn = document.createElement("button");
    copyBtn.textContent = "Kopieren";
    copyBtn.style.cssText =
        "background:#4f6ef7;border:0;color:#fff;padding:6px 14px;border-radius:6px;cursor:pointer;font:inherit;";
    copyBtn.addEventListener("click", () => {
        navigator.clipboard.writeText(newText).then(() => {
            copyBtn.textContent = "Kopiert ✓";
            setTimeout(() => box.remove(), 1200);
        }).catch(() => {
            copyBtn.textContent = "Fehler beim Kopieren";
        });
    });

    const closeBtn = document.createElement("button");
    closeBtn.textContent = "Schließen";
    closeBtn.style.cssText =
        "background:transparent;border:1px solid rgba(255,255,255,.4);color:#fff;" +
        "padding:6px 14px;border-radius:6px;cursor:pointer;font:inherit;";
    closeBtn.addEventListener("click", () => box.remove());

    bar.appendChild(copyBtn);
    bar.appendChild(closeBtn);
    box.appendChild(label);
    box.appendChild(content);
    box.appendChild(bar);
    document.documentElement.appendChild(box);
}
