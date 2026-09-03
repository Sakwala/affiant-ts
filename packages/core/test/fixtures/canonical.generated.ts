// GENERATED FILE - DO NOT EDIT BY HAND.
// Produced by scripts/generate-canonical-fixtures.mjs from test/fixtures/canonical/*.json.
// The JSON files are the record; this module is how the suites read them on Node, Bun
// and workerd alike. To change a vector: edit its JSON file, then run
// `pnpm build && pnpm generate:vectors` from packages/core.

/**
 * One SR-1 byte vector: an input, the amendments accepted on it, and the canonical
 * form and SHA-256 those two produce.
 */
export interface CanonicalVector {
  /** The vector's id, matching the `id` in its JSON file. */
  readonly id: string;
  /** The rule ids this vector checks. */
  readonly rules: readonly string[];
  /** What the vector is for, and which trap it sets. */
  readonly note: string;
  /**
   * The Affidavit, or the bare JSON value where the vector exercises the form
   * itself. Typed `unknown` because a fixture is data: a suite narrows it to the
   * shape that suite is about, and no declaration here can be right for all seven.
   */
  readonly input: unknown;
  /** The accepted amendments, or `null` for none. */
  readonly amendments: { readonly [fieldName: string]: unknown } | null;
  /**
   * The decision the amendments arrived on — its entry, its instant and its
   * principal (PV-2) — or `null` where there are no amendments.
   */
  readonly reviewerAct: {
    readonly entryId: string;
    readonly decisionAt: string;
    readonly by: string;
  } | null;
  /** The canonical form as a string - the bytes before UTF-8 encoding. */
  readonly expectedBytesUtf8: string;
  /** The SHA-256 of the UTF-8 bytes, lowercase hex. */
  readonly expectedSha256: string;
}

