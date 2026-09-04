# Changelog

All notable changes to this repository are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); the packages follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Every entry that changes a wire type or a vendored schema names the
[`Sakwala/affiant-protocol`](https://github.com/Sakwala/affiant-protocol) tag it
was made against.

## [Unreleased]

### Changed

- **The wire is the rulebook's v0.1** (`protocolVersion` `0.1.0`), and
  `packages/contract/protocol/PIN` moves from the tag `v0.0.1-seed` to the commit
  that carries the v0.1 text. The rulebook's `v0.1.0` tag has not been cut; a commit
  is as immutable as a tag and, unlike a tag, cannot be moved under a running build,
  and the pin becomes the tag in the pull request that adopts it. What changed on the
  wire, and why each thing moved:
  - **Every envelope carries `protocolVersion`** (SR-4) — the Affidavit, the card
    envelope, the Docket row, the decision result and every notification. A consumer
    refuses a payload whose major differs and may warn on a newer minor.
  - **The Affidavit carries all three of AF-2's numbers.** `populatedConfidence` and
    `emptyFieldCount` join `aggregateConfidence` on the record they describe. The
    card envelope keeps its pair for one version as a deliberate duplicate rather
    than dropping it, so a consumer written against either shape finds them.
  - **`operationType` is the operation's shape**, `create` or `update`, not the
    host's own verb (AF-3). "Create-only" has to be a predicate a policy can test
    without knowing what a host calls its operations. The v0.1 envelope has no slot
    for the host's verb at all; `Affidavit.operationType` no longer carries it, and
    `EvidenceCardRequest` has nowhere else to put it.
  - **Presentation moved onto the card envelope.** Per-field `allowedValues` and
    `pattern` become the envelope's `presentation[]`, and `warnings` and
    `requiresConfirmation` sit beside them. The canonical form a host's execution
    grant binds to is defined over the Affidavit and its accepted amendments and
    nothing else (SR-1); a closed value set, an input mask and a sentence a reviewer
    reads are none of those. Swearing to them would put a rendering decision inside a
    hash a grant is checked against, so restyling an input would invalidate a grant
    minted over evidence that did not change — and it would invite the misreading
    that the gate enforces them. It does not: a value outside `allowedValues` is
    still recorded, and a host that wants it refused says so in its own policy.
    Both slots are **absent** rather than `null` when there is nothing to say.
  - **`kind` is the discriminator everywhere** — a tool result, a binding, an
    attestor, a notification. A consumer switches on it and never on the presence of
    a field (AF-5). The seed's two notifications were told apart by which properties
    they carried; v0.1 is one union with a `kind`, gaining `docket-transition`.
  - **A provenance tag gains `at` and `binding` and renames `evidence` to `note`**
    (PV-1, PV-2). A chain read off the seed could not say when a claim was made or
    what to check it against.
- **`@affiant/core`'s `fromWire` refuses a payload from another protocol version**
  rather than guessing at a conversion (SR-4). The `0.0.1-seed` shape the shipped
  .NET framework still sends is a different document, not a subset, and reading it as
  this one would produce a record that swore to things nobody said. Its schemas stay
  vendored, under `packages/contract/protocol/schemas/seed/`, and are exported as
  `seedSchemas`; the `Seed*` types name the shape for a host translating at its own
  boundary.
- **`@affiant/core`'s `toWire` takes `(affidavit, protocolVersion?)`.** `WireCarry` is
  now the card envelope's presentation — `warnings`, `requiresConfirmation`,
  `presentation` — with `wireCarryOf(card)` lifting it off an envelope and
  `presentationToWire(carry)` writing the two optional slots back out as absent
  properties when they are empty.
- **`@affiant/core`'s `BlockedMarker` is a discriminated union**, so a reader narrows
  on `code` rather than checking whether `level` or `category` happens to be present
  — each arm carries exactly the context its own code makes meaningful (AZ-4, CV-4).
- **`packages/contract` vendors the whole rulebook, not four files.** 175 vendored
  documents: both wire versions' schemas, the 56 promoted fixtures and 7 byte vectors,
  the 45 positive and 23 negative per-schema fixtures, and the four machine-readable
  formats a driver reads (`fixture.schema.json`, `canonical-vector.schema.json`,
  `results.schema.json`, `parity/MANIFEST.schema.json`) plus the coverage-exemption
  list a driver copies. All checksummed against `SHA256SUMS` on every run.
- **`<affiant-evidence-card>` renders the presentation off the envelope**: a `<select>`
  from a field's `allowedValues`, a `pattern` attribute from its `pattern`, and the
  reviewer's sentences from the envelope's `warnings`. A hint for a field the record
  does not carry is ignored rather than rendered as a control over nothing. It keeps
  reading the superseded field-level keys as a deliberate fallback, because the
  shipped .NET framework still sends them; that fallback goes when it is aligned. The
  demo page now renders a v0.1 card fixture from the pinned ref, copied unedited.
- **The vocabulary lint skips a generated module**, by its banner. A module a
  generator wrote out of the vendored rulebook carries the rulebook's own words, and a
  byte vector's external reference naming somebody else's accounting record is not
  this project's working vocabulary — nor is there a doc comment in a data module for
  a person to fix.

### Added

- **[`packages/conformance-driver`](packages/conformance-driver)** — the program that
  binds the rulebook's conformance suite to `@affiant/core`, runs it on Node, Bun and
  workerd, emits a `results.schema.json` run document, and asserts the failing set
  equals the published parity manifest in both directions. **Required in CI on
  `main`**, so a red run cannot merge. Its own changelog is
  [here](packages/conformance-driver/CHANGELOG.md).
- **`@affiant/contract/conformance`** — the conformance suite as a module: the 56
  fixtures, the 7 byte vectors, the manifest section, the four formats and the
  coverage exemptions. A module rather than the JSON directly because the suite has
  to run inside workerd, which has no filesystem, and JSON module support differs
  across the three runtimes.
- **`presentationNamesUnknownFields(card)`** on `@affiant/contract` — the one rule the
  card schema cannot state: a presentation hint must name a field the same card's
  Affidavit carries, or it renders a control over nothing. That is a relation between
  two objects inside one document, and JSON Schema has no way to say it.


### Fixed

- **Every published package now ships its licence.** `@affiant/core`,
  `@affiant/contract` and `@affiant/evidence-card` each carry a `LICENSE` copied
  byte for byte from the repository root and named in their `files` list. npm does
  not reach outside a package directory, so the root copy never entered a tarball -
  and Apache-2.0 section 4(a) says a recipient of the work gets a copy. A test in
  `@affiant/core` asserts all three, so a `files` rewrite cannot drop one silently.
- The seed fixtures were described as payloads captured off a shipped
  implementation's wire, on the README, in both package READMEs, in the Pages
  workflow and on the published demo page. They are not captures: they are
  hand-authored examples whose key sets are asserted against the shipped .NET
  serializer by the demo hosts' wire-shape tests. `Sakwala/affiant-protocol`
  corrected its own wording on 2026-09-04; every claim here now matches it. The
  pin stays at `v0.0.1-seed`, which predates the correction, so the vendored
  manifest still spells the field `capturedFrom`.
- `AffidavitField.value`, `AffidavitField.previousValue` and the values of
  `AmendmentMap` were typed `unknown`, which admits `undefined` — and a key whose
  value is `undefined` does not survive `JSON.stringify`, so a payload that
  compiled here failed the schema's `required` at the far end. They are now the
  new exported `JsonValue`.
- `<affiant-evidence-card>` blanked itself, with an uncaught `TypeError`, on a
  payload missing a required key: the shadow root was left holding only its
  stylesheet. It now checks the envelope before rendering and shows a
  `<p role="alert">` naming the reason — for a malformed payload, a failed fetch
  and a response that is not JSON alike.
- `import "@affiant/evidence-card/register"` threw
  `ReferenceError: HTMLElement is not defined` under Node, so a server-side render
  crashed on the import. The class no longer needs a DOM to be declared, and
  registration is guarded.
- Every file under `packages/contract/protocol/` is shipped in the tarball but was
  unreachable through `exports`. `@affiant/contract/protocol/*` now resolves.

### Added

- **[`samples/scenario-deck`](samples/scenario-deck)** — one realistic support-desk
  scenario run twice, on the same four acts: once through a whole-call approval gate
  (the reviewer sees a tool name and its raw arguments as one blob and answers yes or
  no; written out in full, about twenty-five lines, no dependency) and once through
  the Affiant gate. It prints a two-column comparison per act — what the reviewer saw,
  what was recorded — then a closing table of the differences that are structural
  rather than a matter of effort, each with the rule id it comes from: per-field
  provenance and previous values against one arguments object (AF-1, AF-3, PV-1,
  PV-2); the three confidence numbers against none (AF-2); a required field nobody
  filled, present and tagged `Empty` against absent from the arguments and therefore
  invisible (AF-1); an amendment as an approval carrying corrections, tagged
  `UserStated` and bound to the reviewer's act over the machine's tag, against a
  rejection and a re-proposal indistinguishable from the agent's own (DK-1, DK-2,
  PV-2, AF-4); a Standing Order that degrades to a person because a mandatory field
  reads `Empty`, emitting `standing-order.blocked` with
  `blocked.reason: "mandatory-field-empty"`, against a rule keyed on a tool's name
  that cannot see a field the arguments omit (GT-5); expiry as a state read with no
  sweep run, and a resubmission whose lineage names what it supersedes, against a
  fresh unrelated row (DK-1); and three attestation kinds against a free-text string
  (AZ-1). No API key — the inference port is scripted, the projection port returns one
  record and the clock is moved by hand, so the run reproduces byte for byte and a
  test asserts the transcript in the sample's README is exactly what it prints. A
  workspace member (`samples/*`, private, never published), built and tested by the
  repository's own commands on the Node job.

