# CLAUDE.md — Jurisprudence canadienne et greffes du Québec

Connecteur MCP exposant la REST API de CanLII, **plus trois outils hors ligne sur les
greffes et palais du Québec** : `https://jurisprudence.poirierlavoie.ca/mcp/<secret>`.
Propriétaire : Jason Poirier Lavoie (avocat, Québec). **C'est un outil juridique : un
résultat faux rendu en silence est le pire défaut possible — refuser vaut toujours mieux
que deviner.**

La spécification qui fait foi est [`SPEC_CANLII_MCP.md`](SPEC_CANLII_MCP.md), versionnée à la
racine. Ses §1 (décisions arrêtées) et §2 (contrat de vérité) se lisent **avant** toute
modification.

## Architecture

Worker TypeScript sans cadriciel, **zéro dépendance d'exécution** (D2), base D1 `canlii`,
transport Streamable HTTP en **mode JSON sans état** (D3). Config : `wrangler.jsonc`.

```
src/index.ts      routage, authentification à temps constant, coupe-circuit, cron
src/mcp/          rpc.ts (JSON-RPC) · validate.ts (JSON-Schema en sous-ensemble)
                  registry.ts (les 13 descripteurs) · handlers/ (un par outil)
src/citation/     analyseur PUR — parse, normalize, compare. AUCUNE E/S.
src/canlii/       client sortant : étranglement, réessais, redactUrl
src/store/        D1 : cases (+FTS) · databases (auto-correction) · citator · telemetry
                  lookup.ts — la boucle d'auto-correction, en UN SEUL exemplaire
src/qc/           §17 — tables du Québec, PURES : palais · greffes · lieux (MJQ) ·
                  juridictions · forums · dossier.ts (parseur) · lookup.ts.
                  Constantes, PAS de D1.
src/format/       fr.ts (dates, listes) · render.ts (gabarits annexe A + mises en garde)
src/backfill.ts   §11 — écrit, testé, INERTE
```

⚠ Deux `lookup.ts` coexistent et ne se ressemblent pas : `src/store/lookup.ts` est la
boucle d'auto-correction (§6.4, avec E/S) ; `src/qc/lookup.ts` est une consultation de
table en mémoire (aucune E/S). Ne pas fusionner.

## Commandes

```bash
npx wrangler types && npx tsc --noEmit     # toujours avant commit
npx biome check .                          # --write pour corriger
npx vitest run                             # 409 tests, sans réseau ni clef
npx wrangler dev                           # exige .dev.vars
npx wrangler deploy --dry-run              # valide paquet + config, sans jeton
npx wrangler d1 migrations apply canlii --local|--remote
node scripts/mcp-client.mjs --local tools/list
node scripts/refresh-databases.mjs --remote --sql   # réconciliation §4.3
```

## Invariants critiques

1. **`INSERT ... ON CONFLICT DO UPDATE`, JAMAIS `INSERT OR REPLACE`** sur `cases`. REPLACE
   change le `rowid` et fait diverger l'index FTS5 en *external content* — **en silence**.
2. **Une fiche est clée sur l'identifiant DEMANDÉ**, pas sur celui que CanLII renvoie.
   L'API rend `caseId` sous la clef de SA langue : demander `2008scc9` renvoie
   `{"fr": "2008csc9"}`. Clée sur la réponse, la fiche est rangée là où personne ne la
   cherche : le cache ne sert jamais et chaque vérification rappelle l'API. *(Défaut réel,
   trouvé par test.)*
3. **`source` distingue une FICHE d'une ligne de balayage, et ne se rétrograde jamais.**
   Un balayage (`browse`, `find`) persiste 4 champs : ni date, ni numéro de dossier, ni
   hyperlien. Deux règles en découlent, et elles se tiennent :
   *(a)* seule une ligne `source = 'lookup'` peut servir de fiche ou de vérification —
   servir une ligne de balayage rendrait un document amputé étiqueté « index local », et
   pire, ferait sauter en silence le contrôle de l'année faute de date ;
   *(b)* l'UPSERT enregistre la MEILLEURE provenance atteinte, jamais la dernière — sinon
   tout balayage recroisant une fiche déjà résolue la disqualifierait du cache et
   rachèterait l'appel. Un suivi quotidien à fenêtres chevauchantes recroise TOUT : le
   cache ne servirait jamais. *(Les deux moitiés sont des défauts réels, trouvés par
   test ; verrouillées dans `test/persist.test.ts` et `test/tools.test.ts`.)*
