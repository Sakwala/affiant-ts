import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { PROTOCOL_VERSION } from "../src/index.js";

/**
 * `protocol/` is vendored: a byte-for-byte copy of the schemas and conformance
 * fixtures at one tag of Sakwala/affiant-protocol. Two checks guard it, and the
 * first of them needs nothing but the disk:
 *
 * 1. **Against `protocol/SHA256SUMS`, always.** `scripts/sync-protocol.mjs`
 *    writes that file from the bytes it fetched at the tag. A hand-edit to a
 *    vendored copy changes its digest and fails here, online or off.
 * 2. **Against the tag itself, when the network is reachable.** This is what
 *    catches a `SHA256SUMS` edited to match a doctored copy, and a tag that has
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
  if (posix.startsWith("schemas/")) return posix;
  if (posix.startsWith("fixtures/")) return `conformance/${posix}`;
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

describe("the pinned protocol tag", () => {
  it("is the version the package advertises", () => {
    expect(pin).toBe(`v${PROTOCOL_VERSION}`);
  });

  it("vendors every schema and every fixture the seed defines", () => {
    expect(trackedFiles.length).toBe(18);
  });
});

describe("the vendored copies match protocol/SHA256SUMS", () => {
  it("names exactly the tracked files, and no others", () => {
    expect([...expectedSums.keys()].sort()).toEqual(
      trackedFiles.map((path) => path.split(sep).join("/")).sort(),
    );
  });

  it.each(trackedFiles)("%s", (localRelativePath) => {
    const key = localRelativePath.split(sep).join("/");
    const tracked = readFileSync(join(protocolDir, localRelativePath), "utf8");

    expect(sha256(tracked), `${key} does not match its digest in protocol/SHA256SUMS`).toBe(
      expectedSums.get(key),
    );
  });
});

if (!reachable) {
  describe("the vendored copies against the tag", () => {
    it.skip(`skipped: could not reach ${rawBase} — the copies were checked against protocol/SHA256SUMS above; run this suite with network access to check them, and that file, against the tag itself`, () => {});
  });
} else {
  describe("the vendored copies are byte-for-byte identical to the tag", () => {
    it.each(trackedFiles)("%s", async (localRelativePath) => {
      const url = `${rawBase}/${upstreamPathFor(localRelativePath)}`;
      const response = await fetch(url);

      expect(response.ok, `${url} returned ${response.status}`).toBe(true);

      const upstream = await response.text();
      const tracked = readFileSync(join(protocolDir, localRelativePath), "utf8");

      expect(tracked).toBe(upstream);
      // Catches a SHA256SUMS rewritten to bless a doctored copy.
      expect(expectedSums.get(localRelativePath.split(sep).join("/"))).toBe(sha256(upstream));
    });
  });
}
