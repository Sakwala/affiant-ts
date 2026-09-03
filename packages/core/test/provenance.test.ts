import { PROVENANCE_SOURCES } from "@affiant/contract";
import { describe, expect, expectTypeOf, it } from "vitest";

import {
  BINDING_KINDS,
  chainOf,
  determinismRank,
  emptyTag,
  isBound,
  isHonourable,
  merge,
  mintConversation,
  mintInference,
  mintInferred,
  mintTag,
  PROVENANCE_LADDER,
  requiresBinding,
  supersede,
  tagsOf,
  type Binding,
  type InferenceSource,
  type ProvenanceSource,
  type ProvenanceTag,
} from "../src/model/provenance.js";

const AT = "2026-09-04T10:00:00.000Z";

describe("the seven-source ladder (PV-1)", () => {
  it("is ordered most deterministic first", () => {
    expect(PROVENANCE_LADDER).toEqual([
      "UserStated",
      "External",
      "Computed",
      "Conversation",
      "Inferred",
      "Default",
      "Empty",
    ]);
  });

  it("is the same list, in the same order, as the wire contract's", () => {
    expect([...PROVENANCE_LADDER]).toEqual([...PROVENANCE_SOURCES]);
  });

  it("ranks by position, lower being more deterministic", () => {
    expect(determinismRank("UserStated")).toBe(0);
    expect(determinismRank("External")).toBe(1);
    expect(determinismRank("Computed")).toBe(2);
    expect(determinismRank("Conversation")).toBe(3);
    expect(determinismRank("Inferred")).toBe(4);
    expect(determinismRank("Default")).toBe(5);
    expect(determinismRank("Empty")).toBe(6);
  });

  it("ranks every source in the ladder and nothing else", () => {
    const ranks = PROVENANCE_LADDER.map((source) => determinismRank(source));
    expect(ranks).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(new Set(ranks).size).toBe(PROVENANCE_LADDER.length);
  });
});

describe("bindings (PV-2)", () => {
  it("fixes five binding kinds", () => {
    expect(BINDING_KINDS).toEqual([
      "utterance-span",
      "reviewer-act",
      "form-input",
      "external-ref",
      "computation-ref",
    ]);
  });

  it("requires a binding exactly for the sources above Conversation", () => {
    const requiring = PROVENANCE_LADDER.filter((source) => requiresBinding(source));
    expect(requiring).toEqual(["UserStated", "External", "Computed"]);
  });

  it("reports a tag as bound only when it points at something", () => {
    const unbound = mintTag({ source: "External", confidence: 1, at: AT });
    const binding: Binding = {
      kind: "external-ref",
      ref: { system: "ledger", recordId: "INV-9", fetchedAt: AT, contentHash: "sha256:abc" },
    };
    const bound = mintTag({ source: "External", confidence: 1, at: AT, binding });

    expect(isBound(unbound)).toBe(false);
    expect(isBound(bound)).toBe(true);
    expect(unbound.binding).toBeNull();
    expect(bound.binding).toEqual(binding);
  });

  it("carries a relay on an external binding, for a capture over a trusted relay", () => {
    const binding: Binding = {
      kind: "external-ref",
      ref: {
        system: "ledger",
        recordId: "INV-9",
        relay: { principal: "relay-desk", channelIdentity: "chat:U024", messageId: "m-9" },
      },
    };
    const tag = mintTag({ source: "External", confidence: 1, at: AT, binding });
    expect(isHonourable(tag)).toBe(true);
  });

  it("carries the date an external constant was last verified on a computation binding", () => {
    const binding: Binding = {
      kind: "computation-ref",
      ref: {
        rule: "vat-standard-rate",
        inputs: ["Net"],
        constant: { source: "https://example.invalid/rates", verifiedOn: "2026-03-01" },
      },
    };
    const tag = mintTag({ source: "Computed", confidence: 1, at: AT, binding });
    expect(tag.binding).toEqual(binding);
    expect(isHonourable(tag)).toBe(true);
  });
});

describe("an asserted grade with nothing behind it (PV-5)", () => {
  it("records the grade but reports it as not honourable", () => {
    const asserted = mintTag({ source: "UserStated", confidence: 1, at: AT });
    expect(asserted.source).toBe("UserStated");
    expect(isBound(asserted)).toBe(false);
    expect(isHonourable(asserted)).toBe(false);
  });

  it("treats a tag at or below Conversation as honourable with no binding", () => {
    expect(isHonourable(mintConversation({ confidence: 0.9, at: AT }))).toBe(true);
    expect(isHonourable(mintInferred({ confidence: 0.4, at: AT }))).toBe(true);
    expect(isHonourable(emptyTag(AT))).toBe(true);
  });
});

