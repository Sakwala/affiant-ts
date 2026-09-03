#!/usr/bin/env node
/**
 * Re-fetches the vendored protocol files from the tag named in `protocol/PIN`.
 *
 * `protocol/` holds byte-for-byte copies of the schemas and conformance fixtures
 * at one tag of Sakwala/affiant-protocol. This script is how the pin moves: edit
 * `protocol/PIN` to the new tag, run this, run `node scripts/generate-sources.mjs`,
 * and commit the whole diff in one pull request — so a wire-format change arrives
 * as a reviewable diff in this repository's own history rather than as a silent
 * upstream shift under a running build.
 *
 *   node scripts/sync-protocol.mjs           # fetch and write
 *   node scripts/sync-protocol.mjs --check   # fail if anything would change
 *
 * Set GITHUB_TOKEN to lift the unauthenticated GitHub API rate limit.
 */
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = "Sakwala/affiant-protocol";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const protocolDir = join(packageRoot, "protocol");
const check = process.argv.includes("--check");

const pin = readFileSync(join(protocolDir, "PIN"), "utf8").trim();

/** Which upstream paths are vendored, and where each lands locally. */
function localPathFor(upstreamPath) {
  if (/^schemas\/[^/]+\.schema\.json$/.test(upstreamPath)) {
    return upstreamPath;
  }
  if (/^conformance\/fixtures\/(MANIFEST|enum-values)\.json$/.test(upstreamPath)) {
    return upstreamPath.slice("conformance/".length);
  }
  if (/^conformance\/fixtures\/wire\/[^/]+\.json$/.test(upstreamPath)) {
    return upstreamPath.slice("conformance/".length);
  }
  return null;
}

const headers = { accept: "application/vnd.github+json", "user-agent": "affiant-ts-sync" };
if (process.env["GITHUB_TOKEN"]) {
  headers.authorization = `Bearer ${process.env["GITHUB_TOKEN"]}`;
}

const treeResponse = await fetch(
  `https://api.github.com/repos/${REPO}/git/trees/${pin}?recursive=1`,
  { headers },
);
if (!treeResponse.ok) {
  throw new Error(
    `could not list ${REPO} at ${pin}: ${treeResponse.status} ${treeResponse.statusText}. ` +
      `Check that the tag in protocol/PIN exists and that the network is reachable.`,
  );
}
const tree = await treeResponse.json();
if (tree.truncated) {
  throw new Error(`the tree listing for ${REPO}@${pin} was truncated; this script needs it whole`);
}

const wanted = tree.tree
  .filter((node) => node.type === "blob")
  .map((node) => ({ upstream: node.path, local: localPathFor(node.path) }))
  .filter((entry) => entry.local !== null)
  .sort((a, b) => a.local.localeCompare(b.local));

if (wanted.length === 0) {
  throw new Error(`no vendorable files found in ${REPO}@${pin}`);
}

const changed = [];

for (const { upstream, local } of wanted) {
  const url = `https://raw.githubusercontent.com/${REPO}/${pin}/${upstream}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`could not fetch ${url}: ${response.status} ${response.statusText}`);
  }
  const contents = await response.text();
  const target = join(protocolDir, local);

  let existing = null;
  try {
    existing = readFileSync(target, "utf8");
  } catch {
    // not vendored yet
  }

  if (existing === contents) continue;

  changed.push(existing === null ? `added   ${local}` : `updated ${local}`);
  if (!check) {
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, contents);
  }
}

/** Anything vendored that the tag no longer carries. */
function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return entry.name.endsWith(".json") ? [relative(protocolDir, full).split(sep).join("/")] : [];
  });
}

const expected = new Set(wanted.map((entry) => entry.local));
for (const local of walk(protocolDir)) {
  if (expected.has(local)) continue;
  changed.push(`removed ${local}`);
  if (!check) rmSync(join(protocolDir, local));
}

if (changed.length === 0) {
  console.log(`protocol/ is already identical to ${REPO}@${pin} (${wanted.length} files)`);
} else {
  console.log(`${REPO}@${pin}:`);
  for (const line of changed) console.log(`  ${line}`);
  if (check) {
    console.error("\n--check: protocol/ differs from the pinned tag");
    process.exit(1);
  }
  console.log("\nNow run: node scripts/generate-sources.mjs");
}
