/**
 * Page publique du connecteur (§18) — `GET /`.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║ ⚠ CETTE PAGE EST PUBLIQUE. Le secret partagé ne doit JAMAIS y paraître.       ║
 * ║                                                                              ║
 * ║ Elle documente la FORME du point d'entrée — `/mcp/<secret>` — et jamais une   ║
 * ║ URL réelle. Elle ne lit pas `env.MCP_SHARED_SECRET`, ne lit pas `request.url` ║
 * ║ et n'appelle rien. Un test épingle l'absence de toute chaîne qui ressemble à  ║
 * ║ un jeton dans le corps rendu.                                                ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 *
 * TOUT LE CONTENU DÉRIVE DES DONNÉES VIVES : les outils viennent du registre, les
 * schémas du même `inputSchema` que le validateur applique, les issues d'analyse du
 * VRAI parseur exécuté au rendu, les palais des tables de `src/qc/`. Une page qui
 * recopierait ces valeurs deviendrait fausse sans que rien n'échoue — c'est le mode
 * de panne que ce dépôt combat partout ailleurs.
 *
 * Aucune dépendance, aucune requête tierce : ni police distante, ni CDN, ni image.
 * Sans JavaScript, le FRANÇAIS s'affiche et tout le contenu reste lisible.
 */

import { GARDE_DOSSIER, GARDE_PALAIS, GARDE_SANS_ADRESSE } from "./format/render";
import { listToolDescriptors } from "./mcp/registry";
import type { JsonSchema } from "./mcp/validate";
import { analyserNumeroDossier } from "./qc/dossier";
import { GREFFES } from "./qc/greffes";
import { JURIDICTIONS, LIBELLE_TYPE_GREFFE } from "./qc/juridictions";
import { MJQ_MAJ } from "./qc/lieux";
import { adresseDuGreffe, listerDistricts, localitesItinerantes, siegeFixe } from "./qc/lookup";
import { RELEVE_LE } from "./qc/palais";
import { EN, OUTILS_EN } from "./site.i18n";

/** Échappement HTML. Appliqué à TOUTE valeur interpolée, sans exception. */
export function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Bloc bilingue : les DEUX langues sont émises, une règle CSS n'en montre qu'une.
 *
 * Ni deux routes, ni un paramètre, ni une négociation `Accept-Language` : le choix
 * est fait dans le navigateur, avant le premier rendu, et sans requête.
 */
export function bi(fr: string, en: string): string {
  return `<span data-l="fr">${esc(fr)}</span><span data-l="en">${esc(en)}</span>`;
}

/** Suite de paragraphes bilingues. */
export function biP(fr: readonly string[], en: readonly string[]): string {
  return (
    `<div data-l="fr">${fr.map((p) => `<p>${esc(p)}</p>`).join("")}</div>` +
    `<div data-l="en">${en.map((p) => `<p>${esc(p)}</p>`).join("")}</div>`
  );
}

/**
 * Les sections, en UN SEUL endroit : le sommaire et les `<h2>` en découlent tous
 * deux. Deux listes divergeraient — un sommaire qui renvoie à une ancre disparue est
 * un défaut silencieux.
 */
export const SECTIONS = [
  { id: "outils", fr: "Les outils", en: "The tools" },
  { id: "schema", fr: "Les schémas", en: "The schemas" },
  { id: "dossier", fr: "Numéro de dossier", en: "Court file numbers" },
  { id: "greffes", fr: "Greffes et palais", en: "Registries and courthouses" },
  { id: "acces", fr: "Accès", en: "Access" },
] as const;

export type SectionId = (typeof SECTIONS)[number]["id"];

const TITRE_SECTION = new Map<SectionId, { fr: string; en: string }>(
  SECTIONS.map((s) => [s.id, { fr: s.fr, en: s.en }]),
);

function h2(id: SectionId): string {
  const t = TITRE_SECTION.get(id)!;
  return `<h2 id="${id}">${bi(t.fr, t.en)}</h2>`;
}