describe("minting clamps confidence into [0, 1] (PV-1)", () => {
  it("caps a confidence above 1", () => {
    expect(mintTag({ source: "Inferred", confidence: 1.5, at: AT }).confidence).toBe(1);
  });

  it("floors a confidence below 0", () => {
    expect(mintTag({ source: "Inferred", confidence: -0.2, at: AT }).confidence).toBe(0);
  });

  it("treats NaN as no claim at all", () => {
    expect(mintTag({ source: "Inferred", confidence: Number.NaN, at: AT }).confidence).toBe(0);
  });

  it("leaves a confidence already in range alone", () => {
    expect(mintTag({ source: "Inferred", confidence: 0.42, at: AT }).confidence).toBe(0.42);
  });

  it("forces an Empty tag to confidence 0 whatever the caller claims", () => {
    expect(mintTag({ source: "Empty", confidence: 0.9, at: AT }).confidence).toBe(0);
    expect(emptyTag(AT).confidence).toBe(0);
  });

  it("writes note, conversationTurn and binding on every minted tag", () => {
    const tag = mintTag({ source: "Default", confidence: 0.1, at: AT });
    expect(tag).toEqual({
      source: "Default",
      confidence: 0.1,
      note: null,
      at: AT,
      conversationTurn: null,
      binding: null,
    });
  });
});

describe("the inference step cannot mint UserStated (PV-3)", () => {
  it("types its source parameter as the two inference sources only", () => {
    expectTypeOf<InferenceSource>().toEqualTypeOf<"Conversation" | "Inferred">();
    expectTypeOf(mintInference).parameter(0).toEqualTypeOf<InferenceSource>();
    expectTypeOf(mintInferred).returns.toEqualTypeOf<ProvenanceTag>();
  });

  it("refuses UserStated at compile time and again at runtime", () => {
    expect(() =>
      // @ts-expect-error PV-3: UserStated is an observation of a person's act.
      mintInference("UserStated", { confidence: 1, at: AT }),
    ).toThrow(RangeError);
  });

  it("refuses any other source a JavaScript caller smuggles in", () => {
    expect(() => mintInference("External" as InferenceSource, { confidence: 1, at: AT })).toThrow(
      /PV-3/,
    );
  });

  it("mints Conversation and Inferred", () => {
    expect(mintConversation({ confidence: 0.9, at: AT }).source).toBe("Conversation");
    expect(mintInferred({ confidence: 0.4, at: AT }).source).toBe("Inferred");
  });
});

describe("merge: confidence first, determinism second, loser preserved (PV-1)", () => {
  const tag = (source: ProvenanceSource, confidence: number, note: string): ProvenanceTag =>
    mintTag({ source, confidence, at: AT, note });

  it("lets the higher confidence win", () => {
    const chain = merge(chainOf(tag("Inferred", 0.4, "model")), tag("External", 0.9, "ledger"));
    expect(chain.current.note).toBe("ledger");
    expect(chain.current.confidence).toBe(0.9);
  });

  it("lets the higher confidence win even from a less deterministic source", () => {
    const chain = merge(chainOf(tag("External", 0.4, "ledger")), tag("Inferred", 0.9, "model"));
    expect(chain.current.note).toBe("model");
    expect(chain.current.source).toBe("Inferred");
  });

  it("breaks a tie toward the more deterministic source", () => {
    const chain = merge(chainOf(tag("Inferred", 0.8, "model")), tag("Computed", 0.8, "rule"));
    expect(chain.current.source).toBe("Computed");
    expect(chain.current.note).toBe("rule");
  });

  it("leaves the incumbent in force when a tie has no tie-breaker left", () => {
    const chain = merge(chainOf(tag("Computed", 0.8, "first")), tag("Computed", 0.8, "second"));
    expect(chain.current.note).toBe("first");
    expect(chain.prior.map((entry) => entry.note)).toEqual(["second"]);
  });

  it("preserves the losing tag at the head of the chain", () => {
    const chain = merge(chainOf(tag("Inferred", 0.4, "model")), tag("External", 0.9, "ledger"));
    expect(chain.prior.map((entry) => entry.note)).toEqual(["model"]);
    expect(tagsOf(chain).map((entry) => entry.note)).toEqual(["ledger", "model"]);
  });

  it("keeps the chain newest first across repeated merges", () => {
    let chain = chainOf(tag("Default", 0.1, "default"));
    chain = merge(chain, tag("Inferred", 0.4, "model"));
    chain = merge(chain, tag("External", 0.9, "ledger"));
    chain = merge(chain, tag("Inferred", 0.2, "late guess"));

    expect(chain.current.note).toBe("ledger");
    expect(tagsOf(chain).map((entry) => entry.note)).toEqual([
      "ledger",
      "late guess",
      "model",
      "default",
    ]);
  });

  it("never drops a tag", () => {
    let chain = chainOf(tag("Default", 0.1, "a"));
    chain = merge(chain, tag("Inferred", 0.4, "b"));
    chain = merge(chain, tag("Computed", 0.4, "c"));
    expect(tagsOf(chain)).toHaveLength(3);
  });
});

describe("supersede puts a tag in force without a contest", () => {
  it("displaces a more confident incumbent and keeps it in the chain", () => {
    const chain = chainOf(mintTag({ source: "External", confidence: 1, at: AT, note: "ledger" }));
    const superseded = supersede(
      chain,
      mintTag({ source: "Inferred", confidence: 0.1, at: AT, note: "correction" }),
    );

    expect(superseded.current.note).toBe("correction");
    expect(superseded.prior.map((entry) => entry.note)).toEqual(["ledger"]);
  });
});
