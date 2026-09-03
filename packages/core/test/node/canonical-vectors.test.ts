import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { AmendmentMap } from "@affiant/contract";

import { canonicalize } from "../../src/model/canonical.js";
import type { CanonicalInput } from "../../src/model/canonical.js";

import { canonicalVectors } from "../fixtures/canonical.generated.js";

/**
 * SR-1's byte vectors, checked against paths the portable suite cannot reach.
 *
 * `test/canonical.test.ts` checks the vectors on every runtime and cross-checks the
 * bytes against a second canonicalizer written from the rule. Two things are left,
 * and both need Node:
 *
 * 1. **The hashes, from outside this process.** `crypto.subtle` produced the
 *    committed digests, so a test that recomputes them with `crypto.subtle` proves
 *    only that Web Crypto is consistent with itself. `sha256sum` — a separate
 *    binary, a separate implementation, ten years older than the runtime — and
 *    `node:crypto` are the outside opinions.
 * 2. **The JSON files and the generated module still agree.** The `.json` files are
 *    the record a conformance driver reads; the generated module is how the
 *    portable suites read the same data on Bun and inside workerd. A mirror nobody
 *    checks is a mirror that drifts.
 *
 * Node-only: it reads files, spawns a process, and imports `node:crypto` — none of
 * which a Worker does. Excluded from the workerd run by `vitest.workers.config.ts`.
 */
const vectorDir = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "canonical");

/** The vector files on disk, in the order the generator reads them. */
function vectorFiles(): string[] {
  return readdirSync(vectorDir)
    .filter((name) => name.endsWith(".json"))
    .sort();
}

/** Whether `sha256sum` is on this machine's PATH. */
function hasSha256sum(): boolean {
  try {
    execFileSync("sha256sum", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

describe("the canonical vectors on disk", () => {
  it("has one JSON file per vector in the generated module", () => {
    expect(vectorFiles().length).toBe(canonicalVectors.length);
    expect(canonicalVectors.length).toBeGreaterThanOrEqual(6);
  });

  it("mirrors every JSON file into the generated module, byte for byte", () => {
    const onDisk = vectorFiles().map(
      (file) => JSON.parse(readFileSync(join(vectorDir, file), "utf8")) as unknown,
    );

    expect(onDisk).toStrictEqual(canonicalVectors.map((vector) => ({ ...vector })));
  });

  it("carries a non-empty expectation and a rule citation in every file", () => {
    for (const file of vectorFiles()) {
      const vector = JSON.parse(readFileSync(join(vectorDir, file), "utf8")) as {
        id: string;
        rules: string[];
        note: string;
        expectedBytesUtf8: string;
        expectedSha256: string;
      };

      expect(vector.id, file).toMatch(/^canonical\//);
      expect(vector.rules, file).toContain("SR-1");
      expect(vector.note.length, file).toBeGreaterThan(0);
      expect(vector.expectedBytesUtf8.length, file).toBeGreaterThan(0);
      expect(vector.expectedSha256, file).toMatch(/^[0-9a-f]{64}$/);
    }
  });
});

describe("the committed SHA-256 digests, from outside Web Crypto", () => {
  const sha256sumAvailable = hasSha256sum();

  it("agrees with node:crypto on every vector", () => {
    for (const vector of canonicalVectors) {
      const bytes = canonicalize(
        vector.input as CanonicalInput,
        vector.amendments as AmendmentMap | null,
        vector.reviewerActRef === null ? undefined : { reviewerActRef: vector.reviewerActRef },
      );

      expect(createHash("sha256").update(bytes).digest("hex"), vector.id).toBe(
        vector.expectedSha256,
      );
    }
  });

  it("agrees with sha256sum on the amended vector's bytes", () => {
    // The amended vector, because it is the one whose bytes an execution grant
    // binds to and the one an implementation is most likely to get wrong.
    const vector = canonicalVectors.find((candidate) => candidate.amendments !== null);
    expect(vector, "a vector with amendments").toBeDefined();
    if (vector === undefined) return;
    if (!sha256sumAvailable) {
      // node:crypto already covered every vector above; this arm only loses the
      // third opinion, so it is reported rather than silently skipped.
      console.warn("sha256sum is not on PATH; the third digest path did not run");
      return;
    }

    const bytes = canonicalize(vector.input as CanonicalInput, vector.amendments as AmendmentMap, {
      reviewerActRef: vector.reviewerActRef as string,
    });
    const output = execFileSync("sha256sum", ["-b", "-"], { input: bytes }).toString("utf8");

    expect(output.split(" ")[0]).toBe(vector.expectedSha256);
  });

  it("agrees with sha256sum on the expected bytes as they are stored", () => {
    if (!sha256sumAvailable) return;

    for (const vector of canonicalVectors) {
      const output = execFileSync("sha256sum", ["-b", "-"], {
        input: Buffer.from(vector.expectedBytesUtf8, "utf8"),
      }).toString("utf8");

      expect(output.split(" ")[0], vector.id).toBe(vector.expectedSha256);
    }
  });
});

describe("the canonical bytes are UTF-8", () => {
  it("encodes every vector's expected string to exactly the bytes it hashes", () => {
    for (const vector of canonicalVectors) {
      const bytes = canonicalize(
        vector.input as CanonicalInput,
        vector.amendments as AmendmentMap | null,
        vector.reviewerActRef === null ? undefined : { reviewerActRef: vector.reviewerActRef },
      );

      expect(Buffer.from(bytes).toString("utf8"), vector.id).toBe(vector.expectedBytesUtf8);
      expect(bytes.length, vector.id).toBe(Buffer.byteLength(vector.expectedBytesUtf8, "utf8"));
    }
  });
});
