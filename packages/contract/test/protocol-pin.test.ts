import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";

import { PROTOCOL_VERSION } from "../src/index.js";
import { extractTarGz, fetchWithRetry } from "./support/tar-archive.js";

/**
 * `protocol/` is vendored: a byte-for-byte copy of the schemas, the conformance
 * suite and the machine-readable formats at one ref of Sakwala/affiant-protocol.
 * Two checks guard it:
 *
 * 1. **Against `protocol/SHA256SUMS`, always.** `scripts/sync-protocol.mjs`
 *    writes that file from the bytes it fetched at the ref. A hand-edit to a
 *    vendored copy changes its digest and fails here, with no network at all.
 * 2. **Against the ref itself, always.** This is what catches a `SHA256SUMS`
 *    edited to bless a doctored copy, and a tag that has been moved under us.
 *    It fetches the ref as one archive — `codeload.github.com` serves a whole
 *    tag or commit as a single gzipped tarball — rather than one request per
 *    vendored file, and that one request is retried on a transient failure. A
 *    request that still fails after retries fails this test with the network
 *    detail in the message: this job is merge-blocking precisely so that ref
 *    drift cannot slip through, so a network problem here is a red run, never a
 *    silently skipped one.
 *
 * `generated.test.ts` closes the remaining gap: that the committed generated
 * modules are what these vendored copies produce.
 */
const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const protocolDir = join(packageRoot, "protocol");

const pin = readFileSync(join(protocolDir, "PIN"), "utf8").trim();

const TAG_PATTERN = /^v\d+\.\d+\.(0|[1-9]\d*)$/;
const COMMIT_PATTERN = /^[0-9a-f]{40}$/;

/**
 * `protocol/PIN` must be a version tag or a full 40-character commit — the same
 * rule `scripts/sync-protocol.mjs`'s own `assertValidPin` enforces, so a
 * malformed pin is rejected the same way by whichever tool reads it first,
 * rather than one of them silently trying it as a branch name codeload also
 * happens to accept.
 */
function assertValidPin(candidate: string): void {
  if (!TAG_PATTERN.test(candidate) && !COMMIT_PATTERN.test(candidate)) {
    throw new Error(
      `protocol/PIN must be a version tag (v<major>.<minor>.<patch>) or a full ` +
        `40-character commit, not "${candidate}"`,
    );
  }
}

assertValidPin(pin);

/**
 * The ref segment of a `codeload.github.com` archive URL. A tag is addressed as
 * `refs/tags/<tag>` — codeload also accepts a bare tag name, but only when no
 * branch shares it, and this disambiguates. A pin that is not tag-shaped is the
 * full 40-character commit `scripts/sync-protocol.mjs` (lines 16-19) describes:
 * the window in which a version's text is on the rulebook's default branch and
 * its tag has not been cut yet. codeload addresses a commit directly, with no
 * `refs/` prefix.
 */
const archiveRef = COMMIT_PATTERN.test(pin) ? pin : `refs/tags/${pin}`;
const archiveUrl = `https://codeload.github.com/Sakwala/affiant-protocol/tar.gz/${archiveRef}`;

/** Where each tracked local file lives in the protocol repository. */
function upstreamPathFor(localRelativePath: string): string {
  const posix = localRelativePath.split(sep).join("/");
  if (posix.startsWith("schemas/seed/")) return `schemas/${posix.slice("schemas/seed/".length)}`;
  if (posix.startsWith("schemas/")) return `schemas/0.1.0/${posix.slice("schemas/".length)}`;
  if (posix.startsWith("fixtures/")) return `conformance/${posix}`;
  if (posix.startsWith("conformance/")) return posix;
  throw new Error(`unmapped vendored path: ${posix}`);
}

/**
 * Every file under `protocol/` — the whole vendored tree — except the two that
 * describe the vendoring itself rather than being vendored content: `PIN` (the
 * ref) and the generated `SHA256SUMS`. This package's own README and the
 * repository root's both say "everything [under `protocol/`] is a byte-for-byte
 * copy"; walking everything here, not just `*.json`, is what makes that true
 * rather than aspirational — a stray file added by hand fails exactly like an
 * edited one, whatever its extension.
 */
function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    const relativePath = relative(protocolDir, full);
    return relativePath === "PIN" || relativePath === "SHA256SUMS" ? [] : [relativePath];
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

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

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

    expect(tag.test(pin) || COMMIT_PATTERN.test(pin), pin).toBe(true);
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
      return sha256(readFileSync(join(protocolDir, localRelativePath))) !== expectedSums.get(key);
    });

    expect(mismatched).toEqual([]);
  });
});

describe("the vendored copies are byte-for-byte identical to the ref", () => {
  /** The upstream bytes, fetched once as a single archive and keyed by local path. */
  const upstream = new Map<string, Buffer>();

  beforeAll(async () => {
    const response = await fetchWithRetry(archiveUrl);
    const archiveFiles = extractTarGz(new Uint8Array(await response.arrayBuffer()));

    for (const local of trackedFiles) {
      const posix = local.split(sep).join("/");
      const upstreamPath = upstreamPathFor(local);
      const bytes = archiveFiles.get(upstreamPath);
      if (bytes === undefined) {
        throw new Error(
          `${archiveUrl} did not contain ${upstreamPath} (vendored locally as protocol/${posix})`,
        );
      }
      upstream.set(local, bytes);
    }
  }, 120_000);

  it("has identical bytes on every tracked file", () => {
    const differing = trackedFiles.filter((path) => {
      const remote = upstream.get(path);
      return remote === undefined || !readFileSync(join(protocolDir, path)).equals(remote);
    });

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
