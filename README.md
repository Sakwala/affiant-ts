# affiant-ts

[Affiant](https://affiant.dev) for TypeScript — sworn provenance for every AI write.

Affiant turns every database write an LLM agent proposes into an **Affidavit**: a per-field evidence record (the value, the previous value, where each value came from, how confident) filed in a **Docket** and shown as an **Evidence Card** that a person approves, amends or rejects before the host writes. A **Standing Order** is a policy verdict that approves a write with no person present.

This repository is the TypeScript implementation. It is held equivalent to the .NET packages by the shared rulebook at [Sakwala/affiant-protocol](https://github.com/Sakwala/affiant-protocol): the same wire schemas, the same numbered invariants, the same conformance fixtures — run in CI here on Node, Cloudflare workerd and Bun.

## Packages (planned)

| Package | What it is |
|---|---|
| `@affiant/contract` | the wire types and a vendorable JSON Schema, pinned to a protocol tag |
| `@affiant/evidence-card` | `<affiant-evidence-card>`, a framework-agnostic Web Component that renders an Evidence Card |
| `@affiant/core` | the gate — Affidavit capture, interceptors, projection, policy, the Docket; published to npm only once the public parity report and the conformance driver are green |
| `@affiant/conformance-driver` | runs the protocol's fixture suite against this implementation |

Later: `@affiant/store-postgres`, `@affiant/adapter-ai-sdk`, `@affiant/adapter-langchain`.

## Status

Opened 2026-09-04, empty by design, building in public from day 0. Nothing is on npm yet. Follow progress in [Discussions](https://github.com/Sakwala/affiant-ts/discussions) and the [Affiant roadmap](https://github.com/Sakwala/affiant/blob/main/ROADMAP.md).

## Related

- [Sakwala/affiant](https://github.com/Sakwala/affiant) — the .NET implementation (ten NuGet packages at `v1.0.0-beta.1`) and the two live demos
- [Sakwala/affiant-protocol](https://github.com/Sakwala/affiant-protocol) — the rulebook

## Licence

Apache-2.0 — see [LICENSE](LICENSE).