4. **Les mises en garde de §2 vivent dans le CORPS des réponses**, pas seulement dans les
   descriptions d'outils. `test/garde.test.ts` échoue si elles disparaissent. Un test de
   garde qui échoue se **répare en remettant la garantie**, jamais en ajustant le test.
   Corollaire : **pas de `structuredContent`, pas d'`outputSchema`** — un client qui reçoit
   un objet typé laisse tomber la prose, et la réserve part avec elle SANS qu'aucun test
   n'échoue. Réexaminé le 2026-07-23, maintenu. L'argument contraire est réel (un champ
   `verdict` ne se lit pas de travers ; un consommateur par programme voudrait du typé)
   mais le gain est marginal devant une perte silencieuse. **Si** un consommateur par
   programme existe un jour, la réponse n'est PAS `structuredContent` : c'est un paramètre
   `format: {enum:["texte","json"]}` dont la charge utile porte `avertissement` en champ
   **obligatoire**, de sorte que la réserve voyage à l'intérieur des données. Quatre
   conditions cumulatives, et le texte reste le défaut. Argument complet en commentaire
   au-dessus de `ok()` dans `src/mcp/rpc.ts` — le lire avant d'y toucher.
5. **Ne jamais journaliser `request.url`** : le secret partagé est dans le chemin (§9.2).
   Aucune sortie d'outil ne contient d'URL `api.canlii.org` — elles portent la clef d'API.
6. **La boucle d'auto-correction (§6.4) vit dans `src/store/lookup.ts`, en un seul
   exemplaire.** Deux implémentations d'une même heuristique d'apprentissage divergeraient,
   et l'une enseignerait au répertoire ce que l'autre ignore. *(Une duplication a déjà été
   supprimée pour ce motif.)*
7. **`NEUTRAL` porte le drapeau `/i`** — sans lui, « 2020 qcca 495 » (exigé par §13) ne
   s'analyse pas. Le drapeau fait alors capturer « CanLII » comme code de tribunal : deux
   parades cumulatives (masquage des plages CanLII appariées d'abord, puis rejet explicite
   du code `CANLII`). Retirer l'une rouvre le défaut ; les deux sont testées.
8. **Un tribunal absent du répertoire ⇒ INTROUVABLE SANS appel sortant** (§6.4 point 3).
   Un appel voué à l'échec coûte du quota et produirait un « introuvable » qui ferait croire
   à l'absence de la décision.
9. **Une panne réseau n'est PAS une absence.** Un 401, un 429 ou une expiration rendent
   `INDÉTERMINÉE`, jamais `INTROUVABLE` : affirmer une absence qu'on n'a pas constatée est
   exactement ce que §2 interdit. Seul un **404** justifie un rattrapage puis un INTROUVABLE.
10. **Un appariement d'intitulé PARTIEL vaut DISCORDANTE, jamais CONFIRMÉE** (§6.5). Mieux
    vaut un faux signalement qu'une fausse assurance.
11. **Les intitulés anonymisés se comparent par leur NUMÉRO** (« Droit de la famille —
    20495 ») : ils ne contiennent aucun nom de partie, et deux décisions distinctes de la
    même série partagent tous leurs jetons alphabétiques.
12. **Le citateur n'accepte que `en`** dans le chemin (annexe B). D'où l'absence de tout
    paramètre `lang` sur `canlii_citator` : en exposer un serait mensonger.
13. **La télémétrie n'échoue jamais l'outil qu'elle observe** : table absente, écriture
    refusée — tout est avalé.
14. **Les fins de ligne sont LF dans la copie de travail** (`.gitattributes`) : sinon Biome
    local (CRLF sous Windows) et la CI (Linux) divergent en permanence.
15. **§11 est inerte et le reste : la question est TRANCHÉE (2026-07-23) — pas de
    moissonnage de masse.** Deux verrous : `BACKFILL_ENABLED="false"` et aucun cron
    quotidien déclaré. Ce n'est plus une question ouverte mais une décision du
    praticien : ne pas basculer le drapeau, même « pour essayer ». Le remplissage du
    cache par l'usage (D6) n'est pas concerné — c'est autre chose.
