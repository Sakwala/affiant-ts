import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "sample-coverage-refusal",
    include: ["test/**/*.test.ts"],
    environment: "node",
  },
});
