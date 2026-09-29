import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

/**
 * The runtime-neutral suites, run inside workerd — the runtime a Cloudflare Worker
 * host would execute this package on (RT-1). `test/node/` is excluded because those
 * suites read files off disk and spawn the lint script; neither is a thing a Worker
 * does. `test/*.test.ts` matches one level only, so a new suite under `test/node/`
 * stays out by construction.
 */
export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
    }),
  ],
  test: {
    name: "core-workerd",
    include: ["test/*.test.ts"],
  },
});
