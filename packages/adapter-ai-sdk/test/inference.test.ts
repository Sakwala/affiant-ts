/**
 * The inference port: one tool-free structured call, mapped to a `StructuredResult`.
 *
 * The distinction the suite exists for is **absent versus `null`**. A field the model
 * did not fill has to come back absent, because absent means "not proposed" and is
 * left out of the Affidavit, while `null` is a value the gate reads as nothing
 * reported for a field that *was* proposed (AF-1, PV-3).
 */

import { describe, expect, it } from "vitest";

import { createInferencePort } from "../src/inference.js";

import { schemaFor, structuredModel, AT } from "./support.js";

const TURN = { utterance: "Set the ticket priority to High", messageId: "msg-1", at: AT };
const SCHEMA = schemaFor("Ticket", ["priority", "assignee", "due"]);

describe("createInferencePort", () => {
  it("maps a filled field to a value, a confidence and a presence hint", async () => {
    const port = createInferencePort({
      model: structuredModel({
        priority: { value: "High", confidence: 0.82, presence: "literal" },
      }),
    });

    const result = await port.infer(TURN, SCHEMA);

    expect(result.fields["priority"]).toEqual({
      value: "High",
      confidence: 0.82,
      presence: "literal",
    });
  });

  it("leaves a field the model did not fill absent, not null", async () => {
    const port = createInferencePort({
      model: structuredModel({ priority: { value: "High", confidence: 1 } }),
    });

    const result = await port.infer(TURN, SCHEMA);

    expect(Object.keys(result.fields)).toEqual(["priority"]);
    expect("assignee" in result.fields).toBe(false);
    expect("due" in result.fields).toBe(false);
  });

  it("carries a reported null through rather than deciding what it means", async () => {
    const port = createInferencePort({
      model: structuredModel({ assignee: { value: null, confidence: 0.4 } }),
    });

    const result = await port.infer(TURN, SCHEMA);

    expect(result.fields["assignee"]).toEqual({ value: null, confidence: 0.4 });
  });

  it("omits the presence hint when the model reported none or reported nonsense", async () => {
    const port = createInferencePort({
      model: structuredModel({
        priority: { value: "High", confidence: 0.5 },
        due: { value: "2026-10-01", confidence: 0.5, presence: "guessed" },
      }),
    });

    const result = await port.infer(TURN, SCHEMA);

    expect("presence" in (result.fields["priority"] ?? {})).toBe(false);
    expect("presence" in (result.fields["due"] ?? {})).toBe(false);
  });

  it("reads a missing or unusable confidence as none rather than as certainty", async () => {
    const port = createInferencePort({
      model: structuredModel({ priority: { value: "High", confidence: "very" } }),
    });

    const result = await port.infer(TURN, SCHEMA);

    expect(result.fields["priority"]?.confidence).toBe(0);
  });

  it("ignores a field the schema does not declare", async () => {
    const port = createInferencePort({
      model: structuredModel({
        priority: { value: "High", confidence: 1 },
        invented: { value: "anything", confidence: 1 },
      }),
    });

    const result = await port.infer(TURN, SCHEMA);

    expect(Object.keys(result.fields)).toEqual(["priority"]);
  });

  it("returns no fields when the model answered with something unusable", async () => {
    const port = createInferencePort({ model: structuredModel(["not", "an", "object"]) });

    const result = await port.infer(TURN, SCHEMA);

    expect(result.fields).toEqual({});
  });
});
