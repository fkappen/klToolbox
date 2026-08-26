// Version
// version = "1.11.0"  (Modul Ticket-Termin, klToolbox)
// datum   = "2026-08-20"
// autor   = "FK"
//
// Content-Script: extrahiert Kunde, TicketNR, Bezeichnung und Ansprechpartner
// aus der Ticketansicht und erstellt daraus einen Outlook-Termin
// (ICS-Download fuer Outlook Desktop oder Outlook-Web-Deeplink).
//
// Extraktion bewusst ueber stabile Merkmale (Label-Texte, Wertemuster) statt
// nur ueber generierte css-*-Klassen - siehe README.

(function () {
    "use strict";

    if (window !== window.top) {
        return; // Ticketansicht liegt im Top-Frame
    }

    const DEFAULTS = {
        subjectTemplate: "%KUNDE% - %TICKETNR% - %BEZEICHNUNG%",
        bodyTemplate: "Ansprechpartner: %ANSPRECHPARTNER%\nTelefon: %TELEFON%\nE-Mail: %EMAIL%\n\nTicket: %TICKETLINK%",
        // Kommt per Settings-Import - bewusst keine Firmen-URL im Store-Paket
        linkTemplate: "",
        selBezeichnung: "input.css-uzb1jv",
        selAnsprechpartner: "input.css-4utdaq",
        defaultDurationMin: 60,
        autoStatus: true,
        nichtErreichtText: "Nicht erreicht.",
        firmenAdresse: "",
        defaultTerminart: "telefon",
        // Eigene Mail-Domain (ohne @): mailto-Fallback ignoriert diese
        // Adressen. Kommt per Settings-Import - neutral ausgeliefert.
        ownEmailDomain: "",
        // Aktions-Makros: [{name, eintrag, status, abonnieren, schliessen}]
        makros: [],
        // Einzel-Schalter fuer die Inline-Funktionen (Optionen ->
        // Ticketsystem-Funktionen einzeln) - falls etwas Probleme macht
        ftTermin: true,
        ftNichtErreicht: true,
        ftAbo: true,
        ftAnfahrt: true,
        ftMakros: true,
        ftWaitBadge: true,
        ftWaitList: true,
        ftFehlercodes: true,
        ftKiBewertung: true,
        // Autor der KI-Eintraege (z. B. "API HAL9000") - NUR wenn gesetzt,
        // erscheint der Bewerten-Knopf. Kommt per Settings-Import.
        kiBewertungAutor: "",
        // Optionale Tag-Gruppe, in der die Noten 1-3 liegen (z. B. "KI Bewertung")
        kiBewertungTagGruppe: "",
        // Suchvorlage der DATEV Wissensplattform (fuer Fehlercode-Links)
        datevSearchTemplate: "",
        // Ampel-Schwellwerte (Optionen -> Wartezeit-Ampel). Vier Stufen:
        // gruen -> gelb -> rot -> lila. Bei Prioritaet "hoch" zaehlen
        // Minuten, sonst Tage.
        ampelHochGruenMin: 15,
        ampelHochGelbMin: 60,
        ampelHochRotMin: 240,
        ampelNormalGruenTage: 1,
        ampelNormalGelbTage: 3,
        ampelNormalRotTage: 10,
        ampelFarbeGruen: "#1a7f37",
        ampelFarbeGelb: "#b58900",
        ampelFarbeRot: "#b3261e",
        ampelFarbeLila: "#7b2fbf"
    };

    const TERMINARTEN = [
        { value: "telefon", label: "Telefon" },
        { value: "teams", label: "Teams" },
        { value: "vorort", label: "Vor Ort" }
    ];

    let settings = Object.assign({}, DEFAULTS);
    chrome.storage.local.get(DEFAULTS, (items) => { settings = items; });
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === "local") {
            let relevant = false;
            for (const [k, v] of Object.entries(changes)) {
                settings[k] = v.newValue;
                if (Object.prototype.hasOwnProperty.call(DEFAULTS, k)) {
                    relevant = true;
                }
            }
            // Einzel-Schalter/Makros sollen sofort wirken, nicht erst bei
            // der naechsten DOM-Mutation
            if (relevant && moduleEnabled) {
                ensureButtons();
                scheduleWaitBadge();
            }
        }
    });

    // ---------------------------------------------------------- Extraktion

    // Kunde: <strong>12345 - Muster GmbH</strong>
    function extractKunde() {
        for (const s of document.querySelectorAll("strong")) {
            const m = (s.textContent || "").trim().match(/^(\d{3,8})\s*-\s*(.{2,})$/);
            if (m) {
                return { nr: m[1], name: m[2].trim() };
            }
        }
        return { nr: "", name: "" };
    }

    // TicketNR: <li>123456<button><i class="... ap-icon-arrow-join"></i></button></li>
    function extractTicketNr() {
        for (const li of document.querySelectorAll("li")) {
            if (li.querySelector("i.ap-icon-arrow-join")) {
                const m = (li.textContent || "").trim().match(/^(\d{4,10})/);
                if (m) {
                    return m[1];
                }
            }
        }
        return "";
    }

    // Bezeichnung: Input-Feld (Selektor in den Optionen anpassbar)
    function extractBezeichnung() {
        const el = document.querySelector(settings.selBezeichnung);
        if (el && typeof el.value === "string" && el.value.trim()) {
            return el.value.trim();
        }
        return "";
    }

    // Input-Wert lesen: erst DOM-Eigenschaft, dann value-Attribut
    // (React-Inputs liefern die Eigenschaft je nach Rendering-Zustand leer).
    function inputValue(input) {
        if (typeof input.value === "string" && input.value.trim()) {
            return input.value.trim();
        }
        const attr = input.getAttribute("value");
        if (attr && attr.trim()) {
            return attr.trim();
        }
        return "";
    }

    // Ansprechpartner: direkter Selektor (Optionen), dann Label-Methode.
    // Wichtig: css-Hashes sind Style-Klassen und koennen auf MEHRERE Inputs
    // zutreffen - deshalb alle Treffer pruefen und den ersten mit Wert nehmen.
    function extractAnsprechpartner() {
        const sel = settings.selAnsprechpartner || DEFAULTS.selAnsprechpartner;
        for (const el of document.querySelectorAll(sel)) {
            const v = inputValue(el);
            if (v) {
                return v;
            }
        }
        const viaLabel = labelValue(["Ansprechpartner:"]);
        if (viaLabel) {
            return viaLabel;
        }
        logApDiagnose(sel);
        return "";
    }

    // Diagnose in die Konsole, wenn der Ansprechpartner nicht gefunden wurde -
    // zeigt alle Selektor-Treffer und alle "Ansprechpartner:"-Label-Zeilen.
    function logApDiagnose(sel) {
        try {
            const els = Array.from(document.querySelectorAll(sel));
            console.warn(
                "Ticket-Termin: Ansprechpartner leer. Selektor '" + sel + "' -> " + els.length + " Treffer:",
                els.map((e) => ({
                    prop: e.value,
                    attr: e.getAttribute("value"),
                    sichtbar: e.getBoundingClientRect().width > 0
                }))
            );
            const labels = Array.from(document.querySelectorAll("div")).filter((d) =>
                d.childElementCount === 0 && /^ansprechpartner:?$/i.test((d.textContent || "").trim())
            );
            console.warn(
                "Ticket-Termin: 'Ansprechpartner:'-Labels -> " + labels.length + " Treffer:",
                labels.map((d) => {
                    const vb = d.nextElementSibling;
                    const inp = vb ? vb.querySelector("input, select") : null;
                    return {
                        wertProp: inp ? inp.value : null,
                        wertAttr: inp ? inp.getAttribute("value") : null,
                        valueBoxHtml: vb ? vb.outerHTML.slice(0, 300) : "(kein Geschwister-Element)"
                    };
                })
            );
        } catch (err) {
            console.warn("Ticket-Termin: Diagnose fehlgeschlagen:", err);
        }
    }

    // Label-Zeilen: <div>Ansprechpartner:</div><div>WERT</div>
    // Sucht ein "Blatt-Div", dessen eigener Text exakt dem Label entspricht,
    // und liefert den Wert aus dem Geschwister-Container.
    function labelValue(labels) {
        for (const d of document.querySelectorAll("div")) {
            if (d.childElementCount !== 0) {
                continue;
            }
            const t = (d.textContent || "").trim().toLowerCase();
            if (!labels.some((l) => t === l.toLowerCase())) {
                continue;
            }
            const valBox = d.nextElementSibling;
            if (!valBox) {
                continue;
            }
            const input = valBox.querySelector("input");
            if (input) {
                const v = inputValue(input);
                if (v) {
                    return v;
                }
            }
            const select = valBox.querySelector("select");
            if (select && select.selectedOptions && select.selectedOptions.length > 0) {
                const v = (select.selectedOptions[0].textContent || "").trim();
                if (v) {
                    return v;
                }
            }
            const link = valBox.querySelector("a[href^='tel:'], a[href^='mailto:']");
            if (link && (link.textContent || "").trim()) {
                return link.textContent.trim();
            }
            const txt = (valBox.textContent || "").trim();
            if (txt && txt !== "-") {
                return txt;
            }
        }
        return "";
    }

    // Die Kontakt-E-Mail steht im Ticketsystem NUR als Text im Kontaktmenue
    // neben dem Ansprechpartner ("E-Mail an \"name@firma.de\"") - es gibt
    // weder ein Label-Feld noch einen mailto-Link. Das Menue ist nur im DOM,
    // solange es geoeffnet ist, deshalb merken wir uns die Adresse, sobald
    // sie einmal aufgetaucht ist (der MutationObserver laeuft ohnehin).
    // Pro Ticket getrennt, damit keine Adresse aus einem anderen Ticket
    // uebernommen wird.
    const MENU_MAIL_RE = /E-Mail an\s*["„«'‘]?\s*([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/;
    let seenContactMail = "";
    let seenContactMailTicket = "";

    function captureContactMail() {
        const ticket = extractTicketNr();
        if (ticket && ticket !== seenContactMailTicket) {
            seenContactMail = "";
            seenContactMailTicket = ticket;
        }
        if (seenContactMail) {
            return seenContactMail;
        }
        // Nur Menue-Eintraege pruefen (kurze <a>-Texte mit @) - kein Scan
        // ueber den kompletten Seitentext.
        for (const a of document.querySelectorAll("a")) {
            const t = (a.textContent || "").trim();
            if (t.length > 150 || t.indexOf("@") === -1) {
                continue;
            }
            const m = MENU_MAIL_RE.exec(t);
            if (m) {
                seenContactMail = m[1];
                seenContactMailTicket = ticket;
                return seenContactMail;
            }
        }
        return "";
    }

    function extractEmail() {
        const viaLabel = labelValue(["E-Mail:", "Email:", "Mail:", "E-Mail-Adresse:"]);
        if (viaLabel) {
            return viaLabel;
        }
        // Kontaktmenue (siehe captureContactMail) - deckt den Normalfall ab
        const viaMenu = captureContactMail();
        if (viaMenu) {
            return viaMenu;
        }
        // Fallback: erster mailto-Link auf der Seite - Adressen der eigenen
        // Domain (Einstellung ownEmailDomain, z. B. Support-Postfach) ignorieren.
        const ownDomain = (settings.ownEmailDomain || "").trim().replace(/^@/, "").toLowerCase();
        for (const a of document.querySelectorAll("a[href^='mailto:']")) {
            const href = a.getAttribute("href") || "";
            const mail = href.replace(/^mailto:/i, "").split("?")[0].trim();
            if (!mail) {
                continue;
            }
            if (ownDomain && mail.toLowerCase().endsWith("@" + ownDomain)) {
                continue;
            }
            return mail;
        }
        return "";
    }

    function extractAll() {
        const kunde = extractKunde();
        const ticketNr = extractTicketNr();
        return {
            // Kunde inkl. Kundennummer, wie im Ticketsystem angezeigt
            kunde: (kunde.nr ? kunde.nr + " - " : "") + kunde.name,
            kundeName: kunde.name,
            kundeNr: kunde.nr,
            ticketNr: ticketNr,
            bezeichnung: extractBezeichnung(),
            ansprechpartner: extractAnsprechpartner(),
            telefon: labelValue(["Telefon-Nr.:", "Telefon:", "Rufnummer:"]),
            email: extractEmail()
        };
    }

    // ---------------------------------------------------------- Templates

    function fillTemplate(tpl, data) {
        const link = (settings.linkTemplate || "").replace(/%TICKETNR%/g, data.ticketNr);
        return tpl
            .replace(/%KUNDE%/g, data.kunde)
            .replace(/%KUNDENAME%/g, data.kundeName || data.kunde)
            .replace(/%KUNDENR%/g, data.kundeNr)
            .replace(/%TICKETNR%/g, data.ticketNr)
            .replace(/%BEZEICHNUNG%/g, data.bezeichnung)
            .replace(/%ANSPRECHPARTNER%/g, data.ansprechpartner)
            .replace(/%TELEFON%/g, data.telefon)
            .replace(/%EMAIL%/g, data.email)
            .replace(/%TICKETLINK%/g, link);
    }

    // ---------------------------------------------------------- Ticket-Status

    function sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    // React-Steuerelemente brauchen eine echte Maus-Event-Sequenz
    function realClick(el) {
        for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
            el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
        }
    }

    function isVisible(el) {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
    }

    // Eintragsformular unten finden (CKEditor + Speichern-Button im Umfeld);
    // das Mail-Fenster (Senden/Verwerfen ohne Speichern) wird uebersprungen.
    function findEntryForm() {
        const editors = Array.from(document.querySelectorAll(".ck-editor__editable")).filter(isVisible);
        for (const ed of editors) {
            let node = ed.parentElement;
            let depth = 0;
            while (node && node !== document.body && depth < 10) {
                const t = node.textContent || "";
                if (t.includes("Verwerfen") && t.includes("Senden") && !t.includes("Speichern")) {
                    break;
                }
                const btn = Array.from(node.querySelectorAll("button")).find((b) =>
                    (b.textContent || "").trim() === "Speichern" && isVisible(b)
                );
                if (btn) {
                    return { container: node, editor: ed, saveBtn: btn };
                }
                node = node.parentElement;
                depth++;
            }
        }
        return null;
    }

    // Nach dem Erstellen des Termins den Ticket-Status auf "Termin vereinbart"
    // setzen - ueber das Status-Feld im EINTRAGSFORMULAR unten (+ Speichern).
    // Der Statuswechsel wird so als Ticket-Eintrag dokumentiert.
    // WICHTIG: Filter-Panels (Checkbox-Listen, z. B. Eintragsfilter) werden
    // ausgeschlossen - ein frueherer Ansatz hatte dort faelschlich geklickt.
    // Status im Eintragsformular auswaehlen (OHNE zu speichern) - Baustein
    // fuer die Termin-Automatik und die Aktions-Makros. Liefert true/false.
    async function selectStatusInForm(form, statusText) {
        const norm = (s) => (s || "").replace(/\s+/g, " ").trim().toLowerCase();
        const wanted = norm(statusText);

        // 1. Status-Label im Formular -> zugehoeriges ap-select
        const label = Array.from(form.container.querySelectorAll("div, label, span")).find((d) =>
            d.childElementCount === 0 &&
            /^status:?$/i.test((d.textContent || "").trim()) && isVisible(d)
        );
        let select = null;
        if (label) {
            if (label.nextElementSibling && label.nextElementSibling.classList.contains("ap-select")) {
                select = label.nextElementSibling;
            } else if (label.nextElementSibling) {
                select = label.nextElementSibling.querySelector(".ap-select");
            }
            if (!select && label.parentElement) {
                select = label.parentElement.querySelector(".ap-select");
            }
        }
        if (!select || !isVisible(select)) {
            console.warn("Ticket-Termin: Status-Feld im Eintragsformular nicht gefunden. " +
                "ap-select-Typen im Formular: " + JSON.stringify(
                    Array.from(form.container.querySelectorAll(".ap-select")).map((e) => e.getAttribute("type"))
                ));
            return false;
        }

        // 2. Dropdown oeffnen
        realClick(select);
        await sleep(400);

        // 3. Gewuenschten Eintrag suchen - Checkbox-Listen (Filter!)
        //    ausschliessen, nur echte Auswahl-Eintraege
        const pick = () => Array.from(document.querySelectorAll(".one-liner, li, [role='option']"))
            .filter(isVisible)
            .filter((el) => !el.querySelector("input[type='checkbox']"))
            .filter((el) => !el.closest("[class*='filter']"))
            .find((el) => norm(el.textContent) === wanted);
        let item = pick();
        if (!item) {
            await sleep(500);
            item = pick();
        }
        if (!item) {
            console.warn("Ticket-Termin: Status '" + statusText + "' nicht gefunden. Sichtbare Einträge: " +
                JSON.stringify(Array.from(document.querySelectorAll(".one-liner")).filter(isVisible)
                    .map((e) => norm(e.textContent)).slice(0, 30)));
            realClick(select); // Dropdown wieder schliessen
            return false;
        }

        // 4. Auswaehlen und pruefen, ob das Feld die Auswahl uebernommen hat
        realClick(item);
        await sleep(300);
        if (!norm(select.textContent).includes(wanted)) {
            console.warn("Ticket-Termin: Auswahl wurde nicht übernommen (Feld zeigt: " +
                JSON.stringify((select.textContent || "").trim()) + ").");
            return false;
        }
        return true;
    }

    async function setStatusTerminVereinbart() {
        try {
            const form = findEntryForm();
            if (!form) {
                console.warn("Ticket-Termin: Eintragsformular nicht gefunden - Status bleibt unverändert.");
                return;
            }
            if (await selectStatusInForm(form, "Termin vereinbart")) {
                // Eintrag speichern -> Statuswechsel wird wirksam und dokumentiert
                realClick(form.saveBtn);
                console.info("Ticket-Termin: Status 'Termin vereinbart' gesetzt und Eintrag gespeichert.");
            }
        } catch (err) {
            console.warn("Ticket-Termin: Status setzen fehlgeschlagen:", err);
        }
    }

    // ---------------------------------------------------------- Wartezeit-Badge
    // Zeigt links in der Ticket-Toolbar die Zeit seit Ticketerstellung an.
    // Quelle: aeltester sichtbarer Eintrags-Zeitstempel im DOM (bewusst KEIN
    // API-Zugriff - die REST-API des Ticketsystems verlangt einen API-Token, und der
    // gehoert nicht in ein oeffentlich verteiltes Addin).
    // Ampel: Prio Hoch  -> gruen <15 Min, gelb <1 Std, rot ab 1 Std
    //        sonst      -> gruen <1 Tag,  gelb <3 Tage, rot ab 3 Tagen

    let badgeTicketNr = "";
    let badgeCreatedAt = null;

    function getPrioText() {
        const el = document.querySelector(".ap-select[type='apTicketPriority'] .one-liner");
        return el ? (el.textContent || "").trim() : "";
    }

    function formatAge(ms) {
        const min = ms / 60000;
        if (min < 60) {
            return Math.floor(min) + " Min";
        }
        const h = min / 60;
        if (h < 48) {
            return h.toFixed(1).replace(".", ",") + " Std";
        }
        return (h / 24).toFixed(1).replace(".", ",") + " Tage";
    }

    // Vier Ampelstufen; Schwellwerte UND Farben kommen aus den Optionen.
    // Bei Prioritaet "hoch" zaehlen Minuten, sonst Tage.
    function badgeColor(ms, prio) {
        const gruen = settings.ampelFarbeGruen || DEFAULTS.ampelFarbeGruen;
        const gelb = settings.ampelFarbeGelb || DEFAULTS.ampelFarbeGelb;
        const rot = settings.ampelFarbeRot || DEFAULTS.ampelFarbeRot;
        const lila = settings.ampelFarbeLila || DEFAULTS.ampelFarbeLila;
        const min = ms / 60000;
        if (/hoch|high/i.test(prio)) {
            if (min < (Number(settings.ampelHochGruenMin) || DEFAULTS.ampelHochGruenMin)) { return gruen; }
            if (min < (Number(settings.ampelHochGelbMin) || DEFAULTS.ampelHochGelbMin)) { return gelb; }
            if (min < (Number(settings.ampelHochRotMin) || DEFAULTS.ampelHochRotMin)) { return rot; }
            return lila;
        }
        const tage = min / 1440;
        if (tage < (Number(settings.ampelNormalGruenTage) || DEFAULTS.ampelNormalGruenTage)) { return gruen; }
        if (tage < (Number(settings.ampelNormalGelbTage) || DEFAULTS.ampelNormalGelbTage)) { return gelb; }
        if (tage < (Number(settings.ampelNormalRotTage) || DEFAULTS.ampelNormalRotTage)) { return rot; }
        return lila;
    }

    // ------------------------------------------- DATEV-Fehlercode-Links
    // Erkennt DATEV-Meldungs-IDs (Praefix aus 2-4 Grossbuchstaben + 4-6
    // Ziffern, optional angehaengter Buchstabe: DB60012, ZK01052, INI07257,
    // SE9717F, ...) in den Ticket-Eintraegen und verlinkt sie auf die
    // Wissensplattform-Suche. Bewusst NUR die Eintrags-Container - keine
    // Editoren, Eingabefelder oder die Ticketliste.
    const CODE_RE = /\b[A-Z]{2,4}\d{4,6}[A-Z]?\b/g;
    const DATEV_SEARCH_FALLBACK = "https://wissensplattform.apps.datev.de/help/search/helpcenter?q=%SUCHE%";

    function codeSearchUrl(code) {
        const tpl = (settings.datevSearchTemplate || "").trim() || DATEV_SEARCH_FALLBACK;
        return tpl.replace(/%SUCHE%/g, encodeURIComponent(code));
    }

    function linkifyFehlercodes() {
        if (settings.ftFehlercodes === false) {
            document.querySelectorAll("a.__tt_code_link").forEach((a) => {
                a.replaceWith(document.createTextNode(a.textContent));
            });
            return;
        }
        // Autorennamen, die eine frühere Version faelschlich verlinkt hat,
        // wieder in reinen Text zurueckwandeln (kein DOM-Schreibzugriff,
        // wenn nichts zu tun ist - sonst Observer-Schleife)
        document.querySelectorAll("ap-chat-starter a.__tt_code_link").forEach((a) => {
            a.replaceWith(document.createTextNode(a.textContent));
        });
        const dateRe = /^(?:Mo|Di|Mi|Do|Fr|Sa|So)\.\s*\d{1,2}\.\d{1,2}\.\d{4}$/;
        for (const s of document.querySelectorAll("strong")) {
            if (!dateRe.test((s.textContent || "").trim())) {
                continue;
            }
            const header = s.parentElement;
            if (!header || !(header.textContent || "").includes("aktualisiert am")) {
                continue;
            }
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
            linkifyIn(container);
        }
    }

    function linkifyIn(root) {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        const targets = [];
        let node = walker.nextNode();
        while (node) {
            const p = node.parentElement;
            // Autoren-Widget im Eintragskopf ausnehmen: Namen wie "API HAL9000"
            // passen sonst auf das Fehlercode-Muster (3 Buchstaben + 4 Ziffern)
            // und wurden faelschlich zum Wissensplattform-Link.
            if (p && !p.closest("a, button, input, textarea, select, script, style, ap-chat-starter") &&
                !p.isContentEditable && CODE_RE.test(node.nodeValue || "")) {
                targets.push(node);
            }
            CODE_RE.lastIndex = 0;
            node = walker.nextNode();
        }
        for (const textNode of targets) {
            const text = textNode.nodeValue;
            const frag = document.createDocumentFragment();
            let last = 0;
            let m;
            CODE_RE.lastIndex = 0;
            while ((m = CODE_RE.exec(text)) !== null) {
                if (m.index > last) {
                    frag.appendChild(document.createTextNode(text.slice(last, m.index)));
                }
                const a = document.createElement("a");
                a.className = "__tt_code_link";
                a.textContent = m[0];
                a.href = codeSearchUrl(m[0]);
                a.target = "_blank";
                a.rel = "noopener";
                a.title = "„" + m[0] + "“ in der DATEV Wissensplattform suchen";
                frag.appendChild(a);
                last = m.index + m[0].length;
            }
            if (last < text.length) {
                frag.appendChild(document.createTextNode(text.slice(last)));
            }
            textNode.replaceWith(frag);
        }
    }

    // Pill-Optik der Wartezeit-Anzeigen. Bewusst INLINE statt nur ueber
    // content.css: greift das injizierte Stylesheet auf der Seite nicht,
    // blieb sonst nur die Hintergrundfarbe uebrig - ein nacktes <span> in
    // einem Flex-Spalten-Container wurde dann zum vollbreiten Farbbalken.
    const BADGE_STYLE_BASE =
        "position:absolute;left:12px;top:10px;z-index:5;display:inline-flex;" +
        "align-items:center;gap:4px;padding:3px 10px;border-radius:12px;color:#fff;" +
        "font:700 12px/1.4 system-ui,sans-serif;white-space:nowrap;vertical-align:middle;" +
        "box-shadow:0 1px 3px rgba(0,0,0,.25);";

    // Gleiche Optik in der Ticketliste, nur kompakter (schmale Spalte)
    const LIST_BADGE_STYLE_BASE =
        "display:inline-block;margin-right:5px;padding:1px 6px;border-radius:9px;color:#fff;" +
        "font:700 10px/1.5 system-ui,sans-serif;white-space:nowrap;vertical-align:middle;";

    function renderWaitBadge() {
        if (settings.ftWaitBadge === false) {
            const off = document.querySelector(".__tt_wait_badge");
            if (off) {
                off.remove();
            }
            return;
        }
        const tb = document.querySelector(".ap-toolbar--fullscreen-at-top");
        if (!tb) {
            return;
        }
        // Die Toolbar selbst ist rechtsbuendig - fuer "ganz links" haengen
        // wir das Badge in ihren Eltern-Container (graues Band ueber die
        // volle Breite) und positionieren es absolut an dessen linker Kante.
        const host = tb.parentElement || tb;
        let badge = document.querySelector(".__tt_wait_badge");
        if (!badgeCreatedAt) {
            if (badge) {
                badge.remove();
            }
            return;
        }
        if (!badge) {
            badge = document.createElement("span");
            badge.className = "__tt_wait_badge";
            if (getComputedStyle(host).position === "static") {
                host.style.position = "relative";
            }
            host.insertBefore(badge, host.firstChild);
        }
        const ms = Date.now() - badgeCreatedAt.getTime();
        const prio = getPrioText();
        const text = "⏱ " + formatAge(ms);
        const color = badgeColor(ms, prio);
        const title = "Wartezeit seit Ticketerstellung: " +
            badgeCreatedAt.toLocaleString("de-DE") + " (Prio: " + (prio || "unbekannt") +
            ", Basis: ältester sichtbarer Eintrag)";
        // NUR bei tatsaechlicher Aenderung schreiben! Jede DOM-Aenderung feuert
        // den MutationObserver - bedingungsloses Schreiben erzeugt eine
        // Endlosschleife (Badge -> Observer -> Badge -> ...), die den Tab
        // eingefroren hat (Bug in 2.15.3).
        if (badge.dataset.t !== text) {
            badge.dataset.t = text;
            badge.textContent = text;
        }
        if (badge.dataset.c !== color) {
            badge.dataset.c = color;
            badge.style.cssText = BADGE_STYLE_BASE + "background:" + color + ";";
        }
        if (badge.dataset.i !== title) {
            badge.dataset.i = title;
            badge.title = title;
        }
    }

    // ------------------------------------------- Wartezeit-Ampeln Ticketliste
    // Die Listenansicht ist ein DHTMLX-Grid. Spalten werden ueber die
    // Header-IDs (rsGridHeader..._createdAt/_priority/_id) ermittelt -
    // robust gegen umsortierte Spalten. Vor die Ticketnummer kommt ein
    // farbiger Punkt (gleiche Ampel-Logik wie das Ticket-Badge).
    // Schreibzugriffe nur bei Aenderung (dataset-Guards, Observer-Schleife!).
    // Kompakte Alters-Angabe fuer die schmale Spalte ("45m", "26h", "9,1T")
    function formatAgeCompact(ms) {
        const min = ms / 60000;
        if (min < 60) {
            return Math.floor(min) + "m";
        }
        const h = min / 60;
        if (h < 48) {
            return (h < 10 ? h.toFixed(1).replace(".", ",") : String(Math.round(h))) + "h";
        }
        const d = h / 24;
        return (d < 10 ? d.toFixed(1).replace(".", ",") : String(Math.round(d))) + "T";
    }

    // Diagnose: nicht lesbare "Erstellt am"-Werte EINMAL pro Variante in die
    // Konsole schreiben. Ohne das bleibt eine fehlende Wartezeit in der Liste
    // unsichtbar - der Scan laeuft im Sekundentakt, deshalb der Dedup-Filter.
    const unparsedDates = new Set();

    function warnUnparsedDate(text) {
        const t = (text || "").trim();
        if (!t || unparsedDates.has(t) || unparsedDates.size > 20) {
            return;
        }
        unparsedDates.add(t);
        console.warn("klToolbox: Datum in der Spalte 'Erstellt am' nicht lesbar: " + JSON.stringify(t));
    }

    function ensureListDots() {
        if (settings.ftWaitList === false) {
            document.querySelectorAll(".__tt_list_dot, .__tt_list_badge, .__tt_list_age").forEach((d) => d.remove());
            return;
        }
        for (const grid of document.querySelectorAll(".gridbox")) {
            const hdrRow = Array.from(grid.querySelectorAll(".xhdr table.hdr tr"))
                .find((r) => r.querySelector("td"));
            if (!hdrRow) {
                continue;
            }
            let colCreated = -1;
            let colPrio = -1;
            let colId = -1;
            Array.from(hdrRow.children).forEach((td, i) => {
                if (td.querySelector("[id$='_createdAt']")) { colCreated = i; }
                if (td.querySelector("[id$='_priority']")) { colPrio = i; }
                if (td.querySelector("[id$='_id']")) { colId = i; }
            });
            if (colCreated < 0 || colId < 0) {
                continue; // kein Ticket-Grid (oder Spalte ausgeblendet)
            }
            for (const tr of grid.querySelectorAll(".objbox table.obj tbody tr")) {
                const tds = tr.children;
                if (tds.length <= Math.max(colCreated, colId) || tds[0].tagName !== "TD") {
                    continue;
                }
                // Uhrzeit ist OPTIONAL: aeltere Eintraege zeigen in der Liste
                // teils nur das Datum - mit Pflicht-Uhrzeit schlug das Parsen
                // fehl und die Wartezeit fiel ganz weg. Zweistellige Jahre
                // werden ebenfalls akzeptiert.
                const zellText = tds[colCreated].textContent || "";
                const m = /(\d{1,2})\.(\d{1,2})\.(\d{2,4})(?:,?\s*(\d{1,2}):(\d{2}))?/
                    .exec(zellText);
                if (!m) {
                    warnUnparsedDate(zellText);
                    continue;
                }
                let jahr = Number(m[3]);
                if (jahr < 100) {
                    jahr += 2000;
                }
                const created = new Date(jahr, +m[2] - 1, +m[1],
                    m[4] ? +m[4] : 0, m[5] ? +m[5] : 0, 0);
                if (isNaN(created.getTime())) {
                    warnUnparsedDate(zellText);
                    continue;
                }
                const ms = Date.now() - created.getTime();
                const prio = colPrio >= 0 ? (tds[colPrio].textContent || "") : "";
                const color = badgeColor(ms, prio);
                const title = "Wartezeit: " + formatAge(ms) + " (erstellt " + m[0] + ", Prio: " + (prio.trim() || "unbekannt") + ")";

                // Kurzschreibweise ("26h") in Ampelfarbe VOR der Ticketnummer
                let age = tds[colId].querySelector(".__tt_list_age");
                if (!age) {
                    // Reste aelterer Varianten (Punkt/Pill) aufraeumen
                    const old = tr.querySelector(".__tt_list_dot, .__tt_list_badge");
                    if (old) {
                        old.remove();
                    }
                    age = document.createElement("span");
                    age.className = "__tt_list_age";
                    tds[colId].insertBefore(age, tds[colId].firstChild);
                }
                const text = formatAgeCompact(ms);
                if (age.dataset.x !== text) {
                    age.dataset.x = text;
                    age.textContent = text;
                }
                if (age.dataset.c !== color) {
                    age.dataset.c = color;
                    age.style.cssText = LIST_BADGE_STYLE_BASE + "background:" + color + ";";
                }
                if (age.dataset.t !== title) {
                    age.dataset.t = title;
                    age.title = title;
                }
            }
        }
    }

    // Gedrosselter Einstieg fuer den MutationObserver: die DOM-Scans
    // (Badge + Listen-Ampeln) laufen maximal einmal pro Sekunde.
    let badgeLastRun = 0;
    let badgeQueued = false;

    function waitTick() {
        ensureWaitBadge();
        ensureListDots();
        linkifyFehlercodes();
        // Kontakt-E-Mail mitschneiden, falls das Kontaktmenue gerade offen
        // ist - sie ist sonst nirgends im DOM zu finden.
        captureContactMail();
        ensureBewertenButtons();
    }

    function scheduleWaitBadge() {
        const now = Date.now();
        if (now - badgeLastRun > 1000) {
            badgeLastRun = now;
            waitTick();
        } else if (!badgeQueued) {
            badgeQueued = true;
            setTimeout(() => {
                badgeQueued = false;
                badgeLastRun = Date.now();
                waitTick();
            }, 1200);
        }
    }

    function ensureWaitBadge() {
        const nr = extractTicketNr();
        if (!nr) {
            badgeTicketNr = "";
            badgeCreatedAt = null;
            renderWaitBadge();
            return;
        }
        badgeTicketNr = nr;
        // Bei jedem Aufruf neu aus dem DOM lesen - Eintraege koennen nachladen,
        // wodurch ein noch aelterer Zeitstempel sichtbar werden kann.
        badgeCreatedAt = findOldestEntryDate();
        renderWaitBadge();
    }

    // Aeltester Eintrags-Zeitstempel aus dem DOM (kein API-Token noetig).
    // Jeder Eintragskopf enthaelt: aktualisiert am <strong>Fr. 14.08.2026</strong>
    // um <strong>7:53 Uhr</strong> - der aelteste sichtbare Eintrag entspricht
    // der Ticketerstellung (sofern die Historie vollstaendig geladen/gefiltert ist).
    function findOldestEntryDate() {
        const dateRe = /^(?:Mo|Di|Mi|Do|Fr|Sa|So)\.\s*(\d{1,2})\.(\d{1,2})\.(\d{4})$/;
        const timeRe = /^(\d{1,2}):(\d{2})\s*Uhr$/;
        let oldest = null;

        for (const s of document.querySelectorAll("strong")) {
            const m = dateRe.exec((s.textContent || "").trim());
            if (!m) {
                continue;
            }
            const parent = s.parentElement;
            if (!parent || !(parent.textContent || "").includes("aktualisiert am")) {
                continue;
            }
            // Uhrzeit-<strong> im selben Eintragskopf suchen
            let hh = 0;
            let mi = 0;
            for (const t of parent.querySelectorAll("strong")) {
                const tm = timeRe.exec((t.textContent || "").trim());
                if (tm) {
                    hh = parseInt(tm[1], 10);
                    mi = parseInt(tm[2], 10);
                    break;
                }
            }
            const d = new Date(parseInt(m[3], 10), parseInt(m[2], 10) - 1, parseInt(m[1], 10), hh, mi, 0);
            if (!isNaN(d.getTime()) && (oldest === null || d < oldest)) {
                oldest = d;
            }
        }
        return oldest;
    }

    // ---------------------------------------------------------- KI-Bewertung
    // Eintraege der Ticket-KI (Autor aus den Optionen, z. B. "API HAL9000")
    // bekommen im Kopf einen Knopf "Bewerten". Ergebnis: Note als Tag PLUS
    // interner Eintrag mit Note und Kommentar - beides in EINEM Speichern-
    // Vorgang, wie bei den Aktions-Makros.

    const BEWERTUNG_NOTEN = [
        { note: "1", text: "sehr gut" },
        { note: "2", text: "in Ordnung" },
        { note: "3", text: "sehr schlecht" }
    ];

    const BEW_BTN_STYLE =
        "margin-left:10px;padding:1px 8px;border:1px solid #c3ced5;border-radius:10px;" +
        "background:#fff;color:#46626F;font:600 11px/1.6 system-ui,sans-serif;cursor:pointer;" +
        "vertical-align:middle;";

    // Autor aus einem Eintragskopf lesen. Der Kopf lautet immer
    // "von <Autor> aktualisiert am <Datum> um <Zeit>" - die Verankerung am
    // Zeilenanfang trifft damit genau den Kopf und keine Eltern-Container.
    function headerAuthor(el) {
        const t = (el.textContent || "").replace(/\s+/g, " ").trim();
        const m = /^von\s+(.+?)\s+aktualisiert am\b/i.exec(t);
        return m ? m[1].trim() : "";
    }

    let bewDiagDone = false;

    function warnKiAutor(autor, gesehen) {
        if (bewDiagDone || gesehen.length === 0) {
            return;
        }
        bewDiagDone = true;
        if (!autor) {
            console.info("klToolbox: Bewerten-Knopf inaktiv - es ist kein KI-Autor hinterlegt " +
                "(Optionen -> KI-Bewertung von Ticket-Einträgen). Autoren in diesem Ticket: " +
                JSON.stringify(gesehen));
        } else {
            console.warn("klToolbox: Kein Eintrag mit dem Autor " + JSON.stringify(autor) +
                " gefunden. Autoren in diesem Ticket: " + JSON.stringify(gesehen));
        }
    }

    function findKiEntryHeaders() {
        const autor = (settings.kiBewertungAutor || "").replace(/\s+/g, " ").trim().toLowerCase();
        const cands = [];
        const gesehen = [];
        for (const el of document.querySelectorAll("div, span, p, td")) {
            const t = el.textContent || "";
            if (t.length > 400 || t.indexOf("aktualisiert am") === -1 || !isVisible(el)) {
                continue;
            }
            const a = headerAuthor(el);
            if (!a) {
                continue;
            }
            if (gesehen.indexOf(a) === -1) {
                gesehen.push(a);
            }
            if (autor && a.toLowerCase() === autor) {
                cands.push(el);
            }
        }
        // Innerstes Element gewinnt, falls doch mehrere Ebenen passen
        const heads = cands.filter((el) => !cands.some((o) => o !== el && el.contains(o)));
        if (heads.length === 0) {
            warnKiAutor(autor, gesehen);
        }
        return heads;
    }

    function ensureBewertenButtons() {
        if (settings.ftKiBewertung === false || !(settings.kiBewertungAutor || "").trim()) {
            document.querySelectorAll(".__tt_bew_btn").forEach((b) => b.remove());
            return;
        }
        for (const head of findKiEntryHeaders()) {
            if (head.querySelector(".__tt_bew_btn")) {
                continue;
            }
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "__tt_bew_btn";
            btn.textContent = "⭐ Bewerten";
            btn.title = "Diese KI-Zusammenfassung bewerten (Note als Tag + interner Eintrag)";
            btn.style.cssText = BEW_BTN_STYLE;
            btn.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                openBewertenPanel(btn);
            });
            // Links neben die vorhandenen Symbole setzen (die liegen in einem
            // eigenen Container am Zeilenende)
            const iconBox = Array.from(head.children).reverse()
                .find((c) => c.tagName === "DIV" && c.querySelector("button"));
            if (iconBox) {
                head.insertBefore(btn, iconBox);
            } else {
                head.appendChild(btn);
            }
        }
    }

    function closeBewertenPanel() {
        const p = document.getElementById("__tt_bew_panel");
        if (p) {
            p.remove();
        }
    }

    function openBewertenPanel(anchor) {
        closeBewertenPanel();
        const panel = document.createElement("div");
        panel.id = "__tt_bew_panel";
        panel.style.cssText =
            "position:fixed;z-index:2147483647;width:300px;background:#fff;color:#26323a;" +
            "border:1px solid #d5dde2;border-radius:10px;box-shadow:0 8px 28px rgba(0,0,0,.22);" +
            "padding:12px;font:13px/1.4 system-ui,sans-serif;";

        const head = document.createElement("div");
        head.textContent = "KI-Zusammenfassung bewerten";
        head.style.cssText = "font-weight:700;margin-bottom:8px;color:#35505C;";
        panel.appendChild(head);

        let gewaehlt = "1";
        const row = document.createElement("div");
        row.style.cssText = "display:flex;gap:6px;margin-bottom:10px;";
        const noteBtns = [];
        for (const n of BEWERTUNG_NOTEN) {
            const b = document.createElement("button");
            b.type = "button";
            b.textContent = n.note;
            b.title = n.text;
            b.dataset.note = n.note;
            b.style.cssText = "flex:1;padding:7px 0;border-radius:8px;cursor:pointer;font:700 14px/1 system-ui,sans-serif;";
            b.addEventListener("click", () => {
                gewaehlt = n.note;
                markiere();
            });
            noteBtns.push(b);
            row.appendChild(b);
        }
        const markiere = () => {
            for (const b of noteBtns) {
                const aktiv = b.dataset.note === gewaehlt;
                b.style.border = aktiv ? "2px solid #46626F" : "1px solid #c3ced5";
                b.style.background = aktiv ? "#46626F" : "#fff";
                b.style.color = aktiv ? "#fff" : "#56646d";
            }
        };
        markiere();
        panel.appendChild(row);

        // Skala: macht ohne Hovern klar, in welche Richtung die Noten laufen
        const skala = document.createElement("div");
        skala.style.cssText = "height:4px;border-radius:2px;margin:0 2px 3px;" +
            "background:linear-gradient(90deg,#1a7f37 0%,#b58900 50%,#b3261e 100%);";
        panel.appendChild(skala);
        const skalaTxt = document.createElement("div");
        skalaTxt.style.cssText = "display:flex;justify-content:space-between;margin:0 2px 10px;" +
            "font-size:11px;color:#7a8791;";
        const links = document.createElement("span");
        links.textContent = "sehr gut";
        const rechts = document.createElement("span");
        rechts.textContent = "sehr schlecht";
        skalaTxt.appendChild(links);
        skalaTxt.appendChild(rechts);
        panel.appendChild(skalaTxt);

        const lbl = document.createElement("div");
        lbl.textContent = "Begründung (optional)";
        lbl.style.cssText = "font-size:12px;color:#7a8791;margin-bottom:4px;";
        panel.appendChild(lbl);

        const ta = document.createElement("textarea");
        ta.style.cssText =
            "width:100%;box-sizing:border-box;min-height:70px;padding:7px 9px;border:1px solid #d5dde2;" +
            "border-radius:8px;font:inherit;resize:vertical;";
        ta.placeholder = "Was war gut bzw. was hat gefehlt?";
        panel.appendChild(ta);

        const bar = document.createElement("div");
        bar.style.cssText = "display:flex;gap:8px;margin-top:10px;";
        const ok = document.createElement("button");
        ok.type = "button";
        ok.textContent = "Speichern";
        ok.style.cssText = "flex:1;border:0;border-radius:8px;padding:8px 12px;cursor:pointer;font:600 13px/1 system-ui,sans-serif;background:#46626F;color:#fff;";
        ok.addEventListener("click", () => {
            ok.disabled = true;
            ok.textContent = "Speichere…";
            runBewertung(gewaehlt, ta.value.trim(), ok);
        });
        const abbr = document.createElement("button");
        abbr.type = "button";
        abbr.textContent = "Abbrechen";
        abbr.style.cssText = "border:1px solid #c3ced5;background:transparent;border-radius:8px;padding:8px 12px;cursor:pointer;font:600 13px/1 system-ui,sans-serif;color:#56646d;";
        abbr.addEventListener("click", closeBewertenPanel);
        bar.appendChild(ok);
        bar.appendChild(abbr);
        panel.appendChild(bar);

        document.documentElement.appendChild(panel);
        const r = anchor.getBoundingClientRect();
        panel.style.top = Math.min(r.bottom + 6, window.innerHeight - 250) + "px";
        panel.style.left = Math.max(8, Math.min(r.left, window.innerWidth - 312)) + "px";
        ta.focus();
    }

    // Note als Tag im Eintragsformular setzen. Das Tag-Feld ist ein ap-select,
    // sein Auswahlfeld ist aber ein Baum aus ".ap-tree-select-item"-Zeilen mit
    // je einer Checkbox - deshalb eine eigene Routine statt selectStatusInForm.
    // Aufbau einer Zeile (verifiziert):
    //   <div class="ap-tree-select-item">
    //     <div ... style="margin-left:16px">   <- Einrueckung = Ebene
    //     <div ...><input type="checkbox"></div>
    //     <div class="inline"><span> 1 </span></div>
    async function setTagInForm(form, tagText) {
        const norm = (s) => (s || "").replace(/\s+/g, " ").trim().toLowerCase();

        // WICHTIG: Das Tags-Feld ist KEIN ap-select. Im Formular liegen nur
        // apTicketPriority, apTicketStatus, apTicketType, apEmployee und
        // apDepartment - Tags ist ein Baum-Auswahlfeld (passend zu den
        // ".ap-tree-select-item"-Zeilen im geoeffneten Zustand).
        const istFeld = (e) => !!e && isVisible(e) && !e.classList.contains("ap-tree-select-item");
        const FELD_SEL = "[class*='tree-select'], [class*='treeSelect'], .ap-select";

        const label = Array.from(form.container.querySelectorAll("div, label, span")).find((d) =>
            d.childElementCount === 0 && /^tags:?$/i.test((d.textContent || "").trim()) && isVisible(d)
        );
        let select = null;
        if (label) {
            const kandidaten = [];
            if (label.nextElementSibling) {
                kandidaten.push(label.nextElementSibling.querySelector(FELD_SEL));
                kandidaten.push(label.nextElementSibling);
            }
            if (label.parentElement) {
                kandidaten.push(label.parentElement.querySelector(FELD_SEL));
            }
            select = kandidaten.find(istFeld) || null;
        }
        // Fallback: einziges Baum-Auswahlfeld im Formular
        if (!select) {
            select = Array.from(form.container.querySelectorAll("[class*='tree-select'], [class*='treeSelect']"))
                .filter(istFeld)[0] || null;
        }
        if (!select) {
            console.warn("klToolbox: Tags-Feld im Eintragsformular nicht gefunden - Note wurde nicht als Tag gesetzt." +
                "\n  Beschriftung 'Tags:' gefunden: " + (label ? "ja" : "nein") +
                "\n  Nachbar der Beschriftung: " + JSON.stringify(
                    label && label.nextElementSibling ? (label.nextElementSibling.className || label.nextElementSibling.tagName) : "-") +
                "\n  tree-select-Elemente im Formular: " + JSON.stringify(
                    Array.from(form.container.querySelectorAll("[class*='tree-select'], [class*='treeSelect']"))
                        .map((e) => e.className).slice(0, 10)) +
                "\n  ap-select-Typen im Formular: " + JSON.stringify(
                    Array.from(form.container.querySelectorAll(".ap-select")).map((e) => e.getAttribute("type"))));
            return false;
        }

        // Auswahlfeld oeffnen. Dahinter steckt eine VUE-Komponente in React
        // (tag-select-input.tsx -> ap-tree-select-resource-input.ts), die ihre
        // Eintraege per HTTP nachlaedt. Ein einzelner Klick auf den aeusseren
        // Container reicht dafuer nicht zuverlaessig - deshalb mehrere
        // Klickziele nacheinander und grosszuegiger warten.
        const feldInfo = String(select.className || select.tagName);
        const zeilenImDom = () => Array.from(document.querySelectorAll(".ap-tree-select-item"));
        const warteAufZeilen = async (runden) => {
            for (let i = 0; i < runden; i++) {
                await sleep(180);
                const alle = zeilenImDom();
                const sichtbar = alle.filter(isVisible);
                if (sichtbar.length > 0) {
                    return sichtbar;
                }
                if (alle.length > 0) {
                    // Vorhanden, aber die Sichtbarkeitspruefung greift nicht
                    // (z. B. Popup mit eigener Groessenberechnung)
                    return alle;
                }
            }
            return [];
        };

        const ziele = [select];
        const innenInput = select.querySelector("input");
        if (innenInput) {
            ziele.push(innenInput);
        }
        const innenLine = select.querySelector(".one-liner");
        if (innenLine) {
            ziele.push(innenLine);
        }
        let rows = [];
        for (const z of ziele) {
            try {
                if (typeof z.focus === "function") {
                    z.focus();
                }
            } catch (err) {
                // Fokus ist optional - manche Elemente lassen ihn nicht zu
            }
            realClick(z);
            rows = await warteAufZeilen(8);
            if (rows.length > 0) {
                break;
            }
        }
        if (rows.length === 0) {
            console.warn("klToolbox: Tag-Auswahlfeld liess sich nicht oeffnen." +
                "\n  Feld: " + JSON.stringify(feldInfo) +
                "\n  Klickziele probiert: " + ziele.length +
                " (Feld" + (innenInput ? " + input" : "") + (innenLine ? " + one-liner" : "") + ")" +
                "\n  .ap-tree-select-item im DOM: " + zeilenImDom().length);
            return false;
        }

        const rowLabel = (r) => {
            const box = r.querySelector("input[type='checkbox']");
            if (box) {
                // Nur den Beschriftungsteil lesen, nicht die Checkbox-Spalte
                const texte = Array.from(r.querySelectorAll("span"))
                    .map((s) => norm(s.textContent))
                    .filter((t) => t.length > 0);
                if (texte.length > 0) {
                    return texte[texte.length - 1];
                }
            }
            return norm(r.textContent);
        };

        const gruppe = norm(settings.kiBewertungTagGruppe || "");
        const wanted = norm(tagText);

        // Ziel suchen: bei konfigurierter Gruppe ab deren Zeile, weil die
        // Kind-Eintraege im Dokument direkt darauf folgen.
        const findeZiel = (liste) => {
            let start = 0;
            if (gruppe) {
                const gi = liste.findIndex((r) => rowLabel(r) === gruppe);
                if (gi >= 0) {
                    start = gi + 1;
                }
            }
            for (let i = start; i < liste.length; i++) {
                if (rowLabel(liste[i]) === wanted) {
                    return liste[i];
                }
            }
            return start > 0 ? (liste.find((r) => rowLabel(r) === wanted) || null) : null;
        };

        // Erste Zelle einer Zeile = Aufklapp-Bereich. Bei Blaettern steht dort
        // nur ein leerer Kommentar, bei Ordnern ein Pfeil-Element.
        const aufklappZelle = (r) => {
            const zelle = r.querySelector("div");
            return (zelle && zelle.children.length > 0) ? zelle : null;
        };

        let ziel = findeZiel(rows);
        if (!ziel) {
            // Ordner sind standardmaessig ZUGEKLAPPT - die Noten existieren
            // dann noch gar nicht im DOM. Erst den konfigurierten Ordner
            // aufklappen, notfalls alle.
            const ordner = [];
            const g = gruppe ? rows.find((r) => rowLabel(r) === gruppe) : null;
            if (g && aufklappZelle(g)) {
                ordner.push(g);
            }
            for (const r of rows) {
                if (r !== g && aufklappZelle(r)) {
                    ordner.push(r);
                }
            }
            for (const o of ordner.slice(0, 20)) {
                const zelle = aufklappZelle(o);
                realClick(zelle.children[0] || zelle);
                for (let i = 0; i < 8; i++) {
                    await sleep(150);
                    let neu = zeilenImDom().filter(isVisible);
                    if (neu.length === 0) {
                        neu = zeilenImDom();
                    }
                    if (neu.length !== rows.length) {
                        rows = neu;
                        break;
                    }
                }
                ziel = findeZiel(rows);
                if (ziel) {
                    break;
                }
            }
        }
        if (!ziel) {
            console.warn("klToolbox: Tag " + JSON.stringify(tagText) + " nicht gefunden." +
                "\n  Gruppe " + JSON.stringify(gruppe || "-") + " im Baum: " +
                (gruppe && rows.some((r) => rowLabel(r) === gruppe) ? "ja" : "nein") +
                "\n  Sichtbare Eintraege: " + JSON.stringify(rows.map(rowLabel).slice(0, 40)));
            realClick(select);
            return false;
        }

        const box = ziel.querySelector("input[type='checkbox']");
        if (!box) {
            console.warn("klToolbox: Zur Zeile " + JSON.stringify(tagText) + " gehoert keine Checkbox.");
            realClick(select);
            return false;
        }
        // Erfolg zaehlt auch, wenn das Feld selbst die Note anzeigt - manche
        // Baeume spiegeln den Zustand nicht in input.checked wider.
        const zeigtTag = () => {
            const anzeige = norm(select.textContent);
            return anzeige.split(/[\s,;]+/).indexOf(wanted) !== -1;
        };
        if (!box.checked && !zeigtTag()) {
            realClick(box);
            await sleep(300);
        }
        if (!box.checked && !zeigtTag()) {
            // Manche Baeume haengen den Handler an die Zeile statt an die Box
            realClick(ziel);
            await sleep(300);
        }
        if (!box.checked && !zeigtTag()) {
            // Letzter Versuch: Zustand direkt setzen und die App benachrichtigen
            box.checked = true;
            box.dispatchEvent(new Event("input", { bubbles: true }));
            box.dispatchEvent(new Event("change", { bubbles: true }));
            await sleep(300);
        }
        const gesetzt = box.checked === true || zeigtTag();
        if (!gesetzt) {
            console.warn("klToolbox: Tag " + JSON.stringify(tagText) + " liess sich nicht aktivieren. " +
                "Feldanzeige: " + JSON.stringify((select.textContent || "").trim().slice(0, 120)));
        }
        // Kurzprotokoll: zeigt in einer Zeile, wo es haengt
        console.info("klToolbox: Tag-Setzen — Feld=" +
            JSON.stringify(select.getAttribute("type") || select.className || "?") +
            ", Zeilen=" + rows.length + ", Gruppe=" + JSON.stringify(gruppe || "-") +
            ", Ziel gefunden=ja, Checkbox=" + box.checked + ", Ergebnis=" + gesetzt);
        realClick(select);   // Auswahlfeld wieder schliessen
        await sleep(250);
        return gesetzt;
    }

    // Eintrag als "intern" markieren. Das ist eine Element-UI-Checkbox
    // (<label class="el-checkbox"> mit <span class="el-checkbox__inner">);
    // das eigentliche <input> ist versteckt, deshalb wird das sichtbare
    // Kaestchen geklickt. Zustand steckt in der Klasse "is-checked".
    async function setInternInForm(form) {
        const norm = (s) => (s || "").replace(/\s+/g, " ").trim().toLowerCase();
        const boxen = Array.from(form.container.querySelectorAll(".el-checkbox")).filter(isVisible);
        const istGesetzt = (b) =>
            b.classList.contains("is-checked") ||
            !!b.querySelector(".el-checkbox__input.is-checked") ||
            !!(b.querySelector("input[type='checkbox']") || {}).checked;

        let ziel = boxen.find((b) => norm(b.textContent) === "intern");
        if (!ziel) {
            ziel = boxen.find((b) => /\bintern\b/i.test(b.textContent || ""));
        }
        if (!ziel) {
            console.warn("klToolbox: Checkbox 'intern' im Eintragsformular nicht gefunden. " +
                "Gefundene Checkboxen: " + JSON.stringify(boxen.map((b) => norm(b.textContent)).slice(0, 20)));
            return false;
        }
        if (istGesetzt(ziel)) {
            return true;
        }

        const kaestchen = ziel.querySelector(".el-checkbox__inner") || ziel;
        realClick(kaestchen);
        await sleep(250);
        if (!istGesetzt(ziel)) {
            realClick(ziel);
            await sleep(250);
        }
        const ok = istGesetzt(ziel);
        if (!ok) {
            console.warn("klToolbox: Checkbox 'intern' liess sich nicht setzen.");
        }
        return ok;
    }

    async function runBewertung(note, kommentar, statusBtn) {
        try {
            const form = findEntryForm();
            if (!form) {
                alert("Das Eintragsformular unten wurde nicht gefunden - bitte einmal in das Textfeld klicken und erneut versuchen.");
                closeBewertenPanel();
                return;
            }
            const noteObj = BEWERTUNG_NOTEN.find((n) => n.note === note) || BEWERTUNG_NOTEN[0];
            let text = "KI-Bewertung: Note " + noteObj.note + " (" + noteObj.text + ")";
            if (kommentar) {
                text += "\n" + kommentar;
            }
            // Reihenfolge: erst der Tag, dann der Text. Andersherum haelt der
            // Editor den Fokus und der Klick auf das Auswahlfeld geht ins Leere.
            const tagOk = await setTagInForm(form, note);
            const internOk = await setInternInForm(form);
            await pasteIntoEntryForm(form, text);
            realClick(form.saveBtn);
            closeBewertenPanel();
            if (!tagOk) {
                console.warn("klToolbox: Eintrag gespeichert, der Tag musste aber manuell gesetzt werden.");
            }
            if (!internOk) {
                console.warn("klToolbox: Eintrag gespeichert, die Markierung 'intern' musste aber manuell gesetzt werden.");
            }
        } catch (err) {
            console.error("klToolbox: Bewertung fehlgeschlagen:", err);
            if (statusBtn) {
                statusBtn.disabled = false;
                statusBtn.textContent = "Speichern";
            }
            alert("Die Bewertung konnte nicht gespeichert werden - Details stehen in der Konsole (F12).");
        }
    }

    // ---------------------------------------------------------- Anfahrt planen

    let routePanelOpen = false;

    // Kundenadresse: Text NACH dem <strong>NR - Name</strong> in der Kunde-Zeile,
    // z. B. ", Rennweg 60, 56626 Andernach" (Icons/Buttons haben keinen Text)
    function extractKundenAdresse() {
        for (const s of document.querySelectorAll("strong")) {
            const m = (s.textContent || "").trim().match(/^(\d{3,8})\s*-\s*(.{2,})$/);
            if (m && s.parentElement) {
                let txt = (s.parentElement.textContent || "").replace(s.textContent, "");
                txt = txt.replace(/\s+/g, " ").trim().replace(/^[,\s]+/, "").replace(/[,\s]+$/, "");
                return txt;
            }
        }
        return "";
    }

    function toggleRoutePanel(anchor) {
        if (routePanelOpen) {
            closeRoutePanel();
        } else {
            openRoutePanel(anchor);
        }
    }

    function closeRoutePanel() {
        const p = document.getElementById("__tt_route_panel");
        if (p) {
            p.remove();
        }
        routePanelOpen = false;
    }

    function openRoutePanel(anchor) {
        closeRoutePanel();
        routePanelOpen = true;

        const panel = document.createElement("div");
        panel.id = "__tt_route_panel";

        const head = document.createElement("div");
        head.className = "ttr-head";
        head.textContent = "Anfahrt planen";
        panel.appendChild(head);

        const addr = extractKundenAdresse();
        if (!addr) {
            const w = document.createElement("div");
            w.className = "ttr-warn";
            w.textContent = "Adresse nicht erkannt - bitte manuell eintragen.";
            panel.appendChild(w);
        }

        const input = document.createElement("input");
        input.type = "text";
        input.id = "ttr_addr";
        input.placeholder = "Zieladresse";
        input.value = addr;
        panel.appendChild(input);

        const bar = document.createElement("div");
        bar.className = "ttr-bar";

        const hereBtn = document.createElement("button");
        hereBtn.type = "button";
        hereBtn.className = "ttr-primary";
        hereBtn.textContent = "📍 Vom aktuellen Standort";
        hereBtn.addEventListener("click", () => startRoute(""));

        const firmaBtn = document.createElement("button");
        firmaBtn.type = "button";
        firmaBtn.className = "ttr-primary";
        firmaBtn.textContent = "🏢 Von der Firma";
        firmaBtn.addEventListener("click", () => {
            const firma = (settings.firmenAdresse || "").trim();
            if (!firma) {
                alert("Keine Firmenadresse hinterlegt - bitte in den Optionen (Ticket-Termin) eintragen oder Einstellungen importieren.");
                return;
            }
            startRoute(firma);
        });

        const closeBtn = document.createElement("button");
        closeBtn.type = "button";
        closeBtn.className = "ttr-secondary";
        closeBtn.textContent = "Abbrechen";
        closeBtn.addEventListener("click", closeRoutePanel);

        bar.appendChild(hereBtn);
        bar.appendChild(firmaBtn);
        bar.appendChild(closeBtn);
        panel.appendChild(bar);

        document.documentElement.appendChild(panel);
        positionPanel(panel, anchor);

        function startRoute(origin) {
            const dest = document.getElementById("ttr_addr").value.trim();
            if (!dest) {
                alert("Bitte eine Zieladresse angeben.");
                return;
            }
            let url = "https://www.google.com/maps/dir/?api=1&travelmode=driving" +
                "&destination=" + encodeURIComponent(dest);
            if (origin) {
                url += "&origin=" + encodeURIComponent(origin);
            }
            window.open(url, "_blank");
            closeRoutePanel();
        }
    }

    // ---------------------------------------------------------- "Nicht erreicht"

    function escapeHtml(s) {
        return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

    // Legt unten im Eintrags-Editor einen Eintrag "Nicht erreicht" an und
    // speichert ihn. Der Eintrags-Editor ist der sichtbare CKEditor, in dessen
    // Umfeld ein "Speichern"-Button liegt (das Mail-Fenster hat "Senden").
    // Text in den Eintrags-Editor einfuegen (OHNE zu speichern) - Baustein
    // fuer "Nicht erreicht" und die Aktions-Makros. CKEditor-sichere
    // Paste-Pipeline; mehrzeilige Texte als <p>-Absaetze.
    async function pasteIntoEntryForm(form, text) {
        const target = form.editor;
        target.focus();
        const sel = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(target);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);

        const html = text.split("\n")
            .map((line) => line.trim().length === 0 ? "<p>&nbsp;</p>" : "<p>" + escapeHtml(line) + "</p>")
            .join("");
        const dt = new DataTransfer();
        dt.setData("text/html", html);
        dt.setData("text/plain", text);
        target.dispatchEvent(new ClipboardEvent("paste", {
            clipboardData: dt,
            bubbles: true,
            cancelable: true
        }));
        await sleep(300);
    }

    async function createNichtErreichtEintrag() {
        try {
            const text = settings.nichtErreichtText || DEFAULTS.nichtErreichtText;
            const form = findEntryForm();
            if (!form) {
                console.warn("Ticket-Termin: Eintrags-Editor oder Speichern-Button nicht gefunden.");
                alert("Eintrags-Editor nicht gefunden - bitte Eintrag manuell anlegen.");
                return;
            }
            await pasteIntoEntryForm(form, text);
            realClick(form.saveBtn);
            console.info("Ticket-Termin: Eintrag 'Nicht erreicht' angelegt und gespeichert.");
        } catch (err) {
            console.warn("Ticket-Termin: 'Nicht erreicht' fehlgeschlagen:", err);
        }
    }

    // ---------------------------------------------------------- Aktions-Makros
    // Konfigurierbare Ketten (Optionen -> Aktions-Makros): Eintrag anlegen
    // und/oder Status setzen (EIN gemeinsames Speichern) und/oder abonnieren.

    function makroPlaceholders(text) {
        const now = new Date();
        return text
            .replace(/\{datum\}/gi, now.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }))
            .replace(/\{zeit\}/gi, now.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) + " Uhr");
    }

    async function runMakro(mk, btn) {
        const old = btn.textContent;
        btn.textContent = "⚡ läuft…";
        let ok = true;
        try {
            const eintrag = (mk.eintrag || "").trim();
            const status = (mk.status || "").trim();
            if (eintrag || status) {
                const form = findEntryForm();
                if (!form) {
                    alert("Eintragsformular nicht gefunden - Makro abgebrochen.");
                    ok = false;
                } else {
                    if (eintrag) {
                        await pasteIntoEntryForm(form, makroPlaceholders(eintrag));
                    }
                    if (status) {
                        ok = await selectStatusInForm(form, status);
                        if (!ok) {
                            alert("Status \"" + status + "\" nicht gefunden - Eintrag wurde NICHT gespeichert.");
                        }
                    }
                    if (ok) {
                        await sleep(200);
                        realClick(form.saveBtn);
                    }
                }
            }
            if (ok && mk.abonnieren) {
                await subscribeTicket(null);
            }
            if (ok && mk.schliessen) {
                // Speichern/Abo-Aktionen kurz wirken lassen, dann Fenster zu
                await sleep(800);
                await closeTicketWindow();
            }
        } catch (err) {
            console.warn("Ticket-Termin: Makro '" + mk.name + "' fehlgeschlagen:", err);
            ok = false;
        }
        btn.textContent = ok ? "✓ erledigt" : "✗ Fehler";
        setTimeout(() => { btn.textContent = old; }, 2500);
    }

    // Ticket-Fenster schliessen: Titelzeile "Ticket #<nr> - ..." suchen und
    // das Schliessen-Symbol klicken. Heuristik: bevorzugt ein Element mit
    // "schliessen/close" in title/aria/Klasse, sonst das am weitesten rechts
    // stehende Symbol der Titelleiste (dort sitzt das X).
    async function closeTicketWindow() {
        let titleLeaf = null;
        for (const el of document.querySelectorAll("div, span")) {
            if (el.childElementCount === 0 && /^Ticket #\d+/.test((el.textContent || "").trim()) && isVisible(el)) {
                titleLeaf = el;
                break;
            }
        }
        if (!titleLeaf) {
            console.warn("Ticket-Termin: Ticket-Fenster-Titelzeile nicht gefunden - Schliessen uebersprungen.");
            return false;
        }
        let barEl = titleLeaf.parentElement;
        let depth = 0;
        let candidates = [];
        while (barEl && depth < 5) {
            candidates = Array.from(barEl.querySelectorAll("i, button, a, span"))
                .filter(isVisible)
                .filter((c) => !c.contains(titleLeaf) && (c.textContent || "").trim().length <= 2);
            if (candidates.length >= 2) {
                break;
            }
            barEl = barEl.parentElement;
            depth++;
        }
        let closeEl = candidates.find((c) =>
            /schlie|close/i.test((c.getAttribute("title") || "") + " " +
                (c.getAttribute("aria-label") || "") + " " + String(c.className || "")));
        if (!closeEl && candidates.length > 0) {
            closeEl = candidates.reduce((a, b) =>
                a.getBoundingClientRect().right >= b.getBoundingClientRect().right ? a : b);
        }
        if (!closeEl) {
            console.warn("Ticket-Termin: Schliessen-Symbol nicht gefunden.");
            return false;
        }
        realClick(closeEl);
        return true;
    }

    function closeMakroPanel() {
        const p = document.getElementById("__tt_makro_panel");
        if (p) {
            p.remove();
        }
    }

    function toggleMakroPanel(anchor) {
        if (document.getElementById("__tt_makro_panel")) {
            closeMakroPanel();
            return;
        }
        const makros = (Array.isArray(settings.makros) ? settings.makros : []).filter((m) => m && m.name);
        if (makros.length === 0) {
            return;
        }
        const panel = document.createElement("div");
        panel.id = "__tt_makro_panel";
        for (const mk of makros) {
            const b = document.createElement("button");
            b.type = "button";
            b.textContent = "⚡ " + mk.name;
            const parts = [];
            if ((mk.eintrag || "").trim()) { parts.push("Eintrag"); }
            if ((mk.status || "").trim()) { parts.push("Status: " + mk.status.trim()); }
            if (mk.abonnieren) { parts.push("Abonnieren"); }
            if (mk.schliessen) { parts.push("Fenster schließen"); }
            b.title = parts.join(" + ") || "Keine Aktionen konfiguriert";
            b.addEventListener("click", () => {
                closeMakroPanel();
                runMakro(mk, anchor);
            });
            panel.appendChild(b);
        }
        document.documentElement.appendChild(panel);
        // Unter dem Anker ausrichten
        const r = anchor.getBoundingClientRect();
        panel.style.top = Math.min(r.bottom + 6, window.innerHeight - 60) + "px";
        panel.style.right = Math.max(8, window.innerWidth - r.right) + "px";
    }

    // ---------------------------------------------------------- Termin-Ausgabe

    function pad(n) {
        return String(n).padStart(2, "0");
    }

    function toIcsLocal(d) {
        return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) +
            "T" + pad(d.getHours()) + pad(d.getMinutes()) + "00";
    }

    function toIsoLocal(d) {
        return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) +
            "T" + pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":00";
    }

    function icsEscape(s) {
        return s
            .replace(/\\/g, "\\\\")
            .replace(/;/g, "\\;")
            .replace(/,/g, "\\,")
            .replace(/\r?\n/g, "\\n");
    }

    // ICS-Zeilen gemaess RFC 5545 auf max. 74 Zeichen falten
    function foldIcsLine(line) {
        if (line.length <= 74) {
            return line;
        }
        const parts = [];
        let rest = line;
        parts.push(rest.slice(0, 74));
        rest = rest.slice(74);
        while (rest.length > 0) {
            parts.push(" " + rest.slice(0, 73));
            rest = rest.slice(73);
        }
        return parts.join("\r\n");
    }

    // tentative: Frei/Gebucht = "Mit Vorbehalt" (Outlook liest
    // X-MICROSOFT-CDO-BUSYSTATUS). filePrefix z. B. "Anfahrt".
    function downloadIcs(subject, body, start, end, ticketNr, ort, tentative, filePrefix) {
        const dtstamp = new Date();
        const dtstampUtc = dtstamp.getUTCFullYear() + pad(dtstamp.getUTCMonth() + 1) + pad(dtstamp.getUTCDate()) +
            "T" + pad(dtstamp.getUTCHours()) + pad(dtstamp.getUTCMinutes()) + pad(dtstamp.getUTCSeconds()) + "Z";
        const uid = "ticket-" + (ticketNr || "termin") + "-" + Date.now() + "@kltoolbox.local";
        const lines = [
            "BEGIN:VCALENDAR",
            "VERSION:2.0",
            "PRODID:-//klToolbox//TicketTermin//DE",
            "METHOD:PUBLISH",
            "BEGIN:VEVENT",
            "UID:" + uid,
            "DTSTAMP:" + dtstampUtc,
            "DTSTART:" + toIcsLocal(start),
            "DTEND:" + toIcsLocal(end),
            "SUMMARY:" + icsEscape(subject),
            "LOCATION:" + icsEscape(ort || ""),
            "DESCRIPTION:" + icsEscape(body)
        ];
        if (tentative === true) {
            lines.push("STATUS:TENTATIVE");
            lines.push("X-MICROSOFT-CDO-BUSYSTATUS:TENTATIVE");
        }
        lines.push("END:VEVENT");
        lines.push("END:VCALENDAR");
        const blob = new Blob([lines.map(foldIcsLine).join("\r\n")], { type: "text/calendar;charset=utf-8" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = (filePrefix || "Termin") + "_" + (ticketNr || "Ticket") + ".ics";
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    }

    function openOutlookWeb(subject, body, start, end, ort) {
        // OWA verschluckt \n im body-Parameter - CRLF bleibt (meist) erhalten
        const bodyCrlf = body.replace(/\r?\n/g, "\r\n");
        let url = "https://outlook.office.com/calendar/action/compose" +
            "?rru=addevent" +
            "&subject=" + encodeURIComponent(subject) +
            "&body=" + encodeURIComponent(bodyCrlf) +
            "&startdt=" + encodeURIComponent(toIsoLocal(start)) +
            "&enddt=" + encodeURIComponent(toIsoLocal(end));
        if (ort) {
            url += "&location=" + encodeURIComponent(ort);
        }
        window.open(url, "_blank");
    }

    // ---------------------------------------------------------- UI

    let panelOpen = false;

    // ---------------------------------------------------------- Abonnieren

    // Nativer "Abonnieren"-Button: <button class="ap-button light">
    // <i class="... ap-icon-add ..."></i>Abonnieren</button>.
    // Eigene Toolbar-Buttons (__tt_tbtn) sind ausgeschlossen.
    function findAbonnierenButton() {
        for (const b of document.querySelectorAll("button")) {
            if (b.classList.contains("__tt_tbtn")) {
                continue;
            }
            if ((b.textContent || "").trim() === "Abonnieren" && isVisible(b)) {
                return b;
            }
        }
        return null;
    }

    // Reiter (z. B. "Abonnenten (3)", "Ticket") ueber den Text finden;
    // moeglichst tiefes Element nehmen (Eltern-Container matchen auch).
    function findTab(re) {
        let best = null;
        for (const el of document.querySelectorAll("li, [role='tab'], a, button, div, span")) {
            const t = (el.textContent || "").trim();
            if (t.length > 30 || !re.test(t) || !isVisible(el)) {
                continue;
            }
            if (!best || best.contains(el)) {
                best = el;
            }
        }
        if (!best) {
            return null;
        }
        return best.closest("li, [role='tab']") || best;
    }

    // Klickt den nativen Abonnieren-Button. Der ist teils erst im DOM,
    // wenn der Tab "Abonnenten" geoeffnet wurde - dann Tab oeffnen,
    // abonnieren und zurueck zum Ticket-Tab wechseln.
    async function subscribeTicket(btn) {
        try {
            let native = findAbonnierenButton();
            let switchedTab = false;
            let aboTab = null;
            if (!native) {
                aboTab = findTab(/^Abonnenten( \(\d+\))?$/);
                if (!aboTab) {
                    alert("Abonnenten-Bereich nicht gefunden - bitte manuell abonnieren.");
                    return;
                }
                realClick(aboTab);
                switchedTab = true;
                for (let i = 0; i < 10 && !native; i++) {
                    await sleep(200);
                    native = findAbonnierenButton();
                }
            }
            if (native) {
                realClick(native);
                await sleep(400);
                if (btn) {
                    const old = btn.textContent;
                    btn.textContent = "✓ Abonniert";
                    setTimeout(() => { btn.textContent = old; }, 2500);
                }
            } else {
                console.warn("Ticket-Termin: 'Abonnieren'-Button nicht gefunden (schon abonniert?).");
                alert("'Abonnieren'-Button nicht gefunden - vermutlich ist das Ticket bereits abonniert.");
            }
            if (switchedTab) {
                // Zurueck zum "Ticket"-Tab: als GESCHWISTER des Abonnenten-
                // Tabs suchen - die globale Suche traf sonst die "Ticket"-
                // Spaltenueberschrift der Liste dahinter (klickte = sortierte).
                await sleep(300);
                let ticketTab = null;
                if (aboTab && aboTab.parentElement) {
                    ticketTab = Array.from(aboTab.parentElement.children).find((c) =>
                        c !== aboTab && /^Ticket(\s*\(\d+\))?$/.test((c.textContent || "").trim()));
                }
                if (!ticketTab) {
                    ticketTab = findTab(/^Ticket$/);
                }
                if (ticketTab) {
                    realClick(ticketTab);
                }
            }
        } catch (err) {
            console.warn("Ticket-Termin: Abonnieren fehlgeschlagen:", err);
        }
    }

    // Bevorzugt: Button in der Ticketsystem-Toolbar (stabile Klasse
    // ap-toolbar--fullscreen-at-top), im nativen Look (ap-button light).
    // Fallback: schwebender Button unten rechts.
    function ensureButtons() {
        // Die ap-toolbar--fullscreen-at-top ist die Ticket-Toolbar; das
        // Mail-Fenster hat keine solche Toolbar (dort sitzt das Vorlagen-Addin
        // in der Senden/Verwerfen-Leiste).
        const toolbars = document.querySelectorAll(".ap-toolbar--fullscreen-at-top");
        let attached = false;
        // Einzel-Schalter: Button anlegen, wenn aktiv - entfernen, wenn nicht
        const ensureOne = (tb, host, cls, enabled, build) => {
            const existing = tb.querySelector("." + cls);
            if (enabled && !existing) {
                host.appendChild(build());
            } else if (!enabled && existing) {
                existing.remove();
            }
        };
        for (const tb of toolbars) {
            attached = true;
            const host = tb.firstElementChild || tb;
            ensureOne(tb, host, "__tt_termin_tbtn", settings.ftTermin !== false, () => {
                const btn = document.createElement("button");
                btn.type = "button";
                btn.className = "ap-button light __tt_tbtn __tt_termin_tbtn";
                btn.title = "Aus diesem Ticket einen Outlook-Termin erstellen";
                btn.textContent = "📅 Termin";
                btn.addEventListener("click", () => togglePanel(btn));
                return btn;
            });
            ensureOne(tb, host, "__tt_ne_tbtn", settings.ftNichtErreicht !== false, () => {
                const neBtn = document.createElement("button");
                neBtn.type = "button";
                neBtn.className = "ap-button light __tt_tbtn __tt_ne_tbtn";
                neBtn.title = "Ticket-Eintrag 'Nicht erreicht' anlegen und speichern";
                neBtn.textContent = "📵 Nicht erreicht";
                neBtn.addEventListener("click", () => createNichtErreichtEintrag());
                return neBtn;
            });
            ensureOne(tb, host, "__tt_abo_tbtn", settings.ftAbo !== false, () => {
                const aboBtn = document.createElement("button");
                aboBtn.type = "button";
                aboBtn.className = "ap-button light __tt_tbtn __tt_abo_tbtn";
                aboBtn.title = "Dieses Ticket abonnieren (klickt den nativen Abonnieren-Button, bei Bedarf über den Abonnenten-Tab)";
                aboBtn.textContent = "🔔 Abo";
                aboBtn.addEventListener("click", (e) => subscribeTicket(e.currentTarget));
                return aboBtn;
            });
            ensureOne(tb, host, "__tt_route_tbtn", settings.ftAnfahrt !== false, () => {
                const rBtn = document.createElement("button");
                rBtn.type = "button";
                rBtn.className = "ap-button light __tt_tbtn __tt_route_tbtn";
                rBtn.title = "Anfahrt zur Kundenadresse planen (Google Maps)";
                rBtn.textContent = "🚗 Anfahrt";
                rBtn.addEventListener("click", () => toggleRoutePanel(rBtn));
                return rBtn;
            });
            const hasMakros = Array.isArray(settings.makros) && settings.makros.some((m) => m && m.name);
            ensureOne(tb, host, "__tt_makro_tbtn", settings.ftMakros !== false && hasMakros, () => {
                const mBtn = document.createElement("button");
                mBtn.type = "button";
                mBtn.className = "ap-button light __tt_tbtn __tt_makro_tbtn";
                mBtn.title = "Aktions-Makros ausführen (konfigurierbar in den Optionen)";
                mBtn.textContent = "⚡ Makros";
                mBtn.addEventListener("click", () => toggleMakroPanel(mBtn));
                return mBtn;
            });
        }
        // Kein schwebender Fallback mehr: ohne Ticket-Toolbar (Startseite,
        // Ticketliste) gibt es keinen Termin-Button.
        const floating = document.getElementById("__tt_btn");
        if (floating) {
            floating.remove();
        }
        if (!attached && panelOpen) {
            closePanel();
        }
    }

    function togglePanel(anchor) {
        if (panelOpen) {
            closePanel();
        } else {
            openPanel(anchor);
        }
    }

    // Panel am Toolbar-Button ausrichten; ohne Anker gilt die CSS-Position.
    function positionPanel(panel, anchor) {
        if (!anchor || !anchor.isConnected) {
            return;
        }
        const r = anchor.getBoundingClientRect();
        panel.style.right = Math.max(8, window.innerWidth - r.right) + "px";
        if (r.top < window.innerHeight / 2) {
            panel.style.top = Math.min(r.bottom + 8, window.innerHeight - 160) + "px";
            panel.style.bottom = "auto";
        } else {
            panel.style.bottom = (window.innerHeight - r.top + 8) + "px";
            panel.style.top = "auto";
        }
    }

    function closePanel() {
        const p = document.getElementById("__tt_panel");
        if (p) {
            p.remove();
        }
        panelOpen = false;
    }

    function fieldRow(labelText, id, value) {
        const row = document.createElement("div");
        row.className = "tt-row";
        const label = document.createElement("label");
        label.textContent = labelText;
        label.setAttribute("for", id);
        const input = document.createElement("input");
        input.type = "text";
        input.id = id;
        input.value = value;
        row.appendChild(label);
        row.appendChild(input);
        return row;
    }

    function openPanel(anchor) {
        closePanel();
        panelOpen = true;

        const data = extractAll();

        const panel = document.createElement("div");
        panel.id = "__tt_panel";

        const head = document.createElement("div");
        head.className = "tt-head";
        head.textContent = "Outlook-Termin aus Ticket";
        panel.appendChild(head);

        const warn = [];
        if (!data.kunde) { warn.push("Kunde"); }
        if (!data.ticketNr) { warn.push("TicketNR"); }
        if (!data.bezeichnung) { warn.push("Bezeichnung"); }
        if (!data.ansprechpartner) { warn.push("Ansprechpartner"); }
        if (warn.length > 0) {
            const w = document.createElement("div");
            w.className = "tt-warn";
            w.textContent = "Nicht gefunden: " + warn.join(", ") + " - bitte manuell ergänzen.";
            panel.appendChild(w);
        }
        // Die E-Mail steht nur im Kontaktmenue - war es in diesem Ticket noch
        // nicht offen, kann die Erweiterung sie nicht kennen.
        if (!data.email) {
            const wm = document.createElement("div");
            wm.className = "tt-warn";
            wm.textContent = "E-Mail nicht gefunden - einmal das Menü neben dem Ansprechpartner öffnen, dann „Termin“ erneut aufrufen.";
            panel.appendChild(wm);
        }

        panel.appendChild(fieldRow("Kunde", "tt_kunde", data.kunde));
        panel.appendChild(fieldRow("TicketNR", "tt_ticketnr", data.ticketNr));
        panel.appendChild(fieldRow("Bezeichnung", "tt_bezeichnung", data.bezeichnung));
        panel.appendChild(fieldRow("Ansprechpartner", "tt_ap", data.ansprechpartner));
        panel.appendChild(fieldRow("Telefon", "tt_tel", data.telefon));
        panel.appendChild(fieldRow("E-Mail", "tt_mail", data.email));

        // Datum/Zeit: naechste volle Stunde, Dauer aus den Optionen
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() + 1, 0, 0);

        const timeRow = document.createElement("div");
        timeRow.className = "tt-row tt-time";
        const dateInput = document.createElement("input");
        dateInput.type = "date";
        dateInput.id = "tt_date";
        dateInput.value = start.getFullYear() + "-" + pad(start.getMonth() + 1) + "-" + pad(start.getDate());
        const timeInput = document.createElement("input");
        timeInput.type = "time";
        timeInput.id = "tt_time";
        timeInput.value = pad(start.getHours()) + ":" + pad(start.getMinutes());
        const durSelect = document.createElement("select");
        durSelect.id = "tt_dur";
        [15, 30, 45, 60, 90, 120].forEach((min) => {
            const o = document.createElement("option");
            o.value = String(min);
            o.textContent = min + " Min";
            if (min === Number(settings.defaultDurationMin)) {
                o.selected = true;
            }
            durSelect.appendChild(o);
        });
        const timeLabel = document.createElement("label");
        timeLabel.textContent = "Beginn / Dauer";
        timeRow.appendChild(timeLabel);
        const timeWrap = document.createElement("div");
        timeWrap.className = "tt-time-wrap";
        timeWrap.appendChild(dateInput);
        timeWrap.appendChild(timeInput);
        timeWrap.appendChild(durSelect);
        timeRow.appendChild(timeWrap);
        panel.appendChild(timeRow);

        // Terminart (Telefon/Teams/Vor Ort) - bei "Vor Ort" Adressfeld einblenden
        const artRow = document.createElement("div");
        artRow.className = "tt-row";
        const artLabel = document.createElement("label");
        artLabel.textContent = "Terminart";
        artLabel.setAttribute("for", "tt_art");
        const artSelect = document.createElement("select");
        artSelect.id = "tt_art";
        for (const art of TERMINARTEN) {
            const o = document.createElement("option");
            o.value = art.value;
            o.textContent = art.label;
            if (art.value === (settings.defaultTerminart || DEFAULTS.defaultTerminart)) {
                o.selected = true;
            }
            artSelect.appendChild(o);
        }
        artRow.appendChild(artLabel);
        artRow.appendChild(artSelect);
        panel.appendChild(artRow);

        const addrRow = fieldRow("Adresse", "tt_addr", extractKundenAdresse());
        panel.appendChild(addrRow);

        // Anfahrt (nur bei "Vor Ort"): separater Termin direkt vor dem
        // Haupttermin, Startpunkt aktueller Ort oder Firmenadresse.
        const anfRow = document.createElement("div");
        anfRow.className = "tt-row tt-time";
        const anfLabel = document.createElement("label");
        anfLabel.textContent = "Anfahrt";
        anfLabel.setAttribute("for", "tt_anf");
        const anfWrap = document.createElement("div");
        anfWrap.className = "tt-time-wrap";
        const anfCheck = document.createElement("input");
        anfCheck.type = "checkbox";
        anfCheck.id = "tt_anf";
        anfCheck.checked = true;
        anfCheck.title = "Separaten Termin „Anfahrt…“ direkt vor dem Haupttermin anlegen";
        const anfDur = document.createElement("select");
        anfDur.id = "tt_anf_dur";
        [15, 30, 45, 60, 90].forEach((min) => {
            const o = document.createElement("option");
            o.value = String(min);
            o.textContent = min + " Min";
            if (min === 30) {
                o.selected = true;
            }
            anfDur.appendChild(o);
        });
        const anfVon = document.createElement("select");
        anfVon.id = "tt_anf_von";
        [["aktuell", "von aktuellem Ort"], ["firma", "von der Firma"]].forEach(([v, l]) => {
            const o = document.createElement("option");
            o.value = v;
            o.textContent = l;
            anfVon.appendChild(o);
        });
        const syncAnfEnabled = () => {
            anfDur.disabled = !anfCheck.checked;
            anfVon.disabled = !anfCheck.checked;
        };
        anfCheck.addEventListener("change", syncAnfEnabled);
        syncAnfEnabled();
        // Route in Google Maps oeffnen - Startpunkt richtet sich nach der
        // Auswahl daneben. Hinweis: die Google-Maps-URL-API kennt KEINEN
        // Parameter fuer eine geplante Abfahrtszeit (nur origin/destination/
        // travelmode/waypoints/avoid), die Fahrzeit gilt also fuer "jetzt".
        const routeBtn = document.createElement("button");
        routeBtn.type = "button";
        routeBtn.className = "tt-secondary";
        routeBtn.textContent = "🚗 Route";
        routeBtn.title = "Route in Google Maps öffnen (Fahrzeit gilt für die aktuelle Verkehrslage - eine geplante Uhrzeit lässt sich per Maps-Link nicht übergeben)";
        routeBtn.addEventListener("click", () => {
            const dest = document.getElementById("tt_addr").value.trim();
            if (!dest) {
                alert("Bitte zuerst eine Adresse eintragen.");
                return;
            }
            let origin = "";
            if (anfVon.value === "firma") {
                origin = (settings.firmenAdresse || "").trim();
                if (!origin) {
                    alert("Keine Firmenadresse hinterlegt - bitte in den Optionen (Ticket-Termin) eintragen oder Einstellungen importieren.");
                    return;
                }
            }
            let url = "https://www.google.com/maps/dir/?api=1&travelmode=driving" +
                "&destination=" + encodeURIComponent(dest);
            if (origin) {
                url += "&origin=" + encodeURIComponent(origin);
            }
            window.open(url, "_blank");
        });
        anfWrap.appendChild(anfCheck);
        anfWrap.appendChild(anfDur);
        anfWrap.appendChild(anfVon);
        anfWrap.appendChild(routeBtn);
        anfRow.appendChild(anfLabel);
        anfRow.appendChild(anfWrap);
        panel.appendChild(anfRow);

        const syncAddrRow = () => {
            const vorort = (artSelect.value === "vorort");
            addrRow.style.display = vorort ? "" : "none";
            anfRow.style.display = vorort ? "" : "none";
        };
        syncAddrRow();
        artSelect.addEventListener("change", syncAddrRow);

        // Frei/Gebucht "Mit Vorbehalt" (nur ICS - der Outlook-Web-Link
        // unterstuetzt den Frei/Gebucht-Status nicht)
        const vbRow = document.createElement("div");
        vbRow.className = "tt-row";
        const vbLabel = document.createElement("label");
        vbLabel.textContent = "Vorbehalt";
        vbLabel.setAttribute("for", "tt_vb");
        const vbWrap = document.createElement("div");
        vbWrap.className = "tt-time-wrap";
        const vbCheck = document.createElement("input");
        vbCheck.type = "checkbox";
        vbCheck.id = "tt_vb";
        vbCheck.title = "Termin als „Mit Vorbehalt“ anlegen (wirkt nur bei der ICS-Datei - in Outlook Web bitte manuell setzen)";
        const vbText = document.createElement("span");
        vbText.textContent = "als „Mit Vorbehalt“ anlegen (nur ICS)";
        vbWrap.appendChild(vbCheck);
        vbWrap.appendChild(vbText);
        vbRow.appendChild(vbLabel);
        vbRow.appendChild(vbWrap);
        panel.appendChild(vbRow);

        const bar = document.createElement("div");
        bar.className = "tt-bar";

        const icsBtn = document.createElement("button");
        icsBtn.type = "button";
        icsBtn.className = "tt-primary";
        icsBtn.textContent = "ICS (Outlook Desktop)";
        icsBtn.addEventListener("click", () => runCreate("ics"));

        const owaBtn = document.createElement("button");
        owaBtn.type = "button";
        owaBtn.className = "tt-primary";
        owaBtn.textContent = "Outlook Web";
        owaBtn.addEventListener("click", () => runCreate("owa"));

        const closeBtn = document.createElement("button");
        closeBtn.type = "button";
        closeBtn.className = "tt-secondary";
        closeBtn.textContent = "Abbrechen";
        closeBtn.addEventListener("click", closePanel);

        bar.appendChild(icsBtn);
        bar.appendChild(owaBtn);
        bar.appendChild(closeBtn);
        panel.appendChild(bar);

        document.documentElement.appendChild(panel);
        positionPanel(panel, anchor);

        function runCreate(mode) {
            const d = {
                kunde: document.getElementById("tt_kunde").value.trim(),
                kundeName: data.kundeName,
                kundeNr: data.kundeNr,
                ticketNr: document.getElementById("tt_ticketnr").value.trim(),
                bezeichnung: document.getElementById("tt_bezeichnung").value.trim(),
                ansprechpartner: document.getElementById("tt_ap").value.trim(),
                telefon: document.getElementById("tt_tel").value.trim(),
                email: document.getElementById("tt_mail").value.trim()
            };
            const dateVal = document.getElementById("tt_date").value;
            const timeVal = document.getElementById("tt_time").value;
            if (!dateVal || !timeVal) {
                alert("Bitte Datum und Uhrzeit angeben.");
                return;
            }
            const [y, mo, da] = dateVal.split("-").map(Number);
            const [h, mi] = timeVal.split(":").map(Number);
            const startDt = new Date(y, mo - 1, da, h, mi, 0);
            const durMin = Number(document.getElementById("tt_dur").value) || 60;
            const endDt = new Date(startDt.getTime() + durMin * 60000);

            const subject = fillTemplate(settings.subjectTemplate || DEFAULTS.subjectTemplate, d);
            const body = fillTemplate(settings.bodyTemplate || DEFAULTS.bodyTemplate, d);

            // Terminart -> Ort-Feld: Vor Ort = Kundenadresse, sonst Art als Marker
            const art = document.getElementById("tt_art").value;
            let ort = "";
            if (art === "vorort") {
                ort = document.getElementById("tt_addr").value.trim();
            } else if (art === "teams") {
                ort = "Microsoft Teams";
            } else if (art === "telefon") {
                ort = "Telefon";
            }

            const vorbehalt = document.getElementById("tt_vb").checked;

            // Anfahrt-Termin (nur "Vor Ort"): liegt direkt vor dem Haupttermin
            let anfahrt = null;
            if (art === "vorort" && document.getElementById("tt_anf").checked) {
                const anfMin = Number(document.getElementById("tt_anf_dur").value) || 0;
                if (anfMin > 0) {
                    const von = document.getElementById("tt_anf_von").value;
                    const firma = (settings.firmenAdresse || "").trim();
                    if (von === "firma" && !firma) {
                        alert("Keine Firmenadresse hinterlegt - bitte in den Optionen (Ticket-Termin) eintragen oder Einstellungen importieren.");
                        return;
                    }
                    const vonText = (von === "firma") ? "Firma (" + firma + ")" : "aktueller Standort";
                    anfahrt = {
                        subject: "Anfahrt: " + (d.kunde || "Termin") + (d.ticketNr ? " (" + d.ticketNr + ")" : ""),
                        body: "Anfahrt zum Vor-Ort-Termin" + (d.ticketNr ? " " + d.ticketNr : "") +
                            "\nVon: " + vonText +
                            (ort ? "\nZiel: " + ort : ""),
                        start: new Date(startDt.getTime() - anfMin * 60000),
                        end: startDt,
                        ort: ort
                    };
                }
            }

            if (mode === "ics") {
                downloadIcs(subject, body, startDt, endDt, d.ticketNr, ort, vorbehalt);
                if (anfahrt) {
                    // zweiter Download leicht verzoegert (Browser fragt ggf.
                    // einmalig "mehrere Downloads erlauben")
                    setTimeout(() => {
                        downloadIcs(anfahrt.subject, anfahrt.body, anfahrt.start, anfahrt.end, d.ticketNr, anfahrt.ort, vorbehalt, "Anfahrt");
                    }, 300);
                }
            } else {
                openOutlookWeb(subject, body, startDt, endDt, ort);
                if (anfahrt) {
                    // Popup-Blocker erlauben nur ein Fenster pro Klick - der
                    // Anfahrt-Termin braucht daher einen zweiten Klick
                    if (settings.autoStatus !== false) {
                        setStatusTerminVereinbart();
                    }
                    head.textContent = "Anfahrt-Termin öffnen";
                    bar.textContent = "";
                    const anfBtn = document.createElement("button");
                    anfBtn.type = "button";
                    anfBtn.className = "tt-primary";
                    anfBtn.textContent = "🚗 Anfahrt in Outlook Web öffnen";
                    anfBtn.addEventListener("click", () => {
                        openOutlookWeb(anfahrt.subject, anfahrt.body, anfahrt.start, anfahrt.end, anfahrt.ort);
                        closePanel();
                    });
                    const doneBtn = document.createElement("button");
                    doneBtn.type = "button";
                    doneBtn.className = "tt-secondary";
                    doneBtn.textContent = "Ohne Anfahrt schließen";
                    doneBtn.addEventListener("click", closePanel);
                    bar.appendChild(anfBtn);
                    bar.appendChild(doneBtn);
                    return; // Panel bleibt fuer den zweiten Schritt offen
                }
            }
            closePanel();
            if (settings.autoStatus !== false) {
                setStatusTerminVereinbart();
            }
        }
    }

    // ---------------------------------------------------------- Init

    // Modul-Schalter (Optionen -> "Module"): live zu-/abschaltbar
    let moduleEnabled = true;

    function removeTerminUi() {
        document.querySelectorAll(".__tt_tbtn, .__tt_wait_badge, .__tt_list_dot, .__tt_list_badge, .__tt_list_age, .__tt_bew_btn").forEach((el) => el.remove());
        ["__tt_btn", "__tt_panel", "__tt_route_panel", "__tt_makro_panel", "__tt_bew_panel"].forEach((id) => {
            const el = document.getElementById(id);
            if (el) {
                el.remove();
            }
        });
    }

    function init() {
        chrome.storage.local.get({ modTicket: true }, (items) => {
            moduleEnabled = items.modTicket !== false;
            if (moduleEnabled) {
                ensureButtons();
                waitTick();
            } else {
                // Falls der Observer vor dem Storage-Read schon gerendert hat
                removeTerminUi();
            }
        });
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area === "local" && changes.modTicket) {
                moduleEnabled = changes.modTicket.newValue !== false;
                if (moduleEnabled) {
                    ensureButtons();
                    waitTick();
                } else {
                    removeTerminUi();
                }
            }
        });
        // SPA: Toolbar entsteht dynamisch -> Button/Badge nachruesten
        const obs = new MutationObserver(() => {
            if (moduleEnabled) {
                ensureButtons();
                scheduleWaitBadge();
            }
        });
        obs.observe(document.documentElement, { childList: true, subtree: true });
        // Anzeige minuetlich auffrischen (relevant fuer Prio-Hoch-Ampel)
        setInterval(() => {
            if (moduleEnabled) {
                renderWaitBadge();
                ensureListDots();
            }
        }, 60000);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
