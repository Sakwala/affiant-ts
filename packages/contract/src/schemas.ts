// GENERATED FILE — DO NOT EDIT BY HAND.
// Produced by scripts/generate-sources.mjs from protocol/, which is a byte-for-byte
// copy of Sakwala/affiant-protocol at tag v0.0.1-seed.
// Source: protocol/schemas/*.schema.json
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
  | "docket-expired"
  | "docket-expiring"
  | "evidence-card-request"
  | "provenance-chain"
  | "provenance-source"
  | "provenance-tag";

/** `schemas/affidavit-field.schema.json` — AffidavitField. */
export const affidavitFieldSchema: JsonSchemaDocument = {
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
export const affidavitSchema: JsonSchemaDocument = {
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
export const docketExpiredSchema: JsonSchemaDocument = {
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
export const docketExpiringSchema: JsonSchemaDocument = {
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
export const evidenceCardRequestSchema: JsonSchemaDocument = {
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
export const provenanceChainSchema: JsonSchemaDocument = {
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
export const provenanceSourceSchema: JsonSchemaDocument = {
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
export const provenanceTagSchema: JsonSchemaDocument = {
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

/** Every schema, keyed by name (`"affidavit"`, `"provenance-tag"`, …). */
export const schemas: Readonly<Record<SchemaName, JsonSchemaDocument>> = {
  "affidavit-field": affidavitFieldSchema,
  "affidavit": affidavitSchema,
  "docket-expired": docketExpiredSchema,
  "docket-expiring": docketExpiringSchema,
  "evidence-card-request": evidenceCardRequestSchema,
  "provenance-chain": provenanceChainSchema,
  "provenance-source": provenanceSourceSchema,
  "provenance-tag": provenanceTagSchema,
};

/**
 * Every schema, keyed by the repository-relative path the protocol's
 * `conformance/fixtures/MANIFEST.json` uses to refer to it.
 */
export const schemasByPath: Readonly<Record<string, JsonSchemaDocument>> = {
  "schemas/affidavit-field.schema.json": affidavitFieldSchema,
  "schemas/affidavit.schema.json": affidavitSchema,
  "schemas/docket-expired.schema.json": docketExpiredSchema,
  "schemas/docket-expiring.schema.json": docketExpiringSchema,
  "schemas/evidence-card-request.schema.json": evidenceCardRequestSchema,
  "schemas/provenance-chain.schema.json": provenanceChainSchema,
  "schemas/provenance-source.schema.json": provenanceSourceSchema,
  "schemas/provenance-tag.schema.json": provenanceTagSchema,
};

/**
 * Every schema, keyed by its `$id`. `$ref` between the schemas is by `$id`, so
 * registering all of these with a validator is what makes the references resolve.
 */
export const schemasById: Readonly<Record<string, JsonSchemaDocument>> = {
  "https://affiant.dev/schemas/0.0.1-seed/affidavit-field.schema.json": affidavitFieldSchema,
  "https://affiant.dev/schemas/0.0.1-seed/affidavit.schema.json": affidavitSchema,
  "https://affiant.dev/schemas/0.0.1-seed/docket-expired.schema.json": docketExpiredSchema,
  "https://affiant.dev/schemas/0.0.1-seed/docket-expiring.schema.json": docketExpiringSchema,
  "https://affiant.dev/schemas/0.0.1-seed/evidence-card-request.schema.json": evidenceCardRequestSchema,
  "https://affiant.dev/schemas/0.0.1-seed/provenance-chain.schema.json": provenanceChainSchema,
  "https://affiant.dev/schemas/0.0.1-seed/provenance-source.schema.json": provenanceSourceSchema,
  "https://affiant.dev/schemas/0.0.1-seed/provenance-tag.schema.json": provenanceTagSchema,
};

/** Every schema, in a stable order. */
export const allSchemas: readonly JsonSchemaDocument[] = [
  affidavitFieldSchema,
  affidavitSchema,
  docketExpiredSchema,
  docketExpiringSchema,
  evidenceCardRequestSchema,
  provenanceChainSchema,
  provenanceSourceSchema,
  provenanceTagSchema,
];
