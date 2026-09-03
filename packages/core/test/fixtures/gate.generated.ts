// GENERATED FILE - DO NOT EDIT BY HAND.
// Produced by scripts/generate-gate-fixtures.mjs from test/fixtures/gate/*.json.
// The JSON files are the record; this module is how the suites read them on Node, Bun
// and workerd alike. To change a fixture: edit its JSON file, then run
// `pnpm generate:gate-fixtures` from packages/core.

/**
 * One gate fixture, in the shape the design record fixes: an id, the rules it checks,
 * what the host and the ports supply, and what the gate must do with it.
 *
 * `given` and `expect` are typed `unknown` at their leaves and narrowed by the
 * runner in `test/gate-fixtures.test.ts`. A fixture is data; a declaration here that
 * tried to be right for all of them would be a second implementation of the runner.
 */
export interface GateFixture {
  /** The fixture's id, matching the `id` in its JSON file. */
  readonly id: string;
  /** The rule ids this fixture checks. */
  readonly rules: readonly string[];
  /** What the fixture is for, and which shipped behaviour it refutes where one exists. */
  readonly note: string;
  /** The wiring, the turn and the proposal. */
  readonly given: Readonly<Record<string, unknown>>;
  /** What the gate must produce: a refusal, a row, an Affidavit, a card. */
  readonly expect: Readonly<Record<string, unknown>>;
}

