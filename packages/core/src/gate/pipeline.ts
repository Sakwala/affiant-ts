/**
 * The gate pipeline: everything between a tool call and a Docket row, in the order
 * the protocol fixes.
 *
 * **Rules served: GT-1** (the order itself), **GT-3** (runtime substance refusal),
 * **GT-4** (TTL stamped from the policy result, after the chain; a re-file keeps the
 * existing deadline), **PV-1** (confidence clamped, merge by confidence then
 * determinism), **PV-3** (the inference step cannot mint `UserStated`), **AF-1**
 * (every proposed field present, unknown provenance recorded as `Empty`), **AF-3**
 * (create carries no previous values; update carries the key on every field),
 * **AZ-1** (a Standing Order writes its attestation in the same operation as the
 * filing), **AZ-4** (a requirement this version does not run is filed blocked),
 * **CV-4** (a declared-uncovered tool's proposal is filed blocked), **SR-4** (the
 * card names the protocol version it conforms to), **TL-1** (the events).
 *
 * ## The order, and why it is this order (GT-1)
 *
 * 1. **Turn context** arrives as a parameter. Nothing here reads a global, and the
 *    accumulators below are function-local, so two conversations interleaved in one
 *    isolate cannot see each other's fields (GT-2).
 * 2. **Deterministic interceptors** first, because a value a host can look up is
 *    better evidence than a value a model can guess, and running them first means the
 *    merge in step 4 is comparing against something rather than filling a blank.
 * 3. **One tool-free structured inference** against the *unmodified* turn. One,
 *    because a second pass over a turn a previous pass has already been told about is
 *    a model agreeing with itself. Tool-free, because a model that can call tools
 *    while being asked what a person said can go and find out.
 * 4. **Merge** (PV-1): higher confidence wins, ties toward the more deterministic
 *    source, the loser kept in the chain so a card can show a reviewer that the model
 *    and the system of record disagreed.
 * 5. **Projection**, then the Affidavit is built (AF-1, AF-3, AF-2).
 * 6. **Substance refusal** (GT-3) — *before* the policy chain. A proposal that swears
 *    to nothing must not reach a policy that might approve it, and must not be filed,
 *    counted or broadcast.
 * 7. **Policy** (AZ-4, PV-4, GT-5).
 * 8. **TTL** (GT-4) — *after* the policy, because the deadline is part of what the
 *    policy decided, and a global default stamped before the chain is the
 *    non-conformant shape the rule names.
 * 9. **File** (DK-1), idempotent by entry id.
 *
 * ## Entry ids are derived, not minted
 *
 * The id is a SHA-256 over the tenant, the conversation, the tool name and the
 * canonical form of the operation and its arguments, laid out as a UUID. So a retry
 * of the same call in the same conversation is the *same* entry: `store.file` returns
 * the row that is already there, with its **existing** `expiresAt` (GT-4), and the
 * card the model gets back is the card a reviewer is already looking at. A random id
 * would file a second row for a retried call and start a second clock, which is the
 * shape GT-4 names as wrong.
 *
 * @packageDocumentation
 */

import type { Affidavit as WireAffidavit } from "@affiant/contract";

import type { TurnContext } from "../context.js";
import type {
  Attestation,
  BlockedMarker,
  DocketEntry,
  NewEntryInit,
  RequirementKind,
} from "../docket/entry.js";
import { newEntry } from "../docket/entry.js";
import { instantMs } from "../docket/expiry.js";
import type { DocketStore } from "../docket/store.js";
import { AffiantError } from "../errors.js";
import type {
  Affidavit,
  AffidavitFieldInput,
  AffidavitFieldKind,
  JsonValue,
  WireCarry,
} from "../model/affidavit.js";
import { buildAffidavit, isJsonValue, toWire } from "../model/affidavit.js";
import type { AmendmentMap } from "../model/amendments.js";
import { canonicalJson, sha256Hex } from "../model/canonical.js";
import type { Binding, ProvenanceChain, ProvenanceTag } from "../model/provenance.js";
import { chainOf, merge, mintConversation, mintInferred, mintTag } from "../model/provenance.js";
import type {
  Clock,
  FieldInterceptor,
  FieldSchema,
  FieldSchemaEntry,
  InferencePort,
  Operation,
  ProjectionPort,
  RiskScorer,
  TelemetryPort,
  UtteranceSpan,
} from "../ports.js";

