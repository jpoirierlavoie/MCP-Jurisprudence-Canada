/**
 * TEST DE GARDE DU CONTRAT DE VÉRITÉ (spécification §2, §13).
 *
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║ Ce fichier n'éprouve pas une fonctionnalité : il empêche une DISPARITION.     ║
 * ║                                                                              ║
 * ║ Les mises en garde de §2 sont ce qui distingue un vérificateur de citations   ║
 * ║ honnête d'un outil qui transforme une incertitude connue en fausse assurance. ║
 * ║ Elles vivent dans des gabarits, et un gabarit se refond. Le mode de panne     ║
 * ║ redouté n'est donc pas l'erreur — c'est le SILENCE : une refonte qui rend     ║
 * ║ des sorties impeccables, dont la garantie a discrètement disparu.             ║
 * ║                                                                              ║
 * ║ Si un test d'ici échoue, la bonne réaction n'est PAS de l'ajuster pour qu'il  ║
 * ║ passe : c'est de remettre la mise en garde.                                   ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */
import { beforeEach, describe, expect, it } from "vitest";

import {
  EXPLICATIONS_INTROUVABLE,
  GARDE_CITATEUR,
  GARDE_RECHERCHE,
  GARDE_SORTS_PIED,
  GARDE_SORTS_TETE,
  GARDE_VERIFICATION,
} from "../src/format/render";
import { callTool, listToolDescriptors, TOOLS } from "../src/mcp/registry";
import dunsmuir from "./fixtures/dunsmuir.json";
import qcca2005 from "./fixtures/qcca2005.json";
import { fakeClient, resetDb, seedDatabases, texte, toolCtx } from "./helpers";

beforeEach(async () => {
  await resetDb();
  await seedDatabases();
});

/**
 * Compare en ignorant les blancs.
 *
 * `numeroter()` (annexe A) indente les lignes de continuation d'un bloc numéroté :
 * une mise en garde sur deux lignes s'y retrouve donc indentée. Ce qui doit être
 * verrouillé, c'est sa PRÉSENCE, pas sa colonne — sans quoi le test casserait au
 * premier changement de mise en page, et la tentation serait de l'affaiblir.
 */
function contient(sortie: string, bloc: string): boolean {
  const plat = (s: string) => s.replace(/\s+/g, " ").trim();
  return plat(sortie).includes(plat(bloc));
}

/** Formulations qui affirmeraient plus que l'API n'établit. Aucune n'est permise. */
const FORMULATIONS_INTERDITES = [
  /n'existe pas/i,
  /n'a jamais existé/i,
  /\ba été infirmée\b/i,
  /\ba été confirmée en appel\b/i,
  /\btoujours en vigueur\b/i,
  /\bfait autorité\b/i,
  /\bcitation valide\b/i,
];

describe("§2 — les dix outils existent et se décrivent", () => {
  it("expose exactement dix outils", () => {
    expect(Object.keys(TOOLS)).toHaveLength(10);
  });

  it("chacun porte une description non vide et un schéma fermé", () => {
    for (const [nom, t] of Object.entries(TOOLS)) {
      expect(t.description.length, nom).toBeGreaterThan(80);
      expect(t.inputSchema.additionalProperties, nom).toBe(false);
    }
  });

  it("tous sont annotés en lecture seule et monde ouvert (§7)", () => {
    for (const d of listToolDescriptors()) {
      expect(d.annotations).toMatchObject({ readOnlyHint: true, openWorldHint: true });
    }
  });

  it("les descriptions des outils PORTENT elles-mêmes leurs limites", () => {
    // §7.1 : l'outil pivot doit dire ce qu'il n'établit pas.
    expect(TOOLS.canlii_verify_citations!.description).toContain("n'établit NI son autorité");
    expect(TOOLS.canlii_verify_citations!.description).toContain("dispositif");
    // §7.2 : pas de recherche par mots du texte.
    expect(TOOLS.canlii_find_case!.description).toContain("n'expose pas le texte des décisions");
    // §7.3 : la fiche ne rend pas le texte.
    expect(TOOLS.canlii_get_case!.description).toContain("Ne renvoie PAS le texte");
    // §7.4 : listes brutes, aucun sens de traitement.
    expect(TOOLS.canlii_citator!.description).toContain("aucun sens de traitement");
    // §7.5 : ne remplace pas un citateur professionnel.
    expect(TOOLS.canlii_subsequent_history!.description).toContain(
      "NE REMPLACE PAS un citateur professionnel",
    );
    // §7.9 : renvoi au connecteur « Législation du Québec » pour le texte.
    expect(TOOLS.canlii_get_legislation!.description).toContain("Législation du Québec");
  });

  it("le citateur n'expose AUCUN paramètre lang (l'API n'accepte que « en »)", () => {
    expect(TOOLS.canlii_citator!.inputSchema.properties).not.toHaveProperty("lang");
  });
});

