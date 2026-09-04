// GENERATED FILE — DO NOT EDIT BY HAND.
// Produced by scripts/generate-sources.mjs from protocol/, which is a byte-for-byte
// copy of Sakwala/affiant-protocol at 242964faba9e6852b8fbfcdef6c3296b5c705f59.
// Source: protocol/fixtures/wire/ and protocol/fixtures/v0.1/
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

/** Every 0.0.1-seed wire fixture, keyed by its manifest id. */
export const wireFixtures = {
  "wire/evidence-card-request": wireEvidenceCardRequest,
  "wire/evidence-card-request-resubmission": wireEvidenceCardRequestResubmission,
  "wire/docket-expiring": wireDocketExpiring,
  "wire/docket-expired": wireDocketExpired,
  "wire/action-decision-result": wireActionDecisionResult,
  "wire/session-rehydrated": wireSessionRehydrated,
  "wire/guide-ui": wireGuideUi,
  "wire/system-notification": wireSystemNotification,
} as const;

/**
 * Every v0.1 fixture, keyed by its manifest id: one or more positive examples per
 * schema, and the negatives that must fail. Left as `unknown` because a negative
 * fixture is, by construction, not assignable to the type its schema describes.
 */
export const v01Fixtures: Readonly<Record<string, unknown>> = {
  "v0.1/affidavit-field/01-conversation-tagged": {
    "name": "status",
    "kind": "enum",
    "value": "Active",
    "previousValue": null,
    "provenance": {
      "current": {
        "source": "Conversation",
        "confidence": 0.9,
        "note": "Literally present in the turn: status",
        "at": "2026-09-04T09:00:00.000Z",
        "conversationTurn": null,
        "binding": null
      },
      "prior": []
    },
    "isMandatory": true
  },
  "v0.1/affidavit-field/02-external-bound": {
    "name": "owner",
    "kind": "text",
    "value": "user-77",
    "previousValue": null,
    "provenance": {
      "current": {
        "source": "External",
        "confidence": 1,
        "note": "Chosen from the owner picker",
        "at": "2026-09-04T09:00:00.000Z",
        "conversationTurn": null,
        "binding": {
          "kind": "external-ref",
          "ref": {
            "system": "directory",
            "recordId": "user-77"
          }
        }
      },
      "prior": [
        {
          "source": "Inferred",
          "confidence": 0.9,
          "note": "Inferred from the turn: owner",
          "at": "2026-09-04T09:00:00.000Z",
          "conversationTurn": null,
          "binding": null
        }
      ]
    },
    "isMandatory": true
  },
  "v0.1/affidavit-field/90-unknown-kind": {
    "name": "status",
    "kind": "money",
    "value": "Active",
    "previousValue": null,
    "provenance": {
      "current": {
        "source": "Conversation",
        "confidence": 0.9,
        "note": "Literally present in the turn: status",
        "at": "2026-09-04T09:00:00.000Z",
        "conversationTurn": null,
        "binding": null
      },
      "prior": []
    },
    "isMandatory": true
  },
  "v0.1/affidavit/01-update-shaped": {
    "protocolVersion": "0.1.0",
    "operationType": "update",
    "entityType": "Invoice",
    "entityId": "invoice-1",
    "fields": [
      {
        "name": "status",
        "kind": "enum",
        "value": "Active",
        "previousValue": null,
        "provenance": {
          "current": {
            "source": "Conversation",
            "confidence": 0.9,
            "note": "Literally present in the turn: status",
            "at": "2026-09-04T09:00:00.000Z",
            "conversationTurn": null,
            "binding": null
          },
          "prior": []
        },
        "isMandatory": true
      },
      {
        "name": "amount",
        "kind": "number",
        "value": 40,
        "previousValue": null,
        "provenance": {
          "current": {
            "source": "Conversation",
            "confidence": 0.8,
            "note": "Literally present in the turn: amount",
            "at": "2026-09-04T09:00:00.000Z",
            "conversationTurn": null,
            "binding": null
          },
          "prior": []
        },
        "isMandatory": true
      },
      {
        "name": "dueOn",
        "kind": "date",
        "value": "2026-10-01",
        "previousValue": null,
        "provenance": {
          "current": {
            "source": "Inferred",
            "confidence": 0.6,
            "note": "Inferred from the turn: dueOn",
            "at": "2026-09-04T09:00:00.000Z",
            "conversationTurn": null,
            "binding": null
          },
          "prior": []
        },
        "isMandatory": false
      },
      {
        "name": "note",
        "kind": "text",
        "value": "raised in chat",
        "previousValue": null,
        "provenance": {
          "current": {
            "source": "Inferred",
            "confidence": 0.7,
            "note": "Inferred from the turn: note",
            "at": "2026-09-04T09:00:00.000Z",
            "conversationTurn": null,
            "binding": null
          },
          "prior": []
        },
        "isMandatory": false
      }
    ],
    "aggregateConfidence": 0.6,
    "populatedConfidence": 0.6,
    "emptyFieldCount": 0,
    "conversationTurn": null,
    "createdAt": "2026-09-04T09:00:00.000Z"
  },
  "v0.1/affidavit/02-amended": {
    "protocolVersion": "0.1.0",
    "operationType": "update",
    "entityType": "Invoice",
    "entityId": "invoice-1",
    "fields": [
      {
        "name": "status",
        "kind": "text",
        "value": "Active",
        "previousValue": null,
        "provenance": {
          "current": {
            "source": "Conversation",
            "confidence": 0.9,
            "note": null,
            "at": "2026-09-04T09:00:00.000Z",
            "conversationTurn": null,
            "binding": null
          },
          "prior": []
        },
        "isMandatory": false
      },
      {
        "name": "amount",
        "kind": "text",
        "value": "4000",
        "previousValue": null,
        "provenance": {
          "current": {
            "source": "UserStated",
            "confidence": 1,
            "note": "Amended by ana on Docket entry 4f3f031b-a7c4-867c-9b1f-be0de416040d",
            "at": "2026-09-04T09:00:00.000Z",
            "conversationTurn": null,
            "binding": {
              "kind": "reviewer-act",
              "ref": {
                "entryId": "4f3f031b-a7c4-867c-9b1f-be0de416040d",
                "decisionAt": "2026-09-04T09:00:00.000Z"
              }
            }
          },
          "prior": [
            {
              "source": "Conversation",
              "confidence": 0.9,
              "note": null,
              "at": "2026-09-04T09:00:00.000Z",
              "conversationTurn": null,
              "binding": null
            }
          ]
        },
        "isMandatory": false
      }
    ],
    "aggregateConfidence": 0.9,
    "populatedConfidence": 0.9,
    "emptyFieldCount": 0,
    "conversationTurn": null,
    "createdAt": "2026-09-04T09:00:00.000Z"
  },
  "v0.1/affidavit/90-missing-populated-confidence": {
    "protocolVersion": "0.1.0",
    "operationType": "update",
    "entityType": "Invoice",
    "entityId": "invoice-1",
    "fields": [
      {
        "name": "status",
        "kind": "enum",
        "value": "Active",
        "previousValue": null,
        "provenance": {
          "current": {
            "source": "Conversation",
            "confidence": 0.9,
            "note": "Literally present in the turn: status",
            "at": "2026-09-04T09:00:00.000Z",
            "conversationTurn": null,
            "binding": null
          },
          "prior": []
        },
        "isMandatory": true
      },
      {
        "name": "amount",
        "kind": "number",
        "value": 40,
        "previousValue": null,
        "provenance": {
          "current": {
            "source": "Conversation",
            "confidence": 0.8,
            "note": "Literally present in the turn: amount",
            "at": "2026-09-04T09:00:00.000Z",
            "conversationTurn": null,
            "binding": null
          },
          "prior": []
        },
        "isMandatory": true
      },
      {
        "name": "dueOn",
        "kind": "date",
        "value": "2026-10-01",
        "previousValue": null,
        "provenance": {
          "current": {
            "source": "Inferred",
            "confidence": 0.6,
            "note": "Inferred from the turn: dueOn",
            "at": "2026-09-04T09:00:00.000Z",
            "conversationTurn": null,
            "binding": null
          },
          "prior": []
        },
        "isMandatory": false
      },
      {
        "name": "note",
        "kind": "text",
        "value": "raised in chat",
        "previousValue": null,
        "provenance": {
          "current": {
            "source": "Inferred",
            "confidence": 0.7,
            "note": "Inferred from the turn: note",
            "at": "2026-09-04T09:00:00.000Z",
            "conversationTurn": null,
            "binding": null
          },
          "prior": []
        },
        "isMandatory": false
      }
    ],
    "aggregateConfidence": 0.6,
    "emptyFieldCount": 0,
    "conversationTurn": null,
    "createdAt": "2026-09-04T09:00:00.000Z"
  },
  "v0.1/amendments/01-accepted": {
    "amount": "4000",
    "note": null
  },
  "v0.1/amendments/90-not-an-object": [
    [
      "status",
      "Active"
    ]
  ],
  "v0.1/attestation/01-member": {
    "by": {
      "kind": "member",
      "id": "ana"
    },
    "at": "2026-09-04T09:00:00.000Z",
    "entryId": "4f3f031b-a7c4-867c-9b1f-be0de416040d"
  },
  "v0.1/attestation/02-standing-order": {
    "by": {
      "kind": "standing-order",
      "policyId": "auto-approve",
      "version": "2.1.0"
    },
    "at": "2026-09-04T09:00:00.000Z",
    "entryId": "e0c4b14c-dde4-8948-b2d8-b56921b18241"
  },
  "v0.1/attestation/03-member-via-relay": {
    "by": {
      "kind": "member-via-relay",
      "memberId": "ana",
      "relay": {
        "principal": "whatsapp-relay",
        "channelIdentity": "+94770000000",
        "messageId": "wamid-42"
      }
    },
    "at": "2026-09-04T09:00:00.000Z",
    "entryId": "4f3f031b-a7c4-867c-9b1f-be0de416040d"
  },
  "v0.1/attestation/90-service-attestor": {
    "by": {
      "kind": "service",
      "id": "relay-1"
    },
    "at": "2026-09-04T09:00:00.000Z",
    "entryId": "4f3f031b-a7c4-867c-9b1f-be0de416040d"
  },
  "v0.1/binding/01-external-ref": {
    "kind": "external-ref",
    "ref": {
      "system": "directory",
      "recordId": "user-77"
    }
  },
  "v0.1/binding/02-reviewer-act": {
    "kind": "reviewer-act",
    "ref": {
      "entryId": "4f3f031b-a7c4-867c-9b1f-be0de416040d",
      "decisionAt": "2026-09-04T09:00:00.000Z"
    }
  },
  "v0.1/binding/90-unknown-kind": {
    "kind": "database-row",
    "ref": {
      "system": "directory",
      "recordId": "user-77"
    }
  },
  "v0.1/blocked/01-coverage-refused": {
    "code": "coverage-refused",
    "category": "provider-executed",
    "toolName": "relay_capture"
  },
  "v0.1/blocked/02-requirement-not-implemented": {
    "code": "requirement-not-implemented",
    "level": "MultiParty"
  },
  "v0.1/blocked/90-coverage-refused-with-level": {
    "code": "coverage-refused",
    "level": "MultiParty"
  },
  "v0.1/decision-result/01-approved": {
    "protocolVersion": "0.1.0",
    "docketId": "4f3f031b-a7c4-867c-9b1f-be0de416040d",
    "outcome": "approved",
    "attestation": {
      "by": {
        "kind": "member",
        "id": "ana"
      },
      "at": "2026-09-04T09:00:00.000Z",
      "entryId": "4f3f031b-a7c4-867c-9b1f-be0de416040d"
    },
    "execution": "unexecuted"
  },
  "v0.1/decision-result/02-executed": {
    "protocolVersion": "0.1.0",
    "docketId": "4f3f031b-a7c4-867c-9b1f-be0de416040d",
    "outcome": "approved",
    "attestation": {
      "by": {
        "kind": "member",
        "id": "ana"
      },
      "at": "2026-09-04T09:00:00.000Z",
      "entryId": "4f3f031b-a7c4-867c-9b1f-be0de416040d"
    },
    "execution": "executed"
  },
  "v0.1/decision-result/90-missing-attestation": {
    "protocolVersion": "0.1.0",
    "docketId": "4f3f031b-a7c4-867c-9b1f-be0de416040d",
    "outcome": "approved",
    "execution": "unexecuted"
  },
  "v0.1/docket-entry/01-pending-reviewer-confirmation": {
    "protocolVersion": "0.1.0",
    "entryId": "8369aad4-b5ac-86d4-b6b7-504f90659f87",
    "tenantId": "tenant-a",
    "conversationId": "conv-1",
    "channel": "chat",
    "toolName": "update_invoice",
    "affidavit": {
      "protocolVersion": "0.1.0",
      "operationType": "update",
      "entityType": "Invoice",
      "entityId": "invoice-1",
      "fields": [
        {
          "name": "status",
          "kind": "enum",
          "value": "Active",
          "previousValue": null,
          "provenance": {
            "current": {
              "source": "Conversation",
              "confidence": 0.9,
              "note": "Literally present in the turn: status",
              "at": "2026-09-04T09:00:00.000Z",
              "conversationTurn": null,
              "binding": null
            },
            "prior": []
          },
          "isMandatory": true
        },
        {
          "name": "amount",
          "kind": "number",
          "value": 40,
          "previousValue": null,
          "provenance": {
            "current": {
              "source": "Conversation",
              "confidence": 0.8,
              "note": "Literally present in the turn: amount",
              "at": "2026-09-04T09:00:00.000Z",
              "conversationTurn": null,
              "binding": null
            },
            "prior": []
          },
          "isMandatory": true
        },
        {
          "name": "dueOn",
          "kind": "date",
          "value": "2026-10-01",
          "previousValue": null,
          "provenance": {
            "current": {
              "source": "Inferred",
              "confidence": 0.6,
              "note": "Inferred from the turn: dueOn",
              "at": "2026-09-04T09:00:00.000Z",
              "conversationTurn": null,
              "binding": null
            },
            "prior": []
          },
          "isMandatory": false
        },
        {
          "name": "note",
          "kind": "text",
          "value": "raised in chat",
          "previousValue": null,
          "provenance": {
            "current": {
              "source": "Inferred",
              "confidence": 0.7,
              "note": "Inferred from the turn: note",
              "at": "2026-09-04T09:00:00.000Z",
              "conversationTurn": null,
              "binding": null
            },
            "prior": []
          },
          "isMandatory": false
        }
      ],
      "aggregateConfidence": 0.6,
      "populatedConfidence": 0.6,
      "emptyFieldCount": 0,
      "conversationTurn": null,
      "createdAt": "2026-09-04T09:00:00.000Z"
    },
    "amendedAffidavit": null,
    "requirement": "ReviewerConfirmation",
    "status": "pending",
    "execution": null,
    "blocked": null,
    "compositeRef": null,
    "attestation": null,
    "amendments": null,
    "preservedAmendments": null,
    "decision": null,
    "lineage": {
      "supersedes": null,
      "supersededBy": null
    },
    "filedAt": "2026-09-04T09:00:00.000Z",
    "expiresAt": "2026-09-04T09:30:00.000Z",
    "decidedAt": null,
    "executionDetail": null
  },
  "v0.1/docket-entry/02-approved-unexecuted": {
    "protocolVersion": "0.1.0",
    "entryId": "4f3f031b-a7c4-867c-9b1f-be0de416040d",
    "tenantId": "tenant-a",
    "conversationId": "conv-1",
    "channel": "chat",
    "toolName": "update_invoice",
    "affidavit": {
      "protocolVersion": "0.1.0",
      "operationType": "update",
      "entityType": "Invoice",
      "entityId": "invoice-1",
      "fields": [
        {
          "name": "status",
          "kind": "text",
          "value": "Active",
          "previousValue": null,
          "provenance": {
            "current": {
              "source": "Conversation",
              "confidence": 0.9,
              "note": null,
              "at": "2026-09-04T09:00:00.000Z",
              "conversationTurn": null,
              "binding": null
            },
            "prior": []
          },
          "isMandatory": false
        },
        {
          "name": "amount",
          "kind": "text",
          "value": "40",
          "previousValue": null,
          "provenance": {
            "current": {
              "source": "Conversation",
              "confidence": 0.9,
              "note": null,
              "at": "2026-09-04T09:00:00.000Z",
              "conversationTurn": null,
              "binding": null
            },
            "prior": []
          },
          "isMandatory": false
        },
        {
          "name": "note",
          "kind": "text",
          "value": "kept",
          "previousValue": null,
          "provenance": {
            "current": {
              "source": "Conversation",
              "confidence": 0.9,
              "note": null,
              "at": "2026-09-04T09:00:00.000Z",
              "conversationTurn": null,
              "binding": null
            },
            "prior": []
          },
          "isMandatory": false
        }
      ],
      "aggregateConfidence": 0.9,
      "populatedConfidence": 0.9,
      "emptyFieldCount": 0,
      "conversationTurn": null,
      "createdAt": "2026-09-04T09:00:00.000Z"
    },
    "amendedAffidavit": null,
    "requirement": "ReviewerConfirmation",
    "status": "approved",
    "execution": "unexecuted",
    "blocked": null,
    "compositeRef": null,
    "attestation": {
      "by": {
        "kind": "member",
        "id": "ana"
      },
      "at": "2026-09-04T09:00:00.000Z",
      "entryId": "4f3f031b-a7c4-867c-9b1f-be0de416040d"
    },
    "amendments": null,
    "preservedAmendments": null,
    "decision": {
      "kind": "approve",
      "reason": "checked against the purchase order",
      "at": "2026-09-04T09:00:00.000Z"
    },
    "lineage": {
      "supersedes": null,
      "supersededBy": null
    },
    "filedAt": "2026-09-04T09:00:00.000Z",
    "expiresAt": "2026-09-04T09:30:00.000Z",
    "decidedAt": "2026-09-04T09:00:00.000Z",
    "executionDetail": null
  },
  "v0.1/docket-entry/03-amended-on-approval": {
    "protocolVersion": "0.1.0",
    "entryId": "4f3f031b-a7c4-867c-9b1f-be0de416040d",
    "tenantId": "tenant-a",
    "conversationId": "conv-1",
    "channel": "chat",
    "toolName": "update_invoice",
    "affidavit": {
      "protocolVersion": "0.1.0",
      "operationType": "update",
      "entityType": "Invoice",
      "entityId": "invoice-1",
      "fields": [
        {
          "name": "status",
          "kind": "text",
          "value": "Active",
          "previousValue": null,
          "provenance": {
            "current": {
              "source": "Conversation",
              "confidence": 0.9,
              "note": null,
              "at": "2026-09-04T09:00:00.000Z",
              "conversationTurn": null,
              "binding": null
            },
            "prior": []
          },
          "isMandatory": false
        },
        {
          "name": "amount",
          "kind": "text",
          "value": "40",
          "previousValue": null,
          "provenance": {
            "current": {
              "source": "Conversation",
              "confidence": 0.9,
              "note": null,
              "at": "2026-09-04T09:00:00.000Z",
              "conversationTurn": null,
              "binding": null
            },
            "prior": []
          },
          "isMandatory": false
        },
        {
          "name": "note",
          "kind": "text",
          "value": "kept",
          "previousValue": null,
          "provenance": {
            "current": {
              "source": "Conversation",
              "confidence": 0.9,
              "note": null,
              "at": "2026-09-04T09:00:00.000Z",
              "conversationTurn": null,
              "binding": null
            },
            "prior": []
          },
          "isMandatory": false
        }
      ],
      "aggregateConfidence": 0.9,
      "populatedConfidence": 0.9,
      "emptyFieldCount": 0,
      "conversationTurn": null,
      "createdAt": "2026-09-04T09:00:00.000Z"
    },
    "amendedAffidavit": {
      "protocolVersion": "0.1.0",
      "operationType": "update",
      "entityType": "Invoice",
      "entityId": "invoice-1",
      "fields": [
        {
          "name": "status",
          "kind": "text",
          "value": "Active",
          "previousValue": null,
          "provenance": {
            "current": {
              "source": "Conversation",
              "confidence": 0.9,
              "note": null,
              "at": "2026-09-04T09:00:00.000Z",
              "conversationTurn": null,
              "binding": null
            },
            "prior": []
          },
          "isMandatory": false
        },
        {
          "name": "amount",
          "kind": "text",
          "value": "4000",
          "previousValue": null,
          "provenance": {
            "current": {
              "source": "UserStated",
              "confidence": 1,
              "note": "Amended by ana on Docket entry 4f3f031b-a7c4-867c-9b1f-be0de416040d",
              "at": "2026-09-04T09:00:00.000Z",
              "conversationTurn": null,
              "binding": {
                "kind": "reviewer-act",
                "ref": {
                  "entryId": "4f3f031b-a7c4-867c-9b1f-be0de416040d",
                  "decisionAt": "2026-09-04T09:00:00.000Z"
                }
              }
            },
            "prior": [
              {
                "source": "Conversation",
                "confidence": 0.9,
                "note": null,
                "at": "2026-09-04T09:00:00.000Z",
                "conversationTurn": null,
                "binding": null
              }
            ]
          },
          "isMandatory": false
        }
      ],
      "aggregateConfidence": 0.9,
      "populatedConfidence": 0.9,
      "emptyFieldCount": 0,
      "conversationTurn": null,
      "createdAt": "2026-09-04T09:00:00.000Z"
    },
    "requirement": "ReviewerConfirmation",
    "status": "approved",
    "execution": "unexecuted",
    "blocked": null,
    "compositeRef": null,
    "attestation": {
      "by": {
        "kind": "member",
        "id": "ana"
      },
      "at": "2026-09-04T09:00:00.000Z",
      "entryId": "4f3f031b-a7c4-867c-9b1f-be0de416040d"
    },
    "amendments": {
      "amount": "4000",
      "note": null
    },
    "preservedAmendments": null,
    "decision": {
      "kind": "approve",
      "reason": null,
      "at": "2026-09-04T09:00:00.000Z"
    },
    "lineage": {
      "supersedes": null,
      "supersededBy": null
    },
    "filedAt": "2026-09-04T09:00:00.000Z",
    "expiresAt": "2026-09-04T09:30:00.000Z",
    "decidedAt": "2026-09-04T09:00:00.000Z",
    "executionDetail": null
  },
  "v0.1/docket-entry/04-standing-order-approved": {
    "protocolVersion": "0.1.0",
    "entryId": "e0c4b14c-dde4-8948-b2d8-b56921b18241",
    "tenantId": "tenant-a",
    "conversationId": "conv-1",
    "channel": "chat",
    "toolName": "relay_capture",
    "affidavit": {
      "protocolVersion": "0.1.0",
      "operationType": "update",
      "entityType": "Invoice",
      "entityId": "invoice-1",
      "fields": [
        {
          "name": "status",
          "kind": "text",
          "value": "Active",
          "previousValue": null,
          "provenance": {
            "current": {
              "source": "Conversation",
              "confidence": 0.9,
              "note": null,
              "at": "2026-09-04T09:00:00.000Z",
              "conversationTurn": null,
              "binding": null
            },
            "prior": []
          },
          "isMandatory": false
        }
      ],
      "aggregateConfidence": 0.9,
      "populatedConfidence": 0.9,
      "emptyFieldCount": 0,
      "conversationTurn": null,
      "createdAt": "2026-09-04T09:00:00.000Z"
    },
    "amendedAffidavit": null,
    "requirement": "StandingOrder",
    "status": "approved",
    "execution": "unexecuted",
    "blocked": null,
    "compositeRef": null,
    "attestation": {
      "by": {
        "kind": "standing-order",
        "policyId": "auto-approve",
        "version": "2.1.0"
      },
      "at": "2026-09-04T09:00:00.000Z",
      "entryId": "e0c4b14c-dde4-8948-b2d8-b56921b18241"
    },
    "amendments": null,
    "preservedAmendments": null,
    "decision": null,
    "lineage": {
      "supersedes": null,
      "supersededBy": null
    },
    "filedAt": "2026-09-04T09:00:00.000Z",
    "expiresAt": "2026-09-04T09:30:00.000Z",
    "decidedAt": "2026-09-04T09:00:00.000Z",
    "executionDetail": null
  },
  "v0.1/docket-entry/05-blocked-coverage-refused": {
    "protocolVersion": "0.1.0",
    "entryId": "e0c4b14c-dde4-8948-b2d8-b56921b18241",
    "tenantId": "tenant-a",
    "conversationId": "conv-1",
    "channel": "chat",
    "toolName": "relay_capture",
    "affidavit": {
      "protocolVersion": "0.1.0",
      "operationType": "update",
      "entityType": "Invoice",
      "entityId": "invoice-1",
      "fields": [
        {
          "name": "status",
          "kind": "text",
          "value": "Active",
          "previousValue": null,
          "provenance": {
            "current": {
              "source": "Conversation",
              "confidence": 0.9,
              "note": null,
              "at": "2026-09-04T09:00:00.000Z",
              "conversationTurn": null,
              "binding": null
            },
            "prior": []
          },
          "isMandatory": false
        }
      ],
      "aggregateConfidence": 0.9,
      "populatedConfidence": 0.9,
      "emptyFieldCount": 0,
      "conversationTurn": null,
      "createdAt": "2026-09-04T09:00:00.000Z"
    },
    "amendedAffidavit": null,
    "requirement": "StandingOrder",
    "status": "pending",
    "execution": null,
    "blocked": {
      "code": "coverage-refused",
      "category": "provider-executed",
      "toolName": "relay_capture"
    },
    "compositeRef": null,
    "attestation": null,
    "amendments": null,
    "preservedAmendments": null,
    "decision": null,
    "lineage": {
      "supersedes": null,
      "supersededBy": null
    },
    "filedAt": "2026-09-04T09:00:00.000Z",
    "expiresAt": "2026-09-04T09:30:00.000Z",
    "decidedAt": null,
    "executionDetail": null
  },
  "v0.1/docket-entry/06-executed": {
    "protocolVersion": "0.1.0",
    "entryId": "4f3f031b-a7c4-867c-9b1f-be0de416040d",
    "tenantId": "tenant-a",
    "conversationId": "conv-1",
    "channel": "chat",
    "toolName": "update_invoice",
    "affidavit": {
      "protocolVersion": "0.1.0",
      "operationType": "update",
      "entityType": "Invoice",
      "entityId": "invoice-1",
      "fields": [
        {
          "name": "status",
          "kind": "text",
          "value": "Active",
          "previousValue": null,
          "provenance": {
            "current": {
              "source": "Conversation",
              "confidence": 0.9,
              "note": null,
              "at": "2026-09-04T09:00:00.000Z",
              "conversationTurn": null,
              "binding": null
            },
            "prior": []
          },
          "isMandatory": false
        },
        {
          "name": "amount",
          "kind": "text",
          "value": "40",
          "previousValue": null,
          "provenance": {
            "current": {
              "source": "Conversation",
              "confidence": 0.9,
              "note": null,
              "at": "2026-09-04T09:00:00.000Z",
              "conversationTurn": null,
              "binding": null
            },
            "prior": []
          },
          "isMandatory": false
        },
        {
          "name": "note",
          "kind": "text",
          "value": "kept",
          "previousValue": null,
          "provenance": {
            "current": {
              "source": "Conversation",
              "confidence": 0.9,
              "note": null,
              "at": "2026-09-04T09:00:00.000Z",
              "conversationTurn": null,
              "binding": null
            },
            "prior": []
          },
          "isMandatory": false
        }
      ],
      "aggregateConfidence": 0.9,
      "populatedConfidence": 0.9,
      "emptyFieldCount": 0,
      "conversationTurn": null,
      "createdAt": "2026-09-04T09:00:00.000Z"
    },
    "amendedAffidavit": null,
    "requirement": "ReviewerConfirmation",
    "status": "approved",
    "execution": "executed",
    "blocked": null,
    "compositeRef": null,
    "attestation": {
      "by": {
        "kind": "member",
        "id": "ana"
      },
      "at": "2026-09-04T09:00:00.000Z",
      "entryId": "4f3f031b-a7c4-867c-9b1f-be0de416040d"
    },
    "amendments": null,
    "preservedAmendments": null,
    "decision": {
      "kind": "approve",
      "reason": null,
      "at": "2026-09-04T09:00:00.000Z"
    },
    "lineage": {
      "supersedes": null,
      "supersededBy": null
    },
    "filedAt": "2026-09-04T09:00:00.000Z",
    "expiresAt": "2026-09-04T09:30:00.000Z",
    "decidedAt": "2026-09-04T09:00:00.000Z",
    "executionDetail": "invoice row 41"
  },
  "v0.1/docket-entry/07-expired-amendments-preserved": {
    "protocolVersion": "0.1.0",
    "entryId": "80358c14-961a-875e-b20a-0a70a89e4592",
    "tenantId": "tenant-a",
    "conversationId": "conv-1",
    "channel": "chat",
    "toolName": "update_invoice",
    "affidavit": {
      "protocolVersion": "0.1.0",
      "operationType": "update",
      "entityType": "Invoice",
      "entityId": "invoice-1",
      "fields": [
        {
          "name": "status",
          "kind": "enum",
          "value": "Active",
          "previousValue": null,
          "provenance": {
            "current": {
              "source": "Conversation",
              "confidence": 0.9,
              "note": "Literally present in the turn: status",
              "at": "2026-09-04T09:00:00.000Z",
              "conversationTurn": null,
              "binding": {
                "kind": "utterance-span",
                "ref": {
                  "offset": 21,
                  "length": 6,
                  "hash": "92340695899bd2d86223e4a007620e0d6502fc0e08809773634c7e0743764a9c"
                }
              }
            },
            "prior": []
          },
          "isMandatory": true
        }
      ],
      "aggregateConfidence": 0.9,
      "populatedConfidence": 0.9,
      "emptyFieldCount": 0,
      "conversationTurn": null,
      "createdAt": "2026-09-04T09:00:00.000Z"
    },
    "amendedAffidavit": null,
    "requirement": "ReviewerConfirmation",
    "status": "expired",
    "execution": null,
    "blocked": null,
    "compositeRef": null,
    "attestation": null,
    "amendments": null,
    "preservedAmendments": {
      "amendments": {
        "status": "Retired"
      },
      "at": "2026-09-04T09:45:00.000Z",
      "by": "ana"
    },
    "decision": null,
    "lineage": {
      "supersedes": null,
      "supersededBy": "421b12e8-d13f-85a5-8afa-fdb44b7fd08f"
    },
    "filedAt": "2026-09-04T09:00:00.000Z",
    "expiresAt": "2026-09-04T09:30:00.000Z",
    "decidedAt": "2026-09-04T09:30:00.000Z",
    "executionDetail": null
  },
  "v0.1/docket-entry/08-resubmitted": {
    "protocolVersion": "0.1.0",
    "entryId": "421b12e8-d13f-85a5-8afa-fdb44b7fd08f",
    "tenantId": "tenant-a",
    "conversationId": "conv-1",
    "channel": "chat",
    "toolName": "update_invoice",
    "affidavit": {
      "protocolVersion": "0.1.0",
      "operationType": "update",
      "entityType": "Invoice",
      "entityId": "invoice-1",
      "fields": [
        {
          "name": "status",
          "kind": "enum",
          "value": "Retired",
          "previousValue": null,
          "provenance": {
            "current": {
              "source": "UserStated",
              "confidence": 1,
              "note": "Prefilled from the amendment ana carried on Docket entry 80358c14-961a-875e-b20a-0a70a89e4592",
              "at": "2026-09-04T09:45:00.000Z",
              "conversationTurn": null,
              "binding": {
                "kind": "reviewer-act",
                "ref": {
                  "entryId": "80358c14-961a-875e-b20a-0a70a89e4592",
                  "decisionAt": "2026-09-04T09:45:00.000Z"
                }
              }
            },
            "prior": [
              {
                "source": "Conversation",
                "confidence": 0.9,
                "note": "Literally present in the turn: status",
                "at": "2026-09-04T09:00:00.000Z",
                "conversationTurn": null,
                "binding": {
                  "kind": "utterance-span",
                  "ref": {
                    "offset": 21,
                    "length": 6,
                    "hash": "92340695899bd2d86223e4a007620e0d6502fc0e08809773634c7e0743764a9c"
                  }
                }
              }
            ]
          },
          "isMandatory": true
        }
      ],
      "aggregateConfidence": 1,
      "populatedConfidence": 1,
      "emptyFieldCount": 0,
      "conversationTurn": null,
      "createdAt": "2026-09-04T09:46:00.000Z"
    },
    "amendedAffidavit": null,
    "requirement": "ReviewerConfirmation",
    "status": "pending",
    "execution": null,
    "blocked": null,
    "compositeRef": null,
    "attestation": null,
    "amendments": null,
    "preservedAmendments": null,
    "decision": null,
    "lineage": {
      "supersedes": "80358c14-961a-875e-b20a-0a70a89e4592",
      "supersededBy": null
    },
    "filedAt": "2026-09-04T09:46:00.000Z",
    "expiresAt": "2026-09-04T10:16:00.000Z",
    "decidedAt": null,
    "executionDetail": null
  },
  "v0.1/docket-entry/90-deferred-status": {
    "protocolVersion": "0.1.0",
    "entryId": "8369aad4-b5ac-86d4-b6b7-504f90659f87",
    "tenantId": "tenant-a",
    "conversationId": "conv-1",
    "channel": "chat",
    "toolName": "update_invoice",
    "affidavit": {
      "protocolVersion": "0.1.0",
      "operationType": "update",
      "entityType": "Invoice",
      "entityId": "invoice-1",
      "fields": [
        {
          "name": "status",
          "kind": "enum",
          "value": "Active",
          "previousValue": null,
          "provenance": {
            "current": {
              "source": "Conversation",
              "confidence": 0.9,
              "note": "Literally present in the turn: status",
              "at": "2026-09-04T09:00:00.000Z",
              "conversationTurn": null,
              "binding": null
            },
            "prior": []
          },
          "isMandatory": true
        },
        {
          "name": "amount",
          "kind": "number",
          "value": 40,
          "previousValue": null,
          "provenance": {
            "current": {
              "source": "Conversation",
              "confidence": 0.8,
              "note": "Literally present in the turn: amount",
              "at": "2026-09-04T09:00:00.000Z",
              "conversationTurn": null,
              "binding": null
            },
            "prior": []
          },
          "isMandatory": true
        },
        {
          "name": "dueOn",
          "kind": "date",
          "value": "2026-10-01",
          "previousValue": null,
          "provenance": {
            "current": {
              "source": "Inferred",
              "confidence": 0.6,
              "note": "Inferred from the turn: dueOn",
              "at": "2026-09-04T09:00:00.000Z",
              "conversationTurn": null,
              "binding": null
            },
            "prior": []
          },
          "isMandatory": false
        },
        {
          "name": "note",
          "kind": "text",
          "value": "raised in chat",
          "previousValue": null,
          "provenance": {
            "current": {
              "source": "Inferred",
              "confidence": 0.7,
              "note": "Inferred from the turn: note",
              "at": "2026-09-04T09:00:00.000Z",
              "conversationTurn": null,
              "binding": null
            },
            "prior": []
          },
          "isMandatory": false
        }
      ],
      "aggregateConfidence": 0.6,
      "populatedConfidence": 0.6,
      "emptyFieldCount": 0,
      "conversationTurn": null,
      "createdAt": "2026-09-04T09:00:00.000Z"
    },
    "amendedAffidavit": null,
    "requirement": "ReviewerConfirmation",
    "status": "deferred",
    "execution": null,
    "blocked": null,
    "compositeRef": null,
    "attestation": null,
    "amendments": null,
    "preservedAmendments": null,
    "decision": null,
    "lineage": {
      "supersedes": null,
      "supersededBy": null
    },
    "filedAt": "2026-09-04T09:00:00.000Z",
    "expiresAt": "2026-09-04T09:30:00.000Z",
    "decidedAt": null,
    "executionDetail": null
  },
  "v0.1/entity-ref/01-update": {
    "entityType": "Invoice",
    "entityId": "invoice-1"
  },
  "v0.1/entity-ref/90-missing-entity-id": {
    "entityType": "Invoice"
  },
  "v0.1/error-code/01-substance-refused": "substance-refused",
  "v0.1/error-code/90-unregistered-code": "decision-refused",
  "v0.1/evidence-card-request/01-first-filing": {
    "protocolVersion": "0.1.0",
    "docketId": "8369aad4-b5ac-86d4-b6b7-504f90659f87",
    "affidavit": {
      "protocolVersion": "0.1.0",
      "operationType": "update",
      "entityType": "Invoice",
      "entityId": "invoice-1",
      "fields": [
        {
          "name": "status",
          "kind": "enum",
          "value": "Active",
          "previousValue": null,
          "provenance": {
            "current": {
              "source": "Conversation",
              "confidence": 0.9,
              "note": "Literally present in the turn: status",
              "at": "2026-09-04T09:00:00.000Z",
              "conversationTurn": null,
              "binding": null
            },
            "prior": []
          },
          "isMandatory": true
        },
        {
          "name": "amount",
          "kind": "number",
          "value": 40,
          "previousValue": null,
          "provenance": {
            "current": {
              "source": "Conversation",
              "confidence": 0.8,
              "note": "Literally present in the turn: amount",
              "at": "2026-09-04T09:00:00.000Z",
              "conversationTurn": null,
              "binding": null
            },
            "prior": []
          },
          "isMandatory": true
        },
        {
          "name": "dueOn",
          "kind": "date",
          "value": "2026-10-01",
          "previousValue": null,
          "provenance": {
            "current": {
              "source": "Inferred",
              "confidence": 0.6,
              "note": "Inferred from the turn: dueOn",
              "at": "2026-09-04T09:00:00.000Z",
              "conversationTurn": null,
              "binding": null
            },
            "prior": []
          },
          "isMandatory": false
        },
        {
          "name": "note",
          "kind": "text",
          "value": "raised in chat",
          "previousValue": null,
          "provenance": {
            "current": {
              "source": "Inferred",
              "confidence": 0.7,
              "note": "Inferred from the turn: note",
              "at": "2026-09-04T09:00:00.000Z",
              "conversationTurn": null,
              "binding": null
            },
            "prior": []
          },
          "isMandatory": false
        }
      ],
      "aggregateConfidence": 0.6,
      "populatedConfidence": 0.6,
      "emptyFieldCount": 0,
      "conversationTurn": null,
      "createdAt": "2026-09-04T09:00:00.000Z"
    },
    "requiredBy": "2026-09-04T09:30:00.000Z",
    "priorAmendments": null,
    "populatedConfidence": 0.6,
    "emptyFieldCount": 0,
    "blocked": null,
    "requiresConfirmation": true
  },
  "v0.1/evidence-card-request/02-blocked": {
    "protocolVersion": "0.1.0",
    "docketId": "e0c4b14c-dde4-8948-b2d8-b56921b18241",
    "affidavit": {
      "protocolVersion": "0.1.0",
      "operationType": "update",
      "entityType": "Invoice",
      "entityId": "invoice-1",
      "fields": [
        {
          "name": "status",
          "kind": "text",
          "value": "Active",
          "previousValue": null,
          "provenance": {
            "current": {
              "source": "Conversation",
              "confidence": 0.9,
              "note": null,
              "at": "2026-09-04T09:00:00.000Z",
              "conversationTurn": null,
              "binding": null
            },
            "prior": []
          },
          "isMandatory": false
        }
      ],
      "aggregateConfidence": 0.9,
      "populatedConfidence": 0.9,
      "emptyFieldCount": 0,
      "conversationTurn": null,
      "createdAt": "2026-09-04T09:00:00.000Z"
    },
    "requiredBy": "2026-09-04T09:30:00.000Z",
    "priorAmendments": null,
    "populatedConfidence": 0.9,
    "emptyFieldCount": 0,
    "blocked": {
      "code": "coverage-refused",
      "category": "provider-executed",
      "toolName": "relay_capture"
    },
    "requiresConfirmation": false
  },
  "v0.1/evidence-card-request/03-resubmission": {
    "protocolVersion": "0.1.0",
    "docketId": "421b12e8-d13f-85a5-8afa-fdb44b7fd08f",
    "affidavit": {
      "protocolVersion": "0.1.0",
      "operationType": "update",
      "entityType": "Invoice",
      "entityId": "invoice-1",
      "fields": [
        {
          "name": "status",
          "kind": "enum",
          "value": "Retired",
          "previousValue": null,
          "provenance": {
            "current": {
              "source": "UserStated",
              "confidence": 1,
              "note": "Prefilled from the amendment ana carried on Docket entry 80358c14-961a-875e-b20a-0a70a89e4592",
              "at": "2026-09-04T09:45:00.000Z",
              "conversationTurn": null,
              "binding": {
                "kind": "reviewer-act",
                "ref": {
                  "entryId": "80358c14-961a-875e-b20a-0a70a89e4592",
                  "decisionAt": "2026-09-04T09:45:00.000Z"
                }
              }
            },
            "prior": [
              {
                "source": "Conversation",
                "confidence": 0.9,
                "note": "Literally present in the turn: status",
                "at": "2026-09-04T09:00:00.000Z",
                "conversationTurn": null,
                "binding": {
                  "kind": "utterance-span",
                  "ref": {
                    "offset": 21,
                    "length": 6,
                    "hash": "92340695899bd2d86223e4a007620e0d6502fc0e08809773634c7e0743764a9c"
                  }
                }
              }
            ]
          },
          "isMandatory": true
        }
      ],
      "aggregateConfidence": 1,
      "populatedConfidence": 1,
      "emptyFieldCount": 0,
      "conversationTurn": null,
      "createdAt": "2026-09-04T09:46:00.000Z"
    },
    "requiredBy": "2026-09-04T10:16:00.000Z",
    "priorAmendments": {
      "status": "Retired"
    },
    "populatedConfidence": 1,
    "emptyFieldCount": 0,
    "blocked": null,
    "requiresConfirmation": true
  },
  "v0.1/evidence-card-request/04-presentation-hints": {
    "protocolVersion": "0.1.0",
    "docketId": "8369aad4-b5ac-86d4-b6b7-504f90659f87",
    "affidavit": {
      "protocolVersion": "0.1.0",
      "operationType": "update",
      "entityType": "Invoice",
      "entityId": "invoice-1",
      "fields": [
        {
          "name": "status",
          "kind": "enum",
          "value": "Active",
          "previousValue": null,
          "provenance": {
            "current": {
              "source": "Conversation",
              "confidence": 0.9,
              "note": "Literally present in the turn: status",
              "at": "2026-09-04T09:00:00.000Z",
              "conversationTurn": null,
              "binding": null
            },
            "prior": []
          },
          "isMandatory": true
        },
        {
          "name": "amount",
          "kind": "number",
          "value": 40,
          "previousValue": null,
          "provenance": {
            "current": {
              "source": "Conversation",
              "confidence": 0.8,
              "note": "Literally present in the turn: amount",
              "at": "2026-09-04T09:00:00.000Z",
              "conversationTurn": null,
              "binding": null
            },
            "prior": []
          },
          "isMandatory": true
        },
        {
          "name": "dueOn",
          "kind": "date",
          "value": "2026-10-01",
          "previousValue": null,
          "provenance": {
            "current": {
              "source": "Inferred",
              "confidence": 0.6,
              "note": "Inferred from the turn: dueOn",
              "at": "2026-09-04T09:00:00.000Z",
              "conversationTurn": null,
              "binding": null
            },
            "prior": []
          },
          "isMandatory": false
        },
        {
          "name": "note",
          "kind": "text",
          "value": "raised in chat",
          "previousValue": null,
          "provenance": {
            "current": {
              "source": "Inferred",
              "confidence": 0.7,
              "note": "Inferred from the turn: note",
              "at": "2026-09-04T09:00:00.000Z",
              "conversationTurn": null,
              "binding": null
            },
            "prior": []
          },
          "isMandatory": false
        }
      ],
      "aggregateConfidence": 0.6,
      "populatedConfidence": 0.6,
      "emptyFieldCount": 0,
      "conversationTurn": null,
      "createdAt": "2026-09-04T09:00:00.000Z"
    },
    "requiredBy": "2026-09-04T09:30:00.000Z",
    "priorAmendments": null,
    "populatedConfidence": 0.6,
    "emptyFieldCount": 0,
    "blocked": null,
    "presentation": [
      {
        "name": "status",
        "kind": "enum",
        "allowedValues": [
          "Draft",
          "Active",
          "Retired"
        ]
      },
      {
        "name": "amount",
        "kind": "number",
        "pattern": "^\\d+(\\.\\d{1,2})?$"
      },
      {
        "name": "dueOn",
        "kind": "date"
      },
      {
        "name": "note",
        "kind": "text"
      }
    ],
    "warnings": [],
    "requiresConfirmation": true
  },
  "v0.1/evidence-card-request/05-blocked-with-warnings": {
    "protocolVersion": "0.1.0",
    "docketId": "e0c4b14c-dde4-8948-b2d8-b56921b18241",
    "affidavit": {
      "protocolVersion": "0.1.0",
      "operationType": "update",
      "entityType": "Invoice",
      "entityId": "invoice-1",
      "fields": [
        {
          "name": "status",
          "kind": "text",
          "value": "Active",
          "previousValue": null,
          "provenance": {
            "current": {
              "source": "Conversation",
              "confidence": 0.9,
              "note": null,
              "at": "2026-09-04T09:00:00.000Z",
              "conversationTurn": null,
              "binding": null
            },
            "prior": []
          },
          "isMandatory": false
        }
      ],
      "aggregateConfidence": 0.9,
      "populatedConfidence": 0.9,
      "emptyFieldCount": 0,
      "conversationTurn": null,
      "createdAt": "2026-09-04T09:00:00.000Z"
    },
    "requiredBy": "2026-09-04T09:30:00.000Z",
    "priorAmendments": null,
    "populatedConfidence": 0.9,
    "emptyFieldCount": 0,
    "blocked": {
      "code": "coverage-refused",
      "category": "provider-executed",
      "toolName": "relay_capture"
    },
    "warnings": [
      "CV-4: \"relay_capture\" is declared uncovered (provider-executed); this proposal is on the record and cannot be approved through the gate."
    ],
    "requiresConfirmation": false
  },
  "v0.1/evidence-card-request/06-host-operation": {
    "protocolVersion": "0.1.0",
    "docketId": "8369aad4-b5ac-86d4-b6b7-504f90659f87",
    "affidavit": {
      "protocolVersion": "0.1.0",
      "operationType": "update",
      "entityType": "Invoice",
      "entityId": "invoice-1",
      "fields": [
        {
          "name": "status",
          "kind": "enum",
          "value": "Active",
          "previousValue": null,
          "provenance": {
            "current": {
              "source": "Conversation",
              "confidence": 0.9,
              "note": "Literally present in the turn: status",
              "at": "2026-09-04T09:00:00.000Z",
              "conversationTurn": null,
              "binding": null
            },
            "prior": []
          },
          "isMandatory": true
        },
        {
          "name": "amount",
          "kind": "number",
          "value": 40,
          "previousValue": null,
          "provenance": {
            "current": {
              "source": "Conversation",
              "confidence": 0.8,
              "note": "Literally present in the turn: amount",
              "at": "2026-09-04T09:00:00.000Z",
              "conversationTurn": null,
              "binding": null
            },
            "prior": []
          },
          "isMandatory": true
        },
        {
          "name": "dueOn",
          "kind": "date",
          "value": "2026-10-01",
          "previousValue": null,
          "provenance": {
            "current": {
              "source": "Inferred",
              "confidence": 0.6,
              "note": "Inferred from the turn: dueOn",
              "at": "2026-09-04T09:00:00.000Z",
              "conversationTurn": null,
              "binding": null
            },
            "prior": []
          },
          "isMandatory": false
        },
        {
          "name": "note",
          "kind": "text",
          "value": "raised in chat",
          "previousValue": null,
          "provenance": {
            "current": {
              "source": "Inferred",
              "confidence": 0.7,
              "note": "Inferred from the turn: note",
              "at": "2026-09-04T09:00:00.000Z",
              "conversationTurn": null,
              "binding": null
            },
            "prior": []
          },
          "isMandatory": false
        }
      ],
      "aggregateConfidence": 0.6,
      "populatedConfidence": 0.6,
      "emptyFieldCount": 0,
      "conversationTurn": null,
      "createdAt": "2026-09-04T09:00:00.000Z"
    },
    "requiredBy": "2026-09-04T09:30:00.000Z",
    "priorAmendments": null,
    "populatedConfidence": 0.6,
    "emptyFieldCount": 0,
    "blocked": null,
    "presentation": [
      {
        "name": "status",
        "kind": "enum",
        "allowedValues": [
          "Draft",
          "Active",
          "Retired"
        ]
      },
      {
        "name": "amount",
        "kind": "number",
        "pattern": "^\\d+(\\.\\d{1,2})?$"
      },
      {
        "name": "dueOn",
        "kind": "date"
      },
      {
        "name": "note",
        "kind": "text"
      }
    ],
    "warnings": [],
    "hostOperation": "WriteUpdate",
    "requiresConfirmation": true
  },
  "v0.1/evidence-card-request/90-missing-protocol-version": {
    "docketId": "8369aad4-b5ac-86d4-b6b7-504f90659f87",
    "affidavit": {
      "protocolVersion": "0.1.0",
      "operationType": "update",
      "entityType": "Invoice",
      "entityId": "invoice-1",
      "fields": [
        {
          "name": "status",
          "kind": "enum",
          "value": "Active",
          "previousValue": null,
          "provenance": {
            "current": {
              "source": "Conversation",
              "confidence": 0.9,
              "note": "Literally present in the turn: status",
              "at": "2026-09-04T09:00:00.000Z",
              "conversationTurn": null,
              "binding": null
            },
            "prior": []
          },
          "isMandatory": true
        },
        {
          "name": "amount",
          "kind": "number",
          "value": 40,
          "previousValue": null,
          "provenance": {
            "current": {
              "source": "Conversation",
              "confidence": 0.8,
              "note": "Literally present in the turn: amount",
              "at": "2026-09-04T09:00:00.000Z",
              "conversationTurn": null,
              "binding": null
            },
            "prior": []
          },
          "isMandatory": true
        },
        {
          "name": "dueOn",
          "kind": "date",
          "value": "2026-10-01",
          "previousValue": null,
          "provenance": {
            "current": {
              "source": "Inferred",
              "confidence": 0.6,
              "note": "Inferred from the turn: dueOn",
              "at": "2026-09-04T09:00:00.000Z",
              "conversationTurn": null,
              "binding": null
            },
            "prior": []
          },
          "isMandatory": false
        },
        {
          "name": "note",
          "kind": "text",
          "value": "raised in chat",
          "previousValue": null,
          "provenance": {
            "current": {
              "source": "Inferred",
              "confidence": 0.7,
              "note": "Inferred from the turn: note",
              "at": "2026-09-04T09:00:00.000Z",
              "conversationTurn": null,
              "binding": null
            },
            "prior": []
          },
          "isMandatory": false
        }
      ],
      "aggregateConfidence": 0.6,
      "populatedConfidence": 0.6,
      "emptyFieldCount": 0,
      "conversationTurn": null,
      "createdAt": "2026-09-04T09:00:00.000Z"
    },
    "requiredBy": "2026-09-04T09:30:00.000Z",
    "priorAmendments": null,
    "populatedConfidence": 0.6,
    "emptyFieldCount": 0,
    "blocked": null,
    "requiresConfirmation": true
  },
  "v0.1/evidence-card-request/91-presentation-unknown-key": {
    "protocolVersion": "0.1.0",
    "docketId": "8369aad4-b5ac-86d4-b6b7-504f90659f87",
    "affidavit": {
      "protocolVersion": "0.1.0",
      "operationType": "update",
      "entityType": "Invoice",
      "entityId": "invoice-1",
      "fields": [
        {
          "name": "status",
          "kind": "enum",
          "value": "Active",
          "previousValue": null,
          "provenance": {
            "current": {
              "source": "Conversation",
              "confidence": 0.9,
              "note": "Literally present in the turn: status",
              "at": "2026-09-04T09:00:00.000Z",
              "conversationTurn": null,
              "binding": null
            },
            "prior": []
          },
          "isMandatory": true
        },
        {
          "name": "amount",
          "kind": "number",
          "value": 40,
          "previousValue": null,
          "provenance": {
            "current": {
              "source": "Conversation",
              "confidence": 0.8,
              "note": "Literally present in the turn: amount",
              "at": "2026-09-04T09:00:00.000Z",
              "conversationTurn": null,
              "binding": null
            },
            "prior": []
          },
          "isMandatory": true
        },
        {
          "name": "dueOn",
          "kind": "date",
          "value": "2026-10-01",
          "previousValue": null,
          "provenance": {
            "current": {
              "source": "Inferred",
              "confidence": 0.6,
              "note": "Inferred from the turn: dueOn",
              "at": "2026-09-04T09:00:00.000Z",
              "conversationTurn": null,
              "binding": null
            },
            "prior": []
          },
          "isMandatory": false
        },
        {
          "name": "note",
          "kind": "text",
          "value": "raised in chat",
          "previousValue": null,
          "provenance": {
            "current": {
              "source": "Inferred",
              "confidence": 0.7,
              "note": "Inferred from the turn: note",
              "at": "2026-09-04T09:00:00.000Z",
              "conversationTurn": null,
              "binding": null
            },
            "prior": []
          },
          "isMandatory": false
        }
      ],
      "aggregateConfidence": 0.6,
      "populatedConfidence": 0.6,
      "emptyFieldCount": 0,
      "conversationTurn": null,
      "createdAt": "2026-09-04T09:00:00.000Z"
    },
    "requiredBy": "2026-09-04T09:30:00.000Z",
    "priorAmendments": null,
    "populatedConfidence": 0.6,
    "emptyFieldCount": 0,
    "blocked": null,
    "presentation": [
      {
        "name": "status",
        "kind": "enum",
        "allowedValues": [
          "Draft",
          "Active",
          "Retired"
        ],
        "required": true
      },
      {
        "name": "amount",
        "kind": "number",
        "pattern": "^\\d+(\\.\\d{1,2})?$"
      },
      {
        "name": "dueOn",
        "kind": "date"
      },
      {
        "name": "note",
        "kind": "text"
      }
    ],
    "warnings": [],
    "requiresConfirmation": true
  },
  "v0.1/evidence-card-request/92-warnings-not-an-array": {
    "protocolVersion": "0.1.0",
    "docketId": "8369aad4-b5ac-86d4-b6b7-504f90659f87",
    "affidavit": {
      "protocolVersion": "0.1.0",
      "operationType": "update",
      "entityType": "Invoice",
      "entityId": "invoice-1",
      "fields": [
        {
          "name": "status",
          "kind": "enum",
          "value": "Active",
          "previousValue": null,
          "provenance": {
            "current": {
              "source": "Conversation",
              "confidence": 0.9,
              "note": "Literally present in the turn: status",
              "at": "2026-09-04T09:00:00.000Z",
              "conversationTurn": null,
              "binding": null
            },
            "prior": []
          },
          "isMandatory": true
        },
        {
          "name": "amount",
          "kind": "number",
          "value": 40,
          "previousValue": null,
          "provenance": {
            "current": {
              "source": "Conversation",
              "confidence": 0.8,
              "note": "Literally present in the turn: amount",
              "at": "2026-09-04T09:00:00.000Z",
              "conversationTurn": null,
              "binding": null
            },
            "prior": []
          },
          "isMandatory": true
        },
        {
          "name": "dueOn",
          "kind": "date",
          "value": "2026-10-01",
          "previousValue": null,
          "provenance": {
            "current": {
              "source": "Inferred",
              "confidence": 0.6,
              "note": "Inferred from the turn: dueOn",
              "at": "2026-09-04T09:00:00.000Z",
              "conversationTurn": null,
              "binding": null
            },
            "prior": []
          },
          "isMandatory": false
        },
        {
          "name": "note",
          "kind": "text",
          "value": "raised in chat",
          "previousValue": null,
          "provenance": {
            "current": {
              "source": "Inferred",
              "confidence": 0.7,
              "note": "Inferred from the turn: note",
              "at": "2026-09-04T09:00:00.000Z",
              "conversationTurn": null,
              "binding": null
            },
            "prior": []
          },
          "isMandatory": false
        }
      ],
      "aggregateConfidence": 0.6,
      "populatedConfidence": 0.6,
      "emptyFieldCount": 0,
      "conversationTurn": null,
      "createdAt": "2026-09-04T09:00:00.000Z"
    },
    "requiredBy": "2026-09-04T09:30:00.000Z",
    "priorAmendments": null,
    "populatedConfidence": 0.6,
    "emptyFieldCount": 0,
    "blocked": null,
    "presentation": [
      {
        "name": "status",
        "kind": "enum",
        "allowedValues": [
          "Draft",
          "Active",
          "Retired"
        ]
      },
      {
        "name": "amount",
        "kind": "number",
        "pattern": "^\\d+(\\.\\d{1,2})?$"
      },
      {
        "name": "dueOn",
        "kind": "date"
      },
      {
        "name": "note",
        "kind": "text"
      }
    ],
    "warnings": "The total changed by more than 10x.",
    "requiresConfirmation": true
  },
  "v0.1/evidence-card-request/93-presentation-names-unknown-field": {
    "protocolVersion": "0.1.0",
    "docketId": "8369aad4-b5ac-86d4-b6b7-504f90659f87",
    "affidavit": {
      "protocolVersion": "0.1.0",
      "operationType": "update",
      "entityType": "Invoice",
      "entityId": "invoice-1",
      "fields": [
        {
          "name": "status",
          "kind": "enum",
          "value": "Active",
          "previousValue": null,
          "provenance": {
            "current": {
              "source": "Conversation",
              "confidence": 0.9,
              "note": "Literally present in the turn: status",
              "at": "2026-09-04T09:00:00.000Z",
              "conversationTurn": null,
              "binding": null
            },
            "prior": []
          },
          "isMandatory": true
        },
        {
          "name": "amount",
          "kind": "number",
          "value": 40,
          "previousValue": null,
          "provenance": {
            "current": {
              "source": "Conversation",
              "confidence": 0.8,
              "note": "Literally present in the turn: amount",
              "at": "2026-09-04T09:00:00.000Z",
              "conversationTurn": null,
              "binding": null
            },
            "prior": []
          },
          "isMandatory": true
        },
        {
          "name": "dueOn",
          "kind": "date",
          "value": "2026-10-01",
          "previousValue": null,
          "provenance": {
            "current": {
              "source": "Inferred",
              "confidence": 0.6,
              "note": "Inferred from the turn: dueOn",
              "at": "2026-09-04T09:00:00.000Z",
              "conversationTurn": null,
              "binding": null
            },
            "prior": []
          },
          "isMandatory": false
        },
        {
          "name": "note",
          "kind": "text",
          "value": "raised in chat",
          "previousValue": null,
          "provenance": {
            "current": {
              "source": "Inferred",
              "confidence": 0.7,
              "note": "Inferred from the turn: note",
              "at": "2026-09-04T09:00:00.000Z",
              "conversationTurn": null,
              "binding": null
            },
            "prior": []
          },
          "isMandatory": false
        }
      ],
      "aggregateConfidence": 0.6,
      "populatedConfidence": 0.6,
      "emptyFieldCount": 0,
      "conversationTurn": null,
      "createdAt": "2026-09-04T09:00:00.000Z"
    },
    "requiredBy": "2026-09-04T09:30:00.000Z",
    "priorAmendments": null,
    "populatedConfidence": 0.6,
    "emptyFieldCount": 0,
    "blocked": null,
    "presentation": [
      {
        "name": "status",
        "kind": "enum",
        "allowedValues": [
          "Draft",
          "Active",
          "Retired"
        ]
      },
      {
        "name": "amount",
        "kind": "number",
        "pattern": "^\\d+(\\.\\d{1,2})?$"
      },
      {
        "name": "dueDate",
        "kind": "date"
      },
      {
        "name": "note",
        "kind": "text"
      }
    ],
    "warnings": [],
    "requiresConfirmation": true
  },
  "v0.1/money/01-decimal-string": {
    "amount": "4000.10",
    "currency": "GBP"
  },
  "v0.1/money/02-negative-no-minor-units": {
    "currency": "JPY",
    "amount": "-1250"
  },
  "v0.1/money/90-numeric-amount": {
    "amount": 4000.1,
    "currency": "GBP"
  },
  "v0.1/notification/01-docket-expiring": {
    "protocolVersion": "0.1.0",
    "kind": "docket-expiring",
    "docketId": "80358c14-961a-875e-b20a-0a70a89e4592",
    "expiresAt": "2026-09-04T09:30:00.000Z"
  },
  "v0.1/notification/02-docket-expired": {
    "protocolVersion": "0.1.0",
    "kind": "docket-expired",
    "docketId": "80358c14-961a-875e-b20a-0a70a89e4592"
  },
  "v0.1/notification/03-docket-transition": {
    "protocolVersion": "0.1.0",
    "kind": "docket-transition",
    "docketId": "80358c14-961a-875e-b20a-0a70a89e4592",
    "from": "pending",
    "to": "expired",
    "execution": null
  },
  "v0.1/notification/90-expiring-without-deadline": {
    "protocolVersion": "0.1.0",
    "kind": "docket-expiring",
    "docketId": "80358c14-961a-875e-b20a-0a70a89e4592"
  },
  "v0.1/operation/01-update": "update",
  "v0.1/operation/90-delete": "delete",
  "v0.1/outside-gate/01-migration": {
    "reason": "Back-fill of 4,102 invoices imported from the legacy ledger on cut-over.",
    "recordedBy": "ops/migration-2026-09",
    "at": "2026-09-04T02:15:00.000Z"
  },
  "v0.1/outside-gate/90-missing-recorded-by": {
    "reason": "Back-fill of 4,102 invoices imported from the legacy ledger on cut-over.",
    "at": "2026-09-04T02:15:00.000Z"
  },
  "v0.1/provenance-chain/01-single-tag": {
    "current": {
      "source": "Conversation",
      "confidence": 0.9,
      "note": "Literally present in the turn: status",
      "at": "2026-09-04T09:00:00.000Z",
      "conversationTurn": null,
      "binding": null
    },
    "prior": []
  },
  "v0.1/provenance-chain/02-superseded": {
    "current": {
      "source": "UserStated",
      "confidence": 1,
      "note": "Amended by ana on Docket entry 4f3f031b-a7c4-867c-9b1f-be0de416040d",
      "at": "2026-09-04T09:00:00.000Z",
      "conversationTurn": null,
      "binding": {
        "kind": "reviewer-act",
        "ref": {
          "entryId": "4f3f031b-a7c4-867c-9b1f-be0de416040d",
          "decisionAt": "2026-09-04T09:00:00.000Z"
        }
      }
    },
    "prior": [
      {
        "source": "Conversation",
        "confidence": 0.9,
        "note": null,
        "at": "2026-09-04T09:00:00.000Z",
        "conversationTurn": null,
        "binding": null
      }
    ]
  },
  "v0.1/provenance-chain/90-missing-prior": {
    "current": {
      "source": "Conversation",
      "confidence": 0.9,
      "note": "Literally present in the turn: status",
      "at": "2026-09-04T09:00:00.000Z",
      "conversationTurn": null,
      "binding": null
    }
  },
  "v0.1/provenance-source/01-conversation": "Conversation",
  "v0.1/provenance-source/90-unknown-source": "Guessed",
  "v0.1/provenance-tag/01-conversation": {
    "source": "Conversation",
    "confidence": 0.9,
    "note": "Literally present in the turn: status",
    "at": "2026-09-04T09:00:00.000Z",
    "conversationTurn": null,
    "binding": null
  },
  "v0.1/provenance-tag/02-user-stated-reviewer-act": {
    "source": "UserStated",
    "confidence": 1,
    "note": "Amended by ana on Docket entry 4f3f031b-a7c4-867c-9b1f-be0de416040d",
    "at": "2026-09-04T09:00:00.000Z",
    "conversationTurn": null,
    "binding": {
      "kind": "reviewer-act",
      "ref": {
        "entryId": "4f3f031b-a7c4-867c-9b1f-be0de416040d",
        "decisionAt": "2026-09-04T09:00:00.000Z"
      }
    }
  },
  "v0.1/provenance-tag/90-confidence-out-of-range": {
    "source": "Conversation",
    "confidence": 1.4,
    "note": "Literally present in the turn: status",
    "at": "2026-09-04T09:00:00.000Z",
    "conversationTurn": null,
    "binding": null
  },
  "v0.1/telemetry-key/01-registry": {
    "protocolVersion": "0.1.0",
    "registryVersion": "0.1.0-alpha.0",
    "keys": [
      {
        "key": "affidavit.filed",
        "since": "0.1.0-alpha.0",
        "description": "An Affidavit was filed as a Docket entry.",
        "attributes": [
          "gen_ai.tool.name",
          "gen_ai.conversation.id",
          "entry.id",
          "docket.requirement",
          "docket.status",
          "affidavit.field_count",
          "created"
        ]
      },
      {
        "key": "affidavit.refused.substance",
        "since": "0.1.0-alpha.0",
        "description": "A proposal was refused before filing because it swore to nothing (GT-3).",
        "attributes": [
          "gen_ai.tool.name",
          "gen_ai.conversation.id",
          "affidavit.field_count",
          "reason"
        ]
      },
      {
        "key": "coverage.refused",
        "since": "0.1.0-alpha.0",
        "description": "A tool the gate must cover could not be intercepted, or a tool the host declared uncovered produced a proposal (CV-4).",
        "attributes": [
          "gen_ai.tool.name",
          "coverage.category",
          "phase"
        ]
      },
      {
        "key": "docket.transition",
        "since": "0.1.0-alpha.0",
        "description": "A Docket entry changed state (DK-1).",
        "attributes": [
          "entry.id",
          "gen_ai.conversation.id",
          "from",
          "to",
          "execution",
          "decision.kind",
          "attestation.kind",
          "amended"
        ]
      },
      {
        "key": "docket.expired",
        "since": "0.1.0-alpha.0",
        "description": "A pending Docket entry passed its expiry (DK-3).",
        "attributes": [
          "entry.id"
        ]
      },
      {
        "key": "decision.unauthorized",
        "since": "0.1.0-alpha.0",
        "description": "A decision was refused on identity grounds: no resolved principal, another tenant, or the host's authorization port said no (AZ-2).",
        "attributes": [
          "entry.id",
          "gen_ai.conversation.id",
          "reason",
          "principal.kind",
          "path"
        ]
      },
      {
        "key": "standing-order.fired",
        "since": "0.1.0-alpha.0",
        "description": "A Standing Order policy approved a write with no person present (AZ-1).",
        "attributes": [
          "policy.id",
          "policy.version",
          "entry.id",
          "risk.score"
        ]
      },
      {
        "key": "standing-order.blocked",
        "since": "0.1.0-alpha.0",
        "description": "A Standing Order verdict was not honoured: a proposed field the entity requires had no known value (GT-5), an unbound provenance input (PV-4), or a risk score above the policy's threshold (GT-5). `blocked.reason` is the stable code to alert on - `mandatory-field-empty`, `unbound-declared-input` or `risk-above-threshold`; `reason` is the sentence the reviewer sees on the card and is free to be rephrased.",
        "attributes": [
          "policy.id",
          "policy.version",
          "blocked.reason",
          "reason",
          "provenance.field",
          "provenance.source",
          "affidavit.empty_mandatory_fields",
          "risk.score",
          "risk.threshold"
        ]
      },
      {
        "key": "policy.invalid",
        "since": "0.1.0-alpha.0",
        "description": "A host's approval policy broke its own contract: an unusable deadline, or an evaluate that threw (GT-4, CV-1).",
        "attributes": [
          "policy.id",
          "policy.version",
          "option",
          "reason"
        ]
      }
    ]
  },
  "v0.1/telemetry-key/90-key-without-attributes": {
    "protocolVersion": "0.1.0",
    "registryVersion": "0.1.0-alpha.0",
    "keys": [
      {
        "key": "affidavit.filed",
        "since": "0.1.0-alpha.0",
        "description": "An Affidavit was filed as a Docket entry."
      }
    ]
  },
  "v0.1/tool-result/01-write-proposal": {
    "kind": "write",
    "entryId": "8369aad4-b5ac-86d4-b6b7-504f90659f87",
    "status": "pending",
    "card": {
      "protocolVersion": "0.1.0",
      "docketId": "8369aad4-b5ac-86d4-b6b7-504f90659f87",
      "affidavit": {
        "protocolVersion": "0.1.0",
        "operationType": "update",
        "entityType": "Invoice",
        "entityId": "invoice-1",
        "fields": [
          {
            "name": "status",
            "kind": "enum",
            "value": "Active",
            "previousValue": null,
            "provenance": {
              "current": {
                "source": "Conversation",
                "confidence": 0.9,
                "note": "Literally present in the turn: status",
                "at": "2026-09-04T09:00:00.000Z",
                "conversationTurn": null,
                "binding": null
              },
              "prior": []
            },
            "isMandatory": true
          },
          {
            "name": "amount",
            "kind": "number",
            "value": 40,
            "previousValue": null,
            "provenance": {
              "current": {
                "source": "Conversation",
                "confidence": 0.8,
                "note": "Literally present in the turn: amount",
                "at": "2026-09-04T09:00:00.000Z",
                "conversationTurn": null,
                "binding": null
              },
              "prior": []
            },
            "isMandatory": true
          },
          {
            "name": "dueOn",
            "kind": "date",
            "value": "2026-10-01",
            "previousValue": null,
            "provenance": {
              "current": {
                "source": "Inferred",
                "confidence": 0.6,
                "note": "Inferred from the turn: dueOn",
                "at": "2026-09-04T09:00:00.000Z",
                "conversationTurn": null,
                "binding": null
              },
              "prior": []
            },
            "isMandatory": false
          },
          {
            "name": "note",
            "kind": "text",
            "value": "raised in chat",
            "previousValue": null,
            "provenance": {
              "current": {
                "source": "Inferred",
                "confidence": 0.7,
                "note": "Inferred from the turn: note",
                "at": "2026-09-04T09:00:00.000Z",
                "conversationTurn": null,
                "binding": null
              },
              "prior": []
            },
            "isMandatory": false
          }
        ],
        "aggregateConfidence": 0.6,
        "populatedConfidence": 0.6,
        "emptyFieldCount": 0,
        "conversationTurn": null,
        "createdAt": "2026-09-04T09:00:00.000Z"
      },
      "requiredBy": "2026-09-04T09:30:00.000Z",
      "priorAmendments": null,
      "populatedConfidence": 0.6,
      "emptyFieldCount": 0,
      "blocked": null,
      "requiresConfirmation": true
    }
  },
  "v0.1/tool-result/02-error-substance-refused": {
    "kind": "error",
    "code": "substance-refused",
    "message": "GT-3: this proposal swears to nothing — field \"status\" carries a value with Empty provenance. It is not filed, not counted and not broadcast."
  },
  "v0.1/tool-result/03-read": {
    "kind": "read",
    "result": {
      "id": "invoice-1",
      "total": {
        "amount": "4000.10",
        "currency": "GBP"
      }
    }
  },
  "v0.1/tool-result/90-unregistered-error-code": {
    "kind": "error",
    "code": "gate-refused",
    "message": "GT-3: this proposal swears to nothing — field \"status\" carries a value with Empty provenance. It is not filed, not counted and not broadcast."
  },
};

