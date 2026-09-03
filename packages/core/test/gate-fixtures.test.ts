import { describe, expect, it } from "vitest";

import { PROTOCOL_VERSION } from "@affiant/contract";

import { InMemoryDocketStore } from "../src/docket/memory.js";
import type { UncoveredCategory } from "../src/gate/coverage.js";
import { createGate } from "../src/gate/gate.js";
import type { FiledEntry, PreparedField } from "../src/gate/pipeline.js";
import type { ApprovalPolicy, Verdict } from "../src/gate/policy.js";
import { isAffiantError } from "../src/errors.js";
import type { JsonValue } from "../src/model/affidavit.js";
import { chainOf, mintTag } from "../src/model/provenance.js";
import type { ProvenanceSource } from "../src/model/provenance.js";
import type { TurnContext } from "../src/context.js";
import type { FieldSchema, Operation, StructuredField } from "../src/ports.js";

import { gateFixtures } from "./fixtures/gate.generated.js";
import {
  inferencePort,
  permissiveAuthorization,
  plus,
  projectionPort,
  riskScorer,
  stubClock,
  telemetryLog,
} from "./gate-support.js";

/**
 * The declarative gate fixtures, run against the real gate.
 *
 * The files under `test/fixtures/gate/` are the record — `{ id, rules, note, given,
 * expect }`, the shape the design record fixes and the shape B-20 promotes into the
 * protocol's own conformance suite. This runner is the only thing that reads them, and
 * it does nothing a host could not do: build a gate from the wiring the fixture
 * describes, file the proposal it describes, and check what came back.
 *
 * Two rules are checked by hand-written suites instead, because neither fits a
 * declarative fixture: GT-2 needs two turns actually interleaved
 * (`gate-scope.test.ts`), and GT-6 needs a spy on a function that must never be called
 * (`gate-coverage.test.ts`).
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
  readonly toolName: string;
  readonly operation: Operation;
  readonly schema: FieldSchema | null;
  readonly inference: { readonly fields: Record<string, StructuredField> } | null;
  readonly preparedFields: readonly PreparedFieldFixture[] | null;
  readonly previousValues: Record<string, JsonValue> | null;
  readonly policies: readonly PolicyFixture[];
  readonly riskScore: number | null;
  readonly declareUncovered: UncoveredCategory | null;
  readonly defaultTtlMs: number;
}

interface PreparedFieldFixture {
  readonly name: string;
  readonly kind: "text" | "number" | "date" | "enum";
  readonly value: JsonValue;
  readonly provenance: {
    readonly source: ProvenanceSource;
    readonly confidence: number;
    readonly bound: boolean;
  } | null;
}

interface PolicyFixture {
  readonly id: string;
  readonly version: string;
  readonly declaredInputs: readonly ProvenanceSource[];
  readonly declaresThreshold: boolean;
  readonly defaultTtlMs: number | null;
  readonly verdict: Verdict | null;
}

interface Expect {
  readonly error: { readonly code: string; readonly messageContains?: string } | null;
  readonly entry: {
    readonly status: string;
    readonly requirement: string;
    readonly execution: string | null;
    readonly blocked: Record<string, string> | null;
    readonly expiresAtOffsetMs: number;
    readonly attestation: {
      readonly kind: string;
      readonly policyId: string;
      readonly version: string;
    } | null;
  } | null;
  readonly affidavit: {
    readonly operationType: string;
    readonly entityId: string | null;
    readonly aggregateConfidence: number;
    readonly populatedConfidence: number | null;
    readonly emptyFieldCount: number;
    readonly fields: readonly {
      readonly name: string;
      readonly value: JsonValue;
      readonly previousValue: JsonValue | null;
      readonly source: ProvenanceSource;
      readonly bound: boolean;
    }[];
  } | null;
  readonly card: { readonly warningsContain?: readonly string[] } | null;
}

// ---------------------------------------------------------------------------
// Building a gate from a fixture
// ---------------------------------------------------------------------------

/** The `external-ref` binding a bound fixture tag carries. */
const BOUND = {
  kind: "external-ref",
  ref: { system: "billing", recordId: "invoice-1" },
} as const;

function turnOf(given: Given): TurnContext {
  return {
    tenantId: given.ctx.tenantId,
    conversationId: given.ctx.conversationId,
    channel: given.ctx.channel,
    principal: { kind: "member", id: "member-1" },
    turn: { utterance: given.ctx.utterance, messageId: given.ctx.messageId, at: given.ctx.at },
  };
}

function policyOf(fixture: PolicyFixture): ApprovalPolicy {
  return {
    id: fixture.id,
    version: fixture.version,
    declaredInputs: fixture.declaredInputs,
    declaresThreshold: fixture.declaresThreshold,
    ...(fixture.defaultTtlMs === null ? {} : { defaultTtlMs: fixture.defaultTtlMs }),
    async evaluate() {
      return fixture.verdict;
    },
  };
}

function preparedOf(fixture: PreparedFieldFixture, at: string): PreparedField {
  return {
    name: fixture.name,
    kind: fixture.kind,
    value: fixture.value,
    ...(fixture.provenance === null
      ? {}
      : {
          provenance: chainOf(
            mintTag({
              source: fixture.provenance.source,
              confidence: fixture.provenance.confidence,
              at,
              ...(fixture.provenance.bound ? { binding: BOUND } : {}),
            }),
          ),
        }),
  };
}

