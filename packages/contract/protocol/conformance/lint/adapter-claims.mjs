#!/usr/bin/env node
// The adapter claims lint — CV-5.
//
// CV-5 says: no durability claim rests on a runtime feature that is not published
// under the `latest` dist-tag with the provider pinned at build time; otherwise the
// Docket row alone is the durable state. That is a statement about an adapter
// package's documentation and its packaging, and no declarative fixture can observe
// either — which is why CV-5's check is this script and not a document in
// `conformance/fixtures/adapter/`.
//
// It reads one adapter package directory and answers two questions:
//
//   1. Is every durability claim the package DECLARES a real one, and backed by the
//      runtime it depends on? A claim names a feature — one of the package's own
//      declared `surfaces`, or one of the runtime durability mechanisms
//      ADAPTER-CLAIMS.md names — and the runtime version the feature arrived in
//      (`since`). That version has to be inside the package's own declared peer
//      range, and it has to be a version the runtime's `latest` dist-tag actually
//      reaches. A claim resting on a feature only a `beta` or `next` tag carries is
//      the exact thing CV-5 forbids.
//   2. Does the README claim durability nothing backs? A sentence is a durability
//      claim when it carries a durability word and a subject word together (§ THE
//      DETECTOR below, and ADAPTER-CLAIMS.md in prose), and it is **backed** only
//      when it names a declared claim's `feature` verbatim. An occurrence inside a
//      negated sentence is not a claim at all — "no claim that a pause survives a
//      process restart may rest on …" is the rule being quoted, not a promise being
//      made — and every sentence the lint discounts is printed, so a reader can check
//      the discount rather than take it.
//
// The detector is deliberately wide and false positives are expected: the cost of one
// is a sentence an author reworded or a `feature` an author named, and the cost of a
// miss is an adopter told their approval queue is durable on the strength of a
// dist-tag nobody will install.
//
// Run:
//   node conformance/lint/adapter-claims.mjs <package directory>
//   node conformance/lint/adapter-claims.mjs <package directory> --offline
//   node conformance/lint/adapter-claims.mjs --self-test
//
// `--offline` skips the registry read, prints why, and checks everything that needs
// no network. It is for a machine with no route to the registry; a run that uses it
// has NOT verified any declared claim against a published dist-tag, and it says so.
//
// `--self-test` runs this script's own corpus in `adapter-claims.test/` — a package
// per case, each with what the lint must say about it — and needs no network at all.
// It is what the rulebook's own CI runs, because a lint the rulebook cites as CV-5's
// coverage and never executes is not coverage.
//
// Exit 0 when every check passed, 1 when a check failed, and **2** when the registry
// could not be REACHED. The third code is what lets an adapter package's CI fall back
// to `--offline` on a runner with no route to the registry without also swallowing
// the failure that fallback cannot see. It is a network class and nothing else: a 404
// or a 403 from the registry is a defect in the declaration — a runtime named wrong,
// or one nobody may read — and exits 1.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');

// ---------------------------------------------------------------------------
// THE DETECTOR
// ---------------------------------------------------------------------------

/**
 * The words that make a sentence about durability. Fixed, and documented in
 * ADAPTER-CLAIMS.md so an adapter author can write to it.
 *
 * The first round of this lint matched affirmative phrases — "survives a restart",
 * "is durable" — and five of six ordinary sentences a real README would carry walked
 * straight past it ("the pause is persisted", "the pending entry outlives the
 * process", "approvals are preserved across deploys"). A phrase list that has to
 * guess the shape of a sentence will always lose that race. This one asks a much
 * blunter question and leans on `feature` to keep it honest.
 */
const DURABILITY_WORDS =
  /\b(?:persist(?:s|ed|ent|ence|ing)?|durabl[ey]|durability|surviv(?:e|es|ed|ing)|checkpoint(?:s|ed|ing)?|resum(?:e|es|ed|ing|ption)|restor(?:e|es|ed|ing)|outliv(?:e|es|ed|ing)|preserved|lost|kept|restarts?|reboots?|crash(?:es|ed)?|failover|cold\s+starts?|redeploys?|deploys?)\b|\b(?:torn\s+down|brought\s+back|still\s+there|waiting\s+for\s+you)\b/i;

