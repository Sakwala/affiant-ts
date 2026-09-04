import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";

import type { CardFieldView, RowView } from "../src/affiant.js";
import type { ActResult, DeckResult } from "../src/deck.js";
import { renderTranscript, runDeck } from "../src/deck.js";

/**
 * The four acts, asserted one at a time on both surfaces, and the README's recorded
 * transcript asserted against the run that produced it.
 *
 * The deck is only worth publishing if the difference it claims is a difference in
 * the *records*, not in the prose around them. So the assertions here read the
 * structured result rather than the transcript: a whole-call row carries a tool
 * name, an arguments blob, a verb, a string and an instant — and nothing per field —
 * while the Affiant row carries a provenance tag per field, the reviewer's
 * correction as an act bound to the decision that made it (DK-1, PV-2), a Standing
 * Order that did not fire because a required field had no value (GT-5), and an
 * expired entry whose successor names it (DK-1).
 *
 * Node-only: the last suite reads `README.md` off disk. The sample runs in the Node
 * job; the runtime-neutral packages are the ones CI also runs on Bun and workerd.
 */

const sampleRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

/** The act numbered `n`, or a failure naming what was there instead. */
function act(result: DeckResult, n: number): ActResult {
  const found = result.acts.find((candidate) => candidate.act === n);
  if (found === undefined) throw new Error(`no act ${String(n)} in the run`);
  return found;
}

/** The field named `name` among `fields`. */
function fieldOf(fields: readonly CardFieldView[], name: string): CardFieldView {
  const found = fields.find((field) => field.name === name);
  if (found === undefined) throw new Error(`no field ${name}`);
  return found;
}

/** The row whose id is `entryId`. */
function rowOf(rows: readonly RowView[], entryId: string): RowView {
  const found = rows.find((row) => row.entryId === entryId);
  if (found === undefined) throw new Error(`no row ${entryId}`);
  return found;
}

let result: DeckResult;

beforeAll(async () => {
  result = await runDeck();
});

describe("the deck", () => {
  it("runs four acts on one scenario, in order", () => {
    expect(result.acts.map((each) => each.act)).toEqual([1, 2, 3, 4]);
    expect(result.at).toBe("2026-09-04T09:00:00.000Z");
  });

  it("never calls a write tool's own execute (GT-6)", () => {
    expect(result.hostWrites).toBe(0);
    expect(result.summary).toContain("0 host writes executed");
  });

  it("produces the same run twice, which is what makes the transcript recordable", async () => {
    expect(await runDeck()).toEqual(result);
  });

  it("cites a rule id on every act and on every closing difference", () => {
    for (const each of result.acts) expect(each.rules.length).toBeGreaterThan(0);
    for (const difference of result.differences) {
      expect(difference.rules.length).toBeGreaterThan(0);
    }
    // The five the acts are built around, each named by at least one act.
    const cited = new Set(result.acts.flatMap((each) => each.rules));
    for (const rule of ["AF-2", "AF-3", "GT-5", "DK-1", "AZ-1"]) expect(cited).toContain(rule);
  });
});

describe("act 1 - the agent proposes four changes", () => {
  it("records nothing at all on the whole-call baseline", () => {
    // The first structural difference, and the cheapest to check: a gate whose row
    // is written on decision has no state for a proposal awaiting one.
    expect(act(result, 1).baseline.records).toEqual([]);
  });

  it("files one Docket entry carrying a provenance tag per field (AF-1, AF-2, AF-3)", () => {
    const first = act(result, 1);
    const [card] = first.affiant.cards;
    const [row] = first.affiant.rows;
    if (card === undefined || row === undefined) throw new Error("act 1 filed nothing");

    expect(row.status).toBe("pending");
    expect(row.requirement).toBe("ReviewerConfirmation");
    expect(card.entityId).toBe("C-1042");
    expect(card.fields.map((field) => field.name)).toEqual([
      "email",
      "plan",
      "billingDay",
      "phone",
    ]);

    // AF-3: an update swears to what it replaces, per field.
    expect(fieldOf(card.fields, "plan").previousValue).toBe("starter");
    expect(fieldOf(card.fields, "plan").value).toBe("pro");
    expect(fieldOf(card.fields, "email").previousValue).toBe("ana.silva@oldmail.example");

    // The value the customer typed is graded Conversation and points at the span it
    // was read from; the two the model reasoned to are Inferred and point at nothing.
    const email = fieldOf(card.fields, "email");
    expect(email.source).toBe("Conversation");
    expect(email.bound).toBe(true);
    expect(email.bindingKind).toBe("utterance-span");
    expect(fieldOf(card.fields, "plan").source).toBe("Inferred");
    expect(fieldOf(card.fields, "plan").confidence).toBe(0.8);
    expect(fieldOf(card.fields, "billingDay").source).toBe("Inferred");
    expect(fieldOf(card.fields, "billingDay").confidence).toBe(0.4);

    // AF-1: the field nobody filled is present and tagged, never dropped.
    const phone = fieldOf(card.fields, "phone");
    expect(phone.source).toBe("Empty");
    expect(phone.confidence).toBe(0);
    expect(phone.isMandatory).toBe(true);

    // AF-2: the minimum with Empty counting as zero, the minimum over the populated
    // fields, and the count of the empty ones.
    expect(card.confidence).toEqual({ aggregate: 0, populated: 0.4, emptyFieldCount: 1 });
  });

  it("puts nothing per field on the baseline's record shape", () => {
    // Not an absence of effort: the shape has five properties and none of them is a
    // field. Asserted on act 2's rows, which are the first the baseline writes.
    const [record] = act(result, 2).baseline.records;
    if (record === undefined) throw new Error("act 2 recorded nothing");
    expect(Object.keys(record).sort()).toEqual(["args", "at", "by", "decision", "tool"]);
  });
});

