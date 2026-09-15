import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

/**
 * The store contract, run inside workerd — the runtime a Cloudflare Worker host would
 * execute this package on (RT-1, S-13).
 *
 * The connection is a direct TCP one to a Postgres the test opens itself: postgres.js
 * resolves its `workerd` build, which dials through `cloudflare:sockets`. There is no
 * Hyperdrive binding here, and there is no global setup either — a Node-context setup
 * that imported the driver would resolve the wrong build of it.
 */
export default defineWorkersConfig({
  test: {
    name: "store-postgres-workerd",
    include: ["test/contract.test.ts"],
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.jsonc" },
      },
    },
  },
});
