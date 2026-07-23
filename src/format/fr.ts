/**
 * Formatage français : dates, nombres, listes, troncature (spécification §7).
 */

/** Espace insécable fine, employée devant les deux-points et dans les milliers. */
const NBSP = " ";

/** Rend une date `YYYY-MM-DD` telle quelle : c'est la forme employée par l'annexe A. */
export function dateFr(iso: string | null | undefined): string {
  if (!iso) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : iso;
}

/** Sépare les milliers par une espace insécable : « 1 843 ». */
export function nombreFr(n: number): string {
  return n.toLocaleString("fr-CA").replace(/ |\s/g, NBSP);
}

/** « 1 citation » / « 3 citations » — accord du pluriel. */
export function pluriel(n: number, singulier: string, pluriel_: string): string {
  return `${nombreFr(n)} ${n <= 1 ? singulier : pluriel_}`;
}

/** Champ absent : un tiret cadratin, jamais une chaîne vide ni « null ». */
export function ou(valeur: string | null | undefined, defaut = "—"): string {
  const v = (valeur ?? "").trim();
  return v.length > 0 ? v : defaut;
}

/** Tronque en signalant la troncature EN TOUTES LETTRES (§7, conventions). */
export function troncature(rendus: number, total: number): string | null {
  return total > rendus ? `${nombreFr(rendus)} premiers sur ${nombreFr(total)}` : null;
}

/**
 * Normalise les mots-clefs de CanLII, séparés par des barres verticales ou des
 * tirets selon les tribunaux, en une seule forme lisible.
 */
export function motsCles(bruts: string | null | undefined, max = 12): string | null {
  if (!bruts) return null;
  const parts = bruts
    .split(/[|—–]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (parts.length === 0) return null;
  const gardes = parts.slice(0, max);
  const suffixe = parts.length > max ? ` … (+${nombreFr(parts.length - max)})` : "";
  return gardes.join(" — ") + suffixe;
}

/** Joint des fragments non vides par un séparateur. */
export function joindre(parts: Array<string | null | undefined>, sep = " · "): string {
  return parts.filter((p): p is string => typeof p === "string" && p.trim().length > 0).join(sep);
}

/** Indente chaque ligne d'un bloc (rendu des listes numérotées de l'annexe A). */
export function indenter(texte: string, prefixe = "   "): string {
  return texte
    .split("\n")
    .map((l) => (l.length > 0 ? prefixe + l : l))
    .join("\n");
}
