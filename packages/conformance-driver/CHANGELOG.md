# Changelog — @affiant/conformance-driver

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); the
package follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Every entry
cites the rule ids it satisfies, which resolve in
[`INVARIANTS.md`](https://github.com/Sakwala/affiant-protocol/blob/main/INVARIANTS.md).

Repository-wide changes — the workspace, the protocol pin, the other packages — are in
the [root changelog](../../CHANGELOG.md).

## [Unreleased]

### Added

- **The adapter section** (`src/adapter.ts`, `src/adapters/ai-sdk.ts`). Runs every document the
  rulebook's `adapter` manifest section lists against one Affiant adapter, and reports the same
  `results.schema.json` entries the conformance section does. Everything in the runner is the
  rulebook's — the gate built from `given.gate` exactly as a conformance fixture's is, the tool
  definitions, the Docket, the expectations; the three things only a framework can answer are an
  `AdapterBinding`, so a second adapter is a second binding and no change to the runner (CV-2, CV-3).
  A write definition's own host function is a tripwire that fails the fixture if it is ever reached
  (GT-6), and a read definition's records that it ran, so a fixture can state that a refused call
  never got that far (CV-2).
- **`mergeRuns`**, because the rulebook asserts the failing set over the **union** of the sections a
  run covered: one run document, one comparison, and a failing adapter fixture is a failing fixture
  like any other.
- **`affiant-conformance adapter --package <name>`**, the adapter section alone — what a host
  working on an adapter reaches for rather than waiting for the other sixty-eight documents.
- **`adapters[]` on the parity manifest**, naming `@affiant/adapter-ai-sdk`, the `ai` version the run
  resolved, how many documents the section covered, and what the rulebook's adapter claims lint said
  about the package (CV-5). The manifest moves to
  [`conformance/parity/typescript-v0.2.json`](conformance/parity/typescript-v0.2.json).

### Changed

- `exemptions[]` no longer carries CV-2, CV-3 or CV-5. The rows are built from the vendored
  exemption file rather than retyped, so they disappeared in the same change that moved the pin —
  which is what "an implementation may not invent an exemption" is for.

- **The driver.** Runs every document the rulebook's conformance manifest lists — 61
  declarative fixtures and 7 canonical byte vectors — against `@affiant/core` through
  its own published `@affiant/core/testing` runner and its own exported
  `canonicalize` / `canonicalHash` helpers. The vectors are **reproduced**, never
  re-derived: an oracle that re-derived the binding could not catch an implementation
  whose exported helper disagreed with it, which is the substitution SR-1 exists to
  prevent (SR-1).
- **Every document is validated before it is run**, against `fixture.schema.json` or
  `canonical-vector.schema.json`, and a document that fails is not run at all —
  running it would report a pass, and a pass is the one answer it must never give.
- **A run document** validating against the rulebook's `results.schema.json`, with one
  entry per document including the ones that passed: a run that reported only failures
  could not be checked for completeness. A document the manifest lists and the driver
  cannot load is an `error`, never an absence and never a silent skip.
- **The parity manifest and the assertion**
  ([`conformance/parity/typescript-v0.1.json`](conformance/parity/typescript-v0.1.json)):
  the failing set is compared with the published claim in **both** directions, so a
  regression and a quietly-closed gap are equally loud. `skipped` is checked too — a
  skip is legitimate only where the manifest declares one. The manifest's
  `exemptions[]` are copied from the rulebook's own `coverage-exemptions.json`, each
  naming what this implementation checks instead; an implementation may not invent one.
- **Three runtimes** (RT-1). The same suite runs on Node, under Bun and inside workerd,
  and the failing set must be identical on each. The run document names the runtime,
  detected by `navigator.userAgent` rather than by the absence of Node's globals —
  under `@cloudflare/vitest-pool-workers` the compatibility layer supplies
  `process.versions.node`, so "no Node here" is not a test for workerd.
- **The Unicode version each runtime carries, measured rather than declared** (PV-3).
  PV-3 reads its boundary categories from the runtime's own character database, so from
  protocol `v0.1.3` onward every runtime in a parity manifest states which version that
  was. No runtime has to be taken at its word for it — `workerd` exposes no such field,
  and Bun's `process.versions.unicode` reads `15.1` while the regular-expression engine
  the finder consults answers for 17.0 — so `probeUnicodeVersion()` establishes it the
  way PV-3 establishes presence, by looking: code points first assigned in Unicode 14.0,
  15.0, 15.1, 16.0 and 17.0, tested against the same four `General_Category` classes,
  and the highest release all of whose code points the runtime counts as assigned is the
  version the manifest states. The suite re-takes the measurement on whichever runtime it
  is running on, and it runs on all three, so a row that goes stale turns that runtime's
  job red — the fix for which is to regenerate the manifest, not to edit the row. As
  measured on 2026-09-08: Node 22.22.1 and 24.14.0 (both ICU 78.2) at 17.0, Bun 1.3.13 and
  1.4.2 at 17.0, workerd at compatibility date 2026-03-10 at 16.0.
- **`affiant-conformance`**, a command a host embedding `@affiant/core` can run against
  its own installation to produce and publish the same evidence. Exit `0` when the
  failing set equals the manifest, `1` otherwise, with a line per document saying which
  one changed and at which path.

### Notes

- The package is private. It is the check that stands in front of this repository's
  `main` branch, published here so anybody can read what "conformant" is being asserted
  from.
- The `protocolTag` is the rulebook's `v0.1.3` tag, the one
  `packages/contract/protocol/PIN` pins and this package vendors byte for byte. The
  manifest belongs beside the fixtures it is about, in the rulebook repository; it moves
  there in a pull request of its own.
