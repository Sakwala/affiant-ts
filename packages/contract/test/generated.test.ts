import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { schemas, schemasByPath } from "../src/schemas.js";
import { enumValues, fixtures, manifest } from "./fixtures.generated.js";

/**
 * `src/schemas.ts` and `test/fixtures.generated.ts` are committed, generated
 * modules: `scripts/generate-sources.mjs` writes them from `protocol/`, and
 * `src/schemas.ts` is what a consumer imports as `@affiant/contract/schemas`.
 *
 * `protocol-pin.test.ts` checks `protocol/` against the pinned tag. The fixture,
 * schema and enum suites check the generated modules against each other. Without
 * this file the two halves never meet: a `sync-protocol` without a `generate`
 * leaves every suite green while the module a consumer imports describes the
 * previous tag, and a hand-edit to either generated module is invisible.
 *
 * So: every generated export is compared, byte for byte after parsing, with the
 * vendored JSON it claims to carry. It reads the tracked files off disk, needs no
 * network, and runs on Node and Bun. (It is excluded from the workerd run for the
 * same reason `protocol-pin.test.ts` is: a Worker has no filesystem.)
 */
const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const protocolDir = join(packageRoot, "protocol");

function vendored(relativePath: string): unknown {
  return JSON.parse(readFileSync(join(protocolDir, relativePath), "utf8"));
}

const schemaFiles = readdirSync(join(protocolDir, "schemas"))
  .filter((file) => file.endsWith(".schema.json"))
  .sort();

const schemaNames = schemaFiles.map((file) => file.replace(/\.schema\.json$/, ""));

describe("src/schemas.ts is what protocol/schemas/ says it is", () => {
  it("exports one schema per vendored schema file, and no extras", () => {
    expect(Object.keys(schemas).sort()).toEqual([...schemaNames].sort());
    expect(Object.keys(schemasByPath).sort()).toEqual(
      schemaFiles.map((file) => `schemas/${file}`).sort(),
    );
  });

  it.each(schemaNames)("%s.schema.json", (name) => {
    const path = `schemas/${name}.schema.json`;
    expect(schemas[name as keyof typeof schemas]).toEqual(vendored(path));
    expect(schemasByPath[path]).toEqual(vendored(path));
  });
});

describe("test/fixtures.generated.ts is what protocol/fixtures/ says it is", () => {
  it("carries one fixture per manifest entry, and no extras", () => {
    expect(Object.keys(fixtures).sort()).toEqual(manifest.fixtures.map((f) => f.id).sort());
  });

  it.each(manifest.fixtures.map((entry) => [entry.id, entry.file] as const))(
    "%s is fixtures/%s",
    (id, file) => {
      expect(fixtures[id as keyof typeof fixtures]).toEqual(vendored(join("fixtures", file)));
    },
  );

  it("carries MANIFEST.json unchanged", () => {
    expect(manifest).toEqual(vendored(join("fixtures", "MANIFEST.json")));
  });

  it("carries enum-values.json unchanged", () => {
    expect(enumValues).toEqual(vendored(join("fixtures", "enum-values.json")));
  });
});
