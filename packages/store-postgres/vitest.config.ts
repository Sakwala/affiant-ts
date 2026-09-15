import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "store-postgres",
    include: ["test/**/*.test.ts"],
    environment: "node",
    // Every file builds its own database, so the files are independent — but they
    // all talk to one server, and a budget measurement (test/budget.test.ts) means
    // nothing while other files are competing for the same backend.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
