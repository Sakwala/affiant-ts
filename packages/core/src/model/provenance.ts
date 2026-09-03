/**
 * Provenance: the seven-source ladder, the tag, the binding that makes a tag
 * checkable, the chain that keeps every superseded tag, and the merge rule.
 *
 * **Rules served: PV-1** (the ladder, the chain, confidence-first /
 * determinism-second merge, confidence clamped into `[0, 1]`), **PV-2** (a tag
 * above `Conversation` carries a binding, and the binding kinds are a fixed set),
 * **PV-3** (an implementation's own inference never mints `UserStated`), **PV-5**
 * (no wire type raises a grade: an asserted grade above `Conversation` with no
 * binding is carried on the record but is not honourable).
 *
 * The idea in one paragraph: a value on an Affidavit is worth exactly what its
 * evidence is worth. A provenance tag says where the value came from
 * ({@link ProvenanceSource}), how confident its producer was, and — for the grades
 * that claim more than "a model read it in the conversation" — a {@link Binding}:
 * a pointer at something an auditor can go and check years later. A tag with no
 * binding is not a lie, it is a weaker claim, and the framework's job is to keep
 * the difference visible rather than to average it away.
 *
 * Nothing here reads a clock. Every function that stamps a time takes the instant
 * as a parameter, so a fixture can pin it (RT-1, and the same reason the clock is
 * a port rather than a call to `Date.now()`).
 *
 * @packageDocumentation
 */

import type { ProvenanceSource } from "@affiant/contract";

/** Where a value came from. Re-exported so a host can name it without a second import. */
export type { ProvenanceSource };

// ---------------------------------------------------------------------------
// The ladder (PV-1)
// ---------------------------------------------------------------------------

/**
 * The seven provenance sources, **most deterministic first**.
 *
 * This order is not a preference, it is the tie-breaker: when two tags carry equal
 * confidence the one nearer the front of this list wins the merge (PV-1). Read it
 * as a claim about who could re-derive the value — the person said it; a system of
 * record holds it; a named rule computes it; it was literally present in the
 * conversation; a model reasoned to it; a default filled it in; nobody knows.
 *
 * Spelled out here rather than re-exported from `@affiant/contract` so the gate's
 * ordering is a fact of the gate. `test/provenance.test.ts` asserts the two lists
 * are identical, which is what keeps them from drifting apart.
 */
export const PROVENANCE_LADDER = [
  "UserStated",
  "External",
  "Computed",
  "Conversation",
  "Inferred",
  "Default",
  "Empty",
] as const satisfies readonly ProvenanceSource[];

/** Rank by position in {@link PROVENANCE_LADDER}, computed once. */
const RANK: Readonly<Record<ProvenanceSource, number>> = Object.freeze(
  Object.fromEntries(PROVENANCE_LADDER.map((source, index) => [source, index])) as Record<
    ProvenanceSource,
    number
  >,
);

/**
 * How deterministic `source` is: `0` for `UserStated`, `6` for `Empty`.
 *
 * **Lower is more deterministic.** The number is an index into
 * {@link PROVENANCE_LADDER}, so it is a comparison key and nothing else — never a
 * score, never a weight, never something to multiply a confidence by.
 */
export function determinismRank(source: ProvenanceSource): number {
  return RANK[source];
}

/**
 * Whether a tag with this source must carry a {@link Binding} to be worth its grade
 * (PV-2): the three sources **above** `Conversation` — `UserStated`, `External`,
 * `Computed`.
 *
 * At or below `Conversation` the grade already says "this came from the turn, or
 * from a model reading the turn", and the turn is itself the artifact. Above it,
 * the tag claims an artifact outside the conversation, and a claim with no pointer
 * at that artifact is not checkable — see {@link isBound} and PV-4, where the pair
 * decides whether a person-free approval may rest on the tag.
 */
export function requiresBinding(source: ProvenanceSource): boolean {
  return determinismRank(source) < determinismRank("Conversation");
}

// ---------------------------------------------------------------------------
// Bindings (PV-2)
// ---------------------------------------------------------------------------

/**
 * Where in the unmodified utterance a value was found.
 *
 * Offset and length rather than a start/end pair, and a `hash` of the substring:
 * offsets alone rot the moment anything re-wraps or re-encodes the transcript, so
 * the hash is what lets an auditor prove the span still says what it said. The
 * digest algorithm and encoding are fixed by the canonical-form rules (SR-1, pull
 * request C3); this type carries the string.
 */
