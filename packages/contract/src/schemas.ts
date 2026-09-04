// GENERATED FILE — DO NOT EDIT BY HAND.
// Produced by scripts/generate-sources.mjs from protocol/, which is a byte-for-byte
// copy of Sakwala/affiant-protocol at v0.1.1.
// Source: protocol/schemas/*.schema.json and protocol/schemas/seed/*.schema.json
// To change it: edit protocol/PIN, run `pnpm sync-protocol`, then `pnpm generate`.

/**
 * A JSON Schema document from the Affiant protocol. Loosely typed on purpose: the
 * documents are data, and every validator library has its own schema type.
 */
export interface JsonSchemaDocument {
  readonly $id?: string;
  readonly $schema?: string;
  readonly title?: string;
  readonly description?: string;
  readonly [keyword: string]: unknown;
}

/** The protocol version these schemas were vendored from. Defined once in `./index.js`. */
export { PROTOCOL_VERSION } from "./index.js";

/** The name of each schema, without the `.schema.json` suffix. */
export type SchemaName =
  | "affidavit-field"
  | "affidavit"
  | "amendments"
  | "attestation"
  | "binding"
  | "blocked"
  | "common"
  | "decision-result"
  | "docket-entry"
  | "entity-ref"
  | "error-code"
  | "evidence-card-request"
  | "money"
  | "notification"
  | "operation"
  | "outside-gate"
  | "provenance-chain"
  | "provenance-source"
  | "provenance-tag"
  | "telemetry-key"
  | "tool-result";

/** `schemas/0.1.0/affidavit-field.schema.json` — AffidavitField. */
export const affidavitFieldSchema: JsonSchemaDocument = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://affiant.dev/schemas/0.1.0/affidavit-field.schema.json",
  "title": "AffidavitField",
  "description": "One sworn field inside an Affidavit: the proposed value, the value it replaces, and the whole provenance chain behind it. A field the operation does not propose — untouched on an update, not applicable to the operation — is ABSENT from the Affidavit; a proposed field whose provenance is unknown is PRESENT and tagged Empty at confidence 0. The two are never confused, which is what makes the field list a statement of intent a policy can read (INVARIANTS.md AF-1). Presentation the reviewer surface needs but the record does not swear to — the closed value set an input offers, the pattern an input is constrained by — travels beside the Affidavit, not on it: see evidence-card-request.",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "name",
    "kind",
    "value",
    "previousValue",
    "provenance",
    "isMandatory"
  ],
  "properties": {
    "name": {
      "description": "The field's name on the target entity. Also the key the amendment maps use.",
      "$ref": "https://affiant.dev/schemas/0.1.0/common.schema.json#/$defs/identifier"
    },
    "kind": {
      "description": "Rendering hint for a reviewer surface, drawn from a fixed set. It never constrains the value: the gate carries a hint and validates nothing against it.",
      "type": "string",
      "enum": [
        "text",
        "number",
        "date",
        "enum"
      ]
    },
    "value": {
      "description": "The proposed value. Any JSON value, null included. A monetary value is a Money object (SR-2), never a JSON number.",
      "$ref": "https://affiant.dev/schemas/0.1.0/common.schema.json#/$defs/jsonValue"
    },
    "previousValue": {
      "description": "The stored value this replaces. Null on a create, and also on an update field the entity had no stored value for; the two are distinguished by the Affidavit's operationType, not by the field (AF-3). On an update the key is always present — the host's projection port supplies the values.",
      "$ref": "https://affiant.dev/schemas/0.1.0/common.schema.json#/$defs/jsonValue"
    },
    "provenance": {
      "description": "Where the value came from, and everything it displaced.",
      "$ref": "https://affiant.dev/schemas/0.1.0/provenance-chain.schema.json"
    },
    "isMandatory": {
      "description": "Whether the target entity requires this field. A Standing Order is never honoured while a mandatory proposed field reads Empty (GT-5), so this is not decoration.",
      "type": "boolean"
    }
  }
};

/** `schemas/0.1.0/affidavit.schema.json` — Affidavit. */
export const affidavitSchema: JsonSchemaDocument = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://affiant.dev/schemas/0.1.0/affidavit.schema.json",
  "title": "Affidavit",
  "description": "The sworn evidence record for one proposed write. Every write an agent proposes is wrapped in one of these, carrying per-field provenance, before any person sees it and before anything is committed. operationType is the protocol's own two-valued vocabulary rather than the host's verb, because AF-3 is a rule about the SHAPE — an update names the entity it updates and swears to what it replaces — and \"create-only\" has to be a predicate a policy can test without knowing the host's verbs. The host's own verb travels on the card envelope. The three confidence numbers are AF-2: a mean that first discards every Empty field lets a mostly-empty Affidavit report high confidence, which is the exact hole once provenance authorises writes, so the aggregate is a MINIMUM with Empty counting as 0.",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "protocolVersion",
    "operationType",
    "entityType",
    "entityId",
    "fields",
    "aggregateConfidence",
    "populatedConfidence",
    "emptyFieldCount",
    "conversationTurn",
    "createdAt"
  ],
  "properties": {
    "protocolVersion": {
      "description": "The protocol version this record conforms to (SR-4).",
      "$ref": "https://affiant.dev/schemas/0.1.0/common.schema.json#/$defs/protocolVersion"
    },
    "operationType": {
      "description": "The shape of the operation being proposed.",
      "$ref": "https://affiant.dev/schemas/0.1.0/operation.schema.json"
    },
    "entityType": {
      "description": "The kind of domain entity being written, named by the host. With entityId this is the entity-ref shape.",
      "$ref": "https://affiant.dev/schemas/0.1.0/common.schema.json#/$defs/identifier"
    },
    "entityId": {
      "description": "The entity being written; null on a create, non-null on an update (AF-3). Non-null if and only if operationType is \"update\" — a schema cannot state that correlation, and an implementation enforces it.",
      "oneOf": [
        {
          "$ref": "https://affiant.dev/schemas/0.1.0/common.schema.json#/$defs/identifier"
        },
        {
          "type": "null"
        }
      ]
    },
    "fields": {
      "description": "The sworn fields, in the order the operation proposed them. Never null — an empty array is what no fields looks like, and the substance gate refuses a proposal with nothing to swear to before it is ever filed (GT-3).",
      "type": "array",
      "items": {
        "$ref": "https://affiant.dev/schemas/0.1.0/affidavit-field.schema.json"
      }
    },
    "aggregateConfidence": {
      "description": "The MINIMUM confidence over every proposed field's current tag, with an Empty field counting as 0 whatever its tag says — so it is 0 exactly when some proposed field has unknown provenance (AF-2). This is the safety number an invariant and a fixture pin; a host policy floor predicates on populatedConfidence and emptyFieldCount instead. Neither the protocol nor any implementation defines a threshold on it.",
      "$ref": "https://affiant.dev/schemas/0.1.0/common.schema.json#/$defs/unitInterval"
    },
    "populatedConfidence": {
      "description": "The minimum confidence over the NON-Empty proposed fields, or null when there are none (AF-2). Null rather than 0: \"there is nothing populated to be confident about\" is a different statement from \"the populated fields are worthless\", and a card showing 0 would say the second. New in v0.1; on the card envelope under the seed.",
      "oneOf": [
        {
          "$ref": "https://affiant.dev/schemas/0.1.0/common.schema.json#/$defs/unitInterval"
        },
        {
          "type": "null"
        }
      ]
    },
    "emptyFieldCount": {
      "description": "How many proposed fields are tagged Empty (AF-2). Without it a person approving a card sees an aggregate of 0 and cannot tell how many fields are empty or how good the populated ones are. New in v0.1; on the card envelope under the seed.",
      "$ref": "https://affiant.dev/schemas/0.1.0/common.schema.json#/$defs/nonNegativeInteger"
    },
    "conversationTurn": {
      "description": "The conversation turn the proposal was made on, or null when it did not come from a turn.",
      "type": [
        "integer",
        "null"
      ]
    },
    "createdAt": {
      "description": "When the Affidavit was built. Passed in by the caller, never read from a clock inside the model, so a fixture can pin it.",
      "$ref": "https://affiant.dev/schemas/0.1.0/common.schema.json#/$defs/isoInstant"
    }
  }
};

/** `schemas/0.1.0/amendments.schema.json` — AmendmentMap. */
export const amendmentsSchema: JsonSchemaDocument = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://affiant.dev/schemas/0.1.0/amendments.schema.json",
  "title": "AmendmentMap",
  "description": "A reviewer's corrections, keyed by the field's name on the Affidavit. Within a map, null means the reviewer CLEARED the field and an absent key means they LEFT IT UNTOUCHED; an implementation never conflates the two and never accepts an undefined value, which is not a JSON value and would vanish on serialization (INVARIANTS.md DK-2). An amendment naming a field the Affidavit does not propose is a caller error and changes no state — a language-level error, not a refusal code.",
  "type": "object",
  "additionalProperties": {
    "description": "The reviewer's replacement value for the named field. Any JSON value, null included; null means cleared.",
    "$ref": "https://affiant.dev/schemas/0.1.0/common.schema.json#/$defs/jsonValue"
  }
};

/** `schemas/0.1.0/attestation.schema.json` — Attestation. */
export const attestationSchema: JsonSchemaDocument = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://affiant.dev/schemas/0.1.0/attestation.schema.json",
  "title": "Attestation",
  "description": "Who agreed to a write, when, and to which entry (INVARIANTS.md AZ-1). Every executed write carries one: an implementation that cannot attribute a write refuses it. The MODE is the kind of `by` — there is no separate mode field for it to drift from. AZ-3 is what the three kinds encode: a human-verified session attests member; a machine caller may NEVER attest member, so a decision a person makes through a trusted relay attests member-via-relay naming both the person and the relay, and a capture a policy auto-approves attests standing-order naming the policy and the version that fired. entryId is repeated here rather than left implicit because the attestation is the fragment a host exports, signs or ships to an audit sink, and a record that cannot name its own subject is not evidence.",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "by",
    "at",
    "entryId"
  ],
  "properties": {
    "by": {
      "description": "Who agreed.",
      "type": "object",
      "oneOf": [
        {
          "$ref": "#/$defs/member"
        },
        {
          "$ref": "#/$defs/memberViaRelay"
        },
        {
          "$ref": "#/$defs/standingOrder"
        }
      ]
    },
    "at": {
      "description": "When they agreed.",
      "$ref": "https://affiant.dev/schemas/0.1.0/common.schema.json#/$defs/isoInstant"
    },
    "entryId": {
      "description": "The Docket entry this attests to.",
      "$ref": "https://affiant.dev/schemas/0.1.0/common.schema.json#/$defs/uuid"
    }
  },
  "$defs": {
    "member": {
      "title": "MemberAttestor",
      "description": "A human-verified session decided this entry. The strongest claim, and the only one a machine caller can never make.",
      "type": "object",
      "additionalProperties": false,
      "required": [
        "kind",
        "id"
      ],
      "properties": {
        "kind": {
          "const": "member"
        },
        "id": {
          "description": "The host's id for the person.",
          "$ref": "https://affiant.dev/schemas/0.1.0/common.schema.json#/$defs/identifier"
        }
      }
    },
    "memberViaRelay": {
      "title": "MemberViaRelayAttestor",
      "description": "A person decided this entry through a trusted relay — a machine caller that asserted their identity rather than authenticating them. Both the person and the relay are named, because the record must not read as though the person signed in directly.",
      "type": "object",
      "additionalProperties": false,
      "required": [
        "kind",
        "memberId",
        "relay"
      ],
      "properties": {
        "kind": {
          "const": "member-via-relay"
        },
        "memberId": {
          "description": "The host's id for the person the relay named.",
          "$ref": "https://affiant.dev/schemas/0.1.0/common.schema.json#/$defs/identifier"
        },
        "relay": {
          "description": "The relay, and the message the decision arrived on.",
          "$ref": "https://affiant.dev/schemas/0.1.0/binding.schema.json#/$defs/relayRef"
        }
      }
    },
    "standingOrder": {
      "title": "StandingOrderAttestor",
      "description": "A policy approved this entry with no person present, and the pipeline wrote this attestation in the same operation that filed the entry approved — there is no window in which an approved write has no attribution. The version is recorded so a later reader can tell what the policy said at the time.",
      "type": "object",
      "additionalProperties": false,
      "required": [
        "kind",
        "policyId",
        "version"
      ],
      "properties": {
        "kind": {
          "const": "standing-order"
        },
        "policyId": {
          "description": "The host's id for the policy that fired.",
          "$ref": "https://affiant.dev/schemas/0.1.0/common.schema.json#/$defs/identifier"
        },
        "version": {
          "description": "The version of that policy.",
          "type": "string",
          "minLength": 1
        }
      }
    }
  }
};

