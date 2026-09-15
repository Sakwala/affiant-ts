# Changelog — @affiant/adapter-ai-sdk

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); the
package follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Every entry
cites the rule ids it satisfies, which resolve in
[`INVARIANTS.md`](https://github.com/Sakwala/affiant-protocol/blob/main/INVARIANTS.md).

Repository-wide changes — the workspace, the protocol pin, the other packages — are in
the [root changelog](../../CHANGELOG.md).

## [Unreleased]

### Added

- **The package, at `0.1.0-alpha.0`.** `affiantTools(gate, definitions, options?)`
  returns an AI SDK `ToolSet` whose every `execute` calls the gate with the turn context
  the SDK supplied for that call; `affiantToolsContext(ctx, tools)` builds the
  `toolsContext` map a host passes per turn; `stopWhenFiled()` ends an agent loop once an
  Affidavit is filed; and `@affiant/adapter-ai-sdk/inference` exposes
  `createInferencePort({ model })`, one tool-free structured call per inference.

- **Coverage is settled when the `ToolSet` is built, not on the first call** (CV-4,
  CV-1). A write-capable definition the adapter cannot intercept — provider-executed,
  hosted-MCP, no `execute`, or exposed as a dynamic tool — is refused there with
  `coverage-refused` naming the tool and the category, unless the gate already carries a
  declaration for it, in which case its proposals file `pending` and `blocked` (AZ-4).

- **A call with no usable turn context is refused, never defaulted** (GT-2, CV-2). The
  context arrives through the SDK's own per-tool channel, is validated against the
  `contextSchema` the adapter declares, and is used once; there is no registry keyed by
  conversation and no shared default.

- **The gate's write path is what the SDK calls, and a write tool's own `execute` is
  not** (GT-6). The suites carry a tripwire `execute` on every write fixture, so a call
  that ever reached one would fail the run.

- **The SDK's approval mechanism is not used** (AZ-5). Neither `needsApproval` nor
  `toolApproval` is set: the SDK reconstructs approval from client-supplied message
  history, and approval authority lives on the Docket row and nowhere else. `WorkflowAgent`
  is unsupported in this version because its package is beta and its peer is not on the
  `latest` dist-tag (CV-5).

- **Node, workerd and Bun.** The behavioural suites run on Node 22 and inside workerd,
  both merge-blocking, and under Bun best-effort; `src/` compiles with no `@types/node`
  in scope and a lint keeps Durable Object storage unreachable from it (RT-1, RT-3). One
  Node-only suite reads the installed `ai` version and holds it to the declared peer
  range and the pinned development dependency (CV-5).
