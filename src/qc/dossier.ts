/**
 * Analyse d'un numéro de dossier de cour du Québec — PUR : aucune E/S.
 *
 * Port de Pallas Athéna (`athena/models/reference.py`, `parse_court_file_number`),
 * où il est éprouvé en production. Les comportements ci-dessous ne sont PAS des
 * approximations à améliorer : chacun est testé chez Athéna, et plusieurs corrigent
 * un défaut réel. Les « corriger » spontanément serait une régression.
 *
 * Forme : `NNN-NN-NNNNNN-NNN`, p. ex. `500-05-123456-241`.
 *   positions 1-3  numéro de greffe      (palais + district judiciaire)
 *   positions 5-6  numéro de juridiction (tribunal + compétence)
 *   le reste       séquence et contrôle  — JAMAIS analysé
 *
 * ⚠ IL N'Y A NI SOMME DE CONTRÔLE, NI RÈGLE D'ANNÉE. Les segments 3 et suivants ne
 *   sont pas validés du tout. Ne pas en inventer : un numéro rejeté à tort ferait
 *   croire à une erreur de transcription là où il n'y en a pas.
 *
 * ⚠ CE QUE CET OUTIL N'ÉTABLIT PAS : que le dossier existe. Il lit une NOMENCLATURE.
 *   Un numéro parfaitement formé peut ne désigner aucun dossier.
 */

import type { Forum } from "./forums";
import { INDEX_PREFIXE_FORUM } from "./forums";
import type { Greffe } from "./greffes";
import type { Juridiction } from "./juridictions";
import { getForum, getGreffe, getJuridiction } from "./lookup";

export interface DossierAnalyse {
  greffe_number: string | null;
  juridiction_number: string | null;
  greffe: Greffe | null;
  juridiction: Juridiction | null;
  /** Forum résolu depuis un préfixe alphabétique (TAL-…), sinon null. */
  forum: Forum | null;
  forum_key: string | null;
  is_administrative: boolean;
  parse_error: string | null;
}

function vide(): DossierAnalyse {
  return {
    greffe_number: null,
    juridiction_number: null,
    greffe: null,
    juridiction: null,
    forum: null,
    forum_key: null,
    is_administrative: false,
    parse_error: null,
  };
}

/**
 * `str.isalpha()` de Python est UNICODE : `/\p{L}/u` en est l'équivalent fidèle.
 * `/[A-Za-z]/` ferait diverger le port sur un préfixe accentué.
 */
const LETTRE = /\p{L}/u;

/**
 * `str.isdigit()` de Python est Unicode aussi (les chiffres pleine chasse passent).
 * `/^\d{3}$/` est un resserrement ASCII DÉLIBÉRÉ et sans effet observable : un
 * chiffre exotique échouerait de toute façon à la consultation de la table. On
 * préfère le resserrement à un `\p{Nd}` qui laisserait entrer des formes qu'aucune
 * table ne connaît.
 */
const TROIS_CHIFFRES = /^\d{3}$/;
const DEUX_CHIFFRES = /^\d{2}$/;

export function analyserNumeroDossier(brut: string): DossierAnalyse {
  const r = vide();

  if (!brut?.trim()) {
    r.parse_error = "Numéro de dossier judiciaire requis.";
    return r;
  }

  // ⚠ `.trim()` SEULEMENT. Pas de normalisation des tirets ni des espaces internes :
  //   « 500 - 05 - 123456 » doit échouer, comme chez Athéna. Un numéro que l'on
  //   « répare » en silence est un numéro dont on ne sait plus ce qu'il disait.
  const propre = brut.trim();

  // ── Préfixe alphabétique : le corps numérote ses dossiers lui-même ──────────
  //
  // « TAL-594531 » : le PRÉFIXE EST la réponse à « quel tribunal ». Le jeter
  // rendrait huit champs nuls là où l'on connaît le tribunal (défaut PA-D09 chez
  // Athéna, corrigé). is_administrative n'est vrai que pour la catégorie
  // « administratif » : UNE COUR FÉDÉRALE N'EST PAS UN TRIBUNAL ADMINISTRATIF.
  // Un préfixe INCONNU garde la forme prudente — administratif, forum nul — et
  // n'est JAMAIS une erreur : on ne devine pas un nom de tribunal.
  if (LETTRE.test(propre[0]!)) {
    let prefixe = "";
    for (const ch of propre) {
      if (LETTRE.test(ch) || ch === ".") prefixe += ch;
      else break;
    }
    const clef = INDEX_PREFIXE_FORUM[prefixe.toUpperCase().replaceAll(".", "")];
    if (clef) {
      r.forum = getForum(clef);
      r.forum_key = clef;
      r.is_administrative = r.forum?.category === "administratif";
    } else {
      r.is_administrative = true;
    }
    return r;
  }

  const parts = propre.split("-");
  if (parts.length < 2) {
    r.parse_error = "Format invalide. Attendu : NNN-NN-NNNNNN-NN (ex. : 500-05-123456-241)";
    return r;
  }

  const greffeStr = parts[0]!;
  const juridictionStr = parts[1]!;

  if (!TROIS_CHIFFRES.test(greffeStr)) {
    r.parse_error = `Le numéro de greffe « ${greffeStr} » doit être composé de 3 chiffres.`;
    return r;
  }
  if (!DEUX_CHIFFRES.test(juridictionStr)) {
    r.parse_error = `Le numéro de juridiction « ${juridictionStr} » doit être composé de 2 chiffres.`;
    return r;
  }

  // ⚠ Renseignés MÊME SI la table ignore le code : un praticien qui lit
  //   « greffe 999 introuvable » veut voir le 999 qu'il a tapé.
  r.greffe_number = greffeStr;
  r.juridiction_number = juridictionStr;
  r.greffe = getGreffe(greffeStr);
  r.juridiction = getJuridiction(juridictionStr);

  // ⚠ Les deux messages s'ACCUMULENT, séparés par une seule espace ASCII : quand
  //   les deux codes sont inconnus, on le dit deux fois plutôt que d'en taire un.
  if (!r.greffe) {
    r.parse_error = `Greffe « ${greffeStr} » introuvable dans les données de référence.`;
  }
  if (!r.juridiction) {
    const deja = r.parse_error ?? "";
    const sep = deja ? " " : "";
    r.parse_error = `${deja}${sep}Juridiction « ${juridictionStr} » introuvable dans les données de référence.`;
  }

  return r;
}
