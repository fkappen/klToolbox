// Version
// version = "1.6.0"
// datum   = "2026-08-14"
// autor   = "Felix Kappen"
//
// Content-Script: Vorlagen-Button im Mail-Fenster des Ticketsystems
// (Host wird zur Laufzeit registriert, siehe background.js).
// Fuegt die gewaehlte Vorlage vor der Signatur bzw. am Cursor ein.

(function () {
    "use strict";

    // ------------------------------------------------- Branding (CSS-Variablen)
    // content.css nutzt var(--klt-p/-pd/-a/-ad) mit neutralen Fallbacks;
    // Firmenfarben kommen erst per Settings-Import (brandPrimary/brandAccent).
    function kltShade(hex, pct) {
        const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
        if (!m) {
            return hex;
        }
        const n = parseInt(m[1], 16);
        const f = (v) => Math.max(0, Math.min(255, Math.round(v * (1 + pct))));
        const r = f((n >> 16) & 255), g = f((n >> 8) & 255), b = f(n & 255);
        return "#" + ((r << 16) | (g << 8) | b).toString(16).padStart(6, "0");
    }

    function kltApplyBrand(items) {
        const root = document.documentElement;
        if (items.brandPrimary) {
            root.style.setProperty("--klt-p", items.brandPrimary);
            root.style.setProperty("--klt-pd", kltShade(items.brandPrimary, -0.2));
        }
        if (items.brandAccent) {
            root.style.setProperty("--klt-a", items.brandAccent);
            root.style.setProperty("--klt-ad", kltShade(items.brandAccent, -0.2));
        }
    }

    chrome.storage.local.get({ brandPrimary: "", brandAccent: "" }, kltApplyBrand);
    chrome.storage.onChanged.addListener((ch, area) => {
        if (area === "local" && (ch.brandPrimary || ch.brandAccent)) {
            chrome.storage.local.get({ brandPrimary: "", brandAccent: "" }, kltApplyBrand);
        }
    });

    // Hinweis: Die Vorlagen enthalten bewusst KEINE Grussformel am Ende,
    // da die Signatur im Ticketsystem bereits im Textfeld steht.
    const DEFAULT_TEMPLATES = [
        {
            name: "Eingangsbestätigung",
            text: "Guten Tag {anrede},\n\nvielen Dank für Ihre Nachricht. Ihr Anliegen ist bei uns eingegangen und wurde als Ticket aufgenommen.\n\nWir kümmern uns schnellstmöglich darum und melden uns, sobald es Neuigkeiten gibt."
        },
        {
            name: "Rückfrage – Informationen benötigt",
            text: "Guten Tag {anrede},\n\nvielen Dank für Ihre Meldung. Um das Anliegen zielgerichtet bearbeiten zu können, benötigen wir noch folgende Informationen:\n\n- Betroffener Benutzer / Rechnername:\n- Seit wann tritt das Verhalten auf?\n- Tritt das Problem dauerhaft oder nur sporadisch auf?\n- Gibt es eine Fehlermeldung (gerne als Screenshot)?\n\nVielen Dank vorab für Ihre Rückmeldung."
        },
        {
            name: "Performance – Rückfragen zur Analyse",
            text: "Guten Tag {anrede},\n\nvielen Dank für Ihre Meldung. Damit wir die Ursache der Verlangsamung gezielt eingrenzen können, benötigen wir noch einige Angaben:\n\n- Wen betrifft es? (einzelner Benutzer, mehrere oder alle)\n- Wann tritt es auf? (dauerhaft, zu bestimmten Uhrzeiten, seit wann)\n- In welchen Anwendungen macht es sich bemerkbar? (z. B. DATEV, Outlook, Browser – oder generell)\n- Wie äußert es sich: startet die Anwendung langsam oder reagieren Eingaben verzögert?\n\nJe genauer die Angaben, desto schneller finden wir die Ursache. Vielen Dank vorab für Ihre Rückmeldung."
        },
        {
            name: "Fernwartung anbieten",
            text: "Guten Tag {anrede},\n\nzur weiteren Analyse würden wir uns gerne per Fernwartung auf das betroffene System aufschalten.\n\nBitte teilen Sie uns kurz mit, wann es Ihnen passt und unter welcher Rufnummer wir Sie am besten erreichen. Alternativ können Sie uns auch direkt anrufen – wir schalten uns dann gemeinsam auf."
        },
        {
            name: "Zwischenbescheid",
            text: "Guten Tag {anrede},\n\nein kurzer Zwischenstand zu Ihrem Ticket: Das Thema ist bei uns in Bearbeitung.\n\n[Aktueller Stand / nächste Schritte]\n\nWir melden uns, sobald es Neuigkeiten gibt. Vielen Dank für Ihre Geduld."
        },
        {
            name: "Homeoffice / VPN – instabile Verbindung",
            text: "Guten Tag {anrede},\n\nnach Ihrer Beschreibung spricht vieles dafür, dass die Ursache in einer instabilen Internet- bzw. WLAN-Verbindung liegt.\n\nFalls möglich, testen Sie die Verbindung bitte einmal über ein Netzwerkkabel, um das WLAN als Fehlerquelle auszuschließen.\n\nDass normales Surfen funktioniert, ist dabei leider kein aussagekräftiges Kriterium: Webanwendungen gleichen kurze Verbindungsunterbrechungen oder Paketverluste in der Regel unbemerkt durch erneute Übertragungen aus. Eine VPN-Verbindung im Homeoffice reagiert darauf deutlich empfindlicher – bereits kurze Abbrüche können dazu führen, dass der Tunnel getrennt und neu aufgebaut werden muss.\n\nSollte das Problem auch mit Netzwerkkabel weiterhin auftreten, prüfen wir die Ursache gerne gemeinsam weiter."
        },
        {
            name: "Gelöst / Ticket schließen",
            text: "Guten Tag {anrede},\n\ndas Anliegen ist aus unserer Sicht gelöst, daher schließen wir das Ticket.\n\nSollte das Problem erneut auftreten oder noch etwas offen sein, melden Sie sich gerne jederzeit – wir öffnen das Ticket dann wieder.\n\nVielen Dank für die gute Zusammenarbeit."
        },
        {
            name: "Erinnerung – keine Rückmeldung",
            text: "Guten Tag {anrede},\n\nzu Ihrem Ticket hatten wir Ihnen eine Rückfrage gestellt, bisher jedoch keine Rückmeldung erhalten. Gerne möchten wir das Anliegen für Sie weiterbearbeiten – eine kurze Rückinfo genügt.\n\nSollten wir in den nächsten Tagen nichts von Ihnen hören, schließen wir das Ticket vorsorglich. Sie können es jederzeit durch eine Antwort wieder öffnen."
        }
    ];

    // Eintrags-Vorlagen: eigene, kuerzere Liste fuer interne Ticket-Eintraege
    const DEFAULT_ENTRY_TEMPLATES = [
        { name: "Nicht erreicht", text: "Kunde telefonisch nicht erreicht ({datum}, {zeit})." },
        { name: "Rückruf erledigt", text: "Rückruf mit dem Kunden erfolgt ({datum}, {zeit}). Ergebnis:\n- " },
        { name: "Arbeiten abgeschlossen", text: "Arbeiten abgeschlossen und mit dem Kunden abgestimmt ({datum})." },
        { name: "Warte auf Rückmeldung", text: "Warte auf Rückmeldung des Kunden (angefragt am {datum})." }
    ];

    // Nur im Frame mit sichtbaren Eingabefeldern oder im Top-Frame Button anzeigen -
    // der Panel-Code laeuft aber in jedem Frame, damit das Einfuegen dort klappt,
    // wo der Editor tatsaechlich liegt.
    let lastTarget = null;      // Element (input/textarea/contenteditable)
    let lastRange = null;       // Range fuer contenteditable
    let panelOpen = false;
    let panelEditor = null;     // Editor des Mail-Fensters, aus dem das Panel geoeffnet wurde
    let panelKind = "mail";     // "mail" = Mail-Vorlagen, "entry" = Eintrags-Vorlagen

    // ---------------------------------------------------------- Fokus-Tracking

    document.addEventListener("focusin", (e) => {
        const el = e.target;
        if (isEditable(el)) {
            lastTarget = el;
        }
    });

    document.addEventListener("selectionchange", () => {
        if (lastTarget && isContentEditable(lastTarget)) {
            const sel = window.getSelection();
            if (sel && sel.rangeCount > 0) {
                const range = sel.getRangeAt(0);
                if (lastTarget.contains(range.startContainer)) {
                    lastRange = range.cloneRange();
                }
            }
        }
    });

    function isEditable(el) {
        if (!el || el.closest && el.closest("#__vorlagen_panel, #__vorlagen_btn")) {
            return false;
        }
        if (el.tagName === "TEXTAREA") {
            return true;
        }
        if (el.tagName === "INPUT" && /^(text|search)$/i.test(el.type)) {
            return true;
        }
        return isContentEditable(el);
    }

    function isContentEditable(el) {
        return !!(el && el.isContentEditable);
    }

    // ---------------------------------------------------------- Einfuegen

    function applyPlaceholders(text, editor) {
        const now = new Date();
        const datum = now.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
        const zeit = now.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
        let out = text
            .replace(/\{datum\}/gi, datum)
            .replace(/\{zeit\}/gi, zeit + " Uhr");
        if (/\{anrede\}/i.test(out)) {
            const anrede = buildAnrede(editor);
            // Ohne Empfaenger faellt der Platzhalter samt fuehrendem
            // Leerzeichen weg: "Guten Tag {anrede}," -> "Guten Tag,"
            out = out.replace(/ ?\{anrede\}/gi, anrede ? " " + anrede : "");
        }
        return out;
    }

    // ---------------------------------------------------------- Anrede

    // Haeufige deutsche Vornamen fuer die Anrede-Erkennung. Bewusst
    // konservativ: Ist der Vorname nicht eindeutig zuzuordnen, wird NICHT
    // geraten, sondern neutral der volle Name verwendet
    // ("Guten Tag Jasmin Schneiss,").
    const VORNAMEN_W = new Set(("andrea anja anna anne annette angelika alexandra astrid barbara bettina birgit " +
        "brigitte carina carmen christa christiane christina christine claudia cornelia daniela diana doris elke " +
        "erika eva franziska gabi gabriele gisela hanna hannah heike helga ilona ines inge ingrid iris jana janina " +
        "jasmin jennifer jessica julia jutta karin katharina kathrin katja katrin kerstin kirsten kristin laura lea " +
        "lena lisa manuela maria marie marina marion martina melanie michaela monika nadine nicole petra pia regina " +
        "renate rita sabine sabrina sandra sara sarah silke simone sonja sophie stefanie steffi susanne svenja tanja " +
        "tatjana ulrike ursula ute vanessa vera verena viktoria yvonne").split(" "));
    const VORNAMEN_M = new Set(("alexander andre andreas armin axel bernd bernhard bjoern björn carsten christian " +
        "christoph daniel david dennis dieter dirk dominik erik fabian felix florian frank franz georg gerd gerhard " +
        "guenter günter hans harald heiko heinz helmut henning holger horst ingo jan jens joachim jochen johannes " +
        "jonas joerg jörg juergen jürgen kai karl karsten kevin klaus kurt lars lukas manfred marc marcel marco " +
        "marcus mario mark markus martin matthias max maximilian michael mike nico niklas nils norbert olaf oliver " +
        "pascal patrick paul peter philipp rainer ralf reiner rene robert roland rolf rudolf sascha sebastian simon " +
        "stefan steffen sven thomas thorsten timo tobias torsten udo ulrich uwe volker walter werner wolfgang").split(" "));

    // Ersten Empfaenger aus dem An-Feld des Mail-Fensters lesen. Die
    // Empfaenger-Chips tragen den Text "Name <mail@domain>"; gesucht wird
    // im Fenster-Container oberhalb des Editors (Text enthaelt "An:").
    function extractRecipient(editor) {
        let root = null;
        let node = editor ? editor.parentElement : null;
        let depth = 0;
        while (node && node !== document.body && depth < 10) {
            if ((node.textContent || "").includes("An:")) {
                root = node;
                break;
            }
            node = node.parentElement;
            depth++;
        }
        if (!root) {
            root = document.body;
        }
        const re = /^(.{2,60}?)\s*<[^<>\s]+@[^<>\s]+>$/;
        for (const el of root.querySelectorAll("span, div")) {
            if (el.childElementCount > 1) {
                continue;
            }
            const m = re.exec((el.textContent || "").trim());
            if (m) {
                return m[1].trim();
            }
        }
        return "";
    }

    // "Jasmin Schneiss" -> "Frau Schneiss"; unbekannter Vorname -> voller Name
    function buildAnrede(editor) {
        const name = extractRecipient(editor);
        if (!name) {
            return "";
        }
        const tokens = name.split(/\s+/).filter((t) => !/^(dr|prof|dipl|mag|med)\.?$/i.test(t));
        if (tokens.length < 2) {
            return name;
        }
        const vorname = tokens[0].toLowerCase();
        const nachname = tokens[tokens.length - 1];
        if (VORNAMEN_W.has(vorname)) {
            return "Frau " + nachname;
        }
        if (VORNAMEN_M.has(vorname)) {
            return "Herr " + nachname;
        }
        return name;
    }

    function insertTemplate(rawText) {
        const isVisibleEl = (e) => {
            const r = e.getBoundingClientRect();
            return r.width > 0 && r.height > 0;
        };

        // Ziel ist IMMER der Mail-Editor (Zuordnung ueber das Panel), NICHT das
        // zuletzt fokussierte Element: Stand der Fokus in An/Cc/Betreff oder war
        // der Editor geblurrt, landete die Vorlage sonst im falschen Feld bzw.
        // an einer veralteten Cursor-Position (Bug 2026-08-14).
        let target = null;
        if (panelEditor && panelEditor.isConnected && isVisibleEl(panelEditor)) {
            target = panelEditor;
        } else {
            target = Array.from(document.querySelectorAll(".ck-editor__editable")).find(isVisibleEl) || null;
        }

        if (!target) {
            // Kein CKEditor vorhanden: letztes fokussiertes Eingabefeld nutzen
            const text0 = applyPlaceholders(rawText, null);
            if (lastTarget && lastTarget.isConnected &&
                (lastTarget.tagName === "TEXTAREA" || lastTarget.tagName === "INPUT")) {
                const el = lastTarget;
                el.focus();
                const start = (typeof el.selectionStart === "number") ? el.selectionStart : el.value.length;
                const end = (typeof el.selectionEnd === "number") ? el.selectionEnd : el.value.length;
                el.setRangeText(text0, start, end, "end");
                el.dispatchEvent(new Event("input", { bubbles: true }));
                el.dispatchEvent(new Event("change", { bubbles: true }));
                return;
            }
            showHint("Bitte zuerst in das Textfeld klicken, dann Vorlage wählen.");
            return;
        }

        const text = applyPlaceholders(rawText, target);
        lastTarget = target;
        // Gemerkte Cursor-Position nur verwenden, wenn sie IM Ziel-Editor liegt -
        // sonst am ANFANG einfuegen (vor der Signatur, die bereits im Feld steht).
        if (!(lastRange && lastRange.startContainer.isConnected && target.contains(lastRange.startContainer))) {
            const startRange = document.createRange();
            startRange.selectNodeContents(target);
            startRange.collapse(true);
            lastRange = startRange;
        }

        // Fall 2: contenteditable
        // Mehrstufig, jede Stufe wird VERIFIZIERT (execCommand kann "true"
        // melden, obwohl der Editor die synthetische Eingabe verworfen hat):
        //   1. execCommand("insertText")           - normale Editier-Pipeline
        //   2. synthetisches Paste-Event           - viele Editoren verarbeiten paste selbst
        //   3. zeilenweise insertText/LineBreak
        //   4. rohe DOM-Manipulation
        //   5. Zwischenablage + Hinweis "Strg+V"   - funktioniert immer
        if (isContentEditable(lastTarget)) {
            try {
                const el = lastTarget;
                el.focus();
                const before = contentLength(el);

                restoreSelection(el);
                let stage = "";

                // CKEditor 5 (Ticketsystem): verwirft insertText grundsaetzlich,
                // verarbeitet aber Paste-Events sauber -> direkt Stufe 2.
                const isCkEditor = !!el.closest(".ck-editor__editable");

                if (!isCkEditor) {
                    try {
                        document.execCommand("insertText", false, text);
                    } catch (err) {
                        console.warn("Ticket-Vorlagen: insertText-Fehler:", err);
                    }
                    if (contentLength(el) > before) {
                        stage = "insertText";
                    }
                }

                if (!stage) {
                    restoreSelection(el);
                    tryPasteEvent(el, text);
                    if (contentLength(el) > before) {
                        stage = "paste-event";
                    }
                }

                if (!stage) {
                    restoreSelection(el);
                    insertLineByLine(text);
                    if (contentLength(el) > before) {
                        stage = "zeilenweise";
                    }
                }

                if (!stage) {
                    const range = restoreSelection(el);
                    insertViaDom(range, window.getSelection(), text);
                    if (contentLength(el) > before) {
                        stage = "dom";
                    }
                }

                if (!stage) {
                    copyToClipboard(text);
                    return;
                }

                logTargetInfo(el, stage);

                // Cursor-Position fuer weitere Einfuegungen aktualisieren
                const selNow = window.getSelection();
                if (selNow && selNow.rangeCount > 0) {
                    lastRange = selNow.getRangeAt(0).cloneRange();
                }

                // Nachpruefung: React-basierte Editoren verwerfen fremde DOM-/
                // Pipeline-Eingaben teils beim naechsten Rendern wieder.
                scheduleWipeCheck(el, before, text);
            } catch (err) {
                console.error("Ticket-Vorlagen: Einfügen fehlgeschlagen:", err);
                copyToClipboard(text);
            }
            return;
        }

        showHint("Kein Eingabefeld erkannt - bitte in das Textfeld klicken.");
    }

    // Sichtbarer Textinhalt als Laengen-Messwert fuer die Einfuege-Verifikation
    function contentLength(el) {
        return (el.innerText || el.textContent || "").length;
    }

    // Diagnose: welches Element wurde beschrieben, ist es sichtbar, welcher Frame?
    function logTargetInfo(el, stage) {
        const r = el.getBoundingClientRect();
        console.info(
            "Ticket-Vorlagen: eingefügt via " + stage,
            "| Ziel:", el.tagName + (el.id ? "#" + el.id : "") + (el.className ? "." + String(el.className).split(" ").join(".") : ""),
            "| sichtbar:", (r.width > 0 && r.height > 0),
            "| Inhalt jetzt:", contentLength(el), "Zeichen",
            "| Frame:", location.href
        );
    }

    // Nachpruefung nach ~0,7s: Hat der Editor den Text wieder verworfen?
    // Falls ja: Paste-Event nachschieben, sonst Zwischenablage als Rettung.
    function scheduleWipeCheck(el, before, text) {
        setTimeout(() => {
            if (contentLength(el) > before) {
                return; // Text ist noch da - alles gut
            }
            console.warn("Ticket-Vorlagen: Editor hat den eingefügten Text wieder verworfen (vermutlich React-State). Versuche Paste-Event…");
            el.focus();
            restoreSelection(el);
            tryPasteEvent(el, text);
            setTimeout(() => {
                if (contentLength(el) > before) {
                    console.info("Ticket-Vorlagen: eingefügt via paste-event (2. Versuch nach Verwerfen)");
                } else {
                    copyToClipboard(text);
                }
            }, 700);
        }, 700);
    }

    // Selektion auf die gemerkte Cursor-Position setzen (robust gegen
    // zwischenzeitliche DOM-Aenderungen); gibt die aktive Range zurueck.
    function restoreSelection(el) {
        const sel = window.getSelection();
        let range = null;
        if (lastRange && lastRange.startContainer.isConnected && el.contains(lastRange.startContainer)) {
            range = lastRange;
        } else if (sel && sel.rangeCount > 0 && el.contains(sel.getRangeAt(0).startContainer)) {
            range = sel.getRangeAt(0);
        } else {
            range = document.createRange();
            range.selectNodeContents(el);
            range.collapse(false);
        }
        try {
            sel.removeAllRanges();
            sel.addRange(range);
        } catch (err) {
            console.warn("Ticket-Vorlagen: Selektion konnte nicht gesetzt werden:", err);
        }
        return range;
    }

    // Vorlagentext -> HTML mit expliziten Absaetzen.
    // Leere Zeilen werden zu <p>&nbsp;</p>, damit CKEditor sie nicht kollabiert.
    function textToHtml(text) {
        const esc = (s) => s
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
        return text
            .split("\n")
            .map((line) => line.trim().length === 0 ? "<p>&nbsp;</p>" : "<p>" + esc(line) + "</p>")
            .join("");
    }

    // Synthetisches Paste-Event - Editoren mit eigenem Paste-Handler (z. B.
    // CKEditor 5) uebernehmen den Inhalt ueber ihre Clipboard-Pipeline.
    // text/html mit expliziten Absaetzen erhaelt die Leerzeilen; text/plain
    // liegt als Fallback fuer einfache Editoren bei.
    function tryPasteEvent(el, text) {
        try {
            const dt = new DataTransfer();
            dt.setData("text/html", textToHtml(text));
            dt.setData("text/plain", text);
            const ev = new ClipboardEvent("paste", {
                clipboardData: dt,
                bubbles: true,
                cancelable: true
            });
            el.dispatchEvent(ev);
        } catch (err) {
            console.warn("Ticket-Vorlagen: Paste-Event fehlgeschlagen:", err);
        }
    }

    // Letzte Rettung: Vorlage in die Zwischenablage, Nutzer fuegt per Strg+V ein
    // (echtes Paste ist "trusted" und wird von jedem Editor korrekt verarbeitet).
    function copyToClipboard(text) {
        navigator.clipboard.writeText(text).then(() => {
            showHint("Direktes Einfügen nicht möglich - Vorlage wurde in die Zwischenablage kopiert. Bitte mit Strg+V einfügen.");
        }).catch(() => {
            showHint("Einfügen fehlgeschlagen. Bitte Vorlage in den Optionen kopieren.");
        });
    }

    // Zeilenweise ueber die Editier-Pipeline einfuegen:
    // Text via insertText, Umbrueche via insertLineBreak.
    function insertLineByLine(text) {
        const lines = text.split("\n");
        try {
            for (let i = 0; i < lines.length; i++) {
                if (i > 0) {
                    if (!document.execCommand("insertLineBreak")) {
                        return false;
                    }
                }
                if (lines[i].length > 0) {
                    if (!document.execCommand("insertText", false, lines[i])) {
                        return false;
                    }
                }
            }
            return true;
        } catch (err) {
            console.warn("Ticket-Vorlagen: zeilenweises Einfuegen fehlgeschlagen:", err);
            return false;
        }
    }

    // Letzter Fallback: rohe DOM-Manipulation (Textknoten + <br>).
    function insertViaDom(range, sel, text) {
        range.deleteContents();
        const lines = text.split("\n");
        const frag = document.createDocumentFragment();
        let lastNode = null;
        lines.forEach((line, i) => {
            if (i > 0) {
                lastNode = document.createElement("br");
                frag.appendChild(lastNode);
            }
            if (line.length > 0) {
                lastNode = document.createTextNode(line);
                frag.appendChild(lastNode);
            }
        });
        range.insertNode(frag);

        if (lastNode && sel) {
            const after = document.createRange();
            after.setStartAfter(lastNode);
            after.collapse(true);
            sel.removeAllRanges();
            sel.addRange(after);
        }
        if (lastTarget) {
            lastTarget.dispatchEvent(new InputEvent("input", { bubbles: true }));
        }
    }

    // ---------------------------------------------------------- UI

    // Die Leiste des "Email senden"-Fensters finden: sie enthaelt die Aktionen
    // Senden / Anhang hinzufuegen / Verwerfen / Kopie an mich. Es gibt dort
    // KEINE ap-toolbar - deshalb Suche ueber die stabilen Beschriftungen:
    // vom "Verwerfen"-Element aufwaerts bis zum Container, der auch "Senden"
    // enthaelt (= die Toolbar-Zeile). Liefert [{bar, editor}].
    function findMailToolbars() {
        const results = [];
        const seen = new Set();
        const leaves = Array.from(document.querySelectorAll("button, a, span, div")).filter((el) =>
            el.childElementCount <= 1 && /^\s*Verwerfen\s*$/.test(el.textContent || "")
        );
        for (const leaf of leaves) {
            let bar = leaf.parentElement;
            let depth = 0;
            while (bar && depth < 6) {
                const txt = bar.textContent || "";
                if (txt.includes("Senden") && (txt.includes("Anhang") || txt.includes("Kopie an mich"))) {
                    break;
                }
                bar = bar.parentElement;
                depth++;
            }
            if (!bar || depth >= 6 || seen.has(bar)) {
                continue;
            }
            seen.add(bar);
            // Zugehoerigen Editor im selben Fenster suchen (aufwaerts)
            let node = bar;
            let editor = null;
            let d2 = 0;
            while (node && d2 < 8) {
                editor = node.querySelector(".ck-editor__editable");
                if (editor) {
                    break;
                }
                node = node.parentElement;
                d2++;
            }
            results.push({ bar: bar, editor: editor });
        }
        return results;
    }

    // Ist irgendwo ein "Email senden"-Fenster offen? (Titelzeile)
    function mailWindowOpen() {
        return Array.from(document.querySelectorAll("div, span")).some((el) =>
            el.childElementCount === 0 && /^\s*Email senden\s*$/.test(el.textContent || "")
        );
    }

    function ensureButtons() {
        const toolbars = findMailToolbars();

        // Buttons in nicht (mehr) zustaendigen Mail-Leisten entfernen
        // (Eintrags-Buttons __vorlagen_ebtn haben eigene Aufraeum-Logik)
        for (const b of document.querySelectorAll(".__vorlagen_tbtn, .__ki_draft_tbtn")) {
            if (b.classList.contains("__vorlagen_ebtn")) {
                continue;
            }
            if (!toolbars.some((t) => t.bar.contains(b))) {
                b.remove();
            }
        }

        for (const t of toolbars) {
            const mailBtn = Array.from(t.bar.querySelectorAll(".__vorlagen_tbtn"))
                .find((b) => !b.classList.contains("__ki_draft_tbtn"));
            if (ft.ftVorlagenMail !== false && !mailBtn) {
                const btn = document.createElement("button");
                btn.type = "button";
                btn.className = "__vorlagen_tbtn";
                btn.title = "Textvorlagen einfügen";
                btn.textContent = "📋 Vorlagen";
                btn.__editor = t.editor || null;
                btn.addEventListener("mousedown", (e) => e.preventDefault()); // Fokus im Editor lassen
                btn.addEventListener("click", () => togglePanel(btn));
                t.bar.appendChild(btn);
            } else if (ft.ftVorlagenMail === false && mailBtn) {
                mailBtn.remove();
            }
            const kiBtn = t.bar.querySelector(".__ki_draft_tbtn");
            if (ft.ftKiAntwort !== false && !kiBtn) {
                const kBtn = document.createElement("button");
                kBtn.type = "button";
                kBtn.className = "__vorlagen_tbtn __ki_draft_tbtn";
                kBtn.title = "KI liest den sichtbaren Ticketverlauf und entwirft eine Antwort (mit Anrede, vor der Signatur eingefügt)";
                kBtn.textContent = "✨ KI-Antwort";
                kBtn.__editor = t.editor || null;
                kBtn.addEventListener("mousedown", (e) => e.preventDefault());
                kBtn.addEventListener("click", () => draftReply(kBtn));
                t.bar.appendChild(kBtn);
            } else if (ft.ftKiAntwort === false && kiBtn) {
                kiBtn.remove();
            }
        }

        ensureEntryButtons();

        const floating = document.getElementById("__vorlagen_btn");
        if (toolbars.length > 0) {
            if (floating) {
                floating.remove();
            }
        } else if (mailWindowOpen()) {
            // Mail-Fenster offen, aber Leiste nicht erkannt -> Fallback
            buildFloatingButton();
        } else if (floating) {
            floating.remove();
        }
    }

    // ------------------------------------------- Vorlagen im Eintrags-Editor
    // Eintragsformular = sichtbarer CKEditor mit "Speichern"-Button im Umfeld
    // (Mail-Fenster: Senden/Verwerfen OHNE Speichern -> ausgeschlossen).
    // Der Vorlagen-Button wird direkt vor den Speichern-Button gesetzt.
    function ensureEntryButtons() {
        if (ft.ftVorlagenEintrag === false) {
            document.querySelectorAll(".__vorlagen_ebtn").forEach((b) => b.remove());
            return;
        }
        const isVis = (e) => {
            const r = e.getBoundingClientRect();
            return r.width > 0 && r.height > 0;
        };
        // Verwaiste Eintrags-Buttons entfernen (Editor weg/neu gerendert)
        for (const b of document.querySelectorAll(".__vorlagen_ebtn")) {
            if (!b.__editor || !b.__editor.isConnected) {
                b.remove();
            }
        }
        for (const ed of document.querySelectorAll(".ck-editor__editable")) {
            if (!isVis(ed)) {
                continue;
            }
            let node = ed.parentElement;
            let saveBtn = null;
            let depth = 0;
            while (node && node !== document.body && depth < 10) {
                const t = node.textContent || "";
                if (t.includes("Verwerfen") && t.includes("Senden") && !t.includes("Speichern")) {
                    break; // Mail-Fenster
                }
                saveBtn = Array.from(node.querySelectorAll("button")).find((b) =>
                    (b.textContent || "").trim() === "Speichern" && isVis(b)
                ) || null;
                if (saveBtn) {
                    break;
                }
                node = node.parentElement;
                depth++;
            }
            if (!saveBtn || !saveBtn.parentElement) {
                continue;
            }
            if (saveBtn.parentElement.querySelector(".__vorlagen_ebtn")) {
                continue;
            }
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "__vorlagen_tbtn __vorlagen_ebtn";
            btn.title = "Eintrags-Vorlagen einfügen (eigene Liste, Optionen → Eintrags-Vorlagen)";
            btn.textContent = "📋 Vorlagen";
            btn.__editor = ed;
            btn.__kind = "entry";
            btn.addEventListener("mousedown", (e) => e.preventDefault());
            btn.addEventListener("click", (e) => {
                e.preventDefault();
                togglePanel(btn);
            });
            saveBtn.parentElement.insertBefore(btn, saveBtn);
        }
    }

    // ------------------------------------------- KI-Antwortentwurf

    // Sichtbaren Ticketverlauf einsammeln: Eintrags-Header ("... aktualisiert
    // am <strong>Fr. 14.08.2026</strong> ...") -> umgebender Eintrags-Container.
    // Heuristisch, aber failsafe: schlimmstenfalls fehlt Kontext.
    function collectTicketHistory() {
        const dateRe = /^(?:Mo|Di|Mi|Do|Fr|Sa|So)\.\s*\d{1,2}\.\d{1,2}\.\d{4}$/;
        const blocks = [];
        const used = [];
        for (const s of document.querySelectorAll("strong")) {
            if (!dateRe.test((s.textContent || "").trim())) {
                continue;
            }
            const header = s.parentElement;
            if (!header || !(header.textContent || "").includes("aktualisiert am")) {
                continue;
            }
            // Container: aufwaerts, bis deutlich mehr Text als der Header allein
            let container = header;
            let depth = 0;
            while (container.parentElement && depth < 4) {
                const parent = container.parentElement;
                if ((parent.innerText || "").length > (header.innerText || "").length + 60) {
                    container = parent;
                    break;
                }
                container = parent;
                depth++;
            }
            if (used.some((u) => u === container || u.contains(container) || container.contains(u))) {
                continue;
            }
            used.push(container);
            let txt = (container.innerText || "").replace(/\n{3,}/g, "\n\n").trim();
            if (txt.length > 1500) {
                txt = txt.slice(0, 1500) + " […]";
            }
            blocks.push(txt);
        }
        let history = blocks.join("\n\n--- naechster Eintrag ---\n\n");
        if (history.length > 12000) {
            history = history.slice(0, 12000) + " […]";
        }
        return history;
    }

    function draftReply(btn) {
        if (btn.__busy) {
            return;
        }
        const history = collectTicketHistory();
        if (!history) {
            showHint("Kein Ticketverlauf gefunden - KI-Antwort braucht sichtbare Ticket-Einträge.");
            return;
        }
        btn.__busy = true;
        const old = btn.textContent;
        btn.textContent = "✨ entwirft…";
        chrome.runtime.sendMessage({ type: "kiDraft", history: history }, (resp) => {
            btn.__busy = false;
            btn.textContent = old;
            if (chrome.runtime.lastError || !resp || !resp.ok) {
                const err = chrome.runtime.lastError
                    ? chrome.runtime.lastError.message
                    : (resp && resp.error ? resp.error : "keine Antwort");
                showHint("KI-Antwort fehlgeschlagen: " + err);
                return;
            }
            // Anrede deterministisch selbst voranstellen (kein KI-Raten)
            const anrede = buildAnrede(btn.__editor);
            const greeting = anrede ? "Guten Tag " + anrede + "," : "Guten Tag,";
            panelEditor = btn.__editor || null;
            insertTemplate(greeting + "\n\n" + String(resp.text).trim());
        });
    }

    function buildFloatingButton() {
        if (document.getElementById("__vorlagen_btn")) {
            return;
        }
        const btn = document.createElement("button");
        btn.id = "__vorlagen_btn";
        btn.type = "button";
        btn.title = "Textvorlagen einfügen";
        btn.textContent = "📋 Vorlagen";
        btn.addEventListener("mousedown", (e) => e.preventDefault()); // Fokus im Editor lassen
        btn.addEventListener("click", () => togglePanel(null));
        document.documentElement.appendChild(btn);
    }

    function togglePanel(anchor) {
        if (panelOpen) {
            closePanel();
        } else {
            panelEditor = (anchor && anchor.__editor) ? anchor.__editor : null;
            panelKind = (anchor && anchor.__kind) ? anchor.__kind : "mail";
            openPanel(anchor);
        }
    }

    // Panel am Toolbar-Button ausrichten; ohne Anker gilt die CSS-Position
    // (unten rechts, schwebender Button).
    function positionPanel(panel, anchor) {
        if (!anchor || !anchor.isConnected) {
            return;
        }
        const r = anchor.getBoundingClientRect();
        panel.style.right = Math.max(8, window.innerWidth - r.right) + "px";
        if (r.top < window.innerHeight / 2) {
            panel.style.top = Math.min(r.bottom + 8, window.innerHeight - 120) + "px";
            panel.style.bottom = "auto";
        } else {
            panel.style.bottom = (window.innerHeight - r.top + 8) + "px";
            panel.style.top = "auto";
        }
    }

    function closePanel() {
        const panel = document.getElementById("__vorlagen_panel");
        if (panel) {
            panel.remove();
        }
        panelOpen = false;
    }

    function openPanel(anchor) {
        closePanel();
        panelOpen = true;

        const panel = document.createElement("div");
        panel.id = "__vorlagen_panel";

        const head = document.createElement("div");
        head.className = "vp-head";
        head.textContent = "Vorlagen";

        const gear = document.createElement("span");
        gear.className = "vp-gear";
        gear.title = "Vorlagen verwalten (Extension-Optionen)";
        gear.textContent = "⚙";
        gear.addEventListener("click", () => {
            window.open(chrome.runtime.getURL("options.html"), "_blank");
        });
        head.appendChild(gear);

        const search = document.createElement("input");
        search.className = "vp-search";
        search.type = "text";
        search.placeholder = "Suchen…";
        // Suchfeld darf den Editor-Fokus nicht ueberschreiben -> lastTarget nicht anfassen
        search.addEventListener("focusin", (e) => e.stopPropagation());

        const list = document.createElement("div");
        list.className = "vp-list";

        panel.appendChild(head);
        panel.appendChild(search);
        panel.appendChild(list);
        document.documentElement.appendChild(panel);
        positionPanel(panel, anchor);

        loadTemplates((templates) => {
            renderList(list, templates, "");
            search.addEventListener("input", () => renderList(list, templates, search.value));
        });

        // Schliessen per Escape oder Klick ausserhalb
        const onKey = (e) => {
            if (e.key === "Escape") {
                closePanel();
                document.removeEventListener("keydown", onKey, true);
            }
        };
        document.addEventListener("keydown", onKey, true);

        setTimeout(() => {
            const onDocClick = (e) => {
                const t = e.target;
                const onButton = t && t.closest && t.closest("#__vorlagen_btn, .__vorlagen_tbtn");
                if (!panel.contains(t) && !onButton) {
                    closePanel();
                    document.removeEventListener("mousedown", onDocClick, true);
                }
            };
            document.addEventListener("mousedown", onDocClick, true);
        }, 0);
    }

    function renderList(list, templates, filter) {
        list.textContent = "";
        const f = filter.trim().toLowerCase();
        const filtered = templates.filter((t) =>
            !f || t.name.toLowerCase().includes(f) || t.text.toLowerCase().includes(f)
        );

        if (filtered.length === 0) {
            const empty = document.createElement("div");
            empty.className = "vp-empty";
            empty.textContent = "Keine Vorlagen gefunden.";
            list.appendChild(empty);
            return;
        }

        for (const t of filtered) {
            const item = document.createElement("div");
            item.className = "vp-item";

            const name = document.createElement("div");
            name.className = "vp-item-name";
            name.textContent = t.name;

            const preview = document.createElement("div");
            preview.className = "vp-item-preview";
            preview.textContent = t.text.replace(/\s+/g, " ").slice(0, 80);

            item.appendChild(name);
            item.appendChild(preview);
            // mousedown statt click, damit der Editor-Fokus/die Selektion erhalten bleibt
            item.addEventListener("mousedown", (e) => {
                e.preventDefault();
                closePanel();
                insertTemplate(t.text);
            });
            list.appendChild(item);
        }
    }

    function showHint(msg) {
        let hint = document.getElementById("__vorlagen_hint");
        if (!hint) {
            hint = document.createElement("div");
            hint.id = "__vorlagen_hint";
            document.documentElement.appendChild(hint);
        }
        hint.textContent = msg;
        hint.classList.add("visible");
        clearTimeout(hint.__timer);
        hint.__timer = setTimeout(() => hint.classList.remove("visible"), 4000);
    }

    // ---------------------------------------------------------- Storage

    function loadTemplates(cb) {
        // Eintrags-Editor hat eine EIGENE Vorlagenliste (entryTemplates),
        // das Mail-Fenster die klassische (templates).
        if (panelKind === "entry") {
            chrome.storage.local.get({ entryTemplates: null }, (items) => {
                if (!items.entryTemplates || !Array.isArray(items.entryTemplates) || items.entryTemplates.length === 0) {
                    chrome.storage.local.set({ entryTemplates: DEFAULT_ENTRY_TEMPLATES });
                    cb(DEFAULT_ENTRY_TEMPLATES);
                } else {
                    cb(items.entryTemplates);
                }
            });
            return;
        }
        chrome.storage.local.get({ templates: null }, (items) => {
            if (!items.templates || !Array.isArray(items.templates) || items.templates.length === 0) {
                chrome.storage.local.set({ templates: DEFAULT_TEMPLATES });
                cb(DEFAULT_TEMPLATES);
            } else {
                cb(items.templates);
            }
        });
    }

    // ---------------------------------------------------------- Init
    // Button in jedem Frame anzeigen, in dem es Eingabefelder gibt (oder Top-Frame).
    // Das Ticketsystem oeffnet Compose-Dialoge teils in iframes.

    // Modul-Schalter (Optionen -> "Module"): live zu-/abschaltbar
    let moduleEnabled = true;

    // Einzel-Schalter fuer die Inline-Funktionen (Optionen -> Ticketsystem-
    // Funktionen einzeln) - falls eine Erweiterung Probleme macht.
    let ft = { ftVorlagenMail: true, ftKiAntwort: true, ftVorlagenEintrag: true };
    chrome.storage.local.get(ft, (items) => { ft = items; });
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== "local") {
            return;
        }
        let touched = false;
        for (const k of Object.keys(ft)) {
            if (changes[k]) {
                ft[k] = changes[k].newValue !== false;
                touched = true;
            }
        }
        if (touched && moduleEnabled) {
            ensureButtons();
        }
    });

    function removeVorlagenUi() {
        document.querySelectorAll(".__vorlagen_tbtn").forEach((el) => el.remove());
        ["__vorlagen_btn", "__vorlagen_panel", "__vorlagen_hint"].forEach((id) => {
            const el = document.getElementById(id);
            if (el) {
                el.remove();
            }
        });
    }

    function init() {
        chrome.storage.local.get({ modVorlagen: true }, (items) => {
            moduleEnabled = items.modVorlagen !== false;
            if (moduleEnabled) {
                ensureButtons();
            } else {
                // Falls der Observer vor dem Storage-Read schon gerendert hat
                removeVorlagenUi();
            }
        });
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area === "local" && changes.modVorlagen) {
                moduleEnabled = changes.modVorlagen.newValue !== false;
                if (moduleEnabled) {
                    ensureButtons();
                } else {
                    removeVorlagenUi();
                }
            }
        });
        // SPA: Mail-Fenster/Editor entstehen dynamisch -> Buttons nachruesten
        const obs = new MutationObserver(() => {
            if (moduleEnabled) {
                ensureButtons();
            }
        });
        obs.observe(document.documentElement, { childList: true, subtree: true });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
