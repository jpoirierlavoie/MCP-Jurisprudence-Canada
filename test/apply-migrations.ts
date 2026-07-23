import { applyD1Migrations, env } from "cloudflare:test";

/**
 * Applique `migrations/` à la base D1 de test avant chaque fichier de test.
 *
 * Les migrations RÉELLES, pas un schéma de test parallèle : un schéma dupliqué
 * finirait par diverger de la production, et l'index FTS5 en « external content »
 * est précisément le genre de construction dont la divergence est silencieuse.
 */
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
