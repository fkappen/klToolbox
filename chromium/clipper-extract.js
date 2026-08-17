// Version
// version = "1.0.0"  (Modul Clipper, klToolbox)
//
// Wird per scripting.executeScript NACH readability.js in die aktive Seite
// injiziert (nur auf Nutzeraktion, activeTab). Extrahiert den Artikel und
// gibt das Ergebnis als Wert des Scripts zurueck - alles lokal.

(() => {
    try {
        if (typeof Readability !== "function") {
            return { ok: false, error: "Readability nicht geladen." };
        }
        const docClone = document.cloneNode(true);
        const article = new Readability(docClone, { keepClasses: false }).parse();
        if (!article || !article.content) {
            return { ok: false, error: "Kein Artikel-Inhalt erkannt - die Seite ist vermutlich keine Artikelseite." };
        }
        return {
            ok: true,
            title: article.title || document.title || "",
            byline: article.byline || "",
            siteName: article.siteName || location.hostname,
            url: location.href,
            content: article.content,
            text: article.textContent || ""
        };
    } catch (err) {
        return { ok: false, error: String(err) };
    }
})();
