import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * DK-3 — no implementation runs an unbounded periodic sweep of its own. RT-3 — no
 * Docket entry lives in Durable Object storage.
 *
 * Both are rules about what the source may *contain*, not about what a code path
 * does at runtime, so both are checked by reading the source. A timer that is
 * scheduled but never fires, or an import that is never called, is exactly the drift
 * these catch — and it is the drift that matters, because a core that can schedule
 * its own work cannot run on a serverless isolate at all (RT-2), and the .NET sweep
 * this replaces runs every 30 seconds over every pending entry on every instance.
 *
 * Node-only: it reads `src/` off disk and spawns the lint. Excluded from the workerd
 * run by `vitest.workers.config.ts`.
 */
const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const sourceDirectory = join(packageRoot, "src");
const docketDirectory = join(sourceDirectory, "docket");

/** Every `.ts` file at or under `directory`, recursively, sorted. */
function sourceFiles(directory: string): string[] {
  const out: string[] = [];
  for (const child of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, child.name);
    if (child.isDirectory()) out.push(...sourceFiles(path));
    else if (child.isFile() && child.name.endsWith(".ts")) out.push(path);
  }
  return out.sort();
}

/**
 * The file with its comments removed. The rule is about what the code reaches for;
 * the doc comments discuss timers and Durable Objects on purpose.
 */
function code(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const timers: readonly (readonly [RegExp, string])[] = [
  [/\bsetTimeout\s*\(/, "setTimeout"],
  [/\bsetInterval\s*\(/, "setInterval"],
  [/\bsetImmediate\s*\(/, "setImmediate"],
  [/\bqueueMicrotask\s*\(/, "queueMicrotask"],
  [/\bscheduler\s*\./, "the scheduler API"],
];

describe("the core owns no timer (DK-3)", () => {
  const files = sourceFiles(sourceDirectory);

  it("has source to check", () => {
    expect(files.length).toBeGreaterThan(0);
    expect(files.some((file) => file.includes("docket"))).toBe(true);
  });

  it.each(files.map((file) => [relative(sourceDirectory, file), file] as const))(
    "src/%s schedules nothing",
    (_name, file) => {
      const body = code(file);
      for (const [pattern, what] of timers) {
        expect(pattern.test(body), `${relative(sourceDirectory, file)} calls ${what}`).toBe(false);
      }
    },
  );

  it("makes the sweep something the host calls, with an instant and a bound", () => {
    const store = code(join(docketDirectory, "store.ts"));

    expect(store).toMatch(/expireDue\(\s*now: string,\s*scope: Scope,\s*limit: number,?\s*\)/);
  });
});

describe("the Docket is unreachable from Durable Object storage (RT-3)", () => {
  it("passes the lint over the docket sources", () => {
    const result = spawnSync(
      process.execPath,
      [join(packageRoot, "scripts", "lint-no-durable-object.mjs"), docketDirectory],
      { cwd: packageRoot, encoding: "utf8" },
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("RT-3: clean");
  });

  it("names no Durable Object API in the reference store", () => {
    const memory = readFileSync(join(docketDirectory, "memory.ts"), "utf8");

    expect(memory).not.toContain("cloudflare:");
    expect(memory).not.toContain("DurableObject");
  });
});