- **[`samples/coverage-refusal`](samples/coverage-refusal)** — a standalone sample a
  skeptic can run: it builds a gate over the in-memory Docket and four trivial ports,
  hands it four tools shaped like the Vercel AI SDK's tool object (the SDK is not a
  dependency), and prints what the gate does with each. A provider-executed write tool
  and a write tool with no `execute` are refused at wire-up with their categories named
  (CV-4, CV-1); a hosted-MCP write the host declared it cannot cover is filed `pending`
  with `blocked: { code: "coverage-refused", … }` and cannot be decided (AZ-4); the one
  interceptable write tool produces a proposal and its own `execute` never runs (GT-6);
  the read tool passes through. Every instant comes from a pinned clock, so the run
  reproduces byte for byte — and a test asserts the transcript in the sample's README is
  exactly what the script prints. The sample is a workspace member (`samples/*`, private,
  never published) built and tested by the repository's own commands on the Node job.

- `@affiant/core` — [a README](packages/core/README.md) written for a host developer
  who has never seen this framework (what the gate is, the ports to supply, a worked
  example, the pipeline in order, the decision rules, and what the package does not
  claim), [its own changelog](packages/core/CHANGELOG.md), and a **publish guard**:
  `prepack` exits non-zero with "@affiant/core is not published until the parity report
  and the conformance driver are green", so `npm pack` and `npm publish` both fail until
  `AFFIANT_ALLOW_PUBLISH=1` is set. The condition was documentation; it is now a
  mechanism.