import type { CoverageRegistry } from "./coverage.js";
import { coverageRefusedMarker } from "./coverage.js";
import type { ApprovalPolicy, PolicyOutcome } from "./policy.js";
import { evaluatePolicies } from "./policy.js";

// ---------------------------------------------------------------------------
// What comes out
// ---------------------------------------------------------------------------

/**
 * The Evidence Card envelope, plus the protocol version SR-4 requires on it.
 *
 * The wire type at protocol tag `0.0.1-seed` predates the field — the seed fixture
 * set carries the version at manifest level — and SR-4 says that from `0.1.0` it is
 * on the envelope. So the gate emits it now, from the Docket row's own
 * `protocolVersion`: an envelope that states the version it conforms to is the whole
 * of the rule, and a consumer of the older shape ignores an extra property. This type
 * is assignable to `@affiant/contract`'s `EvidenceCardRequest`; `test/gate-types.test-d.ts`
 * asserts that it stays so.
 */
export interface EvidenceCardRequest {
  /** The Docket entry this card is filed under. */
  readonly docketId: string;
  /** The Affidavit awaiting a decision, in the wire shape. */
  readonly affidavit: WireAffidavit;
  /** When the review window closes — the entry's `expiresAt` (GT-4). */
  readonly requiredBy: string;
  /** The amendments already made on a superseded entry, or `null` for a first filing. */
  readonly priorAmendments: AmendmentMap | null;
  /** The protocol version this envelope conforms to (SR-4). */
  readonly protocolVersion: string;
}

/** What the pipeline returns: the row as the store holds it, and the card for a reviewer. */
export interface FiledEntry {
  /** The Docket entry, as it reads now. */
  readonly entry: DocketEntry;
  /** `false` when this was a re-file of an id already on the Docket (GT-4, DK-1). */
  readonly created: boolean;
  /** The Evidence Card the host delivers. Built from the **stored** entry, so a re-file re-broadcasts the original deadline. */
  readonly card: EvidenceCardRequest;
}

// ---------------------------------------------------------------------------
// What goes in
// ---------------------------------------------------------------------------

/**
 * A field the host has already tagged, for the Sequence C path where a capture
 * arrives with its provenance settled and there is nothing to infer.
 *
 * `provenance` absent means the host is saying "proposed, provenance unknown", which
 * AF-1 records as an `Empty` tag at confidence `0` — and which the substance gate
 * then refuses if it is the *only* thing the proposal carries (GT-3).
 */
export interface PreparedField {
  /** The field's name. Must be one the operation proposes (AF-1). */
  readonly name: string;
  /** Rendering hint for the reviewer surface. */
  readonly kind: AffidavitFieldKind;
  /** The proposed value. */
  readonly value: JsonValue;
  /** Where the value came from, with its binding. */
  readonly provenance?: ProvenanceChain;
  /** Whether the target entity requires the field. Defaults to the schema, else `false`. */
  readonly isMandatory?: boolean;
}

/**
 * One proposal, in the shape both entry points produce: `wrap`'s gated `execute`
 * builds one from a tool and its arguments, and `Gate.file` builds one from a host's
 * {@link PreparedField} list.
 *
 * Every property is required and explicitly nullable rather than optional. The two
 * that matter are exclusive in practice: `schema` non-null runs steps 2 to 4,
 * `preparedFields` non-null skips them, and `gate.ts` refuses a proposal that supplies
 * neither.
 */
