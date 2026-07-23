import type { D1Migration } from "@cloudflare/vitest-pool-workers";

declare module "cloudflare:test" {
  interface ProvidedEnv extends Env {
    /** Injecté par `vitest.config.ts` — voir `test/apply-migrations.ts`. */
    TEST_MIGRATIONS: D1Migration[];
  }
}