- `@affiant/core/testing` — the declarative fixture format, the runner that executes
  it against a real gate, and the stub ports a fixture is wired from
  (`scriptedInference`, `entityProjection`, `allowlistAuthorization`, `fixedClock`).
  One shape covers the whole gate: a wiring, a sequence of acts (`wrap-execute`,
  `file`, `decide`, `resubmit`, `markExecuted`, `expireDue`, `get`, `rehydrate`) and
  a partial matcher over the row, the card, the telemetry and the store. `runFixture`
  never throws on a mismatch — it returns every failure with the path it was found at
  — so the same documents can be run by this package's suites, by a host checking its
  own ports, and by the conformance driver that will publish what each implementation
  does not yet pass. Documented in `packages/core/test/README.md`.
- `@affiant/core` — fifty-four declarative fixtures covering both v0.1 sequences.
  Sequence A end to end (a chat turn through a wrapped tool to an executor's report,
  a rejection, typed inputs carried onto the card, a picker resolved from a system of
  record with an `external-ref` binding, a mandatory field left empty that no Standing
  Order will auto-approve and a person still may, expiry with resubmission, a late
  correction preserved and prefilled, two interleaved conversations, a retried call
  that stays one entry with its original deadline, a bounded sweep, rehydration order,
  coverage refused at wire-up) and Sequence C (a relay capture auto-approved on a
  bound `External` tag, a relayed decision attesting `member-via-relay`, an unbound
  `External` tag that asks a person instead, a machine caller refused because it may
  never attest `member`, and a relayed decision on another tenant's entry reported as
  not found).
