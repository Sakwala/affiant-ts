import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "adapter-ai-sdk",
    include: ["test/**/*.test.ts"],
    environment: "node",
  },
});
