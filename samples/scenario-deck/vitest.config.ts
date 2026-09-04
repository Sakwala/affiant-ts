import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "sample-scenario-deck",
    include: ["test/**/*.test.ts"],
    environment: "node",
  },
});
