/**
 * Greffes du Québec — table PURE. Clef : le numéro à 3 chiffres, qui est aussi le
 * préfixe d'un numéro de dossier de cour (« 500-05-… » ⇒ greffe 500, Montréal).
 *
 * Porté de Pallas Athéna (`athena/models/reference.py`, `_GREFFES`), puis RÉCONCILIÉ
 * le 2026-07-30 contre la page officielle du MJQ (voir `lieux.ts`). Deux écarts réels
 * en sont sortis : le greffe **625 (Senneterre)** manquait, et **Kuujjuaq** relève du
 * greffe **635**. Aucun district ne divergeait.
 *
 * ⚠ UN GREFFE N'EST PAS UN BÂTIMENT. Un greffe est un REGISTRE ; un palais est un
 *   BÂTIMENT. La relation n'est ni bijective ni totale : plusieurs greffes n'ont aucun
 *   bâtiment fixe, et un greffe peut desservir PLUSIEURS lieux — ce que `palais_key`,
 *   qui est 1:1, ne sait pas dire. La relation complète est dans `lieux.ts`.
 *
 * ⚠ JOINDRE PAR `palais_key`, JAMAIS PAR LE NOM. Le greffe 615 dit « Val d'Or », le
 *   palais dit « Val-d'Or » ; le greffe 150 dit « Saguenay (Chicoutimi) », le palais
 *   dit « Chicoutimi ». Ce sont deux champs différents (libellé du greffe vs nom du
 *   palais au MJQ), pas une faute à corriger. Seul `lieux.ts`, qui vient du MJQ,
 *   autorise un appariement par nom — parce que les deux côtés y sont du MJQ.
 *
 * ⚠ `palais_key: null` signifie « ADRESSE INCONNUE », jamais « il n'existe pas
 *   d'adresse ». Six greffes restent sans adresse résolvable (525, 614, 625, 640, 652,
 *   715). C'est le pendant exact de la règle INTROUVABLE de §2 — l'absence d'un
 *   renseignement n'est pas un constat d'absence. On en sort par une SOURCE : c'est
 *   ainsi que 635 en est sorti, et non en assouplissant la formulation.
 *
 * ⚠ `point_de_service` marque ici les GREFFES DE COUR ITINÉRANTE (614, 625, 635, 640,
 *   652). Ce n'est PAS le `location_type: "point_de_service"` de palais.ts, qui marque
 *   les 8 points de service du MJQ — que cette table-ci marque tous `false`. Et ce
 *   n'est pas non plus le drapeau `itinerant` de `lieux.ts`, qui qualifie un LIEU :
 *   le greffe 760 tient un palais fixe ET un point itinérant. Les trois divergent PAR
 *   CONSTRUCTION : ne pas « harmoniser » l'un sur l'autre.
 */

export interface Greffe {
  readonly palais_de_justice: string;
  readonly district_judiciaire: string;
  /** Cour ITINÉRANTE — voir l'avertissement ci-dessus. */
  readonly point_de_service: boolean;
  /** Clef dans PALAIS, ou null = adresse inconnue (jamais « inexistante »). */
  readonly palais_key: string | null;
}

