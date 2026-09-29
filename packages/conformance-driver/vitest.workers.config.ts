import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

/**
 * The conformance run, executed inside workerd — the runtime a Cloudflare Worker
 * host would run `@affiant/core` on (RT-1). The suite has to produce the same
 * failing set on every runtime the implementation claims, so the same file runs
 * here that runs on Node and under Bun.
 *
 * `test/node/` is excluded: those suites read files off disk and write the run
 * document, and neither is a thing a Worker does. `test/*.test.ts` matches one
 * level only, so a new suite under `test/node/` stays out by construction.
 */
export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
    }),
  ],
  test: {
    name: "conformance-driver-workerd",
    include: ["test/*.test.ts"],
  },
});
