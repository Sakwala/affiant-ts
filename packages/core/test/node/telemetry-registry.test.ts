import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { TELEMETRY_KEYS, TELEMETRY_REGISTRY_VERSION } from "../../src/telemetry.js";

/**
 * TL-1, the other direction: `test/telemetry.test.ts` pins the exported key list
 * against a hand-written snapshot on every runtime; this suite checks that the
 * exported list is still the one `telemetry-keys.json` describes, and that the
 * generated module has not drifted from it.
 *
 * Node-only: it reads the registry off disk and spawns the generator. It is
 * excluded from the workerd run by `vitest.workers.config.ts`.
 */
const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const registryPath = join(packageRoot, "telemetry-keys.json");
const generator = join(packageRoot, "scripts", "generate-telemetry-keys.mjs");

interface RegistryEntry {
  readonly key: string;
  readonly since: string;
  readonly description: string;
  readonly attributes: readonly string[];
}

const registry = JSON.parse(readFileSync(registryPath, "utf8")) as {
  readonly registryVersion: string;
  readonly keys: readonly RegistryEntry[];
};

describe("telemetry-keys.json (TL-1)", () => {
  it("exports every key the registry names, with its `since` and description", () => {
    for (const entry of registry.keys) {
      const exported = TELEMETRY_KEYS.find((candidate) => (candidate.key as string) === entry.key);

      expect(exported, `telemetry key ${entry.key} is not exported`).toBeDefined();
      expect(exported?.since).toBe(entry.since);
      expect(exported?.description).toBe(entry.description);
      expect(exported?.attributes).toEqual(entry.attributes);
    }
  });

  it("exports nothing the registry does not name", () => {
    const named = new Set(registry.keys.map((entry) => entry.key));

    for (const exported of TELEMETRY_KEYS) {
      expect(named.has(exported.key as string)).toBe(true);
    }
  });

  it("carries the registry's own version", () => {
    expect(TELEMETRY_REGISTRY_VERSION).toBe(registry.registryVersion);
  });

  it("has a generated module that is in sync with the registry", () => {
    const result = spawnSync(process.execPath, [generator, "--check"], {
      cwd: packageRoot,
      encoding: "utf8",
    });

    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
  });
});