export interface UtteranceSpanRef {
  /** Character offset into the utterance, from 0. */
  readonly offset: number;
  /** Length of the span in characters. */
  readonly length: number;
  /** Digest of the spanned substring, so the span can be checked after the fact. */
  readonly hash: string;
}

/** The Docket decision that amended the field. */
export interface ReviewerActRef {
  /** The Docket entry the decision was made on. */
  readonly entryId: string;
  /** When the decision was made, as an ISO 8601 instant. */
  readonly decisionAt: string;
}

/** The form control a person typed into. */
export interface FormInputRef {
  /** The form field's name, as the host's own surface names it. */
  readonly field: string;
}

/**
 * A relay that asserted a person's identity rather than authenticating them — the
 * channel the capture arrived on and the message it arrived in (Sequence C).
 */
export interface RelayRef {
  /** The relay's own principal id. */
  readonly principal: string;
  /** How the person is addressed on that channel. */
  readonly channelIdentity: string;
  /** The message the capture arrived in. */
  readonly messageId: string;
}

/**
 * The system of record an `External` value was read from.
 *
 * `fetchedAt` and `contentHash` are what a value read from a page with no API binds
 * instead of a record id: when it was read, and what it said when it was read. A
 * binding whose source cannot be re-fetched or re-verified is not a binding (PV-2).
 */
export interface ExternalRef {
  /** The source system, named the way the host names it. */
  readonly system: string;
  /** The record within that system. A canonical URL where the system is a page. */
  readonly recordId: string;
  /** When the value was read, as an ISO 8601 instant. */
  readonly fetchedAt?: string;
  /** Digest of what the source said when it was read. */
  readonly contentHash?: string;
  /** Present when the value arrived over a trusted relay. */
  readonly relay?: RelayRef;
}

/**
 * An externally published constant a computation consumed, and the date it was
 * last verified.
 *
 * *When a value was checked is a different fact from when the tag was written*
 * (PV-2): a rate table verified in March and used in September is a September tag
 * resting on a March fact, and a reviewer is entitled to see both.
 */
export interface ComputationConstantRef {
  /** Where the constant is published. */
  readonly source: string;
  /** The date the constant was last verified, as an ISO 8601 date or instant. */
  readonly verifiedOn: string;
}

/** The deterministic rule a `Computed` value came out of, and what it consumed. */
export interface ComputationRef {
  /** The rule's name — re-runnable, not a description. */
  readonly rule: string;
  /** The field names the rule consumed, in the order it consumed them. */
  readonly inputs: readonly string[];
  /** An externally published constant the rule depends on. */
  readonly constant?: ComputationConstantRef;
}

/**
 * What to look at to check a value. The five kinds are a **fixed set** (PV-2): a
 * binding kind nobody can enumerate is a binding nobody can audit.
 */
export type Binding =
  | { readonly kind: "utterance-span"; readonly ref: UtteranceSpanRef }
  | { readonly kind: "reviewer-act"; readonly ref: ReviewerActRef }
  | { readonly kind: "form-input"; readonly ref: FormInputRef }
  | { readonly kind: "external-ref"; readonly ref: ExternalRef }
  | { readonly kind: "computation-ref"; readonly ref: ComputationRef };

/** Every {@link Binding} kind, as data. */
export const BINDING_KINDS = [
  "utterance-span",
  "reviewer-act",
  "form-input",
  "external-ref",
  "computation-ref",
] as const satisfies readonly Binding["kind"][];

/** The kind discriminator of a {@link Binding}. */
export type BindingKind = Binding["kind"];

/**
 * The bindings a deterministic interceptor may mint.
 *
 * The restriction is PV-3 in the type system: an interceptor resolves `External`
 * and `Computed` values, so it can only ever point at a record or a computation. A
 * machine does not get to bind a value to a person's act.
 */
export type InterceptorBinding = Extract<Binding, { kind: "external-ref" | "computation-ref" }>;

// ---------------------------------------------------------------------------
// Tags (PV-1, PV-2)
// ---------------------------------------------------------------------------

/**
 * One provenance record for one field value.
 *
 * `binding` is written on every minted tag — `null` when the producer had nothing
 * to point at — so a reader never has to distinguish "unbound" from "the property
 * was left off". The property is declared optional only because a wire-derived tag
 * at protocol tag `0.0.1-seed` carries no binding field at all.
 */
