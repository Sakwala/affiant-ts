# affiant-ts

[Affiant](https://affiant.dev) for TypeScript — sworn provenance for every AI write.

Affiant turns every database write an LLM agent proposes into an **Affidavit**: a per-field evidence record (the value, the previous value, where each value came from, how confident) filed in a **Docket** and shown as an **Evidence Card** that a person approves, amends or rejects before the host writes. A **Standing Order** is a policy verdict that approves a write with no person present.

This repository is the TypeScript implementation. It is held equivalent to the .NET packages by the shared rulebook at [Sakwala/affiant-protocol](https://github.com/Sakwala/affiant-protocol): the same wire schemas, the same numbered invariants, the same conformance fixtures — run in CI here on Node, Cloudflare workerd and Bun.

## Packages

| Package                                            | What it is                                                                                  | State                                                                                                            |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| [`@affiant/contract`](packages/contract)           | the wire types and a vendorable JSON Schema, pinned to a protocol tag                       | in repo, not yet on npm                                                                                          |
| [`@affiant/evidence-card`](packages/evidence-card) | `<affiant-evidence-card>`, a framework-agnostic Web Component that renders an Evidence Card | in repo, not yet on npm                                                                                          |
| [`@affiant/core`](packages/core)                   | the gate — Affidavit capture, interceptors, projection, policy, the Docket, decisions       | in repo, complete for Sequences A and C; not on npm until the parity report and the conformance driver are green |
| `@affiant/conformance-driver`                      | runs the protocol's fixture suite against this implementation                               | planned                                                                                                          |

Later: `@affiant/store-postgres`, `@affiant/adapter-ai-sdk`, `@affiant/adapter-langchain`.

**Sequence A** is a chat capture end to end: a turn, a tool call the gate intercepts, an Affidavit, a person's decision, an executor's report. **Sequence C** is a capture arriving over a trusted relay's MCP surface, decided or auto-approved with the relay named on the record.

**Runtimes:** Node 22 or newer, Cloudflare workerd and Bun — no Node-only API, no filesystem, no timer owned by a package here, and Web Crypto only, which is why the canonical hash is asynchronous everywhere. All three run the whole suite in CI.

Nothing is on npm yet. The packages here are consumed through the workspace; publishing is a separate, deliberate step. For `@affiant/core` the condition is exact and mechanical: a public parity report naming what each implementation does not yet pass, and a green, merge-blocking TypeScript conformance driver. A `prepack` guard fails `npm pack` and `npm publish` with that reason until `AFFIANT_ALLOW_PUBLISH=1` is set.

## Try the card

**<https://sakwala.github.io/affiant-ts/>**

The card renders `conformance/fixtures/wire/evidence-card-request.json` from the pinned protocol tag — a hand-authored example from the rulebook's seed fixtures, whose key set is asserted against the shipped .NET serializer by the demo hosts' wire-shape tests. Approve it, reject it, or type into an amendment box and approve; every `affiant-decision` event the card emits is printed underneath. There is a read-only toggle for the record-only rendering.

## See the boundary fail correctly

**[`samples/coverage-refusal`](samples/coverage-refusal)** — a standalone sample that builds a gate, hands it four tools shaped like the Vercel AI SDK's, and prints what happens: a provider-executed write tool and a write tool with no `execute` are refused at wire-up with their categories named, a hosted-MCP write the host declared it cannot cover reaches the Docket `blocked` and cannot be decided, the one interceptable write tool produces a proposal, and the read tool passes through (CV-4, CV-1, AZ-4).

```bash
pnpm install && pnpm -C samples/coverage-refusal build
node samples/coverage-refusal/dist/demo.js
```

It is a sample, not an adoption: no host, no database, no model, and nothing here writes to anything.

## See the difference, act by act

**[`samples/scenario-deck`](samples/scenario-deck)** — one realistic support-desk scenario run twice: once through a whole-call approval gate, the shape every agent framework's "approve this tool call" gate has, and once through the Affiant gate. It prints, per act, what each surface showed the reviewer and what each one recorded — per-field provenance and previous values against one arguments blob (AF-1, AF-3), the three confidence numbers against none (AF-2), an amendment as a first-class act with the reviewer bound to it against a rejection and a re-proposal (DK-1, PV-2), a Standing Order that will not fire while a required field reads `Empty` against a rule keyed on a tool's name (GT-5), expiry as a queryable state and a resubmission with lineage against nothing at all (DK-1), and an attestation kind against a free-text string (AZ-1).

```bash
pnpm install && pnpm -C samples/scenario-deck build
node samples/scenario-deck/dist/deck.js
```

No API key: the inference port is scripted and the clock is pinned. It is not a benchmark, not adoption, and not a claim that whole-call gates are wrong — they answer "may this call run?", and Affiant answers "is this field true, and who says so?".

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
bun run --bun vitest run --project core       # Bun
pnpm -C packages/contract test:workers        # Cloudflare workerd
pnpm -C packages/core test:workers            # Cloudflare workerd
```

The protocol tag this repository pins is in [`packages/contract/protocol/PIN`](packages/contract/protocol/PIN), and everything beside it is a byte-for-byte copy of that tag. A test checksums every vendored copy against `packages/contract/protocol/SHA256SUMS` on every run — offline included — and fetches the same files from the tag itself whenever the network is reachable. A second test asserts the two committed generated modules are exactly what the generator produces from those copies. See [CONTRIBUTING.md](CONTRIBUTING.md) for how the pin moves.

## Status

Opened 2026-09-04, building in public from day 0. `@affiant/contract` and `@affiant/evidence-card` are in the repository against protocol tag `v0.0.1-seed`, and `@affiant/core` is complete for both v0.1 sequences — the pipeline, the Docket, the decision path and fifty-four declarative fixtures, run on all three runtimes. Nothing is on npm. Follow progress in [Discussions](https://github.com/Sakwala/affiant-ts/discussions) and the [Affiant roadmap](https://github.com/Sakwala/affiant/blob/main/ROADMAP.md).

## Related

- [Sakwala/affiant](https://github.com/Sakwala/affiant) — the .NET implementation (ten NuGet packages at `v1.0.0-beta.1`) and the two live demos
- [Sakwala/affiant-protocol](https://github.com/Sakwala/affiant-protocol) — the rulebook

## Licence

Apache-2.0 — see [LICENSE](LICENSE).
