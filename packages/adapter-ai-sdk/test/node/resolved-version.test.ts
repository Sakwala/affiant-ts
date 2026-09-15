/**
 * The version of the AI SDK this package was built and tested against, measured
 * rather than asserted from a range.
 *
 * **Rule served: CV-5** — no durability claim rests on a non-`latest` dist-tag of a
 * third-party runtime, with the provider pinned at build time. "Pinned at build time"
 * is only a fact if something reads the pin; this reads it, puts the resolved version
 * in the name of the test, and fails when the installed version is not one the
 * declared peer range admits.
 *
 * Node-only: it reads the installed package's manifest off disk, which is not a thing
 * a Worker does. `vitest.workers.config.ts` matches `test/*.test.ts` only, so this
 * file stays out of the workerd run by construction.
 */

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

import { describe, expect, it } from "vitest";

const require_ = createRequire(import.meta.url);

/** The manifest of the `ai` package this workspace actually resolved. */
const installed = JSON.parse(readFileSync(require_.resolve("ai/package.json"), "utf8")) as {
  readonly version: string;
};

/** This package's own manifest: the peer range and the dev pin. */
const own = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as {
  readonly peerDependencies: { readonly ai: string };
  readonly devDependencies: { readonly ai: string };
};

describe(`built against ai@${installed.version}`, () => {
  it("resolves a version the declared peer range admits", () => {
    expect(own.peerDependencies.ai).toBe("^7.0.0");
    expect(installed.version.startsWith("7.")).toBe(true);
  });

  it("is pinned to exactly the version the suites ran against", () => {
    expect(own.devDependencies.ai).toBe(installed.version);
  });
});