/** `schemas/0.1.0/binding.schema.json` — Binding. */
export const bindingSchema: JsonSchemaDocument = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://affiant.dev/schemas/0.1.0/binding.schema.json",
  "title": "Binding",
  "description": "What to look at to check a value (INVARIANTS.md PV-2). A provenance tag says where a value came from; a binding points at the artifact an auditor can go and check years later. The five kinds are a fixed set — a binding kind nobody can enumerate is a binding nobody can audit — and a binding whose source cannot be re-fetched or re-verified is not a binding. A tag with no binding is not a lie, it is a weaker claim, and the framework's job is to keep the difference visible rather than to average it away: a tag graded above Conversation with no binding is recorded as claimed but a person-free verdict may not rest on it (PV-4, PV-5).",
  "type": "object",
  "oneOf": [
    {
      "$ref": "#/$defs/utteranceSpan"
    },
    {
      "$ref": "#/$defs/reviewerAct"
    },
    {
      "$ref": "#/$defs/formInput"
    },
    {
      "$ref": "#/$defs/externalRef"
    },
    {
      "$ref": "#/$defs/computationRef"
    }
  ],
  "$defs": {
    "utteranceSpan": {
      "title": "UtteranceSpanBinding",
      "description": "The span of the unmodified utterance the value was read from. Offset and length rather than a start/end pair, and a hash of the substring: offsets alone rot the moment anything re-wraps or re-encodes a transcript, so the hash is what lets an auditor prove the span still says what it said. The digest algorithm and encoding are the canonical-form rules' (SR-1).",
      "type": "object",
      "additionalProperties": false,
      "required": [
        "kind",
        "ref"
      ],
      "properties": {
        "kind": {
          "const": "utterance-span"
        },
        "ref": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "offset",
            "length",
            "hash"
          ],
          "properties": {
            "offset": {
              "description": "Character offset into the utterance, from 0.",
              "$ref": "https://affiant.dev/schemas/0.1.0/common.schema.json#/$defs/nonNegativeInteger"
            },
            "length": {
              "description": "Length of the span in characters.",
              "$ref": "https://affiant.dev/schemas/0.1.0/common.schema.json#/$defs/nonNegativeInteger"
            },
            "hash": {
              "description": "Digest of the spanned substring, so the span can be checked after the fact.",
              "type": "string",
              "minLength": 1
            }
          }
        }
      }
    },
    "reviewerAct": {
      "title": "ReviewerActBinding",
      "description": "The Docket decision that amended or prefilled the field. A reviewer's correction is provenance in its own right: their act is what the new value rests on, and this names the act (AF-4).",
      "type": "object",
      "additionalProperties": false,
      "required": [
        "kind",
        "ref"
      ],
      "properties": {
        "kind": {
          "const": "reviewer-act"
        },
        "ref": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "entryId",
            "decisionAt"
          ],
          "properties": {
            "entryId": {
              "description": "The Docket entry the decision was made on.",
              "$ref": "https://affiant.dev/schemas/0.1.0/common.schema.json#/$defs/uuid"
            },
            "decisionAt": {
              "description": "When the decision was made.",
              "$ref": "https://affiant.dev/schemas/0.1.0/common.schema.json#/$defs/isoInstant"
            }
          }
        }
      }
    },
    "formInput": {
      "title": "FormInputBinding",
      "description": "The form control a person typed into, as the host's own surface names it.",
      "type": "object",
      "additionalProperties": false,
      "required": [
        "kind",
        "ref"
      ],
      "properties": {
        "kind": {
          "const": "form-input"
        },
        "ref": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "field"
          ],
          "properties": {
            "field": {
              "description": "The form field's name.",
              "$ref": "https://affiant.dev/schemas/0.1.0/common.schema.json#/$defs/identifier"
            }
          }
        }
      }
    },
    "externalRef": {
      "title": "ExternalRefBinding",
      "description": "The system of record an External value was read from. system and recordId are always present; the other three are present only when the value's kind of source makes them checkable, and are absent otherwise rather than null — a binding names what it can point at and claims nothing else. fetchedAt and contentHash are what a value read from a published page with no API binds instead of a record id: when it was read, and what it said when it was read. relay is present when the value arrived over a trusted relay that asserted a person's identity rather than authenticating them.",
      "type": "object",
      "additionalProperties": false,
      "required": [
        "kind",
        "ref"
      ],
      "properties": {
        "kind": {
          "const": "external-ref"
        },
        "ref": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "system",
            "recordId"
          ],
          "properties": {
            "system": {
              "description": "The source system, named the way the host names it.",
              "$ref": "https://affiant.dev/schemas/0.1.0/common.schema.json#/$defs/identifier"
            },
            "recordId": {
              "description": "The record within that system. A canonical URL where the system is a page with no API.",
              "$ref": "https://affiant.dev/schemas/0.1.0/common.schema.json#/$defs/identifier"
            },
            "fetchedAt": {
              "description": "When the value was read. Optional: present where the source is re-read rather than addressed by a stable record id.",
              "$ref": "https://affiant.dev/schemas/0.1.0/common.schema.json#/$defs/isoInstant"
            },
            "contentHash": {
              "description": "Digest of what the source said when it was read. Optional, and the companion of fetchedAt.",
              "type": "string",
              "minLength": 1
            },
            "relay": {
              "description": "The relay that carried the capture, when one did. Optional.",
              "$ref": "#/$defs/relayRef"
            }
          }
        }
      }
    },
    "computationRef": {
      "title": "ComputationRefBinding",
      "description": "The deterministic rule a Computed value came out of, and what it consumed. The rule is re-runnable, named rather than described, and the inputs are field names in the order the rule consumed them.",
      "type": "object",
      "additionalProperties": false,
      "required": [
        "kind",
        "ref"
      ],
      "properties": {
        "kind": {
          "const": "computation-ref"
        },
        "ref": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "rule",
            "inputs"
          ],
          "properties": {
            "rule": {
              "description": "The rule's name — re-runnable, not a description.",
              "$ref": "https://affiant.dev/schemas/0.1.0/common.schema.json#/$defs/identifier"
            },
            "inputs": {
              "description": "The field names the rule consumed, in the order it consumed them. Never null — an empty array is what no inputs looks like.",
              "type": "array",
              "items": {
                "$ref": "https://affiant.dev/schemas/0.1.0/common.schema.json#/$defs/identifier"
              }
            },
            "constant": {
              "description": "An externally published constant the rule depends on. Optional, and present whenever there is one: when a value was checked is a different fact from when the tag was written — a rate table verified in March and used in September is a September tag resting on a March fact, and a reviewer is entitled to see both.",
              "type": "object",
              "additionalProperties": false,
              "required": [
                "source",
                "verifiedOn"
              ],
              "properties": {
                "source": {
                  "description": "Where the constant is published.",
                  "type": "string",
                  "minLength": 1
                },
                "verifiedOn": {
                  "description": "The date the constant was last verified, as an ISO 8601 date or instant.",
                  "type": "string",
                  "minLength": 1
                }
              }
            }
          }
        }
      }
    },
    "relayRef": {
      "title": "RelayRef",
      "description": "A relay that asserted a person's identity rather than authenticating them: the channel the capture arrived on and the message it arrived in.",
      "type": "object",
      "additionalProperties": false,
      "required": [
        "principal",
        "channelIdentity",
        "messageId"
      ],
      "properties": {
        "principal": {
          "description": "The relay's own principal id.",
          "$ref": "https://affiant.dev/schemas/0.1.0/common.schema.json#/$defs/identifier"
        },
        "channelIdentity": {
          "description": "How the person is addressed on that channel.",
          "$ref": "https://affiant.dev/schemas/0.1.0/common.schema.json#/$defs/identifier"
        },
        "messageId": {
          "description": "The message the capture arrived in.",
          "$ref": "https://affiant.dev/schemas/0.1.0/common.schema.json#/$defs/identifier"
        }
      }
    }
  }
};

/** `schemas/0.1.0/blocked.schema.json` — BlockedMarker. */
export const blockedSchema: JsonSchemaDocument = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://affiant.dev/schemas/0.1.0/blocked.schema.json",
  "title": "BlockedMarker",
  "description": "Why an entry cannot be decided even though it sits in pending (INVARIANTS.md AZ-4, CV-4). An implementation that receives a requirement level it does not run records that level verbatim, files the entry pending with this marker, refuses every decision on it, never executes it, and NEVER degrades it to a weaker requirement — a joint requirement quietly satisfied by one approval is the failure this exists to prevent. A blocked entry's card says so on its face and never claims a confirmation is being awaited. The marker is discriminated by its code, and each code carries exactly the context that code makes meaningful: a coverage refusal has no requirement level to report.",
  "type": "object",
  "oneOf": [
    {
      "$ref": "#/$defs/requirementNotImplemented"
    },
    {
      "$ref": "#/$defs/coverageRefused"
    }
  ],
  "$defs": {
    "requirementNotImplemented": {
      "title": "RequirementNotImplemented",
      "description": "A requirement level this version recognises but does not run reached the pipeline. In v0.1 those are ReferralRequired and MultiParty, whose semantics are reserved for protocol v0.2.",
      "type": "object",
      "additionalProperties": false,
      "required": [
        "code",
        "level"
      ],
      "properties": {
        "code": {
          "const": "requirement-not-implemented"
        },
        "level": {
          "description": "The requirement level that is not implemented, recorded verbatim.",
          "type": "string",
          "enum": [
            "StandingOrder",
            "ReviewerConfirmation",
            "ReferralRequired",
            "MultiParty"
          ]
        }
      }
    },
    "coverageRefused": {
      "title": "CoverageRefused",
      "description": "A proposal came from a write-capable tool the host declared the gate cannot intercept (CV-4). Wire-up refuses such a tool outright unless the host declares it uncovered, in which case its proposals are still recorded on the Docket — blocked, never silently allowed to write. The tool name is on the row so coverage can be re-assessed on resubmission.",
      "type": "object",
      "additionalProperties": false,
      "required": [
        "code",
        "category",
        "toolName"
      ],
      "properties": {
        "code": {
          "const": "coverage-refused"
        },
        "category": {
          "description": "The category the gate cannot cover: a write-capable tool with no execute to replace, a tool the model provider executes, or a hosted MCP server-side write.",
          "type": "string",
          "enum": [
            "no-execute",
            "provider-executed",
            "hosted-mcp"
          ]
        },
        "toolName": {
          "description": "The tool the uncovered proposal came from.",
          "$ref": "https://affiant.dev/schemas/0.1.0/common.schema.json#/$defs/identifier"
        }
      }
    }
  }
};

