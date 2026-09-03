import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

/**
 * RT-3 — no Affidavit, Docket entry or attestation record lives in Durable Object
 * storage.
 *
 * The rule is enforced by `scripts/lint-no-durable-object.mjs`, wired into this
 * package's `lint` script and into the repository's `pnpm lint`. A lint is only
 * worth having if it fails on the thing it claims to catch, so this suite runs it
 * both ways: clean over the real `src/`, and non-zero over a throwaway file that
 * does exactly what the rule forbids.
 *
 * Node-only: it writes to a temporary directory and spawns a process. It is
 * excluded from the workerd run by `vitest.workers.config.ts`.
 */
const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const script = join(packageRoot, "scripts", "lint-no-durable-object.mjs");

/** Run the lint over `targets`; no target means the package's own `src/`. */
function runLint(...targets: string[]): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [script, ...targets], {
    cwd: packageRoot,
    encoding: "utf8",
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

let temporaryDirectory: string | null = null;

/** A throwaway directory holding one file with `contents`. */
function fileContaining(name: string, contents: string): string {
  temporaryDirectory = mkdtempSync(join(tmpdir(), "affiant-rt3-"));
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

describe("the no-Durable-Object lint (RT-3)", () => {
  it("passes over the package's own source", () => {
    const result = runLint();

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("RT-3: clean");
  });

  it("fails on an import of cloudflare:workers", () => {
    const path = fileContaining(
      "offender.ts",
      [
        'import { DurableObject } from "cloudflare:workers";',
        "",
        "export const x = DurableObject;",
        "",
      ].join("\n"),
    );

    const result = runLint(path);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("cloudflare:workers");
    expect(result.stderr).toContain("offender.ts:1");
  });

  it("fails on a DurableObjectStorage reference", () => {
    const path = fileContaining(
      "store.ts",
      ["export interface Wrong {", "  readonly storage: DurableObjectStorage;", "}", ""].join("\n"),
    );

    const result = runLint(path);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("DurableObjectStorage");
  });

  it("fails on a DurableObjectState reference", () => {
    const path = fileContaining(
      "state.ts",
      ["export function wrong(state: DurableObjectState): void {", "  void state;", "}", ""].join(
        "\n",
      ),
    );

    const result = runLint(path);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("DurableObjectState");
  });

  it("fails on a write through ctx.storage", () => {
    const path = fileContaining(
      "put.ts",
      [
        "export async function wrong(ctx: any) {",
        "  await ctx.storage.put('entry', {});",
        "}",
        "",
      ].join("\n"),
    );

    const result = runLint(path);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("ctx.storage");
  });

  it("reports every offending line, not just the first", () => {
    const path = fileContaining(
      "many.ts",
      [
        'import { DurableObject } from "cloudflare:workers";',
        "export type A = DurableObjectStorage;",
        "export type B = DurableObjectState;",
        "",
      ].join("\n"),
    );

    const result = runLint(path);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("3 violation(s)");
  });

  it("passes over a file that mentions nothing forbidden", () => {
    const path = fileContaining("fine.ts", ["export const entryId = 'entry-1';", ""].join("\n"));

    const result = runLint(path);

    expect(result.status).toBe(0);
  });
});
