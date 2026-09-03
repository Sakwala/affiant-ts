import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { gateFixtures } from "../fixtures/gate.generated.js";

/**
 * The gate fixtures on disk, and the module the portable suites read them through.
 *
 * The `.json` files are the record a conformance driver reads; the generated module is
 * how `test/gate-fixtures.test.ts` reads the same data on Bun and inside workerd, where
 * there is no filesystem. A mirror nobody checks is a mirror that drifts, so this suite
 * regenerates it and fails on any difference.
 *
 * Node-only: it reads files and spawns the generator. Excluded from the workerd run by
 * `vitest.workers.config.ts`.
 */
const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const fixtureDir = join(packageRoot, "test", "fixtures", "gate");
const generated = join(packageRoot, "test", "fixtures", "gate.generated.ts");
const generator = join(packageRoot, "scripts", "generate-gate-fixtures.mjs");

function fixtureFiles(): string[] {
  return readdirSync(fixtureDir)
    .filter((name) => name.endsWith(".json"))
    .sort();
}

describe("the gate fixtures on disk", () => {
  it("has one JSON file per fixture in the generated module", () => {
    expect(fixtureFiles().length).toBe(gateFixtures.length);
  });

  it("mirrors every JSON file into the generated module, value for value", () => {
    const onDisk = fixtureFiles().map(
      (file) => JSON.parse(readFileSync(join(fixtureDir, file), "utf8")) as unknown,
    );

    expect(onDisk).toStrictEqual(gateFixtures.map((fixture) => ({ ...fixture })));
  });

  it("has a generated module the generator reproduces byte for byte", () => {
    const before = readFileSync(generated, "utf8");

    execFileSync(process.execPath, [generator], { cwd: packageRoot, stdio: "ignore" });
    const after = readFileSync(generated, "utf8");

    if (after !== before) writeFileSync(generated, before);
    expect(after).toBe(before);
  });

  it("names every fixture for a rule and says what it is for", () => {
    for (const file of fixtureFiles()) {
      const fixture = JSON.parse(readFileSync(join(fixtureDir, file), "utf8")) as {
        id: string;
        rules: string[];
        note: string;
        given: Record<string, unknown>;
        expect: Record<string, unknown>;
      };

      expect(fixture.id, file).toMatch(/^gate\//);
      expect(fixture.rules.length, file).toBeGreaterThan(0);
      expect(fixture.note.length, file).toBeGreaterThan(20);
      expect(Object.keys(fixture.given), file).toContain("ctx");
      expect(Object.keys(fixture.expect), file).toContain("entry");
    }
  });
});
