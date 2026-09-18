/**
 * The error the gate throws, and the closed set of codes it throws with.
 *
 * **Rules served: CV-1** (hard-fail at wire-up; there is no disable switch),
 * **AZ-4** (a requirement the implementation does not run is refused, never
 * silently degraded).
 *
 * CV-1 in one sentence: *a misconfiguration the framework can detect fails at
 * wire-up with a stated error, and no option turns the gate off for a tool it
 * covers.* Every such failure is an {@link AffiantError} carrying one
 * {@link ErrorCode} — a machine-readable reason a host can branch on and a
 * conformance fixture can assert, rather than a message string that drifts.
 *
 * The codes are a closed union on purpose. A refusal that cannot be named here is
 * a refusal no fixture can pin, and a host that cannot distinguish "you wired this
 * wrong" from "the reviewer rejected it" will paper over the first.
 *
 * @packageDocumentation
 */

/**
 * Every reason the gate refuses, keyed by itself.
 *
 * The key and the value are the same string because the string *is* the API: it is
 * what a fixture asserts and what a host branches on, so there is exactly one
 * spelling to remember. Read a code as `ErrorCode["substance-refused"]`, or write
 * the literal — both type-check.
 *
 * Three codes are marked **provisional**: they are named by the v0.1 design but the
 * protocol rulebook does not yet carry an `ErrorCode` registry. When it does, those
 * three are the ones that may be renamed to match it; the other seven describe
 * behaviour the rulebook already fixes.
 */
export const ErrorCode = {
  /**
   * A requirement this implementation recognises but does not run — a `MultiParty`
   * approval, a `ReferralRequired` referral — reached the pipeline. The entry is
   * filed `pending` and marked blocked; every decision on it is refused. Never
   * degraded to a weaker requirement (AZ-4).
   *
   * **Provisional** until the protocol's `ErrorCode` registry lands.
   */
  "requirement-not-implemented": "requirement-not-implemented",
  /**
   * A tool the gate must cover cannot be intercepted — it is write-capable with no
   * `execute` to replace, it is executed by the model provider, or it is a hosted
   * MCP tool. Raised at wire-up (CV-4, CV-1), or carried on a proposal from a tool
   * the host explicitly declared uncovered.
   *
   * **Provisional** until the protocol's `ErrorCode` registry lands.
   */
  "coverage-refused": "coverage-refused",
  /**
   * A proposal reached the substance gate with nothing to swear to: no field
   * carrying provenance other than `Empty`, or a non-empty value sitting under
   * `Empty` provenance. Refused before anything is filed (GT-3).
   */
  "substance-refused": "substance-refused",
  /**
   * A decision was refused on identity grounds: the context carried no resolved
   * principal, the entry belongs to another tenant, or the host's authorization
   * port said no. Refused before the store is touched (AZ-2).
   */
  "decision-unauthorized": "decision-unauthorized",
  /** A decision was made on an entry that is no longer `pending` (DK-1). */
  "decision-not-pending": "decision-not-pending",
  /**
   * A decision was made on an entry that has passed its expiry. The entry reads
   * `expired` whether or not the host's sweep has run; the decision's amendments
   * are preserved on the row for a resubmission (DK-1).
   */
  "decision-expired": "decision-expired",
  /**
   * Two decisions raced for the same entry and this one lost the compare-and-set.
   * A transition is applied once or not at all, never twice (DK-1).
   */
  "decision-lost-race": "decision-lost-race",
  /**
   * The gate was built wrong in a way it can detect: no store, no authorization
   * port, a policy declaring a risk threshold with no scorer to compare against.
   * Thrown from `createGate`, not on the first request (CV-1).
   */
  "wireup-invalid": "wireup-invalid",
  /** No entry with that id is visible in the given scope (DK-1). */
  "entry-not-found": "entry-not-found",
  /**
   * An execution outcome was reported against a row that already carries one. The
   * first report stands and the row is untouched: a decision, once recorded, is
   * never edited in place, and an approved-but-failed write must stay
   * distinguishable from an approved-and-committed one (DK-4, DK-1).
   *
   * A host that retries a write reports **once**, when it knows the outcome (AZ-5:
   * an outbox is a retry of an already-attested write, not a second authorization
   * path, and not a second fact about what happened).
   *
   * **Provisional** until the protocol's `ErrorCode` registry lands.
   */
  "execution-already-recorded": "execution-already-recorded",
} as const;

