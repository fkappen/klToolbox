// Version
// version = "2.0.0"  (Modul KI-Chat, klToolbox)
// datum   = "2026-08-17"
// autor   = "FK"
//
// Chat-Seite mit Unterhaltungs-Verlauf (wie ChatGPT): mehrere Chats in der
// Seitenleiste, automatische Titel, 30 Tage lokale Aufbewahrung
// (chatConversations), aktueller Chat via chatCurrentId. Bei Uebergabe per
// ?q= startet immer eine frische Unterhaltung.

let convos = [];        // [{id, title, ts, messages: [{role, content}]}]
let currentId = null;
let conversation = [];  // Nachrichten der aktuellen Unterhaltung (Referenz!)
let busy = false;

const RETENTION_MS = 30 * 24 * 3600 * 1000;
const MAX_CONVOS = 50;
const MAX_MSGS = 60;

// URL-Parameter: ?q=<Frage> (wird automatisch gesendet),
// ?provider=claude|openai|innogpt (Override, z. B. "In InnoGPT fragen")
const urlParams = new URLSearchParams(location.search);
const providerOverride = ["claude", "openai", "innogpt"].includes(urlParams.get("provider"))
    ? urlParams.get("provider")
    : "";
const initialQuery = (urlParams.get("q") || "").trim();

function el(id) {
    return document.getElementById(id);
}

// ---------------------------------------------------------------- Markdown
// Bewusst als echte DOM-Knoten statt innerHTML (AMO-konform):
// ```bloecke``` -> <pre>, `inline` -> <code>, **fett** -> <b>.
function renderMarkdownInto(target, text) {
    const blockRe = /```[a-z0-9]*\n?([\s\S]*?)```/gi;
    const src = String(text);
    let last = 0;
    let m;
    while ((m = blockRe.exec(src)) !== null) {
        if (m.index > last) {
            appendInlineMd(target, src.slice(last, m.index));
        }
        const pre = document.createElement("pre");
        pre.textContent = m[1].replace(/\n$/, "");
        target.appendChild(pre);
        last = m.index + m[0].length;
    }
    if (last < src.length) {
        appendInlineMd(target, src.slice(last));
    }
}

