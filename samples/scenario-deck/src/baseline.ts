/**
 * The whole-call approval baseline: the shape every agent framework's "approve this
 * tool call" gate has, written out in full so it can be compared rather than
 * characterised.
 *
 * A reviewer is shown a tool's name and its raw arguments as one blob and answers
 * yes or no. That is the entire surface, and the whole of it is here — no
 * dependency, no import, twenty-odd lines of executable code. It is written to be
 * **fair**: this is not a strawman of a bad gate, it is a faithful reduction of a
 * good one. Answering "may this call run?" is a real question and this answers it.
 *
 * What it cannot do follows from the shape rather than from any shortcut taken here:
 *
 * - **No per-field anything.** The arguments are one JSON object. There is nowhere
 *   to put where a value came from, how confident its producer was, or what it
 *   replaces, because the unit of review is the call.
 * - **No previous values.** Nothing here reads the record being written to, so a
 *   reviewer cannot see that `plan` is moving from `starter` to `pro` — only that
 *   the call carries `"pro"`.
 * - **No amendment.** The vocabulary is `approve | reject`. A reviewer who would
 *   say "yes, but bill on the 31st" has to reject and let a corrected call be made,
 *   and the corrected call is a fresh proposal that looks exactly like one the agent
 *   made unaided.
 * - **No expiry.** A call nobody answers leaves nothing behind: the record is
 *   written when a decision is made, so an abandoned proposal is not a state, it is
 *   an absence.
 * - **No attestation beyond a string.** {@link WholeCallRecord.by} is free text. It
 *   can say `"ana"`, or `"allowlist"`, or anything at all, and nothing distinguishes
 *   a person who was present from a rule that fired with nobody there.
 *
 * Nothing in this file is a criticism. It is the control the rest of the sample is
 * measured against.
 *
 * @packageDocumentation
 */

/** Any value that survives a round trip through JSON — what a tool's arguments are. */
export type JsonBlob =
  null | boolean | number | string | readonly JsonBlob[] | { readonly [key: string]: JsonBlob };

/** The two things a reviewer can say about a whole call. */
export type Answer = "approve" | "reject";

/** One decided call, as this gate records it. */
export interface WholeCallRecord {
  /** The tool the call was for. */
  readonly tool: string;
  /** The arguments, exactly as the call carried them. */
  readonly args: JsonBlob;
  /** What the reviewer said. */
  readonly decision: Answer;
  /**
   * Who said it, as free text.
   *
   * A string, and only a string: there is no kind, no policy id and no version, so
   * a record cannot distinguish a person who reviewed the call from a rule that
   * approved it with nobody present.
   */
  readonly by: string;
  /** When, as an ISO 8601 instant. */
  readonly at: string;
}

/** What one call to {@link WholeCallGate.proposeCall} produced. */
export interface WholeCallOutcome {
  /** The blob the reviewer was shown, verbatim. */
  readonly shown: string;
  /** The row that went into the log. */
  readonly record: WholeCallRecord;
}

/** A whole-call approval gate: show the call, take a yes or a no, write it down. */
export class WholeCallGate {
  readonly #log: WholeCallRecord[] = [];

  /** The call as the reviewer sees it: the tool's name and its raw arguments, as JSON. */
  present(toolName: string, args: JsonBlob): string {
    return JSON.stringify({ tool: toolName, args }, null, 2);
  }

  /** Show the call, take the answer, record it. */
  proposeCall(
    toolName: string,
    args: JsonBlob,
    decision: Answer,
    by: string,
    at: string,
  ): WholeCallOutcome {
    const shown = this.present(toolName, args);
    const record: WholeCallRecord = { tool: toolName, args, decision, by, at };
    this.#log.push(record);
    return { shown, record };
  }

  /** Everything decided so far, in order. */
  get records(): readonly WholeCallRecord[] {
    return this.#log;
  }
}
