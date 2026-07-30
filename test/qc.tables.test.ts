/**
 * Tables de référence du Québec — invariants de forme.
 *
 * Ces tests ne vérifient pas une fonctionnalité : ils empêchent une DÉRIVE. Les tables
 * sont un relevé daté d'une source extérieure, et une ligne recopiée de travers ne se
 * signale par aucune erreur — elle rend simplement une mauvaise adresse, ce qui, pour
 * une signification, est pire qu'une panne. Portés de Pallas Athéna
 * (`athena/tests/test_reference_addresses.py`, `test_reference_forums.py`).
 */
import { describe, expect, it } from "vitest";

import { FORUMS, INDEX_PREFIXE_FORUM } from "../src/qc/forums";
import { GREFFES } from "../src/qc/greffes";
import { JURIDICTIONS } from "../src/qc/juridictions";
import {
  adresseDuGreffe,
  greffesDuPalais,
  listerDistricts,
  listerPalais,
  localitesItinerantes,
  palaisOrphelins,
  siegeFixe,
} from "../src/qc/lookup";
import { PALAIS } from "../src/qc/palais";

/** Greffes sans adresse résolvable — ensemble ATTENDU, pas une lacune tolérée. */
const GREFFES_SANS_ADRESSE = ["525", "614", "625", "640", "652", "715"];

describe("comptes — le relevé du 2026-07-15", () => {
  it("51 lieux : 43 palais de justice et 8 points de service", () => {
    expect(Object.keys(PALAIS)).toHaveLength(51);
    const parType = Object.values(PALAIS).reduce<Record<string, number>>((acc, p) => {
      acc[p.location_type] = (acc[p.location_type] ?? 0) + 1;
      return acc;
    }, {});
    expect(parType).toEqual({ palais: 43, point_de_service: 8 });
  });

  it("57 greffes, 27 juridictions, 20 forums", () => {
    // 57 et non 56 : la reconciliation du 2026-07-30 a AJOUTE le greffe 625
    // (Senneterre), absent de la table portee d'Athena.
    expect(Object.keys(GREFFES)).toHaveLength(57);
    expect(Object.keys(JURIDICTIONS)).toHaveLength(27);
    expect(Object.keys(FORUMS)).toHaveLength(20);
  });

  it("les 36 districts judiciaires du Québec", () => {
    const districts = listerDistricts();
    expect(districts).toHaveLength(36);
    expect(districts).toContain("Montréal");
    expect(districts).toContain("Témiscamingue");
  });

  it("16 tribunaux administratifs et 4 cours fédérales", () => {
    const admin = Object.values(FORUMS).filter((f) => f.category === "administratif");
    const federal = Object.values(FORUMS).filter((f) => f.category === "federal");
    expect(admin).toHaveLength(16);
    expect(federal).toHaveLength(4);
  });
});

describe("adresses — complètes ou franchement absentes", () => {
  it("chaque lieu porte un nom, une rue, une ville et un code postal valide", () => {
    for (const [clef, p] of Object.entries(PALAIS)) {
      expect(p.name.length, clef).toBeGreaterThan(0);
      expect(p.street.length, clef).toBeGreaterThan(0);
      expect(p.city.length, clef).toBeGreaterThan(0);
      expect(p.postal_code, clef).toMatch(/^[A-Z]\d[A-Z] \d[A-Z]\d$/);
    }
  });

  it("deux lieux SEULEMENT portent une adresse postale distincte", () => {
    const avec = Object.entries(PALAIS)
      .filter(([, p]) => p.mailing_address.length > 0)
      .map(([k]) => k)
      .sort();
    expect(avec).toEqual(["forestville", "perce"]);
  });

  it("six greffes n'ont AUCUNE adresse résolvable — l'ensemble est connu", () => {
    const sans = Object.keys(GREFFES)
      .filter((n) => adresseDuGreffe(n) === null)
      .sort();
    expect(sans).toEqual(GREFFES_SANS_ADRESSE);
  });

  it("tous les autres greffes résolvent bien une adresse", () => {
    for (const numero of Object.keys(GREFFES)) {
      if (GREFFES_SANS_ADRESSE.includes(numero)) continue;
      expect(adresseDuGreffe(numero), numero).not.toBeNull();
    }
  });

  it("plus AUCUN palais orphelin : Kuujjuaq est rattache par le MJQ", () => {
    // Athena laissait Kuujjuaq volontairement orphelin, refusant de le rattacher au
    // juge a un greffe itinerant du Nunavik. La page officielle tranche : greffe 635,
    // et il n'y est PAS itinerant — c'est le siege fixe. Le rattachement repose donc
    // sur une SOURCE, non sur une conjecture.
    expect(palaisOrphelins()).toEqual([]);
    expect(greffesDuPalais("kuujjuaq").map((g) => g.numero)).toEqual(["635"]);
    expect(siegeFixe("635")?.clef).toBe("kuujjuaq");
    expect(adresseDuGreffe("635")?.name).toBe("Kuujjuaq");
  });
});

