/**
 * Every fenced ```` ```ts ```` block in `README.md`, compiled against the published
 * package.
 *
 * `packed-consumer.test.ts` proves the runtime exports are reachable and that one
 * hand-written consumer compiles under `tsc --strict`. This proves the *documentation*
 * keeps up: each block in `README.md` is written out as its own file, in the same
 * throwaway consumer project that test builds (pack the tarball, install it, `tsc`),
 * and every block must compile on its own. A block that fails here is the README's own
 * fault — the fix is to the prose, never to this test.
 *
 * Node-only and `skipIf(!online)`, for the same reason as its sibling: it packs,
 * installs and spawns, and needs the registry for `@types/node`.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, describe, expect, it } from "vitest";

const packageRoot = fileURLToPath(new URL("../..", import.meta.url));
const workspaceRoot = join(packageRoot, "..", "..");

/** Run a command, returning its output, or `null` with nothing when it failed. */
function run(command: string, args: readonly string[], cwd: string): string | null {
  try {
    return execFileSync(command, [...args], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, AFFIANT_ALLOW_PUBLISH: "1" },
    });
  } catch {
    return null;
  }
}

/** The single `.tgz` in `directory`, or `null`. */
function tarballIn(directory: string): string | null {
  const found = readdirSync(directory).filter((name) => name.endsWith(".tgz"));
  return found.length === 1 && found[0] !== undefined ? join(directory, found[0]) : null;
}

/** Whether the npm registry answers at all. See `packed-consumer.test.ts` for why. */
function registryReachable(): boolean {
  try {
    execFileSync("npm", ["ping", "--loglevel", "error"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 60_000,
    });
    return true;
  } catch {
    return false;
  }
}

/** Every ```` ```ts ```` fenced block in `README.md`, in order, as raw source text. */
function readmeTsBlocks(): string[] {
  const readme = readFileSync(join(packageRoot, "README.md"), "utf8");
  const pattern = /```ts\n([\s\S]*?)```/g;
  const blocks: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(readme)) !== null) {
    const body = match[1];
    if (body !== undefined) blocks.push(body);
  }
  return blocks;
}

const scratch = mkdtempSync(join(tmpdir(), "affiant-readme-blocks-"));
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

const built = existsSync(join(packageRoot, "dist", "index.d.ts"));
const online = registryReachable();

describe.skipIf(!online)("the README's fenced ts blocks", () => {
  it(
    "each compiles under tsc --strict against the packed tarball",
    { timeout: 300_000 },
    () => {
      expect(built, "dist/index.d.ts is missing — build the package before this test").toBe(true);

      const blocks = readmeTsBlocks();
      expect(blocks.length).toBeGreaterThan(0);

      const packs = join(scratch, "packs");
      const project = join(scratch, "project");
      for (const directory of [packs, project]) {
        mkdirSync(directory, { recursive: true });
      }

      const packed = run("pnpm", ["pack", "--pack-destination", packs], packageRoot);
      expect(packed, "pnpm pack failed for the core").not.toBeNull();
      const coreTarball = tarballIn(packs);
      expect(coreTarball).not.toBeNull();

      writeFileSync(
        join(project, "package.json"),
        `${JSON.stringify(
          { name: "affiant-readme-blocks-consumer", version: "0.0.0", private: true, type: "module" },
          null,
          2,
        )}\n`,
      );

      const blockFiles = blocks.map((_, index) => `block-${String(index)}.ts`);
      writeFileSync(
        join(project, "tsconfig.json"),
        `${JSON.stringify(
          {
            compilerOptions: {
              strict: true,
              target: "ES2023",
              lib: ["ES2023", "DOM"],
              module: "NodeNext",
              moduleResolution: "NodeNext",
              noEmit: true,
              skipLibCheck: false,
              skipDefaultLibCheck: true,
              types: ["node"],
            },
            include: blockFiles,
          },
          null,
          2,
        )}\n`,
      );

      for (const [index, body] of blocks.entries()) {
        writeFileSync(join(project, blockFiles[index] as string), body);
      }

      const installed = run(
        "npm",
        ["install", "--no-audit", "--no-fund", "--loglevel", "error", coreTarball as string, "@types/node@22"],
        project,
      );
      if (installed === null) {
        expect.soft(registryReachable(), "the npm registry stopped answering mid-test").toBe(true);
        throw new Error(
          `installing the packed tarball into a scratch project failed against a ` +
            `registry that answered \`npm ping\`: the published manifest cannot be ` +
            `resolved by a consumer.`,
        );
      }

      const tsc = join(workspaceRoot, "node_modules", ".bin", "tsc");
      let output = "";
      let compileFailed = false;
      try {
        output = execFileSync(tsc, ["-p", "tsconfig.json"], {
          cwd: project,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
        });
      } catch (error) {
        compileFailed = true;
        output = String((error as { stdout?: unknown }).stdout ?? error);
      }

      expect(output, "tsc --strict reported errors against a README block").toBe("");
      expect(compileFailed).toBe(false);
    },
  );
});
