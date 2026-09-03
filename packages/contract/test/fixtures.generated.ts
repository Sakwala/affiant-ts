// GENERATED FILE — DO NOT EDIT BY HAND.
// Produced by scripts/generate-sources.mjs from protocol/, which is a byte-for-byte
// copy of Sakwala/affiant-protocol at tag v0.0.1-seed.
// Source: protocol/fixtures/
// To change it: edit protocol/PIN, run `pnpm sync-protocol`, then `pnpm generate`.

/** Fixture `wire/evidence-card-request`. */
export const wireEvidenceCardRequest = {
  "docketId": "8f14e45f-ceea-467e-bd76-000000000001",
  "affidavit": {
    "operationType": "WriteUpdate",
    "entityType": "Widget",
    "entityId": "W-1",
    "fields": [
      {
        "name": "Status",
        "value": "Active",
        "previousValue": null,
        "provenance": {
          "current": {
            "source": "UserStated",
            "confidence": 1,
            "evidence": "User stated: Status",
            "conversationTurn": null
          },
          "prior": []
        },
        "isMandatory": true,
        "kind": "enum",
        "allowedValues": [
          "Active",
          "Retired"
        ],
        "pattern": null
      },
      {
        "name": "Weight",
        "value": 12.5,
        "previousValue": 10,
        "provenance": {
          "current": {
            "source": "Conversation",
            "confidence": 0.9,
            "evidence": "Extracted from search_widget",
            "conversationTurn": 3
          },
          "prior": []
        },
        "isMandatory": false,
        "kind": "number",
        "allowedValues": null,
        "pattern": "^\\d+(\\.\\d+)?$"
      }
    ],
    "aggregateConfidence": 0.95,
    "warnings": [],
    "requiresConfirmation": true
  },
  "requiredBy": "2026-08-01T00:00:00+00:00",
  "priorAmendments": null
} as const;

/** Fixture `wire/evidence-card-request-resubmission`. */
export const wireEvidenceCardRequestResubmission = {
  "docketId": "8f14e45f-ceea-467e-bd76-000000000005",
  "affidavit": {
    "operationType": "WriteUpdate",
    "entityType": "Widget",
    "entityId": "W-1",
    "fields": [
      {
        "name": "Status",
        "value": "Active",
        "previousValue": null,
        "provenance": {
          "current": {
            "source": "UserStated",
            "confidence": 1,
            "evidence": "User stated: Status",
            "conversationTurn": null
          },
          "prior": []
        },
        "isMandatory": true,
        "kind": "enum",
        "allowedValues": [
          "Active",
          "Retired"
        ],
        "pattern": null
      },
      {
        "name": "Weight",
        "value": 12.5,
        "previousValue": 10,
        "provenance": {
          "current": {
            "source": "Conversation",
            "confidence": 0.9,
            "evidence": "Extracted from search_widget",
            "conversationTurn": 3
          },
          "prior": []
        },
        "isMandatory": false,
        "kind": "number",
        "allowedValues": null,
        "pattern": "^\\d+(\\.\\d+)?$"
      }
    ],
    "aggregateConfidence": 0.95,
    "warnings": [],
    "requiresConfirmation": true
  },
  "requiredBy": "2026-08-01T00:00:00+00:00",
  "priorAmendments": {
    "Status": "Retired",
    "Weight": 15
  }
} as const;

/** Fixture `wire/docket-expiring`. */
export const wireDocketExpiring = {
  "docketId": "8f14e45f-ceea-467e-bd76-000000000002",
  "expiresAt": "2026-08-01T00:05:00+00:00"
} as const;

/** Fixture `wire/docket-expired`. */
export const wireDocketExpired = {
  "docketId": "8f14e45f-ceea-467e-bd76-000000000003"
} as const;

/** Fixture `wire/action-decision-result`. */
export const wireActionDecisionResult = {
  "actionId": "8f14e45f-ceea-467e-bd76-000000000004",
  "outcome": "approved",
  "amendmentsPreserved": false
} as const;

/** Fixture `wire/session-rehydrated`. */
export const wireSessionRehydrated = {
  "pendingDocketCount": 2
} as const;

/** Fixture `wire/guide-ui`. */
export const wireGuideUi = {
  "navigateTo": "/work-orders/new",
  "steps": [
    {
      "elementId": "aircraft-select",
      "title": "Select the aircraft",
      "description": "Choose the tail number this work order applies to.",
      "prefillValue": "N12345",
      "side": "bottom",
      "highlightPadding": 8
    },
    {
      "elementId": "title-input",
      "title": "Confirm the title",
      "description": "Review the auto-generated title before submitting.",
      "prefillValue": null,
      "side": "top",
      "highlightPadding": null
    }
  ],
  "context": "Pre-filled from the conversation: aircraft N12345, A-Check inspection."
} as const;

/** Fixture `wire/system-notification`. */
export const wireSystemNotification = {
  "level": "warning",
  "message": "Session expiring soon"
} as const;

/** Every fixture, keyed by its manifest id. */
export const fixtures = {
  "wire/evidence-card-request": wireEvidenceCardRequest,
  "wire/evidence-card-request-resubmission": wireEvidenceCardRequestResubmission,
  "wire/docket-expiring": wireDocketExpiring,
  "wire/docket-expired": wireDocketExpired,
  "wire/action-decision-result": wireActionDecisionResult,
  "wire/session-rehydrated": wireSessionRehydrated,
  "wire/guide-ui": wireGuideUi,
  "wire/system-notification": wireSystemNotification,
} as const;