/** `schemas/0.1.0/common.schema.json` — Common definitions. */
export const commonSchema: JsonSchemaDocument = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://affiant.dev/schemas/0.1.0/common.schema.json",
  "title": "Common definitions",
  "description": "The primitives every other v0.1 schema refers to, defined once. Nothing here is a payload on its own; each $def is reached by $ref from the schemas in this directory.",
  "$defs": {
    "isoInstant": {
      "title": "IsoInstant",
      "description": "A point in time as an RFC 3339 date-time with an explicit offset. Every instant the framework writes onto a record is in UTC (a trailing \"Z\"); a host-supplied instant may carry another offset. Nothing in this protocol carries a local time with no offset.",
      "type": "string",
      "format": "date-time"
    },
    "uuid": {
      "title": "Uuid",
      "description": "A UUID in the canonical 8-4-4-4-12 lowercase hexadecimal form. Docket entry ids are UUIDs derived deterministically from the tenant, the conversation, the tool and the canonical form of the operation and its arguments, so a retry of the same proposal replays the same entry rather than filing a second one.",
      "type": "string",
      "format": "uuid"
    },
    "identifier": {
      "title": "Identifier",
      "description": "A host-chosen identifier: a tenant, a conversation, a person, a policy, a tool. A non-empty string; the protocol never parses one.",
      "type": "string",
      "minLength": 1
    },
    "protocolVersion": {
      "title": "ProtocolVersion",
      "description": "The protocol version an envelope conforms to, as a semantic version with no leading \"v\" (INVARIANTS.md SR-4). It is a version of the PROTOCOL, not of any implementation: while the major is 0 a schema-breaking change bumps the minor. A consumer refuses a payload whose major differs from the one it targets and MAY warn on a newer minor. \"0.1.0\" for this directory; the fixture-set-level string \"0.0.1-seed\" is what the seed carried instead, since the seed predates the field.",
      "type": "string",
      "pattern": "^(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)(-[0-9A-Za-z-]+(\\.[0-9A-Za-z-]+)*)?$"
    },
    "jsonValue": {
      "title": "JsonValue",
      "description": "Any value JSON can carry, null included. Written out rather than left unconstrained so a reader can see what is admitted: no undefined, which is not a JSON value and would not survive serialization, and no non-finite number, which JSON cannot spell.",
      "anyOf": [
        {
          "type": "string"
        },
        {
          "type": "number"
        },
        {
          "type": "boolean"
        },
        {
          "type": "null"
        },
        {
          "type": "array",
          "items": {
            "$ref": "#/$defs/jsonValue"
          }
        },
        {
          "type": "object",
          "additionalProperties": {
            "$ref": "#/$defs/jsonValue"
          }
        }
      ]
    },
    "nonNegativeInteger": {
      "title": "NonNegativeInteger",
      "description": "A count: an integer of zero or more.",
      "type": "integer",
      "minimum": 0
    },
    "unitInterval": {
      "title": "UnitInterval",
      "description": "A confidence in the closed range [0, 1]. An implementation clamps a producer-reported number into this range before it mints a tag (INVARIANTS.md PV-1); the bound is a rule, not a description of any one release.",
      "type": "number",
      "minimum": 0,
      "maximum": 1
    }
  }
};

/** `schemas/0.1.0/decision-result.schema.json` — DecisionResult. */
export const decisionResultSchema: JsonSchemaDocument = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://affiant.dev/schemas/0.1.0/decision-result.schema.json",
  "title": "DecisionResult",
  "description": "What became of a review, as the producer reports it back: the entry, the outcome, who agreed, and — once an executor has reported — what became of the write (INVARIANTS.md DK-1, AZ-1). A decision result is a REPORT, never an authorization: the Docket row is the sole record of approval authority, and nothing replayed from this envelope stands in for the row (AZ-5). \"resubmitted\" is the outcome an expired entry reads once a successor has superseded it.",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "protocolVersion",
    "docketId",
    "outcome",
    "attestation",
    "execution"
  ],
  "properties": {
    "protocolVersion": {
      "description": "The protocol version this envelope conforms to (SR-4).",
      "$ref": "https://affiant.dev/schemas/0.1.0/common.schema.json#/$defs/protocolVersion"
    },
    "docketId": {
      "description": "The Docket entry this reports on.",
      "$ref": "https://affiant.dev/schemas/0.1.0/common.schema.json#/$defs/uuid"
    },
    "outcome": {
      "description": "What became of the review.",
      "type": "string",
      "enum": [
        "approved",
        "rejected",
        "expired",
        "resubmitted"
      ]
    },
    "attestation": {
      "description": "Who agreed, or null when nobody did — a rejection and an expiry carry none (AZ-1). No attribution, no execution.",
      "oneOf": [
        {
          "$ref": "https://affiant.dev/schemas/0.1.0/attestation.schema.json"
        },
        {
          "type": "null"
        }
      ]
    },
    "execution": {
      "description": "What became of the write, or null when the review did not approve it. \"unexecuted\" until the host's executor reports (AZ-7).",
      "oneOf": [
        {
          "$ref": "https://affiant.dev/schemas/0.1.0/docket-entry.schema.json#/$defs/execution"
        },
        {
          "type": "null"
        }
      ]
    }
  }
};

