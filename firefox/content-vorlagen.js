// Version
// version = "1.10.0"
// datum   = "2026-08-21"
// autor   = "FK"
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
            text: "{gruss} {anrede},\n\nvielen Dank für Ihre Nachricht. Ihr Anliegen ist bei uns eingegangen und wurde als Ticket aufgenommen.\n\nWir kümmern uns schnellstmöglich darum und melden uns, sobald es Neuigkeiten gibt."
        },
        {
            name: "Rückfrage – Informationen benötigt",
            text: "{gruss} {anrede},\n\nvielen Dank für Ihre Meldung. Um das Anliegen zielgerichtet bearbeiten zu können, benötigen wir noch folgende Informationen:\n\n- Betroffener Benutzer / Rechnername:\n- Seit wann tritt das Verhalten auf?\n- Tritt das Problem dauerhaft oder nur sporadisch auf?\n- Gibt es eine Fehlermeldung (gerne als Screenshot)?\n\nVielen Dank vorab für Ihre Rückmeldung."
        },
        {
            name: "Performance – Rückfragen zur Analyse",
            text: "{gruss} {anrede},\n\nvielen Dank für Ihre Meldung. Damit wir die Ursache der Verlangsamung gezielt eingrenzen können, benötigen wir noch einige Angaben:\n\n- Wen betrifft es? (einzelner Benutzer, mehrere oder alle)\n- Wann tritt es auf? (dauerhaft, zu bestimmten Uhrzeiten, seit wann)\n- In welchen Anwendungen macht es sich bemerkbar? (z. B. DATEV, Outlook, Browser – oder generell)\n- Wie äußert es sich: startet die Anwendung langsam oder reagieren Eingaben verzögert?\n\nJe genauer die Angaben, desto schneller finden wir die Ursache. Vielen Dank vorab für Ihre Rückmeldung."
        },
        {
            name: "Fernwartung anbieten",
            text: "{gruss} {anrede},\n\nzur weiteren Analyse würden wir uns gerne per Fernwartung auf das betroffene System aufschalten.\n\nBitte teilen Sie uns kurz mit, wann es Ihnen passt und unter welcher Rufnummer wir Sie am besten erreichen. Alternativ können Sie uns auch direkt anrufen – wir schalten uns dann gemeinsam auf."
        },
        {
            name: "Zwischenbescheid",
            text: "{gruss} {anrede},\n\nein kurzer Zwischenstand zu Ihrem Ticket: Das Thema ist bei uns in Bearbeitung.\n\n[Aktueller Stand / nächste Schritte]\n\nWir melden uns, sobald es Neuigkeiten gibt. Vielen Dank für Ihre Geduld."
        },
        {
            name: "Homeoffice / VPN – instabile Verbindung",
            text: "{gruss} {anrede},\n\nnach Ihrer Beschreibung spricht vieles dafür, dass die Ursache in einer instabilen Internet- bzw. WLAN-Verbindung liegt.\n\nFalls möglich, testen Sie die Verbindung bitte einmal über ein Netzwerkkabel, um das WLAN als Fehlerquelle auszuschließen.\n\nDass normales Surfen funktioniert, ist dabei leider kein aussagekräftiges Kriterium: Webanwendungen gleichen kurze Verbindungsunterbrechungen oder Paketverluste in der Regel unbemerkt durch erneute Übertragungen aus. Eine VPN-Verbindung im Homeoffice reagiert darauf deutlich empfindlicher – bereits kurze Abbrüche können dazu führen, dass der Tunnel getrennt und neu aufgebaut werden muss.\n\nSollte das Problem auch mit Netzwerkkabel weiterhin auftreten, prüfen wir die Ursache gerne gemeinsam weiter."
        },
        {
            name: "Gelöst / Ticket schließen",
            text: "{gruss} {anrede},\n\ndas Anliegen ist aus unserer Sicht gelöst, daher schließen wir das Ticket.\n\nSollte das Problem erneut auftreten oder noch etwas offen sein, melden Sie sich gerne jederzeit – wir öffnen das Ticket dann wieder.\n\nVielen Dank für die gute Zusammenarbeit."
        },
        {
            name: "Erinnerung – keine Rückmeldung",
            text: "{gruss} {anrede},\n\nzu Ihrem Ticket hatten wir Ihnen eine Rückfrage gestellt, bisher jedoch keine Rückmeldung erhalten. Gerne möchten wir das Anliegen für Sie weiterbearbeiten – eine kurze Rückinfo genügt.\n\nSollten wir in den nächsten Tagen nichts von Ihnen hören, schließen wir das Ticket vorsorglich. Sie können es jederzeit durch eine Antwort wieder öffnen."
        }
    ];

    // Eintrags-Vorlagen: eigene, kuerzere Liste fuer interne Ticket-Eintraege
    const DEFAULT_ENTRY_TEMPLATES = [
        { name: "Nicht erreicht", text: "Kunde telefonisch nicht erreicht ({datum}, {zeit})." },
        { name: "Rückruf erledigt", text: "Rückruf mit dem Kunden erfolgt ({datum}, {zeit}). Ergebnis:\n- " },
        { name: "Arbeiten abgeschlossen", text: "Arbeiten abgeschlossen und mit dem Kunden abgestimmt ({datum})." },
        { name: "Warte auf Rückmeldung", text: "Warte auf Rückmeldung des Kunden (angefragt am {datum})." }
    ];

    // Eigene Vornamen (Optionen -> Anrede-Erkennung): ergaenzen die
    // eingebauten Listen und haben VORRANG - so lassen sich Fehltreffer
    // sofort korrigieren, ohne auf eine neue Version zu warten.
    let eigenW = new Set();
    let eigenM = new Set();
    let eigenN = new Set();

    const EIGENE_NAMEN_KEYS = {
        eigeneVornamenW: "",
        eigeneVornamenM: "",
        eigeneVornamenNeutral: ""
    };

    function parseVornamenListe(text) {
        return new Set(String(text || "")
            .split(/[\s,;]+/)
            .map((s) => normalizeVorname(s.trim()))
            .filter((s) => s.length > 0));
    }

    function applyEigeneVornamen(items) {
        eigenW = parseVornamenListe(items.eigeneVornamenW);
        eigenM = parseVornamenListe(items.eigeneVornamenM);
        eigenN = parseVornamenListe(items.eigeneVornamenNeutral);
    }

    chrome.storage.local.get(EIGENE_NAMEN_KEYS, applyEigeneVornamen);
    chrome.storage.onChanged.addListener((ch, area) => {
        if (area !== "local") {
            return;
        }
        if (ch.eigeneVornamenW || ch.eigeneVornamenM || ch.eigeneVornamenNeutral) {
            chrome.storage.local.get(EIGENE_NAMEN_KEYS, applyEigeneVornamen);
        }
    });

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

    // Tageszeitabhaengiger Gruss: bis 11 Uhr Morgen, bis 18 Uhr Tag, danach Abend
    function tagesGruss() {
        const h = new Date().getHours();
        if (h < 11) {
            return "Guten Morgen";
        }
        if (h < 18) {
            return "Guten Tag";
        }
        return "Guten Abend";
    }

    function applyPlaceholders(text, editor) {
        const now = new Date();
        const datum = now.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
        const zeit = now.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
        let out = text
            .replace(/\{gruss\}/gi, tagesGruss())
            .replace(/\{datum\}/gi, datum)
            .replace(/\{zeit\}/gi, zeit + " Uhr");
        if (/\{anrede\}/i.test(out)) {
            const anrede = buildAnrede(editor);
            // Ohne Empfaenger faellt der Platzhalter samt fuehrendem
            // Leerzeichen weg: "{gruss} {anrede}," -> "Guten Tag,"
            out = out.replace(/ ?\{anrede\}/gi, anrede ? " " + anrede : "");
        }
        return out;
    }

    // ---------------------------------------------------------- Anrede

    // Haeufige deutsche Vornamen fuer die Anrede-Erkennung. Bewusst
    // konservativ: Ist der Vorname nicht eindeutig zuzuordnen, wird NICHT
    // geraten, sondern neutral der volle Name verwendet
    // ("Guten Tag Jasmin Schneiss,").
    const VORNAMEN_W = new Set((
        "adelheid adriana agata agnes agnieszka aisha alena alessandra alessia alexa alexandra alexandria alicja " +
        "alina aline alla alma amal amalie amanda amelie amina ana anastasia andjela andrea andreea aneta anette " +
        "angela angelika aniela anika anita anja anke anna annalena anne annegret annelies anneliese annemarie " +
        "annett annette annika anouk antje antonella antonia antonie anzhela ariane arianna asma astrid athina " +
        "ayla aynur ayse aysel aysun baerbel banu barbara beate beatrice beatriz belgin benedetta berna bettina " +
        "betuel bianca biljana bircan birgit birgitta birte bodil bogumila bojana bozena branka brigitte britta " +
        "brunhilde burcu camelia camilla canan carina carla carmen carola carolin carolina caroline caterina " +
        "cathrin cecilia celina ceren charlotte chiara christa christel christiane christin christina christine " +
        "cigdem clara claudia constanze corina cornelia cristina dagmar dalia dana daniela danijela danuta daria " +
        "darja denise despina diana dietlinde dilan dilek dimitra dina doreen doris dorota dorothea dorothee " +
        "dragana dunja duygu ebba ebru ece eda edith editha edyta ekaterina eleftheria elena eleni eleonora elfi " +
        "elfriede elif elin elisa elisabeth elke ella ellen elly els elsa elvira elzbieta emilia emily emine emma " +
        "emmi erika erna esperanza esra esther eva evangelia evelin evelyn ewa ewelina fabienne fadime fatima " +
        "fatma federica felicitas femke feride filiz fiona fleur florentina francesca franziska frauke frida " +
        "frieda friederike funda gabi gabriela gabriele gaia galina gamze georgia gerda gerlinde gertraud gertrud " +
        "giada gianna giorgia giovanna gisela giulia giuseppina gizem gonca gordana grazyna greta gudrun guel " +
        "guelay guelcan guelden guelsen guelten gundula gunilla halina hana hanna hannah hanne hannelore hatice " +
        "hedda hedwig heidi heidrun heike helen helena helene helga helle helma henriette herta hertha hilde " +
        "hildegard hiltrud huda huelya ida ilaria ilka ilona ilse iman ina ines inga inge ingeborg ingelore inger " +
        "ingrid inka inna ioana ioanna ipek irem irene irina iris irmgard irmtraud isabel isabell isabella " +
        "isabelle ivana iwona izabela jacqueline jadwiga jamila jana jane janina jannie jasmin jasmina jeanette " +
        "jelena jennifer jenny jessica joana joanna johanna johanne jolanta jolien josefine josephine jovana " +
        "judith julia juliane julie justyna jutta kaethe kamila karima karin karla karola karolin karolina " +
        "karoline katarina katarzyna katerina katharina kathleen kathrin katja katrin kerstin kevser kinga " +
        "kirsten klara klaudia konstantina konstanze kristin kristina krystyna kseniya laila lara larisa larissa " +
        "laura lavinia layla lea leila lena leonie letizia leyla lidia lieke liliana lilli lilly lina linda " +
        "linnea lisa liselotte liv livia ljiljana lore loredana lotte louisa louise lucia lucyna ludmila luisa " +
        "luise luminita luzia lydia lyudmila maaike madalina magda magdalena maha maike maja malak malgorzata " +
        "malin mandy manuela marcella mareike maren margarete margarethe margherita margit margret maria mariam " +
        "marianne marie marija marika marina mariola marion marit marleen marlena marlene marlies marta martha " +
        "martina martyna marzena mathilde maya mechthild meike melanie melina meltem meral mercedes merle merve " +
        "mette mia michaela michela mieke mihaela mine minna mirela miriam mirjam mona monica monika monique " +
        "muege nada nadezhda nadia nadine nadja najwa nalan nanna natalia natalie nataliya natalja natasa " +
        "nathalie nazan nazli necla nele nergis nesrin nevena nicole nicoleta nienke nilguen niluefer nina noemi " +
        "noor nora nour nur nuray nurcan oana oezge oezlem oksana olesya olga olivera ottilie paloma paola " +
        "patricia patrizia paula paulina pauline pelin pernille petra philippa pia pilar pinar polina rabia " +
        "radmila raffaella raisa ramona rana rania raquel rebecca rebekka reem regina regine reinhild renate rita " +
        "roberta rocio romy rosa rosemarie roswitha roxana ruth sabine sabrina sahar saliha salma samira sandra " +
        "sanja sanne sara sarah saskia sebnem seda sedef selda selin selina sema semra senay serap serena sevda " +
        "sevgi sevil sevim sibel sieglinde siegrid signe sigrid silke silvia simona simone sina siri sladjana " +
        "snezana sofia sofie solveig songuel sonia sonja sophia sophie stavroula stefania stefanie steffi steluta " +
        "stephanie suele sultan susann susanna susanne svenja svetlana sybille sylvia sylwia tabea tamara tanja " +
        "tatiana tatjana teresa thea theresa therese tijana tina tineke tove traude traute tuba tuelay tuerkan " +
        "tugba tuva uelkue ulla ulrike ursel ursula urszula ute valentina valeria valeriya vanessa vasiliki vera " +
        "verena veronica veronika veronique vesna victoria vigdis viktoria viktoriya viola viorica virginia " +
        "vivien vivienne waltraud waltraut weronika wiebke wilhelmine willemijn wilma wioletta yana yasemin " +
        "yasmin yeliz yildiz yulia yvonne zahra zehra zeinab zeynep zinaida zoe zofia zorica zuzanna").split(" "));
    const VORNAMEN_M = new Set((
        "abdul abdullah achim adam adem adrian ahmad ahmed ahmet albert alberto albrecht alejandro aleksa " +
        "aleksandar aleksandr aleksej alessandro alessio alexander alexandros alexandru alexej alfons alfred ali " +
        "alois alper alvaro amir anas anatoli anatolij anders andre andreas andrei andrej andrzej angel angelo " +
        "anselm anton antonio arda arkadiusz armin arnd arne arnold artem arthur artjom artur asger athanasios " +
        "august aurel axel aydin ayhan aykut balthasar baptist baris bart bartek bartosz bas bastian batuhan " +
        "bayram benedikt benjamin benno berat berk berkay bernd bernhard bernward bert berthold bertram bilal " +
        "bjarne bjoern bjorn boban bodo bogdan bogumil bojan boris borislav branko bruno buelent burak burghard " +
        "burhan burkhard carl carlo carlos carsten catalin cees cem cemal cengiz cesar cesare cetin cezary " +
        "christian christoffer christoph christos ciprian claudio claus clemens conrad constantin cornelius " +
        "corrado coskun cosmin cristian czeslaw damian daniel dario dariusz darko david davide davut dawid dejan " +
        "denis dennis detlef detlev diego dietbert dieter dietmar dietrich dimitrios dimitris dirk dmitri dmitrij " +
        "dmitry domenico dominik dragan dumitru dusan eberhard eckart eckhard edgar edmund edoardo eduard eduardo " +
        "edwin egbert egon einar ekkehard elias emanuele emil emmerich emrah emre enes engelbert engin enrico " +
        "enrique erdal erdem erdogan eren ergin erhan eric erich erik erkan ernst erol ertan ertugrul erwin espen " +
        "eugen evert evgenij evgeny ewald fabian fabio fabrizio fadi farid fatih federico felix ferdinand ferhat " +
        "fernando fikret filippo finn fjodor florian florin floris francesco francisco franco frank franz freek " +
        "friedhelm friedrich fritz frode furkan gabriel gaetano gebhard gennadij georg georgij georgios gerald " +
        "gerd gereon gerhard gernot gero gerold gerrit gerwin gheorghe gianluca gianni giannis gijs gilbert " +
        "giorgio giovanni giuseppe godehard goekhan gonzalo goran gottfried gottlieb gottlob graziano gregor " +
        "grigorij grzegorz guenter guenther guerkan guido gunnar gunter gunther gustav hadi hagen hakan halil " +
        "halit halvor hamid hamza hans hansjoerg hansjuergen harald hardy hartmut hartwig hartwin harun hasan " +
        "hassan hauke hayri heiko heinrich heinz hellmut helmar helmut hendrik henk henning henri henrik henry " +
        "henryk herbert hermann herwig hikmet hilmar hinrich holger horst hubert hubertus hueseyin hussein " +
        "ibrahim ignacio igor ilhan ilie ilja ilker ingmar ingo ioannis ion ionel ionut ireneusz isidor ismail " +
        "iulian ivan ivano ivica jacek jacob jakob jamal jan janusz jaroslaw javier jelle jens jeroen jerzy " +
        "jesper jesus joachim joakim joaquin jochem jochen joel joerg johann johannes jonas jonathan joost jorge " +
        "jose josef joseph josip jovan jozef juan juergen julian julius justin justus kacper kadir kai kamil " +
        "karim karl karlheinz karol karsten kazimierz kees kemal kenan kerem kevin khaled kilian kjell klaus " +
        "klemens knut konrad konstantin konstantinos koray korbinian kostas krzysztof kuno kurt lambert lars " +
        "lasse laurenz leander leif lennart leo leon leonard leonhard leonid leopold leszek levent levin linus " +
        "lorenz lorenzo lothar luciano ludger ludwig luigi luis lukas lukasz lutz maarten maciej mads magnus " +
        "mahmoud mahmut maik maksim malik malte manfred manuel marc marcel marcello marcin marco marcos marcus " +
        "marek marian mario marius mark marko markus markward marlon marten martin massimo mateusz mathias matteo " +
        "matthaeus matthias maurizio mauro max maxim maximilian mehmet meinhard meinolf melih mert mesut metin " +
        "michael michail michal michel mieczyslaw miguel mihai mihail mikael mike mikhail mikkel milan milos " +
        "miodrag mirko miroslaw mohamed mohammad mohammed moritz morten muhammed murat musa mustafa nabil nader " +
        "nathan nemanja nenad nico nicolae niels nihat niklas nikolai nikolaj nikolaos nikolas nikos nils noah " +
        "norbert norman norwin nuri octavian odd oemer oguz okan oktay olaf ole oleg oliver omar onur orhan " +
        "ortwin oskar osman oswald otmar ottmar otto ovidiu ozan pablo panagiotis paolo pascal pasquale patrick " +
        "paul pavel pawel pedro per peter petr petre petter philip philipp phillip pierre pieter pietro piotr " +
        "predrag przemyslaw quirin radoslaw radovan radu rafael rafal raffaele ragnar raimund rainer ralf ralph " +
        "ramazan rami ramon raphael rashid rasmus raul razvan recep reimund reiner reinhard reinhold rembert remo " +
        "renato rene ricardo riccardo richard rico rifat rik rob robert roberto rocco rodrigo roger roland rolf " +
        "roman romeo ronald ronny ruben rudi rudolf ruediger rune rupert ruslan ruud ryszard said salih salim " +
        "salvatore samir samuel sander sandro santiago sascha savas sebastian selim semjon sepp serdar sergej " +
        "sergey sergio serhat siegbert siegfried siegmar siegmund sigmar sigurd silvio simon sinan sinisa sjoerd " +
        "slavko slawomir slobodan soenke soren sorin spiros srdjan stanislav stanislaw stavros stefan stefano " +
        "steffen sten stepan stephan stevan stig suat sueleyman svein sven sylvester szymon tadeusz taner taras " +
        "tarek tarik tayfun teun thanasis theo theobald theodor theodoros thies thijs thilo thomas thorben " +
        "thorsten till tilman tilo tim timm timo timon titus tobias tolga tom tomas tomasz tomislav tommaso " +
        "torben torbjorn tore torsten traugott trygve tuncay turgut udo ufuk ugur ulf ulrich umberto urban urs " +
        "uwe valentin valerij valerio vasile vasilij vasilis vassilios vedran veit veli veljko vicente victor " +
        "vidar viktor vincent vincenzo viorel vitalij vito vittorio vlad vladan vladimir vladislav vlado volkan " +
        "volker waldemar walid walter wassili wenzel werner wieland wieslaw wigbert wilfried wilhelm willem willi " +
        "william willibald wim winfried wojciech wolf wolfgang wolfhard wolfram wouter xaver yannick yannik " +
        "yannis yasar yassin yavuz yigit yilmaz youssef yunus yuri yurij yusuf yves zafer zaid zbigniew zdravko " +
        "zdzislaw zeki zeljko zlatko zoran zvonimir zygmunt").split(" "));
    // Geschlechtsneutral gebrauchte Vornamen: hier wird BEWUSST nicht geraten,
    // sondern der volle Name verwendet ("Guten Tag Kim Berger,"). Eine falsche
    // Anrede ist deutlich unangenehmer als eine neutrale.
    const VORNAMEN_UNISEX = new Set((
        "alex alexis andy ashley bo charlie chris deniz derya dominique eike elia evrim jamie jean jo kader kay " +
        "kim leslie lou luca luka maxi mel michele mika nicola nikita nikola noa olcay pat robin sam sasa sasha " +
        "sidney sky toni tony uli ulli umut vanja").split(" "));

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

    // "Jasmin Schneiss" -> "Frau Schneiss"; unbekannter Vorname -> voller Name.
    // Klammer-Zusaetze wie "(WB)" oder "(WB ASP)" werden entfernt - sonst
    // wuerde "(WB)" als Nachname enden ("Frau (WB)").
    // Umlaute vereinheitlichen - die Listen stehen in ae/oe/ue-Schreibweise,
    // damit "Jörg" und "Joerg" gleich erkannt werden.
    function normalizeVorname(s) {
        return String(s).toLowerCase()
            .replace(/ä/g, "ae")
            .replace(/ö/g, "oe")
            .replace(/ü/g, "ue")
            .replace(/ß/g, "ss");
    }

    function buildAnrede(editor) {
        const raw = extractRecipient(editor);
        if (!raw) {
            return "";
        }
        let name = raw.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim();
        if (!name) {
            return "";
        }
        // Manche Empfaenger stehen als "Nachname, Vorname" im An-Feld
        // ("Lagemann, Alexa"). Ohne Umdrehen waere "Lagemann," der Vorname -
        // es griffe keine Liste und die neutrale Anrede stuende verkehrt herum.
        const komma = /^([^,]+),\s*(.+)$/.exec(name);
        if (komma) {
            name = komma[2].trim() + " " + komma[1].trim();
        }
        const tokens = name.split(/\s+/).filter((t) => !/^(dr|prof|dipl|mag|med)\.?$/i.test(t));
        if (tokens.length < 2) {
            return name;
        }
        const vorname = normalizeVorname(tokens[0]);
        // Doppelnamen richten sich nach dem ersten Bestandteil:
        // "Karl-Heinz" -> karl, "Anna-Lena" -> anna
        const kandidaten = vorname.indexOf("-") > 0
            ? [vorname, vorname.split("-")[0]]
            : [vorname];
        const nachname = tokens[tokens.length - 1];
        // Eigene Einträge zuerst - sie sollen die eingebauten Listen schlagen
        if (kandidaten.some((k) => eigenN.has(k))) {
            return name;
        }
        for (const k of kandidaten) {
            if (eigenW.has(k)) {
                return "Frau " + nachname;
            }
            if (eigenM.has(k)) {
                return "Herr " + nachname;
            }
        }
        if (kandidaten.some((k) => VORNAMEN_UNISEX.has(k))) {
            return name;
        }
        for (const k of kandidaten) {
            if (VORNAMEN_W.has(k)) {
                return "Frau " + nachname;
            }
            if (VORNAMEN_M.has(k)) {
                return "Herr " + nachname;
            }
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
                .find((b) => !b.classList.contains("__ki_draft_tbtn") &&
                    !b.classList.contains("__anrede_tbtn"));
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
            // "Anrede": nur die Grussformel ("Guten Morgen Frau Muster,")
            const anrBtn = t.bar.querySelector(".__anrede_tbtn");
            if (ft.ftAnrede !== false && !anrBtn) {
                const aBtn = document.createElement("button");
                aBtn.type = "button";
                aBtn.className = "__vorlagen_tbtn __anrede_tbtn";
                aBtn.title = "Nur die Anrede einfügen – Tageszeit und Empfänger werden automatisch eingesetzt";
                aBtn.textContent = "👋 Anrede";
                aBtn.__editor = t.editor || null;
                aBtn.addEventListener("mousedown", (e) => e.preventDefault()); // Fokus im Editor lassen
                aBtn.addEventListener("click", () => {
                    panelEditor = aBtn.__editor || panelEditor;
                    insertTemplate("{gruss} {anrede},\n\n");
                });
                t.bar.appendChild(aBtn);
            } else if (ft.ftAnrede === false && anrBtn) {
                anrBtn.remove();
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
        // Rechte Kante am Anker ausrichten, aber im Viewport halten: bei
        // Ankern weit links (z. B. Eintrags-Editor) lief das Panel sonst
        // links aus dem sichtbaren Bereich.
        const panelW = panel.offsetWidth || 340;
        const maxRight = Math.max(8, window.innerWidth - panelW - 8);
        panel.style.right = Math.min(Math.max(8, window.innerWidth - r.right), maxRight) + "px";
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
    let ft = { ftVorlagenMail: true, ftKiAntwort: true, ftVorlagenEintrag: true, ftAnrede: true };
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
        chrome.storage.local.get({ modTicket: true }, (items) => {
            moduleEnabled = items.modTicket !== false;
            if (moduleEnabled) {
                ensureButtons();
            } else {
                // Falls der Observer vor dem Storage-Read schon gerendert hat
                removeVorlagenUi();
            }
        });
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area === "local" && changes.modTicket) {
                moduleEnabled = changes.modTicket.newValue !== false;
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
