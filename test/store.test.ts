/**
 * Couche D1 (spécification §4, §7.2, §10) — éprouvée contre du VRAI SQLite dans
 * workerd, pas contre une imitation.
 *
 * L'enjeu central de ce fichier : l'index FTS5 en « external content » ne se maintient
 * QUE par les trois déclencheurs, et une divergence y est SILENCIEUSE. C'est
 * précisément la catégorie de défaut qu'un outil juridique ne peut pas se permettre,
 * donc elle est verrouillée ici.
 */
import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import type { CanliiUsage } from "../src/canlii/client";
import {
  type CaseRow,
  countCases,
  extractNeutral,
  ftsQuery,
  getCachedCase,
  listCases,
  rowFromListItem,
  rowFromMetadata,
  searchLocal,
  upsertCase,
  upsertCases,
} from "../src/store/cases";
import { edgeStale, getCachedEdges, replaceEdges } from "../src/store/citator";
import { directoryMismatches, loadDirectory } from "../src/store/databases";
import { flushUsage, logSearch, utcDay } from "../src/store/telemetry";

const db = env.DB;

async function ftsCount(match: string): Promise<number> {
  const r = await db
    .prepare("SELECT COUNT(*) AS n FROM cases_fts WHERE cases_fts MATCH ?")
    .bind(match)
    .first<{ n: number }>();
  return r?.n ?? 0;
}

const RICHE: CaseRow = {
  database_id: "qcca",
  case_id: "2005qcca304",
  lang: "fr",
  title: "Association provinciale des retraités d'Hydro-Québec c. Hydro-Québec",
  title_norm: "association provinciale retraites hydro quebec hydro quebec",
  citation: "2005 QCCA 304 (CanLII)",
  neutral_cite: "2005 QCCA 304",
  docket_number: "500-09-014567-041",
  decision_date: "2005-03-31",
  keywords: "régime de retraite — indexation",
  url: "https://canlii.ca/t/abcde",
  concatenated_id: "2005qcca304",
  source: "lookup",
  fetched_at: "2026-07-23T00:00:00.000Z",
};

beforeEach(async () => {
  await db.prepare("DELETE FROM cases").run();
  await db.prepare("DELETE FROM citator_edges").run();
  await db.prepare("DELETE FROM citator_state").run();
  await db.prepare("DELETE FROM search_log").run();
  await db.prepare("DELETE FROM api_usage").run();
  await db.prepare("DELETE FROM databases").run();
});

describe("cases — index FTS5 et invariant d'upsert", () => {
  it("une insertion alimente cases ET cases_fts", async () => {
    await upsertCase(db, RICHE);
    expect(await countCases(db, "qcca")).toBe(1);
    expect(await ftsCount('"hydro"')).toBe(1);
    // remove_diacritics 2 : la forme sans accent trouve la forme accentuée.
    expect(await ftsCount('"retraites"')).toBe(1);
  });

  it("un ré-upsert MET À JOUR l'index au lieu de le dédoubler", async () => {
    await upsertCase(db, RICHE);
    await upsertCase(db, { ...RICHE, title: "Intitulé corrigé après upsert", title_norm: "x" });
    expect(await countCases(db, "qcca")).toBe(1);
    // L'ancien terme a disparu de l'index, le nouveau y est : le déclencheur cases_au
    // a bien joué. Avec INSERT OR REPLACE, l'ancien serait resté — en silence.
    expect(await ftsCount('"hydro"')).toBe(0);
    expect(await ftsCount('"upsert"')).toBe(1);
  });

  it("une suppression retire la ligne de l'index", async () => {
    await upsertCase(db, RICHE);
    await db.prepare("DELETE FROM cases").run();
    expect(await ftsCount('"hydro"')).toBe(0);
  });

  it("un balayage pauvre n'écrase PAS les champs riches d'une fiche déjà résolue", async () => {
    await upsertCase(db, RICHE);
    // Même décision revue par balayage : la liste ne porte que 4 champs.
    const pauvre = rowFromListItem(
      {
        databaseId: "qcca",
        caseId: { fr: "2005qcca304" },
        title: "Association provinciale des retraités d'Hydro-Québec c. Hydro-Québec",
        citation: "2005 QCCA 304 (CanLII)",
      },
      "qcca",
      "fr",
      "sweep",
    );
    await upsertCase(db, pauvre!);

    const row = await getCachedCase(db, "qcca", "2005qcca304");
    expect(row?.docket_number).toBe("500-09-014567-041");
    expect(row?.decision_date).toBe("2005-03-31");
    expect(row?.url).toBe("https://canlii.ca/t/abcde");
    expect(row?.keywords).toContain("retraite");
  });

  it("upsertCases écrit un lot et l'index suit", async () => {
    const rows = Array.from({ length: 250 }, (_, i) => ({
      ...RICHE,
      case_id: `2005qcca${i}`,
      title: `Tremblay c. Gagnon ${i}`,
      neutral_cite: `2005 QCCA ${i}`,
    }));
    expect(await upsertCases(db, rows)).toBe(250);
    expect(await countCases(db, "qcca")).toBe(250);
    expect(await ftsCount('"tremblay"')).toBe(250);
  });
});