export interface ProvenanceTag {
  /** Where the value came from. */
  readonly source: ProvenanceSource;
  /** Confidence in the value, in `[0, 1]`. Always clamped at mint time (PV-1). */
  readonly confidence: number;
  /** A human-readable line for the reviewer, or `null` when there is nothing to say. */
  readonly note: string | null;
  /** When the tag was minted, as an ISO 8601 instant. */
  readonly at: string;
  /** Index of the conversation turn the value came from, or `null`. */
  readonly conversationTurn: number | null;
  /** What to look at to check the value (PV-2), or `null` when the producer had nothing. */
  readonly binding?: Binding | null;
}

/**
 * The ordered provenance history of one field: the tag in force, and every tag it
 * displaced.
 *
 * `prior` is newest first, which is the order a card reads it in ("was `Inferred`
 * at 0.4, before that `Default`"). Nothing is ever dropped from a chain — a merge
 * that discarded the loser would erase the fact that two producers disagreed,
 * which is the fact a reviewer most wants.
 */
export interface ProvenanceChain {
  /** The tag in force for the field's current value. */
  readonly current: ProvenanceTag;
  /** Superseded tags, newest first. Empty on a chain that has never been merged. */
  readonly prior: readonly ProvenanceTag[];
}

/** What every mint call needs. */
interface MintCommon {
  /** Confidence as the producer reports it. Clamped into `[0, 1]` (PV-1). */
  readonly confidence: number;
  /** When the tag is minted, as an ISO 8601 instant. Passed in; nothing here reads a clock. */
  readonly at: string;
  /** A human-readable line for the reviewer. Defaults to `null`. */
  readonly note?: string | null;
  /** The conversation turn the value came from. Defaults to `null`. */
  readonly conversationTurn?: number | null;
  /** What to look at to check the value. Defaults to `null`. */
  readonly binding?: Binding | null;
}

/** What {@link mintTag} needs: {@link MintCommon} plus the source being claimed. */
export interface MintTagOptions extends MintCommon {
  /** The grade being claimed. */
  readonly source: ProvenanceSource;
}

/** What {@link mintInference}, {@link mintConversation} and {@link mintInferred} need. */
export type MintInferenceOptions = MintCommon;

/**
 * Clamp a producer-reported confidence into `[0, 1]` (PV-1).
 *
 * `NaN` becomes `0`: a number that is not a number is not a claim, and the shipped
 * .NET inference step floors at 0 without capping, which is the defect this closes.
 */
function clampConfidence(confidence: number): number {
  if (Number.isNaN(confidence)) return 0;
  if (confidence < 0) return 0;
  if (confidence > 1) return 1;
  return confidence;
}

/**
 * Mint a tag for any source, clamping the confidence into `[0, 1]` (PV-1).
 *
 * A tag whose source is `Empty` is forced to confidence `0`: "nobody knows where
 * this came from" cannot also be a confident claim, and AF-2 counts every `Empty`
 * field as `0` in the aggregate anyway — forcing it here means the two can never
 * disagree.
 *
 * This is the general minting surface, used by deterministic interceptors, by the
 * projection step and by a reviewer's amendment. **It is not the surface the
 * inference step gets:** PV-3 forbids an implementation's own inference from
 * minting `UserStated`, so the inference step is handed {@link mintInference},
 * whose source parameter is typed {@link InferenceSource} and cannot name it.
 */
export function mintTag(options: MintTagOptions): ProvenanceTag {
  const confidence = options.source === "Empty" ? 0 : clampConfidence(options.confidence);
  return {
    source: options.source,
    confidence,
    note: options.note ?? null,
    at: options.at,
    conversationTurn: options.conversationTurn ?? null,
    binding: options.binding ?? null,
  };
}

/**
 * The only two sources an implementation's own inference may mint (PV-3).
 *
 * `Conversation` when the value is literally present in the unmodified utterance;
 * `Inferred` when the model reasoned to it. `UserStated` is an observation of a
 * person's act — an utterance span, a form input, a reviewer's amendment — never
 * the host vouching for a value it produced itself.
 */
export type InferenceSource = "Conversation" | "Inferred";

