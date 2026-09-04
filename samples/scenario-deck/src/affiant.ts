/**
 * The same support-desk scenario, wired through `@affiant/core`'s gate.
 *
 * This module is the Affiant half of the comparison: the ports, the three write
 * tools, the Standing Order, the pinned clock, and the two readers that turn a card
 * and a Docket row into the flat shapes `deck.ts` prints and the suite asserts on.
 * It runs the acts; `deck.ts` decides what to show.
 *
 * **Rules demonstrated.**
 *
 * - **AF-2** — the three confidence numbers on every card: `aggregateConfidence` is
 *   the minimum over proposed fields with an `Empty` field counting as `0`,
 *   `populatedConfidence` is the minimum over the fields that were filled, and
 *   `emptyFieldCount` is how many were not. Reported, never enforced: no threshold
 *   on any of them lives in the framework.
 * - **AF-3** — an update names the entity it updates and every proposed field
 *   carries the value it replaces, so a reviewer reads `starter → pro` rather than
 *   `pro`.
 * - **GT-5** — a Standing Order is never honoured while a proposed field the record
 *   requires reads `Empty`. The verdict degrades to a person and the degrade is
 *   observable, carrying the reason code `mandatory-field-empty`.
 * - **DK-1** — the row keeps the Affidavit as the agent proposed it and, once an
 *   amendment is accepted, the accepted state beside it; an entry past its deadline
 *   reads `expired` on every query whether or not a sweep has run; a resubmission is
 *   a new entry whose lineage names the one it supersedes.
 * - **AZ-1** — every decided row carries an attestation whose `kind` *is* the mode:
 *   `member` for a person, `member-via-relay` for a person acting through a machine,
 *   `standing-order` for a policy that approved with nobody present. There is no
 *   fourth kind and no free-text field for one to hide in.
 *
 * ## No model, no database, no key
 *
 * The inference port returns a fixed structured result keyed by the message id, so
 * running the deck needs no API key and produces the same bytes every time. The
 * projection port returns one hard-coded customer record. The authorization port
 * admits one reviewer. Nothing writes anywhere: the gate never executes a write by
 * rule (AZ-7), and this sample supplies no executor, so every approved row here
 * stays `execution: "unexecuted"` — which is the honest state, not an omission.
 *
 * @packageDocumentation
 */

import { createGate } from "@affiant/core";
import type {
  Affidavit,
  AffidavitField,
  ApprovalPolicy,
  AuthorizationPort,
  BindingKind,
  BlockedMarker,
  Clock,
  DocketEntry,
  DocketStatus,
  EvidenceCardRequest,
  ExecutionOutcome,
  FieldSchema,
  Gate,
  InferencePort,
  JsonValue,
  Lineage,
  Operation,
  ProjectionPort,
  ProvenanceSource,
  RequirementKind,
  StructuredField,
  TelemetryEvent,
  TelemetryPort,
  ToolDefinition,
  TurnContext,
  Verdict,
} from "@affiant/core";
import { InMemoryDocketStore } from "@affiant/core/store-memory";

// ---------------------------------------------------------------------------
// The scenario's fixed facts
// ---------------------------------------------------------------------------

/** The tenant every entry in this run belongs to. */
export const TENANT = "support-desk";

/** The customer whose record the agent proposes to change. */
export const CUSTOMER_ID = "C-1042";

/** The reviewer this sample's authorization port admits. */
export const REVIEWER = "ana";

/** How long a filed entry stays open here: thirty minutes (GT-4). */
export const TTL_MS = 30 * 60 * 1000;

/** The instants the four acts are pinned to, so the transcript reproduces byte for byte. */
export const AT = {
  /** Act I: the agent proposes. */
  proposal: "2026-09-04T09:00:00.000Z",
  /** Act II: the reviewer answers. */
  decision: "2026-09-04T09:05:00.000Z",
  /** Act III: a second proposal, under a Standing Order. */
  standingOrder: "2026-09-04T09:10:00.000Z",
  /** Act IV: a third proposal, which nobody will answer. */
  abandoned: "2026-09-04T09:20:00.000Z",
  /** Act IV: five minutes after that proposal's deadline. */
  afterDeadline: "2026-09-04T09:55:00.000Z",
} as const;

