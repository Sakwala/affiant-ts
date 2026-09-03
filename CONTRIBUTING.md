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

## Every rule cites the protocol tag

The wire format is not defined here. It is defined by
[`Sakwala/affiant-protocol`](https://github.com/Sakwala/affiant-protocol), and
this repository pins one of its git tags in
`packages/contract/protocol/PIN`. The JSON Schemas and conformance fixtures under
`packages/contract/protocol/` are byte-for-byte copies of that tag.

So:

- **Do not hand-edit anything under `packages/contract/protocol/`.** It is
  vendored. `packages/contract/test/protocol-pin.test.ts` fetches the same files
  from the pinned tag and fails if a tracked copy has drifted.
- **To move to a newer protocol tag**, edit `packages/contract/protocol/PIN`, run
  `node packages/contract/scripts/sync-protocol.mjs`, run
  `node packages/contract/scripts/generate-sources.mjs`, and commit the whole diff
  in one pull request. A format change should arrive as a reviewable diff in this
  repository's own history, never as a silent upstream shift under a running build.
- **When you add or change a type**, say in the pull request which schema at which
  tag it is faithful to. A type with no citation is a guess.

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
