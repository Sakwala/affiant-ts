import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";

import { PROTOCOL_VERSION } from "../src/index.js";

/**
 * `protocol/` is vendored: a byte-for-byte copy of the schemas, the conformance
 * suite and the machine-readable formats at one ref of Sakwala/affiant-protocol.
 * Two checks guard it, and the first of them needs nothing but the disk:
 *
 * 1. **Against `protocol/SHA256SUMS`, always.** `scripts/sync-protocol.mjs`
 *    writes that file from the bytes it fetched at the ref. A hand-edit to a
 *    vendored copy changes its digest and fails here, online or off.
 * 2. **Against the ref itself, when the network is reachable.** This is what
 *    catches a `SHA256SUMS` edited to bless a doctored copy, and a tag that has
 *    been moved under us.
 *
 * `generated.test.ts` closes the remaining gap: that the committed generated
 * modules are what these vendored copies produce.
 */
const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const protocolDir = join(packageRoot, "protocol");

const pin = readFileSync(join(protocolDir, "PIN"), "utf8").trim();
const rawBase = `https://raw.githubusercontent.com/Sakwala/affiant-protocol/${pin}`;

/** Where each tracked local file lives in the protocol repository. */
function upstreamPathFor(localRelativePath: string): string {
  const posix = localRelativePath.split(sep).join("/");
  if (posix.startsWith("schemas/seed/")) return `schemas/${posix.slice("schemas/seed/".length)}`;
  if (posix.startsWith("schemas/")) return `schemas/0.1.0/${posix.slice("schemas/".length)}`;
  if (posix.startsWith("fixtures/")) return `conformance/${posix}`;
  if (posix.startsWith("conformance/")) return posix;
  throw new Error(`unmapped vendored path: ${posix}`);
}

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return entry.name.endsWith(".json") ? [relative(protocolDir, full)] : [];
  });
}

const trackedFiles = walk(protocolDir).sort();

/** `protocol/SHA256SUMS`, in the format `sha256sum` prints: digest, two spaces, path. */
const expectedSums = new Map(
  readFileSync(join(protocolDir, "SHA256SUMS"), "utf8")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => {
      const [digest, ...rest] = line.split("  ");
      return [rest.join("  "), digest] as const;
    }),
);

function sha256(bytes: string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

const reachable = await fetch(`${rawBase}/conformance/fixtures/MANIFEST.json`)
  .then((response) => response.ok)
  .catch(() => false);

describe("the pinned protocol ref", () => {
  it("is a rulebook tag for the wire version this package targets, or an immutable commit", () => {
    // Two versions, and they are not the same number. `PROTOCOL_VERSION` is the
    // **wire** version SR-4 stamps on an envelope; the pin is a **rulebook release**
    // tag, and the rulebook may cut a patch — new conformance vectors, a new lint —
    // over a wire that did not change. So the tag's major and minor must be the
    // wire's, and its patch is the rulebook's own. A differing minor would mean this
    // package vendored the schemas of a wire it does not target.
    //
    // The second arm is for the window in which a version's text is on the rulebook's
    // default branch and its tag has not been cut: a full commit is as immutable as a
    // tag and, unlike a tag, cannot be moved under a running build.
    const [major, minor] = PROTOCOL_VERSION.split(".");
    const tag = new RegExp(`^v${major}\\.${minor}\\.(0|[1-9][0-9]*)$`);

    expect(tag.test(pin) || /^[0-9a-f]{40}$/.test(pin), pin).toBe(true);
  });

  it("vendors every schema, every fixture and every format a driver needs", () => {
    expect(trackedFiles.length).toBe(176);
  });

  it("vendors both wire versions: v0.1 at schemas/, the superseded seed beside it", () => {
    const posix = trackedFiles.map((path) => path.split(sep).join("/"));
    expect(posix.filter((path) => /^schemas\/[^/]+\.schema\.json$/.test(path))).toHaveLength(21);
    expect(posix.filter((path) => path.startsWith("schemas/seed/"))).toHaveLength(8);
  });

  it("vendors the four formats a driver reads and the exemptions it copies", () => {
    const posix = new Set(trackedFiles.map((path) => path.split(sep).join("/")));
    expect(posix.has("conformance/fixture.schema.json")).toBe(true);
    expect(posix.has("conformance/canonical-vector.schema.json")).toBe(true);
    expect(posix.has("conformance/results.schema.json")).toBe(true);
    expect(posix.has("conformance/parity/MANIFEST.schema.json")).toBe(true);
    expect(posix.has("conformance/lint/coverage-exemptions.json")).toBe(true);
  });
});

describe("the vendored copies match protocol/SHA256SUMS", () => {
  it("names exactly the tracked files, and no others", () => {
    expect([...expectedSums.keys()].sort()).toEqual(
      trackedFiles.map((path) => path.split(sep).join("/")).sort(),
    );
  });

  it("has a matching digest for every tracked file", () => {
    const mismatched = trackedFiles.filter((localRelativePath) => {
      const key = localRelativePath.split(sep).join("/");
      return (
        sha256(readFileSync(join(protocolDir, localRelativePath), "utf8")) !== expectedSums.get(key)
      );
    });

    expect(mismatched).toEqual([]);
  });
});

if (!reachable) {
  describe("the vendored copies against the ref", () => {
    it.skip(`skipped: could not reach ${rawBase} — the copies were checked against protocol/SHA256SUMS above; run this suite with network access to check them, and that file, against the ref itself`, () => {});
  });
} else {
  describe("the vendored copies are byte-for-byte identical to the ref", () => {
    /** The upstream bytes, fetched once. 175 sequential round trips would be minutes. */
    const upstream = new Map<string, string>();

    beforeAll(async () => {
      const queue = [...trackedFiles];
      const workers = Array.from({ length: 16 }, async () => {
        for (let next = queue.pop(); next !== undefined; next = queue.pop()) {
          const url = `${rawBase}/${upstreamPathFor(next)}`;
          const response = await fetch(url);
          if (!response.ok) {
            throw new Error(`${url} returned ${String(response.status)}`);
          }
          upstream.set(next, await response.text());
        }
      });
      await Promise.all(workers);
    }, 120_000);

    it("fetched one upstream copy per tracked file", () => {
      expect(upstream.size).toBe(trackedFiles.length);
    });

    it("has identical bytes on every tracked file", () => {
      const differing = trackedFiles.filter(
        (path) => readFileSync(join(protocolDir, path), "utf8") !== upstream.get(path),
      );

      expect(differing).toEqual([]);
    });

    it("has a SHA256SUMS written over the upstream bytes, not over the copies", () => {
      // Catches a SHA256SUMS rewritten to bless a doctored copy.
      const wrong = trackedFiles.filter((path) => {
        const bytes = upstream.get(path);
        return bytes === undefined || expectedSums.get(path.split(sep).join("/")) !== sha256(bytes);
      });

      expect(wrong).toEqual([]);
    });
  });
}
