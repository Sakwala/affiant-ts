/**
 * One scenario, run twice: through a whole-call approval gate and through the
 * Affiant gate, with what each surface showed the reviewer and what each recorded
 * printed side by side.
 *
 * A standalone sample — not a host, not an adopter, not a benchmark. It exists to
 * make one claim testable: **Affiant is a different question from whole-call
 * approval, not a later entrant to the same one.** A whole-call gate answers *may
 * this call run?* Affiant answers *is this field true, and who says so?* Both are
 * real questions. Running the same four acts through both surfaces is what turns
 * that sentence from a slogan into something a reader can check in thirty seconds.
 *
 * ## The scenario
 *
 * A support agent has read a chat and proposes to update customer `C-1042`: change
 * the `email` the customer typed, move `plan` from `starter` to `pro` because they
 * said "upgrade me", set `billingDay` to `28` because they said "end of the month",
 * and leave `phone` — which the record requires and has never had — unknown. Then a
 * reviewer changes `billingDay` to `31`. Then a second proposal arrives under a
 * Standing Order for contact-detail changes, with the required `phone` still empty.
 * Then a third proposal expires with nobody looking, and is resubmitted.
 *
 * ## Rules cited
 *
 * **AF-2** (three confidence numbers, `aggregateConfidence` the minimum with `Empty`
 * counting as `0`), **AF-3** (an update names its entity and every field swears to
 * what it replaces), **GT-5** (a Standing Order never fires while a mandatory field
 * reads `Empty`), **DK-1** (the row keeps the proposal unedited, expiry is a
 * queryable state, a resubmission's lineage names what it supersedes), **AZ-1**
 * (three attestation kinds and no fourth; the kind *is* the mode). They resolve in
 * `INVARIANTS.md` in the rulebook at
 * https://github.com/Sakwala/affiant-protocol.
 *
 * ## Determinism
 *
 * No model, no database, no API key. The inference port returns a fixed structured
 * result, the projection port returns one hard-coded record, and the clock is moved
 * by hand — so two runs print the same bytes, which is what lets a test compare the
 * transcript in `README.md` against the run that produced it.
 *
 * @packageDocumentation
 */

import { pathToFileURL } from "node:url";

import type { JsonValue } from "@affiant/core";

import type { WholeCallRecord } from "./baseline.js";
import { WholeCallGate } from "./baseline.js";
import type { CardFieldView, CardView, ConfidenceView, RowView, TelemetryLine } from "./affiant.js";
import {
  AT,
  POLICY_ID,
  POLICY_VERSION,
  REVIEWER,
  TURNS,
  cardViewOf,
  createScenario,
  rowViewOf,
} from "./affiant.js";

// ---------------------------------------------------------------------------
// What the deck reports
// ---------------------------------------------------------------------------

/** What one surface showed and what it wrote down, for one act. */
export interface SurfaceView {
  /** The lines under "what the reviewer saw". */
  readonly shown: readonly string[];
  /** The lines under "what was recorded". */
  readonly recorded: readonly string[];
}

/** One act, on both surfaces. */
export interface ActResult {
  /** Its position in the deck, from 1. */
  readonly act: number;
  /** What the act is about, in a line. */
  readonly title: string;
  /** The rulebook ids the Affiant column demonstrates. */
  readonly rules: readonly string[];
  /** The whole-call baseline's two columns, and the rows this act added to its log. */
  readonly baseline: SurfaceView & { readonly records: readonly WholeCallRecord[] };
  /** Affiant's two columns, the cards and rows this act produced, and its events. */
  readonly affiant: SurfaceView & {
    readonly cards: readonly CardView[];
    readonly rows: readonly RowView[];
    readonly telemetry: readonly TelemetryLine[];
  };
}

/** One difference that follows from the shape of the two surfaces, not from effort. */
export interface Difference {
  /** What the difference is about. */
  readonly what: string;
  /** What the whole-call baseline can say. */
  readonly baseline: string;
  /** What the Affiant record says. */
  readonly affiant: string;
  /** The rulebook ids it comes from. */
  readonly rules: readonly string[];
}

