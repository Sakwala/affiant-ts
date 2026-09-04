# Changelog — @affiant/core

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); the
package follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Every entry
cites the rule ids it satisfies, which resolve in
[`INVARIANTS.md`](https://github.com/Sakwala/affiant-protocol/blob/main/INVARIANTS.md).

Repository-wide changes — the workspace, the protocol pin, the other two packages —
are in the [root changelog](../../CHANGELOG.md).

## [Unreleased]

### Fixed

- **An execution outcome is recorded once, under a guard** (DK-1, DK-4, AZ-5).
  `DocketStore.recordExecution` takes an `expected` current execution (`"unexecuted"`)
  and answers `"execution-already-recorded"` for a row that already carries one;
  `Gate.markExecuted` maps that to the new `ErrorCode` `execution-already-recorded`.
  Before this a second report overwrote the first, so an approved-and-committed row
  could later read `failed` — an edit in place of a recorded fact (DK-4) that lost the
  distinction DK-1 requires the row to keep. A host that retries a write reports once,
  when it knows the outcome; the retries are the host's business (AZ-5).
- **The fixture runner checks the document, not only the gate.** Every level of a
  fixture is validated against the format's own key sets, and an unknown key anywhere
  fails the fixture naming its path; an `expect` clause stating no fact (`{}`,
  `{ entry: {} }`, `{ telemetryAbsent: [] }`) fails as vacuous; a refusal declared on
  the step under test is compared rather than skipped; a telemetry key outside the
  registry is refused; and a wire-up refusal fails a fixture that states a row, a card
  or a page nothing on that path will ever read. Before this, a misspelled expectation
  key was silently ignored — which, in the oracle a conformance driver runs against a
  second implementation, is a rule silently unchecked in both.
- **The grant binding is pinned by declarative fixtures** (SR-1). `expect.canonicalHash`
  states the hash a host's execution grant binds to, taken through the exported
  `canonicalHashEntry`; an amended and an unamended approval carry the value. The
  runner now reaches `canonicalHashEntry` and `swornAffidavitOf` rather than
  re-deriving `amendedAffidavit ?? affidavit` inline, so an implementation binding a
  grant to the unamended proposal fails fixtures rather than passing them.
- **The gate compares the tenant itself** (AZ-2). `decide`, `markExecuted` and
  `resubmit` compare the row's own `tenantId` with the caller's after the scoped read,
  so a host store with a scope bug cannot fail open: the refusal is still
  `entry-not-found`, and the host's telemetry says `tenant-mismatch` so the store bug
  is visible to somebody.
- **`args` is typed** on `WriteProposal` and `PipelineProposal`: `JsonValue` rather
  than `unknown`, so a host handing the gate something with no canonical form hears it
  from the compiler instead of from a `TypeError` at the first filing.
- **Every published package ships its licence.** `LICENSE` is copied into
  `@affiant/core`, `@affiant/contract` and `@affiant/evidence-card` and named in each
  `files` list — npm does not reach outside a package directory, and Apache-2.0
  section 4(a) says a recipient gets a copy.

### Added

- `ErrorCode` gains `execution-already-recorded` (provisional until the protocol's
  registry lands). The registry only ever grows at the end.
- `EntryExpectation.executionDetail` and `FixtureExpectation.canonicalHash` in the
  fixture format.

## [0.1.0-alpha.0] — in the repository, **not published**

The gate, complete for the two v0.1 sequences: a chat capture through a wrapped tool,
and a capture arriving over a trusted machine caller's surface.

The version string exists so a conformance driver can pin it. Publishing waits on two
things, and a `prepack` guard enforces the wait rather than documenting it: a **public
parity report** naming, fixture by fixture, what each implementation does not yet pass,
and a **green, merge-blocking TypeScript conformance driver** running the shared
fixture suite against this package. `npm pack` and `npm publish` both fail with that
reason until `AFFIANT_ALLOW_PUBLISH=1` is set.

### The skeleton — context, ports, errors, telemetry

`TurnContext`, `Principal` and `ChannelIdentity`: the turn every entry point takes as a
parameter, so nothing is read from a global and two conversations in one process never
observe each other (GT-2). The port interfaces a host implements — `InferencePort`,
`ProjectionPort`, `AuthorizationPort`, `RiskScorer`, `Clock`, `TelemetryPort`,
`FieldInterceptor`. A closed `ErrorCode` registry with `AffiantError`, so a refusal is
something a host can branch on (CV-1). A versioned telemetry-key registry generated
from `telemetry-keys.json`, with a key never renamed and never removed (TL-1), naming
its attributes after OpenTelemetry's where one exists (TL-2). A lint that fails the
build if anything under `src/` can reach Durable Object storage (RT-3), and CI on Node,
Bun and workerd from the first commit (RT-1).

### The Affidavit model

The seven-source provenance ladder (`UserStated` > `External` > `Computed` >
`Conversation` > `Inferred` > `Default` > `Empty`) with `determinismRank`; tags whose
confidence is clamped into `[0, 1]` at mint time (PV-1); the five binding kinds that
make a tag checkable — `utterance-span`, `reviewer-act`, `form-input`, `external-ref`,
`computation-ref` (PV-2); a chain that keeps every superseded tag, and a merge that
takes the higher confidence, breaks a tie toward the more deterministic source and
keeps the loser on the record (PV-1). The inference step is handed a minting surface
that **cannot** name `UserStated` (PV-3). `buildAffidavit` enforces that `fields[]`
carries the proposed fields and nothing else, that a proposed field with unknown
provenance is tagged `Empty` rather than dropped, and that an update names its entity
and swears to what it replaces (AF-1, AF-3). The three confidence numbers, with
`aggregateConfidence` the **minimum** over proposed fields and `Empty` counting as
`0.0` — not a mean over the populated ones, which lets a mostly-empty Affidavit report
high confidence (AF-2). Amendment semantics: `null` clears, an absent key leaves a
field untouched, an amended field carries the reviewer's act, and the three numbers are
recomputed (DK-2, AF-4).

### Canonical form, hashing, money

`canonicalize` / `canonicalString` / `canonicalHash` over the Affidavit **and its
accepted amendments** — UTF-8, keys sorted by code point, no insignificant whitespace,
numbers in shortest round-trip form, `null` written and absent omitted (SR-1) — with
`canonicalizeEntry` and friends taking the canonical form of a Docket row, over the
state an approval accepted where there is one and the proposal otherwise. SHA-256 via
`crypto.subtle`, asynchronous on every runtime, which is the price of Web Crypto only
(RT-1). `Money` as a decimal string plus an ISO 4217 code, with a validator: a number
where money is expected is a schema error (SR-2). The byte vectors ship as fixtures,
and three paths that share no code have to agree on them.

### The Docket

`DocketEntry` — status, execution outcome, the blocked marker, the attestation record,
amendments, lineage and expiry — the `DocketStore` and `SessionStore` contracts, and
the in-memory reference stores behind `@affiant/core/store-memory`. Filing is
idempotent by entry id and never refreshes a deadline, so a retried tool call is a
replay of one entry rather than a second review (DK-1, GT-4). Every transition out of
`pending` is a guarded compare-and-set: two decisions racing, one wins. An entry past
its deadline reads `expired` on every query whether or not a sweep has run, and the
amendments a late decision carried are preserved on the row with the act that carried
them (DK-1). The sweep is bounded, paged and host-scheduled — this package owns no
timer (DK-3). Retention, purge and export are hooks, and retention never ages out an
approved, unexecuted row (DK-4). A session rehydrates entries awaiting a decision
before entries awaiting execution (DK-5). Every operation is tenant-scoped: a lookup in
the wrong tenant is a miss, never another tenant's row.

### The pipeline

`createGate` and `Gate.wrap` / `Gate.file`: the nine steps in protocol order (GT-1) —
interceptors, one tool-free structured inference against the unmodified turn, merge,
projection, the substance refusal, the policy chain, the deadline, filing. A proposal
that swears to nothing is refused before anything is filed (GT-3). A write tool's own
`execute` is never called; the gated call returns a proposal (GT-6). A write-capable
tool the gate cannot intercept — no `execute`, provider-executed, hosted MCP — is
refused at wire-up, or filed `blocked` where the host declared it uncovered, and never
silently allowed (CV-4). The policy chain takes the first non-null verdict and defaults
to asking a person; a requirement this version does not run is filed verbatim with a
blocked marker and never degraded to something weaker (AZ-4). A Standing Order fires
only past the checks below, and when it does it writes the status, the execution
outcome and its attestation in the same operation as the filing (AZ-1). The deadline
comes from the verdict, else the policy, else the gate — after the chain, not before
(GT-4). Misconfiguration the gate can detect fails at `createGate` with a message
naming what is missing, and no option turns the gate off for a covered tool (CV-1).

### Decisions

`decide`, `markExecuted`, `resubmit` and `rehydrate`. Authorization is tenant-scoped
and fails closed — an unresolved principal, another tenant's entry, or a host port that
says no or throws, all refuse, and the refusal happens before the Docket is read
(AZ-2). Three attestation kinds and no fourth, with the kind itself as the mode:
`member`, `member-via-relay` and `standing-order` (AZ-1). A machine caller may never
attest `member`; a decision made through a trusted relay attests `member-via-relay`,
naming the person and the relay (AZ-3). An amendment is an approval with corrections,
tagged to the reviewer's act, with the three numbers recomputed (DK-2, AF-4). The only
path to `execution: "executed"` is a host's own report — this package never calls an
executor (AZ-5, AZ-7). A resubmission is a new entry whose lineage names what it
replaces, prefilled with what the person had already typed (DK-1).

### Sequences A and C, and the fixture runner

Fifty-four declarative fixtures over the two v0.1 sequences and the pipeline and
decision paths beneath them, plus the runner and stub ports behind
`@affiant/core/testing` — one shape for the whole gate: a wiring, a sequence of acts
(`wrap-execute`, `file`, `decide`, `resubmit`, `markExecuted`, `expireDue`, `get`,
`rehydrate`) and a partial matcher over the row, the card, the telemetry and the store.
`runFixture` never throws on a mismatch: it returns every failure with the path it was
found at, so the same documents serve this package's suites, a host checking its own
ports, and the conformance driver that will publish what each implementation does not
yet pass. Hand-written suites carry what a declarative document cannot say — a spy
proving a write tool's `execute` was never called, two decisions actually racing, two
turns actually interleaved, the type-level halves of AZ-3 and AZ-7, and the
resource-envelope tripwires that print the numbers they measured (RT-2).

### Changed since the pipeline landed

- A **Standing Order never fires while a proposed field marked mandatory reads
  `Empty`** (GT-5). The verdict degrades to `ReviewerConfirmation` and a person may
  still approve; an optional empty field does not block by rule, which is where a host
  policy over `populatedConfidence` or `emptyFieldCount` belongs. The check runs ahead
  of the provenance and risk checks — it depends on nothing the policy declared and
  nothing a host port returns, so a proposal with a hole in it degrades identically
  under every wiring, and a host's scorer is never spent on a verdict already going to
  a person. New on the public surface: `emptyMandatoryFields(affidavit)` and
  `PolicyOutcome.emptyMandatoryFields`.
- `standing-order.blocked` gained `blocked.reason` — a stable code
  (`mandatory-field-empty`, `unbound-declared-input`, `risk-above-threshold`) an
  operator can alert on without matching on prose — and
  `affidavit.empty_mandatory_fields`, the field names. Field names are schema, never
  values: telemetry is operational and the audit record is the Affidavit.
- A Docket row keeps **both** the Affidavit as the agent proposed it, never edited, and
  the state an approval accepted. An accepted amendment used to overwrite the proposal,
  which left a row unable to show what the agent originally said (DK-4). The canonical
  form a host binds to is taken over the accepted state where there is one.
- A row records `toolName`, so a resubmission re-runs the coverage assessment against
  the tool that actually proposed the write and an audit can name it (CV-4).
- The amendments a refused late decision carried are their own fact, carrying that
  decision's **own** instant and principal rather than sharing a field with an
  approval's accepted map (DK-1).
- A policy's `ttlMs` and its `defaultTtlMs` must each be a whole number of
  milliseconds, one or more. A `0` files an entry that reads `expired` on the read that
  files it — an entry nobody can decide, which no rule would show as a failure (GT-4).
- The Evidence Card carries **all three** confidence numbers, not the aggregate alone
  (AF-2), and says on the card itself when no decision on the entry will be accepted
  (AZ-4).

[unreleased]: https://github.com/Sakwala/affiant-ts/commits/main
