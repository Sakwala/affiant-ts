# Changelog — @affiant/conformance-driver

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); the
package follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Every entry
cites the rule ids it satisfies, which resolve in
[`INVARIANTS.md`](https://github.com/Sakwala/affiant-protocol/blob/main/INVARIANTS.md).

Repository-wide changes — the workspace, the protocol pin, the other packages — are in
the [root changelog](../../CHANGELOG.md).

## [Unreleased]

### Added

- **The driver.** Runs every document the rulebook's conformance manifest lists — 56
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
- **`affiant-conformance`**, a command a host embedding `@affiant/core` can run against
  its own installation to produce and publish the same evidence. Exit `0` when the
  failing set equals the manifest, `1` otherwise, with a line per document saying which
  one changed and at which path.

### Notes

- The package is private. It is the check that stands in front of this repository's
  `main` branch, published here so anybody can read what "conformant" is being asserted
  from.
- The `protocolTag` is a commit rather than a tag: the rulebook's v0.1 text is on its
  default branch and `v0.1.0` has not been cut. A commit is as immutable as a tag and,
  unlike a tag, cannot be moved under a running build. The manifest belongs beside the
  fixtures it is about, in the rulebook repository; it moves there, and the pin moves to
  the tag, in the same pull request.