/** Everything one run of the deck produced. */
export interface DeckResult {
  /** The instant the first act is pinned to. */
  readonly at: string;
  /** The four acts, in order. */
  readonly acts: readonly ActResult[];
  /** The closing table. */
  readonly differences: readonly Difference[];
  /**
   * How many times a write tool's own `execute` ran. Always `0`: the gated write
   * path does not hold a reference to it (GT-6).
   */
  readonly hostWrites: number;
  /** The one-line closing line. */
  readonly summary: string;
}

// ---------------------------------------------------------------------------
// Small renderers, shared by the two columns
// ---------------------------------------------------------------------------

/** A value as a reviewer surface would print it. */
function valueOf(value: JsonValue | null, absent: string): string {
  return value === null ? absent : JSON.stringify(value);
}

/** One card field, as four short lines. */
function fieldLines(field: CardFieldView): string[] {
  const lines = [
    `${field.name}  [${field.isMandatory ? "required" : "optional"}]`,
    `  was   ${valueOf(field.previousValue, "(no stored value)")}`,
    `  now   ${valueOf(field.value, "(no value)")}`,
    `  from  ${field.source} ${String(field.confidence)}, ` +
      `bound: ${field.bindingKind ?? "nothing"}`,
  ];
  if (field.priorSources.length > 0) {
    lines.push(`  over  ${field.priorSources.join(", ")}`);
  }
  return lines;
}

/** The three numbers, on one line (AF-2). */
function numbersLine(numbers: ConfidenceView): string {
  return (
    `aggregate ${String(numbers.aggregate)}  ` +
    `populated ${numbers.populated === null ? "none" : String(numbers.populated)}  ` +
    `empty fields ${String(numbers.emptyFieldCount)}`
  );
}

/** A whole Evidence Card, as the reviewer reads it. */
function cardLines(card: CardView): string[] {
  const lines = [
    `Evidence Card - ${card.entityType} ${card.entityId ?? "(new)"}`,
    `decide by ${card.requiredBy}`,
    "",
  ];
  for (const field of card.fields) {
    lines.push(...fieldLines(field), "");
  }
  lines.push(numbersLine(card.confidence));
  for (const warning of card.warnings) lines.push("", `warning: ${warning}`);
  return lines;
}

/** A Docket row, as the record holds it. */
function rowLines(row: RowView): string[] {
  const lines = [
    `entry       ${row.entryId}`,
    `tool        ${row.toolName}`,
    `status      ${row.status}`,
    `requires    ${row.requirement}`,
    `execution   ${row.execution ?? "(not approved)"}`,
    `attestation ${
      row.attestationKind === null
        ? "(none - nobody has decided)"
        : `${row.attestationKind} - ${row.attestationBy ?? ""}`
    }`,
    `expires     ${row.expiresAt}`,
  ];
  if (row.lineage.supersedes !== null) lines.push(`supersedes  ${row.lineage.supersedes}`);
  if (row.lineage.supersededBy !== null) lines.push(`successor   ${row.lineage.supersededBy}`);
  return lines;
}

/** Compact JSON broken at its own commas, so a long arguments blob still fits a column. */
function wrapJson(json: string, width: number): string[] {
  const out: string[] = [];
  let current = "";
  for (const piece of json.split(/(?<=,)/)) {
    if (current === "") current = piece;
    else if (current.length + piece.length <= width) current += piece;
    else {
      out.push(current);
      current = piece;
    }
  }
  if (current !== "") out.push(current);
  return out;
}

/** One whole-call record, as the baseline's log holds it. */
function recordLines(record: WholeCallRecord): string[] {
  const [first = "", ...rest] = wrapJson(JSON.stringify(record.args), COLUMN - 12);
  return [
    `tool        ${record.tool}`,
    `args        ${first}`,
    ...rest.map((line) => `            ${line}`),
    `decision    ${record.decision}`,
    `by          ${JSON.stringify(record.by)}`,
    `at          ${record.at}`,
  ];
}

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------

/** The arguments the agent's tool call carried in act I. */
const ACT_I_ARGS = { email: "ana.silva@example.net", plan: "pro", billingDay: 28 } as const;

/** The same call with the reviewer's correction applied — act II's second baseline call. */
const ACT_II_ARGS = { email: "ana.silva@example.net", plan: "pro", billingDay: 31 } as const;

/** The arguments act III's contact-detail call carried. */
const ACT_III_ARGS = { email: "ana@silva-consulting.example" } as const;