describe("act 2 - the reviewer changes one value", () => {
  it("costs the baseline a rejection and a fresh call that looks unaided", () => {
    const records = act(result, 2).baseline.records;
    expect(records.map((record) => record.decision)).toEqual(["reject", "approve"]);

    const [rejected, approved] = records;
    if (rejected === undefined || approved === undefined) throw new Error("act 2 recorded nothing");
    // The corrected call is byte-identical in shape to one the agent could have made
    // on its own: nothing on the row says a person chose 31.
    expect(approved.args).toEqual({ email: "ana.silva@example.net", plan: "pro", billingDay: 31 });
    expect(Object.keys(approved)).not.toContain("amendments");
    expect(approved.by).toBe("ana");
    expect(rejected.by).toBe("ana");
  });

  it("records the amendment as the reviewer's own act, over the machine's tag (DK-1, PV-2)", () => {
    const [row] = act(result, 2).affiant.rows;
    if (row === undefined) throw new Error("act 2 has no row");

    expect(row.status).toBe("approved");
    expect(row.amendments).toEqual({ billingDay: 31 });

    // DK-4: the proposal is kept, unedited, beside the state the approval accepted.
    expect(fieldOf(row.proposedFields, "billingDay").value).toBe(28);
    expect(fieldOf(row.proposedFields, "billingDay").source).toBe("Inferred");

    const amended = fieldOf(row.amendedFields ?? [], "billingDay");
    expect(amended.value).toBe(31);
    expect(amended.source).toBe("UserStated");
    expect(amended.confidence).toBe(1);
    // PV-2: the tag points at the decision the correction was made on.
    expect(amended.bound).toBe(true);
    expect(amended.bindingKind).toBe("reviewer-act");
    // The machine's tag is displaced, never discarded.
    expect(amended.priorSources).toEqual(["Inferred"]);

    // AF-4: the three numbers are recomputed over the accepted state.
    expect(row.confidence.populated).toBe(0.4);
    expect(row.amendedConfidence?.populated).toBe(0.8);
    expect(row.amendedConfidence?.aggregate).toBe(0);
  });

  it("attests a person, by a kind rather than by a string (AZ-1)", () => {
    const [row] = act(result, 2).affiant.rows;
    if (row === undefined) throw new Error("act 2 has no row");
    expect(row.attestationKind).toBe("member");
    expect(row.attestationBy).toBe("ana");
    // AZ-7: nothing here executes, so the approved row is honestly unexecuted.
    expect(row.execution).toBe("unexecuted");
  });
});

