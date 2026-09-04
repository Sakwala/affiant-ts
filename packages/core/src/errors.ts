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