/**
 * What the customer record holds before any of this. The projection port returns it
 * unchanged all the way through: nothing in this sample executes a write, so nothing
 * in the record ever moves (AZ-7).
 *
 * `phone` is `null` — the record requires a phone number and has never had one. That
 * is the hole act III is about.
 */
export const CUSTOMER_RECORD: { readonly [field: string]: JsonValue } = {
  email: "ana.silva@oldmail.example",
  plan: "starter",
  billingDay: 1,
  phone: null,
};

/** One turn of the chat, and the message id the scripted inference is keyed by. */
export interface Turn {
  /** The message id. */
  readonly messageId: string;
  /** What the customer typed, unmodified — the text every `Conversation` tag points into. */
  readonly utterance: string;
}

/** The three turns this scenario runs over. */
export const TURNS = {
  /** Act I: three changes at once, one of them barely a change at all. */
  first: {
    messageId: "msg-1",
    utterance:
      "Hi - can you change my email to ana.silva@example.net, " +
      "upgrade me to the paid plan, and bill me at the end of the month?",
  },
  /** Act III: a correction to the address, on a turn that says nothing about a phone. */
  second: {
    messageId: "msg-2",
    utterance: "Actually use ana@silva-consulting.example - that is my work address.",
  },
  /** Act IV: a billing-day change nobody will get round to answering. */
  third: {
    messageId: "msg-3",
    utterance: "One more thing - bill me on the 15th from now on.",
  },
} as const satisfies { readonly [name: string]: Turn };

// ---------------------------------------------------------------------------
// The field schema and the three write tools
// ---------------------------------------------------------------------------

/**
 * The customer record's field schema: what a reviewer surface renders, what the
 * inference step is asked for, and — through `required` — which fields the record
 * cannot do without.
 *
 * `phone` is `required: true`. That single flag is what turns act III from a policy
 * that fires into a policy that asks a person (GT-5).
 */
export const CUSTOMER_SCHEMA: FieldSchema = {
  entityType: "Customer",
  fields: [
    {
      name: "email",
      kind: "text",
      description: "The customer's contact email address",
      required: true,
      allowedValues: null,
      pattern: null,
    },
    {
      name: "plan",
      kind: "enum",
      description: "The subscription plan",
      required: true,
      allowedValues: ["starter", "pro", "enterprise"],
      pattern: null,
    },
    {
      name: "billingDay",
      kind: "number",
      description: "Day of the month the customer is billed on",
      required: false,
      allowedValues: null,
      pattern: null,
    },
    {
      name: "phone",
      kind: "text",
      description: "The customer's contact phone number",
      required: true,
      allowedValues: null,
      pattern: null,
    },
  ],
};

/** The arguments this sample's write tools take: a flat bag of field values. */
export type WriteArgs = { readonly [field: string]: JsonValue };

/** The schema's entries for `names`, in schema order. */
function schemaFor(names: readonly string[]): FieldSchema {
  return {
    entityType: CUSTOMER_SCHEMA.entityType,
    fields: CUSTOMER_SCHEMA.fields.filter((field) => names.includes(field.name)),
  };
}

/** An update of the one customer, proposing exactly `names`. */
function updateOf(names: readonly string[]): Operation {
  return { kind: "update", entityType: "Customer", entityId: CUSTOMER_ID, fields: names };
}

/**
 * The fields each tool's write shape proposes.
 *
 * Three narrow tools rather than one wide one, because a tool's write shape is what
 * says which fields are on the table. `update_customer` writes the whole record, so
 * it proposes `phone` even on a call that carries no phone number — and `phone` then
 * reads `Empty` on the card rather than being invisible (AF-1). `update_customer_
 * contact` writes contact details only, which is the class the Standing Order below
 * is written for.
 */
const WRITE_SHAPES = {
  update_customer: ["email", "plan", "billingDay", "phone"],
  update_customer_contact: ["email", "phone"],
  update_customer_billing: ["billingDay"],
} as const;

/** The name of one of this sample's write tools. */
export type ToolName = keyof typeof WRITE_SHAPES;