export interface PipelineProposal {
  /** The write being proposed. */
  readonly operation: Operation;
  /** The tool the proposal came from — the name a coverage declaration is keyed by (CV-4). */
  readonly toolName: string;
  /** The field schema the inference step works against, or `null` to skip inference. */
  readonly schema: FieldSchema | null;
  /** The call's arguments, part of the entry id's derivation. */
  readonly args: unknown;
  /** Host-tagged fields, or `null` to run interceptors and inference. */
  readonly preparedFields: readonly PreparedField[] | null;
  /** The host's own verb for the operation, carried onto the card. */
  readonly operationLabel: string | null;
}

/** Everything the pipeline needs from the host, assembled once by `createGate`. */
export interface PipelineDeps {
  /** The Docket (DK-1). */
  readonly store: DocketStore;
  /** The host's structured inference (GT-1 step 3). */
  readonly inference: InferencePort;
  /** The host's previous-value lookup (AF-3). */
  readonly projection: ProjectionPort;
  /** The approval chain, in order (AZ-4). */
  readonly policies: readonly ApprovalPolicy[];
  /** Deterministic resolvers, in order (GT-1 step 2, PV-2). */
  readonly interceptors: readonly FieldInterceptor[];
  /** The host's risk function (GT-5). */
  readonly riskScorer?: RiskScorer | undefined;
  /** Where every instant on the record comes from. */
  readonly clock: Clock;
  /** Where the TL-1 events go. */
  readonly telemetry: TelemetryPort;
  /** The deadline applied when neither the verdict nor the policy names one (GT-4). */
  readonly defaultTtlMs: number;
  /** The tools the host declared it cannot cover (CV-4). */
  readonly coverage: CoverageRegistry;
}

// ---------------------------------------------------------------------------
// The pipeline
// ---------------------------------------------------------------------------

/** A field mid-pipeline: the chain built so far, and the value the tag in force carries. */
interface FieldState {
  readonly chain: ProvenanceChain;
  readonly value: JsonValue;
}

/**
 * Run steps 2 through 9 for `proposal` in `ctx` and return the filed entry with its
 * card.
 *
 * @throws AffiantError `"substance-refused"` when the proposal swears to nothing
 *         (GT-3). Nothing is filed, nothing is broadcast, and the refusal is on the
 *         telemetry port before the throw.
 * @throws RangeError when a port hands back something that is not a JSON value, or
 *         an interceptor claims a field the operation does not propose — host
 *         programming errors, not refusals (ledger BD-31, sixth ruling).
 */
