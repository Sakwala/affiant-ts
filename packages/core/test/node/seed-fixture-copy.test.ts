import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { evidenceCardRequest } from "../fixtures/evidence-card-request.js";

/**
 * The copy cannot drift.
 *
 * `test/fixtures/evidence-card-request.ts` is a hand-transcribed copy of the
 * protocol seed fixture, which exists because the portable suites run inside
 * workerd and under Bun, where reading a file is not a thing to do. This suite is
 * the other half of that bargain: on Node, where a file *can* be read, it reads the
 * vendored original and asserts the two are the same value.
 *
 * Node-only, so it is excluded from the workerd run by `vitest.workers.config.ts`.
 */
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const vendored = join(
  repoRoot,
  "packages",
  "contract",
  "protocol",
  "fixtures",
  "wire",
  "evidence-card-request.json",
);

describe("the seed fixture copy", () => {
  it("is identical to the vendored protocol fixture", () => {
    const original: unknown = JSON.parse(readFileSync(vendored, "utf8"));
    expect(evidenceCardRequest).toEqual(original);
  });
});
