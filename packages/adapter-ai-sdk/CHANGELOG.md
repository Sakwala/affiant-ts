# Changelog — @affiant/adapter-ai-sdk

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); the
package follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Every entry
cites the rule ids it satisfies, which resolve in
[`INVARIANTS.md`](https://github.com/Sakwala/affiant-protocol/blob/main/INVARIANTS.md).

Repository-wide changes — the workspace, the protocol pin, the other packages — are in
the [root changelog](../../CHANGELOG.md).

## [Unreleased]

### Added

- **The `affiant.adapter` block in `package.json`** — `runtime: "ai"`, the three surfaces this
  adapter supports, and `durabilityClaims: []`. It is what the rulebook's adapter claims lint reads
  (CV-5): an empty claim list says this package claims no durability beyond the Docket row, which is
  what AZ-5 says is true anyway, and the README's CV-5 paragraph is the other half of the answer.
- **The rulebook's adapter fixture section runs against this package** in
  `@affiant/conformance-driver`, on Node, under Bun and inside workerd — seven documents for CV-2's
  fail-closed call site and CV-3's delegation clause, in the same failing set as the conformance
  suite's sixty-eight.

- **The package, at `0.1.0-alpha.0`.** `affiantTools(gate, definitions, options?)`
  returns an AI SDK `ToolSet` whose every `execute` calls the gate with the turn context
  the SDK supplied for that call; `affiantToolsContext(ctx, tools)` builds the
  `toolsContext` map a host passes per turn; `stopWhenFiled()` ends an agent loop once an
  Affidavit is filed; and `@affiant/adapter-ai-sdk/inference` exposes
  `createInferencePort({ model })`, one tool-free structured call per inference. Each
  gated tool carries the gate it was built for under a registered symbol, which is what
  lets a refusal say precisely what it is looking at, and `affiantToolsContext` refuses a
  set holding two gates' tools (CV-1).

- **Coverage is settled when the `ToolSet` is built, not on the first call** (CV-4,
  CV-1). A write-capable definition the adapter cannot intercept — provider-executed,
  hosted-MCP or with no `execute` — is refused there with `coverage-refused` naming the
  tool and the category, unless the gate already carries a declaration for it, in which
  case its proposals file `pending` and `blocked` (AZ-4). A write-capable **dynamic**
  tool is refused unconditionally: it is this adapter's own limit rather than one of the
  rulebook's three categories, what is missing is the field schema an Affidavit is sworn
  over, and so there is nothing a declaration could put on the record.

- **A call with no usable turn context is refused, never defaulted** (GT-2, CV-2). The
  context arrives through the SDK's own per-tool channel, is validated against the
  `contextSchema` the adapter declares, and is used once; there is no registry keyed by
  conversation and no shared default. The seam checks the whole shape before the gate is
  touched: a blank conversation, tenant, channel, message id or instant is refused, and
  `principal` must be present, `null` included. The refusal reaches a host as the SDK's own
  `TypeValidationError` carrying the `AffiantError` as `cause`: `generateText` throws it,
  while `streamText` throws nothing, drops the tool call from the step and delivers the
  error to `onError`. Nothing is filed on either surface.

- **The gate's write path is what the SDK calls, and a write tool's own `execute` is
  not** (GT-6). The suites carry a tripwire `execute` on every write fixture, so a call
  that ever reached one would fail the run. Each definition is snapshotted as
  `affiantTools` reads it, so a host that mutates one after wire-up changes nothing about
  the tool that was built.

- **The SDK's approval mechanism is not used, and cannot be added back** (AZ-5, CV-1).
  Neither `needsApproval` nor `toolApproval` is set: the SDK reconstructs approval from
  client-supplied message history, and approval authority lives on the Docket row and
  nowhere else. Every built tool is frozen, the returned set is frozen, and the set's
  entry type does not admit `needsApproval` — and because a spread copy of a tool keeps
  the mark that identifies it, `affiantToolsContext` refuses any marked tool that is no
  longer frozen or that carries `needsApproval`, which is what stops
  `{ ...tool, needsApproval: true }` from being handed a turn's context. `WorkflowAgent` is unsupported in this version because the `latest` release of
  `@ai-sdk/workflow` requires a peer range only that package's `beta` dist-tag satisfies
  (CV-5).

- **Node, workerd and Bun.** The behavioural suites run on Node 22 and inside workerd,
  both merge-blocking, and under Bun best-effort; `src/` compiles with no `@types/node`
  in scope and a lint keeps Durable Object storage unreachable from it (RT-1, RT-3). One
  Node-only suite reads the installed `ai` version and holds it to the declared peer
  range and the pinned development dependency (CV-5).