export async function runPipeline(
  proposal: PipelineProposal,
  ctx: TurnContext,
  deps: PipelineDeps,
): Promise<FiledEntry> {
  const now = deps.clock.now();
  const op = proposal.operation;
  const proposed = new Set(op.fields);
  const schemaByName = new Map<string, FieldSchemaEntry>(
    (proposal.schema?.fields ?? []).map((entry) => [entry.name, entry]),
  );

  // Function-local, so nothing survives the call and nothing is shared between two
  // interleaved conversations (GT-2).
  const states = new Map<string, FieldState>();

  /** Admit a tag and its value, merging by PV-1 and keeping the loser in the chain. */
  const admit = (name: string, tag: ProvenanceTag, value: JsonValue): void => {
    const state = states.get(name);
    if (state === undefined) {
      states.set(name, { chain: chainOf(tag), value });
      return;
    }
    const chain = merge(state.chain, tag);
    // `merge` returns the winner as `current`; identity tells us whose value is now
    // in force without re-deciding the contest here.
    states.set(name, { chain, value: chain.current === tag ? value : state.value });
  };

  if (proposal.preparedFields === null) {
    // ---- step 2: deterministic interceptors (PV-2) -------------------------
    for (const interceptor of deps.interceptors) {
      const produced = await interceptor.resolve(op, ctx);
      for (const [name, intercepted] of Object.entries(produced)) {
        if (!proposed.has(name)) {
          throw new RangeError(
            `AF-1: interceptor ${JSON.stringify(interceptor.name)} resolved field ` +
              `${JSON.stringify(name)}, which operation ${op.kind} on ${op.entityType} does not ` +
              `propose; a field the operation does not propose is absent from the Affidavit`,
          );
        }
        // `InterceptedField.source` is `"External" | "Computed"`, so PV-3's other
        // half — a host resolver cannot claim the person said it — is a type, not a
        // check. A binding is required by the same type (PV-2).
        admit(
          name,
          mintTag({
            source: intercepted.source,
            confidence: intercepted.confidence,
            at: now,
            note: intercepted.evidence,
            binding: intercepted.binding,
          }),
          requireJsonValue(intercepted.value, `interceptor ${interceptor.name} field ${name}`),
        );
      }
    }

    // ---- step 3: one tool-free structured inference; step 4: merge ---------
    if (proposal.schema !== null) {
      const inferred = await deps.inference.infer(ctx.turn, proposal.schema);
      for (const [name, structured] of Object.entries(inferred.fields)) {
        // A model naming a field the operation does not propose is the model being
        // a model, not the host being wrong: the extra field is dropped, and AF-1
        // still holds because the Affidavit is built from `op.fields`.
        if (!proposed.has(name)) continue;
        const value = requireJsonValue(structured.value, `inferred field ${name}`);
        // PV-3: `mintConversation` and `mintInferred` are the only two mints reachable
        // from here, and neither can name `UserStated` — the parameter type forbids it
        // and the runtime guard in `mintInference` catches an untyped caller.
        const tag =
          structured.presence === "literal"
            ? mintConversation({
                confidence: structured.confidence,
                at: now,
                note: `Literally present in the turn: ${name}`,
                binding: await utteranceSpanBinding(ctx.turn.utterance, structured.utteranceSpan),
              })
            : mintInferred({
                confidence: structured.confidence,
                at: now,
                note: `Inferred from the turn: ${name}`,
              });
        admit(name, tag, value);
      }
    }
  } else {
    for (const prepared of proposal.preparedFields) {
      if (!proposed.has(prepared.name)) {
        throw new RangeError(
          `AF-1: prepared field ${JSON.stringify(prepared.name)} is not proposed by the ` +
            `operation; a field the operation does not propose is absent from the Affidavit`,
        );
      }
      if (prepared.provenance !== undefined) {
        states.set(prepared.name, { chain: prepared.provenance, value: prepared.value });
      }
    }
  }

  // ---- step 5: projection, then the Affidavit (AF-1, AF-3, AF-2) -----------
  // The port is consulted for an update only: AF-3 says a create carries
  // `previousValue: null` on every field, and there is nothing for a host to look up
  // for an entity that does not exist yet.
  const previous =
    op.kind === "update" ? ((await deps.projection.previousValues(op, ctx)) ?? {}) : {};

  const preparedByName = new Map(
    (proposal.preparedFields ?? []).map((prepared) => [prepared.name, prepared]),
  );

  const inputs = op.fields.map((name): AffidavitFieldInput => {
    const state = states.get(name);
    const prepared = preparedByName.get(name);
    const schemaEntry = schemaByName.get(name);
    const previousValue =
      op.kind === "update"
        ? requireJsonValue(previous[name] ?? null, `previous value of ${name}`)
        : null;
    return {
      name,
      kind: prepared?.kind ?? schemaEntry?.kind ?? "text",
      value: state?.value ?? prepared?.value ?? null,
      previousValue,
      isMandatory: prepared?.isMandatory ?? schemaEntry?.required ?? false,
      // Absent, not `undefined`: `buildAffidavit` reads the absence as "provenance
      // unknown" and writes an `Empty` tag (AF-1).
      ...(state === undefined ? {} : { provenance: state.chain }),
    };
  });

  const affidavit = buildAffidavit(op, inputs, { createdAt: now });

  // ---- step 6: runtime substance refusal (GT-3) ----------------------------
  refuseHollow(affidavit, proposal, ctx, deps, now);

  // ---- step 7: the policy chain (AZ-4, PV-4, GT-5) -------------------------
  const outcome = await evaluatePolicies(deps.policies, affidavit, ctx, {
    riskScorer: deps.riskScorer,
    telemetry: deps.telemetry,
    now,
  });

  // ---- step 8: TTL, from the policy result (GT-4) --------------------------
  const ttlMs = outcome.ttlMs ?? deps.defaultTtlMs;
  const expiresAt = new Date(instantMs(now, "clock.now()") + ttlMs).toISOString();

  // ---- step 9: file (DK-1, AZ-1, AZ-4, CV-4) ------------------------------
  const uncovered = deps.coverage.lookup(proposal.toolName);
  const blocked = blockedMarker(proposal.toolName, uncovered, outcome.requirement);
  // A blocked entry is never auto-approved: AZ-4 says a level the implementation does
  // not run is filed `pending` and refuses every decision, and CV-4 says the same of a
  // tool the host cannot cover. Both are a move *toward* a person, which is the
  // direction AZ-4 permits.
  const fires = outcome.requirement === "StandingOrder" && blocked === null;
  const entryId = await deriveEntryId(ctx, proposal);

  if (uncovered !== null) {
    deps.telemetry.emit({
      key: "coverage.refused",
      at: now,
      attributes: {
        "gen_ai.tool.name": proposal.toolName,
        "coverage.category": uncovered,
        phase: "proposal",
      },
    });
  }

  const attestation: Attestation | null =
    fires && outcome.policy !== null
      ? {
          by: {
            kind: "standing-order",
            policyId: outcome.policy.id,
            version: outcome.policy.version,
          },
          at: now,
          entryId,
        }
      : null;

  const init: NewEntryInit = {
    entryId,
    tenantId: ctx.tenantId,
    conversationId: ctx.conversationId,
    channel: ctx.channel,
    affidavit,
    requirement: outcome.requirement,
    filedAt: now,
    expiresAt,
    // A Standing Order writes status, execution outcome and attestation in the same
    // operation as the filing (AZ-1) — never a file followed by an approve, which
    // would leave a window in which an approved write had no attestation.
    ...(attestation === null
      ? {}
      : { status: "approved" as const, execution: "unexecuted" as const, attestation }),
    ...(blocked === null ? {} : { blocked }),
  };

  const { entry, created } = await deps.store.file(newEntry(init));

  if (fires && outcome.policy !== null) {
    deps.telemetry.emit({
      key: "standing-order.fired",
      at: now,
      attributes: {
        "policy.id": outcome.policy.id,
        "policy.version": outcome.policy.version,
        "entry.id": entry.entryId,
        "risk.score": outcome.riskScore,
      },
    });
  }

  deps.telemetry.emit({
    key: "affidavit.filed",
    at: now,
    attributes: {
      "gen_ai.tool.name": proposal.toolName,
      "gen_ai.conversation.id": ctx.conversationId,
      "entry.id": entry.entryId,
      "docket.requirement": entry.requirement,
      "docket.status": entry.status,
      "affidavit.field_count": entry.affidavit.fields.length,
      created,
    },
  });

  return { entry, created, card: evidenceCard(entry, proposal, outcome) };
}

