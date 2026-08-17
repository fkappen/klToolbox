// MS Account Cleaner
// Version 1.3.0 - 2026-08-03 - FK
//
// Entfernt auf der Microsoft-Kontoauswahl (login.microsoftonline.com /
// login.live.com) alle gemerkten Konten ueber deren "..."-Menue.
// Konten mit Status "Mit Windows verbunden" werden uebersprungen.
//
// v1.1.0: - Sichtbarkeits-Check via getBoundingClientRect (offsetParent
//           ist bei position:fixed-Menues immer null -> Eintraege wurden
//           faelschlich verworfen)
//         - echte Maus-Event-Sequenz statt nur .click()
//         - Kebab-Erkennung erweitert (class*=menu, aria-expanded, svg)
//         - Diagnose-Dumps in die Konsole, wenn etwas nicht gefunden wird
// v1.1.1: - Kachel vor der Kebab-Suche hovern (Button erscheint teils
//           erst bei :hover), unsichtbare Kebabs mit starken Signalen
//           (aria-label/haspopup/class) trotzdem akzeptieren
// v1.2.0: - Kachel = hoechster Container mit genau EINER E-Mail (vorher
//           blieb die Suche in der Text-Zelle haengen, der Kebab liegt
//           aber weiter aussen in der Zeile)
//         - Knockout-Erkennung: data-bind mit "menu" + ellipsis-Icons
//           als Kebab akzeptieren; Dump zeigt die ganze Zeile
// v1.2.1: - bei Treffer auf die tile-menu-ZELLE das klickbare Kind-
//           Element (a/button) verwenden - Klick auf die Zelle selbst
//           oeffnet kein Menue
// v1.3.0: - Menuepunkt-Auswahl mit Prioritaet: "Abmelden und vergessen"
//           bevorzugt, dann "Vergessen", dann generisch "entfernen"

