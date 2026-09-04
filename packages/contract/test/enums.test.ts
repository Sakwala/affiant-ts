import { describe, expect, it } from "vitest";

import {
  ACTION_DECISION_OUTCOMES,
  ACTION_STATUSES,
  AFFIDAVIT_FIELD_KINDS,
  BINDING_KINDS,
  COVERAGE_CATEGORIES,
  DECISION_OUTCOMES,
  DOCKET_STATUSES,
  ERROR_CODES,
  EXECUTION_OUTCOMES,
  OPERATIONS,
  PROVENANCE_SOURCES,
  REQUIREMENT_KINDS,
  SYSTEM_NOTIFICATION_LEVELS,
  isErrorCode,
  isProvenanceSource,
} from "../src/index.js";
import {
  affidavitFieldSchema,
  bindingSchema,
  blockedSchema,
  decisionResultSchema,
  docketEntrySchema,
  errorCodeSchema,
  operationSchema,
  provenanceSourceSchema,
} from "../src/schemas.js";
import { enumValues } from "./fixtures.generated.js";

/**
 * The protocol pins its closed string sets precisely so an implementation can check
 * its own literals against the same list rather than retyping them. If one of these
 * fails, a union in `src/index.ts` has drifted from the pinned ref.
 *
 * Every set below is read out of the vendored schema at the path the schema puts it
 * at, never retyped in this file — a check written against a second copy of the
 * list would pass for as long as both copies were wrong in the same way.
 */
function at(schema: unknown, ...path: readonly string[]): unknown {
  let cursor: unknown = schema;
  for (const step of path) {
    cursor = (cursor as Record<string, unknown>)[step];
  }
  return cursor;
}

describe("the exported value sets match the schemas they come from", () => {
  it("provenance sources, in the determinism order the schema defines", () => {
    expect(provenanceSourceSchema["enum"]).toEqual([...PROVENANCE_SOURCES]);
    expect([...PROVENANCE_SOURCES]).toEqual([...enumValues.provenanceSource]);
  });

  it("affidavit field kinds, taken from the field schema rather than retyped", () => {
    expect(at(affidavitFieldSchema, "properties", "kind", "enum")).toEqual([
      ...AFFIDAVIT_FIELD_KINDS,
    ]);
  });

  it("operation shapes: two, and they are shapes rather than the host's verbs", () => {
    expect(operationSchema["enum"]).toEqual([...OPERATIONS]);
  });

  it("refusal codes, in registry order — the order only ever grows at the end", () => {
    expect(errorCodeSchema["enum"]).toEqual([...ERROR_CODES]);
  });

  it("docket statuses: pending and the three terminal states", () => {
    expect(at(docketEntrySchema, "$defs", "status", "enum")).toEqual([...DOCKET_STATUSES]);
  });

  it("execution outcomes, a separate axis from status", () => {
    expect(at(docketEntrySchema, "$defs", "execution", "enum")).toEqual([...EXECUTION_OUTCOMES]);
  });

  it("requirement kinds, including the two v0.1 records and does not run", () => {
    expect(at(docketEntrySchema, "$defs", "requirementKind", "enum")).toEqual([
      ...REQUIREMENT_KINDS,
    ]);
  });

  it("coverage categories, from the blocked marker's coverage arm", () => {
    expect(at(blockedSchema, "$defs", "coverageRefused", "properties", "category", "enum")).toEqual(
      [...COVERAGE_CATEGORIES],
    );
  });

  it("decision outcomes, which the host hub's own set now matches", () => {
    expect(at(decisionResultSchema, "properties", "outcome", "enum")).toEqual([
      ...DECISION_OUTCOMES,
    ]);
    expect([...ACTION_DECISION_OUTCOMES]).toEqual([...enumValues.actionDecisionResultOutcome]);
    expect([...ACTION_DECISION_OUTCOMES]).toEqual([...DECISION_OUTCOMES]);
  });

  it("binding kinds, one per arm of the binding union", () => {
    const defs = bindingSchema["$defs"] as Record<string, unknown>;
    const kinds = (bindingSchema["oneOf"] as { $ref: string }[])
      .map((arm) => arm.$ref.replace("#/$defs/", ""))
      .map((name) => at(defs[name], "properties", "kind", "const"));

    expect(kinds).toEqual([...BINDING_KINDS]);
  });
});

describe("the host vocabulary sets match the protocol's pinned sets", () => {
  it("action statuses", () => {
    expect([...ACTION_STATUSES]).toEqual([...enumValues.getActionStatusesValue]);
  });

  it("system notification levels", () => {
    expect([...SYSTEM_NOTIFICATION_LEVELS]).toEqual([...enumValues.systemNotificationLevel]);
  });
});

describe("isProvenanceSource", () => {
  it("accepts every pinned source", () => {
    for (const source of PROVENANCE_SOURCES) {
      expect(isProvenanceSource(source)).toBe(true);
    }
  });

  it("rejects a near miss, a wrong case and a non-string", () => {
    expect(isProvenanceSource("userStated")).toBe(false);
    expect(isProvenanceSource("Unknown")).toBe(false);
    expect(isProvenanceSource(0)).toBe(false);
    expect(isProvenanceSource(null)).toBe(false);
  });
});

describe("isErrorCode", () => {
  it("accepts every registered code", () => {
    for (const code of ERROR_CODES) {
      expect(isErrorCode(code)).toBe(true);
    }
  });

  it("rejects a code the registry does not name", () => {
    // `tool-error` is a read tool's own body throwing, which is not a gate refusal
    // and is deliberately not in the registry.
    expect(isErrorCode("tool-error")).toBe(false);
    expect(isErrorCode("Substance-Refused")).toBe(false);
    expect(isErrorCode(null)).toBe(false);
  });
});
