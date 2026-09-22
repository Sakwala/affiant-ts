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

> `@affiant/core` is `0.1.0-alpha.4` in this repository. Releases are published under the
> `alpha` dist-tag with a provenance attestation through this repository's publish
> workflow ([`.github/workflows/publish.yml`](../../.github/workflows/publish.yml)),
> which moves the `alpha` dist-tag and no other; `npm view @affiant/core dist-tags` shows
> what the registry currently serves. The condition for publishing was exact: a **public parity
> report** — the per-implementation list of conformance fixtures each implementation
> does not yet pass — and a **green, merge-blocking TypeScript conformance driver**
> running the shared fixture suite against this package. Both hold, at the rulebook's
> [`v0.2.0`](https://github.com/Sakwala/affiant-protocol/releases/tag/v0.2.0) tag, which is what
> `packages/contract/protocol/PIN` pins and what both manifests are read at. The
> [.NET parity report](https://github.com/Sakwala/affiant-protocol/blob/v0.2.0/conformance/parity/dotnet-v0.1.json)
> is public, with its oracle run log alongside it under `conformance/results/`, and
> this package's own [conformance parity manifest](../conformance-driver/conformance/parity/typescript-v0.2.json)
> is green on Node, Bun and workerd, asserted by the `conformance` job that is
> required on `main`. Publishing is a separate, deliberate step, and the gate is
> enforced rather than relaxed on trust: `prepack` refuses, so `npm pack` and
> `npm publish` both fail with the reason, until `AFFIANT_ALLOW_PUBLISH=1` is set —
> which nothing but the hand-dispatched publish workflow does.

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
   model returns is tagged `Conversation` when the value is literally in the utterance —
   the gate looks for it there, as a whole token under a comparison that folds ASCII case
   and nothing else, and binds the span it was read from — and `Inferred` when it is not
   (PV-3). Your port is never asked to grade its own answer: a `presence` or an
   `utteranceSpan` it reports is a hint the gate verifies the same way. A value a field
   cannot carry — `null`, an object, an array, the empty string, a non-finite number — is
   nothing the port reported: the field is not merged at all. Confidence is clamped into
   `[0, 1]` (PV-1).
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

### What the gate checks about a binding

The gate checks the shape of every binding that enters from host code — an
interceptor's result, and each tag of a prepared field's provenance chain — against the
protocol's own `binding.schema.json`: the five kinds, each kind's required keys and
types, and no undeclared key at the binding itself, `ref`, `ref.relay` or
`ref.constant`. A malformed one throws `AffiantCallerError` of kind `binding-invalid` as
the interceptor returns, before any later interceptor or port runs, with `details`
naming `field`, `source` (`"interceptor"` with `interceptor`, `"prepared-field"`, or
`"stored-row"` with `entryId`) and `reason`; nothing is filed. An interceptor may mint
only `external-ref` and `computation-ref` — the other three kinds point at something a
person did, and are refused the same way — while a prepared field keeps all five kinds,
since a relayed capture legitimately carries what a person typed.

**What it does not do.** This is a check of shape, not of truth: a well-formed
`external-ref` naming a record that does not exist files. Rows already stored are not
re-checked on a read — `cardFor`, `decisionResultOf`, `get` and `rehydrate` all read the
row as it stands. And a stored row holding a malformed binding cannot be resubmitted:
`gate.resubmit` checks the bindings it copies off the superseded row exactly as a first
filing's are checked, and the refusal names `"stored-row"` and the entry id — so file a
fresh proposal instead.

```ts
import { createGate, isCallerError } from "@affiant/core";
import type { FieldInterceptor } from "@affiant/core";
import { InMemoryDocketStore, InMemorySessionStore } from "@affiant/core/store-memory";

const store = new InMemoryDocketStore();

// An interceptor that mints a malformed binding — an `external-ref` carrying a key
// the protocol's binding schema does not declare.
const crm: FieldInterceptor = {
  name: "crm",
  resolve: () => ({
    status: {
      value: "Active",
      source: "External",
      binding: {
        kind: "external-ref",
        ref: { system: "crm", recordId: "42", extra: true },
      },
      confidence: 0.95,
      evidence: "the crm system says Active",
    },
  }),
};

const gate = createGate({
  store,
  sessions: new InMemorySessionStore(store),
  inference: { infer: async () => ({ fields: {} }) },
  projection: { previousValues: async () => null },
  authorization: { mayDecide: async () => true },
  policies: [],
  interceptors: [crm],
  defaultTtlMs: 30 * 60 * 1000,
});

const tool = {
  name: "update_invoice",
  description: "Update an invoice",
  inputSchema: {
    entityType: "Invoice",
    fields: [
      {
        name: "status",
        kind: "enum" as const,
        description: "The invoice status",
        required: true,
        allowedValues: ["Draft", "Active", "Retired"],
        pattern: null,
      },
    ],
  },
  writeCapable: true as const,
  execute: (_args: Record<string, unknown>) => {
    throw new Error("the gate called a write tool's own execute");
  },
  operation: (args: Record<string, unknown>) => ({
    kind: "update" as const,
    entityType: "Invoice",
    entityId: "invoice-1",
    fields: Object.keys(args),
  }),
};

const ctx = {
  conversationId: "conv-1",
  tenantId: "acme",
  channel: "chat",
  principal: { kind: "member" as const, id: "ana" },
  turn: {
    utterance: "Set invoice INV-2 to Active",
    messageId: "msg-1",
    at: "2026-09-04T09:00:00.000Z",
  },
};

try {
  await gate.wrap(tool, ctx).execute({ status: "Active" });
} catch (error) {
  if (isCallerError(error) && error.kind === "binding-invalid") {
    // `error.details.field` is "status"; `error.details.source` is "interceptor"
    // with `error.details.interceptor === "crm"`; `error.details.reason` names the
    // undeclared key. Nothing was filed.
    console.log(error.details);
  } else {
    throw error;
  }
}
```

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

## The read side: a row a queue already holds

A filing hands you the Evidence Card for the entry it just filed. A review queue is the
other direction: it lists rows hours or days later, and all it has is the row. Two pure
producers build the envelopes from it — no store, no clock, no port, no network.

```ts
import { cardFor, decisionResultOf, isCallerError } from "@affiant/core";
import type { DocketEntry, EvidenceCardRequest } from "@affiant/core";

// A queue item: the row, the host's field schema for the tool that proposed it, and
// the instant you are rendering at.
const card: EvidenceCardRequest = cardFor(row, {
  now: new Date().toISOString(),
  schema, // the same FieldSchema the tool declares — optional
  operationLabel: "Reprice", // your own verb for the operation — optional
});

if (card.requiresConfirmation) {
  // Only then is a decision still being asked for.
}

// After the decision: the report, for your own client or your audit surface.
try {
  const result = decisionResultOf(row);
  void result.outcome; // "approved" | "rejected" | "expired" | "resubmitted"
} catch (error) {
  if (isCallerError(error) && error.kind === "entry-not-decided") {
    // Nobody has decided this row yet, and this function reads no clock.
  } else {
    throw error;
  }
}

// A row that supersedes another needs that row: the reviewer's earlier corrections
// live on it and nowhere else, so its absence is refused rather than read as `null`.
const superseded: DocketEntry | null =
  row.lineage.supersedes === null ? null : await gate.get(row.lineage.supersedes, ctx);
const resubmissionCard = cardFor(row, {
  now: new Date().toISOString(),
  ...(superseded === null ? {} : { superseded }),
});
```

What `cardFor` gives you, and what it does not:

- **`requiresConfirmation` is `true` only for a `pending`, unblocked row that has not
  passed its deadline at `now`** — the same reading of the deadline the stores and the
  sweep use (DK-1, DK-5). A blocked row's card says why and never claims a confirmation
  is awaited (AZ-4). Every other row still has a card; only this flag says whether a
  decision is being asked for.
- **No policy sentence.** A card built while filing carries the reason the policy chain
  gave. The row records the chain's **verdict**, not its prose, so a card built from the
  row carries the sentences the row itself determines — the blocked markers — and no
  others.
- **`presentation` and `hostOperation` are whatever this call passes.** They are your
  rendering of a proposal rather than its sworn substance, so they are not on the record
  (SR-1). Widen a picker's `allowedValues` and every queue item renders the new set,
  including rows filed before the change; the row names the tool that proposed it (CV-4),
  which is how you find the declaration to pass.
- **`priorAmendments` comes from the Docket.** For a first filing it is what that row
  preserved — the corrections a decision carried after the deadline had passed. For a row
  that supersedes another it is the superseded row's, which you pass as `superseded`;
  omitting it, passing the wrong row, passing one from another tenant, or passing one for
  a row that supersedes nothing throws kind `superseded-entry-mismatch`.
- **The card of a row that changed since filing differs from the filing's card.** The
  card shows the amended Affidavit and the numbers recomputed over it once an amendment
  has been accepted (AF-2, AF-4), and a row whose deadline has since passed asks for no
  confirmation. Only for the row **as it was filed** is the card the one the filing
  returned.

What `decisionResultOf` gives you:

- The outcome from the status, except that an expired row reads **`resubmitted`** once a
  successor has superseded it.
- **`attestation: null` and `execution: null` on anything but an approval.** The
  envelope's `attestation` answers "who agreed", and a rejection and an expiry have no
  answer (AZ-1) — even though the **row** of a rejection does name the person who
  rejected it. The two documents answer different questions.
- A `pending` row throws kind `entry-not-decided`. Whether it has passed its deadline is
  read against an instant, and this function is given none: settle it with the sweep, or
  read the row's status at the instant you mean.

### Errors that are yours, not the gate's

A refusal is something the gate decided about a proposal, and it carries an `ErrorCode`
from the rulebook's registry. A mistake in your own code is not that. Four such mistakes
now throw `AffiantCallerError` — a subclass of `RangeError`, so anything catching one
today still catches it — with a stable `kind` and structured `details`:

| `kind`                      | When                                                                                                                                                                                                         |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `amendment-unknown-field`   | An amendment names a field the Affidavit does not propose. It changes no state (DK-2), so you may catch it after `decide` rather than pre-check; the row stays decidable.                                    |
| `turn-context-invalid`      | The turn context's `conversationId`, `tenantId` or `channel` is blank. Thrown at the top of the pipeline, before the interceptors and before your model is called (GT-1): nothing is filed and no port runs. |
| `superseded-entry-mismatch` | `cardFor` was given the wrong superseded row, or none for a row that needs one, or one for a row that supersedes nothing.                                                                                    |
| `entry-not-decided`         | `decisionResultOf` was given a `pending` row.                                                                                                                                                                |

- **A `kind` is not an `ErrorCode`.** It is not in the rulebook's refusal registry and it
  never crosses the wire as one. `isCallerError(value)` is the guard, and it answers
  truthfully even across two loaded copies of this package.
- **`kind` and `details` survive `JSON.stringify`; they do not survive
  `structuredClone`.** They are own enumerable properties, so
  `JSON.stringify(error)` reads `{"kind":…,"details":…,"name":"AffiantCallerError"}` —
  enough to log or to send to your own client (`message` and `stack` are not enumerable
  on any `Error`, so a JSON round trip is data and not an error, and `isCallerError`
  reads `false` on it). `structuredClone` goes the other way: it carries an error's
  `message`, `stack` and `cause` and drops every other own property, and the clone reads
  `name: "Error"` — so a caller error does not cross a `postMessage` intact. Read `kind`
  on the caught error, not on a copy of it.
- **A blank `turn.messageId` is not refused**, and neither is a blank utterance or an
  absent `turn`. Only the three identifiers above are read at the top of the pipeline,
  and the set of inputs the gate refuses did not change when they moved there.

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
