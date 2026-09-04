# Changelog

All notable changes to this repository are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); the packages follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Every entry that changes a wire type or a vendored schema names the
[`Sakwala/affiant-protocol`](https://github.com/Sakwala/affiant-protocol) tag it
was made against.

## [Unreleased]

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
