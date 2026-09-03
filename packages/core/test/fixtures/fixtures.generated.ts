// GENERATED FILE - DO NOT EDIT BY HAND.
// Produced by scripts/generate-fixtures.mjs from test/fixtures/<set>/*.json.
// The JSON files are the record; this module is how the suites read them on Node, Bun
// and workerd alike. To change a fixture: edit its JSON file, then run
// `pnpm generate:fixtures` from packages/core.

import type { Fixture } from "../../src/testing.js";

/** Every fixture, in set order then file order. */
export const fixtures: readonly Fixture[] = [
  // gate/01-substance-hollow-refused.json
  {
    "id": "gate/substance-hollow-refused",
    "rules": [
      "GT-3",
    ],
    "title": "A value with nothing behind it is hollow: the field carries \"Active\" and an Empty tag, so the proposal is refused before anything is filed. The shipped .NET ComplianceHarness checks this at test time only; the runtime must too.",
    "given": {
      "clock": "2026-09-04T09:00:00.000Z",
      "store": "memory",
      "gate": {
        "defaultTtlMs": 1800000,
        "authorization": {
          "allow": [
            "*",
          ],
        },
      },
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "chat",
        "principal": {
          "kind": "member",
          "id": "member-1",
        },
        "utterance": "Set the invoice status to Active",
        "messageId": "msg-1",
      },
      "prior": [],
      "step": {
        "kind": "file",
        "toolName": "relay_capture",
        "operation": {
          "kind": "update",
          "entityType": "Invoice",
          "entityId": "invoice-1",
          "fields": [
            "status",
          ],
        },
        "preparedFields": [
          {
            "name": "status",
            "kind": "text",
            "value": "Active",
            "provenance": null,
          },
        ],
      },
    },
    "expect": {
      "error": {
        "code": "substance-refused",
        "messageContains": "Empty provenance",
      },
    },
  },
  // gate/02-substance-zero-field-refused.json
  {
    "id": "gate/substance-zero-field-refused",
    "rules": [
      "GT-3",
    ],
    "title": "Every proposed field is Empty and carries no value. There is nothing to swear to, so nothing is filed, counted or broadcast.",
    "given": {
      "clock": "2026-09-04T09:00:00.000Z",
      "store": "memory",
      "gate": {
        "defaultTtlMs": 1800000,
        "authorization": {
          "allow": [
            "*",
          ],
        },
      },
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "chat",
        "principal": {
          "kind": "member",
          "id": "member-1",
        },
        "utterance": "Set the invoice status to Active",
        "messageId": "msg-1",
      },
      "prior": [],
      "step": {
        "kind": "file",
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
      },
    },
    "expect": {
      "error": {
        "code": "substance-refused",
        "messageContains": "no proposed field carries provenance other than Empty",
      },
    },
  },
  // gate/03-ttl-from-verdict.json
  {
    "id": "gate/ttl-from-verdict",
    "rules": [
      "GT-4",
    ],
    "title": "The deadline comes from the verdict, after the policy chain has run. The shipped .NET gate stamps a single global default before policy, which is the shape the rule names as non-conformant.",
    "given": {
      "clock": "2026-09-04T09:00:00.000Z",
      "store": "memory",
      "gate": {
        "defaultTtlMs": 1800000,
        "authorization": {
          "allow": [
            "*",
          ],
        },
        "policies": [
          {
            "id": "policy-1",
            "version": "1.0.0",
            "declaredInputs": [],
            "defaultTtlMs": 900000,
            "verdict": {
              "requirement": "ReviewerConfirmation",
              "ttlMs": 300000,
            },
          },
        ],
      },
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "chat",
        "principal": {
          "kind": "member",
          "id": "member-1",
        },
        "utterance": "Set the invoice status to Active",
        "messageId": "msg-1",
      },
      "prior": [],
      "step": {
        "kind": "file",
        "toolName": "relay_capture",
        "operation": {
          "kind": "update",
          "entityType": "Invoice",
          "entityId": "invoice-1",
          "fields": [
            "status",
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
        ],
      },
    },
    "expect": {
      "entry": {
        "status": "pending",
        "requirement": "ReviewerConfirmation",
        "execution": null,
        "blocked": null,
        "expiresAtOffsetMs": 300000,
        "attestation": null,
        "toolName": "relay_capture",
      },
    },
  },
  // gate/04-ttl-from-policy-default.json
  {
    "id": "gate/ttl-from-policy-default",
    "rules": [
      "GT-4",
    ],
    "title": "A verdict that names no deadline falls back to the policy's own default, not to the gate's.",
    "given": {
      "clock": "2026-09-04T09:00:00.000Z",
      "store": "memory",
      "gate": {
        "defaultTtlMs": 1800000,
        "authorization": {
          "allow": [
            "*",
          ],
        },
        "policies": [
          {
            "id": "policy-1",
            "version": "1.0.0",
            "declaredInputs": [],
            "defaultTtlMs": 900000,
            "verdict": {
              "requirement": "ReviewerConfirmation",
            },
          },
        ],
      },
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "chat",
        "principal": {
          "kind": "member",
          "id": "member-1",
        },
        "utterance": "Set the invoice status to Active",
        "messageId": "msg-1",
      },
      "prior": [],
      "step": {
        "kind": "file",
        "toolName": "relay_capture",
        "operation": {
          "kind": "update",
          "entityType": "Invoice",
          "entityId": "invoice-1",
          "fields": [
            "status",
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
        ],
      },
    },
    "expect": {
      "entry": {
        "status": "pending",
        "requirement": "ReviewerConfirmation",
        "execution": null,
        "blocked": null,
        "expiresAtOffsetMs": 900000,
        "attestation": null,
        "toolName": "relay_capture",
      },
    },
  },
  // gate/05-ttl-from-gate-default.json
  {
    "id": "gate/ttl-from-gate-default",
    "rules": [
      "GT-4",
    ],
    "title": "With no verdict and no policy default, the gate's required defaultTtlMs applies. Every filed entry carries a deadline (GT-4).",
    "given": {
      "clock": "2026-09-04T09:00:00.000Z",
      "store": "memory",
      "gate": {
        "defaultTtlMs": 1800000,
        "authorization": {
          "allow": [
            "*",
          ],
        },
      },
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "chat",
        "principal": {
          "kind": "member",
          "id": "member-1",
        },
        "utterance": "Set the invoice status to Active",
        "messageId": "msg-1",
      },
      "prior": [],
      "step": {
        "kind": "file",
        "toolName": "relay_capture",
        "operation": {
          "kind": "update",
          "entityType": "Invoice",
          "entityId": "invoice-1",
          "fields": [
            "status",
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
        ],
      },
    },
    "expect": {
      "entry": {
        "status": "pending",
        "requirement": "ReviewerConfirmation",
        "execution": null,
        "blocked": null,
        "expiresAtOffsetMs": 1800000,
        "attestation": null,
        "toolName": "relay_capture",
      },
    },
  },
  // gate/06-standing-order-by-the-book.json
  {
    "id": "gate/standing-order-by-the-book",
    "rules": [
      "GT-5",
      "AZ-1",
    ],
    "title": "A Standing Order with no threshold fires on the verdict alone, and files approved, unexecuted and attested in one write. The shipped .NET default scorer never returns the grade its default threshold demands, so a by-the-book Standing Order can never fire there.",
    "given": {
      "clock": "2026-09-04T09:00:00.000Z",
      "store": "memory",
      "gate": {
        "defaultTtlMs": 1800000,
        "authorization": {
          "allow": [
            "*",
          ],
        },
        "policies": [
          {
            "id": "auto-approve",
            "version": "2.1.0",
            "declaredInputs": [],
            "verdict": {
              "requirement": "StandingOrder",
            },
          },
        ],
      },
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "chat",
        "principal": {
          "kind": "member",
          "id": "member-1",
        },
        "utterance": "Set the invoice status to Active",
        "messageId": "msg-1",
      },
      "prior": [],
      "step": {
        "kind": "file",
        "toolName": "relay_capture",
        "operation": {
          "kind": "update",
          "entityType": "Invoice",
          "entityId": "invoice-1",
          "fields": [
            "status",
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
        ],
      },
    },
    "expect": {
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
        "toolName": "relay_capture",
      },
    },
  },
  // gate/07-standing-order-threshold-under.json
  {
    "id": "gate/standing-order-threshold-under",
    "rules": [
      "GT-5",
    ],
    "title": "A declared threshold fires iff the host's score is at or under it. The core owns the comparison and no formula.",
    "given": {
      "clock": "2026-09-04T09:00:00.000Z",
      "store": "memory",
      "gate": {
        "defaultTtlMs": 1800000,
        "authorization": {
          "allow": [
            "*",
          ],
        },
        "policies": [
          {
            "id": "under-a-thousand",
            "version": "1.0.0",
            "declaredInputs": [],
            "declaresThreshold": true,
            "verdict": {
              "requirement": "StandingOrder",
              "threshold": 0.5,
            },
          },
        ],
        "riskScorer": 0.5,
      },
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "chat",
        "principal": {
          "kind": "member",
          "id": "member-1",
        },
        "utterance": "Set the invoice status to Active",
        "messageId": "msg-1",
      },
      "prior": [],
      "step": {
        "kind": "file",
        "toolName": "relay_capture",
        "operation": {
          "kind": "update",
          "entityType": "Invoice",
          "entityId": "invoice-1",
          "fields": [
            "status",
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
        ],
      },
    },
    "expect": {
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
        "toolName": "relay_capture",
      },
    },
  },
  // gate/08-standing-order-threshold-over.json
  {
    "id": "gate/standing-order-threshold-over",
    "rules": [
      "GT-5",
    ],
    "title": "A score above the threshold does not fire and does not fail: it degrades to asking a person, with the reason on the card.",
    "given": {
      "clock": "2026-09-04T09:00:00.000Z",
      "store": "memory",
      "gate": {
        "defaultTtlMs": 1800000,
        "authorization": {
          "allow": [
            "*",
          ],
        },
        "policies": [
          {
            "id": "policy-1",
            "version": "1.0.0",
            "declaredInputs": [],
            "declaresThreshold": true,
            "verdict": {
              "requirement": "StandingOrder",
              "threshold": 0.5,
            },
          },
        ],
        "riskScorer": 0.9,
      },
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "chat",
        "principal": {
          "kind": "member",
          "id": "member-1",
        },
        "utterance": "Set the invoice status to Active",
        "messageId": "msg-1",
      },
      "prior": [],
      "step": {
        "kind": "file",
        "toolName": "relay_capture",
        "operation": {
          "kind": "update",
          "entityType": "Invoice",
          "entityId": "invoice-1",
          "fields": [
            "status",
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
        ],
      },
    },
    "expect": {
      "entry": {
        "status": "pending",
        "requirement": "ReviewerConfirmation",
        "execution": null,
        "blocked": null,
        "expiresAtOffsetMs": 1800000,
        "attestation": null,
        "toolName": "relay_capture",
      },
      "card": {
        "warningsContain": [
          "above the Standing Order's threshold",
        ],
      },
    },
  },
  // gate/09-standing-order-unbound-input.json
  {
    "id": "gate/standing-order-unbound-input",
    "rules": [
      "PV-4",
    ],
    "title": "Sequence C's negative case: a relayed capture whose External tag points at nothing. The policy predicates on External, so the Standing Order is not honoured and a person is asked.",
    "given": {
      "clock": "2026-09-04T09:00:00.000Z",
      "store": "memory",
      "gate": {
        "defaultTtlMs": 1800000,
        "authorization": {
          "allow": [
            "*",
          ],
        },
        "policies": [
          {
            "id": "relay-capture",
            "version": "1.0.0",
            "declaredInputs": [
              "External",
            ],
            "verdict": {
              "requirement": "StandingOrder",
            },
          },
        ],
      },
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "mcp",
        "principal": {
          "kind": "member",
          "id": "member-1",
        },
        "utterance": "Set the invoice status to Active",
        "messageId": "msg-1",
      },
      "prior": [],
      "step": {
        "kind": "file",
        "toolName": "relay_capture",
        "operation": {
          "kind": "update",
          "entityType": "Invoice",
          "entityId": "invoice-1",
          "fields": [
            "status",
          ],
        },
        "preparedFields": [
          {
            "name": "status",
            "kind": "text",
            "value": "Active",
            "provenance": {
              "source": "External",
              "confidence": 1,
            },
          },
        ],
      },
    },
    "expect": {
      "entry": {
        "status": "pending",
        "requirement": "ReviewerConfirmation",
        "execution": null,
        "blocked": null,
        "expiresAtOffsetMs": 1800000,
        "attestation": null,
        "toolName": "relay_capture",
      },
      "card": {
        "warningsContain": [
          "carries a External tag with no binding",
        ],
      },
    },
  },
  // gate/10-standing-order-bound-input.json
  {
    "id": "gate/standing-order-bound-input",
    "rules": [
      "PV-4",
      "AZ-1",
    ],
    "title": "Sequence C's positive case: the same capture whose External tag names the record it came from. The Standing Order fires and the relay is on the attestation's policy, never as a member.",
    "given": {
      "clock": "2026-09-04T09:00:00.000Z",
      "store": "memory",
      "gate": {
        "defaultTtlMs": 1800000,
        "authorization": {
          "allow": [
            "*",
          ],
        },
        "policies": [
          {
            "id": "relay-capture",
            "version": "1.0.0",
            "declaredInputs": [
              "External",
            ],
            "verdict": {
              "requirement": "StandingOrder",
            },
          },
        ],
      },
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "mcp",
        "principal": {
          "kind": "member",
          "id": "member-1",
        },
        "utterance": "Set the invoice status to Active",
        "messageId": "msg-1",
      },
      "prior": [],
      "step": {
        "kind": "file",
        "toolName": "relay_capture",
        "operation": {
          "kind": "update",
          "entityType": "Invoice",
          "entityId": "invoice-1",
          "fields": [
            "status",
          ],
        },
        "preparedFields": [
          {
            "name": "status",
            "kind": "text",
            "value": "Active",
            "provenance": {
              "source": "External",
              "confidence": 1,
              "binding": {
                "kind": "external-ref",
                "ref": {
                  "system": "billing",
                  "recordId": "invoice-1",
                },
              },
            },
          },
        ],
      },
    },
    "expect": {
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
        "toolName": "relay_capture",
      },
    },
  },
  // gate/11-multiparty-blocked.json
  {
    "id": "gate/multiparty-blocked",
    "rules": [
      "AZ-4",
    ],
    "title": "A requirement level this version does not run is recorded verbatim and filed blocked; it is never degraded to the single-approver branch, which is what the shipped .NET gate does.",
    "given": {
      "clock": "2026-09-04T09:00:00.000Z",
      "store": "memory",
      "gate": {
        "defaultTtlMs": 1800000,
        "authorization": {
          "allow": [
            "*",
          ],
        },
        "policies": [
          {
            "id": "policy-1",
            "version": "1.0.0",
            "declaredInputs": [],
            "verdict": {
              "requirement": "MultiParty",
            },
          },
        ],
      },
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "chat",
        "principal": {
          "kind": "member",
          "id": "member-1",
        },
        "utterance": "Set the invoice status to Active",
        "messageId": "msg-1",
      },
      "prior": [],
      "step": {
        "kind": "file",
        "toolName": "relay_capture",
        "operation": {
          "kind": "update",
          "entityType": "Invoice",
          "entityId": "invoice-1",
          "fields": [
            "status",
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
        ],
      },
    },
    "expect": {
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
        "toolName": "relay_capture",
      },
      "card": {
        "warningsContain": [
          "not implemented in this version",
        ],
      },
    },
  },
  // gate/12-referral-blocked.json
  {
    "id": "gate/referral-blocked",
    "rules": [
      "AZ-4",
    ],
    "title": "The same for ReferralRequired, which protocol v0.1 reserves. The parity manifest names the .NET Deferred path.",
    "given": {
      "clock": "2026-09-04T09:00:00.000Z",
      "store": "memory",
      "gate": {
        "defaultTtlMs": 1800000,
        "authorization": {
          "allow": [
            "*",
          ],
        },
        "policies": [
          {
            "id": "policy-1",
            "version": "1.0.0",
            "declaredInputs": [],
            "verdict": {
              "requirement": "ReferralRequired",
            },
          },
        ],
      },
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "chat",
        "principal": {
          "kind": "member",
          "id": "member-1",
        },
        "utterance": "Set the invoice status to Active",
        "messageId": "msg-1",
      },
      "prior": [],
      "step": {
        "kind": "file",
        "toolName": "relay_capture",
        "operation": {
          "kind": "update",
          "entityType": "Invoice",
          "entityId": "invoice-1",
          "fields": [
            "status",
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
        ],
      },
    },
    "expect": {
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
        "toolName": "relay_capture",
      },
    },
  },
  // gate/13-coverage-refused-declared.json
  {
    "id": "gate/coverage-refused-declared",
    "rules": [
      "CV-4",
      "AZ-4",
    ],
    "title": "A tool the host declared it cannot cover: the proposal is filed pending and blocked with the tool and the category on the row, never silently allowed. The Standing Order the policy returned does not rescue it.",
    "given": {
      "clock": "2026-09-04T09:00:00.000Z",
      "store": "memory",
      "gate": {
        "defaultTtlMs": 1800000,
        "authorization": {
          "allow": [
            "*",
          ],
        },
        "policies": [
          {
            "id": "policy-1",
            "version": "1.0.0",
            "declaredInputs": [],
            "verdict": {
              "requirement": "StandingOrder",
            },
          },
        ],
        "uncovered": [
          {
            "tool": "relay_capture",
            "category": "provider-executed",
          },
        ],
      },
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "chat",
        "principal": {
          "kind": "member",
          "id": "member-1",
        },
        "utterance": "Set the invoice status to Active",
        "messageId": "msg-1",
      },
      "prior": [],
      "step": {
        "kind": "file",
        "toolName": "relay_capture",
        "operation": {
          "kind": "update",
          "entityType": "Invoice",
          "entityId": "invoice-1",
          "fields": [
            "status",
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
        ],
      },
    },
    "expect": {
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
        "toolName": "relay_capture",
      },
      "card": {
        "warningsContain": [
          "declared uncovered",
        ],
      },
    },
  },
  // gate/14-update-previous-values.json
  {
    "id": "gate/update-previous-values",
    "rules": [
      "AF-3",
      "AF-1",
      "AF-2",
    ],
    "title": "An update names its entity and carries the previousValue key on every field, holding null where the entity had no stored value. The shipped .NET projection fills previous values on creates only.",
    "given": {
      "clock": "2026-09-04T09:00:00.000Z",
      "store": "memory",
      "gate": {
        "defaultTtlMs": 1800000,
        "authorization": {
          "allow": [
            "*",
          ],
        },
        "entities": {
          "Invoice/invoice-1": {
            "status": "Draft",
          },
        },
      },
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "chat",
        "principal": {
          "kind": "member",
          "id": "member-1",
        },
        "utterance": "Set the invoice status to Active",
        "messageId": "msg-1",
      },
      "prior": [],
      "step": {
        "kind": "file",
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
            "name": "note",
            "kind": "text",
            "value": "urgent",
            "provenance": {
              "source": "Conversation",
              "confidence": 0.9,
            },
          },
        ],
      },
    },
    "expect": {
      "entry": {
        "status": "pending",
        "requirement": "ReviewerConfirmation",
        "execution": null,
        "blocked": null,
        "expiresAtOffsetMs": 1800000,
        "attestation": null,
        "toolName": "relay_capture",
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
      },
    },
  },
  // gate/15-create-null-previous-values.json
  {
    "id": "gate/create-null-previous-values",
    "rules": [
      "AF-3",
    ],
    "title": "A create names no entity and every previousValue is null, whatever the projection port would have said.",
    "given": {
      "clock": "2026-09-04T09:00:00.000Z",
      "store": "memory",
      "gate": {
        "defaultTtlMs": 1800000,
        "authorization": {
          "allow": [
            "*",
          ],
        },
      },
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "chat",
        "principal": {
          "kind": "member",
          "id": "member-1",
        },
        "utterance": "Set the invoice status to Active",
        "messageId": "msg-1",
      },
      "prior": [],
      "step": {
        "kind": "file",
        "toolName": "relay_capture",
        "operation": {
          "kind": "create",
          "entityType": "Invoice",
          "entityId": null,
          "fields": [
            "status",
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
        ],
      },
    },
    "expect": {
      "entry": {
        "status": "pending",
        "requirement": "ReviewerConfirmation",
        "execution": null,
        "blocked": null,
        "expiresAtOffsetMs": 1800000,
        "attestation": null,
        "toolName": "relay_capture",
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
      },
    },
  },
  // gate/16-inference-conversation-and-inferred.json
  {
    "id": "gate/inference-conversation-and-inferred",
    "rules": [
      "GT-1",
      "PV-1",
      "PV-3",
      "AF-1",
      "AF-2",
    ],
    "title": "The inference path: a value literally in the turn is Conversation, a reasoned one is Inferred, a proposed field the port said nothing about is present and Empty-tagged, and the aggregate is the minimum with Empty counting as zero. Neither tag is UserStated (PV-3).",
    "given": {
      "clock": "2026-09-04T09:00:00.000Z",
      "store": "memory",
      "gate": {
        "defaultTtlMs": 1800000,
        "authorization": {
          "allow": [
            "*",
          ],
        },
        "inference": {
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
        "entities": {
          "Invoice/invoice-1": {
            "status": "Draft",
          },
        },
      },
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "chat",
        "principal": {
          "kind": "member",
          "id": "member-1",
        },
        "utterance": "Set the invoice status to Active",
        "messageId": "msg-1",
      },
      "prior": [],
      "step": {
        "kind": "file",
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
        "schema": [
          {
            "name": "status",
            "kind": "text",
            "description": "The status",
          },
          {
            "name": "note",
            "kind": "text",
            "description": "The note",
          },
          {
            "name": "owner",
            "kind": "text",
            "description": "The owner",
          },
        ],
      },
    },
    "expect": {
      "entry": {
        "status": "pending",
        "requirement": "ReviewerConfirmation",
        "execution": null,
        "blocked": null,
        "expiresAtOffsetMs": 1800000,
        "attestation": null,
        "toolName": "relay_capture",
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
      },
    },
  },
  // gate/17-threshold-without-scorer.json
  {
    "id": "gate/threshold-without-scorer",
    "rules": [
      "CV-1",
      "GT-5",
    ],
    "title": "A policy that says it will predicate on a risk threshold, wired to a gate with no risk function, is refused when the gate is built - not on the unlucky request that first reaches the threshold branch. This package ships no scoring formula and no floor by rule, so a declared threshold with nothing to compare against is a configuration error and never a policy that quietly never fires. The check reads the policy's static declaration, because a check that only fires when a policy happens to return a threshold is itself a silent non-fire on every other input.",
    "given": {
      "clock": "2026-09-04T09:00:00.000Z",
      "store": "memory",
      "gate": {
        "defaultTtlMs": 1800000,
        "authorization": {
          "allow": [
            "*",
          ],
        },
        "policies": [
          {
            "id": "under-a-thousand",
            "version": "1.0.0",
            "declaredInputs": [],
            "declaresThreshold": true,
            "verdict": {
              "requirement": "StandingOrder",
              "threshold": 0.5,
            },
          },
        ],
      },
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "chat",
        "principal": {
          "kind": "member",
          "id": "member-1",
        },
        "utterance": "Set the invoice status to Active",
        "messageId": "msg-1",
      },
      "prior": [],
      "step": {
        "kind": "file",
        "toolName": "relay_capture",
        "operation": {
          "kind": "update",
          "entityType": "Invoice",
          "entityId": "invoice-1",
          "fields": [
            "status",
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
        ],
      },
    },
    "expect": {
      "error": {
        "code": "wireup-invalid",
        "messageContains": "riskScorer",
      },
      "store": {
        "count": 0,
      },
    },
  },
  // decide/01-approve.json
  {
    "id": "decide/approve",
    "rules": [
      "DK-1",
      "AZ-1",
      "AZ-2",
    ],
    "title": "A member approves a pending entry: the row moves to approved with the execution outcome unexecuted, and the attestation names the person who agreed. AZ-1 is written in the same operation as the transition, so there is no window in which an approved write has no attribution.",
    "given": {
      "clock": "2026-09-04T09:00:00.000Z",
      "store": "memory",
      "gate": {
        "defaultTtlMs": 1800000,
        "authorization": {
          "allow": [
            "*",
          ],
        },
      },
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "chat",
        "principal": {
          "kind": "member",
          "id": "filer",
        },
        "utterance": "Set the invoice status to Active and the amount to 40",
        "messageId": "msg-1",
      },
      "prior": [
        {
          "kind": "file",
          "as": "filed",
          "at": "2026-09-04T09:00:00.000Z",
          "principal": {
            "kind": "member",
            "id": "filer",
          },
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
        },
      ],
      "step": {
        "kind": "decide",
        "at": "2026-09-04T09:00:00.000Z",
        "principal": {
          "kind": "member",
          "id": "ana",
        },
        "decision": {
          "kind": "approve",
          "reason": "checked against the purchase order",
        },
      },
    },
    "expect": {
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
        "lineage": {
          "supersededBy": null,
        },
      },
    },
  },
  // decide/02-reject.json
  {
    "id": "decide/reject",
    "rules": [
      "DK-1",
      "AZ-1",
    ],
    "title": "A rejection is terminal and carries no execution outcome: nothing was authorised, so there is nothing for an executor to have failed at. The reviewer's stated reason is on the row, because a refusal nobody explained teaches the host nothing.",
    "given": {
      "clock": "2026-09-04T09:00:00.000Z",
      "store": "memory",
      "gate": {
        "defaultTtlMs": 1800000,
        "authorization": {
          "allow": [
            "*",
          ],
        },
      },
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "chat",
        "principal": {
          "kind": "member",
          "id": "filer",
        },
        "utterance": "Set the invoice status to Active and the amount to 40",
        "messageId": "msg-1",
      },
      "prior": [
        {
          "kind": "file",
          "as": "filed",
          "at": "2026-09-04T09:00:00.000Z",
          "principal": {
            "kind": "member",
            "id": "filer",
          },
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
        },
      ],
      "step": {
        "kind": "decide",
        "at": "2026-09-04T09:00:00.000Z",
        "principal": {
          "kind": "member",
          "id": "ana",
        },
        "decision": {
          "kind": "reject",
          "reason": "the amount is an order of magnitude out",
        },
      },
    },
    "expect": {
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
        "lineage": {
          "supersededBy": null,
        },
      },
    },
  },
  // decide/03-second-decision-refused.json
  {
    "id": "decide/second-decision-refused",
    "rules": [
      "DK-1",
    ],
    "title": "A decision on an entry that is no longer pending is refused, never applied twice and never silently overwritten. The first decision and the first attestation stand: a second reviewer arriving late does not get to replace the record of who agreed.",
    "given": {
      "clock": "2026-09-04T09:00:00.000Z",
      "store": "memory",
      "gate": {
        "defaultTtlMs": 1800000,
        "authorization": {
          "allow": [
            "*",
          ],
        },
      },
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "chat",
        "principal": {
          "kind": "member",
          "id": "filer",
        },
        "utterance": "Set the invoice status to Active and the amount to 40",
        "messageId": "msg-1",
      },
      "prior": [
        {
          "kind": "file",
          "as": "filed",
          "at": "2026-09-04T09:00:00.000Z",
          "principal": {
            "kind": "member",
            "id": "filer",
          },
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
        },
        {
          "kind": "decide",
          "at": "2026-09-04T09:00:00.000Z",
          "principal": {
            "kind": "member",
            "id": "ana",
          },
          "decision": {
            "kind": "approve",
          },
          "refusal": null,
        },
      ],
      "step": {
        "kind": "decide",
        "at": "2026-09-04T09:01:00.000Z",
        "principal": {
          "kind": "member",
          "id": "bo",
        },
        "decision": {
          "kind": "reject",
          "reason": "changed our minds",
        },
      },
    },
    "expect": {
      "error": {
        "code": "decision-not-pending",
      },
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
        "lineage": {
          "supersededBy": null,
        },
      },
    },
  },
  // decide/04-expired-amendments-preserved.json
  {
    "id": "decide/expired-amendments-preserved",
    "rules": [
      "DK-1",
    ],
    "title": "An entry past its deadline reads expired whether or not a sweep has run, and a decision arriving after it is refused. The amendments that decision carried are preserved on the row - with the refused decision's own instant and principal, so a resubmission can bind the prefilled values to the act that actually happened. Nothing else is written: no status, no decision record, no attestation, and no accepted-amendment map, because nobody accepted anything.",
    "given": {
      "clock": "2026-09-04T09:00:00.000Z",
      "store": "memory",
      "gate": {
        "defaultTtlMs": 1800000,
        "authorization": {
          "allow": [
            "*",
          ],
        },
      },
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "chat",
        "principal": {
          "kind": "member",
          "id": "filer",
        },
        "utterance": "Set the invoice status to Active and the amount to 40",
        "messageId": "msg-1",
      },
      "prior": [
        {
          "kind": "file",
          "as": "filed",
          "at": "2026-09-04T09:00:00.000Z",
          "principal": {
            "kind": "member",
            "id": "filer",
          },
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
        },
      ],
      "step": {
        "kind": "decide",
        "at": "2026-09-04T09:45:00.000Z",
        "principal": {
          "kind": "member",
          "id": "ana",
        },
        "decision": {
          "kind": "approve",
          "amendments": {
            "amount": "4000",
            "note": null,
          },
        },
      },
    },
    "expect": {
      "error": {
        "code": "decision-expired",
      },
      "entry": {
        "status": "expired",
        "execution": null,
        "requirement": "ReviewerConfirmation",
        "blocked": null,
        "attestation": null,
        "amendments": null,
        "decision": null,
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
        "lineage": {
          "supersededBy": null,
        },
        "preservedAmendments": {
          "amendments": {
            "amount": "4000",
            "note": null,
          },
          "at": "2026-09-04T09:45:00.000Z",
          "by": "ana",
        },
        "amendedAffidavit": null,
      },
    },
  },
  // decide/05-blocked-refused.json
  {
    "id": "decide/blocked-refused",
    "rules": [
      "AZ-4",
      "DK-1",
    ],
    "title": "A requirement level this version does not run files the entry pending with the level recorded verbatim and a blocked marker, and every decision on it is refused. It is never degraded to the weaker requirement the implementation does know how to run, which is the shipped .NET behaviour of routing MultiParty to the single-card branch.",
    "given": {
      "clock": "2026-09-04T09:00:00.000Z",
      "store": "memory",
      "gate": {
        "defaultTtlMs": 1800000,
        "authorization": {
          "allow": [
            "*",
          ],
        },
        "policies": [
          {
            "id": "joint-sign-off",
            "version": "1.0.0",
            "declaredInputs": [],
            "verdict": {
              "requirement": "MultiParty",
            },
          },
        ],
      },
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "chat",
        "principal": {
          "kind": "member",
          "id": "filer",
        },
        "utterance": "Set the invoice status to Active and the amount to 40",
        "messageId": "msg-1",
      },
      "prior": [
        {
          "kind": "file",
          "as": "filed",
          "at": "2026-09-04T09:00:00.000Z",
          "principal": {
            "kind": "member",
            "id": "filer",
          },
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
        },
      ],
      "step": {
        "kind": "decide",
        "at": "2026-09-04T09:00:00.000Z",
        "principal": {
          "kind": "member",
          "id": "ana",
        },
        "decision": {
          "kind": "approve",
        },
      },
    },
    "expect": {
      "error": {
        "code": "decision-not-pending",
      },
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
        "lineage": {
          "supersededBy": null,
        },
      },
    },
  },
  // decide/06-amend-recompute.json
  {
    "id": "decide/amend-recompute",
    "rules": [
      "AF-1",
      "AF-4",
      "DK-2",
      "DK-4",
      "PV-2",
      "SR-1",
    ],
    "title": "An approval carrying an amendment map sets the named values and leaves a field the map does not name untouched. The row keeps the Affidavit as the agent proposed it - unedited, so a reader can still see what the machine said - and gains the accepted state beside it (DK-4). In that accepted state a set field's provenance is the reviewer's act with a reviewer-act binding, and a cleared optional field is off the record entirely, because a field the write no longer proposes is absent rather than present with nothing in it (AF-1) - and because writing the reviewer's confidence of 1 over an emptied field would let a reviewer wipe an Affidavit and leave it reporting perfect confidence over nothing (AF-2). The three numbers are recomputed over what is left. The canonical form follows the accepted state, so a grant minted over the proposal cannot validate the amendment (SR-1).",
    "given": {
      "clock": "2026-09-04T09:00:00.000Z",
      "store": "memory",
      "gate": {
        "defaultTtlMs": 1800000,
        "authorization": {
          "allow": [
            "*",
          ],
        },
      },
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "chat",
        "principal": {
          "kind": "member",
          "id": "filer",
        },
        "utterance": "Set the invoice status to Active and the amount to 40",
        "messageId": "msg-1",
      },
      "prior": [
        {
          "kind": "file",
          "as": "filed",
          "at": "2026-09-04T09:00:00.000Z",
          "principal": {
            "kind": "member",
            "id": "filer",
          },
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
        },
      ],
      "step": {
        "kind": "decide",
        "at": "2026-09-04T09:00:00.000Z",
        "principal": {
          "kind": "member",
          "id": "ana",
        },
        "decision": {
          "kind": "approve",
          "amendments": {
            "amount": "4000",
            "note": null,
          },
        },
      },
    },
    "expect": {
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
        "lineage": {
          "supersededBy": null,
        },
        "amendedAffidavit": {
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
              "bindingKind": "reviewer-act",
              "confidence": 1,
              "priorSources": [
                "Conversation",
              ],
            },
          ],
        },
        "preservedAmendments": null,
        "canonicalDiffersFromProposal": true,
      },
    },
  },
  // decide/07-unresolved-identity.json
  {
    "id": "decide/unresolved-identity",
    "rules": [
      "AZ-2",
      "AZ-6",
    ],
    "title": "A turn context with no resolved principal refuses the decision: identity unknown is never allow. This filing ran with prepared fields and no policy chain, which is the degraded wiring a host falls back to with no model available, and a degraded wiring does not relax an authorization rule.",
    "given": {
      "clock": "2026-09-04T09:00:00.000Z",
      "store": "memory",
      "gate": {
        "defaultTtlMs": 1800000,
        "authorization": {
          "allow": [
            "*",
          ],
        },
      },
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "chat",
        "principal": {
          "kind": "member",
          "id": "filer",
        },
        "utterance": "Set the invoice status to Active and the amount to 40",
        "messageId": "msg-1",
      },
      "prior": [
        {
          "kind": "file",
          "as": "filed",
          "at": "2026-09-04T09:00:00.000Z",
          "principal": {
            "kind": "member",
            "id": "filer",
          },
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
        },
      ],
      "step": {
        "kind": "decide",
        "at": "2026-09-04T09:00:00.000Z",
        "principal": null,
        "decision": {
          "kind": "approve",
        },
      },
    },
    "expect": {
      "error": {
        "code": "decision-unauthorized",
      },
      "entry": {
        "status": "pending",
        "execution": null,
        "requirement": "ReviewerConfirmation",
        "blocked": null,
        "attestation": null,
        "amendments": null,
        "decision": null,
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
        "lineage": {
          "supersededBy": null,
        },
      },
    },
  },
  // decide/08-wrong-tenant.json
  {
    "id": "decide/wrong-tenant",
    "rules": [
      "AZ-2",
    ],
    "title": "A decision made from another tenant is reported as entry not found, exactly as an id that never existed. Answering unauthorized for that tenant would confirm the id to anyone who could guess one, and the tenant is the boundary the rule exists to hold.",
    "given": {
      "clock": "2026-09-04T09:00:00.000Z",
      "store": "memory",
      "gate": {
        "defaultTtlMs": 1800000,
        "authorization": {
          "allow": [
            "*",
          ],
        },
      },
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "chat",
        "principal": {
          "kind": "member",
          "id": "filer",
        },
        "utterance": "Set the invoice status to Active and the amount to 40",
        "messageId": "msg-1",
      },
      "prior": [
        {
          "kind": "file",
          "as": "filed",
          "at": "2026-09-04T09:00:00.000Z",
          "principal": {
            "kind": "member",
            "id": "filer",
          },
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
        },
      ],
      "step": {
        "kind": "decide",
        "at": "2026-09-04T09:00:00.000Z",
        "principal": {
          "kind": "member",
          "id": "ana",
        },
        "tenantId": "tenant-b",
        "decision": {
          "kind": "approve",
        },
      },
    },
    "expect": {
      "error": {
        "code": "entry-not-found",
      },
      "entry": {
        "status": "pending",
        "execution": null,
        "requirement": "ReviewerConfirmation",
        "blocked": null,
        "attestation": null,
        "amendments": null,
        "decision": null,
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
        "lineage": {
          "supersededBy": null,
        },
      },
    },
  },
  // decide/09-authorization-declined.json
  {
    "id": "decide/authorization-declined",
    "rules": [
      "AZ-2",
      "AZ-6",
    ],
    "title": "The host's authorization port is asked whether this principal may decide this entry, and the gate fails closed on the answer. A no leaves the row pending and unattested; there is no wiring, degraded or otherwise, in which the check is skipped.",
    "given": {
      "clock": "2026-09-04T09:00:00.000Z",
      "store": "memory",
      "gate": {
        "defaultTtlMs": 1800000,
        "authorization": {
          "allow": [],
        },
      },
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "chat",
        "principal": {
          "kind": "member",
          "id": "filer",
        },
        "utterance": "Set the invoice status to Active and the amount to 40",
        "messageId": "msg-1",
      },
      "prior": [
        {
          "kind": "file",
          "as": "filed",
          "at": "2026-09-04T09:00:00.000Z",
          "principal": {
            "kind": "member",
            "id": "filer",
          },
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
        },
      ],
      "step": {
        "kind": "decide",
        "at": "2026-09-04T09:00:00.000Z",
        "principal": {
          "kind": "member",
          "id": "ana",
        },
        "decision": {
          "kind": "approve",
        },
      },
    },
    "expect": {
      "error": {
        "code": "decision-unauthorized",
      },
      "entry": {
        "status": "pending",
        "execution": null,
        "requirement": "ReviewerConfirmation",
        "blocked": null,
        "attestation": null,
        "amendments": null,
        "decision": null,
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
        "lineage": {
          "supersededBy": null,
        },
      },
    },
  },
  // decide/10-relay-member-via-relay.json
  {
    "id": "decide/relay-member-via-relay",
    "rules": [
      "AZ-3",
      "AZ-1",
    ],
    "title": "Sequence C-2: a decision made by a person through a trusted relay attests member-via-relay, naming both the person the relay speaks for and the relay, its channel identity and the message the decision arrived on. It is the strongest claim available, and it is visibly not a member attestation.",
    "given": {
      "clock": "2026-09-04T09:00:00.000Z",
      "store": "memory",
      "gate": {
        "defaultTtlMs": 1800000,
        "authorization": {
          "allow": [
            "*",
          ],
        },
      },
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "mcp",
        "principal": {
          "kind": "member",
          "id": "filer",
        },
        "utterance": "Set the invoice status to Active and the amount to 40",
        "messageId": "msg-1",
      },
      "prior": [
        {
          "kind": "file",
          "as": "filed",
          "at": "2026-09-04T09:00:00.000Z",
          "principal": {
            "kind": "member",
            "id": "filer",
          },
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
        },
      ],
      "step": {
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
        "decision": {
          "kind": "approve",
        },
      },
    },
    "expect": {
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
        "lineage": {
          "supersededBy": null,
        },
      },
    },
  },
  // decide/11-relay-without-assertion-refused.json
  {
    "id": "decide/relay-without-assertion-refused",
    "rules": [
      "AZ-3",
    ],
    "title": "Sequence C-4: a machine caller that names neither the person it speaks for nor the message it carried cannot attest a decision at all. There is no path by which a service principal produces a member attestation, so the refusal is the only available answer rather than a weaker attestation.",
    "given": {
      "clock": "2026-09-04T09:00:00.000Z",
      "store": "memory",
      "gate": {
        "defaultTtlMs": 1800000,
        "authorization": {
          "allow": [
            "*",
          ],
        },
      },
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "mcp",
        "principal": {
          "kind": "member",
          "id": "filer",
        },
        "utterance": "Set the invoice status to Active and the amount to 40",
        "messageId": "msg-1",
      },
      "prior": [
        {
          "kind": "file",
          "as": "filed",
          "at": "2026-09-04T09:00:00.000Z",
          "principal": {
            "kind": "member",
            "id": "filer",
          },
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
        },
        {
          "kind": "decide",
          "at": "2026-09-04T09:00:00.000Z",
          "principal": {
            "kind": "service",
            "id": "svc-1",
          },
          "decision": {
            "kind": "approve",
          },
          "refusal": "decision-unauthorized",
        },
      ],
      "step": {
        "kind": "decide",
        "at": "2026-09-04T09:01:00.000Z",
        "principal": {
          "kind": "service",
          "id": "whatsapp-relay",
          "assertedMember": "ana",
        },
        "decision": {
          "kind": "approve",
        },
      },
    },
    "expect": {
      "error": {
        "code": "decision-unauthorized",
      },
      "entry": {
        "status": "pending",
        "execution": null,
        "requirement": "ReviewerConfirmation",
        "blocked": null,
        "attestation": null,
        "amendments": null,
        "decision": null,
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
        "lineage": {
          "supersededBy": null,
        },
      },
    },
  },
  // decide/12-execution-executed.json
  {
    "id": "decide/execution-executed",
    "rules": [
      "DK-1",
      "AZ-5",
    ],
    "title": "The host's executor reports that the approved write happened. The status stays approved and only the execution outcome moves, so the approval is not re-litigated by the report; the detail the executor gave is kept beside it.",
    "given": {
      "clock": "2026-09-04T09:00:00.000Z",
      "store": "memory",
      "gate": {
        "defaultTtlMs": 1800000,
        "authorization": {
          "allow": [
            "*",
          ],
        },
      },
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "chat",
        "principal": {
          "kind": "member",
          "id": "filer",
        },
        "utterance": "Set the invoice status to Active and the amount to 40",
        "messageId": "msg-1",
      },
      "prior": [
        {
          "kind": "file",
          "as": "filed",
          "at": "2026-09-04T09:00:00.000Z",
          "principal": {
            "kind": "member",
            "id": "filer",
          },
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
        },
        {
          "kind": "decide",
          "at": "2026-09-04T09:00:00.000Z",
          "principal": {
            "kind": "member",
            "id": "ana",
          },
          "decision": {
            "kind": "approve",
          },
          "refusal": null,
        },
      ],
      "step": {
        "kind": "markExecuted",
        "at": "2026-09-04T09:01:00.000Z",
        "principal": {
          "kind": "member",
          "id": "ana",
        },
        "outcome": "executed",
        "detail": "invoice row 41",
      },
    },
    "expect": {
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
        "lineage": {
          "supersededBy": null,
        },
      },
    },
  },
  // decide/13-execution-failed.json
  {
    "id": "decide/execution-failed",
    "rules": [
      "DK-1",
    ],
    "title": "An approved-but-failed write is distinguishable from an approved-and-committed one on the row: the status is still approved, because the approval happened, and the execution outcome is failed. Collapsing the two into the status would lose the approval.",
    "given": {
      "clock": "2026-09-04T09:00:00.000Z",
      "store": "memory",
      "gate": {
        "defaultTtlMs": 1800000,
        "authorization": {
          "allow": [
            "*",
          ],
        },
      },
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "chat",
        "principal": {
          "kind": "member",
          "id": "filer",
        },
        "utterance": "Set the invoice status to Active and the amount to 40",
        "messageId": "msg-1",
      },
      "prior": [
        {
          "kind": "file",
          "as": "filed",
          "at": "2026-09-04T09:00:00.000Z",
          "principal": {
            "kind": "member",
            "id": "filer",
          },
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
        },
        {
          "kind": "decide",
          "at": "2026-09-04T09:00:00.000Z",
          "principal": {
            "kind": "member",
            "id": "ana",
          },
          "decision": {
            "kind": "approve",
          },
          "refusal": null,
        },
      ],
      "step": {
        "kind": "markExecuted",
        "at": "2026-09-04T09:01:00.000Z",
        "principal": {
          "kind": "member",
          "id": "ana",
        },
        "outcome": "failed",
        "detail": "unique constraint on invoice_no",
      },
    },
    "expect": {
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
        "lineage": {
          "supersededBy": null,
        },
      },
    },
  },
  // decide/14-execution-on-pending-refused.json
  {
    "id": "decide/execution-on-pending-refused",
    "rules": [
      "DK-1",
      "AZ-5",
    ],
    "title": "An execution outcome is only ever recorded against an approved, attested row. A report on a pending entry is refused, because there is no authorised write for an executor to have performed and the Docket entry is the sole record of that authority.",
    "given": {
      "clock": "2026-09-04T09:00:00.000Z",
      "store": "memory",
      "gate": {
        "defaultTtlMs": 1800000,
        "authorization": {
          "allow": [
            "*",
          ],
        },
      },
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "chat",
        "principal": {
          "kind": "member",
          "id": "filer",
        },
        "utterance": "Set the invoice status to Active and the amount to 40",
        "messageId": "msg-1",
      },
      "prior": [
        {
          "kind": "file",
          "as": "filed",
          "at": "2026-09-04T09:00:00.000Z",
          "principal": {
            "kind": "member",
            "id": "filer",
          },
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
        },
      ],
      "step": {
        "kind": "markExecuted",
        "at": "2026-09-04T09:00:00.000Z",
        "principal": {
          "kind": "member",
          "id": "ana",
        },
        "outcome": "executed",
      },
    },
    "expect": {
      "error": {
        "code": "decision-not-pending",
      },
      "entry": {
        "status": "pending",
        "execution": null,
        "requirement": "ReviewerConfirmation",
        "blocked": null,
        "attestation": null,
        "amendments": null,
        "decision": null,
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
        "lineage": {
          "supersededBy": null,
        },
      },
    },
  },
  // decide/15-resubmit-prefills.json
  {
    "id": "decide/resubmit-prefills",
    "rules": [
      "DK-1",
      "DK-2",
      "PV-2",
    ],
    "title": "A resubmission is a new entry, never a reopened one: the expired entry keeps its terminal state and gains a successor link, and the new row names what it supersedes. The amendments the refused late decision left behind are prefilled as values, each carrying the reviewer's act with a reviewer-act binding that names the superseded entry and the instant the correction was actually made. The resubmission is filed under the same tool the original proposal came from, so coverage can be re-assessed.",
    "given": {
      "clock": "2026-09-04T09:00:00.000Z",
      "store": "memory",
      "gate": {
        "defaultTtlMs": 1800000,
        "authorization": {
          "allow": [
            "*",
          ],
        },
      },
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "chat",
        "principal": {
          "kind": "member",
          "id": "filer",
        },
        "utterance": "Set the invoice status to Active and the amount to 40",
        "messageId": "msg-1",
      },
      "prior": [
        {
          "kind": "file",
          "as": "filed",
          "at": "2026-09-04T09:00:00.000Z",
          "principal": {
            "kind": "member",
            "id": "filer",
          },
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
        },
        {
          "kind": "decide",
          "at": "2026-09-04T09:45:00.000Z",
          "principal": {
            "kind": "member",
            "id": "ana",
          },
          "decision": {
            "kind": "approve",
            "amendments": {
              "amount": "4000",
              "note": null,
            },
          },
          "refusal": "decision-expired",
        },
      ],
      "step": {
        "kind": "resubmit",
        "at": "2026-09-04T09:46:00.000Z",
        "principal": {
          "kind": "member",
          "id": "ana",
        },
      },
    },
    "expect": {
      "entry": {
        "status": "pending",
        "execution": null,
        "affidavit": {
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
              "bindingKind": "reviewer-act",
              "priorSources": [
                "Conversation",
              ],
            },
            {
              "name": "note",
              "value": null,
              "source": "UserStated",
              "bound": true,
              "bindingKind": "reviewer-act",
              "priorSources": [
                "Conversation",
              ],
            },
          ],
        },
        "lineage": {
          "supersedes": "@some",
        },
        "toolName": "update_invoice",
        "preservedAmendments": null,
        "amendedAffidavit": null,
      },
      "card": {
        "priorAmendments": {
          "amount": "4000",
          "note": null,
        },
      },
      "superseded": {
        "status": "expired",
        "execution": null,
        "requirement": "ReviewerConfirmation",
        "blocked": null,
        "attestation": null,
        "amendments": null,
        "decision": null,
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
        "lineage": {
          "supersededBy": "@some",
        },
        "preservedAmendments": {
          "amendments": {
            "amount": "4000",
            "note": null,
          },
          "at": "2026-09-04T09:45:00.000Z",
          "by": "ana",
        },
      },
    },
  },
  // decide/16-executed-only-through-a-report.json
  {
    "id": "decide/executed-only-through-a-report",
    "rules": [
      "AZ-7",
    ],
    "title": "The gate never performs the write and never calls an executor: after an approval, and after every other act the gate offers, the row is still unexecuted. Only a host's own report moves it, which is the fixture pair with the execution outcome above.",
    "given": {
      "clock": "2026-09-04T09:00:00.000Z",
      "store": "memory",
      "gate": {
        "defaultTtlMs": 1800000,
        "authorization": {
          "allow": [
            "*",
          ],
        },
      },
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "chat",
        "principal": {
          "kind": "member",
          "id": "filer",
        },
        "utterance": "Set the invoice status to Active and the amount to 40",
        "messageId": "msg-1",
      },
      "prior": [
        {
          "kind": "file",
          "as": "filed",
          "at": "2026-09-04T09:00:00.000Z",
          "principal": {
            "kind": "member",
            "id": "filer",
          },
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
        },
        {
          "kind": "decide",
          "at": "2026-09-04T09:00:00.000Z",
          "principal": {
            "kind": "member",
            "id": "ana",
          },
          "decision": {
            "kind": "approve",
          },
          "refusal": null,
        },
        {
          "kind": "resubmit",
          "at": "2026-09-04T09:01:00.000Z",
          "principal": {
            "kind": "member",
            "id": "ana",
          },
          "refusal": "decision-not-pending",
        },
      ],
      "step": {
        "kind": "decide",
        "at": "2026-09-04T09:02:00.000Z",
        "principal": {
          "kind": "member",
          "id": "bo",
        },
        "decision": {
          "kind": "approve",
        },
      },
    },
    "expect": {
      "error": {
        "code": "decision-not-pending",
      },
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
        "lineage": {
          "supersededBy": null,
        },
      },
    },
  },
  // decide/17-authorization-throws.json
  {
    "id": "decide/authorization-throws",
    "rules": [
      "AZ-2",
      "AZ-6",
    ],
    "title": "The host's authorization port fell over rather than answering. The decision is refused: a port that throws has not said yes, and the whole of AZ-2 is that identity unknown is never allow. There is no degraded path here either - nothing in the decision path is conditional on a port being reachable, so a directory outage cannot turn into an approval.",
    "given": {
      "clock": "2026-09-04T09:00:00.000Z",
      "store": "memory",
      "gate": {
        "defaultTtlMs": 1800000,
        "authorization": {
          "allow": [
            "*",
          ],
          "throws": true,
        },
      },
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "chat",
        "principal": {
          "kind": "member",
          "id": "filer",
        },
        "utterance": "Set the invoice status to Active and the amount to 40",
        "messageId": "msg-1",
      },
      "prior": [
        {
          "kind": "file",
          "as": "filed",
          "at": "2026-09-04T09:00:00.000Z",
          "principal": {
            "kind": "member",
            "id": "filer",
          },
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
        },
      ],
      "step": {
        "kind": "decide",
        "at": "2026-09-04T09:00:00.000Z",
        "principal": {
          "kind": "member",
          "id": "ana",
        },
        "decision": {
          "kind": "approve",
        },
      },
    },
    "expect": {
      "error": {
        "code": "decision-unauthorized",
      },
      "entry": {
        "status": "pending",
        "execution": null,
        "attestation": null,
        "decision": null,
        "amendments": null,
        "preservedAmendments": null,
      },
      "telemetry": [
        "decision.unauthorized",
      ],
    },
  },
  // sequence-a/01-approve-round-trip.json
  {
    "id": "sequence-a/approve-round-trip",
    "rules": [
      "GT-1",
      "GT-6",
      "DK-1",
      "AZ-1",
      "AZ-5",
    ],
    "title": "The whole of Sequence A: a chat turn calls a wrapped write tool, the gate files an Affidavit instead of writing, a person approves it, and the host's executor reports back. The tool's own execute is never called at any point - the wrapped one files a proposal and returns the card - so the only path to executed is a report against an approved, attested row.",
    "given": {
      "clock": "2026-09-04T09:00:00.000Z",
      "store": "memory",
      "gate": {
        "defaultTtlMs": 1800000,
        "authorization": {
          "allow": [
            "*",
          ],
        },
        "inference": {
          "status": {
            "value": "Active",
            "confidence": 0.9,
            "presence": "literal",
            "utteranceSpan": {
              "start": 21,
              "end": 27,
            },
          },
        },
      },
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "chat",
        "principal": {
          "kind": "member",
          "id": "ana",
        },
        "utterance": "Set invoice INV-2 to Active",
        "messageId": "msg-1",
      },
      "prior": [
        {
          "kind": "wrap-execute",
          "as": "filed",
          "at": "2026-09-04T09:00:00.000Z",
          "tool": {
            "name": "update_invoice",
            "description": "Update an invoice",
            "entityType": "Invoice",
            "entityId": "invoice-1",
            "writeCapable": true,
            "fields": [
              {
                "name": "status",
                "kind": "enum",
                "description": "The invoice status",
                "required": true,
                "allowedValues": [
                  "Draft",
                  "Active",
                  "Retired",
                ],
                "pattern": null,
              },
            ],
          },
          "args": {
            "status": "Draft",
          },
        },
        {
          "kind": "decide",
          "at": "2026-09-04T09:00:00.000Z",
          "principal": {
            "kind": "member",
            "id": "ana",
          },
          "decision": {
            "kind": "approve",
            "reason": "matches the purchase order",
          },
          "refusal": null,
        },
      ],
      "step": {
        "kind": "markExecuted",
        "at": "2026-09-04T09:01:00.000Z",
        "principal": {
          "kind": "service",
          "id": "executor-1",
        },
        "outcome": "executed",
        "detail": "1 row updated",
      },
    },
    "expect": {
      "entry": {
        "status": "approved",
        "execution": "executed",
        "requirement": "ReviewerConfirmation",
        "blocked": null,
        "toolName": "update_invoice",
        "channel": "chat",
        "attestation": {
          "kind": "member",
          "id": "ana",
        },
        "decision": {
          "kind": "approve",
          "reason": "matches the purchase order",
        },
        "amendments": null,
        "preservedAmendments": null,
        "amendedAffidavit": null,
        "expiresAtOffsetMs": 1800000,
        "affidavit": {
          "operationType": "update",
          "entityType": "Invoice",
          "entityId": "invoice-1",
          "aggregateConfidence": 0.9,
          "populatedConfidence": 0.9,
          "emptyFieldCount": 0,
          "fields": [
            {
              "name": "status",
              "value": "Active",
              "previousValue": null,
              "kind": "enum",
              "isMandatory": true,
              "source": "Conversation",
              "bound": true,
              "bindingKind": "utterance-span",
              "confidence": 0.9,
            },
          ],
        },
      },
      "telemetry": [
        "affidavit.filed",
        "docket.transition",
      ],
      "store": {
        "count": 1,
        "pending": 0,
        "approvedUnexecuted": 0,
      },
    },
  },
  // sequence-a/02-reject-round-trip.json
  {
    "id": "sequence-a/reject-round-trip",
    "rules": [
      "DK-1",
      "AZ-1",
    ],
    "title": "A person rejects the proposal: the row moves to rejected, carries no execution outcome because there is no authorised write, and records both the reason the person gave and the attestation naming them. Nothing was written to the host's store, and nothing can be - a rejected row has no path to an execution report.",
    "given": {
      "clock": "2026-09-04T09:00:00.000Z",
      "store": "memory",
      "gate": {
        "defaultTtlMs": 1800000,
        "authorization": {
          "allow": [
            "*",
          ],
        },
        "inference": {
          "status": {
            "value": "Active",
            "confidence": 0.9,
            "presence": "literal",
            "utteranceSpan": {
              "start": 21,
              "end": 27,
            },
          },
        },
      },
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "chat",
        "principal": {
          "kind": "member",
          "id": "ana",
        },
        "utterance": "Set invoice INV-2 to Active",
        "messageId": "msg-1",
      },
      "prior": [
        {
          "kind": "wrap-execute",
          "as": "filed",
          "at": "2026-09-04T09:00:00.000Z",
          "tool": {
            "name": "update_invoice",
            "description": "Update an invoice",
            "entityType": "Invoice",
            "entityId": "invoice-1",
            "writeCapable": true,
            "fields": [
              {
                "name": "status",
                "kind": "enum",
                "description": "The invoice status",
                "required": true,
                "allowedValues": [
                  "Draft",
                  "Active",
                  "Retired",
                ],
                "pattern": null,
              },
            ],
          },
          "args": {
            "status": "Draft",
          },
        },
      ],
      "step": {
        "kind": "decide",
        "at": "2026-09-04T09:00:00.000Z",
        "principal": {
          "kind": "member",
          "id": "ana",
        },
        "decision": {
          "kind": "reject",
          "reason": "the purchase order says Retired",
        },
      },
    },
    "expect": {
      "entry": {
        "status": "rejected",
        "execution": null,
        "blocked": null,
        "attestation": {
          "kind": "member",
          "id": "ana",
        },
        "decision": {
          "kind": "reject",
          "reason": "the purchase order says Retired",
        },
        "amendedAffidavit": null,
      },
      "store": {
        "count": 1,
        "pending": 0,
        "approvedUnexecuted": 0,
      },
    },
  },
  // sequence-a/03-typed-inputs-on-the-card.json
  {
    "id": "sequence-a/typed-inputs-on-the-card",
    "rules": [
      "AF-1",
      "SR-4",
      "AF-2",
    ],
    "title": "A tool whose fields are typed - an enum with its closed set, a number with the pattern a reviewer's input is constrained by, a date, a free text - produces a card carrying every one of those shapes. The reviewer surface renders the control the field deserves rather than four text boxes, and the gate carries the constraint without ever validating a value against it: the pattern is presentation, not sworn substance.",
    "given": {
      "clock": "2026-09-04T09:00:00.000Z",
      "store": "memory",
      "gate": {
        "defaultTtlMs": 1800000,
        "authorization": {
          "allow": [
            "*",
          ],
        },
        "inference": {
          "status": {
            "value": "Active",
            "confidence": 0.9,
            "presence": "literal",
            "utteranceSpan": null,
          },
          "amount": {
            "value": 40,
            "confidence": 0.8,
            "presence": "literal",
            "utteranceSpan": null,
          },
          "dueOn": {
            "value": "2026-10-01",
            "confidence": 0.6,
            "presence": "inferred",
            "utteranceSpan": null,
          },
          "note": {
            "value": "raised in chat",
            "confidence": 0.7,
            "presence": "inferred",
            "utteranceSpan": null,
          },
        },
      },
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "chat",
        "principal": {
          "kind": "member",
          "id": "ana",
        },
        "utterance": "Set invoice INV-2 to Active for 40, due on the first of October",
        "messageId": "msg-1",
      },
      "prior": [],
      "step": {
        "kind": "wrap-execute",
        "at": "2026-09-04T09:00:00.000Z",
        "tool": {
          "name": "update_invoice",
          "description": "Update an invoice",
          "entityType": "Invoice",
          "entityId": "invoice-1",
          "writeCapable": true,
          "fields": [
            {
              "name": "status",
              "kind": "enum",
              "description": "The invoice status",
              "required": true,
              "allowedValues": [
                "Draft",
                "Active",
                "Retired",
              ],
              "pattern": null,
            },
            {
              "name": "amount",
              "kind": "number",
              "description": "The invoice total",
              "required": true,
              "allowedValues": null,
              "pattern": "^\\d+(\\.\\d{1,2})?$",
            },
            {
              "name": "dueOn",
              "kind": "date",
              "description": "When payment is due",
              "required": false,
              "allowedValues": null,
              "pattern": null,
            },
            {
              "name": "note",
              "kind": "text",
              "description": null,
              "required": false,
              "allowedValues": null,
              "pattern": null,
            },
          ],
        },
        "args": {
          "status": "Draft",
          "amount": 0,
          "dueOn": null,
          "note": null,
        },
      },
    },
    "expect": {
      "entry": {
        "status": "pending",
        "requirement": "ReviewerConfirmation",
        "toolName": "update_invoice",
        "affidavit": {
          "aggregateConfidence": 0.6,
          "populatedConfidence": 0.6,
          "emptyFieldCount": 0,
          "fields": [
            {
              "name": "status",
              "kind": "enum",
              "value": "Active",
              "isMandatory": true,
              "source": "Conversation",
            },
            {
              "name": "amount",
              "kind": "number",
              "value": 40,
              "isMandatory": true,
              "source": "Conversation",
            },
            {
              "name": "dueOn",
              "kind": "date",
              "value": "2026-10-01",
              "isMandatory": false,
              "source": "Inferred",
            },
            {
              "name": "note",
              "kind": "text",
              "value": "raised in chat",
              "isMandatory": false,
              "source": "Inferred",
            },
          ],
        },
      },
      "card": {
        "requiresConfirmation": true,
        "aggregateConfidence": 0.6,
        "populatedConfidence": 0.6,
        "emptyFieldCount": 0,
        "fields": [
          {
            "name": "status",
            "kind": "enum",
            "value": "Active",
            "allowedValues": [
              "Draft",
              "Active",
              "Retired",
            ],
            "pattern": null,
            "isMandatory": true,
          },
          {
            "name": "amount",
            "kind": "number",
            "value": 40,
            "allowedValues": null,
            "pattern": "^\\d+(\\.\\d{1,2})?$",
            "isMandatory": true,
          },
          {
            "name": "dueOn",
            "kind": "date",
            "value": "2026-10-01",
            "allowedValues": null,
            "pattern": null,
            "isMandatory": false,
          },
          {
            "name": "note",
            "kind": "text",
            "value": "raised in chat",
            "allowedValues": null,
            "pattern": null,
            "isMandatory": false,
          },
        ],
      },
    },
  },
  // sequence-a/04-picker-external-binding.json
  {
    "id": "sequence-a/picker-external-binding",
    "rules": [
      "PV-1",
      "PV-2",
      "PV-3",
      "GT-1",
    ],
    "title": "A picker: the person chose an owner from a list the host resolved, so a deterministic interceptor sets the field from the system of record with an external-ref binding naming the record it came from. The interceptor runs before any model is asked (GT-1 step 2), its External tag beats the model's Conversation tag on the ladder, and the model's tag is kept in the chain so a card can show that the two disagreed. An interceptor cannot claim the person said it - PV-3 is in the type, not in a check.",
    "given": {
      "clock": "2026-09-04T09:00:00.000Z",
      "store": "memory",
      "gate": {
        "defaultTtlMs": 1800000,
        "authorization": {
          "allow": [
            "*",
          ],
        },
        "inference": {
          "status": {
            "value": "Active",
            "confidence": 0.9,
            "presence": "literal",
            "utteranceSpan": null,
          },
          "owner": {
            "value": "someone in support",
            "confidence": 0.9,
            "presence": "inferred",
            "utteranceSpan": null,
          },
        },
        "interceptors": [
          {
            "name": "owner-picker",
            "fields": {
              "owner": {
                "value": "user-77",
                "source": "External",
                "confidence": 1,
                "evidence": "Chosen from the owner picker",
                "binding": {
                  "kind": "external-ref",
                  "ref": {
                    "system": "directory",
                    "recordId": "user-77",
                  },
                },
              },
            },
          },
        ],
      },
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "chat",
        "principal": {
          "kind": "member",
          "id": "ana",
        },
        "utterance": "Set invoice INV-2 to Active and give it to the person I picked",
        "messageId": "msg-1",
      },
      "prior": [],
      "step": {
        "kind": "wrap-execute",
        "at": "2026-09-04T09:00:00.000Z",
        "tool": {
          "name": "update_invoice",
          "description": "Update an invoice",
          "entityType": "Invoice",
          "entityId": "invoice-1",
          "writeCapable": true,
          "fields": [
            {
              "name": "status",
              "kind": "enum",
              "description": "The invoice status",
              "required": true,
              "allowedValues": [
                "Draft",
                "Active",
                "Retired",
              ],
              "pattern": null,
            },
            {
              "name": "owner",
              "kind": "text",
              "description": "Who owns it",
              "required": true,
              "allowedValues": null,
              "pattern": null,
            },
          ],
        },
        "args": {
          "status": "Draft",
          "owner": null,
        },
      },
    },
    "expect": {
      "entry": {
        "status": "pending",
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
              "name": "owner",
              "value": "user-77",
              "source": "External",
              "bound": true,
              "bindingKind": "external-ref",
              "confidence": 1,
              "priorSources": [
                "Inferred",
              ],
            },
          ],
        },
      },
    },
  },
  // sequence-a/05-mandatory-field-left-empty.json
  {
    "id": "sequence-a/mandatory-field-left-empty",
    "rules": [
      "AF-1",
      "AF-2",
      "GT-5",
    ],
    "title": "The model could not fill a field the entity requires. The field stays on the record, tagged Empty at confidence zero, and is visible on the card as empty rather than quietly dropped (AF-1). The three numbers then say different things and all three are shown: the aggregate is zero because a proposed field has unknown provenance, the populated confidence is still 0.9 over the field that was filled, and one field is empty. A mean over the populated fields would have reported 0.9 and hidden the hole. The Standing Order in the chain does not fire: the host's risk score on a half-filled proposal is above the threshold the policy named, so a person is asked instead (GT-5).",
    "given": {
      "clock": "2026-09-04T09:00:00.000Z",
      "store": "memory",
      "gate": {
        "defaultTtlMs": 1800000,
        "authorization": {
          "allow": [
            "*",
          ],
        },
        "inference": {
          "status": {
            "value": "Active",
            "confidence": 0.9,
            "presence": "literal",
            "utteranceSpan": {
              "start": 21,
              "end": 27,
            },
          },
        },
        "riskScorer": 0.8,
        "policies": [
          {
            "id": "auto-approve-low-risk",
            "version": "1.0.0",
            "declaredInputs": [],
            "declaresThreshold": true,
            "verdict": {
              "requirement": "StandingOrder",
              "threshold": 0.2,
            },
          },
        ],
      },
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "chat",
        "principal": {
          "kind": "member",
          "id": "ana",
        },
        "utterance": "Set invoice INV-2 to Active",
        "messageId": "msg-1",
      },
      "prior": [],
      "step": {
        "kind": "wrap-execute",
        "at": "2026-09-04T09:00:00.000Z",
        "tool": {
          "name": "update_invoice",
          "description": "Update an invoice",
          "entityType": "Invoice",
          "entityId": "invoice-1",
          "writeCapable": true,
          "fields": [
            {
              "name": "status",
              "kind": "enum",
              "description": "The invoice status",
              "required": true,
              "allowedValues": [
                "Draft",
                "Active",
                "Retired",
              ],
              "pattern": null,
            },
            {
              "name": "reference",
              "kind": "text",
              "description": "The supplier reference",
              "required": true,
              "allowedValues": null,
              "pattern": null,
            },
          ],
        },
        "args": {
          "status": "Draft",
          "reference": null,
        },
      },
    },
    "expect": {
      "entry": {
        "status": "pending",
        "requirement": "ReviewerConfirmation",
        "execution": null,
        "attestation": null,
        "blocked": null,
        "affidavit": {
          "aggregateConfidence": 0,
          "populatedConfidence": 0.9,
          "emptyFieldCount": 1,
          "fields": [
            {
              "name": "status",
              "value": "Active",
              "source": "Conversation",
              "bound": true,
              "bindingKind": "utterance-span",
              "isMandatory": true,
            },
            {
              "name": "reference",
              "value": null,
              "source": "Empty",
              "bound": false,
              "isMandatory": true,
              "confidence": 0,
            },
          ],
        },
      },
      "card": {
        "requiresConfirmation": true,
        "aggregateConfidence": 0,
        "populatedConfidence": 0.9,
        "emptyFieldCount": 1,
        "warningsContain": [
          "GT-5",
        ],
        "fields": [
          {
            "name": "status",
            "value": "Active",
            "isMandatory": true,
          },
          {
            "name": "reference",
            "value": null,
            "isMandatory": true,
          },
        ],
      },
      "telemetry": [
        "standing-order.blocked",
        "affidavit.filed",
      ],
    },
  },
  // sequence-a/06-mandatory-field-reviewer-approves.json
  {
    "id": "sequence-a/mandatory-field-reviewer-approves",
    "rules": [
      "AF-1",
      "AF-2",
      "DK-1",
    ],
    "title": "A person may still approve a proposal the machine could not complete. The empty mandatory field stays empty on the record - the approval is of what was sworn to, not a licence to invent the missing value - and the three numbers are unchanged by the decision. This is the asymmetry the framework is built on: a policy will not auto-approve a half-filled proposal, and a person, who can see the hole, may.",
    "given": {
      "clock": "2026-09-04T09:00:00.000Z",
      "store": "memory",
      "gate": {
        "defaultTtlMs": 1800000,
        "authorization": {
          "allow": [
            "*",
          ],
        },
        "inference": {
          "status": {
            "value": "Active",
            "confidence": 0.9,
            "presence": "literal",
            "utteranceSpan": {
              "start": 21,
              "end": 27,
            },
          },
        },
      },
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "chat",
        "principal": {
          "kind": "member",
          "id": "ana",
        },
        "utterance": "Set invoice INV-2 to Active",
        "messageId": "msg-1",
      },
      "prior": [
        {
          "kind": "wrap-execute",
          "as": "filed",
          "at": "2026-09-04T09:00:00.000Z",
          "tool": {
            "name": "update_invoice",
            "description": "Update an invoice",
            "entityType": "Invoice",
            "entityId": "invoice-1",
            "writeCapable": true,
            "fields": [
              {
                "name": "status",
                "kind": "enum",
                "description": "The invoice status",
                "required": true,
                "allowedValues": [
                  "Draft",
                  "Active",
                  "Retired",
                ],
                "pattern": null,
              },
              {
                "name": "reference",
                "kind": "text",
                "description": "The supplier reference",
                "required": true,
                "allowedValues": null,
                "pattern": null,
              },
            ],
          },
          "args": {
            "status": "Draft",
            "reference": null,
          },
        },
      ],
      "step": {
        "kind": "decide",
        "at": "2026-09-04T09:00:00.000Z",
        "principal": {
          "kind": "member",
          "id": "ana",
        },
        "decision": {
          "kind": "approve",
          "reason": "the reference follows by email",
        },
      },
    },
    "expect": {
      "entry": {
        "status": "approved",
        "execution": "unexecuted",
        "attestation": {
          "kind": "member",
          "id": "ana",
        },
        "affidavit": {
          "aggregateConfidence": 0,
          "populatedConfidence": 0.9,
          "emptyFieldCount": 1,
          "fields": [
            {
              "name": "status",
              "value": "Active",
              "source": "Conversation",
              "bound": true,
              "bindingKind": "utterance-span",
              "isMandatory": true,
            },
            {
              "name": "reference",
              "value": null,
              "source": "Empty",
              "bound": false,
              "isMandatory": true,
              "confidence": 0,
            },
          ],
        },
        "amendedAffidavit": null,
      },
      "store": {
        "approvedUnexecuted": 1,
      },
    },
  },
  // sequence-a/07-expiry-then-resubmit.json
  {
    "id": "sequence-a/expiry-then-resubmit",
    "rules": [
      "DK-1",
      "GT-4",
      "CV-4",
    ],
    "title": "The review window closed with nobody looking. The entry reads expired the moment the deadline passes, whether or not a sweep has run, and resubmitting files a new entry that names what it supersedes while the old row keeps its terminal state and gains a successor link. The resubmission is filed under the same tool the original proposal came from, so its coverage can be re-assessed, and the whole pipeline runs again - a resubmission is a new proposal, not a replay of an old approval.",
    "given": {
      "clock": "2026-09-04T09:00:00.000Z",
      "store": "memory",
      "gate": {
        "defaultTtlMs": 1800000,
        "authorization": {
          "allow": [
            "*",
          ],
        },
        "inference": {
          "status": {
            "value": "Active",
            "confidence": 0.9,
            "presence": "literal",
            "utteranceSpan": {
              "start": 21,
              "end": 27,
            },
          },
        },
      },
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "chat",
        "principal": {
          "kind": "member",
          "id": "ana",
        },
        "utterance": "Set invoice INV-2 to Active",
        "messageId": "msg-1",
      },
      "prior": [
        {
          "kind": "wrap-execute",
          "as": "filed",
          "at": "2026-09-04T09:00:00.000Z",
          "tool": {
            "name": "update_invoice",
            "description": "Update an invoice",
            "entityType": "Invoice",
            "entityId": "invoice-1",
            "writeCapable": true,
            "fields": [
              {
                "name": "status",
                "kind": "enum",
                "description": "The invoice status",
                "required": true,
                "allowedValues": [
                  "Draft",
                  "Active",
                  "Retired",
                ],
                "pattern": null,
              },
            ],
          },
          "args": {
            "status": "Draft",
          },
        },
      ],
      "step": {
        "kind": "resubmit",
        "at": "2026-09-04T09:45:00.000Z",
        "principal": {
          "kind": "member",
          "id": "ana",
        },
      },
    },
    "expect": {
      "entry": {
        "status": "pending",
        "execution": null,
        "toolName": "update_invoice",
        "expiresAtOffsetMs": 1800000,
        "lineage": {
          "supersedes": "@some",
          "supersededBy": null,
        },
        "affidavit": {
          "fields": [
            {
              "name": "status",
              "value": "Active",
              "source": "Conversation",
            },
          ],
        },
        "preservedAmendments": null,
      },
      "superseded": {
        "status": "expired",
        "execution": null,
        "decision": null,
        "attestation": null,
        "lineage": {
          "supersededBy": "@some",
        },
      },
      "store": {
        "count": 2,
        "pending": 1,
      },
    },
  },
  // sequence-a/08-late-amendments-preserved.json
  {
    "id": "sequence-a/late-amendments-preserved",
    "rules": [
      "DK-1",
      "DK-2",
      "PV-2",
      "PV-3",
    ],
    "title": "A person typed a correction and pressed approve just after the window closed. The decision is refused - a recorded decision is never backdated - but the correction is not thrown away: it is preserved on the row with the instant and the principal of the act that made it, and the resubmission prefills it as the person's own value, tagged UserStated with a reviewer-act binding naming the superseded entry and the moment they typed it. Binding it to the resubmission's instant instead would date a person's correction to whenever somebody happened to click resubmit.",
    "given": {
      "clock": "2026-09-04T09:00:00.000Z",
      "store": "memory",
      "gate": {
        "defaultTtlMs": 1800000,
        "authorization": {
          "allow": [
            "*",
          ],
        },
        "inference": {
          "status": {
            "value": "Active",
            "confidence": 0.9,
            "presence": "literal",
            "utteranceSpan": {
              "start": 21,
              "end": 27,
            },
          },
        },
      },
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "chat",
        "principal": {
          "kind": "member",
          "id": "ana",
        },
        "utterance": "Set invoice INV-2 to Active",
        "messageId": "msg-1",
      },
      "prior": [
        {
          "kind": "wrap-execute",
          "as": "filed",
          "at": "2026-09-04T09:00:00.000Z",
          "tool": {
            "name": "update_invoice",
            "description": "Update an invoice",
            "entityType": "Invoice",
            "entityId": "invoice-1",
            "writeCapable": true,
            "fields": [
              {
                "name": "status",
                "kind": "enum",
                "description": "The invoice status",
                "required": true,
                "allowedValues": [
                  "Draft",
                  "Active",
                  "Retired",
                ],
                "pattern": null,
              },
            ],
          },
          "args": {
            "status": "Draft",
          },
        },
        {
          "kind": "decide",
          "at": "2026-09-04T09:45:00.000Z",
          "principal": {
            "kind": "member",
            "id": "ana",
          },
          "decision": {
            "kind": "approve",
            "amendments": {
              "status": "Retired",
            },
          },
          "refusal": "decision-expired",
        },
      ],
      "step": {
        "kind": "resubmit",
        "at": "2026-09-04T09:46:00.000Z",
        "principal": {
          "kind": "member",
          "id": "ana",
        },
      },
    },
    "expect": {
      "entry": {
        "status": "pending",
        "affidavit": {
          "fields": [
            {
              "name": "status",
              "value": "Retired",
              "source": "UserStated",
              "bound": true,
              "bindingKind": "reviewer-act",
              "confidence": 1,
              "priorSources": [
                "Conversation",
              ],
            },
          ],
        },
      },
      "card": {
        "priorAmendments": {
          "status": "Retired",
        },
      },
      "superseded": {
        "status": "expired",
        "amendments": null,
        "preservedAmendments": {
          "amendments": {
            "status": "Retired",
          },
          "at": "2026-09-04T09:45:00.000Z",
          "by": "ana",
        },
        "amendedAffidavit": null,
      },
    },
  },
  // sequence-a/09-interleaved-conversations.json
  {
    "id": "sequence-a/interleaved-conversations",
    "rules": [
      "GT-2",
    ],
    "title": "Two conversations run through one gate in one isolate, each proposing a write to a different entity. Neither observes the other: two rows are filed, each carrying its own conversation and its own sworn fields, and nothing from the first turn leaks into the second. The turn context is a parameter of every entry point, so there is no ambient state for a second conversation to inherit.",
    "given": {
      "clock": "2026-09-04T09:00:00.000Z",
      "store": "memory",
      "gate": {
        "defaultTtlMs": 1800000,
        "authorization": {
          "allow": [
            "*",
          ],
        },
        "inference": {
          "status": {
            "value": "Active",
            "confidence": 0.9,
            "presence": "literal",
            "utteranceSpan": {
              "start": 21,
              "end": 27,
            },
          },
        },
      },
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "chat",
        "principal": {
          "kind": "member",
          "id": "ana",
        },
        "utterance": "Set invoice INV-2 to Active",
        "messageId": "msg-1",
      },
      "prior": [
        {
          "kind": "wrap-execute",
          "as": "first",
          "at": "2026-09-04T09:00:00.000Z",
          "conversationId": "conv-1",
          "tool": {
            "name": "update_invoice",
            "description": "Update an invoice",
            "entityType": "Invoice",
            "entityId": "invoice-1",
            "writeCapable": true,
            "fields": [
              {
                "name": "status",
                "kind": "enum",
                "description": "The invoice status",
                "required": true,
                "allowedValues": [
                  "Draft",
                  "Active",
                  "Retired",
                ],
                "pattern": null,
              },
            ],
          },
          "args": {
            "status": "Draft",
          },
        },
      ],
      "step": {
        "kind": "wrap-execute",
        "at": "2026-09-04T09:00:00.000Z",
        "conversationId": "conv-2",
        "tool": {
          "name": "update_invoice",
          "description": "Update an invoice",
          "entityType": "Invoice",
          "entityId": "invoice-2",
          "writeCapable": true,
          "fields": [
            {
              "name": "status",
              "kind": "enum",
              "description": "The invoice status",
              "required": true,
              "allowedValues": [
                "Draft",
                "Active",
                "Retired",
              ],
              "pattern": null,
            },
          ],
        },
        "args": {
          "status": "Draft",
        },
      },
    },
    "expect": {
      "entry": {
        "conversationId": "conv-2",
        "affidavit": {
          "entityId": "invoice-2",
          "fields": [
            {
              "name": "status",
              "value": "Active",
              "source": "Conversation",
            },
          ],
        },
      },
      "store": {
        "count": 2,
        "pending": 2,
      },
    },
  },
  // sequence-a/10-replay-keeps-the-deadline.json
  {
    "id": "sequence-a/replay-keeps-the-deadline",
    "rules": [
      "GT-4",
      "DK-1",
    ],
    "title": "An agent retried the same tool call twenty minutes later. The entry id is derived from the tenant, the conversation, the tool and the call's arguments, so the retry is the same entry: one row, its original deadline, and the card the model gets back is the card the reviewer is already looking at. A fresh identifier would file a second row and start a second clock, which is how a retrying agent holds a review window open indefinitely.",
    "given": {
      "clock": "2026-09-04T09:00:00.000Z",
      "store": "memory",
      "gate": {
        "defaultTtlMs": 1800000,
        "authorization": {
          "allow": [
            "*",
          ],
        },
        "inference": {
          "status": {
            "value": "Active",
            "confidence": 0.9,
            "presence": "literal",
            "utteranceSpan": {
              "start": 21,
              "end": 27,
            },
          },
        },
      },
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "chat",
        "principal": {
          "kind": "member",
          "id": "ana",
        },
        "utterance": "Set invoice INV-2 to Active",
        "messageId": "msg-1",
      },
      "prior": [
        {
          "kind": "wrap-execute",
          "as": "filed",
          "at": "2026-09-04T09:00:00.000Z",
          "tool": {
            "name": "update_invoice",
            "description": "Update an invoice",
            "entityType": "Invoice",
            "entityId": "invoice-1",
            "writeCapable": true,
            "fields": [
              {
                "name": "status",
                "kind": "enum",
                "description": "The invoice status",
                "required": true,
                "allowedValues": [
                  "Draft",
                  "Active",
                  "Retired",
                ],
                "pattern": null,
              },
            ],
          },
          "args": {
            "status": "Draft",
          },
        },
      ],
      "step": {
        "kind": "wrap-execute",
        "at": "2026-09-04T09:20:00.000Z",
        "tool": {
          "name": "update_invoice",
          "description": "Update an invoice",
          "entityType": "Invoice",
          "entityId": "invoice-1",
          "writeCapable": true,
          "fields": [
            {
              "name": "status",
              "kind": "enum",
              "description": "The invoice status",
              "required": true,
              "allowedValues": [
                "Draft",
                "Active",
                "Retired",
              ],
              "pattern": null,
            },
          ],
        },
        "args": {
          "status": "Draft",
        },
      },
    },
    "expect": {
      "entry": {
        "status": "pending",
        "expiresAtOffsetMs": 1800000,
      },
      "store": {
        "count": 1,
        "pending": 1,
      },
    },
  },
  // sequence-a/11-sweep-pages.json
  {
    "id": "sequence-a/sweep-pages",
    "rules": [
      "DK-3",
    ],
    "title": "The host runs the sweep; this package owns no timer. The sweep is bounded by the limit the host passes and says whether there is more to do, so a serverless isolate can expire a large Docket in slices instead of in one unbounded pass that outlives its request budget.",
    "given": {
      "clock": "2026-09-04T09:00:00.000Z",
      "store": "memory",
      "gate": {
        "defaultTtlMs": 1800000,
        "authorization": {
          "allow": [
            "*",
          ],
        },
        "inference": {
          "status": {
            "value": "Active",
            "confidence": 0.9,
            "presence": "literal",
            "utteranceSpan": {
              "start": 21,
              "end": 27,
            },
          },
        },
      },
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "chat",
        "principal": {
          "kind": "member",
          "id": "ana",
        },
        "utterance": "Set invoice INV-2 to Active",
        "messageId": "msg-1",
      },
      "prior": [
        {
          "kind": "wrap-execute",
          "at": "2026-09-04T09:00:00.000Z",
          "tool": {
            "name": "update_invoice",
            "description": "Update an invoice",
            "entityType": "Invoice",
            "entityId": "invoice-1",
            "writeCapable": true,
            "fields": [
              {
                "name": "status",
                "kind": "enum",
                "description": "The invoice status",
                "required": true,
                "allowedValues": [
                  "Draft",
                  "Active",
                  "Retired",
                ],
                "pattern": null,
              },
            ],
          },
          "args": {
            "status": "Draft",
          },
        },
        {
          "kind": "wrap-execute",
          "at": "2026-09-04T09:00:00.000Z",
          "tool": {
            "name": "update_invoice",
            "description": "Update an invoice",
            "entityType": "Invoice",
            "entityId": "invoice-2",
            "writeCapable": true,
            "fields": [
              {
                "name": "status",
                "kind": "enum",
                "description": "The invoice status",
                "required": true,
                "allowedValues": [
                  "Draft",
                  "Active",
                  "Retired",
                ],
                "pattern": null,
              },
            ],
          },
          "args": {
            "status": "Draft",
          },
        },
        {
          "kind": "wrap-execute",
          "at": "2026-09-04T09:00:00.000Z",
          "tool": {
            "name": "update_invoice",
            "description": "Update an invoice",
            "entityType": "Invoice",
            "entityId": "invoice-3",
            "writeCapable": true,
            "fields": [
              {
                "name": "status",
                "kind": "enum",
                "description": "The invoice status",
                "required": true,
                "allowedValues": [
                  "Draft",
                  "Active",
                  "Retired",
                ],
                "pattern": null,
              },
            ],
          },
          "args": {
            "status": "Draft",
          },
        },
      ],
      "step": {
        "kind": "expireDue",
        "at": "2026-09-04T09:45:00.000Z",
        "limit": 2,
      },
    },
    "expect": {
      "expired": {
        "count": 2,
        "more": true,
      },
      "telemetry": [
        "docket.expired",
      ],
      "store": {
        "count": 3,
        "pending": 0,
      },
    },
  },
  // sequence-a/12-rehydration-order.json
  {
    "id": "sequence-a/rehydration-order",
    "rules": [
      "DK-5",
      "AZ-5",
    ],
    "title": "A reconnecting client asks what it missed and is given, in one page and in this order, everything still waiting for a decision and then everything approved that the executor has not reported on. The second half is the one that matters after a crash: an approved, unexecuted row is the only record that a write was authorised and has not happened, and a client that never saw it would lose the write silently.",
    "given": {
      "clock": "2026-09-04T09:00:00.000Z",
      "store": "memory",
      "gate": {
        "defaultTtlMs": 1800000,
        "authorization": {
          "allow": [
            "*",
          ],
        },
        "inference": {
          "status": {
            "value": "Active",
            "confidence": 0.9,
            "presence": "literal",
            "utteranceSpan": {
              "start": 21,
              "end": 27,
            },
          },
        },
      },
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "chat",
        "principal": {
          "kind": "member",
          "id": "ana",
        },
        "utterance": "Set invoice INV-2 to Active",
        "messageId": "msg-1",
      },
      "prior": [
        {
          "kind": "wrap-execute",
          "as": "first",
          "at": "2026-09-04T09:00:00.000Z",
          "tool": {
            "name": "update_invoice",
            "description": "Update an invoice",
            "entityType": "Invoice",
            "entityId": "invoice-1",
            "writeCapable": true,
            "fields": [
              {
                "name": "status",
                "kind": "enum",
                "description": "The invoice status",
                "required": true,
                "allowedValues": [
                  "Draft",
                  "Active",
                  "Retired",
                ],
                "pattern": null,
              },
            ],
          },
          "args": {
            "status": "Draft",
          },
        },
        {
          "kind": "wrap-execute",
          "as": "second",
          "at": "2026-09-04T09:00:00.000Z",
          "tool": {
            "name": "update_invoice",
            "description": "Update an invoice",
            "entityType": "Invoice",
            "entityId": "invoice-2",
            "writeCapable": true,
            "fields": [
              {
                "name": "status",
                "kind": "enum",
                "description": "The invoice status",
                "required": true,
                "allowedValues": [
                  "Draft",
                  "Active",
                  "Retired",
                ],
                "pattern": null,
              },
            ],
          },
          "args": {
            "status": "Draft",
          },
        },
        {
          "kind": "decide",
          "at": "2026-09-04T09:00:00.000Z",
          "entry": "first",
          "principal": {
            "kind": "member",
            "id": "ana",
          },
          "decision": {
            "kind": "approve",
          },
          "refusal": null,
        },
      ],
      "step": {
        "kind": "rehydrate",
        "at": "2026-09-04T09:00:00.000Z",
        "page": {
          "limit": 10,
        },
      },
    },
    "expect": {
      "page": {
        "count": 2,
        "more": false,
        "statuses": [
          "pending",
          "approved",
        ],
      },
      "store": {
        "count": 2,
        "pending": 1,
        "approvedUnexecuted": 1,
      },
    },
  },
  // sequence-a/13-coverage-refused-at-wire-up.json
  {
    "id": "sequence-a/coverage-refused-at-wire-up",
    "rules": [
      "CV-4",
      "CV-1",
    ],
    "title": "A write-capable tool the gate cannot intercept - here one with no execute of its own to stand in front of - is refused when the host wires it, not on the first request that happens to use it. There is no option that turns the gate off for a covered tool: the host either makes the tool interceptable or declares it uncovered, which files every later proposal from it blocked rather than letting it through.",
    "given": {
      "clock": "2026-09-04T09:00:00.000Z",
      "store": "memory",
      "gate": {
        "defaultTtlMs": 1800000,
        "authorization": {
          "allow": [
            "*",
          ],
        },
        "inference": {
          "status": {
            "value": "Active",
            "confidence": 0.9,
            "presence": "literal",
            "utteranceSpan": {
              "start": 21,
              "end": 27,
            },
          },
        },
      },
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "chat",
        "principal": {
          "kind": "member",
          "id": "ana",
        },
        "utterance": "Set invoice INV-2 to Active",
        "messageId": "msg-1",
      },
      "prior": [],
      "step": {
        "kind": "wrap-execute",
        "at": "2026-09-04T09:00:00.000Z",
        "tool": {
          "name": "provider_write",
          "description": "Update an invoice",
          "entityType": "Invoice",
          "entityId": "invoice-1",
          "writeCapable": true,
          "fields": [
            {
              "name": "status",
              "kind": "enum",
              "description": "The invoice status",
              "required": true,
              "allowedValues": [
                "Draft",
                "Active",
                "Retired",
              ],
              "pattern": null,
            },
          ],
          "omitExecute": true,
        },
        "args": {
          "status": "Draft",
        },
      },
    },
    "expect": {
      "error": {
        "code": "coverage-refused",
        "messageContains": "no-execute",
      },
      "telemetry": [
        "coverage.refused",
      ],
      "store": {
        "count": 0,
      },
    },
  },
  // sequence-c/01-relay-auto-approve-bound-external.json
  {
    "id": "sequence-c/relay-auto-approve-bound-external",
    "rules": [
      "PV-4",
      "AZ-1",
      "PV-2",
      "GT-1",
    ],
    "title": "A capture arrives over a trusted relay's own surface, already carrying its provenance: the value is External and its binding names the relay, the channel identity the message came from and the relay's id for that message. The policy predicates on External and every declared input is bound, so the Standing Order is honoured: the row is filed approved, unexecuted and attested to the policy that fired, in one write. No transport code is involved - the relay is an identity and a binding, not a protocol this package speaks.",
    "given": {
      "clock": "2026-09-04T09:00:00.000Z",
      "store": "memory",
      "gate": {
        "defaultTtlMs": 1800000,
        "authorization": {
          "allow": [
            "*",
          ],
        },
        "policies": [
          {
            "id": "relay-capture",
            "version": "1.0.0",
            "declaredInputs": [
              "External",
            ],
            "verdict": {
              "requirement": "StandingOrder",
            },
          },
        ],
      },
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "wa-1",
        "channel": "mcp",
        "principal": {
          "kind": "service",
          "id": "whatsapp-relay",
          "assertedMember": "ana",
          "relay": {
            "channelIdentity": "+94770000000",
            "messageId": "wamid-1",
          },
        },
        "utterance": "Active",
        "messageId": "wamid-1",
      },
      "prior": [],
      "step": {
        "kind": "file",
        "at": "2026-09-04T09:00:00.000Z",
        "toolName": "relay_capture",
        "operation": {
          "kind": "create",
          "entityType": "Reading",
          "entityId": null,
          "fields": [
            "status",
          ],
        },
        "preparedFields": [
          {
            "name": "status",
            "kind": "text",
            "value": "Active",
            "isMandatory": true,
            "provenance": {
              "source": "External",
              "confidence": 1,
              "note": "Captured from the relay message",
              "binding": {
                "kind": "external-ref",
                "ref": {
                  "system": "whatsapp-relay",
                  "recordId": "wamid-1",
                  "relay": {
                    "principal": "whatsapp-relay",
                    "channelIdentity": "+94770000000",
                    "messageId": "wamid-1",
                  },
                },
              },
            },
          },
        ],
      },
    },
    "expect": {
      "entry": {
        "status": "approved",
        "execution": "unexecuted",
        "requirement": "StandingOrder",
        "blocked": null,
        "channel": "mcp",
        "toolName": "relay_capture",
        "attestation": {
          "kind": "standing-order",
          "policyId": "relay-capture",
          "version": "1.0.0",
        },
        "decision": null,
        "affidavit": {
          "operationType": "create",
          "entityType": "Reading",
          "entityId": null,
          "aggregateConfidence": 1,
          "populatedConfidence": 1,
          "emptyFieldCount": 0,
          "fields": [
            {
              "name": "status",
              "value": "Active",
              "previousValue": null,
              "source": "External",
              "bound": true,
              "bindingKind": "external-ref",
            },
          ],
        },
      },
      "card": {
        "requiresConfirmation": false,
      },
      "telemetry": [
        "standing-order.fired",
        "affidavit.filed",
      ],
    },
  },
  // sequence-c/02-relayed-decision-member-via-relay.json
  {
    "id": "sequence-c/relayed-decision-member-via-relay",
    "rules": [
      "AZ-1",
      "AZ-3",
    ],
    "title": "A person answered the card on the relay's channel, so the relay makes the decision on their behalf. The attestation is member-via-relay and names both: the person the relay asserted, and the relay itself with the channel identity and the message the answer arrived in. It is never member - the relay asserted an identity rather than authenticating one, and the record has to say which of those happened.",
    "given": {
      "clock": "2026-09-04T09:00:00.000Z",
      "store": "memory",
      "gate": {
        "defaultTtlMs": 1800000,
        "authorization": {
          "allow": [
            "*",
          ],
        },
      },
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "wa-1",
        "channel": "mcp",
        "principal": {
          "kind": "service",
          "id": "whatsapp-relay",
          "assertedMember": "ana",
          "relay": {
            "channelIdentity": "+94770000000",
            "messageId": "wamid-1",
          },
        },
        "utterance": "Active",
        "messageId": "wamid-1",
      },
      "prior": [
        {
          "kind": "file",
          "as": "filed",
          "at": "2026-09-04T09:00:00.000Z",
          "toolName": "relay_capture",
          "operation": {
            "kind": "create",
            "entityType": "Reading",
            "entityId": null,
            "fields": [
              "status",
            ],
          },
          "preparedFields": [
            {
              "name": "status",
              "kind": "text",
              "value": "Active",
              "isMandatory": true,
              "provenance": {
                "source": "External",
                "confidence": 1,
                "note": "Captured from the relay message",
                "binding": {
                  "kind": "external-ref",
                  "ref": {
                    "system": "whatsapp-relay",
                    "recordId": "wamid-1",
                    "relay": {
                      "principal": "whatsapp-relay",
                      "channelIdentity": "+94770000000",
                      "messageId": "wamid-1",
                    },
                  },
                },
              },
            },
          ],
        },
      ],
      "step": {
        "kind": "decide",
        "at": "2026-09-04T09:00:00.000Z",
        "principal": {
          "kind": "service",
          "id": "whatsapp-relay",
          "assertedMember": "ana",
          "relay": {
            "channelIdentity": "+94770000000",
            "messageId": "wamid-1",
          },
        },
        "decision": {
          "kind": "approve",
          "reason": "confirmed on the channel",
        },
      },
    },
    "expect": {
      "entry": {
        "status": "approved",
        "execution": "unexecuted",
        "attestation": {
          "kind": "member-via-relay",
          "memberId": "ana",
          "relay": {
            "principal": "whatsapp-relay",
            "channelIdentity": "+94770000000",
            "messageId": "wamid-1",
          },
        },
        "decision": {
          "kind": "approve",
          "reason": "confirmed on the channel",
        },
      },
    },
  },
  // sequence-c/03-unbound-external-asks-a-person.json
  {
    "id": "sequence-c/unbound-external-asks-a-person",
    "rules": [
      "PV-4",
      "PV-5",
    ],
    "title": "The same capture with nothing behind its External tag. A grade any caller can assert, pointing at no record anyone can re-derive, must not be what keys an approval with no person present: the policy predicates on External, the tag is unbound, and the Standing Order is not honoured. The write is not refused - it is moved toward a person, which is the only direction this degradation ever goes - and the card says why.",
    "given": {
      "clock": "2026-09-04T09:00:00.000Z",
      "store": "memory",
      "gate": {
        "defaultTtlMs": 1800000,
        "authorization": {
          "allow": [
            "*",
          ],
        },
        "policies": [
          {
            "id": "relay-capture",
            "version": "1.0.0",
            "declaredInputs": [
              "External",
            ],
            "verdict": {
              "requirement": "StandingOrder",
            },
          },
        ],
      },
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "wa-1",
        "channel": "mcp",
        "principal": {
          "kind": "service",
          "id": "whatsapp-relay",
          "assertedMember": "ana",
          "relay": {
            "channelIdentity": "+94770000000",
            "messageId": "wamid-1",
          },
        },
        "utterance": "Active",
        "messageId": "wamid-1",
      },
      "prior": [],
      "step": {
        "kind": "file",
        "at": "2026-09-04T09:00:00.000Z",
        "toolName": "relay_capture",
        "operation": {
          "kind": "create",
          "entityType": "Reading",
          "entityId": null,
          "fields": [
            "status",
          ],
        },
        "preparedFields": [
          {
            "name": "status",
            "kind": "text",
            "value": "Active",
            "isMandatory": true,
            "provenance": {
              "source": "External",
              "confidence": 1,
              "note": "Captured from the relay message",
              "binding": null,
            },
          },
        ],
      },
    },
    "expect": {
      "entry": {
        "status": "pending",
        "requirement": "ReviewerConfirmation",
        "execution": null,
        "attestation": null,
        "blocked": null,
        "affidavit": {
          "fields": [
            {
              "name": "status",
              "value": "Active",
              "source": "External",
              "bound": false,
            },
          ],
        },
      },
      "card": {
        "requiresConfirmation": true,
        "warningsContain": [
          "PV-4",
        ],
      },
      "telemetry": [
        "standing-order.blocked",
      ],
      "telemetryAbsent": [
        "standing-order.fired",
      ],
    },
  },
  // sequence-c/04-relay-may-not-attest-member.json
  {
    "id": "sequence-c/relay-may-not-attest-member",
    "rules": [
      "AZ-3",
      "AZ-2",
    ],
    "title": "A machine caller with nobody to speak for and no relay assertion to carry tries to decide. It is refused: the strongest attestation a service principal can honestly make is member-via-relay, naming a person and a channel, and it has neither. There is no parameter through which a caller names whose signature a decision is, so there is no path by which a machine attests member - the refusal is the type system's, and the runtime check exists for a caller that came in untyped.",
    "given": {
      "clock": "2026-09-04T09:00:00.000Z",
      "store": "memory",
      "gate": {
        "defaultTtlMs": 1800000,
        "authorization": {
          "allow": [
            "*",
          ],
        },
      },
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "wa-1",
        "channel": "mcp",
        "principal": {
          "kind": "service",
          "id": "whatsapp-relay",
          "assertedMember": "ana",
          "relay": {
            "channelIdentity": "+94770000000",
            "messageId": "wamid-1",
          },
        },
        "utterance": "Active",
        "messageId": "wamid-1",
      },
      "prior": [
        {
          "kind": "file",
          "as": "filed",
          "at": "2026-09-04T09:00:00.000Z",
          "toolName": "relay_capture",
          "operation": {
            "kind": "create",
            "entityType": "Reading",
            "entityId": null,
            "fields": [
              "status",
            ],
          },
          "preparedFields": [
            {
              "name": "status",
              "kind": "text",
              "value": "Active",
              "isMandatory": true,
              "provenance": {
                "source": "External",
                "confidence": 1,
                "note": "Captured from the relay message",
                "binding": {
                  "kind": "external-ref",
                  "ref": {
                    "system": "whatsapp-relay",
                    "recordId": "wamid-1",
                    "relay": {
                      "principal": "whatsapp-relay",
                      "channelIdentity": "+94770000000",
                      "messageId": "wamid-1",
                    },
                  },
                },
              },
            },
          ],
        },
      ],
      "step": {
        "kind": "decide",
        "at": "2026-09-04T09:00:00.000Z",
        "principal": {
          "kind": "service",
          "id": "whatsapp-relay",
        },
        "decision": {
          "kind": "approve",
          "reason": "the relay says so",
        },
      },
    },
    "expect": {
      "error": {
        "code": "decision-unauthorized",
        "messageContains": "AZ-3",
      },
      "entry": {
        "status": "pending",
        "attestation": null,
        "decision": null,
        "amendments": null,
        "preservedAmendments": null,
      },
      "telemetry": [
        "decision.unauthorized",
      ],
    },
  },
  // sequence-c/05-relay-decision-other-tenant-not-found.json
  {
    "id": "sequence-c/relay-decision-other-tenant-not-found",
    "rules": [
      "AZ-2",
    ],
    "title": "The relay is trusted, its assertion is well formed, and the entry belongs to another tenant. The answer is that no such entry exists - the same answer an identifier that was never filed gets - because any other answer would let a caller learn which identifiers are real by asking. The tenant is the boundary, and it is checked before the host's own authorization port is consulted.",
    "given": {
      "clock": "2026-09-04T09:00:00.000Z",
      "store": "memory",
      "gate": {
        "defaultTtlMs": 1800000,
        "authorization": {
          "allow": [
            "*",
          ],
        },
      },
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "wa-1",
        "channel": "mcp",
        "principal": {
          "kind": "service",
          "id": "whatsapp-relay",
          "assertedMember": "ana",
          "relay": {
            "channelIdentity": "+94770000000",
            "messageId": "wamid-1",
          },
        },
        "utterance": "Active",
        "messageId": "wamid-1",
      },
      "prior": [
        {
          "kind": "file",
          "as": "filed",
          "at": "2026-09-04T09:00:00.000Z",
          "toolName": "relay_capture",
          "operation": {
            "kind": "create",
            "entityType": "Reading",
            "entityId": null,
            "fields": [
              "status",
            ],
          },
          "preparedFields": [
            {
              "name": "status",
              "kind": "text",
              "value": "Active",
              "isMandatory": true,
              "provenance": {
                "source": "External",
                "confidence": 1,
                "note": "Captured from the relay message",
                "binding": {
                  "kind": "external-ref",
                  "ref": {
                    "system": "whatsapp-relay",
                    "recordId": "wamid-1",
                    "relay": {
                      "principal": "whatsapp-relay",
                      "channelIdentity": "+94770000000",
                      "messageId": "wamid-1",
                    },
                  },
                },
              },
            },
          ],
        },
      ],
      "step": {
        "kind": "decide",
        "at": "2026-09-04T09:00:00.000Z",
        "tenantId": "tenant-b",
        "principal": {
          "kind": "service",
          "id": "whatsapp-relay",
          "assertedMember": "ana",
          "relay": {
            "channelIdentity": "+94770000000",
            "messageId": "wamid-1",
          },
        },
        "decision": {
          "kind": "approve",
          "reason": "confirmed on the channel",
        },
      },
    },
    "expect": {
      "error": {
        "code": "entry-not-found",
      },
      "entry": {
        "status": "pending",
        "attestation": null,
        "decision": null,
      },
      "telemetry": [
        "decision.unauthorized",
      ],
    },
  },
];

/** The fixtures in one set, named by its id prefix. */
export function fixtureSet(prefix: string): readonly Fixture[] {
  return fixtures.filter((fixture) => fixture.id.startsWith(`${prefix}/`));
}

/** A fixture by id, for a test that names one. */
export function fixture(id: string): Fixture {
  const found = fixtures.find((candidate) => candidate.id === id);
  if (found === undefined) throw new Error(`no fixture with id ${JSON.stringify(id)}`);
  return found;
}
