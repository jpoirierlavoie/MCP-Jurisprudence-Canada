/**
 * Analyse d'un numéro de dossier de cour — port des cas d'Athéna
 * (`athena/tests/test_mcp_tools.py:1229-1267` et la matrice de `reference.py`).
 *
 * Ces cas ne sont pas décoratifs : plusieurs consignent un défaut réel déjà corrigé
 * une fois. Un test qui échoue ici se répare en rétablissant le comportement, pas en
 * ajustant l'attente.
 */
import { describe, expect, it } from "vitest";

import { analyserNumeroDossier } from "../src/qc/dossier";

describe("numéro judiciaire bien formé", () => {
  it("résout le greffe ET la juridiction", () => {
    const r = analyserNumeroDossier("500-05-123456-241");
    expect(r.greffe_number).toBe("500");
    expect(r.juridiction_number).toBe("05");
    expect(r.greffe?.palais_de_justice).toBe("Montréal");
    expect(r.greffe?.district_judiciaire).toBe("Montréal");
    expect(r.juridiction?.tribunal).toBe("Cour supérieure");
    expect(r.juridiction?.competence).toBe("Division générale");
    expect(r.juridiction?.greffe_type).toBe("GC");
    expect(r.is_administrative).toBe(false);
    expect(r.parse_error).toBeNull();
  });

  it("n'exige PAS les segments de séquence et de contrôle", () => {
    // Il n'existe ni somme de contrôle ni règle d'année : « 500-05 » suffit.
    const r = analyserNumeroDossier("500-05");
    expect(r.parse_error).toBeNull();
    expect(r.greffe?.district_judiciaire).toBe("Montréal");
  });

  it("n'analyse ni ne valide les positions 7 et suivantes", () => {
    // Conséquence assumée : une queue absurde passe. Inventer une validation
    // rejetterait des numéros valides, ce qui est le pire des deux défauts.
    const r = analyserNumeroDossier("500-05-zzzzzz-!!!");
    expect(r.parse_error).toBeNull();
    expect(r.greffe_number).toBe("500");
  });
});

describe("préfixe alphabétique — le préfixe EST le tribunal", () => {
  it("TAL résout son tribunal, sans erreur", () => {
    // Défaut PA-D09 : « TAL-594531 » rendait huit nuls alors que le préfixe est la
    // réponse à la question posée.
    const r = analyserNumeroDossier("TAL-594531");
    expect(r.forum?.name).toBe("Tribunal administratif du logement");
    expect(r.is_administrative).toBe(true);
    expect(r.parse_error).toBeNull();
    expect(r.greffe_number).toBeNull();
  });

  it("une cour fédérale N'EST PAS un tribunal administratif", () => {
    for (const n of ["C.F.-T-1234-26", "CF-T-1234-26"]) {
      const r = analyserNumeroDossier(n);
      expect(r.forum?.name, n).toBe("Cour fédérale");
      expect(r.is_administrative, n).toBe(false);
      expect(r.parse_error, n).toBeNull();
    }
  });

  it("un préfixe INCONNU reste prudent : jamais d'erreur, jamais de nom deviné", () => {
    const r = analyserNumeroDossier("XYZ-9999");
    expect(r.is_administrative).toBe(true);
    expect(r.forum).toBeNull();
    expect(r.parse_error).toBeNull();
  });

  it("un préfixe alphabétique n'est JAMAIS une erreur de format", () => {
    // « n'importe quoi » commence par une lettre : il prend la branche du préfixe
    // et ne voit jamais le message « Format invalide ».
    const r = analyserNumeroDossier("n'importe quoi");
    expect(r.parse_error).toBeNull();
    expect(r.is_administrative).toBe(true);
  });
});

describe("entrées refusées", () => {
  it("vide ou blanche", () => {
    for (const n of ["", "   "]) {
      expect(analyserNumeroDossier(n).parse_error).toBe("Numéro de dossier judiciaire requis.");
    }
  });

  it("sans tiret", () => {
    expect(analyserNumeroDossier("500").parse_error).toContain("Format invalide");
  });

  it("greffe qui n'a pas 3 chiffres", () => {
    expect(analyserNumeroDossier("50-05-123456").parse_error).toBe(
      "Le numéro de greffe « 50 » doit être composé de 3 chiffres.",
    );
  });

  it("juridiction qui n'a pas 2 chiffres", () => {
    expect(analyserNumeroDossier("500-5-123456").parse_error).toBe(
      "Le numéro de juridiction « 5 » doit être composé de 2 chiffres.",
    );
  });

  it("les espaces internes ne sont PAS tolérés", () => {
    // .trim() seulement : on ne « répare » pas un numéro en silence.
    expect(analyserNumeroDossier("500 - 05 - 123456").parse_error).toContain("greffe");
  });

  it("mais les espaces de bordure le sont", () => {
    expect(analyserNumeroDossier("  500-05-123456-241  ").greffe_number).toBe("500");
  });
});

describe("codes inconnus — on nomme, on ne devine pas", () => {
  it("greffe absent : le numéro est tout de même renseigné", () => {
    const r = analyserNumeroDossier("999-05-123456");
    expect(r.greffe_number).toBe("999");
    expect(r.greffe).toBeNull();
    expect(r.juridiction?.tribunal).toBe("Cour supérieure");
    expect(r.parse_error).toBe("Greffe « 999 » introuvable dans les données de référence.");
  });

  it("juridiction absente : idem", () => {
    const r = analyserNumeroDossier("500-99-123456");
    expect(r.juridiction_number).toBe("99");
    expect(r.juridiction).toBeNull();
    expect(r.greffe?.palais_de_justice).toBe("Montréal");
    expect(r.parse_error).toBe("Juridiction « 99 » introuvable dans les données de référence.");
  });

  it("les deux absents : DEUX messages, séparés par une seule espace", () => {
    const r = analyserNumeroDossier("999-99-123456");
    expect(r.parse_error).toBe(
      "Greffe « 999 » introuvable dans les données de référence. " +
        "Juridiction « 99 » introuvable dans les données de référence.",
    );
  });
});

describe("greffes particuliers", () => {
  it("un greffe itinérant s'analyse, sans adresse", () => {
    const r = analyserNumeroDossier("614-05-123456");
    expect(r.greffe?.palais_de_justice).toBe("Chisasibi");
    expect(r.greffe?.point_de_service).toBe(true);
    expect(r.greffe?.palais_key).toBeNull();
    expect(r.parse_error).toBeNull();
  });

  it("le tiret cadratin de la juridiction 46 remonte tel quel", () => {
    expect(analyserNumeroDossier("500-46-1").juridiction?.tribunal).toBe("—");
  });
});
