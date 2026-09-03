// GENERATED FILE - DO NOT EDIT BY HAND.
// Produced by scripts/generate-decide-fixtures.mjs from test/fixtures/decide/*.json.
// The JSON files are the record; this module is how the suites read them on Node, Bun
// and workerd alike. To change a fixture: edit its JSON file, then run
// `pnpm generate:decide-fixtures` from packages/core.

/**
 * One decision fixture, in the shape the design record fixes: an id, the rules it checks,
 * what is on the Docket, what is done to it, and what the row must read afterwards.
 *
 * `given` and `expect` are typed `unknown` at their leaves and narrowed by the
 * runner in `test/decide-fixtures.test.ts`. A fixture is data; a declaration here that
 * tried to be right for all of them would be a second implementation of the runner.
 */
export interface DecideFixture {
  /** The fixture's id, matching the `id` in its JSON file. */
  readonly id: string;
  /** The rule ids this fixture checks. */
  readonly rules: readonly string[];
  /** What the fixture is for, and which shipped behaviour it refutes where one exists. */
  readonly note: string;
  /** The wiring, the filing and the acts performed on it. */
  readonly given: Readonly<Record<string, unknown>>;
  /** What each act must produce, and what the row must read afterwards. */
  readonly expect: Readonly<Record<string, unknown>>;
}

