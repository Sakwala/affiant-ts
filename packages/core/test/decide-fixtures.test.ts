import { describe, expect, it } from "vitest";

import type { Principal, TurnContext } from "../src/context.js";
import type { DocketEntry } from "../src/docket/entry.js";
import { InMemoryDocketStore, InMemorySessionStore } from "../src/docket/memory.js";
import { isAffiantError } from "../src/errors.js";
import type { Decision } from "../src/gate/decide.js";
import { createGate } from "../src/gate/gate.js";
import type { FiledEntry, PreparedField } from "../src/gate/pipeline.js";
import type { ApprovalPolicy } from "../src/gate/policy.js";
import type { JsonValue } from "../src/model/affidavit.js";
import type { AmendmentMap } from "../src/model/amendments.js";
import { chainOf, mintTag } from "../src/model/provenance.js";
import type { ProvenanceSource } from "../src/model/provenance.js";
import type { ExecutionOutcome } from "../src/docket/entry.js";
import type { Operation } from "../src/ports.js";

import { decideFixtures } from "./fixtures/decide.generated.js";
import {
  decliningAuthorization,
  inferencePort,
  permissiveAuthorization,
  projectionPort,
  stubClock,
  telemetryLog,
} from "./gate-support.js";

/**
 * The declarative decision fixtures, run against the real gate.
 *
 * The files under `test/fixtures/decide/` are the record — `{ id, rules, note, given,
 * expect }`, the shape the design record fixes and the shape B-20 promotes into the
 * protocol's own conformance suite. Each names a filing, an ordered list of acts
 * performed on it, and what each act and the resulting row must be.
 *
 * What is *not* here is what a fixture cannot state: a spy proving the Docket was
 * never read (AZ-2), two decisions actually racing (DK-1), rehydration order through
 * the gate (DK-5), and the type-level half of AZ-3 and AZ-7. Those live in
 * `test/gate-decide.test.ts` and `test/decide-types.test-d.ts`.
 */

// ---------------------------------------------------------------------------
// The fixture shape, as this runner reads it
// ---------------------------------------------------------------------------

interface Given {
  readonly ctx: {
    readonly tenantId: string;
    readonly conversationId: string;
    readonly channel: string;
    readonly utterance: string;
    readonly messageId: string;
    readonly at: string;
  };
  /** What the host's authorization port answers for every principal (AZ-2). */
  readonly authorization: boolean;
  readonly filing: {
    readonly toolName: string;
    readonly operation: Operation;
    readonly preparedFields: readonly PreparedFieldFixture[];
    readonly policy: PolicyFixture | null;
    readonly defaultTtlMs: number;
  };
  readonly acts: readonly Act[];
}

interface PreparedFieldFixture {
  readonly name: string;
  readonly kind: "text" | "number" | "date" | "enum";
  readonly value: JsonValue;
  readonly provenance: { readonly source: ProvenanceSource; readonly confidence: number };
}

interface PolicyFixture {
  readonly id: string;
  readonly version: string;
  readonly requirement:
    "StandingOrder" | "ReviewerConfirmation" | "ReferralRequired" | "MultiParty";
}

interface Act {
  readonly kind: "decide" | "mark-executed" | "resubmit";
  readonly at: string;
  readonly principal: Principal | null;
  /** The tenant the act is performed from, when it is not the filing's (AZ-2). */
  readonly tenantId: string | null;
  readonly decision: {
    readonly kind: "approve" | "reject";
    readonly amendments: AmendmentMap | null;
    readonly reason: string | null;
  } | null;
  readonly outcome: Exclude<ExecutionOutcome, "unexecuted"> | null;
  readonly detail: string | null;
}

interface FieldExpectation {
  readonly name: string;
  readonly value: JsonValue;
  readonly source: ProvenanceSource;
  readonly bound: boolean;
}

