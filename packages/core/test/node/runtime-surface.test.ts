import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * RT-1 — the core uses no Node-only API and no filesystem; Web Crypto only.
 *
 * `test/runtime.test.ts` proves the package *loads* on all three runtimes. This
 * suite proves the stronger thing: that there is nothing Node-shaped in `src/` for
 * a bundler to shim or a `nodejs_compat` flag to paper over. The package's
 * `tsconfig.json` says the same thing at compile time by checking `src/` as a
 * program of its own with `types: []`. Both are cheap and they fail differently:
 * the compiler catches anything it can type, and a future `src/` that reached for
 * a global through `globalThis` — which the compiler would happily allow — is
 * caught here.
 *
 * Node-only: it reads `src/` off disk. Excluded from the workerd run by
 * `vitest.workers.config.ts`.
 */
const sourceDirectory = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "src");

/** Every `.ts` file under `src/`, recursively. */
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
 * the doc comments talk *about* process-globals and filesystems on purpose.
 */
function code(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const forbidden: readonly (readonly [RegExp, string])[] = [
  [/["']node:[a-z_/]+["']/, "an import of a node: builtin"],
  [/\brequire\s*\(/, "a CommonJS require()"],
  [/\bprocess\s*\./, "the process global"],
  [/\bBuffer\b/, "the Buffer global"],
  [/\b__dirname\b|\b__filename\b/, "a CommonJS path global"],
  [/\bfrom\s+["'](fs|path|os|url|crypto|child_process|worker_threads)["']/, "a bare Node builtin"],
];

describe("the published source (RT-1)", () => {
  const files = sourceFiles(sourceDirectory);

  it("has source to check", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files.map((file) => [relative(sourceDirectory, file), file] as const))(
    "src/%s reaches for no Node-only API",
    (_name, file) => {
      const body = code(file);
      for (const [pattern, what] of forbidden) {
        expect(pattern.test(body), `${relative(sourceDirectory, file)} uses ${what}`).toBe(false);
      }
    },
  );
});
