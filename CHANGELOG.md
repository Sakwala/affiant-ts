# Changelog

All notable changes to this repository are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); the packages follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Every entry that changes a wire type or a vendored schema names the
[`Sakwala/affiant-protocol`](https://github.com/Sakwala/affiant-protocol) tag it
was made against.

## [Unreleased]

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
  `@affiant/contract/schemas`, and checks the vendored copies against the tag over
  the network on every run. Not published to npm.
- pnpm workspace (`packages/*`, `spikes/*`), TypeScript 5 in strict mode with
  `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess`, ESM only, Node 22+.
- Continuous integration on three runtimes: Node 22, Bun and Cloudflare workerd.
- The card demo published to GitHub Pages on every push to `main`:
  <https://sakwala.github.io/affiant-ts/>.

[unreleased]: https://github.com/Sakwala/affiant-ts/commits/main
