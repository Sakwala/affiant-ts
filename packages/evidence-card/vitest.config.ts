import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "evidence-card",
    include: ["test/**/*.test.ts"],
    environment: "happy-dom",
  },
});
