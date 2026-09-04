import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      "packages/*/vitest.config.ts",
      "samples/*/vitest.config.ts",
      "spikes/*/vitest.config.ts",
    ],
  },
});
