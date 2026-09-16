# @affiant/conformance-driver

The Affiant protocol's conformance suite, run against `@affiant/core` on Node, Bun and workerd — and the
published statement of exactly which documents it does not pass.

Not on npm. It is the check that stands in front of this repository's `main` branch, and it is here so that
anybody can read what "this implementation is conformant" is being asserted from.

## What a driver is, and why there is one

Affiant turns every database write an LLM agent proposes into an **Affidavit**: a per-field evidence record
carrying the proposed value, the value it replaces, where each value came from and how confident the producer
is. It is filed under a **Docket** entry and shown to a person as an **Evidence Card**, which they approve,
amend or reject before the host commits anything. The rules that record must obey are numbered in the protocol
rulebook, [`Sakwala/affiant-protocol`](https://github.com/Sakwala/affiant-protocol), in its `INVARIANTS.md`.

Those rules are pinned by a **conformance suite**: 61 declarative documents — each one a wiring, a sequence of
acts, and what must then be true — plus 7 canonical byte vectors that fix the exact bytes and digest a host's
execution grant binds to. The documents name no class, no file and no language.

A **driver** is the per-implementation program that binds them to one implementation and reports what happened.
This is the TypeScript one; the .NET line has its own. The rulebook describes the contract in
[`conformance/DRIVER.md`](https://github.com/Sakwala/affiant-protocol/blob/main/conformance/DRIVER.md), the
document format in `conformance/RUNNER.md`, and the published statement in `conformance/PARITY.md`.

## What it does

```
pnpm -C packages/conformance-driver build
pnpm -C packages/conformance-driver test           # Node
pnpm -C packages/conformance-driver test:workers   # workerd
node packages/conformance-driver/dist/cli.js       # the same run, as a command
```

1. **Pins a protocol ref.** The documents come from `@affiant/contract`, which vendors them byte-for-byte from
   one ref of the rulebook and records a sha256 for every file (`packages/contract/protocol/SHA256SUMS`). This
   package keeps no copy of its own — a second copy is a second thing to drift — and nothing here fetches
   anything at run time. The ref moves by editing `packages/contract/protocol/PIN` and re-running the sync and
   generate scripts, so a format change arrives as a reviewable diff in this repository's own history.
2. **Validates every document before running it.** A fixture is checked against `fixture.schema.json` and a
   vector against `canonical-vector.schema.json`, and a document that fails is not run: running it would report
   a pass, and a pass is the one answer it must never give. `@affiant/core/testing`'s runner applies the same
   strictness to the document's own keys — an unknown key fails the fixture, and an `expect` that states no
   fact fails as vacuous.
3. **Runs every document the manifest lists**, through the published `@affiant/core/testing` runner and the
   published `canonicalize` / `canonicalHash` helpers. The vectors are **reproduced**, never re-derived: an
   oracle that re-derived the binding could not catch an implementation whose exported helper disagreed with
   it, which is precisely the substitution rule SR-1 exists to prevent.
4. **Emits a run document** validating against the rulebook's `results.schema.json`, with one entry per
   document including the ones that passed — a run that reported only failures could not be checked for
   completeness. The committed evidence is
   [`conformance/results/typescript-0.1.0-alpha.2.json`](conformance/results/typescript-0.1.0-alpha.2.json).
5. **Asserts the failing set equals the parity manifest**, exactly, in both directions, over the **union** of
   the sections the run covered.

## The adapter section

From protocol `v0.2.0` the rulebook carries a second fixture section, `adapter`, for the three rules that are
about an adapter's seam and could not be checked before an adapter existed: CV-2's fail-closed call site, CV-3's
delegation clause, and CV-5 — which is a lint over the adapter package rather than a fixture, because no fixture
can observe a statement about documentation and packaging. The format is the rulebook's
[`conformance/ADAPTER-RUNNER.md`](https://github.com/Sakwala/affiant-protocol/blob/v0.2.0/conformance/ADAPTER-RUNNER.md):
a conformance fixture with two step kinds of its own, `adapter-build` and `adapter-call`, and five matchers of its own.
The link is to the **pinned ref**, not to a branch: `packages/contract/protocol/PIN` is what this repository vendors and
runs against, and a link to `main` would describe a document the run did not read. It moves when the pin moves.

A driver runs that section **once for every adapter its implementation ships and declares**, and an
implementation that ships none runs none of it and publishes `adapters: []`. This implementation ships one,
`@affiant/adapter-ai-sdk`, so the section runs once, against it, on every runtime — and its **twelve** documents are
in the same run document and the same failing set as the other sixty-eight, for **80** in all.

`src/adapter.ts` is the section runner and everything in it is the rulebook's: the gate built from `given.gate`
the same way a conformance fixture's is, the definitions, the Docket, the expectations. The three things only a
framework can answer — build a tool set, call one tool of it, and say what the framework was handed back — are
an `AdapterBinding`, and `src/adapters/ai-sdk.ts` is the one for the AI SDK. A second TypeScript adapter is a
second binding and no change to the runner.

Two limits worth stating, and neither is silent. The runner binds `adapter-build`, `adapter-call`, `get`, `decide`,
`markExecuted`, `resubmit`, `expireDue` and `rehydrate`; `wrap-execute` and `file` are the gate's own seams rather than
an adapter's, and a document about either belongs in the conformance section. A step kind the runner has **not** bound
is an `error` for the whole document — in the step under test and in any `prior` step alike, because a scene that was
never set makes every expectation after it meaningless.

The clauses line up by construction. The adapter variant of `fixture.schema.json` admits six of the conformance
format's clauses — `error`, `entry`, `found`, `store`, `telemetry`, `telemetryAbsent` — plus the five of its own, and
this driver binds all eleven; `card` and `canonicalHash` are the gate's own artefacts and the schema refuses them here,
so a document stating one is not run at all. Behind that the driver keeps its own guard: a clause it does not answer is
a **`fail` naming the clause**, never a pass, for a clause the format gains before this driver binds it.

CV-5's lint needs the npm registry and the package it is about is here, so it runs in this repository's
`adapter claims` job rather than in the rulebook's CI, against the **vendored** copy at
`packages/contract/protocol/conformance/lint/adapter-claims.mjs` — pinned and checksummed like every fixture.
Its verdict is what `adapters[].claimsLint` in the manifest states.

## The parity manifest

[`conformance/parity/typescript-v0.2.json`](conformance/parity/typescript-v0.2.json) is this implementation's
published statement of which documents it does **not** pass. Today it is empty.

An empty list is the strongest possible statement, and it is worth something only because the assertion is
merge-blocking: the day one of these documents stops passing is the day a pull request stops merging. The
comparison runs in **both** directions:

- a document that starts failing and is not listed — a regression, or a rule the implementation never met and
  nobody wrote down;
- a document that starts passing and is still listed — a gap that has been closed and not published.

A check that caught only the first would let a fix rot unrecorded, and the manifest would become a document
nobody trusts. `skipped` is not a third bucket that quietly avoids this: a skip is legitimate only where the
manifest declares it, and the assertion checks that too.

The manifest is regenerable (`--write-manifest`) but **never auto-committed**. A change to the failing set is a
change to a published claim about an implementation and belongs in a pull request a person read.

`src/parity.ts` is the source and the JSON file is the artifact; a suite asserts the two are identical, so the
file cannot be regenerated without being committed, or edited without the module saying so.

### Exemptions

Two rulebook areas cannot be checked by a declarative fixture, and the manifest states this implementation's
position on them rather than leaving a reader to guess. The `exemptions[]` rows are **copied** from the
rulebook's own `conformance/lint/coverage-exemptions.json` — an implementation may not invent one, because
exempting yourself from a rule is not a parity report — and each adds `checkedInstead`, naming the suite or
lint that stands in its place.

There are **eight rows, and every one of them names what stands in for it**. The three that used to name
nothing were CV-2, CV-3 and CV-5, whose fixtures the rulebook owed to the first adapter; the adapter arrived,
the rows went with it, and those rules are covered now — CV-2 and CV-3 by the adapter fixture section this
driver runs, CV-5 by the rulebook's adapter claims lint, which the `adapter claims` job runs against the
package. A manifest read at a `v0.2` ref must carry an `exemptions[]` equal to the exemption file as of its
own ref, and the rulebook's lint checks it; building the list from the vendored file rather than retyping it
is what makes that true by construction.

## Runtimes

The suite runs on all three runtimes `@affiant/core` claims — Node 22, Bun and workerd — and **the failing set
must be identical on each** (RT-1). A document that fails on one runtime only is a failing document. The run
document names the runtime it ran on, detected by `navigator.userAgent` rather than by the absence of Node's
globals: under `@cloudflare/vitest-pool-workers` the Node compatibility layer supplies `process.versions.node`,
so "no Node here" is not a test for workerd and a document would name the wrong runtime — the one fact RT-1 is
about.

## For a host

`affiant-conformance` runs the same suite against the `@affiant/core` a host has installed, so a host can
publish its own run document beside whatever it claims about the framework it depends on.

```
affiant-conformance                     # both sections, write the document, assert against the manifest
affiant-conformance --runtime bun       # name the runtime on the document
affiant-conformance --out ./artifacts   # write the document elsewhere
affiant-conformance --no-write          # assert only

affiant-conformance adapter --package @affiant/adapter-ai-sdk   # the adapter section alone
```

Exit `0` when the failing set equals the manifest exactly, `1` on any difference in either direction, with a
line per document saying which one changed and at which path.

The library surface is the same thing without the process:

```ts
import {
  aiSdkAdapter,
  compareToManifest,
  mergeRuns,
  runAdapterSection,
  runConformance,
} from "@affiant/conformance-driver";

const run = mergeRuns(await runConformance(), await runAdapterSection(aiSdkAdapter));
const verdict = compareToManifest(run);
if (!verdict.matches) process.exitCode = 1;
```

## Where the manifest is published

The manifest belongs beside the fixtures it is about, and the rulebook carries it — at
[`conformance/parity/typescript-v0.1.json`](https://github.com/Sakwala/affiant-protocol/blob/v0.1.3/conformance/parity/typescript-v0.1.json)
for the `v0.1` readings, with the run each was read off beside it under
[`conformance/results/`](https://github.com/Sakwala/affiant-protocol/tree/v0.1.3/conformance/results). The
`v0.2` manifest is published there under its own name, in a pull request of its own.
The copy under `conformance/` here is the one this package's CI asserts against and the one the upstream copy is
made from; the two move in the same pull request, because a manifest names the ref it was produced against and a
copy that disagreed with its own run would be a claim nobody could check.

## Licence

Apache-2.0.