/**
 * The words that make it about something Affiant is responsible for. Without one of
 * these a README may say what it likes about deploys and restarts.
 */
const SUBJECT_WORDS = /\b(?:pause[ds]?|pending|entr(?:y|ies)|approvals?|turns?|calls?|work|rows?)\b/i;

/**
 * What makes a sentence a quotation, a denial or a *limitation* rather than a claim,
 * when it appears in the same sentence **before** the durability word.
 *
 * Two classes, and both are needed. The **denials** are the obvious ones — a README
 * that states the rule says "no claim that a pause survives a process restart may
 * rest on …", which is CV-5 being quoted rather than a promise being made. The
 * **limitations**, `alone` and `only`, are the other half of the same rule: "the
 * Docket row alone is the durable state" is CV-5's own conclusion, and a lint that
 * refused it would force every honest adapter to stop saying the one thing the rule
 * wants said. A sentence that restricts durability to the Docket row is not claiming
 * durability of a framework feature; it is denying it of everything else.
 *
 * This is the whole of the lint's reading of prose, and it is deliberately blunt. The
 * cost is that a sentence could be written to slip through — "there is no question
 * that a pause survives a process restart", "only a pending approval survives a
 * restart" — and the answer to that is that such a sentence would be a false claim a
 * person put there on purpose, which is not what a lint is for. What a lint is for is
 * the sentence written in good faith on a Friday that nobody notices is a promise.
 */