/** The arguments act IV's billing call carried. */
const ACT_IV_ARGS = { billingDay: 15 } as const;

/**
 * Run the four acts on both surfaces and report what each one showed and recorded.
 *
 * Pure with respect to the process: it builds its own gate over its own in-memory
 * Docket and its own baseline log, so a caller can run it twice and get the same
 * answer both times.
 */
export async function runDeck(): Promise<DeckResult> {
  const scenario = createScenario();
  const baseline = new WholeCallGate();
  const acts: ActResult[] = [];
  let watermark = 0;

  // --- Act I: the agent proposes -------------------------------------------
  const turnOne = scenario.ctxFor(TURNS.first, AT.proposal);
  const proposed = await scenario.gate
    .wrap(scenario.toolFor("update_customer"), turnOne)
    .execute(ACT_I_ARGS);
  if (proposed.kind !== "write") throw new Error(`act I expected a proposal, got ${proposed.kind}`);
  const entryOne = await requireEntry(scenario, proposed.entryId, turnOne, "act I");
  const cardOne = cardViewOf(entryOne, proposed.card);
  const rowOne = rowViewOf(entryOne, entryOne.status);
  const eventsOne = scenario.telemetrySince(watermark);
  watermark = eventsOne.next;

  acts.push({
    act: 1,
    title: "The agent proposes four changes to one customer record",
    rules: ["AF-2", "AF-3"],
    baseline: {
      shown: [
        "The whole call, as one blob:",
        "",
        ...baseline.present("update_customer", ACT_I_ARGS).split("\n"),
        "",
        "approve / reject ?",
      ],
      recorded: [
        "(nothing)",
        "",
        "This gate writes a row when a decision is made,",
        "so a call still waiting for an answer leaves no",
        "record at all. There is no pending state to read",
        "and nothing that could expire.",
        "",
        "The record requires a phone number and has none.",
        `"phone" is not in the arguments, so no reviewer`,
        "on this surface can be shown that hole.",
      ],
      records: [],
    },
    affiant: {
      shown: cardLines(cardOne),
      recorded: [
        ...rowLines(rowOne),
        "",
        "The Affidavit is on the row exactly as the agent",
        "swore to it, and stays that way whatever is",
        "decided next (DK-1).",
      ],
      cards: [cardOne],
      rows: [rowOne],
      telemetry: eventsOne.lines,
    },
  });

  // --- Act II: the reviewer changes one value ------------------------------
  scenario.clock.set(AT.decision);
  const rejected = baseline.proposeCall(
    "update_customer",
    ACT_I_ARGS,
    "reject",
    REVIEWER,
    AT.decision,
  );
  const reproposed = baseline.proposeCall(
    "update_customer",
    ACT_II_ARGS,
    "approve",
    REVIEWER,
    AT.decision,
  );

  const decisionCtx = scenario.ctxFor(TURNS.first, AT.decision);
  await scenario.gate.decide(
    proposed.entryId,
    { kind: "approve", amendments: { billingDay: 31 }, reason: "billed on the 31st, not the 28th" },
    decisionCtx,
  );
  const entryTwo = await requireEntry(scenario, proposed.entryId, decisionCtx, "act II");
  const rowTwo = rowViewOf(entryTwo, entryTwo.status);
  const eventsTwo = scenario.telemetrySince(watermark);
  watermark = eventsTwo.next;
  const amendedBillingDay = fieldOf(rowTwo.amendedFields ?? [], "billingDay");
  const proposedBillingDay = fieldOf(rowTwo.proposedFields, "billingDay");

  acts.push({
    act: 2,
    title: "The reviewer would say yes to three of the four values",
    rules: ["DK-1", "AZ-1"],
    baseline: {
      shown: [
        "There is no way to say so. The vocabulary is",
        "approve or reject, over the whole call, so a",
        "reviewer who wants 31 must reject and let a",
        "corrected call be made:",
        "",
        ...rejected.shown.split("\n"),
        "",
        "reject, then:",
        "",
        ...reproposed.shown.split("\n"),
        "",
        "approve",
      ],
      recorded: [
        ...recordLines(rejected.record),
        "",
        ...recordLines(reproposed.record),
        "",
        "Two rows, and the second is indistinguishable",
        "from a proposal the agent made unaided. Nothing",
        "in it says a person chose 31, or that 28 was ever",
        "proposed, or which of the three other values the",
        "reviewer actually looked at.",
      ],
      records: [rejected.record, reproposed.record],
    },
    affiant: {
      shown: [
        "The card takes the correction in the field it",
        "belongs to. The reviewer types 31 over 28 and",
        "approves; the other three fields are approved as",
        "sworn.",
        "",
        `amend  billingDay: ${valueOf(proposedBillingDay.value, "(no value)")} -> 31`,
        `then   approve, as ${REVIEWER}`,
      ],
      recorded: [
        ...rowLines(rowTwo),
        `amendments  ${JSON.stringify(rowTwo.amendments)}`,
        "",
        "as the agent proposed it, unedited:",
        ...fieldLines(proposedBillingDay),
        `  ${numbersLine(rowTwo.confidence)}`,
        "",
        "the state the approval accepted, beside it:",
        ...fieldLines(amendedBillingDay),
        `  ${numbersLine(rowTwo.amendedConfidence ?? rowTwo.confidence)}`,
        "",
        "The corrected field is a person's own statement,",
        "bound to the decision that made it, over the",
        "machine's tag rather than instead of it. The",
        "attestation names the person; its kind is the",
        "mode, and there is no fourth kind (AZ-1).",
        "",
        "Nothing has been written to any database: this",
        "sample supplies no executor, so the row reads",
        "approved and unexecuted, which is the truth.",
      ],
      cards: [],
      rows: [rowTwo],
      telemetry: eventsTwo.lines,
    },
  });

  // --- Act III: a person-free approval meets a hole ------------------------
  scenario.clock.set(AT.standingOrder);
  const allowlisted = baseline.proposeCall(
    "update_customer_contact",
    ACT_III_ARGS,
    "approve",
    "allowlist",
    AT.standingOrder,
  );

  const turnTwo = scenario.ctxFor(TURNS.second, AT.standingOrder);
  const contact = await scenario.gate
    .wrap(scenario.toolFor("update_customer_contact"), turnTwo)
    .execute(ACT_III_ARGS);
  if (contact.kind !== "write") throw new Error(`act III expected a proposal, got ${contact.kind}`);
  const entryThree = await requireEntry(scenario, contact.entryId, turnTwo, "act III");
  const cardThree = cardViewOf(entryThree, contact.card);
  const rowThree = rowViewOf(entryThree, entryThree.status);
  const eventsThree = scenario.telemetrySince(watermark);
  watermark = eventsThree.next;

  acts.push({
    act: 3,
    title: "A second change is meant to be approved with nobody present",
    rules: ["GT-5", "AZ-1"],
    baseline: {
      shown: [
        "Nobody was shown anything. The call matched an",
        "always-allow rule for update_customer_contact,",
        "which is the whole vocabulary this surface has",
        "for approving without a person.",
        "",
        "Had a reviewer been asked, this is the blob:",
        "",
        ...allowlisted.shown.split("\n"),
      ],
      recorded: [
        ...recordLines(allowlisted.record),
        "",
        'The "by" column is a string. It could say',
        '"allowlist", or "ana", or anything at all, and',
        "the record cannot tell a person who was present",
        "from a rule that fired with nobody there.",
        "",
        "The record still requires a phone number and",
        "still has none. That field is not in the",
        "arguments, so no rule on this surface could have",
        "noticed, whatever it wanted to check.",
      ],
      records: [allowlisted.record],
    },
    affiant: {
      shown: [
        `The Standing Order ${POLICY_ID} v${POLICY_VERSION}`,
        "returned StandingOrder: a contact-details change",
        "is routine, and the policy names no risk",
        "threshold and predicates on no provenance source,",
        "so neither of the other two checks on a",
        "person-free approval is what stopped it.",
        "",
        ...cardLines(cardThree),
      ],
      recorded: [
        ...rowLines(rowThree),
        "",
        "telemetry:",
        ...eventsThree.lines.map(
          (line) => `  ${line.key}${line.blockedReason === null ? "" : ` ${line.blockedReason}`}`,
        ),
        "",
        "The verdict degraded toward a person, which is",
        "the only direction a requirement may move, and",
        "the degrade is on the telemetry port with a code",
        "an operator can alert on rather than a sentence",
        "they would have to match on (GT-5).",
      ],
      cards: [cardThree],
      rows: [rowThree],
      telemetry: eventsThree.lines,
    },
  });

  // --- Act IV: nobody answered ---------------------------------------------
  scenario.clock.set(AT.abandoned);
  const turnThree = scenario.ctxFor(TURNS.third, AT.abandoned);
  const abandoned = await scenario.gate
    .wrap(scenario.toolFor("update_customer_billing"), turnThree)
    .execute(ACT_IV_ARGS);
  if (abandoned.kind !== "write") {
    throw new Error(`act IV expected a proposal, got ${abandoned.kind}`);
  }
  const shownFourth = baseline.present("update_customer_billing", ACT_IV_ARGS);

  scenario.clock.set(AT.afterDeadline);
  const lateCtx = scenario.ctxFor(TURNS.third, AT.afterDeadline);
  const lapsed = await requireEntry(scenario, abandoned.entryId, lateCtx, "act IV");
  const rowLapsed = rowViewOf(lapsed, lapsed.status);

  const resubmitted = await scenario.gate.resubmit(abandoned.entryId, lateCtx);
  const entryFour = await requireEntry(scenario, resubmitted.entry.entryId, lateCtx, "act IV");
  const cardFour = cardViewOf(entryFour, resubmitted.card);
  const rowFour = rowViewOf(entryFour, entryFour.status);
  const superseded = await requireEntry(scenario, abandoned.entryId, lateCtx, "act IV");
  const rowSuperseded = rowViewOf(superseded, superseded.status);
  const eventsFour = scenario.telemetrySince(watermark);
  watermark = eventsFour.next;

  const retried = baseline.proposeCall(
    "update_customer_billing",
    ACT_IV_ARGS,
    "approve",
    REVIEWER,
    AT.afterDeadline,
  );

  acts.push({
    act: 4,
    title: "A third change is proposed, nobody answers, and it comes back later",
    rules: ["DK-1"],
    baseline: {
      shown: [
        `At ${AT.abandoned} the reviewer is shown:`,
        "",
        ...shownFourth.split("\n"),
        "",
        "Nobody answers. Thirty-five minutes later the",
        "same call is made again and approved:",
        "",
        ...retried.shown.split("\n"),
      ],
      recorded: [
        ...recordLines(retried.record),
        "",
        "One row, for the second attempt. The first left",
        "nothing behind, so nothing links the two and",
        "nothing says a proposal was ever dropped. A",
        "reviewer opening this log cannot tell a first",
        "attempt from a retry.",
      ],
      records: [retried.record],
    },
    affiant: {
      shown: [
        `Filed at ${AT.abandoned}, deadline`,
        `${rowLapsed.expiresAt}. Nobody decided.`,
        "",
        `Read again at ${AT.afterDeadline}:`,
        `the entry reads ${rowLapsed.status}. No sweep has run in`,
        "this process - expireDue was never called - and",
        "the state is true anyway, because the deadline is",
        "applied on every read (DK-1).",
        "",
        "Resubmitting files a new entry and re-runs the",
        "whole pipeline, so the policy chain gets another",
        "say and the deadline is stamped afresh:",
        "",
        ...cardLines(cardFour),
      ],
      recorded: [
        "the entry nobody answered:",
        ...rowLines(rowSuperseded),
        "",
        "the resubmission:",
        ...rowLines(rowFour),
        "",
        "A resubmission is never a reopening. The old row",
        "keeps its terminal state and gains a successor",
        "link; the new one names what it supersedes. The",
        "history reads forward and nothing that was once",
        "recorded is edited (DK-1, DK-4).",
      ],
      cards: [cardFour],
      rows: [rowLapsed, rowSuperseded, rowFour],
      telemetry: eventsFour.lines,
    },
  });

  const hostWrites = scenario.hostWrites();
  return {
    at: AT.proposal,
    acts,
    differences: DIFFERENCES,
    hostWrites,
    summary:
      `${String(acts.length)} acts on one scenario - ` +
      `${String(baseline.records.length)} whole-call rows, 4 Docket entries, ` +
      `${String(hostWrites)} host writes executed.`,
  };
}