// ── Thème ─────────────────────────────────────────────────────────────────────
//
// Deux jeux de variables, et RIEN d'autre : aucune couleur en dur ailleurs dans le
// CSS. Une `rgba(0,0,0,.25)` d'ombre, par exemple, ne bascule pas et devient
// invisible en sombre. Un test balaie le CSS et échoue s'il en trouve une.
//
// Les deux jeux doivent déclarer EXACTEMENT les mêmes variables — un test le vérifie
// aussi, faute de quoi le mode sombre hériterait en silence d'une valeur claire.

const CLAIR =
  "--f:#1a1a17;--m:#6b6560;--b:#e0ddd6;--a:#8a3324;--bg:#fcfbf8;--card:#ffffff;" +
  "--th:#f6f4ef;--code:#f1eee8;--hover:#faf8f4;--avert-bg:#fbf6ee;--avert-b:#e8dcc6";

const SOMBRE =
  "--f:#e9e7e2;--m:#9d968c;--b:#38352e;--a:#e6906d;--bg:#15140f;--card:#1d1b15;" +
  "--th:#242118;--code:#242118;--hover:#232016;--avert-bg:#201c14;--avert-b:#3c3426";

/** Point de rupture du sommaire latéral. Injecté dans le JS client par jeton. */
const LARGE = "78rem";

const CSS = `
:root{${CLAIR}}
@media(prefers-color-scheme:dark){:root{${SOMBRE}}}
html.t-light{${CLAIR}}
html.t-dark{${SOMBRE}}

/* Une seule règle porte tout le bilinguisme. */
html.l-fr [data-l=en],html.l-en [data-l=fr]{display:none}

*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--f);
  font:16px/1.65 Georgia,'Times New Roman',serif}
code,pre,kbd{font-family:ui-monospace,Menlo,Consolas,monospace}
a{color:var(--a)}
a:hover{text-decoration:none}
.wrap{max-width:${LARGE};margin:0 auto;padding:1.5rem 1.25rem 4rem}
main{max-width:60rem}
h1{font-size:1.9rem;line-height:1.25;margin:0 0 .5rem}
h2{font-size:1.4rem;margin:2.75rem 0 .75rem;padding-bottom:.3rem;
  border-bottom:1px solid var(--b)}
h3{font-size:1.1rem;margin:1.75rem 0 .5rem}
h4{font-size:1rem;margin:1.25rem 0 .35rem}
p{margin:.6rem 0}
section[id]{scroll-margin-top:1.5rem}
.muted{color:var(--m)}
.small{font-size:.88rem}

/* Barre de commandes : les deux bascules. */
.cmd{display:flex;gap:.5rem;flex-wrap:wrap;margin:1rem 0 1.5rem}
.cmd button{font:inherit;font-size:.85rem;cursor:pointer;padding:.35rem .8rem;
  color:var(--f);background:var(--card);border:1px solid var(--b);border-radius:2rem}
.cmd button:hover{background:var(--hover)}
/* Largeur figée : les trois libellés diffèrent, le bouton sauterait à chaque clic. */
#theme{min-width:7.5rem;text-align:center}
#theme [data-t]{display:none}
html:not(.t-light):not(.t-dark) #theme [data-t=auto],
html.t-light #theme [data-t=light],
html.t-dark #theme [data-t=dark]{display:inline}

/* Encadré de réserve — le contrat de vérité, visible et non décoratif. */
.avert{background:var(--avert-bg);border:1px solid var(--avert-b);
  border-left:3px solid var(--a);border-radius:3px;padding:.75rem 1rem;margin:1rem 0}
.avert p:first-child{margin-top:0}
.avert p:last-child{margin-bottom:0}

article.outil{border:1px solid var(--b);background:var(--card);border-radius:4px;
  padding:.85rem 1rem;margin:.85rem 0}
article.outil h4{margin-top:0}
article.outil h4 code{font-size:.95rem;color:var(--a)}
.titre{font-weight:bold;margin:.2rem 0 .5rem}

table{border-collapse:collapse;width:100%;font-size:.9rem;margin:.75rem 0}
th,td{text-align:left;padding:.4rem .55rem;border-bottom:1px solid var(--b);
  vertical-align:top}
th{background:var(--th);font-weight:bold}
tbody tr:hover{background:var(--hover)}
td code{font-size:.85rem}

pre{background:var(--code);border:1px solid var(--b);border-radius:3px;
  padding:.7rem .85rem;overflow-x:auto;font-size:.85rem;line-height:1.5}
:not(pre)>code{background:var(--code);padding:.1rem .3rem;border-radius:2px;
  font-size:.9em}

.filtre{display:flex;gap:.5rem;flex-wrap:wrap;align-items:center;margin:.75rem 0}
.filtre input,.filtre select{font:inherit;font-size:.9rem;padding:.3rem .5rem;
  color:var(--f);background:var(--card);border:1px solid var(--b);border-radius:3px}
.compte{color:var(--m);font-size:.85rem}

footer{margin-top:3rem;padding-top:1rem;border-top:1px solid var(--b);
  color:var(--m);font-size:.88rem}

.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);
  white-space:nowrap}

@media(prefers-reduced-motion:no-preference){
  html{scroll-behavior:smooth}
}
`;

