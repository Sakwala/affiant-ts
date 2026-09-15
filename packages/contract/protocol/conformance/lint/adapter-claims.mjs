#!/usr/bin/env node
// The adapter claims lint — CV-5.
//
// CV-5 says: no claim that a pause survives a process restart may rest on a runtime
// feature that is not published under the `latest` dist-tag with the provider pinned
// at build time; otherwise the Docket row alone is the durable state. That is a
// statement about an adapter package's documentation and its packaging, and no
// declarative fixture can observe either — which is why CV-5's check is this script
// and not a document in `conformance/fixtures/adapter/`.
//
// It reads one adapter package directory and answers two questions:
//
//   1. Is every durability claim the package DECLARES backed by the runtime it
//      depends on? A claim names the runtime version the feature arrived in
//      (`since`); that version has to be inside the package's own declared peer
//      range, and it has to be a version the runtime's `latest` dist-tag actually
//      reaches. A claim resting on a feature only a `beta` or `next` tag carries is
//      the exact thing CV-5 forbids.
//   2. Does the README claim durability the package has not declared? A fixed,
//      documented phrase list (below, and in ADAPTER-CLAIMS.md) finds the sentences
//      that claim a pause survives something or is durable. An occurrence inside a
//      negated sentence is not a claim — "no claim that a pause survives a process
//      restart may rest on …" is the rule being quoted, not a promise being made —
//      and every occurrence the lint discounts is printed, so a reader can check the
//      discount rather than take it.
//
// Run:
//   node conformance/lint/adapter-claims.mjs <package directory>
//   node conformance/lint/adapter-claims.mjs <package directory> --offline
//
// `--offline` skips the registry read, prints why, and checks everything that needs
// no network. It is for a machine with no route to the registry; a run that uses it
// has NOT verified any declared claim against a published dist-tag, and it says so.
//
// Exit 0 when every check passed, 1 when a check failed, and **2** when the registry
// could not be read at all. The third code is what lets a continuous-integration job
// fall back to `--offline` for a runner with no route to the registry without also
// swallowing the failure that fallback cannot see: a claim resting on a version
// `latest` has not reached is precisely what the registry half checks, and a job that
// retried offline on any failure would report CV-5 green for it.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

// ---------------------------------------------------------------------------
// The fixed phrase list
// ---------------------------------------------------------------------------

/**
 * The durability claims this lint can read, as a fixed list. Fixed on purpose: a
 * lint over prose that grew a new rule whenever somebody found a phrasing it missed
 * would be a lint nobody could predict, and CV-5 is a rule an adapter author has to
 * be able to write to. Every pattern is an AFFIRMATIVE form — a subject claiming the
 * thing — rather than the bare words "durable" or "survives", so that a README may
 * state the rule, name a package's durability as the reason a host would want it, or
 * say that the Docket row is the durable state, without any of those reading as a
 * promise about this package.
 *
 * ADAPTER-CLAIMS.md carries this list in prose, with an example of each.
 */
const CLAIM_PATTERNS = [
  {
    id: 'survives-a-restart',
    says: 'that something survives a restart, a crash, a redeploy or a failover',
    pattern:
      /\bsurviv(?:e|es|ed|ing)\b[^.!?]{0,60}?\b(?:process\s+)?(?:restart|reboot|crash|redeploy|deployment|cold\s+start|failover)\b/gi,
  },
  {
    id: 'is-durable',
    says: 'that something is, stays or becomes durable',
    pattern: /\b(?:is|are|was|were|stays?|remains?|becomes?|becoming)\s+durable\b/gi,
  },
  {
    id: 'a-durable-thing',
    says: 'that a pause, a checkpoint, an approval or a resumption is a durable one',
    pattern:
      /\bdurabl(?:e|y)\s+(?:pause[ds]?|checkpoint(?:ed|s)?|persisted|resumed|resumption|stored|approvals?)\b/gi,
  },
  {
    id: 'resumes-after',
    says: 'that something resumes after a restart, a reboot, a crash or a redeploy',
    pattern:
      /\bresum(?:e|es|ed|ing|ption)\b[^.!?]{0,60}?\bafter\s+(?:a\s+)?(?:process\s+)?(?:restart|reboot|crash|redeploy|deployment)\b/gi,
  },
];