/** `schemas/0.1.0/docket-entry.schema.json` — DocketEntry. */
export const docketEntrySchema: JsonSchemaDocument = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://affiant.dev/schemas/0.1.0/docket-entry.schema.json",
  "title": "DocketEntry",
  "description": "One filed proposal: the Affidavit, what it needs before it may execute, where it stands, and who agreed. The Docket is the SOLE record of approval authority — an executor is reachable only through an entry that carries an attestation, and nothing replayed from a client's history, a chat transcript or a framework checkpoint stands in for that (INVARIANTS.md AZ-5). A row reads FORWARD (DK-4): a recorded fact is never edited in place, and an accepted amendment, a preserved late amendment, an execution outcome and a supersession are each appended beside what was already there. Three correlations no JSON Schema can state, which an implementation enforces instead: execution is non-null exactly when status is \"approved\"; decidedAt is non-null on every terminal row and null while pending; and status is what the row SAYS — what it READS is status with the deadline applied, so a pending entry past expiresAt reads expired whether or not any sweep has run.",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "protocolVersion",
    "entryId",
    "tenantId",
    "conversationId",
    "channel",
    "toolName",
    "affidavit",
    "amendedAffidavit",
    "requirement",
    "status",
    "execution",
    "blocked",
    "compositeRef",
    "attestation",
    "amendments",
    "preservedAmendments",
    "decision",
    "lineage",
    "filedAt",
    "expiresAt",
    "decidedAt",
    "executionDetail"
  ],
  "properties": {
    "protocolVersion": {
      "description": "The protocol version this row's shapes conform to (SR-4).",
      "$ref": "https://affiant.dev/schemas/0.1.0/common.schema.json#/$defs/protocolVersion"
    },
    "entryId": {
      "description": "The entry's id, stable for its whole lifetime; a resubmission gets a new one. Derived deterministically from the tenant, the conversation, the tool and the canonical form of the operation and its arguments, so a retry replays the same entry and a genuinely new proposal files a new one (GT-4). Unique WITHIN a tenant, never across them.",
      "$ref": "https://affiant.dev/schemas/0.1.0/common.schema.json#/$defs/uuid"
    },
    "tenantId": {
      "description": "The tenant this entry is scoped to — the host's isolation boundary. The framework compares this with the caller's tenant ITSELF before any transition and treats a miss as not-found; it does not trust a store's scope (AZ-2).",
      "$ref": "https://affiant.dev/schemas/0.1.0/common.schema.json#/$defs/identifier"
    },
    "conversationId": {
      "description": "The conversation the proposal came from. Passed in explicitly at every gate entry point, never resolved from anything ambient (GT-2).",
      "$ref": "https://affiant.dev/schemas/0.1.0/common.schema.json#/$defs/identifier"
    },
    "channel": {
      "description": "Where the turn arrived from — \"chat\", \"mcp\", \"api\" or the host's own name for a surface. An open string: the transport is not the protocol (SR-5).",
      "$ref": "https://affiant.dev/schemas/0.1.0/common.schema.json#/$defs/identifier"
    },
    "toolName": {
      "description": "The tool or capture source the proposal came from. On the row because two later questions need it and neither can be answered from the Affidavit: a resubmission re-runs the coverage lookup against the original tool (CV-4), and an audit of a filed write has to be able to say which tool proposed it.",
      "$ref": "https://affiant.dev/schemas/0.1.0/common.schema.json#/$defs/identifier"
    },
    "affidavit": {
      "description": "The sworn evidence record AS THE AGENT PROPOSED IT. Never edited (DK-4). A row that overwrote its proposal could not show what the agent originally said, which is the fact an auditor is reading the row for.",
      "$ref": "https://affiant.dev/schemas/0.1.0/affidavit.schema.json"
    },
    "amendedAffidavit": {
      "description": "The state a reviewer's ACCEPTED amendments produced, or null while none has been accepted (AF-4, DK-4). The form a host's execution grant binds to is the canonical form of this if present, else of the proposal — a form over the proposal alone would let an amended proposal execute against a grant minted for the unamended one (SR-1).",
      "oneOf": [
        {
          "$ref": "https://affiant.dev/schemas/0.1.0/affidavit.schema.json"
        },
        {
          "type": "null"
        }
      ]
    },
    "requirement": {
      "description": "What the policy chain decided this write needs before it may execute, recorded verbatim (AZ-4).",
      "$ref": "#/$defs/requirementKind"
    },
    "status": {
      "description": "What the row says.",
      "$ref": "#/$defs/status"
    },
    "execution": {
      "description": "What became of the write. Non-null exactly when status is \"approved\": an approved-but-failed write MUST stay distinguishable from an approved-and-committed one (DK-1). Recorded ONCE, under a guarded transition from \"unexecuted\"; a second report is refused and changes nothing, because an execution state that can be flipped after the fact is an audit record that lies.",
      "oneOf": [
        {
          "$ref": "#/$defs/execution"
        },
        {
          "type": "null"
        }
      ]
    },
    "blocked": {
      "description": "Why this entry cannot be decided, or null when it can (AZ-4). A blocked entry sits in pending and refuses every decision.",
      "oneOf": [
        {
          "$ref": "https://affiant.dev/schemas/0.1.0/blocked.schema.json"
        },
        {
          "type": "null"
        }
      ]
    },
    "compositeRef": {
      "description": "The composite approval this entry is one constituent of, or null. Until MultiParty semantics land at protocol v0.2, a host composes multi-party approval ABOVE the gate: one entry per approver, all naming the same composite, each card stating on its face that it is one of N, and no constituent's approval alone reaching the executor (AZ-4).",
      "oneOf": [
        {
          "$ref": "https://affiant.dev/schemas/0.1.0/common.schema.json#/$defs/identifier"
        },
        {
          "type": "null"
        }
      ]
    },
    "attestation": {
      "description": "Who agreed, or null while nobody has (AZ-1). A Standing Order's attestation is written in the same operation as the filing.",
      "oneOf": [
        {
          "$ref": "https://affiant.dev/schemas/0.1.0/attestation.schema.json"
        },
        {
          "type": "null"
        }
      ]
    },
    "amendments": {
      "description": "The amendments a reviewer's approval ACCEPTED, or null when the approval carried none (DK-2). A map a REFUSED late decision carried is a different fact and lives under preservedAmendments: nobody accepted it, and conflating the two would let a resubmission present a refused caller's corrections as an approval's.",
      "oneOf": [
        {
          "$ref": "https://affiant.dev/schemas/0.1.0/amendments.schema.json"
        },
        {
          "type": "null"
        }
      ]
    },
    "preservedAmendments": {
      "description": "The amendments a decision carried AFTER the deadline had passed, with the act that carried them, or null (DK-1). A later fact appended to an expired row and read by a resubmission to prefill the new proposal.",
      "oneOf": [
        {
          "$ref": "#/$defs/preservedAmendments"
        },
        {
          "type": "null"
        }
      ]
    },
    "decision": {
      "description": "What a reviewer chose, or null for a pending row or a Standing Order. Separate from the attestation because they answer different questions: the attestation says who may be held to this, the decision says what they chose and why. A Standing Order produces an attestation and no decision record — no person chose anything.",
      "oneOf": [
        {
          "$ref": "#/$defs/decisionRecord"
        },
        {
          "type": "null"
        }
      ]
    },
    "lineage": {
      "description": "What this entry replaces and what replaced it (DK-1).",
      "$ref": "#/$defs/lineage"
    },
    "filedAt": {
      "description": "When the entry was filed. Fixes the filing order rehydration reads in (DK-5).",
      "$ref": "https://affiant.dev/schemas/0.1.0/common.schema.json#/$defs/isoInstant"
    },
    "expiresAt": {
      "description": "The deadline. Stamped from the policy verdict's time-to-live AFTER the policy chain has run, else the policy's declared default, else the gate's required default (GT-4) — a single global default applied before policy is non-conformant. NEVER refreshed by a re-file: a replay re-broadcasts the existing card with its existing deadline. The boundary is inclusive: at expiresAt the entry is expired.",
      "$ref": "https://affiant.dev/schemas/0.1.0/common.schema.json#/$defs/isoInstant"
    },
    "decidedAt": {
      "description": "When the row left pending, or null while it has not.",
      "oneOf": [
        {
          "$ref": "https://affiant.dev/schemas/0.1.0/common.schema.json#/$defs/isoInstant"
        },
        {
          "type": "null"
        }
      ]
    },
    "executionDetail": {
      "description": "What the executor reported, or null when it has not reported or had nothing to say.",
      "type": [
        "string",
        "null"
      ]
    }
  },
  "$defs": {
    "status": {
      "title": "DocketStatus",
      "description": "Where an entry stands. pending is the only non-terminal state and it goes to exactly ONE of the other three; every transition out of pending is a guarded compare-and-set keyed on the entry id and the expected current state (DK-1). \"deferred\" and a referral outcome are RESERVED for protocol v0.2 and deliberately absent: no implementation has run those transitions, and naming them here would invite a host to depend on semantics nobody has fixed.",
      "type": "string",
      "enum": [
        "pending",
        "approved",
        "rejected",
        "expired"
      ]
    },
    "execution": {
      "title": "ExecutionOutcome",
      "description": "What became of an approved write once the host's executor reported. A separate axis rather than two more statuses because an approved-but-failed write and an approved-and-committed one differ in what the HOST must do next, not in whether the approval happened; collapsing them into status loses the approval. The framework never performs the write — the only path to \"executed\" is the host's report (AZ-7).",
      "type": "string",
      "enum": [
        "unexecuted",
        "executed",
        "failed"
      ]
    },
    "requirementKind": {
      "title": "RequirementKind",
      "description": "How much agreement a write needs before it may execute — the policy chain's verdict kind. StandingOrder approves with no person present; ReviewerConfirmation asks one person; ReferralRequired hands the entry to a different reviewer and MultiParty requires several, NEITHER of which v0.1 runs: an implementation records the level verbatim, files the entry pending with a blocked marker, and never degrades it to a weaker requirement (AZ-4).",
      "type": "string",
      "enum": [
        "StandingOrder",
        "ReviewerConfirmation",
        "ReferralRequired",
        "MultiParty"
      ]
    },
    "decisionRecord": {
      "title": "DecisionRecord",
      "description": "What a reviewer decided, as it is recorded on the row. Amending is approving with an amendment map, not a third kind.",
      "type": "object",
      "additionalProperties": false,
      "required": [
        "kind",
        "reason",
        "at"
      ],
      "properties": {
        "kind": {
          "description": "Approve or reject.",
          "type": "string",
          "enum": [
            "approve",
            "reject"
          ]
        },
        "reason": {
          "description": "The reviewer's stated reason, or null when they gave none. Required on a rejection — a refusal nobody explained teaches the host nothing.",
          "type": [
            "string",
            "null"
          ]
        },
        "at": {
          "description": "When the decision was made.",
          "$ref": "https://affiant.dev/schemas/0.1.0/common.schema.json#/$defs/isoInstant"
        }
      }
    },
    "lineage": {
      "title": "Lineage",
      "description": "A resubmission is a NEW entry, never a reopened one: the superseded entry keeps its terminal state and records its successor, so the history reads forward and nothing once decided is quietly edited (DK-1, DK-4). An entry that is not expired cannot be resubmitted.",
      "type": "object",
      "additionalProperties": false,
      "required": [
        "supersedes",
        "supersededBy"
      ],
      "properties": {
        "supersedes": {
          "description": "The entry this one resubmits, or null for a first filing.",
          "oneOf": [
            {
              "$ref": "https://affiant.dev/schemas/0.1.0/common.schema.json#/$defs/uuid"
            },
            {
              "type": "null"
            }
          ]
        },
        "supersededBy": {
          "description": "The entry that resubmitted this one, or null while none has.",
          "oneOf": [
            {
              "$ref": "https://affiant.dev/schemas/0.1.0/common.schema.json#/$defs/uuid"
            },
            {
              "type": "null"
            }
          ]
        }
      }
    },
    "preservedAmendments": {
      "title": "PreservedAmendments",
      "description": "The amendments a refused late decision carried, with the act that carried them. The instant and the principal are here, not merely implied, because a resubmission prefills these values as A PERSON'S OWN CORRECTION: each prefilled field is tagged UserStated with a reviewer-act binding, and that binding names the decision the correction was made on. Without the instant the binding would have to point at the row's deadline — the moment the gate refused, not the moment the person typed — and without the principal the record could not say whose correction it is.",
      "type": "object",
      "additionalProperties": false,
      "required": [
        "amendments",
        "at",
        "by"
      ],
      "properties": {
        "amendments": {
          "description": "The map the refused decision carried. DK-2 holds inside it.",
          "$ref": "https://affiant.dev/schemas/0.1.0/amendments.schema.json"
        },
        "at": {
          "description": "When the refused decision was made.",
          "$ref": "https://affiant.dev/schemas/0.1.0/common.schema.json#/$defs/isoInstant"
        },
        "by": {
          "description": "Who made it, as the host identifies them.",
          "$ref": "https://affiant.dev/schemas/0.1.0/common.schema.json#/$defs/identifier"
        }
      }
    }
  }
};

/** `schemas/0.1.0/entity-ref.schema.json` — EntityRef. */
export const entityRefSchema: JsonSchemaDocument = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://affiant.dev/schemas/0.1.0/entity-ref.schema.json",
  "title": "EntityRef",
  "description": "The entity a write is about: its kind and, for an update, its identifier. Both are the host's own vocabulary — the protocol never parses either. entityId is null exactly when the operation is create-shaped (INVARIANTS.md AF-3).",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "entityType",
    "entityId"
  ],
  "properties": {
    "entityType": {
      "description": "The kind of domain entity being written, named by the host.",
      "$ref": "https://affiant.dev/schemas/0.1.0/common.schema.json#/$defs/identifier"
    },
    "entityId": {
      "description": "The identifier of the entity; null for a create, where no identifier exists yet.",
      "oneOf": [
        {
          "$ref": "https://affiant.dev/schemas/0.1.0/common.schema.json#/$defs/identifier"
        },
        {
          "type": "null"
        }
      ]
    }
  }
};

/** `schemas/0.1.0/error-code.schema.json` — ErrorCode. */
export const errorCodeSchema: JsonSchemaDocument = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://affiant.dev/schemas/0.1.0/error-code.schema.json",
  "title": "ErrorCode",
  "description": "The registry of reasons the gate refuses a request (INVARIANTS.md, \"Refusal codes (v0.1)\"). A refusal carries its code and a human-readable reason; the CODE is the contract and the message is for a human reading a log, so a host that branches on the message is doing it wrong. An implementation MAY add codes but MUST NOT reuse these names for other meanings. The registry names GATE REFUSALS only: a caller's programming error — an amendment naming a field the Affidavit does not propose, a verdict naming a requirement outside the four — is a language-level error, not a refusal code. Three names are PROVISIONAL until this registry is first tagged, marked in their own descriptions; the other seven are fixed by the rulebook's v0.1 text. The order below only ever grows at the end: a code is added by appending, never by inserting among the codes that already shipped, because a reordering looks like a rename to a host's exhaustiveness check and to a parity manifest.",
  "type": "string",
  "oneOf": [
    {
      "const": "requirement-not-implemented",
      "description": "PROVISIONAL. A requirement level this implementation recognises but does not run — a MultiParty approval, a ReferralRequired referral — reached the pipeline. The entry is filed pending and marked blocked; every decision on it is refused, and it is never degraded to a weaker requirement (AZ-4)."
    },
    {
      "const": "coverage-refused",
      "description": "PROVISIONAL. A write-capable tool the gate must cover cannot be intercepted: it has no execute to replace, the model provider executes it, or it is a hosted MCP server-side write. Raised at wire-up, or carried on a proposal from a tool the host explicitly declared uncovered (CV-4, CV-1, AZ-4)."
    },
    {
      "const": "substance-refused",
      "description": "A proposal reached the substance gate with nothing to swear to: no proposed field carrying provenance other than Empty, or a non-empty value sitting under Empty provenance. Refused before the policy chain runs, so no Standing Order ever sees a hollow proposal, and before anything is filed (GT-3)."
    },
    {
      "const": "decision-unauthorized",
      "description": "A decision was refused on identity grounds: the context carried no resolved principal, the host's authorization port said no, or a port that threw was read as a refusal rather than an approval. Checked before the store is read (AZ-2, AZ-3)."
    },
    {
      "const": "decision-not-pending",
      "description": "A decision was made on an entry that is no longer pending, or on one carrying a blocked marker — in which case the blocked code travels in the refusal's details (DK-1, AZ-4)."
    },
    {
      "const": "decision-expired",
      "description": "A decision arrived after the entry's deadline. The entry reads expired whether or not any sweep has run; when the decision came from a principal who could have decided, its amendments are preserved on the row for a resubmission (DK-1)."
    },
    {
      "const": "decision-lost-race",
      "description": "Two decisions raced for the same entry and this one lost the compare-and-set. A transition is applied once or not at all, never twice, and never silently overwritten (DK-1)."
    },
    {
      "const": "wireup-invalid",
      "description": "The gate was built wrong in a way it can detect: no store, no inference port, no projection port, no authorization port, no default time-to-live or an invalid one, a policy declaring a risk threshold with no scorer wired. Raised at wire-up, not on the first request; two policy faults that cannot be seen at wire-up — a verdict carrying an invalid time-to-live, and an evaluate that throws — are refused at evaluation with the same code, nothing filed. No option turns the gate off for a tool it covers (CV-1)."
    },
    {
      "const": "entry-not-found",
      "description": "No entry with that id is visible in the caller's scope. An entry outside the caller's tenant is NOT FOUND rather than unauthorized — the framework compares the row's tenant with the caller's itself (AZ-2, DK-1)."
    },
    {
      "const": "execution-already-recorded",
      "description": "PROVISIONAL. An execution outcome was reported against a row that already carries one. The first report stands and the row is untouched: a host that retries a write reports ONCE, when it knows the outcome, because an outbox is a retry of an already-attested write and not a second fact about what happened (DK-1, DK-4, AZ-5)."
    }
  ],
  "enum": [
    "requirement-not-implemented",
    "coverage-refused",
    "substance-refused",
    "decision-unauthorized",
    "decision-not-pending",
    "decision-expired",
    "decision-lost-race",
    "wireup-invalid",
    "entry-not-found",
    "execution-already-recorded"
  ]
};