// ---------------------------------------------------------------------------
// Step 6 — substance (GT-3)
// ---------------------------------------------------------------------------

/**
 * Refuse a proposal that swears to nothing: no field carrying provenance other than
 * `Empty`, or a non-empty value sitting under an `Empty` tag (GT-3).
 *
 * The hollow case is checked first because it is the more specific diagnosis — an
 * all-`Empty` Affidavit with values in it satisfies both descriptions, and "you filled
 * in a value and told me nothing about where it came from" is the more useful thing to
 * say.
 *
 * A value counts as empty when it is `null` or a string that is blank. `0` and `false`
 * are values somebody meant, and a field carrying one under an `Empty` tag is exactly
 * the hollow shape the rule is about.
 */
function refuseHollow(
  affidavit: Affidavit,
  proposal: PipelineProposal,
  ctx: TurnContext,
  deps: PipelineDeps,
  now: string,
): void {
  const hollow = affidavit.fields.find(
    (field) => field.provenance.current.source === "Empty" && !isEmptyValue(field.value),
  );
  const reason =
    hollow !== undefined
      ? `field ${JSON.stringify(hollow.name)} carries a value with Empty provenance`
      : affidavit.fields.every((field) => field.provenance.current.source === "Empty")
        ? "no proposed field carries provenance other than Empty"
        : null;
  if (reason === null) return;

  deps.telemetry.emit({
    key: "affidavit.refused.substance",
    at: now,
    attributes: {
      "gen_ai.tool.name": proposal.toolName,
      "gen_ai.conversation.id": ctx.conversationId,
      "affidavit.field_count": affidavit.fields.length,
      reason,
    },
  });

  throw new AffiantError(
    "substance-refused",
    `GT-3: this proposal swears to nothing — ${reason}. It is not filed, not counted and ` +
      `not broadcast.`,
    { toolName: proposal.toolName, reason, entityType: affidavit.entityType },
  );
}