/**
 * What makes an occurrence a quotation or a denial rather than a claim, when it
 * appears in the same sentence **before** the phrase. Also a fixed list.
 *
 * This is the whole of the lint's reading of prose, and it is deliberately blunt: a
 * sentence that denies a durability claim anywhere before making one is not held to
 * it. The cost is that a sentence could be written to slip through — "there is no
 * question that a pause survives a process restart" — and the answer to that is that
 * the sentence would be a false claim a person put there on purpose, which is not
 * what a lint is for. The benefit is that the rule's own words can appear in a README
 * that states the rule, which is what an honest adapter's README does.
 */
const NEGATIONS =
  /\b(?:no|not|never|cannot|can't|without|nothing|neither|nor|unsupported|rather\s+than|instead\s+of|would\s+have\s+to)\b/i;

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const offline = args.includes('--offline');
const target = args.find((arg) => !arg.startsWith('--'));

if (target === undefined) {
  console.error('usage: node conformance/lint/adapter-claims.mjs <package directory> [--offline]');
  process.exit(1);
}

const packageDir = resolve(target);
const manifestPath = join(packageDir, 'package.json');
const readmePath = join(packageDir, 'README.md');

const failures = [];
const fail = (message) => failures.push(message);

/** Whether the registry could not be read, which is exit code 2 rather than 1. */
let registryUnreachable = false;

if (!existsSync(manifestPath)) {
  console.error(`FATAL  no package.json at ${manifestPath}`);
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
console.log(`adapter claims lint — ${String(manifest.name)}@${String(manifest.version)} (CV-5)`);

// ---------------------------------------------------------------------------
// The declaration
// ---------------------------------------------------------------------------

/**
 * `package.json` → `affiant.adapter`:
 *
 *   { "runtime": "<npm package name>",
 *     "surfaces": ["…"],
 *     "durabilityClaims": [ { "feature": "…", "since": "<runtime version>" } ] }
 *
 * `durabilityClaims: []` is a complete and ordinary declaration: it says the package
 * claims no durability beyond the Docket row, which is what AZ-5 says is true anyway.
 */
const adapter = manifest.affiant?.adapter;
if (adapter === undefined || adapter === null || typeof adapter !== 'object') {
  console.error(
    `FATAL  ${manifestPath} carries no "affiant": { "adapter": … } block. An adapter package ` +
      `declares its runtime, the surfaces it supports and its durability claims; see ` +
      `conformance/ADAPTER-CLAIMS.md.`,
  );
  process.exit(1);
}

const runtime = adapter.runtime;
if (typeof runtime !== 'string' || runtime.trim() === '') {
  fail('affiant.adapter.runtime must be the npm package name of the runtime this adapter is for');
}
if (!Array.isArray(adapter.surfaces) || adapter.surfaces.some((s) => typeof s !== 'string')) {
  fail('affiant.adapter.surfaces must be an array of the runtime surfaces this adapter supports');
} else if (adapter.surfaces.length === 0) {
  fail('affiant.adapter.surfaces is empty: an adapter that supports no surface is not an adapter');
}
const claims = adapter.durabilityClaims;
if (!Array.isArray(claims)) {
  fail('affiant.adapter.durabilityClaims must be an array — `[]` where the package claims none');
}

const peerRange = manifest.peerDependencies?.[runtime];
if (typeof peerRange !== 'string') {
  fail(
    `affiant.adapter.runtime is ${JSON.stringify(runtime)}, which ${String(manifest.name)} does ` +
      `not declare as a peer dependency. CV-5 is about a claim resting on a version the package ` +
      `pins at build time, and a runtime it does not depend on pins nothing.`,
  );
} else {
  console.log(`OK    runtime ${runtime}, declared peer range ${peerRange}`);
}

// ---------------------------------------------------------------------------
// Versions
// ---------------------------------------------------------------------------

/** A semantic version as its five comparable parts, or null when it is not one. */
function parseVersion(text) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(
    String(text ?? '').trim(),
  );
  if (match === null) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] === undefined ? null : match[4].split('.'),
    raw: String(text).trim(),
  };
}

/** SemVer precedence: negative, zero or positive, with a prerelease below its release. */
function compareVersions(a, b) {
  for (const part of ['major', 'minor', 'patch']) {
    if (a[part] !== b[part]) return a[part] < b[part] ? -1 : 1;
  }
  if (a.prerelease === null && b.prerelease === null) return 0;
  if (a.prerelease === null) return 1;
  if (b.prerelease === null) return -1;
  const length = Math.max(a.prerelease.length, b.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    const left = a.prerelease[index];
    const right = b.prerelease[index];
    if (left === undefined) return -1;
    if (right === undefined) return 1;
    const leftNumeric = /^\d+$/.test(left);
    const rightNumeric = /^\d+$/.test(right);
    if (leftNumeric && rightNumeric) {
      if (Number(left) !== Number(right)) return Number(left) < Number(right) ? -1 : 1;
      continue;
    }
    if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1;
    if (left !== right) return left < right ? -1 : 1;
  }
  return 0;
}

