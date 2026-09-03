import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

/**
 * No private working vocabulary in anything this repository publishes.
 *
 * `tsc` copies a doc comment into the emitted `.d.ts` and `.js` alike, so a note
 * written for the people building this framework is read by every consumer who hovers
 * a symbol — and a citation of an internal decision record is the worst kind: it
 * looks authoritative, it resolves to nothing a reader can open, and it tells them
 * the documentation was written for somebody else.
 *
 * The rule is enforced by `scripts/lint-no-internal-refs.mjs` at the repository root,
 * wired into `pnpm lint`. A lint is only worth having if it fails on the thing it
 * claims to catch, so this suite runs it both ways: clean over the real published
 * sources, and non-zero over throwaway files that do exactly what the rule forbids.
 *
 * Node-only: it writes to a temporary directory and spawns a process. It is excluded
 * from the workerd run by `vitest.workers.config.ts`.
 */
const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const repoRoot = join(packageRoot, "..", "..");
const script = join(repoRoot, "scripts", "lint-no-internal-refs.mjs");

/** Run the lint over `targets`; no target means the repository's published sources. */
function runLint(...targets: string[]): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [script, ...targets], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

let temporaryDirectory: string | null = null;

/** A throwaway directory holding one file with `contents`. */
function fileContaining(name: string, contents: string): string {
  temporaryDirectory = mkdtempSync(join(tmpdir(), "affiant-vocab-"));
  const path = join(temporaryDirectory, name);
  writeFileSync(path, contents);
  return path;
}

afterEach(() => {
  if (temporaryDirectory !== null) {
    rmSync(temporaryDirectory, { recursive: true, force: true });
    temporaryDirectory = null;
  }
});

describe("the no-internal-references lint", () => {
  it("passes over everything this repository publishes", () => {
    const result = runLint();

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("No internal references: clean");
  });

  it("fails on a citation of an internal decision record", () => {
    const path = fileContaining(
      "options.ts",
      [
        "/** **Required** (ledger BD-31): every filed entry carries a deadline. */",
        "export const defaultTtlMs = 1;",
        "",
      ].join("\n"),
    );

    const result = runLint(path);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("options.ts:1");
    expect(result.stderr).toContain("BD-n");
  });

  it("reports every offending line, and every rule a line trips", () => {
    const path = fileContaining(
      "leaky.ts",
      [
        "// See the Orrery design record.",
        "// Ask Fin about the chancery copy.",
        "// Tracked in the readiness report.",
        "",
      ].join("\n"),
    );

    const result = runLint(path);

    expect(result.status).not.toBe(0);
    // Three lines, four rules: line 2 names both a private agent and a private area.
    expect(result.stderr).toContain("4 violation(s)");
  });

  it.each([
    ["ledger", "// The ledger says so."],
    ["ratification", "// Pending ratification."],
    ["conductor", "// The conductor decides."],
    ["tracker", "// See the tracker."],
    ["Mission Control", "// Raised in Mission Control."],
  ])("fails on %s", (_what, line) => {
    const path = fileContaining("leak.ts", [line, ""].join("\n"));

    const result = runLint(path);

    expect(result.status).not.toBe(0);
  });

  it("passes over prose that cites the public rulebook instead", () => {
    const path = fileContaining(
      "fine.ts",
      [
        "/**",
        " * **Required**: `expiresAt` is not nullable, so every filed entry carries a",
        " * deadline and there is no wiring in which one is missing (GT-4).",
        " */",
        "export const defaultTtlMs = 1;",
        "",
      ].join("\n"),
    );

    const result = runLint(path);

    expect(result.status).toBe(0);
  });
});