// ---------------------------------------------------------------------------
// The scripted inference (no model, no key)
// ---------------------------------------------------------------------------

/** Where `needle` sits in `utterance`, as the offsets an inference port reports. */
function spanOf(
  utterance: string,
  needle: string,
): { readonly start: number; readonly end: number } {
  const start = utterance.indexOf(needle);
  if (start === -1) throw new RangeError(`${JSON.stringify(needle)} is not in the utterance`);
  return { start, end: start + needle.length };
}

/**
 * What the scripted inference returns, per message id and field name.
 *
 * A real host calls a model here. The gate ships no model client by rule, so a
 * sample supplies a function of the same shape that answers the same way every time
 * — which is all the gate needs to file an Affidavit with substance in it, and what
 * lets this run without an API key.
 *
 * `presence: "literal"` is what the pipeline turns into a `Conversation` tag with an
 * `utterance-span` binding an auditor can re-check; `"inferred"` becomes an
 * `Inferred` tag with nothing behind it, which is the honest grade for a value the
 * model reasoned to. No entry for `phone` anywhere: nobody said one.
 */
const SCRIPT: { readonly [messageId: string]: { readonly [field: string]: StructuredField } } = {
  [TURNS.first.messageId]: {
    email: {
      value: "ana.silva@example.net",
      confidence: 0.95,
      presence: "literal",
      utteranceSpan: spanOf(TURNS.first.utterance, "ana.silva@example.net"),
    },
    plan: { value: "pro", confidence: 0.8, presence: "inferred", utteranceSpan: null },
    billingDay: { value: 28, confidence: 0.4, presence: "inferred", utteranceSpan: null },
  },
  [TURNS.second.messageId]: {
    email: {
      value: "ana@silva-consulting.example",
      confidence: 0.97,
      presence: "literal",
      utteranceSpan: spanOf(TURNS.second.utterance, "ana@silva-consulting.example"),
    },
  },
  [TURNS.third.messageId]: {
    billingDay: {
      value: 15,
      confidence: 0.99,
      presence: "literal",
      utteranceSpan: spanOf(TURNS.third.utterance, "15"),
    },
  },
};

/** One tool-free structured extraction over the unmodified turn (GT-1 step 3). */
const inference: InferencePort = {
  async infer(turn, schema) {
    const scripted = SCRIPT[turn.messageId] ?? {};
    const fields: { [name: string]: StructuredField } = {};
    for (const field of schema.fields) {
      const value = scripted[field.name];
      if (value !== undefined) fields[field.name] = value;
    }
    return { fields };
  },
};

/** The previous-value lookup (AF-3): what the record holds right now. */
const projection: ProjectionPort = {
  async previousValues() {
    return { ...CUSTOMER_RECORD };
  },
};

/** Who may decide an entry (AZ-2). The gate fails closed on this answer. */
const authorization: AuthorizationPort = {
  async mayDecide(principal) {
    return principal.kind === "member" && principal.id === REVIEWER;
  },
};

// ---------------------------------------------------------------------------
// The Standing Order
// ---------------------------------------------------------------------------

/** The policy's id, written into a `standing-order` attestation when it fires (AZ-1). */
export const POLICY_ID = "routine-contact-update";

/** The version of the policy that is speaking, so a later reader knows what it said. */
export const POLICY_VERSION = "1.4.0";

/**
 * A Standing Order for contact-detail changes: approve with nobody present when the
 * write touches only the customer's contact fields.
 *
 * It declares **no** risk threshold and predicates on **no** provenance source, so
 * neither of the other two checks on a person-free approval can be what stops it.
 * The only thing standing between this policy and a write with no person is GT-5's
 * mandatory-`Empty` rule — which is exactly what act III is built to show.
 */
const contactUpdatePolicy: ApprovalPolicy = {
  id: POLICY_ID,
  version: POLICY_VERSION,
  declaredInputs: [],
  async evaluate(affidavit): Promise<Verdict | null> {
    const contactOnly = affidavit.fields.every(
      (field) => field.name === "email" || field.name === "phone",
    );
    if (!contactOnly) return null;
    return {
      requirement: "StandingOrder",
      reason: "a change to contact details only is routine",
    };
  },
};

