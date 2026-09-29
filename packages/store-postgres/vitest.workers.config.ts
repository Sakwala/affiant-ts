import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

/**
 * The store contract, run inside workerd — the runtime a Cloudflare Worker host would
 * execute this package on (RT-1, S-13).
 *
 * The connection is a direct TCP one to a Postgres the test opens itself: postgres.js
 * resolves its `workerd` build, which dials through `cloudflare:sockets`. There is no
 * Hyperdrive binding here, and there is no global setup either — a Node-context setup
 * that imported the driver would resolve the wrong build of it.
 */
export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
    }),
  ],
  test: {
    name: "store-postgres-workerd",
    include: ["test/contract.test.ts"],
  },
});
