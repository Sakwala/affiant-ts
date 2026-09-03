# Changelog

All notable changes to this repository are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); the packages follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Every entry that changes a wire type or a vendored schema names the
[`Sakwala/affiant-protocol`](https://github.com/Sakwala/affiant-protocol) tag it
was made against.

## [Unreleased]

### Fixed

- The seed fixtures were described as payloads captured off a shipped
  implementation's wire, on the README, in both package READMEs, in the Pages
  workflow and on the published demo page. They are not captures: they are
  hand-authored examples whose key sets are asserted against the shipped .NET
  serializer by the demo hosts' wire-shape tests. `Sakwala/affiant-protocol`
  corrected its own wording on 2026-09-04; every claim here now matches it. The
  pin stays at `v0.0.1-seed`, which predates the correction, so the vendored
  manifest still spells the field `capturedFrom`.
- `AffidavitField.value`, `AffidavitField.previousValue` and the values of
  `AmendmentMap` were typed `unknown`, which admits `undefined` — and a key whose
  value is `undefined` does not survive `JSON.stringify`, so a payload that
  compiled here failed the schema's `required` at the far end. They are now the
  new exported `JsonValue`.
- `<affiant-evidence-card>` blanked itself, with an uncaught `TypeError`, on a
  payload missing a required key: the shadow root was left holding only its
  stylesheet. It now checks the envelope before rendering and shows a
  `<p role="alert">` naming the reason — for a malformed payload, a failed fetch
  and a response that is not JSON alike.
- `import "@affiant/evidence-card/register"` threw
  `ReferenceError: HTMLElement is not defined` under Node, so a server-side render
  crashed on the import. The class no longer needs a DOM to be declared, and
  registration is guarded.
- Every file under `packages/contract/protocol/` is shipped in the tarball but was
  unreachable through `exports`. `@affiant/contract/protocol/*` now resolves.

### Added

- `@affiant/core@0.1.0-alpha.0` — the first commit of the gate: the turn context
  every entry point takes as a parameter (`TurnContext`, `Principal`,
  `ChannelIdentity`), the port interfaces a host implements (`InferencePort`,
  `ProjectionPort`, `AuthorizationPort`, `RiskScorer`, `Clock`, `TelemetryPort`,
  `FieldInterceptor`), the closed `ErrorCode` registry with `AffiantError`, and the
  versioned telemetry-key registry generated from `telemetry-keys.json`. Ships a
  lint that fails the build if anything under `packages/core/src` can reach Durable
  Object storage, and runs its suite on Node, Bun and workerd. The gate's model,
  canonical form, stores, pipeline and decision path land behind this. Not
  published to npm.
- `packages/contract/protocol/SHA256SUMS`, written by `sync-protocol.mjs` from the
  bytes at the pinned tag. `protocol-pin.test.ts` verifies every vendored copy
  against it on every run, offline included; the byte comparison against the tag
  itself remains, and now also catches a `SHA256SUMS` rewritten to bless a
  doctored copy.
- `packages/contract/test/generated.test.ts` — the committed generated modules
  (`src/schemas.ts`, which is what a consumer imports as
  `@affiant/contract/schemas`, and `test/fixtures.generated.ts`) are compared with
  the vendored JSON they are generated from. Nothing checked that before: a
  `sync-protocol` without a `generate` left every suite green while the shipped
  schemas described the previous tag. CI also regenerates both and fails on a diff.
- `@affiant/evidence-card@0.1.0-alpha.0` — `<affiant-evidence-card>`, a
  dependency-free custom element that renders an Affidavit for a person to
  approve, amend or reject, and emits one `affiant-decision` event. Ships a demo
  page that renders the `wire/evidence-card-request` fixture from protocol tag
  `v0.0.1-seed`. Not published to npm.
- `@affiant/contract@0.1.0-alpha.0` — the Affiant wire format as hand-written
  TypeScript types, faithful to protocol tag
  [`v0.0.1-seed`](https://github.com/Sakwala/affiant-protocol/tree/v0.0.1-seed).
  Vendors that tag's eight JSON Schemas and eight conformance fixtures
  byte-for-byte under `protocol/`, exports the schemas as importable objects from
  `@affiant/contract/schemas`, and checks the vendored copies against their
  checksums on every run and against the tag itself whenever the network is
  reachable. Not published to npm.
- pnpm workspace (`packages/*`, `spikes/*`), TypeScript 5 in strict mode with
  `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess`, ESM only, Node 22+.
- Continuous integration on three runtimes: Node 22, Bun and Cloudflare workerd.
- The card demo published to GitHub Pages on every push to `main`:
  <https://sakwala.github.io/affiant-ts/>.

[unreleased]: https://github.com/Sakwala/affiant-ts/commits/main