export const GREFFES: Readonly<Record<string, Greffe>> = {
  "100": {
    palais_de_justice: "Rimouski",
    district_judiciaire: "Rimouski",
    point_de_service: false,
    palais_key: "rimouski",
  },
  "105": {
    palais_de_justice: "New Carlisle",
    district_judiciaire: "Bonaventure",
    point_de_service: false,
    palais_key: "new-carlisle",
  },
  "110": {
    palais_de_justice: "Percé",
    district_judiciaire: "Gaspé",
    point_de_service: false,
    palais_key: "perce",
  },
  "115": {
    palais_de_justice: "Havre-Aubert",
    district_judiciaire: "Gaspé",
    point_de_service: false,
    palais_key: "havre-aubert",
  },
  "120": {
    palais_de_justice: "Amqui",
    district_judiciaire: "Rimouski",
    point_de_service: false,
    palais_key: "amqui",
  },
  "125": {
    palais_de_justice: "Matane",
    district_judiciaire: "Rimouski",
    point_de_service: false,
    palais_key: "matane",
  },
  "130": {
    palais_de_justice: "Sainte-Anne-des-Monts",
    district_judiciaire: "Gaspé",
    point_de_service: false,
    palais_key: "sainte-anne-des-monts",
  },
  "140": {
    palais_de_justice: "Gaspé",
    district_judiciaire: "Gaspé",
    point_de_service: false,
    palais_key: "gaspe",
  },
  "145": {
    palais_de_justice: "Carleton-sur-Mer",
    district_judiciaire: "Bonaventure",
    point_de_service: false,
    palais_key: "carleton-sur-mer",
  },
  "150": {
    palais_de_justice: "Saguenay (Chicoutimi)",
    district_judiciaire: "Chicoutimi",
    point_de_service: false,
    palais_key: "chicoutimi",
  },
  "155": {
    palais_de_justice: "Roberval",
    district_judiciaire: "Roberval",
    point_de_service: false,
    palais_key: "roberval",
  },
  "160": {
    palais_de_justice: "Alma",
    district_judiciaire: "Alma",
    point_de_service: false,
    palais_key: "alma",
  },
  "170": {
    palais_de_justice: "Chibougamau",
    district_judiciaire: "Abitibi",
    point_de_service: false,
    palais_key: "chibougamau",
  },
  "175": {
    palais_de_justice: "Dolbeau-Mistassini",
    district_judiciaire: "Roberval",
    point_de_service: false,
    palais_key: "dolbeau-mistassini",
  },
  "200": {
    palais_de_justice: "Québec",
    district_judiciaire: "Québec",
    point_de_service: false,
    palais_key: "quebec",
  },
  "235": {
    palais_de_justice: "Thetford Mines",
    district_judiciaire: "Frontenac",
    point_de_service: false,
    palais_key: "thetford-mines",
  },
  "240": {
    palais_de_justice: "La Malbaie",
    district_judiciaire: "Charlevoix",
    point_de_service: false,
    palais_key: "la-malbaie",
  },
  "250": {
    palais_de_justice: "Rivière-du-Loup",
    district_judiciaire: "Kamouraska",
    point_de_service: false,
    palais_key: "riviere-du-loup",
  },
  "300": {
    palais_de_justice: "Montmagny",
    district_judiciaire: "Montmagny",
    point_de_service: false,
    palais_key: "montmagny",
  },
  "350": {
    palais_de_justice: "Saint-Joseph-de-Beauce",
    district_judiciaire: "Beauce",
    point_de_service: false,
    palais_key: "saint-joseph-de-beauce",
  },
  "400": {
    palais_de_justice: "Trois-Rivières",
    district_judiciaire: "Trois-Rivières",
    point_de_service: false,
    palais_key: "trois-rivieres",
  },
  "405": {
    palais_de_justice: "Drummondville",
    district_judiciaire: "Drummond",
    point_de_service: false,
    palais_key: "drummondville",
  },
  "410": {
    palais_de_justice: "Shawinigan",
    district_judiciaire: "Saint-Maurice",
    point_de_service: false,
    palais_key: "shawinigan",
  },
  "415": {
    palais_de_justice: "Victoriaville",
    district_judiciaire: "Arthabaska",
    point_de_service: false,
    palais_key: "victoriaville",
  },
  "425": {
    palais_de_justice: "La Tuque",
    district_judiciaire: "Saint-Maurice",
    point_de_service: false,
    palais_key: "la-tuque",
  },
  "450": {
    palais_de_justice: "Sherbrooke",
    district_judiciaire: "Saint-François",
    point_de_service: false,
    palais_key: "sherbrooke",
  },
  "455": {
    palais_de_justice: "Cowansville",
    district_judiciaire: "Bedford",
    point_de_service: false,
    palais_key: "cowansville",
  },
  "460": {
    palais_de_justice: "Granby",
    district_judiciaire: "Bedford",
    point_de_service: false,
    palais_key: "granby",
  },
  "480": {
    palais_de_justice: "Lac-Mégantic",
    district_judiciaire: "Mégantic",
    point_de_service: false,
    palais_key: "lac-megantic",
  },
  "500": {
    palais_de_justice: "Montréal",
    district_judiciaire: "Montréal",
    point_de_service: false,
    palais_key: "montreal",
  },
  "505": {
    palais_de_justice: "Longueuil",
    district_judiciaire: "Longueuil",
    point_de_service: false,
    palais_key: "longueuil",
  },
  "525": {
    palais_de_justice: "Montréal - Chambre de la jeunesse",
    district_judiciaire: "Montréal",
    point_de_service: false,
    palais_key: null,
  },
  "540": {
    palais_de_justice: "Laval",
    district_judiciaire: "Laval",
    point_de_service: false,
    palais_key: "laval",
  },
  "550": {
    palais_de_justice: "Gatineau",
    district_judiciaire: "Gatineau",
    point_de_service: false,
    palais_key: "gatineau",
  },
  "555": {
    palais_de_justice: "Campbell's Bay",
    district_judiciaire: "Pontiac",
    point_de_service: false,
    palais_key: "campbells-bay",
  },
  "560": {
    palais_de_justice: "Mont-Laurier",
    district_judiciaire: "Labelle",
    point_de_service: false,
    palais_key: "mont-laurier",
  },
  "565": {
    palais_de_justice: "Maniwaki",
    district_judiciaire: "Labelle",
    point_de_service: false,
    palais_key: "maniwaki",
  },
  "600": {
    palais_de_justice: "Rouyn-Noranda",
    district_judiciaire: "Rouyn-Noranda",
    point_de_service: false,
    palais_key: "rouyn-noranda",
  },
  "605": {
    palais_de_justice: "Amos",
    district_judiciaire: "Abitibi",
    point_de_service: false,
    palais_key: "amos",
  },
  "610": {
    palais_de_justice: "Ville-Marie",
    district_judiciaire: "Témiscamingue",
    point_de_service: false,
    palais_key: "ville-marie",
  },
  "614": {
    palais_de_justice: "Chisasibi",
    district_judiciaire: "Abitibi",
    point_de_service: true,
    palais_key: null,
  },
  "615": {
    palais_de_justice: "Val d'Or",
    district_judiciaire: "Abitibi",
    point_de_service: false,
    palais_key: "val-dor",
  },
  "620": {
    palais_de_justice: "La Sarre",
    district_judiciaire: "Abitibi",
    point_de_service: false,
    palais_key: "la-sarre",
  },
  // ⚠ AJOUTÉ par la réconciliation du 2026-07-30, non porté d'Athéna : ce greffe
  //   MANQUAIT à la table, et « 625-05-… » rendait donc « greffe inconnu » sur un
  //   greffe qui existe. Observé sur la page officielle du MJQ (mise à jour du
  //   2026-07-22), point de service itinérant, aucune adresse publiée.
  "625": {
    palais_de_justice: "Senneterre",
    district_judiciaire: "Abitibi",
    point_de_service: true,
    palais_key: null,
  },
  "635": {
    palais_de_justice: "Aupaluk",
    district_judiciaire: "Abitibi",
    point_de_service: true,
    palais_key: null,
  },
  "640": {
    palais_de_justice: "Akulivik",
    district_judiciaire: "Abitibi",
    point_de_service: true,
    palais_key: null,
  },
  "650": {
    palais_de_justice: "Sept-Îles",
    district_judiciaire: "Mingan",
    point_de_service: false,
    palais_key: "sept-iles",
  },
  "652": {
    palais_de_justice: "Blanc-Sablon",
    district_judiciaire: "Mingan",
    point_de_service: true,
    palais_key: null,
  },
  "655": {
    palais_de_justice: "Baie-Comeau",
    district_judiciaire: "Baie-Comeau",
    point_de_service: false,
    palais_key: "baie-comeau",
  },
  "665": {
    palais_de_justice: "Forestville",
    district_judiciaire: "Baie-Comeau",
    point_de_service: false,
    palais_key: "forestville",
  },
  "700": {
    palais_de_justice: "Saint-Jérôme",
    district_judiciaire: "Terrebonne",
    point_de_service: false,
    palais_key: "saint-jerome",
  },
  "705": {
    palais_de_justice: "Joliette",
    district_judiciaire: "Joliette",
    point_de_service: false,
    palais_key: "joliette",
  },
  "715": {
    palais_de_justice: "Sainte-Agathe-des-Monts",
    district_judiciaire: "Terrebonne",
    point_de_service: false,
    palais_key: null,
  },
  "750": {
    palais_de_justice: "Saint-Hyacinthe",
    district_judiciaire: "Saint-Hyacinthe",
    point_de_service: false,
    palais_key: "saint-hyacinthe",
  },
  "755": {
    palais_de_justice: "Saint-Jean-sur-Richelieu",
    district_judiciaire: "Iberville",
    point_de_service: false,
    palais_key: "saint-jean-sur-richelieu",
  },
  "760": {
    palais_de_justice: "Salaberry-de-Valleyfield",
    district_judiciaire: "Beauharnois",
    point_de_service: false,
    palais_key: "salaberry-de-valleyfield",
  },
  "765": {
    palais_de_justice: "Sorel-Tracy",
    district_judiciaire: "Richelieu",
    point_de_service: false,
    palais_key: "sorel-tracy",
  },
};