describe("act 3 - a person-free approval meets a required field with no value", () => {
  it("approves on the baseline, attested by a string (AZ-1)", () => {
    const [record] = act(result, 3).baseline.records;
    if (record === undefined) throw new Error("act 3 recorded nothing");
    expect(record.decision).toBe("approve");
    // The whole of what this surface can say about who agreed.
    expect(record.by).toBe("allowlist");
    expect(typeof record.by).toBe("string");
    // The required field is not in the arguments, so no rule here could have seen it.
    expect(Object.keys(record.args as Record<string, unknown>)).toEqual(["email"]);
  });

  it("blocks the Standing Order and says why, in a code (GT-5)", () => {
    const third = act(result, 3);
    const [card] = third.affiant.cards;
    const [row] = third.affiant.rows;
    if (card === undefined || row === undefined) throw new Error("act 3 filed nothing");

    // The verdict degraded toward a person — the only direction AZ-4 permits.
    expect(row.status).toBe("pending");
    expect(row.requirement).toBe("ReviewerConfirmation");
    expect(row.attestationKind).toBeNull();

    const blocked = third.affiant.telemetry.find((line) => line.key === "standing-order.blocked");
    expect(blocked?.blockedReason).toBe("mandatory-field-empty");
    expect(blocked?.policyId).toBe("routine-contact-update");
    // A Standing Order that did not fire emits no `fired` event.
    expect(third.affiant.telemetry.map((line) => line.key)).not.toContain("standing-order.fired");

    // The hole is on the card, in the field it belongs to, with the rule named.
    expect(fieldOf(card.fields, "phone").source).toBe("Empty");
    expect(fieldOf(card.fields, "phone").isMandatory).toBe(true);
    expect(card.warnings.join(" ")).toContain("GT-5");
    expect(card.warnings.join(" ")).toContain("phone");
  });
});

describe("act 4 - nobody answers, and the proposal comes back", () => {
  it("gives the baseline one unrelated row and no trace of the first attempt", () => {
    const records = act(result, 4).baseline.records;
    expect(records).toHaveLength(1);
    expect(records[0]?.at).toBe("2026-09-04T09:55:00.000Z");
    // Nothing on the row could say a first attempt existed: there is no such property.
    expect(Object.keys(records[0] ?? {}).sort()).toEqual(["args", "at", "by", "decision", "tool"]);
  });

  it("reads expired with no sweep run, and the resubmission names what it supersedes (DK-1)", () => {
    const fourth = act(result, 4);
    const [lapsed, superseded, resubmitted] = fourth.affiant.rows;
    if (lapsed === undefined || superseded === undefined || resubmitted === undefined) {
      throw new Error("act 4 has no rows");
    }

    // Expiry is a queryable state: the deck never calls `expireDue`, and the entry
    // reads `expired` anyway because the deadline is applied on every read.
    expect(lapsed.status).toBe("expired");
    expect(lapsed.expiresAt).toBe("2026-09-04T09:50:00.000Z");
    expect(lapsed.attestationKind).toBeNull();

    // A resubmission is a new entry, and the lineage runs both ways.
    expect(resubmitted.entryId).not.toBe(lapsed.entryId);
    expect(resubmitted.status).toBe("pending");
    expect(resubmitted.lineage.supersedes).toBe(lapsed.entryId);
    expect(rowOf([superseded], lapsed.entryId).lineage.supersededBy).toBe(resubmitted.entryId);
    // The superseded row keeps its terminal state; nothing was reopened.
    expect(superseded.status).toBe("expired");
    // The deadline is stamped afresh from the pipeline that ran again.
    expect(resubmitted.expiresAt).toBe("2026-09-04T10:25:00.000Z");
  });
});

describe("the README's recorded transcript", () => {
  /** The fenced block between the transcript markers in `README.md`. */
  function recordedTranscript(): string {
    const readme = readFileSync(join(sampleRoot, "README.md"), "utf8");
    const between = /<!-- transcript:begin -->\s*```text\n([\s\S]*?)```\s*<!-- transcript:end -->/;
    const match = between.exec(readme);
    if (match === null) {
      throw new Error(
        "README.md has no transcript block; it must carry one fenced ```text block " +
          "between <!-- transcript:begin --> and <!-- transcript:end -->",
      );
    }
    return (match[1] ?? "").replace(/\n$/, "");
  }

  it("is exactly what this run prints", () => {
    // The drift guard. Edit the deck and the recorded transcript stops matching, so
    // the README cannot quietly describe a run that no longer happens.
    expect(recordedTranscript()).toBe(renderTranscript(result));
  });

  it("carries every act, both surfaces and the closing table", () => {
    const transcript = recordedTranscript();
    for (const each of result.acts) {
      expect(transcript).toContain(`Act ${String(each.act)}. ${each.title}`);
      for (const rule of each.rules) expect(transcript).toContain(rule);
    }
    expect(transcript).toContain("BASELINE - whole-call approval");
    expect(transcript).toContain("AFFIANT - the field-level gate");
    expect(transcript).toContain("what the reviewer saw");
    expect(transcript).toContain("what was recorded");
    for (const difference of result.differences) expect(transcript).toContain(difference.what);
    expect(transcript).toContain(`Summary: ${result.summary}`);
  });
});
