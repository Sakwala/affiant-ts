import { readdirSync, readFileSync } from "node:fs";
import { join, dirname, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { PROTOCOL_VERSION } from "../src/index.js";

/**
 * `protocol/` is vendored: a byte-for-byte copy of the schemas and conformance
 * fixtures at one tag of Sakwala/affiant-protocol. This test fetches the same
 * files from that tag and fails if a tracked copy has drifted — so a hand-edit to
 * a vendored file, or a tag that has been moved, is caught here rather than by a
 * consumer whose payloads stop validating.
 *
 * It needs the network. Offline, it skips with a message rather than failing:
 * the other suites already cover the vendored copies as they stand on disk.
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

if (!reachable) {
  describe("the vendored copies against the tag", () => {
    it.skip(`skipped: could not reach ${rawBase} — run this suite with network access to check the vendored copies against the tag`, () => {});
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
    });
  });
}