/** Every vector, in file order. */
export const canonicalVectors: readonly CanonicalVector[] = [
  // 01-create-shaped.json
  {
    "id": "canonical/create-shaped",
    "rules": [
      "SR-1",
      "AF-1",
      "AF-3",
    ],
    "note": "A create-shaped Affidavit: entityId null, previousValue null on every field (AF-3), one field tagged Empty to show that unknown provenance is present rather than omitted (AF-1). The canonical bytes sort every key by code point at every level, so `aggregateConfidence` precedes `entityId` precedes `entityType` precedes `fields` regardless of the order the host built the object in.",
    "input": {
      "operationType": "WriteCreate",
      "entityType": "Widget",
      "entityId": null,
      "fields": [
        {
          "name": "Status",
          "value": "Active",
          "previousValue": null,
          "provenance": {
            "current": {
              "source": "Conversation",
              "confidence": 0.9,
              "evidence": "Extracted from the turn",
              "conversationTurn": 1,
            },
            "prior": [],
          },
          "isMandatory": true,
          "kind": "enum",
          "allowedValues": [
            "Active",
            "Retired",
          ],
          "pattern": null,
        },
        {
          "name": "Owner",
          "value": null,
          "previousValue": null,
          "provenance": {
            "current": {
              "source": "Empty",
              "confidence": 0,
              "evidence": null,
              "conversationTurn": null,
            },
            "prior": [],
          },
          "isMandatory": false,
          "kind": "text",
          "allowedValues": null,
          "pattern": null,
        },
      ],
      "aggregateConfidence": 0,
      "populatedConfidence": 0.9,
      "emptyFieldCount": 1,
      "warnings": [],
      "requiresConfirmation": true,
    },
    "amendments": null,
    "reviewerAct": null,
    "expectedBytesUtf8": "{\"aggregateConfidence\":0,\"emptyFieldCount\":1,\"entityId\":null,\"entityType\":\"Widget\",\"fields\":[{\"allowedValues\":[\"Active\",\"Retired\"],\"isMandatory\":true,\"kind\":\"enum\",\"name\":\"Status\",\"pattern\":null,\"previousValue\":null,\"provenance\":{\"current\":{\"confidence\":0.9,\"conversationTurn\":1,\"evidence\":\"Extracted from the turn\",\"source\":\"Conversation\"},\"prior\":[]},\"value\":\"Active\"},{\"allowedValues\":null,\"isMandatory\":false,\"kind\":\"text\",\"name\":\"Owner\",\"pattern\":null,\"previousValue\":null,\"provenance\":{\"current\":{\"confidence\":0,\"conversationTurn\":null,\"evidence\":null,\"source\":\"Empty\"},\"prior\":[]},\"value\":null}],\"operationType\":\"WriteCreate\",\"populatedConfidence\":0.9,\"requiresConfirmation\":true,\"warnings\":[]}",
    "expectedSha256": "4f4f83330f99ae64e36b54439efcf9556e1b7a46054d750a9485bc41a992b48f",
  },
  // 02-update-shaped.json
  {
    "id": "canonical/update-shaped",
    "rules": [
      "SR-1",
      "AF-3",
      "PV-1",
    ],
    "note": "An update-shaped Affidavit: entityId set, a previousValue on every proposed field, one of them null because the field had no stored value (AF-3). One chain carries a superseded tag in `prior`, so the vector pins that array order is data and is never sorted. `null` is written; a property whose value is undefined is omitted, which no JSON file can express — `test/canonical.test.ts` covers that half.",
    "input": {
      "operationType": "WriteUpdate",
      "entityType": "Invoice",
      "entityId": "INV-2026-0044",
      "fields": [
        {
          "name": "DueDate",
          "value": "2026-10-01",
          "previousValue": "2026-09-15",
          "provenance": {
            "current": {
              "source": "Conversation",
              "confidence": 0.82,
              "evidence": "Extracted from the turn",
              "conversationTurn": 4,
            },
            "prior": [
              {
                "source": "Inferred",
                "confidence": 0.4,
                "evidence": "Guessed from the payment terms",
                "conversationTurn": 4,
              },
            ],
          },
          "isMandatory": true,
          "kind": "date",
          "allowedValues": null,
          "pattern": null,
        },
        {
          "name": "Reference",
          "value": "PO-77",
          "previousValue": null,
          "provenance": {
            "current": {
              "source": "External",
              "confidence": 1,
              "evidence": "Read from the purchase-order system",
              "conversationTurn": null,
              "binding": {
                "kind": "external-ref",
                "ref": "erp:purchase-order/77",
              },
            },
            "prior": [],
          },
          "isMandatory": false,
          "kind": "text",
          "allowedValues": null,
          "pattern": null,
        },
        {
          "name": "Total",
          "value": {
            "amount": "4000.10",
            "currency": "GBP",
          },
          "previousValue": {
            "amount": "40.00",
            "currency": "GBP",
          },
          "provenance": {
            "current": {
              "source": "Computed",
              "confidence": 1,
              "evidence": "Sum of the line items",
              "conversationTurn": null,
              "binding": {
                "kind": "computation-ref",
                "ref": "invoice.total@v3",
              },
            },
            "prior": [],
          },
          "isMandatory": true,
          "kind": "number",
          "allowedValues": null,
          "pattern": null,
        },
      ],
      "aggregateConfidence": 0.82,
      "populatedConfidence": 0.82,
      "emptyFieldCount": 0,
      "warnings": [
        "The total changed by more than 10x.",
      ],
      "requiresConfirmation": true,
    },
    "amendments": null,
    "reviewerAct": null,
    "expectedBytesUtf8": "{\"aggregateConfidence\":0.82,\"emptyFieldCount\":0,\"entityId\":\"INV-2026-0044\",\"entityType\":\"Invoice\",\"fields\":[{\"allowedValues\":null,\"isMandatory\":true,\"kind\":\"date\",\"name\":\"DueDate\",\"pattern\":null,\"previousValue\":\"2026-09-15\",\"provenance\":{\"current\":{\"confidence\":0.82,\"conversationTurn\":4,\"evidence\":\"Extracted from the turn\",\"source\":\"Conversation\"},\"prior\":[{\"confidence\":0.4,\"conversationTurn\":4,\"evidence\":\"Guessed from the payment terms\",\"source\":\"Inferred\"}]},\"value\":\"2026-10-01\"},{\"allowedValues\":null,\"isMandatory\":false,\"kind\":\"text\",\"name\":\"Reference\",\"pattern\":null,\"previousValue\":null,\"provenance\":{\"current\":{\"binding\":{\"kind\":\"external-ref\",\"ref\":\"erp:purchase-order/77\"},\"confidence\":1,\"conversationTurn\":null,\"evidence\":\"Read from the purchase-order system\",\"source\":\"External\"},\"prior\":[]},\"value\":\"PO-77\"},{\"allowedValues\":null,\"isMandatory\":true,\"kind\":\"number\",\"name\":\"Total\",\"pattern\":null,\"previousValue\":{\"amount\":\"40.00\",\"currency\":\"GBP\"},\"provenance\":{\"current\":{\"binding\":{\"kind\":\"computation-ref\",\"ref\":\"invoice.total@v3\"},\"confidence\":1,\"conversationTurn\":null,\"evidence\":\"Sum of the line items\",\"source\":\"Computed\"},\"prior\":[]},\"value\":{\"amount\":\"4000.10\",\"currency\":\"GBP\"}}],\"operationType\":\"WriteUpdate\",\"populatedConfidence\":0.82,\"requiresConfirmation\":true,\"warnings\":[\"The total changed by more than 10x.\"]}",
    "expectedSha256": "125220b31c330f0b05a176c9652b8037a0aea55fefed7b1e59d1e5b1edfff333",
  },
  // 03-wire-evidence-card-request.json
  {
    "id": "canonical/wire-evidence-card-request",
    "rules": [
      "SR-1",
      "SR-3",
    ],
    "note": "The Affidavit from the protocol seed fixture `wire/evidence-card-request` (Sakwala/affiant-protocol at v0.0.1-seed), copied here unchanged so the canonical form is pinned over a shape both implementations already agree on. `confidence: 1.0` in the seed file is the JSON number 1 after parsing and serializes as `1` — a canonical form has one spelling per value. The seed's `aggregateConfidence` of 0.95 is the mean the shipped .NET projection computes, which AF-2 corrects to the minimum; the vector pins the bytes of the shape, not the correctness of the number.",
    "input": {
      "operationType": "WriteUpdate",
      "entityType": "Widget",
      "entityId": "W-1",
      "fields": [
        {
          "name": "Status",
          "value": "Active",
          "previousValue": null,
          "provenance": {
            "current": {
              "source": "UserStated",
              "confidence": 1,
              "evidence": "User stated: Status",
              "conversationTurn": null,
            },
            "prior": [],
          },
          "isMandatory": true,
          "kind": "enum",
          "allowedValues": [
            "Active",
            "Retired",
          ],
          "pattern": null,
        },
        {
          "name": "Weight",
          "value": 12.5,
          "previousValue": 10,
          "provenance": {
            "current": {
              "source": "Conversation",
              "confidence": 0.9,
              "evidence": "Extracted from search_widget",
              "conversationTurn": 3,
            },
            "prior": [],
          },
          "isMandatory": false,
          "kind": "number",
          "allowedValues": null,
          "pattern": "^\\d+(\\.\\d+)?$",
        },
      ],
      "aggregateConfidence": 0.95,
      "warnings": [],
      "requiresConfirmation": true,
    },
    "amendments": null,
    "reviewerAct": null,
    "expectedBytesUtf8": "{\"aggregateConfidence\":0.95,\"entityId\":\"W-1\",\"entityType\":\"Widget\",\"fields\":[{\"allowedValues\":[\"Active\",\"Retired\"],\"isMandatory\":true,\"kind\":\"enum\",\"name\":\"Status\",\"pattern\":null,\"previousValue\":null,\"provenance\":{\"current\":{\"confidence\":1,\"conversationTurn\":null,\"evidence\":\"User stated: Status\",\"source\":\"UserStated\"},\"prior\":[]},\"value\":\"Active\"},{\"allowedValues\":null,\"isMandatory\":false,\"kind\":\"number\",\"name\":\"Weight\",\"pattern\":\"^\\\\d+(\\\\.\\\\d+)?$\",\"previousValue\":10,\"provenance\":{\"current\":{\"confidence\":0.9,\"conversationTurn\":3,\"evidence\":\"Extracted from search_widget\",\"source\":\"Conversation\"},\"prior\":[]},\"value\":12.5}],\"operationType\":\"WriteUpdate\",\"requiresConfirmation\":true,\"warnings\":[]}",
    "expectedSha256": "5bd969aeb4a19bc4f54c6fadc78c83da42ab78c8d5a2d8a826851482b5a95bb0",
  },
  // 04-wire-evidence-card-request-amended.json
  {
    "id": "canonical/wire-evidence-card-request-amended",
    "rules": [
      "SR-1",
      "AF-1",
      "AF-2",
      "AF-4",
      "DK-2",
      "PV-2",
    ],
    "note": "The same Affidavit as `canonical/wire-evidence-card-request`, with a reviewer's accepted amendments applied: `Status` changed to Retired, `Weight` cleared with an explicit null (DK-2 - null clears, an absent key leaves untouched). The bytes and the hash differ from the unamended vector, and that difference is the point: an execution grant minted for the proposal a reviewer was shown must not validate the proposal they amended.\n\nThree things about these bytes changed when the canonical form stopped minting a placeholder tag of its own and started calling the model's `amendmentTag`, so that the form and a Docket row's accepted state cannot disagree about the same decision.\n\n1. The reviewer-act binding now carries **the decision's instant** as well as its entry - `{\"decisionAt\":\"2026-09-04T09:12:00.000Z\",\"entryId\":\"8f14e45f-...\"}` in place of a single opaque string. PV-2's binding is the pointer an auditor follows years later, and a pointer that cannot say when the act happened cannot place it against the proposal's own instants.\n2. The tag in force is now a whole provenance tag - source, confidence, the note naming who amended the field, the conversation turn, the instant - not a source and a binding. That is what a Docket row carries, so it is what the canonical form carries.\n3. `Weight` is **gone** from `fields[]` rather than present holding null. It is optional, and a reviewer clearing an optional field is saying the write no longer proposes it; AF-1 says a field the operation does not propose is absent rather than present with nothing in it. A mandatory field cleared the same way would stay, tagged `Empty` at confidence 0. With `Weight` gone, `aggregateConfidence` is recomputed over what is left (AF-4) rather than left at the machine's pre-correction 0.95.",
    "input": {
      "operationType": "WriteUpdate",
      "entityType": "Widget",
      "entityId": "W-1",
      "fields": [
        {
          "name": "Status",
          "value": "Active",
          "previousValue": null,
          "provenance": {
            "current": {
              "source": "UserStated",
              "confidence": 1,
              "evidence": "User stated: Status",
              "conversationTurn": null,
            },
            "prior": [],
          },
          "isMandatory": true,
          "kind": "enum",
          "allowedValues": [
            "Active",
            "Retired",
          ],
          "pattern": null,
        },
        {
          "name": "Weight",
          "value": 12.5,
          "previousValue": 10,
          "provenance": {
            "current": {
              "source": "Conversation",
              "confidence": 0.9,
              "evidence": "Extracted from search_widget",
              "conversationTurn": 3,
            },
            "prior": [],
          },
          "isMandatory": false,
          "kind": "number",
          "allowedValues": null,
          "pattern": "^\\d+(\\.\\d+)?$",
        },
      ],
      "aggregateConfidence": 0.95,
      "warnings": [],
      "requiresConfirmation": true,
    },
    "amendments": {
      "Status": "Retired",
      "Weight": null,
    },
    "reviewerAct": {
      "entryId": "8f14e45f-ceea-467e-bd76-000000000001",
      "decisionAt": "2026-09-04T09:12:00.000Z",
      "by": "ana",
    },
    "expectedBytesUtf8": "{\"aggregateConfidence\":1,\"entityId\":\"W-1\",\"entityType\":\"Widget\",\"fields\":[{\"allowedValues\":[\"Active\",\"Retired\"],\"isMandatory\":true,\"kind\":\"enum\",\"name\":\"Status\",\"pattern\":null,\"previousValue\":null,\"provenance\":{\"current\":{\"at\":\"2026-09-04T09:12:00.000Z\",\"binding\":{\"kind\":\"reviewer-act\",\"ref\":{\"decisionAt\":\"2026-09-04T09:12:00.000Z\",\"entryId\":\"8f14e45f-ceea-467e-bd76-000000000001\"}},\"confidence\":1,\"conversationTurn\":null,\"note\":\"Amended by ana on Docket entry 8f14e45f-ceea-467e-bd76-000000000001\",\"source\":\"UserStated\"},\"prior\":[{\"confidence\":1,\"conversationTurn\":null,\"evidence\":\"User stated: Status\",\"source\":\"UserStated\"}]},\"value\":\"Retired\"}],\"operationType\":\"WriteUpdate\",\"requiresConfirmation\":true,\"warnings\":[]}",
    "expectedSha256": "6da4ce05a06a73a73d614782ec337bac27384b3ee65d69a1dd00858710c7ec9d",
  },
  // 05-key-order-stress.json
  {
    "id": "canonical/key-order-stress",
    "rules": [
      "SR-1",
    ],
    "note": "Keys written in reverse order at every level, plus the cases a naive comparator gets wrong. U+E000 (private use) must sort BEFORE U+1F600 (an emoji) because SR-1 sorts by Unicode code point and 0xE000 < 0x1F600; a comparator using JavaScript's < compares UTF-16 code units, sees the emoji's leading surrogate 0xD83D, and puts the emoji first. Also here: an integer-shaped key (JavaScript reorders those to the front of Object.keys on its own), a precomposed e-acute against the same letter decomposed (two distinct keys, never normalized), a key that is a prefix of another, keys differing only by case, the empty key, and a key carrying a solidus, which JSON escaping must not touch.",
    "input": {
      "zeta": {
        "2": "another integer-shaped key",
        "10": "integer-shaped key",
        "😀": "emoji key, U+1F600",
        "": "private use, U+E000",
        "é": "e-acute precomposed, U+00E9",
        "é": "e plus combining acute, U+0065 U+0301",
        "ab": "prefix plus one",
        "a": "prefix",
        "B": "uppercase B",
        "b": "lowercase b",
        "A": "uppercase A",
        "": "the empty key",
        "a/b": "a solidus, which JSON never escapes",
      },
      "middle": [
        {
          "second": 2,
          "first": 1,
        },
        {
          "b": [
            3,
            2,
            1,
          ],
          "a": {
            "y": null,
            "x": true,
          },
        },
      ],
      "alpha": "written last, sorts first",
    },
    "amendments": null,
    "reviewerAct": null,
    "expectedBytesUtf8": "{\"alpha\":\"written last, sorts first\",\"middle\":[{\"first\":1,\"second\":2},{\"a\":{\"x\":true,\"y\":null},\"b\":[3,2,1]}],\"zeta\":{\"\":\"the empty key\",\"10\":\"integer-shaped key\",\"2\":\"another integer-shaped key\",\"A\":\"uppercase A\",\"B\":\"uppercase B\",\"a\":\"prefix\",\"a/b\":\"a solidus, which JSON never escapes\",\"ab\":\"prefix plus one\",\"b\":\"lowercase b\",\"é\":\"e plus combining acute, U+0065 U+0301\",\"é\":\"e-acute precomposed, U+00E9\",\"\":\"private use, U+E000\",\"😀\":\"emoji key, U+1F600\"}}",
    "expectedSha256": "bfb9d23217cd75bc12976620e641b735b73448db6072104d09d94489246fec3a",
  },
  // 06-number-forms.json
  {
    "id": "canonical/number-forms",
    "rules": [
      "SR-1",
    ],
    "note": "Every number form the rule has to decide. `1.0` is the number 1 once parsed and is written `1` — a canonical form has one spelling per value. `1e21` is written positionally, not as `1e+21`: SR-1 says shortest round-trip decimal, and this implementation writes those digits with the decimal point in place rather than adopting ECMAScript's exponent thresholds, so a second implementation has to agree about digits and not about a spelling. `0.1 + 0.2` is the double 0.30000000000000004 and is written with all of it; rounding it would be the framework deciding what was sworn to. `-0` is written `0` (JSON has no negative zero and a reader cannot see the sign). `9007199254740993` is already the double 9007199254740992 by the time this function sees it — the parser rounded it, and the canonical bytes below say so; no canonical form can recover a digit the parse threw away; a host that needs exact integers beyond 2^53 carries them as strings, as money already does (SR-2). Non-finite numbers cannot appear in a JSON fixture at all; `test/canonical.test.ts` covers the RangeError they raise.",
    "input": {
      "one": 1,
      "integer": 42,
      "negativeInteger": -17,
      "half": 0.5,
      "sumOfTenths": 0.30000000000000004,
      "negativeZero": 0,
      "exp21": 1e+21,
      "exp23": 1.2345678901234569e+23,
      "beyond2p53": 9007199254740992,
      "tiny": 1e-7,
      "tinier": 1.5e-9,
      "negativeTiny": -1.2345e-8,
      "nested": [
        0,
        -0.5,
        0.000001,
        0.00001,
        1000000,
        100000000000000000000,
      ],
    },
    "amendments": null,
    "reviewerAct": null,
    "expectedBytesUtf8": "{\"beyond2p53\":9007199254740992,\"exp21\":1000000000000000000000,\"exp23\":123456789012345690000000,\"half\":0.5,\"integer\":42,\"negativeInteger\":-17,\"negativeTiny\":-0.000000012345,\"negativeZero\":0,\"nested\":[0,-0.5,0.000001,0.00001,1000000,100000000000000000000],\"one\":1,\"sumOfTenths\":0.30000000000000004,\"tinier\":0.0000000015,\"tiny\":0.0000001}",
    "expectedSha256": "61a744d2ab4b9285a2706e3f26c2b4e8baa14c85ddfc0b3252bcde0274a3aaf6",
  },
  // 07-money-and-escapes.json
  {
    "id": "canonical/money-and-escapes",
    "rules": [
      "SR-1",
      "SR-2",
    ],
    "note": "Money as two strings, never a number (SR-2): a GBP amount with cents a float would lose, a JPY amount with no minor units, a negative amount, and an amount far beyond what a double can hold. Alongside them the string rules: only what JSON requires is escaped, so a quote, a backslash and the C0 controls are escaped (with the two-character forms where JSON has them, lowercase u-escapes otherwise) while every non-ASCII character is written as itself and encoded as UTF-8 -- an e-acute is two bytes, not six -- and a solidus is never escaped.",
    "input": {
      "operationType": "WriteUpdate",
      "entityType": "Invoice",
      "entityId": "INV-2026-0045",
      "fields": [
        {
          "name": "Total",
          "value": {
            "amount": "4000.10",
            "currency": "GBP",
          },
          "previousValue": {
            "amount": "0",
            "currency": "GBP",
          },
          "provenance": {
            "current": {
              "source": "Computed",
              "confidence": 1,
              "evidence": "Sum of the line items",
              "conversationTurn": null,
              "binding": {
                "kind": "computation-ref",
                "ref": "invoice.total@v3",
              },
            },
            "prior": [],
          },
          "isMandatory": true,
          "kind": "number",
          "allowedValues": null,
          "pattern": null,
        },
        {
          "name": "Refund",
          "value": {
            "currency": "JPY",
            "amount": "-1250",
          },
          "previousValue": null,
          "provenance": {
            "current": {
              "source": "UserStated",
              "confidence": 1,
              "evidence": "Reviewer typed it",
              "conversationTurn": null,
            },
            "prior": [],
          },
          "isMandatory": false,
          "kind": "number",
          "allowedValues": null,
          "pattern": null,
        },
        {
          "name": "Ceiling",
          "value": {
            "amount": "123456789012345678901234567890.99",
            "currency": "LKR",
          },
          "previousValue": null,
          "provenance": {
            "current": {
              "source": "External",
              "confidence": 1,
              "evidence": "Read from the ledger",
              "conversationTurn": null,
              "binding": {
                "kind": "external-ref",
                "ref": "ledger:limit/9",
              },
            },
            "prior": [],
          },
          "isMandatory": false,
          "kind": "number",
          "allowedValues": null,
          "pattern": null,
        },
        {
          "name": "Memo",
          "value": "quote \" backslash \\ tab \t newline \n cr \r backspace \b formfeed \f nul \u0000 unit-separator \u001f solidus a/b accented éüñ script 日本語 emoji 😀 private-use ",
          "previousValue": null,
          "provenance": {
            "current": {
              "source": "Conversation",
              "confidence": 0.7,
              "evidence": "Taken verbatim from the turn",
              "conversationTurn": 2,
            },
            "prior": [],
          },
          "isMandatory": false,
          "kind": "text",
          "allowedValues": null,
          "pattern": null,
        },
      ],
      "aggregateConfidence": 0.7,
      "populatedConfidence": 0.7,
      "emptyFieldCount": 0,
      "warnings": [],
      "requiresConfirmation": true,
    },
    "amendments": null,
    "reviewerAct": null,
    "expectedBytesUtf8": "{\"aggregateConfidence\":0.7,\"emptyFieldCount\":0,\"entityId\":\"INV-2026-0045\",\"entityType\":\"Invoice\",\"fields\":[{\"allowedValues\":null,\"isMandatory\":true,\"kind\":\"number\",\"name\":\"Total\",\"pattern\":null,\"previousValue\":{\"amount\":\"0\",\"currency\":\"GBP\"},\"provenance\":{\"current\":{\"binding\":{\"kind\":\"computation-ref\",\"ref\":\"invoice.total@v3\"},\"confidence\":1,\"conversationTurn\":null,\"evidence\":\"Sum of the line items\",\"source\":\"Computed\"},\"prior\":[]},\"value\":{\"amount\":\"4000.10\",\"currency\":\"GBP\"}},{\"allowedValues\":null,\"isMandatory\":false,\"kind\":\"number\",\"name\":\"Refund\",\"pattern\":null,\"previousValue\":null,\"provenance\":{\"current\":{\"confidence\":1,\"conversationTurn\":null,\"evidence\":\"Reviewer typed it\",\"source\":\"UserStated\"},\"prior\":[]},\"value\":{\"amount\":\"-1250\",\"currency\":\"JPY\"}},{\"allowedValues\":null,\"isMandatory\":false,\"kind\":\"number\",\"name\":\"Ceiling\",\"pattern\":null,\"previousValue\":null,\"provenance\":{\"current\":{\"binding\":{\"kind\":\"external-ref\",\"ref\":\"ledger:limit/9\"},\"confidence\":1,\"conversationTurn\":null,\"evidence\":\"Read from the ledger\",\"source\":\"External\"},\"prior\":[]},\"value\":{\"amount\":\"123456789012345678901234567890.99\",\"currency\":\"LKR\"}},{\"allowedValues\":null,\"isMandatory\":false,\"kind\":\"text\",\"name\":\"Memo\",\"pattern\":null,\"previousValue\":null,\"provenance\":{\"current\":{\"confidence\":0.7,\"conversationTurn\":2,\"evidence\":\"Taken verbatim from the turn\",\"source\":\"Conversation\"},\"prior\":[]},\"value\":\"quote \\\" backslash \\\\ tab \\t newline \\n cr \\r backspace \\b formfeed \\f nul \\u0000 unit-separator \\u001f solidus a/b accented éüñ script 日本語 emoji 😀 private-use \"}],\"operationType\":\"WriteUpdate\",\"populatedConfidence\":0.7,\"requiresConfirmation\":true,\"warnings\":[]}",
    "expectedSha256": "2970e9ad511c5b2a7d9b96e2fd6cf4389620dcbb616422e1e80a22670536b9c1",
  },
];

/** A vector by id, for a test that names one. */
export function canonicalVector(id: string): CanonicalVector {
  const found = canonicalVectors.find((vector) => vector.id === id);
  if (found === undefined) throw new Error(`no canonical vector with id ${JSON.stringify(id)}`);
  return found;
}
