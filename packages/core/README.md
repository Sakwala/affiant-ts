# @affiant/core

The [Affiant](https://affiant.dev) gate for TypeScript: the thing that stands between
an AI agent and your database.

Put it in front of your write tools and a tool call stops being a write. It becomes an
**Affidavit** — per field, the value the agent wants to write, the value that is there
now, where the value came from and how confident the producer is — filed as a **Docket**
entry and handed to you as an **Evidence Card** for a person to approve, amend or reject.
A **Standing Order** is a policy verdict that approves a write with no person present,
and it files an attestation naming the policy in the same operation, so even the
unattended writes are attributable. Your own executor performs the write, after the
decision, and reports what happened; the gate never touches your database. Nothing about
this depends on which model you use, which database you write to, or how the card
reaches the person — those are ports you supply.

> **Not on npm.** This package lives in its repository and is consumed through the
> workspace. The condition for publishing is exact: a **public parity report** — the
> per-implementation list of conformance fixtures each implementation does not yet pass
> — and a **green, merge-blocking TypeScript conformance driver** running the shared
> fixture suite against this package. Until both hold, `@affiant/core` claiming to be
> the same framework as the .NET packages would be a claim with nothing behind it. The
> condition is enforced rather than promised: `prepack` refuses, so `npm pack` and
> `npm publish` both fail with the reason, and `AFFIANT_ALLOW_PUBLISH=1` is the
> deliberate override for the release that comes after.

## The rules this package is held to

Everything below cites a rule id — `GT-5`, `AZ-2`, `DK-3`. They resolve in
[`INVARIANTS.md`](https://github.com/Sakwala/affiant-protocol/blob/main/INVARIANTS.md)
in the rulebook, [Sakwala/affiant-protocol](https://github.com/Sakwala/affiant-protocol):
numbered, testable rules that both the .NET implementation and this one are held to,
with a shared conformance fixture suite. A citation here is not a gesture at a
philosophy; it is a pointer to a sentence somebody can disagree with, and to a fixture
that fails when this package stops obeying it.

## Using it

```ts
import { createGate } from "@affiant/core";
import type { Operation, TurnContext } from "@affiant/core";
import { InMemoryDocketStore, InMemorySessionStore } from "@affiant/core/store-memory";

const store = new InMemoryDocketStore();

const gate = createGate({
  store,
  sessions: new InMemorySessionStore(store),
  // Your model, asked once for structured values against the unmodified turn.
  inference: { infer: async (turn, schema) => extract(turn, schema) },
  // What the entity holds now, so every field can swear to what it replaces (AF-3).
  projection: { previousValues: async (op) => db.read(op.entityType, op.entityId) },
  // Who may decide. Asked before every transition; `false` refuses it (AZ-2).
  authorization: { mayDecide: async (principal) => reviewers.has(principal.id) },
  policies: [routineStatusChange], // your Standing Orders and confirmations (AZ-4)
  defaultTtlMs: 30 * 60_000, // every filed entry carries a deadline (GT-4)
});

const ctx: TurnContext = {
  conversationId: "conv-1",
  tenantId: "acme",
  channel: "chat",
  principal: { kind: "member", id: "ana" },
  turn: { utterance: "Set invoice INV-2 to Active", messageId: "msg-1", at: now() },
};

// One write tool, wrapped for this turn. Its own `execute` is never called (GT-6).
const updateInvoice = gate.wrap(
  {
    name: "update_invoice",
    description: "Update an invoice",
    writeCapable: true,
    inputSchema: {
      entityType: "Invoice",
      fields: [
        {
          name: "status",
          kind: "enum",
          description: "The invoice status",
          required: true,
          allowedValues: ["Draft", "Active", "Retired"],
          pattern: null,
        },
      ],
    },
    operation: (args: UpdateArgs): Operation => ({
      kind: "update",
      entityType: "Invoice",
      entityId: args.id,
      fields: ["status"],
    }),
    execute: async (args: UpdateArgs) => db.updateInvoice(args),
  },
  ctx,
);

const called = await updateInvoice.execute({ id: "invoice-1", status: "Active" });
if (called.kind === "write") {
  await deliver(called.card); // the Evidence Card a person reads
  const entry = await gate.decide(called.entryId, { kind: "approve" }, ctx);
  await db.write(entry); // your executor — this package never writes (AZ-7)
  await gate.markExecuted(entry.entryId, "executed", null, ctx);
}

// After a reconnect: what awaits a decision, then what awaits execution (DK-5).
const { items } = await gate.rehydrate({ tenantId: "acme" }, { limit: 20 });
```

The in-memory stores are behind their own entry point on purpose. They are the
**reference** implementation — what the store-semantics fixtures are written against,
and what a durable store earns the name by passing — but a host in production should
never be one careless import away from an approval record that lives only in an isolate
about to be recycled.

## The pipeline, in order

Every proposal runs the same nine steps (GT-1). Two entry points reach them:
`gate.wrap` for a tool a model calls, `gate.file` for a capture your host assembled
(a relay's message, a form, a replay), which enters at step 5 when its provenance is
already settled.

1. **Turn context.** Every entry point takes it as a parameter; nothing is read from a
   global. Two conversations interleaved in one process never share fields, pending
   inference or proposals (GT-2).
2. **Deterministic interceptors.** Your resolvers run first and set `External` or
   `Computed` values with the binding that points at the artifact. They may not mint
   `UserStated` — only a person can say what a person said (PV-3).
3. **One structured inference**, tool-free, against the **unmodified** turn. What the
   model returns is tagged `Conversation` when the value is literally in the utterance
   (with the character span, when your port can give one) and `Inferred` when it is
   not. Confidence is clamped into `[0, 1]` (PV-1).
4. **Merge.** Per field the higher confidence wins, a tie goes to the more
   deterministic source, and the loser stays on the record in the chain behind the
   winner (PV-1).
5. **Projection.** Your `ProjectionPort` supplies the previous values for an update; a
   create carries `previousValue: null` on every field (AF-3). The Affidavit carries the
   proposed fields and nothing else, a proposed field nothing produced a value for is
   tagged `Empty` rather than dropped, and the three confidence numbers are computed
   (AF-1, AF-2).
6. **Substance refusal.** A proposal that swears to nothing — no field with a known
   value, or a value sitting under an `Empty` tag — is refused before anything is filed
   (GT-3). A green test suite over a gate that files empty Affidavits is the failure
   this step exists to make impossible.
7. **The policy chain.** Your policies run in order and the first non-null verdict
   wins; no verdict means a person confirms. A `StandingOrder` verdict is honoured only
   if it survives three checks (below). A requirement this version does not run is filed
   verbatim and blocked, never quietly weakened (AZ-4).
8. **The deadline**, from the verdict's own `ttlMs`, else the policy's default, else
   the gate's — after the chain, so a policy that knows a capture is worthless in five
   minutes can say so (GT-4).
9. **Filing.** Idempotent by entry id: a retried tool call is a replay of one entry
   with its **original** deadline, not a second review. A Standing Order writes the
   status, the execution outcome and the attestation in the same operation as the
   filing, so there is no window in which an approved write has no attribution (DK-1,
   AZ-1).

### The three checks on a person-free approval

A `StandingOrder` verdict degrades to `ReviewerConfirmation` — a person is asked — when
any of these is true. Degrading _toward_ a person is always safe; the prohibition is on
degrading to something weaker (AZ-4). Each degrade emits `standing-order.blocked`
carrying a stable `blocked.reason` code an operator can alert on.

1. **A required field has no known value** (GT-5). A proposed field marked mandatory
   that reads `Empty` blocks the Standing Order whatever the numbers say. A person may
   still approve — they can see the hole, and an approval is of what was sworn to, not a
   licence to invent the missing value. An **optional** empty field does not block by
   rule.
2. **The verdict rests on an unbound claim** (PV-4). A policy declares the provenance
   sources it predicates on; if a declared source above `Conversation` carries no
   binding — a grade any caller could assert with nothing behind it — the verdict is not
   honoured. A policy that predicates only on values or host state is unaffected.
3. **The risk score is above the policy's threshold** (GT-5). A verdict naming a
   threshold fires iff `score <= threshold`, using **your** scorer. A threshold with no
   scorer is refused at wire-up, never a silent non-fire.

## The ports you supply

`createGate` refuses a wiring it can tell is wrong — a missing port, a deadline that is
not a deadline, a policy that declares a threshold with no scorer to compare against —
at wire-up, with a message naming what is missing. There is no option that turns the
gate off for a covered tool (CV-1).

| Port                | What you implement                                                                                                                                                                                                                            |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `InferencePort`     | One tool-free structured call to your model, given the turn and the field schema, returning a value and a confidence per field. It is the only place a model is spoken to, and it is yours — this package ships no model client.              |
| `ProjectionPort`    | What the entity holds right now, so an update's fields can swear to what they replace. Return `null` for an entity that does not exist; the pipeline reads that as "nothing to project", not as "every field was empty".                      |
| `AuthorizationPort` | Whether this principal may decide this entry. Consulted on every decision, execution report and resubmission, after the tenant check and before any transition. A `false` — or a throw — refuses (AZ-2).                                      |
| `RiskScorer`        | Your risk function, returning a number the gate compares against a policy's threshold. Required only if a policy declares one. This package ships no formula and no floor (GT-5).                                                             |
| `Clock`             | Where every instant on the record comes from. Defaults to the system clock; a test replaces it, which is how a deadline becomes something a fixture can drive rather than wait for.                                                           |
| `TelemetryPort`     | Where the events go — filings, refusals, transitions, expiries, Standing Orders fired and blocked — named in a versioned registry so an operator can alert on a refusal rate without reading this source. Defaults to a port that drops them. |

Two more, both optional: a `FieldInterceptor` is a deterministic resolver for step 2,
and a `SessionStore` is the rehydration surface a reconnecting client needs. The
`DocketStore` is not optional — it is where entries live, and the in-memory one is a
real implementation of the whole contract, not a stub.

## What this package deliberately does not ship

Each of these is absent because a rule says a framework that shipped it would be
non-conformant, not because it has not been written yet.

- **No executor.** No package here writes to your store. The only path to
  `execution: "executed"` is `markExecuted` — your executor reporting what it did. A
  framework that shipped a default executor that writes would be non-conformant (AZ-7).
- **No scoring formula and no floor.** The risk function is yours, and so is the
  threshold. This package owns the comparison and nothing else (GT-5).
- **No transport.** No SignalR, SSE, REST or MCP framing; no rule here depends on any
  of them, and hub names and invoke names are yours. You deliver the card
  ([`@affiant/evidence-card`](../evidence-card) renders it) and you carry the decision
  back (SR-5).
- **No timer.** The expiry sweep is bounded, paged and scheduled by you. Nothing here
  runs a periodic sweep of its own, and nothing here loads a whole Docket into memory
  (DK-3).
- **No model client**, for the same reason as the scorer: the inference step is a port.

## Decisions: what a host must know

- **Identity fails closed.** An unresolved principal, a mismatch between the entry's
  tenant and the caller's, or an authorization port that says no — or throws — refuses
  the decision. There is no "identity unknown, allow" (AZ-2). The refusal happens before
  the Docket is read, so a caller who may not decide cannot use a decision to learn
  whether an entry exists.
- **The tenant is the boundary.** Every store operation is tenant-scoped: a lookup in
  the wrong tenant is a miss, never another tenant's row. Reading an entry is scoped to
  the tenant rather than the conversation, deliberately — a reviewer opens a queue or
  follows a link, and the entry they are deciding was filed in some other conversation
  of the same tenant.
- **Three attestation kinds, and no fourth** (AZ-1). `member` — a human-verified
  session decided. `member-via-relay` — a person decided _through_ a trusted machine
  caller, naming both the person and the relay. `standing-order` — a policy approved
  with nobody present, naming the policy and its version. The kind _is_ the mode; there
  is no separate field to drift from it.
- **A machine caller can never attest a person** (AZ-3). A relay asserts an identity;
  it does not authenticate one. So a decision arriving with a `service` principal that
  names a person attests `member-via-relay`, never `member`, and the record shows the
  relay that carried it. The distinction is the difference between "Ana approved this"
  and "something claiming to speak for Ana approved this", and an audit six months later
  cannot reconstruct it from a record that flattened them.
- **A decision is a guarded compare-and-set.** Two decisions racing for one entry: one
  wins, the other is refused. Never applied twice.
- **An execution outcome is recorded once, and a host that retries a write reports
  once, when it knows the outcome.** `markExecuted` is a guarded compare-and-set too:
  the row moves out of `unexecuted` exactly once, and a second report is refused with
  `execution-already-recorded` rather than written over the first. Your outbox may
  retry the write as many times as it likes — retries are yours (AZ-5) — but the
  Docket carries the one fact about what happened, not the last thing anybody said.
  Overwriting would let an approved-and-committed row later read `failed`: an edit in
  place of a recorded fact (DK-4), and the loss of exactly the distinction DK-1
  requires the row to keep.
- **An amendment is an approval with corrections.** The corrected fields are tagged
  `UserStated` bound to the reviewer's act, and the three numbers are recomputed
  (DK-2, AF-4). The row keeps both the Affidavit **as the agent proposed it**, never
  edited, and the state the approval accepted — so a row can always show what the agent
  originally said (DK-4).

### Expiry is a state, not an event

An entry past its deadline reads `expired` on every query, whether or not a sweep has
run. Nothing depends on a background job having fired: a host whose sweep is broken
gets entries that cannot be approved, not entries that quietly stay approvable (DK-1).

`gate.expireDue(now, scope, limit)` is the sweep, and **you** schedule it — a cron, a
queue consumer, a Worker's scheduled handler. It processes at most `limit` entries and
tells you whether more remain, so it can never become an unbounded pass over every
pending row on every instance (DK-3). What it adds is the transition and the
`docket.expired` event; the state was already true.

A decision that arrives late is refused as expired, and the amendments it carried are
**preserved on the row** with the instant and principal of the act that carried them —
so `gate.resubmit` files a fresh entry that prefills what the person had already typed
rather than making them type it twice (DK-1).

## What this package does not claim

- **It swears to the field, not to the database.** An Affidavit is a record of what an
  agent proposed and where each value came from. It is not proof that your executor
  wrote what was approved; that is what the execution outcome is for, and it is your
  executor that reports it.
- **It does not sign and it does not hash-chain.** `canonicalize` and `canonicalHash`
  give a deterministic byte sequence and a SHA-256 over the Affidavit and its accepted
  amendments (SR-1), which is what an execution grant binds to. That is a fingerprint,
  not a signature and not a tamper-evident chain: it detects a substituted Affidavit,
  it does not prove who produced one, and a host that needs either builds it above the
  gate.
- **A tool that writes inside its own body is outside the guarantee** (GT-6). The
  public types make the gated path the only way a proposal reaches an executor, and a
  write-capable tool the gate cannot intercept — no `execute`, provider-executed, a
  hosted MCP server writing server-side — is refused at wire-up or filed `blocked`,
  never silently allowed (CV-4). But a function that opens its own connection and writes
  is a write no wire-up check can see. This is the honest boundary, and it is a boundary
  rather than a rule an implementation can enforce.
- **The three confidence numbers are reported, never enforced.** `aggregateConfidence`
  is the **minimum** over proposed fields with `Empty` counting as `0.0`;
  `populatedConfidence` is the minimum over the fields that were filled;
  `emptyFieldCount` is how many were not. All three are on every card, because a mean
  that first discards the empty fields lets a mostly-empty Affidavit report high
  confidence. Neither the rulebook nor this package defines a threshold on any of them
  (AF-2): a floor is a policy, a policy is yours, and a framework that shipped one would
  be deciding your risk appetite for you.

## Runtimes

Node 22 or newer, Cloudflare workerd and Bun. There is no Node-only API here, no
filesystem, no timer and **Web Crypto only** — which is why `canonicalHash` is
asynchronous on every runtime, including the ones where a synchronous digest exists
(RT-1). The whole suite runs on all three in CI from the first commit, and a lint fails
the build if anything under `src/` can reach Durable Object storage (RT-3).

ESM only. Types are published under `strict` with `exactOptionalPropertyTypes` and
`noUncheckedIndexedAccess`.

## Testing your host against the reference behaviour

`@affiant/core/testing` exports the fixture format, the runner and the stub ports the
fixtures are wired from. The documents under `test/fixtures/` are not tests of this
implementation — each is a statement about what a rule requires, written so a second
implementation in another language can be handed the same file and told to make it pass.

```ts
import { runFixture, runFixtureDir, scriptedInference, fixedClock } from "@affiant/core/testing";

const result = await runFixture(myFixture);
// { id, rules, title, pass, failures: [{ at, expected, actual }] }
```

Two ways a host uses this. Swap a stub for your own port — your real inference, your
real projection — and run the fixtures against it, and you find out whether your ports
behave the way the rules assume before you trust them in production. Or write your own
fixtures in the same shape for your own operations, and get the same reporting.
`runFixture` never throws on a mismatch; it returns every failure with the path it was
found at, which is what lets the same documents produce a parity report rather than a
first-failure message. See [`test/README.md`](test/README.md) for the format.

## Links

- [Sakwala/affiant-protocol](https://github.com/Sakwala/affiant-protocol) — the rulebook:
  wire schemas, the conformance fixtures, and
  [`INVARIANTS.md`](https://github.com/Sakwala/affiant-protocol/blob/main/INVARIANTS.md),
  the numbered rules cited throughout this file
- [`@affiant/contract`](../contract) — the wire types and the JSON Schemas
- [`@affiant/evidence-card`](../evidence-card) — the card a person reads
  ([try it](https://sakwala.github.io/affiant-ts/))
- [Sakwala/affiant](https://github.com/Sakwala/affiant) — the .NET implementation

## Licence

Apache-2.0. The full text ships in the package as `LICENSE`.
