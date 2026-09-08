import { describe, expect, it } from "vitest";

import { locateInUtterance, utteranceTextOf } from "../src/gate/presence.js";

/**
 * The finder PV-3 states: where a value's text sits in the turn a person typed, if it
 * sits there at all.
 *
 * These are the cases the rule's own sentence decides, tested on the pure function
 * rather than through a gate, because the .NET sibling
 * (`Affiant.Core.Services.UtterancePresence`) has to answer identically on every one
 * of them: the two implementations are held equivalent by the protocol's fixtures, and
 * a fixture can only state what a whole pipeline did. Anything here that the two
 * disagree on is a parity defect, whichever of them is right.
 *
 * Runs on Node, Bun and workerd alike: no filesystem, no Node global.
 */

/** The Meridian turn the framework defect was found on (`Sakwala/affiant#123`). */
const MERIDIAN =
  "Create an AOG work order for WZ-BRN. Title: Left engine oil pressure fluctuation. " +
  "Priority Critical, estimated 6 hours, assign it to Rajesh Kumar, due 2026-09-08";

describe("the value text a value is looked for as", () => {
  it("is the string itself", () => {
    expect(utteranceTextOf("Critical")).toBe("Critical");
  });

  it("is SR-1's canonical rendering for a number, and true or false for a boolean", () => {
    expect(utteranceTextOf(6)).toBe("6");
    expect(utteranceTextOf(6.5)).toBe("6.5");
    // The rendering, not the token the port's JSON happened to carry: 6.0 and 6 are
    // one number by the time either implementation sees it, so both look for "6".
    expect(utteranceTextOf(6.0)).toBe("6");
    expect(utteranceTextOf(-0)).toBe("0");
    // Always positional, so the search text is never "1e+21".
    expect(utteranceTextOf(1e21)).toBe("1000000000000000000000");
    expect(utteranceTextOf(true)).toBe("true");
    expect(utteranceTextOf(false)).toBe("false");
  });

  it("is nothing at all for a number the runtime parsed as infinity or NaN", () => {
    // SR-1 gives neither a canonical rendering, so the port reported nothing for the
    // field — not an error out of the inference step, and not a graded field either.
    expect(utteranceTextOf(Number.NaN)).toBeNull();
    expect(utteranceTextOf(Number.POSITIVE_INFINITY)).toBeNull();
    expect(utteranceTextOf(Number.NEGATIVE_INFINITY)).toBeNull();
  });

  it("is nothing at all for a value a field cannot carry", () => {
    // `null`, an object, an array and the empty string are not values: the port
    // reported nothing for that field, and the gate merges none of them.
    expect(utteranceTextOf(null)).toBeNull();
    expect(utteranceTextOf({ a: 1 })).toBeNull();
    expect(utteranceTextOf([1, 2])).toBeNull();
    expect(utteranceTextOf("")).toBeNull();
  });

  it("is the string itself for a whitespace-only value, which is a value", () => {
    // Filed as the port reported it, and it never hits.
    expect(utteranceTextOf("   ")).toBe("   ");
    expect(locateInUtterance("Set it to    now", "   ", null)).toBeNull();
  });
});

