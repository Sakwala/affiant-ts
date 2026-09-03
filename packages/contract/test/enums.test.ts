import { describe, expect, it } from "vitest";

import {
  ACTION_DECISION_OUTCOMES,
  ACTION_STATUSES,
  AFFIDAVIT_FIELD_KINDS,
  PROVENANCE_SOURCES,
  SYSTEM_NOTIFICATION_LEVELS,
  isProvenanceSource,
} from "../src/index.js";
import { affidavitFieldSchema, provenanceSourceSchema } from "../src/schemas.js";
import { enumValues } from "./fixtures.generated.js";

/**
 * The protocol pins its closed string sets as data precisely so an implementation
 * can check its own literals against the same list rather than retyping them. If
 * one of these fails, the union in `src/index.ts` has drifted from the tag.
 */
describe("the exported value sets match the protocol's pinned sets", () => {
  it("provenance sources, in the determinism order the schema defines", () => {
    expect([...PROVENANCE_SOURCES]).toEqual([...enumValues.provenanceSource]);
    expect(provenanceSourceSchema["enum"]).toEqual([...PROVENANCE_SOURCES]);
  });

  it("action decision outcomes", () => {
    expect([...ACTION_DECISION_OUTCOMES]).toEqual([...enumValues.actionDecisionResultOutcome]);
  });

  it("action statuses", () => {
    expect([...ACTION_STATUSES]).toEqual([...enumValues.getActionStatusesValue]);
  });

  it("system notification levels", () => {
    expect([...SYSTEM_NOTIFICATION_LEVELS]).toEqual([...enumValues.systemNotificationLevel]);
  });

  it("affidavit field kinds, taken from the field schema rather than retyped", () => {
    const properties = affidavitFieldSchema["properties"] as Record<string, unknown>;
    const kind = properties["kind"] as Record<string, unknown>;
    expect(kind["enum"]).toEqual([...AFFIDAVIT_FIELD_KINDS]);
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
