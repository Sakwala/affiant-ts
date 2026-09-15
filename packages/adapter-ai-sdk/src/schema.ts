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
  readonly type?: string;
  readonly description?: string;
  readonly properties?: { readonly [name: string]: JsonSchemaObject };
  readonly required?: readonly string[];
  readonly additionalProperties?: boolean;
  readonly enum?: readonly string[];
  readonly format?: string;
  readonly minimum?: number;
  readonly maximum?: number;
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
        principal: { type: "object" },
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
      required: ["conversationId", "tenantId", "channel", "turn"],
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

/**
 * Check a host-supplied model schema against the field schema it must describe, and
 * refuse it at wire-up when it does not (CV-1, AF-1).
 *
 * The check is flatness and identity of names, nothing more: the property *shapes*
 * are the host's business — a host that wants a tighter pattern or a longer
 * description than the derived schema carries is the reason this override exists.
 * What it may not do is propose a field the Affidavit has no place for, or leave one
 * of the declared fields unreachable.
 *
 * @throws AffiantError `"wireup-invalid"`, naming the tool and the mismatch.
 */
export function assertMatchesFields(
  supplied: JsonSchemaObject,
  schema: FieldSchema,
  toolName: string,
): void {
  const declared = schema.fields.map((entry) => entry.name);
  if (supplied.type !== "object" || supplied.properties === undefined) {
    throw new AffiantError(
      "wireup-invalid",
      `CV-1: the model input schema supplied for ${JSON.stringify(toolName)} is not a flat ` +
        `object with properties. An Affidavit is sworn per field, so the schema the model ` +
        `fills has one property per declared field: ${declared.join(", ")}.`,
      { toolName },
    );
  }
  const supplied_ = Object.keys(supplied.properties).sort();
  const declared_ = [...declared].sort();
  if (supplied_.length !== declared_.length || supplied_.some((n, i) => n !== declared_[i])) {
    throw new AffiantError(
      "wireup-invalid",
      `CV-1: the model input schema supplied for ${JSON.stringify(toolName)} names ` +
        `${supplied_.join(", ") || "no properties"}, and the field schema declares ` +
        `${declared_.join(", ") || "no fields"}. They must be the same set: a property the ` +
        `field schema does not name has no place on the Affidavit, and a field the schema ` +
        `does not offer can never be proposed.`,
      { toolName },
    );
  }
}