/**
 * Whether `version` is inside `range`, for the four range forms a peer dependency on
 * a runtime is written in: `^x.y.z`, `~x.y.z`, `>=x.y.z` and an exact `x.y.z`.
 *
 * A range this cannot read is a **failure**, not a pass: a lint that shrugged at a
 * range it did not understand would report "no problems" about a claim it never
 * checked, which is the one answer CV-5's check must never give.
 */
function satisfies(version, range) {
  const text = String(range).trim();
  const caret = /^\^(.+)$/.exec(text);
  const tilde = /^~(.+)$/.exec(text);
  const atLeast = /^>=\s*(.+)$/.exec(text);
  const exact = parseVersion(text);

  if (exact !== null) return { known: true, ok: compareVersions(version, exact) === 0 };
  const floor = parseVersion(caret?.[1] ?? tilde?.[1] ?? atLeast?.[1] ?? '');
  if (floor === null) return { known: false, ok: false };
  if (compareVersions(version, floor) < 0) return { known: true, ok: false };
  if (atLeast !== null) return { known: true, ok: true };
  if (tilde !== null) {
    return {
      known: true,
      ok: version.major === floor.major && version.minor === floor.minor,
    };
  }
  // `^0.y.z` is minor-locked and `^0.0.z` patch-locked, as npm reads it.
  if (floor.major > 0) return { known: true, ok: version.major === floor.major };
  if (floor.minor > 0) {
    return { known: true, ok: version.major === 0 && version.minor === floor.minor };
  }
  return {
    known: true,
    ok: version.major === 0 && version.minor === 0 && version.patch === floor.patch,
  };
}

