# CLAUDE.md — Jurisprudence canadienne (CanLII)

Connecteur MCP exposant la REST API de CanLII :
`https://jurisprudence.poirierlavoie.ca/mcp/<secret>`. Propriétaire : Jason Poirier Lavoie
(avocat, Québec). **C'est un outil juridique : un résultat faux rendu en silence est le pire
défaut possible — refuser vaut toujours mieux que deviner.**

La spécification qui fait foi est [`SPEC_CANLII_MCP.md`](SPEC_CANLII_MCP.md), versionnée à la
racine. Ses §1 (décisions arrêtées) et §2 (contrat de vérité) se lisent **avant** toute
modification.

## Architecture

Worker TypeScript sans cadriciel, **zéro dépendance d'exécution** (D2), base D1 `canlii`,
transport Streamable HTTP en **mode JSON sans état** (D3). Config : `wrangler.jsonc`.

```
src/index.ts      routage, authentification à temps constant, coupe-circuit, cron
src/mcp/          rpc.ts (JSON-RPC) · validate.ts (JSON-Schema en sous-ensemble)
                  registry.ts (les 10 descripteurs) · handlers/ (un par outil)
src/citation/     analyseur PUR — parse, normalize, compare. AUCUNE E/S.
src/canlii/       client sortant : étranglement, réessais, redactUrl
src/store/        D1 : cases (+FTS) · databases (auto-correction) · citator · telemetry
                  lookup.ts — la boucle d'auto-correction, en UN SEUL exemplaire
src/format/       fr.ts (dates, listes) · render.ts (gabarits annexe A + mises en garde)
src/backfill.ts   §11 — écrit, testé, INERTE
```

## Commandes

```bash
npx wrangler types && npx tsc --noEmit     # toujours avant commit
npx biome check .                          # --write pour corriger
npx vitest run                             # 184 tests, sans réseau ni clef
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
3. **Les mises en garde de §2 vivent dans le CORPS des réponses**, pas seulement dans les
   descriptions d'outils. `test/garde.test.ts` échoue si elles disparaissent. Un test de
   garde qui échoue se **répare en remettant la garantie**, jamais en ajustant le test.
4. **Ne jamais journaliser `request.url`** : le secret partagé est dans le chemin (§9.2).
   Aucune sortie d'outil ne contient d'URL `api.canlii.org` — elles portent la clef d'API.
5. **La boucle d'auto-correction (§6.4) vit dans `src/store/lookup.ts`, en un seul
   exemplaire.** Deux implémentations d'une même heuristique d'apprentissage divergeraient,
   et l'une enseignerait au répertoire ce que l'autre ignore. *(Une duplication a déjà été
   supprimée pour ce motif.)*
6. **`NEUTRAL` porte le drapeau `/i`** — sans lui, « 2020 qcca 495 » (exigé par §13) ne
   s'analyse pas. Le drapeau fait alors capturer « CanLII » comme code de tribunal : deux
   parades cumulatives (masquage des plages CanLII appariées d'abord, puis rejet explicite
   du code `CANLII`). Retirer l'une rouvre le défaut ; les deux sont testées.
7. **Un tribunal absent du répertoire ⇒ INTROUVABLE SANS appel sortant** (§6.4 point 3).
   Un appel voué à l'échec coûte du quota et produirait un « introuvable » qui ferait croire
   à l'absence de la décision.
8. **Une panne réseau n'est PAS une absence.** Un 401, un 429 ou une expiration rendent
   `INDÉTERMINÉE`, jamais `INTROUVABLE` : affirmer une absence qu'on n'a pas constatée est
   exactement ce que §2 interdit. Seul un **404** justifie un rattrapage puis un INTROUVABLE.
9. **Un appariement d'intitulé PARTIEL vaut DISCORDANTE, jamais CONFIRMÉE** (§6.5). Mieux
   vaut un faux signalement qu'une fausse assurance.
10. **Les intitulés anonymisés se comparent par leur NUMÉRO** (« Droit de la famille —
    20495 ») : ils ne contiennent aucun nom de partie, et deux décisions distinctes de la
    même série partagent tous leurs jetons alphabétiques.
11. **Le citateur n'accepte que `en`** dans le chemin (annexe B). D'où l'absence de tout
    paramètre `lang` sur `canlii_citator` : en exposer un serait mensonger.
12. **La télémétrie n'échoue jamais l'outil qu'elle observe** : table absente, écriture
    refusée — tout est avalé.
13. **Les fins de ligne sont LF dans la copie de travail** (`.gitattributes`) : sinon Biome
    local (CRLF sous Windows) et la CI (Linux) divergent en permanence.
14. **§11 est inerte et le reste : la question est TRANCHÉE (2026-07-23) — pas de
    moissonnage de masse.** Deux verrous : `BACKFILL_ENABLED="false"` et aucun cron
    quotidien déclaré. Ce n'est plus une question ouverte mais une décision du
    praticien : ne pas basculer le drapeau, même « pour essayer ». Le remplissage du
    cache par l'usage (D6) n'est pas concerné — c'est autre chose.

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

Code complet, 184 tests verts. **Reste à faire avant de considérer le connecteur livré :**
la réconciliation du répertoire (§4.3) contre l'API vivante — les lignes fédérales
`verified = 0` sont des hypothèses non vérifiées, et la spécification interdit de les livrer
telles quelles.
