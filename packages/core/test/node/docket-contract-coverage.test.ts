import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";

import type { ContractCaseSummary } from "../../src/testing-store.js";
import { DOCKET_CONTRACT_CASES, SESSION_CONTRACT_CASES } from "../../src/testing-store.js";

/**
 * Every case of the store contract is registered by some suite.
 *
 * The four Docket suites are thin callers of one parametrised contract, and each
 * asks for a block of it. That has one failure mode, and it is silent: a suite that
 * narrows what it asks for drops assertions from the run and reports nothing at all
 * — a green run that measured less than the run before it.
 *
 * A check written against the constant the suites read cannot catch that, because
 * the narrowing happens at the call site, not in the constant. So this one collects
 * the suites instead: it runs vitest's own collector over the four files and
 * compares the names that come back with the names the contract defines. Nothing
 * between a suite's `sections` argument and a registered test is taken on trust.
 *
 * Node-only: it spawns a process. Excluded from the workerd run by
 * `vitest.workers.config.ts`.
 */
const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** The suites that call the contract, by the filter that selects each one. */
const SUITES = ["docket-store", "docket-sweep", "docket-retention", "docket-rehydration"] as const;

/**
 * Set on the collector's own process.
 *
 * The collector imports every test file in the package, this one included, so the
 * spawn happens in `beforeAll` rather than at module scope — a collector run never
 * executes a hook. The marker makes a future edit that moves it back a loud failure
 * instead of an endless chain of processes.
 */
const MARKER = "AFFIANT_CONTRACT_COLLECTOR";

/** One collected test, as `vitest list --json` reports it. */
interface CollectedTest {
  readonly name: string;
  readonly file: string;
}

/** Every test vitest collects from {@link SUITES}, without running any of them. */
function collect(): CollectedTest[] {
  if (process.env[MARKER] !== undefined) {
    throw new Error(`${MARKER} is already set: the collector is collecting itself`);
  }
  const result = spawnSync(
    process.execPath,
    // `--dir` separates `--json` from the filters: `--json` takes an optional file
    // path, so a filter left next to it is read as that path and the run writes its
    // output to a file named after the filter instead of to stdout.
    [
      join(packageRoot, "node_modules", "vitest", "vitest.mjs"),
      "list",
      "--json",
      "--dir",
      packageRoot,
      ...SUITES,
    ],
    {
      cwd: packageRoot,
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
      env: { ...process.env, [MARKER]: "1" },
    },
  );

  expect(result.error, String(result.error)).toBeUndefined();
  expect(result.status, result.stderr).toBe(0);
  const start = result.stdout.indexOf("[");
  expect(start, result.stdout.slice(0, 400)).toBeGreaterThanOrEqual(0);
  return JSON.parse(result.stdout.slice(start)) as CollectedTest[];
}

/** The name a case is collected under: its block, then the case's own title. */
function collectedName(one: ContractCaseSummary): string {
  return `${one.block} > ${one.title}`;
}

let collected: CollectedTest[] = [];

beforeAll(() => {
  collected = collect();
}, 180_000);

describe("the suites register the whole contract (DK-1, DK-3, DK-4, DK-5, AZ-2)", () => {
  it("collects something at all, so the comparisons below are not vacuous", () => {
    expect(collected.length).toBeGreaterThan(0);
    expect(new Set(collected.map((test) => test.file)).size).toBe(SUITES.length);
  });

  it("registers every case the contract defines, and no case it does not", () => {
    const expected = [...DOCKET_CONTRACT_CASES, ...SESSION_CONTRACT_CASES].map(collectedName);

    // Both directions. A missing name is a case a suite stopped asking for; an extra
    // one is an assertion living outside the contract, where a store built on a
    // database would never run it.
    expect(collected.map((test) => test.name).sort()).toEqual([...expected].sort());
  });

  it("registers each block in exactly one suite", () => {
    const filesByBlock = new Map<string, Set<string>>();
    for (const test of collected) {
      const block = test.name.slice(0, test.name.lastIndexOf(" > "));
      const files = filesByBlock.get(block) ?? new Set<string>();
      files.add(test.file);
      filesByBlock.set(block, files);
    }

    // A block two suites both asked for would run its assertions twice and hide the
    // block that went missing, which is the same defect wearing the other face.
    expect([...filesByBlock].filter(([, files]) => files.size !== 1)).toEqual([]);
    expect(filesByBlock.size).toBe(
      new Set([...DOCKET_CONTRACT_CASES, ...SESSION_CONTRACT_CASES].map((one) => one.block)).size,
    );
  });
});