/** `conformance/fixtures/MANIFEST.json` at the pinned ref. */
export const manifest = {
  "protocolVersion": "0.0.1-seed",
  "$note": "The wire fixtures are hand-authored examples, not captures. Their key sets are asserted against the shipped .NET serializer by the hosts' wire-shape tests; their values are illustrative. The 0.1.0 section below is a second, independent fixture set: its documents were produced by running the TypeScript reference implementation and writing down what it emitted, then completing the properties the v0.1 schemas add and the reference implementation does not yet carry (see 0.1.0.derivedFrom).",
  "derivedFrom": {
    "framework": "Sakwala/affiant v1.0.0-beta.1 (b37e139) — the framework commit whose models and serializer settings the shapes were asserted against",
    "hosts": "Sakwala/affiant-host-apps 966d6df — Meridian and HR Portal, whose WireShapeTests compare these key sets against the real serializer",
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
      "notes": "A host payload, not protocol core: how one host tells its own client what became of a review it was showing. Included as a reference shape because its outcome field is one of the closed sets in enum-values.json. No schema in this seed."
    },
    {
      "id": "wire/session-rehydrated",
      "file": "wire/session-rehydrated.json",
      "kind": "host-hub-payload",
      "schema": null,
      "schemaRelevant": false,
      "notes": "A host payload, not protocol core: how one host tells a reconnecting client how many reviews are still waiting. Included as a reference shape. No schema in this seed."
    },
    {
      "id": "wire/guide-ui",
      "file": "wire/guide-ui.json",
      "kind": "transport-ui",
      "schema": null,
      "schemaRelevant": false,
      "notes": "A transport payload for a UI walkthrough: a route to navigate to and an ordered list of steps, each naming an element by its registered semantic id rather than a selector. Its meaning stays with the host surface that renders it; included here as a reference shape. No schema in this seed."
    },
    {
      "id": "wire/system-notification",
      "file": "wire/system-notification.json",
      "kind": "transport-ui",
      "schema": null,
      "schemaRelevant": false,
      "notes": "A transport payload for a transient message to a UI. Included as a reference shape because its level field is one of the closed sets in enum-values.json. No schema in this seed."
    }
  ],
  "enums": {
    "file": "enum-values.json",
    "sets": [
      {
        "id": "enum/actionDecisionResultOutcome",
        "appliesTo": "the outcome field of wire/action-decision-result; from v0.1 the same closed set is the `outcome` of the protocol's own decision-result envelope",
        "schema": null,
        "v01Schema": "schemas/0.1.0/decision-result.schema.json",
        "v01Pointer": "/properties/outcome/enum"
      },
      {
        "id": "enum/provenanceSource",
        "appliesTo": "the source field of every provenance tag",
        "schema": "schemas/provenance-source.schema.json",
        "v01Schema": "schemas/0.1.0/provenance-source.schema.json"
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
  },
  "0.1.0": {
    "protocolVersion": "0.1.0",
    "schemas": "schemas/0.1.0",
    "$note": "One positive fixture per v0.1 schema at least, and at least one negative per schema. A POSITIVE must validate against the schema the row names; a NEGATIVE must fail it. A negative is a single deliberate mutation of a named positive — one required key removed, or one enum value replaced — so the lint proves the schema refuses what the rulebook says it must, not merely that it accepts what it should. A negative marked `\"check\": \"cross-object\"` states a relation between two objects that no JSON Schema can express: the schema accepts it and the lint refuses it. common.schema.json carries definitions and no payload of its own, so it is listed in definitionsOnly and exempt from the \"every schema has a fixture\" check.",
    "derivedFrom": {
      "referenceImplementation": "Sakwala/affiant-ts @affiant/core 0.1.0-alpha.0 (c4591ea) — every positive below except the four noted was produced by running one of that package's 56 declarative fixtures through the gate and writing down the Docket row, the Evidence Card or the tool result it emitted; the `derivedFrom` on each row names the fixture it came from",
      "completedBy": "Two properties the v0.1 schemas add and the reference implementation does not yet carry were filled in when the documents were written down: `protocolVersion` on every envelope (SR-4; the reference stamps the tag it pins, 0.0.1-seed) and `protocolVersion` on the Affidavit itself. The card's presentation hints were moved, not invented: the reference carries allowedValues and pattern on each field of the wire Affidavit and v0.1 puts them on the envelope, so the rows that carry them say so. Nothing else was edited: the ids are the real derived UUIDs, the instants are the fixtures' pinned clock, the confidence numbers are what the implementation computed, and the warning sentences are verbatim.",
      "authored": "Four shapes no implementation emits yet were authored from INVARIANTS.md and are marked as such on their own rows: the outside-gate marker (AZ-1), and the three notification envelopes (DK-1, DK-3), whose docket ids are nonetheless real ids from a real run.",
      "date": "2026-09-04"
    },
    "definitionsOnly": [
      "schemas/0.1.0/common.schema.json"
    ],
    "fixtures": [
      {
        "id": "v0.1/affidavit-field/01-conversation-tagged",
        "file": "v0.1/affidavit-field/01-conversation-tagged.json",
        "schema": "schemas/0.1.0/affidavit-field.schema.json",
        "kind": "positive",
        "derivedFrom": "@affiant/core fixture sequence-a/typed-inputs-on-the-card (Sakwala/affiant-ts, packages/core/test/fixtures)",
        "notes": "One sworn field, tagged Conversation because the value was literally present in the turn. previousValue is null: the projection port had no stored value for it."
      },
      {
        "id": "v0.1/affidavit-field/02-external-bound",
        "file": "v0.1/affidavit-field/02-external-bound.json",
        "schema": "schemas/0.1.0/affidavit-field.schema.json",
        "kind": "positive",
        "derivedFrom": "@affiant/core fixture sequence-a/picker-external-binding (Sakwala/affiant-ts, packages/core/test/fixtures)",
        "notes": "The interceptor’s External tag beat the model’s Conversation tag on the ladder, and the model’s tag is kept in the chain so a card can show that the two disagreed."
      },
      {
        "id": "v0.1/affidavit-field/90-unknown-kind",
        "file": "v0.1/affidavit-field/90-unknown-kind.json",
        "schema": "schemas/0.1.0/affidavit-field.schema.json",
        "kind": "negative",
        "derivedFrom": "Mutation of v0.1/affidavit-field/01-conversation-tagged.json",
        "notes": "kind is \"money\", which is not one of the four rendering hints. A monetary field is a `number`-kinded field whose value is a Money object (SR-2); the kind set stays closed."
      },
      {
        "id": "v0.1/affidavit/01-update-shaped",
        "file": "v0.1/affidavit/01-update-shaped.json",
        "schema": "schemas/0.1.0/affidavit.schema.json",
        "kind": "positive",
        "derivedFrom": "@affiant/core fixture sequence-a/typed-inputs-on-the-card (Sakwala/affiant-ts, packages/core/test/fixtures)",
        "notes": "An update-shaped Affidavit over four typed fields, two Conversation-tagged and two Inferred. aggregateConfidence 0.6 is the minimum, not the mean (AF-2)."
      },
      {
        "id": "v0.1/affidavit/02-amended",
        "file": "v0.1/affidavit/02-amended.json",
        "schema": "schemas/0.1.0/affidavit.schema.json",
        "kind": "positive",
        "derivedFrom": "@affiant/core fixture decide/amend-recompute (Sakwala/affiant-ts, packages/core/test/fixtures)",
        "notes": "The accepted state after the amendment. An amended field’s current tag is UserStated with a reviewer-act binding, placed on top of the chain so the machine’s pre-correction tag is preserved below it, never replaced."
      },
      {
        "id": "v0.1/affidavit/90-missing-populated-confidence",
        "file": "v0.1/affidavit/90-missing-populated-confidence.json",
        "schema": "schemas/0.1.0/affidavit.schema.json",
        "kind": "negative",
        "derivedFrom": "Mutation of v0.1/affidavit/01-update-shaped.json",
        "notes": "populatedConfidence removed. It is required and nullable, never absent: \"there is nothing populated to be confident about\" is a statement the record has to be able to make (AF-2)."
      },
      {
        "id": "v0.1/amendments/01-accepted",
        "file": "v0.1/amendments/01-accepted.json",
        "schema": "schemas/0.1.0/amendments.schema.json",
        "kind": "positive",
        "derivedFrom": "@affiant/core fixture decide/amend-recompute (Sakwala/affiant-ts, packages/core/test/fixtures)",
        "notes": "The map that approval accepted. A null under a key means the reviewer cleared the field; an absent key means they left it alone (DK-2)."
      },
      {
        "id": "v0.1/amendments/90-not-an-object",
        "file": "v0.1/amendments/90-not-an-object.json",
        "schema": "schemas/0.1.0/amendments.schema.json",
        "kind": "negative",
        "derivedFrom": "Mutation of v0.1/amendments/01-accepted.json",
        "notes": "An array of pairs instead of an object keyed by field name. The key set is load-bearing: DK-2’s distinction between a key holding null (cleared) and an absent key (untouched) exists only in an object."
      },
      {
        "id": "v0.1/attestation/01-member",
        "file": "v0.1/attestation/01-member.json",
        "schema": "schemas/0.1.0/attestation.schema.json",
        "kind": "positive",
        "derivedFrom": "@affiant/core fixture decide/approve (Sakwala/affiant-ts, packages/core/test/fixtures)",
        "notes": "A human-verified session attested this write. The mode is the kind of `by`; there is no second mode field to drift from it."
      },
      {
        "id": "v0.1/attestation/02-standing-order",
        "file": "v0.1/attestation/02-standing-order.json",
        "schema": "schemas/0.1.0/attestation.schema.json",
        "kind": "positive",
        "derivedFrom": "@affiant/core fixture gate/standing-order-by-the-book (Sakwala/affiant-ts, packages/core/test/fixtures)",
        "notes": "A Standing Order attestation: the policy that fired and the version of it that was speaking, so a later reader can tell what the policy said at the time."
      },
      {
        "id": "v0.1/attestation/03-member-via-relay",
        "file": "v0.1/attestation/03-member-via-relay.json",
        "schema": "schemas/0.1.0/attestation.schema.json",
        "kind": "positive",
        "derivedFrom": "@affiant/core fixture decide/relay-member-via-relay (Sakwala/affiant-ts, packages/core/test/fixtures)",
        "notes": "A person decided through a relay that asserted their identity rather than authenticating them. A machine caller may never attest `member`: both the person and the relay are named (AZ-3)."
      },
      {
        "id": "v0.1/attestation/90-service-attestor",
        "file": "v0.1/attestation/90-service-attestor.json",
        "schema": "schemas/0.1.0/attestation.schema.json",
        "kind": "negative",
        "derivedFrom": "Mutation of v0.1/attestation/01-member.json",
        "notes": "A `service` attestor. AZ-3 admits three kinds and none of them is a bare machine caller: a decision made through a relay attests member-via-relay, naming both the person and the relay."
      },
      {
        "id": "v0.1/binding/01-external-ref",
        "file": "v0.1/binding/01-external-ref.json",
        "schema": "schemas/0.1.0/binding.schema.json",
        "kind": "positive",
        "derivedFrom": "@affiant/core fixture sequence-a/picker-external-binding (Sakwala/affiant-ts, packages/core/test/fixtures)",
        "notes": "A value read from a system of record, bound to the record it came from. system and recordId are what an auditor re-fetches; a binding whose source cannot be re-verified is not a binding (PV-2)."
      },
      {
        "id": "v0.1/binding/02-reviewer-act",
        "file": "v0.1/binding/02-reviewer-act.json",
        "schema": "schemas/0.1.0/binding.schema.json",
        "kind": "positive",
        "derivedFrom": "@affiant/core fixture decide/amend-recompute (Sakwala/affiant-ts, packages/core/test/fixtures)",
        "notes": "The binding on that tag: the Docket decision the correction was made on, and when."
      },
      {
        "id": "v0.1/binding/90-unknown-kind",
        "file": "v0.1/binding/90-unknown-kind.json",
        "schema": "schemas/0.1.0/binding.schema.json",
        "kind": "negative",
        "derivedFrom": "Mutation of v0.1/binding/01-external-ref.json",
        "notes": "A sixth binding kind. A binding kind nobody can enumerate is a binding nobody can audit (PV-2)."
      },
      {
        "id": "v0.1/blocked/01-coverage-refused",
        "file": "v0.1/blocked/01-coverage-refused.json",
        "schema": "schemas/0.1.0/blocked.schema.json",
        "kind": "positive",
        "derivedFrom": "@affiant/core fixture gate/coverage-refused-declared (Sakwala/affiant-ts, packages/core/test/fixtures)",
        "notes": "The marker on that row: the uncovered category and the tool it came from, so coverage can be re-assessed on resubmission."
      },
      {
        "id": "v0.1/blocked/02-requirement-not-implemented",
        "file": "v0.1/blocked/02-requirement-not-implemented.json",
        "schema": "schemas/0.1.0/blocked.schema.json",
        "kind": "positive",
        "derivedFrom": "@affiant/core fixture gate/multiparty-blocked (Sakwala/affiant-ts, packages/core/test/fixtures)",
        "notes": "A MultiParty verdict reached a version that does not run one. The level is recorded verbatim and never degraded to the weaker requirement this version does know how to run (AZ-4)."
      },
      {
        "id": "v0.1/blocked/90-coverage-refused-with-level",
        "file": "v0.1/blocked/90-coverage-refused-with-level.json",
        "schema": "schemas/0.1.0/blocked.schema.json",
        "kind": "negative",
        "derivedFrom": "Mutation of v0.1/blocked/01-coverage-refused.json",
        "notes": "A coverage refusal carrying a requirement level and no category or tool name. It matches neither arm: a coverage refusal has no requirement level to report, and it must name the tool so coverage can be re-assessed on resubmission (CV-4)."
      },
      {
        "id": "v0.1/decision-result/01-approved",
        "file": "v0.1/decision-result/01-approved.json",
        "schema": "schemas/0.1.0/decision-result.schema.json",
        "kind": "positive",
        "derivedFrom": "@affiant/core fixture decide/approve (Sakwala/affiant-ts, packages/core/test/fixtures)",
        "notes": "The same decision as a report back to a reviewer surface. A report, never an authorization: the row is the record (AZ-5)."
      },
      {
        "id": "v0.1/decision-result/02-executed",
        "file": "v0.1/decision-result/02-executed.json",
        "schema": "schemas/0.1.0/decision-result.schema.json",
        "kind": "positive",
        "derivedFrom": "@affiant/core fixture decide/execution-executed (Sakwala/affiant-ts, packages/core/test/fixtures)",
        "notes": "The same entry reported after execution: an approved-and-committed write, distinguishable on the record from an approved-but-failed one."
      },
      {
        "id": "v0.1/decision-result/90-missing-attestation",
        "file": "v0.1/decision-result/90-missing-attestation.json",
        "schema": "schemas/0.1.0/decision-result.schema.json",
        "kind": "negative",
        "derivedFrom": "Mutation of v0.1/decision-result/01-approved.json",
        "notes": "The attestation property removed rather than set to null. No attribution, no execution (AZ-1) — and a report that leaves the slot off cannot say whether nobody agreed or nobody was asked."
      },
      {
        "id": "v0.1/docket-entry/01-pending-reviewer-confirmation",
        "file": "v0.1/docket-entry/01-pending-reviewer-confirmation.json",
        "schema": "schemas/0.1.0/docket-entry.schema.json",
        "kind": "positive",
        "derivedFrom": "@affiant/core fixture sequence-a/typed-inputs-on-the-card (Sakwala/affiant-ts, packages/core/test/fixtures)",
        "notes": "A first filing: pending, ReviewerConfirmation, nothing decided, nothing blocked, no lineage. Every nullable property is present and null, which is what \"absent means null\" looks like on a row nobody has acted on."
      },
      {
        "id": "v0.1/docket-entry/02-approved-unexecuted",
        "file": "v0.1/docket-entry/02-approved-unexecuted.json",
        "schema": "schemas/0.1.0/docket-entry.schema.json",
        "kind": "positive",
        "derivedFrom": "@affiant/core fixture decide/approve (Sakwala/affiant-ts, packages/core/test/fixtures)",
        "notes": "The same row after a member approved it: approved, execution unexecuted, the decision record beside the attestation, decidedAt stamped. The attestation is written in the same operation as the transition, so there is no window in which an approved write has no attribution (AZ-1)."
      },
      {
        "id": "v0.1/docket-entry/03-amended-on-approval",
        "file": "v0.1/docket-entry/03-amended-on-approval.json",
        "schema": "schemas/0.1.0/docket-entry.schema.json",
        "kind": "positive",
        "derivedFrom": "@affiant/core fixture decide/amend-recompute (Sakwala/affiant-ts, packages/core/test/fixtures)",
        "notes": "An approval that carried amendments: the proposal is untouched under `affidavit` and the accepted state sits beside it under `amendedAffidavit`, with the three numbers recomputed (AF-4, DK-4)."
      },
      {
        "id": "v0.1/docket-entry/04-standing-order-approved",
        "file": "v0.1/docket-entry/04-standing-order-approved.json",
        "schema": "schemas/0.1.0/docket-entry.schema.json",
        "kind": "positive",
        "derivedFrom": "@affiant/core fixture gate/standing-order-by-the-book (Sakwala/affiant-ts, packages/core/test/fixtures)",
        "notes": "A policy approved this write with no person present: the row is filed approved and unexecuted with its attestation in the same write, and there is no decision record — nobody chose anything (AZ-1, GT-5)."
      },
      {
        "id": "v0.1/docket-entry/05-blocked-coverage-refused",
        "file": "v0.1/docket-entry/05-blocked-coverage-refused.json",
        "schema": "schemas/0.1.0/docket-entry.schema.json",
        "kind": "positive",
        "derivedFrom": "@affiant/core fixture gate/coverage-refused-declared (Sakwala/affiant-ts, packages/core/test/fixtures)",
        "notes": "A proposal from a tool the host declared the gate cannot intercept: recorded on the Docket, pending, blocked, and never silently allowed to write (CV-4)."
      },
      {
        "id": "v0.1/docket-entry/06-executed",
        "file": "v0.1/docket-entry/06-executed.json",
        "schema": "schemas/0.1.0/docket-entry.schema.json",
        "kind": "positive",
        "derivedFrom": "@affiant/core fixture decide/execution-executed (Sakwala/affiant-ts, packages/core/test/fixtures)",
        "notes": "The host’s executor reported. The only path to execution \"executed\" is that report — the framework never performs the write (AZ-7) — and the outcome is recorded once (DK-1)."
      },
      {
        "id": "v0.1/docket-entry/07-expired-amendments-preserved",
        "file": "v0.1/docket-entry/07-expired-amendments-preserved.json",
        "schema": "schemas/0.1.0/docket-entry.schema.json",
        "kind": "positive",
        "derivedFrom": "@affiant/core fixture sequence-a/late-amendments-preserved (Sakwala/affiant-ts, packages/core/test/fixtures)",
        "notes": "A decision arrived after the deadline and was refused; because it came from a principal who could have decided, its amendments are preserved on the row with the instant and the principal of the act, and the row records its successor (DK-1)."
      },
      {
        "id": "v0.1/docket-entry/08-resubmitted",
        "file": "v0.1/docket-entry/08-resubmitted.json",
        "schema": "schemas/0.1.0/docket-entry.schema.json",
        "kind": "positive",
        "derivedFrom": "@affiant/core fixture sequence-a/late-amendments-preserved (Sakwala/affiant-ts, packages/core/test/fixtures)",
        "notes": "The resubmission: a NEW entry whose lineage names the entry it supersedes, prefilled from the preserved amendments as the person’s own correction. The superseded entry keeps its terminal state — nothing once decided is edited (DK-1, DK-4)."
      },
      {
        "id": "v0.1/docket-entry/90-deferred-status",
        "file": "v0.1/docket-entry/90-deferred-status.json",
        "schema": "schemas/0.1.0/docket-entry.schema.json",
        "kind": "negative",
        "derivedFrom": "Mutation of v0.1/docket-entry/01-pending-reviewer-confirmation.json",
        "notes": "status \"deferred\". The state is RESERVED for protocol v0.2 and deliberately absent from v0.1: no implementation has run the transition, and the shipped .NET gate writes it on a ReferralRequired verdict today — which is exactly what the parity manifest carries until the transition is specified (DK-1)."
      },
      {
        "id": "v0.1/entity-ref/01-update",
        "file": "v0.1/entity-ref/01-update.json",
        "schema": "schemas/0.1.0/entity-ref.schema.json",
        "kind": "positive",
        "derivedFrom": "@affiant/core fixture sequence-a/typed-inputs-on-the-card (Sakwala/affiant-ts, packages/core/test/fixtures)",
        "notes": "The entity the same Affidavit is about. entityId is non-null, so the operation is update-shaped (AF-3)."
      },
      {
        "id": "v0.1/entity-ref/90-missing-entity-id",
        "file": "v0.1/entity-ref/90-missing-entity-id.json",
        "schema": "schemas/0.1.0/entity-ref.schema.json",
        "kind": "negative",
        "derivedFrom": "Mutation of v0.1/entity-ref/01-update.json",
        "notes": "entityId removed. Absent means null on this wire, and a shape that can omit the key cannot express AF-3’s create/update distinction."
      },
      {
        "id": "v0.1/error-code/01-substance-refused",
        "file": "v0.1/error-code/01-substance-refused.json",
        "schema": "schemas/0.1.0/error-code.schema.json",
        "kind": "positive",
        "derivedFrom": "INVARIANTS.md refusal-code list; @affiant/core ERROR_CODES (Sakwala/affiant-ts)",
        "notes": "One refusal code, as it appears on a tool-result error arm. Fixed by the rulebook’s v0.1 text, not provisional."
      },
      {
        "id": "v0.1/error-code/90-unregistered-code",
        "file": "v0.1/error-code/90-unregistered-code.json",
        "schema": "schemas/0.1.0/error-code.schema.json",
        "kind": "negative",
        "derivedFrom": "Mutation of v0.1/error-code/01-substance-refused.json",
        "notes": "A code that is not in the registry. An implementation MAY add codes, but a payload claiming one of the registry’s meanings has to spell it the registry’s way — and \"decision-refused\" is not a name the rulebook fixes."
      },
      {
        "id": "v0.1/evidence-card-request/01-first-filing",
        "file": "v0.1/evidence-card-request/01-first-filing.json",
        "schema": "schemas/0.1.0/evidence-card-request.schema.json",
        "kind": "positive",
        "derivedFrom": "@affiant/core fixture sequence-a/typed-inputs-on-the-card (Sakwala/affiant-ts, packages/core/test/fixtures)",
        "notes": "The card for that filing: priorAmendments null (a first filing), the two confidence companions repeated on the envelope, blocked null, and a confirmation genuinely being asked for."
      },
      {
        "id": "v0.1/evidence-card-request/02-blocked",
        "file": "v0.1/evidence-card-request/02-blocked.json",
        "schema": "schemas/0.1.0/evidence-card-request.schema.json",
        "kind": "positive",
        "derivedFrom": "@affiant/core fixture gate/coverage-refused-declared (Sakwala/affiant-ts, packages/core/test/fixtures)",
        "notes": "The card for a blocked entry. requiresConfirmation is false: a card carrying a marker that says no decision will be accepted must not also offer an approve button that cannot work."
      },
      {
        "id": "v0.1/evidence-card-request/03-resubmission",
        "file": "v0.1/evidence-card-request/03-resubmission.json",
        "schema": "schemas/0.1.0/evidence-card-request.schema.json",
        "kind": "positive",
        "derivedFrom": "@affiant/core fixture sequence-a/late-amendments-preserved (Sakwala/affiant-ts, packages/core/test/fixtures)",
        "notes": "The card the next reviewer sees: priorAmendments carries what was already agreed on the entry that expired."
      },
      {
        "id": "v0.1/evidence-card-request/04-presentation-hints",
        "file": "v0.1/evidence-card-request/04-presentation-hints.json",
        "schema": "schemas/0.1.0/evidence-card-request.schema.json",
        "kind": "positive",
        "derivedFrom": "@affiant/core fixture sequence-a/typed-inputs-on-the-card (Sakwala/affiant-ts, packages/core/test/fixtures)",
        "notes": "The same card as 01-first-filing with the presentation the host supplied: the enum's closed set, the number's input pattern, and a kind for the date and the free text. In the reference implementation these ride on each field of the wire Affidavit; from v0.1 they are on the envelope, because the record swears to what a value is and where it came from, not to how it is shown. The pattern sits on the number field, which is where that fixture's tool schema declares it — the date field declares no pattern, and a surface renders it from its kind alone. warnings is the empty array the same run emitted. 01-first-filing carries neither property, which is the other half of the check: both are optional and a card with no hints is valid."
      },
      {
        "id": "v0.1/evidence-card-request/05-blocked-with-warnings",
        "file": "v0.1/evidence-card-request/05-blocked-with-warnings.json",
        "schema": "schemas/0.1.0/evidence-card-request.schema.json",
        "kind": "positive",
        "derivedFrom": "@affiant/core fixture gate/coverage-refused-declared (Sakwala/affiant-ts, packages/core/test/fixtures)",
        "notes": "The same card as 02-blocked with the warning that run emitted, verbatim. The sentence and the blocked marker say the same thing twice on purpose: the marker is what a surface switches on, the sentence is what a person reads. presentation is absent — that host declared no field schema, so there were no constraints to carry — which shows the two properties are independent."
      },
      {
        "id": "v0.1/evidence-card-request/06-host-operation",
        "file": "v0.1/evidence-card-request/06-host-operation.json",
        "schema": "schemas/0.1.0/evidence-card-request.schema.json",
        "kind": "positive",
        "derivedFrom": "@affiant/core fixture sequence-a/typed-inputs-on-the-card (Sakwala/affiant-ts, packages/core/test/fixtures), with hostOperation authored: that fixture wires its tool up without an operation label, so no run of it emits one",
        "notes": "The same card as 04-presentation-hints, carrying the host's own verb for the operation. The value is the one the shipped .NET wire puts in affidavit.operationType at 0.0.1-seed, \"WriteUpdate\", because that is the migration this property exists for: v0.1 makes operationType the protocol's two-valued SHAPE, so a rule about shape stays a predicate a policy can test without knowing any host's vocabulary, and the host's own word travels beside it on the envelope instead of being dropped. 04-presentation-hints carries no hostOperation, which is the other half of the check: the property is optional and a card without it is valid."
      },
      {
        "id": "v0.1/evidence-card-request/90-missing-protocol-version",
        "file": "v0.1/evidence-card-request/90-missing-protocol-version.json",
        "schema": "schemas/0.1.0/evidence-card-request.schema.json",
        "kind": "negative",
        "derivedFrom": "Mutation of v0.1/evidence-card-request/01-first-filing.json",
        "notes": "protocolVersion removed. Every envelope carries it from v0.1 (SR-4), so a consumer can tell which version of the format it received instead of inferring it from the shape."
      },
      {
        "id": "v0.1/evidence-card-request/91-presentation-unknown-key",
        "file": "v0.1/evidence-card-request/91-presentation-unknown-key.json",
        "schema": "schemas/0.1.0/evidence-card-request.schema.json",
        "kind": "negative",
        "derivedFrom": "Mutation of v0.1/evidence-card-request/04-presentation-hints.json",
        "notes": "A presentation entry gains \"required\": true. A presentation hint is a closed object like every other core object (SR-3): a host with a fifth thing to say about an input says it in its own channel, not by widening this one until two implementations disagree about what a card carries."
      },
      {
        "id": "v0.1/evidence-card-request/92-warnings-not-an-array",
        "file": "v0.1/evidence-card-request/92-warnings-not-an-array.json",
        "schema": "schemas/0.1.0/evidence-card-request.schema.json",
        "kind": "negative",
        "derivedFrom": "Mutation of v0.1/evidence-card-request/04-presentation-hints.json",
        "notes": "warnings is a single string instead of an array of them. A surface that concatenates a string character by character renders nothing a person can read, and one warning is still a list of one."
      },
      {
        "id": "v0.1/evidence-card-request/93-presentation-names-unknown-field",
        "file": "v0.1/evidence-card-request/93-presentation-names-unknown-field.json",
        "schema": "schemas/0.1.0/evidence-card-request.schema.json",
        "kind": "negative",
        "check": "cross-object",
        "derivedFrom": "Mutation of v0.1/evidence-card-request/04-presentation-hints.json",
        "notes": "A presentation entry names \"dueDate\", which is not a field of this card's Affidavit — the field is \"dueOn\". A hint for a field that is not on the record renders a control over nothing. This is a relation between two objects and no JSON Schema can express it, so the schema ACCEPTS this document and the fixture lint refuses it; see conformance/lint/lint.mjs."
      },
      {
        "id": "v0.1/money/01-decimal-string",
        "file": "v0.1/money/01-decimal-string.json",
        "schema": "schemas/0.1.0/money.schema.json",
        "kind": "positive",
        "derivedFrom": "@affiant/core fixture canonical/money-and-escapes, field \"Total\" (Sakwala/affiant-ts)",
        "notes": "A GBP amount with cents a binary float would lose. Two strings, never a JSON number: a card showing 4000.10 and a store holding 4000.099999999999 disagree about what was approved, and nothing in the record would say which one the reviewer saw (SR-2)."
      },
      {
        "id": "v0.1/money/02-negative-no-minor-units",
        "file": "v0.1/money/02-negative-no-minor-units.json",
        "schema": "schemas/0.1.0/money.schema.json",
        "kind": "positive",
        "derivedFrom": "@affiant/core fixture canonical/money-and-escapes, field \"Refund\" (Sakwala/affiant-ts)",
        "notes": "A negative amount in a currency with no minor units. The scale a currency allows is the host’s declaration; the schema checks the shape."
      },
      {
        "id": "v0.1/money/90-numeric-amount",
        "file": "v0.1/money/90-numeric-amount.json",
        "schema": "schemas/0.1.0/money.schema.json",
        "kind": "negative",
        "derivedFrom": "Mutation of v0.1/money/01-decimal-string.json",
        "notes": "The amount as a JSON number. A binary float cannot represent 4000.10, so the card and the store would disagree about what was approved and nothing in the record would say which one the reviewer saw (SR-2)."
      },
      {
        "id": "v0.1/notification/01-docket-expiring",
        "file": "v0.1/notification/01-docket-expiring.json",
        "schema": "schemas/0.1.0/notification.schema.json",
        "kind": "positive",
        "derivedFrom": "@affiant/core fixture sequence-a/late-amendments-preserved (Sakwala/affiant-ts, packages/core/test/fixtures) — the entry is real; the envelope is authored to INVARIANTS.md DK-3, which no reference implementation emits yet",
        "notes": "Re-sent on every sweep while the entry stays inside the warning window, so a consumer keys a countdown off expiresAt rather than counting notifications."
      },
      {
        "id": "v0.1/notification/02-docket-expired",
        "file": "v0.1/notification/02-docket-expired.json",
        "schema": "schemas/0.1.0/notification.schema.json",
        "kind": "positive",
        "derivedFrom": "@affiant/core fixture sequence-a/late-amendments-preserved (Sakwala/affiant-ts, packages/core/test/fixtures) — the entry is real; the envelope is authored to INVARIANTS.md DK-1",
        "notes": "The lapse notice. A hint, never a fact a consumer may act on alone: an entry past its deadline reads expired whether or not this ever arrived."
      },
      {
        "id": "v0.1/notification/03-docket-transition",
        "file": "v0.1/notification/03-docket-transition.json",
        "schema": "schemas/0.1.0/notification.schema.json",
        "kind": "positive",
        "derivedFrom": "@affiant/core fixture sequence-a/late-amendments-preserved (Sakwala/affiant-ts, packages/core/test/fixtures) — the entry is real; the envelope is authored to INVARIANTS.md DK-1 and the docket.transition key of TL-1",
        "notes": "New in v0.1: the state a row left, the state it reached, and the execution outcome an approved row now carries."
      },
      {
        "id": "v0.1/notification/90-expiring-without-deadline",
        "file": "v0.1/notification/90-expiring-without-deadline.json",
        "schema": "schemas/0.1.0/notification.schema.json",
        "kind": "negative",
        "derivedFrom": "Mutation of v0.1/notification/01-docket-expiring.json",
        "notes": "A docket-expiring notification with no deadline. The deadline is the whole payload: a consumer keys a countdown off expiresAt precisely because the notification is re-sent on every sweep (DK-3)."
      },
      {
        "id": "v0.1/operation/01-update",
        "file": "v0.1/operation/01-update.json",
        "schema": "schemas/0.1.0/operation.schema.json",
        "kind": "positive",
        "derivedFrom": "@affiant/core fixture sequence-a/typed-inputs-on-the-card (Sakwala/affiant-ts, packages/core/test/fixtures)",
        "notes": "The operation shape that Affidavit swears to."
      },
      {
        "id": "v0.1/operation/90-delete",
        "file": "v0.1/operation/90-delete.json",
        "schema": "schemas/0.1.0/operation.schema.json",
        "kind": "negative",
        "derivedFrom": "Mutation of v0.1/operation/01-update.json",
        "notes": "An operation shape v0.1 does not define. A delete is expressible as an update in every host that keeps its records; whether the protocol names a third shape is a v0.2 question, and until it answers one, a payload claiming \"delete\" is a payload no rule covers."
      },
      {
        "id": "v0.1/outside-gate/01-migration",
        "file": "v0.1/outside-gate/01-migration.json",
        "schema": "schemas/0.1.0/outside-gate.schema.json",
        "kind": "positive",
        "derivedFrom": "Authored from INVARIANTS.md AZ-1; no implementation emits this shape yet",
        "notes": "A write the host made outside the gate. Deliberately a different shape from an attestation: no export may render it in an attestation position, and a card shows it as outside the guarantee."
      },
      {
        "id": "v0.1/outside-gate/90-missing-recorded-by",
        "file": "v0.1/outside-gate/90-missing-recorded-by.json",
        "schema": "schemas/0.1.0/outside-gate.schema.json",
        "kind": "negative",
        "derivedFrom": "Mutation of v0.1/outside-gate/01-migration.json",
        "notes": "The recorder removed. An outside-gate marker that names nobody is the thing it exists to prevent: an unattributed write that reads, at a glance, like an attested one (AZ-1)."
      },
      {
        "id": "v0.1/provenance-chain/01-single-tag",
        "file": "v0.1/provenance-chain/01-single-tag.json",
        "schema": "schemas/0.1.0/provenance-chain.schema.json",
        "kind": "positive",
        "derivedFrom": "@affiant/core fixture sequence-a/typed-inputs-on-the-card (Sakwala/affiant-ts, packages/core/test/fixtures)",
        "notes": "A chain that has never been merged: one tag in force and an empty prior. Empty, never null."
      },
      {
        "id": "v0.1/provenance-chain/02-superseded",
        "file": "v0.1/provenance-chain/02-superseded.json",
        "schema": "schemas/0.1.0/provenance-chain.schema.json",
        "kind": "positive",
        "derivedFrom": "@affiant/core fixture decide/amend-recompute (Sakwala/affiant-ts, packages/core/test/fixtures)",
        "notes": "The chain behind an amended field: the reviewer’s tag in force, the machine’s pre-correction tag preserved beneath it. Nothing is ever dropped (PV-1)."
      },
      {
        "id": "v0.1/provenance-chain/90-missing-prior",
        "file": "v0.1/provenance-chain/90-missing-prior.json",
        "schema": "schemas/0.1.0/provenance-chain.schema.json",
        "kind": "negative",
        "derivedFrom": "Mutation of v0.1/provenance-chain/01-single-tag.json",
        "notes": "prior removed. An empty array is what a chain that has never been merged looks like; an absent key would make \"nothing was superseded\" and \"we did not record what was superseded\" the same payload (PV-1)."
      },
      {
        "id": "v0.1/provenance-source/01-conversation",
        "file": "v0.1/provenance-source/01-conversation.json",
        "schema": "schemas/0.1.0/provenance-source.schema.json",
        "kind": "positive",
        "derivedFrom": "@affiant/core fixture sequence-a/typed-inputs-on-the-card (Sakwala/affiant-ts, packages/core/test/fixtures)",
        "notes": "The source of that tag, as it is spelled on the wire — the member name, never an integer."
      },
      {
        "id": "v0.1/provenance-source/90-unknown-source",
        "file": "v0.1/provenance-source/90-unknown-source.json",
        "schema": "schemas/0.1.0/provenance-source.schema.json",
        "kind": "negative",
        "derivedFrom": "Mutation of v0.1/provenance-source/01-conversation.json",
        "notes": "A source outside the seven. The ladder is the merge’s tie-breaker, so a source with no rank is a value the merge cannot order (PV-1)."
      },
      {
        "id": "v0.1/provenance-tag/01-conversation",
        "file": "v0.1/provenance-tag/01-conversation.json",
        "schema": "schemas/0.1.0/provenance-tag.schema.json",
        "kind": "positive",
        "derivedFrom": "@affiant/core fixture sequence-a/typed-inputs-on-the-card (Sakwala/affiant-ts, packages/core/test/fixtures)",
        "notes": "A Conversation tag: at or below Conversation the turn is itself the artifact, so binding is null and the tag is still honourable (PV-2, PV-4)."
      },
      {
        "id": "v0.1/provenance-tag/02-user-stated-reviewer-act",
        "file": "v0.1/provenance-tag/02-user-stated-reviewer-act.json",
        "schema": "schemas/0.1.0/provenance-tag.schema.json",
        "kind": "positive",
        "derivedFrom": "@affiant/core fixture decide/amend-recompute (Sakwala/affiant-ts, packages/core/test/fixtures)",
        "notes": "A reviewer’s correction as provenance: UserStated, bound to the decision that made it. A reviewer’s act is never subject to a confidence contest — it supersedes outright (PV-1, AF-4)."
      },
      {
        "id": "v0.1/provenance-tag/90-confidence-out-of-range",
        "file": "v0.1/provenance-tag/90-confidence-out-of-range.json",
        "schema": "schemas/0.1.0/provenance-tag.schema.json",
        "kind": "negative",
        "derivedFrom": "Mutation of v0.1/provenance-tag/01-conversation.json",
        "notes": "A confidence above 1. An implementation clamps a producer-reported number into [0, 1] BEFORE minting the tag; the shipped .NET inference step floors at 0 without capping, which is the gap the parity manifest names (PV-1)."
      },
      {
        "id": "v0.1/telemetry-key/01-registry",
        "file": "v0.1/telemetry-key/01-registry.json",
        "schema": "schemas/0.1.0/telemetry-key.schema.json",
        "kind": "positive",
        "derivedFrom": "@affiant/core packages/core/telemetry-keys.json (Sakwala/affiant-ts)",
        "notes": "The reference implementation’s registry, whole. Its nine keys are exactly the v0.1 list TL-1 names; attributes carry field names, never values."
      },
      {
        "id": "v0.1/telemetry-key/90-key-without-attributes",
        "file": "v0.1/telemetry-key/90-key-without-attributes.json",
        "schema": "schemas/0.1.0/telemetry-key.schema.json",
        "kind": "negative",
        "derivedFrom": "Mutation of v0.1/telemetry-key/01-registry.json",
        "notes": "A registry entry with no attribute list. An empty array is what an event with no attributes looks like; an absent key leaves an operator unable to tell whether the event carries none or whether nobody wrote them down (TL-1)."
      },
      {
        "id": "v0.1/tool-result/01-write-proposal",
        "file": "v0.1/tool-result/01-write-proposal.json",
        "schema": "schemas/0.1.0/tool-result.schema.json",
        "kind": "positive",
        "derivedFrom": "@affiant/core fixture sequence-a/typed-inputs-on-the-card (Sakwala/affiant-ts, packages/core/test/fixtures)",
        "notes": "What the model got back from the wrapped tool: a proposal, never a completed write (GT-6). The gate did not call the tool’s own execute — the fixture supplies one that throws if it is ever reached."
      },
      {
        "id": "v0.1/tool-result/02-error-substance-refused",
        "file": "v0.1/tool-result/02-error-substance-refused.json",
        "schema": "schemas/0.1.0/tool-result.schema.json",
        "kind": "positive",
        "derivedFrom": "@affiant/core fixture gate/substance-hollow-refused (Sakwala/affiant-ts, packages/core/test/fixtures)",
        "notes": "A proposal that swore to nothing: a non-empty value sitting under Empty provenance. Refused before the policy chain runs, so no Standing Order ever sees a hollow proposal (GT-3). The refusal is an answer the model can act on."
      },
      {
        "id": "v0.1/tool-result/03-read",
        "file": "v0.1/tool-result/03-read.json",
        "schema": "schemas/0.1.0/tool-result.schema.json",
        "kind": "positive",
        "derivedFrom": "@affiant/core gate.wrap over a read tool (Sakwala/affiant-ts)",
        "notes": "A read tool runs and its result is returned untouched. The gate stands in front of writes; there is nothing to file here."
      },
      {
        "id": "v0.1/tool-result/90-unregistered-error-code",
        "file": "v0.1/tool-result/90-unregistered-error-code.json",
        "schema": "schemas/0.1.0/tool-result.schema.json",
        "kind": "negative",
        "derivedFrom": "Mutation of v0.1/tool-result/02-error-substance-refused.json",
        "notes": "An error arm carrying a code that is neither in the registry nor the read-tool \"tool-error\". A consumer switches on the discriminator and branches on the code; a code outside both sets is one it cannot act on (AF-5)."
      }
    ]
  },
  "conformance": {
    "protocolVersion": "0.1.0",
    "$note": "The promoted conformance suite: the reference implementation's declarative fixtures and canonical byte vectors, copied here unchanged in id, file name and content (conformance/fixtures/PROMOTED_FROM names the commit). A fixture is a wiring, a sequence of acts and what must then be true; the format is conformance/RUNNER.md and the schema it is checked against is conformance/fixture.schema.json. `oracle` is the negative oracle of conformance/ORACLE.md: a non-null value names a release the fixture MUST fail against and the shipped defect it refutes, and the two must agree with ORACLE.md exactly — the lint checks that. `oracle: null` claims nothing about that release; the parity manifest of each implementation records what it actually does. The canonical vectors are a different document shape (an input, the amendments accepted on it and the exact bytes and SHA-256 they canonicalise to) and no known release violates them, so they are marked acceptedOnReview.",
    "promotedFrom": {
      "repository": "Sakwala/affiant-ts",
      "commit": "c4591eaf332483e2a5a47e161410feaed718aa29",
      "package": "@affiant/core 0.1.0-alpha.0",
      "path": "packages/core/test/fixtures",
      "runner": "@affiant/core/testing — runFixture / runFixtureDir, documented in conformance/RUNNER.md",
      "date": "2026-09-04",
      "unchanged": "Byte-identical. Ids, file names and content are the reference implementation's; a parity manifest cites an id by name, so a rename would silently change what a published document refers to."
    },
    "sets": {
      "gate": "the pipeline: substance, provenance, the policy chain, deadlines, filing",
      "decide": "decisions: authority, attestation, amendments, execution, lineage",
      "sequence-a": "a chat capture end to end — a tool call through to an executor",
      "sequence-c": "a capture over a trusted relay, decided or auto-approved",
      "canonical": "the canonical-serialization byte vectors (SR-1): a different document shape, see conformance/RUNNER.md"
    },
    "oracleSource": "conformance/ORACLE.md",
    "fixtures": [
      {
        "id": "gate/substance-hollow-refused",
        "file": "gate/01-substance-hollow-refused.json",
        "rules": [
          "GT-3"
        ],
        "set": "gate",
        "oracle": {
          "mustFailOn": [
            "dotnet@1.0.0-beta.1"
          ],
          "defect": "Substance (a value with `Empty` provenance) is checked at test time only; the runtime files hollow Affidavits"
        }
      },
      {
        "id": "gate/substance-zero-field-refused",
        "file": "gate/02-substance-zero-field-refused.json",
        "rules": [
          "GT-3"
        ],
        "set": "gate",
        "oracle": {
          "mustFailOn": [
            "dotnet@1.0.0-beta.1"
          ],
          "defect": "Substance (a value with `Empty` provenance) is checked at test time only; the runtime files hollow Affidavits"
        }
      },
      {
        "id": "gate/ttl-from-verdict",
        "file": "gate/03-ttl-from-verdict.json",
        "rules": [
          "GT-4"
        ],
        "set": "gate",
        "oracle": {
          "mustFailOn": [
            "dotnet@1.0.0-beta.1"
          ],
          "defect": "The time-to-live is stamped from one global default before the policy chain runs"
        }
      },
      {
        "id": "gate/ttl-from-policy-default",
        "file": "gate/04-ttl-from-policy-default.json",
        "rules": [
          "GT-4"
        ],
        "set": "gate",
        "oracle": {
          "mustFailOn": [
            "dotnet@1.0.0-beta.1"
          ],
          "defect": "The time-to-live is stamped from one global default before the policy chain runs"
        }
      },
      {
        "id": "gate/ttl-from-gate-default",
        "file": "gate/05-ttl-from-gate-default.json",
        "rules": [
          "GT-4"
        ],
        "set": "gate",
        "oracle": null
      },
      {
        "id": "gate/standing-order-by-the-book",
        "file": "gate/06-standing-order-by-the-book.json",
        "rules": [
          "GT-5",
          "AZ-1"
        ],
        "set": "gate",
        "oracle": {
          "mustFailOn": [
            "dotnet@1.0.0-beta.1"
          ],
          "defect": "No attestation record on the row: nothing says who or what approved a write"
        }
      },
      {
        "id": "gate/standing-order-threshold-under",
        "file": "gate/07-standing-order-threshold-under.json",
        "rules": [
          "GT-5"
        ],
        "set": "gate",
        "oracle": null
      },
      {
        "id": "gate/standing-order-threshold-over",
        "file": "gate/08-standing-order-threshold-over.json",
        "rules": [
          "GT-5"
        ],
        "set": "gate",
        "oracle": null
      },
      {
        "id": "gate/standing-order-unbound-input",
        "file": "gate/09-standing-order-unbound-input.json",
        "rules": [
          "PV-4"
        ],
        "set": "gate",
        "oracle": null
      },
      {
        "id": "gate/standing-order-bound-input",
        "file": "gate/10-standing-order-bound-input.json",
        "rules": [
          "PV-4",
          "AZ-1"
        ],
        "set": "gate",
        "oracle": null
      },
      {
        "id": "gate/multiparty-blocked",
        "file": "gate/11-multiparty-blocked.json",
        "rules": [
          "AZ-4"
        ],
        "set": "gate",
        "oracle": {
          "mustFailOn": [
            "dotnet@1.0.0-beta.1"
          ],
          "defect": "A `MultiParty` requirement is routed to the single-card branch — one approval satisfies a joint requirement"
        }
      },
      {
        "id": "gate/referral-blocked",
        "file": "gate/12-referral-blocked.json",
        "rules": [
          "AZ-4"
        ],
        "set": "gate",
        "oracle": null
      },
      {
        "id": "gate/coverage-refused-declared",
        "file": "gate/13-coverage-refused-declared.json",
        "rules": [
          "CV-4",
          "AZ-4"
        ],
        "set": "gate",
        "oracle": {
          "mustFailOn": [
            "dotnet@1.0.0-beta.1"
          ],
          "defect": "No `blocked` marker and no coverage refusal"
        }
      },
      {
        "id": "gate/update-previous-values",
        "file": "gate/14-update-previous-values.json",
        "rules": [
          "AF-3",
          "AF-1",
          "AF-2"
        ],
        "set": "gate",
        "oracle": {
          "mustFailOn": [
            "dotnet@1.0.0-beta.1"
          ],
          "defect": "Every Affidavit is create-shaped: `EntityId` and every `PreviousValue` are hard-coded null"
        }
      },
      {
        "id": "gate/create-null-previous-values",
        "file": "gate/15-create-null-previous-values.json",
        "rules": [
          "AF-3"
        ],
        "set": "gate",
        "oracle": null
      },
      {
        "id": "gate/inference-conversation-and-inferred",
        "file": "gate/16-inference-conversation-and-inferred.json",
        "rules": [
          "GT-1",
          "PV-1",
          "PV-3",
          "AF-1",
          "AF-2"
        ],
        "set": "gate",
        "oracle": null
      },
      {
        "id": "gate/threshold-without-scorer",
        "file": "gate/17-threshold-without-scorer.json",
        "rules": [
          "CV-1",
          "GT-5"
        ],
        "set": "gate",
        "oracle": null
      },
      {
        "id": "decide/approve",
        "file": "decide/01-approve.json",
        "rules": [
          "DK-1",
          "AZ-1",
          "AZ-2"
        ],
        "set": "decide",
        "oracle": {
          "mustFailOn": [
            "dotnet@1.0.0-beta.1"
          ],
          "defect": "No attestation record on the row: nothing says who or what approved a write"
        }
      },
      {
        "id": "decide/reject",
        "file": "decide/02-reject.json",
        "rules": [
          "DK-1",
          "AZ-1"
        ],
        "set": "decide",
        "oracle": null
      },
      {
        "id": "decide/second-decision-refused",
        "file": "decide/03-second-decision-refused.json",
        "rules": [
          "DK-1"
        ],
        "set": "decide",
        "oracle": null
      },
      {
        "id": "decide/expired-amendments-preserved",
        "file": "decide/04-expired-amendments-preserved.json",
        "rules": [
          "DK-1"
        ],
        "set": "decide",
        "oracle": null
      },
      {
        "id": "decide/blocked-refused",
        "file": "decide/05-blocked-refused.json",
        "rules": [
          "AZ-4",
          "DK-1"
        ],
        "set": "decide",
        "oracle": null
      },
      {
        "id": "decide/amend-recompute",
        "file": "decide/06-amend-recompute.json",
        "rules": [
          "AF-1",
          "AF-4",
          "DK-2",
          "DK-4",
          "PV-2",
          "SR-1"
        ],
        "set": "decide",
        "oracle": {
          "mustFailOn": [
            "dotnet@1.0.0-beta.1"
          ],
          "defect": "A reviewer's amendment never recomputes the aggregate confidence"
        }
      },
      {
        "id": "decide/unresolved-identity",
        "file": "decide/07-unresolved-identity.json",
        "rules": [
          "AZ-2",
          "AZ-6"
        ],
        "set": "decide",
        "oracle": {
          "mustFailOn": [
            "dotnet@1.0.0-beta.1"
          ],
          "defect": "Decision authorization is hand-rolled per host, tenant-blind, and permits the action when identity is unresolved"
        }
      },
      {
        "id": "decide/wrong-tenant",
        "file": "decide/08-wrong-tenant.json",
        "rules": [
          "AZ-2"
        ],
        "set": "decide",
        "oracle": {
          "mustFailOn": [
            "dotnet@1.0.0-beta.1"
          ],
          "defect": "Decision authorization is hand-rolled per host, tenant-blind, and permits the action when identity is unresolved"
        }
      },
      {
        "id": "decide/authorization-declined",
        "file": "decide/09-authorization-declined.json",
        "rules": [
          "AZ-2",
          "AZ-6"
        ],
        "set": "decide",
        "oracle": null
      },
      {
        "id": "decide/relay-member-via-relay",
        "file": "decide/10-relay-member-via-relay.json",
        "rules": [
          "AZ-3",
          "AZ-1"
        ],
        "set": "decide",
        "oracle": null
      },
      {
        "id": "decide/relay-without-assertion-refused",
        "file": "decide/11-relay-without-assertion-refused.json",
        "rules": [
          "AZ-3"
        ],
        "set": "decide",
        "oracle": null
      },
      {
        "id": "decide/execution-executed",
        "file": "decide/12-execution-executed.json",
        "rules": [
          "DK-1",
          "AZ-5"
        ],
        "set": "decide",
        "oracle": {
          "mustFailOn": [
            "dotnet@1.0.0-beta.1"
          ],
          "defect": "No execution-outcome state: an approved-but-failed write is indistinguishable from an approved-and-committed one"
        }
      },
      {
        "id": "decide/execution-failed",
        "file": "decide/13-execution-failed.json",
        "rules": [
          "DK-1"
        ],
        "set": "decide",
        "oracle": {
          "mustFailOn": [
            "dotnet@1.0.0-beta.1"
          ],
          "defect": "No execution-outcome state: an approved-but-failed write is indistinguishable from an approved-and-committed one"
        }
      },
      {
        "id": "decide/execution-on-pending-refused",
        "file": "decide/14-execution-on-pending-refused.json",
        "rules": [
          "DK-1",
          "AZ-5"
        ],
        "set": "decide",
        "oracle": null
      },
      {
        "id": "decide/resubmit-prefills",
        "file": "decide/15-resubmit-prefills.json",
        "rules": [
          "DK-1",
          "DK-2",
          "PV-2"
        ],
        "set": "decide",
        "oracle": null
      },
      {
        "id": "decide/executed-only-through-a-report",
        "file": "decide/16-executed-only-through-a-report.json",
        "rules": [
          "AZ-7"
        ],
        "set": "decide",
        "oracle": null
      },
      {
        "id": "decide/authorization-throws",
        "file": "decide/17-authorization-throws.json",
        "rules": [
          "AZ-2",
          "AZ-6"
        ],
        "set": "decide",
        "oracle": null
      },
      {
        "id": "decide/execution-recorded-once",
        "file": "decide/18-execution-recorded-once.json",
        "rules": [
          "DK-1",
          "DK-4",
          "AZ-5"
        ],
        "set": "decide",
        "oracle": null
      },
      {
        "id": "decide/execution-second-report-refused",
        "file": "decide/19-execution-second-report-refused.json",
        "rules": [
          "DK-1",
          "DK-4",
          "AZ-5"
        ],
        "set": "decide",
        "oracle": null
      },
      {
        "id": "sequence-a/approve-round-trip",
        "file": "sequence-a/01-approve-round-trip.json",
        "rules": [
          "GT-1",
          "GT-6",
          "DK-1",
          "AZ-1",
          "AZ-5",
          "SR-1"
        ],
        "set": "sequence-a",
        "oracle": null
      },
      {
        "id": "sequence-a/reject-round-trip",
        "file": "sequence-a/02-reject-round-trip.json",
        "rules": [
          "DK-1",
          "AZ-1"
        ],
        "set": "sequence-a",
        "oracle": null
      },
      {
        "id": "sequence-a/typed-inputs-on-the-card",
        "file": "sequence-a/03-typed-inputs-on-the-card.json",
        "rules": [
          "AF-1",
          "SR-4",
          "AF-2"
        ],
        "set": "sequence-a",
        "oracle": {
          "mustFailOn": [
            "dotnet@1.0.0-beta.1"
          ],
          "defect": "The aggregate confidence is a mean over the non-`Empty` fields, so a mostly-empty Affidavit can report high confidence"
        }
      },
      {
        "id": "sequence-a/picker-external-binding",
        "file": "sequence-a/04-picker-external-binding.json",
        "rules": [
          "PV-1",
          "PV-2",
          "PV-3",
          "GT-1"
        ],
        "set": "sequence-a",
        "oracle": null
      },
      {
        "id": "sequence-a/mandatory-field-left-empty",
        "file": "sequence-a/05-mandatory-field-left-empty.json",
        "rules": [
          "AF-1",
          "AF-2",
          "GT-5"
        ],
        "set": "sequence-a",
        "oracle": {
          "mustFailOn": [
            "dotnet@1.0.0-beta.1"
          ],
          "defect": "The aggregate confidence is a mean over the non-`Empty` fields, so a mostly-empty Affidavit can report high confidence"
        }
      },
      {
        "id": "sequence-a/mandatory-field-reviewer-approves",
        "file": "sequence-a/06-mandatory-field-reviewer-approves.json",
        "rules": [
          "AF-1",
          "AF-2",
          "DK-1"
        ],
        "set": "sequence-a",
        "oracle": null
      },
      {
        "id": "sequence-a/expiry-then-resubmit",
        "file": "sequence-a/07-expiry-then-resubmit.json",
        "rules": [
          "DK-1",
          "GT-4",
          "CV-4"
        ],
        "set": "sequence-a",
        "oracle": null
      },
      {
        "id": "sequence-a/late-amendments-preserved",
        "file": "sequence-a/08-late-amendments-preserved.json",
        "rules": [
          "DK-1",
          "DK-2",
          "PV-2",
          "PV-3"
        ],
        "set": "sequence-a",
        "oracle": null
      },
      {
        "id": "sequence-a/interleaved-conversations",
        "file": "sequence-a/09-interleaved-conversations.json",
        "rules": [
          "GT-2"
        ],
        "set": "sequence-a",
        "oracle": {
          "mustFailOn": [
            "dotnet@1.0.0-beta.1"
          ],
          "defect": "The gate carries no conversation identity; isolation is the host's scoping discipline alone (the shipped adapters resolve the context store from the application's root provider)"
        }
      },
      {
        "id": "sequence-a/replay-keeps-the-deadline",
        "file": "sequence-a/10-replay-keeps-the-deadline.json",
        "rules": [
          "GT-4",
          "DK-1"
        ],
        "set": "sequence-a",
        "oracle": {
          "mustFailOn": [
            "dotnet@1.0.0-beta.1"
          ],
          "defect": "A re-file with the same id broadcasts a card with a freshly computed deadline"
        }
      },
      {
        "id": "sequence-a/sweep-pages",
        "file": "sequence-a/11-sweep-pages.json",
        "rules": [
          "DK-3"
        ],
        "set": "sequence-a",
        "oracle": {
          "mustFailOn": [
            "dotnet@1.0.0-beta.1"
          ],
          "defect": "The expiry sweep loads every pending entry, unpaged, on every instance"
        }
      },
      {
        "id": "sequence-a/rehydration-order",
        "file": "sequence-a/12-rehydration-order.json",
        "rules": [
          "DK-5",
          "AZ-5"
        ],
        "set": "sequence-a",
        "oracle": null
      },
      {
        "id": "sequence-a/coverage-refused-at-wire-up",
        "file": "sequence-a/13-coverage-refused-at-wire-up.json",
        "rules": [
          "CV-4",
          "CV-1"
        ],
        "set": "sequence-a",
        "oracle": null
      },
      {
        "id": "sequence-a/mandatory-field-empty-blocks-standing-order",
        "file": "sequence-a/14-mandatory-field-empty-blocks-standing-order.json",
        "rules": [
          "GT-5",
          "AF-1",
          "AF-2"
        ],
        "set": "sequence-a",
        "oracle": null
      },
      {
        "id": "sequence-a/optional-field-empty-standing-order-fires",
        "file": "sequence-a/15-optional-field-empty-standing-order-fires.json",
        "rules": [
          "GT-5",
          "AF-1",
          "AZ-1"
        ],
        "set": "sequence-a",
        "oracle": null
      },
      {
        "id": "sequence-c/relay-auto-approve-bound-external",
        "file": "sequence-c/01-relay-auto-approve-bound-external.json",
        "rules": [
          "PV-4",
          "AZ-1",
          "PV-2",
          "GT-1"
        ],
        "set": "sequence-c",
        "oracle": null
      },
      {
        "id": "sequence-c/relayed-decision-member-via-relay",
        "file": "sequence-c/02-relayed-decision-member-via-relay.json",
        "rules": [
          "AZ-1",
          "AZ-3"
        ],
        "set": "sequence-c",
        "oracle": null
      },
      {
        "id": "sequence-c/unbound-external-asks-a-person",
        "file": "sequence-c/03-unbound-external-asks-a-person.json",
        "rules": [
          "PV-4",
          "PV-5"
        ],
        "set": "sequence-c",
        "oracle": null
      },
      {
        "id": "sequence-c/relay-may-not-attest-member",
        "file": "sequence-c/04-relay-may-not-attest-member.json",
        "rules": [
          "AZ-3",
          "AZ-2"
        ],
        "set": "sequence-c",
        "oracle": null
      },
      {
        "id": "sequence-c/relay-decision-other-tenant-not-found",
        "file": "sequence-c/05-relay-decision-other-tenant-not-found.json",
        "rules": [
          "AZ-2"
        ],
        "set": "sequence-c",
        "oracle": null
      },
      {
        "id": "canonical/create-shaped",
        "file": "canonical/01-create-shaped.json",
        "rules": [
          "SR-1",
          "AF-1",
          "AF-3"
        ],
        "set": "canonical",
        "oracle": null,
        "acceptedOnReview": true
      },
      {
        "id": "canonical/update-shaped",
        "file": "canonical/02-update-shaped.json",
        "rules": [
          "SR-1",
          "AF-3",
          "PV-1"
        ],
        "set": "canonical",
        "oracle": null,
        "acceptedOnReview": true
      },
      {
        "id": "canonical/wire-evidence-card-request",
        "file": "canonical/03-wire-evidence-card-request.json",
        "rules": [
          "SR-1",
          "SR-3"
        ],
        "set": "canonical",
        "oracle": null,
        "acceptedOnReview": true
      },
      {
        "id": "canonical/wire-evidence-card-request-amended",
        "file": "canonical/04-wire-evidence-card-request-amended.json",
        "rules": [
          "SR-1",
          "AF-1",
          "AF-2",
          "AF-4",
          "DK-2",
          "PV-2"
        ],
        "set": "canonical",
        "oracle": null,
        "acceptedOnReview": true
      },
      {
        "id": "canonical/key-order-stress",
        "file": "canonical/05-key-order-stress.json",
        "rules": [
          "SR-1"
        ],
        "set": "canonical",
        "oracle": null,
        "acceptedOnReview": true
      },
      {
        "id": "canonical/number-forms",
        "file": "canonical/06-number-forms.json",
        "rules": [
          "SR-1"
        ],
        "set": "canonical",
        "oracle": null,
        "acceptedOnReview": true
      },
      {
        "id": "canonical/money-and-escapes",
        "file": "canonical/07-money-and-escapes.json",
        "rules": [
          "SR-1",
          "SR-2"
        ],
        "set": "canonical",
        "oracle": null,
        "acceptedOnReview": true
      }
    ]
  }
} as const;

/** `conformance/fixtures/enum-values.json` at the pinned ref. */
export const enumValues = {
  "$note": "The closed value sets captured on 2026-09-04 from the two demo hosts in Sakwala/affiant-host-apps (966d6df), built on Sakwala/affiant v1.0.0-beta.1 (b37e139). Each set is a de-facto enum on the wire — a plain JSON string field with a fixed allowed-value set — pinned here as data so an implementation in any language can check its own literals against the same list. Sets and the schema each belongs to: `actionDecisionResultOutcome` is the `outcome` field of the host hub payload `wire/action-decision-result.json`, which has no schema in this seed; `provenanceSource` is `schemas/provenance-source.schema.json`, the `source` field of every provenance tag; `systemNotificationLevel` is the `level` field of the transport payload `wire/system-notification.json`, which has no schema in this seed; `getActionStatusesValue` is the value a host's action-status query returns per docket entry, a host surface with no wire fixture and no schema in this seed.",
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