/** The entry `entryId` names, or a failure saying which act could not find it. */
async function requireEntry(
  scenario: ReturnType<typeof createScenario>,
  entryId: string,
  ctx: Parameters<ReturnType<typeof createScenario>["gate"]["get"]>[1],
  where: string,
) {
  const entry = await scenario.gate.get(entryId, ctx);
  if (entry === null) throw new Error(`${where}: no Docket entry ${entryId}`);
  return entry;
}

/** The field `name` among `fields`, or a failure naming what was there instead. */
function fieldOf(fields: readonly CardFieldView[], name: string): CardFieldView {
  const found = fields.find((field) => field.name === name);
  if (found === undefined) {
    throw new Error(`no field ${name}; found ${fields.map((field) => field.name).join(", ")}`);
  }
  return found;
}

// ---------------------------------------------------------------------------
// The closing table
// ---------------------------------------------------------------------------

/**
 * The differences that follow from the shape of the two surfaces.
 *
 * Not a feature list. Each row is something the whole-call gate cannot express
 * however well it is implemented, because its unit of review is the call and not
 * the field — and each names the rule that puts the other half on the record.
 */
const DIFFERENCES: readonly Difference[] = [
  {
    what: "Where a value came from",
    baseline: "one arguments object; a value's origin is not a property the record has",
    affiant: "every field carries the grade of its own source and what that grade points at",
    rules: ["PV-1", "PV-2", "AF-1"],
  },
  {
    what: "What a value replaces",
    baseline: "the call carries the new value only; nothing reads the record being written to",
    affiant: "an update names its entity and every proposed field swears to what it replaces",
    rules: ["AF-3"],
  },
  {
    what: "How sure the producer was",
    baseline: "no confidence anywhere; a guess and a quotation arrive identical",
    affiant:
      "three numbers on every card - the minimum over all fields, the minimum over the " +
      "populated ones, and how many were empty - reported, never enforced",
    rules: ["AF-2"],
  },
  {
    what: "A field nobody filled",
    baseline: "absent from the arguments, so invisible to any reviewer and any rule",
    affiant: "present on the record and tagged Empty, so the hole is something you can see",
    rules: ["AF-1"],
  },
  {
    what: "Changing one value",
    baseline:
      "reject, then a corrected call that is indistinguishable from one the agent made unaided",
    affiant:
      "an approval carrying corrections: the corrected field is tagged UserStated and bound " +
      "to the reviewer's act, over the machine's tag rather than instead of it, with the " +
      "proposal kept unedited beside the accepted state",
    rules: ["DK-1", "DK-2", "PV-2", "AF-4"],
  },
  {
    what: "Approving with nobody present",
    baseline: "a rule keyed on the tool's name, which cannot see a field the arguments omit",
    affiant:
      "a Standing Order never fires while a field the record requires reads Empty; the " +
      "degrade goes to a person and carries a reason code an operator can alert on",
    rules: ["GT-5"],
  },
  {
    what: "A proposal nobody answered",
    baseline: "no state; the row is written on decision, so an abandoned call leaves nothing",
    affiant: "an entry past its deadline reads expired on every query, with no sweep run",
    rules: ["DK-1"],
  },
  {
    what: "Trying again",
    baseline: "a fresh row with no link to the attempt that lapsed",
    affiant:
      "a new entry whose lineage names the one it supersedes, while the old row keeps its " +
      "terminal state and gains the successor link",
    rules: ["DK-1"],
  },
  {
    what: "Who agreed",
    baseline: "a string; a person who was present and a rule that fired read the same",
    affiant:
      "three kinds and no fourth - member, member-via-relay, standing-order - where the " +
      "kind is the mode, so there is no separate field for it to drift from",
    rules: ["AZ-1"],
  },
];

