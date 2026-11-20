// Version
// version = "1.1.0"  (Modul Ticket-Extras, klToolbox)
// datum   = "2026-11-20"
// autor   = "FK"
//
// Content-Script: Zusatzfunktionen im Ticketsystem, jede einzeln schaltbar
// (Optionen -> Ticketsystem-Funktionen einzeln):
//   ftTastatur    - Tastatur in der Ticketliste (j/k, Enter) und im Ticket
//                   (t Termin, n Nicht erreicht, m Makros, ? Uebersicht)
//   ftFilterChips - Filter-Chips ueber der Ticketliste (nutzen die Daten der
//                   Wartezeit-Anzeige aus content-termin.js)
//   ftTeilen      - Knopf "Teilen" im Ticket (Toolbar) und im Projekt-Dialog
//                   (neben "Speichern"): Link kopieren, Link mit Titel
//                   kopieren, per E-Mail senden
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
        ftFilterChips: true,
        ftTeilen: true,
        // Ticketlink-Vorlage (%TICKETNR%) - kommt per Settings-Import
        linkTemplate: ""
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

    // ---------------------------------------------------------- Teilen
    // Ticket: Link aus der Ticketlink-Vorlage. Projekt: /projects?id=<ID>
    // (Direktlink geprueft 2026-11-20); die ID liefert der Seiten-Hook als
    // html[data-klt-row] bzw. steht nach einem Direktaufruf in der Adresse.
    // Projekte oeffnen als DHTMLX-Fenster "Projekt <Name> aendern" ohne
    // Toolbar - der Knopf sitzt dort vor "Speichern".

    function fensterTitel(re) {
        for (const el of document.querySelectorAll(".dhtmlx_wins_title")) {
            const m = re.exec((el.textContent || "").trim());
            if (m && isVisible(el)) {
                return { el: el, m: m };
            }
        }
        return null;
    }

    function ticketDaten() {
        const k = ticketKontext();
        if (!k || !k.ticketnr) {
            return null;
        }
        let bez = "";
        for (const el of document.querySelectorAll("div, span")) {
            if (el.childElementCount === 0 && isVisible(el)) {
                const m = /^Ticket #\d+\s*-\s*(.+)$/.exec((el.textContent || "").trim());
                if (m) {
                    bez = m[1].trim();
                    break;
                }
            }
        }
        const tpl = (settings.linkTemplate || "").trim();
        return {
            titel: "Ticket #" + k.ticketnr + (bez ? " – " + bez : "") +
                (k.kundennr ? " (" + k.kundennr + (k.kunde ? " " + k.kunde : "") + ")" : ""),
            url: tpl ? tpl.replace(/%TICKETNR%/g, k.ticketnr) : "",
            ohneLink: "Ticketlink-Vorlage fehlt (Optionen → Ticket-Termin)"
        };
    }

    function projektDaten() {
        const t = fensterTitel(/^Projekt (.+) ändern$/);
        if (!t) {
            return null;
        }
        const name = t.m[1].trim();
        let id = "";
        if (/\/projects\/?$/.test(location.pathname)) {
            const row = (document.documentElement.getAttribute("data-klt-row") || "").split("|");
            if (row.length === 2 && row[0] === location.pathname && /^\d+$/.test(row[1])) {
                // Gegenprobe: die markierte Zeile muss den Projektnamen tragen
                const sel = document.querySelector(".gridbox tr.rowselected");
                if (!sel || (sel.textContent || "").indexOf(name) !== -1) {
                    id = row[1];
                }
            } else {
                const m = /[?&]id=(\d+)/.exec(location.search);
                if (m) {
                    id = m[1];
                }
            }
        }
        return {
            titel: "Projekt – " + name,
            url: id ? location.origin + "/projects?id=" + id : "",
            ohneLink: "Projektnummer nicht ermittelbar – Projekt über die Projektliste öffnen"
        };
    }

    function schliesseTeilen() {
        const p = document.getElementById("__klt_share");
        if (p) {
            p.remove();
            return true;
        }
        return false;
    }

    function escHtml(s) {
        return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }

    async function kopiere(text, html) {
        if (html && typeof ClipboardItem === "function" && navigator.clipboard && navigator.clipboard.write) {
            try {
                await navigator.clipboard.write([new ClipboardItem({
                    "text/plain": new Blob([text], { type: "text/plain" }),
                    "text/html": new Blob([html], { type: "text/html" })
                })]);
                return;
            } catch (err) {
                console.warn("klToolbox: Kopieren mit Formatierung nicht möglich, nehme reinen Text:", err);
            }
        }
        await navigator.clipboard.writeText(text);
    }

    function quittiere(anchor, ok) {
        const merk = anchor.__kltIcon;
        klIconText(anchor, ok ? "check" : "x", ok ? "Kopiert" : "Fehler");
        setTimeout(() => {
            if (anchor.isConnected) {
                klIconRestore(anchor, merk);
            }
        }, 2000);
    }

    function zeigeTeilen(anchor, daten) {
        if (schliesseTeilen() || !daten) {
            return;
        }
        const panel = document.createElement("div");
        panel.id = "__klt_share";
        panel.className = "klt-panel klt-scope";
        const eintrag = (icon, text, aktion) => {
            const b = document.createElement("button");
            b.type = "button";
            klIconText(b, icon, text, 15);
            if (!daten.url) {
                b.disabled = true;
                b.title = daten.ohneLink;
            }
            b.addEventListener("click", () => {
                schliesseTeilen();
                aktion();
            });
            panel.appendChild(b);
        };
        eintrag("link", "Link kopieren", () => {
            kopiere(daten.url, "").then(() => quittiere(anchor, true)).catch((err) => {
                console.warn("klToolbox: Link nicht kopiert:", err);
                quittiere(anchor, false);
            });
        });
        eintrag("copy", "Link mit Titel kopieren", () => {
            kopiere(daten.titel + "\n" + daten.url,
                '<a href="' + escHtml(daten.url) + '">' + escHtml(daten.titel) + "</a>")
                .then(() => quittiere(anchor, true)).catch((err) => {
                    console.warn("klToolbox: Link nicht kopiert:", err);
                    quittiere(anchor, false);
                });
        });
        eintrag("mail", "Per E-Mail senden", () => {
            const a = document.createElement("a");
            a.href = "mailto:?subject=" + encodeURIComponent(daten.titel) +
                "&body=" + encodeURIComponent(daten.titel + "\n" + daten.url + "\n");
            a.click();
        });
        if (!daten.url) {
            const hint = document.createElement("div");
            hint.className = "klt-foot";
            hint.textContent = daten.ohneLink;
            panel.appendChild(hint);
        }
        document.documentElement.appendChild(panel);
        const r = anchor.getBoundingClientRect();
        const w = panel.offsetWidth || 230;
        panel.style.left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8)) + "px";
        if (r.top < window.innerHeight / 2) {
            panel.style.top = (r.bottom + 6) + "px";
        } else {
            panel.style.bottom = (window.innerHeight - r.top + 6) + "px";
        }
    }

    document.addEventListener("mousedown", (e) => {
        const p = document.getElementById("__klt_share");
        if (p && !p.contains(e.target) && !(e.target.closest && e.target.closest(".__klt_share_btn"))) {
            schliesseTeilen();
        }
    }, true);

    function ensureTeilen() {
        const an = aktiv("ftTeilen");
        // Ticket: Knopf in der Toolbar
        const tb = an ? ticketToolbar() : null;
        if (tb && !tb.querySelector(".__klt_share_btn")) {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "ap-button light __tt_tbtn __klt_share_btn";
            btn.title = "Link zu diesem Ticket teilen (kopieren oder per E-Mail)";
            klIconText(btn, "share-2", "Teilen");
            btn.addEventListener("click", () => zeigeTeilen(btn, ticketDaten()));
            (tb.firstElementChild || tb).appendChild(btn);
        }
        // Projekt: Knopf vor "Speichern" im Projektfenster
        const pt = an ? fensterTitel(/^Projekt (.+) ändern$/) : null;
        const fenster = pt ? pt.el.closest(".dhtmlx_window_active, .dhtmlx_window_inactive") : null;
        if (fenster && !fenster.querySelector(".__klt_share_btn")) {
            const save = Array.from(fenster.querySelectorAll("button"))
                .find((b) => (b.textContent || "").trim() === "Speichern" && isVisible(b));
            if (save && save.parentElement) {
                const btn = document.createElement("button");
                btn.type = "button";
                // Klassen des Nachbarknopfs uebernehmen = nativer Look
                btn.className = String(save.className || "ap-button") + " __klt_share_btn __klt_share_pbtn";
                btn.title = "Link zu diesem Projekt teilen (kopieren oder per E-Mail)";
                klIconText(btn, "share-2", "Teilen");
                btn.addEventListener("click", (e) => {
                    e.preventDefault();
                    zeigeTeilen(btn, projektDaten());
                });
                save.parentElement.insertBefore(btn, save);
            }
        }
        if (!an) {
            document.querySelectorAll(".__klt_share_btn").forEach((b) => b.remove());
            schliesseTeilen();
        }
    }

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
        // Esc schliesst zuerst das Teilen-Menue (ohne dass das Ticketsystem
        // seine "Aenderungen verwerfen?"-Rueckfrage zeigt)
        if (e.key === "Escape" && schliesseTeilen()) {
            e.preventDefault();
            e.stopPropagation();
            return;
        }
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
        try {
            ensureTeilen();
        } catch (err) {
            console.warn("klToolbox: Teilen-Knopf fehlgeschlagen:", err);
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
