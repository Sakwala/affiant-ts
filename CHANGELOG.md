# Changelog

All notable changes to this repository are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); the packages follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Every entry that changes a wire type or a vendored schema names the
[`Sakwala/affiant-protocol`](https://github.com/Sakwala/affiant-protocol) tag it
was made against.

## [Unreleased]

### Added

- pnpm workspace (`packages/*`, `spikes/*`), TypeScript 5 in strict mode with
  `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess`, ESM only, Node 22+.
- Continuous integration on three runtimes: Node 22, Bun and Cloudflare workerd.

[unreleased]: https://github.com/Sakwala/affiant-ts/commits/main