describe("§2 conséquence n° 1 — la mise en garde est dans le CORPS de la réponse", () => {
  it("canlii_verify_citations la porte en pied, même sur un CONFIRMÉE", async () => {
    const client = fakeClient({ "caseBrowse/fr/csc-scc/2008scc9/": dunsmuir });
    const t = texte(
      await callTool(
        "canlii_verify_citations",
        { citations: [{ citation: "2008 CSC 9" }] },
        toolCtx(client),
      ),
    );
    expect(t).toContain("CONFIRMÉE");
    // §2 conséquence n° 3 : dans la MÊME sortie.
    expect(contient(t, GARDE_VERIFICATION)).toBe(true);
  });

  it("canlii_find_case la porte, même quand rien n'est trouvé", async () => {
    const client = fakeClient({});
    const t = texte(
      await callTool(
        "canlii_find_case",
        { title: "Untel c. Unetelle", database_id: "qcca", live: false },
        toolCtx(client),
      ),
    );
    expect(contient(t, GARDE_RECHERCHE)).toBe(true);
  });

  it("canlii_subsequent_history la porte EN TÊTE ET EN PIED", async () => {
    const client = fakeClient({
      "caseBrowse/fr/qcca/2005qcca304/": qcca2005,
      "caseCitator/en/qcca/2005qcca304/citingCases": { citingCases: [] },
    });
    const t = texte(
      await callTool("canlii_subsequent_history", { citation: "2005 QCCA 304" }, toolCtx(client)),
    );
    expect(contient(t, GARDE_SORTS_TETE)).toBe(true);
    expect(contient(t, GARDE_SORTS_PIED)).toBe(true);
    // La tête doit précéder le corps : la réserve se lit AVANT le résultat.
    expect(t.indexOf(GARDE_SORTS_TETE)).toBeLessThan(t.indexOf(GARDE_SORTS_PIED));
  });

  it("canlii_citator la porte", async () => {
    const client = fakeClient({
      "caseBrowse/fr/qcca/2005qcca304/": qcca2005,
      "caseCitator/en/qcca/2005qcca304/citedCases": { citedCases: [] },
    });
    const t = texte(
      await callTool(
        "canlii_citator",
        { citation: "2005 QCCA 304", rel: "cited" },
        toolCtx(client),
      ),
    );
    expect(contient(t, GARDE_CITATEUR)).toBe(true);
  });
});

describe("§2 conséquence n° 2 — un INTROUVABLE n'est jamais une négation d'existence", () => {
  it("énumère les explications concurrentes", async () => {
    const t = texte(
      await callTool(
        "canlii_verify_citations",
        { citations: [{ citation: "2020 QCCA 999999" }] },
        toolCtx(fakeClient({})),
      ),
    );
    expect(t).toContain("INTROUVABLE");
    expect(contient(t, EXPLICATIONS_INTROUVABLE)).toBe(true);
    expect(t).toContain("numéro erroné");
    expect(t).toContain("hors de la collection");
    expect(t).toContain("diffusion récente");
  });

  it("aucune sortie n'emploie une formulation interdite", async () => {
    const client = fakeClient({
      "caseBrowse/fr/csc-scc/2008scc9/": dunsmuir,
      "caseBrowse/fr/qcca/2005qcca304/": qcca2005,
    });
    const sorties = [
      texte(
        await callTool(
          "canlii_verify_citations",
          {
            citations: [
              { citation: "2008 CSC 9" },
              { citation: "2020 QCCA 999999" },
              { citation: "[1985] C.A. 105" },
              { citation: "voir l'arrêt de la Cour d'appel" },
            ],
          },
          toolCtx(client),
        ),
      ),
      texte(
        await callTool("canlii_parse_citation", { citation: "2020 QCCA 495" }, toolCtx(client)),
      ),
      texte(await callTool("canlii_get_case", { citation: "2008 CSC 9" }, toolCtx(client))),
    ];
    for (const s of sorties) {
      for (const interdite of FORMULATIONS_INTERDITES) {
        expect(s, `formulation interdite ${interdite}`).not.toMatch(interdite);
      }
    }
  });
});