/** `schemas/0.1.0/evidence-card-request.schema.json` — EvidenceCardRequest. */
export const evidenceCardRequestSchema: JsonSchemaDocument = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://affiant.dev/schemas/0.1.0/evidence-card-request.schema.json",
  "title": "EvidenceCardRequest",
  "description": "The envelope that carries an Affidavit to a reviewer surface: the entry it is filed under, the sworn record, the deadline, the amendments already made on a superseded entry, and the presentation the core does not swear to — whether a person must confirm, the per-field rendering hints, the warnings a reviewer should see and the host's own verb for the operation, none of which is part of the canonical form (SR-1). A producer may send the same request for the same docketId more than once; a consumer treats a repeat as the SAME card, updating in place rather than adding a second one — a re-file is an idempotent replay that re-broadcasts the existing deadline, never a fresh one (INVARIANTS.md GT-4). AF-2 requires a card to show all three confidence numbers; aggregateConfidence is on the Affidavit and the two companions are repeated here, where the seed carried them, so a consumer written against either shape finds them.",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "protocolVersion",
    "docketId",
    "affidavit",
    "requiredBy",
    "priorAmendments",
    "populatedConfidence",
    "emptyFieldCount",
    "blocked",
    "requiresConfirmation"
  ],
  "properties": {
    "protocolVersion": {
      "description": "The protocol version this envelope conforms to (SR-4).",
      "$ref": "https://affiant.dev/schemas/0.1.0/common.schema.json#/$defs/protocolVersion"
    },
    "docketId": {
      "description": "The Docket entry this card is filed under — the row's own entryId.",
      "$ref": "https://affiant.dev/schemas/0.1.0/common.schema.json#/$defs/uuid"
    },
    "affidavit": {
      "description": "The record awaiting a decision: the proposal, or the state an accepted amendment produced.",
      "$ref": "https://affiant.dev/schemas/0.1.0/affidavit.schema.json"
    },
    "requiredBy": {
      "description": "When the review window closes — the entry's own expiresAt (GT-4).",
      "$ref": "https://affiant.dev/schemas/0.1.0/common.schema.json#/$defs/isoInstant"
    },
    "priorAmendments": {
      "description": "Set only when this card resubmits a review that expired: the amendments a reviewer made on the original entry, so the next reviewer sees what was already agreed. Null for a first filing. DK-2 holds inside the map — a null under a key means the reviewer CLEARED that field, which is distinct from the key being absent.",
      "oneOf": [
        {
          "$ref": "https://affiant.dev/schemas/0.1.0/amendments.schema.json"
        },
        {
          "type": "null"
        }
      ]
    },
    "populatedConfidence": {
      "description": "The minimum confidence over the non-Empty proposed fields, or null when there are none (AF-2). The same number the Affidavit carries; repeated on the envelope for one version, since this is where the seed put it.",
      "oneOf": [
        {
          "$ref": "https://affiant.dev/schemas/0.1.0/common.schema.json#/$defs/unitInterval"
        },
        {
          "type": "null"
        }
      ]
    },
    "emptyFieldCount": {
      "description": "How many proposed fields are tagged Empty (AF-2). The same number the Affidavit carries; repeated on the envelope for one version.",
      "$ref": "https://affiant.dev/schemas/0.1.0/common.schema.json#/$defs/nonNegativeInteger"
    },
    "blocked": {
      "description": "Why no decision on this entry will be accepted, or null when it can be decided (AZ-4, CV-4). On the envelope so a reviewer surface can render it rather than infer it from a warning string.",
      "oneOf": [
        {
          "$ref": "https://affiant.dev/schemas/0.1.0/blocked.schema.json"
        },
        {
          "type": "null"
        }
      ]
    },
    "presentation": {
      "description": "How a reviewer surface should render each field's input, supplied by the host and sworn to by nobody. One entry per field it has a hint for, naming a field the Affidavit carries; a card with no hints omits the property entirely, and a card may carry hints for some of its fields and not others. This is PRESENTATION, not substance: the gate carries a hint and validates nothing against it, and nothing here is part of the canonical form, which is defined over the Affidavit and its accepted amendments alone (SR-1). It lives on the envelope for the same reason requiresConfirmation does — the core swears to what a value is and where it came from, not to how it should be shown. That a name here is a field of THIS card's Affidavit is a relation between two objects and no JSON Schema can check it; the fixture lint does (conformance/lint/lint.mjs).",
      "type": "array",
      "items": {
        "title": "FieldPresentation",
        "description": "The rendering hints for one field.",
        "type": "object",
        "additionalProperties": false,
        "required": [
          "name"
        ],
        "properties": {
          "name": {
            "description": "The field these hints are about. A name present in affidavit.fields.",
            "$ref": "https://affiant.dev/schemas/0.1.0/common.schema.json#/$defs/identifier"
          },
          "kind": {
            "description": "The rendering hint the field carries, repeated here so a surface reading only the presentation array has it. When present it agrees with that field's own kind; the Affidavit's copy is the one the record swears to.",
            "$ref": "https://affiant.dev/schemas/0.1.0/affidavit-field.schema.json#/properties/kind"
          },
          "allowedValues": {
            "description": "The closed set an amendment input offers for this field, in the order a surface should show them. Absent when the host declared none. The gate validates no value against it: a proposed or amended value outside the set is still recorded, and the set is a hint to the control, not a constraint on the record.",
            "type": "array",
            "items": {
              "$ref": "https://affiant.dev/schemas/0.1.0/common.schema.json#/$defs/jsonValue"
            }
          },
          "pattern": {
            "description": "The regular expression an amendment input is constrained by, as the host wrote it. Absent when the host declared none. Carried verbatim and never compiled or applied by the gate — it is the surface's input mask, and a host that wants a value refused enforces that in its own policy, not here.",
            "type": "string"
          }
        }
      }
    },
    "warnings": {
      "description": "Sentences a reviewer should see beside the record: the reason a policy gave for its verdict, and the sentence a blocked entry shows. Absent when there are none. Presentation, not substance — the machine-readable half of a blocked entry is the blocked marker, which a surface renders rather than parsing a string out of this array, and nothing here is part of the canonical form (SR-1). A consumer never switches on the text of a warning.",
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "hostOperation": {
      "description": "The host's own verb for the operation — \"WriteUpdate\", \"Reprice\", \"Onboard\" — absent when the host named none. PRESENTATION, like the three slots above it, and never part of the canonical form (SR-1): a host that renames a verb has not changed the evidence. affidavit.operationType is the protocol's two-valued SHAPE, because a rule about shape has to be a predicate a policy can test without knowing any host's vocabulary; this is the word that host uses for the same act, carried beside it so a reviewer surface can head the card with the term a person recognises rather than with \"create\" or \"update\". Never instead of it: a consumer that switched on this string would be switching on a host's vocabulary.",
      "type": "string",
      "minLength": 1
    },
    "requiresConfirmation": {
      "description": "Whether a person must confirm this write before it commits. The POLICY CHAIN's verdict, not a property of the evidence, which is why it sits on the envelope and not on the Affidavit. False on a blocked entry: a card carrying a marker that says no decision will be accepted must not also offer a reviewer surface an approve button that cannot work.",
      "type": "boolean"
    }
  }
};

/** `schemas/0.1.0/money.schema.json` — Money. */
export const moneySchema: JsonSchemaDocument = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://affiant.dev/schemas/0.1.0/money.schema.json",
  "title": "Money",
  "description": "A monetary field value: a decimal string and an ISO 4217 alphabetic currency code, never a binary float (INVARIANTS.md SR-2). The reason is not fussiness about types. An Affidavit is a record a person swears to and an auditor reads back years later; a binary float cannot represent 0.10, so a card showing \"4000.10\" and a store holding 4000.099999999999 disagree about what was approved and nothing in the record says which one the reviewer saw. A decimal string is the value the reviewer read, byte for byte. This is a wire rule only: a host stores what it likes (integer minor units, a database decimal) and converts at the edge. No currency list is embedded here — ISO 4217 changes, and a table frozen into a schema would be wrong within a year; the shape is checked here and membership is the host's check.",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "amount",
    "currency"
  ],
  "properties": {
    "amount": {
      "description": "The amount as a decimal string: an optional minus, an integer part with no leading zeros, and an optional fractional part. No exponent (\"1e3\"), no thousands separator (\"1,000\"), no leading plus, no currency symbol. At most the currency's minor-unit scale unless the host declares otherwise — that scale is the host's declaration, not a constraint this schema can carry.",
      "type": "string",
      "pattern": "^-?(0|[1-9][0-9]*)(\\.[0-9]+)?$"
    },
    "currency": {
      "description": "The ISO 4217 alphabetic code: three uppercase ASCII letters. Never case-folded anywhere on the wire (SR-3).",
      "type": "string",
      "pattern": "^[A-Z]{3}$"
    }
  }
};