/**
 * Mint a tag from the inference step. The source parameter is
 * {@link InferenceSource}, so `UserStated` is a compile error here (PV-3).
 *
 * The runtime guard exists for callers with no type-checker — a JavaScript host, a
 * value cast at the boundary — because PV-3 is a rule about what the record may
 * say, not about what TypeScript can see.
 *
 * @throws RangeError if `source` is anything but `Conversation` or `Inferred`.
 */
export function mintInference(
  source: InferenceSource,
  options: MintInferenceOptions,
): ProvenanceTag {
  if (source !== "Conversation" && source !== "Inferred") {
    throw new RangeError(
      `PV-3: inference may mint only "Conversation" or "Inferred", not ${JSON.stringify(source)}; ` +
        `"UserStated" is an observation of a person's act, never the host vouching for its own value`,
    );
  }
  return mintTag({ ...options, source });
}

/** {@link mintInference} with source `Conversation`: the value was literally in the turn. */
export function mintConversation(options: MintInferenceOptions): ProvenanceTag {
  return mintInference("Conversation", options);
}

/** {@link mintInference} with source `Inferred`: the model reasoned to the value. */
export function mintInferred(options: MintInferenceOptions): ProvenanceTag {
  return mintInference("Inferred", options);
}

/**
 * The tag a field carries when nobody knows where its value came from: source
 * `Empty`, confidence `0` (AF-1 — present and tagged, never omitted).
 */
export function emptyTag(at: string, note: string | null = null): ProvenanceTag {
  return mintTag({ source: "Empty", confidence: 0, at, note });
}

/** Whether `tag` points at something an auditor can check (PV-2). */
export function isBound(tag: ProvenanceTag): boolean {
  return tag.binding !== null && tag.binding !== undefined;
}

/**
 * Whether `tag`'s grade is one a person-free verdict may rest on: either the grade
 * needs no binding, or it has one (PV-4, PV-5).
 *
 * The unhonourable case is exactly the one PV-5 names: a caller asserts
 * `UserStated` on the wire and points at nothing. The tag is still recorded — the
 * record says what the caller claimed — but a Standing Order that predicates on it
 * falls back to asking a person.
 */
export function isHonourable(tag: ProvenanceTag): boolean {
  return !requiresBinding(tag.source) || isBound(tag);
}

// ---------------------------------------------------------------------------
// Chains and the merge rule (PV-1)
// ---------------------------------------------------------------------------

/** A fresh chain holding one tag and no history. */
export function chainOf(tag: ProvenanceTag): ProvenanceChain {
  return { current: tag, prior: [] };
}

/**
 * Whether `challenger` beats `incumbent`: higher confidence first, ties broken
 * toward the more deterministic source (PV-1).
 *
 * An exact tie — same confidence, same source — leaves the incumbent in force. It
 * was there first and the challenger brings nothing new; the challenger is still
 * preserved in the chain, so the fact that two producers agreed is on the record.
 */
function beats(challenger: ProvenanceTag, incumbent: ProvenanceTag): boolean {
  if (challenger.confidence !== incumbent.confidence) {
    return challenger.confidence > incumbent.confidence;
  }
  return determinismRank(challenger.source) < determinismRank(incumbent.source);
}

/**
 * Merge `incoming` into `chain` (PV-1): the higher confidence wins, ties break
 * toward the more deterministic source, **and the loser is preserved** at the head
 * of `prior`.
 *
 * This is the step where a deterministic interceptor's `External` value displaces
 * a model's guess, or fails to. Either way both tags survive, so a card can show a
 * reviewer that the model said one thing and the system of record said another.
 */
export function merge(chain: ProvenanceChain, incoming: ProvenanceTag): ProvenanceChain {
  if (beats(incoming, chain.current)) {
    return { current: incoming, prior: [chain.current, ...chain.prior] };
  }
  return { current: chain.current, prior: [incoming, ...chain.prior] };
}

/**
 * Put `tag` in force unconditionally, pushing the tag it displaces onto `prior`.
 *
 * Not a merge: a reviewer's amendment is not a confidence contest it might lose
 * (AF-4, PV-2). When a person corrects a field, their act is the provenance of the
 * new value even if the machine was more sure of the old one.
 */
export function supersede(chain: ProvenanceChain, tag: ProvenanceTag): ProvenanceChain {
  return { current: tag, prior: [chain.current, ...chain.prior] };
}

/** Every tag in `chain`, in force first and then oldest-displaced last. */
export function tagsOf(chain: ProvenanceChain): readonly ProvenanceTag[] {
  return [chain.current, ...chain.prior];
}
