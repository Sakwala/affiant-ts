import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

/**
 * The runtime-neutral suites, run inside workerd — the runtime a Cloudflare Worker
 * host would execute this package on (RT-1, A-9). The adapter has no I/O of its own,
 * so every behavioural suite runs here too. `test/node/` is excluded because that
 * suite reads the installed SDK's package.json off disk, which is not a thing a
 * Worker does. `test/*.test.ts` matches one level only, so a new suite under
 * `test/node/` stays out by construction.
 */
export default defineWorkersConfig({
  test: {
    name: "adapter-ai-sdk-workerd",
    include: ["test/*.test.ts"],
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.jsonc" },
      },
    },
  },
});