interface Expect {
  readonly acts: readonly { readonly error: { readonly code: string } | null }[];
  readonly entry: {
    readonly status: string;
    readonly execution: string | null;
    readonly requirement: string;
    readonly blocked: Record<string, string> | null;
    readonly attestation: Record<string, unknown> | null;
    readonly amendments: AmendmentMap | null;
    readonly decision: { readonly kind: string; readonly reason: string | null } | null;
    readonly supersededByFresh: boolean;
    readonly affidavit: {
      readonly aggregateConfidence: number;
      readonly populatedConfidence: number | null;
      readonly emptyFieldCount: number;
      readonly fields: readonly FieldExpectation[];
    };
  } | null;
  readonly resubmission: {
    readonly status: string;
    readonly execution: string | null;
    readonly supersedesOriginal: boolean;
    readonly priorAmendments: AmendmentMap | null;
    readonly fields: readonly FieldExpectation[];
  } | null;
}

// ---------------------------------------------------------------------------
// Running one fixture
// ---------------------------------------------------------------------------

/** What one fixture run produced: the refusals, the original row, the resubmission. */
interface Run {
  readonly codes: readonly (string | null)[];
  readonly entry: DocketEntry | null;
  readonly resubmission: FiledEntry | null;
}

function turnOf(
  given: Given,
  at: string,
  principal: Principal | null,
  tenantId: string,
): TurnContext {
  return {
    tenantId,
    conversationId: given.ctx.conversationId,
    channel: given.ctx.channel,
    principal,
    turn: { utterance: given.ctx.utterance, messageId: given.ctx.messageId, at },
  };
}

function policyOf(fixture: PolicyFixture): ApprovalPolicy {
  return {
    id: fixture.id,
    version: fixture.version,
    declaredInputs: [],
    declaresThreshold: false,
    async evaluate() {
      return { requirement: fixture.requirement };
    },
  };
}

function preparedOf(fixture: PreparedFieldFixture, at: string): PreparedField {
  return {
    name: fixture.name,
    kind: fixture.kind,
    value: fixture.value,
    provenance: chainOf(
      mintTag({ source: fixture.provenance.source, confidence: fixture.provenance.confidence, at }),
    ),
  };
}

function decisionOf(act: Act): Decision {
  const stated = act.decision;
  if (stated === null) throw new Error(`fixture act ${act.kind} carries no decision`);
  if (stated.kind === "reject") {
    return { kind: "reject", reason: stated.reason ?? "" };
  }
  return {
    kind: "approve",
    ...(stated.amendments === null ? {} : { amendments: stated.amendments }),
    ...(stated.reason === null ? {} : { reason: stated.reason }),
  };
}

/** The fields as the expectations describe them: value, grade, and whether it is bound. */
function shapeOf(entry: DocketEntry): FieldExpectation[] {
  return entry.affidavit.fields.map((field) => ({
    name: field.name,
    value: field.value,
    source: field.provenance.current.source,
    bound: field.provenance.current.binding !== null,
  }));
}

async function run(given: Given): Promise<Run> {
  const clock = stubClock(given.ctx.at);
  const store = new InMemoryDocketStore({ clock });
  const telemetry = telemetryLog();
  const gate = createGate({
    store,
    sessions: new InMemorySessionStore(store),
    inference: inferencePort({}),
    projection: projectionPort(null),
    authorization: given.authorization ? permissiveAuthorization : decliningAuthorization,
    policies: given.filing.policy === null ? [] : [policyOf(given.filing.policy)],
    clock,
    telemetry: telemetry.port,
    defaultTtlMs: given.filing.defaultTtlMs,
  });

  const filedBy: Principal = { kind: "member", id: "filer" };
  const filed = await gate.file(
    {
      operation: given.filing.operation,
      toolName: given.filing.toolName,
      fields: given.filing.preparedFields.map((field) => preparedOf(field, given.ctx.at)),
      args: null,
    },
    turnOf(given, given.ctx.at, filedBy, given.ctx.tenantId),
  );
  const entryId = filed.entry.entryId;

  const codes: (string | null)[] = [];
  let resubmission: FiledEntry | null = null;

  for (const act of given.acts) {
    clock.set(act.at);
    const ctx = turnOf(given, act.at, act.principal, act.tenantId ?? given.ctx.tenantId);
    try {
      if (act.kind === "decide") {
        await gate.decide(entryId, decisionOf(act), ctx);
      } else if (act.kind === "mark-executed") {
        await gate.markExecuted(entryId, act.outcome ?? "executed", act.detail, ctx);
      } else {
        resubmission = await gate.resubmit(entryId, ctx);
      }
      codes.push(null);
    } catch (error) {
      if (!isAffiantError(error)) throw error;
      codes.push(error.code);
    }
  }

  return {
    codes,
    entry: await store.get(entryId, { tenantId: given.ctx.tenantId }),
    resubmission,
  };
}