describe("jointure greffe -> palais", () => {
  it("aucun palais n'est revendiqué par deux greffes", () => {
    // Un doublon signalerait un appariement de noms erroné, pas un vrai bâtiment partagé.
    const clefs = Object.values(GREFFES)
      .map((g) => g.palais_key)
      .filter((k): k is string => k !== null);
    expect(new Set(clefs).size).toBe(clefs.length);
  });

  it("toute palais_key non nulle existe dans PALAIS", () => {
    for (const [numero, g] of Object.entries(GREFFES)) {
      if (g.palais_key === null) continue;
      expect(PALAIS[g.palais_key], numero).toBeDefined();
    }
  });

  it("la jointure tient MALGRÉ des noms qui diffèrent", () => {
    // C'est exactement pourquoi on joint par palais_key et jamais par le nom.
    expect(GREFFES["615"]!.palais_de_justice).toBe("Val d'Or");
    expect(PALAIS["val-dor"]!.name).toBe("Val-d'Or");
    expect(adresseDuGreffe("615")!.name).toBe("Val-d'Or");

    expect(GREFFES["150"]!.palais_de_justice).toBe("Saguenay (Chicoutimi)");
    expect(adresseDuGreffe("150")!.name).toBe("Chicoutimi");
  });

  it("greffesDuPalais retrouve le greffe depuis le bâtiment", () => {
    expect(greffesDuPalais("montreal").map((g) => g.numero)).toEqual(["500"]);
    expect(greffesDuPalais("kuujjuaq").map((g) => g.numero)).toEqual(["635"]);
  });
});

describe("les deux pièges à NE PAS corriger", () => {
  it("le nom d'un palais n'est pas sa ville", () => {
    expect(PALAIS.chicoutimi!.city).toBe("Saguenay");
    expect(PALAIS["havre-aubert"]!.city).toBe("Les Îles-de-la-Madeleine");
  });

  it("point_de_service ne désigne PAS la même chose des deux côtés", () => {
    // Côté greffe : les quatre cours ITINÉRANTES.
    const itinerants = Object.entries(GREFFES)
      .filter(([, g]) => g.point_de_service)
      .map(([n]) => n)
      .sort();
    // 625 (Senneterre) s'ajoute depuis la reconciliation du 2026-07-30.
    expect(itinerants).toEqual(["614", "625", "635", "640", "652"]);

    // Côté palais : les huit points de service du MJQ — que la table des greffes
    // marque tous `false`. Les deux divergent PAR CONSTRUCTION.
    const pointsMjq = Object.entries(PALAIS)
      .filter(([, p]) => p.location_type === "point_de_service")
      .map(([k]) => k);
    expect(pointsMjq).toHaveLength(8);
    for (const clef of pointsMjq) {
      for (const { numero, greffe } of greffesDuPalais(clef)) {
        expect(greffe.point_de_service, `greffe ${numero} (${clef})`).toBe(false);
      }
    }
  });

  it("les localites desservies viennent du MJQ, plus completes qu'Athena", () => {
    // Athena n'en couvrait que quatre greffes ; le releve officiel en nomme davantage.
    expect(localitesItinerantes("614")).toContain("Mistissini");
    expect(localitesItinerantes("652")).toContain("Fermont");
    // Deux que la liste d'Athena ignorait entierement :
    expect(localitesItinerantes("760")).toEqual(["Vaudreuil-Dorion"]);
    expect(localitesItinerantes("625")).toEqual([]); // Senneterre EST le chef-lieu
    // Un greffe ordinaire n'a aucune localite itinerante.
    expect(localitesItinerantes("500")).toEqual([]);
  });
});