(function () {
    'use strict';

    // Status-Zeile eines entfernbaren Kontos (DE/EN)
    var STATUS_TEXTS = ['Angemeldet', 'Signed in', 'Abgemeldet', 'Signed out'];

    // Konten mit diesem Text werden NIE angefasst
    var SKIP_TEXTS = ['Mit Windows verbunden', 'Connected to Windows'];

    // Menuepunkt, der das Konto abmeldet UND aus der Liste entfernt.
    // Prioritaet von oben nach unten - erster Treffer gewinnt:
    // 1. "Abmelden und vergessen" / "Sign out and forget" (gewuenscht)
    // 2. "Vergessen" / "Forget" (abgemeldete Konten haben nur das)
    // 3. generisch "entfernen" / "remove"
    var MENU_ITEM_PRIORITY = [
        /abmelden und vergessen|sign out and forget/i,
        /vergessen|forget/i,
        /entfernen|remove/i
    ];

    var running = false;
    var button = null;

    function log(msg) {
        console.log('[AccountCleaner] ' + msg);
    }

    function sleep(ms) {
        return new Promise(function (resolve) { setTimeout(resolve, ms); });
    }

    function textOf(el) {
        return (el && el.textContent) ? el.textContent.trim() : '';
    }

    // offsetParent taugt nicht (null bei position:fixed) -> Rect pruefen
    function isVisible(el) {
        if (!el) { return false; }
        var r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) { return false; }
        var st = window.getComputedStyle(el);
        return st.display !== 'none' && st.visibility !== 'hidden' && st.opacity !== '0';
    }

    // Microsoft-Seiten reagieren teils nur auf echte Event-Sequenzen
    function realClick(el) {
        var r = el.getBoundingClientRect();
        var opts = {
            bubbles: true,
            cancelable: true,
            view: window,
            clientX: r.left + r.width / 2,
            clientY: r.top + r.height / 2
        };
        try { el.dispatchEvent(new PointerEvent('pointerdown', opts)); } catch (e) { /* PointerEvent evtl. nicht noetig */ }
        el.dispatchEvent(new MouseEvent('mousedown', opts));
        try { el.dispatchEvent(new PointerEvent('pointerup', opts)); } catch (e) { /* dito */ }
        el.dispatchEvent(new MouseEvent('mouseup', opts));
        el.dispatchEvent(new MouseEvent('click', opts));
    }

    function emailCount(el) {
        var m = textOf(el).match(/\S+@\S+\.\S+/g);
        return m ? m.length : 0;
    }

    // Alle Blatt-Elemente finden, deren Text exakt einem der Status-Texte
    // entspricht, und daraus die komplette Konto-ZEILE ableiten: vom
    // Status-Text so weit nach oben klettern, wie der Container genau
    // EINE E-Mail-Adresse enthaelt. Der letzte solche Container ist die
    // ganze Zeile inkl. Avatar- und Menue-Zelle; eine Ebene hoeher
    // beginnt die Liste (mehrere E-Mails).
    function findAccountTiles() {
        var tiles = [];
        var all = document.body.querySelectorAll('div, small, span');
        for (var i = 0; i < all.length; i++) {
            var el = all[i];
            if (el.children.length > 0) { continue; }
            var t = textOf(el);
            if (STATUS_TEXTS.indexOf(t) === -1) { continue; }

            var node = el.parentElement;
            var tile = null;
            for (var depth = 0; depth < 12 && node && node !== document.body; depth++) {
                var n = emailCount(node);
                if (n === 1) { tile = node; }
                if (n > 1) { break; }
                node = node.parentElement;
            }
            if (!tile) { continue; }

            var tileText = textOf(tile);
            var skip = SKIP_TEXTS.some(function (s) { return tileText.indexOf(s) !== -1; });
            if (skip) { continue; }

            // Whitelist (Optionen): Konto nie entfernen, wenn die E-Mail
            // einen Whitelist-Eintrag enthaelt (z. B. "@firma.de"
            // schuetzt alle Firmenkonten, exakte Adresse schuetzt eines)
            var mailMatch = tileText.match(/\S+@\S+\.\S+/);
            if (mailMatch && isWhitelisted(mailMatch[0])) {
                continue;
            }

            if (tiles.indexOf(tile) === -1) {
                tiles.push(tile);
            }
        }
        return tiles;
    }

    // Maus ueber die Kachel bewegen - der Kebab erscheint teils erst bei :hover
    function hover(el) {
        var r = el.getBoundingClientRect();
        var opts = {
            bubbles: true,
            cancelable: true,
            view: window,
            clientX: r.left + r.width / 2,
            clientY: r.top + r.height / 2
        };
        try { el.dispatchEvent(new PointerEvent('pointerover', opts)); } catch (e) { /* optional */ }
        el.dispatchEvent(new MouseEvent('mouseover', opts));
        el.dispatchEvent(new MouseEvent('mouseenter', opts));
        el.dispatchEvent(new MouseEvent('mousemove', opts));
    }

    // Bewertet ein Element als Kebab-Kandidat:
    // 2 = starkes Signal (Label/haspopup/class/data-bind), 1 = nur "..."-Text
    function kebabScore(c) {
        var label = (c.getAttribute('aria-label') || '') + ' ' + (c.title || '');
        var txt = textOf(c);
        if (/optionen|options|menu|mehr|more|aktionen|actions/i.test(label)) { return 2; }
        var hp = c.getAttribute('aria-haspopup');
        if (hp === 'true' || hp === 'menu') { return 2; }
        var cls = String(c.className || '');
        if (/menu|kebab|ellipsis/i.test(cls) && txt.length <= 3) { return 2; }
        // Knockout-Seiten: Click-Handler steht im data-bind-Attribut
        var db = c.getAttribute('data-bind') || '';
        if (/menu/i.test(db) && /click/i.test(db) && txt.length <= 3) { return 2; }
        // Ellipsis-/Options-Icon als Inhalt
        var img = c.querySelector('img[src*="ellipsis"], img[src*="option"], img[src*="menu"], img[src*="more"]');
        if (img) { return 2; }
        if (txt === '...' || txt === '⋯' || txt === '⋮' || txt === '…') { return 1; }
        return 0;
    }

    // Das "..."-Menue innerhalb der Kachel (oder ihres Eltern-Rows) finden.
    // Sichtbare Kandidaten werden bevorzugt; ein unsichtbarer Kandidat mit
    // starkem Signal wird als Fallback akzeptiert (Hover-only-Buttons).
    function findKebab(tile) {
        var scopes = [tile];
        if (tile.parentElement) { scopes.push(tile.parentElement); }

        var hidden = null;
        for (var s = 0; s < scopes.length; s++) {
            var candidates = scopes[s].querySelectorAll(
                'button, a, [role="button"], [aria-haspopup], [aria-expanded], [class*="menu"], [class*="option"], [class*="kebab"], [class*="ellipsis"], [data-bind*="enu"], img[src*="ellipsis"]'
            );
            for (var i = 0; i < candidates.length; i++) {
                var c = candidates[i];
                // Icon selbst gefunden -> klickbaren Parent nehmen
                if (c.tagName === 'IMG') {
                    c = c.closest('a, button, [role="button"]') || c.parentElement;
                    if (!c) { continue; }
                }
                var score = kebabScore(c);
                if (score === 0) { continue; }
                // Zelle/Container getroffen? Dann das eigentlich klickbare
                // Element darin verwenden (z. B. <a> mit "..."-Text) -
                // der Klick auf die blosse Zelle oeffnet kein Menue.
                if (c.tagName !== 'A' && c.tagName !== 'BUTTON' && c.getAttribute('role') !== 'button') {
                    var inner = c.querySelector('a, button, [role="button"], [data-bind*="lick"]');
                    if (inner) { c = inner; }
                }
                if (isVisible(c)) { return c; }
                if (score === 2 && !hidden) { hidden = c; }
            }
        }
        if (hidden) {
            log('Kebab nur unsichtbar gefunden - klicke trotzdem.');
        }
        return hidden;
    }

    // Nach Klick auf das Kebab-Menue den richtigen Eintrag suchen (Menue
    // haengt meist ausserhalb der Kachel im DOM, daher global suchen).
    // Die Prioritaeten-Liste wird von oben nach unten abgearbeitet:
    // "Abmelden und vergessen" schlaegt "Vergessen" schlaegt "entfernen".
    function findMenuItem() {
        var items = document.querySelectorAll('[role="menuitem"], [role="option"], button, a, [role="button"], li, div');
        for (var p = 0; p < MENU_ITEM_PRIORITY.length; p++) {
            var regex = MENU_ITEM_PRIORITY[p];
            var best = null;
            for (var i = 0; i < items.length; i++) {
                var el = items[i];
                var t = textOf(el);
                if (t.length === 0 || t.length > 60) { continue; }
                if (!regex.test(t)) { continue; }
                if (!isVisible(el)) { continue; }
                // moeglichst tiefes Element nehmen (das eigentliche Item,
                // nicht dessen Container)
                if (!best || best.contains(el)) { best = el; }
            }
            if (best) { return best; }
        }
        return null;
    }

    // Diagnose: sichtbare, kurze Texte rund um ein geoeffnetes Menue
    function dumpVisibleShortTexts() {
        var out = [];
        var items = document.querySelectorAll('[role="menuitem"], [role="option"], button, a, li');
        for (var i = 0; i < items.length; i++) {
            var t = textOf(items[i]);
            if (t.length > 0 && t.length < 50 && isVisible(items[i]) && out.indexOf(t) === -1) {
                out.push(t);
            }
        }
        log('Sichtbare klickbare Texte: ' + JSON.stringify(out));
    }

    function setButtonText(txt) {
        if (button) { button.textContent = txt; }
    }

    async function removeOne(tile) {
        var mail = (textOf(tile).match(/\S+@\S+\.\S+/) || ['?'])[0];

        hover(tile);
        await sleep(300);

        var kebab = findKebab(tile);
        if (!kebab) {
            log('Kein Menue-Button gefunden bei: ' + mail);
            log('Zeilen-HTML (gekuerzt): ' + tile.outerHTML.substring(0, 4000));
            return false;
        }
        log('Kebab bei ' + mail + ': <' + kebab.tagName.toLowerCase() + ' class="' + (kebab.className || '') + '" aria-label="' + (kebab.getAttribute('aria-label') || '') + '">');
        realClick(kebab);
        await sleep(600);

        var item = findMenuItem();
        if (!item) {
            log('Kein Entfernen-Eintrag gefunden bei: ' + mail);
            log('Kebab-HTML: ' + kebab.outerHTML.substring(0, 1000));
            dumpVisibleShortTexts();
            realClick(document.body);
            await sleep(300);
            return false;
        }
        log('Entferne: ' + mail + ' (Klick auf "' + textOf(item) + '")');
        realClick(item);

        // Warten bis die Kachel aus dem DOM verschwindet oder die Mail
        // nicht mehr auf der Seite steht (Seite rendert teils neu)
        for (var w = 0; w < 10; w++) {
            await sleep(500);
            if (!document.body.contains(tile)) { return true; }
            if (document.body.textContent.indexOf(mail) === -1) { return true; }
        }
        log('Konto ist nach 5 s noch da: ' + mail);
        return false;
    }

    async function removeAll() {
        if (running) { return; }

        var tiles = findAccountTiles();
        if (tiles.length === 0) {
            alert('Keine entfernbaren Konten gefunden.');
            return;
        }
        if (!confirm(tiles.length + ' Konto/Konten entfernen?\n(Konten "Mit Windows verbunden" bleiben erhalten)')) {
            return;
        }

        running = true;
        var ok = 0;
        var fail = 0;

        // Nach jedem Entfernen neu suchen, da die Seite neu rendert
        for (var round = 0; round < 100; round++) {
            var current = findAccountTiles();
            if (current.length === 0) { break; }

            setButtonText('Entferne... (' + ok + ' erledigt, ' + current.length + ' offen)');
            var success = await removeOne(current[0]);
            if (success) {
                ok++;
                fail = 0;
            } else {
                fail++;
                if (fail >= 3) {
                    log('3 Fehlversuche in Folge - Abbruch.');
                    break;
                }
                await sleep(1000);
            }
        }

        running = false;
        setButtonText('Alle Konten entfernen');
        alert('Fertig: ' + ok + ' entfernt' + (fail > 0 ? ', letzte Versuche fehlgeschlagen (siehe Konsole F12)' : ''));
    }

    function injectButton() {
        if (document.getElementById('kl-account-cleaner-btn')) { return; }
        if (findAccountTiles().length === 0) { return; }

        button = document.createElement('button');
        button.id = 'kl-account-cleaner-btn';
        button.textContent = 'Alle Konten entfernen';
        button.style.cssText = [
            'position:fixed', 'bottom:20px', 'right:20px', 'z-index:99999',
            'padding:10px 16px', 'background:#c50f1f', 'color:#fff',
            'border:none', 'border-radius:4px', 'cursor:pointer',
            'font-size:14px', 'font-family:Segoe UI,sans-serif',
            'box-shadow:0 2px 8px rgba(0,0,0,0.3)'
        ].join(';');
        button.addEventListener('click', removeAll);
        document.body.appendChild(button);
        log('v1.3.0 - Button eingeblendet (' + findAccountTiles().length + ' Konten erkannt)');
    }

    // Modul-Schalter (Optionen -> "Module"): live zu-/abschaltbar.
    // Startwert false: erst nach dem Storage-Read einblenden, sonst wuerde
    // der Observer den Button vor dem Settings-Read injizieren.
    var moduleEnabled = false;

    // Whitelist (Optionen): Eintraege in Kleinbuchstaben; ein Konto ist
    // geschuetzt, wenn seine E-Mail einen Eintrag ENTHAELT (Teilstring,
    // dadurch funktionieren exakte Adressen UND Domain-Muster wie
    // "@firma.de").
    var whitelist = [];

    function isWhitelisted(mail) {
        var m = String(mail).toLowerCase();
        return whitelist.some(function (w) { return w && m.indexOf(w) !== -1; });
    }

    function applyWhitelist(list) {
        whitelist = (Array.isArray(list) ? list : [])
            .map(function (s) { return String(s).trim().toLowerCase(); })
            .filter(function (s) { return s.length > 0; });
    }

    chrome.storage.local.get({ modCleaner: true, cleanerWhitelist: [] }, function (items) {
        applyWhitelist(items.cleanerWhitelist);
        moduleEnabled = items.modCleaner !== false;
        if (moduleEnabled) { injectButton(); }
    });
    chrome.storage.onChanged.addListener(function (changes, area) {
        if (area !== 'local') { return; }
        if (changes.cleanerWhitelist) {
            applyWhitelist(changes.cleanerWhitelist.newValue);
        }
        if (changes.modCleaner) {
            moduleEnabled = changes.modCleaner.newValue !== false;
            if (moduleEnabled) {
                injectButton();
            } else {
                var btn = document.getElementById('kl-account-cleaner-btn');
                if (btn) { btn.remove(); }
            }
        }
    });

    // Kontoauswahl rendert dynamisch -> per Observer auf Kacheln warten
    var observer = new MutationObserver(function () {
        if (!running && moduleEnabled) { injectButton(); }
    });
    observer.observe(document.body, { childList: true, subtree: true });
})();
