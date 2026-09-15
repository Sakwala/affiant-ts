/**
 * The published surface, compiled by somebody who is not in this repository.
 *
 * An in-repo suite sees `src/`, the workspace's path mapping and this package's own
 * `tsconfig`. A consumer sees a tarball, the emitted `.d.ts`, and its own `tsc
 * --strict`. Those are different programs, and a signature that is comfortable in the
 * first can be impossible in the second — an argument type a host cannot satisfy, an
 * export the emitted declaration does not carry, a subpath the `exports` map does not
 * reach. None of that is visible from inside.
 *
 * So this packs the package, installs the tarball into a scratch project alongside its
 * peers, writes the consumer a host would write, and compiles it. A non-zero exit from
 * `tsc` fails the test.
 *
 * Node-only: it packs, installs and spawns, and it never opens a database. Excluded
 * from the workerd run by `vitest.workers.config.ts`, which names one file. It needs the
 * registry for `postgres`, and it asks the registry whether it is there before it packs
 * anything: a silent registry skips the suite, and an install that fails against a
 * registry that answered is a failure, because that is a manifest a consumer cannot
 * resolve.
 */

import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, describe, expect, it } from "vitest";

const packageRoot = fileURLToPath(new URL("../..", import.meta.url));
const workspaceRoot = join(packageRoot, "..", "..");
const coreRoot = join(workspaceRoot, "packages", "core");

/** The `postgres` version this package is pinned to for development, which the consumer installs. */
const pinnedPostgres = (
  JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8")) as {
    readonly devDependencies: { readonly postgres: string };
  }
).devDependencies.postgres;

/** Run a command, returning its output, or `null` with the reason when it failed. */
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

/**
 * Whether the npm registry answers at all.
 *
 * The install below needs the registry, and a machine without one should not report a
 * failure it cannot attribute. But "the install failed" and "the registry is
 * unreachable" are different facts, and conflating them is how a published manifest
 * that cannot be resolved — a dependency at a version nobody has, a name nobody
 * publishes — passes as a skip. So the registry is asked one question of its own
 * first: only a silent registry skips this suite, and an install that fails against a
 * registry that answered is a failure.
 */
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

const scratch = mkdtempSync(join(tmpdir(), "affiant-packed-store-"));
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

const built = existsSync(join(packageRoot, "dist", "index.d.ts"));
// Asked once, before anything is packed: a machine with no registry skips, and
// everything past this point treats a failed install as a defect in what was packed.
const online = registryReachable();

describe.skipIf(!built || !online)("a consumer of the packed tarball", () => {
  it("compiles against the published types with tsc --strict", { timeout: 300_000 }, () => {
    const packs = join(scratch, "packs");
    const project = join(scratch, "project");
    const corePacks = join(scratch, "core-packs");
    for (const directory of [packs, corePacks, project]) {
      mkdirSync(directory, { recursive: true });
    }

    // The workspace's own core is packed too, rather than pulled from the registry:
    // a consumer must compile against the `@affiant/core` this branch builds, not
    // against whatever is published.
    const packedStore = run("pnpm", ["pack", "--pack-destination", packs], packageRoot);
    expect(packedStore, "pnpm pack failed for the store").not.toBeNull();
    const storeTarball = tarballIn(packs);
    expect(storeTarball).not.toBeNull();

    const packedCore = run("pnpm", ["pack", "--pack-destination", corePacks], coreRoot);
    expect(packedCore, "pnpm pack failed for the core").not.toBeNull();
    const coreTarball = tarballIn(corePacks);
    expect(coreTarball).not.toBeNull();

    writeFileSync(
      join(project, "package.json"),
      `${JSON.stringify(
        { name: "affiant-packed-consumer", version: "0.0.0", private: true, type: "module" },
        null,
        2,
      )}\n`,
    );
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
            // With `skipLibCheck` on, a published `.d.ts` that names a type only this
            // repository has — `vitest`'s `Mock`, say — compiles for a consumer who
            // does not have it, and the guard is blind to exactly the defect it exists
            // to catch. So the check is on, and the scratch project is given what a
            // real consumer has: `@types/node`, because postgres.js's own declarations
            // name `node:stream`, `node:tls` and `Buffer` — which is the reason this
            // package's `src/` is type-checked with Node types in scope at all (S-14).
            // `skipDefaultLibCheck` carries the one part of the program nobody here owns.
            skipLibCheck: false,
            skipDefaultLibCheck: true,
            types: ["node"],
          },
          include: ["consumer.ts"],
        },
        null,
        2,
      )}\n`,
    );
    // The consumer a host writes: the connection is its own, the migrations are applied
    // or vendored, the store goes to the gate as both interfaces, and an executor binds
    // it to a transaction the host already has open.
    writeFileSync(
      join(project, "consumer.ts"),
      [
        `import postgres from "postgres";`,
        `import {`,
        `  applyMigrations,`,
        `  createPostgresDocketStore,`,
        `  MIGRATIONS,`,
        `} from "@affiant/store-postgres";`,
        `import type { Migration } from "@affiant/store-postgres/migrations";`,
        `import type { DocketStore, Scope, SessionStore } from "@affiant/core";`,
        ``,
        `declare const connectionString: string;`,
        `declare const scope: Scope;`,
        `declare const invoiceId: string;`,
        ``,
        `export async function wire(): Promise<DocketStore & SessionStore> {`,
        `  const sql = postgres(connectionString, { prepare: false });`,
        `  const applied: { readonly applied: string[] } = await applyMigrations(sql);`,
        `  void applied.applied.length;`,
        ``,
        `  const store = createPostgresDocketStore({ sql });`,
        ``,
        `  await sql.begin(async (tx) => {`,
        `    await tx\`insert into invoices (id) values (\${invoiceId})\`;`,
        `    const bound: DocketStore & SessionStore = store.within(tx);`,
        `    await bound.listApprovedUnexecuted(scope, { limit: 10 });`,
        `  });`,
        ``,
        `  return store;`,
        `}`,
        ``,
        `export const vendored: readonly Migration[] = MIGRATIONS;`,
        `export const digests: readonly string[] = vendored.map((m) => m.sha256);`,
        ``,
      ].join("\n"),
    );

    const installed = run(
      "npm",
      [
        "install",
        "--no-audit",
        "--no-fund",
        "--loglevel",
        "error",
        storeTarball as string,
        coreTarball as string,
        `postgres@${pinnedPostgres}`,
        // What a consumer of postgres.js already has: its declarations name
        // `node:stream`, `node:tls`, `node:events` and `Buffer`, none of which resolve
        // under a full library check without them.
        "@types/node@22",
      ],
      project,
    );
    if (installed === null) {
      // The registry answered `npm ping` a moment ago, so this is not a network that is
      // down — it is a manifest that cannot be resolved, which is exactly what a
      // consumer would hit.
      expect.soft(registryReachable(), "the npm registry stopped answering mid-test").toBe(true);
      throw new Error(
        `installing the packed tarballs and postgres@${pinnedPostgres} into a scratch ` +
          `project failed against a registry that answered \`npm ping\`: the published ` +
          `manifest cannot be resolved by a consumer.`,
      );
    }

    const tsc = join(workspaceRoot, "node_modules", ".bin", "tsc");
    let output = "";
    let failed = false;
    try {
      output = execFileSync(tsc, ["-p", "tsconfig.json"], {
        cwd: project,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      failed = true;
      output = String((error as { stdout?: unknown }).stdout ?? error);
    }

    expect(output, "tsc --strict reported errors against the packed types").toBe("");
    expect(failed).toBe(false);
  });
});