/** `schemas/0.1.0/notification.schema.json` — Notification. */
export const notificationSchema: JsonSchemaDocument = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://affiant.dev/schemas/0.1.0/notification.schema.json",
  "title": "Notification",
  "description": "What a producer tells a reviewer surface about a Docket entry that nobody asked it about: a deadline approaching, a deadline passed, a state change (INVARIANTS.md DK-1, DK-3). One discriminated union with a `kind` property, added in v0.1 — the seed's two notifications were told apart by which properties they carried, and a consumer switching on the presence of fields is exactly what AF-5 forbids. A notification is a HINT, never a fact a consumer may act on alone: expiry is queryable state, so an entry past its deadline reads expired whether or not any sweep has run or any notification arrived.",
  "type": "object",
  "oneOf": [
    {
      "$ref": "#/$defs/docketExpiring"
    },
    {
      "$ref": "#/$defs/docketExpired"
    },
    {
      "$ref": "#/$defs/docketTransition"
    }
  ],
  "$defs": {
    "docketExpiring": {
      "title": "DocketExpiringNotification",
      "description": "A pending entry is approaching its deadline. RE-SENT on every sweep while the entry stays inside the warning window, so a consumer must treat repeats for the same docketId as idempotent — key a countdown off expiresAt rather than counting notifications.",
      "type": "object",
      "additionalProperties": false,
      "required": [
        "protocolVersion",
        "kind",
        "docketId",
        "expiresAt"
      ],
      "properties": {
        "protocolVersion": {
          "$ref": "https://affiant.dev/schemas/0.1.0/common.schema.json#/$defs/protocolVersion"
        },
        "kind": {
          "const": "docket-expiring"
        },
        "docketId": {
          "description": "The entry approaching expiry.",
          "$ref": "https://affiant.dev/schemas/0.1.0/common.schema.json#/$defs/uuid"
        },
        "expiresAt": {
          "description": "When the entry expires. The boundary is inclusive.",
          "$ref": "https://affiant.dev/schemas/0.1.0/common.schema.json#/$defs/isoInstant"
        }
      }
    },
    "docketExpired": {
      "title": "DocketExpiredNotification",
      "description": "A pending entry lapsed without a reviewer decision. The write it carried is not committed. A decision arriving after this is refused, and — when it came from a principal who could have decided — its amendments are preserved on the row for a resubmission (DK-1).",
      "type": "object",
      "additionalProperties": false,
      "required": [
        "protocolVersion",
        "kind",
        "docketId"
      ],
      "properties": {
        "protocolVersion": {
          "$ref": "https://affiant.dev/schemas/0.1.0/common.schema.json#/$defs/protocolVersion"
        },
        "kind": {
          "const": "docket-expired"
        },
        "docketId": {
          "description": "The entry that expired.",
          "$ref": "https://affiant.dev/schemas/0.1.0/common.schema.json#/$defs/uuid"
        }
      }
    },
    "docketTransition": {
      "title": "DocketTransitionNotification",
      "description": "An entry changed state (DK-1). New in v0.1, and the shape of the docket.transition telemetry event the registry names (TL-1): the state it left, the state it reached, and the execution outcome an approved row now carries.",
      "type": "object",
      "additionalProperties": false,
      "required": [
        "protocolVersion",
        "kind",
        "docketId",
        "from",
        "to",
        "execution"
      ],
      "properties": {
        "protocolVersion": {
          "$ref": "https://affiant.dev/schemas/0.1.0/common.schema.json#/$defs/protocolVersion"
        },
        "kind": {
          "const": "docket-transition"
        },
        "docketId": {
          "description": "The entry that changed state.",
          "$ref": "https://affiant.dev/schemas/0.1.0/common.schema.json#/$defs/uuid"
        },
        "from": {
          "description": "The state the entry left.",
          "$ref": "https://affiant.dev/schemas/0.1.0/docket-entry.schema.json#/$defs/status"
        },
        "to": {
          "description": "The state the entry reached.",
          "$ref": "https://affiant.dev/schemas/0.1.0/docket-entry.schema.json#/$defs/status"
        },
        "execution": {
          "description": "The execution outcome the row now carries, or null when it is not approved.",
          "oneOf": [
            {
              "$ref": "https://affiant.dev/schemas/0.1.0/docket-entry.schema.json#/$defs/execution"
            },
            {
              "type": "null"
            }
          ]
        }
      }
    }
  }
};

/** `schemas/0.1.0/operation.schema.json` — Operation. */
export const operationSchema: JsonSchemaDocument = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://affiant.dev/schemas/0.1.0/operation.schema.json",
  "title": "Operation",
  "description": "The registry of operation shapes an Affidavit may swear to. Two in v0.1, and they are shapes rather than the host's own verbs: a create names no entity and swears to no previous values; an update names the entity it changes and carries a previousValue key on every proposed field (INVARIANTS.md AF-3). \"Create-only\" is therefore a predicate a policy can test without knowing what the host calls its operations. The host's own verb travels beside this, never instead of it.",
  "type": "string",
  "oneOf": [
    {
      "const": "create",
      "description": "A new entity. entityId is null and every field's previousValue is null."
    },
    {
      "const": "update",
      "description": "An existing entity. entityId names it, and every proposed field carries a previousValue key holding the stored value or null where there was none."
    }
  ],
  "enum": [
    "create",
    "update"
  ]
};

/** `schemas/0.1.0/outside-gate.schema.json` — OutsideGateMarker. */
export const outsideGateSchema: JsonSchemaDocument = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://affiant.dev/schemas/0.1.0/outside-gate.schema.json",
  "title": "OutsideGateMarker",
  "description": "A write a host made outside the gate — an import, a migration, a backfill (INVARIANTS.md AZ-1). It is deliberately a DIFFERENT shape from an attestation and not a fourth attestor kind: no export may render it in an attestation position, and a card shows it as outside the guarantee. The honest boundary as a mechanism rather than a paragraph — a system that quietly attributed a bulk import to whoever ran it would make the attestation record worth less than the paper it is not printed on.",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "reason",
    "recordedBy",
    "at"
  ],
  "properties": {
    "reason": {
      "description": "Why the write happened outside the gate, in the host's own words.",
      "type": "string",
      "minLength": 1
    },
    "recordedBy": {
      "description": "Who recorded the fact — the operator or the process. Not an approver: nobody approved this through the gate.",
      "$ref": "https://affiant.dev/schemas/0.1.0/common.schema.json#/$defs/identifier"
    },
    "at": {
      "description": "When the fact was recorded.",
      "$ref": "https://affiant.dev/schemas/0.1.0/common.schema.json#/$defs/isoInstant"
    }
  }
};

/** `schemas/0.1.0/provenance-chain.schema.json` — ProvenanceChain. */
export const provenanceChainSchema: JsonSchemaDocument = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://affiant.dev/schemas/0.1.0/provenance-chain.schema.json",
  "title": "ProvenanceChain",
  "description": "The ordered provenance history of a single field: the tag in force now, plus every tag it displaced, newest first. Nothing is ever dropped from a chain — a merge that discarded the loser would erase the fact that two producers disagreed, which is the fact a reviewer most wants. On merge the higher confidence wins and ties break toward the more deterministic source; a reviewer's act is not a confidence contest it might lose and supersedes outright (INVARIANTS.md PV-1, AF-4).",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "current",
    "prior"
  ],
  "properties": {
    "current": {
      "description": "The tag in force for this field's current value.",
      "$ref": "https://affiant.dev/schemas/0.1.0/provenance-tag.schema.json"
    },
    "prior": {
      "description": "Superseded tags, newest first — the order a card reads them in (\"was Inferred at 0.4, before that Default\"). Empty on a chain that has never been merged or superseded. Never null.",
      "type": "array",
      "items": {
        "$ref": "https://affiant.dev/schemas/0.1.0/provenance-tag.schema.json"
      }
    }
  }
};

/** `schemas/0.1.0/provenance-source.schema.json` — ProvenanceSource. */
export const provenanceSourceSchema: JsonSchemaDocument = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://affiant.dev/schemas/0.1.0/provenance-source.schema.json",
  "title": "ProvenanceSource",
  "description": "Where a field value came from. Serialized as the member name, not an integer. The order below is the determinism ladder, most deterministic first: when two provenance tags carry equal confidence, the earlier member in this list wins the merge (INVARIANTS.md PV-1). Read it as a claim about who could re-derive the value: the person said it; a system of record holds it; a named rule computes it; it was literally present in the conversation; a model reasoned to it; a default filled it in; nobody knows.",
  "type": "string",
  "enum": [
    "UserStated",
    "External",
    "Computed",
    "Conversation",
    "Inferred",
    "Default",
    "Empty"
  ]
};

/** `schemas/0.1.0/provenance-tag.schema.json` — ProvenanceTag. */
export const provenanceTagSchema: JsonSchemaDocument = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://affiant.dev/schemas/0.1.0/provenance-tag.schema.json",
  "title": "ProvenanceTag",
  "description": "One provenance record for one field value: where the value came from, how confident its producer is, a line for the reviewer, when the tag was minted, which conversation turn produced it, and what to look at to check it. A field whose provenance is unknown carries a tag with source \"Empty\" at confidence 0 rather than no tag at all — the absence of evidence is itself recorded evidence (INVARIANTS.md AF-1, PV-1).",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "source",
    "confidence",
    "note",
    "at",
    "conversationTurn",
    "binding"
  ],
  "properties": {
    "source": {
      "description": "Where the value came from.",
      "$ref": "https://affiant.dev/schemas/0.1.0/provenance-source.schema.json"
    },
    "confidence": {
      "description": "Confidence in the value, clamped into [0, 1] at mint time (PV-1). An Empty tag always carries 0: \"nobody knows where this came from\" cannot also be a confident claim.",
      "$ref": "https://affiant.dev/schemas/0.1.0/common.schema.json#/$defs/unitInterval"
    },
    "note": {
      "description": "A human-readable line for the reviewer explaining how the value was obtained, or null when there is nothing to say. Named `evidence` in the 0.0.1-seed wire; renamed here because the whole record is the evidence and this property is the sentence a person reads.",
      "type": [
        "string",
        "null"
      ]
    },
    "at": {
      "description": "When the tag was minted. New in v0.1: the seed wire had nowhere to put it, so a chain read off the seed could not say when a claim was made.",
      "$ref": "https://affiant.dev/schemas/0.1.0/common.schema.json#/$defs/isoInstant"
    },
    "conversationTurn": {
      "description": "Index of the conversation turn the value came from, or null when the value did not come from a turn.",
      "type": [
        "integer",
        "null"
      ]
    },
    "binding": {
      "description": "What to look at to check the value, or null when the producer had nothing to point at (PV-2). Written on every minted tag — null rather than omitted — so a reader never has to distinguish \"unbound\" from \"the property was left off\". A tag graded above Conversation SHOULD carry one at v0.1 and MUST at v0.2; an unbound tag above Conversation is recorded as claimed but never honoured by a verdict made with no person present (PV-4, PV-5).",
      "oneOf": [
        {
          "$ref": "https://affiant.dev/schemas/0.1.0/binding.schema.json"
        },
        {
          "type": "null"
        }
      ]
    }
  }
};

/** `schemas/0.1.0/telemetry-key.schema.json` — TelemetryKeyRegistry. */
export const telemetryKeySchema: JsonSchemaDocument = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://affiant.dev/schemas/0.1.0/telemetry-key.schema.json",
  "title": "TelemetryKeyRegistry",
  "description": "The telemetry-key registry an implementation ships beside its packages (INVARIANTS.md TL-1). Every event the gate emits is named here, and a key is NEVER renamed and never removed, only deprecated — the registry is a versioned API, and an operator's alerts are built on it. Attributes carry field NAMES, never field values: an event is not an audit record, and the audit record is the Affidavit. Where a public standard names the same thing the registry uses its name (TL-2): OpenTelemetry's gen_ai.* semantic conventions for the tool name, the conversation id and the operation.",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "protocolVersion",
    "registryVersion",
    "keys"
  ],
  "properties": {
    "protocolVersion": {
      "description": "The protocol version this registry document conforms to (SR-4).",
      "$ref": "https://affiant.dev/schemas/0.1.0/common.schema.json#/$defs/protocolVersion"
    },
    "registryVersion": {
      "description": "The version of the registry itself, as the implementation that ships it numbers its own releases. Distinct from protocolVersion: a registry gains keys between protocol versions.",
      "type": "string",
      "minLength": 1
    },
    "keys": {
      "description": "Every key, in registry order. The order only ever grows at the end.",
      "type": "array",
      "minItems": 1,
      "items": {
        "$ref": "#/$defs/entry"
      }
    }
  },
  "$defs": {
    "entry": {
      "title": "TelemetryKeyEntry",
      "description": "One event the gate emits.",
      "type": "object",
      "additionalProperties": false,
      "required": [
        "key",
        "since",
        "description",
        "attributes"
      ],
      "properties": {
        "key": {
          "description": "The event name. The v0.1 keys are affidavit.filed, affidavit.refused.substance, coverage.refused, docket.transition, docket.expired, decision.unauthorized, standing-order.fired, standing-order.blocked and policy.invalid.",
          "type": "string",
          "pattern": "^[a-z0-9]+([.-][a-z0-9]+)*$"
        },
        "since": {
          "description": "The version of the shipping implementation the key first appeared in.",
          "type": "string",
          "minLength": 1
        },
        "description": {
          "description": "What the event means, in one line.",
          "type": "string",
          "minLength": 1
        },
        "attributes": {
          "description": "The attribute names carried on this event. Names, never values. Never null — an empty array is what an event with no attributes looks like.",
          "type": "array",
          "items": {
            "type": "string",
            "minLength": 1
          }
        }
      }
    }
  }
};