/** Every fixture, in file order. */
export const decideFixtures: readonly DecideFixture[] = [
  // 01-approve.json
  {
    "id": "decide/approve",
    "rules": [
      "DK-1",
      "AZ-1",
      "AZ-2",
    ],
    "note": "A member approves a pending entry: the row moves to approved with the execution outcome unexecuted, and the attestation names the person who agreed. AZ-1 is written in the same operation as the transition, so there is no window in which an approved write has no attribution.",
    "given": {
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "chat",
        "utterance": "Set the invoice status to Active and the amount to 40",
        "messageId": "msg-1",
        "at": "2026-09-04T09:00:00.000Z",
      },
      "authorization": true,
      "filing": {
        "toolName": "update_invoice",
        "operation": {
          "kind": "update",
          "entityType": "Invoice",
          "entityId": "invoice-1",
          "fields": [
            "status",
            "amount",
            "note",
          ],
        },
        "preparedFields": [
          {
            "name": "status",
            "kind": "text",
            "value": "Active",
            "provenance": {
              "source": "Conversation",
              "confidence": 0.9,
            },
          },
          {
            "name": "amount",
            "kind": "text",
            "value": "40",
            "provenance": {
              "source": "Conversation",
              "confidence": 0.9,
            },
          },
          {
            "name": "note",
            "kind": "text",
            "value": "kept",
            "provenance": {
              "source": "Conversation",
              "confidence": 0.9,
            },
          },
        ],
        "policy": null,
        "defaultTtlMs": 1800000,
      },
      "acts": [
        {
          "kind": "decide",
          "at": "2026-09-04T09:00:00.000Z",
          "principal": {
            "kind": "member",
            "id": "ana",
          },
          "tenantId": null,
          "decision": {
            "kind": "approve",
            "amendments": null,
            "reason": "checked against the purchase order",
          },
          "outcome": null,
          "detail": null,
        },
      ],
    },
    "expect": {
      "acts": [
        {
          "error": null,
        },
      ],
      "entry": {
        "status": "approved",
        "execution": "unexecuted",
        "requirement": "ReviewerConfirmation",
        "blocked": null,
        "attestation": {
          "kind": "member",
          "id": "ana",
        },
        "amendments": null,
        "decision": {
          "kind": "approve",
          "reason": "checked against the purchase order",
        },
        "supersededByFresh": false,
        "affidavit": {
          "aggregateConfidence": 0.9,
          "populatedConfidence": 0.9,
          "emptyFieldCount": 0,
          "fields": [
            {
              "name": "status",
              "value": "Active",
              "source": "Conversation",
              "bound": false,
            },
            {
              "name": "amount",
              "value": "40",
              "source": "Conversation",
              "bound": false,
            },
            {
              "name": "note",
              "value": "kept",
              "source": "Conversation",
              "bound": false,
            },
          ],
        },
      },
      "resubmission": null,
    },
  },
  // 02-reject.json
  {
    "id": "decide/reject",
    "rules": [
      "DK-1",
      "AZ-1",
    ],
    "note": "A rejection is terminal and carries no execution outcome: nothing was authorised, so there is nothing for an executor to have failed at. The reviewer's stated reason is on the row, because a refusal nobody explained teaches the host nothing.",
    "given": {
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "chat",
        "utterance": "Set the invoice status to Active and the amount to 40",
        "messageId": "msg-1",
        "at": "2026-09-04T09:00:00.000Z",
      },
      "authorization": true,
      "filing": {
        "toolName": "update_invoice",
        "operation": {
          "kind": "update",
          "entityType": "Invoice",
          "entityId": "invoice-1",
          "fields": [
            "status",
            "amount",
            "note",
          ],
        },
        "preparedFields": [
          {
            "name": "status",
            "kind": "text",
            "value": "Active",
            "provenance": {
              "source": "Conversation",
              "confidence": 0.9,
            },
          },
          {
            "name": "amount",
            "kind": "text",
            "value": "40",
            "provenance": {
              "source": "Conversation",
              "confidence": 0.9,
            },
          },
          {
            "name": "note",
            "kind": "text",
            "value": "kept",
            "provenance": {
              "source": "Conversation",
              "confidence": 0.9,
            },
          },
        ],
        "policy": null,
        "defaultTtlMs": 1800000,
      },
      "acts": [
        {
          "kind": "decide",
          "at": "2026-09-04T09:00:00.000Z",
          "principal": {
            "kind": "member",
            "id": "ana",
          },
          "tenantId": null,
          "decision": {
            "kind": "reject",
            "amendments": null,
            "reason": "the amount is an order of magnitude out",
          },
          "outcome": null,
          "detail": null,
        },
      ],
    },
    "expect": {
      "acts": [
        {
          "error": null,
        },
      ],
      "entry": {
        "status": "rejected",
        "execution": null,
        "requirement": "ReviewerConfirmation",
        "blocked": null,
        "attestation": {
          "kind": "member",
          "id": "ana",
        },
        "amendments": null,
        "decision": {
          "kind": "reject",
          "reason": "the amount is an order of magnitude out",
        },
        "supersededByFresh": false,
        "affidavit": {
          "aggregateConfidence": 0.9,
          "populatedConfidence": 0.9,
          "emptyFieldCount": 0,
          "fields": [
            {
              "name": "status",
              "value": "Active",
              "source": "Conversation",
              "bound": false,
            },
            {
              "name": "amount",
              "value": "40",
              "source": "Conversation",
              "bound": false,
            },
            {
              "name": "note",
              "value": "kept",
              "source": "Conversation",
              "bound": false,
            },
          ],
        },
      },
      "resubmission": null,
    },
  },
  // 03-second-decision-refused.json
  {
    "id": "decide/second-decision-refused",
    "rules": [
      "DK-1",
    ],
    "note": "A decision on an entry that is no longer pending is refused, never applied twice and never silently overwritten. The first decision and the first attestation stand: a second reviewer arriving late does not get to replace the record of who agreed.",
    "given": {
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "chat",
        "utterance": "Set the invoice status to Active and the amount to 40",
        "messageId": "msg-1",
        "at": "2026-09-04T09:00:00.000Z",
      },
      "authorization": true,
      "filing": {
        "toolName": "update_invoice",
        "operation": {
          "kind": "update",
          "entityType": "Invoice",
          "entityId": "invoice-1",
          "fields": [
            "status",
            "amount",
            "note",
          ],
        },
        "preparedFields": [
          {
            "name": "status",
            "kind": "text",
            "value": "Active",
            "provenance": {
              "source": "Conversation",
              "confidence": 0.9,
            },
          },
          {
            "name": "amount",
            "kind": "text",
            "value": "40",
            "provenance": {
              "source": "Conversation",
              "confidence": 0.9,
            },
          },
          {
            "name": "note",
            "kind": "text",
            "value": "kept",
            "provenance": {
              "source": "Conversation",
              "confidence": 0.9,
            },
          },
        ],
        "policy": null,
        "defaultTtlMs": 1800000,
      },
      "acts": [
        {
          "kind": "decide",
          "at": "2026-09-04T09:00:00.000Z",
          "principal": {
            "kind": "member",
            "id": "ana",
          },
          "tenantId": null,
          "decision": {
            "kind": "approve",
            "amendments": null,
            "reason": null,
          },
          "outcome": null,
          "detail": null,
        },
        {
          "kind": "decide",
          "at": "2026-09-04T09:01:00.000Z",
          "principal": {
            "kind": "member",
            "id": "bo",
          },
          "tenantId": null,
          "decision": {
            "kind": "reject",
            "amendments": null,
            "reason": "changed our minds",
          },
          "outcome": null,
          "detail": null,
        },
      ],
    },
    "expect": {
      "acts": [
        {
          "error": null,
        },
        {
          "error": {
            "code": "decision-not-pending",
          },
        },
      ],
      "entry": {
        "status": "approved",
        "execution": "unexecuted",
        "requirement": "ReviewerConfirmation",
        "blocked": null,
        "attestation": {
          "kind": "member",
          "id": "ana",
        },
        "amendments": null,
        "decision": {
          "kind": "approve",
          "reason": null,
        },
        "supersededByFresh": false,
        "affidavit": {
          "aggregateConfidence": 0.9,
          "populatedConfidence": 0.9,
          "emptyFieldCount": 0,
          "fields": [
            {
              "name": "status",
              "value": "Active",
              "source": "Conversation",
              "bound": false,
            },
            {
              "name": "amount",
              "value": "40",
              "source": "Conversation",
              "bound": false,
            },
            {
              "name": "note",
              "value": "kept",
              "source": "Conversation",
              "bound": false,
            },
          ],
        },
      },
      "resubmission": null,
    },
  },
  // 04-expired-amendments-preserved.json
  {
    "id": "decide/expired-amendments-preserved",
    "rules": [
      "DK-1",
    ],
    "note": "An entry past its deadline reads expired whether or not a sweep has run, and a decision arriving after it is refused. The amendments that decision carried are preserved on the row so a resubmission can prefill them; nothing else is written, because nobody decided anything.",
    "given": {
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "chat",
        "utterance": "Set the invoice status to Active and the amount to 40",
        "messageId": "msg-1",
        "at": "2026-09-04T09:00:00.000Z",
      },
      "authorization": true,
      "filing": {
        "toolName": "update_invoice",
        "operation": {
          "kind": "update",
          "entityType": "Invoice",
          "entityId": "invoice-1",
          "fields": [
            "status",
            "amount",
            "note",
          ],
        },
        "preparedFields": [
          {
            "name": "status",
            "kind": "text",
            "value": "Active",
            "provenance": {
              "source": "Conversation",
              "confidence": 0.9,
            },
          },
          {
            "name": "amount",
            "kind": "text",
            "value": "40",
            "provenance": {
              "source": "Conversation",
              "confidence": 0.9,
            },
          },
          {
            "name": "note",
            "kind": "text",
            "value": "kept",
            "provenance": {
              "source": "Conversation",
              "confidence": 0.9,
            },
          },
        ],
        "policy": null,
        "defaultTtlMs": 1800000,
      },
      "acts": [
        {
          "kind": "decide",
          "at": "2026-09-04T09:45:00.000Z",
          "principal": {
            "kind": "member",
            "id": "ana",
          },
          "tenantId": null,
          "decision": {
            "kind": "approve",
            "amendments": {
              "amount": "4000",
              "note": null,
            },
            "reason": null,
          },
          "outcome": null,
          "detail": null,
        },
      ],
    },
    "expect": {
      "acts": [
        {
          "error": {
            "code": "decision-expired",
          },
        },
      ],
      "entry": {
        "status": "expired",
        "execution": null,
        "requirement": "ReviewerConfirmation",
        "blocked": null,
        "attestation": null,
        "amendments": {
          "amount": "4000",
          "note": null,
        },
        "decision": null,
        "supersededByFresh": false,
        "affidavit": {
          "aggregateConfidence": 0.9,
          "populatedConfidence": 0.9,
          "emptyFieldCount": 0,
          "fields": [
            {
              "name": "status",
              "value": "Active",
              "source": "Conversation",
              "bound": false,
            },
            {
              "name": "amount",
              "value": "40",
              "source": "Conversation",
              "bound": false,
            },
            {
              "name": "note",
              "value": "kept",
              "source": "Conversation",
              "bound": false,
            },
          ],
        },
      },
      "resubmission": null,
    },
  },
  // 05-blocked-refused.json
  {
    "id": "decide/blocked-refused",
    "rules": [
      "AZ-4",
      "DK-1",
    ],
    "note": "A requirement level this version does not run files the entry pending with the level recorded verbatim and a blocked marker, and every decision on it is refused. It is never degraded to the weaker requirement the implementation does know how to run, which is the shipped .NET behaviour of routing MultiParty to the single-card branch.",
    "given": {
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "chat",
        "utterance": "Set the invoice status to Active and the amount to 40",
        "messageId": "msg-1",
        "at": "2026-09-04T09:00:00.000Z",
      },
      "authorization": true,
      "filing": {
        "toolName": "update_invoice",
        "operation": {
          "kind": "update",
          "entityType": "Invoice",
          "entityId": "invoice-1",
          "fields": [
            "status",
            "amount",
            "note",
          ],
        },
        "preparedFields": [
          {
            "name": "status",
            "kind": "text",
            "value": "Active",
            "provenance": {
              "source": "Conversation",
              "confidence": 0.9,
            },
          },
          {
            "name": "amount",
            "kind": "text",
            "value": "40",
            "provenance": {
              "source": "Conversation",
              "confidence": 0.9,
            },
          },
          {
            "name": "note",
            "kind": "text",
            "value": "kept",
            "provenance": {
              "source": "Conversation",
              "confidence": 0.9,
            },
          },
        ],
        "policy": {
          "id": "joint-sign-off",
          "version": "1.0.0",
          "requirement": "MultiParty",
        },
        "defaultTtlMs": 1800000,
      },
      "acts": [
        {
          "kind": "decide",
          "at": "2026-09-04T09:00:00.000Z",
          "principal": {
            "kind": "member",
            "id": "ana",
          },
          "tenantId": null,
          "decision": {
            "kind": "approve",
            "amendments": null,
            "reason": null,
          },
          "outcome": null,
          "detail": null,
        },
      ],
    },
    "expect": {
      "acts": [
        {
          "error": {
            "code": "decision-not-pending",
          },
        },
      ],
      "entry": {
        "status": "pending",
        "execution": null,
        "requirement": "MultiParty",
        "blocked": {
          "code": "requirement-not-implemented",
          "level": "MultiParty",
        },
        "attestation": null,
        "amendments": null,
        "decision": null,
        "supersededByFresh": false,
        "affidavit": {
          "aggregateConfidence": 0.9,
          "populatedConfidence": 0.9,
          "emptyFieldCount": 0,
          "fields": [
            {
              "name": "status",
              "value": "Active",
              "source": "Conversation",
              "bound": false,
            },
            {
              "name": "amount",
              "value": "40",
              "source": "Conversation",
              "bound": false,
            },
            {
              "name": "note",
              "value": "kept",
              "source": "Conversation",
              "bound": false,
            },
          ],
        },
      },
      "resubmission": null,
    },
  },
  // 06-amend-recompute.json
  {
    "id": "decide/amend-recompute",
    "rules": [
      "AF-4",
      "DK-2",
      "PV-2",
    ],
    "note": "An approval carrying an amendment map sets the named values, clears the ones under null, and leaves a field the map does not name untouched. Each amended field's provenance becomes the reviewer's act with a reviewer-act binding, and the three confidence numbers are recomputed over the amended fields rather than left at the machine's pre-correction values.",
    "given": {
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "chat",
        "utterance": "Set the invoice status to Active and the amount to 40",
        "messageId": "msg-1",
        "at": "2026-09-04T09:00:00.000Z",
      },
      "authorization": true,
      "filing": {
        "toolName": "update_invoice",
        "operation": {
          "kind": "update",
          "entityType": "Invoice",
          "entityId": "invoice-1",
          "fields": [
            "status",
            "amount",
            "note",
          ],
        },
        "preparedFields": [
          {
            "name": "status",
            "kind": "text",
            "value": "Active",
            "provenance": {
              "source": "Conversation",
              "confidence": 0.9,
            },
          },
          {
            "name": "amount",
            "kind": "text",
            "value": "40",
            "provenance": {
              "source": "Conversation",
              "confidence": 0.9,
            },
          },
          {
            "name": "note",
            "kind": "text",
            "value": "kept",
            "provenance": {
              "source": "Conversation",
              "confidence": 0.9,
            },
          },
        ],
        "policy": null,
        "defaultTtlMs": 1800000,
      },
      "acts": [
        {
          "kind": "decide",
          "at": "2026-09-04T09:00:00.000Z",
          "principal": {
            "kind": "member",
            "id": "ana",
          },
          "tenantId": null,
          "decision": {
            "kind": "approve",
            "amendments": {
              "amount": "4000",
              "note": null,
            },
            "reason": null,
          },
          "outcome": null,
          "detail": null,
        },
      ],
    },
    "expect": {
      "acts": [
        {
          "error": null,
        },
      ],
      "entry": {
        "status": "approved",
        "execution": "unexecuted",
        "requirement": "ReviewerConfirmation",
        "blocked": null,
        "attestation": {
          "kind": "member",
          "id": "ana",
        },
        "amendments": {
          "amount": "4000",
          "note": null,
        },
        "decision": {
          "kind": "approve",
          "reason": null,
        },
        "supersededByFresh": false,
        "affidavit": {
          "aggregateConfidence": 0.9,
          "populatedConfidence": 0.9,
          "emptyFieldCount": 0,
          "fields": [
            {
              "name": "status",
              "value": "Active",
              "source": "Conversation",
              "bound": false,
            },
            {
              "name": "amount",
              "value": "4000",
              "source": "UserStated",
              "bound": true,
            },
            {
              "name": "note",
              "value": null,
              "source": "UserStated",
              "bound": true,
            },
          ],
        },
      },
      "resubmission": null,
    },
  },
  // 07-unresolved-identity.json
  {
    "id": "decide/unresolved-identity",
    "rules": [
      "AZ-2",
      "AZ-6",
    ],
    "note": "A turn context with no resolved principal refuses the decision: identity unknown is never allow. This filing ran with prepared fields and no policy chain, which is the degraded wiring a host falls back to with no model available, and a degraded wiring does not relax an authorization rule.",
    "given": {
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "chat",
        "utterance": "Set the invoice status to Active and the amount to 40",
        "messageId": "msg-1",
        "at": "2026-09-04T09:00:00.000Z",
      },
      "authorization": true,
      "filing": {
        "toolName": "update_invoice",
        "operation": {
          "kind": "update",
          "entityType": "Invoice",
          "entityId": "invoice-1",
          "fields": [
            "status",
            "amount",
            "note",
          ],
        },
        "preparedFields": [
          {
            "name": "status",
            "kind": "text",
            "value": "Active",
            "provenance": {
              "source": "Conversation",
              "confidence": 0.9,
            },
          },
          {
            "name": "amount",
            "kind": "text",
            "value": "40",
            "provenance": {
              "source": "Conversation",
              "confidence": 0.9,
            },
          },
          {
            "name": "note",
            "kind": "text",
            "value": "kept",
            "provenance": {
              "source": "Conversation",
              "confidence": 0.9,
            },
          },
        ],
        "policy": null,
        "defaultTtlMs": 1800000,
      },
      "acts": [
        {
          "kind": "decide",
          "at": "2026-09-04T09:00:00.000Z",
          "principal": null,
          "tenantId": null,
          "decision": {
            "kind": "approve",
            "amendments": null,
            "reason": null,
          },
          "outcome": null,
          "detail": null,
        },
      ],
    },
    "expect": {
      "acts": [
        {
          "error": {
            "code": "decision-unauthorized",
          },
        },
      ],
      "entry": {
        "status": "pending",
        "execution": null,
        "requirement": "ReviewerConfirmation",
        "blocked": null,
        "attestation": null,
        "amendments": null,
        "decision": null,
        "supersededByFresh": false,
        "affidavit": {
          "aggregateConfidence": 0.9,
          "populatedConfidence": 0.9,
          "emptyFieldCount": 0,
          "fields": [
            {
              "name": "status",
              "value": "Active",
              "source": "Conversation",
              "bound": false,
            },
            {
              "name": "amount",
              "value": "40",
              "source": "Conversation",
              "bound": false,
            },
            {
              "name": "note",
              "value": "kept",
              "source": "Conversation",
              "bound": false,
            },
          ],
        },
      },
      "resubmission": null,
    },
  },
  // 08-wrong-tenant.json
  {
    "id": "decide/wrong-tenant",
    "rules": [
      "AZ-2",
    ],
    "note": "A decision made from another tenant is reported as entry not found, exactly as an id that never existed. Answering unauthorized for that tenant would confirm the id to anyone who could guess one, and the tenant is the boundary the rule exists to hold.",
    "given": {
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "chat",
        "utterance": "Set the invoice status to Active and the amount to 40",
        "messageId": "msg-1",
        "at": "2026-09-04T09:00:00.000Z",
      },
      "authorization": true,
      "filing": {
        "toolName": "update_invoice",
        "operation": {
          "kind": "update",
          "entityType": "Invoice",
          "entityId": "invoice-1",
          "fields": [
            "status",
            "amount",
            "note",
          ],
        },
        "preparedFields": [
          {
            "name": "status",
            "kind": "text",
            "value": "Active",
            "provenance": {
              "source": "Conversation",
              "confidence": 0.9,
            },
          },
          {
            "name": "amount",
            "kind": "text",
            "value": "40",
            "provenance": {
              "source": "Conversation",
              "confidence": 0.9,
            },
          },
          {
            "name": "note",
            "kind": "text",
            "value": "kept",
            "provenance": {
              "source": "Conversation",
              "confidence": 0.9,
            },
          },
        ],
        "policy": null,
        "defaultTtlMs": 1800000,
      },
      "acts": [
        {
          "kind": "decide",
          "at": "2026-09-04T09:00:00.000Z",
          "principal": {
            "kind": "member",
            "id": "ana",
          },
          "tenantId": "tenant-b",
          "decision": {
            "kind": "approve",
            "amendments": null,
            "reason": null,
          },
          "outcome": null,
          "detail": null,
        },
      ],
    },
    "expect": {
      "acts": [
        {
          "error": {
            "code": "entry-not-found",
          },
        },
      ],
      "entry": {
        "status": "pending",
        "execution": null,
        "requirement": "ReviewerConfirmation",
        "blocked": null,
        "attestation": null,
        "amendments": null,
        "decision": null,
        "supersededByFresh": false,
        "affidavit": {
          "aggregateConfidence": 0.9,
          "populatedConfidence": 0.9,
          "emptyFieldCount": 0,
          "fields": [
            {
              "name": "status",
              "value": "Active",
              "source": "Conversation",
              "bound": false,
            },
            {
              "name": "amount",
              "value": "40",
              "source": "Conversation",
              "bound": false,
            },
            {
              "name": "note",
              "value": "kept",
              "source": "Conversation",
              "bound": false,
            },
          ],
        },
      },
      "resubmission": null,
    },
  },
  // 09-authorization-declined.json
  {
    "id": "decide/authorization-declined",
    "rules": [
      "AZ-2",
      "AZ-6",
    ],
    "note": "The host's authorization port is asked whether this principal may decide this entry, and the gate fails closed on the answer. A no leaves the row pending and unattested; there is no wiring, degraded or otherwise, in which the check is skipped.",
    "given": {
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "chat",
        "utterance": "Set the invoice status to Active and the amount to 40",
        "messageId": "msg-1",
        "at": "2026-09-04T09:00:00.000Z",
      },
      "authorization": false,
      "filing": {
        "toolName": "update_invoice",
        "operation": {
          "kind": "update",
          "entityType": "Invoice",
          "entityId": "invoice-1",
          "fields": [
            "status",
            "amount",
            "note",
          ],
        },
        "preparedFields": [
          {
            "name": "status",
            "kind": "text",
            "value": "Active",
            "provenance": {
              "source": "Conversation",
              "confidence": 0.9,
            },
          },
          {
            "name": "amount",
            "kind": "text",
            "value": "40",
            "provenance": {
              "source": "Conversation",
              "confidence": 0.9,
            },
          },
          {
            "name": "note",
            "kind": "text",
            "value": "kept",
            "provenance": {
              "source": "Conversation",
              "confidence": 0.9,
            },
          },
        ],
        "policy": null,
        "defaultTtlMs": 1800000,
      },
      "acts": [
        {
          "kind": "decide",
          "at": "2026-09-04T09:00:00.000Z",
          "principal": {
            "kind": "member",
            "id": "ana",
          },
          "tenantId": null,
          "decision": {
            "kind": "approve",
            "amendments": null,
            "reason": null,
          },
          "outcome": null,
          "detail": null,
        },
      ],
    },
    "expect": {
      "acts": [
        {
          "error": {
            "code": "decision-unauthorized",
          },
        },
      ],
      "entry": {
        "status": "pending",
        "execution": null,
        "requirement": "ReviewerConfirmation",
        "blocked": null,
        "attestation": null,
        "amendments": null,
        "decision": null,
        "supersededByFresh": false,
        "affidavit": {
          "aggregateConfidence": 0.9,
          "populatedConfidence": 0.9,
          "emptyFieldCount": 0,
          "fields": [
            {
              "name": "status",
              "value": "Active",
              "source": "Conversation",
              "bound": false,
            },
            {
              "name": "amount",
              "value": "40",
              "source": "Conversation",
              "bound": false,
            },
            {
              "name": "note",
              "value": "kept",
              "source": "Conversation",
              "bound": false,
            },
          ],
        },
      },
      "resubmission": null,
    },
  },
  // 10-relay-member-via-relay.json
  {
    "id": "decide/relay-member-via-relay",
    "rules": [
      "AZ-3",
      "AZ-1",
    ],
    "note": "Sequence C-2: a decision made by a person through a trusted relay attests member-via-relay, naming both the person the relay speaks for and the relay, its channel identity and the message the decision arrived on. It is the strongest claim available, and it is visibly not a member attestation.",
    "given": {
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "mcp",
        "utterance": "Set the invoice status to Active and the amount to 40",
        "messageId": "msg-1",
        "at": "2026-09-04T09:00:00.000Z",
      },
      "authorization": true,
      "filing": {
        "toolName": "update_invoice",
        "operation": {
          "kind": "update",
          "entityType": "Invoice",
          "entityId": "invoice-1",
          "fields": [
            "status",
            "amount",
            "note",
          ],
        },
        "preparedFields": [
          {
            "name": "status",
            "kind": "text",
            "value": "Active",
            "provenance": {
              "source": "Conversation",
              "confidence": 0.9,
            },
          },
          {
            "name": "amount",
            "kind": "text",
            "value": "40",
            "provenance": {
              "source": "Conversation",
              "confidence": 0.9,
            },
          },
          {
            "name": "note",
            "kind": "text",
            "value": "kept",
            "provenance": {
              "source": "Conversation",
              "confidence": 0.9,
            },
          },
        ],
        "policy": null,
        "defaultTtlMs": 1800000,
      },
      "acts": [
        {
          "kind": "decide",
          "at": "2026-09-04T09:00:00.000Z",
          "principal": {
            "kind": "service",
            "id": "whatsapp-relay",
            "assertedMember": "ana",
            "relay": {
              "channelIdentity": "+94770000000",
              "messageId": "wamid-42",
            },
          },
          "tenantId": null,
          "decision": {
            "kind": "approve",
            "amendments": null,
            "reason": null,
          },
          "outcome": null,
          "detail": null,
        },
      ],
    },
    "expect": {
      "acts": [
        {
          "error": null,
        },
      ],
      "entry": {
        "status": "approved",
        "execution": "unexecuted",
        "requirement": "ReviewerConfirmation",
        "blocked": null,
        "attestation": {
          "kind": "member-via-relay",
          "memberId": "ana",
          "relay": {
            "principal": "whatsapp-relay",
            "channelIdentity": "+94770000000",
            "messageId": "wamid-42",
          },
        },
        "amendments": null,
        "decision": {
          "kind": "approve",
          "reason": null,
        },
        "supersededByFresh": false,
        "affidavit": {
          "aggregateConfidence": 0.9,
          "populatedConfidence": 0.9,
          "emptyFieldCount": 0,
          "fields": [
            {
              "name": "status",
              "value": "Active",
              "source": "Conversation",
              "bound": false,
            },
            {
              "name": "amount",
              "value": "40",
              "source": "Conversation",
              "bound": false,
            },
            {
              "name": "note",
              "value": "kept",
              "source": "Conversation",
              "bound": false,
            },
          ],
        },
      },
      "resubmission": null,
    },
  },
  // 11-relay-without-assertion-refused.json
  {
    "id": "decide/relay-without-assertion-refused",
    "rules": [
      "AZ-3",
    ],
    "note": "Sequence C-4: a machine caller that names neither the person it speaks for nor the message it carried cannot attest a decision at all. There is no path by which a service principal produces a member attestation, so the refusal is the only available answer rather than a weaker attestation.",
    "given": {
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "mcp",
        "utterance": "Set the invoice status to Active and the amount to 40",
        "messageId": "msg-1",
        "at": "2026-09-04T09:00:00.000Z",
      },
      "authorization": true,
      "filing": {
        "toolName": "update_invoice",
        "operation": {
          "kind": "update",
          "entityType": "Invoice",
          "entityId": "invoice-1",
          "fields": [
            "status",
            "amount",
            "note",
          ],
        },
        "preparedFields": [
          {
            "name": "status",
            "kind": "text",
            "value": "Active",
            "provenance": {
              "source": "Conversation",
              "confidence": 0.9,
            },
          },
          {
            "name": "amount",
            "kind": "text",
            "value": "40",
            "provenance": {
              "source": "Conversation",
              "confidence": 0.9,
            },
          },
          {
            "name": "note",
            "kind": "text",
            "value": "kept",
            "provenance": {
              "source": "Conversation",
              "confidence": 0.9,
            },
          },
        ],
        "policy": null,
        "defaultTtlMs": 1800000,
      },
      "acts": [
        {
          "kind": "decide",
          "at": "2026-09-04T09:00:00.000Z",
          "principal": {
            "kind": "service",
            "id": "svc-1",
          },
          "tenantId": null,
          "decision": {
            "kind": "approve",
            "amendments": null,
            "reason": null,
          },
          "outcome": null,
          "detail": null,
        },
        {
          "kind": "decide",
          "at": "2026-09-04T09:01:00.000Z",
          "principal": {
            "kind": "service",
            "id": "whatsapp-relay",
            "assertedMember": "ana",
          },
          "tenantId": null,
          "decision": {
            "kind": "approve",
            "amendments": null,
            "reason": null,
          },
          "outcome": null,
          "detail": null,
        },
      ],
    },
    "expect": {
      "acts": [
        {
          "error": {
            "code": "decision-unauthorized",
          },
        },
        {
          "error": {
            "code": "decision-unauthorized",
          },
        },
      ],
      "entry": {
        "status": "pending",
        "execution": null,
        "requirement": "ReviewerConfirmation",
        "blocked": null,
        "attestation": null,
        "amendments": null,
        "decision": null,
        "supersededByFresh": false,
        "affidavit": {
          "aggregateConfidence": 0.9,
          "populatedConfidence": 0.9,
          "emptyFieldCount": 0,
          "fields": [
            {
              "name": "status",
              "value": "Active",
              "source": "Conversation",
              "bound": false,
            },
            {
              "name": "amount",
              "value": "40",
              "source": "Conversation",
              "bound": false,
            },
            {
              "name": "note",
              "value": "kept",
              "source": "Conversation",
              "bound": false,
            },
          ],
        },
      },
      "resubmission": null,
    },
  },
  // 12-execution-executed.json
  {
    "id": "decide/execution-executed",
    "rules": [
      "DK-1",
      "AZ-5",
    ],
    "note": "The host's executor reports that the approved write happened. The status stays approved and only the execution outcome moves, so the approval is not re-litigated by the report; the detail the executor gave is kept beside it.",
    "given": {
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "chat",
        "utterance": "Set the invoice status to Active and the amount to 40",
        "messageId": "msg-1",
        "at": "2026-09-04T09:00:00.000Z",
      },
      "authorization": true,
      "filing": {
        "toolName": "update_invoice",
        "operation": {
          "kind": "update",
          "entityType": "Invoice",
          "entityId": "invoice-1",
          "fields": [
            "status",
            "amount",
            "note",
          ],
        },
        "preparedFields": [
          {
            "name": "status",
            "kind": "text",
            "value": "Active",
            "provenance": {
              "source": "Conversation",
              "confidence": 0.9,
            },
          },
          {
            "name": "amount",
            "kind": "text",
            "value": "40",
            "provenance": {
              "source": "Conversation",
              "confidence": 0.9,
            },
          },
          {
            "name": "note",
            "kind": "text",
            "value": "kept",
            "provenance": {
              "source": "Conversation",
              "confidence": 0.9,
            },
          },
        ],
        "policy": null,
        "defaultTtlMs": 1800000,
      },
      "acts": [
        {
          "kind": "decide",
          "at": "2026-09-04T09:00:00.000Z",
          "principal": {
            "kind": "member",
            "id": "ana",
          },
          "tenantId": null,
          "decision": {
            "kind": "approve",
            "amendments": null,
            "reason": null,
          },
          "outcome": null,
          "detail": null,
        },
        {
          "kind": "mark-executed",
          "at": "2026-09-04T09:01:00.000Z",
          "principal": {
            "kind": "member",
            "id": "ana",
          },
          "tenantId": null,
          "decision": null,
          "outcome": "executed",
          "detail": "invoice row 41",
        },
      ],
    },
    "expect": {
      "acts": [
        {
          "error": null,
        },
        {
          "error": null,
        },
      ],
      "entry": {
        "status": "approved",
        "execution": "executed",
        "requirement": "ReviewerConfirmation",
        "blocked": null,
        "attestation": {
          "kind": "member",
          "id": "ana",
        },
        "amendments": null,
        "decision": {
          "kind": "approve",
          "reason": null,
        },
        "supersededByFresh": false,
        "affidavit": {
          "aggregateConfidence": 0.9,
          "populatedConfidence": 0.9,
          "emptyFieldCount": 0,
          "fields": [
            {
              "name": "status",
              "value": "Active",
              "source": "Conversation",
              "bound": false,
            },
            {
              "name": "amount",
              "value": "40",
              "source": "Conversation",
              "bound": false,
            },
            {
              "name": "note",
              "value": "kept",
              "source": "Conversation",
              "bound": false,
            },
          ],
        },
      },
      "resubmission": null,
    },
  },
  // 13-execution-failed.json
  {
    "id": "decide/execution-failed",
    "rules": [
      "DK-1",
    ],
    "note": "An approved-but-failed write is distinguishable from an approved-and-committed one on the row: the status is still approved, because the approval happened, and the execution outcome is failed. Collapsing the two into the status would lose the approval.",
    "given": {
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "chat",
        "utterance": "Set the invoice status to Active and the amount to 40",
        "messageId": "msg-1",
        "at": "2026-09-04T09:00:00.000Z",
      },
      "authorization": true,
      "filing": {
        "toolName": "update_invoice",
        "operation": {
          "kind": "update",
          "entityType": "Invoice",
          "entityId": "invoice-1",
          "fields": [
            "status",
            "amount",
            "note",
          ],
        },
        "preparedFields": [
          {
            "name": "status",
            "kind": "text",
            "value": "Active",
            "provenance": {
              "source": "Conversation",
              "confidence": 0.9,
            },
          },
          {
            "name": "amount",
            "kind": "text",
            "value": "40",
            "provenance": {
              "source": "Conversation",
              "confidence": 0.9,
            },
          },
          {
            "name": "note",
            "kind": "text",
            "value": "kept",
            "provenance": {
              "source": "Conversation",
              "confidence": 0.9,
            },
          },
        ],
        "policy": null,
        "defaultTtlMs": 1800000,
      },
      "acts": [
        {
          "kind": "decide",
          "at": "2026-09-04T09:00:00.000Z",
          "principal": {
            "kind": "member",
            "id": "ana",
          },
          "tenantId": null,
          "decision": {
            "kind": "approve",
            "amendments": null,
            "reason": null,
          },
          "outcome": null,
          "detail": null,
        },
        {
          "kind": "mark-executed",
          "at": "2026-09-04T09:01:00.000Z",
          "principal": {
            "kind": "member",
            "id": "ana",
          },
          "tenantId": null,
          "decision": null,
          "outcome": "failed",
          "detail": "unique constraint on invoice_no",
        },
      ],
    },
    "expect": {
      "acts": [
        {
          "error": null,
        },
        {
          "error": null,
        },
      ],
      "entry": {
        "status": "approved",
        "execution": "failed",
        "requirement": "ReviewerConfirmation",
        "blocked": null,
        "attestation": {
          "kind": "member",
          "id": "ana",
        },
        "amendments": null,
        "decision": {
          "kind": "approve",
          "reason": null,
        },
        "supersededByFresh": false,
        "affidavit": {
          "aggregateConfidence": 0.9,
          "populatedConfidence": 0.9,
          "emptyFieldCount": 0,
          "fields": [
            {
              "name": "status",
              "value": "Active",
              "source": "Conversation",
              "bound": false,
            },
            {
              "name": "amount",
              "value": "40",
              "source": "Conversation",
              "bound": false,
            },
            {
              "name": "note",
              "value": "kept",
              "source": "Conversation",
              "bound": false,
            },
          ],
        },
      },
      "resubmission": null,
    },
  },
  // 14-execution-on-pending-refused.json
  {
    "id": "decide/execution-on-pending-refused",
    "rules": [
      "DK-1",
      "AZ-5",
    ],
    "note": "An execution outcome is only ever recorded against an approved, attested row. A report on a pending entry is refused, because there is no authorised write for an executor to have performed and the Docket entry is the sole record of that authority.",
    "given": {
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "chat",
        "utterance": "Set the invoice status to Active and the amount to 40",
        "messageId": "msg-1",
        "at": "2026-09-04T09:00:00.000Z",
      },
      "authorization": true,
      "filing": {
        "toolName": "update_invoice",
        "operation": {
          "kind": "update",
          "entityType": "Invoice",
          "entityId": "invoice-1",
          "fields": [
            "status",
            "amount",
            "note",
          ],
        },
        "preparedFields": [
          {
            "name": "status",
            "kind": "text",
            "value": "Active",
            "provenance": {
              "source": "Conversation",
              "confidence": 0.9,
            },
          },
          {
            "name": "amount",
            "kind": "text",
            "value": "40",
            "provenance": {
              "source": "Conversation",
              "confidence": 0.9,
            },
          },
          {
            "name": "note",
            "kind": "text",
            "value": "kept",
            "provenance": {
              "source": "Conversation",
              "confidence": 0.9,
            },
          },
        ],
        "policy": null,
        "defaultTtlMs": 1800000,
      },
      "acts": [
        {
          "kind": "mark-executed",
          "at": "2026-09-04T09:00:00.000Z",
          "principal": {
            "kind": "member",
            "id": "ana",
          },
          "tenantId": null,
          "decision": null,
          "outcome": "executed",
          "detail": null,
        },
      ],
    },
    "expect": {
      "acts": [
        {
          "error": {
            "code": "decision-not-pending",
          },
        },
      ],
      "entry": {
        "status": "pending",
        "execution": null,
        "requirement": "ReviewerConfirmation",
        "blocked": null,
        "attestation": null,
        "amendments": null,
        "decision": null,
        "supersededByFresh": false,
        "affidavit": {
          "aggregateConfidence": 0.9,
          "populatedConfidence": 0.9,
          "emptyFieldCount": 0,
          "fields": [
            {
              "name": "status",
              "value": "Active",
              "source": "Conversation",
              "bound": false,
            },
            {
              "name": "amount",
              "value": "40",
              "source": "Conversation",
              "bound": false,
            },
            {
              "name": "note",
              "value": "kept",
              "source": "Conversation",
              "bound": false,
            },
          ],
        },
      },
      "resubmission": null,
    },
  },
  // 15-resubmit-prefills.json
  {
    "id": "decide/resubmit-prefills",
    "rules": [
      "DK-1",
      "DK-2",
      "PV-2",
    ],
    "note": "A resubmission is a new entry, never a reopened one: the expired entry keeps its terminal state and gains a successor link, and the new row names what it supersedes. The amendments the refused late decision left behind are prefilled as values, each carrying the reviewer's act with a reviewer-act binding that names the superseded entry.",
    "given": {
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "chat",
        "utterance": "Set the invoice status to Active and the amount to 40",
        "messageId": "msg-1",
        "at": "2026-09-04T09:00:00.000Z",
      },
      "authorization": true,
      "filing": {
        "toolName": "update_invoice",
        "operation": {
          "kind": "update",
          "entityType": "Invoice",
          "entityId": "invoice-1",
          "fields": [
            "status",
            "amount",
            "note",
          ],
        },
        "preparedFields": [
          {
            "name": "status",
            "kind": "text",
            "value": "Active",
            "provenance": {
              "source": "Conversation",
              "confidence": 0.9,
            },
          },
          {
            "name": "amount",
            "kind": "text",
            "value": "40",
            "provenance": {
              "source": "Conversation",
              "confidence": 0.9,
            },
          },
          {
            "name": "note",
            "kind": "text",
            "value": "kept",
            "provenance": {
              "source": "Conversation",
              "confidence": 0.9,
            },
          },
        ],
        "policy": null,
        "defaultTtlMs": 1800000,
      },
      "acts": [
        {
          "kind": "decide",
          "at": "2026-09-04T09:45:00.000Z",
          "principal": {
            "kind": "member",
            "id": "ana",
          },
          "tenantId": null,
          "decision": {
            "kind": "approve",
            "amendments": {
              "amount": "4000",
              "note": null,
            },
            "reason": null,
          },
          "outcome": null,
          "detail": null,
        },
        {
          "kind": "resubmit",
          "at": "2026-09-04T09:46:00.000Z",
          "principal": {
            "kind": "member",
            "id": "ana",
          },
          "tenantId": null,
          "decision": null,
          "outcome": null,
          "detail": null,
        },
      ],
    },
    "expect": {
      "acts": [
        {
          "error": {
            "code": "decision-expired",
          },
        },
        {
          "error": null,
        },
      ],
      "entry": {
        "status": "expired",
        "execution": null,
        "requirement": "ReviewerConfirmation",
        "blocked": null,
        "attestation": null,
        "amendments": {
          "amount": "4000",
          "note": null,
        },
        "decision": null,
        "supersededByFresh": true,
        "affidavit": {
          "aggregateConfidence": 0.9,
          "populatedConfidence": 0.9,
          "emptyFieldCount": 0,
          "fields": [
            {
              "name": "status",
              "value": "Active",
              "source": "Conversation",
              "bound": false,
            },
            {
              "name": "amount",
              "value": "40",
              "source": "Conversation",
              "bound": false,
            },
            {
              "name": "note",
              "value": "kept",
              "source": "Conversation",
              "bound": false,
            },
          ],
        },
      },
      "resubmission": {
        "status": "pending",
        "execution": null,
        "supersedesOriginal": true,
        "priorAmendments": {
          "amount": "4000",
          "note": null,
        },
        "fields": [
          {
            "name": "status",
            "value": "Active",
            "source": "Conversation",
            "bound": false,
          },
          {
            "name": "amount",
            "value": "4000",
            "source": "UserStated",
            "bound": true,
          },
          {
            "name": "note",
            "value": null,
            "source": "UserStated",
            "bound": true,
          },
        ],
      },
    },
  },
  // 16-executed-only-through-a-report.json
  {
    "id": "decide/executed-only-through-a-report",
    "rules": [
      "AZ-7",
    ],
    "note": "The gate never performs the write and never calls an executor: after an approval, and after every other act the gate offers, the row is still unexecuted. Only a host's own report moves it, which is the fixture pair with the execution outcome above.",
    "given": {
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "chat",
        "utterance": "Set the invoice status to Active and the amount to 40",
        "messageId": "msg-1",
        "at": "2026-09-04T09:00:00.000Z",
      },
      "authorization": true,
      "filing": {
        "toolName": "update_invoice",
        "operation": {
          "kind": "update",
          "entityType": "Invoice",
          "entityId": "invoice-1",
          "fields": [
            "status",
            "amount",
            "note",
          ],
        },
        "preparedFields": [
          {
            "name": "status",
            "kind": "text",
            "value": "Active",
            "provenance": {
              "source": "Conversation",
              "confidence": 0.9,
            },
          },
          {
            "name": "amount",
            "kind": "text",
            "value": "40",
            "provenance": {
              "source": "Conversation",
              "confidence": 0.9,
            },
          },
          {
            "name": "note",
            "kind": "text",
            "value": "kept",
            "provenance": {
              "source": "Conversation",
              "confidence": 0.9,
            },
          },
        ],
        "policy": null,
        "defaultTtlMs": 1800000,
      },
      "acts": [
        {
          "kind": "decide",
          "at": "2026-09-04T09:00:00.000Z",
          "principal": {
            "kind": "member",
            "id": "ana",
          },
          "tenantId": null,
          "decision": {
            "kind": "approve",
            "amendments": null,
            "reason": null,
          },
          "outcome": null,
          "detail": null,
        },
        {
          "kind": "resubmit",
          "at": "2026-09-04T09:01:00.000Z",
          "principal": {
            "kind": "member",
            "id": "ana",
          },
          "tenantId": null,
          "decision": null,
          "outcome": null,
          "detail": null,
        },
        {
          "kind": "decide",
          "at": "2026-09-04T09:02:00.000Z",
          "principal": {
            "kind": "member",
            "id": "bo",
          },
          "tenantId": null,
          "decision": {
            "kind": "approve",
            "amendments": null,
            "reason": null,
          },
          "outcome": null,
          "detail": null,
        },
      ],
    },
    "expect": {
      "acts": [
        {
          "error": null,
        },
        {
          "error": {
            "code": "decision-not-pending",
          },
        },
        {
          "error": {
            "code": "decision-not-pending",
          },
        },
      ],
      "entry": {
        "status": "approved",
        "execution": "unexecuted",
        "requirement": "ReviewerConfirmation",
        "blocked": null,
        "attestation": {
          "kind": "member",
          "id": "ana",
        },
        "amendments": null,
        "decision": {
          "kind": "approve",
          "reason": null,
        },
        "supersededByFresh": false,
        "affidavit": {
          "aggregateConfidence": 0.9,
          "populatedConfidence": 0.9,
          "emptyFieldCount": 0,
          "fields": [
            {
              "name": "status",
              "value": "Active",
              "source": "Conversation",
              "bound": false,
            },
            {
              "name": "amount",
              "value": "40",
              "source": "Conversation",
              "bound": false,
            },
            {
              "name": "note",
              "value": "kept",
              "source": "Conversation",
              "bound": false,
            },
          ],
        },
      },
      "resubmission": null,
    },
  },
];

/** A fixture by id, for a test that names one. */
export function decideFixture(id: string): DecideFixture {
  const found = decideFixtures.find((fixture) => fixture.id === id);
  if (found === undefined) throw new Error(`no decide fixture with id ${JSON.stringify(id)}`);
  return found;
}