// ---------------------------------------------------------------------------
// The transcript
// ---------------------------------------------------------------------------

/** Each column's width, in characters. */
const COLUMN = 52;

/** The gap between the two columns. */
const GUTTER = 2;

/** How far the columns sit from the left margin. */
const INDENT = "  ";

/** `line` broken to at most `width` characters, continuations hung two spaces in. */
function fit(line: string, width: number): string[] {
  if (line.length <= width) return [line];
  const lead = line.slice(0, line.length - line.trimStart().length);
  const hang = `${lead}  `;
  const out: string[] = [];
  let current = lead;
  let prefix = lead;
  for (const word of line.trim().split(" ")) {
    if (current === prefix) current += word;
    else if (current.length + 1 + word.length <= width) current = `${current} ${word}`;
    else {
      out.push(current);
      prefix = hang;
      current = hang + word;
    }
  }
  out.push(current);
  return out;
}

/** `text` broken to at most `width` characters on spaces, with no hanging indent. */
function wrapPlain(text: string, width: number): string[] {
  const out: string[] = [];
  let current = "";
  for (const word of text.split(" ")) {
    if (current === "") current = word;
    else if (current.length + 1 + word.length <= width) current = `${current} ${word}`;
    else {
      out.push(current);
      current = word;
    }
  }
  if (current !== "") out.push(current);
  return out.length === 0 ? [""] : out;
}

