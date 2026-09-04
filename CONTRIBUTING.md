# Contributing

## Getting set up

This is a [pnpm](https://pnpm.io) workspace on Node 22 or newer. There is no
lockfile-free path — install with the lockfile that is checked in.

```bash
pnpm install
pnpm typecheck   # tsc, no emit, every package
pnpm build       # tsc emit: dist/*.js + dist/*.d.ts
pnpm test        # vitest, every package
pnpm lint        # prettier --check
pnpm format      # prettier --write
```

`pnpm build` must run before `pnpm test` on a clean checkout: the packages resolve
each other through their published entry points, which are the emitted `dist/`
files. Type checking does not need the build — `tsconfig.base.json` maps
`@affiant/contract` onto its source for `tsc`.

## The compiler settings are not negotiable

Every package extends `tsconfig.base.json`, which sets:

- `"strict": true`
- `"exactOptionalPropertyTypes": true` — an optional property may not be assigned
  `undefined` explicitly, so a type says exactly what may be absent.
- `"noUncheckedIndexedAccess": true` — indexing an array or a record yields
  `T | undefined`, which is what the wire actually gives you.
- `"verbatimModuleSyntax": true` — a type-only import must say `import type`.
- `"module": "NodeNext"` — relative imports carry the `.js` extension, ESM only.

These exist because the packages describe payloads that arrive from a network.
A type that quietly permits `undefined` where the wire permits `null` is a bug
that reaches a reviewer's screen as a blank field.

## Every rule cites the protocol ref

The wire format is not defined here. It is defined by
[`Sakwala/affiant-protocol`](https://github.com/Sakwala/affiant-protocol), and this
repository pins one of its refs — a git tag, or a commit while a version's text is
on the default branch and its tag has not been cut — in
`packages/contract/protocol/PIN`. The schemas, the conformance suite and the
machine-readable formats under `packages/contract/protocol/` are byte-for-byte
copies at that ref.

So:

- **Do not hand-edit anything under `packages/contract/protocol/`.** It is
  vendored. `packages/contract/test/protocol-pin.test.ts` checksums every tracked
  copy against `packages/contract/protocol/SHA256SUMS` on every run — offline
  included — and fetches the same files from the pinned ref whenever the network
  is reachable. `packages/contract/test/generated.test.ts` then asserts the three
  committed generated modules are exactly what those copies produce.
- **To move to a newer protocol ref**, edit `packages/contract/protocol/PIN`, run
  `node packages/contract/scripts/sync-protocol.mjs` (which rewrites
  `protocol/SHA256SUMS`), run `node packages/contract/scripts/generate-sources.mjs`,
  and commit the whole diff in one pull request. CI regenerates all three modules
  and fails on any diff, so a sync without a regenerate cannot merge. A format
  change should arrive as a reviewable diff in this repository's own history, never
  as a silent upstream shift under a running build.
- **When you add or change a type**, say in the pull request which schema at which
  ref it is faithful to. A type with no citation is a guess.
- **The conformance suite comes with the ref**, and moving the pin moves it. The
  `conformance` CI job runs it against `@affiant/core` on Node, Bun and workerd and
  asserts the failing set equals
  `packages/conformance-driver/conformance/parity/typescript-v0.1.json` exactly, in
  both directions — a document that starts failing and a document that starts
  passing both fail the build. That job is **required**: a red run cannot merge. If
  a pin bump changes what this implementation passes, publish the change by editing
  the parity manifest in the same pull request; the manifest is regenerable with
  `node packages/conformance-driver/dist/cli.js --write-manifest` but is never
  auto-committed, because a change to the failing set is a change to a published
  claim about an implementation.

## The three runtimes

The wire types and the fixture suite must hold on every runtime a host might run
them on. CI runs all three on every push; run them locally before opening a pull
request.

```bash
# Node 22+ — the default.
pnpm test

# Bun.
bun run --bun vitest run --project contract
bun run --bun vitest run --project core

# Cloudflare workerd, via @cloudflare/vitest-pool-workers.
pnpm -C packages/contract test:workers
pnpm -C packages/core test:workers
```

`@affiant/core` carries a second guard for the same rule: `packages/core/src` is
type-checked as a program of its own with no `@types/node` in scope, so `process`,
`Buffer` and `node:fs` do not resolve there at all. Tests may use Node types; the
source may not.

If a change passes on Node and fails on one of the others, that is a real finding
about the change, not a quirk of the runner. Fix the change, or write down in the
pull request exactly what does not hold and why.

## Commits and versions

- Conventional commit subjects (`feat(contract): …`, `fix(evidence-card): …`,
  `chore: …`, `docs: …`).
- Every user-visible change gets a `CHANGELOG.md` entry under `[Unreleased]`.
- Nothing is published to npm from a working branch. Publishing is a separate,
  deliberate step.
