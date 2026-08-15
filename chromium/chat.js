// Version
// version = "1.0.0"  (Modul KI-Chat, klToolbox)
// datum   = "2026-08-13"
// autor   = "Felix Kappen"
//
// Chat-Seite: nutzt den konfigurierten Anbieter (Optionen) ueber den
// Service Worker (Message "kiChat"). Verlauf wird in storage.local
// gespeichert (chatHistory) und beim Oeffnen wiederhergestellt;
// "Neuer Chat" loescht ihn. Bei Uebergabe per ?q= startet ein frischer
// Verlauf (Suchanfragen sollen sich nicht mit alten Chats mischen).

const conversation = []; // {role: "user"|"assistant", content: string}
let busy = false;

const HISTORY_MAX = 40; // gespeicherte Nachrichten (Paare zaehlen doppelt)

function saveHistory() {
    chrome.storage.local.set({ chatHistory: conversation.slice(-HISTORY_MAX) });
}

// Minimales Markdown fuer Assistenten-Antworten - bewusst als echte
// DOM-Knoten statt innerHTML (AMO flaggt innerHTML, textContent ist sicher):
// ```bloecke``` -> <pre>, `inline` -> <code>, **fett** -> <b>.
function renderMarkdownInto(el, text) {
    const blockRe = /```[a-z0-9]*\n?([\s\S]*?)```/gi;
    const src = String(text);
    let last = 0;
    let m;
    while ((m = blockRe.exec(src)) !== null) {
        if (m.index > last) {
            appendInlineMd(el, src.slice(last, m.index));
        }
        const pre = document.createElement("pre");
        pre.textContent = m[1].replace(/\n$/, "");
        el.appendChild(pre);
        last = m.index + m[0].length;
    }
    if (last < src.length) {
        appendInlineMd(el, src.slice(last));
    }
}

function appendInlineMd(el, text) {
    const re = /(\*\*[^*\n]+\*\*|`[^`\n]+`)/g;
    let last = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
        if (m.index > last) {
            el.appendChild(document.createTextNode(text.slice(last, m.index)));
        }
        const tok = m[0];
        if (tok.charAt(0) === "*") {
            const b = document.createElement("b");
            b.textContent = tok.slice(2, -2);
            el.appendChild(b);
        } else {
            const c = document.createElement("code");
            c.textContent = tok.slice(1, -1);
            el.appendChild(c);
        }
        last = m.index + m[0].length;
    }
    if (last < text.length) {
        el.appendChild(document.createTextNode(text.slice(last)));
    }
}

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

function updateMeta() {
    chrome.storage.local.get({ provider: "claude", claudeModel: "claude-haiku-4-5", openaiModel: "gpt-4o-mini", innogptModel: "gpt-5", brandPrimary: "", brandAccent: "", brandIcon: "" }, (s) => {
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
        // Branding (per Settings-Import) auf die CSS-Variablen anwenden
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
        const model = provider === "openai" ? s.openaiModel : (provider === "innogpt" ? s.innogptModel : s.claudeModel);
        el("meta").textContent = provider + " · " + model;
    });
}

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

    conversation.push({ role: "user", content: text });
    addBubble("user", text);
    const loading = addBubble("assistant loading", "denkt nach…");

    const payload = { type: "kiChat", messages: conversation };
    if (providerOverride) {
        payload.provider = providerOverride;
    }
    chrome.runtime.sendMessage(payload, (resp) => {
        loading.remove();
        busy = false;
        el("send").disabled = false;
        el("input").focus();

        if (chrome.runtime.lastError) {
            conversation.pop(); // User-Nachricht zuruecknehmen, damit Retry sauber ist
            addBubble("error", "Fehler: " + chrome.runtime.lastError.message);
            return;
        }
        if (!resp || !resp.ok) {
            conversation.pop();
            addBubble("error", "Fehler: " + (resp && resp.error ? resp.error : "keine Antwort"));
            return;
        }
        conversation.push({ role: "assistant", content: resp.text });
        addBubble("assistant", resp.text);
        saveHistory();
    });
}

document.addEventListener("DOMContentLoaded", () => {
    updateMeta();
    el("send").addEventListener("click", send);
    el("input").addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            send();
        }
    });
    el("newChat").addEventListener("click", () => {
        conversation.length = 0;
        el("messages").textContent = "";
        chrome.storage.local.remove("chatHistory");
        el("input").focus();
    });

    if (initialQuery) {
        // Uebergebene Frage (?q=...): frischer Verlauf, dann automatisch senden
        chrome.storage.local.remove("chatHistory");
        el("input").value = initialQuery;
        send();
    } else {
        // Gespeicherten Verlauf wiederherstellen
        chrome.storage.local.get({ chatHistory: [] }, (s) => {
            if (Array.isArray(s.chatHistory)) {
                for (const m of s.chatHistory) {
                    if (m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string") {
                        conversation.push(m);
                        addBubble(m.role, m.content);
                    }
                }
            }
        });
    }
});
