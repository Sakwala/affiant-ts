import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "spike-claude-code-hook",
    include: ["test/**/*.test.ts"],
    environment: "node",
    // hook.test.ts spawns the built bin and waits on a real HTTP round trip.
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
