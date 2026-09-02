// Version
// version = "1.1.0"  (Modul Clipper, klToolbox)
//
// Vorschau-/Export-Seite des Clippers: zeigt den per Readability
// extrahierten Artikel (bereinigt, ohne Werbung) und bietet Export als
// formatierte Kopie (OneNote/Word), Markdown, HTML-Datei, Druck/PDF und
// E-Mail - plus KI-Zusammenfassung/-Übersetzung. Alles lokal; KI nur auf
// Klick über den konfigurierten Anbieter (Zustimmung erforderlich).

let clip = null;

function el(id) {
    return document.getElementById(id);
}

function setStatus(msg, isError) {
    const s = el("status");
    s.textContent = msg || "";
    s.style.color = isError ? "#b3261e" : "#56646d";
}

// ---------------------------------------------------------------- Sanitizer
// Readability liefert bereinigtes HTML, trotzdem defensiv: Skripte, Frames
// und Event-Handler entfernen; Einbau ausschliesslich ueber DOM-Knoten
// (kein innerHTML-Assignment).
function sanitizeInto(target, html) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    doc.querySelectorAll("script, style, iframe, object, embed, form, input, button, select, textarea, link, meta, noscript").forEach((n) => n.remove());
    // Videos, Audio und Social-Media-Einbettungen raus - der Clip soll nur
    // Text und echte Inhaltsbilder enthalten
    doc.querySelectorAll(
        "video, audio, source, track, " +
        "blockquote.twitter-tweet, blockquote.instagram-media, blockquote.tiktok-embed, blockquote.reddit-embed-bq, " +
        "[class*='twitter-embed'], [class*='instagram-embed'], [class*='facebook-embed'], [class*='tiktok-embed'], " +
        "[class*='youtube-embed'], [class*='video-player'], [class*='video-embed'], [class*='social-embed'], " +
        "[data-service], [data-video-id]"
    ).forEach((n) => n.remove());
    // Leere Reste (Figures/Container, deren Inhalt entfernt wurde) aufraeumen
    doc.querySelectorAll("figure, div").forEach((n) => {
        if (!n.querySelector("img") && (n.textContent || "").trim().length === 0) {
            n.remove();
        }
    });
    for (const node of doc.body.querySelectorAll("*")) {
        for (const attr of Array.from(node.attributes)) {
            const name = attr.name.toLowerCase();
            if (name.indexOf("on") === 0) {
                node.removeAttribute(attr.name);
            } else if ((name === "href" || name === "src") && /^\s*javascript:/i.test(attr.value)) {
                node.removeAttribute(attr.name);
            }
        }
    }
    for (const child of Array.from(doc.body.childNodes)) {
        target.appendChild(document.importNode(child, true));
    }
}

// ---------------------------------------------------------------- Markdown
function htmlToMd(node) {
    let out = "";
    for (const child of node.childNodes) {
        if (child.nodeType === Node.TEXT_NODE) {
            out += child.nodeValue.replace(/\s+/g, " ");
            continue;
        }
        if (child.nodeType !== Node.ELEMENT_NODE) {
            continue;
        }
        const tag = child.tagName.toLowerCase();
        const inner = () => htmlToMd(child).trim();
        if (/^h[1-6]$/.test(tag)) {
            out += "\n\n" + "#".repeat(Number(tag.charAt(1))) + " " + inner() + "\n\n";
        } else if (tag === "p" || tag === "div" || tag === "section" || tag === "article" || tag === "figure") {
            out += "\n\n" + htmlToMd(child).trim() + "\n\n";
        } else if (tag === "br") {
            out += "\n";
        } else if (tag === "strong" || tag === "b") {
            out += "**" + inner() + "**";
        } else if (tag === "em" || tag === "i") {
            out += "*" + inner() + "*";
        } else if (tag === "code") {
            out += "`" + child.textContent + "`";
        } else if (tag === "pre") {
            out += "\n\n```\n" + child.textContent.replace(/\n$/, "") + "\n```\n\n";
        } else if (tag === "a") {
            const href = child.getAttribute("href") || "";
            out += href ? "[" + inner() + "](" + href + ")" : inner();
        } else if (tag === "img") {
            const src = child.getAttribute("src") || "";
            if (src) {
                out += "\n\n![" + (child.getAttribute("alt") || "") + "](" + src + ")\n\n";
            }
        } else if (tag === "li") {
            const ordered = child.parentElement && child.parentElement.tagName.toLowerCase() === "ol";
            out += "\n" + (ordered ? "1. " : "- ") + inner();
        } else if (tag === "ul" || tag === "ol") {
            out += "\n" + htmlToMd(child) + "\n";
        } else if (tag === "blockquote") {
            out += "\n\n> " + inner().replace(/\n/g, "\n> ") + "\n\n";
        } else if (tag === "figcaption") {
            out += "\n*" + inner() + "*\n";
        } else if (tag === "hr") {
            out += "\n\n---\n\n";
        } else {
            out += htmlToMd(child);
        }
    }
    return out;
}

