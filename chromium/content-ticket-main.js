// Version
// version = "1.0.0"  (Modul Ticket-Datenhook, klToolbox)
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
            try {
                window.postMessage({ source: QUELLE, eintraege: eintraege }, location.origin);
            } catch (err) {
                console.debug("[klToolbox] Weitergabe fehlgeschlagen", err);
            }
        }
    }

    function istGraphql(url) {
        return typeof url === "string" && /\/graphql(\?|$)/.test(url);
    }

    // ------------------------------------------------------------ fetch
    const origFetch = window.fetch;
    if (typeof origFetch === "function") {
        window.fetch = function (...args) {
            const p = origFetch.apply(this, args);
            try {
                const input = args[0];
                const url = typeof input === "string" ? input : (input && typeof input.url === "string" ? input.url : "");
                const body = (args[1] && typeof args[1].body === "string") ? args[1].body : null;
                if (!istGraphql(url) || !body) {
                    return p;
                }
                const ops = parseOps(body);
                if (!ops || !ops.some((o) => OPS.has(o.op))) {
                    return p;
                }
                return p.then((res) => {
                    try {
                        res.clone().json()
                            .then((json) => weiterreichen(ops, json))
                            .catch((err) => console.debug("[klToolbox] GraphQL-Antwort nicht lesbar", err));
                    } catch (err) {
                        console.debug("[klToolbox] Antwort-Klon fehlgeschlagen", err);
                    }
                    return res;
                });
            } catch (err) {
                console.debug("[klToolbox] fetch-Hook uebersprungen", err);
                return p;
            }
        };
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

    console.debug("[klToolbox] Ticket-Datenhook aktiv");
})();