const NEGATIONS =
  /\b(?:no|not|never|cannot|can't|without|nothing|neither|nor|unsupported|rather\s+than|instead\s+of|would\s+have\s+to|does\s+not|is\s+not|are\s+not|alone|only)\b/i;

/**
 * The runtime durability mechanisms a `feature` may name, beside the package's own
 * declared `surfaces`. Read from ADAPTER-CLAIMS.md rather than hard-coded, so the
 * prose a reader is given and the list the lint enforces are one thing.
 *
 * Without a closed list, `feature` is a free string: an author writes one claim,
 * names it anything, and every durability sentence in the README is backed by it.
 */
export function featureNamesIn(text) {
  const heading = text.search(/^#{2,6} .*The feature names a claim may use/m);
  if (heading < 0) return null;
  // From the line AFTER the heading to the next heading of ANY level, not to the next
  // `## `. A subsection added under this one would otherwise have its bullets read as
  // feature names, which is the list widening silently — and a closed list that widens
  // silently is not a closed list.
  const rest = text.slice(heading);
  const firstBreak = rest.indexOf('\n');
  const body = firstBreak < 0 ? '' : rest.slice(firstBreak + 1);
  const next = body.search(/^#{1,6} /m);
  const section = next < 0 ? body : body.slice(0, next);
  return [...section.matchAll(/^- `([a-z0-9][a-z0-9-]*)`/gm)].map(([, name]) => name);
}

/** The allowed feature names, from ADAPTER-CLAIMS.md, or null when it does not carry the list. */
function allowedFeatureNames() {
  const path = join(repoRoot, 'conformance', 'ADAPTER-CLAIMS.md');
  if (!existsSync(path)) return null;
  return featureNamesIn(readFileSync(path, 'utf8'));
}

// ---------------------------------------------------------------------------
// Versions
// ---------------------------------------------------------------------------

/** A semantic version as its comparable parts, or null when it is not one. */
export function parseVersion(text) {
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
export function compareVersions(a, b) {
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
export function satisfies(version, range) {
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
    return { known: true, ok: version.major === floor.major && version.minor === floor.minor };
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

// ---------------------------------------------------------------------------
// The registry
// ---------------------------------------------------------------------------

/**
 * The npm error classes that mean the registry could not be **reached**, as opposed
 * to answered. Only these are exit code 2.
 *
 * A 404 or a 403 is an answer: the runtime is named wrong, or it is private, and
 * either way the declaration is the defect. Treating those as "unreachable" would let
 * an adapter's CI fall back to `--offline` and report CV-5 green for a package whose
 * declared runtime does not exist.
 */
const NETWORK_CLASSES = [
  'ENOTFOUND',
  'EAI_AGAIN',
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'ENETUNREACH',
  'ENETDOWN',
  'EHOSTUNREACH',
  'EPROTO',
  'ERR_SOCKET_TIMEOUT',
  'FETCH_ERROR',
  'ERR_SOCKET_CONNECTION_TIMEOUT',
];

/** Whether what npm said is a network fault (exit 2) rather than a registry answer (exit 1). */
export function isNetworkFailure(message) {
  const text = String(message ?? '');
  if (/\b(?:E404|E403|E401|ERR_PNPM_FETCH_40\d)\b/.test(text)) return false;
  return NETWORK_CLASSES.some((code) => text.includes(code));
}

/** `npm view <name> dist-tags --json`. Throws with npm's own output on the message. */
function readDistTags(name) {
  try {
    const stdout = execFileSync('npm', ['view', name, 'dist-tags', '--json'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const tags = JSON.parse(stdout);
    return tags !== null && typeof tags === 'object' ? tags : null;
  } catch (error) {
    const detail = [error?.message, error?.stderr, error?.stdout].filter(Boolean).join('\n');
    const failure = new Error(detail === '' ? String(error) : detail);
    failure.network = isNetworkFailure(detail);
    throw failure;
  }
}

// ---------------------------------------------------------------------------
// Sentences
// ---------------------------------------------------------------------------

/** The README split into sentences, each with the offset it starts at. */
export function sentencesOf(text) {
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
  const flat = String(sentence).replace(/\s+/g, ' ').trim();
  return flat.length <= 160 ? flat : `${flat.slice(0, 157)}…`;
}

/**
 * What the detector makes of one sentence: whether it is a durability claim, and
 * which declared feature (if any) backs it.
 */
export function readSentence(sentence, features) {
  const durability = DURABILITY_WORDS.exec(sentence);
  if (durability === null) return { claim: false };
  if (!SUBJECT_WORDS.test(sentence)) return { claim: false };
  if (NEGATIONS.test(sentence.slice(0, durability.index))) {
    return { claim: false, discounted: true, word: durability[0] };
  }
  const named = features.filter((feature) => sentence.includes(feature));
  return { claim: true, word: durability[0], backedBy: named };
}

// ---------------------------------------------------------------------------
// The checks, over data rather than over a directory
// ---------------------------------------------------------------------------

/**
 * Every check this lint makes, as a pure function of what it read. The command below
 * and the self-test both go through here, so the corpus exercises the checks a real
 * run makes rather than a copy of them.
 *
 * @param manifest the package's `package.json`, parsed
 * @param readme   the package's `README.md`, or null when it has none
 * @param latest   the runtime's `latest` dist-tag as a parsed version, or null when
 *                 the registry was not read
 */
export function inspect(manifest, readme, latest, log = () => {}) {
  const failures = [];
  const fail = (message) => failures.push(message);

  const adapter = manifest?.affiant?.adapter;
  if (adapter === undefined || adapter === null || typeof adapter !== 'object') {
    fail(
      'package.json carries no "affiant": { "adapter": … } block. An adapter package declares ' +
        'its runtime, the surfaces it supports and its durability claims; see ' +
        'conformance/ADAPTER-CLAIMS.md.',
    );
    return failures;
  }

  const runtime = adapter.runtime;
  if (typeof runtime !== 'string' || runtime.trim() === '') {
    fail('affiant.adapter.runtime must be the npm package name of the runtime this adapter is for');
  }
  const surfaces = Array.isArray(adapter.surfaces) ? adapter.surfaces : [];
  if (!Array.isArray(adapter.surfaces) || adapter.surfaces.some((s) => typeof s !== 'string')) {
    fail('affiant.adapter.surfaces must be an array of the runtime surfaces this adapter supports');
  } else if (surfaces.length === 0) {
    fail('affiant.adapter.surfaces is empty: an adapter that supports no surface is not an adapter');
  }
  const claims = Array.isArray(adapter.durabilityClaims) ? adapter.durabilityClaims : null;
  if (claims === null) {
    fail('affiant.adapter.durabilityClaims must be an array — `[]` where the package claims none');
  }

  const peerRange = manifest?.peerDependencies?.[runtime];
  if (typeof peerRange !== 'string') {
    fail(
      `affiant.adapter.runtime is ${JSON.stringify(runtime)}, which this package does not declare ` +
        `as a peer dependency. CV-5 is about a claim resting on a version the package pins at ` +
        `build time, and a runtime it does not depend on pins nothing.`,
    );
  } else {
    log(`OK    runtime ${runtime}, declared peer range ${peerRange}`);
  }

  // --- 1. every declared claim -------------------------------------------
  const mechanisms = allowedFeatureNames();
  if (mechanisms === null) {
    fail(
      'conformance/ADAPTER-CLAIMS.md does not carry the "### The feature names a claim may use" ' +
        'section, so the allowed feature names cannot be read. The list is prose and data at once ' +
        'on purpose; without it `feature` is a free string and one claim backs every sentence.',
    );
  }
  const allowed = [...surfaces, ...(mechanisms ?? [])];
  const featureNames = [];

  for (const [index, claim] of (claims ?? []).entries()) {
    const where = `durabilityClaims[${String(index)}]`;
    if (claim === null || typeof claim !== 'object') {
      fail(`${where} is not an object: a claim is { "feature": …, "since": … }`);
      continue;
    }
    if (typeof claim.feature !== 'string' || claim.feature.trim() === '') {
      fail(`${where}.feature must name the runtime feature the claim rests on`);
    } else if (mechanisms !== null && !allowed.includes(claim.feature)) {
      fail(
        `${where}.feature is ${JSON.stringify(claim.feature)}, which is neither one of this ` +
          `package's declared surfaces (${surfaces.join(', ') || 'none'}) nor one of the runtime ` +
          `durability mechanisms conformance/ADAPTER-CLAIMS.md names (${(mechanisms ?? []).join(', ')}). ` +
          `A free-string feature is one claim that backs every sentence in the README.`,
      );
    } else {
      featureNames.push(claim.feature);
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
      log(`OK    ${where}: ${String(claim.feature)} — ${runtime} ${since.raw} ≤ latest`);
    }
  }
  if (claims !== null && claims.length === 0) {
    log('OK    durabilityClaims is empty: this package claims no durability beyond the Docket row');
  }

  // --- 2. the README ------------------------------------------------------
  if (readme === null) {
    fail(
      'no README.md. CV-5 is a rule about what an adapter\'s documentation claims, and a package ' +
        'with no documentation has nowhere to state the boundary.',
    );
    return failures;
  }

  let found = 0;
  let discounted = 0;
  let unbacked = 0;
  for (const sentence of sentencesOf(readme)) {
    const verdict = readSentence(sentence.text, featureNames);
    const line = lineOf(readme, sentence.at);
    if (verdict.discounted === true) {
      discounted += 1;
      log(
        `      README.md:${String(line)} — carries ${JSON.stringify(verdict.word)} about something ` +
          `Affiant is responsible for, and denies or quotes it first, so it is not a claim: ` +
          `"${quote(sentence.text)}"`,
      );
      continue;
    }
    if (verdict.claim !== true) continue;
    found += 1;
    if (verdict.backedBy.length === 0) {
      unbacked += 1;
      fail(
        `README.md:${String(line)} reads as a durability claim — it carries ` +
          `${JSON.stringify(verdict.word)} about something Affiant is responsible for — and names ` +
          `no declared feature, so nothing backs it (CV-5). Either declare the runtime feature and ` +
          `the version it arrived in and name that feature in the sentence, or say that the Docket ` +
          `row alone is the durable state. The sentence: "${quote(sentence.text)}"`,
      );
    }
  }
  // The summary never claims a check that just failed: "each naming a declared feature"
  // is printed only where every claim did.
  log(
    `${unbacked === 0 ? 'OK   ' : '     '} README.md: ${String(found)} durability claim(s) found` +
      (discounted === 0 ? '' : `, ${String(discounted)} sentence(s) discounted as denials`) +
      (found === 0
        ? ''
        : unbacked === 0
          ? ', each naming a declared feature'
          : `, ${String(unbacked)} naming none`),
  );

  return failures;
}

// ---------------------------------------------------------------------------
// The self-test
// ---------------------------------------------------------------------------

/**
 * The corpus in `adapter-claims.test/`: one directory per case, each a `package.json`,
 * a `README.md` and an `expected.json` saying what this lint must say about it.
 *
 * A lint over prose is only worth the cases somebody wrote down. Every ruling that
 * widened the detector is a case here, so a later narrowing that would let one back
 * through turns this red.
 */
function selfTest() {
  const corpus = join(here, 'adapter-claims.test');
  const failures = [];
  const fail = (message) => failures.push(message);

  if (!existsSync(corpus)) {
    console.error(`FATAL  no corpus at ${corpus}`);
    process.exit(1);
  }

  const cases = readdirSync(corpus, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  for (const name of cases) {
    const directory = join(corpus, name);
    const expected = JSON.parse(readFileSync(join(directory, 'expected.json'), 'utf8'));
    const manifest = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'));
    const readmePath = join(directory, 'README.md');
    const readme = existsSync(readmePath) ? readFileSync(readmePath, 'utf8') : null;
    const latest = parseVersion(expected.latest ?? '7.0.101');

    const problems = inspect(manifest, readme, latest);
    const outcome = problems.length === 0 ? 'pass' : 'fail';
    if (outcome !== expected.outcome) {
      console.log(`FAIL  ${name}: expected ${String(expected.outcome)}, got ${outcome}`);
      for (const problem of problems) console.log(`        ${problem}`);
      fail(`self-test ${name}: expected ${String(expected.outcome)}, got ${outcome}`);
      continue;
    }
    if (typeof expected.mentions === 'string' && !problems.join('\n').includes(expected.mentions)) {
      console.log(`FAIL  ${name}: no problem mentions ${JSON.stringify(expected.mentions)}`);
      for (const problem of problems) console.log(`        ${problem}`);
      fail(`self-test ${name}: no problem mentions ${JSON.stringify(expected.mentions)}`);
      continue;
    }
    console.log(`OK    ${name}: ${outcome} — ${String(expected.why)}`);
  }

  // The feature list's boundary, which no corpus package can exercise: it is about this
  // repository's own ADAPTER-CLAIMS.md rather than about a package. A subsection added
  // under the list must not widen it — a closed list that grows by somebody writing a
  // heading is not closed.
  const listed = [
    '## 1. What an adapter package declares',
    '',
    '### 1.1 The feature names a claim may use',
    '',
    '- `durable-execution` — a description.',
    '- `approval-checkpoint` — another.',
    '',
    '### 1.2 Something else entirely',
    '',
    '- `not-a-feature` — a bullet that is not a feature name.',
    '',
    '## 2. What the lint checks',
    '',
    '- `nor-is-this` — nor is this.',
  ].join('\n');
  const names = featureNamesIn(listed);
  if (JSON.stringify(names) !== JSON.stringify(['durable-execution', 'approval-checkpoint'])) {
    fail(
      `self-test: the feature list must stop at the next heading of any level, not at the next ` +
        `\`## \` — read ${JSON.stringify(names)}`,
    );
  } else {
    console.log('OK    feature list: stops at the next heading of any level');
  }
  if (featureNamesIn('# A file with no such section\n\n- `nope`\n') !== null) {
    fail('self-test: a file with no feature-list section reads as null, not as an empty list');
  }

  // The registry classifier, which no corpus package can exercise: a 404 is an answer
  // about the declaration and a network fault is not, and only the second is exit 2.
  const classes = [
    ['npm error code E404\nnpm error 404 Not found', false],
    ['npm error code E403', false],
    ['npm error code ENOTFOUND registry.npmjs.org', true],
    ['npm error code ECONNREFUSED', true],
    ['npm error code EAI_AGAIN', true],
    ['npm error request to https://registry.npmjs.org failed, reason: ETIMEDOUT', true],
    ['npm error code E404 for a host with ENOTFOUND in its proxy log', false],
  ];
  for (const [message, network] of classes) {
    if (isNetworkFailure(message) !== network) {
      fail(
        `self-test: isNetworkFailure(${JSON.stringify(message.split('\\n')[0])}) must be ` +
          `${String(network)} — a 404 is an answer about the declaration (exit 1) and only an ` +
          `unreachable registry is exit 2`,
      );
    }
  }
  console.log(`OK    registry classifier: ${String(classes.length)} case(s)`);

  console.log('');
  if (failures.length > 0) {
    console.error(`${failures.length} problem(s):`);
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }
  console.log(`adapter claims lint self-test: ${String(cases.length)} case(s), 0 problems`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// The command
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
if (args.includes('--self-test')) selfTest();

const offline = args.includes('--offline');
const target = args.find((arg) => !arg.startsWith('--'));

if (target === undefined) {
  console.error(
    'usage: node conformance/lint/adapter-claims.mjs <package directory> [--offline]\n' +
      '       node conformance/lint/adapter-claims.mjs --self-test',
  );
  process.exit(1);
}

const packageDir = resolve(target);
const manifestPath = join(packageDir, 'package.json');
const readmePath = join(packageDir, 'README.md');

if (!existsSync(manifestPath)) {
  console.error(`FATAL  no package.json at ${manifestPath}`);
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
console.log(`adapter claims lint — ${String(manifest.name)}@${String(manifest.version)} (CV-5)`);

let latest = null;
let unreachable = false;
const runtime = manifest?.affiant?.adapter?.runtime;
if (typeof runtime === 'string' && runtime.trim() !== '') {
  if (offline) {
    console.log(
      `SKIP  the registry: --offline was passed, so ${runtime}'s dist-tags were not read and no ` +
        `declared claim was checked against a published version. This run does not verify CV-5's ` +
        `dist-tag half.`,
    );
  } else {
    try {
      const tags = readDistTags(runtime);
      latest = parseVersion(tags?.latest);
      if (latest === null) {
        console.error(`${runtime}'s registry entry has no readable \`latest\` dist-tag`);
        process.exit(1);
      }
      console.log(`OK    registry: ${runtime}@latest is ${latest.raw}`);
    } catch (error) {
      unreachable = error.network === true;
      console.error(
        `could not read ${runtime}'s dist-tags: ${quote(error.message)}. ` +
          (unreachable
            ? 'That is a network fault, so this run verified no declared claim against a ' +
              'published dist-tag; pass --offline to run the rest, and say so wherever the ' +
              'result is recorded.'
            : 'That is the registry answering, not a network fault: the declared runtime is ' +
              'named wrong or cannot be read, which is a defect in the declaration.'),
      );
      process.exit(unreachable ? 2 : 1);
    }
  }
}

const readme = existsSync(readmePath) ? readFileSync(readmePath, 'utf8') : null;
const problems = inspect(manifest, readme, latest, (line) => {
  console.log(line);
});

console.log('');
if (problems.length > 0) {
  console.error(`${problems.length} problem(s):`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log(
  `${String(manifest.name)}: CV-5 satisfied` +
    (offline ? ' for everything checkable offline (the registry half was skipped)' : ''),
);