function buildMarkdown() {
    return "# " + clip.title + "\n\n" +
        "Quelle: " + clip.url + (clip.byline ? " — " + clip.byline : "") + "\n" +
        htmlToMd(el("article")).replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

function buildStandaloneHtml() {
    return "<!DOCTYPE html>\n<html lang=\"de\"><head><meta charset=\"utf-8\">" +
        "<title>" + escapeHtml(clip.title) + "</title>" +
        "<style>body{font:16px/1.65 system-ui,sans-serif;max-width:760px;margin:40px auto;padding:0 16px;color:#222;}img{max-width:100%;height:auto;}pre{background:#f0f2f4;padding:12px;border-radius:8px;overflow-x:auto;}blockquote{border-left:4px solid #999;margin-left:0;padding-left:14px;color:#444;}</style>" +
        "</head><body><h1>" + escapeHtml(clip.title) + "</h1>" +
        "<p><a href=\"" + escapeHtml(clip.url) + "\">" + escapeHtml(clip.url) + "</a>" +
        (clip.byline ? " — " + escapeHtml(clip.byline) : "") + "</p>" +
        el("article").innerHTML +
        "</body></html>";
}

function escapeHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ---------------------------------------------------------------- Exporte

async function copyFormatted() {
    try {
        const html = "<h1>" + escapeHtml(clip.title) + "</h1>" +
            "<p><a href=\"" + escapeHtml(clip.url) + "\">" + escapeHtml(clip.url) + "</a></p>" +
            el("article").innerHTML;
        await navigator.clipboard.write([new ClipboardItem({
            "text/html": new Blob([html], { type: "text/html" }),
            "text/plain": new Blob([clip.title + "\n" + clip.url + "\n\n" + el("article").innerText], { type: "text/plain" })
        })]);
        setStatus("Formatiert kopiert - jetzt z. B. in OneNote/Word mit Strg+V einfügen.");
    } catch (err) {
        setStatus("Kopieren fehlgeschlagen: " + err.message, true);
    }
}

async function copyMarkdown() {
    try {
        await navigator.clipboard.writeText(buildMarkdown());
        setStatus("Markdown kopiert.");
    } catch (err) {
        setStatus("Kopieren fehlgeschlagen: " + err.message, true);
    }
}

function saveHtml() {
    const blob = new Blob([buildStandaloneHtml()], { type: "text/html;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = (clip.title || "artikel").replace(/[\\/:*?"<>|]+/g, "_").slice(0, 80) + ".html";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

// mailto: ist praktisch auf rund 2000 Zeichen GESAMT-URL begrenzt - Windows
// und Outlook schneiden darueber hinaus ab. Nach der Prozentkodierung bleiben
// von deutschem Text oft nur wenige hundert Zeichen uebrig; genau deshalb kam
// frueher eine fast leere Mail an. Loesung: Der Inhalt geht formatiert in die
// Zwischenablage, die Mail traegt nur Betreff und Quelle - eingefuegt wird
// mit Strg+V (dann bleibt auch die Formatierung erhalten).
const MAILTO_MAX = 1900;

function mailtoUrl(subject, body) {
    const bau = (b) => "mailto:?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(b);
    let text = body;
    let url = bau(text);
    while (url.length > MAILTO_MAX && text.length > 40) {
        text = text.slice(0, Math.floor(text.length * 0.8));
        url = bau(text + "\n[…]");
    }
    return url;
}

async function mailShare(text) {
    const inhalt = text || el("article").innerText;
    let kopiert = false;
    try {
        const rumpf = text
            ? "<p>" + escapeHtml(text).replace(/\n/g, "<br>") + "</p>"
            : "<h1>" + escapeHtml(clip.title) + "</h1>" + el("article").innerHTML;
        const html = rumpf + "<p>Quelle: <a href=\"" + escapeHtml(clip.url) + "\">" +
            escapeHtml(clip.url) + "</a></p>";
        await navigator.clipboard.write([new ClipboardItem({
            "text/html": new Blob([html], { type: "text/html" }),
            "text/plain": new Blob([inhalt + "\n\nQuelle: " + clip.url], { type: "text/plain" })
        })]);
        kopiert = true;
    } catch (err) {
        kopiert = false;
    }
    const body = kopiert
        ? "Inhalt bitte mit Strg+V einfügen.\n\nQuelle: " + clip.url
        : inhalt + "\n\nQuelle: " + clip.url;
    location.href = mailtoUrl(clip.title, body);
    setStatus(kopiert
        ? "E-Mail geöffnet – der formatierte Inhalt liegt in der Zwischenablage, bitte mit Strg+V einfügen."
        : "E-Mail geöffnet. Die Zwischenablage war nicht verfügbar, der Text wurde daher gekürzt.", !kopiert);
}

// PDF entsteht ueber den Druckdialog - eine eigene PDF-Erzeugung braeuchte
// eine grosse Bibliothek und wuerde den Text nur rastern. Der Dokumenttitel
// wird vorher gesetzt, weil Browser ihn als Dateinamen vorschlagen.
function exportPdf() {
    const alterTitel = document.title;
    document.title = (clip.title || "Artikel").replace(/[\\/:*?"<>|]+/g, "_").trim().slice(0, 80);
    setStatus("Druckdialog geöffnet – dort als Ziel „Als PDF speichern“ wählen.");
    window.print();
    setTimeout(() => {
        document.title = alterTitel;
    }, 1500);
}

// ---------------------------------------------------------------- KI

function kiTransform(task) {
    const lang = el("kiLang").value;
    const btn = task === "translate" ? el("kiTranslate") : el("kiSummary");
    const old = btn.textContent;
    btn.disabled = true;
    btn.textContent = "… arbeitet";
    setStatus("");
    chrome.runtime.sendMessage({ type: "kiTransform", task: task, lang: lang, text: clip.text || "" }, (resp) => {
        btn.disabled = false;
        btn.textContent = old;
        if (chrome.runtime.lastError || !resp || !resp.ok) {
            const err = chrome.runtime.lastError
                ? chrome.runtime.lastError.message
                : (resp && resp.error ? resp.error : "keine Antwort");
            setStatus("KI-Funktion fehlgeschlagen: " + err, true);
            return;
        }
        el("kiResult").textContent = resp.text;
        el("kiResult").style.display = "block";
        el("kiResultBar").style.display = "flex";
        window.scrollTo({ top: 0, behavior: "smooth" });
    });
}

// ---------------------------------------------------------------- Init

document.addEventListener("DOMContentLoaded", () => {
    // Branding
    chrome.storage.local.get({ brandPrimary: "", brandAccent: "", brandIcon: "", clipResult: null }, (s) => {
        const root = document.documentElement;
        if (s.brandPrimary) {
            root.style.setProperty("--klt-p", s.brandPrimary);
        }
        if (s.brandAccent) {
            root.style.setProperty("--klt-a", s.brandAccent);
        }
        if (s.brandIcon) {
            document.querySelectorAll("img[src='icon32.png']").forEach((i) => { i.src = s.brandIcon; });
            const fav = document.querySelector("link[rel='icon']");
            if (fav) {
                fav.href = s.brandIcon;
            }
        }

        clip = s.clipResult;
        if (!clip || clip.ok !== true) {
            const box = document.createElement("div");
            box.className = "error";
            box.textContent = "Clippen fehlgeschlagen: " +
                (clip && clip.error ? clip.error : "Kein Ergebnis vorhanden.") +
                " Hinweis: Auf Browser-internen Seiten (chrome://, Store) ist kein Zugriff möglich.";
            el("article").appendChild(box);
            return;
        }

        document.title = "✂ " + clip.title;
        const h1 = document.createElement("h1");
        h1.className = "title";
        h1.textContent = clip.title;
        const meta = document.createElement("div");
        meta.className = "meta";
        const a = document.createElement("a");
        a.href = clip.url;
        a.target = "_blank";
        a.rel = "noopener";
        a.textContent = clip.siteName || clip.url;
        meta.appendChild(a);
        if (clip.byline) {
            meta.appendChild(document.createTextNode(" — " + clip.byline));
        }
        el("article").appendChild(h1);
        el("article").appendChild(meta);
        sanitizeInto(el("article"), clip.content);
    });

    el("copyHtml").addEventListener("click", copyFormatted);
    el("copyMd").addEventListener("click", copyMarkdown);
    el("saveHtml").addEventListener("click", saveHtml);
    el("savePdf").addEventListener("click", exportPdf);
    el("printPage").addEventListener("click", () => window.print());
    el("mailShare").addEventListener("click", () => mailShare(null));
    el("kiSummary").addEventListener("click", () => kiTransform("summarize"));
    el("kiTranslate").addEventListener("click", () => kiTransform("translate"));
    el("kiCopy").addEventListener("click", async () => {
        try {
            await navigator.clipboard.writeText(el("kiResult").textContent);
            setStatus("KI-Ergebnis kopiert.");
        } catch (err) {
            setStatus("Kopieren fehlgeschlagen: " + err.message, true);
        }
    });
    el("kiMail").addEventListener("click", () => mailShare(el("kiResult").textContent));
    el("histToggle").addEventListener("click", () => {
        const panel = el("histPanel");
        if (panel.style.display !== "none") {
            panel.style.display = "none";
            return;
        }
        chrome.storage.local.get({ clipHistory: [] }, (s) => {
            const list = el("histList");
            list.textContent = "";
            const hist = Array.isArray(s.clipHistory) ? s.clipHistory : [];
            if (hist.length === 0) {
                list.textContent = "Noch keine geclippten Artikel.";
            }
            for (const h of hist) {
                if (!h || !h.url) {
                    continue;
                }
                const row = document.createElement("div");
                row.style.cssText = "padding:4px 0; border-bottom:1px solid #f0f2f4;";
                const date = document.createElement("span");
                date.style.cssText = "color:#6b7880; font-size:12px; margin-right:8px;";
                date.textContent = new Date(h.ts).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
                const a = document.createElement("a");
                a.href = h.url;
                a.target = "_blank";
                a.rel = "noopener";
                a.textContent = h.title || h.url;
                row.appendChild(date);
                row.appendChild(a);
                if (h.site) {
                    const site = document.createElement("span");
                    site.style.cssText = "color:#6b7880; font-size:12px; margin-left:8px;";
                    site.textContent = h.site;
                    row.appendChild(site);
                }
                list.appendChild(row);
            }
            panel.style.display = "block";
        });
    });
});