/**
 * Script de tête, SYNCHRONE : il applique langue et thème AVANT le premier rendu.
 * Sans lui, la page clignoterait du français au anglais, ou du clair au sombre.
 *
 * ⚠ Il COMPOSE les deux classes en un seul tableau. Écrire `className` en bloc dans
 *   l'un des deux gestionnaires effacerait l'autre classe EN SILENCE — le connecteur
 *   jumeau s'y est fait prendre. Les gestionnaires n'emploient donc que `classList`.
 */
// La balise String.raw est une PARADE, pas un ornement. Ce bloc-ci n'a pas
// d'échappement AUJOURD'HUI — d'où l'avertissement de Biome — mais le jour où
// quelqu'un y écrit une classe de caractères ou un « \d », un littéral non balisé
// mangerait l'antislash EN SILENCE et le script cesserait de faire ce qu'il dit.
// La retirer parce qu'elle « ne sert pas encore » rouvrirait exactement ce défaut.
// biome-ignore lint/complexity/noUselessStringRaw: parade délibérée, voir ci-dessus
const BOOT = String.raw`
try{
  var r=document.documentElement, c=[];
  var p=localStorage.getItem('jurisLang')||(navigator.language||'fr').slice(0,2);
  c.push(p==='en'?'l-en':'l-fr'); r.lang=(p==='en'?'en':'fr');
  var t=localStorage.getItem('jurisTheme');
  if(t==='light'||t==='dark') c.push('t-'+t);
  r.className=c.join(' ');
}catch(e){}
`;

/**
 * JS client, en fin de corps.
 *
 * ⚠ PIÈGE D'ÉCRITURE : dans un littéral de gabarit NON balisé, `\d` devient `d` en
 *   silence. Ce bloc est donc écrit en `String.raw` — et ne doit contenir NI backtick
 *   NI `${`, puisque `String.raw` interpole quand même. Le point de rupture voyage
 *   donc comme un jeton textuel, substitué par `jsClient()` sous garde.
 */