16. **Le PRÉFIXE d'un outil annonce sa SOURCE, et c'est vérifié (§17).** `canlii_*` (10)
    signifie « la réponse vient de la collection de CanLII » ; `greffe_*` et `palais_*` (3)
    lisent un relevé LOCAL du ministère de la Justice du Québec, sans aucun appel. Servir
    une adresse de palais sous `canlii_` attribuerait à CanLII une donnée dont il n'est pas
    la source — l'inverse exact de ce que D8 protège. `test/rpc.test.ts` épingle la
    scission ; ajouter un outil oblige à choisir sa famille délibérément.
17. **Les tables de `src/qc/` sont un RELEVÉ DATÉ, pas une vérité.** Leur mode de panne
    n'est pas l'absence mais la **péremption** : une adresse juste hier, fausse aujourd'hui,
    rendue avec le même aplomb. D'où `GARDE_PALAIS`, qui porte la date **dans le corps** de
    chaque réponse. Et trois pièges à ne PAS « corriger » : `point_de_service` (greffe
    itinérant) ≠ `location_type` (point de service du MJQ) ≠ `lieux.itinerant` (le LIEU) —
    les **trois** divergent par construction ; le nom d'un palais n'est pas sa ville
    (Chicoutimi est à Saguenay) ; une adresse absente est **inconnue**, jamais inexistante —
    le pendant exact de la règle INTROUVABLE. On sort de cette liste par une SOURCE :
    `lieux.ts` en a sorti le greffe 635, jamais en assouplissant la formulation.
19. **`lieux.ts` est le relevé OFFICIEL du MJQ (2026-07-22), et il fait autorité sur le
    rattachement.** Un greffe dessert souvent PLUSIEURS lieux, ce que `palais_key` (1:1) ne
    sait pas dire. La réconciliation du 2026-07-30 en a tiré deux corrections réelles :
    le greffe **625 (Senneterre)** manquait — « 625-… » rendait « greffe inconnu » sur un
    greffe qui existe — et **Kuujjuaq** relève du greffe **635**, ce qu'Athéna refusait de
    deviner. `adresseDuGreffe` essaie `palais_key` PUIS le siège fixe du MJQ : les
    gestionnaires doivent passer par elle, jamais lire `palais_key` en direct, sous peine
    de faire diverger deux outils sur le même greffe.
18. **Le parseur de dossiers est un PORT, éprouvé par différentiel.** `src/qc/dossier.ts`
    reproduit `parse_court_file_number` d'Athéna, et `test/fixtures/dossier-athena.json`
    rejoue 127 entrées des deux côtés. Il n'y a **ni somme de contrôle ni règle d'année** :
    ne pas en inventer. Un préfixe alphabétique inconnu reste prudent et n'est **jamais**
    une erreur. Une divergence du différentiel se répare dans le code, pas dans la fixture.

## Procédure sûre

Coder → `wrangler types` → `tsc --noEmit` → `biome check` → `vitest run` →
`wrangler deploy --dry-run` → déployer. **Les migrations D1 passent AVANT le déploiement**
(`deploy.yml`) : l'ordre inverse met en ligne du code qui lit des colonnes inexistantes.

## Secrets

- `CANLII_API_KEY` et `MCP_SHARED_SECRET` : posés par `wrangler secret put`, saisis par
  Jason lui-même. **Ne jamais les afficher, les lire en contexte, ni les écrire dans un
  fichier versionné.**
- `.dev.vars` (dev), `mcp.url` (URL de prod avec secret), `*.token` : **gitignorés**.
- Commits signés, footer `Co-Authored-By:` adapté au modèle courant. Un commit par
  sous-tâche.

## État

**Livré et en production** (2026-07-23) sur `jurisprudence.poirierlavoie.ca`, 210 tests
verts. La réconciliation du répertoire (§4.3) est **faite** contre l'API vivante : elle a
démenti cinq hypothèses d'amorçage, consignées avec leur preuve d'observation dans
`migrations/0003_reconcile_court_codes.sql` (`caf-fca`/`cf-fc` inexistants — les vraies
bases sont `fca` et `fct` ; fragment français `cci` et non `tcc` ; le TAL a gardé le
`databaseId` de la Régie du logement, `qcrdl`). Les tests de `test/persist.test.ts`
verrouillent ces six correspondances : ils empêchent une réapplication de 0002 seule de
ressusciter les hypothèses fausses sur une base neuve.

Les lignes encore `verified = 0` ne sont pas un reliquat : elles sont **inertes par
construction** (invariant 8 — un tribunal absent du répertoire rend INTROUVABLE sans
appel sortant), et se confirmeront à l'usage par la boucle de §6.4.