/** `npm view <name> dist-tags --json`, or null when the registry could not be read. */
function distTagsOf(name) {
  try {
    const stdout = execFileSync('npm', ['view', name, 'dist-tags', '--json'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const tags = JSON.parse(stdout);
    return tags !== null && typeof tags === 'object' ? tags : null;
  } catch (error) {
    registryUnreachable = true;
    fail(
      `could not read ${name}'s dist-tags from the registry: ` +
        `${error instanceof Error ? error.message.split('\n')[0] : String(error)}. ` +
        `Pass --offline to run the checks that need no network, and say so wherever the result ` +
        `is recorded.`,
    );
    return null;
  }
}

// ---------------------------------------------------------------------------
// 1. Every declared claim, against the runtime's published `latest`
// ---------------------------------------------------------------------------

let latest = null;
if (typeof runtime === 'string' && runtime.trim() !== '') {
  if (offline) {
    console.log(
      `SKIP  the registry: --offline was passed, so ${runtime}'s dist-tags were not read and no ` +
        `declared claim was checked against a published version. This run does not verify CV-5's ` +
        `dist-tag half.`,
    );
  } else {
    const tags = distTagsOf(runtime);
    if (tags !== null) {
      latest = parseVersion(tags.latest);
      if (latest === null) {
        fail(`${runtime}'s registry entry has no readable \`latest\` dist-tag`);
      } else {
        console.log(`OK    registry: ${runtime}@latest is ${latest.raw}`);
      }
    }
  }
}

if (Array.isArray(claims)) {
  if (claims.length === 0) {
    console.log(
      'OK    durabilityClaims is empty: this package claims no durability beyond the Docket row',
    );
  }
  for (const [index, claim] of claims.entries()) {
    const where = `durabilityClaims[${String(index)}]`;
    if (claim === null || typeof claim !== 'object') {
      fail(`${where} is not an object: a claim is { "feature": …, "since": … }`);
      continue;
    }
    if (typeof claim.feature !== 'string' || claim.feature.trim() === '') {
      fail(`${where}.feature must name the runtime feature the claim rests on`);
    }
    const since = parseVersion(claim.since);
    if (since === null) {
      fail(
        `${where}.since must be the runtime version the feature arrived in, as a semantic ` +
          `version — not ${JSON.stringify(claim.since ?? null)}`,
      );
      continue;
    }
    if (typeof peerRange === 'string') {
      const inRange = satisfies(since, peerRange);
      if (!inRange.known) {
        fail(
          `${where}: this lint cannot read the peer range ${JSON.stringify(peerRange)}. It reads ` +
            `^x.y.z, ~x.y.z, >=x.y.z and an exact x.y.z; a range it cannot read is a claim it ` +
            `cannot check, which is a failure rather than a pass.`,
        );
      } else if (!inRange.ok) {
        fail(
          `${where}: the claim rests on ${runtime} ${since.raw}, which the declared peer range ` +
            `${peerRange} does not admit. A host installing this package may get a runtime ` +
            `without the feature the claim rests on (CV-5).`,
        );
      }
    }
    if (latest !== null && compareVersions(latest, since) < 0) {
      fail(
        `${where}: the claim rests on ${runtime} ${since.raw}, and the ${runtime} \`latest\` ` +
          `dist-tag is ${latest.raw}. CV-5: a durability claim rests only on features published ` +
          `under \`latest\`; until that tag reaches ${since.raw}, the Docket row alone is the ` +
          `durable state and the README says so.`,
      );
    } else if (latest !== null) {
      console.log(`OK    ${where}: ${String(claim.feature)} — ${runtime} ${since.raw} ≤ latest`);
    }
  }
}

// ---------------------------------------------------------------------------
// 2. The README, against the declared claims
// ---------------------------------------------------------------------------

/** The README split into sentences, each with the offset it starts at. */
function sentencesOf(text) {
  const parts = [];
  let start = 0;
  const boundary = /(?<=[.!?])\s+|\n{2,}/g;
  for (const match of text.matchAll(boundary)) {
    parts.push({ text: text.slice(start, match.index), at: start });
    start = match.index + match[0].length;
  }
  parts.push({ text: text.slice(start), at: start });
  return parts.filter((part) => part.text.trim() !== '');
}

/** The line a character offset falls on, for a message a person can act on. */
function lineOf(text, offset) {
  return text.slice(0, offset).split('\n').length;
}

/** One sentence, trimmed to something a terminal can print. */
function quote(sentence) {
  const flat = sentence.replace(/\s+/g, ' ').trim();
  return flat.length <= 160 ? flat : `${flat.slice(0, 157)}…`;
}

if (!existsSync(readmePath)) {
  fail(
    `no README.md in ${packageDir}. CV-5 is a rule about what an adapter's documentation claims, ` +
      `and a package with no documentation has nowhere to state the boundary.`,
  );
} else {
  const readme = readFileSync(readmePath, 'utf8');
  const backed = Array.isArray(claims) && claims.length > 0;
  let found = 0;
  let discounted = 0;

  for (const sentence of sentencesOf(readme)) {
    for (const { id, says, pattern } of CLAIM_PATTERNS) {
      pattern.lastIndex = 0;
      for (const match of sentence.text.matchAll(pattern)) {
        const line = lineOf(readme, sentence.at + match.index);
        const before = sentence.text.slice(0, match.index);
        if (NEGATIONS.test(before)) {
          discounted += 1;
          console.log(
            `      README.md:${String(line)} — "${quote(match[0])}" reads as ${says}, and the ` +
              `sentence denies or quotes it before saying it, so it is not a claim: ` +
              `"${quote(sentence.text)}"`,
          );
          continue;
        }
        found += 1;
        if (!backed) {
          fail(
            `README.md:${String(line)} claims ${says} — "${quote(match[0])}" — and ` +
              `affiant.adapter.durabilityClaims is empty, so nothing backs it. Either declare the ` +
              `runtime feature and the version it arrived in, or say that the Docket row alone is ` +
              `the durable state (CV-5, phrase ${id}). The sentence: "${quote(sentence.text)}"`,
          );
        }
      }
    }
  }

  console.log(
    `OK    README.md: ${String(found)} durability claim(s) found` +
      (discounted === 0 ? '' : `, ${String(discounted)} occurrence(s) discounted as denials`) +
      (found === 0 ? '' : backed ? ', each backed by a declared claim' : ''),
  );
}

// ---------------------------------------------------------------------------

console.log('');
if (failures.length > 0) {
  console.error(`${failures.length} problem(s):`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(registryUnreachable ? 2 : 1);
}
console.log(
  `${String(manifest.name)}: CV-5 satisfied` +
    (offline ? ' for everything checkable offline (the registry half was skipped)' : ''),
);