const JS = String.raw`
(function(){
  var d=document, h=d.documentElement;
  h.classList.add('js');

  var b=d.getElementById('lang');
  if(b) b.addEventListener('click',function(){
    var nv=h.classList.contains('l-en')?'fr':'en';
    h.classList.toggle('l-fr',nv==='fr'); h.classList.toggle('l-en',nv==='en');
    h.lang=nv;
    try{localStorage.setItem('jurisLang',nv);}catch(e){}
  });

  // Trois etats en cycle : auto -> clair -> sombre -> auto. « auto » n'est pas une
  // classe mais l'ABSENCE des deux autres, pour que la media query reprenne la main.
  var tb=d.getElementById('theme');
  if(tb) tb.addEventListener('click',function(){
    var cur=h.classList.contains('t-light')?'light'
           :h.classList.contains('t-dark')?'dark':'auto';
    var nx=cur==='auto'?'light':cur==='light'?'dark':'auto';
    h.classList.remove('t-light'); h.classList.remove('t-dark');
    if(nx!=='auto') h.classList.add('t-'+nx);
    try{
      if(nx==='auto') localStorage.removeItem('jurisTheme');
      else localStorage.setItem('jurisTheme',nx);
    }catch(e){}
  });

  var q=d.getElementById('q'), sel=d.getElementById('dist'), tb2=d.getElementById('tgreffes');
  if(q&&sel&&tb2){
    var corps=tb2.tBodies[0], rangs=[].slice.call(corps.rows);
    var cpt=d.getElementById('compte');
    // Pliage des diacritiques : "quebec" doit trouver "Quebec".
    //
    // Ce bloc est en String.raw et reste donc en ASCII PUR, commentaires compris :
    // une lettre accentuee y survivrait, mais l'echappement d'une classe de
    // caracteres, lui, ne survit pas a une relecture distraite. La classe des
    // marques combinantes est ecrite en echappement (u0300 a u036f) : String.raw la
    // laisse passer telle quelle, et c'est le moteur d'expression reguliere du
    // NAVIGATEUR qui l'interprete. Ecrire les caracteres combinants en clair
    // marcherait aussi, mais ils sont invisibles a l'oeil et invisibles en revue.
    var plier=function(s){
      return s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    };
    var filtrer=function(){
      var t=plier(q.value.trim()), dd=sel.value, n=0;
      for(var i=0;i<rangs.length;i++){
        var r=rangs[i];
        var okd=(dd===''||r.getAttribute('data-d')===dd);
        var okt=(t===''||plier(r.textContent).indexOf(t)>=0);
        var vu=okd&&okt;
        r.style.display=vu?'':'none';
        if(vu) n++;
      }
      if(cpt) cpt.textContent=n+' / '+rangs.length;
    };
    q.addEventListener('input',filtrer);
    sel.addEventListener('change',filtrer);
    filtrer();
  }
})();
`;

/**
 * Substitue le point de rupture, sous garde : si le jeton disparaissait d'une
 * réécriture, on préfère un échec bruyant à un CSS muet.
 */
function jsClient(): string {
  if (!JS.includes("plier")) throw new Error("JS client tronqué : « plier » absent");
  return JS;
}

// ── Assemblage ────────────────────────────────────────────────────────────────

function sommaire(): string {
  const liens = SECTIONS.map((s) => `<li><a href="#${s.id}">${bi(s.fr, s.en)}</a></li>`).join("");
  return `<nav class="sr"><ul>${liens}</ul></nav>`;
}

function entete(): string {
  return `<header>
<h1>${bi("Jurisprudence canadienne et greffes du Québec", EN.titre)}</h1>
<div class="cmd">
<button id="theme" type="button" title="Thème / Theme"
  ><span data-t="auto">${bi("◐ Auto", "◐ Auto")}</span
  ><span data-t="light">${bi("☀︎ Clair", "☀︎ Light")}</span
  ><span data-t="dark">${bi("☾ Sombre", "☾ Dark")}</span></button>
<button id="lang" type="button" title="Français / English">FR&nbsp;·&nbsp;EN</button>
</div>
${biP(
  [
    "Serveur MCP en lecture seule. Il éprouve des citations de jurisprudence contre la " +
      "collection de CanLII, et lit la nomenclature judiciaire québécoise — numéros de " +
      "dossier, greffes, palais de justice.",
  ],
  EN.intro,
)}
<div class="avert">
${biP(
  [
    "Ce connecteur établit l'EXISTENCE et l'IDENTITÉ d'une décision. Il n'établit ni son " +
      "autorité actuelle — aucun historique d'appel, aucun indicateur de traitement, aucun " +
      "pourvoi pendant — ni le contenu de son dispositif. L'API de CanLII ne rend que des " +
      "métadonnées : jamais le texte d'une décision.",
    "Une absence n'est jamais une preuve d'inexistence.",
  ],
  EN.avertissement,
)}
</div>
</header>`;
}