describe("a hit is an occurrence whose neighbours are not letters or digits", () => {
  it("finds a value the person typed, in UTF-16 code units", () => {
    expect(locateInUtterance(MERIDIAN, "Rajesh Kumar", null)).toEqual({
      offset: MERIDIAN.indexOf("Rajesh Kumar"),
      length: "Rajesh Kumar".length,
    });
  });

  it("finds every field of the turn the framework defect was found on (#123)", () => {
    const values = [
      "AOG",
      "WZ-BRN",
      "Left engine oil pressure fluctuation",
      "Critical",
      6,
      "Rajesh Kumar",
      "2026-09-08",
    ] as const;

    for (const value of values) {
      const text = utteranceTextOf(value);
      if (text === null) expect.unreachable(`${String(value)} is a value`);
      const hit = locateInUtterance(MERIDIAN, text, null);
      if (hit === null) expect.unreachable(`the turn carries ${text}`);
      expect(MERIDIAN.slice(hit.offset, hit.offset + hit.length)).toBe(text);
    }
  });

  it("does not find a number that only occurs inside a longer one", () => {
    expect(locateInUtterance(MERIDIAN, utteranceTextOf(20) ?? "", null)).toBeNull();
    expect(locateInUtterance("estimated 16 hours", utteranceTextOf(6) ?? "", null)).toBeNull();
  });

  it("does not find a word that only occurs inside a longer one", () => {
    expect(locateInUtterance("Send it to Anaïs", "Ana", null)).toBeNull();
  });

  it("takes a combining mark and an underscore as joining, not as boundaries", () => {
    // A decomposed "Café" draws its grapheme with U+0301 after the "e"; the word the
    // utterance draws there is not the word "Cafe" spells.
    expect(locateInUtterance("Book the Cafe\u0301 for noon", "Cafe", null)).toBeNull();
    // Connector punctuation joins an identifier: the tail number is WZ_BRN, not WZ.
    expect(locateInUtterance("Aircraft WZ_BRN is on the ground", "WZ", null)).toBeNull();
  });

  it("takes punctuation, whitespace and the ends of the turn as boundaries", () => {
    expect(locateInUtterance("Due 2026-09-08.", "2026", null)).toEqual({ offset: 4, length: 4 });
    expect(locateInUtterance("Active", "Active", null)).toEqual({ offset: 0, length: 6 });
  });

  it("searches a multi-line turn as one string", () => {
    const utterance = "Title: oil check\nPriority: Critical";
    expect(locateInUtterance(utterance, "Critical", null)).toEqual({
      offset: utterance.indexOf("Critical"),
      length: 8,
    });
  });

  it("reads a neighbouring surrogate pair as the one character it is", () => {
    // U+1D400 MATHEMATICAL BOLD CAPITAL A is a letter written as two code units. Read
    // as code units, the trailing low surrogate is not a letter and "Ada" would hit;
    // read as the code point PV-3 names, it is a letter and there is no hit.
    expect(locateInUtterance("Ada\u{1D400}", "Ada", null)).toBeNull();
    expect(locateInUtterance("\u{1D400}Ada", "Ada", null)).toBeNull();
    expect(locateInUtterance("\u{1F600} Ada", "Ada", null)).toEqual({ offset: 3, length: 3 });
  });

  it("never hits on an empty or whitespace-only value text", () => {
    expect(locateInUtterance("Set it to    now", "", null)).toBeNull();
    expect(locateInUtterance("Set it to    now", "   ", null)).toBeNull();
  });

  it("finds nothing in an empty turn", () => {
    expect(locateInUtterance("", "Critical", null)).toBeNull();
  });

  it("takes the first hit when the value occurs more than once", () => {
    const utterance = "Critical, and I mean Critical";
    expect(locateInUtterance(utterance, "Critical", null)).toEqual({ offset: 0, length: 8 });
  });
});

describe("the comparison is ordinal and folds ASCII case, nothing else", () => {
  it("hits a value the person typed in another case", () => {
    const utterance = "Expense for the client lunch";
    expect(locateInUtterance(utterance, "Client Lunch", null)).toEqual({
      offset: utterance.indexOf("client lunch"),
      length: 12,
    });
  });

  it("folds no code point outside ASCII, in either direction", () => {
    // Every one of these is a case pair some runtime's Unicode table folds and another
    // does not — the divergence the ASCII-only rule exists to close. None of them hits.
    // ẞ (U+1E9E) against ß (U+00DF): different code points, whatever a full mapping says.
    expect(locateInUtterance("Adresse STRAẞE 5", "Straße", null)).toBeNull();
    // ᾈ (U+1F88) against ᾀ (U+1F80): a simple mapping .NET's OrdinalIgnoreCase applies
    // and JavaScript's toUpperCase() does not.
    expect(locateInUtterance("Set ᾈ now", "ᾀ", null)).toBeNull();
    // ſ (U+017F) against s: a simple mapping JavaScript applies and .NET does not.
    expect(locateInUtterance("Adreſse 5", "adresse", null)).toBeNull();
    // ı (U+0131) against I: Node folds it, .NET's OrdinalIgnoreCase does not.
    expect(locateInUtterance("bakım planı", "BAKIM", null)).toBeNull();
    // A case variant outside ASCII is `Inferred`; an exact echo in any script hits.
    expect(locateInUtterance("Приоритет Критический", "критический", null)).toBeNull();
    expect(locateInUtterance("Приоритет Критический", "Критический", null)).toEqual({
      offset: 10,
      length: 11,
    });
  });

  it("keeps the offsets in the utterance's own code units when the case differs", () => {
    // The é before it is not folded and is not searched for; the ASCII letters after
    // it are, and the offset is the utterance's own.
    const utterance = "Réserve the CAFE for noon";
    expect(locateInUtterance(utterance, "cafe", null)).toEqual({
      offset: utterance.indexOf("CAFE"),
      length: 4,
    });
    // The same word with the accent is a different code point in each case, so no hit.
    expect(locateInUtterance("Réserve the CAFÉ for noon", "café", null)).toBeNull();
  });
});