describe("cases — recherche locale", () => {
  it("trouve par intitulé sans égard aux accents ni à la casse", async () => {
    await upsertCase(db, RICHE);
    const r = await searchLocal(db, "hydro quebec");
    expect(r).toHaveLength(1);
    expect(r[0]!.case_id).toBe("2005qcca304");
  });

  it("filtre par tribunal", async () => {
    await upsertCase(db, RICHE);
    await upsertCase(db, { ...RICHE, database_id: "qccs", case_id: "2005qccs99" });
    expect(await searchLocal(db, "hydro", { databaseId: "qccs" })).toHaveLength(1);
  });

  it("filtre par fenêtre d'années, y compris sur une fiche SANS date", async () => {
    await upsertCase(db, RICHE); // decision_date 2005-03-31
    // Fiche moissonnée : pas de date, mais une citation neutre de 2019.
    await upsertCase(db, {
      ...RICHE,
      case_id: "2019qcca1",
      decision_date: null,
      neutral_cite: "2019 QCCA 1",
    });
    expect(await searchLocal(db, "hydro", { yearFrom: 2004, yearTo: 2006 })).toHaveLength(1);
    expect(await searchLocal(db, "hydro", { yearFrom: 2018, yearTo: 2020 })).toHaveLength(1);
    expect(await searchLocal(db, "hydro", { yearFrom: 2004, yearTo: 2020 })).toHaveLength(2);
  });

  it("une saisie contenant de la syntaxe FTS5 ne lève pas", async () => {
    await upsertCase(db, RICHE);
    // `OR`, `NEAR`, `*`, `-`, guillemets : autant de façons de casser un MATCH nu.
    for (const saisie of ["Untel c. X-Y", "hydro OR *", 'NEAR("a" "b")', 'guillemet " isolé']) {
      await expect(searchLocal(db, saisie)).resolves.toBeInstanceOf(Array);
    }
  });

  it("ftsQuery cite chaque jeton et écarte les jetons d'une lettre", () => {
    expect(ftsQuery("Hydro-Québec c. Untel")).toBe('"hydro" "quebec" "untel"');
    expect(ftsQuery("!!! ???")).toBeNull();
  });

  it("listCases rend les plus récentes en tête", async () => {
    await upsertCases(db, [
      { ...RICHE, case_id: "a", decision_date: "2001-01-01" },
      { ...RICHE, case_id: "b", decision_date: "2020-01-01" },
    ]);
    const r = await listCases(db, "qcca", 10, 0);
    expect(r.map((x) => x.case_id)).toEqual(["b", "a"]);
  });
});

describe("cases — conversion depuis l'API", () => {
  it("extrait et normalise la citation neutre", () => {
    expect(extractNeutral("2005 QCCA 304 (CanLII)")).toBe("2005 QCCA 304");
    expect(extractNeutral("[1996] 3 R.C.S. 211")).toBeNull();
    expect(extractNeutral(null)).toBeNull();
  });

  it("aplatit le caseId objet des fiches", () => {
    const row = rowFromMetadata(
      {
        databaseId: "csc-scc",
        caseId: { en: "2008scc9" },
        title: "Dunsmuir v. New Brunswick",
        citation: "2008 SCC 9 (CanLII)",
        decisionDate: "2008-03-07",
        docketNumber: "31459",
        concatenatedId: "2008csc-scc9",
      },
      { databaseId: "csc-scc", caseId: "2008scc9" },
      "lookup",
    );
    expect(row.case_id).toBe("2008scc9");
    expect(row.lang).toBe("en");
    expect(row.neutral_cite).toBe("2008 SCC 9");
    expect(row.concatenated_id).toBe("2008csc-scc9");
  });

  it("refuse un élément de liste sans caseId exploitable", () => {
    expect(rowFromListItem({ title: "x" }, "qcca", "fr", "sweep")).toBeNull();
  });
});

