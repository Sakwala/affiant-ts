/**
 * Turning an Affiant {@link FieldSchema} into the JSON Schema the model is shown.
 *
 * **Rules served: GT-2** (the turn-context schema below is the shape the SDK
 * validates a per-call context against, so a seam that supplies nothing is refused
 * rather than defaulted), **CV-1** (a host-supplied model schema that does not match
 * the field schema is refused at wire-up).
 *
 * An Affidavit is sworn **per field**: every field carries its own value, the value
 * it replaces, where the value came from and how confident the producer is. A nested
 * model-facing schema has no such shape — there is no field to swear to under
 * `order.lines[2].price`. So the model-facing schema this module derives is flat by
 * construction, and a host that supplies its own is held to the same flatness.
 *
 * @packageDocumentation
 */

import type { FieldSchema, FieldSchemaEntry } from "@affiant/core";
import { AffiantError } from "@affiant/core";

/**
 * A JSON Schema document, as much of it as this package writes or reads.
 *
 * Deliberately not `JSONSchema7` from the `json-schema` package: that type arrives
 * through the AI SDK's own dependencies, and a published surface that named it would
 * make a transitive type a part of this package's API.
 */
export interface JsonSchemaObject {
  readonly type?: string | readonly string[];
  readonly description?: string;
  readonly properties?: { readonly [name: string]: JsonSchemaObject };
  readonly items?: JsonSchemaObject;
  readonly required?: readonly string[];
  readonly additionalProperties?: boolean;
  readonly enum?: readonly (string | number | boolean | null)[];
  readonly format?: string;
  readonly minimum?: number;
  readonly maximum?: number;
  /**
   * Any other JSON Schema keyword. A schema is an open document and a host may carry
   * whatever its own tooling emits; what {@link assertMatchesFields} does with the
   * keywords it does not recognise is refuse the ones that would stop a property being
   * one scalar value.
   */
  readonly [keyword: string]: unknown;
}

/**
 * The JSON Schema for the per-call context every gated tool declares — `{ turn }`,
 * where `turn` is the host's {@link TurnContext} (GT-2).
 *
 * It is exported so a host can read what the adapter asks for, and it is what
 * `contextSchema` is built from. The nested `turn` object is described down to the
 * five properties the gate reads, so a context that is missing one fails the schema
 * at the call rather than somewhere inside the pipeline.
 */
export const TURN_CONTEXT_SCHEMA: JsonSchemaObject = {
  type: "object",
  description: "The Affiant turn context this tool call runs under (GT-2).",
  properties: {
    turn: {
      type: "object",
      description: "Conversation, tenant, channel, principal and the unmodified turn.",
      properties: {
        conversationId: { type: "string" },
        tenantId: { type: "string" },
        channel: { type: "string" },
        // Present, and `null` when the host has not resolved an identity — so the
        // property is required and carries no `type`, which would exclude `null`.
        principal: { description: "Who is acting, or null when unresolved." },
        turn: {
          type: "object",
          properties: {
            utterance: { type: "string" },
            messageId: { type: "string" },
            at: { type: "string" },
          },
          required: ["utterance", "messageId", "at"],
        },
      },
      required: ["conversationId", "tenantId", "channel", "principal", "turn"],
    },
  },
  required: ["turn"],
};

/** One field's model-facing schema, by the kind the host declared. */
function fieldSchema(entry: FieldSchemaEntry): JsonSchemaObject {
  const described = entry.description === null ? {} : { description: entry.description };
  switch (entry.kind) {
    case "number":
      return { type: "number", ...described };
    case "date":
      // `format` is a hint to the provider, not a constraint this package enforces:
      // the gate records what was proposed and a reviewer amends it (AF-1).
      return { type: "string", format: "date", ...described };
    case "enum":
      return {
        type: "string",
        ...described,
        ...(entry.allowedValues === null ? {} : { enum: [...entry.allowedValues] }),
      };
    case "text":
      return { type: "string", ...described };
  }
}

/**
 * The model-facing input schema derived from `schema` — one flat object, one property
 * per field, the host's `required` honoured.
 *
 * `additionalProperties: false` because a property the field schema does not name is
 * a value no Affidavit would carry: the pipeline swears to the fields the operation
 * proposes, and a stray one would be dropped silently.
 */