/** `schemas/0.1.0/tool-result.schema.json` — ToolResult. */
export const toolResultSchema: JsonSchemaDocument = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://affiant.dev/schemas/0.1.0/tool-result.schema.json",
  "title": "ToolResult",
  "description": "What a tool call returns once the gate stands in front of it: one discriminated union of three kinds, carried on a single `kind` property (INVARIANTS.md AF-5). A consumer switches on the discriminator, NEVER on the presence of fields. A gated write tool's result is always the write kind — a PROPOSAL, never a completed write (GT-6): a model reading it learns that the write is pending or that a Standing Order approved it, never that it happened, because the gate does not execute (AZ-7). A refusal the gate raises is the error kind carrying its code. Spelled `$type` in the 0.0.1-seed wire and the shipped .NET envelope; `kind` from v0.1.",
  "type": "object",
  "oneOf": [
    {
      "$ref": "#/$defs/write"
    },
    {
      "$ref": "#/$defs/read"
    },
    {
      "$ref": "#/$defs/error"
    }
  ],
  "$defs": {
    "write": {
      "title": "WriteProposalResult",
      "description": "A write proposal was filed: the entry it was filed under, the status the row reads at, and the card a person is shown.",
      "type": "object",
      "additionalProperties": false,
      "required": [
        "kind",
        "entryId",
        "status",
        "card"
      ],
      "properties": {
        "kind": {
          "const": "write"
        },
        "entryId": {
          "description": "The Docket entry the proposal was filed under.",
          "$ref": "https://affiant.dev/schemas/0.1.0/common.schema.json#/$defs/uuid"
        },
        "status": {
          "description": "What the row reads at — \"pending\" unless a Standing Order fired.",
          "$ref": "https://affiant.dev/schemas/0.1.0/docket-entry.schema.json#/$defs/status"
        },
        "card": {
          "description": "The Evidence Card the host delivers to a reviewer.",
          "$ref": "https://affiant.dev/schemas/0.1.0/evidence-card-request.schema.json"
        }
      }
    },
    "read": {
      "title": "ReadResult",
      "description": "A read tool ran and returned its own result, untouched. The gate passes a read tool straight through: there is nothing to swear to and nothing to file.",
      "type": "object",
      "additionalProperties": false,
      "required": [
        "kind",
        "result"
      ],
      "properties": {
        "kind": {
          "const": "read"
        },
        "result": {
          "description": "Whatever the tool returned. Any JSON value — the protocol says nothing about a host's read shapes.",
          "$ref": "https://affiant.dev/schemas/0.1.0/common.schema.json#/$defs/jsonValue"
        }
      }
    },
    "error": {
      "title": "ToolErrorResult",
      "description": "The call produced neither a proposal nor a result. A refusal is an ANSWER: the model is told the proposal swore to nothing, or that the tool is uncovered, and can say so.",
      "type": "object",
      "additionalProperties": false,
      "required": [
        "kind",
        "code",
        "message"
      ],
      "properties": {
        "kind": {
          "const": "error"
        },
        "code": {
          "description": "The refusal's code from the registry, or \"tool-error\" when a READ tool's own body threw — which is not a gate refusal and is deliberately not in the registry.",
          "oneOf": [
            {
              "$ref": "https://affiant.dev/schemas/0.1.0/error-code.schema.json"
            },
            {
              "const": "tool-error",
              "description": "A read tool's own body threw."
            }
          ]
        },
        "message": {
          "description": "What went wrong, in one line, for a human reading a log. Never the contract — the code is.",
          "type": "string"
        }
      }
    }
  }
};

/** Every schema, keyed by name (`"affidavit"`, `"provenance-tag"`, …). */
export const schemas: Readonly<Record<SchemaName, JsonSchemaDocument>> = {
  "affidavit-field": affidavitFieldSchema,
  "affidavit": affidavitSchema,
  "amendments": amendmentsSchema,
  "attestation": attestationSchema,
  "binding": bindingSchema,
  "blocked": blockedSchema,
  "common": commonSchema,
  "decision-result": decisionResultSchema,
  "docket-entry": docketEntrySchema,
  "entity-ref": entityRefSchema,
  "error-code": errorCodeSchema,
  "evidence-card-request": evidenceCardRequestSchema,
  "money": moneySchema,
  "notification": notificationSchema,
  "operation": operationSchema,
  "outside-gate": outsideGateSchema,
  "provenance-chain": provenanceChainSchema,
  "provenance-source": provenanceSourceSchema,
  "provenance-tag": provenanceTagSchema,
  "telemetry-key": telemetryKeySchema,
  "tool-result": toolResultSchema,
};

/**
 * Every schema, keyed by the repository-relative path the protocol's
 * `conformance/fixtures/MANIFEST.json` uses to refer to it.
 */
export const schemasByPath: Readonly<Record<string, JsonSchemaDocument>> = {
  "schemas/0.1.0/affidavit-field.schema.json": affidavitFieldSchema,
  "schemas/0.1.0/affidavit.schema.json": affidavitSchema,
  "schemas/0.1.0/amendments.schema.json": amendmentsSchema,
  "schemas/0.1.0/attestation.schema.json": attestationSchema,
  "schemas/0.1.0/binding.schema.json": bindingSchema,
  "schemas/0.1.0/blocked.schema.json": blockedSchema,
  "schemas/0.1.0/common.schema.json": commonSchema,
  "schemas/0.1.0/decision-result.schema.json": decisionResultSchema,
  "schemas/0.1.0/docket-entry.schema.json": docketEntrySchema,
  "schemas/0.1.0/entity-ref.schema.json": entityRefSchema,
  "schemas/0.1.0/error-code.schema.json": errorCodeSchema,
  "schemas/0.1.0/evidence-card-request.schema.json": evidenceCardRequestSchema,
  "schemas/0.1.0/money.schema.json": moneySchema,
  "schemas/0.1.0/notification.schema.json": notificationSchema,
  "schemas/0.1.0/operation.schema.json": operationSchema,
  "schemas/0.1.0/outside-gate.schema.json": outsideGateSchema,
  "schemas/0.1.0/provenance-chain.schema.json": provenanceChainSchema,
  "schemas/0.1.0/provenance-source.schema.json": provenanceSourceSchema,
  "schemas/0.1.0/provenance-tag.schema.json": provenanceTagSchema,
  "schemas/0.1.0/telemetry-key.schema.json": telemetryKeySchema,
  "schemas/0.1.0/tool-result.schema.json": toolResultSchema,
};

/**
 * Every schema, keyed by its `$id`. `$ref` between the schemas is by `$id`, so
 * registering all of these with a validator is what makes the references resolve.
 */
export const schemasById: Readonly<Record<string, JsonSchemaDocument>> = {
  "https://affiant.dev/schemas/0.1.0/affidavit-field.schema.json": affidavitFieldSchema,
  "https://affiant.dev/schemas/0.1.0/affidavit.schema.json": affidavitSchema,
  "https://affiant.dev/schemas/0.1.0/amendments.schema.json": amendmentsSchema,
  "https://affiant.dev/schemas/0.1.0/attestation.schema.json": attestationSchema,
  "https://affiant.dev/schemas/0.1.0/binding.schema.json": bindingSchema,
  "https://affiant.dev/schemas/0.1.0/blocked.schema.json": blockedSchema,
  "https://affiant.dev/schemas/0.1.0/common.schema.json": commonSchema,
  "https://affiant.dev/schemas/0.1.0/decision-result.schema.json": decisionResultSchema,
  "https://affiant.dev/schemas/0.1.0/docket-entry.schema.json": docketEntrySchema,
  "https://affiant.dev/schemas/0.1.0/entity-ref.schema.json": entityRefSchema,
  "https://affiant.dev/schemas/0.1.0/error-code.schema.json": errorCodeSchema,
  "https://affiant.dev/schemas/0.1.0/evidence-card-request.schema.json": evidenceCardRequestSchema,
  "https://affiant.dev/schemas/0.1.0/money.schema.json": moneySchema,
  "https://affiant.dev/schemas/0.1.0/notification.schema.json": notificationSchema,
  "https://affiant.dev/schemas/0.1.0/operation.schema.json": operationSchema,
  "https://affiant.dev/schemas/0.1.0/outside-gate.schema.json": outsideGateSchema,
  "https://affiant.dev/schemas/0.1.0/provenance-chain.schema.json": provenanceChainSchema,
  "https://affiant.dev/schemas/0.1.0/provenance-source.schema.json": provenanceSourceSchema,
  "https://affiant.dev/schemas/0.1.0/provenance-tag.schema.json": provenanceTagSchema,
  "https://affiant.dev/schemas/0.1.0/telemetry-key.schema.json": telemetryKeySchema,
  "https://affiant.dev/schemas/0.1.0/tool-result.schema.json": toolResultSchema,
};

/** Every schema, in a stable order. */
export const allSchemas: readonly JsonSchemaDocument[] = [
  affidavitFieldSchema,
  affidavitSchema,
  amendmentsSchema,
  attestationSchema,
  bindingSchema,
  blockedSchema,
  commonSchema,
  decisionResultSchema,
  docketEntrySchema,
  entityRefSchema,
  errorCodeSchema,
  evidenceCardRequestSchema,
  moneySchema,
  notificationSchema,
  operationSchema,
  outsideGateSchema,
  provenanceChainSchema,
  provenanceSourceSchema,
  provenanceTagSchema,
  telemetryKeySchema,
  toolResultSchema,
];

// ---------------------------------------------------------------------------
// The superseded 0.0.1-seed set
//
// The seed schemas describe the wire the shipped .NET framework sends: the shape
// v0.1 replaced. They are kept because that framework still sends it and a reader
// comparing the two needs both in one place — never because a v0.1 producer may
// emit one. Their `$id`s carry `0.0.1-seed`, so both sets can be registered with
// one validator without colliding.
// ---------------------------------------------------------------------------

/** The name of each superseded 0.0.1-seed schema, without the `.schema.json` suffix. */
export type SeedSchemaName =
  | "affidavit-field"
  | "affidavit"
  | "docket-expired"
  | "docket-expiring"
  | "evidence-card-request"
  | "provenance-chain"
  | "provenance-source"
  | "provenance-tag";

/** `schemas/affidavit-field.schema.json` — AffidavitField. */
export const affidavitFieldSeedSchema: JsonSchemaDocument = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://affiant.dev/schemas/0.0.1-seed/affidavit-field.schema.json",
  "title": "AffidavitField",
  "description": "One sworn field inside an affidavit: the proposed value, the value it replaces, and the full provenance chain behind it.",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "name",
    "value",
    "previousValue",
    "provenance",
    "isMandatory",
    "kind",
    "allowedValues",
    "pattern"
  ],
  "properties": {
    "name": {
      "description": "The field's name on the target entity. Also the key used by the amendment maps.",
      "type": "string"
    },
    "value": {
      "description": "The proposed value. Any JSON value, including null — the .NET model types this as a nullable object, so no type constraint applies."
    },
    "previousValue": {
      "description": "The value being replaced. Any JSON value, including null; null for a create operation, and also for a field that had no previous value."
    },
    "provenance": {
      "$ref": "https://affiant.dev/schemas/0.0.1-seed/provenance-chain.schema.json"
    },
    "isMandatory": {
      "description": "Whether the target entity requires this field.",
      "type": "boolean"
    },
    "kind": {
      "description": "Rendering hint for a reviewer surface. A plain string on the wire, not a serialized enum, but drawn from a fixed set defined once in the framework.",
      "type": "string",
      "enum": [
        "text",
        "number",
        "date",
        "enum"
      ]
    },
    "allowedValues": {
      "description": "The closed set a reviewer may pick from when kind is \"enum\"; null otherwise.",
      "type": [
        "array",
        "null"
      ],
      "items": {
        "type": "string"
      }
    },
    "pattern": {
      "description": "A regular expression the value must satisfy, or null when the field is unconstrained.",
      "type": [
        "string",
        "null"
      ]
    }
  }
};