describe("§2 conséquence n° 4 — en cas d'écart, les DEUX valeurs brutes", () => {
  it("affiche l'attendu ET l'obtenu, verbatim", async () => {
    const client = fakeClient({ "caseBrowse/fr/qcca/2005qcca304/": qcca2005 });
    const t = texte(
      await callTool(
        "canlii_verify_citations",
        {
          citations: [
            {
              citation: "2005 QCCA 304",
              expected_title: "Syndicat des employés d'Hydro-Québec c. Hydro-Québec",
            },
          ],
        },
        toolCtx(client),
      ),
    );
    expect(t).toContain("Syndicat des employés d'Hydro-Québec c. Hydro-Québec");
    expect(t).toContain("Association provinciale des retraités d'Hydro-Québec c. Hydro-Québec");
  });

  it("affiche l'année attendue ET l'année obtenue", async () => {
    const client = fakeClient({ "caseBrowse/fr/qcca/2005qcca304/": qcca2005 });
    const t = texte(
      await callTool(
        "canlii_verify_citations",
        { citations: [{ citation: "2005 QCCA 304", expected_year: 2004 }] },
        toolCtx(client),
      ),
    );
    expect(t).toContain("DISCORDANTE");
    expect(t).toContain("2004");
    expect(t).toContain("2005");
  });
});

describe("§5.3 — la clef d'API ne quitte jamais le processus", () => {
  it("aucune sortie d'outil ne contient d'URL api.canlii.org", async () => {
    // Le client factice lève des 404 dont l'URL PORTE une clef : si un gestionnaire
    // recopiait le message d'erreur tel quel, la fuite apparaîtrait ici.
    const client = fakeClient({
      "caseBrowse/fr/csc-scc/2008scc9/": dunsmuir,
      "caseBrowse/fr/qcca/2005qcca304/": qcca2005,
    });
    const sorties = [
      texte(
        await callTool(
          "canlii_verify_citations",
          { citations: [{ citation: "2008 CSC 9" }, { citation: "2020 QCCA 999999" }] },
          toolCtx(client),
        ),
      ),
      texte(await callTool("canlii_get_case", { citation: "2020 QCCA 999999" }, toolCtx(client))),
      texte(
        await callTool(
          "canlii_find_case",
          { title: "Hydro-Québec", database_id: "qcca", live: false },
          toolCtx(client),
        ),
      ),
      texte(await callTool("canlii_list_databases", {}, toolCtx(client))),
    ];
    for (const s of sorties) {
      expect(s).not.toContain("api.canlii.org");
      expect(s).not.toContain("api_key");
      expect(s).not.toContain("SECRET");
    }
  });
});

describe("§7 — conventions communes", () => {
  it("une erreur d'exécution est un RÉSULTAT isError, jamais une erreur JSON-RPC", async () => {
    const r = await callTool("canlii_get_case", {}, toolCtx(fakeClient({})));
    expect(r.isError).toBe(true);
    expect(r.content[0]!.type).toBe("text");
  });

  it("un outil inconnu se plaint en français sans lever", async () => {
    const r = await callTool("canlii_inexistant", {}, toolCtx(fakeClient({})));
    expect(r.isError).toBe(true);
    expect(texte(r)).toContain("Outil inconnu");
  });

  it("toutes les sorties sont du TEXTE, jamais du JSON structuré (D4)", async () => {
    const r = await callTool(
      "canlii_parse_citation",
      { citation: "2008 CSC 9" },
      toolCtx(fakeClient({})),
    );
    expect(r).not.toHaveProperty("structuredContent");
    expect(() => JSON.parse(texte(r))).toThrow();
  });
});