export function inputSchemaOf(schema: FieldSchema): JsonSchemaObject {
  const properties: { [name: string]: JsonSchemaObject } = {};
  const required: string[] = [];
  for (const entry of schema.fields) {
    properties[entry.name] = fieldSchema(entry);
    if (entry.required) required.push(entry.name);
  }
  return {
    type: "object",
    description: `The fields of the ${schema.entityType} being proposed.`,
    properties,
    required,
    additionalProperties: false,
  };
}

/**
 * The schema one structured inference asks the model to fill: per field, the value,
 * a confidence between `0` and `1`, and an optional presence hint (GT-1 step 3, PV-3).
 *
 * Nothing is required at the top level. A field the model cannot fill must be able to
 * come back **absent**, because absent and `null` are different facts: absent is "not
 * proposed" and is left out of the Affidavit, `null` is a value the gate reads as
 * nothing reported (AF-1, PV-3).
 */
export function inferenceSchemaOf(schema: FieldSchema): JsonSchemaObject {
  const properties: { [name: string]: JsonSchemaObject } = {};
  for (const entry of schema.fields) {
    properties[entry.name] = {
      type: "object",
      ...(entry.description === null ? {} : { description: entry.description }),
      properties: {
        value: fieldSchema(entry),
        confidence: {
          type: "number",
          description: "How confident you are in this value, from 0 to 1.",
          minimum: 0,
          maximum: 1,
        },
        presence: {
          type: "string",
          description: "Whether the value is literally in the message, or was inferred from it.",
          enum: ["literal", "inferred"],
        },
      },
      required: ["value", "confidence"],
      additionalProperties: false,
    };
  }
  return {
    type: "object",
    description: `The ${schema.entityType} fields you can fill from the message. Omit any you cannot.`,
    properties,
    required: [],
    additionalProperties: false,
  };
}

/** The `type` values a single sworn field can carry. */
const SCALAR_TYPES: readonly string[] = ["string", "number", "integer", "boolean"];

/**
 * The keywords that make a property's shape something other than one scalar, or
 * something this check cannot see from here.
 */
const NOT_SCALAR_KEYWORDS: readonly string[] = [
  "$ref",
  "$dynamicRef",
  "$defs",
  "definitions",
  "oneOf",
  "anyOf",
  "allOf",
  "not",
  "if",
  "then",
  "else",
  "properties",
  "patternProperties",
  "propertyNames",
  "dependentSchemas",
  "dependentRequired",
  "items",
  "prefixItems",
  "contains",
  "unevaluatedItems",
];

/** Whether `value` is a scalar an `enum` may offer. */
function isScalarValue(value: unknown): boolean {
  return (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    value === null
  );
}

/**
 * Why `property` is not one scalar value, or `null` when it is.
 *
 * The admission is positive: something has to say "this is a string" or "this is one
 * of these values", and nothing may say the shape is settled elsewhere.
 */
function scalarFault(property: JsonSchemaObject): string | null {
  for (const keyword of NOT_SCALAR_KEYWORDS) {
    if (Object.prototype.hasOwnProperty.call(property, keyword)) {
      return `with \`${keyword}\`, which puts its shape somewhere this check cannot see.`;
    }
  }

  const type = property.type;
  const enumerated = property.enum;
  const constant: unknown = property["const"];

  if (Array.isArray(type)) {
    // `["string", "null"]` is 2020-12's nullable string. One kind plus `null` is still
    // one kind: a `null` value is nothing reported for the field (AF-1), not a second
    // sort of thing to swear to.
    const kinds = type.filter((each) => each !== "null");
    if (kinds.length !== 1 || !SCALAR_TYPES.includes(String(kinds[0]))) {
      return (
        `with a list of types (${type.map((each) => String(each)).join(", ")}); a sworn field ` +
        `is one value of one kind, optionally nullable.`
      );
    }
    return null;
  }
  if (type !== undefined && (typeof type !== "string" || !SCALAR_TYPES.includes(type))) {
    return `as \`${String(type)}\`; a sworn field is one of ${SCALAR_TYPES.join(", ")}.`;
  }
  if (enumerated !== undefined) {
    if (!Array.isArray(enumerated) || enumerated.length === 0) {
      return "with an `enum` that is not a non-empty list of values.";
    }
    if (!enumerated.every(isScalarValue)) {
      return "with an `enum` offering something other than scalar values.";
    }
    return null;
  }
  if (Object.prototype.hasOwnProperty.call(property, "const")) {
    return isScalarValue(constant)
      ? null
      : "with a `const` that is not a scalar value; a sworn field is one value.";
  }
  if (type === undefined) {
    return "without a `type`, an `enum` or a `const`, so nothing says it is one scalar value.";
  }
  return null;
}

