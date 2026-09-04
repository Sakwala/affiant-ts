import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  PROTOCOL_PIN,
  canonicalVectorSchema,
  canonicalVectors,
  conformanceById,
  conformanceFixtures,
  conformanceManifest,
  coverageExemptions,
  fixtureSchema,
  parityManifestSchema,
  resultsSchema,
} from "../src/conformance.js";
import { schemas, schemasByPath, seedSchemas, seedSchemasByPath } from "../src/schemas.js";
import { enumValues, manifest, v01Fixtures, wireFixtures } from "./fixtures.generated.js";

/**
 * `src/schemas.ts`, `src/conformance.ts` and `test/fixtures.generated.ts` are
 * committed, generated modules: `scripts/generate-sources.mjs` writes them from
 * `protocol/`, and the first two are what a consumer imports as
 * `@affiant/contract/schemas` and `@affiant/contract/conformance`.
 *
 * `protocol-pin.test.ts` checks `protocol/` against the pinned ref. The fixture,
 * schema and enum suites check the generated modules against each other. Without
 * this file the two halves never meet: a `sync-protocol` without a `generate`
 * leaves every suite green while the module a consumer imports describes the
 * previous ref, and a hand-edit to a generated module is invisible.
 *
 * So: every generated export is compared, after parsing, with the vendored JSON it
 * claims to carry. It reads the tracked files off disk, needs no network, and runs
 * on Node and Bun. (It is excluded from the workerd run for the same reason
 * `protocol-pin.test.ts` is: a Worker has no filesystem.)
 */
const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const protocolDir = join(packageRoot, "protocol");

function vendored(relativePath: string): unknown {
  return JSON.parse(readFileSync(join(protocolDir, relativePath), "utf8"));
}

function schemaFilesIn(directory: string): string[] {
  return readdirSync(join(protocolDir, directory))
    .filter((file) => file.endsWith(".schema.json"))
    .sort();
}

const wireSchemaFiles = schemaFilesIn("schemas");
const seedSchemaFiles = schemaFilesIn("schemas/seed");

describe("src/schemas.ts is what protocol/schemas/ says it is", () => {
  it("exports one schema per vendored file, and no extras", () => {
    expect(Object.keys(schemas).sort()).toEqual(
      wireSchemaFiles.map((file) => file.replace(/\.schema\.json$/, "")).sort(),
    );
    expect(Object.keys(schemasByPath).sort()).toEqual(
      wireSchemaFiles.map((file) => `schemas/0.1.0/${file}`).sort(),
    );
  });

  it.each(wireSchemaFiles)("%s", (file) => {
    const name = file.replace(/\.schema\.json$/, "");
    expect(schemas[name as keyof typeof schemas]).toEqual(vendored(join("schemas", file)));
    expect(schemasByPath[`schemas/0.1.0/${file}`]).toEqual(vendored(join("schemas", file)));
  });

  it("keys the schemas by the path the manifest names them by", () => {
    // The manifest's `0.1.0` section cites `schemas/0.1.0/<name>.schema.json`, and
    // the seed section cites `schemas/<name>.schema.json`. A lookup keyed by
    // anything else would need a translation table nobody maintains.
    for (const entry of manifest["0.1.0"].fixtures) {
      expect(schemasByPath[entry.schema], entry.schema).toBeDefined();
    }
  });
});

describe("src/schemas.ts also carries the superseded seed set", () => {
  it("exports one seed schema per vendored file, and no extras", () => {
    expect(Object.keys(seedSchemas).sort()).toEqual(
      seedSchemaFiles.map((file) => file.replace(/\.schema\.json$/, "")).sort(),
    );
    expect(Object.keys(seedSchemasByPath).sort()).toEqual(
      seedSchemaFiles.map((file) => `schemas/${file}`).sort(),
    );
  });

  it.each(seedSchemaFiles)("seed %s", (file) => {
    expect(seedSchemasByPath[`schemas/${file}`]).toEqual(vendored(join("schemas", "seed", file)));
  });
});

describe("src/conformance.ts is what protocol/fixtures/ and protocol/conformance/ say", () => {
  const rows = conformanceManifest.fixtures;

  it("pins the ref the vendored copies came from", () => {
    expect(PROTOCOL_PIN).toBe(readFileSync(join(protocolDir, "PIN"), "utf8").trim());
  });

  it("carries the whole promoted suite: 56 fixtures and 7 byte vectors", () => {
    expect(conformanceFixtures).toHaveLength(56);
    expect(canonicalVectors).toHaveLength(7);
    expect(rows).toHaveLength(63);
  });

  it("carries the manifest section unchanged", () => {
    const whole = vendored(join("fixtures", "MANIFEST.json")) as Record<string, unknown>;
    expect(conformanceManifest).toEqual(whole["conformance"]);
  });

  it.each(rows.map((entry) => [entry.id, entry.file] as const))("%s is fixtures/%s", (id, file) => {
    expect(conformanceById[id]).toEqual(vendored(join("fixtures", file)));
  });

  it("indexes every document by its manifest id, and no others", () => {
    expect(Object.keys(conformanceById).sort()).toEqual(rows.map((entry) => entry.id).sort());
  });

  it.each([
    ["conformance/fixture.schema.json", fixtureSchema],
    ["conformance/canonical-vector.schema.json", canonicalVectorSchema],
    ["conformance/results.schema.json", resultsSchema],
    ["conformance/parity/MANIFEST.schema.json", parityManifestSchema],
    ["conformance/lint/coverage-exemptions.json", coverageExemptions],
  ])("carries %s unchanged", (path, exported) => {
    expect(exported).toEqual(vendored(path));
  });
});

describe("test/fixtures.generated.ts is what protocol/fixtures/ says it is", () => {
  it("carries one seed wire fixture per manifest entry, and no extras", () => {
    expect(Object.keys(wireFixtures).sort()).toEqual(manifest.fixtures.map((f) => f.id).sort());
  });

  it.each(manifest.fixtures.map((entry) => [entry.id, entry.file] as const))(
    "%s is fixtures/%s",
    (id, file) => {
      expect(wireFixtures[id as keyof typeof wireFixtures]).toEqual(
        vendored(join("fixtures", file)),
      );
    },
  );

  it("carries one v0.1 fixture per manifest entry, and no extras", () => {
    expect(Object.keys(v01Fixtures).sort()).toEqual(
      manifest["0.1.0"].fixtures.map((f) => f.id).sort(),
    );
  });

  it.each(manifest["0.1.0"].fixtures.map((entry) => [entry.id, entry.file] as const))(
    "%s is fixtures/%s",
    (id, file) => {
      expect(v01Fixtures[id]).toEqual(vendored(join("fixtures", file)));
    },
  );

  it("carries MANIFEST.json unchanged", () => {
    expect(manifest).toEqual(vendored(join("fixtures", "MANIFEST.json")));
  });

  it("carries enum-values.json unchanged", () => {
    expect(enumValues).toEqual(vendored(join("fixtures", "enum-values.json")));
  });
});