/** `schemas/affidavit.schema.json` — Affidavit. */
export const affidavitSeedSchema: JsonSchemaDocument = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://affiant.dev/schemas/0.0.1-seed/affidavit.schema.json",
  "title": "Affidavit",
  "description": "The sworn evidence record for one proposed write. Every write an agent proposes — create, update or delete — is wrapped in one of these, carrying per-field provenance, before any person sees it and before anything is committed.",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "operationType",
    "entityType",
    "entityId",
    "fields",
    "aggregateConfidence",
    "warnings",
    "requiresConfirmation"
  ],
  "properties": {
    "operationType": {
      "description": "The operation being proposed, named by the host's own operation vocabulary (e.g. \"WriteUpdate\"). An open string, not a closed set, in this seed.",
      "type": "string"
    },
    "entityType": {
      "description": "The kind of domain entity being written, named by the host.",
      "type": "string"
    },
    "entityId": {
      "description": "The identifier of the entity being written; null for a create operation, where no identifier exists yet.",
      "type": [
        "string",
        "null"
      ]
    },
    "fields": {
      "description": "The sworn fields. Not nullable — an empty array, never null.",
      "type": "array",
      "items": {
        "$ref": "https://affiant.dev/schemas/0.0.1-seed/affidavit-field.schema.json"
      }
    },
    "aggregateConfidence": {
      "description": "Confidence across the whole affidavit, 0.0 to 1.0. Single-precision float in the .NET wire; not nullable.",
      "type": "number",
      "minimum": 0,
      "maximum": 1
    },
    "warnings": {
      "description": "Human-readable warnings a reviewer should see. Not nullable — an empty array, never null.",
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "requiresConfirmation": {
      "description": "Whether a person must confirm this write before it commits.",
      "type": "boolean"
    }
  }
};

/** `schemas/docket-expired.schema.json` — DocketExpiredNotification. */
export const docketExpiredSeedSchema: JsonSchemaDocument = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://affiant.dev/schemas/0.0.1-seed/docket-expired.schema.json",
  "title": "DocketExpiredNotification",
  "description": "Sent when a pending docket entry has lapsed without a reviewer decision. The write it carried is not committed.",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "docketId"
  ],
  "properties": {
    "docketId": {
      "description": "The docket entry that expired. A UUID string.",
      "type": "string",
      "format": "uuid"
    }
  }
};

/** `schemas/docket-expiring.schema.json` — DocketExpiringNotification. */
export const docketExpiringSeedSchema: JsonSchemaDocument = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://affiant.dev/schemas/0.0.1-seed/docket-expiring.schema.json",
  "title": "DocketExpiringNotification",
  "description": "Sent when a pending docket entry is approaching its deadline. A producer re-sends this on every sweep while the entry stays inside the warning window, so a consumer must treat repeats for the same docketId as idempotent — key a countdown off expiresAt rather than counting notifications.",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "docketId",
    "expiresAt"
  ],
  "properties": {
    "docketId": {
      "description": "The docket entry approaching expiry. A UUID string.",
      "type": "string",
      "format": "uuid"
    },
    "expiresAt": {
      "description": "When the entry expires. An RFC 3339 date-time with an explicit offset.",
      "type": "string",
      "format": "date-time"
    }
  }
};

/** `schemas/evidence-card-request.schema.json` — EvidenceCardRequest. */
export const evidenceCardRequestSeedSchema: JsonSchemaDocument = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://affiant.dev/schemas/0.0.1-seed/evidence-card-request.schema.json",
  "title": "EvidenceCardRequest",
  "description": "The envelope that carries an affidavit to a reviewer surface: the docket entry it is filed under, the affidavit itself, the deadline, and — on a resubmission — the amendments already made on the expired original. A producer may send the same request for the same docketId more than once; a consumer must treat a repeat as the same card, updating in place rather than adding a second one.",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "docketId",
    "affidavit",
    "requiredBy",
    "priorAmendments"
  ],
  "properties": {
    "docketId": {
      "description": "The docket entry this card is filed under. A UUID string.",
      "type": "string",
      "format": "uuid"
    },
    "affidavit": {
      "$ref": "https://affiant.dev/schemas/0.0.1-seed/affidavit.schema.json"
    },
    "requiredBy": {
      "description": "When the review window closes. An RFC 3339 date-time with an explicit offset.",
      "type": "string",
      "format": "date-time"
    },
    "priorAmendments": {
      "description": "Set only when this card resubmits a review that expired: the amendments a reviewer made on the original entry, keyed by field name, so the next reviewer can see what was already agreed. A null value under a key means the reviewer explicitly cleared that field, which is distinct from the key being absent. Null for a first filing.",
      "type": [
        "object",
        "null"
      ],
      "additionalProperties": {
        "description": "The reviewer's replacement value for the named field. Any JSON value, including null."
      }
    }
  }
};

/** `schemas/provenance-chain.schema.json` — ProvenanceChain. */
export const provenanceChainSeedSchema: JsonSchemaDocument = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://affiant.dev/schemas/0.0.1-seed/provenance-chain.schema.json",
  "title": "ProvenanceChain",
  "description": "The ordered provenance history of a single field: the tag in force now, plus every superseded tag, newest first. This is the audit trail that answers \"how did this field arrive at its current value?\".",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "current",
    "prior"
  ],
  "properties": {
    "current": {
      "description": "The tag in force for this field's current value.",
      "$ref": "https://affiant.dev/schemas/0.0.1-seed/provenance-tag.schema.json"
    },
    "prior": {
      "description": "Superseded tags, newest first. Empty for a chain that has never been merged or appended to. Not nullable — an empty array, never null.",
      "type": "array",
      "items": {
        "$ref": "https://affiant.dev/schemas/0.0.1-seed/provenance-tag.schema.json"
      }
    }
  }
};

/** `schemas/provenance-source.schema.json` — ProvenanceSource. */
export const provenanceSourceSeedSchema: JsonSchemaDocument = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://affiant.dev/schemas/0.0.1-seed/provenance-source.schema.json",
  "title": "ProvenanceSource",
  "description": "Where a field value came from. Serialized as the member name, not an integer. The order below is the determinism hierarchy, most deterministic first: when two provenance tags carry equal confidence, the earlier member in this list wins the merge.",
  "type": "string",
  "enum": [
    "UserStated",
    "External",
    "Computed",
    "Conversation",
    "Inferred",
    "Default",
    "Empty"
  ]
};

/** `schemas/provenance-tag.schema.json` — ProvenanceTag. */
export const provenanceTagSeedSchema: JsonSchemaDocument = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://affiant.dev/schemas/0.0.1-seed/provenance-tag.schema.json",
  "title": "ProvenanceTag",
  "description": "One provenance record for one field value: where the value came from, how confident the producer is in it, a human-readable explanation, and which conversation turn produced it. A field whose provenance is unknown carries a tag with source \"Empty\" rather than no tag at all.",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "source",
    "confidence",
    "evidence",
    "conversationTurn"
  ],
  "properties": {
    "source": {
      "$ref": "https://affiant.dev/schemas/0.0.1-seed/provenance-source.schema.json"
    },
    "confidence": {
      "description": "Confidence in the value, 0.0 to 1.0. Single-precision float in the .NET wire; not nullable.",
      "type": "number",
      "minimum": 0,
      "maximum": 1
    },
    "evidence": {
      "description": "Human-readable explanation of how the value was obtained, e.g. \"User stated: Status\". Null when there is nothing to say.",
      "type": [
        "string",
        "null"
      ]
    },
    "conversationTurn": {
      "description": "Index of the conversation turn that produced the value, or null when the value did not come from a turn.",
      "type": [
        "integer",
        "null"
      ]
    }
  }
};

/** Every superseded 0.0.1-seed schema, keyed by name (`"affidavit"`, `"provenance-tag"`, …). */
export const seedSchemas: Readonly<Record<SeedSchemaName, JsonSchemaDocument>> = {
  "affidavit-field": affidavitFieldSeedSchema,
  "affidavit": affidavitSeedSchema,
  "docket-expired": docketExpiredSeedSchema,
  "docket-expiring": docketExpiringSeedSchema,
  "evidence-card-request": evidenceCardRequestSeedSchema,
  "provenance-chain": provenanceChainSeedSchema,
  "provenance-source": provenanceSourceSeedSchema,
  "provenance-tag": provenanceTagSeedSchema,
};

/**
 * Every superseded 0.0.1-seed schema, keyed by the repository-relative path the protocol's
 * `conformance/fixtures/MANIFEST.json` uses to refer to it.
 */
export const seedSchemasByPath: Readonly<Record<string, JsonSchemaDocument>> = {
  "schemas/affidavit-field.schema.json": affidavitFieldSeedSchema,
  "schemas/affidavit.schema.json": affidavitSeedSchema,
  "schemas/docket-expired.schema.json": docketExpiredSeedSchema,
  "schemas/docket-expiring.schema.json": docketExpiringSeedSchema,
  "schemas/evidence-card-request.schema.json": evidenceCardRequestSeedSchema,
  "schemas/provenance-chain.schema.json": provenanceChainSeedSchema,
  "schemas/provenance-source.schema.json": provenanceSourceSeedSchema,
  "schemas/provenance-tag.schema.json": provenanceTagSeedSchema,
};

/**
 * Every superseded 0.0.1-seed schema, keyed by its `$id`. `$ref` between the schemas is by `$id`, so
 * registering all of these with a validator is what makes the references resolve.
 */
export const seedSchemasById: Readonly<Record<string, JsonSchemaDocument>> = {
  "https://affiant.dev/schemas/0.0.1-seed/affidavit-field.schema.json": affidavitFieldSeedSchema,
  "https://affiant.dev/schemas/0.0.1-seed/affidavit.schema.json": affidavitSeedSchema,
  "https://affiant.dev/schemas/0.0.1-seed/docket-expired.schema.json": docketExpiredSeedSchema,
  "https://affiant.dev/schemas/0.0.1-seed/docket-expiring.schema.json": docketExpiringSeedSchema,
  "https://affiant.dev/schemas/0.0.1-seed/evidence-card-request.schema.json": evidenceCardRequestSeedSchema,
  "https://affiant.dev/schemas/0.0.1-seed/provenance-chain.schema.json": provenanceChainSeedSchema,
  "https://affiant.dev/schemas/0.0.1-seed/provenance-source.schema.json": provenanceSourceSeedSchema,
  "https://affiant.dev/schemas/0.0.1-seed/provenance-tag.schema.json": provenanceTagSeedSchema,
};

/** Every superseded 0.0.1-seed schema, in a stable order. */
export const allSeedSchemas: readonly JsonSchemaDocument[] = [
  affidavitFieldSeedSchema,
  affidavitSeedSchema,
  docketExpiredSeedSchema,
  docketExpiringSeedSchema,
  evidenceCardRequestSeedSchema,
  provenanceChainSeedSchema,
  provenanceSourceSeedSchema,
  provenanceTagSeedSchema,
];
