#!/usr/bin/env node
/**
 * The migrations, compiled into a module.
 *
 * The SQL lives in `migrations/` as files a person can read and a host can vendor
 * into its own sequence. The package ships the same text as data, because reading it
 * back at runtime would mean a filesystem, and the runtimes this package is for do
 * not have one. This script is what keeps the two identical, and it computes each
 * file's SHA-256 so that a host which vendored the SQL can prove in its own CI that
 * the copy it runs is still the copy this version shipped (S-11's checksum).
 *
 * Usage:
 *
 *   node scripts/generate-migrations.mjs            # writes src/migrations.generated.ts
 *   node scripts/generate-migrations.mjs --check    # fails when it is out of date
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = join(packageRoot, "migrations");
const outputPath = join(packageRoot, "src", "migrations.generated.ts");

/** A TypeScript string literal for `value`, with no character a source file cannot carry. */
function json(value) {
  return JSON.stringify(value);
}

const names = readdirSync(migrationsDir)
  .filter((name) => name.endsWith(".sql"))
  .sort();

const migrations = names.map((name) => {
  const sql = readFileSync(join(migrationsDir, name), "utf8");
  return {
    name: name.replace(/\.sql$/, ""),
    sql,
    sha256: createHash("sha256").update(sql, "utf8").digest("hex"),
  };
});

const entries = migrations
  .map(
    (migration) =>
      `  {\n    name: ${json(migration.name)},\n    sha256: ${json(migration.sha256)},\n    sql: ${json(migration.sql)},\n  },`,
  )
  .join("\n");

const module = `// GENERATED FILE — DO NOT EDIT BY HAND.
//
// The SQL under migrations/, compiled into a module so that applying it needs no
// filesystem. To change it: edit the .sql file, then run
// \`pnpm -C packages/store-postgres generate\`.

/** One forward-only migration: its name, its SQL text and the digest of that text. */
export interface Migration {
  /** The file's name without its extension, and the name recorded once it is applied. */
  readonly name: string;
  /** The SHA-256 of {@link Migration.sql}, as lowercase hex. */
  readonly sha256: string;
  /** The SQL, with \`{{schema}}\` still in it. */
  readonly sql: string;
}

/** Every migration this package ships, in the order they are applied. */
export const MIGRATIONS: readonly Migration[] = [
${entries}
];
`;

if (process.argv.includes("--check")) {
  const current = readFileSync(outputPath, "utf8");
  if (current !== module) {
    console.error(
      "src/migrations.generated.ts is out of date with migrations/ — run `pnpm -C packages/store-postgres generate`.",
    );
    process.exit(1);
  }
  console.log(`src/migrations.generated.ts is in sync (${migrations.length} migration(s))`);
} else {
  writeFileSync(outputPath, module);
  console.log(`generated src/migrations.generated.ts (${migrations.length} migration(s))`);
}