// ---------------------------------------------------------------------------
// The clock and the telemetry port
// ---------------------------------------------------------------------------

/** A clock the deck moves by hand, so a deadline is something a run can cross. */
export class PinnedClock implements Clock {
  #at: string;

  constructor(at: string) {
    this.#at = at;
  }

  /** The instant every record is stamped with until {@link PinnedClock.set} moves it. */
  now(): string {
    return this.#at;
  }

  /** Move the clock to `at`. */
  set(at: string): void {
    this.#at = at;
  }
}

/** One telemetry event, reduced to what the deck prints and the suite asserts on. */
export interface TelemetryLine {
  /** The event's key from the versioned registry. */
  readonly key: string;
  /** `blocked.reason` on a `standing-order.blocked` event, else `null`. */
  readonly blockedReason: string | null;
  /** The policy the event names, or `null`. */
  readonly policyId: string | null;
}

/** A telemetry port that keeps what it is given, so an act can report its own events. */
class RecordingTelemetry implements TelemetryPort {
  readonly #events: TelemetryLine[] = [];

  emit(event: TelemetryEvent): void {
    const reason = event.attributes["blocked.reason"];
    const policy = event.attributes["policy.id"];
    this.#events.push({
      key: event.key,
      blockedReason: typeof reason === "string" ? reason : null,
      policyId: typeof policy === "string" ? policy : null,
    });
  }

  /** Everything emitted since `from`, and the new watermark. */
  since(from: number): { readonly lines: readonly TelemetryLine[]; readonly next: number } {
    return { lines: this.#events.slice(from), next: this.#events.length };
  }
}

// ---------------------------------------------------------------------------
// Flat views of a card and a row
// ---------------------------------------------------------------------------

/** One field as the Evidence Card shows it: the value, what it replaces, and its grade. */
export interface CardFieldView {
  /** The field's name. */
  readonly name: string;
  /** The proposed value. */
  readonly value: JsonValue;
  /** The value it replaces, or `null` where the record held none (AF-3). */
  readonly previousValue: JsonValue | null;
  /** The grade of the tag in force. */
  readonly source: ProvenanceSource;
  /** That tag's confidence, in `[0, 1]`. */
  readonly confidence: number;
  /** Whether the tag points at something an auditor can check (PV-2). */
  readonly bound: boolean;
  /** What it points at, or `null` when it points at nothing. */
  readonly bindingKind: BindingKind | null;
  /** Whether the record requires the field. */
  readonly isMandatory: boolean;
  /** The grades this one displaced, newest first — nothing is dropped from a chain. */
  readonly priorSources: readonly ProvenanceSource[];
}

/** An Evidence Card, flattened to what the deck prints. */
export interface CardView {
  /** The Docket entry this card is filed under. */
  readonly entryId: string;
  /** The kind of entity being written. */
  readonly entityType: string;
  /** The entity being written; non-null on an update (AF-3). */
  readonly entityId: string | null;
  /** The sworn fields, in the order the operation proposed them. */
  readonly fields: readonly CardFieldView[];
  /** The three numbers the card shows (AF-2). */
  readonly confidence: ConfidenceView;
  /** When the review window closes (GT-4). */
  readonly requiredBy: string;
  /** Whether a person must confirm this write. */
  readonly requiresConfirmation: boolean;
  /** What a reviewer is warned about, in the card's own words. */
  readonly warnings: readonly string[];
  /** The corrections carried over from an entry this one supersedes, or `null`. */
  readonly priorAmendments: { readonly [field: string]: JsonValue } | null;
}

/** The three numbers AF-2 requires a card to show, over one Affidavit. */
export interface ConfidenceView {
  /** Minimum over every proposed field, `Empty` counting as `0`. */
  readonly aggregate: number;
  /** Minimum over the fields that were filled; `null` when none were. */
  readonly populated: number | null;
  /** How many proposed fields are tagged `Empty`. */
  readonly emptyFieldCount: number;
}