/** `lines` broken to the column width. */
function fitAll(lines: readonly string[]): string[] {
  return lines.flatMap((line) => fit(line, COLUMN));
}

/** The two columns side by side, padded and right-trimmed. */
function columns(left: readonly string[], right: readonly string[]): string[] {
  const a = fitAll(left);
  const b = fitAll(right);
  const gap = " ".repeat(GUTTER);
  const out: string[] = [];
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const line = `${INDENT}${(a[index] ?? "").padEnd(COLUMN)}${gap}${b[index] ?? ""}`;
    out.push(line.trimEnd());
  }
  return out;
}

/** The `what the reviewer saw / what was recorded` heading and its rule. */
function heading(): string[] {
  return [
    ...columns(["what the reviewer saw"], ["what was recorded"]),
    `${INDENT}${"-".repeat(COLUMN)}${" ".repeat(GUTTER)}${"-".repeat(COLUMN)}`,
  ];
}

/** One surface's block within an act. */
function surface(label: string, view: SurfaceView): string[] {
  return [label, ...heading(), ...columns(view.shown, view.recorded), ""];
}

/** The closing table, as one block per difference. */
function differenceLines(differences: readonly Difference[]): string[] {
  const width = 96;
  const label = 10;
  const out: string[] = [];
  differences.forEach((difference, index) => {
    const number = `${String(index + 1)}.`.padEnd(4);
    const tags = `[${difference.rules.join(", ")}]`;
    const head = `${number}${difference.what}`;
    out.push(`  ${head.padEnd(width - tags.length - 2)}${tags}`);
    for (const [name, text] of [
      ["baseline", difference.baseline],
      ["Affiant", difference.affiant],
    ] as const) {
      const wrapped = wrapPlain(text, width - 6 - label);
      wrapped.forEach((line, position) => {
        out.push(`      ${(position === 0 ? name : "").padEnd(label)}${line}`);
      });
    }
    out.push("");
  });
  return out;
}