- `@affiant/core` — `canonicalizeEntry`, `canonicalStringEntry`, `canonicalHashEntry`
  and `swornAffidavitOf`: the canonical form of a Docket row, taken over the state an
  approval accepted where there is one and the proposal otherwise. This is what a
  host's execution grant hashes over.
- `@affiant/core` — `amendmentTag`, the single definition of the provenance tag an
  accepted amendment puts in force. The canonical form calls it, and so does
  `applyAmendments`, so the bytes a decision produces cannot differ between the
  serialization path and the row.
- A second resource-envelope tripwire, `test/node/gate-budget.test.ts`: one thousand
  file-plus-decide passes over a ten-field Affidavit through the whole gate, averaging
  well under the stated bound and printing the number it measured.

### Changed

- **A Standing Order never fires while a proposed field marked mandatory reads
  `Empty`** (GT-5). The verdict degrades to `ReviewerConfirmation`,
  `standing-order.blocked` says so, and a person may still approve — they can see the
  hole, and an approval is of what was sworn to, not a licence to invent the missing
  value. The confidence numbers could not express the case: the aggregate is already
  `0.0` whenever any proposed field is `Empty`, so a policy keyed on
  `populatedConfidence` reads a high number over a proposal missing something the write
  cannot do without. An **optional** empty field does not block by rule; a floor there
  is a host policy. New on the public surface: `emptyMandatoryFields(affidavit)` and
  `PolicyOutcome.emptyMandatoryFields`; two new fixtures put the rule on both sides of
  the line.
- `standing-order.blocked` carries `blocked.reason` — a stable code
  (`mandatory-field-empty`, `unbound-declared-input`, `risk-above-threshold`) an
  operator can alert on without matching on prose, which would break the first time the
  wording improved — and `affidavit.empty_mandatory_fields`, the field names.
- `DocketEntry` keeps **both** the Affidavit as the agent proposed it (`affidavit`,
  never edited) and the state an approval accepted (`amendedAffidavit`, `null` until
  an amendment is accepted). An accepted amendment used to overwrite the proposal,
  which left a row unable to show what the agent originally said. The canonical form
  a host binds to is `canonicalize(amendedAffidavit ?? affidavit)`.
- `DocketEntry` records `toolName`, so a resubmission re-runs the coverage assessment
  against the tool that actually proposed the write and an audit can name it. A
  resubmission is no longer filed under a synthetic tool name.
- The amendments a refused late decision carried are their own fact,
  `DocketEntry.preservedAmendments`, carrying that decision's **own** instant and
  principal alongside the map. They used to share `DocketEntry.amendments` with an
  approval's accepted map, which conflated a refused caller's corrections with an
  approval's, and a resubmission had to date them to the row's deadline — the moment
  the gate refused, not the moment the person typed. `DocketStore.preserveAmendments`
  takes the act as a fourth argument.
