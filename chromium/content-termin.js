// Version
// version = "1.5.0"  (Modul Ticket-Termin, klToolbox)
// datum   = "2026-08-13"
// autor   = "Felix Kappen"
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
        ftWaitList: true
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

    function extractEmail() {
        const viaLabel = labelValue(["E-Mail:", "Email:", "Mail:", "E-Mail-Adresse:"]);
        if (viaLabel) {
            return viaLabel;
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
    // API-Zugriff - die Venabo-REST-API verlangt einen x-api-token, und der
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

    function badgeColor(ms, prio) {
        const min = ms / 60000;
        if (/hoch|high/i.test(prio)) {
            if (min < 15) { return "#1a7f37"; }
            if (min < 60) { return "#b58900"; }
            return "#b3261e";
        }
        const tage = min / 1440;
        if (tage < 1) { return "#1a7f37"; }
        if (tage < 3) { return "#b58900"; }
        return "#b3261e";
    }

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
            badge.style.background = color;
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

    function ensureListDots() {
        if (settings.ftWaitList === false) {
            document.querySelectorAll(".__tt_list_dot, .__tt_list_badge").forEach((d) => d.remove());
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
            let colSched = -1;
            Array.from(hdrRow.children).forEach((td, i) => {
                if (td.querySelector("[id$='_createdAt']")) { colCreated = i; }
                if (td.querySelector("[id$='_priority']")) { colPrio = i; }
                if (td.querySelector("[id$='_id']")) { colId = i; }
                if (td.querySelector("[id$='_scheduled']")) { colSched = i; }
            });
            if (colCreated < 0 || colId < 0) {
                continue; // kein Ticket-Grid (oder Spalte ausgeblendet)
            }
            for (const tr of grid.querySelectorAll(".objbox table.obj tbody tr")) {
                const tds = tr.children;
                if (tds.length <= Math.max(colCreated, colId, colSched) || tds[0].tagName !== "TD") {
                    continue;
                }
                const m = /(\d{1,2})\.(\d{1,2})\.(\d{4}),?\s*(\d{1,2}):(\d{2})/
                    .exec(tds[colCreated].textContent || "");
                if (!m) {
                    continue;
                }
                const created = new Date(+m[3], +m[2] - 1, +m[1], +m[4], +m[5], 0);
                if (isNaN(created.getTime())) {
                    continue;
                }
                const ms = Date.now() - created.getTime();
                const prio = colPrio >= 0 ? (tds[colPrio].textContent || "") : "";
                const color = badgeColor(ms, prio);
                const title = "Wartezeit: " + formatAge(ms) + " (erstellt " + m[0] + ", Prio: " + (prio.trim() || "unbekannt") + ")";

                // Bevorzugt: kompaktes Pill in der (meist leeren) Verplanungs-
                // Spalte. Ist die Zelle belegt oder die Spalte ausgeblendet,
                // faellt die Anzeige auf den Punkt vor der Ticketnummer zurueck.
                let schedCell = null;
                if (colSched >= 0) {
                    const cell = tds[colSched];
                    const ownBadge = cell.querySelector(".__tt_list_badge");
                    const foreign = (cell.textContent || "").trim().length > 0 &&
                        !(ownBadge && cell.childElementCount === 1);
                    if (!foreign || ownBadge) {
                        schedCell = cell;
                    }
                }
                if (schedCell) {
                    const oldDot = tds[colId].querySelector(".__tt_list_dot");
                    if (oldDot) {
                        oldDot.remove();
                    }
                    let badge = schedCell.querySelector(".__tt_list_badge");
                    if (!badge) {
                        schedCell.textContent = ""; // &nbsp; raus
                        badge = document.createElement("span");
                        badge.className = "__tt_list_badge";
                        schedCell.appendChild(badge);
                    }
                    const text = formatAgeCompact(ms);
                    if (badge.dataset.x !== text) {
                        badge.dataset.x = text;
                        badge.textContent = text;
                    }
                    if (badge.dataset.c !== color) {
                        badge.dataset.c = color;
                        badge.style.background = color;
                    }
                    if (badge.dataset.t !== title) {
                        badge.dataset.t = title;
                        badge.title = title;
                    }
                } else {
                    let dot = tds[colId].querySelector(".__tt_list_dot");
                    if (!dot) {
                        dot = document.createElement("span");
                        dot.className = "__tt_list_dot";
                        tds[colId].insertBefore(dot, tds[colId].firstChild);
                    }
                    if (dot.dataset.c !== color) {
                        dot.dataset.c = color;
                        dot.style.background = color;
                    }
                    if (dot.dataset.t !== title) {
                        dot.dataset.t = title;
                        dot.title = title;
                    }
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

    function downloadIcs(subject, body, start, end, ticketNr, ort) {
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
            "DESCRIPTION:" + icsEscape(body),
            "END:VEVENT",
            "END:VCALENDAR"
        ];
        const blob = new Blob([lines.map(foldIcsLine).join("\r\n")], { type: "text/calendar;charset=utf-8" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "Termin_" + (ticketNr || "Ticket") + ".ics";
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
        const syncAddrRow = () => {
            addrRow.style.display = (artSelect.value === "vorort") ? "" : "none";
        };
        syncAddrRow();
        artSelect.addEventListener("change", syncAddrRow);

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

            if (mode === "ics") {
                downloadIcs(subject, body, startDt, endDt, d.ticketNr, ort);
            } else {
                openOutlookWeb(subject, body, startDt, endDt, ort);
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
        document.querySelectorAll(".__tt_tbtn, .__tt_wait_badge, .__tt_list_dot").forEach((el) => el.remove());
        ["__tt_btn", "__tt_panel", "__tt_route_panel", "__tt_makro_panel"].forEach((id) => {
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
