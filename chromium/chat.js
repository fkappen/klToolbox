// Version
// version = "1.0.0"  (Modul KI-Chat, klToolbox)
// datum   = "2026-08-13"
// autor   = "Felix Kappen"
//
// Chat-Seite: nutzt den konfigurierten Anbieter (Optionen) ueber den
// Service Worker (Message "kiChat"). Verlauf lebt nur im Tab.

const conversation = []; // {role: "user"|"assistant", content: string}
let busy = false;

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
    bubble.textContent = text;
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
        el("input").focus();
    });

    // Uebergebene Frage (?q=...) automatisch senden
    if (initialQuery) {
        el("input").value = initialQuery;
        send();
    }
});
