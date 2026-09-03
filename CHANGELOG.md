# Changelog

All notable changes to this repository are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); the packages follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Every entry that changes a wire type or a vendored schema names the
[`Sakwala/affiant-protocol`](https://github.com/Sakwala/affiant-protocol) tag it
was made against.

## [Unreleased]

### Added

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

[unreleased]: https://github.com/Sakwala/affiant-ts/commits/main