/** A Docket row, flattened to what the deck prints. */
export interface RowView {
  /** The entry's id. */
  readonly entryId: string;
  /** The tool that proposed the write. */
  readonly toolName: string;
  /** What the row reads at *now* — the deadline is applied on every read (DK-1). */
  readonly status: DocketStatus;
  /** What the write needs before it may execute (AZ-4). */
  readonly requirement: RequirementKind;
  /** What the host's executor reported, or `null` while the row is not approved. */
  readonly execution: ExecutionOutcome | null;
  /** The attestation's kind — the mode itself, with no separate field to drift (AZ-1). */
  readonly attestationKind: "member" | "member-via-relay" | "standing-order" | null;
  /** Who or what the attestation names. */
  readonly attestationBy: string | null;
  /** The reviewer's corrections, as the decision carried them (DK-2). */
  readonly amendments: { readonly [field: string]: JsonValue | null } | null;
  /** The Affidavit **as the agent proposed it**, never edited (DK-4). */
  readonly proposedFields: readonly CardFieldView[];
  /** The three numbers over the proposal (AF-2). */
  readonly confidence: ConfidenceView;
  /** The accepted state, beside the proposal rather than over it, or `null` (DK-4). */
  readonly amendedFields: readonly CardFieldView[] | null;
  /** The three numbers recomputed over the accepted state (AF-4), or `null`. */
  readonly amendedConfidence: ConfidenceView | null;
  /** What this entry replaces and what replaced it (DK-1). */
  readonly lineage: Lineage;
  /** When the review window closes. */
  readonly expiresAt: string;
  /** Why no decision on this entry would be accepted, or `null` (AZ-4). */
  readonly blocked: BlockedMarker | null;
}

/** The binding's kind, or `null` when the tag points at nothing. */
function bindingKindOf(
  binding: AffidavitField["provenance"]["current"]["binding"],
): BindingKind | null {
  return binding === null || binding === undefined ? null : binding.kind;
}

/** One Affidavit field, flattened. */
function fieldViewOf(field: AffidavitField): CardFieldView {
  const tag = field.provenance.current;
  return {
    name: field.name,
    value: field.value,
    previousValue: field.previousValue,
    source: tag.source,
    confidence: tag.confidence,
    bound: tag.binding !== null && tag.binding !== undefined,
    bindingKind: bindingKindOf(tag.binding),
    isMandatory: field.isMandatory,
    priorSources: field.provenance.prior.map((prior) => prior.source),
  };
}

/** Every field of `affidavit`, flattened. */
function fieldViewsOf(affidavit: Affidavit): readonly CardFieldView[] {
  return affidavit.fields.map(fieldViewOf);
}

/**
 * The three numbers as the Affidavit carries them (AF-2).
 *
 * `populatedConfidence` and `emptyFieldCount` are optional on the type only because
 * the seed wire schema predates them; every Affidavit the gate builds writes all
 * three, so the fallbacks below are for a wire-derived record, not for this sample.
 */
function confidenceOf(affidavit: Affidavit): ConfidenceView {
  return {
    aggregate: affidavit.aggregateConfidence,
    populated: affidavit.populatedConfidence ?? null,
    emptyFieldCount: affidavit.emptyFieldCount ?? 0,
  };
}

/**
 * The card a reviewer is handed, flattened — read from the row and the envelope
 * together.
 *
 * The fields come from the **row's** Affidavit rather than from the card's, and for
 * one honest reason: the wire Affidavit at protocol tag `0.0.1-seed` has no place to
 * put a provenance tag's binding, so a card serialized to that shape loses the
 * pointer PV-2 requires — the thing an auditor would use to check the value. The
 * binding is on the record either way; the seed wire shape simply predates carrying
 * it. Everything a card adds over the Affidavit — the deadline, two of AF-2's three
 * numbers, the warnings, whether a person may confirm — comes from the envelope.
 */
