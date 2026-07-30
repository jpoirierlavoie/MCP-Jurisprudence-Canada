/**
 * Les trois outils du Québec (§17), au travers de `callTool`.
 *
 * Chaque test vérifie AUSSI qu'aucun appel sortant n'a lieu : c'est la propriété qui
 * les distingue des dix outils CanLII, et celle qui se perdrait le plus discrètement
 * si quelqu'un ajoutait une « vérification » bien intentionnée.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { callTool } from "../src/mcp/registry";
import { fakeClient, resetDb, texte, toolCtx } from "./helpers";

beforeEach(async () => {
  await resetDb();
});

describe("§17.2 — greffe_parse_court_file_number", () => {
  it("résout greffe, juridiction ET adresse, sans aucun appel", async () => {
    const client = fakeClient({});
    const r = await callTool(
      "greffe_parse_court_file_number",
      { court_file_number: "500-05-123456-241" },
      toolCtx(client),
    );
    const out = texte(r);
    expect(client.chemins).toHaveLength(0);
    expect(out).toContain("Greffe 500");
    expect(out).toContain("district judiciaire de Montréal");
    expect(out).toContain("Cour supérieure");
    expect(out).toContain("Division générale");
    expect(out).toContain("greffe civil");
    expect(out).toContain("1, rue Notre-Dame Est");
    // La réserve du contrat de vérité, dans le CORPS.
    expect(out).toContain("n'établit pas que ce dossier existe");
  });

  it("un préfixe TAL résout son tribunal et n'est PAS une erreur", async () => {
    const client = fakeClient({});
    const r = await callTool(
      "greffe_parse_court_file_number",
      { court_file_number: "TAL-594531" },
      toolCtx(client),
    );
    expect(r.isError).toBe(false);
    expect(client.chemins).toHaveLength(0);
    expect(texte(r)).toContain("Tribunal administratif du logement");
  });

  it("une cour fédérale est annoncée comme telle, non comme administrative", async () => {
    const out = texte(
      await callTool(
        "greffe_parse_court_file_number",
        { court_file_number: "C.F.-T-1234-26" },
        toolCtx(fakeClient({})),
      ),
    );
    expect(out).toContain("Cour fédérale");
    expect(out).toContain("Cours et tribunaux fédéraux");
    expect(out).toContain("n'est PAS un tribunal administratif");
  });

  it("un préfixe inconnu ne devine AUCUN nom de tribunal", async () => {
    const out = texte(
      await callTool(
        "greffe_parse_court_file_number",
        { court_file_number: "XYZ-9999" },
        toolCtx(fakeClient({})),
      ),
    );
    expect(out).toContain("NON répertorié");
    expect(out).toContain("ne devine PAS");
  });

  it("un greffe itinérant : pas d'adresse, et l'inconnu n'est pas une inexistence", async () => {
    const out = texte(
      await callTool(
        "greffe_parse_court_file_number",
        { court_file_number: "614-05-000001-200" },
        toolCtx(fakeClient({})),
      ),
    );
    expect(out).toContain("Chisasibi");
    expect(out).toContain("Aucune adresse publiée");
    expect(out).toContain("n'établit PAS qu'il n'en existe aucune");
    expect(out).toContain("Mistissini"); // localités desservies
  });

  it("un code inconnu est NOMMÉ, pas deviné", async () => {
    const out = texte(
      await callTool(
        "greffe_parse_court_file_number",
        { court_file_number: "999-05-000001" },
        toolCtx(fakeClient({})),
      ),
    );
    expect(out).toContain("999");
    expect(out).toContain("INCONNU");
  });

  it("refuse une entrée vide par le schéma", async () => {
    const r = await callTool(
      "greffe_parse_court_file_number",
      { court_file_number: "" },
      toolCtx(fakeClient({})),
    );
    expect(r.isError).toBe(true);
  });
});

describe("§17.3 — palais_list", () => {
  it("rend les 51 lieux, sans appel, avec la réserve de péremption", async () => {
    const client = fakeClient({});
    const out = texte(await callTool("palais_list", {}, toolCtx(client)));
    expect(client.chemins).toHaveLength(0);
    expect(out).toContain("51 lieux");
    expect(out).toContain("2026-07-15");
    expect(out).toContain("VÉRIFIER");
  });

  it("filtre par district", async () => {
    const out = texte(
      await callTool("palais_list", { district: "Montréal" }, toolCtx(fakeClient({}))),
    );
    expect(out).toContain("Montréal");
    expect(out).toContain("Greffe 500");
    expect(out).not.toContain("Sherbrooke");
  });

  it("filtre par type et compte les points de service du MJQ", async () => {
    const out = texte(
      await callTool("palais_list", { type: "point_de_service" }, toolCtx(fakeClient({}))),
    );
    expect(out).toContain("8 lieux");
    expect(out).toContain("point de service de justice");
  });

  it("une liste vide n'est PAS un constat d'absence", async () => {
    const r = await callTool("palais_list", { district: "Vaudreuil" }, toolCtx(fakeClient({})));
    const out = texte(r);
    expect(out).toContain("ne vaut pas constat d'absence");
    // La reprise doit être possible : on rend les districts connus.
    expect(out).toContain("Terrebonne");
  });

  it("trouve un palais par sa VILLE, qui n'est pas son nom", async () => {
    const out = texte(
      await callTool("palais_list", { query: "Saguenay" }, toolCtx(fakeClient({}))),
    );
    expect(out).toContain("Chicoutimi");
    expect(out).toContain("Saguenay");
  });
});

describe("§17.4 — palais_get", () => {
  it("par numéro de greffe : adresse, district, réserve", async () => {
    const client = fakeClient({});
    const out = texte(await callTool("palais_get", { greffe_number: "500" }, toolCtx(client)));
    expect(client.chemins).toHaveLength(0);
    expect(out).toContain("Greffe 500");
    expect(out).toContain("1, rue Notre-Dame Est");
    expect(out).toContain("Montréal (Québec) H2Y 1B6");
    expect(out).toContain("2026-07-15");
  });

  it("par nom de palais : les greffes qui y siègent", async () => {
    const out = texte(
      await callTool("palais_get", { palais: "Montréal" }, toolCtx(fakeClient({}))),
    );
    expect(out).toContain("Palais de justice de Montréal");
    expect(out).toContain("Greffes qui y siègent");
    expect(out).toContain("500");
  });

  it("annonce l'ABSENCE de coordonnées plutôt que de la laisser découvrir", async () => {
    const out = texte(
      await callTool("palais_get", { greffe_number: "500" }, toolCtx(fakeClient({}))),
    );
    expect(out).toContain("n'en porte AUCUNE");
    expect(out).toContain("ministère de la Justice");
  });

  it("rend l'adresse postale distincte quand il y en a une", async () => {
    const out = texte(
      await callTool("palais_get", { greffe_number: "110" }, toolCtx(fakeClient({}))),
    );
    expect(out).toContain("Adresse postale : Case postale 188");
  });

  it("greffe itinérant : localités desservies, et l'inconnu reste inconnu", async () => {
    const out = texte(
      await callTool("palais_get", { greffe_number: "652" }, toolCtx(fakeClient({}))),
    );
    expect(out).toContain("ITINÉRANTE");
    expect(out).toContain("Fermont");
    expect(out).toContain("n'établit PAS qu'il n'en existe aucune");
  });

  it("Kuujjuaq : palais publié qu'aucun greffe ne nomme, et on le DIT", async () => {
    const out = texte(
      await callTool("palais_get", { palais: "Kuujjuaq" }, toolCtx(fakeClient({}))),
    );
    expect(out).toContain("Kuujjuaq");
    expect(out).toContain("Aucun numéro de greffe");
    expect(out).toContain("vaudrait moins que son absence");
  });

  it("un greffe absent de la table n'est pas déclaré inexistant", async () => {
    // La formulation évite jusqu'à la tournure NÉGÉE (« n'établit pas qu'il n'existe
    // pas ») : FORMULATIONS_INTERDITES est une barrière absolue, et une barrière avec
    // des exceptions se contourne. On énumère les explications concurrentes, comme le
    // fait EXPLICATIONS_INTROUVABLE pour les décisions.
    const out = texte(
      await callTool("palais_get", { greffe_number: "999" }, toolCtx(fakeClient({}))),
    );
    expect(out).toContain("NON un registre exhaustif");
    expect(out).toContain("peut désigner un greffe réel");
    expect(out).toContain("Explications possibles");
  });

  it("exige EXACTEMENT une des deux formes", async () => {
    const deux = await callTool(
      "palais_get",
      { greffe_number: "500", palais: "Montréal" },
      toolCtx(fakeClient({})),
    );
    expect(deux.isError).toBe(true);
    expect(texte(deux)).toContain("EXACTEMENT");
    expect((await callTool("palais_get", {}, toolCtx(fakeClient({})))).isError).toBe(true);
  });
});