function appendInlineMd(target, text) {
    const re = /(\*\*[^*\n]+\*\*|`[^`\n]+`)/g;
    let last = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
        if (m.index > last) {
            target.appendChild(document.createTextNode(text.slice(last, m.index)));
        }
        const tok = m[0];
        if (tok.charAt(0) === "*") {
            const b = document.createElement("b");
            b.textContent = tok.slice(2, -2);
            target.appendChild(b);
        } else {
            const c = document.createElement("code");
            c.textContent = tok.slice(1, -1);
            target.appendChild(c);
        }
        last = m.index + m[0].length;
    }
    if (last < text.length) {
        target.appendChild(document.createTextNode(text.slice(last)));
    }
}

function addBubble(cls, text) {
    const wrap = document.createElement("div");
    wrap.className = "msg " + cls;
    const bubble = document.createElement("div");
    bubble.className = "bubble";
    if (cls === "assistant") {
        renderMarkdownInto(bubble, text);
    } else {
        bubble.textContent = text;
    }
    wrap.appendChild(bubble);
    el("messages").appendChild(wrap);
    wrap.scrollIntoView({ behavior: "smooth", block: "end" });
    return wrap;
}

// ---------------------------------------------------------------- Verlauf

function persist() {
    chrome.storage.local.set({ chatConversations: convos, chatCurrentId: currentId });
}

function pruneConvos() {
    const cutoff = Date.now() - RETENTION_MS;
    convos = convos.filter((c) => c && c.ts >= cutoff && Array.isArray(c.messages));
    convos.sort((a, b) => b.ts - a.ts);
    if (convos.length > MAX_CONVOS) {
        convos.length = MAX_CONVOS;
    }
}

function currentConvo() {
    return convos.find((c) => c.id === currentId) || null;
}

function renderConvList() {
    const list = el("convList");
    list.textContent = "";
    if (convos.length === 0) {
        const empty = document.createElement("div");
        empty.className = "conv-empty";
        empty.textContent = "Noch keine Unterhaltungen.";
        list.appendChild(empty);
        return;
    }
    for (const c of convos) {
        const item = document.createElement("div");
        item.className = "conv" + (c.id === currentId ? " active" : "");
        const title = document.createElement("div");
        title.className = "conv-title";
        title.textContent = c.title || "Neue Unterhaltung";
        const date = document.createElement("div");
        date.className = "conv-date";
        const d = new Date(c.ts);
        date.textContent = d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" }) +
            ", " + d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) + " Uhr";
        const del = document.createElement("button");
        del.className = "conv-del";
        del.textContent = "✕";
        del.title = "Unterhaltung löschen";
        del.addEventListener("click", (e) => {
            e.stopPropagation();
            convos = convos.filter((x) => x.id !== c.id);
            if (currentId === c.id) {
                startNew(false);
            }
            persist();
            renderConvList();
        });
        item.appendChild(title);
        item.appendChild(date);
        item.appendChild(del);
        item.addEventListener("click", () => openConvo(c.id));
        list.appendChild(item);
    }
}

function renderMessages() {
    el("messages").textContent = "";
    for (const m of conversation) {
        if (m && typeof m.content === "string" && (m.role === "user" || m.role === "assistant")) {
            addBubble(m.role, m.content);
        }
    }
}

function openConvo(id) {
    const c = convos.find((x) => x.id === id);
    if (!c) {
        return;
    }
    currentId = id;
    conversation = c.messages;
    persist();
    renderConvList();
    renderMessages();
    if (window.innerWidth <= 640) {
        el("sidebar").classList.remove("open");
    }
    el("input").focus();
}

function startNew(focus) {
    currentId = null;
    conversation = [];
    el("messages").textContent = "";
    renderConvList();
    persist();
    if (focus !== false) {
        el("input").focus();
    }
}

// Unterhaltung wird erst beim ersten Senden angelegt (Titel = erste Frage)
function ensureConvo(firstText) {
    if (currentId && currentConvo()) {
        return;
    }
    const c = {
        id: "c" + Date.now() + "-" + Math.floor(Math.random() * 10000),
        title: firstText.slice(0, 42) + (firstText.length > 42 ? "…" : ""),
        ts: Date.now(),
        messages: conversation
    };
    convos.unshift(c);
    currentId = c.id;
}

// ---------------------------------------------------------------- Meta/Branding

function updateMeta() {
    chrome.storage.local.get({
        provider: "claude", claudeModel: "claude-haiku-4-5", openaiModel: "gpt-4o-mini",
        innogptModel: "gpt-5", azureDeployment: "",
        brandPrimary: "", brandAccent: "", brandIcon: ""
    }, (s) => {
        if (s.brandIcon) {
            const img = document.querySelector("header img");
            if (img) {
                img.src = s.brandIcon;
            }
            const fav = document.querySelector("link[rel='icon']");
            if (fav) {
                fav.href = s.brandIcon;
            }
        }
        if (s.brandPrimary) {
            const m = /^#?([0-9a-f]{6})$/i.exec(String(s.brandPrimary).trim());
            document.documentElement.style.setProperty("--klt-p", s.brandPrimary);
            if (m) {
                const n = parseInt(m[1], 16);
                const f = (v) => Math.max(0, Math.min(255, Math.round(v * 0.8)));
                const d = ((f((n >> 16) & 255) << 16) | (f((n >> 8) & 255) << 8) | f(n & 255));
                document.documentElement.style.setProperty("--klt-pd", "#" + d.toString(16).padStart(6, "0"));
            }
        }
        if (s.brandAccent) {
            document.documentElement.style.setProperty("--klt-a", s.brandAccent);
        }
        const provider = providerOverride || s.provider;
        const model = provider === "openai" ? s.openaiModel
            : (provider === "innogpt" ? s.innogptModel
                : (provider === "azure" ? (s.azureDeployment || "Deployment") : s.claudeModel));
        el("meta").textContent = provider + " · " + model;
    });
}

// ---------------------------------------------------------------- Senden

async function send() {
    if (busy) {
        return;
    }
    const input = el("input");
    const text = input.value.trim();
    if (!text) {
        return;
    }
    input.value = "";
    busy = true;
    el("send").disabled = true;

    ensureConvo(text);
    conversation.push({ role: "user", content: text });
    addBubble("user", text);
    const loading = addBubble("assistant loading", "denkt nach…");

    const payload = { type: "kiChat", messages: conversation.filter((m) => m.role === "user" || m.role === "assistant") };
    if (providerOverride) {
        payload.provider = providerOverride;
    }
    chrome.runtime.sendMessage(payload, (resp) => {
        loading.remove();
        busy = false;
        el("send").disabled = false;
        el("input").focus();

        if (chrome.runtime.lastError || !resp || !resp.ok) {
            conversation.pop(); // User-Nachricht zuruecknehmen, damit Retry sauber ist
            const err = chrome.runtime.lastError
                ? chrome.runtime.lastError.message
                : (resp && resp.error ? resp.error : "keine Antwort");
            addBubble("error", "Fehler: " + err);
            return;
        }
        conversation.push({ role: "assistant", content: resp.text });
        addBubble("assistant", resp.text);
        const c = currentConvo();
        if (c) {
            c.ts = Date.now();
            if (c.messages.length > MAX_MSGS) {
                c.messages.splice(0, c.messages.length - MAX_MSGS);
            }
        }
        pruneConvos();
        persist();
        renderConvList();
    });
}

// ---------------------------------------------------------------- Init

document.addEventListener("DOMContentLoaded", () => {
    updateMeta();
    el("send").addEventListener("click", send);
    el("input").addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            send();
        }
    });
    el("newChat").addEventListener("click", () => startNew(true));
    el("convToggle").addEventListener("click", () => {
        el("sidebar").classList.toggle("open");
    });

    chrome.storage.local.get({ chatConversations: null, chatHistory: null, chatCurrentId: null }, (s) => {
        convos = Array.isArray(s.chatConversations) ? s.chatConversations : [];
        // Migration: alter Einzel-Verlauf (chatHistory) -> eigene Unterhaltung
        if (!Array.isArray(s.chatConversations) && Array.isArray(s.chatHistory) && s.chatHistory.length > 0) {
            convos = [{ id: "c-migration", title: "Bisheriger Verlauf", ts: Date.now(), messages: s.chatHistory }];
            chrome.storage.local.remove("chatHistory");
        }
        pruneConvos();
        if (initialQuery) {
            // Uebergebene Frage: frische Unterhaltung, dann automatisch senden
            startNew(true);
            renderConvList();
            el("input").value = initialQuery;
            send();
            return;
        }
        const target = convos.find((c) => c.id === s.chatCurrentId) || convos[0];
        if (target) {
            openConvo(target.id);
        } else {
            startNew(true);
        }
    });
});