/** One of the reasons in {@link ErrorCode}. */
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/**
 * Every {@link ErrorCode} value, in registry order. Pinned as data so a runtime
 * check and a fixture can use the same list the type does.
 *
 * **The order only ever grows at the end.** A code is added by appending it, never
 * by inserting one among the codes that already shipped: the list is what a host's
 * exhaustiveness check and a parity manifest read, and a reordering would look like
 * a rename to both.
 */
export const ERROR_CODES = [
  "requirement-not-implemented",
  "coverage-refused",
  "substance-refused",
  "decision-unauthorized",
  "decision-not-pending",
  "decision-expired",
  "decision-lost-race",
  "wireup-invalid",
  "entry-not-found",
  "execution-already-recorded",
] as const satisfies readonly ErrorCode[];

/** Whether `value` is one of the codes in {@link ErrorCode}. */
export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === "string" && (ERROR_CODES as readonly string[]).includes(value);
}

/**
 * Structured context attached to an {@link AffiantError}: the entry id, the tool
 * name, the policy that produced a verdict — whatever the throwing site can name.
 *
 * Values are `unknown` because the useful details differ per code. Callers narrow;
 * loggers stringify. Never put a field value or an utterance in here — an error is
 * not an audit record, and the audit record is the Affidavit.
 */
export interface AffiantErrorDetails {
  readonly [key: string]: unknown;
}

/**
 * The error every refusal in this package throws.
 *
 * The `code` is the contract; the `message` is for a human reading a log. A host
 * that branches on the message is doing it wrong, and a fixture that asserts on
 * the message is asserting on prose.
 */
export class AffiantError extends Error {
  /** Why the gate refused. */
  readonly code: ErrorCode;
  /** Structured context for the refusal. `{}` when the throwing site supplied none. */
  readonly details: AffiantErrorDetails;

  /**
   * @param code    Why the gate refused.
   * @param message A human-readable explanation. Defaults to the code itself.
   * @param details Structured context for the refusal.
   */
  constructor(code: ErrorCode, message?: string, details?: AffiantErrorDetails) {
    super(message ?? code);
    this.name = "AffiantError";
    this.code = code;
    this.details = details ?? {};
  }
}

/**
 * Whether `value` is an {@link AffiantError}.
 *
 * `instanceof` first, then a structural check: a host can end up with two copies of
 * this package in one process (a bundler, two versions in a dependency tree), and a
 * `catch` that spans that boundary still has to give a true answer. The structural
 * arm is deliberately narrow — an `Error` named `AffiantError` carrying a `code`
 * from {@link ERROR_CODES}.
 */
export function isAffiantError(value: unknown): value is AffiantError {
  if (value instanceof AffiantError) return true;
  return (
    value instanceof Error &&
    value.name === "AffiantError" &&
    isErrorCode((value as { readonly code?: unknown }).code)
  );
}

// ---------------------------------------------------------------------------
// Caller errors — the host's own programming mistakes, which are not refusals
// ---------------------------------------------------------------------------

/**
 * Which programming mistake a caller made, from the closed set this release names.
 *
 * A kind is **not** an {@link ErrorCode}. It is not in the protocol's refusal
 * registry, it never appears in {@link ERROR_CODES}, and it never crosses the wire
 * as one: the registry names gate refusals only, and the rulebook classes an
 * amendment naming a field the Affidavit does not propose, or a verdict naming a
 * requirement outside the four, as a language-level error rather than a refusal
 * code. These kinds live in this package, for a host that wants to tell one of its
 * own mistakes from another without reading an error message.
 *
 * - `amendment-unknown-field` — an amendment named a field the Affidavit does not
 *   propose. The entry changes no state (DK-2).
 * - `turn-context-invalid` — an identifier the turn context must carry was blank.
 * - `superseded-entry-mismatch` — a card was asked for on a row that supersedes
 *   another, without the superseded row, or with the wrong one.
 * - `entry-not-decided` — a decision report was asked for on a row still `pending`.
 * - `binding-invalid` — host-written input carried something in the binding position
 *   that the protocol's binding schema refuses. Nothing is filed (PV-2, SR-3).
 * - `cursor-invalid` — a paged list was handed a cursor the store can tell it did not
 *   issue: it does not decode, is not the shape the store mints, or was minted for a
 *   different list (DK-3).
 */