// ── Les outils, dérivés du REGISTRE ───────────────────────────────────────────
//
// `listToolDescriptors()` est la même fonction que sert `tools/list`. La page ne peut
// donc pas prendre de retard sur le registre : il n'y a pas de seconde copie.

interface Descripteur {
  name: string;
  title: string;
  description: string;
  inputSchema: JsonSchema;
}

function descripteurs(): Descripteur[] {
  return listToolDescriptors() as unknown as Descripteur[];
}

function estLocal(nom: string): boolean {
  return nom.startsWith("greffe_") || nom.startsWith("palais_");
}

function outils(): string {
  const carte = (d: Descripteur) => {
    const en = OUTILS_EN[d.name];
    return `<article class="outil">
<h4><code>${esc(d.name)}</code></h4>
<p class="titre">${bi(d.title, en?.titre ?? d.title)}</p>
${biP([d.description], [en?.texte ?? d.description])}
</article>`;
  };

  const tous = descripteurs();
  const canlii = tous.filter((d) => !estLocal(d.name));
  const locaux = tous.filter((d) => estLocal(d.name));

  return `<section id="outils">
${h2("outils")}
<h3>${bi("Adossés à CanLII", EN.familleCanlii)}</h3>
${biP(
  [
    "Dix outils dont la réponse vient de la collection de CanLII — la couverture et les " +
      "verdicts en dépendent. Ils font des appels sortants et sont soumis au quota de l'API.",
  ],
  EN.familleCanliiTexte,
)}
${canlii.map(carte).join("\n")}
<h3>${bi("Tables locales du Québec — aucun appel, jamais", EN.familleQc)}</h3>
${biP(
  [
    "Trois outils qui lisent des tables de référence compilées dans le Worker, relevées auprès " +
      "du ministère de la Justice du Québec. Ils ne font aucune requête sortante et n'écrivent rien.",
    "Le préfixe annonce la SOURCE. Servir une adresse de palais sous canlii_ attribuerait à " +
      "CanLII une donnée dont il n'est pas la source ; la scission est vérifiée par des tests, " +
      "et non seulement documentée.",
  ],
  EN.familleQcTexte,
)}
${locaux.map(carte).join("\n")}
</section>`;
}

// ── Les schémas, dérivés du MÊME objet que le validateur applique ─────────────

/** Rend les contraintes d'un schéma en une phrase compacte. */
function contraintes(s: JsonSchema): string {
  const bouts: string[] = [];
  if (s.enum) bouts.push(s.enum.map((v) => `« ${String(v)} »`).join(" · "));
  if (s.minLength !== undefined || s.maxLength !== undefined) {
    bouts.push(`${s.minLength ?? 0}–${s.maxLength ?? "∞"} car.`);
  }
  if (s.minimum !== undefined || s.maximum !== undefined) {
    bouts.push(`${s.minimum ?? "−∞"} – ${s.maximum ?? "∞"}`);
  }
  if (s.minItems !== undefined || s.maxItems !== undefined) {
    bouts.push(`${s.minItems ?? 0}–${s.maxItems ?? "∞"} éléments`);
  }
  return bouts.join(" · ");
}

function schemas(): string {
  const bloc = (d: Descripteur) => {
    const props = d.inputSchema.properties ?? {};
    const requis = new Set(d.inputSchema.required ?? []);
    const noms = Object.keys(props);
    if (noms.length === 0) {
      return `<h4><code>${esc(d.name)}</code></h4>
<p class="muted small">${bi("Aucun paramètre.", "No parameters.")}</p>`;
    }
    const lignes = noms
      .map((n) => {
        const p = props[n] as JsonSchema;
        const type = p.type === "array" ? `array&lt;${p.items?.type ?? "?"}&gt;` : (p.type ?? "?");
        return `<tr>
<td><code>${esc(n)}</code>${requis.has(n) ? ` <span class="muted small">${bi("requis", EN.requis)}</span>` : ""}</td>
<td><code>${type}</code></td>
<td class="small">${esc(contraintes(p))}</td>
</tr>`;
      })
      .join("");
    return `<h4><code>${esc(d.name)}</code></h4>
<table><thead><tr>
<th>${bi("Paramètre", EN.colParam)}</th><th>${bi("Type", EN.colType)}</th>
<th>${bi("Contraintes", EN.colContrainte)}</th>
</tr></thead><tbody>${lignes}</tbody></table>`;
  };

  return `<section id="schema">
${h2("schema")}
${biP(
  [
    "Chaque outil déclare un schéma FERMÉ : toute propriété non listée est refusée. Ces tables " +
      "sont générées depuis le schéma même que le validateur applique à l'appel — elles ne " +
      "peuvent donc pas diverger de ce que le serveur accepte.",
  ],
  EN.schemaTexte,
)}
${descripteurs().map(bloc).join("\n")}
</section>`;
}