- `canonicalize`, `canonicalString` and `canonicalHash` take `options.reviewerAct`
  (the decision's entry, instant and principal) where they took a
  `reviewerActRef` string, and apply amendments through `amendmentTag` rather than a
  placeholder of their own. The canonical byte vector for an amended Affidavit
  therefore changed: its reviewer-act binding now carries the decision instant, the
  tag in force is a whole provenance tag, a cleared **optional** field leaves the
  field list entirely (a cleared mandatory one stays, tagged `Empty` at confidence
  zero), and the aggregate is recomputed over what is left. The vector file states
  all of this beside the new bytes.
- The gate and decision fixtures moved onto the one declarative format, keeping their
  ids. `pnpm generate:fixtures` now mirrors every fixture set; the canonical byte
  vectors are regenerated by `pnpm generate:vectors`.

- `@affiant/core@0.1.0-alpha.0` — the first commit of the gate: the turn context
  every entry point takes as a parameter (`TurnContext`, `Principal`,
  `ChannelIdentity`), the port interfaces a host implements (`InferencePort`,
  `ProjectionPort`, `AuthorizationPort`, `RiskScorer`, `Clock`, `TelemetryPort`,
  `FieldInterceptor`), the closed `ErrorCode` registry with `AffiantError`, and the
  versioned telemetry-key registry generated from `telemetry-keys.json`. Ships a
  lint that fails the build if anything under `packages/core/src` can reach Durable
  Object storage, and runs its suite on Node, Bun and workerd. The gate's canonical
  form, pipeline and decision path land behind this. Not published to npm.
- `packages/contract/protocol/SHA256SUMS`, written by `sync-protocol.mjs` from the
  bytes at the pinned tag. `protocol-pin.test.ts` verifies every vendored copy
  against it on every run, offline included; the byte comparison against the tag
  itself remains, and now also catches a `SHA256SUMS` rewritten to bless a
  doctored copy.
- `packages/contract/test/generated.test.ts` — the committed generated modules
  (`src/schemas.ts`, which is what a consumer imports as
  `@affiant/contract/schemas`, and `test/fixtures.generated.ts`) are compared with
  the vendored JSON they are generated from. Nothing checked that before: a
  `sync-protocol` without a `generate` left every suite green while the shipped
  schemas described the previous tag. CI also regenerates both and fails on a diff.
- `@affiant/core` — the Affidavit model. The seven-source provenance ladder
  (`UserStated` > `External` > `Computed` > `Conversation` > `Inferred` > `Default`
  > `Empty`) with `determinismRank`; provenance tags whose confidence is clamped
  into `[0, 1]` at mint time; the five binding kinds that make a tag checkable
  (`utterance-span`, `reviewer-act`, `form-input`, `external-ref`,
  `computation-ref`); a chain that preserves every superseded tag, and a merge that
  takes the higher confidence, breaks ties toward the more deterministic source and
  keeps the loser. The inference step is handed a minting surface that cannot name
  `UserStated`. The `Affidavit` itself, with `buildAffidavit` enforcing that
  `fields[]` carries the proposed fields and nothing else and that an update names
  its entity and swears to what it replaces; the three confidence numbers, with
  `aggregateConfidence` the **minimum** over proposed fields rather than a mean over
  the populated ones; `Money` as a decimal string plus a currency code; amendment
  semantics where `null` clears and an absent key leaves a field untouched, an
  amended field carries the reviewer's act, and the three numbers are recomputed.
  `fromWire` / `toWire` round-trip the `wire/evidence-card-request` fixture from
  protocol tag `v0.0.1-seed` — which carries `aggregateConfidence: 0.95`, the mean
  of its two fields, where this package computes `0.9`, their minimum. Field values
  are the contract's `JsonValue`, with a deep runtime guard at the wire boundary.
- `@affiant/core` — the Docket: `DocketEntry` (status, execution outcome, the
  blocked marker, the attestation record, amendments, lineage and expiry), the
  `DocketStore` and `SessionStore` contracts, and the in-memory reference stores
  behind `@affiant/core/store-memory`. Filing is idempotent by entry id and never
  refreshes a deadline; every transition out of `pending` is a guarded
  compare-and-set; an entry past its expiry reads `expired` on every query whether
  or not a sweep has run, and the amendments a late decision carried are preserved
  on the row for resubmission; the expiry sweep is bounded, paged and scheduled by
  the host — the package owns no timer; retention, purge and export are hooks, and
  a session rehydrates entries awaiting a decision before entries awaiting
  execution. Every operation is tenant-scoped: a lookup in the wrong tenant is a
  miss, never another tenant's row.
- `@affiant/evidence-card@0.1.0-alpha.0` — `<affiant-evidence-card>`, a
  dependency-free custom element that renders an Affidavit for a person to
  approve, amend or reject, and emits one `affiant-decision` event. Ships a demo
  page that renders the `wire/evidence-card-request` fixture from protocol tag
  `v0.0.1-seed`. Not published to npm.
- `@affiant/contract@0.1.0-alpha.0` — the Affiant wire format as hand-written
  TypeScript types, faithful to protocol tag
  [`v0.0.1-seed`](https://github.com/Sakwala/affiant-protocol/tree/v0.0.1-seed).
  Vendors that tag's eight JSON Schemas and eight conformance fixtures
  byte-for-byte under `protocol/`, exports the schemas as importable objects from
  `@affiant/contract/schemas`, and checks the vendored copies against their
  checksums on every run and against the tag itself whenever the network is
  reachable. Not published to npm.
- pnpm workspace (`packages/*`, `spikes/*`), TypeScript 5 in strict mode with
  `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess`, ESM only, Node 22+.
- Continuous integration on three runtimes: Node 22, Bun and Cloudflare workerd.
- The card demo published to GitHub Pages on every push to `main`:
  <https://sakwala.github.io/affiant-ts/>.

[unreleased]: https://github.com/Sakwala/affiant-ts/commits/main
