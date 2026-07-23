import type { D1Migration } from "@cloudflare/vitest-pool-workers";

declare global {
  namespace Cloudflare {
    interface Env {
      /**
       * Migrations lues par `vitest.config.ts` et appliquées par
       * `test/apply-migrations.ts`. Binding réservé aux tests : il n'existe
       * évidemment pas en production.
       */
      TEST_MIGRATIONS: D1Migration[];
    }
  }
}
