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

A write-capable **dynamic** tool is the one refusal a declaration does not lift. The
three categories a host may declare are the rulebook's; a dynamic tool is this adapter's
own limit, and what is missing is the field schema the Affidavit would be sworn over —
so there is nothing a Docket record could be made from.

**2. Build the per-turn context map and pass it as `toolsContext`.**

```ts
const result = await agent.generate({ prompt: turn.utterance });
// where the agent was constructed with:
//   toolsContext: affiantToolsContext(ctx, tools)
```

`ctx` is the `TurnContext` for this turn: conversation, tenant, channel, principal and
the unmodified turn. The SDK validates it against each tool's `contextSchema` and hands
it to the tool's `execute`; the adapter wraps the gate around that call for that context
and drops it afterwards. A call whose context is missing, incomplete or carrying a blank
conversation, tenant, channel, message id or instant **throws** an
`AffiantError("wireup-invalid")` before the gate is touched — there is no shared default
to fall back to, because two conversations must never observe each other's context
(GT-2, CV-2). `principal` must be present; `null` is a valid value and means the host
resolved no identity.

That refusal reaches a host differently on each surface, and on neither is it the plain
`AffiantError`. The SDK validates the context itself and raises its own
`TypeValidationError` with the `AffiantError` as `cause`. `generateText` **throws** it,
so `catch (error) { error.cause }` reaches it. `streamText` **throws nothing and rejects
nothing**: the tool call is dropped from the step — the step's content is the
`tool-call` part with no tool result beside it. The `TypeValidationError` reaches the
host in two places: the `onError` callback, and an `error` part on `fullStream`. A host
that passes no `onError` and reads only `textStream` sees a turn in which the model
called a tool and nothing came back, with the SDK's default handler printing the error
to stderr. Either way **nothing is filed**. Calling a tool's `execute` yourself throws
the `AffiantError` unwrapped.

`toolsContext` is a constructor setting on `ToolLoopAgent` rather than a `generate()`
argument, so the constructor form above is for an agent built for **exactly one turn**
and thrown away. An agent kept alive across turns supplies the turn through
`prepareStep` and **never** sets a constructor-level `toolsContext`:

```ts
new ToolLoopAgent({
  model,
  tools,
  stopWhen: stopWhenFiled(),
  // The only source of the turn. No `toolsContext` here.
  prepareStep: () => ({ toolsContext: affiantToolsContext(currentTurn(), tools) }),
});
```

This is a boundary the adapter cannot check for you. When both are set and
`prepareStep` returns no `toolsContext` for a later turn, the SDK falls back to the
constructor's — and the adapter cannot tell that fallback from a context the host meant
to supply, so the later turn runs under the earlier turn's context. With `prepareStep`
as the only source, a turn it does not answer for is refused, which is what GT-2 asks
for.

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
field the model could not fill comes back **absent**, which is "not proposed" and is
left out of the Affidavit. A field it reported as `null` is passed through as reported,
and the gate reads that as **nothing reported for that field** rather than as a value:
the field is on the Affidavit with `value: null`, provenance source `Empty` and
confidence `0`, and it counts towards `emptyFieldCount`, so a reviewer can see how much
of the record is unknown (AF-1, AF-2, PV-3). A proposal whose reported fields are _all_
`null` swears to nothing and is refused outright — `substance-refused`, nothing filed
(GT-3). The `presence` the model reports is a
hint; the gate establishes presence from the turn itself and never mints a stronger
grade from the model's claim about its own literalness (PV-3).

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

The gate never calls a write-capable tool's own `execute` (GT-6). What no wire-up check
can see is a tool that opens its own connection and writes inside its body. That is a
limit, stated as one rather than pretended away: a tool that writes in its body is
outside the guarantee.

So is a tool of the host's own, sitting in the same set. The returned set is **frozen**,
so a host adding tools beside the gated ones spreads it into a new object —
`{ ...affiantTools(gate, definitions), ...myOwnTools }` — and its own tools carry no
mark of this package's. `affiantToolsContext` leaves them alone; nothing here saw them,
so nothing here refuses them. If one of them writes, it writes ungated.

A **copy** of a gated tool is a different matter, and is refused. This package keeps a
private register of the tool objects it built, and `affiantToolsContext` names only
objects in it: anything carrying the package's mark that is not one of them throws
`wireup-invalid`, and so does any marked tool carrying a `needsApproval` setting, with
its own message. Two copies are worth naming. `{ ...tools.update_ticket,
needsApproval: true }` would make the SDK answer the step with an approval request and
file nothing — approval reconstructed from the message history the client sends back,
the path AZ-5 closes. `{ ...tools.update_ticket, execute: mine }`, frozen, carrying no
approval flag, is a gated tool in every respect except having the gate in front of it;
nothing but identity tells them apart.

That register is **this copy's**, which has a consequence worth knowing if two versions
of this package end up in one dependency tree: neither recognises the other's tools, and
each refuses them by name rather than quietly leaving them out of the map. Build each
set's context with the same copy that built the set.

An aborted generation is a third edge worth naming. A tool call that has not begun when
the signal fires does not begin, and nothing is filed; a filing already under way runs to
completion, because the gate takes no abort signal, and its row stays `pending` on the
Docket for a person to expire or reject.

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