// ---------------------------------------------------------------------------
// The suite
// ---------------------------------------------------------------------------

describe("the decision fixtures", () => {
  it("has fixtures to run", () => {
    expect(decideFixtures.length).toBeGreaterThanOrEqual(16);
  });

  it("gives every fixture an id, a rule citation and a note", () => {
    for (const fixture of decideFixtures) {
      expect(fixture.id, fixture.id).toMatch(/^decide\//);
      expect(fixture.rules.length, fixture.id).toBeGreaterThan(0);
      expect(fixture.note.length, fixture.id).toBeGreaterThan(20);
    }
  });

  it("cites every rule this pull request claims a fixture for", () => {
    const cited = new Set(decideFixtures.flatMap((fixture) => fixture.rules));
    for (const rule of [
      "AZ-1",
      "AZ-2",
      "AZ-3",
      "AZ-4",
      "AZ-5",
      "AZ-6",
      "AZ-7",
      "DK-1",
      "DK-2",
      "AF-4",
      "PV-2",
    ]) {
      expect(cited.has(rule), `no decision fixture cites ${rule}`).toBe(true);
    }
  });
});

describe.each(decideFixtures.map((fixture) => [fixture.id, fixture] as const))(
  "%s",
  (_id, fixture) => {
    const given = fixture.given as unknown as Given;
    const expected = fixture.expect as unknown as Expect;

    it(fixture.note, async () => {
      const result = await run(given);

      expect(result.codes).toEqual(expected.acts.map((act) => act.error?.code ?? null));

      if (expected.entry !== null) {
        const entry = result.entry;
        expect(entry, "the entry is gone").not.toBeNull();
        if (entry === null) return;

        expect(entry.status).toBe(expected.entry.status);
        expect(entry.execution).toBe(expected.entry.execution);
        expect(entry.requirement).toBe(expected.entry.requirement);
        expect(entry.blocked).toEqual(expected.entry.blocked);
        expect(entry.amendments).toEqual(expected.entry.amendments);

        if (expected.entry.attestation === null) {
          expect(entry.attestation).toBeNull();
        } else {
          expect(entry.attestation?.by).toEqual(expected.entry.attestation);
          expect(entry.attestation?.entryId).toBe(entry.entryId);
        }

        if (expected.entry.decision === null) {
          expect(entry.decision).toBeNull();
        } else {
          expect(entry.decision?.kind).toBe(expected.entry.decision.kind);
          expect(entry.decision?.reason).toBe(expected.entry.decision.reason);
        }

        expect(entry.affidavit.aggregateConfidence).toBe(
          expected.entry.affidavit.aggregateConfidence,
        );
        expect(entry.affidavit.populatedConfidence).toBe(
          expected.entry.affidavit.populatedConfidence,
        );
        expect(entry.affidavit.emptyFieldCount).toBe(expected.entry.affidavit.emptyFieldCount);
        expect(shapeOf(entry)).toEqual(expected.entry.affidavit.fields);

        if (expected.entry.supersededByFresh) {
          expect(entry.lineage.supersededBy).toBe(result.resubmission?.entry.entryId);
        } else {
          expect(entry.lineage.supersededBy).toBeNull();
        }
      }

      if (expected.resubmission !== null) {
        const fresh = result.resubmission;
        expect(fresh, "nothing was resubmitted").not.toBeNull();
        if (fresh === null) return;

        expect(fresh.entry.status).toBe(expected.resubmission.status);
        expect(fresh.entry.execution).toBe(expected.resubmission.execution);
        expect(fresh.entry.entryId).not.toBe(result.entry?.entryId);
        expect(fresh.entry.lineage.supersedes).toBe(
          expected.resubmission.supersedesOriginal ? (result.entry?.entryId ?? null) : null,
        );
        expect(fresh.card.priorAmendments).toEqual(expected.resubmission.priorAmendments);
        expect(shapeOf(fresh.entry)).toEqual(expected.resubmission.fields);
      }
    });
  },
);
