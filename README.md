# affiant-ts

[Affiant](https://affiant.dev) for TypeScript — sworn provenance for every AI write.

Affiant turns every database write an LLM agent proposes into an **Affidavit**: a per-field evidence record (the value, the previous value, where each value came from, how confident) filed in a **Docket** and shown as an **Evidence Card** that a person approves, amends or rejects before the host writes. A **Standing Order** is a policy verdict that approves a write with no person present.

This repository is the TypeScript implementation. It is held equivalent to the .NET packages by the shared rulebook at [Sakwala/affiant-protocol](https://github.com/Sakwala/affiant-protocol): the same wire schemas, the same numbered invariants, the same conformance fixtures — run in CI here on Node, Cloudflare workerd and Bun.

## Packages

| Package                                            | What it is                                                                                                                                                           | State                   |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| [`@affiant/contract`](packages/contract)           | the wire types and a vendorable JSON Schema, pinned to a protocol tag                                                                                                | in repo, not yet on npm |
| [`@affiant/evidence-card`](packages/evidence-card) | `<affiant-evidence-card>`, a framework-agnostic Web Component that renders an Evidence Card                                                                          | in repo, not yet on npm |
| `@affiant/core`                                    | the gate — Affidavit capture, interceptors, projection, policy, the Docket; published to npm only once the public parity report and the conformance driver are green | planned                 |
| `@affiant/conformance-driver`                      | runs the protocol's fixture suite against this implementation                                                                                                        | planned                 |

Later: `@affiant/store-postgres`, `@affiant/adapter-ai-sdk`, `@affiant/adapter-langchain`.

Nothing is on npm yet. The two shipped packages live here and are consumed through the workspace; publishing is a separate, deliberate step.

## Try the card

**<https://sakwala.github.io/affiant-ts/>**

The card renders `conformance/fixtures/wire/evidence-card-request.json` from the pinned protocol tag — a real payload captured off a shipped implementation's wire, not a mock. Approve it, reject it, or type into an amendment box and approve; every `affiant-decision` event the card emits is printed underneath. There is a read-only toggle for the record-only rendering.

## Develop

pnpm workspace, Node 22 or newer, ESM only, TypeScript in strict mode.

```bash
pnpm install
pnpm typecheck   # tsc, no emit, every package
pnpm build       # dist/*.js + dist/*.d.ts, and the demo page
pnpm test        # vitest, every package
pnpm lint        # prettier --check
```

`pnpm build` before `pnpm test` on a clean checkout: the packages resolve each other through their published entry points.

The wire types and the fixture suite have to hold on every runtime a host might run them on, so CI runs three:

```bash
pnpm test                                     # Node 22
bun run --bun vitest run --project contract   # Bun
pnpm -C packages/contract test:workers        # Cloudflare workerd
```

The protocol tag this repository pins is in [`packages/contract/protocol/PIN`](packages/contract/protocol/PIN), and everything beside it is a byte-for-byte copy of that tag. A test fetches the same files from the tag on every run and fails if a copy has drifted. See [CONTRIBUTING.md](CONTRIBUTING.md) for how the pin moves.

## Status

Opened 2026-09-04, building in public from day 0. `@affiant/contract` and `@affiant/evidence-card` are in the repository against protocol tag `v0.0.1-seed`; nothing is on npm. Follow progress in [Discussions](https://github.com/Sakwala/affiant-ts/discussions) and the [Affiant roadmap](https://github.com/Sakwala/affiant/blob/main/ROADMAP.md).

## Related

- [Sakwala/affiant](https://github.com/Sakwala/affiant) — the .NET implementation (ten NuGet packages at `v1.0.0-beta.1`) and the two live demos
- [Sakwala/affiant-protocol](https://github.com/Sakwala/affiant-protocol) — the rulebook

## Licence

Apache-2.0 — see [LICENSE](LICENSE).
