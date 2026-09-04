# One scenario, two surfaces

A standalone sample. It runs **one realistic support-desk scenario twice** — once through a
whole-call approval gate, the shape every agent framework's "approve this tool call" gate
has, and once through the [Affiant](https://affiant.dev) gate — and prints, act by act, what
each surface showed the reviewer and what each one recorded.

The claim it exists to make checkable is one sentence: **Affiant is a different question from
whole-call approval, not a later entrant to the same one.** A whole-call gate answers _may
this call run?_ Affiant answers _is this field true, and who says so?_ Both are real
questions. Reading the two columns side by side is faster than being told the difference.

**No API key, no database, no model.** The inference port returns a fixed structured result,
the projection port returns one hard-coded customer record, the clock is moved by hand. Two
runs print the same bytes, which is what lets a test hold this file to the code.

## Run it

```bash
pnpm install
pnpm -C samples/scenario-deck build
node samples/scenario-deck/dist/deck.js
```

`AFFIANT_DEMO_JSON=1 node samples/scenario-deck/dist/deck.js` prints the same run as JSON —
every act, both surfaces' records, the cards, the Docket rows and the telemetry. The script
exits `0` either way.

## The scenario

A support agent has read a chat with customer `C-1042` and proposes to update their record.
The customer typed a new email address; said "upgrade me to the paid plan"; said "bill me at
the end of the month"; and said nothing at all about a phone number, which the record
requires and has never had.

| Act     | What happens                                                                                                                                                |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **I**   | The agent proposes four changes at once: `email`, `plan`, `billingDay`, and `phone` left unknown.                                                           |
| **II**  | The reviewer agrees with three of the four values and wants `billingDay` to be `31`, not `28`.                                                              |
| **III** | A second proposal — a change of address only — arrives under a Standing Order meant to approve it with nobody present. The required `phone` is still empty. |
| **IV**  | A third proposal is filed, nobody answers it, its deadline passes, and it is resubmitted.                                                                   |

The same four acts run on both surfaces. Nothing is staged to make the baseline look bad: it
is a faithful reduction of a good whole-call gate, written out in full in
[`src/baseline.ts`](src/baseline.ts) — about twenty-five lines of executable code, no
dependency.

## What a skeptic sees

Recorded 2026-09-04, from `node samples/scenario-deck/dist/deck.js`, verbatim. A test asserts
this block is exactly what the run prints, so it cannot drift away from the code.

<!-- transcript:begin -->

```text
Affiant - one scenario, two surfaces: field-level cards against a whole-call baseline
Clock pinned from 2026-09-04T09:00:00.000Z. In-memory Docket, scripted inference, no API key.
Nothing here writes to anything.

Act 1. The agent proposes four changes to one customer record  [AF-2, AF-3]

  BASELINE - whole-call approval
  what the reviewer saw                                 what was recorded
  ----------------------------------------------------  ----------------------------------------------------
  The whole call, as one blob:                          (nothing)

  {                                                     This gate writes a row when a decision is made,
    "tool": "update_customer",                          so a call still waiting for an answer leaves no
    "args": {                                           record at all. There is no pending state to read
      "email": "ana.silva@example.net",                 and nothing that could expire.
      "plan": "pro",
      "billingDay": 28                                  The record requires a phone number and has none.
    }                                                   "phone" is not in the arguments, so no reviewer
  }                                                     on this surface can be shown that hole.

  approve / reject ?

  AFFIANT - the field-level gate
  what the reviewer saw                                 what was recorded
  ----------------------------------------------------  ----------------------------------------------------
  Evidence Card - Customer C-1042                       entry       9e3f4410-714e-8248-9dc3-adbebf0be1cd
  decide by 2026-09-04T09:30:00.000Z                    tool        update_customer
                                                        status      pending
  email  [required]                                     requires    ReviewerConfirmation
    was   "ana.silva@oldmail.example"                   execution   (not approved)
    now   "ana.silva@example.net"                       attestation (none - nobody has decided)
    from  Conversation 0.95, bound: utterance-span      expires     2026-09-04T09:30:00.000Z

  plan  [required]                                      The Affidavit is on the row exactly as the agent
    was   "starter"                                     swore to it, and stays that way whatever is
    now   "pro"                                         decided next (DK-1).
    from  Inferred 0.8, bound: nothing

  billingDay  [optional]
    was   1
    now   28
    from  Inferred 0.4, bound: nothing

  phone  [required]
    was   (no stored value)
    now   (no value)
    from  Empty 0, bound: nothing

  aggregate 0  populated 0.4  empty fields 1

Act 2. The reviewer would say yes to three of the four values  [DK-1, AZ-1]

  BASELINE - whole-call approval
  what the reviewer saw                                 what was recorded
  ----------------------------------------------------  ----------------------------------------------------
  There is no way to say so. The vocabulary is          tool        update_customer
  approve or reject, over the whole call, so a          args        {"email":"ana.silva@example.net",
  reviewer who wants 31 must reject and let a                       "plan":"pro","billingDay":28}
  corrected call be made:                               decision    reject
                                                        by          "ana"
  {                                                     at          2026-09-04T09:05:00.000Z
    "tool": "update_customer",
    "args": {                                           tool        update_customer
      "email": "ana.silva@example.net",                 args        {"email":"ana.silva@example.net",
      "plan": "pro",                                                "plan":"pro","billingDay":31}
      "billingDay": 28                                  decision    approve
    }                                                   by          "ana"
  }                                                     at          2026-09-04T09:05:00.000Z

  reject, then:                                         Two rows, and the second is indistinguishable
                                                        from a proposal the agent made unaided. Nothing
  {                                                     in it says a person chose 31, or that 28 was ever
    "tool": "update_customer",                          proposed, or which of the three other values the
    "args": {                                           reviewer actually looked at.
      "email": "ana.silva@example.net",
      "plan": "pro",
      "billingDay": 31
    }
  }

  approve

  AFFIANT - the field-level gate
  what the reviewer saw                                 what was recorded
  ----------------------------------------------------  ----------------------------------------------------
  The card takes the correction in the field it         entry       9e3f4410-714e-8248-9dc3-adbebf0be1cd
  belongs to. The reviewer types 31 over 28 and         tool        update_customer
  approves; the other three fields are approved as      status      approved
  sworn.                                                requires    ReviewerConfirmation
                                                        execution   unexecuted
  amend  billingDay: 28 -> 31                           attestation member - ana
  then   approve, as ana                                expires     2026-09-04T09:30:00.000Z
                                                        amendments  {"billingDay":31}

                                                        as the agent proposed it, unedited:
                                                        billingDay  [optional]
                                                          was   1
                                                          now   28
                                                          from  Inferred 0.4, bound: nothing
                                                          aggregate 0  populated 0.4  empty fields 1

                                                        the state the approval accepted, beside it:
                                                        billingDay  [optional]
                                                          was   1
                                                          now   31
                                                          from  UserStated 1, bound: reviewer-act
                                                          over  Inferred
                                                          aggregate 0  populated 0.8  empty fields 1

                                                        The corrected field is a person's own statement,
                                                        bound to the decision that made it, over the
                                                        machine's tag rather than instead of it. The
                                                        attestation names the person; its kind is the
                                                        mode, and there is no fourth kind (AZ-1).

                                                        Nothing has been written to any database: this
                                                        sample supplies no executor, so the row reads
                                                        approved and unexecuted, which is the truth.

Act 3. A second change is meant to be approved with nobody present  [GT-5, AZ-1]

  BASELINE - whole-call approval
  what the reviewer saw                                 what was recorded
  ----------------------------------------------------  ----------------------------------------------------
  Nobody was shown anything. The call matched an        tool        update_customer_contact
  always-allow rule for update_customer_contact,        args        {"email":"ana@silva-consulting.example"}
  which is the whole vocabulary this surface has        decision    approve
  for approving without a person.                       by          "allowlist"
                                                        at          2026-09-04T09:10:00.000Z
  Had a reviewer been asked, this is the blob:
                                                        The "by" column is a string. It could say
  {                                                     "allowlist", or "ana", or anything at all, and
    "tool": "update_customer_contact",                  the record cannot tell a person who was present
    "args": {                                           from a rule that fired with nobody there.
      "email": "ana@silva-consulting.example"
    }                                                   The record still requires a phone number and
  }                                                     still has none. That field is not in the
                                                        arguments, so no rule on this surface could have
                                                        noticed, whatever it wanted to check.

  AFFIANT - the field-level gate
  what the reviewer saw                                 what was recorded
  ----------------------------------------------------  ----------------------------------------------------
  The Standing Order routine-contact-update v1.4.0      entry       72bb8f0c-f22c-8f05-9955-49b18388c4e9
  returned StandingOrder: a contact-details change      tool        update_customer_contact
  is routine, and the policy names no risk              status      pending
  threshold and predicates on no provenance source,     requires    ReviewerConfirmation
  so neither of the other two checks on a               execution   (not approved)
  person-free approval is what stopped it.              attestation (none - nobody has decided)
                                                        expires     2026-09-04T09:40:00.000Z
  Evidence Card - Customer C-1042
  decide by 2026-09-04T09:40:00.000Z                    telemetry:
                                                          standing-order.blocked mandatory-field-empty
  email  [required]                                       affidavit.filed
    was   "ana.silva@oldmail.example"
    now   "ana@silva-consulting.example"                The verdict degraded toward a person, which is
    from  Conversation 0.97, bound: utterance-span      the only direction a requirement may move, and
                                                        the degrade is on the telemetry port with a code
  phone  [required]                                     an operator can alert on rather than a sentence
    was   (no stored value)                             they would have to match on (GT-5).
    now   (no value)
    from  Empty 0, bound: nothing

  aggregate 0  populated 0.97  empty fields 1

  warning: GT-5: "phone" is a field the entity
    requires and it has no known value; a Standing
    Order does not fire over an empty required field,
    and a person is asked instead

Act 4. A third change is proposed, nobody answers, and it comes back later  [DK-1]

  BASELINE - whole-call approval
  what the reviewer saw                                 what was recorded
  ----------------------------------------------------  ----------------------------------------------------
  At 2026-09-04T09:20:00.000Z the reviewer is shown:    tool        update_customer_billing
                                                        args        {"billingDay":15}
  {                                                     decision    approve
    "tool": "update_customer_billing",                  by          "ana"
    "args": {                                           at          2026-09-04T09:55:00.000Z
      "billingDay": 15
    }                                                   One row, for the second attempt. The first left
  }                                                     nothing behind, so nothing links the two and
                                                        nothing says a proposal was ever dropped. A
  Nobody answers. Thirty-five minutes later the         reviewer opening this log cannot tell a first
  same call is made again and approved:                 attempt from a retry.

  {
    "tool": "update_customer_billing",
    "args": {
      "billingDay": 15
    }
  }

  AFFIANT - the field-level gate
  what the reviewer saw                                 what was recorded
  ----------------------------------------------------  ----------------------------------------------------
  Filed at 2026-09-04T09:20:00.000Z, deadline           the entry nobody answered:
  2026-09-04T09:50:00.000Z. Nobody decided.             entry       da6584f4-22e1-88b1-a343-2533a2837f8e
                                                        tool        update_customer_billing
  Read again at 2026-09-04T09:55:00.000Z:               status      expired
  the entry reads expired. No sweep has run in          requires    ReviewerConfirmation
  this process - expireDue was never called - and       execution   (not approved)
  the state is true anyway, because the deadline is     attestation (none - nobody has decided)
  applied on every read (DK-1).                         expires     2026-09-04T09:50:00.000Z
                                                        successor   c3854a12-a521-8167-bcfe-9bf5ece3ba67
  Resubmitting files a new entry and re-runs the
  whole pipeline, so the policy chain gets another      the resubmission:
  say and the deadline is stamped afresh:               entry       c3854a12-a521-8167-bcfe-9bf5ece3ba67
                                                        tool        update_customer_billing
  Evidence Card - Customer C-1042                       status      pending
  decide by 2026-09-04T10:25:00.000Z                    requires    ReviewerConfirmation
                                                        execution   (not approved)
  billingDay  [optional]                                attestation (none - nobody has decided)
    was   1                                             expires     2026-09-04T10:25:00.000Z
    now   15                                            supersedes  da6584f4-22e1-88b1-a343-2533a2837f8e
    from  Conversation 0.99, bound: utterance-span
                                                        A resubmission is never a reopening. The old row
  aggregate 0.99  populated 0.99  empty fields 0        keeps its terminal state and gains a successor
                                                        link; the new one names what it supersedes. The
                                                        history reads forward and nothing that was once
                                                        recorded is edited (DK-1, DK-4).

The differences that are structural, not cosmetic

  1.  Where a value came from                                                 [PV-1, PV-2, AF-1]
      baseline  one arguments object; a value's origin is not a property the record has
      Affiant   every field carries the grade of its own source and what that grade points at

  2.  What a value replaces                                                               [AF-3]
      baseline  the call carries the new value only; nothing reads the record being written to
      Affiant   an update names its entity and every proposed field swears to what it replaces

  3.  How sure the producer was                                                           [AF-2]
      baseline  no confidence anywhere; a guess and a quotation arrive identical
      Affiant   three numbers on every card - the minimum over all fields, the minimum over the
                populated ones, and how many were empty - reported, never enforced

  4.  A field nobody filled                                                               [AF-1]
      baseline  absent from the arguments, so invisible to any reviewer and any rule
      Affiant   present on the record and tagged Empty, so the hole is something you can see

  5.  Changing one value                                                [DK-1, DK-2, PV-2, AF-4]
      baseline  reject, then a corrected call that is indistinguishable from one the agent made
                unaided
      Affiant   an approval carrying corrections: the corrected field is tagged UserStated and
                bound to the reviewer's act, over the machine's tag rather than instead of it,
                with the proposal kept unedited beside the accepted state

  6.  Approving with nobody present                                                       [GT-5]
      baseline  a rule keyed on the tool's name, which cannot see a field the arguments omit
      Affiant   a Standing Order never fires while a field the record requires reads Empty; the
                degrade goes to a person and carries a reason code an operator can alert on

  7.  A proposal nobody answered                                                          [DK-1]
      baseline  no state; the row is written on decision, so an abandoned call leaves nothing
      Affiant   an entry past its deadline reads expired on every query, with no sweep run

  8.  Trying again                                                                        [DK-1]
      baseline  a fresh row with no link to the attempt that lapsed
      Affiant   a new entry whose lineage names the one it supersedes, while the old row keeps
                its terminal state and gains the successor link

  9.  Who agreed                                                                          [AZ-1]
      baseline  a string; a person who was present and a rule that fired read the same
      Affiant   three kinds and no fourth - member, member-via-relay, standing-order - where the
                kind is the mode, so there is no separate field for it to drift from

Summary: 4 acts on one scenario - 4 whole-call rows, 4 Docket entries, 0 host writes executed.
```

<!-- transcript:end -->

## What the deck proves

Each of these is visible in the transcript above and asserted in the suite. The rule ids
resolve in
[`INVARIANTS.md`](https://github.com/Sakwala/affiant-protocol/blob/main/INVARIANTS.md) in the
rulebook.

- **A value's origin is a property of the field, not of the call (AF-1, PV-1, PV-2).** The
  email the customer typed is graded `Conversation` and carries an `utterance-span` binding —
  a pointer at the characters it was read from. The plan and the billing day are graded
  `Inferred` and point at nothing, which is the honest grade for a value a model reasoned to.
  The whole-call baseline has one arguments object and nowhere to put any of it.
- **Every field swears to what it replaces (AF-3).** The card reads `"starter" → "pro"`. The
  blob reads `"pro"`.
- **A field nobody filled is on the record, tagged `Empty` (AF-1).** `phone` is required and
  has no value, and the card says so in the field it belongs to. On the baseline `phone` is
  simply not in the arguments — invisible to every reviewer and to every rule, however much
  either wanted to look.
- **Three confidence numbers, reported and never enforced (AF-2).** `aggregateConfidence` is
  `0` here — it is the minimum over every proposed field with an `Empty` counting as `0`, so
  it is `0` exactly when something is missing. `populatedConfidence` is `0.4`, the minimum
  over what was filled. `emptyFieldCount` is `1`. A mean that first discarded the empty field
  would have reported `0.72` over a proposal with a hole in it.
- **An amendment is an act, with the person on the record (DK-1, DK-2, PV-2, AF-4).** On the
  baseline, "yes, but 31" costs a rejection and a corrected call that is indistinguishable
  from one the agent made unaided. On the Affiant row the corrected field is tagged
  `UserStated` at confidence `1.0`, bound to the decision that made it, sitting **over** the
  machine's `Inferred` tag rather than instead of it — and the Affidavit as the agent proposed
  it stays on the row, unedited, beside the state the approval accepted.
- **A person-free approval will not fire over a hole (GT-5).** The Standing Order in act III
  names no risk threshold and predicates on no provenance source, so nothing else could have
  stopped it. It degrades to a person because a field the record requires reads `Empty`, and
  the degrade lands on the telemetry port as `standing-order.blocked` with
  `blocked.reason: "mandatory-field-empty"` — a code an operator can alert on, not a sentence
  they would have to match on. The baseline's equivalent is a rule keyed on the tool's name,
  which cannot see a field the arguments omit.
- **Expiry is a state, not an event (DK-1).** The deck never calls `expireDue`. The entry in
  act IV reads `expired` anyway, because the deadline is applied on every read. On the
  baseline an unanswered call leaves nothing behind at all.
- **A retry has lineage (DK-1).** The resubmission is a new entry naming what it supersedes,
  and the lapsed row keeps its terminal state and gains the successor link. The baseline's
  second attempt is a fresh row with nothing linking it to the first.
- **Who agreed has a kind (AZ-1).** `member`, `member-via-relay`, `standing-order` — three,
  and no fourth, with the kind _being_ the mode rather than a separate field to drift from it.
  The baseline's `by` column is a string: `"ana"` and `"allowlist"` sit in it identically.

## What the deck does not prove

- **It is not a benchmark.** Nothing here is timed, nothing is compared at scale, and one
  scenario is one scenario. It shows what each surface can and cannot _record_; it says
  nothing about throughput, cost or reviewer effort.
- **It is not adoption.** Nobody is running this in production, and it is not evidence that
  anybody is.
- **It is not a claim that whole-call gates are wrong.** They answer a real question — _may
  this call run?_ — and answer it well. Affiant answers a different one and does not replace
  them; a host can reasonably want both.
- **It is not a host.** There is no database, no model, no transport and no reviewer surface.
  Nothing writes anywhere: the gate never executes a write by rule (AZ-7) and this sample
  supplies no executor, which is why act II's approved row reads `execution: "unexecuted"`.
  That is the truth about this run, not an omission.
- **The card in the transcript is read from the row, not from the wire.** The wire Affidavit
  at protocol tag `0.0.1-seed` has no place to put a provenance tag's binding, so a card
  serialized to that shape loses the pointer PV-2 requires. The binding is on the record
  either way; the seed wire shape simply predates carrying it, and the v0.1 schemas close it.
- **A tool that writes inside its own body is outside the guarantee (GT-6).** No wire-up check
  can see it. That limit is stated rather than papered over — and
  [`samples/coverage-refusal`](../coverage-refusal) is the sample about where the boundary is
  and how it fails.

## The tests

```bash
pnpm -C samples/scenario-deck test
```

They assert, per act, both surfaces' records: that a whole-call row has five properties and
none of them is a field, while the Affiant row carries a provenance tag per field; that the
amendment is a `reviewer-act`-bound `UserStated` tag over the machine's, with the three
numbers recomputed; that the Standing Order is blocked with reason `mandatory-field-empty` on
the telemetry port and no `standing-order.fired` beside it; that the expired entry reads
`expired` with no sweep run and the resubmission's lineage names it; that no write tool's own
`execute` ever ran; and that the transcript above is exactly what `runDeck()` produces.

## Where the rules live

`@affiant/core` implements them in [`packages/core/src/gate`](../../packages/core/src/gate) —
`pipeline.ts` builds the Affidavit and files the entry, `policy.ts` runs the three checks on a
person-free approval, `decide.ts` applies a decision and its amendments. The rules themselves
are in [Sakwala/affiant-protocol](https://github.com/Sakwala/affiant-protocol): AF-1, AF-2,
AF-3, AF-4, PV-1, PV-2, GT-5, GT-6, DK-1, DK-2, AZ-1, AZ-4 and AZ-7.
