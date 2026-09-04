import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "conformance-driver",
    include: ["test/**/*.test.ts"],
    environment: "node",
  },
});