describe("répertoire", () => {
  it("filtre par district, en pliant les diacritiques", () => {
    const r = listerPalais({ district: "montreal" });
    expect(r.map((p) => p.clef)).toEqual(["montreal"]);
  });

  it("filtre par type", () => {
    expect(listerPalais({ type: "point_de_service" })).toHaveLength(8);
    expect(listerPalais({ type: "palais" })).toHaveLength(43);
  });

  it("cherche par nom, par ville ou par numéro de greffe", () => {
    expect(listerPalais({ query: "saguenay" }).map((p) => p.clef)).toEqual(["chicoutimi"]);
    expect(listerPalais({ query: "500" }).map((p) => p.clef)).toEqual(["montreal"]);
  });

  it("sans filtre, rend les 51 lieux triés en français", () => {
    const tout = listerPalais();
    expect(tout).toHaveLength(51);
    expect(tout[0]!.palais.name).toBe("Alma");
  });
});

describe("index de préfixe des forums", () => {
  it("résout une abréviation avec ET sans points", () => {
    expect(INDEX_PREFIXE_FORUM.CF).toBe("cour_federale");
    expect(INDEX_PREFIXE_FORUM.CAF).toBe("cour_appel_federale");
    expect(INDEX_PREFIXE_FORUM.TAL).toBe("tal");
    expect(INDEX_PREFIXE_FORUM.CSC).toBe("cour_supreme_canada");
  });

  it("les tribunaux du flux judiciaire sont délibérément ABSENTS", () => {
    // Tribunal des droits de la personne et Tribunal des professions relèvent de la
    // Cour du Québec : le parseur les couvre par les juridictions 53 et 07. Les
    // ajouter ici créerait deux réponses concurrentes pour un même dossier.
    const noms = Object.values(FORUMS).map((f) => f.name);
    expect(noms).not.toContain("Tribunal des droits de la personne");
    expect(noms).not.toContain("Tribunal des professions");
    expect(JURIDICTIONS["53"]!.competence).toBe("Tribunal des droits de la personne");
    expect(JURIDICTIONS["07"]!.competence).toBe("Tribunal des professions");
  });
});

describe("juridictions", () => {
  it("le tiret cadratin de 46, 72 et 73 est une valeur RÉELLE", () => {
    // Ces séries ne relèvent d'aucun tribunal nommé. Ce n'est pas un champ vide.
    for (const code of ["46", "72", "73"]) {
      expect(JURIDICTIONS[code]!.tribunal, code).toBe("—");
    }
  });

  it("porte les libellés CORRIGÉS, non les périmés", () => {
    // Régression contre la réapparition d'une copie ancienne (Athéna, commit d1575bd).
    expect(JURIDICTIONS["17"]!.competence).toBe("Chambre civile"); // ex- « Voie allégée »
    expect(JURIDICTIONS["09"]!.competence).toBe("Chambre civile"); // ex- « Affaires civiles »
    expect(JURIDICTIONS["11"]!.competence).toBe("Chambre commerciale");
    expect(JURIDICTIONS["61"]!.competence).toBe("Chambre criminelle et pénale");
  });
});
