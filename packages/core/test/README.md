# The fixtures

Most of what `@affiant/core` guarantees is written down twice: once as a numbered rule
in the rulebook at <https://github.com/Sakwala/affiant-protocol>, and once as a
**fixture** — a JSON document that describes a wiring, a sequence of acts and what must
then be true. This directory holds those documents and the suites that run them.

A fixture is not a test of this implementation. It is a statement about the framework
that any implementation must satisfy, and it is written so that a second implementation
in a different language can be handed the same file and told to make it pass.

```
test/
  fixtures/
    gate/*.json          the pipeline: substance, provenance, policy, deadlines, filing
    decide/*.json        decisions: authority, attestation, amendments, execution, lineage
    sequence-a/*.json    a chat capture end to end: a tool call through to an executor
    sequence-c/*.json    a capture over a trusted relay, decided or auto-approved
    canonical/*.json     the SR-1 byte vectors — a different shape, see "Byte vectors"
    fixtures.generated.ts  every fixture above, as a module (generated; do not edit)
  *.test.ts              the portable suites — these run on Node, Bun and workerd
  node/*.test.ts         suites that read files or spawn processes; Node only
```

## The shape

```jsonc
{
  "id": "sequence-c/relay-auto-approve-bound-external",
  "rules": ["PV-4", "AZ-1"],
  "title": "A capture arrives over a trusted relay, already carrying its provenance…",
  "given": {
    "clock": "2026-09-04T09:00:00.000Z",
    "store": "memory",
    "gate": { "defaultTtlMs": 1800000, "authorization": { "allow": ["*"] } },
    "ctx": { "tenantId": "tenant-a", "conversationId": "wa-1", "channel": "mcp" },
    "prior": [],
    "step": { "kind": "file", "toolName": "relay_capture", "operation": { "…": "…" } },
  },
  "expect": { "entry": { "status": "approved" } },
}
```

- **`id`** is stable for the fixture's whole life. A parity manifest cites it by name,
  so renaming one silently changes what a published document refers to.
- **`rules`** are rulebook ids (`AF-n`, `PV-n`, `GT-n`, `DK-n`, `AZ-n`, `SR-n`, `RT-n`,
  `CV-n`, `TL-n`). At least one, and the generator refuses anything that is not one.
- **`title`** says what the fixture asserts, in a sentence somebody can read without
  opening the JSON. It is the test name in every runner.
- **`given.gate`** is what `createGate` is handed: the policy chain, the deadline, the
  authorization allowlist, the scripted inference, the entity table the projection port
  reads, the deterministic interceptors, the risk score, the uncovered declarations.
- **`given.ctx`** is the turn every step runs in — a step may override the principal,
  the tenant or the conversation.
- **`given.prior`** are the acts that set the scene. Each may declare the refusal it is
  expected to produce (`"refusal": "decision-expired"`), so the reader sees the refusal
  beside the act that caused it.
- **`given.step`** is the act under test. `expect.error` is about this one.
- **`expect`** is a **partial** matcher throughout. A fixture states the facts its rule
  is about and says nothing about the rest, so adding a property to `DocketEntry` does
  not break fifty documents.

### The steps

| `kind`         | What it does                                                                                                                                                                                                  |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `wrap-execute` | A model calls a wrapped tool — Sequence A's way in. The fixture describes the tool; the runner supplies an `execute` that fails if the gate ever calls it, which makes GT-6 a tripwire on every such fixture. |
| `file`         | The host files a proposal it assembled — Sequence C's way in.                                                                                                                                                 |
| `decide`       | Approve, amend or reject.                                                                                                                                                                                     |
| `resubmit`     | File an expired entry again.                                                                                                                                                                                  |
| `markExecuted` | The host's executor reports what it did.                                                                                                                                                                      |
| `expireDue`    | The host-scheduled sweep.                                                                                                                                                                                     |
| `get`          | Read the entry as it stands, with the deadline applied.                                                                                                                                                       |
| `rehydrate`    | One page of what a reconnecting client needs.                                                                                                                                                                 |

A step may carry `"as": "label"` to name the entry it files; a later step names it with
`"entry": "label"`. Without either, a step acts on the last entry filed.

### What the expectations can say

`expect.entry` and `expect.superseded` match a Docket row: its status _as it reads_
(a row past its deadline reads expired whether or not a sweep has run), its execution
outcome, its requirement, its blocked marker, the tool it came from, the attestation,
the decision record, the accepted amendments, the amendments a refused late decision
left behind, the lineage, the deadline as an offset from the filing instant, and the
Affidavit — as proposed and, separately, as an approval accepted it.