// ── Numéro de dossier : les issues, PRODUITES PAR LE VRAI PARSEUR ─────────────

const EXEMPLES = [
  "500-05-123456-241",
  "TAL-594531",
  "C.F.-T-1234-26",
  "XYZ-9999",
  "999-99-123456",
  "500 - 05 - 123456",
] as const;

/** Résume en une ligne ce que le parseur a rendu. Aucune issue n'est réécrite. */
function issue(entree: string): string {
  const r = analyserNumeroDossier(entree);
  if (r.parse_error) return `⚠ ${r.parse_error}`;
  if (r.forum) {
    return `${r.forum.name} (${r.forum.abbr}) — ${
      r.is_administrative ? "tribunal administratif" : "cour fédérale"
    }`;
  }
  if (r.is_administrative && !r.greffe_number) {
    return "Préfixe alphabétique non répertorié — aucun tribunal deviné, et ce n'est pas une erreur.";
  }
  const bouts = [
    r.greffe ? `greffe ${r.greffe_number} · ${r.greffe.palais_de_justice}` : null,
    r.greffe ? `district de ${r.greffe.district_judiciaire}` : null,
    r.juridiction ? `${r.juridiction.tribunal} · ${r.juridiction.competence}` : null,
  ].filter((b): b is string => b !== null);
  return bouts.join(" · ");
}

function dossier(): string {
  const lignes = EXEMPLES.map(
    (e) => `<tr><td><code>${esc(e)}</code></td><td class="small">${esc(issue(e))}</td></tr>`,
  ).join("");

  const jur = Object.entries(JURIDICTIONS)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(
      ([code, j]) => `<tr><td><code>${esc(code)}</code></td><td>${esc(j.tribunal)}</td>
<td>${esc(j.competence)}</td><td class="small">${esc(LIBELLE_TYPE_GREFFE[j.greffe_type])}</td></tr>`,
    )
    .join("");

  return `<section id="dossier">
${h2("dossier")}
${biP(
  [
    "Un numéro de dossier judiciaire québécois se lit NNN-NN-NNNNNN-NNN. Les positions 1 à 3 " +
      "sont le greffe — palais de justice et district judiciaire. Les positions 5 et 6 sont la " +
      "juridiction — tribunal, compétence, type de greffe. Le reste est une séquence et des " +
      "chiffres de contrôle.",
    "Les positions 7 et suivantes ne sont PAS analysées, et aucune somme de contrôle n'est " +
      "vérifiée : il n'y en a pas. En inventer une rejetterait des numéros valides, ce qui est " +
      "le pire des deux défauts.",
    "Un préfixe alphabétique court-circuite tout cela : TAL-, TAQ-, C.F.- et leurs pareils " +
      "nomment un corps qui numérote ses dossiers lui-même. Le préfixe EST la réponse à " +
      "« quel tribunal ».",
  ],
  EN.dossierTexte,
)}
<h3>${bi("Les issues, rendues par le vrai parseur", EN.dossierExemples)}</h3>
${biP(
  [
    "Les exemples ci-dessous ne sont pas transcrits : la page exécute le parseur au moment du " +
      "rendu et affiche ce qu'il renvoie. Cette documentation ne peut donc pas diverger du " +
      "comportement.",
  ],
  EN.dossierExemplesTexte,
)}
<table><thead><tr>
<th>${bi("Entrée", EN.colEntree)}</th><th>${bi("Issue", EN.colIssue)}</th>
</tr></thead><tbody>${lignes}</tbody></table>
<div class="avert"><p>${bi(GARDE_DOSSIER, GARDE_DOSSIER)}</p></div>
<h3>${bi("Codes de juridiction", EN.juridictionsTitre)}</h3>
${biP(
  [
    "Le code à deux chiffres des positions 5 et 6. Le tiret cadratin des codes 46, 72 et 73 est " +
      "une valeur RÉELLE : ces séries ne relèvent d'aucun tribunal nommé.",
  ],
  EN.juridictionsTexte,
)}
<table><thead><tr>
<th>${bi("Code", EN.colCode)}</th><th>${bi("Tribunal", EN.colTribunal)}</th>
<th>${bi("Compétence", EN.colCompetence)}</th><th>${bi("Type de greffe", EN.colGreffeType)}</th>
</tr></thead><tbody>${jur}</tbody></table>
</section>`;
}