/** `conformance/fixtures/MANIFEST.json` at the pinned tag. */
export const manifest = {
  "protocolVersion": "0.0.1-seed",
  "capturedFrom": {
    "framework": "Sakwala/affiant v1.0.0-beta.1 (b37e139)",
    "hosts": "Meridian and HR Portal, Sakwala/affiant-host-apps 966d6df",
    "date": "2026-09-04"
  },
  "fixtures": [
    {
      "id": "wire/evidence-card-request",
      "file": "wire/evidence-card-request.json",
      "kind": "affidavit-envelope",
      "schema": "schemas/evidence-card-request.schema.json",
      "schemaRelevant": true,
      "notes": "A first filing: an affidavit for an update to an existing entity, two fields, one of kind \"enum\" with an allowed-value set and one of kind \"number\" with a validation pattern and a previous value. priorAmendments is explicitly null, which is what a first filing looks like on the wire."
    },
    {
      "id": "wire/evidence-card-request-resubmission",
      "file": "wire/evidence-card-request-resubmission.json",
      "kind": "affidavit-envelope",
      "schema": "schemas/evidence-card-request.schema.json",
      "schemaRelevant": true,
      "notes": "The same envelope with priorAmendments populated: the resubmission branch, carrying the amendments a reviewer made on an entry that expired before it was acted on. The pair with wire/evidence-card-request exists so the nullable branch of priorAmendments is covered by a real payload, not only by the null one."
    },
    {
      "id": "wire/docket-expiring",
      "file": "wire/docket-expiring.json",
      "kind": "notification",
      "schema": "schemas/docket-expiring.schema.json",
      "schemaRelevant": true,
      "notes": "The deadline warning for a pending docket entry. Re-sent on every sweep while the entry stays inside the warning window, so a consumer must treat repeats for the same docketId as the same warning."
    },
    {
      "id": "wire/docket-expired",
      "file": "wire/docket-expired.json",
      "kind": "notification",
      "schema": "schemas/docket-expired.schema.json",
      "schemaRelevant": true,
      "notes": "The lapse notice for a docket entry that reached its deadline with no reviewer decision. Carries the docket id and nothing else."
    },
    {
      "id": "wire/action-decision-result",
      "file": "wire/action-decision-result.json",
      "kind": "host-hub-payload",
      "schema": null,
      "schemaRelevant": false,
      "notes": "A host payload, not protocol core: how one host tells its own client what became of a review it was showing. Captured as a reference shape because its outcome field is one of the closed sets in enum-values.json. No schema in this seed."
    },
    {
      "id": "wire/session-rehydrated",
      "file": "wire/session-rehydrated.json",
      "kind": "host-hub-payload",
      "schema": null,
      "schemaRelevant": false,
      "notes": "A host payload, not protocol core: how one host tells a reconnecting client how many reviews are still waiting. Captured as a reference shape. No schema in this seed."
    },
    {
      "id": "wire/guide-ui",
      "file": "wire/guide-ui.json",
      "kind": "transport-ui",
      "schema": null,
      "schemaRelevant": false,
      "notes": "A transport payload for a UI walkthrough: a route to navigate to and an ordered list of steps, each naming an element by its registered semantic id rather than a selector. Its meaning stays with the host surface that renders it; captured here as a reference shape. No schema in this seed."
    },
    {
      "id": "wire/system-notification",
      "file": "wire/system-notification.json",
      "kind": "transport-ui",
      "schema": null,
      "schemaRelevant": false,
      "notes": "A transport payload for a transient message to a UI. Captured as a reference shape because its level field is one of the closed sets in enum-values.json. No schema in this seed."
    }
  ],
  "enums": {
    "file": "enum-values.json",
    "sets": [
      {
        "id": "enum/actionDecisionResultOutcome",
        "appliesTo": "the outcome field of wire/action-decision-result",
        "schema": null
      },
      {
        "id": "enum/provenanceSource",
        "appliesTo": "the source field of every provenance tag",
        "schema": "schemas/provenance-source.schema.json"
      },
      {
        "id": "enum/systemNotificationLevel",
        "appliesTo": "the level field of wire/system-notification",
        "schema": null
      },
      {
        "id": "enum/getActionStatusesValue",
        "appliesTo": "the per-entry value a host's action-status query returns; no wire fixture in this seed",
        "schema": null
      }
    ]
  }
} as const;

/** `conformance/fixtures/enum-values.json` at the pinned tag. */
export const enumValues = {
  "$note": "The closed value sets captured from the shipped .NET hosts at Sakwala/affiant v1.0.0-beta.1 on 2026-09-04. Each set is a de-facto enum on the wire — a plain JSON string field with a fixed allowed-value set — pinned here as data so an implementation in any language can check its own literals against the same list. Sets and the schema each belongs to: `actionDecisionResultOutcome` is the `outcome` field of the host hub payload `wire/action-decision-result.json`, which has no schema in this seed; `provenanceSource` is `schemas/provenance-source.schema.json`, the `source` field of every provenance tag; `systemNotificationLevel` is the `level` field of the transport payload `wire/system-notification.json`, which has no schema in this seed; `getActionStatusesValue` is the value a host's action-status query returns per docket entry, a host surface with no wire fixture and no schema in this seed.",
  "actionDecisionResultOutcome": [
    "approved",
    "rejected",
    "expired",
    "resubmitted"
  ],
  "provenanceSource": [
    "UserStated",
    "External",
    "Computed",
    "Conversation",
    "Inferred",
    "Default",
    "Empty"
  ],
  "systemNotificationLevel": [
    "error",
    "warning",
    "info"
  ],
  "getActionStatusesValue": [
    "pending",
    "approved",
    "rejected",
    "expired",
    "resubmitted",
    "unknown"
  ]
} as const;