/** Whether `value` is the absence of a value: `null`, or a string with nothing in it. */
function isEmptyValue(value: JsonValue): boolean {
  if (value === null) return true;
  return typeof value === "string" && value.trim() === "";
}

// ---------------------------------------------------------------------------
// Step 9 — the row and the card
// ---------------------------------------------------------------------------

/**
 * The AZ-4 marker the entry is filed with, or `null` when it can be decided.
 *
 * Coverage comes first: a tool the host cannot intercept is the more fundamental
 * problem, and its category is the more useful thing on the row.
 */
function blockedMarker(
  toolName: string,
  uncovered: ReturnType<CoverageRegistry["lookup"]>,
  requirement: RequirementKind,
): BlockedMarker | null {
  if (uncovered !== null) return coverageRefusedMarker(toolName, uncovered);
  if (requirement === "MultiParty" || requirement === "ReferralRequired") {
    // Recorded verbatim (AZ-4): the row says what was asked for, and no code path
    // turns it into the weaker requirement this version does know how to run.
    return { code: "requirement-not-implemented", level: requirement };
  }
  return null;
}

/** The card a host delivers, built from the **stored** entry (GT-4) and the wire carry. */
function evidenceCard(
  entry: DocketEntry,
  proposal: PipelineProposal,
  outcome: PolicyOutcome,
): EvidenceCardRequest {
  return {
    docketId: entry.entryId,
    affidavit: toWire(entry.affidavit, wireCarry(entry, proposal, outcome)),
    requiredBy: entry.expiresAt,
    priorAmendments: entry.amendments,
    protocolVersion: entry.protocolVersion,
  };
}

/**
 * The presentation the core does not own: the host's verb, the warnings a reviewer
 * should see, whether a person must confirm, and the reviewer surface's per-field
 * input constraints.
 */
function wireCarry(
  entry: DocketEntry,
  proposal: PipelineProposal,
  outcome: PolicyOutcome,
): WireCarry {
  const warnings: string[] = [];
  if (outcome.reason !== null) warnings.push(outcome.reason);
  if (entry.blocked?.code === "coverage-refused") {
    warnings.push(
      `CV-4: ${JSON.stringify(proposal.toolName)} is declared uncovered ` +
        `(${String(entry.blocked.category)}); this proposal is on the record and cannot be ` +
        `approved through the gate.`,
    );
  }
  if (entry.blocked?.code === "requirement-not-implemented") {
    warnings.push(
      `AZ-4: ${String(entry.blocked.level)} approval is not implemented in this version; the ` +
        `entry is blocked and no decision on it will be accepted.`,
    );
  }

  const constraints: Record<
    string,
    { allowedValues: readonly string[] | null; pattern: string | null }
  > = {};
  const schemaByName = new Map(
    (proposal.schema?.fields ?? []).map((entry_) => [entry_.name, entry_]),
  );
  for (const field of entry.affidavit.fields) {
    constraints[field.name] = {
      allowedValues: schemaByName.get(field.name)?.allowedValues ?? null,
      pattern: null,
    };
  }

  return {
    operationType:
      proposal.operationLabel ??
      (entry.affidavit.operationType === "create" ? "WriteCreate" : "WriteUpdate"),
    warnings,
    requiresConfirmation: entry.status === "pending",
    fieldConstraints: constraints,
  };
}