/** Every fixture, in file order. */
export const gateFixtures: readonly GateFixture[] = [
  // 01-substance-hollow-refused.json
  {
    "id": "gate/substance-hollow-refused",
    "rules": [
      "GT-3",
    ],
    "note": "A value with nothing behind it is hollow: the field carries \"Active\" and an Empty tag, so the proposal is refused before anything is filed. The shipped .NET ComplianceHarness checks this at test time only; the runtime must too.",
    "given": {
      "history": [],
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "chat",
        "utterance": "Set the invoice status to Active",
        "messageId": "msg-1",
        "at": "2026-09-04T09:00:00.000Z",
      },
      "args": null,
      "toolName": "relay_capture",
      "operation": {
        "kind": "update",
        "entityType": "Invoice",
        "entityId": "invoice-1",
        "fields": [
          "status",
        ],
      },
      "schema": null,
      "inference": null,
      "preparedFields": [
        {
          "name": "status",
          "kind": "text",
          "value": "Active",
          "provenance": null,
        },
      ],
      "previousValues": null,
      "policies": [],
      "riskScore": null,
      "declareUncovered": null,
      "defaultTtlMs": 1800000,
    },
    "expect": {
      "error": {
        "code": "substance-refused",
        "messageContains": "Empty provenance",
      },
      "entry": null,
      "affidavit": null,
      "card": null,
    },
  },
  // 02-substance-zero-field-refused.json
  {
    "id": "gate/substance-zero-field-refused",
    "rules": [
      "GT-3",
    ],
    "note": "Every proposed field is Empty and carries no value. There is nothing to swear to, so nothing is filed, counted or broadcast.",
    "given": {
      "history": [],
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "chat",
        "utterance": "Set the invoice status to Active",
        "messageId": "msg-1",
        "at": "2026-09-04T09:00:00.000Z",
      },
      "args": null,
      "toolName": "relay_capture",
      "operation": {
        "kind": "update",
        "entityType": "Invoice",
        "entityId": "invoice-1",
        "fields": [
          "status",
          "note",
        ],
      },
      "schema": null,
      "inference": null,
      "preparedFields": [
        {
          "name": "status",
          "kind": "text",
          "value": null,
          "provenance": null,
        },
        {
          "name": "note",
          "kind": "text",
          "value": null,
          "provenance": null,
        },
      ],
      "previousValues": null,
      "policies": [],
      "riskScore": null,
      "declareUncovered": null,
      "defaultTtlMs": 1800000,
    },
    "expect": {
      "error": {
        "code": "substance-refused",
        "messageContains": "no proposed field carries provenance other than Empty",
      },
      "entry": null,
      "affidavit": null,
      "card": null,
    },
  },
  // 03-ttl-from-verdict.json
  {
    "id": "gate/ttl-from-verdict",
    "rules": [
      "GT-4",
    ],
    "note": "The deadline comes from the verdict, after the policy chain has run. The shipped .NET gate stamps a single global default before policy, which is the shape the rule names as non-conformant.",
    "given": {
      "history": [],
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "chat",
        "utterance": "Set the invoice status to Active",
        "messageId": "msg-1",
        "at": "2026-09-04T09:00:00.000Z",
      },
      "args": null,
      "toolName": "relay_capture",
      "operation": {
        "kind": "update",
        "entityType": "Invoice",
        "entityId": "invoice-1",
        "fields": [
          "status",
        ],
      },
      "schema": null,
      "inference": null,
      "preparedFields": [
        {
          "name": "status",
          "kind": "text",
          "value": "Active",
          "provenance": {
            "source": "Conversation",
            "confidence": 0.9,
            "bound": false,
          },
        },
      ],
      "previousValues": null,
      "policies": [
        {
          "id": "policy-1",
          "version": "1.0.0",
          "declaredInputs": [],
          "declaresThreshold": false,
          "defaultTtlMs": 900000,
          "verdict": {
            "requirement": "ReviewerConfirmation",
            "ttlMs": 300000,
          },
        },
      ],
      "riskScore": null,
      "declareUncovered": null,
      "defaultTtlMs": 1800000,
    },
    "expect": {
      "error": null,
      "entry": {
        "status": "pending",
        "requirement": "ReviewerConfirmation",
        "execution": null,
        "blocked": null,
        "expiresAtOffsetMs": 300000,
        "attestation": null,
      },
      "affidavit": null,
      "card": null,
    },
  },
  // 04-ttl-from-policy-default.json
  {
    "id": "gate/ttl-from-policy-default",
    "rules": [
      "GT-4",
    ],
    "note": "A verdict that names no deadline falls back to the policy's own default, not to the gate's.",
    "given": {
      "history": [],
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "chat",
        "utterance": "Set the invoice status to Active",
        "messageId": "msg-1",
        "at": "2026-09-04T09:00:00.000Z",
      },
      "args": null,
      "toolName": "relay_capture",
      "operation": {
        "kind": "update",
        "entityType": "Invoice",
        "entityId": "invoice-1",
        "fields": [
          "status",
        ],
      },
      "schema": null,
      "inference": null,
      "preparedFields": [
        {
          "name": "status",
          "kind": "text",
          "value": "Active",
          "provenance": {
            "source": "Conversation",
            "confidence": 0.9,
            "bound": false,
          },
        },
      ],
      "previousValues": null,
      "policies": [
        {
          "id": "policy-1",
          "version": "1.0.0",
          "declaredInputs": [],
          "declaresThreshold": false,
          "defaultTtlMs": 900000,
          "verdict": {
            "requirement": "ReviewerConfirmation",
          },
        },
      ],
      "riskScore": null,
      "declareUncovered": null,
      "defaultTtlMs": 1800000,
    },
    "expect": {
      "error": null,
      "entry": {
        "status": "pending",
        "requirement": "ReviewerConfirmation",
        "execution": null,
        "blocked": null,
        "expiresAtOffsetMs": 900000,
        "attestation": null,
      },
      "affidavit": null,
      "card": null,
    },
  },
  // 05-ttl-from-gate-default.json
  {
    "id": "gate/ttl-from-gate-default",
    "rules": [
      "GT-4",
    ],
    "note": "With no verdict and no policy default, the gate's required defaultTtlMs applies. Every filed entry carries a deadline (GT-4).",
    "given": {
      "history": [],
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "chat",
        "utterance": "Set the invoice status to Active",
        "messageId": "msg-1",
        "at": "2026-09-04T09:00:00.000Z",
      },
      "args": null,
      "toolName": "relay_capture",
      "operation": {
        "kind": "update",
        "entityType": "Invoice",
        "entityId": "invoice-1",
        "fields": [
          "status",
        ],
      },
      "schema": null,
      "inference": null,
      "preparedFields": [
        {
          "name": "status",
          "kind": "text",
          "value": "Active",
          "provenance": {
            "source": "Conversation",
            "confidence": 0.9,
            "bound": false,
          },
        },
      ],
      "previousValues": null,
      "policies": [],
      "riskScore": null,
      "declareUncovered": null,
      "defaultTtlMs": 1800000,
    },
    "expect": {
      "error": null,
      "entry": {
        "status": "pending",
        "requirement": "ReviewerConfirmation",
        "execution": null,
        "blocked": null,
        "expiresAtOffsetMs": 1800000,
        "attestation": null,
      },
      "affidavit": null,
      "card": null,
    },
  },
  // 06-standing-order-by-the-book.json
  {
    "id": "gate/standing-order-by-the-book",
    "rules": [
      "GT-5",
      "AZ-1",
    ],
    "note": "A Standing Order with no threshold fires on the verdict alone, and files approved, unexecuted and attested in one write. The shipped .NET default scorer never returns the grade its default threshold demands, so a by-the-book Standing Order can never fire there.",
    "given": {
      "history": [],
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "chat",
        "utterance": "Set the invoice status to Active",
        "messageId": "msg-1",
        "at": "2026-09-04T09:00:00.000Z",
      },
      "args": null,
      "toolName": "relay_capture",
      "operation": {
        "kind": "update",
        "entityType": "Invoice",
        "entityId": "invoice-1",
        "fields": [
          "status",
        ],
      },
      "schema": null,
      "inference": null,
      "preparedFields": [
        {
          "name": "status",
          "kind": "text",
          "value": "Active",
          "provenance": {
            "source": "Conversation",
            "confidence": 0.9,
            "bound": false,
          },
        },
      ],
      "previousValues": null,
      "policies": [
        {
          "id": "auto-approve",
          "version": "2.1.0",
          "declaredInputs": [],
          "declaresThreshold": false,
          "defaultTtlMs": null,
          "verdict": {
            "requirement": "StandingOrder",
          },
        },
      ],
      "riskScore": null,
      "declareUncovered": null,
      "defaultTtlMs": 1800000,
    },
    "expect": {
      "error": null,
      "entry": {
        "status": "approved",
        "requirement": "StandingOrder",
        "execution": "unexecuted",
        "blocked": null,
        "expiresAtOffsetMs": 1800000,
        "attestation": {
          "kind": "standing-order",
          "policyId": "auto-approve",
          "version": "2.1.0",
        },
      },
      "affidavit": null,
      "card": null,
    },
  },
  // 07-standing-order-threshold-under.json
  {
    "id": "gate/standing-order-threshold-under",
    "rules": [
      "GT-5",
    ],
    "note": "A declared threshold fires iff the host's score is at or under it. The core owns the comparison and no formula.",
    "given": {
      "history": [],
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "chat",
        "utterance": "Set the invoice status to Active",
        "messageId": "msg-1",
        "at": "2026-09-04T09:00:00.000Z",
      },
      "args": null,
      "toolName": "relay_capture",
      "operation": {
        "kind": "update",
        "entityType": "Invoice",
        "entityId": "invoice-1",
        "fields": [
          "status",
        ],
      },
      "schema": null,
      "inference": null,
      "preparedFields": [
        {
          "name": "status",
          "kind": "text",
          "value": "Active",
          "provenance": {
            "source": "Conversation",
            "confidence": 0.9,
            "bound": false,
          },
        },
      ],
      "previousValues": null,
      "policies": [
        {
          "id": "under-a-thousand",
          "version": "1.0.0",
          "declaredInputs": [],
          "declaresThreshold": true,
          "defaultTtlMs": null,
          "verdict": {
            "requirement": "StandingOrder",
            "threshold": 0.5,
          },
        },
      ],
      "riskScore": 0.5,
      "declareUncovered": null,
      "defaultTtlMs": 1800000,
    },
    "expect": {
      "error": null,
      "entry": {
        "status": "approved",
        "requirement": "StandingOrder",
        "execution": "unexecuted",
        "blocked": null,
        "expiresAtOffsetMs": 1800000,
        "attestation": {
          "kind": "standing-order",
          "policyId": "under-a-thousand",
          "version": "1.0.0",
        },
      },
      "affidavit": null,
      "card": null,
    },
  },
  // 08-standing-order-threshold-over.json
  {
    "id": "gate/standing-order-threshold-over",
    "rules": [
      "GT-5",
    ],
    "note": "A score above the threshold does not fire and does not fail: it degrades to asking a person, with the reason on the card.",
    "given": {
      "history": [],
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "chat",
        "utterance": "Set the invoice status to Active",
        "messageId": "msg-1",
        "at": "2026-09-04T09:00:00.000Z",
      },
      "args": null,
      "toolName": "relay_capture",
      "operation": {
        "kind": "update",
        "entityType": "Invoice",
        "entityId": "invoice-1",
        "fields": [
          "status",
        ],
      },
      "schema": null,
      "inference": null,
      "preparedFields": [
        {
          "name": "status",
          "kind": "text",
          "value": "Active",
          "provenance": {
            "source": "Conversation",
            "confidence": 0.9,
            "bound": false,
          },
        },
      ],
      "previousValues": null,
      "policies": [
        {
          "id": "policy-1",
          "version": "1.0.0",
          "declaredInputs": [],
          "declaresThreshold": true,
          "defaultTtlMs": null,
          "verdict": {
            "requirement": "StandingOrder",
            "threshold": 0.5,
          },
        },
      ],
      "riskScore": 0.9,
      "declareUncovered": null,
      "defaultTtlMs": 1800000,
    },
    "expect": {
      "error": null,
      "entry": {
        "status": "pending",
        "requirement": "ReviewerConfirmation",
        "execution": null,
        "blocked": null,
        "expiresAtOffsetMs": 1800000,
        "attestation": null,
      },
      "affidavit": null,
      "card": {
        "warningsContain": [
          "above the Standing Order's threshold",
        ],
      },
    },
  },
  // 09-standing-order-unbound-input.json
  {
    "id": "gate/standing-order-unbound-input",
    "rules": [
      "PV-4",
    ],
    "note": "Sequence C's negative case: a relayed capture whose External tag points at nothing. The policy predicates on External, so the Standing Order is not honoured and a person is asked.",
    "given": {
      "history": [],
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "mcp",
        "utterance": "Set the invoice status to Active",
        "messageId": "msg-1",
        "at": "2026-09-04T09:00:00.000Z",
      },
      "args": null,
      "toolName": "relay_capture",
      "operation": {
        "kind": "update",
        "entityType": "Invoice",
        "entityId": "invoice-1",
        "fields": [
          "status",
        ],
      },
      "schema": null,
      "inference": null,
      "preparedFields": [
        {
          "name": "status",
          "kind": "text",
          "value": "Active",
          "provenance": {
            "source": "External",
            "confidence": 1,
            "bound": false,
          },
        },
      ],
      "previousValues": null,
      "policies": [
        {
          "id": "relay-capture",
          "version": "1.0.0",
          "declaredInputs": [
            "External",
          ],
          "declaresThreshold": false,
          "defaultTtlMs": null,
          "verdict": {
            "requirement": "StandingOrder",
          },
        },
      ],
      "riskScore": null,
      "declareUncovered": null,
      "defaultTtlMs": 1800000,
    },
    "expect": {
      "error": null,
      "entry": {
        "status": "pending",
        "requirement": "ReviewerConfirmation",
        "execution": null,
        "blocked": null,
        "expiresAtOffsetMs": 1800000,
        "attestation": null,
      },
      "affidavit": null,
      "card": {
        "warningsContain": [
          "carries a External tag with no binding",
        ],
      },
    },
  },
  // 10-standing-order-bound-input.json
  {
    "id": "gate/standing-order-bound-input",
    "rules": [
      "PV-4",
      "AZ-1",
    ],
    "note": "Sequence C's positive case: the same capture whose External tag names the record it came from. The Standing Order fires and the relay is on the attestation's policy, never as a member.",
    "given": {
      "history": [],
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "mcp",
        "utterance": "Set the invoice status to Active",
        "messageId": "msg-1",
        "at": "2026-09-04T09:00:00.000Z",
      },
      "args": null,
      "toolName": "relay_capture",
      "operation": {
        "kind": "update",
        "entityType": "Invoice",
        "entityId": "invoice-1",
        "fields": [
          "status",
        ],
      },
      "schema": null,
      "inference": null,
      "preparedFields": [
        {
          "name": "status",
          "kind": "text",
          "value": "Active",
          "provenance": {
            "source": "External",
            "confidence": 1,
            "bound": true,
          },
        },
      ],
      "previousValues": null,
      "policies": [
        {
          "id": "relay-capture",
          "version": "1.0.0",
          "declaredInputs": [
            "External",
          ],
          "declaresThreshold": false,
          "defaultTtlMs": null,
          "verdict": {
            "requirement": "StandingOrder",
          },
        },
      ],
      "riskScore": null,
      "declareUncovered": null,
      "defaultTtlMs": 1800000,
    },
    "expect": {
      "error": null,
      "entry": {
        "status": "approved",
        "requirement": "StandingOrder",
        "execution": "unexecuted",
        "blocked": null,
        "expiresAtOffsetMs": 1800000,
        "attestation": {
          "kind": "standing-order",
          "policyId": "relay-capture",
          "version": "1.0.0",
        },
      },
      "affidavit": null,
      "card": null,
    },
  },
  // 11-multiparty-blocked.json
  {
    "id": "gate/multiparty-blocked",
    "rules": [
      "AZ-4",
    ],
    "note": "A requirement level this version does not run is recorded verbatim and filed blocked; it is never degraded to the single-approver branch, which is what the shipped .NET gate does.",
    "given": {
      "history": [],
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "chat",
        "utterance": "Set the invoice status to Active",
        "messageId": "msg-1",
        "at": "2026-09-04T09:00:00.000Z",
      },
      "args": null,
      "toolName": "relay_capture",
      "operation": {
        "kind": "update",
        "entityType": "Invoice",
        "entityId": "invoice-1",
        "fields": [
          "status",
        ],
      },
      "schema": null,
      "inference": null,
      "preparedFields": [
        {
          "name": "status",
          "kind": "text",
          "value": "Active",
          "provenance": {
            "source": "Conversation",
            "confidence": 0.9,
            "bound": false,
          },
        },
      ],
      "previousValues": null,
      "policies": [
        {
          "id": "policy-1",
          "version": "1.0.0",
          "declaredInputs": [],
          "declaresThreshold": false,
          "defaultTtlMs": null,
          "verdict": {
            "requirement": "MultiParty",
          },
        },
      ],
      "riskScore": null,
      "declareUncovered": null,
      "defaultTtlMs": 1800000,
    },
    "expect": {
      "error": null,
      "entry": {
        "status": "pending",
        "requirement": "MultiParty",
        "execution": null,
        "blocked": {
          "code": "requirement-not-implemented",
          "level": "MultiParty",
        },
        "expiresAtOffsetMs": 1800000,
        "attestation": null,
      },
      "affidavit": null,
      "card": {
        "warningsContain": [
          "not implemented in this version",
        ],
      },
    },
  },
  // 12-referral-blocked.json
  {
    "id": "gate/referral-blocked",
    "rules": [
      "AZ-4",
    ],
    "note": "The same for ReferralRequired, which protocol v0.1 reserves. The parity manifest names the .NET Deferred path.",
    "given": {
      "history": [],
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "chat",
        "utterance": "Set the invoice status to Active",
        "messageId": "msg-1",
        "at": "2026-09-04T09:00:00.000Z",
      },
      "args": null,
      "toolName": "relay_capture",
      "operation": {
        "kind": "update",
        "entityType": "Invoice",
        "entityId": "invoice-1",
        "fields": [
          "status",
        ],
      },
      "schema": null,
      "inference": null,
      "preparedFields": [
        {
          "name": "status",
          "kind": "text",
          "value": "Active",
          "provenance": {
            "source": "Conversation",
            "confidence": 0.9,
            "bound": false,
          },
        },
      ],
      "previousValues": null,
      "policies": [
        {
          "id": "policy-1",
          "version": "1.0.0",
          "declaredInputs": [],
          "declaresThreshold": false,
          "defaultTtlMs": null,
          "verdict": {
            "requirement": "ReferralRequired",
          },
        },
      ],
      "riskScore": null,
      "declareUncovered": null,
      "defaultTtlMs": 1800000,
    },
    "expect": {
      "error": null,
      "entry": {
        "status": "pending",
        "requirement": "ReferralRequired",
        "execution": null,
        "blocked": {
          "code": "requirement-not-implemented",
          "level": "ReferralRequired",
        },
        "expiresAtOffsetMs": 1800000,
        "attestation": null,
      },
      "affidavit": null,
      "card": null,
    },
  },
  // 13-coverage-refused-declared.json
  {
    "id": "gate/coverage-refused-declared",
    "rules": [
      "CV-4",
      "AZ-4",
    ],
    "note": "A tool the host declared it cannot cover: the proposal is filed pending and blocked with the tool and the category on the row, never silently allowed. The Standing Order the policy returned does not rescue it.",
    "given": {
      "history": [],
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "chat",
        "utterance": "Set the invoice status to Active",
        "messageId": "msg-1",
        "at": "2026-09-04T09:00:00.000Z",
      },
      "args": null,
      "toolName": "relay_capture",
      "operation": {
        "kind": "update",
        "entityType": "Invoice",
        "entityId": "invoice-1",
        "fields": [
          "status",
        ],
      },
      "schema": null,
      "inference": null,
      "preparedFields": [
        {
          "name": "status",
          "kind": "text",
          "value": "Active",
          "provenance": {
            "source": "Conversation",
            "confidence": 0.9,
            "bound": false,
          },
        },
      ],
      "previousValues": null,
      "policies": [
        {
          "id": "policy-1",
          "version": "1.0.0",
          "declaredInputs": [],
          "declaresThreshold": false,
          "defaultTtlMs": null,
          "verdict": {
            "requirement": "StandingOrder",
          },
        },
      ],
      "riskScore": null,
      "declareUncovered": "provider-executed",
      "defaultTtlMs": 1800000,
    },
    "expect": {
      "error": null,
      "entry": {
        "status": "pending",
        "requirement": "StandingOrder",
        "execution": null,
        "blocked": {
          "code": "coverage-refused",
          "category": "provider-executed",
          "toolName": "relay_capture",
        },
        "expiresAtOffsetMs": 1800000,
        "attestation": null,
      },
      "affidavit": null,
      "card": {
        "warningsContain": [
          "declared uncovered",
        ],
      },
    },
  },
  // 14-update-previous-values.json
  {
    "id": "gate/update-previous-values",
    "rules": [
      "AF-3",
      "AF-1",
      "AF-2",
    ],
    "note": "An update names its entity and carries the previousValue key on every field, holding null where the entity had no stored value. The shipped .NET projection fills previous values on creates only.",
    "given": {
      "history": [],
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "chat",
        "utterance": "Set the invoice status to Active",
        "messageId": "msg-1",
        "at": "2026-09-04T09:00:00.000Z",
      },
      "args": null,
      "toolName": "relay_capture",
      "operation": {
        "kind": "update",
        "entityType": "Invoice",
        "entityId": "invoice-1",
        "fields": [
          "status",
          "note",
        ],
      },
      "schema": null,
      "inference": null,
      "preparedFields": [
        {
          "name": "status",
          "kind": "text",
          "value": "Active",
          "provenance": {
            "source": "Conversation",
            "confidence": 0.9,
            "bound": false,
          },
        },
        {
          "name": "note",
          "kind": "text",
          "value": "urgent",
          "provenance": {
            "source": "Conversation",
            "confidence": 0.9,
            "bound": false,
          },
        },
      ],
      "previousValues": {
        "status": "Draft",
      },
      "policies": [],
      "riskScore": null,
      "declareUncovered": null,
      "defaultTtlMs": 1800000,
    },
    "expect": {
      "error": null,
      "entry": {
        "status": "pending",
        "requirement": "ReviewerConfirmation",
        "execution": null,
        "blocked": null,
        "expiresAtOffsetMs": 1800000,
        "attestation": null,
      },
      "affidavit": {
        "operationType": "update",
        "entityId": "invoice-1",
        "aggregateConfidence": 0.9,
        "populatedConfidence": 0.9,
        "emptyFieldCount": 0,
        "fields": [
          {
            "name": "status",
            "value": "Active",
            "previousValue": "Draft",
            "source": "Conversation",
            "bound": false,
          },
          {
            "name": "note",
            "value": "urgent",
            "previousValue": null,
            "source": "Conversation",
            "bound": false,
          },
        ],
      },
      "card": null,
    },
  },
  // 15-create-null-previous-values.json
  {
    "id": "gate/create-null-previous-values",
    "rules": [
      "AF-3",
    ],
    "note": "A create names no entity and every previousValue is null, whatever the projection port would have said.",
    "given": {
      "history": [],
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "chat",
        "utterance": "Set the invoice status to Active",
        "messageId": "msg-1",
        "at": "2026-09-04T09:00:00.000Z",
      },
      "args": null,
      "toolName": "relay_capture",
      "operation": {
        "kind": "create",
        "entityType": "Invoice",
        "entityId": null,
        "fields": [
          "status",
        ],
      },
      "schema": null,
      "inference": null,
      "preparedFields": [
        {
          "name": "status",
          "kind": "text",
          "value": "Active",
          "provenance": {
            "source": "Conversation",
            "confidence": 0.9,
            "bound": false,
          },
        },
      ],
      "previousValues": {
        "status": "Draft",
      },
      "policies": [],
      "riskScore": null,
      "declareUncovered": null,
      "defaultTtlMs": 1800000,
    },
    "expect": {
      "error": null,
      "entry": {
        "status": "pending",
        "requirement": "ReviewerConfirmation",
        "execution": null,
        "blocked": null,
        "expiresAtOffsetMs": 1800000,
        "attestation": null,
      },
      "affidavit": {
        "operationType": "create",
        "entityId": null,
        "aggregateConfidence": 0.9,
        "populatedConfidence": 0.9,
        "emptyFieldCount": 0,
        "fields": [
          {
            "name": "status",
            "value": "Active",
            "previousValue": null,
            "source": "Conversation",
            "bound": false,
          },
        ],
      },
      "card": null,
    },
  },
  // 16-inference-conversation-and-inferred.json
  {
    "id": "gate/inference-conversation-and-inferred",
    "rules": [
      "GT-1",
      "PV-1",
      "PV-3",
      "AF-1",
      "AF-2",
    ],
    "note": "The inference path: a value literally in the turn is Conversation, a reasoned one is Inferred, a proposed field the port said nothing about is present and Empty-tagged, and the aggregate is the minimum with Empty counting as zero. Neither tag is UserStated (PV-3).",
    "given": {
      "history": [],
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "chat",
        "utterance": "Set the invoice status to Active",
        "messageId": "msg-1",
        "at": "2026-09-04T09:00:00.000Z",
      },
      "args": null,
      "toolName": "relay_capture",
      "operation": {
        "kind": "update",
        "entityType": "Invoice",
        "entityId": "invoice-1",
        "fields": [
          "status",
          "note",
          "owner",
        ],
      },
      "schema": {
        "entityType": "Invoice",
        "fields": [
          {
            "name": "status",
            "kind": "text",
            "description": "The status",
            "required": false,
            "allowedValues": null,
          },
          {
            "name": "note",
            "kind": "text",
            "description": "The note",
            "required": false,
            "allowedValues": null,
          },
          {
            "name": "owner",
            "kind": "text",
            "description": "The owner",
            "required": false,
            "allowedValues": null,
          },
        ],
      },
      "inference": {
        "fields": {
          "status": {
            "value": "Active",
            "confidence": 0.9,
            "presence": "literal",
            "utteranceSpan": {
              "start": 26,
              "end": 32,
            },
          },
          "note": {
            "value": "urgent",
            "confidence": 0.4,
            "presence": "inferred",
            "utteranceSpan": null,
          },
        },
      },
      "preparedFields": null,
      "previousValues": {
        "status": "Draft",
      },
      "policies": [],
      "riskScore": null,
      "declareUncovered": null,
      "defaultTtlMs": 1800000,
    },
    "expect": {
      "error": null,
      "entry": {
        "status": "pending",
        "requirement": "ReviewerConfirmation",
        "execution": null,
        "blocked": null,
        "expiresAtOffsetMs": 1800000,
        "attestation": null,
      },
      "affidavit": {
        "operationType": "update",
        "entityId": "invoice-1",
        "aggregateConfidence": 0,
        "populatedConfidence": 0.4,
        "emptyFieldCount": 1,
        "fields": [
          {
            "name": "status",
            "value": "Active",
            "previousValue": "Draft",
            "source": "Conversation",
            "bound": true,
          },
          {
            "name": "note",
            "value": "urgent",
            "previousValue": null,
            "source": "Inferred",
            "bound": false,
          },
          {
            "name": "owner",
            "value": null,
            "previousValue": null,
            "source": "Empty",
            "bound": false,
          },
        ],
      },
      "card": null,
    },
  },
];

/** A fixture by id, for a test that names one. */
export function gateFixture(id: string): GateFixture {
  const found = gateFixtures.find((fixture) => fixture.id === id);
  if (found === undefined) throw new Error(`no gate fixture with id ${JSON.stringify(id)}`);
  return found;
}
