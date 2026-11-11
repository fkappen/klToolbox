// Version
// version = "1.0.0"  (Modul Ticket-Extras, klToolbox)
// datum   = "2026-11-11"
// autor   = "FK"
//
// Content-Script: Zusatzfunktionen im Ticketsystem, jede einzeln schaltbar
// (Optionen -> Ticketsystem-Funktionen einzeln):
//   ftTastatur    - Tastatur in der Ticketliste (j/k, Enter) und im Ticket
//                   (t Termin, n Nicht erreicht, m Makros, ? Uebersicht)
//   ftFilterChips - Filter-Chips ueber der Ticketliste (nutzen die Daten der
//                   Wartezeit-Anzeige aus content-termin.js)
// Ausserdem beantwortet es die Popup-Anfrage "ticketKontext" (Kunde und
// Ticketnummer der offenen Ticketansicht).
//
// Verifiziert am 2026-11-11 im Ticketsystem: Die Liste ist ein DHTMLX-Grid
// (.gridbox, Zeilen in .objbox table.obj); ein Klick markiert die Zeile
// (Klasse rowselected), ein Doppelklick oeffnet das Ticket.

(function () {
    "use strict";

    if (window !== window.top) {
        return;
    }

    const DEFAULTS = {
        modTicket: true,
        // Kuerzel bewusst standardmaessig AUS: einzelne Tasten loesen Aktionen
        // aus - das soll jeder selbst einschalten. Chips sind unaufdringlich.
        ftTastatur: false,
        ftFilterChips: true
    };
    let settings = Object.assign({}, DEFAULTS);

    // ---------------------------------------------------------- Helfer

    function isVisible(el) {
        if (!el) {
            return false;
        }
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
    }

    function aktiv(schalter) {
        return settings.modTicket !== false && settings[schalter] === true;
    }

    // Ticketansicht offen? (Toolbar der Vollbild-Ansicht)
    function ticketToolbar() {
        const tb = document.querySelector(".ap-toolbar--fullscreen-at-top");
        return (tb && isVisible(tb)) ? tb : null;
    }

    // Das Ticket-Grid: das sichtbare Grid, das Wartezeit-Anzeigen traegt
    function ticketGrid() {
        for (const g of document.querySelectorAll(".gridbox")) {
            if (isVisible(g) && g.querySelector(".__tt_list_age")) {
                return g;
            }
        }
        return null;
    }

    function gridRows(grid) {
        return Array.from(grid.querySelectorAll(".objbox table.obj tbody tr"))
            .filter((tr) => tr.children.length > 1 && tr.children[0].tagName === "TD" &&
                !tr.classList.contains("__klt_hidden"));
    }

    function maus(el, typ) {
        el.dispatchEvent(new MouseEvent(typ, { bubbles: true, cancelable: true, view: window }));
    }

    // ---------------------------------------------------------- Kontext fuers Popup

    // Kunde: <strong>12345 - Muster GmbH</strong>; Ticketnummer aus dem
    // Fenstertitel "Ticket #123456 - ..." (wie content-termin.js)
    function ticketKontext() {
        if (!ticketToolbar()) {
            return null;
        }
        const out = { kundennr: "", kunde: "", ticketnr: "" };
        for (const s of document.querySelectorAll("strong")) {
            const m = (s.textContent || "").trim().match(/^(\d{3,8})\s*-\s*(.{2,})$/);
            if (m && isVisible(s)) {
                out.kundennr = m[1];
                out.kunde = m[2].trim();
                break;
            }
        }
        for (const el of document.querySelectorAll("div, span")) {
            if (el.childElementCount === 0) {
                const m = /^Ticket #(\d+)/.exec((el.textContent || "").trim());
                if (m && isVisible(el)) {
                    out.ticketnr = m[1];
                    break;
                }
            }
        }
        return (out.kundennr || out.ticketnr) ? out : null;
    }

    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
        if (msg && msg.type === "ticketKontext") {
            try {
                sendResponse({ ok: true, kontext: ticketKontext() });
            } catch (err) {
                console.warn("klToolbox: Ticket-Kontext nicht lesbar:", err);
                sendResponse({ ok: false });
            }
        }
        return false;
    });

    // ---------------------------------------------------------- Filter-Chips

    // Jeder Chip prueft die Daten der Wartezeit-Anzeige einer Zeile:
    // data-s = Ampelstufe (1-4, n = neutral/erledigt), data-m = Alter in Minuten
    const CHIPS = [
        { id: "faellig", name: "Überfällig", title: "Ampelstufe 3 und 4", test: (d) => d.s === "3" || d.s === "4" },
        { id: "alt7", name: "Älter als 7 Tage", title: "Erstellt vor mehr als 7 Tagen", test: (d) => d.m > 7 * 1440 },
        { id: "heute", name: "Heute neu", title: "In den letzten 24 Stunden erstellt", test: (d) => d.m < 1440 },
        { id: "wartet", name: "Wartet", title: "Neutral eingefärbte Tickets (Warten auf …, Erledigt)", test: (d) => d.s === "n" }
    ];
    let chipAktiv = "";

    function ensureChips() {
        const alt = document.querySelector(".__klt_chips");
        const grid = aktiv("ftFilterChips") ? ticketGrid() : null;
        if (!grid) {
            if (alt) {
                alt.remove();
            }
            if (chipAktiv || document.querySelector("tr.__klt_hidden")) {
                document.querySelectorAll("tr.__klt_hidden").forEach((tr) => tr.classList.remove("__klt_hidden"));
            }
            return;
        }
        // Platz: die Filterleiste direkt ueber dem Grid, rechts unten (dort ist
        // die dritte Zeile frei). NICHT vor das Grid einfuegen - dessen Hoehe
        // rechnet das Ticketsystem fest aus, eine Zeile davor schiebt es um
        // ihre Hoehe aus dem Fenster (geprueft 2026-11-11).
        const rsGrid = grid.closest("rs-grid");
        const host = rsGrid ? rsGrid.previousElementSibling : null;
        if (!host || !host.classList.contains("ap-toolbar")) {
            if (alt) {
                alt.remove();
            }
            return;
        }
        let leiste = alt;
        if (!leiste || leiste.parentElement !== host) {
            if (leiste) {
                leiste.remove();
            }
            if (!host.classList.contains("__klt_chips_host")) {
                host.classList.add("__klt_chips_host");
            }
            leiste = document.createElement("div");
            leiste.className = "__klt_chips";
            const icon = klIcon("filter", 14);
            if (icon) {
                icon.setAttribute("class", "klt-ico");
                leiste.appendChild(icon);
            }
            for (const chip of CHIPS) {
                const b = document.createElement("button");
                b.type = "button";
                b.dataset.chip = chip.id;
                b.title = chip.title;
                b.textContent = chip.name;
                b.addEventListener("click", () => {
                    chipAktiv = (chipAktiv === chip.id) ? "" : chip.id;
                    applyChips();
                });
                leiste.appendChild(b);
            }
            const info = document.createElement("span");
            info.className = "klt-chips-info";
            leiste.appendChild(info);
            host.appendChild(leiste);
            pruefePlatz();
        }
        applyChips();
    }

    // Reicht der freie Bereich rechts unten in der Filterleiste nicht (schmales
    // Fenster), werden die Chips ausgeblendet statt Filterfelder zu ueberdecken.
    function pruefePlatz() {
        const leiste = document.querySelector(".__klt_chips");
        const host = leiste ? leiste.parentElement : null;
        if (!leiste || !host) {
            return;
        }
        leiste.classList.remove("eng");
        const hr = host.getBoundingClientRect();
        const lr = leiste.getBoundingClientRect();
        let belegtBis = hr.left;
        for (const el of host.querySelectorAll("a, select, input, label, span, div")) {
            if (el.childElementCount !== 0 || leiste.contains(el)) {
                continue;
            }
            const r = el.getBoundingClientRect();
            if (r.width > 0 && r.bottom > lr.top && r.top < lr.bottom && r.right < lr.right) {
                belegtBis = Math.max(belegtBis, r.right);
            }
        }
        const eng = belegtBis + 12 > lr.left;
        leiste.classList.toggle("eng", eng);
        if (eng && chipAktiv) {
            chipAktiv = "";
            applyChips();
        }
    }
    window.addEventListener("resize", () => {
        clearTimeout(pruefePlatz.timer);
        pruefePlatz.timer = setTimeout(pruefePlatz, 300);
    });

    // Zeilen ein-/ausblenden. Schreibt nur bei Aenderung (Observer-Schleife!).
    function applyChips() {
        const leiste = document.querySelector(".__klt_chips");
        const grid = ticketGrid();
        if (!leiste || !grid) {
            return;
        }
        const chip = CHIPS.find((c) => c.id === chipAktiv) || null;
        for (const b of leiste.querySelectorAll("button")) {
            const an = b.dataset.chip === chipAktiv;
            if (b.classList.contains("aktiv") !== an) {
                b.classList.toggle("aktiv", an);
            }
        }
        let sichtbar = 0;
        let gesamt = 0;
        for (const tr of grid.querySelectorAll(".objbox table.obj tbody tr")) {
            const age = tr.querySelector(".__tt_list_age");
            if (!age) {
                continue;
            }
            gesamt++;
            const passt = !chip || chip.test({ s: age.dataset.s || "", m: Number(age.dataset.m || 0) });
            if (tr.classList.contains("__klt_hidden") === passt) {
                tr.classList.toggle("__klt_hidden", !passt);
            }
            if (passt) {
                sichtbar++;
            }
        }
        const info = leiste.querySelector(".klt-chips-info");
        const text = chip ? sichtbar + " von " + gesamt : "";
        if (info && info.textContent !== text) {
            info.textContent = text;
        }
    }

    // ---------------------------------------------------------- Tastatur

    const KUERZEL = [
        ["j", "Ticketliste: nächste Zeile"],
        ["k", "Ticketliste: vorige Zeile"],
        ["Enter", "Ticketliste: markiertes Ticket öffnen"],
        ["t", "Ticket: Termin"],
        ["n", "Ticket: Nicht erreicht (legt den Eintrag an)"],
        ["m", "Ticket: Makros"],
        ["?", "Diese Übersicht"]
    ];

    function tipptGerade(e) {
        const t = e.target;
        if (!t || !t.closest) {
            return false;
        }
        if (t.isContentEditable || t.closest("input, textarea, select, [contenteditable=''], [contenteditable='true'], .ck-editor")) {
            return true;
        }
        const a = document.activeElement;
        return !!(a && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)));
    }

    function cursorRow(grid) {
        return grid.querySelector("tr.__klt_cursor") || grid.querySelector("tr.rowselected");
    }

    function bewegeCursor(grid, schritt) {
        const rows = gridRows(grid);
        if (rows.length === 0) {
            return;
        }
        const alt = cursorRow(grid);
        let i = alt ? rows.indexOf(alt) : -1;
        i = (i === -1) ? (schritt > 0 ? 0 : rows.length - 1) : Math.max(0, Math.min(rows.length - 1, i + schritt));
        const neu = rows[i];
        grid.querySelectorAll("tr.__klt_cursor").forEach((tr) => tr.classList.remove("__klt_cursor"));
        neu.classList.add("__klt_cursor");
        // native Auswahl mitziehen (Klick markiert die Zeile im Grid)
        const zelle = neu.children[Math.min(5, neu.children.length - 1)];
        maus(zelle, "mousedown");
        maus(zelle, "mouseup");
        maus(zelle, "click");
        neu.scrollIntoView({ block: "nearest" });
    }

    function oeffneCursor(grid) {
        const row = cursorRow(grid);
        if (!row) {
            return false;
        }
        maus(row.children[Math.min(5, row.children.length - 1)], "dblclick");
        return true;
    }

    function schliesseUebersicht() {
        const p = document.getElementById("__klt_keys");
        if (p) {
            p.remove();
            return true;
        }
        return false;
    }

    function zeigeUebersicht() {
        if (schliesseUebersicht()) {
            return;
        }
        const panel = document.createElement("div");
        panel.id = "__klt_keys";
        panel.className = "klt-panel klt-scope";
        const head = document.createElement("div");
        head.className = "klt-head";
        klIconText(head, "keyboard", " Tastenkürzel", 16);
        panel.appendChild(head);
        const table = document.createElement("table");
        for (const [taste, text] of KUERZEL) {
            const tr = document.createElement("tr");
            const td1 = document.createElement("td");
            const kbd = document.createElement("kbd");
            kbd.textContent = taste;
            td1.appendChild(kbd);
            const td2 = document.createElement("td");
            td2.textContent = text;
            tr.appendChild(td1);
            tr.appendChild(td2);
            table.appendChild(tr);
        }
        panel.appendChild(table);
        const foot = document.createElement("div");
        foot.className = "klt-foot";
        foot.textContent = "Kürzel wirken nicht, solange in einem Feld oder im Editor getippt wird. Esc schließt.";
        panel.appendChild(foot);
        document.documentElement.appendChild(panel);
    }

    function onKey(e) {
        if (!aktiv("ftTastatur") || e.ctrlKey || e.altKey || e.metaKey || e.defaultPrevented) {
            return;
        }
        if (e.key === "Escape") {
            if (schliesseUebersicht()) {
                e.stopPropagation();
            }
            return;
        }
        if (tipptGerade(e)) {
            return;
        }
        const tb = ticketToolbar();
        let erledigt = false;
        if (e.key === "?") {
            zeigeUebersicht();
            erledigt = true;
        } else if (tb) {
            // Ticketansicht: Knoepfe der klToolbox ausloesen
            const map = { t: ".__tt_termin_tbtn", n: ".__tt_ne_tbtn", m: ".__tt_makro_tbtn" };
            const sel = map[e.key];
            const btn = sel ? tb.querySelector(sel) : null;
            if (btn) {
                // "Nicht erreicht" schreibt sofort einen Eintrag - ein
                // einzelner Tastendruck braucht deshalb eine Rueckfrage
                if (e.key !== "n" || confirm("Eintrag „Nicht erreicht“ anlegen und speichern?")) {
                    btn.click();
                }
                erledigt = true;
            }
        } else {
            const grid = ticketGrid();
            if (grid) {
                if (e.key === "j") {
                    bewegeCursor(grid, 1);
                    erledigt = true;
                } else if (e.key === "k") {
                    bewegeCursor(grid, -1);
                    erledigt = true;
                } else if (e.key === "Enter") {
                    erledigt = oeffneCursor(grid);
                }
            }
        }
        if (erledigt) {
            e.preventDefault();
            e.stopPropagation();
        }
    }

    // ---------------------------------------------------------- Start

    let tickTimer = null;
    function tick() {
        tickTimer = null;
        try {
            ensureChips();
        } catch (err) {
            console.warn("klToolbox: Filter-Chips fehlgeschlagen:", err);
        }
    }
    function schedule() {
        if (tickTimer === null) {
            tickTimer = setTimeout(tick, 400);
        }
    }

    function init() {
        chrome.storage.local.get(DEFAULTS, (items) => {
            settings = items;
            schedule();
        });
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area !== "local") {
                return;
            }
            let relevant = false;
            for (const k of Object.keys(changes)) {
                if (Object.prototype.hasOwnProperty.call(DEFAULTS, k)) {
                    settings[k] = changes[k].newValue;
                    relevant = true;
                }
            }
            if (relevant) {
                if (!aktiv("ftTastatur")) {
                    schliesseUebersicht();
                    document.querySelectorAll("tr.__klt_cursor").forEach((tr) => tr.classList.remove("__klt_cursor"));
                }
                schedule();
            }
        });
        document.addEventListener("keydown", onKey, true);
        // SPA: Liste und Zeilen entstehen dynamisch -> gebuendelt nachziehen
        new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
