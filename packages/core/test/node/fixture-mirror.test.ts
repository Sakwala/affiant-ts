import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { fixtures } from "../fixtures/fixtures.generated.js";

/**
 * The fixtures on disk, and the module the portable suites read them through.
 *
 * The `.json` files are the record a conformance driver reads; the generated module
 * is how `test/fixtures.test.ts` reads the same data on Bun and inside workerd, where
 * there is no filesystem. A mirror nobody checks is a mirror that drifts, so this
 * suite regenerates it and fails on any difference.
 *
 * Node-only: it reads files and spawns the generator. Excluded from the workerd run by
 * `vitest.workers.config.ts`.
 */
const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const fixtureRoot = join(packageRoot, "test", "fixtures");
const generated = join(fixtureRoot, "fixtures.generated.ts");
const generator = join(packageRoot, "scripts", "generate-fixtures.mjs");

/** The fixture sets, in the order the generator lists them. */
const SETS = ["gate", "decide", "sequence-a", "sequence-c"] as const;

/** Every fixture file, set by set, in the generator's order. */
function fixtureFiles(): { set: string; path: string }[] {
  return SETS.flatMap((set) =>
    readdirSync(join(fixtureRoot, set))
      .filter((name) => name.endsWith(".json"))
      .sort()
      .map((name) => ({ set, path: join(fixtureRoot, set, name) })),
  );
}

describe("the fixtures on disk", () => {
  it("has one JSON file per fixture in the generated module", () => {
    expect(fixtureFiles().length).toBe(fixtures.length);
  });

  it("mirrors every JSON file into the generated module, value for value", () => {
    const onDisk = fixtureFiles().map(({ path }) => JSON.parse(readFileSync(path, "utf8")));

    expect(onDisk).toStrictEqual(fixtures.map((fixture) => ({ ...fixture })));
  });

  it("has a generated module the generator reproduces byte for byte", () => {
    const before = readFileSync(generated, "utf8");

    execFileSync(process.execPath, [generator], { cwd: packageRoot, stdio: "ignore" });
    const after = readFileSync(generated, "utf8");

    if (after !== before) writeFileSync(generated, before);
    expect(after).toBe(before);
  });

  it("names every fixture for a rulebook id and says what it asserts", () => {
    for (const { set, path } of fixtureFiles()) {
      const fixture = JSON.parse(readFileSync(path, "utf8")) as {
        id: string;
        rules: string[];
        title: string;
        given: Record<string, unknown>;
        expect: Record<string, unknown>;
      };

      expect(fixture.id, path).toMatch(new RegExp(`^${set}/`));
      expect(fixture.rules.length, path).toBeGreaterThan(0);
      for (const rule of fixture.rules) {
        expect(rule, path).toMatch(/^(AF|PV|GT|DK|AZ|SR|RT|CV|TL)-\d+$/);
      }
      expect(fixture.title.length, path).toBeGreaterThan(40);
      expect(Object.keys(fixture.given), path).toContain("ctx");
      expect(Object.keys(fixture.given), path).toContain("step");
      expect(Object.keys(fixture.expect).length, path).toBeGreaterThan(0);
    }
  });

  it("refuses a fixture with no rulebook id", () => {
    // The generator is the gate on the record, so its refusals are worth pinning:
    // a fixture nobody can trace to a rule is a fixture nobody can act on.
    const broken = join(fixtureRoot, "gate", "zz-broken.json");
    writeFileSync(broken, JSON.stringify({ id: "gate/broken", rules: [], title: "x" }));
    try {
      expect(() =>
        execFileSync(process.execPath, [generator], { cwd: packageRoot, stdio: "pipe" }),
      ).toThrow();
    } finally {
      execFileSync("rm", ["-f", broken]);
      execFileSync(process.execPath, [generator], { cwd: packageRoot, stdio: "ignore" });
    }
  });
});
