/**
 * The protocol seed fixture `wire/evidence-card-request`, as a TypeScript module.
 *
 * A copy, not the original: the original is
 * `packages/contract/protocol/fixtures/wire/evidence-card-request.json`, vendored
 * byte-for-byte from `Sakwala/affiant-protocol` at tag `v0.0.1-seed`.
 * `test/node/seed-fixture-copy.test.ts` reads that file off disk and asserts this
 * module is identical to it, so the copy cannot drift.
 *
 * Why a copy at all: this suite runs on Node, on Bun and inside workerd, and only
 * one of the three can read a file. A TypeScript module carrying the same data
 * loads identically everywhere — the same reason `@affiant/contract` generates its
 * own fixture module.
 *
 * What the fixture is: an update-shaped Affidavit on a `Widget`, with two proposed
 * fields. `Status` is `UserStated` at confidence 1.0 with **no stored value**
 * (`previousValue: null`, which AF-3 requires the key for on an update). `Weight`
 * is `Conversation` at 0.9, replacing a stored 10.0 with 12.5. Its
 * `aggregateConfidence` of 0.95 is the **mean** of the two, which is what the
 * shipped .NET projection computes; AF-2 makes it the **minimum**, 0.9.
 */
import type { SeedEvidenceCardRequest } from "@affiant/contract";

export const evidenceCardRequest = {
  docketId: "8f14e45f-ceea-467e-bd76-000000000001",
  affidavit: {
    operationType: "WriteUpdate",
    entityType: "Widget",
    entityId: "W-1",
    fields: [
      {
        name: "Status",
        value: "Active",
        previousValue: null,
        provenance: {
          current: {
            source: "UserStated",
            confidence: 1,
            evidence: "User stated: Status",
            conversationTurn: null,
          },
          prior: [],
        },
        isMandatory: true,
        kind: "enum",
        allowedValues: ["Active", "Retired"],
        pattern: null,
      },
      {
        name: "Weight",
        value: 12.5,
        previousValue: 10,
        provenance: {
          current: {
            source: "Conversation",
            confidence: 0.9,
            evidence: "Extracted from search_widget",
            conversationTurn: 3,
          },
          prior: [],
        },
        isMandatory: false,
        kind: "number",
        allowedValues: null,
        pattern: "^\\d+(\\.\\d+)?$",
      },
    ],
    aggregateConfidence: 0.95,
    warnings: [],
    requiresConfirmation: true,
  },
  requiredBy: "2026-08-01T00:00:00+00:00",
  priorAmendments: null,
} satisfies SeedEvidenceCardRequest;