// ---------------------------------------------------------------------------
// Entry ids
// ---------------------------------------------------------------------------

/**
 * The entry id for this proposal: a SHA-256 over the tenant, the conversation, the
 * tool and the canonical form of the operation and its arguments, laid out as a UUID.
 *
 * The layout sets the version nibble to `8` and the variant bits to `10`, which RFC
 * 9562 reserves for exactly this — a UUID whose bits are a hash an application chose.
 * The shape matters because `docketId` is a UUID string on the wire; the determinism
 * matters because it is what makes a retried tool call a replay rather than a second
 * review (GT-4, DK-1).
 *
 * @throws TypeError if `args` contains something with no canonical form — a function,
 *         a symbol, a cycle. Tool arguments are JSON; anything else is a caller bug.
 */
export async function deriveEntryId(
  ctx: TurnContext,
  proposal: Pick<PipelineProposal, "toolName" | "operation" | "args">,
): Promise<string> {
  const material = canonicalJson({
    tenantId: ctx.tenantId,
    conversationId: ctx.conversationId,
    toolName: proposal.toolName,
    operation: proposal.operation,
    args: proposal.args ?? null,
  });
  const digest = await sha256Hex(new TextEncoder().encode(material));
  return uuidFromDigest(digest);
}

/** Lay 128 bits of `digest` out as a UUID with version 8 and the RFC 9562 variant. */
function uuidFromDigest(digest: string): string {
  const nibbles = [...digest.slice(0, 32)];
  nibbles[12] = "8";
  nibbles[16] = "89ab"[Number.parseInt(nibbles[16] ?? "0", 16) % 4] ?? "8";
  const hex = nibbles.join("");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}

// ---------------------------------------------------------------------------
// Bindings and values
// ---------------------------------------------------------------------------

/**
 * The `utterance-span` binding for a value the port reported as literally present
 * (PV-2), or `null` when there is no span or the span does not fit the turn.
 *
 * The hash is a SHA-256 of the span's own text, so an auditor holding the turn can
 * re-derive it and see that the pointer still points where it did. A span that runs
 * past the end of the utterance, or reads backwards, is not evidence: the binding is
 * dropped and the tag stays `Conversation` with nothing behind it, which PV-4 then
 * treats as unbound — the honest outcome.
 */
async function utteranceSpanBinding(
  utterance: string,
  span: UtteranceSpan | null,
): Promise<Binding | null> {
  if (span === null) return null;
  if (!Number.isInteger(span.start) || !Number.isInteger(span.end)) return null;
  if (span.start < 0 || span.end < span.start || span.end > utterance.length) return null;
  const text = utterance.slice(span.start, span.end);
  return {
    kind: "utterance-span",
    ref: {
      offset: span.start,
      length: span.end - span.start,
      hash: await sha256Hex(new TextEncoder().encode(text)),
    },
  };
}

/**
 * `value` as a JSON value.
 *
 * @throws RangeError when a port hands back something with no JSON form. A port
 *         contract violation is a host programming error (ledger BD-31, sixth
 *         ruling), and letting it through would put an unserializable value on a
 *         record whose whole purpose is to be read back later.
 */
function requireJsonValue(value: unknown, where: string): JsonValue {
  if (!isJsonValue(value)) {
    throw new RangeError(
      `${where} is not a JSON value (${typeof value}); every value on an Affidavit must ` +
        `survive serialization`,
    );
  }
  return value;
}