export type CallerErrorKind =
  | "amendment-unknown-field"
  | "turn-context-invalid"
  | "superseded-entry-mismatch"
  | "entry-not-decided"
  | "binding-invalid"
  | "cursor-invalid";

/** Every {@link CallerErrorKind}, as data the guard below can test against. */
const CALLER_ERROR_KINDS: readonly CallerErrorKind[] = [
  "amendment-unknown-field",
  "turn-context-invalid",
  "superseded-entry-mismatch",
  "entry-not-decided",
  "binding-invalid",
  "cursor-invalid",
];

/** Whether `value` is one of the kinds in {@link CallerErrorKind}. */
function isCallerErrorKind(value: unknown): value is CallerErrorKind {
  return typeof value === "string" && (CALLER_ERROR_KINDS as readonly string[]).includes(value);
}

/**
 * Structured context attached to an {@link AffiantCallerError}: the field an
 * amendment named, the entry it was made on, the identifier that was blank.
 *
 * Values are `unknown` because the useful details differ per kind, exactly as they
 * do on {@link AffiantErrorDetails}. Never put a field value or an utterance in
 * here — an error is not an audit record.
 */
export interface AffiantCallerErrorDetails {
  readonly [key: string]: unknown;
}

/**
 * A programming mistake in the calling code, told apart from the host's own bugs.
 *
 * This is **not a refusal**. A refusal is an {@link AffiantError} carrying an
 * {@link ErrorCode} from the protocol's closed registry — something the gate decided
 * about a proposal or a decision. This class is the other thing: an argument the
 * caller could not legally have passed, which the rulebook calls a language-level
 * error rather than a refusal code. It extends `RangeError`, so every host that
 * already catches a `RangeError` from these call sites keeps working; what is new is
 * that `kind` and `details` can be branched on instead of a message string.
 *
 * `kind` is not an `ErrorCode`, is not in the refusal registry, and is never sent as
 * one. Use {@link isCallerError} rather than `instanceof` where two copies of this
 * package may be loaded in one process.
 */
export class AffiantCallerError extends RangeError {
  /** Which programming mistake was made. */
  readonly kind: CallerErrorKind;
  /** Structured context for the mistake. `{}` when the throwing site supplied none. */
  readonly details: AffiantCallerErrorDetails;

  /**
   * @param kind    Which programming mistake was made.
   * @param message A human-readable explanation. Defaults to the kind itself.
   * @param details Structured context for the mistake.
   */
  constructor(kind: CallerErrorKind, message?: string, details?: AffiantCallerErrorDetails) {
    super(message ?? kind);
    this.name = "AffiantCallerError";
    this.kind = kind;
    this.details = details ?? {};
  }
}

/**
 * Whether `value` is an {@link AffiantCallerError}.
 *
 * `instanceof` first, then a structural check, for the same reason
 * {@link isAffiantError} has one: a host can end up with two copies of this package
 * in one process, and a `catch` that spans that boundary still has to give a true
 * answer. The structural arm is deliberately narrow — an `Error` named
 * `AffiantCallerError` carrying one of the kinds above.
 */
export function isCallerError(value: unknown): value is AffiantCallerError {
  if (value instanceof AffiantCallerError) return true;
  return (
    value instanceof Error &&
    value.name === "AffiantCallerError" &&
    isCallerErrorKind((value as { readonly kind?: unknown }).kind)
  );
}