describe("a hit never begins or ends inside a surrogate pair", () => {
  // U+1D400 MATHEMATICAL BOLD CAPITAL A is one letter written as the pair D835 DC00.
  const bold = "\u{1D400}";

  it("refuses an occurrence whose first code unit is the trailing half of a pair", () => {
    expect(locateInUtterance(bold, "\uDC00", null)).toBeNull();
  });

  it("refuses an occurrence whose last code unit is the leading half of a pair", () => {
    // Binding here would hash EF BF BD — the replacement character — over a span whose
    // bytes the utterance does not contain, which is not what PV-2 asks a binding for.
    expect(locateInUtterance(bold, "\uD835", null)).toBeNull();
  });

  it("finds a value that is itself a whole pair", () => {
    expect(locateInUtterance(`Draw ${bold} here`, bold, null)).toEqual({ offset: 5, length: 2 });
  });
});

describe("the port's span is a hint, verified before it is used", () => {
  it("uses a span that says what the utterance says", () => {
    const utterance = "Critical, and I mean Critical";
    expect(locateInUtterance(utterance, "Critical", { start: 21, end: 29 })).toEqual({
      offset: 21,
      length: 8,
    });
  });

  it("discards a span that sits inside a longer token, however right its text is", () => {
    // The span's substring IS "20", but its right-hand neighbour is a digit, so the
    // span is not a hit and the finder refuses to bind a value to a fragment of
    // "2026-09-08" that it would never have found itself.
    const utterance = "Log the oil pressure check, due 2026-09-08";
    expect(locateInUtterance(utterance, "20", { start: 32, end: 34 })).toBeNull();
  });

  it("discards a span whose text is not the value, and looks for the value itself", () => {
    const utterance = "Raise it to Critical today";
    expect(locateInUtterance(utterance, "Critical", { start: 0, end: 8 })).toEqual({
      offset: 12,
      length: 8,
    });
  });

  it("discards a span that runs past the end of the turn, or reads backwards", () => {
    const utterance = "Raise it to Critical today";
    expect(locateInUtterance(utterance, "Critical", { start: 0, end: 10_000 })).toEqual({
      offset: 12,
      length: 8,
    });
    expect(locateInUtterance(utterance, "Critical", { start: 12, end: 4 })).toEqual({
      offset: 12,
      length: 8,
    });
    expect(locateInUtterance(utterance, "Critical", { start: -5, end: 3 })).toEqual({
      offset: 12,
      length: 8,
    });
  });

  it("discards a span for a value the turn does not carry at all", () => {
    expect(
      locateInUtterance("Raise a work order for the left engine", "Critical", {
        start: 0,
        end: 8,
      }),
    ).toBeNull();
  });

  it("reads an integer-valued coordinate as the integer it is", () => {
    // `4.0` and `4` are one number by the time either implementation sees the parsed
    // JSON, so a port that wrote `4.0` names the same span as one that wrote `4`.
    const utterance = "six six";
    expect(locateInUtterance(utterance, "six", { start: 4.0, end: 7.0 })).toEqual({
      offset: 4,
      length: 3,
    });
  });

  it("ignores a span whose offsets are not whole numbers", () => {
    const utterance = "Raise it to Critical today";
    expect(locateInUtterance(utterance, "Critical", { start: 1.5, end: 9.5 })).toEqual({
      offset: 12,
      length: 8,
    });
  });
});
