# `@affiant/adapter-ai-sdk`

Affiant tool definitions as an [AI SDK](https://ai-sdk.dev) `ToolSet`. Every write the
model proposes runs through the Affiant gate with the turn's own context and is **filed
as an Affidavit** instead of executing; a person approves, amends or rejects it, and the
host's own executor performs the write afterwards.

This package is the seam. The gate, the Affidavit, the Docket and the policy chain are
in [`@affiant/core`](../core#readme); the rules both of them are held to are the
numbered invariants in
[`INVARIANTS.md`](https://github.com/Sakwala/affiant-protocol/blob/main/INVARIANTS.md),
cited throughout below.

- **Status:** `0.1.0-alpha.0`.
- **Peers:** `ai` `^7.0.0` and `@affiant/core` `>=0.1.0-alpha.1`. No provider package is
  a dependency — the host passes whatever `LanguageModel` it already has.

## What a host wires

Four things, in this order.

**1. Build the `ToolSet` once, from the gate and the host's tool definitions.**

```ts
import { affiantTools, affiantToolsContext, stopWhenFiled } from "@affiant/adapter-ai-sdk";

const tools = affiantTools(gate, [findTicket, updateTicket], {
  onResult(result, ctx) {
    // The whole gated result, with the context it ran under. The Evidence Card to
    // deliver to a reviewer is `result.card` when `result.kind === "write"`.
  },
});
```

`affiantTools` classifies every definition as it builds the set. A write-capable tool
the adapter cannot intercept — one the provider runs, a hosted-MCP tool, a tool with no
`execute` to stand in front of — is refused **here**, when the set is built, with
`AffiantError("coverage-refused")` naming the tool and the category; unless the host has
already called `gate.declareUncovered(tool, category)`, in which case its proposals are
filed on the Docket `pending` and `blocked`, which can never be decided and never
executes (CV-4, CV-1, AZ-4). There is no option that turns the gate off for a tool it
covers.

**2. Build the per-turn context map and pass it as `toolsContext`.**

```ts
const result = await agent.generate({ prompt: turn.utterance });
// where the agent was constructed with:
//   toolsContext: affiantToolsContext(ctx, tools)
```

`ctx` is the `TurnContext` for this turn: conversation, tenant, channel, principal and
the unmodified turn. The SDK validates it against each tool's `contextSchema` and hands
it to the tool's `execute`; the adapter wraps the gate around that call for that context
and drops it afterwards. A call whose context is missing or the wrong shape **throws** —
there is no shared default to fall back to, because two conversations must never observe
each other's context (GT-2, CV-2).

A single `ToolLoopAgent` reused across turns sets the context per step instead, since
`toolsContext` is a constructor setting rather than a `generate()` argument:

```ts
new ToolLoopAgent({
  model,
  tools,
  stopWhen: stopWhenFiled(),
  prepareStep: () => ({ toolsContext: affiantToolsContext(ctx, tools) }),
});
```

**3. Stop the loop at the filing.**

`stopWhenFiled()` is a `StopCondition` that holds as soon as a step contains a gated
write result. Without it the model carries on as though the write had happened; it has
not, and it will not until a person decides (AZ-7). It composes with the SDK's own
conditions: `stopWhen: [stopWhenFiled(), stepCountIs(8)]`.

**4. Give the gate an inference port, if you have no model client of your own.**

```ts
import { createInferencePort } from "@affiant/adapter-ai-sdk/inference";

const inference = createInferencePort({ model });
```

One **tool-free** `generateText` call per inference, with the field schema as the
structured output: the model is asked for values, never for an action (GT-1 step 3). A
field it could not fill comes back **absent**, not `null` — absent is "not proposed" and
is left out of the Affidavit, while `null` is a value (AF-1). The `presence` the model
reports is a hint; the gate establishes presence from the turn itself and never mints a
stronger grade from the model's claim about its own literalness (PV-3).

## What the model sees after a filing

Not the Affidavit, and not the Evidence Card. A gated write tool's result reaches the
model through `toModelOutput` as a compact object:

```json
{
  "outcome": "filed-for-review",
  "entryId": "…",
  "status": "pending",
  "requiresConfirmation": true,
  "fields": ["priority"],
  "blocked": null,
  "note": "Filed for review. The write has not happened and will not happen until it is approved and the host's executor runs it."
}
```

The model is never told that the write happened, because it did not: the gate does not
execute, and the only path to an executed row is the host reporting what its own
executor did (AZ-7, AZ-5). The full `GatedToolResult` — entry id, status and the Evidence
Card — goes to the host through `onResult`.

## Supported surfaces

`generateText`, `streamText` and `ToolLoopAgent` from `ai` version 7 on the `latest`
dist-tag. The adapter has no stream-specific code: `streamText` shares the tool path, and
one suite proves the gated `execute` runs and the filing reaches the stream.

Two things are **not** supported in this version:

- **`WorkflowAgent`** (`@ai-sdk/workflow`). It is a package this adapter does not
  depend on and has not been tested against, and the durability a workflow offers is
  the reason a host would reach for it. CV-5 says no claim that a pause survives a
  process restart may rest on a third-party runtime feature that is not published under
  the `latest` dist-tag with the provider pinned at build time — and
  `@ai-sdk/workflow`'s own `latest` release requires the peer `workflow ^5.0.0-beta.42`,
  a range only that package's `beta` dist-tag satisfies. Until a run proves otherwise,
  the Docket row alone is the durable state, which is what AZ-5 says it is anyway.
- **A write-capable `dynamicTool`.** A dynamic tool's input shape is not known until it
  is called, so there is no field schema to swear an Affidavit over and no way to say
  what a call proposes to write. `affiantTools` refuses one when the set is built
  (CV-4). Read-only dynamic tools are unaffected.

## The SDK's approval flow is not used

The adapter sets neither `needsApproval` nor `toolApproval`. The SDK's approval flow
returns a `tool-approval-request` part to the client and reconstructs the answer from the
message history the client sends back on the next call. AZ-5 puts approval authority on
the Docket row and nowhere else: nothing replayed from a client's history, a chat
transcript or a framework checkpoint stands in for that row. So this package does not
offer a second place for approval to appear to live. A person decides through
`gate.decide`; the host's executor takes the rows its Docket store lists as approved and
unexecuted, performs the write, and reports the outcome with `gate.markExecuted`.

`needsApproval` on a tool is in any case deprecated in `ai` 7 — "Tool approval is
handled on a `generateText` / `streamText` level now", says its own type declaration —
so nothing is lost by not setting it.

## The honest boundary

The gate never calls a write-capable tool's own `execute`, and the function the SDK calls
holds no reference to it (GT-6). What no wire-up check can see is a tool that opens its
own connection and writes inside its body. That is a limit, stated as one rather than
pretended away: a tool that writes in its body is outside the guarantee.

## Runtimes

Merge-blocking on **Node 22** and on **workerd** (through
`@cloudflare/vitest-pool-workers`, with `nodejs_compat`), and run best-effort under
**Bun**. The package's `src/` is compiled as a program with no `@types/node` in scope, so
a Node built-in cannot be reached from the published surface by accident, and a lint
keeps Durable Object storage unreachable from it (RT-1, RT-3).

The `ai` version the suites ran against is read from the installed package and asserted
against the declared peer range and the pinned development dependency, so "pinned at
build time" is a measured fact rather than a sentence (CV-5).

## Licence

Apache-2.0. See [LICENSE](./LICENSE).