`expect.card` matches the Evidence Card: whether a confirmation is being asked for, the
warnings, the three confidence numbers, and each field's reviewer-facing shape (its
kind, its closed set of values, the pattern an input is constrained by).

`expect.telemetry`, `expect.telemetryAbsent`, `expect.store`, `expect.expired`,
`expect.page` and `expect.found` cover the rest.

Some facts hold on **every** filing and are checked whether a fixture mentions them or
not: the card points at the row it was built from, carries the row's own deadline and
protocol version, shows all three confidence numbers as the record holds them, and
never asks for a confirmation on a row no decision will be accepted for. Repeating
those in fifty files would stop each file being about its own rule.

Two sentinels exist because a fixture cannot know a value the implementation derives:
`"@some"` in a lineage link asserts only that the link is there (an entry id is a hash
of the proposal), and a label from an earlier step's `as` stands for that entry's id.

## Adding one

1. Write the JSON into the set it belongs to, named `NN-what-it-is.json`. Cite the rule
   or rules it checks, and write a title a reviewer can act on.
2. Run `pnpm generate:fixtures` from `packages/core`. This mirrors every document into
   `test/fixtures/fixtures.generated.ts`, which is how the suites read them on Bun and
   inside workerd, where there is no filesystem. The generator **computes nothing** — a
   fixture's expectation is a claim about what a rule requires, and a claim the
   implementation wrote for itself would prove nothing.
3. Run `pnpm test`. `test/fixtures.test.ts` runs each document and reports every
   mismatch with the path it was found at.

If a fixture fails and you believe the fixture is right, the implementation is wrong.
That is the whole point of writing them this way round.

## What a fixture cannot say

A declarative document describes inputs and outputs. Some rules are about what did
**not** happen, or about types, and those live in hand-written suites beside the
fixtures:

- a spy proving a write tool's own `execute` was never called (GT-6) —
  `gate-coverage.test.ts`;
- a spy proving the Docket was not read before an unauthorized decision was refused
  (AZ-2) — `gate-decide.test.ts`;
- two decisions actually racing for one entry (DK-1) — `gate-decide.test.ts`;
- two turns actually interleaved in one process (GT-2) — `gate-scope.test.ts`;
- the type-level halves of AZ-3 and AZ-7 — `decide-types.test-d.ts`;
- the retention cut, which never ages out an approved, unexecuted row (DK-4) —
  `docket-retention.test.ts`;
- the wire round-trip of the seed shapes (SR-3) — `wire-roundtrip.test.ts`;
- the two lints — no Durable Object storage (RT-3) and no private working vocabulary in
  anything published — `node/lint-*.test.ts`;
- the resource-envelope tripwires (RT-2) — `node/docket-budget.test.ts` for the store
  alone and `node/gate-budget.test.ts` for the whole file-plus-decide path, which
  prints the average it measured so the number is visible in CI rather than only its
  verdict.

## Byte vectors

`fixtures/canonical/*.json` are a different kind of document: an input, the amendments
accepted on it, the decision they arrived on, and the exact canonical bytes and SHA-256
those produce (SR-1). Unlike a fixture, their expected values **are** written by the
implementation — a 1,500-byte canonical document typed by hand is a transcription
waiting to enshrine a typo. What makes them trustworthy is that three paths that share
no code have to agree: the implementation, a second canonicalizer written out from the
rule in `canonical.test.ts`, and `sha256sum` in `node/canonical-vectors.test.ts`.

Regenerate them with `pnpm build && pnpm generate:vectors`.

## The runner is published

`runFixture` and `runFixtureDir` are exported from `@affiant/core/testing`, not private
to this directory. Three consumers read the same documents through the same code:

1. **These suites**, which turn a result into an assertion.
2. **A host**, checking its own ports against the reference behaviour before it trusts
   them in production — the stub ports (`scriptedInference`, `entityProjection`,
   `allowlistAuthorization`, `fixedClock`) are exported for exactly that.
3. **The conformance driver**, which will hand these documents to each implementation
   and publish what each one fails.

That third consumer is why the runner never throws on a mismatch. It returns

```ts
{ id, rules, title, pass, failures: [{ at, expected, actual }] }
```

and `runFixtureDir` sums those into `{ total, passed, failed, results, failedIds }`. A
runner that stopped at the first failure could tell you a fixture failed; it could not
produce the list of everything an implementation does not yet pass, which is the
document the driver exists to publish.
