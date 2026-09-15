import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { Ajv2020 } from "ajv/dist/2020.js";
import type { AnySchemaObject } from "ajv/dist/2020.js";
import ajvFormats from "ajv-formats";
import { describe, expect, it } from "vitest";

import { parityManifestSchema, resultsSchema } from "@affiant/contract/conformance";

import { ADAPTER_PACKAGE_VERSION, AI_SDK_VERSION } from "../../src/adapters/version.js";
import { parityManifest } from "../../src/parity.js";
import { IMPLEMENTATION_VERSION } from "../../src/run.js";

/**
 * The two documents this package publishes about `@affiant/core`, checked against
 * the rulebook's own schemas and against the files that carry them.
 *
 * The manifest is the **claim** and the run document is the **evidence**, and both
 * are read by somebody deciding whether to adopt the framework. A claim in a shape
 * nobody agreed to is not a claim, and a claim that has drifted from the module
 * that generates it is worse than none: it looks authoritative and it is stale.
 *
 * Node-only: it reads files off disk. Excluded from the workerd run by
 * `vitest.workers.config.ts`, and from Bun's by nothing — Bun reads files fine.
 */
const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

type AddFormats = (ajv: Ajv2020) => Ajv2020;
const imported = ajvFormats as unknown as AddFormats | { default: AddFormats };
const addFormats: AddFormats = typeof imported === "function" ? imported : imported.default;

function validatorFor(schema: unknown): (document: unknown) => string[] {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  ajv.addSchema(schema as AnySchemaObject);
  const id = (schema as { $id: string }).$id;
  const validate = ajv.getSchema(id);
  if (validate === undefined) throw new Error(`${id} was not registered`);
  return (document: unknown) => {
    if (validate(document)) return [];
    return (validate.errors ?? []).map(
      (error) => `${error.instancePath === "" ? "/" : error.instancePath} ${error.message ?? ""}`,
    );
  };
}

const manifestFile = join(packageRoot, "conformance", "parity", "typescript-v0.2.json");

describe("conformance/parity/typescript-v0.2.json", () => {
  it("is exactly what src/parity.ts produces", () => {
    // The module is the source and the file is the artifact. Without this the file
    // could be regenerated and not committed, or edited and not regenerated, and
    // either way the published claim and the assertion CI runs would disagree.
    expect(JSON.parse(readFileSync(manifestFile, "utf8"))).toEqual(
      JSON.parse(JSON.stringify(parityManifest)),
    );
  });

  it("is what the rulebook's parity-manifest schema describes", () => {
    expect(validatorFor(parityManifestSchema)(parityManifest)).toEqual([]);
  });

  it("points its runLog at a run document that exists", () => {
    expect(parityManifest.runLog).toBeDefined();
    const repoRoot = join(packageRoot, "..", "..");
    const log = JSON.parse(readFileSync(join(repoRoot, parityManifest.runLog ?? ""), "utf8"));

    // The manifest is the claim; the log is the evidence. A claim whose evidence
    // cannot be read is a claim a reader has to take on trust.
    expect(validatorFor(resultsSchema)(log)).toEqual([]);
    expect((log as { protocolTag: string }).protocolTag).toBe(parityManifest.protocolTag);
  });
});

describe("the versions this driver states about the adapter it ships", () => {
  it("are the adapter package's own and the `ai` version its suites resolved (CV-5)", () => {
    // Both are literals in src/adapters/version.ts, because the module that reads the
    // manifest runs inside workerd and has no filesystem. This is the check that stops
    // either drifting from what the suites actually ran against: a parity manifest
    // naming a version nobody used is a claim nobody can reproduce.
    const adapter = JSON.parse(
      readFileSync(join(packageRoot, "..", "adapter-ai-sdk", "package.json"), "utf8"),
    ) as { version: string; devDependencies: Record<string, string> };

    expect(ADAPTER_PACKAGE_VERSION).toBe(adapter.version);
    expect(AI_SDK_VERSION).toBe(adapter.devDependencies["ai"]);

    const declared = parityManifest.adapters?.[0];
    expect(declared?.package).toBe("@affiant/adapter-ai-sdk");
    expect(declared?.version).toBe(adapter.version);
    expect(declared?.runtimeVersion).toBe(adapter.devDependencies["ai"]);
  });

  it("name the adapter block the package declares for the rulebook's claims lint", () => {
    // The lint reads this block; a manifest row naming a runtime the package does not
    // declare would be a claim about a package nobody linted.
    const adapter = JSON.parse(
      readFileSync(join(packageRoot, "..", "adapter-ai-sdk", "package.json"), "utf8"),
    ) as { affiant: { adapter: { runtime: string; surfaces: string[]; durabilityClaims: [] } } };

    expect(adapter.affiant.adapter.runtime).toBe(parityManifest.adapters?.[0]?.runtime);
    expect(adapter.affiant.adapter.surfaces.length).toBeGreaterThan(0);
    expect(adapter.affiant.adapter.durabilityClaims).toEqual([]);
  });
});

describe("the version this driver reports as the implementation under test", () => {
  it("is @affiant/core's own", () => {
    // Pinned as a literal in `src/run.ts` because that module runs inside workerd,
    // which has no filesystem. This is the check that stops the literal drifting.
    const manifest = JSON.parse(
      readFileSync(join(packageRoot, "..", "core", "package.json"), "utf8"),
    ) as { version: string };

    expect(IMPLEMENTATION_VERSION).toBe(manifest.version);
    expect(parityManifest.version).toBe(manifest.version);
  });
});