// ── Greffes et palais ─────────────────────────────────────────────────────────

function greffes(): string {
  const districts = listerDistricts();
  const options = districts.map((d) => `<option value="${esc(d)}">${esc(d)}</option>`).join("");

  const lignes = Object.keys(GREFFES)
    .sort()
    .map((numero) => {
      const g = GREFFES[numero]!;
      const adresse = adresseDuGreffe(numero);
      const siege = g.palais_key ? null : siegeFixe(numero);
      const localites = localitesItinerantes(numero);

      const cellAdresse = adresse
        ? `${esc(adresse.street)}${adresse.unit ? `, ${esc(adresse.unit)}` : ""}<br>` +
          `${esc(adresse.city)} (Québec) ${esc(adresse.postal_code)}` +
          (siege
            ? `<br><span class="muted small">${bi(
                `Siège fixe : ${siege.palais.name}, rattaché par le relevé du Ministère`,
                `Fixed seat: ${siege.palais.name}, attached by the Ministry's listing`,
              )}</span>`
            : "")
        : `<span class="muted">${bi("aucune adresse publiée", EN.sansAdresse)}</span>`;

      const types = [
        g.point_de_service
          ? `<span class="muted small">${bi("cour itinérante", EN.typeItinerant)}</span>`
          : null,
        localites.length > 0
          ? `<span class="muted small">${esc(localites.join(", "))}</span>`
          : null,
      ]
        .filter((t): t is string => t !== null)
        .join("<br>");

      return `<tr data-d="${esc(g.district_judiciaire)}">
<td><code>${esc(numero)}</code></td>
<td>${esc(g.palais_de_justice)}</td>
<td>${esc(g.district_judiciaire)}</td>
<td>${cellAdresse}</td>
<td>${types}</td>
</tr>`;
    })
    .join("");

  return `<section id="greffes">
${h2("greffes")}
${biP(
  [
    "Les greffes du Québec, cléés sur le numéro à trois chiffres par lequel commence un numéro " +
      "de dossier. Un greffe est un REGISTRE ; un palais est un BÂTIMENT — la relation n'est ni " +
      "bijective ni totale, et un greffe dessert souvent plusieurs lieux.",
  ],
  EN.greffesTexte,
)}
<div class="filtre">
<input id="q" type="search" placeholder="Filtrer…" aria-label="Filtrer">
<select id="dist" aria-label="District"><option value="">${bi("Tous les districts", EN.tousDistricts)}</option>${options}</select>
<span class="compte" id="compte"></span>
</div>
<table id="tgreffes"><thead><tr>
<th>${bi("Greffe", EN.colGreffe)}</th><th>${bi("Palais", EN.colPalais)}</th>
<th>${bi("District judiciaire", EN.colDistrict)}</th><th>${bi("Adresse", EN.colAdresse)}</th>
<th>${bi("Type", EN.colTypeLieu)}</th>
</tr></thead><tbody>${lignes}</tbody></table>

<div class="avert">
<p>${bi(GARDE_SANS_ADRESSE, GARDE_SANS_ADRESSE)}</p>
</div>

<h3>${bi("Aucune coordonnée", EN.aucuneCoordonnee)}</h3>
<div class="avert">
${biP(
  [
    "Ce connecteur ne porte AUCUN numéro de téléphone, aucun courriel et aucune heure " +
      "d'ouverture — pour aucun palais. C'est une propriété de la donnée, non un échec de la page.",
    "Les numéros des greffes sont publiés par chambre (Montréal en publie au moins quatre), sur " +
      "le site du Ministère. Les y obtenir.",
  ],
  EN.aucuneCoordonneeTexte,
)}
<p><a href="https://www.justice.gouv.qc.ca/nous-joindre/trouver-un-palais-de-justice/">justice.gouv.qc.ca</a></p>
</div>

<div class="avert">
<p>${bi(GARDE_PALAIS, GARDE_PALAIS)}</p>
<p class="small">${bi(
    `Adresses relevées le ${RELEVE_LE} · rattachements des greffes selon le relevé du Ministère mis à jour le ${MJQ_MAJ}.`,
    `Addresses surveyed ${RELEVE_LE} · registry attachments per the Ministry's listing updated ${MJQ_MAJ}.`,
  )}</p>
</div>
</section>`;
}

function acces(): string {
  return `<section id="acces">
${h2("acces")}
${biP(
  [
    "Instance privée, exploitée par un avocat du Québec pour sa propre pratique. Le point " +
      "d'entrée a la forme https://jurisprudence.poirierlavoie.ca/mcp/<secret> — le secret " +
      "n'apparaît nulle part sur cette page, et n'y apparaîtra jamais.",
    "Le code est public et la suite de tests s'exécute sans clef d'API ni réseau.",
  ],
  EN.acces,
)}
<p><a href="https://github.com/jpoirierlavoie/MCP-Jurisprudence-Quebec">github.com/jpoirierlavoie/MCP-Jurisprudence-Quebec</a>
 · <a href="mailto:jason@poirierlavoie.ca">jason@poirierlavoie.ca</a></p>
</section>`;
}

function pied(): string {
  return `<footer>
${biP(
  [
    "Jason Poirier Lavoie, avocat (Québec). Données de jurisprudence : CanLII. Données " +
      "des greffes et palais : ministère de la Justice du Québec.",
    "Aucun conseil juridique. Cet outil ne remplace ni la vérification à la source, ni le " +
      "jugement professionnel.",
  ],
  EN.pied,
)}
</footer>`;
}

/**
 * Rend la page entière. PURE : aucune E/S, aucune lecture de `env`, aucun accès au
 * `Request`. C'est ce qui permet de la mémoïser sans risque de fuite entre requêtes.
 */
export function renderSite(): string {
  const corps = [
    entete(),
    sommaire(),
    outils(),
    schemas(),
    dossier(),
    greffes(),
    acces(),
    pied(),
  ].join("\n");

  return `<!doctype html>
<html lang="fr" class="l-fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Jurisprudence canadienne et greffes du Québec — serveur MCP</title>
<meta name="description" content="Serveur MCP en lecture seule : vérification de citations de jurisprudence contre la collection de CanLII, et nomenclature judiciaire québécoise (numéros de dossier, greffes, palais de justice).">
<style>${CSS}</style>
<script>${BOOT}</script>
</head>
<body>
<div class="wrap">
<main>
${corps}
</main>
</div>
<script>${jsClient()}</script>
</body>
</html>`;
}

/**
 * Mémoïsation par isolat. Le rendu est de la concaténation de chaînes sur des tables
 * en mémoire — mais il est inutile de le refaire à chaque requête.
 *
 * ⚠ On ne met PAS la page en cache d'arête avec un `s-maxage` long, contrairement au
 *   connecteur jumeau : lui interroge D1 à chaque rendu et devait s'en protéger, au
 *   prix d'un défaut connu — un déploiement ne rafraîchit pas la page. Ici le rendu
 *   ne coûte rien, et un isolat neuf suit le déploiement.
 */
let memo: string | null = null;

export function pagePubliqueHtml(): string {
  if (memo === null) memo = renderSite();
  return memo;
}
