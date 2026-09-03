import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

/**
 * The fixture and schema suites, run inside workerd — the runtime a Cloudflare
 * Worker host would execute this package on. `protocol-pin.test.ts` is excluded
 * because it reads the tracked files off disk and talks to raw.githubusercontent.com;
 * neither is a thing a Worker does.
 */
export default defineWorkersConfig({
  test: {
    name: "contract-workerd",
    include: ["test/fixtures.test.ts", "test/schema.test.ts", "test/enums.test.ts"],
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.jsonc" },
      },
    },
  },
});