/** The whole transcript, exactly as `node dist/deck.js` prints it. */
export function renderTranscript(result: DeckResult): string {
  const lines: string[] = [
    "Affiant - one scenario, two surfaces: field-level cards against a whole-call baseline",
    `Clock pinned from ${result.at}. In-memory Docket, scripted inference, no API key.`,
    "Nothing here writes to anything.",
    "",
  ];
  for (const act of result.acts) {
    lines.push(`Act ${String(act.act)}. ${act.title}  [${act.rules.join(", ")}]`, "");
    lines.push(...surface("  BASELINE - whole-call approval", act.baseline));
    lines.push(...surface("  AFFIANT - the field-level gate", act.affiant));
  }
  lines.push("The differences that are structural, not cosmetic", "");
  lines.push(...differenceLines(result.differences));
  lines.push(`Summary: ${result.summary}`);
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// The script
// ---------------------------------------------------------------------------

/** Print the run: the transcript, or JSON when `AFFIANT_DEMO_JSON=1`. */
export async function main(): Promise<void> {
  const result = await runDeck();
  const asJson = process.env["AFFIANT_DEMO_JSON"] === "1";
  console.log(asJson ? JSON.stringify(result, null, 2) : renderTranscript(result));
}

// Run only when this module is the process entry point, so the suite can import
// `runDeck` without the script printing over its own output.
const entryPoint = process.argv[1];
if (entryPoint !== undefined && import.meta.url === pathToFileURL(entryPoint).href) {
  await main();
}
