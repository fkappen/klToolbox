// Version
// version = "1.2.0"  (Modul Ticket-Datenhook, klToolbox)
// datum   = "2026-09-08"
// autor   = "FK"
//
// Laeuft im MAIN world der Ticketsystem-Seite (document_start): liest die
// Antworten ausgewaehlter GraphQL-Operationen PASSIV mit, die die Seite
// beim Oeffnen eines Tickets ohnehin laedt (Ticket-Stammdaten + Ansprech-
// partner des Kunden), und reicht sie per postMessage an das isolierte
// Content-Script weiter. Kein eigener Request, keine Zusatzlast, keine
// Daten verlassen die Seite. Faellt der Hook aus, bleibt der bisherige
// DOM-Weg (Kontaktmenue) als Rueckfall bestehen.
//
// Grundlage: Netzwerk-Mitschnitt 2026-09-08 (Operationen GetTicketInfoData
// und GetTicketInfoContactPersons als Batch-Array an POST /graphql).
(() => {
    "use strict";
    if (window.__klToolboxTicketHook) {
        return;
    }
    window.__klToolboxTicketHook = true;

    const QUELLE = "klToolbox-ticket";
    const OPS = new Set(["GetTicketInfoData", "GetTicketInfoContactPersons"]);
    // Puffer: Antworten kommen meist an, BEVOR das isolierte Script (document_idle)
    // lauscht - postMessage wird nicht nachgereicht. Das isolierte Script fordert
    // beim Start eine Wiederholung an ("klToolbox-ticket-replay").
    const puffer = [];
    const PUFFER_MAX = 40;

    function parseOps(body) {
        try {
            const parsed = JSON.parse(body);
            const list = Array.isArray(parsed) ? parsed : [parsed];
            return list.map((o) => ({
                op: (o && typeof o.operationName === "string") ? o.operationName : "",
                vars: (o && o.variables && typeof o.variables === "object") ? o.variables : {}
            }));
        } catch (err) {
            return null;
        }
    }

    function weiterreichen(ops, json) {
        const results = Array.isArray(json) ? json : [json];
        const eintraege = [];
        for (let i = 0; i < ops.length; i++) {
            if (!OPS.has(ops[i].op)) {
                continue;
            }
            const r = results[i];
            eintraege.push({
                op: ops[i].op,
                vars: ops[i].vars,
                data: (r && r.data && typeof r.data === "object") ? r.data : null,
                errors: (r && Array.isArray(r.errors) && r.errors.length > 0) ? r.errors.map((e) => String(e && e.message || e)) : null
            });
        }
        if (eintraege.length > 0) {
            for (const e of eintraege) {
                puffer.push(e);
            }
            while (puffer.length > PUFFER_MAX) {
                puffer.shift();
            }
            senden(eintraege);
        }
    }

    function senden(eintraege) {
        try {
            window.postMessage({ source: QUELLE, eintraege: eintraege }, location.origin);
        } catch (err) {
            console.info("[klToolbox] Weitergabe fehlgeschlagen", err);
        }
    }

    window.addEventListener("message", (evt) => {
        if (evt.source !== window || evt.origin !== location.origin || !evt.data || evt.data.source !== "klToolbox-ticket-replay") {
            return;
        }
        console.info("[klToolbox] Ticket-Datenhook: Wiederholung angefordert, " + puffer.length + " gepufferte Antworten");
        senden(puffer.slice());
    });

    function istGraphql(url) {
        return typeof url === "string" && /\/graphql(\?|$)/.test(url);
    }

    // ------------------------------------------------------------ fetch
    // KEIN Klon der Antwort: Die Seite bricht den Request per AbortSignal ab,
    // sobald sie ihre Daten hat - ein parallel gelesener Klon endet dann mit
    // AbortError (Praxistest 2026-09-08). Stattdessen werden text()/json()
    // der zurueckgegebenen Response umhuellt: Wir sehen exakt das, was die
    // Seite selbst liest, ohne zweiten Stream.
    const origFetch = window.fetch;
    if (typeof origFetch === "function") {
        window.fetch = function (...args) {
            const p = origFetch.apply(this, args);
            try {
                const input = args[0];
                const url = typeof input === "string" ? input : (input && typeof input.url === "string" ? input.url : "");
                if (!istGraphql(url)) {
                    return p;
                }
                let opsPromise;
                if (args[1] && typeof args[1].body === "string") {
                    opsPromise = Promise.resolve(parseOps(args[1].body));
                } else if (input && typeof input.clone === "function" && typeof input.text === "function") {
                    opsPromise = input.clone().text().then(parseOps).catch(() => null);
                } else {
                    return p;
                }
                return p.then((res) => {
                    try {
                        huelleResponse(res, opsPromise);
                    } catch (err) {
                        console.info("[klToolbox] Antwort-Huelle fehlgeschlagen", err);
                    }
                    return res;
                });
            } catch (err) {
                console.info("[klToolbox] fetch-Hook uebersprungen", err);
                return p;
            }
        };
    }

    function verarbeiteText(text, opsPromise) {
        opsPromise.then((ops) => {
            if (!ops || !ops.some((o) => OPS.has(o.op))) {
                return;
            }
            try {
                weiterreichen(ops, JSON.parse(text));
            } catch (err) {
                console.info("[klToolbox] GraphQL-Antwort kein JSON", err);
            }
        }).catch(() => null);
    }

    function huelleResponse(res, opsPromise) {
        if (!res || typeof res.text !== "function") {
            return;
        }
        const origText = res.text.bind(res);
        const origJson = typeof res.json === "function" ? res.json.bind(res) : null;
        res.text = function () {
            return origText().then((t) => {
                verarbeiteText(t, opsPromise);
                return t;
            });
        };
        if (origJson) {
            res.json = function () {
                return origJson().then((j) => {
                    opsPromise.then((ops) => {
                        if (ops && ops.some((o) => OPS.has(o.op))) {
                            weiterreichen(ops, j);
                        }
                    }).catch(() => null);
                    return j;
                });
            };
        }
    }

    // ------------------------------------------------------------ XMLHttpRequest
    // Falls die Seite (oder eine Bibliothek) XHR statt fetch nutzt.
    const XHR = window.XMLHttpRequest;
    if (XHR && XHR.prototype) {
        const origOpen = XHR.prototype.open;
        const origSend = XHR.prototype.send;
        XHR.prototype.open = function (method, url) {
            try {
                this.__klUrl = typeof url === "string" ? url : String(url || "");
            } catch (err) {
                console.debug("[klToolbox] XHR open-Hook", err);
            }
            return origOpen.apply(this, arguments);
        };
        XHR.prototype.send = function (body) {
            try {
                if (istGraphql(this.__klUrl) && typeof body === "string") {
                    const ops = parseOps(body);
                    if (ops && ops.some((o) => OPS.has(o.op))) {
                        this.addEventListener("load", () => {
                            try {
                                weiterreichen(ops, JSON.parse(this.responseText));
                            } catch (err) {
                                console.debug("[klToolbox] XHR-Antwort nicht lesbar", err);
                            }
                        });
                    }
                }
            } catch (err) {
                console.debug("[klToolbox] XHR send-Hook", err);
            }
            return origSend.apply(this, arguments);
        };
    }

    // ------------------------------------------------------------ Diagnose
    // In der Browserkonsole der Ticketseite: __klToolboxSchema("Ticket")
    // -> Felder eines GraphQL-Typs (Introspection), zum Dokumentieren im
    // Repo. Kein automatischer Aufruf.
    window.__klToolboxSchema = function (typeName) {
        return origFetch("/graphql", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify({
                query: "query($n:String!){ __type(name:$n){ name kind fields { name type { name kind ofType { name kind } } } inputFields { name type { name kind ofType { name kind } } } } }",
                variables: { n: String(typeName || "Ticket") }
            })
        }).then((r) => r.json()).then((j) => {
            const t = j && j.data && j.data.__type;
            if (!t) {
                console.warn("[klToolbox] Typ nicht gefunden oder Introspection aus:", j && j.errors);
                return null;
            }
            const felder = (t.fields || t.inputFields || []).map((f) => {
                const ty = f.type || {};
                const name = ty.name || (ty.ofType && ty.ofType.name) || "";
                return f.name + ": " + name + (ty.kind === "LIST" || (ty.ofType && ty.ofType.kind === "LIST") ? "[]" : "") + (ty.kind === "NON_NULL" ? "!" : "");
            });
            console.log("[klToolbox] " + t.kind + " " + t.name + " (" + felder.length + " Felder)\n" + felder.join("\n"));
            return felder;
        });
    };

    console.info("[klToolbox] Ticket-Datenhook aktiv (fetch" + (XHR ? "+XHR" : "") + ")");
})();