describe("citator — « vide » n'est pas « jamais demandé »", () => {
  it("rend null tant que la relation n'a jamais été demandée", async () => {
    expect(await getCachedEdges(db, "qcca", "2005qcca304", "citing")).toBeNull();
  });

  it("rend un tableau VIDE une fois la relation demandée sans résultat", async () => {
    await replaceEdges(db, "qcca", "2005qcca304", "citing", []);
    const c = await getCachedEdges(db, "qcca", "2005qcca304", "citing");
    expect(c).not.toBeNull();
    expect(c!.edges).toEqual([]);
  });

  it("remplace intégralement les arêtes d'une relation", async () => {
    const edge = {
      from_database_id: "qcca",
      from_case_id: "2005qcca304",
      rel: "cited" as const,
      to_database_id: "csc-scc",
      to_case_id: "2008scc9",
      to_legislation_id: null,
      to_title: "Dunsmuir",
      to_citation: "2008 SCC 9",
      fetched_at: "2026-07-23T00:00:00.000Z",
    };
    await replaceEdges(db, "qcca", "2005qcca304", "cited", [edge, { ...edge, to_case_id: "x" }]);
    await replaceEdges(db, "qcca", "2005qcca304", "cited", [edge]);
    const c = await getCachedEdges(db, "qcca", "2005qcca304", "cited");
    expect(c!.edges).toHaveLength(1);
  });

  it("TTL : `citing` périme à 30 jours, `cited` et `legislation` jamais", () => {
    const vieux = "2026-01-01T00:00:00.000Z";
    const now = new Date("2026-07-23T00:00:00.000Z");
    expect(edgeStale("citing", vieux, now)).toBe(true);
    expect(edgeStale("cited", vieux, now)).toBe(false);
    expect(edgeStale("legislation", vieux, now)).toBe(false);
    expect(edgeStale("citing", "2026-07-20T00:00:00.000Z", now)).toBe(false);
  });
});

describe("databases — réconciliation du répertoire (§4.3)", () => {
  it("ne signale rien tant que le répertoire n'a pas été rafraîchi", async () => {
    expect((await directoryMismatches(db)).courts).toEqual([]);
  });

  it("dénonce les hypothèses d'amorçage démenties par CanLII", async () => {
    // Répertoire réel : qcca existe, les bases fédérales composées n'existent pas
    // sous les identifiants supposés.
    await db
      .prepare(
        "INSERT INTO databases (id, kind, jurisdiction, type, name_fr, name_en, name_norm, refreshed_at) VALUES ('qcca','case','qc',NULL,'Cour d''appel',NULL,'cour d appel','2026-07-23T00:00:00Z')",
      )
      .run();
    const { courts } = await directoryMismatches(db);
    const codes = courts.map((c) => c.code);
    expect(codes).toContain("CAF"); // caf-fca absent du répertoire réel
    expect(codes).toContain("CSC"); // csc-scc absent lui aussi, dans ce scénario
    expect(codes).not.toContain("QCCA");
  });

  it("charge le répertoire d'amorçage pour l'analyseur", async () => {
    const dir = await loadDirectory(db);
    expect(dir.courtCodes.get("CSC")?.database_id).toBe("csc-scc");
    expect(dir.courtCodes.get("CSC")?.verified).toBe(1);
    expect(dir.courtCodes.get("QCCA")?.verified).toBe(0);
    expect(dir.parenCodes.get("QC/CQ")?.database_id).toBe("qccq");
  });
});

describe("télémétrie — n'échoue jamais l'outil qu'elle observe (§10)", () => {
  it("consigne une ligne par invocation, verdict compris", async () => {
    await logSearch(db, {
      tool: "canlii_verify_citations",
      query: "2020 QCCA 999999",
      result_count: 0,
      verdict: "INTROUVABLE",
    });
    const r = await db
      .prepare("SELECT tool, verdict, result_count FROM search_log")
      .first<{ tool: string; verdict: string; result_count: number }>();
    expect(r).toMatchObject({
      tool: "canlii_verify_citations",
      verdict: "INTROUVABLE",
      result_count: 0,
    });
  });

  it("tronque une requête démesurée au lieu de refuser", async () => {
    await logSearch(db, { tool: "t", query: "x".repeat(5000), result_count: 1 });
    const r = await db.prepare("SELECT length(query) AS n FROM search_log").first<{ n: number }>();
    expect(r?.n).toBe(400);
  });

  it("api_usage s'accumule sur la journée UTC", async () => {
    const u: CanliiUsage = { calls: 3, errors: 1, throttled: 1 };
    await flushUsage(db, u);
    await flushUsage(db, { calls: 2, errors: 0, throttled: 0 });
    const r = await db
      .prepare("SELECT calls, errors, throttled FROM api_usage WHERE day = ?")
      .bind(utcDay())
      .first<{ calls: number; errors: number; throttled: number }>();
    expect(r).toMatchObject({ calls: 5, errors: 1, throttled: 1 });
  });

  it("n'écrit rien quand aucun appel sortant n'a eu lieu", async () => {
    await flushUsage(db, { calls: 0, errors: 0, throttled: 0 });
    const r = await db.prepare("SELECT COUNT(*) AS n FROM api_usage").first<{ n: number }>();
    expect(r?.n).toBe(0);
  });
});
