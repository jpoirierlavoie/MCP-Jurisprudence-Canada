/**
 * Consultation des tables du Québec — PUR : aucune E/S, aucun appel, aucune lecture D1.
 *
 * C'est ce qui distingue ces outils des dix outils `canlii_*` : ils ne peuvent pas
 * échouer, pas consommer de quota, pas dépendre du réseau. Le prix est que leur
 * fraîcheur est celle du dépôt, d'où la réserve de péremption imposée à toute sortie.
 *
 * Les tables ne sont JAMAIS réécrites : rien ici ne ressemble à la boucle
 * d'auto-correction de §6.4, qui apprend du répertoire de CanLII.
 */

import { fold } from "../citation/normalize";
import { FORUMS, type Forum } from "./forums";
import { GREFFES, type Greffe, LOCALITES_ITINERANTES } from "./greffes";
import { JURIDICTIONS, type Juridiction } from "./juridictions";
import { PALAIS, type Palais, type TypeLieu } from "./palais";

export function getGreffe(numero: string): Greffe | null {
  return GREFFES[numero] ?? null;
}

export function getJuridiction(numero: string): Juridiction | null {
  return JURIDICTIONS[numero] ?? null;
}

export function getPalais(clef: string): Palais | null {
  return PALAIS[clef] ?? null;
}

export function getForum(clef: string): Forum | null {
  return FORUMS[clef] ?? null;
}

/** Localités desservies par un greffe itinérant ; vide pour tous les autres. */
export function localitesItinerantes(numero: string): readonly string[] {
  return LOCALITES_ITINERANTES[numero] ?? [];
}

/**
 * Adresse d'un greffe, résolue par `palais_key`.
 *
 * ⚠ `null` signifie « adresse INCONNUE », jamais « il n'existe pas d'adresse ». Les
 *   appelants DOIVENT le formuler ainsi (§2) : six greffes sont concernés, dont quatre
 *   cours itinérantes qui siègent là où la cour se déplace.
 */
export function adresseDuGreffe(numero: string): Palais | null {
  const g = GREFFES[numero];
  if (!g?.palais_key) return null;
  return PALAIS[g.palais_key] ?? null;
}

/** Numéros de greffe, triés. */
export function listerGreffes(): string[] {
  return Object.keys(GREFFES).sort();
}

/** Les 36 districts judiciaires, dédoublonnés et triés selon l'usage français. */
export function listerDistricts(): string[] {
  const vus = new Set<string>();
  for (const g of Object.values(GREFFES)) vus.add(g.district_judiciaire);
  return [...vus].sort((a, b) => a.localeCompare(b, "fr"));
}

export interface FiltrePalais {
  /** District judiciaire ; apparié sur la forme pliée (« quebec » trouve « Québec »). */
  district?: string;
  /** Texte libre : nom du palais, ville ou district. */
  query?: string;
  type?: TypeLieu;
}

/** Un palais et les greffes qui y siègent — l'unité que rendent les outils. */
export interface PalaisResolu {
  readonly clef: string;
  readonly palais: Palais;
  readonly greffes: ReadonlyArray<{ numero: string; greffe: Greffe }>;
}

/**
 * Greffes siégeant dans un palais donné.
 *
 * ⚠ JOINTURE PAR `palais_key`, JAMAIS PAR LE NOM : le greffe 615 dit « Val d'Or » et
 *   le palais « Val-d'Or » ; le greffe 150 dit « Saguenay (Chicoutimi) » et le palais
 *   « Chicoutimi ». Apparier les noms perdrait ces deux-là en silence.
 */
export function greffesDuPalais(clef: string): Array<{ numero: string; greffe: Greffe }> {
  return Object.entries(GREFFES)
    .filter(([, g]) => g.palais_key === clef)
    .map(([numero, greffe]) => ({ numero, greffe }))
    .sort((a, b) => a.numero.localeCompare(b.numero));
}

export function resoudrePalais(clef: string): PalaisResolu | null {
  const palais = PALAIS[clef];
  if (!palais) return null;
  return { clef, palais, greffes: greffesDuPalais(clef) };
}

/**
 * Répertoire filtré. Le tri suit le nom du palais en français, et non la clef ASCII :
 * « Îles » et « Sept-Îles » se rangent là où un lecteur francophone les cherche.
 */
export function listerPalais(filtre: FiltrePalais = {}): PalaisResolu[] {
  const district = filtre.district ? fold(filtre.district) : null;
  const query = filtre.query ? fold(filtre.query) : null;

  const sortie: PalaisResolu[] = [];
  for (const [clef, palais] of Object.entries(PALAIS)) {
    if (filtre.type && palais.location_type !== filtre.type) continue;
    const greffes = greffesDuPalais(clef);

    if (district) {
      const appariable = greffes.some((g) => fold(g.greffe.district_judiciaire) === district);
      if (!appariable) continue;
    }
    if (query) {
      const champs = [
        palais.name,
        palais.city,
        ...greffes.map((g) => g.greffe.district_judiciaire),
        ...greffes.map((g) => g.numero),
      ];
      if (!champs.some((c) => fold(c).includes(query))) continue;
    }
    sortie.push({ clef, palais, greffes });
  }
  return sortie.sort((a, b) => a.palais.name.localeCompare(b.palais.name, "fr"));
}

/**
 * Palais publiés qu'aucun greffe ne nomme.
 *
 * Kuujjuaq est le seul cas connu : le MJQ le publie, mais aucun numéro de greffe ne
 * le désigne. Il reste NON rattaché plutôt que deviné sur un greffe itinérant du
 * Nunavik — inventer la correspondance serait exactement la fausse assurance que §2
 * interdit. `palais_list` le rend donc, mais sans greffe.
 */
export function palaisOrphelins(): string[] {
  const rattaches = new Set(
    Object.values(GREFFES)
      .map((g) => g.palais_key)
      .filter((k): k is string => k !== null),
  );
  return Object.keys(PALAIS)
    .filter((k) => !rattaches.has(k))
    .sort();
}
