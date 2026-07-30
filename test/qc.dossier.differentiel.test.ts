/**
 * Différentiel : le port TypeScript rend-il EXACTEMENT ce que rend l'original Python ?
 *
 * `test/fixtures/dossier-athena.json` a été produit en exécutant le parseur de Pallas
 * Athéna (`athena/models/reference.py`) sur 127 entrées — les 27 juridictions, les
 * 56 greffes, les préfixes de forum connus, pointés et inconnus, et les formes
 * refusées. La sortie comparée est la forme APLATIE que le gestionnaire MCP d'Athéna
 * expose (`handlers.py:1552-1571`), c'est-à-dire son contrat réel.
 *
 * Pourquoi ce test existe : un port se relit bien et se trompe quand même. Les
 * divergences plausibles ici sont silencieuses — un `isalpha()` Unicode devenu ASCII,
 * une espace de séparation perdue entre deux messages, un `is_administrative` vrai
 * pour une cour fédérale. Aucune ne lèverait d'erreur ; toutes rendraient une réponse
 * fausse à un praticien. La seule preuve utile est de rejouer les deux.
 *
 * Régénérer la fixture n'a de sens qu'après une évolution VOLONTAIRE d'Athéna. Une
 * divergence inattendue se répare dans `src/qc/dossier.ts`, jamais dans la fixture.
 */
import { describe, expect, it } from "vitest";

import { analyserNumeroDossier } from "../src/qc/dossier";
import cas from "./fixtures/dossier-athena.json";

/** Reproduit l'aplatissement du gestionnaire MCP d'Athéna, champ pour champ. */
function aplatir(entree: string) {
  const r = analyserNumeroDossier(entree);
  return {
    greffe_number: r.greffe_number,
    juridiction_number: r.juridiction_number,
    palais_de_justice: r.greffe?.palais_de_justice ?? null,
    district_judiciaire: r.greffe?.district_judiciaire ?? null,
    point_de_service: r.greffe?.point_de_service ?? null,
    tribunal: r.juridiction?.tribunal || r.forum?.name || null,
    competence: r.juridiction?.competence ?? null,
    greffe_type: r.juridiction?.greffe_type ?? null,
    is_administrative: r.is_administrative,
    parse_error: r.parse_error,
  };
}

describe("port fidèle du parseur d'Athéna", () => {
  it("couvre les 27 juridictions, les 56 greffes et les préfixes de forum", () => {
    expect(cas.length).toBeGreaterThanOrEqual(127);
  });

  for (const { entree, attendu } of cas) {
    it(`concorde sur « ${entree} »`, () => {
      expect(aplatir(entree)).toEqual(attendu);
    });
  }
});