/**
 * Check a host-supplied model schema against the field schema it must describe, and
 * refuse it at wire-up when it does not (CV-1, AF-1).
 *
 * Three things are checked, and each of them is a proposal the Affidavit could not
 * carry rather than a matter of taste:
 *
 * - the schema is an **object with properties**, and every property is a **scalar**;
 * - the property names are **exactly** the declared field names: one the field schema
 *   does not name has no place on the Affidavit, and a field the model is never
 *   offered can never be proposed;
 * - every entry of `required` **names a declared field**, so a schema cannot insist on
 *   a property it does not have.
 *
 * ## What "scalar" is allowed to mean, stated positively
 *
 * A field is one value with one provenance tag. There is no field to swear to under
 * `lines[2].price`, and a property whose shape is decided somewhere else in the
 * document — by a `$ref`, by an `anyOf` branch — is a property whose shape this check
 * cannot see. A list of the ways to smuggle an object past a check is never finished,
 * so the rule is the other way round: a property is admitted when it **is** a scalar
 * and refused otherwise.
 *
 * Admitted: a `type` of exactly `"string"`, `"number"`, `"integer"` or `"boolean"`; the
 * same as a one-element list, with `"null"` allowed beside it (`["string", "null"]` is
 * how 2020-12 spells a nullable string, and a field that reads `null` is a field the
 * gate records as nothing reported — AF-1); an `enum` of scalar values; or a `const`
 * that is a scalar. Refused: nothing that says what the value is, a list naming more
 * than one kind, any other `type`, and the composition, reference and sub-schema
 * keywords — `$ref`, `oneOf`, `anyOf`, `allOf`, `not`, `if`/`then`/`else`,
 * `properties`, `patternProperties`, `propertyNames`, `dependentSchemas`, `items`,
 * `prefixItems`, `contains`, `unevaluatedItems`, `$defs`, `definitions`.
 *
 * `additionalProperties` and `unevaluatedProperties` are **ignored** on a property that
 * is otherwise a scalar. They constrain the members of an object and a scalar has none,
 * so on `{ "type": "string", "additionalProperties": false }` they say nothing at all —
 * and a property that really is an object is already refused by its `type` or by
 * `properties`. Refusing a keyword that changes nothing would mean telling a host its
 * schema describes an object when it does not.
 *
 * What is *not* checked is anything that only narrows a scalar: a `pattern`, a
 * `format`, a `minimum`, a longer `description` or a shorter `enum` than the derived
 * schema carries is the reason this override exists.
 *
 * @throws AffiantError `"wireup-invalid"`, naming the tool and the mismatch.
 */
export function assertMatchesFields(
  supplied: JsonSchemaObject,
  schema: FieldSchema,
  toolName: string,
): void {
  const declared = schema.fields.map((entry) => entry.name);
  const refuse = (what: string): never => {
    throw new AffiantError(
      "wireup-invalid",
      `CV-1: the model input schema supplied for ${JSON.stringify(toolName)} ${what} An ` +
        `Affidavit is sworn per field, so the schema the model fills is one flat object with ` +
        `one scalar property per declared field: ${declared.join(", ") || "(none declared)"}.`,
      { toolName },
    );
  };

  if (supplied.type !== "object" || supplied.properties === undefined) {
    refuse("is not a flat object with properties.");
  }
  const properties = supplied.properties ?? {};

  const supplied_ = Object.keys(properties).sort();
  const declared_ = [...declared].sort();
  if (supplied_.length !== declared_.length || supplied_.some((n, i) => n !== declared_[i])) {
    refuse(
      `names ${supplied_.join(", ") || "no properties"}, and the field schema declares ` +
        `${declared_.join(", ") || "no fields"}. They must be the same set.`,
    );
  }

  for (const name of supplied_) {
    const property = properties[name];
    if (property === undefined) continue;
    const fault = scalarFault(property);
    if (fault !== null) refuse(`describes ${JSON.stringify(name)} ${fault}`);
  }

  for (const name of supplied.required ?? []) {
    if (!declared.includes(name)) {
      refuse(`requires ${JSON.stringify(name)}, which the field schema does not declare.`);
    }
  }
}