export function cardViewOf(entry: DocketEntry, card: EvidenceCardRequest): CardView {
  const sworn = entry.amendedAffidavit ?? entry.affidavit;
  return {
    entryId: card.docketId,
    entityType: card.affidavit.entityType,
    entityId: card.affidavit.entityId,
    fields: fieldViewsOf(sworn),
    confidence: {
      aggregate: card.affidavit.aggregateConfidence,
      populated: card.populatedConfidence,
      emptyFieldCount: card.emptyFieldCount,
    },
    requiredBy: card.requiredBy,
    requiresConfirmation: card.affidavit.requiresConfirmation,
    warnings: card.affidavit.warnings,
    priorAmendments: card.priorAmendments,
  };
}

/** Who an attestation names, in one line. */
function attestationSubject(entry: DocketEntry): string | null {
  const by = entry.attestation?.by;
  if (by === undefined) return null;
  switch (by.kind) {
    case "member":
      return by.id;
    case "member-via-relay":
      return `${by.memberId} via ${by.relay.principal}`;
    case "standing-order":
      return `${by.policyId}@${by.version}`;
  }
}

/** A Docket row, flattened. `status` is what the row reads at `now`, not what it says. */
export function rowViewOf(entry: DocketEntry, status: DocketStatus): RowView {
  return {
    entryId: entry.entryId,
    toolName: entry.toolName,
    status,
    requirement: entry.requirement,
    execution: entry.execution,
    attestationKind: entry.attestation?.by.kind ?? null,
    attestationBy: attestationSubject(entry),
    amendments: entry.amendments,
    proposedFields: fieldViewsOf(entry.affidavit),
    confidence: confidenceOf(entry.affidavit),
    amendedFields: entry.amendedAffidavit === null ? null : fieldViewsOf(entry.amendedAffidavit),
    amendedConfidence:
      entry.amendedAffidavit === null ? null : confidenceOf(entry.amendedAffidavit),
    lineage: entry.lineage,
    expiresAt: entry.expiresAt,
    blocked: entry.blocked,
  };
}

// ---------------------------------------------------------------------------
// The wiring
// ---------------------------------------------------------------------------

/** Everything one run of the Affiant half needs, built fresh so two runs cannot share state. */
export interface Scenario {
  /** The gate, over an in-memory Docket. */
  readonly gate: Gate;
  /** The clock the deck moves by hand. */
  readonly clock: PinnedClock;
  /** The turn context for `turn`, as `REVIEWER` acting in `TENANT`. */
  ctxFor(turn: Turn, at: string): TurnContext;
  /** The tool named `name`, wrapped for `ctx`. */
  toolFor(name: ToolName): ToolDefinition<WriteArgs, string>;
  /** Everything the telemetry port has been given since `from`. */
  telemetrySince(from: number): { readonly lines: readonly TelemetryLine[]; readonly next: number };
  /** How many times a write tool's own `execute` ran. Always `0` (GT-6). */
  hostWrites(): number;
}

/** Build the gate, the clock, the tools and the recording telemetry port for one run. */
export function createScenario(): Scenario {
  const clock = new PinnedClock(AT.proposal);
  const telemetry = new RecordingTelemetry();
  let writes = 0;

  const gate = createGate({
    store: new InMemoryDocketStore({ clock }),
    inference,
    projection,
    authorization,
    policies: [contactUpdatePolicy],
    telemetry,
    clock,
    defaultTtlMs: TTL_MS,
  });

  const toolFor = (name: ToolName): ToolDefinition<WriteArgs, string> => {
    const fields = WRITE_SHAPES[name];
    return {
      name,
      description: `Update the customer's ${fields.join(", ")}.`,
      inputSchema: schemaFor(fields),
      writeCapable: true,
      executedBy: "host",
      operationLabel: "WriteUpdate",
      operation: () => updateOf(fields),
      execute(): string {
        // Never reached. The gated write path does not hold a reference to this
        // function at all (GT-6); the counter is the tripwire that says so.
        writes += 1;
        return "wrote";
      },
    };
  };

  return {
    gate,
    clock,
    ctxFor(turn, at) {
      return {
        conversationId: "conv-1",
        tenantId: TENANT,
        channel: "chat",
        principal: { kind: "member", id: REVIEWER },
        turn: { utterance: turn.utterance, messageId: turn.messageId, at },
      };
    },
    toolFor,
    telemetrySince: (from) => telemetry.since(from),
    hostWrites: () => writes,
  };
}
