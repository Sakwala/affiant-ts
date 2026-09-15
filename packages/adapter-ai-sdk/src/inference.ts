/**
 * `@affiant/adapter-ai-sdk/inference` — the gate's structured-inference port, built
 * on the AI SDK's structured output.
 *
 * **Rules served: GT-1** (step 3 is one tool-free structured inference over the
 * unmodified turn), **PV-3** (an implementation's own inference never mints
 * `UserStated`; what this port reports about presence is a *hint* the gate verifies
 * against the utterance itself), **AF-1** (a field the model could not fill comes
 * back **absent**, not `null` — absent means "not proposed" and `null` is a value).
 *
 * ## Why this is here and not in the gate
 *
 * `@affiant/core` ships no model client by rule: the host owns the model, the prompt
 * and the cost. But every host wiring an agent through this adapter already has a
 * `LanguageModel` in hand, and writing the mapping from a model's structured output
 * to a {@link StructuredResult} is work each of them would otherwise redo. So it
 * lives here, in the package that already depends on the SDK, and it stays
 * provider-neutral: it takes whatever model the host passes and depends on no
 * provider package.
 *
 * ## Tool-free, on purpose
 *
 * The call this port makes has no tools. The model is asked for **values**, never for
 * an action, so nothing it returns can execute. That is what makes the inference step
 * safe to run before a proposal has been through the policy chain.
 *
 * @packageDocumentation
 */

import type {
  FieldSchema,
  InferencePort,
  JsonValue,
  StructuredField,
  StructuredResult,
  Turn,
} from "@affiant/core";
import type { LanguageModel } from "ai";
import { generateText, jsonSchema, Output } from "ai";

import { inferenceSchemaOf } from "./schema.js";

/** What {@link createInferencePort} lets a host vary. */
export interface InferencePortOptions {
  /** The model the host wants the extraction run against. Any `LanguageModel` the SDK accepts. */
  readonly model: LanguageModel;
  /**
   * What the model is told about the job, beside the schema. Defaults to a sentence
   * that says: fill what the message actually says, and leave the rest out.
   */
  readonly instructions?: string;
  /** Sampling temperature. Defaults to the provider's own, which for extraction is usually what you want low. */
  readonly temperature?: number;
}

/** The default instruction: extract, do not invent, and say nothing about what is not there. */
const DEFAULT_INSTRUCTIONS =
  "Extract the requested fields from the message. Fill only the fields the message " +
  "actually supports, and omit every field it does not — an omitted field is read as " +
  '"not proposed". For each field you fill, give your confidence from 0 to 1, and say ' +
  'whether the value is "literal" (the words are in the message) or "inferred".';

/** One field as the model reported it, before anything is trusted. */
interface ReportedField {
  readonly value?: unknown;
  readonly confidence?: unknown;
  readonly presence?: unknown;
}

/** Whether `value` is a number the gate can read as a confidence. */
function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Whether `value` is one of the two presence hints, or absent. */
function presenceOf(value: unknown): "literal" | "inferred" | undefined {
  return value === "literal" || value === "inferred" ? value : undefined;
}

/**
 * Whether the model reported a value at all.
 *
 * `undefined` is nothing reported. Everything else is passed on as reported and the
 * gate decides what it means: `null`, an object, an array, the empty string and a
 * non-finite number are all "nothing reported for this field" under PV-3, and the
 * pipeline — not this port — is where that judgement belongs, so that a port cannot
 * quietly widen or narrow it.
 */
function reported(field: ReportedField): boolean {
  return field.value !== undefined;
}

/**
 * Build an {@link InferencePort} that runs one tool-free structured call per
 * inference against `options.model`.
 *
 * The returned port is stateless and holds nothing between calls: the turn and the
 * schema are its only inputs, and two turns running through it concurrently share
 * nothing (GT-2's reason, applied to a port).
 */
export function createInferencePort(options: InferencePortOptions): InferencePort {
  const instructions = options.instructions ?? DEFAULT_INSTRUCTIONS;
  const temperature = options.temperature;

  return {
    async infer(turn: Turn, schema: FieldSchema): Promise<StructuredResult> {
      const result = await generateText({
        model: options.model,
        instructions,
        ...(temperature === undefined ? {} : { temperature }),
        // The turn, verbatim as the host received it. Nothing is prepended to it and
        // nothing is stripped from it: what the Affidavit swears to has to be
        // traceable to what the person actually wrote.
        prompt: turn.utterance,
        output: Output.object({
          schema: jsonSchema<Record<string, ReportedField>>(
            inferenceSchemaOf(schema) as Parameters<typeof jsonSchema>[0],
          ),
        }),
      });

      const reportedFields = result.output;
      const fields: { [fieldName: string]: StructuredField } = {};
      if (typeof reportedFields === "object" && reportedFields !== null) {
        for (const entry of schema.fields) {
          const field = (reportedFields as Record<string, ReportedField | undefined>)[entry.name];
          if (field === undefined || typeof field !== "object" || field === null) continue;
          if (!reported(field)) continue;
          const presence = presenceOf(field.presence);
          fields[entry.name] = {
            value: field.value as JsonValue,
            // Out of range or not a number at all reads as no confidence rather than
            // a confident nothing. The pipeline clamps whatever arrives (PV-1); this
            // is the floor for a port that answered with prose.
            confidence: isFiniteNumber(field.confidence) ? field.confidence : 0,
            ...(presence === undefined ? {} : { presence }),
          };
        }
      }
      return { fields };
    },
  };
}