/** Wire a gate from `given` and file its proposal. */
async function run(given: Given): Promise<FiledEntry> {
  const clock = stubClock(given.ctx.at);
  const telemetry = telemetryLog();
  const gate = createGate({
    store: new InMemoryDocketStore({ clock }),
    inference: inferencePort(given.inference?.fields ?? {}),
    projection: projectionPort(given.previousValues),
    authorization: permissiveAuthorization,
    policies: given.policies.map(policyOf),
    clock,
    telemetry: telemetry.port,
    defaultTtlMs: given.defaultTtlMs,
    ...(given.riskScore === null ? {} : { riskScorer: riskScorer(given.riskScore) }),
  });

  if (given.declareUncovered !== null) {
    gate.declareUncovered({ name: given.toolName }, given.declareUncovered);
  }

  return gate.file(
    {
      operation: given.operation,
      toolName: given.toolName,
      args: null,
      ...(given.preparedFields === null
        ? {}
        : { fields: given.preparedFields.map((field) => preparedOf(field, given.ctx.at)) }),
      ...(given.schema === null ? {} : { schema: given.schema }),
    },
    turnOf(given),
  );
}

// ---------------------------------------------------------------------------
// The suite
// ---------------------------------------------------------------------------

describe("the gate fixtures", () => {
  it("has fixtures to run", () => {
    expect(gateFixtures.length).toBeGreaterThanOrEqual(16);
  });

  it("gives every fixture an id, a rule citation and a note", () => {
    for (const fixture of gateFixtures) {
      expect(fixture.id, fixture.id).toMatch(/^gate\//);
      expect(fixture.rules.length, fixture.id).toBeGreaterThan(0);
      expect(fixture.note.length, fixture.id).toBeGreaterThan(0);
    }
  });

  it("cites every rule this pull request claims", () => {
    const cited = new Set(gateFixtures.flatMap((fixture) => fixture.rules));
    for (const rule of ["GT-3", "GT-4", "GT-5", "AZ-1", "AZ-4", "PV-3", "PV-4", "CV-4", "AF-3"]) {
      expect(cited.has(rule), `no fixture cites ${rule}`).toBe(true);
    }
  });
});

describe.each(gateFixtures.map((fixture) => [fixture.id, fixture] as const))(
  "%s",
  (_id, fixture) => {
    const given = fixture.given as unknown as Given;
    const expected = fixture.expect as unknown as Expect;

    it(fixture.note, async () => {
      if (expected.error !== null) {
        let thrown: unknown;
        try {
          await run(given);
        } catch (error) {
          thrown = error;
        }
        expect(isAffiantError(thrown), "an AffiantError was expected").toBe(true);
        expect((thrown as { code: string }).code).toBe(expected.error.code);
        if (expected.error.messageContains !== undefined) {
          expect((thrown as Error).message).toContain(expected.error.messageContains);
        }
        return;
      }

      const filed = await run(given);

      if (expected.entry !== null) {
        expect(filed.entry.status).toBe(expected.entry.status);
        expect(filed.entry.requirement).toBe(expected.entry.requirement);
        expect(filed.entry.execution).toBe(expected.entry.execution);
        expect(filed.entry.blocked).toEqual(expected.entry.blocked);
        expect(filed.entry.expiresAt).toBe(plus(given.ctx.at, expected.entry.expiresAtOffsetMs));
        if (expected.entry.attestation === null) {
          expect(filed.entry.attestation).toBeNull();
        } else {
          expect(filed.entry.attestation).toEqual({
            by: {
              kind: expected.entry.attestation.kind,
              policyId: expected.entry.attestation.policyId,
              version: expected.entry.attestation.version,
            },
            at: given.ctx.at,
            entryId: filed.entry.entryId,
          });
        }
      }

      if (expected.affidavit !== null) {
        const sworn = filed.entry.affidavit;
        expect(sworn.operationType).toBe(expected.affidavit.operationType);
        expect(sworn.entityId).toBe(expected.affidavit.entityId);
        expect(sworn.aggregateConfidence).toBe(expected.affidavit.aggregateConfidence);
        expect(sworn.populatedConfidence).toBe(expected.affidavit.populatedConfidence);
        expect(sworn.emptyFieldCount).toBe(expected.affidavit.emptyFieldCount);
        expect(
          sworn.fields.map((field) => ({
            name: field.name,
            value: field.value,
            previousValue: field.previousValue,
            source: field.provenance.current.source,
            bound: field.provenance.current.binding != null,
          })),
        ).toEqual(expected.affidavit.fields);
      }

      // SR-4 holds for every filed fixture, not only the ones that mention it.
      expect(filed.card.protocolVersion).toBe(PROTOCOL_VERSION);
      expect(filed.card.docketId).toBe(filed.entry.entryId);
      expect(filed.card.requiredBy).toBe(filed.entry.expiresAt);

      for (const phrase of expected.card?.warningsContain ?? []) {
        expect(filed.card.affidavit.warnings.join(" ")).toContain(phrase);
      }
    });
  },
);
