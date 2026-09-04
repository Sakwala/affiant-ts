// GENERATED FILE - DO NOT EDIT BY HAND.
// Produced by scripts/generate-canonical-fixtures.mjs, which also writes
// test/fixtures/canonical/*.json. The JSON files are the record a conformance driver
// reads; this module is how the suites read them on Node, Bun and workerd alike. To
// change a vector: edit the scenario in the generator, then run
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
   * The Affidavit, as a v0.1 implementation serialises it. Typed `unknown` because
   * a fixture is data: a suite narrows it to the shape that suite is about, and no
   * declaration here can be right for all seven.
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
  /**
   * The accepted state the amendments produce — the Affidavit the canonical form is
   * actually taken over (SR-1). Present only on a vector that carries amendments.
   */
  readonly amendedInput?: unknown;
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
    "note": "A create-shaped Affidavit: entityId null, previousValue null on every field (AF-3), one field left with no provenance so the record carries an `Empty` tag at confidence 0 rather than omitting the field (AF-1). The three numbers are AF-2's: the aggregate is 0 because one proposed field is `Empty`, the populated minimum is 0.9 over the field that is not, and one field is counted empty. The canonical bytes sort every key by code point at every level, so `aggregateConfidence` precedes `conversationTurn` precedes `createdAt` regardless of the order `toWire` emits them in.",
    "input": {
      "protocolVersion": "0.1.0",
      "operationType": "create",
      "entityType": "Widget",
      "entityId": null,
      "fields": [
        {
          "name": "Status",
          "kind": "enum",
          "value": "Active",
          "previousValue": null,
          "provenance": {
            "current": {
              "source": "Conversation",
              "confidence": 0.9,
              "note": "Extracted from the turn",
              "at": "2026-09-04T09:00:00.000Z",
              "conversationTurn": 1,
              "binding": null,
            },
            "prior": [],
          },
          "isMandatory": true,
        },
        {
          "name": "Owner",
          "kind": "text",
          "value": null,
          "previousValue": null,
          "provenance": {
            "current": {
              "source": "Empty",
              "confidence": 0,
              "note": "Provenance unknown",
              "at": "2026-09-04T09:00:00.000Z",
              "conversationTurn": null,
              "binding": null,
            },
            "prior": [],
          },
          "isMandatory": false,
        },
      ],
      "aggregateConfidence": 0,
      "populatedConfidence": 0.9,
      "emptyFieldCount": 1,
      "conversationTurn": 1,
      "createdAt": "2026-09-04T09:00:00.000Z",
    },
    "amendments": null,
    "reviewerAct": null,
    "expectedBytesUtf8": "{\"aggregateConfidence\":0,\"conversationTurn\":1,\"createdAt\":\"2026-09-04T09:00:00.000Z\",\"emptyFieldCount\":1,\"entityId\":null,\"entityType\":\"Widget\",\"fields\":[{\"isMandatory\":true,\"kind\":\"enum\",\"name\":\"Status\",\"previousValue\":null,\"provenance\":{\"current\":{\"at\":\"2026-09-04T09:00:00.000Z\",\"binding\":null,\"confidence\":0.9,\"conversationTurn\":1,\"note\":\"Extracted from the turn\",\"source\":\"Conversation\"},\"prior\":[]},\"value\":\"Active\"},{\"isMandatory\":false,\"kind\":\"text\",\"name\":\"Owner\",\"previousValue\":null,\"provenance\":{\"current\":{\"at\":\"2026-09-04T09:00:00.000Z\",\"binding\":null,\"confidence\":0,\"conversationTurn\":null,\"note\":\"Provenance unknown\",\"source\":\"Empty\"},\"prior\":[]},\"value\":null}],\"operationType\":\"create\",\"populatedConfidence\":0.9,\"protocolVersion\":\"0.1.0\"}",
    "expectedSha256": "089ac04a11d52441e2eded9c518a4d3ede89f04c911fd9531741d66d9ff82281",
  },
  // 02-update-shaped.json
  {
    "id": "canonical/update-shaped",
    "rules": [
      "SR-1",
      "AF-3",
      "PV-1",
    ],
    "note": "An update-shaped Affidavit: entityId set, a previousValue on every proposed field, one of them null because the field had no stored value (AF-3). `DueDate`'s chain was merged rather than minted, so a superseded `Inferred` tag sits in `prior` behind the `Conversation` tag that beat it (PV-1) — which pins that array order is data and is never sorted. The two bound tags carry the v0.1 binding shapes: an `external-ref` naming a system and a record within it, and a `computation-ref` naming a re-runnable rule and what it consumed. `null` is written; a property whose value is undefined is omitted, which no JSON file can express — `test/canonical.test.ts` covers that half.",
    "input": {
      "protocolVersion": "0.1.0",
      "operationType": "update",
      "entityType": "Invoice",
      "entityId": "INV-2026-0044",
      "fields": [
        {
          "name": "DueDate",
          "kind": "date",
          "value": "2026-10-01",
          "previousValue": "2026-09-15",
          "provenance": {
            "current": {
              "source": "Conversation",
              "confidence": 0.82,
              "note": "Extracted from the turn",
              "at": "2026-09-04T09:00:00.000Z",
              "conversationTurn": 4,
              "binding": null,
            },
            "prior": [
              {
                "source": "Inferred",
                "confidence": 0.4,
                "note": "Guessed from the payment terms",
                "at": "2026-09-04T09:00:00.000Z",
                "conversationTurn": 4,
                "binding": null,
              },
            ],
          },
          "isMandatory": true,
        },
        {
          "name": "Reference",
          "kind": "text",
          "value": "PO-77",
          "previousValue": null,
          "provenance": {
            "current": {
              "source": "External",
              "confidence": 1,
              "note": "Read from the purchase-order system",
              "at": "2026-09-04T09:00:00.000Z",
              "conversationTurn": null,
              "binding": {
                "kind": "external-ref",
                "ref": {
                  "system": "erp",
                  "recordId": "purchase-order/77",
                },
              },
            },
            "prior": [],
          },
          "isMandatory": false,
        },
        {
          "name": "Total",
          "kind": "number",
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
              "note": "Sum of the line items",
              "at": "2026-09-04T09:00:00.000Z",
              "conversationTurn": null,
              "binding": {
                "kind": "computation-ref",
                "ref": {
                  "rule": "invoice.total@v3",
                  "inputs": [
                    "LineItems",
                  ],
                },
              },
            },
            "prior": [],
          },
          "isMandatory": true,
        },
      ],
      "aggregateConfidence": 0.82,
      "populatedConfidence": 0.82,
      "emptyFieldCount": 0,
      "conversationTurn": 4,
      "createdAt": "2026-09-04T09:00:00.000Z",
    },
    "amendments": null,
    "reviewerAct": null,
    "expectedBytesUtf8": "{\"aggregateConfidence\":0.82,\"conversationTurn\":4,\"createdAt\":\"2026-09-04T09:00:00.000Z\",\"emptyFieldCount\":0,\"entityId\":\"INV-2026-0044\",\"entityType\":\"Invoice\",\"fields\":[{\"isMandatory\":true,\"kind\":\"date\",\"name\":\"DueDate\",\"previousValue\":\"2026-09-15\",\"provenance\":{\"current\":{\"at\":\"2026-09-04T09:00:00.000Z\",\"binding\":null,\"confidence\":0.82,\"conversationTurn\":4,\"note\":\"Extracted from the turn\",\"source\":\"Conversation\"},\"prior\":[{\"at\":\"2026-09-04T09:00:00.000Z\",\"binding\":null,\"confidence\":0.4,\"conversationTurn\":4,\"note\":\"Guessed from the payment terms\",\"source\":\"Inferred\"}]},\"value\":\"2026-10-01\"},{\"isMandatory\":false,\"kind\":\"text\",\"name\":\"Reference\",\"previousValue\":null,\"provenance\":{\"current\":{\"at\":\"2026-09-04T09:00:00.000Z\",\"binding\":{\"kind\":\"external-ref\",\"ref\":{\"recordId\":\"purchase-order/77\",\"system\":\"erp\"}},\"confidence\":1,\"conversationTurn\":null,\"note\":\"Read from the purchase-order system\",\"source\":\"External\"},\"prior\":[]},\"value\":\"PO-77\"},{\"isMandatory\":true,\"kind\":\"number\",\"name\":\"Total\",\"previousValue\":{\"amount\":\"40.00\",\"currency\":\"GBP\"},\"provenance\":{\"current\":{\"at\":\"2026-09-04T09:00:00.000Z\",\"binding\":{\"kind\":\"computation-ref\",\"ref\":{\"inputs\":[\"LineItems\"],\"rule\":\"invoice.total@v3\"}},\"confidence\":1,\"conversationTurn\":null,\"note\":\"Sum of the line items\",\"source\":\"Computed\"},\"prior\":[]},\"value\":{\"amount\":\"4000.10\",\"currency\":\"GBP\"}}],\"operationType\":\"update\",\"populatedConfidence\":0.82,\"protocolVersion\":\"0.1.0\"}",
    "expectedSha256": "a93d55c94d919d4c034709729d1fbbf792e2875afc67a3a42a4c3b2a522763e1",
  },
  // 03-wire-evidence-card-request.json
  {
    "id": "canonical/wire-evidence-card-request",
    "rules": [
      "SR-1",
      "SR-3",
    ],
    "note": "The proposal behind the protocol seed fixture `wire/evidence-card-request` (Sakwala/affiant-protocol), as the v0.1 record. The same two fields, the same values and the same grades; what changed is where they live. `allowedValues` and `pattern` are gone from the fields — v0.1 puts a reviewer surface's rendering hints on the card envelope, because nothing swears to them and a hash a grant is checked against must not move when an input is restyled (SR-3). `warnings` and `requiresConfirmation` are gone for the same reason. `confidence: 1.0` in the seed file is the JSON number 1 after parsing and serializes as `1` — a canonical form has one spelling per value. The seed's `aggregateConfidence` of 0.95 was the mean the shipped .NET projection computes; AF-2 makes it the minimum, so this record reads 0.9.",
    "input": {
      "protocolVersion": "0.1.0",
      "operationType": "update",
      "entityType": "Widget",
      "entityId": "W-1",
      "fields": [
        {
          "name": "Status",
          "kind": "enum",
          "value": "Active",
          "previousValue": null,
          "provenance": {
            "current": {
              "source": "UserStated",
              "confidence": 1,
              "note": "User stated: Status",
              "at": "2026-09-04T09:00:00.000Z",
              "conversationTurn": null,
              "binding": null,
            },
            "prior": [],
          },
          "isMandatory": true,
        },
        {
          "name": "Weight",
          "kind": "number",
          "value": 12.5,
          "previousValue": 10,
          "provenance": {
            "current": {
              "source": "Conversation",
              "confidence": 0.9,
              "note": "Extracted from search_widget",
              "at": "2026-09-04T09:00:00.000Z",
              "conversationTurn": 3,
              "binding": null,
            },
            "prior": [],
          },
          "isMandatory": false,
        },
      ],
      "aggregateConfidence": 0.9,
      "populatedConfidence": 0.9,
      "emptyFieldCount": 0,
      "conversationTurn": 3,
      "createdAt": "2026-09-04T09:00:00.000Z",
    },
    "amendments": null,
    "reviewerAct": null,
    "expectedBytesUtf8": "{\"aggregateConfidence\":0.9,\"conversationTurn\":3,\"createdAt\":\"2026-09-04T09:00:00.000Z\",\"emptyFieldCount\":0,\"entityId\":\"W-1\",\"entityType\":\"Widget\",\"fields\":[{\"isMandatory\":true,\"kind\":\"enum\",\"name\":\"Status\",\"previousValue\":null,\"provenance\":{\"current\":{\"at\":\"2026-09-04T09:00:00.000Z\",\"binding\":null,\"confidence\":1,\"conversationTurn\":null,\"note\":\"User stated: Status\",\"source\":\"UserStated\"},\"prior\":[]},\"value\":\"Active\"},{\"isMandatory\":false,\"kind\":\"number\",\"name\":\"Weight\",\"previousValue\":10,\"provenance\":{\"current\":{\"at\":\"2026-09-04T09:00:00.000Z\",\"binding\":null,\"confidence\":0.9,\"conversationTurn\":3,\"note\":\"Extracted from search_widget\",\"source\":\"Conversation\"},\"prior\":[]},\"value\":12.5}],\"operationType\":\"update\",\"populatedConfidence\":0.9,\"protocolVersion\":\"0.1.0\"}",
    "expectedSha256": "f621bb3e2e20e50672f0a9afba2f2d837c24a15be4592261bfd206dca48e8bbc",
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
    "note": "The same Affidavit as `canonical/wire-evidence-card-request`, with a reviewer's accepted amendments applied: `Status` changed to Retired, `Weight` cleared with an explicit null (DK-2 — null clears, an absent key leaves untouched). The bytes and the hash differ from the unamended vector, and that difference is the point: an execution grant minted for the proposal a reviewer was shown must not validate the proposal they amended.\n\n`amendedInput` is the accepted state those amendments produce — the document the bytes below are actually taken over. It is written down rather than left implicit because SR-1 defines the canonical form over the accepted state *as the Affidavit schema defines it*, and a state nobody can hold against the schema is a state nobody has checked. It is produced by the model, not typed: the same `amendmentTag` a Docket row's accepted state is written with, so the bytes a decision produces and the row that decision writes cannot disagree.\n\nFour things to see in it. (1) The tag in force is a whole provenance tag — source, confidence, the note naming who amended the field, the instant of the decision, the conversation turn, and a `reviewer-act` binding naming the decision *and when it was made*. PV-2's binding is the pointer an auditor follows years later, and a pointer that cannot say when the act happened cannot place it against the proposal's own instants. (2) The displaced machine tag is preserved beneath it in `prior`, so a card can still show what was proposed. (3) `Weight` is gone from `fields[]` rather than present holding null: it is optional, and a reviewer clearing an optional field is saying the write no longer proposes it; AF-1 says a field the operation does not propose is absent rather than present with nothing in it. A mandatory field cleared the same way would stay, tagged `Empty` at confidence 0. (4) All three confidence numbers are recomputed over what is left (AF-4), not carried over from the proposal — an accepted state whose only field is sworn at 1 while `populatedConfidence` still read the machine's pre-correction 0.9 would contradict itself, and those are the bytes a grant binds to.",
    "input": {
      "protocolVersion": "0.1.0",
      "operationType": "update",
      "entityType": "Widget",
      "entityId": "W-1",
      "fields": [
        {
          "name": "Status",
          "kind": "enum",
          "value": "Active",
          "previousValue": null,
          "provenance": {
            "current": {
              "source": "UserStated",
              "confidence": 1,
              "note": "User stated: Status",
              "at": "2026-09-04T09:00:00.000Z",
              "conversationTurn": null,
              "binding": null,
            },
            "prior": [],
          },
          "isMandatory": true,
        },
        {
          "name": "Weight",
          "kind": "number",
          "value": 12.5,
          "previousValue": 10,
          "provenance": {
            "current": {
              "source": "Conversation",
              "confidence": 0.9,
              "note": "Extracted from search_widget",
              "at": "2026-09-04T09:00:00.000Z",
              "conversationTurn": 3,
              "binding": null,
            },
            "prior": [],
          },
          "isMandatory": false,
        },
      ],
      "aggregateConfidence": 0.9,
      "populatedConfidence": 0.9,
      "emptyFieldCount": 0,
      "conversationTurn": 3,
      "createdAt": "2026-09-04T09:00:00.000Z",
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
    "amendedInput": {
      "protocolVersion": "0.1.0",
      "operationType": "update",
      "entityType": "Widget",
      "entityId": "W-1",
      "fields": [
        {
          "name": "Status",
          "kind": "enum",
          "value": "Retired",
          "previousValue": null,
          "provenance": {
            "current": {
              "source": "UserStated",
              "confidence": 1,
              "note": "Amended by ana on Docket entry 8f14e45f-ceea-467e-bd76-000000000001",
              "at": "2026-09-04T09:12:00.000Z",
              "conversationTurn": 3,
              "binding": {
                "kind": "reviewer-act",
                "ref": {
                  "entryId": "8f14e45f-ceea-467e-bd76-000000000001",
                  "decisionAt": "2026-09-04T09:12:00.000Z",
                },
              },
            },
            "prior": [
              {
                "source": "UserStated",
                "confidence": 1,
                "note": "User stated: Status",
                "at": "2026-09-04T09:00:00.000Z",
                "conversationTurn": null,
                "binding": null,
              },
            ],
          },
          "isMandatory": true,
        },
      ],
      "aggregateConfidence": 1,
      "populatedConfidence": 1,
      "emptyFieldCount": 0,
      "conversationTurn": 3,
      "createdAt": "2026-09-04T09:00:00.000Z",
    },
    "expectedBytesUtf8": "{\"aggregateConfidence\":1,\"conversationTurn\":3,\"createdAt\":\"2026-09-04T09:00:00.000Z\",\"emptyFieldCount\":0,\"entityId\":\"W-1\",\"entityType\":\"Widget\",\"fields\":[{\"isMandatory\":true,\"kind\":\"enum\",\"name\":\"Status\",\"previousValue\":null,\"provenance\":{\"current\":{\"at\":\"2026-09-04T09:12:00.000Z\",\"binding\":{\"kind\":\"reviewer-act\",\"ref\":{\"decisionAt\":\"2026-09-04T09:12:00.000Z\",\"entryId\":\"8f14e45f-ceea-467e-bd76-000000000001\"}},\"confidence\":1,\"conversationTurn\":3,\"note\":\"Amended by ana on Docket entry 8f14e45f-ceea-467e-bd76-000000000001\",\"source\":\"UserStated\"},\"prior\":[{\"at\":\"2026-09-04T09:00:00.000Z\",\"binding\":null,\"confidence\":1,\"conversationTurn\":null,\"note\":\"User stated: Status\",\"source\":\"UserStated\"}]},\"value\":\"Retired\"}],\"operationType\":\"update\",\"populatedConfidence\":1,\"protocolVersion\":\"0.1.0\"}",
    "expectedSha256": "06ae8cd77413064ac6ac5278176d8a81faa0c6199c197a3dc83f0ed5136657e3",
  },
  // 05-key-order-stress.json
  {
    "id": "canonical/key-order-stress",
    "rules": [
      "SR-1",
    ],
    "note": "An Affidavit whose one field carries, as its value, every key-ordering case a naive comparator gets wrong — written in reverse order at every level. U+E000 (private use) must sort BEFORE U+1F600 (an emoji) because SR-1 sorts by Unicode code point and 0xE000 < 0x1F600; a comparator using JavaScript's < compares UTF-16 code units, sees the emoji's leading surrogate 0xD83D, and puts the emoji first. Also here: an integer-shaped key (JavaScript reorders those to the front of Object.keys on its own), a precomposed e-acute against the same letter decomposed (two distinct keys, never normalized), a key that is a prefix of another, keys differing only by case, the empty key, and a key carrying a solidus, which JSON escaping must not touch. The record's own keys are sorted by the same rule at the top level, where `toWire` emits them in a different order from the one they are written in. `kind` is a rendering hint and never constrains a value, which is why a field of kind `text` may carry an object.",
    "input": {
      "protocolVersion": "0.1.0",
      "operationType": "create",
      "entityType": "Widget",
      "entityId": null,
      "fields": [
        {
          "name": "Payload",
          "kind": "text",
          "value": {
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
          "previousValue": null,
          "provenance": {
            "current": {
              "source": "Conversation",
              "confidence": 0.5,
              "note": "Taken verbatim from the turn",
              "at": "2026-09-04T09:00:00.000Z",
              "conversationTurn": null,
              "binding": null,
            },
            "prior": [],
          },
          "isMandatory": true,
        },
      ],
      "aggregateConfidence": 0.5,
      "populatedConfidence": 0.5,
      "emptyFieldCount": 0,
      "conversationTurn": null,
      "createdAt": "2026-09-04T09:00:00.000Z",
    },
    "amendments": null,
    "reviewerAct": null,
    "expectedBytesUtf8": "{\"aggregateConfidence\":0.5,\"conversationTurn\":null,\"createdAt\":\"2026-09-04T09:00:00.000Z\",\"emptyFieldCount\":0,\"entityId\":null,\"entityType\":\"Widget\",\"fields\":[{\"isMandatory\":true,\"kind\":\"text\",\"name\":\"Payload\",\"previousValue\":null,\"provenance\":{\"current\":{\"at\":\"2026-09-04T09:00:00.000Z\",\"binding\":null,\"confidence\":0.5,\"conversationTurn\":null,\"note\":\"Taken verbatim from the turn\",\"source\":\"Conversation\"},\"prior\":[]},\"value\":{\"alpha\":\"written last, sorts first\",\"middle\":[{\"first\":1,\"second\":2},{\"a\":{\"x\":true,\"y\":null},\"b\":[3,2,1]}],\"zeta\":{\"\":\"the empty key\",\"10\":\"integer-shaped key\",\"2\":\"another integer-shaped key\",\"A\":\"uppercase A\",\"B\":\"uppercase B\",\"a\":\"prefix\",\"a/b\":\"a solidus, which JSON never escapes\",\"ab\":\"prefix plus one\",\"b\":\"lowercase b\",\"é\":\"e plus combining acute, U+0065 U+0301\",\"é\":\"e-acute precomposed, U+00E9\",\"\":\"private use, U+E000\",\"😀\":\"emoji key, U+1F600\"}}}],\"operationType\":\"create\",\"populatedConfidence\":0.5,\"protocolVersion\":\"0.1.0\"}",
    "expectedSha256": "a55f7422693c3469c8e5da30977dbbccb23231b693a678290203187ec77efe2c",
  },
  // 06-number-forms.json
  {
    "id": "canonical/number-forms",
    "rules": [
      "SR-1",
    ],
    "note": "An Affidavit whose one field carries every number form the rule has to decide. `1.0` is the number 1 once parsed and is written `1` — a canonical form has one spelling per value. `1e21` is written positionally, not as `1e+21`: SR-1 says shortest round-trip decimal, and this implementation writes those digits with the decimal point in place rather than adopting ECMAScript's exponent thresholds, so a second implementation has to agree about digits and not about a spelling. `0.1 + 0.2` is the double 0.30000000000000004 and is written with all of it; rounding it would be the framework deciding what was sworn to. `9007199254740993` is already the double 9007199254740992 by the time this function sees it — the parser rounded it, and the canonical bytes below say so; no canonical form can recover a digit the parse threw away; a host that needs exact integers beyond 2^53 carries them as strings, as money already does (SR-2). Two forms are deliberately NOT in this file: a negative zero, because JSON parsers disagree about whether they preserve the sign and a vector must mean the same thing to every implementation that reads it, and the non-finite numbers, which JSON cannot spell at all. `test/canonical.test.ts` covers both — that `-0` is written `0`, and that NaN and the infinities raise a RangeError.",
    "input": {
      "protocolVersion": "0.1.0",
      "operationType": "create",
      "entityType": "Widget",
      "entityId": null,
      "fields": [
        {
          "name": "Measurements",
          "kind": "number",
          "value": {
            "one": 1,
            "integer": 42,
            "negativeInteger": -17,
            "half": 0.5,
            "sumOfTenths": 0.30000000000000004,
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
          "previousValue": null,
          "provenance": {
            "current": {
              "source": "Computed",
              "confidence": 1,
              "note": "Read off the instrument",
              "at": "2026-09-04T09:00:00.000Z",
              "conversationTurn": null,
              "binding": {
                "kind": "computation-ref",
                "ref": {
                  "rule": "instrument.readings@v1",
                  "inputs": [],
                },
              },
            },
            "prior": [],
          },
          "isMandatory": true,
        },
      ],
      "aggregateConfidence": 1,
      "populatedConfidence": 1,
      "emptyFieldCount": 0,
      "conversationTurn": null,
      "createdAt": "2026-09-04T09:00:00.000Z",
    },
    "amendments": null,
    "reviewerAct": null,
    "expectedBytesUtf8": "{\"aggregateConfidence\":1,\"conversationTurn\":null,\"createdAt\":\"2026-09-04T09:00:00.000Z\",\"emptyFieldCount\":0,\"entityId\":null,\"entityType\":\"Widget\",\"fields\":[{\"isMandatory\":true,\"kind\":\"number\",\"name\":\"Measurements\",\"previousValue\":null,\"provenance\":{\"current\":{\"at\":\"2026-09-04T09:00:00.000Z\",\"binding\":{\"kind\":\"computation-ref\",\"ref\":{\"inputs\":[],\"rule\":\"instrument.readings@v1\"}},\"confidence\":1,\"conversationTurn\":null,\"note\":\"Read off the instrument\",\"source\":\"Computed\"},\"prior\":[]},\"value\":{\"beyond2p53\":9007199254740992,\"exp21\":1000000000000000000000,\"exp23\":123456789012345690000000,\"half\":0.5,\"integer\":42,\"negativeInteger\":-17,\"negativeTiny\":-0.000000012345,\"nested\":[0,-0.5,0.000001,0.00001,1000000,100000000000000000000],\"one\":1,\"sumOfTenths\":0.30000000000000004,\"tinier\":0.0000000015,\"tiny\":0.0000001}}],\"operationType\":\"create\",\"populatedConfidence\":1,\"protocolVersion\":\"0.1.0\"}",
    "expectedSha256": "8ecf50219a30e19bc2ba946b71ad987c7bfcb3e4f2cf40bd4e2646c887cfeb18",
  },
  // 07-money-and-escapes.json
  {
    "id": "canonical/money-and-escapes",
    "rules": [
      "SR-1",
      "SR-2",
    ],
    "note": "Money as two strings, never a number (SR-2): a GBP amount with cents a float would lose, a JPY amount with no minor units, a negative amount, and an amount far beyond what a double can hold. Alongside them the string rules: only what JSON requires is escaped, so a quote, a backslash and the C0 controls are escaped (with the two-character forms where JSON has them, lowercase u-escapes otherwise) while every non-ASCII character is written as itself and encoded as UTF-8 — an e-acute is two bytes, not six — and a solidus is never escaped. The escaping rules apply to keys and to values alike, which is why the note on one tag carries a quote of its own.",
    "input": {
      "protocolVersion": "0.1.0",
      "operationType": "update",
      "entityType": "Invoice",
      "entityId": "INV-2026-0045",
      "fields": [
        {
          "name": "Total",
          "kind": "number",
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
              "note": "Sum of the line items",
              "at": "2026-09-04T09:00:00.000Z",
              "conversationTurn": null,
              "binding": {
                "kind": "computation-ref",
                "ref": {
                  "rule": "invoice.total@v3",
                  "inputs": [
                    "LineItems",
                  ],
                },
              },
            },
            "prior": [],
          },
          "isMandatory": true,
        },
        {
          "name": "Refund",
          "kind": "number",
          "value": {
            "currency": "JPY",
            "amount": "-1250",
          },
          "previousValue": null,
          "provenance": {
            "current": {
              "source": "UserStated",
              "confidence": 1,
              "note": "Reviewer typed it into the \"Refund\" box",
              "at": "2026-09-04T09:00:00.000Z",
              "conversationTurn": null,
              "binding": {
                "kind": "form-input",
                "ref": {
                  "field": "Refund",
                },
              },
            },
            "prior": [],
          },
          "isMandatory": false,
        },
        {
          "name": "Ceiling",
          "kind": "number",
          "value": {
            "amount": "123456789012345678901234567890.99",
            "currency": "LKR",
          },
          "previousValue": null,
          "provenance": {
            "current": {
              "source": "External",
              "confidence": 1,
              "note": "Read from the ledger",
              "at": "2026-09-04T09:00:00.000Z",
              "conversationTurn": null,
              "binding": {
                "kind": "external-ref",
                "ref": {
                  "system": "ledger",
                  "recordId": "limit/9",
                },
              },
            },
            "prior": [],
          },
          "isMandatory": false,
        },
        {
          "name": "Memo",
          "kind": "text",
          "value": "quote \" backslash \\ tab \t newline \n cr \r backspace \b formfeed \f nul \u0000 unit-separator \u001f solidus a/b accented éüñ script 日本語 emoji 😀 private-use ",
          "previousValue": null,
          "provenance": {
            "current": {
              "source": "Conversation",
              "confidence": 0.7,
              "note": "Taken verbatim from the turn",
              "at": "2026-09-04T09:00:00.000Z",
              "conversationTurn": 2,
              "binding": null,
            },
            "prior": [],
          },
          "isMandatory": false,
        },
      ],
      "aggregateConfidence": 0.7,
      "populatedConfidence": 0.7,
      "emptyFieldCount": 0,
      "conversationTurn": 2,
      "createdAt": "2026-09-04T09:00:00.000Z",
    },
    "amendments": null,
    "reviewerAct": null,
    "expectedBytesUtf8": "{\"aggregateConfidence\":0.7,\"conversationTurn\":2,\"createdAt\":\"2026-09-04T09:00:00.000Z\",\"emptyFieldCount\":0,\"entityId\":\"INV-2026-0045\",\"entityType\":\"Invoice\",\"fields\":[{\"isMandatory\":true,\"kind\":\"number\",\"name\":\"Total\",\"previousValue\":{\"amount\":\"0\",\"currency\":\"GBP\"},\"provenance\":{\"current\":{\"at\":\"2026-09-04T09:00:00.000Z\",\"binding\":{\"kind\":\"computation-ref\",\"ref\":{\"inputs\":[\"LineItems\"],\"rule\":\"invoice.total@v3\"}},\"confidence\":1,\"conversationTurn\":null,\"note\":\"Sum of the line items\",\"source\":\"Computed\"},\"prior\":[]},\"value\":{\"amount\":\"4000.10\",\"currency\":\"GBP\"}},{\"isMandatory\":false,\"kind\":\"number\",\"name\":\"Refund\",\"previousValue\":null,\"provenance\":{\"current\":{\"at\":\"2026-09-04T09:00:00.000Z\",\"binding\":{\"kind\":\"form-input\",\"ref\":{\"field\":\"Refund\"}},\"confidence\":1,\"conversationTurn\":null,\"note\":\"Reviewer typed it into the \\\"Refund\\\" box\",\"source\":\"UserStated\"},\"prior\":[]},\"value\":{\"amount\":\"-1250\",\"currency\":\"JPY\"}},{\"isMandatory\":false,\"kind\":\"number\",\"name\":\"Ceiling\",\"previousValue\":null,\"provenance\":{\"current\":{\"at\":\"2026-09-04T09:00:00.000Z\",\"binding\":{\"kind\":\"external-ref\",\"ref\":{\"recordId\":\"limit/9\",\"system\":\"ledger\"}},\"confidence\":1,\"conversationTurn\":null,\"note\":\"Read from the ledger\",\"source\":\"External\"},\"prior\":[]},\"value\":{\"amount\":\"123456789012345678901234567890.99\",\"currency\":\"LKR\"}},{\"isMandatory\":false,\"kind\":\"text\",\"name\":\"Memo\",\"previousValue\":null,\"provenance\":{\"current\":{\"at\":\"2026-09-04T09:00:00.000Z\",\"binding\":null,\"confidence\":0.7,\"conversationTurn\":2,\"note\":\"Taken verbatim from the turn\",\"source\":\"Conversation\"},\"prior\":[]},\"value\":\"quote \\\" backslash \\\\ tab \\t newline \\n cr \\r backspace \\b formfeed \\f nul \\u0000 unit-separator \\u001f solidus a/b accented éüñ script 日本語 emoji 😀 private-use \"}],\"operationType\":\"update\",\"populatedConfidence\":0.7,\"protocolVersion\":\"0.1.0\"}",
    "expectedSha256": "95bb5dbbd77fd340c16764245de08e887e807733e2983cef31c59c55467a2dc4",
  },
];

/** A vector by id, for a test that names one. */
export function canonicalVector(id: string): CanonicalVector {
  const found = canonicalVectors.find((vector) => vector.id === id);
  if (found === undefined) throw new Error(`no canonical vector with id ${JSON.stringify(id)}`);
  return found;
}
