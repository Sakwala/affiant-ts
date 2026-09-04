// GENERATED FILE — DO NOT EDIT BY HAND.
// Produced by scripts/generate-sources.mjs from protocol/, which is a byte-for-byte
// copy of Sakwala/affiant-protocol at 242964faba9e6852b8fbfcdef6c3296b5c705f59.
// Source: protocol/fixtures/{gate,decide,sequence-a,sequence-c,canonical}/ and protocol/conformance/
// To change it: edit protocol/PIN, run `pnpm sync-protocol`, then `pnpm generate`.

import type { JsonSchemaDocument } from "./schemas.js";

/** Any value JSON can carry. Re-declared here so this module imports no types it does not need. */
type JsonData = string | number | boolean | null | JsonData[] | { [key: string]: JsonData };

/**
 * The ref of `Sakwala/affiant-protocol` every document in this module was taken
 * from — a git tag, or a full commit while a version's text is on the default
 * branch and its tag has not been cut. A driver puts this in the `protocolTag` of
 * every result document it emits and of the parity manifest it is asserted against:
 * a result whose ref is not the one the manifest names is not a comparison.
 */
export const PROTOCOL_PIN = "242964faba9e6852b8fbfcdef6c3296b5c705f59" as const;

/**
 * One declarative conformance fixture: a wiring, a sequence of acts, and what must
 * then be true. The format is the rulebook's `conformance/RUNNER.md` and its
 * machine-readable form is {@link fixtureSchema}; `given` and `expect` are left as
 * data here because this package does not run them — a driver validates a document
 * against the schema and hands it to its own implementation's runner.
 */
export interface ConformanceFixtureDocument {
  /** A stable id, unique across the set and prefixed by the set it belongs to. Never renamed. */
  readonly id: string;
  /** The rulebook ids this fixture checks. At least one. */
  readonly rules: readonly string[];
  /** What the fixture asserts, in a sentence. The test name in every runner. */
  readonly title: string;
  /** The wiring, the acts, and the turn they happen in. */
  readonly given: JsonData;
  /** What must be true afterwards. Every matcher is partial. */
  readonly expect: JsonData;
}

/**
 * One canonical byte vector: an Affidavit, the amendments accepted on it, the
 * decision they arrived on, and the exact bytes and digest those produce (SR-1).
 * A different document shape from a fixture, and not run through the step
 * machinery. A driver **reproduces** the bytes and the digest through the
 * implementation's own exported canonical-hash helper; it never re-derives them,
 * and it never regenerates them when they disagree — a disagreement is the finding.
 */
export interface CanonicalVectorDocument {
  readonly id: string;
  readonly rules: readonly string[];
  /** What this vector stresses, and why. */
  readonly note: string;
  /** The input Affidavit. */
  readonly input: JsonData;
  /** The amendments accepted on it, or `null`. */
  readonly amendments: JsonData;
  /** The reviewer act the amendments arrived on, or `null`. */
  readonly reviewerAct: JsonData;
  /** The exact canonical bytes, as a UTF-8 string. */
  readonly expectedBytesUtf8: string;
  /** The SHA-256 of those bytes, as 64 lowercase hex characters. */
  readonly expectedSha256: string;
}

/**
 * The `"conformance"` section of `conformance/fixtures/MANIFEST.json`: every
 * promoted document with its id, its file, the rules it checks, the set it belongs
 * to, and its negative-oracle entry. A driver runs **every fixture this lists** —
 * running a subset and reporting a pass is the failure mode the whole arrangement
 * exists to prevent.
 */
export const conformanceManifest = {
  "protocolVersion": "0.1.0",
  "$note": "The promoted conformance suite: the reference implementation's declarative fixtures and canonical byte vectors, copied here unchanged in id, file name and content (conformance/fixtures/PROMOTED_FROM names the commit). A fixture is a wiring, a sequence of acts and what must then be true; the format is conformance/RUNNER.md and the schema it is checked against is conformance/fixture.schema.json. `oracle` is the negative oracle of conformance/ORACLE.md: a non-null value names a release the fixture MUST fail against and the shipped defect it refutes, and the two must agree with ORACLE.md exactly — the lint checks that. `oracle: null` claims nothing about that release; the parity manifest of each implementation records what it actually does. The canonical vectors are a different document shape (an input, the amendments accepted on it and the exact bytes and SHA-256 they canonicalise to) and no known release violates them, so they are marked acceptedOnReview.",
  "promotedFrom": {
    "repository": "Sakwala/affiant-ts",
    "commit": "c4591eaf332483e2a5a47e161410feaed718aa29",
    "package": "@affiant/core 0.1.0-alpha.0",
    "path": "packages/core/test/fixtures",
    "runner": "@affiant/core/testing — runFixture / runFixtureDir, documented in conformance/RUNNER.md",
    "date": "2026-09-04",
    "unchanged": "Byte-identical. Ids, file names and content are the reference implementation's; a parity manifest cites an id by name, so a rename would silently change what a published document refers to."
  },
  "sets": {
    "gate": "the pipeline: substance, provenance, the policy chain, deadlines, filing",
    "decide": "decisions: authority, attestation, amendments, execution, lineage",
    "sequence-a": "a chat capture end to end — a tool call through to an executor",
    "sequence-c": "a capture over a trusted relay, decided or auto-approved",
    "canonical": "the canonical-serialization byte vectors (SR-1): a different document shape, see conformance/RUNNER.md"
  },
  "oracleSource": "conformance/ORACLE.md",
  "fixtures": [
    {
      "id": "gate/substance-hollow-refused",
      "file": "gate/01-substance-hollow-refused.json",
      "rules": [
        "GT-3"
      ],
      "set": "gate",
      "oracle": {
        "mustFailOn": [
          "dotnet@1.0.0-beta.1"
        ],
        "defect": "Substance (a value with `Empty` provenance) is checked at test time only; the runtime files hollow Affidavits"
      }
    },
    {
      "id": "gate/substance-zero-field-refused",
      "file": "gate/02-substance-zero-field-refused.json",
      "rules": [
        "GT-3"
      ],
      "set": "gate",
      "oracle": {
        "mustFailOn": [
          "dotnet@1.0.0-beta.1"
        ],
        "defect": "Substance (a value with `Empty` provenance) is checked at test time only; the runtime files hollow Affidavits"
      }
    },
    {
      "id": "gate/ttl-from-verdict",
      "file": "gate/03-ttl-from-verdict.json",
      "rules": [
        "GT-4"
      ],
      "set": "gate",
      "oracle": {
        "mustFailOn": [
          "dotnet@1.0.0-beta.1"
        ],
        "defect": "The time-to-live is stamped from one global default before the policy chain runs"
      }
    },
    {
      "id": "gate/ttl-from-policy-default",
      "file": "gate/04-ttl-from-policy-default.json",
      "rules": [
        "GT-4"
      ],
      "set": "gate",
      "oracle": {
        "mustFailOn": [
          "dotnet@1.0.0-beta.1"
        ],
        "defect": "The time-to-live is stamped from one global default before the policy chain runs"
      }
    },
    {
      "id": "gate/ttl-from-gate-default",
      "file": "gate/05-ttl-from-gate-default.json",
      "rules": [
        "GT-4"
      ],
      "set": "gate",
      "oracle": null
    },
    {
      "id": "gate/standing-order-by-the-book",
      "file": "gate/06-standing-order-by-the-book.json",
      "rules": [
        "GT-5",
        "AZ-1"
      ],
      "set": "gate",
      "oracle": {
        "mustFailOn": [
          "dotnet@1.0.0-beta.1"
        ],
        "defect": "No attestation record on the row: nothing says who or what approved a write"
      }
    },
    {
      "id": "gate/standing-order-threshold-under",
      "file": "gate/07-standing-order-threshold-under.json",
      "rules": [
        "GT-5"
      ],
      "set": "gate",
      "oracle": null
    },
    {
      "id": "gate/standing-order-threshold-over",
      "file": "gate/08-standing-order-threshold-over.json",
      "rules": [
        "GT-5"
      ],
      "set": "gate",
      "oracle": null
    },
    {
      "id": "gate/standing-order-unbound-input",
      "file": "gate/09-standing-order-unbound-input.json",
      "rules": [
        "PV-4"
      ],
      "set": "gate",
      "oracle": null
    },
    {
      "id": "gate/standing-order-bound-input",
      "file": "gate/10-standing-order-bound-input.json",
      "rules": [
        "PV-4",
        "AZ-1"
      ],
      "set": "gate",
      "oracle": null
    },
    {
      "id": "gate/multiparty-blocked",
      "file": "gate/11-multiparty-blocked.json",
      "rules": [
        "AZ-4"
      ],
      "set": "gate",
      "oracle": {
        "mustFailOn": [
          "dotnet@1.0.0-beta.1"
        ],
        "defect": "A `MultiParty` requirement is routed to the single-card branch — one approval satisfies a joint requirement"
      }
    },
    {
      "id": "gate/referral-blocked",
      "file": "gate/12-referral-blocked.json",
      "rules": [
        "AZ-4"
      ],
      "set": "gate",
      "oracle": null
    },
    {
      "id": "gate/coverage-refused-declared",
      "file": "gate/13-coverage-refused-declared.json",
      "rules": [
        "CV-4",
        "AZ-4"
      ],
      "set": "gate",
      "oracle": {
        "mustFailOn": [
          "dotnet@1.0.0-beta.1"
        ],
        "defect": "No `blocked` marker and no coverage refusal"
      }
    },
    {
      "id": "gate/update-previous-values",
      "file": "gate/14-update-previous-values.json",
      "rules": [
        "AF-3",
        "AF-1",
        "AF-2"
      ],
      "set": "gate",
      "oracle": {
        "mustFailOn": [
          "dotnet@1.0.0-beta.1"
        ],
        "defect": "Every Affidavit is create-shaped: `EntityId` and every `PreviousValue` are hard-coded null"
      }
    },
    {
      "id": "gate/create-null-previous-values",
      "file": "gate/15-create-null-previous-values.json",
      "rules": [
        "AF-3"
      ],
      "set": "gate",
      "oracle": null
    },
    {
      "id": "gate/inference-conversation-and-inferred",
      "file": "gate/16-inference-conversation-and-inferred.json",
      "rules": [
        "GT-1",
        "PV-1",
        "PV-3",
        "AF-1",
        "AF-2"
      ],
      "set": "gate",
      "oracle": null
    },
    {
      "id": "gate/threshold-without-scorer",
      "file": "gate/17-threshold-without-scorer.json",
      "rules": [
        "CV-1",
        "GT-5"
      ],
      "set": "gate",
      "oracle": null
    },
    {
      "id": "decide/approve",
      "file": "decide/01-approve.json",
      "rules": [
        "DK-1",
        "AZ-1",
        "AZ-2"
      ],
      "set": "decide",
      "oracle": {
        "mustFailOn": [
          "dotnet@1.0.0-beta.1"
        ],
        "defect": "No attestation record on the row: nothing says who or what approved a write"
      }
    },
    {
      "id": "decide/reject",
      "file": "decide/02-reject.json",
      "rules": [
        "DK-1",
        "AZ-1"
      ],
      "set": "decide",
      "oracle": null
    },
    {
      "id": "decide/second-decision-refused",
      "file": "decide/03-second-decision-refused.json",
      "rules": [
        "DK-1"
      ],
      "set": "decide",
      "oracle": null
    },
    {
      "id": "decide/expired-amendments-preserved",
      "file": "decide/04-expired-amendments-preserved.json",
      "rules": [
        "DK-1"
      ],
      "set": "decide",
      "oracle": null
    },
    {
      "id": "decide/blocked-refused",
      "file": "decide/05-blocked-refused.json",
      "rules": [
        "AZ-4",
        "DK-1"
      ],
      "set": "decide",
      "oracle": null
    },
    {
      "id": "decide/amend-recompute",
      "file": "decide/06-amend-recompute.json",
      "rules": [
        "AF-1",
        "AF-4",
        "DK-2",
        "DK-4",
        "PV-2",
        "SR-1"
      ],
      "set": "decide",
      "oracle": {
        "mustFailOn": [
          "dotnet@1.0.0-beta.1"
        ],
        "defect": "A reviewer's amendment never recomputes the aggregate confidence"
      }
    },
    {
      "id": "decide/unresolved-identity",
      "file": "decide/07-unresolved-identity.json",
      "rules": [
        "AZ-2",
        "AZ-6"
      ],
      "set": "decide",
      "oracle": {
        "mustFailOn": [
          "dotnet@1.0.0-beta.1"
        ],
        "defect": "Decision authorization is hand-rolled per host, tenant-blind, and permits the action when identity is unresolved"
      }
    },
    {
      "id": "decide/wrong-tenant",
      "file": "decide/08-wrong-tenant.json",
      "rules": [
        "AZ-2"
      ],
      "set": "decide",
      "oracle": {
        "mustFailOn": [
          "dotnet@1.0.0-beta.1"
        ],
        "defect": "Decision authorization is hand-rolled per host, tenant-blind, and permits the action when identity is unresolved"
      }
    },
    {
      "id": "decide/authorization-declined",
      "file": "decide/09-authorization-declined.json",
      "rules": [
        "AZ-2",
        "AZ-6"
      ],
      "set": "decide",
      "oracle": null
    },
    {
      "id": "decide/relay-member-via-relay",
      "file": "decide/10-relay-member-via-relay.json",
      "rules": [
        "AZ-3",
        "AZ-1"
      ],
      "set": "decide",
      "oracle": null
    },
    {
      "id": "decide/relay-without-assertion-refused",
      "file": "decide/11-relay-without-assertion-refused.json",
      "rules": [
        "AZ-3"
      ],
      "set": "decide",
      "oracle": null
    },
    {
      "id": "decide/execution-executed",
      "file": "decide/12-execution-executed.json",
      "rules": [
        "DK-1",
        "AZ-5"
      ],
      "set": "decide",
      "oracle": {
        "mustFailOn": [
          "dotnet@1.0.0-beta.1"
        ],
        "defect": "No execution-outcome state: an approved-but-failed write is indistinguishable from an approved-and-committed one"
      }
    },
    {
      "id": "decide/execution-failed",
      "file": "decide/13-execution-failed.json",
      "rules": [
        "DK-1"
      ],
      "set": "decide",
      "oracle": {
        "mustFailOn": [
          "dotnet@1.0.0-beta.1"
        ],
        "defect": "No execution-outcome state: an approved-but-failed write is indistinguishable from an approved-and-committed one"
      }
    },
    {
      "id": "decide/execution-on-pending-refused",
      "file": "decide/14-execution-on-pending-refused.json",
      "rules": [
        "DK-1",
        "AZ-5"
      ],
      "set": "decide",
      "oracle": null
    },
    {
      "id": "decide/resubmit-prefills",
      "file": "decide/15-resubmit-prefills.json",
      "rules": [
        "DK-1",
        "DK-2",
        "PV-2"
      ],
      "set": "decide",
      "oracle": null
    },
    {
      "id": "decide/executed-only-through-a-report",
      "file": "decide/16-executed-only-through-a-report.json",
      "rules": [
        "AZ-7"
      ],
      "set": "decide",
      "oracle": null
    },
    {
      "id": "decide/authorization-throws",
      "file": "decide/17-authorization-throws.json",
      "rules": [
        "AZ-2",
        "AZ-6"
      ],
      "set": "decide",
      "oracle": null
    },
    {
      "id": "decide/execution-recorded-once",
      "file": "decide/18-execution-recorded-once.json",
      "rules": [
        "DK-1",
        "DK-4",
        "AZ-5"
      ],
      "set": "decide",
      "oracle": null
    },
    {
      "id": "decide/execution-second-report-refused",
      "file": "decide/19-execution-second-report-refused.json",
      "rules": [
        "DK-1",
        "DK-4",
        "AZ-5"
      ],
      "set": "decide",
      "oracle": null
    },
    {
      "id": "sequence-a/approve-round-trip",
      "file": "sequence-a/01-approve-round-trip.json",
      "rules": [
        "GT-1",
        "GT-6",
        "DK-1",
        "AZ-1",
        "AZ-5",
        "SR-1"
      ],
      "set": "sequence-a",
      "oracle": null
    },
    {
      "id": "sequence-a/reject-round-trip",
      "file": "sequence-a/02-reject-round-trip.json",
      "rules": [
        "DK-1",
        "AZ-1"
      ],
      "set": "sequence-a",
      "oracle": null
    },
    {
      "id": "sequence-a/typed-inputs-on-the-card",
      "file": "sequence-a/03-typed-inputs-on-the-card.json",
      "rules": [
        "AF-1",
        "SR-4",
        "AF-2"
      ],
      "set": "sequence-a",
      "oracle": {
        "mustFailOn": [
          "dotnet@1.0.0-beta.1"
        ],
        "defect": "The aggregate confidence is a mean over the non-`Empty` fields, so a mostly-empty Affidavit can report high confidence"
      }
    },
    {
      "id": "sequence-a/picker-external-binding",
      "file": "sequence-a/04-picker-external-binding.json",
      "rules": [
        "PV-1",
        "PV-2",
        "PV-3",
        "GT-1"
      ],
      "set": "sequence-a",
      "oracle": null
    },
    {
      "id": "sequence-a/mandatory-field-left-empty",
      "file": "sequence-a/05-mandatory-field-left-empty.json",
      "rules": [
        "AF-1",
        "AF-2",
        "GT-5"
      ],
      "set": "sequence-a",
      "oracle": {
        "mustFailOn": [
          "dotnet@1.0.0-beta.1"
        ],
        "defect": "The aggregate confidence is a mean over the non-`Empty` fields, so a mostly-empty Affidavit can report high confidence"
      }
    },
    {
      "id": "sequence-a/mandatory-field-reviewer-approves",
      "file": "sequence-a/06-mandatory-field-reviewer-approves.json",
      "rules": [
        "AF-1",
        "AF-2",
        "DK-1"
      ],
      "set": "sequence-a",
      "oracle": null
    },
    {
      "id": "sequence-a/expiry-then-resubmit",
      "file": "sequence-a/07-expiry-then-resubmit.json",
      "rules": [
        "DK-1",
        "GT-4",
        "CV-4"
      ],
      "set": "sequence-a",
      "oracle": null
    },
    {
      "id": "sequence-a/late-amendments-preserved",
      "file": "sequence-a/08-late-amendments-preserved.json",
      "rules": [
        "DK-1",
        "DK-2",
        "PV-2",
        "PV-3"
      ],
      "set": "sequence-a",
      "oracle": null
    },
    {
      "id": "sequence-a/interleaved-conversations",
      "file": "sequence-a/09-interleaved-conversations.json",
      "rules": [
        "GT-2"
      ],
      "set": "sequence-a",
      "oracle": {
        "mustFailOn": [
          "dotnet@1.0.0-beta.1"
        ],
        "defect": "The gate carries no conversation identity; isolation is the host's scoping discipline alone (the shipped adapters resolve the context store from the application's root provider)"
      }
    },
    {
      "id": "sequence-a/replay-keeps-the-deadline",
      "file": "sequence-a/10-replay-keeps-the-deadline.json",
      "rules": [
        "GT-4",
        "DK-1"
      ],
      "set": "sequence-a",
      "oracle": {
        "mustFailOn": [
          "dotnet@1.0.0-beta.1"
        ],
        "defect": "A re-file with the same id broadcasts a card with a freshly computed deadline"
      }
    },
    {
      "id": "sequence-a/sweep-pages",
      "file": "sequence-a/11-sweep-pages.json",
      "rules": [
        "DK-3"
      ],
      "set": "sequence-a",
      "oracle": {
        "mustFailOn": [
          "dotnet@1.0.0-beta.1"
        ],
        "defect": "The expiry sweep loads every pending entry, unpaged, on every instance"
      }
    },
    {
      "id": "sequence-a/rehydration-order",
      "file": "sequence-a/12-rehydration-order.json",
      "rules": [
        "DK-5",
        "AZ-5"
      ],
      "set": "sequence-a",
      "oracle": null
    },
    {
      "id": "sequence-a/coverage-refused-at-wire-up",
      "file": "sequence-a/13-coverage-refused-at-wire-up.json",
      "rules": [
        "CV-4",
        "CV-1"
      ],
      "set": "sequence-a",
      "oracle": null
    },
    {
      "id": "sequence-a/mandatory-field-empty-blocks-standing-order",
      "file": "sequence-a/14-mandatory-field-empty-blocks-standing-order.json",
      "rules": [
        "GT-5",
        "AF-1",
        "AF-2"
      ],
      "set": "sequence-a",
      "oracle": null
    },
    {
      "id": "sequence-a/optional-field-empty-standing-order-fires",
      "file": "sequence-a/15-optional-field-empty-standing-order-fires.json",
      "rules": [
        "GT-5",
        "AF-1",
        "AZ-1"
      ],
      "set": "sequence-a",
      "oracle": null
    },
    {
      "id": "sequence-c/relay-auto-approve-bound-external",
      "file": "sequence-c/01-relay-auto-approve-bound-external.json",
      "rules": [
        "PV-4",
        "AZ-1",
        "PV-2",
        "GT-1"
      ],
      "set": "sequence-c",
      "oracle": null
    },
    {
      "id": "sequence-c/relayed-decision-member-via-relay",
      "file": "sequence-c/02-relayed-decision-member-via-relay.json",
      "rules": [
        "AZ-1",
        "AZ-3"
      ],
      "set": "sequence-c",
      "oracle": null
    },
    {
      "id": "sequence-c/unbound-external-asks-a-person",
      "file": "sequence-c/03-unbound-external-asks-a-person.json",
      "rules": [
        "PV-4",
        "PV-5"
      ],
      "set": "sequence-c",
      "oracle": null
    },
    {
      "id": "sequence-c/relay-may-not-attest-member",
      "file": "sequence-c/04-relay-may-not-attest-member.json",
      "rules": [
        "AZ-3",
        "AZ-2"
      ],
      "set": "sequence-c",
      "oracle": null
    },
    {
      "id": "sequence-c/relay-decision-other-tenant-not-found",
      "file": "sequence-c/05-relay-decision-other-tenant-not-found.json",
      "rules": [
        "AZ-2"
      ],
      "set": "sequence-c",
      "oracle": null
    },
    {
      "id": "canonical/create-shaped",
      "file": "canonical/01-create-shaped.json",
      "rules": [
        "SR-1",
        "AF-1",
        "AF-3"
      ],
      "set": "canonical",
      "oracle": null,
      "acceptedOnReview": true
    },
    {
      "id": "canonical/update-shaped",
      "file": "canonical/02-update-shaped.json",
      "rules": [
        "SR-1",
        "AF-3",
        "PV-1"
      ],
      "set": "canonical",
      "oracle": null,
      "acceptedOnReview": true
    },
    {
      "id": "canonical/wire-evidence-card-request",
      "file": "canonical/03-wire-evidence-card-request.json",
      "rules": [
        "SR-1",
        "SR-3"
      ],
      "set": "canonical",
      "oracle": null,
      "acceptedOnReview": true
    },
    {
      "id": "canonical/wire-evidence-card-request-amended",
      "file": "canonical/04-wire-evidence-card-request-amended.json",
      "rules": [
        "SR-1",
        "AF-1",
        "AF-2",
        "AF-4",
        "DK-2",
        "PV-2"
      ],
      "set": "canonical",
      "oracle": null,
      "acceptedOnReview": true
    },
    {
      "id": "canonical/key-order-stress",
      "file": "canonical/05-key-order-stress.json",
      "rules": [
        "SR-1"
      ],
      "set": "canonical",
      "oracle": null,
      "acceptedOnReview": true
    },
    {
      "id": "canonical/number-forms",
      "file": "canonical/06-number-forms.json",
      "rules": [
        "SR-1"
      ],
      "set": "canonical",
      "oracle": null,
      "acceptedOnReview": true
    },
    {
      "id": "canonical/money-and-escapes",
      "file": "canonical/07-money-and-escapes.json",
      "rules": [
        "SR-1",
        "SR-2"
      ],
      "set": "canonical",
      "oracle": null,
      "acceptedOnReview": true
    }
  ]
} as const;

/**
 * The 56 declarative fixtures, in manifest order. Promoted
 * byte-identical from the reference implementation's own test set, so "this
 * implementation passes it and that one does not" is a comparison rather than an
 * opinion.
 */
export const conformanceFixtures: readonly ConformanceFixtureDocument[] = [
  {
    "id": "gate/substance-hollow-refused",
    "rules": [
      "GT-3"
    ],
    "title": "A value with nothing behind it is hollow: the field carries \"Active\" and an Empty tag, so the proposal is refused before anything is filed. The shipped .NET ComplianceHarness checks this at test time only; the runtime must too.",
    "given": {
      "clock": "2026-09-04T09:00:00.000Z",
      "store": "memory",
      "gate": {
        "defaultTtlMs": 1800000,
        "authorization": {
          "allow": [
            "*"
          ]
        }
      },
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "chat",
        "principal": {
          "kind": "member",
          "id": "member-1"
        },
        "utterance": "Set the invoice status to Active",
        "messageId": "msg-1"
      },
      "prior": [],
      "step": {
        "kind": "file",
        "toolName": "relay_capture",
        "operation": {
          "kind": "update",
          "entityType": "Invoice",
          "entityId": "invoice-1",
          "fields": [
            "status"
          ]
        },
        "preparedFields": [
          {
            "name": "status",
            "kind": "text",
            "value": "Active",
            "provenance": null
          }
        ]
      }
    },
    "expect": {
      "error": {
        "code": "substance-refused",
        "messageContains": "Empty provenance"
      }
    }
  },
  {
    "id": "gate/substance-zero-field-refused",
    "rules": [
      "GT-3"
    ],
    "title": "Every proposed field is Empty and carries no value. There is nothing to swear to, so nothing is filed, counted or broadcast.",
    "given": {
      "clock": "2026-09-04T09:00:00.000Z",
      "store": "memory",
      "gate": {
        "defaultTtlMs": 1800000,
        "authorization": {
          "allow": [
            "*"
          ]
        }
      },
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "chat",
        "principal": {
          "kind": "member",
          "id": "member-1"
        },
        "utterance": "Set the invoice status to Active",
        "messageId": "msg-1"
      },
      "prior": [],
      "step": {
        "kind": "file",
        "toolName": "relay_capture",
        "operation": {
          "kind": "update",
          "entityType": "Invoice",
          "entityId": "invoice-1",
          "fields": [
            "status",
            "note"
          ]
        },
        "preparedFields": [
          {
            "name": "status",
            "kind": "text",
            "value": null,
            "provenance": null
          },
          {
            "name": "note",
            "kind": "text",
            "value": null,
            "provenance": null
          }
        ]
      }
    },
    "expect": {
      "error": {
        "code": "substance-refused",
        "messageContains": "no proposed field carries provenance other than Empty"
      }
    }
  },
  {
    "id": "gate/ttl-from-verdict",
    "rules": [
      "GT-4"
    ],
    "title": "The deadline comes from the verdict, after the policy chain has run. The shipped .NET gate stamps a single global default before policy, which is the shape the rule names as non-conformant.",
    "given": {
      "clock": "2026-09-04T09:00:00.000Z",
      "store": "memory",
      "gate": {
        "defaultTtlMs": 1800000,
        "authorization": {
          "allow": [
            "*"
          ]
        },
        "policies": [
          {
            "id": "policy-1",
            "version": "1.0.0",
            "declaredInputs": [],
            "defaultTtlMs": 900000,
            "verdict": {
              "requirement": "ReviewerConfirmation",
              "ttlMs": 300000
            }
          }
        ]
      },
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "chat",
        "principal": {
          "kind": "member",
          "id": "member-1"
        },
        "utterance": "Set the invoice status to Active",
        "messageId": "msg-1"
      },
      "prior": [],
      "step": {
        "kind": "file",
        "toolName": "relay_capture",
        "operation": {
          "kind": "update",
          "entityType": "Invoice",
          "entityId": "invoice-1",
          "fields": [
            "status"
          ]
        },
        "preparedFields": [
          {
            "name": "status",
            "kind": "text",
            "value": "Active",
            "provenance": {
              "source": "Conversation",
              "confidence": 0.9
            }
          }
        ]
      }
    },
    "expect": {
      "entry": {
        "status": "pending",
        "requirement": "ReviewerConfirmation",
        "execution": null,
        "blocked": null,
        "expiresAtOffsetMs": 300000,
        "attestation": null,
        "toolName": "relay_capture"
      }
    }
  },
  {
    "id": "gate/ttl-from-policy-default",
    "rules": [
      "GT-4"
    ],
    "title": "A verdict that names no deadline falls back to the policy's own default, not to the gate's.",
    "given": {
      "clock": "2026-09-04T09:00:00.000Z",
      "store": "memory",
      "gate": {
        "defaultTtlMs": 1800000,
        "authorization": {
          "allow": [
            "*"
          ]
        },
        "policies": [
          {
            "id": "policy-1",
            "version": "1.0.0",
            "declaredInputs": [],
            "defaultTtlMs": 900000,
            "verdict": {
              "requirement": "ReviewerConfirmation"
            }
          }
        ]
      },
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "chat",
        "principal": {
          "kind": "member",
          "id": "member-1"
        },
        "utterance": "Set the invoice status to Active",
        "messageId": "msg-1"
      },
      "prior": [],
      "step": {
        "kind": "file",
        "toolName": "relay_capture",
        "operation": {
          "kind": "update",
          "entityType": "Invoice",
          "entityId": "invoice-1",
          "fields": [
            "status"
          ]
        },
        "preparedFields": [
          {
            "name": "status",
            "kind": "text",
            "value": "Active",
            "provenance": {
              "source": "Conversation",
              "confidence": 0.9
            }
          }
        ]
      }
    },
    "expect": {
      "entry": {
        "status": "pending",
        "requirement": "ReviewerConfirmation",
        "execution": null,
        "blocked": null,
        "expiresAtOffsetMs": 900000,
        "attestation": null,
        "toolName": "relay_capture"
      }
    }
  },
  {
    "id": "gate/ttl-from-gate-default",
    "rules": [
      "GT-4"
    ],
    "title": "With no verdict and no policy default, the gate's required defaultTtlMs applies. Every filed entry carries a deadline (GT-4).",
    "given": {
      "clock": "2026-09-04T09:00:00.000Z",
      "store": "memory",
      "gate": {
        "defaultTtlMs": 1800000,
        "authorization": {
          "allow": [
            "*"
          ]
        }
      },
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "chat",
        "principal": {
          "kind": "member",
          "id": "member-1"
        },
        "utterance": "Set the invoice status to Active",
        "messageId": "msg-1"
      },
      "prior": [],
      "step": {
        "kind": "file",
        "toolName": "relay_capture",
        "operation": {
          "kind": "update",
          "entityType": "Invoice",
          "entityId": "invoice-1",
          "fields": [
            "status"
          ]
        },
        "preparedFields": [
          {
            "name": "status",
            "kind": "text",
            "value": "Active",
            "provenance": {
              "source": "Conversation",
              "confidence": 0.9
            }
          }
        ]
      }
    },
    "expect": {
      "entry": {
        "status": "pending",
        "requirement": "ReviewerConfirmation",
        "execution": null,
        "blocked": null,
        "expiresAtOffsetMs": 1800000,
        "attestation": null,
        "toolName": "relay_capture"
      }
    }
  },
  {
    "id": "gate/standing-order-by-the-book",
    "rules": [
      "GT-5",
      "AZ-1"
    ],
    "title": "A Standing Order with no threshold fires on the verdict alone, and files approved, unexecuted and attested in one write. The shipped .NET default scorer never returns the grade its default threshold demands, so a by-the-book Standing Order can never fire there.",
    "given": {
      "clock": "2026-09-04T09:00:00.000Z",
      "store": "memory",
      "gate": {
        "defaultTtlMs": 1800000,
        "authorization": {
          "allow": [
            "*"
          ]
        },
        "policies": [
          {
            "id": "auto-approve",
            "version": "2.1.0",
            "declaredInputs": [],
            "verdict": {
              "requirement": "StandingOrder"
            }
          }
        ]
      },
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "chat",
        "principal": {
          "kind": "member",
          "id": "member-1"
        },
        "utterance": "Set the invoice status to Active",
        "messageId": "msg-1"
      },
      "prior": [],
      "step": {
        "kind": "file",
        "toolName": "relay_capture",
        "operation": {
          "kind": "update",
          "entityType": "Invoice",
          "entityId": "invoice-1",
          "fields": [
            "status"
          ]
        },
        "preparedFields": [
          {
            "name": "status",
            "kind": "text",
            "value": "Active",
            "provenance": {
              "source": "Conversation",
              "confidence": 0.9
            }
          }
        ]
      }
    },
    "expect": {
      "entry": {
        "status": "approved",
        "requirement": "StandingOrder",
        "execution": "unexecuted",
        "blocked": null,
        "expiresAtOffsetMs": 1800000,
        "attestation": {
          "kind": "standing-order",
          "policyId": "auto-approve",
          "version": "2.1.0"
        },
        "toolName": "relay_capture"
      }
    }
  },
  {
    "id": "gate/standing-order-threshold-under",
    "rules": [
      "GT-5"
    ],
    "title": "A declared threshold fires iff the host's score is at or under it. The core owns the comparison and no formula.",
    "given": {
      "clock": "2026-09-04T09:00:00.000Z",
      "store": "memory",
      "gate": {
        "defaultTtlMs": 1800000,
        "authorization": {
          "allow": [
            "*"
          ]
        },
        "policies": [
          {
            "id": "under-a-thousand",
            "version": "1.0.0",
            "declaredInputs": [],
            "declaresThreshold": true,
            "verdict": {
              "requirement": "StandingOrder",
              "threshold": 0.5
            }
          }
        ],
        "riskScorer": 0.5
      },
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "chat",
        "principal": {
          "kind": "member",
          "id": "member-1"
        },
        "utterance": "Set the invoice status to Active",
        "messageId": "msg-1"
      },
      "prior": [],
      "step": {
        "kind": "file",
        "toolName": "relay_capture",
        "operation": {
          "kind": "update",
          "entityType": "Invoice",
          "entityId": "invoice-1",
          "fields": [
            "status"
          ]
        },
        "preparedFields": [
          {
            "name": "status",
            "kind": "text",
            "value": "Active",
            "provenance": {
              "source": "Conversation",
              "confidence": 0.9
            }
          }
        ]
      }
    },
    "expect": {
      "entry": {
        "status": "approved",
        "requirement": "StandingOrder",
        "execution": "unexecuted",
        "blocked": null,
        "expiresAtOffsetMs": 1800000,
        "attestation": {
          "kind": "standing-order",
          "policyId": "under-a-thousand",
          "version": "1.0.0"
        },
        "toolName": "relay_capture"
      }
    }
  },
  {
    "id": "gate/standing-order-threshold-over",
    "rules": [
      "GT-5"
    ],
    "title": "A score above the threshold does not fire and does not fail: it degrades to asking a person, with the reason on the card.",
    "given": {
      "clock": "2026-09-04T09:00:00.000Z",
      "store": "memory",
      "gate": {
        "defaultTtlMs": 1800000,
        "authorization": {
          "allow": [
            "*"
          ]
        },
        "policies": [
          {
            "id": "policy-1",
            "version": "1.0.0",
            "declaredInputs": [],
            "declaresThreshold": true,
            "verdict": {
              "requirement": "StandingOrder",
              "threshold": 0.5
            }
          }
        ],
        "riskScorer": 0.9
      },
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "chat",
        "principal": {
          "kind": "member",
          "id": "member-1"
        },
        "utterance": "Set the invoice status to Active",
        "messageId": "msg-1"
      },
      "prior": [],
      "step": {
        "kind": "file",
        "toolName": "relay_capture",
        "operation": {
          "kind": "update",
          "entityType": "Invoice",
          "entityId": "invoice-1",
          "fields": [
            "status"
          ]
        },
        "preparedFields": [
          {
            "name": "status",
            "kind": "text",
            "value": "Active",
            "provenance": {
              "source": "Conversation",
              "confidence": 0.9
            }
          }
        ]
      }
    },
    "expect": {
      "entry": {
        "status": "pending",
        "requirement": "ReviewerConfirmation",
        "execution": null,
        "blocked": null,
        "expiresAtOffsetMs": 1800000,
        "attestation": null,
        "toolName": "relay_capture"
      },
      "card": {
        "warningsContain": [
          "above the Standing Order's threshold"
        ]
      }
    }
  },
  {
    "id": "gate/standing-order-unbound-input",
    "rules": [
      "PV-4"
    ],
    "title": "Sequence C's negative case: a relayed capture whose External tag points at nothing. The policy predicates on External, so the Standing Order is not honoured and a person is asked.",
    "given": {
      "clock": "2026-09-04T09:00:00.000Z",
      "store": "memory",
      "gate": {
        "defaultTtlMs": 1800000,
        "authorization": {
          "allow": [
            "*"
          ]
        },
        "policies": [
          {
            "id": "relay-capture",
            "version": "1.0.0",
            "declaredInputs": [
              "External"
            ],
            "verdict": {
              "requirement": "StandingOrder"
            }
          }
        ]
      },
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "mcp",
        "principal": {
          "kind": "member",
          "id": "member-1"
        },
        "utterance": "Set the invoice status to Active",
        "messageId": "msg-1"
      },
      "prior": [],
      "step": {
        "kind": "file",
        "toolName": "relay_capture",
        "operation": {
          "kind": "update",
          "entityType": "Invoice",
          "entityId": "invoice-1",
          "fields": [
            "status"
          ]
        },
        "preparedFields": [
          {
            "name": "status",
            "kind": "text",
            "value": "Active",
            "provenance": {
              "source": "External",
              "confidence": 1
            }
          }
        ]
      }
    },
    "expect": {
      "entry": {
        "status": "pending",
        "requirement": "ReviewerConfirmation",
        "execution": null,
        "blocked": null,
        "expiresAtOffsetMs": 1800000,
        "attestation": null,
        "toolName": "relay_capture"
      },
      "card": {
        "warningsContain": [
          "carries a External tag with no binding"
        ]
      }
    }
  },
  {
    "id": "gate/standing-order-bound-input",
    "rules": [
      "PV-4",
      "AZ-1"
    ],
    "title": "Sequence C's positive case: the same capture whose External tag names the record it came from. The Standing Order fires and the relay is on the attestation's policy, never as a member.",
    "given": {
      "clock": "2026-09-04T09:00:00.000Z",
      "store": "memory",
      "gate": {
        "defaultTtlMs": 1800000,
        "authorization": {
          "allow": [
            "*"
          ]
        },
        "policies": [
          {
            "id": "relay-capture",
            "version": "1.0.0",
            "declaredInputs": [
              "External"
            ],
            "verdict": {
              "requirement": "StandingOrder"
            }
          }
        ]
      },
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "mcp",
        "principal": {
          "kind": "member",
          "id": "member-1"
        },
        "utterance": "Set the invoice status to Active",
        "messageId": "msg-1"
      },
      "prior": [],
      "step": {
        "kind": "file",
        "toolName": "relay_capture",
        "operation": {
          "kind": "update",
          "entityType": "Invoice",
          "entityId": "invoice-1",
          "fields": [
            "status"
          ]
        },
        "preparedFields": [
          {
            "name": "status",
            "kind": "text",
            "value": "Active",
            "provenance": {
              "source": "External",
              "confidence": 1,
              "binding": {
                "kind": "external-ref",
                "ref": {
                  "system": "billing",
                  "recordId": "invoice-1"
                }
              }
            }
          }
        ]
      }
    },
    "expect": {
      "entry": {
        "status": "approved",
        "requirement": "StandingOrder",
        "execution": "unexecuted",
        "blocked": null,
        "expiresAtOffsetMs": 1800000,
        "attestation": {
          "kind": "standing-order",
          "policyId": "relay-capture",
          "version": "1.0.0"
        },
        "toolName": "relay_capture"
      }
    }
  },
  {
    "id": "gate/multiparty-blocked",
    "rules": [
      "AZ-4"
    ],
    "title": "A requirement level this version does not run is recorded verbatim and filed blocked; it is never degraded to the single-approver branch, which is what the shipped .NET gate does.",
    "given": {
      "clock": "2026-09-04T09:00:00.000Z",
      "store": "memory",
      "gate": {
        "defaultTtlMs": 1800000,
        "authorization": {
          "allow": [
            "*"
          ]
        },
        "policies": [
          {
            "id": "policy-1",
            "version": "1.0.0",
            "declaredInputs": [],
            "verdict": {
              "requirement": "MultiParty"
            }
          }
        ]
      },
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "chat",
        "principal": {
          "kind": "member",
          "id": "member-1"
        },
        "utterance": "Set the invoice status to Active",
        "messageId": "msg-1"
      },
      "prior": [],
      "step": {
        "kind": "file",
        "toolName": "relay_capture",
        "operation": {
          "kind": "update",
          "entityType": "Invoice",
          "entityId": "invoice-1",
          "fields": [
            "status"
          ]
        },
        "preparedFields": [
          {
            "name": "status",
            "kind": "text",
            "value": "Active",
            "provenance": {
              "source": "Conversation",
              "confidence": 0.9
            }
          }
        ]
      }
    },
    "expect": {
      "entry": {
        "status": "pending",
        "requirement": "MultiParty",
        "execution": null,
        "blocked": {
          "code": "requirement-not-implemented",
          "level": "MultiParty"
        },
        "expiresAtOffsetMs": 1800000,
        "attestation": null,
        "toolName": "relay_capture"
      },
      "card": {
        "warningsContain": [
          "not implemented in this version"
        ]
      }
    }
  },
  {
    "id": "gate/referral-blocked",
    "rules": [
      "AZ-4"
    ],
    "title": "The same for ReferralRequired, which protocol v0.1 reserves. The parity manifest names the .NET Deferred path.",
    "given": {
      "clock": "2026-09-04T09:00:00.000Z",
      "store": "memory",
      "gate": {
        "defaultTtlMs": 1800000,
        "authorization": {
          "allow": [
            "*"
          ]
        },
        "policies": [
          {
            "id": "policy-1",
            "version": "1.0.0",
            "declaredInputs": [],
            "verdict": {
              "requirement": "ReferralRequired"
            }
          }
        ]
      },
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "chat",
        "principal": {
          "kind": "member",
          "id": "member-1"
        },
        "utterance": "Set the invoice status to Active",
        "messageId": "msg-1"
      },
      "prior": [],
      "step": {
        "kind": "file",
        "toolName": "relay_capture",
        "operation": {
          "kind": "update",
          "entityType": "Invoice",
          "entityId": "invoice-1",
          "fields": [
            "status"
          ]
        },
        "preparedFields": [
          {
            "name": "status",
            "kind": "text",
            "value": "Active",
            "provenance": {
              "source": "Conversation",
              "confidence": 0.9
            }
          }
        ]
      }
    },
    "expect": {
      "entry": {
        "status": "pending",
        "requirement": "ReferralRequired",
        "execution": null,
        "blocked": {
          "code": "requirement-not-implemented",
          "level": "ReferralRequired"
        },
        "expiresAtOffsetMs": 1800000,
        "attestation": null,
        "toolName": "relay_capture"
      }
    }
  },
  {
    "id": "gate/coverage-refused-declared",
    "rules": [
      "CV-4",
      "AZ-4"
    ],
    "title": "A tool the host declared it cannot cover: the proposal is filed pending and blocked with the tool and the category on the row, never silently allowed. The Standing Order the policy returned does not rescue it.",
    "given": {
      "clock": "2026-09-04T09:00:00.000Z",
      "store": "memory",
      "gate": {
        "defaultTtlMs": 1800000,
        "authorization": {
          "allow": [
            "*"
          ]
        },
        "policies": [
          {
            "id": "policy-1",
            "version": "1.0.0",
            "declaredInputs": [],
            "verdict": {
              "requirement": "StandingOrder"
            }
          }
        ],
        "uncovered": [
          {
            "tool": "relay_capture",
            "category": "provider-executed"
          }
        ]
      },
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "chat",
        "principal": {
          "kind": "member",
          "id": "member-1"
        },
        "utterance": "Set the invoice status to Active",
        "messageId": "msg-1"
      },
      "prior": [],
      "step": {
        "kind": "file",
        "toolName": "relay_capture",
        "operation": {
          "kind": "update",
          "entityType": "Invoice",
          "entityId": "invoice-1",
          "fields": [
            "status"
          ]
        },
        "preparedFields": [
          {
            "name": "status",
            "kind": "text",
            "value": "Active",
            "provenance": {
              "source": "Conversation",
              "confidence": 0.9
            }
          }
        ]
      }
    },
    "expect": {
      "entry": {
        "status": "pending",
        "requirement": "StandingOrder",
        "execution": null,
        "blocked": {
          "code": "coverage-refused",
          "category": "provider-executed",
          "toolName": "relay_capture"
        },
        "expiresAtOffsetMs": 1800000,
        "attestation": null,
        "toolName": "relay_capture"
      },
      "card": {
        "warningsContain": [
          "declared uncovered"
        ]
      }
    }
  },
  {
    "id": "gate/update-previous-values",
    "rules": [
      "AF-3",
      "AF-1",
      "AF-2"
    ],
    "title": "An update names its entity and carries the previousValue key on every field, holding null where the entity had no stored value. The shipped .NET projection fills previous values on creates only.",
    "given": {
      "clock": "2026-09-04T09:00:00.000Z",
      "store": "memory",
      "gate": {
        "defaultTtlMs": 1800000,
        "authorization": {
          "allow": [
            "*"
          ]
        },
        "entities": {
          "Invoice/invoice-1": {
            "status": "Draft"
          }
        }
      },
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "chat",
        "principal": {
          "kind": "member",
          "id": "member-1"
        },
        "utterance": "Set the invoice status to Active",
        "messageId": "msg-1"
      },
      "prior": [],
      "step": {
        "kind": "file",
        "toolName": "relay_capture",
        "operation": {
          "kind": "update",
          "entityType": "Invoice",
          "entityId": "invoice-1",
          "fields": [
            "status",
            "note"
          ]
        },
        "preparedFields": [
          {
            "name": "status",
            "kind": "text",
            "value": "Active",
            "provenance": {
              "source": "Conversation",
              "confidence": 0.9
            }
          },
          {
            "name": "note",
            "kind": "text",
            "value": "urgent",
            "provenance": {
              "source": "Conversation",
              "confidence": 0.9
            }
          }
        ]
      }
    },
    "expect": {
      "entry": {
        "status": "pending",
        "requirement": "ReviewerConfirmation",
        "execution": null,
        "blocked": null,
        "expiresAtOffsetMs": 1800000,
        "attestation": null,
        "toolName": "relay_capture",
        "affidavit": {
          "operationType": "update",
          "entityId": "invoice-1",
          "aggregateConfidence": 0.9,
          "populatedConfidence": 0.9,
          "emptyFieldCount": 0,
          "fields": [
            {
              "name": "status",
              "value": "Active",
              "previousValue": "Draft",
              "source": "Conversation",
              "bound": false
            },
            {
              "name": "note",
              "value": "urgent",
              "previousValue": null,
              "source": "Conversation",
              "bound": false
            }
          ]
        }
      }
    }
  },
  {
    "id": "gate/create-null-previous-values",
    "rules": [
      "AF-3"
    ],
    "title": "A create names no entity and every previousValue is null, whatever the projection port would have said.",
    "given": {
      "clock": "2026-09-04T09:00:00.000Z",
      "store": "memory",
      "gate": {
        "defaultTtlMs": 1800000,
        "authorization": {
          "allow": [
            "*"
          ]
        }
      },
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "chat",
        "principal": {
          "kind": "member",
          "id": "member-1"
        },
        "utterance": "Set the invoice status to Active",
        "messageId": "msg-1"
      },
      "prior": [],
      "step": {
        "kind": "file",
        "toolName": "relay_capture",
        "operation": {
          "kind": "create",
          "entityType": "Invoice",
          "entityId": null,
          "fields": [
            "status"
          ]
        },
        "preparedFields": [
          {
            "name": "status",
            "kind": "text",
            "value": "Active",
            "provenance": {
              "source": "Conversation",
              "confidence": 0.9
            }
          }
        ]
      }
    },
    "expect": {
      "entry": {
        "status": "pending",
        "requirement": "ReviewerConfirmation",
        "execution": null,
        "blocked": null,
        "expiresAtOffsetMs": 1800000,
        "attestation": null,
        "toolName": "relay_capture",
        "affidavit": {
          "operationType": "create",
          "entityId": null,
          "aggregateConfidence": 0.9,
          "populatedConfidence": 0.9,
          "emptyFieldCount": 0,
          "fields": [
            {
              "name": "status",
              "value": "Active",
              "previousValue": null,
              "source": "Conversation",
              "bound": false
            }
          ]
        }
      }
    }
  },
  {
    "id": "gate/inference-conversation-and-inferred",
    "rules": [
      "GT-1",
      "PV-1",
      "PV-3",
      "AF-1",
      "AF-2"
    ],
    "title": "The inference path: a value literally in the turn is Conversation, a reasoned one is Inferred, a proposed field the port said nothing about is present and Empty-tagged, and the aggregate is the minimum with Empty counting as zero. Neither tag is UserStated (PV-3).",
    "given": {
      "clock": "2026-09-04T09:00:00.000Z",
      "store": "memory",
      "gate": {
        "defaultTtlMs": 1800000,
        "authorization": {
          "allow": [
            "*"
          ]
        },
        "inference": {
          "status": {
            "value": "Active",
            "confidence": 0.9,
            "presence": "literal",
            "utteranceSpan": {
              "start": 26,
              "end": 32
            }
          },
          "note": {
            "value": "urgent",
            "confidence": 0.4,
            "presence": "inferred",
            "utteranceSpan": null
          }
        },
        "entities": {
          "Invoice/invoice-1": {
            "status": "Draft"
          }
        }
      },
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "chat",
        "principal": {
          "kind": "member",
          "id": "member-1"
        },
        "utterance": "Set the invoice status to Active",
        "messageId": "msg-1"
      },
      "prior": [],
      "step": {
        "kind": "file",
        "toolName": "relay_capture",
        "operation": {
          "kind": "update",
          "entityType": "Invoice",
          "entityId": "invoice-1",
          "fields": [
            "status",
            "note",
            "owner"
          ]
        },
        "schema": [
          {
            "name": "status",
            "kind": "text",
            "description": "The status"
          },
          {
            "name": "note",
            "kind": "text",
            "description": "The note"
          },
          {
            "name": "owner",
            "kind": "text",
            "description": "The owner"
          }
        ]
      }
    },
    "expect": {
      "entry": {
        "status": "pending",
        "requirement": "ReviewerConfirmation",
        "execution": null,
        "blocked": null,
        "expiresAtOffsetMs": 1800000,
        "attestation": null,
        "toolName": "relay_capture",
        "affidavit": {
          "operationType": "update",
          "entityId": "invoice-1",
          "aggregateConfidence": 0,
          "populatedConfidence": 0.4,
          "emptyFieldCount": 1,
          "fields": [
            {
              "name": "status",
              "value": "Active",
              "previousValue": "Draft",
              "source": "Conversation",
              "bound": true
            },
            {
              "name": "note",
              "value": "urgent",
              "previousValue": null,
              "source": "Inferred",
              "bound": false
            },
            {
              "name": "owner",
              "value": null,
              "previousValue": null,
              "source": "Empty",
              "bound": false
            }
          ]
        }
      }
    }
  },
  {
    "id": "gate/threshold-without-scorer",
    "rules": [
      "CV-1",
      "GT-5"
    ],
    "title": "A policy that says it will predicate on a risk threshold, wired to a gate with no risk function, is refused when the gate is built - not on the unlucky request that first reaches the threshold branch. This package ships no scoring formula and no floor by rule, so a declared threshold with nothing to compare against is a configuration error and never a policy that quietly never fires. The check reads the policy's static declaration, because a check that only fires when a policy happens to return a threshold is itself a silent non-fire on every other input.",
    "given": {
      "clock": "2026-09-04T09:00:00.000Z",
      "store": "memory",
      "gate": {
        "defaultTtlMs": 1800000,
        "authorization": {
          "allow": [
            "*"
          ]
        },
        "policies": [
          {
            "id": "under-a-thousand",
            "version": "1.0.0",
            "declaredInputs": [],
            "declaresThreshold": true,
            "verdict": {
              "requirement": "StandingOrder",
              "threshold": 0.5
            }
          }
        ]
      },
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "chat",
        "principal": {
          "kind": "member",
          "id": "member-1"
        },
        "utterance": "Set the invoice status to Active",
        "messageId": "msg-1"
      },
      "prior": [],
      "step": {
        "kind": "file",
        "toolName": "relay_capture",
        "operation": {
          "kind": "update",
          "entityType": "Invoice",
          "entityId": "invoice-1",
          "fields": [
            "status"
          ]
        },
        "preparedFields": [
          {
            "name": "status",
            "kind": "text",
            "value": "Active",
            "provenance": {
              "source": "Conversation",
              "confidence": 0.9
            }
          }
        ]
      }
    },
    "expect": {
      "error": {
        "code": "wireup-invalid",
        "messageContains": "riskScorer"
      },
      "store": {
        "count": 0
      }
    }
  },
  {
    "id": "decide/approve",
    "rules": [
      "DK-1",
      "AZ-1",
      "AZ-2"
    ],
    "title": "A member approves a pending entry: the row moves to approved with the execution outcome unexecuted, and the attestation names the person who agreed. AZ-1 is written in the same operation as the transition, so there is no window in which an approved write has no attribution.",
    "given": {
      "clock": "2026-09-04T09:00:00.000Z",
      "store": "memory",
      "gate": {
        "defaultTtlMs": 1800000,
        "authorization": {
          "allow": [
            "*"
          ]
        }
      },
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "chat",
        "principal": {
          "kind": "member",
          "id": "filer"
        },
        "utterance": "Set the invoice status to Active and the amount to 40",
        "messageId": "msg-1"
      },
      "prior": [
        {
          "kind": "file",
          "as": "filed",
          "at": "2026-09-04T09:00:00.000Z",
          "principal": {
            "kind": "member",
            "id": "filer"
          },
          "toolName": "update_invoice",
          "operation": {
            "kind": "update",
            "entityType": "Invoice",
            "entityId": "invoice-1",
            "fields": [
              "status",
              "amount",
              "note"
            ]
          },
          "preparedFields": [
            {
              "name": "status",
              "kind": "text",
              "value": "Active",
              "provenance": {
                "source": "Conversation",
                "confidence": 0.9
              }
            },
            {
              "name": "amount",
              "kind": "text",
              "value": "40",
              "provenance": {
                "source": "Conversation",
                "confidence": 0.9
              }
            },
            {
              "name": "note",
              "kind": "text",
              "value": "kept",
              "provenance": {
                "source": "Conversation",
                "confidence": 0.9
              }
            }
          ]
        }
      ],
      "step": {
        "kind": "decide",
        "at": "2026-09-04T09:00:00.000Z",
        "principal": {
          "kind": "member",
          "id": "ana"
        },
        "decision": {
          "kind": "approve",
          "reason": "checked against the purchase order"
        }
      }
    },
    "expect": {
      "entry": {
        "status": "approved",
        "execution": "unexecuted",
        "requirement": "ReviewerConfirmation",
        "blocked": null,
        "attestation": {
          "kind": "member",
          "id": "ana"
        },
        "amendments": null,
        "decision": {
          "kind": "approve",
          "reason": "checked against the purchase order"
        },
        "affidavit": {
          "aggregateConfidence": 0.9,
          "populatedConfidence": 0.9,
          "emptyFieldCount": 0,
          "fields": [
            {
              "name": "status",
              "value": "Active",
              "source": "Conversation",
              "bound": false
            },
            {
              "name": "amount",
              "value": "40",
              "source": "Conversation",
              "bound": false
            },
            {
              "name": "note",
              "value": "kept",
              "source": "Conversation",
              "bound": false
            }
          ]
        },
        "lineage": {
          "supersededBy": null
        }
      }
    }
  },
  {
    "id": "decide/reject",
    "rules": [
      "DK-1",
      "AZ-1"
    ],
    "title": "A rejection is terminal and carries no execution outcome: nothing was authorised, so there is nothing for an executor to have failed at. The reviewer's stated reason is on the row, because a refusal nobody explained teaches the host nothing.",
    "given": {
      "clock": "2026-09-04T09:00:00.000Z",
      "store": "memory",
      "gate": {
        "defaultTtlMs": 1800000,
        "authorization": {
          "allow": [
            "*"
          ]
        }
      },
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "chat",
        "principal": {
          "kind": "member",
          "id": "filer"
        },
        "utterance": "Set the invoice status to Active and the amount to 40",
        "messageId": "msg-1"
      },
      "prior": [
        {
          "kind": "file",
          "as": "filed",
          "at": "2026-09-04T09:00:00.000Z",
          "principal": {
            "kind": "member",
            "id": "filer"
          },
          "toolName": "update_invoice",
          "operation": {
            "kind": "update",
            "entityType": "Invoice",
            "entityId": "invoice-1",
            "fields": [
              "status",
              "amount",
              "note"
            ]
          },
          "preparedFields": [
            {
              "name": "status",
              "kind": "text",
              "value": "Active",
              "provenance": {
                "source": "Conversation",
                "confidence": 0.9
              }
            },
            {
              "name": "amount",
              "kind": "text",
              "value": "40",
              "provenance": {
                "source": "Conversation",
                "confidence": 0.9
              }
            },
            {
              "name": "note",
              "kind": "text",
              "value": "kept",
              "provenance": {
                "source": "Conversation",
                "confidence": 0.9
              }
            }
          ]
        }
      ],
      "step": {
        "kind": "decide",
        "at": "2026-09-04T09:00:00.000Z",
        "principal": {
          "kind": "member",
          "id": "ana"
        },
        "decision": {
          "kind": "reject",
          "reason": "the amount is an order of magnitude out"
        }
      }
    },
    "expect": {
      "entry": {
        "status": "rejected",
        "execution": null,
        "requirement": "ReviewerConfirmation",
        "blocked": null,
        "attestation": {
          "kind": "member",
          "id": "ana"
        },
        "amendments": null,
        "decision": {
          "kind": "reject",
          "reason": "the amount is an order of magnitude out"
        },
        "affidavit": {
          "aggregateConfidence": 0.9,
          "populatedConfidence": 0.9,
          "emptyFieldCount": 0,
          "fields": [
            {
              "name": "status",
              "value": "Active",
              "source": "Conversation",
              "bound": false
            },
            {
              "name": "amount",
              "value": "40",
              "source": "Conversation",
              "bound": false
            },
            {
              "name": "note",
              "value": "kept",
              "source": "Conversation",
              "bound": false
            }
          ]
        },
        "lineage": {
          "supersededBy": null
        }
      }
    }
  },
  {
    "id": "decide/second-decision-refused",
    "rules": [
      "DK-1"
    ],
    "title": "A decision on an entry that is no longer pending is refused, never applied twice and never silently overwritten. The first decision and the first attestation stand: a second reviewer arriving late does not get to replace the record of who agreed.",
    "given": {
      "clock": "2026-09-04T09:00:00.000Z",
      "store": "memory",
      "gate": {
        "defaultTtlMs": 1800000,
        "authorization": {
          "allow": [
            "*"
          ]
        }
      },
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "chat",
        "principal": {
          "kind": "member",
          "id": "filer"
        },
        "utterance": "Set the invoice status to Active and the amount to 40",
        "messageId": "msg-1"
      },
      "prior": [
        {
          "kind": "file",
          "as": "filed",
          "at": "2026-09-04T09:00:00.000Z",
          "principal": {
            "kind": "member",
            "id": "filer"
          },
          "toolName": "update_invoice",
          "operation": {
            "kind": "update",
            "entityType": "Invoice",
            "entityId": "invoice-1",
            "fields": [
              "status",
              "amount",
              "note"
            ]
          },
          "preparedFields": [
            {
              "name": "status",
              "kind": "text",
              "value": "Active",
              "provenance": {
                "source": "Conversation",
                "confidence": 0.9
              }
            },
            {
              "name": "amount",
              "kind": "text",
              "value": "40",
              "provenance": {
                "source": "Conversation",
                "confidence": 0.9
              }
            },
            {
              "name": "note",
              "kind": "text",
              "value": "kept",
              "provenance": {
                "source": "Conversation",
                "confidence": 0.9
              }
            }
          ]
        },
        {
          "kind": "decide",
          "at": "2026-09-04T09:00:00.000Z",
          "principal": {
            "kind": "member",
            "id": "ana"
          },
          "decision": {
            "kind": "approve"
          },
          "refusal": null
        }
      ],
      "step": {
        "kind": "decide",
        "at": "2026-09-04T09:01:00.000Z",
        "principal": {
          "kind": "member",
          "id": "bo"
        },
        "decision": {
          "kind": "reject",
          "reason": "changed our minds"
        }
      }
    },
    "expect": {
      "error": {
        "code": "decision-not-pending"
      },
      "entry": {
        "status": "approved",
        "execution": "unexecuted",
        "requirement": "ReviewerConfirmation",
        "blocked": null,
        "attestation": {
          "kind": "member",
          "id": "ana"
        },
        "amendments": null,
        "decision": {
          "kind": "approve",
          "reason": null
        },
        "affidavit": {
          "aggregateConfidence": 0.9,
          "populatedConfidence": 0.9,
          "emptyFieldCount": 0,
          "fields": [
            {
              "name": "status",
              "value": "Active",
              "source": "Conversation",
              "bound": false
            },
            {
              "name": "amount",
              "value": "40",
              "source": "Conversation",
              "bound": false
            },
            {
              "name": "note",
              "value": "kept",
              "source": "Conversation",
              "bound": false
            }
          ]
        },
        "lineage": {
          "supersededBy": null
        }
      }
    }
  },
  {
    "id": "decide/expired-amendments-preserved",
    "rules": [
      "DK-1"
    ],
    "title": "An entry past its deadline reads expired whether or not a sweep has run, and a decision arriving after it is refused. The amendments that decision carried are preserved on the row - with the refused decision's own instant and principal, so a resubmission can bind the prefilled values to the act that actually happened. Nothing else is written: no status, no decision record, no attestation, and no accepted-amendment map, because nobody accepted anything.",
    "given": {
      "clock": "2026-09-04T09:00:00.000Z",
      "store": "memory",
      "gate": {
        "defaultTtlMs": 1800000,
        "authorization": {
          "allow": [
            "*"
          ]
        }
      },
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "chat",
        "principal": {
          "kind": "member",
          "id": "filer"
        },
        "utterance": "Set the invoice status to Active and the amount to 40",
        "messageId": "msg-1"
      },
      "prior": [
        {
          "kind": "file",
          "as": "filed",
          "at": "2026-09-04T09:00:00.000Z",
          "principal": {
            "kind": "member",
            "id": "filer"
          },
          "toolName": "update_invoice",
          "operation": {
            "kind": "update",
            "entityType": "Invoice",
            "entityId": "invoice-1",
            "fields": [
              "status",
              "amount",
              "note"
            ]
          },
          "preparedFields": [
            {
              "name": "status",
              "kind": "text",
              "value": "Active",
              "provenance": {
                "source": "Conversation",
                "confidence": 0.9
              }
            },
            {
              "name": "amount",
              "kind": "text",
              "value": "40",
              "provenance": {
                "source": "Conversation",
                "confidence": 0.9
              }
            },
            {
              "name": "note",
              "kind": "text",
              "value": "kept",
              "provenance": {
                "source": "Conversation",
                "confidence": 0.9
              }
            }
          ]
        }
      ],
      "step": {
        "kind": "decide",
        "at": "2026-09-04T09:45:00.000Z",
        "principal": {
          "kind": "member",
          "id": "ana"
        },
        "decision": {
          "kind": "approve",
          "amendments": {
            "amount": "4000",
            "note": null
          }
        }
      }
    },
    "expect": {
      "error": {
        "code": "decision-expired"
      },
      "entry": {
        "status": "expired",
        "execution": null,
        "requirement": "ReviewerConfirmation",
        "blocked": null,
        "attestation": null,
        "amendments": null,
        "decision": null,
        "affidavit": {
          "aggregateConfidence": 0.9,
          "populatedConfidence": 0.9,
          "emptyFieldCount": 0,
          "fields": [
            {
              "name": "status",
              "value": "Active",
              "source": "Conversation",
              "bound": false
            },
            {
              "name": "amount",
              "value": "40",
              "source": "Conversation",
              "bound": false
            },
            {
              "name": "note",
              "value": "kept",
              "source": "Conversation",
              "bound": false
            }
          ]
        },
        "lineage": {
          "supersededBy": null
        },
        "preservedAmendments": {
          "amendments": {
            "amount": "4000",
            "note": null
          },
          "at": "2026-09-04T09:45:00.000Z",
          "by": "ana"
        },
        "amendedAffidavit": null
      }
    }
  },
  {
    "id": "decide/blocked-refused",
    "rules": [
      "AZ-4",
      "DK-1"
    ],
    "title": "A requirement level this version does not run files the entry pending with the level recorded verbatim and a blocked marker, and every decision on it is refused. It is never degraded to the weaker requirement the implementation does know how to run, which is the shipped .NET behaviour of routing MultiParty to the single-card branch.",
    "given": {
      "clock": "2026-09-04T09:00:00.000Z",
      "store": "memory",
      "gate": {
        "defaultTtlMs": 1800000,
        "authorization": {
          "allow": [
            "*"
          ]
        },
        "policies": [
          {
            "id": "joint-sign-off",
            "version": "1.0.0",
            "declaredInputs": [],
            "verdict": {
              "requirement": "MultiParty"
            }
          }
        ]
      },
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "chat",
        "principal": {
          "kind": "member",
          "id": "filer"
        },
        "utterance": "Set the invoice status to Active and the amount to 40",
        "messageId": "msg-1"
      },
      "prior": [
        {
          "kind": "file",
          "as": "filed",
          "at": "2026-09-04T09:00:00.000Z",
          "principal": {
            "kind": "member",
            "id": "filer"
          },
          "toolName": "update_invoice",
          "operation": {
            "kind": "update",
            "entityType": "Invoice",
            "entityId": "invoice-1",
            "fields": [
              "status",
              "amount",
              "note"
            ]
          },
          "preparedFields": [
            {
              "name": "status",
              "kind": "text",
              "value": "Active",
              "provenance": {
                "source": "Conversation",
                "confidence": 0.9
              }
            },
            {
              "name": "amount",
              "kind": "text",
              "value": "40",
              "provenance": {
                "source": "Conversation",
                "confidence": 0.9
              }
            },
            {
              "name": "note",
              "kind": "text",
              "value": "kept",
              "provenance": {
                "source": "Conversation",
                "confidence": 0.9
              }
            }
          ]
        }
      ],
      "step": {
        "kind": "decide",
        "at": "2026-09-04T09:00:00.000Z",
        "principal": {
          "kind": "member",
          "id": "ana"
        },
        "decision": {
          "kind": "approve"
        }
      }
    },
    "expect": {
      "error": {
        "code": "decision-not-pending"
      },
      "entry": {
        "status": "pending",
        "execution": null,
        "requirement": "MultiParty",
        "blocked": {
          "code": "requirement-not-implemented",
          "level": "MultiParty"
        },
        "attestation": null,
        "amendments": null,
        "decision": null,
        "affidavit": {
          "aggregateConfidence": 0.9,
          "populatedConfidence": 0.9,
          "emptyFieldCount": 0,
          "fields": [
            {
              "name": "status",
              "value": "Active",
              "source": "Conversation",
              "bound": false
            },
            {
              "name": "amount",
              "value": "40",
              "source": "Conversation",
              "bound": false
            },
            {
              "name": "note",
              "value": "kept",
              "source": "Conversation",
              "bound": false
            }
          ]
        },
        "lineage": {
          "supersededBy": null
        }
      }
    }
  },
  {
    "id": "decide/amend-recompute",
    "rules": [
      "AF-1",
      "AF-4",
      "DK-2",
      "DK-4",
      "PV-2",
      "SR-1"
    ],
    "title": "An approval carrying an amendment map sets the named values and leaves a field the map does not name untouched. The row keeps the Affidavit as the agent proposed it - unedited, so a reader can still see what the machine said - and gains the accepted state beside it (DK-4). In that accepted state a set field's provenance is the reviewer's act with a reviewer-act binding, and a cleared optional field is off the record entirely, because a field the write no longer proposes is absent rather than present with nothing in it (AF-1) - and because writing the reviewer's confidence of 1 over an emptied field would let a reviewer wipe an Affidavit and leave it reporting perfect confidence over nothing (AF-2). The three numbers are recomputed over what is left. The canonical form follows the accepted state, so a grant minted over the proposal cannot validate the amendment (SR-1).",
    "given": {
      "clock": "2026-09-04T09:00:00.000Z",
      "store": "memory",
      "gate": {
        "defaultTtlMs": 1800000,
        "authorization": {
          "allow": [
            "*"
          ]
        }
      },
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "chat",
        "principal": {
          "kind": "member",
          "id": "filer"
        },
        "utterance": "Set the invoice status to Active and the amount to 40",
        "messageId": "msg-1"
      },
      "prior": [
        {
          "kind": "file",
          "as": "filed",
          "at": "2026-09-04T09:00:00.000Z",
          "principal": {
            "kind": "member",
            "id": "filer"
          },
          "toolName": "update_invoice",
          "operation": {
            "kind": "update",
            "entityType": "Invoice",
            "entityId": "invoice-1",
            "fields": [
              "status",
              "amount",
              "note"
            ]
          },
          "preparedFields": [
            {
              "name": "status",
              "kind": "text",
              "value": "Active",
              "provenance": {
                "source": "Conversation",
                "confidence": 0.9
              }
            },
            {
              "name": "amount",
              "kind": "text",
              "value": "40",
              "provenance": {
                "source": "Conversation",
                "confidence": 0.9
              }
            },
            {
              "name": "note",
              "kind": "text",
              "value": "kept",
              "provenance": {
                "source": "Conversation",
                "confidence": 0.9
              }
            }
          ]
        }
      ],
      "step": {
        "kind": "decide",
        "at": "2026-09-04T09:00:00.000Z",
        "principal": {
          "kind": "member",
          "id": "ana"
        },
        "decision": {
          "kind": "approve",
          "amendments": {
            "amount": "4000",
            "note": null
          }
        }
      }
    },
    "expect": {
      "entry": {
        "status": "approved",
        "execution": "unexecuted",
        "requirement": "ReviewerConfirmation",
        "blocked": null,
        "attestation": {
          "kind": "member",
          "id": "ana"
        },
        "amendments": {
          "amount": "4000",
          "note": null
        },
        "decision": {
          "kind": "approve",
          "reason": null
        },
        "affidavit": {
          "aggregateConfidence": 0.9,
          "populatedConfidence": 0.9,
          "emptyFieldCount": 0,
          "fields": [
            {
              "name": "status",
              "value": "Active",
              "source": "Conversation",
              "bound": false
            },
            {
              "name": "amount",
              "value": "40",
              "source": "Conversation",
              "bound": false
            },
            {
              "name": "note",
              "value": "kept",
              "source": "Conversation",
              "bound": false
            }
          ]
        },
        "lineage": {
          "supersededBy": null
        },
        "amendedAffidavit": {
          "aggregateConfidence": 0.9,
          "populatedConfidence": 0.9,
          "emptyFieldCount": 0,
          "fields": [
            {
              "name": "status",
              "value": "Active",
              "source": "Conversation",
              "bound": false
            },
            {
              "name": "amount",
              "value": "4000",
              "source": "UserStated",
              "bound": true,
              "bindingKind": "reviewer-act",
              "confidence": 1,
              "priorSources": [
                "Conversation"
              ]
            }
          ]
        },
        "preservedAmendments": null,
        "canonicalDiffersFromProposal": true
      },
      "canonicalHash": "8d1579d7c6e7463ae44e36adfc4db166066cf0ae4ddd3e3ea04b52f394ecff6a"
    }
  },
  {
    "id": "decide/unresolved-identity",
    "rules": [
      "AZ-2",
      "AZ-6"
    ],
    "title": "A turn context with no resolved principal refuses the decision: identity unknown is never allow. This filing ran with prepared fields and no policy chain, which is the degraded wiring a host falls back to with no model available, and a degraded wiring does not relax an authorization rule.",
    "given": {
      "clock": "2026-09-04T09:00:00.000Z",
      "store": "memory",
      "gate": {
        "defaultTtlMs": 1800000,
        "authorization": {
          "allow": [
            "*"
          ]
        }
      },
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "chat",
        "principal": {
          "kind": "member",
          "id": "filer"
        },
        "utterance": "Set the invoice status to Active and the amount to 40",
        "messageId": "msg-1"
      },
      "prior": [
        {
          "kind": "file",
          "as": "filed",
          "at": "2026-09-04T09:00:00.000Z",
          "principal": {
            "kind": "member",
            "id": "filer"
          },
          "toolName": "update_invoice",
          "operation": {
            "kind": "update",
            "entityType": "Invoice",
            "entityId": "invoice-1",
            "fields": [
              "status",
              "amount",
              "note"
            ]
          },
          "preparedFields": [
            {
              "name": "status",
              "kind": "text",
              "value": "Active",
              "provenance": {
                "source": "Conversation",
                "confidence": 0.9
              }
            },
            {
              "name": "amount",
              "kind": "text",
              "value": "40",
              "provenance": {
                "source": "Conversation",
                "confidence": 0.9
              }
            },
            {
              "name": "note",
              "kind": "text",
              "value": "kept",
              "provenance": {
                "source": "Conversation",
                "confidence": 0.9
              }
            }
          ]
        }
      ],
      "step": {
        "kind": "decide",
        "at": "2026-09-04T09:00:00.000Z",
        "principal": null,
        "decision": {
          "kind": "approve"
        }
      }
    },
    "expect": {
      "error": {
        "code": "decision-unauthorized"
      },
      "entry": {
        "status": "pending",
        "execution": null,
        "requirement": "ReviewerConfirmation",
        "blocked": null,
        "attestation": null,
        "amendments": null,
        "decision": null,
        "affidavit": {
          "aggregateConfidence": 0.9,
          "populatedConfidence": 0.9,
          "emptyFieldCount": 0,
          "fields": [
            {
              "name": "status",
              "value": "Active",
              "source": "Conversation",
              "bound": false
            },
            {
              "name": "amount",
              "value": "40",
              "source": "Conversation",
              "bound": false
            },
            {
              "name": "note",
              "value": "kept",
              "source": "Conversation",
              "bound": false
            }
          ]
        },
        "lineage": {
          "supersededBy": null
        }
      }
    }
  },
  {
    "id": "decide/wrong-tenant",
    "rules": [
      "AZ-2"
    ],
    "title": "A decision made from another tenant is reported as entry not found, exactly as an id that never existed. Answering unauthorized for that tenant would confirm the id to anyone who could guess one, and the tenant is the boundary the rule exists to hold.",
    "given": {
      "clock": "2026-09-04T09:00:00.000Z",
      "store": "memory",
      "gate": {
        "defaultTtlMs": 1800000,
        "authorization": {
          "allow": [
            "*"
          ]
        }
      },
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "chat",
        "principal": {
          "kind": "member",
          "id": "filer"
        },
        "utterance": "Set the invoice status to Active and the amount to 40",
        "messageId": "msg-1"
      },
      "prior": [
        {
          "kind": "file",
          "as": "filed",
          "at": "2026-09-04T09:00:00.000Z",
          "principal": {
            "kind": "member",
            "id": "filer"
          },
          "toolName": "update_invoice",
          "operation": {
            "kind": "update",
            "entityType": "Invoice",
            "entityId": "invoice-1",
            "fields": [
              "status",
              "amount",
              "note"
            ]
          },
          "preparedFields": [
            {
              "name": "status",
              "kind": "text",
              "value": "Active",
              "provenance": {
                "source": "Conversation",
                "confidence": 0.9
              }
            },
            {
              "name": "amount",
              "kind": "text",
              "value": "40",
              "provenance": {
                "source": "Conversation",
                "confidence": 0.9
              }
            },
            {
              "name": "note",
              "kind": "text",
              "value": "kept",
              "provenance": {
                "source": "Conversation",
                "confidence": 0.9
              }
            }
          ]
        }
      ],
      "step": {
        "kind": "decide",
        "at": "2026-09-04T09:00:00.000Z",
        "principal": {
          "kind": "member",
          "id": "ana"
        },
        "tenantId": "tenant-b",
        "decision": {
          "kind": "approve"
        }
      }
    },
    "expect": {
      "error": {
        "code": "entry-not-found"
      },
      "entry": {
        "status": "pending",
        "execution": null,
        "requirement": "ReviewerConfirmation",
        "blocked": null,
        "attestation": null,
        "amendments": null,
        "decision": null,
        "affidavit": {
          "aggregateConfidence": 0.9,
          "populatedConfidence": 0.9,
          "emptyFieldCount": 0,
          "fields": [
            {
              "name": "status",
              "value": "Active",
              "source": "Conversation",
              "bound": false
            },
            {
              "name": "amount",
              "value": "40",
              "source": "Conversation",
              "bound": false
            },
            {
              "name": "note",
              "value": "kept",
              "source": "Conversation",
              "bound": false
            }
          ]
        },
        "lineage": {
          "supersededBy": null
        }
      }
    }
  },
  {
    "id": "decide/authorization-declined",
    "rules": [
      "AZ-2",
      "AZ-6"
    ],
    "title": "The host's authorization port is asked whether this principal may decide this entry, and the gate fails closed on the answer. A no leaves the row pending and unattested; there is no wiring, degraded or otherwise, in which the check is skipped.",
    "given": {
      "clock": "2026-09-04T09:00:00.000Z",
      "store": "memory",
      "gate": {
        "defaultTtlMs": 1800000,
        "authorization": {
          "allow": []
        }
      },
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "chat",
        "principal": {
          "kind": "member",
          "id": "filer"
        },
        "utterance": "Set the invoice status to Active and the amount to 40",
        "messageId": "msg-1"
      },
      "prior": [
        {
          "kind": "file",
          "as": "filed",
          "at": "2026-09-04T09:00:00.000Z",
          "principal": {
            "kind": "member",
            "id": "filer"
          },
          "toolName": "update_invoice",
          "operation": {
            "kind": "update",
            "entityType": "Invoice",
            "entityId": "invoice-1",
            "fields": [
              "status",
              "amount",
              "note"
            ]
          },
          "preparedFields": [
            {
              "name": "status",
              "kind": "text",
              "value": "Active",
              "provenance": {
                "source": "Conversation",
                "confidence": 0.9
              }
            },
            {
              "name": "amount",
              "kind": "text",
              "value": "40",
              "provenance": {
                "source": "Conversation",
                "confidence": 0.9
              }
            },
            {
              "name": "note",
              "kind": "text",
              "value": "kept",
              "provenance": {
                "source": "Conversation",
                "confidence": 0.9
              }
            }
          ]
        }
      ],
      "step": {
        "kind": "decide",
        "at": "2026-09-04T09:00:00.000Z",
        "principal": {
          "kind": "member",
          "id": "ana"
        },
        "decision": {
          "kind": "approve"
        }
      }
    },
    "expect": {
      "error": {
        "code": "decision-unauthorized"
      },
      "entry": {
        "status": "pending",
        "execution": null,
        "requirement": "ReviewerConfirmation",
        "blocked": null,
        "attestation": null,
        "amendments": null,
        "decision": null,
        "affidavit": {
          "aggregateConfidence": 0.9,
          "populatedConfidence": 0.9,
          "emptyFieldCount": 0,
          "fields": [
            {
              "name": "status",
              "value": "Active",
              "source": "Conversation",
              "bound": false
            },
            {
              "name": "amount",
              "value": "40",
              "source": "Conversation",
              "bound": false
            },
            {
              "name": "note",
              "value": "kept",
              "source": "Conversation",
              "bound": false
            }
          ]
        },
        "lineage": {
          "supersededBy": null
        }
      }
    }
  },
  {
    "id": "decide/relay-member-via-relay",
    "rules": [
      "AZ-3",
      "AZ-1"
    ],
    "title": "Sequence C-2: a decision made by a person through a trusted relay attests member-via-relay, naming both the person the relay speaks for and the relay, its channel identity and the message the decision arrived on. It is the strongest claim available, and it is visibly not a member attestation.",
    "given": {
      "clock": "2026-09-04T09:00:00.000Z",
      "store": "memory",
      "gate": {
        "defaultTtlMs": 1800000,
        "authorization": {
          "allow": [
            "*"
          ]
        }
      },
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "mcp",
        "principal": {
          "kind": "member",
          "id": "filer"
        },
        "utterance": "Set the invoice status to Active and the amount to 40",
        "messageId": "msg-1"
      },
      "prior": [
        {
          "kind": "file",
          "as": "filed",
          "at": "2026-09-04T09:00:00.000Z",
          "principal": {
            "kind": "member",
            "id": "filer"
          },
          "toolName": "update_invoice",
          "operation": {
            "kind": "update",
            "entityType": "Invoice",
            "entityId": "invoice-1",
            "fields": [
              "status",
              "amount",
              "note"
            ]
          },
          "preparedFields": [
            {
              "name": "status",
              "kind": "text",
              "value": "Active",
              "provenance": {
                "source": "Conversation",
                "confidence": 0.9
              }
            },
            {
              "name": "amount",
              "kind": "text",
              "value": "40",
              "provenance": {
                "source": "Conversation",
                "confidence": 0.9
              }
            },
            {
              "name": "note",
              "kind": "text",
              "value": "kept",
              "provenance": {
                "source": "Conversation",
                "confidence": 0.9
              }
            }
          ]
        }
      ],
      "step": {
        "kind": "decide",
        "at": "2026-09-04T09:00:00.000Z",
        "principal": {
          "kind": "service",
          "id": "whatsapp-relay",
          "assertedMember": "ana",
          "relay": {
            "channelIdentity": "+94770000000",
            "messageId": "wamid-42"
          }
        },
        "decision": {
          "kind": "approve"
        }
      }
    },
    "expect": {
      "entry": {
        "status": "approved",
        "execution": "unexecuted",
        "requirement": "ReviewerConfirmation",
        "blocked": null,
        "attestation": {
          "kind": "member-via-relay",
          "memberId": "ana",
          "relay": {
            "principal": "whatsapp-relay",
            "channelIdentity": "+94770000000",
            "messageId": "wamid-42"
          }
        },
        "amendments": null,
        "decision": {
          "kind": "approve",
          "reason": null
        },
        "affidavit": {
          "aggregateConfidence": 0.9,
          "populatedConfidence": 0.9,
          "emptyFieldCount": 0,
          "fields": [
            {
              "name": "status",
              "value": "Active",
              "source": "Conversation",
              "bound": false
            },
            {
              "name": "amount",
              "value": "40",
              "source": "Conversation",
              "bound": false
            },
            {
              "name": "note",
              "value": "kept",
              "source": "Conversation",
              "bound": false
            }
          ]
        },
        "lineage": {
          "supersededBy": null
        }
      }
    }
  },
  {
    "id": "decide/relay-without-assertion-refused",
    "rules": [
      "AZ-3"
    ],
    "title": "Sequence C-4: a machine caller that names neither the person it speaks for nor the message it carried cannot attest a decision at all. There is no path by which a service principal produces a member attestation, so the refusal is the only available answer rather than a weaker attestation.",
    "given": {
      "clock": "2026-09-04T09:00:00.000Z",
      "store": "memory",
      "gate": {
        "defaultTtlMs": 1800000,
        "authorization": {
          "allow": [
            "*"
          ]
        }
      },
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "mcp",
        "principal": {
          "kind": "member",
          "id": "filer"
        },
        "utterance": "Set the invoice status to Active and the amount to 40",
        "messageId": "msg-1"
      },
      "prior": [
        {
          "kind": "file",
          "as": "filed",
          "at": "2026-09-04T09:00:00.000Z",
          "principal": {
            "kind": "member",
            "id": "filer"
          },
          "toolName": "update_invoice",
          "operation": {
            "kind": "update",
            "entityType": "Invoice",
            "entityId": "invoice-1",
            "fields": [
              "status",
              "amount",
              "note"
            ]
          },
          "preparedFields": [
            {
              "name": "status",
              "kind": "text",
              "value": "Active",
              "provenance": {
                "source": "Conversation",
                "confidence": 0.9
              }
            },
            {
              "name": "amount",
              "kind": "text",
              "value": "40",
              "provenance": {
                "source": "Conversation",
                "confidence": 0.9
              }
            },
            {
              "name": "note",
              "kind": "text",
              "value": "kept",
              "provenance": {
                "source": "Conversation",
                "confidence": 0.9
              }
            }
          ]
        },
        {
          "kind": "decide",
          "at": "2026-09-04T09:00:00.000Z",
          "principal": {
            "kind": "service",
            "id": "svc-1"
          },
          "decision": {
            "kind": "approve"
          },
          "refusal": "decision-unauthorized"
        }
      ],
      "step": {
        "kind": "decide",
        "at": "2026-09-04T09:01:00.000Z",
        "principal": {
          "kind": "service",
          "id": "whatsapp-relay",
          "assertedMember": "ana"
        },
        "decision": {
          "kind": "approve"
        }
      }
    },
    "expect": {
      "error": {
        "code": "decision-unauthorized"
      },
      "entry": {
        "status": "pending",
        "execution": null,
        "requirement": "ReviewerConfirmation",
        "blocked": null,
        "attestation": null,
        "amendments": null,
        "decision": null,
        "affidavit": {
          "aggregateConfidence": 0.9,
          "populatedConfidence": 0.9,
          "emptyFieldCount": 0,
          "fields": [
            {
              "name": "status",
              "value": "Active",
              "source": "Conversation",
              "bound": false
            },
            {
              "name": "amount",
              "value": "40",
              "source": "Conversation",
              "bound": false
            },
            {
              "name": "note",
              "value": "kept",
              "source": "Conversation",
              "bound": false
            }
          ]
        },
        "lineage": {
          "supersededBy": null
        }
      }
    }
  },
  {
    "id": "decide/execution-executed",
    "rules": [
      "DK-1",
      "AZ-5"
    ],
    "title": "The host's executor reports that the approved write happened. The status stays approved and only the execution outcome moves, so the approval is not re-litigated by the report; the detail the executor gave is kept beside it.",
    "given": {
      "clock": "2026-09-04T09:00:00.000Z",
      "store": "memory",
      "gate": {
        "defaultTtlMs": 1800000,
        "authorization": {
          "allow": [
            "*"
          ]
        }
      },
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "chat",
        "principal": {
          "kind": "member",
          "id": "filer"
        },
        "utterance": "Set the invoice status to Active and the amount to 40",
        "messageId": "msg-1"
      },
      "prior": [
        {
          "kind": "file",
          "as": "filed",
          "at": "2026-09-04T09:00:00.000Z",
          "principal": {
            "kind": "member",
            "id": "filer"
          },
          "toolName": "update_invoice",
          "operation": {
            "kind": "update",
            "entityType": "Invoice",
            "entityId": "invoice-1",
            "fields": [
              "status",
              "amount",
              "note"
            ]
          },
          "preparedFields": [
            {
              "name": "status",
              "kind": "text",
              "value": "Active",
              "provenance": {
                "source": "Conversation",
                "confidence": 0.9
              }
            },
            {
              "name": "amount",
              "kind": "text",
              "value": "40",
              "provenance": {
                "source": "Conversation",
                "confidence": 0.9
              }
            },
            {
              "name": "note",
              "kind": "text",
              "value": "kept",
              "provenance": {
                "source": "Conversation",
                "confidence": 0.9
              }
            }
          ]
        },
        {
          "kind": "decide",
          "at": "2026-09-04T09:00:00.000Z",
          "principal": {
            "kind": "member",
            "id": "ana"
          },
          "decision": {
            "kind": "approve"
          },
          "refusal": null
        }
      ],
      "step": {
        "kind": "markExecuted",
        "at": "2026-09-04T09:01:00.000Z",
        "principal": {
          "kind": "member",
          "id": "ana"
        },
        "outcome": "executed",
        "detail": "invoice row 41"
      }
    },
    "expect": {
      "entry": {
        "status": "approved",
        "execution": "executed",
        "requirement": "ReviewerConfirmation",
        "blocked": null,
        "attestation": {
          "kind": "member",
          "id": "ana"
        },
        "amendments": null,
        "decision": {
          "kind": "approve",
          "reason": null
        },
        "affidavit": {
          "aggregateConfidence": 0.9,
          "populatedConfidence": 0.9,
          "emptyFieldCount": 0,
          "fields": [
            {
              "name": "status",
              "value": "Active",
              "source": "Conversation",
              "bound": false
            },
            {
              "name": "amount",
              "value": "40",
              "source": "Conversation",
              "bound": false
            },
            {
              "name": "note",
              "value": "kept",
              "source": "Conversation",
              "bound": false
            }
          ]
        },
        "lineage": {
          "supersededBy": null
        }
      }
    }
  },
  {
    "id": "decide/execution-failed",
    "rules": [
      "DK-1"
    ],
    "title": "An approved-but-failed write is distinguishable from an approved-and-committed one on the row: the status is still approved, because the approval happened, and the execution outcome is failed. Collapsing the two into the status would lose the approval.",
    "given": {
      "clock": "2026-09-04T09:00:00.000Z",
      "store": "memory",
      "gate": {
        "defaultTtlMs": 1800000,
        "authorization": {
          "allow": [
            "*"
          ]
        }
      },
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "chat",
        "principal": {
          "kind": "member",
          "id": "filer"
        },
        "utterance": "Set the invoice status to Active and the amount to 40",
        "messageId": "msg-1"
      },
      "prior": [
        {
          "kind": "file",
          "as": "filed",
          "at": "2026-09-04T09:00:00.000Z",
          "principal": {
            "kind": "member",
            "id": "filer"
          },
          "toolName": "update_invoice",
          "operation": {
            "kind": "update",
            "entityType": "Invoice",
            "entityId": "invoice-1",
            "fields": [
              "status",
              "amount",
              "note"
            ]
          },
          "preparedFields": [
            {
              "name": "status",
              "kind": "text",
              "value": "Active",
              "provenance": {
                "source": "Conversation",
                "confidence": 0.9
              }
            },
            {
              "name": "amount",
              "kind": "text",
              "value": "40",
              "provenance": {
                "source": "Conversation",
                "confidence": 0.9
              }
            },
            {
              "name": "note",
              "kind": "text",
              "value": "kept",
              "provenance": {
                "source": "Conversation",
                "confidence": 0.9
              }
            }
          ]
        },
        {
          "kind": "decide",
          "at": "2026-09-04T09:00:00.000Z",
          "principal": {
            "kind": "member",
            "id": "ana"
          },
          "decision": {
            "kind": "approve"
          },
          "refusal": null
        }
      ],
      "step": {
        "kind": "markExecuted",
        "at": "2026-09-04T09:01:00.000Z",
        "principal": {
          "kind": "member",
          "id": "ana"
        },
        "outcome": "failed",
        "detail": "unique constraint on invoice_no"
      }
    },
    "expect": {
      "entry": {
        "status": "approved",
        "execution": "failed",
        "requirement": "ReviewerConfirmation",
        "blocked": null,
        "attestation": {
          "kind": "member",
          "id": "ana"
        },
        "amendments": null,
        "decision": {
          "kind": "approve",
          "reason": null
        },
        "affidavit": {
          "aggregateConfidence": 0.9,
          "populatedConfidence": 0.9,
          "emptyFieldCount": 0,
          "fields": [
            {
              "name": "status",
              "value": "Active",
              "source": "Conversation",
              "bound": false
            },
            {
              "name": "amount",
              "value": "40",
              "source": "Conversation",
              "bound": false
            },
            {
              "name": "note",
              "value": "kept",
              "source": "Conversation",
              "bound": false
            }
          ]
        },
        "lineage": {
          "supersededBy": null
        }
      }
    }
  },
  {
    "id": "decide/execution-on-pending-refused",
    "rules": [
      "DK-1",
      "AZ-5"
    ],
    "title": "An execution outcome is only ever recorded against an approved, attested row. A report on a pending entry is refused, because there is no authorised write for an executor to have performed and the Docket entry is the sole record of that authority.",
    "given": {
      "clock": "2026-09-04T09:00:00.000Z",
      "store": "memory",
      "gate": {
        "defaultTtlMs": 1800000,
        "authorization": {
          "allow": [
            "*"
          ]
        }
      },
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "chat",
        "principal": {
          "kind": "member",
          "id": "filer"
        },
        "utterance": "Set the invoice status to Active and the amount to 40",
        "messageId": "msg-1"
      },
      "prior": [
        {
          "kind": "file",
          "as": "filed",
          "at": "2026-09-04T09:00:00.000Z",
          "principal": {
            "kind": "member",
            "id": "filer"
          },
          "toolName": "update_invoice",
          "operation": {
            "kind": "update",
            "entityType": "Invoice",
            "entityId": "invoice-1",
            "fields": [
              "status",
              "amount",
              "note"
            ]
          },
          "preparedFields": [
            {
              "name": "status",
              "kind": "text",
              "value": "Active",
              "provenance": {
                "source": "Conversation",
                "confidence": 0.9
              }
            },
            {
              "name": "amount",
              "kind": "text",
              "value": "40",
              "provenance": {
                "source": "Conversation",
                "confidence": 0.9
              }
            },
            {
              "name": "note",
              "kind": "text",
              "value": "kept",
              "provenance": {
                "source": "Conversation",
                "confidence": 0.9
              }
            }
          ]
        }
      ],
      "step": {
        "kind": "markExecuted",
        "at": "2026-09-04T09:00:00.000Z",
        "principal": {
          "kind": "member",
          "id": "ana"
        },
        "outcome": "executed"
      }
    },
    "expect": {
      "error": {
        "code": "decision-not-pending"
      },
      "entry": {
        "status": "pending",
        "execution": null,
        "requirement": "ReviewerConfirmation",
        "blocked": null,
        "attestation": null,
        "amendments": null,
        "decision": null,
        "affidavit": {
          "aggregateConfidence": 0.9,
          "populatedConfidence": 0.9,
          "emptyFieldCount": 0,
          "fields": [
            {
              "name": "status",
              "value": "Active",
              "source": "Conversation",
              "bound": false
            },
            {
              "name": "amount",
              "value": "40",
              "source": "Conversation",
              "bound": false
            },
            {
              "name": "note",
              "value": "kept",
              "source": "Conversation",
              "bound": false
            }
          ]
        },
        "lineage": {
          "supersededBy": null
        }
      }
    }
  },
  {
    "id": "decide/resubmit-prefills",
    "rules": [
      "DK-1",
      "DK-2",
      "PV-2"
    ],
    "title": "A resubmission is a new entry, never a reopened one: the expired entry keeps its terminal state and gains a successor link, and the new row names what it supersedes. The amendments the refused late decision left behind are prefilled as values, each carrying the reviewer's act with a reviewer-act binding that names the superseded entry and the instant the correction was actually made. The resubmission is filed under the same tool the original proposal came from, so coverage can be re-assessed.",
    "given": {
      "clock": "2026-09-04T09:00:00.000Z",
      "store": "memory",
      "gate": {
        "defaultTtlMs": 1800000,
        "authorization": {
          "allow": [
            "*"
          ]
        }
      },
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "chat",
        "principal": {
          "kind": "member",
          "id": "filer"
        },
        "utterance": "Set the invoice status to Active and the amount to 40",
        "messageId": "msg-1"
      },
      "prior": [
        {
          "kind": "file",
          "as": "filed",
          "at": "2026-09-04T09:00:00.000Z",
          "principal": {
            "kind": "member",
            "id": "filer"
          },
          "toolName": "update_invoice",
          "operation": {
            "kind": "update",
            "entityType": "Invoice",
            "entityId": "invoice-1",
            "fields": [
              "status",
              "amount",
              "note"
            ]
          },
          "preparedFields": [
            {
              "name": "status",
              "kind": "text",
              "value": "Active",
              "provenance": {
                "source": "Conversation",
                "confidence": 0.9
              }
            },
            {
              "name": "amount",
              "kind": "text",
              "value": "40",
              "provenance": {
                "source": "Conversation",
                "confidence": 0.9
              }
            },
            {
              "name": "note",
              "kind": "text",
              "value": "kept",
              "provenance": {
                "source": "Conversation",
                "confidence": 0.9
              }
            }
          ]
        },
        {
          "kind": "decide",
          "at": "2026-09-04T09:45:00.000Z",
          "principal": {
            "kind": "member",
            "id": "ana"
          },
          "decision": {
            "kind": "approve",
            "amendments": {
              "amount": "4000",
              "note": null
            }
          },
          "refusal": "decision-expired"
        }
      ],
      "step": {
        "kind": "resubmit",
        "at": "2026-09-04T09:46:00.000Z",
        "principal": {
          "kind": "member",
          "id": "ana"
        }
      }
    },
    "expect": {
      "entry": {
        "status": "pending",
        "execution": null,
        "affidavit": {
          "fields": [
            {
              "name": "status",
              "value": "Active",
              "source": "Conversation",
              "bound": false
            },
            {
              "name": "amount",
              "value": "4000",
              "source": "UserStated",
              "bound": true,
              "bindingKind": "reviewer-act",
              "priorSources": [
                "Conversation"
              ]
            },
            {
              "name": "note",
              "value": null,
              "source": "UserStated",
              "bound": true,
              "bindingKind": "reviewer-act",
              "priorSources": [
                "Conversation"
              ]
            }
          ]
        },
        "lineage": {
          "supersedes": "@some"
        },
        "toolName": "update_invoice",
        "preservedAmendments": null,
        "amendedAffidavit": null
      },
      "card": {
        "priorAmendments": {
          "amount": "4000",
          "note": null
        }
      },
      "superseded": {
        "status": "expired",
        "execution": null,
        "requirement": "ReviewerConfirmation",
        "blocked": null,
        "attestation": null,
        "amendments": null,
        "decision": null,
        "affidavit": {
          "aggregateConfidence": 0.9,
          "populatedConfidence": 0.9,
          "emptyFieldCount": 0,
          "fields": [
            {
              "name": "status",
              "value": "Active",
              "source": "Conversation",
              "bound": false
            },
            {
              "name": "amount",
              "value": "40",
              "source": "Conversation",
              "bound": false
            },
            {
              "name": "note",
              "value": "kept",
              "source": "Conversation",
              "bound": false
            }
          ]
        },
        "lineage": {
          "supersededBy": "@some"
        },
        "preservedAmendments": {
          "amendments": {
            "amount": "4000",
            "note": null
          },
          "at": "2026-09-04T09:45:00.000Z",
          "by": "ana"
        }
      }
    }
  },
  {
    "id": "decide/executed-only-through-a-report",
    "rules": [
      "AZ-7"
    ],
    "title": "The gate never performs the write and never calls an executor: after an approval, and after every other act the gate offers, the row is still unexecuted. Only a host's own report moves it, which is the fixture pair with the execution outcome above.",
    "given": {
      "clock": "2026-09-04T09:00:00.000Z",
      "store": "memory",
      "gate": {
        "defaultTtlMs": 1800000,
        "authorization": {
          "allow": [
            "*"
          ]
        }
      },
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "chat",
        "principal": {
          "kind": "member",
          "id": "filer"
        },
        "utterance": "Set the invoice status to Active and the amount to 40",
        "messageId": "msg-1"
      },
      "prior": [
        {
          "kind": "file",
          "as": "filed",
          "at": "2026-09-04T09:00:00.000Z",
          "principal": {
            "kind": "member",
            "id": "filer"
          },
          "toolName": "update_invoice",
          "operation": {
            "kind": "update",
            "entityType": "Invoice",
            "entityId": "invoice-1",
            "fields": [
              "status",
              "amount",
              "note"
            ]
          },
          "preparedFields": [
            {
              "name": "status",
              "kind": "text",
              "value": "Active",
              "provenance": {
                "source": "Conversation",
                "confidence": 0.9
              }
            },
            {
              "name": "amount",
              "kind": "text",
              "value": "40",
              "provenance": {
                "source": "Conversation",
                "confidence": 0.9
              }
            },
            {
              "name": "note",
              "kind": "text",
              "value": "kept",
              "provenance": {
                "source": "Conversation",
                "confidence": 0.9
              }
            }
          ]
        },
        {
          "kind": "decide",
          "at": "2026-09-04T09:00:00.000Z",
          "principal": {
            "kind": "member",
            "id": "ana"
          },
          "decision": {
            "kind": "approve"
          },
          "refusal": null
        },
        {
          "kind": "resubmit",
          "at": "2026-09-04T09:01:00.000Z",
          "principal": {
            "kind": "member",
            "id": "ana"
          },
          "refusal": "decision-not-pending"
        }
      ],
      "step": {
        "kind": "decide",
        "at": "2026-09-04T09:02:00.000Z",
        "principal": {
          "kind": "member",
          "id": "bo"
        },
        "decision": {
          "kind": "approve"
        }
      }
    },
    "expect": {
      "error": {
        "code": "decision-not-pending"
      },
      "entry": {
        "status": "approved",
        "execution": "unexecuted",
        "requirement": "ReviewerConfirmation",
        "blocked": null,
        "attestation": {
          "kind": "member",
          "id": "ana"
        },
        "amendments": null,
        "decision": {
          "kind": "approve",
          "reason": null
        },
        "affidavit": {
          "aggregateConfidence": 0.9,
          "populatedConfidence": 0.9,
          "emptyFieldCount": 0,
          "fields": [
            {
              "name": "status",
              "value": "Active",
              "source": "Conversation",
              "bound": false
            },
            {
              "name": "amount",
              "value": "40",
              "source": "Conversation",
              "bound": false
            },
            {
              "name": "note",
              "value": "kept",
              "source": "Conversation",
              "bound": false
            }
          ]
        },
        "lineage": {
          "supersededBy": null
        }
      }
    }
  },
  {
    "id": "decide/authorization-throws",
    "rules": [
      "AZ-2",
      "AZ-6"
    ],
    "title": "The host's authorization port fell over rather than answering. The decision is refused: a port that throws has not said yes, and the whole of AZ-2 is that identity unknown is never allow. There is no degraded path here either - nothing in the decision path is conditional on a port being reachable, so a directory outage cannot turn into an approval.",
    "given": {
      "clock": "2026-09-04T09:00:00.000Z",
      "store": "memory",
      "gate": {
        "defaultTtlMs": 1800000,
        "authorization": {
          "allow": [
            "*"
          ],
          "throws": true
        }
      },
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "chat",
        "principal": {
          "kind": "member",
          "id": "filer"
        },
        "utterance": "Set the invoice status to Active and the amount to 40",
        "messageId": "msg-1"
      },
      "prior": [
        {
          "kind": "file",
          "as": "filed",
          "at": "2026-09-04T09:00:00.000Z",
          "principal": {
            "kind": "member",
            "id": "filer"
          },
          "toolName": "update_invoice",
          "operation": {
            "kind": "update",
            "entityType": "Invoice",
            "entityId": "invoice-1",
            "fields": [
              "status",
              "amount",
              "note"
            ]
          },
          "preparedFields": [
            {
              "name": "status",
              "kind": "text",
              "value": "Active",
              "provenance": {
                "source": "Conversation",
                "confidence": 0.9
              }
            },
            {
              "name": "amount",
              "kind": "text",
              "value": "40",
              "provenance": {
                "source": "Conversation",
                "confidence": 0.9
              }
            },
            {
              "name": "note",
              "kind": "text",
              "value": "kept",
              "provenance": {
                "source": "Conversation",
                "confidence": 0.9
              }
            }
          ]
        }
      ],
      "step": {
        "kind": "decide",
        "at": "2026-09-04T09:00:00.000Z",
        "principal": {
          "kind": "member",
          "id": "ana"
        },
        "decision": {
          "kind": "approve"
        }
      }
    },
    "expect": {
      "error": {
        "code": "decision-unauthorized"
      },
      "entry": {
        "status": "pending",
        "execution": null,
        "attestation": null,
        "decision": null,
        "amendments": null,
        "preservedAmendments": null
      },
      "telemetry": [
        "decision.unauthorized"
      ]
    }
  },
  {
    "id": "decide/execution-recorded-once",
    "rules": [
      "DK-1",
      "DK-4",
      "AZ-5"
    ],
    "title": "An execution outcome is recorded once. A committed write is reported executed, and a later report saying the same write failed is refused: the row keeps the outcome it was given, because a recorded fact is appended to and never edited in place, and an approved-and-committed write has to stay distinguishable from an approved-but-failed one.",
    "given": {
      "clock": "2026-09-04T09:00:00.000Z",
      "store": "memory",
      "gate": {
        "defaultTtlMs": 1800000,
        "authorization": {
          "allow": [
            "*"
          ]
        }
      },
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "chat",
        "principal": {
          "kind": "member",
          "id": "filer"
        },
        "utterance": "Set the invoice status to Active and the amount to 40",
        "messageId": "msg-1"
      },
      "prior": [
        {
          "kind": "file",
          "as": "filed",
          "at": "2026-09-04T09:00:00.000Z",
          "principal": {
            "kind": "member",
            "id": "filer"
          },
          "toolName": "update_invoice",
          "operation": {
            "kind": "update",
            "entityType": "Invoice",
            "entityId": "invoice-1",
            "fields": [
              "status",
              "amount",
              "note"
            ]
          },
          "preparedFields": [
            {
              "name": "status",
              "kind": "text",
              "value": "Active",
              "provenance": {
                "source": "Conversation",
                "confidence": 0.9
              }
            },
            {
              "name": "amount",
              "kind": "text",
              "value": "40",
              "provenance": {
                "source": "Conversation",
                "confidence": 0.9
              }
            },
            {
              "name": "note",
              "kind": "text",
              "value": "kept",
              "provenance": {
                "source": "Conversation",
                "confidence": 0.9
              }
            }
          ]
        },
        {
          "kind": "decide",
          "at": "2026-09-04T09:00:00.000Z",
          "principal": {
            "kind": "member",
            "id": "ana"
          },
          "decision": {
            "kind": "approve"
          },
          "refusal": null
        },
        {
          "kind": "markExecuted",
          "at": "2026-09-04T09:01:00.000Z",
          "principal": {
            "kind": "member",
            "id": "ana"
          },
          "outcome": "executed",
          "detail": "invoice row 41",
          "refusal": null
        }
      ],
      "step": {
        "kind": "markExecuted",
        "at": "2026-09-04T09:02:00.000Z",
        "principal": {
          "kind": "member",
          "id": "ana"
        },
        "outcome": "failed",
        "detail": "actually it blew up"
      }
    },
    "expect": {
      "error": {
        "code": "execution-already-recorded",
        "messageContains": "reports once"
      },
      "entry": {
        "status": "approved",
        "execution": "executed",
        "executionDetail": "invoice row 41",
        "requirement": "ReviewerConfirmation",
        "blocked": null,
        "attestation": {
          "kind": "member",
          "id": "ana"
        },
        "amendments": null,
        "decision": {
          "kind": "approve",
          "reason": null
        },
        "affidavit": {
          "aggregateConfidence": 0.9,
          "populatedConfidence": 0.9,
          "emptyFieldCount": 0,
          "fields": [
            {
              "name": "status",
              "value": "Active",
              "source": "Conversation",
              "bound": false
            },
            {
              "name": "amount",
              "value": "40",
              "source": "Conversation",
              "bound": false
            },
            {
              "name": "note",
              "value": "kept",
              "source": "Conversation",
              "bound": false
            }
          ]
        },
        "amendedAffidavit": null,
        "lineage": {
          "supersededBy": null
        }
      },
      "store": {
        "count": 1,
        "approvedUnexecuted": 0
      }
    }
  },
  {
    "id": "decide/execution-second-report-refused",
    "rules": [
      "DK-1",
      "DK-4",
      "AZ-5"
    ],
    "title": "The guard runs in both directions: a write reported failed cannot later be reported executed either. A host that retries a write reports once, when it knows the outcome - the retries are the host's business, and the Docket carries the one fact about what happened, not the last thing anybody said.",
    "given": {
      "clock": "2026-09-04T09:00:00.000Z",
      "store": "memory",
      "gate": {
        "defaultTtlMs": 1800000,
        "authorization": {
          "allow": [
            "*"
          ]
        }
      },
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "chat",
        "principal": {
          "kind": "member",
          "id": "filer"
        },
        "utterance": "Set the invoice status to Active and the amount to 40",
        "messageId": "msg-1"
      },
      "prior": [
        {
          "kind": "file",
          "as": "filed",
          "at": "2026-09-04T09:00:00.000Z",
          "principal": {
            "kind": "member",
            "id": "filer"
          },
          "toolName": "update_invoice",
          "operation": {
            "kind": "update",
            "entityType": "Invoice",
            "entityId": "invoice-1",
            "fields": [
              "status",
              "amount",
              "note"
            ]
          },
          "preparedFields": [
            {
              "name": "status",
              "kind": "text",
              "value": "Active",
              "provenance": {
                "source": "Conversation",
                "confidence": 0.9
              }
            },
            {
              "name": "amount",
              "kind": "text",
              "value": "40",
              "provenance": {
                "source": "Conversation",
                "confidence": 0.9
              }
            },
            {
              "name": "note",
              "kind": "text",
              "value": "kept",
              "provenance": {
                "source": "Conversation",
                "confidence": 0.9
              }
            }
          ]
        },
        {
          "kind": "decide",
          "at": "2026-09-04T09:00:00.000Z",
          "principal": {
            "kind": "member",
            "id": "ana"
          },
          "decision": {
            "kind": "approve"
          },
          "refusal": null
        },
        {
          "kind": "markExecuted",
          "at": "2026-09-04T09:01:00.000Z",
          "principal": {
            "kind": "member",
            "id": "ana"
          },
          "outcome": "failed",
          "detail": "unique constraint on invoice_no",
          "refusal": null
        }
      ],
      "step": {
        "kind": "markExecuted",
        "at": "2026-09-04T09:02:00.000Z",
        "principal": {
          "kind": "member",
          "id": "ana"
        },
        "outcome": "executed",
        "detail": "retried and it worked"
      }
    },
    "expect": {
      "error": {
        "code": "execution-already-recorded",
        "messageContains": "reports once"
      },
      "entry": {
        "status": "approved",
        "execution": "failed",
        "executionDetail": "unique constraint on invoice_no",
        "requirement": "ReviewerConfirmation",
        "blocked": null,
        "attestation": {
          "kind": "member",
          "id": "ana"
        },
        "amendments": null,
        "decision": {
          "kind": "approve",
          "reason": null
        },
        "affidavit": {
          "aggregateConfidence": 0.9,
          "populatedConfidence": 0.9,
          "emptyFieldCount": 0,
          "fields": [
            {
              "name": "status",
              "value": "Active",
              "source": "Conversation",
              "bound": false
            },
            {
              "name": "amount",
              "value": "40",
              "source": "Conversation",
              "bound": false
            },
            {
              "name": "note",
              "value": "kept",
              "source": "Conversation",
              "bound": false
            }
          ]
        },
        "amendedAffidavit": null,
        "lineage": {
          "supersededBy": null
        }
      },
      "store": {
        "count": 1,
        "approvedUnexecuted": 0
      }
    }
  },
  {
    "id": "sequence-a/approve-round-trip",
    "rules": [
      "GT-1",
      "GT-6",
      "DK-1",
      "AZ-1",
      "AZ-5",
      "SR-1"
    ],
    "title": "The whole of Sequence A: a chat turn calls a wrapped write tool, the gate files an Affidavit instead of writing, a person approves it, and the host's executor reports back. The tool's own execute is never called at any point - the wrapped one files a proposal and returns the card - so the only path to executed is a report against an approved, attested row.",
    "given": {
      "clock": "2026-09-04T09:00:00.000Z",
      "store": "memory",
      "gate": {
        "defaultTtlMs": 1800000,
        "authorization": {
          "allow": [
            "*"
          ]
        },
        "inference": {
          "status": {
            "value": "Active",
            "confidence": 0.9,
            "presence": "literal",
            "utteranceSpan": {
              "start": 21,
              "end": 27
            }
          }
        }
      },
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "chat",
        "principal": {
          "kind": "member",
          "id": "ana"
        },
        "utterance": "Set invoice INV-2 to Active",
        "messageId": "msg-1"
      },
      "prior": [
        {
          "kind": "wrap-execute",
          "as": "filed",
          "at": "2026-09-04T09:00:00.000Z",
          "tool": {
            "name": "update_invoice",
            "description": "Update an invoice",
            "entityType": "Invoice",
            "entityId": "invoice-1",
            "writeCapable": true,
            "fields": [
              {
                "name": "status",
                "kind": "enum",
                "description": "The invoice status",
                "required": true,
                "allowedValues": [
                  "Draft",
                  "Active",
                  "Retired"
                ],
                "pattern": null
              }
            ]
          },
          "args": {
            "status": "Draft"
          }
        },
        {
          "kind": "decide",
          "at": "2026-09-04T09:00:00.000Z",
          "principal": {
            "kind": "member",
            "id": "ana"
          },
          "decision": {
            "kind": "approve",
            "reason": "matches the purchase order"
          },
          "refusal": null
        }
      ],
      "step": {
        "kind": "markExecuted",
        "at": "2026-09-04T09:01:00.000Z",
        "principal": {
          "kind": "service",
          "id": "executor-1"
        },
        "outcome": "executed",
        "detail": "1 row updated"
      }
    },
    "expect": {
      "entry": {
        "status": "approved",
        "execution": "executed",
        "requirement": "ReviewerConfirmation",
        "blocked": null,
        "toolName": "update_invoice",
        "channel": "chat",
        "attestation": {
          "kind": "member",
          "id": "ana"
        },
        "decision": {
          "kind": "approve",
          "reason": "matches the purchase order"
        },
        "amendments": null,
        "preservedAmendments": null,
        "amendedAffidavit": null,
        "expiresAtOffsetMs": 1800000,
        "affidavit": {
          "operationType": "update",
          "entityType": "Invoice",
          "entityId": "invoice-1",
          "aggregateConfidence": 0.9,
          "populatedConfidence": 0.9,
          "emptyFieldCount": 0,
          "fields": [
            {
              "name": "status",
              "value": "Active",
              "previousValue": null,
              "kind": "enum",
              "isMandatory": true,
              "source": "Conversation",
              "bound": true,
              "bindingKind": "utterance-span",
              "confidence": 0.9
            }
          ]
        }
      },
      "telemetry": [
        "affidavit.filed",
        "docket.transition"
      ],
      "store": {
        "count": 1,
        "pending": 0,
        "approvedUnexecuted": 0
      },
      "canonicalHash": "776b7b407490fb96b4792a1aba4dd0ea23518e4fb5288324fa0ce56af6837275"
    }
  },
  {
    "id": "sequence-a/reject-round-trip",
    "rules": [
      "DK-1",
      "AZ-1"
    ],
    "title": "A person rejects the proposal: the row moves to rejected, carries no execution outcome because there is no authorised write, and records both the reason the person gave and the attestation naming them. Nothing was written to the host's store, and nothing can be - a rejected row has no path to an execution report.",
    "given": {
      "clock": "2026-09-04T09:00:00.000Z",
      "store": "memory",
      "gate": {
        "defaultTtlMs": 1800000,
        "authorization": {
          "allow": [
            "*"
          ]
        },
        "inference": {
          "status": {
            "value": "Active",
            "confidence": 0.9,
            "presence": "literal",
            "utteranceSpan": {
              "start": 21,
              "end": 27
            }
          }
        }
      },
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "chat",
        "principal": {
          "kind": "member",
          "id": "ana"
        },
        "utterance": "Set invoice INV-2 to Active",
        "messageId": "msg-1"
      },
      "prior": [
        {
          "kind": "wrap-execute",
          "as": "filed",
          "at": "2026-09-04T09:00:00.000Z",
          "tool": {
            "name": "update_invoice",
            "description": "Update an invoice",
            "entityType": "Invoice",
            "entityId": "invoice-1",
            "writeCapable": true,
            "fields": [
              {
                "name": "status",
                "kind": "enum",
                "description": "The invoice status",
                "required": true,
                "allowedValues": [
                  "Draft",
                  "Active",
                  "Retired"
                ],
                "pattern": null
              }
            ]
          },
          "args": {
            "status": "Draft"
          }
        }
      ],
      "step": {
        "kind": "decide",
        "at": "2026-09-04T09:00:00.000Z",
        "principal": {
          "kind": "member",
          "id": "ana"
        },
        "decision": {
          "kind": "reject",
          "reason": "the purchase order says Retired"
        }
      }
    },
    "expect": {
      "entry": {
        "status": "rejected",
        "execution": null,
        "blocked": null,
        "attestation": {
          "kind": "member",
          "id": "ana"
        },
        "decision": {
          "kind": "reject",
          "reason": "the purchase order says Retired"
        },
        "amendedAffidavit": null
      },
      "store": {
        "count": 1,
        "pending": 0,
        "approvedUnexecuted": 0
      }
    }
  },
  {
    "id": "sequence-a/typed-inputs-on-the-card",
    "rules": [
      "AF-1",
      "SR-4",
      "AF-2"
    ],
    "title": "A tool whose fields are typed - an enum with its closed set, a number with the pattern a reviewer's input is constrained by, a date, a free text - produces a card carrying every one of those shapes. The reviewer surface renders the control the field deserves rather than four text boxes, and the gate carries the constraint without ever validating a value against it: the pattern is presentation, not sworn substance.",
    "given": {
      "clock": "2026-09-04T09:00:00.000Z",
      "store": "memory",
      "gate": {
        "defaultTtlMs": 1800000,
        "authorization": {
          "allow": [
            "*"
          ]
        },
        "inference": {
          "status": {
            "value": "Active",
            "confidence": 0.9,
            "presence": "literal",
            "utteranceSpan": null
          },
          "amount": {
            "value": 40,
            "confidence": 0.8,
            "presence": "literal",
            "utteranceSpan": null
          },
          "dueOn": {
            "value": "2026-10-01",
            "confidence": 0.6,
            "presence": "inferred",
            "utteranceSpan": null
          },
          "note": {
            "value": "raised in chat",
            "confidence": 0.7,
            "presence": "inferred",
            "utteranceSpan": null
          }
        }
      },
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "chat",
        "principal": {
          "kind": "member",
          "id": "ana"
        },
        "utterance": "Set invoice INV-2 to Active for 40, due on the first of October",
        "messageId": "msg-1"
      },
      "prior": [],
      "step": {
        "kind": "wrap-execute",
        "at": "2026-09-04T09:00:00.000Z",
        "tool": {
          "name": "update_invoice",
          "description": "Update an invoice",
          "entityType": "Invoice",
          "entityId": "invoice-1",
          "writeCapable": true,
          "fields": [
            {
              "name": "status",
              "kind": "enum",
              "description": "The invoice status",
              "required": true,
              "allowedValues": [
                "Draft",
                "Active",
                "Retired"
              ],
              "pattern": null
            },
            {
              "name": "amount",
              "kind": "number",
              "description": "The invoice total",
              "required": true,
              "allowedValues": null,
              "pattern": "^\\d+(\\.\\d{1,2})?$"
            },
            {
              "name": "dueOn",
              "kind": "date",
              "description": "When payment is due",
              "required": false,
              "allowedValues": null,
              "pattern": null
            },
            {
              "name": "note",
              "kind": "text",
              "description": null,
              "required": false,
              "allowedValues": null,
              "pattern": null
            }
          ]
        },
        "args": {
          "status": "Draft",
          "amount": 0,
          "dueOn": null,
          "note": null
        }
      }
    },
    "expect": {
      "entry": {
        "status": "pending",
        "requirement": "ReviewerConfirmation",
        "toolName": "update_invoice",
        "affidavit": {
          "aggregateConfidence": 0.6,
          "populatedConfidence": 0.6,
          "emptyFieldCount": 0,
          "fields": [
            {
              "name": "status",
              "kind": "enum",
              "value": "Active",
              "isMandatory": true,
              "source": "Conversation"
            },
            {
              "name": "amount",
              "kind": "number",
              "value": 40,
              "isMandatory": true,
              "source": "Conversation"
            },
            {
              "name": "dueOn",
              "kind": "date",
              "value": "2026-10-01",
              "isMandatory": false,
              "source": "Inferred"
            },
            {
              "name": "note",
              "kind": "text",
              "value": "raised in chat",
              "isMandatory": false,
              "source": "Inferred"
            }
          ]
        }
      },
      "card": {
        "requiresConfirmation": true,
        "aggregateConfidence": 0.6,
        "populatedConfidence": 0.6,
        "emptyFieldCount": 0,
        "fields": [
          {
            "name": "status",
            "kind": "enum",
            "value": "Active",
            "isMandatory": true
          },
          {
            "name": "amount",
            "kind": "number",
            "value": 40,
            "isMandatory": true
          },
          {
            "name": "dueOn",
            "kind": "date",
            "value": "2026-10-01",
            "isMandatory": false
          },
          {
            "name": "note",
            "kind": "text",
            "value": "raised in chat",
            "isMandatory": false
          }
        ],
        "presentation": [
          {
            "name": "status",
            "kind": "enum",
            "allowedValues": [
              "Draft",
              "Active",
              "Retired"
            ]
          },
          {
            "name": "amount",
            "kind": "number",
            "pattern": "^\\d+(\\.\\d{1,2})?$"
          }
        ]
      }
    }
  },
  {
    "id": "sequence-a/picker-external-binding",
    "rules": [
      "PV-1",
      "PV-2",
      "PV-3",
      "GT-1"
    ],
    "title": "A picker: the person chose an owner from a list the host resolved, so a deterministic interceptor sets the field from the system of record with an external-ref binding naming the record it came from. The interceptor runs before any model is asked (GT-1 step 2), its External tag beats the model's Conversation tag on the ladder, and the model's tag is kept in the chain so a card can show that the two disagreed. An interceptor cannot claim the person said it - PV-3 is in the type, not in a check.",
    "given": {
      "clock": "2026-09-04T09:00:00.000Z",
      "store": "memory",
      "gate": {
        "defaultTtlMs": 1800000,
        "authorization": {
          "allow": [
            "*"
          ]
        },
        "inference": {
          "status": {
            "value": "Active",
            "confidence": 0.9,
            "presence": "literal",
            "utteranceSpan": null
          },
          "owner": {
            "value": "someone in support",
            "confidence": 0.9,
            "presence": "inferred",
            "utteranceSpan": null
          }
        },
        "interceptors": [
          {
            "name": "owner-picker",
            "fields": {
              "owner": {
                "value": "user-77",
                "source": "External",
                "confidence": 1,
                "evidence": "Chosen from the owner picker",
                "binding": {
                  "kind": "external-ref",
                  "ref": {
                    "system": "directory",
                    "recordId": "user-77"
                  }
                }
              }
            }
          }
        ]
      },
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "chat",
        "principal": {
          "kind": "member",
          "id": "ana"
        },
        "utterance": "Set invoice INV-2 to Active and give it to the person I picked",
        "messageId": "msg-1"
      },
      "prior": [],
      "step": {
        "kind": "wrap-execute",
        "at": "2026-09-04T09:00:00.000Z",
        "tool": {
          "name": "update_invoice",
          "description": "Update an invoice",
          "entityType": "Invoice",
          "entityId": "invoice-1",
          "writeCapable": true,
          "fields": [
            {
              "name": "status",
              "kind": "enum",
              "description": "The invoice status",
              "required": true,
              "allowedValues": [
                "Draft",
                "Active",
                "Retired"
              ],
              "pattern": null
            },
            {
              "name": "owner",
              "kind": "text",
              "description": "Who owns it",
              "required": true,
              "allowedValues": null,
              "pattern": null
            }
          ]
        },
        "args": {
          "status": "Draft",
          "owner": null
        }
      }
    },
    "expect": {
      "entry": {
        "status": "pending",
        "affidavit": {
          "aggregateConfidence": 0.9,
          "populatedConfidence": 0.9,
          "emptyFieldCount": 0,
          "fields": [
            {
              "name": "status",
              "value": "Active",
              "source": "Conversation",
              "bound": false
            },
            {
              "name": "owner",
              "value": "user-77",
              "source": "External",
              "bound": true,
              "bindingKind": "external-ref",
              "confidence": 1,
              "priorSources": [
                "Inferred"
              ]
            }
          ]
        }
      }
    }
  },
  {
    "id": "sequence-a/mandatory-field-left-empty",
    "rules": [
      "AF-1",
      "AF-2",
      "GT-5"
    ],
    "title": "The model could not fill a field the entity requires. The field stays on the record, tagged Empty at confidence zero, and is visible on the card as empty rather than quietly dropped (AF-1). The three numbers then say different things and all three are shown: the aggregate is zero because a proposed field has unknown provenance, the populated confidence is still 0.9 over the field that was filled, and one field is empty. A mean over the populated fields would have reported 0.9 and hidden the hole. The Standing Order in the chain does not fire, for either of two independent reasons (GT-5): the required field has no known value, and the host's risk score on a half-filled proposal is above the threshold the policy named. The empty required field is checked first, so that is the reason the card carries and standing-order.blocked names; the risk score would have stopped it a step later. Either way a person is asked. Its sibling sequence-a/mandatory-field-empty-blocks-standing-order isolates the first reason by removing the threshold.",
    "given": {
      "clock": "2026-09-04T09:00:00.000Z",
      "store": "memory",
      "gate": {
        "defaultTtlMs": 1800000,
        "authorization": {
          "allow": [
            "*"
          ]
        },
        "inference": {
          "status": {
            "value": "Active",
            "confidence": 0.9,
            "presence": "literal",
            "utteranceSpan": {
              "start": 21,
              "end": 27
            }
          }
        },
        "riskScorer": 0.8,
        "policies": [
          {
            "id": "auto-approve-low-risk",
            "version": "1.0.0",
            "declaredInputs": [],
            "declaresThreshold": true,
            "verdict": {
              "requirement": "StandingOrder",
              "threshold": 0.2
            }
          }
        ]
      },
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "chat",
        "principal": {
          "kind": "member",
          "id": "ana"
        },
        "utterance": "Set invoice INV-2 to Active",
        "messageId": "msg-1"
      },
      "prior": [],
      "step": {
        "kind": "wrap-execute",
        "at": "2026-09-04T09:00:00.000Z",
        "tool": {
          "name": "update_invoice",
          "description": "Update an invoice",
          "entityType": "Invoice",
          "entityId": "invoice-1",
          "writeCapable": true,
          "fields": [
            {
              "name": "status",
              "kind": "enum",
              "description": "The invoice status",
              "required": true,
              "allowedValues": [
                "Draft",
                "Active",
                "Retired"
              ],
              "pattern": null
            },
            {
              "name": "reference",
              "kind": "text",
              "description": "The supplier reference",
              "required": true,
              "allowedValues": null,
              "pattern": null
            }
          ]
        },
        "args": {
          "status": "Draft",
          "reference": null
        }
      }
    },
    "expect": {
      "entry": {
        "status": "pending",
        "requirement": "ReviewerConfirmation",
        "execution": null,
        "attestation": null,
        "blocked": null,
        "affidavit": {
          "aggregateConfidence": 0,
          "populatedConfidence": 0.9,
          "emptyFieldCount": 1,
          "fields": [
            {
              "name": "status",
              "value": "Active",
              "source": "Conversation",
              "bound": true,
              "bindingKind": "utterance-span",
              "isMandatory": true
            },
            {
              "name": "reference",
              "value": null,
              "source": "Empty",
              "bound": false,
              "isMandatory": true,
              "confidence": 0
            }
          ]
        }
      },
      "card": {
        "requiresConfirmation": true,
        "aggregateConfidence": 0,
        "populatedConfidence": 0.9,
        "emptyFieldCount": 1,
        "warningsContain": [
          "GT-5"
        ],
        "fields": [
          {
            "name": "status",
            "value": "Active",
            "isMandatory": true
          },
          {
            "name": "reference",
            "value": null,
            "isMandatory": true
          }
        ]
      },
      "telemetry": [
        "standing-order.blocked",
        "affidavit.filed"
      ]
    }
  },
  {
    "id": "sequence-a/mandatory-field-reviewer-approves",
    "rules": [
      "AF-1",
      "AF-2",
      "DK-1"
    ],
    "title": "A person may still approve a proposal the machine could not complete. The empty mandatory field stays empty on the record - the approval is of what was sworn to, not a licence to invent the missing value - and the three numbers are unchanged by the decision. This is the asymmetry the framework is built on: a policy will not auto-approve a half-filled proposal, and a person, who can see the hole, may.",
    "given": {
      "clock": "2026-09-04T09:00:00.000Z",
      "store": "memory",
      "gate": {
        "defaultTtlMs": 1800000,
        "authorization": {
          "allow": [
            "*"
          ]
        },
        "inference": {
          "status": {
            "value": "Active",
            "confidence": 0.9,
            "presence": "literal",
            "utteranceSpan": {
              "start": 21,
              "end": 27
            }
          }
        }
      },
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "chat",
        "principal": {
          "kind": "member",
          "id": "ana"
        },
        "utterance": "Set invoice INV-2 to Active",
        "messageId": "msg-1"
      },
      "prior": [
        {
          "kind": "wrap-execute",
          "as": "filed",
          "at": "2026-09-04T09:00:00.000Z",
          "tool": {
            "name": "update_invoice",
            "description": "Update an invoice",
            "entityType": "Invoice",
            "entityId": "invoice-1",
            "writeCapable": true,
            "fields": [
              {
                "name": "status",
                "kind": "enum",
                "description": "The invoice status",
                "required": true,
                "allowedValues": [
                  "Draft",
                  "Active",
                  "Retired"
                ],
                "pattern": null
              },
              {
                "name": "reference",
                "kind": "text",
                "description": "The supplier reference",
                "required": true,
                "allowedValues": null,
                "pattern": null
              }
            ]
          },
          "args": {
            "status": "Draft",
            "reference": null
          }
        }
      ],
      "step": {
        "kind": "decide",
        "at": "2026-09-04T09:00:00.000Z",
        "principal": {
          "kind": "member",
          "id": "ana"
        },
        "decision": {
          "kind": "approve",
          "reason": "the reference follows by email"
        }
      }
    },
    "expect": {
      "entry": {
        "status": "approved",
        "execution": "unexecuted",
        "attestation": {
          "kind": "member",
          "id": "ana"
        },
        "affidavit": {
          "aggregateConfidence": 0,
          "populatedConfidence": 0.9,
          "emptyFieldCount": 1,
          "fields": [
            {
              "name": "status",
              "value": "Active",
              "source": "Conversation",
              "bound": true,
              "bindingKind": "utterance-span",
              "isMandatory": true
            },
            {
              "name": "reference",
              "value": null,
              "source": "Empty",
              "bound": false,
              "isMandatory": true,
              "confidence": 0
            }
          ]
        },
        "amendedAffidavit": null
      },
      "store": {
        "approvedUnexecuted": 1
      }
    }
  },
  {
    "id": "sequence-a/expiry-then-resubmit",
    "rules": [
      "DK-1",
      "GT-4",
      "CV-4"
    ],
    "title": "The review window closed with nobody looking. The entry reads expired the moment the deadline passes, whether or not a sweep has run, and resubmitting files a new entry that names what it supersedes while the old row keeps its terminal state and gains a successor link. The resubmission is filed under the same tool the original proposal came from, so its coverage can be re-assessed, and the whole pipeline runs again - a resubmission is a new proposal, not a replay of an old approval.",
    "given": {
      "clock": "2026-09-04T09:00:00.000Z",
      "store": "memory",
      "gate": {
        "defaultTtlMs": 1800000,
        "authorization": {
          "allow": [
            "*"
          ]
        },
        "inference": {
          "status": {
            "value": "Active",
            "confidence": 0.9,
            "presence": "literal",
            "utteranceSpan": {
              "start": 21,
              "end": 27
            }
          }
        }
      },
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "chat",
        "principal": {
          "kind": "member",
          "id": "ana"
        },
        "utterance": "Set invoice INV-2 to Active",
        "messageId": "msg-1"
      },
      "prior": [
        {
          "kind": "wrap-execute",
          "as": "filed",
          "at": "2026-09-04T09:00:00.000Z",
          "tool": {
            "name": "update_invoice",
            "description": "Update an invoice",
            "entityType": "Invoice",
            "entityId": "invoice-1",
            "writeCapable": true,
            "fields": [
              {
                "name": "status",
                "kind": "enum",
                "description": "The invoice status",
                "required": true,
                "allowedValues": [
                  "Draft",
                  "Active",
                  "Retired"
                ],
                "pattern": null
              }
            ]
          },
          "args": {
            "status": "Draft"
          }
        }
      ],
      "step": {
        "kind": "resubmit",
        "at": "2026-09-04T09:45:00.000Z",
        "principal": {
          "kind": "member",
          "id": "ana"
        }
      }
    },
    "expect": {
      "entry": {
        "status": "pending",
        "execution": null,
        "toolName": "update_invoice",
        "expiresAtOffsetMs": 1800000,
        "lineage": {
          "supersedes": "@some",
          "supersededBy": null
        },
        "affidavit": {
          "fields": [
            {
              "name": "status",
              "value": "Active",
              "source": "Conversation"
            }
          ]
        },
        "preservedAmendments": null
      },
      "superseded": {
        "status": "expired",
        "execution": null,
        "decision": null,
        "attestation": null,
        "lineage": {
          "supersededBy": "@some"
        }
      },
      "store": {
        "count": 2,
        "pending": 1
      }
    }
  },
  {
    "id": "sequence-a/late-amendments-preserved",
    "rules": [
      "DK-1",
      "DK-2",
      "PV-2",
      "PV-3"
    ],
    "title": "A person typed a correction and pressed approve just after the window closed. The decision is refused - a recorded decision is never backdated - but the correction is not thrown away: it is preserved on the row with the instant and the principal of the act that made it, and the resubmission prefills it as the person's own value, tagged UserStated with a reviewer-act binding naming the superseded entry and the moment they typed it. Binding it to the resubmission's instant instead would date a person's correction to whenever somebody happened to click resubmit.",
    "given": {
      "clock": "2026-09-04T09:00:00.000Z",
      "store": "memory",
      "gate": {
        "defaultTtlMs": 1800000,
        "authorization": {
          "allow": [
            "*"
          ]
        },
        "inference": {
          "status": {
            "value": "Active",
            "confidence": 0.9,
            "presence": "literal",
            "utteranceSpan": {
              "start": 21,
              "end": 27
            }
          }
        }
      },
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "chat",
        "principal": {
          "kind": "member",
          "id": "ana"
        },
        "utterance": "Set invoice INV-2 to Active",
        "messageId": "msg-1"
      },
      "prior": [
        {
          "kind": "wrap-execute",
          "as": "filed",
          "at": "2026-09-04T09:00:00.000Z",
          "tool": {
            "name": "update_invoice",
            "description": "Update an invoice",
            "entityType": "Invoice",
            "entityId": "invoice-1",
            "writeCapable": true,
            "fields": [
              {
                "name": "status",
                "kind": "enum",
                "description": "The invoice status",
                "required": true,
                "allowedValues": [
                  "Draft",
                  "Active",
                  "Retired"
                ],
                "pattern": null
              }
            ]
          },
          "args": {
            "status": "Draft"
          }
        },
        {
          "kind": "decide",
          "at": "2026-09-04T09:45:00.000Z",
          "principal": {
            "kind": "member",
            "id": "ana"
          },
          "decision": {
            "kind": "approve",
            "amendments": {
              "status": "Retired"
            }
          },
          "refusal": "decision-expired"
        }
      ],
      "step": {
        "kind": "resubmit",
        "at": "2026-09-04T09:46:00.000Z",
        "principal": {
          "kind": "member",
          "id": "ana"
        }
      }
    },
    "expect": {
      "entry": {
        "status": "pending",
        "affidavit": {
          "fields": [
            {
              "name": "status",
              "value": "Retired",
              "source": "UserStated",
              "bound": true,
              "bindingKind": "reviewer-act",
              "confidence": 1,
              "priorSources": [
                "Conversation"
              ]
            }
          ]
        }
      },
      "card": {
        "priorAmendments": {
          "status": "Retired"
        }
      },
      "superseded": {
        "status": "expired",
        "amendments": null,
        "preservedAmendments": {
          "amendments": {
            "status": "Retired"
          },
          "at": "2026-09-04T09:45:00.000Z",
          "by": "ana"
        },
        "amendedAffidavit": null
      }
    }
  },
  {
    "id": "sequence-a/interleaved-conversations",
    "rules": [
      "GT-2"
    ],
    "title": "Two conversations run through one gate in one isolate, each proposing a write to a different entity. Neither observes the other: two rows are filed, each carrying its own conversation and its own sworn fields, and nothing from the first turn leaks into the second. The turn context is a parameter of every entry point, so there is no ambient state for a second conversation to inherit.",
    "given": {
      "clock": "2026-09-04T09:00:00.000Z",
      "store": "memory",
      "gate": {
        "defaultTtlMs": 1800000,
        "authorization": {
          "allow": [
            "*"
          ]
        },
        "inference": {
          "status": {
            "value": "Active",
            "confidence": 0.9,
            "presence": "literal",
            "utteranceSpan": {
              "start": 21,
              "end": 27
            }
          }
        }
      },
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "chat",
        "principal": {
          "kind": "member",
          "id": "ana"
        },
        "utterance": "Set invoice INV-2 to Active",
        "messageId": "msg-1"
      },
      "prior": [
        {
          "kind": "wrap-execute",
          "as": "first",
          "at": "2026-09-04T09:00:00.000Z",
          "conversationId": "conv-1",
          "tool": {
            "name": "update_invoice",
            "description": "Update an invoice",
            "entityType": "Invoice",
            "entityId": "invoice-1",
            "writeCapable": true,
            "fields": [
              {
                "name": "status",
                "kind": "enum",
                "description": "The invoice status",
                "required": true,
                "allowedValues": [
                  "Draft",
                  "Active",
                  "Retired"
                ],
                "pattern": null
              }
            ]
          },
          "args": {
            "status": "Draft"
          }
        }
      ],
      "step": {
        "kind": "wrap-execute",
        "at": "2026-09-04T09:00:00.000Z",
        "conversationId": "conv-2",
        "tool": {
          "name": "update_invoice",
          "description": "Update an invoice",
          "entityType": "Invoice",
          "entityId": "invoice-2",
          "writeCapable": true,
          "fields": [
            {
              "name": "status",
              "kind": "enum",
              "description": "The invoice status",
              "required": true,
              "allowedValues": [
                "Draft",
                "Active",
                "Retired"
              ],
              "pattern": null
            }
          ]
        },
        "args": {
          "status": "Draft"
        }
      }
    },
    "expect": {
      "entry": {
        "conversationId": "conv-2",
        "affidavit": {
          "entityId": "invoice-2",
          "fields": [
            {
              "name": "status",
              "value": "Active",
              "source": "Conversation"
            }
          ]
        }
      },
      "store": {
        "count": 2,
        "pending": 2
      }
    }
  },
  {
    "id": "sequence-a/replay-keeps-the-deadline",
    "rules": [
      "GT-4",
      "DK-1"
    ],
    "title": "An agent retried the same tool call twenty minutes later. The entry id is derived from the tenant, the conversation, the tool and the call's arguments, so the retry is the same entry: one row, its original deadline, and the card the model gets back is the card the reviewer is already looking at. A fresh identifier would file a second row and start a second clock, which is how a retrying agent holds a review window open indefinitely.",
    "given": {
      "clock": "2026-09-04T09:00:00.000Z",
      "store": "memory",
      "gate": {
        "defaultTtlMs": 1800000,
        "authorization": {
          "allow": [
            "*"
          ]
        },
        "inference": {
          "status": {
            "value": "Active",
            "confidence": 0.9,
            "presence": "literal",
            "utteranceSpan": {
              "start": 21,
              "end": 27
            }
          }
        }
      },
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "chat",
        "principal": {
          "kind": "member",
          "id": "ana"
        },
        "utterance": "Set invoice INV-2 to Active",
        "messageId": "msg-1"
      },
      "prior": [
        {
          "kind": "wrap-execute",
          "as": "filed",
          "at": "2026-09-04T09:00:00.000Z",
          "tool": {
            "name": "update_invoice",
            "description": "Update an invoice",
            "entityType": "Invoice",
            "entityId": "invoice-1",
            "writeCapable": true,
            "fields": [
              {
                "name": "status",
                "kind": "enum",
                "description": "The invoice status",
                "required": true,
                "allowedValues": [
                  "Draft",
                  "Active",
                  "Retired"
                ],
                "pattern": null
              }
            ]
          },
          "args": {
            "status": "Draft"
          }
        }
      ],
      "step": {
        "kind": "wrap-execute",
        "at": "2026-09-04T09:20:00.000Z",
        "tool": {
          "name": "update_invoice",
          "description": "Update an invoice",
          "entityType": "Invoice",
          "entityId": "invoice-1",
          "writeCapable": true,
          "fields": [
            {
              "name": "status",
              "kind": "enum",
              "description": "The invoice status",
              "required": true,
              "allowedValues": [
                "Draft",
                "Active",
                "Retired"
              ],
              "pattern": null
            }
          ]
        },
        "args": {
          "status": "Draft"
        }
      }
    },
    "expect": {
      "entry": {
        "status": "pending",
        "expiresAtOffsetMs": 1800000
      },
      "store": {
        "count": 1,
        "pending": 1
      }
    }
  },
  {
    "id": "sequence-a/sweep-pages",
    "rules": [
      "DK-3"
    ],
    "title": "The host runs the sweep; this package owns no timer. The sweep is bounded by the limit the host passes and says whether there is more to do, so a serverless isolate can expire a large Docket in slices instead of in one unbounded pass that outlives its request budget.",
    "given": {
      "clock": "2026-09-04T09:00:00.000Z",
      "store": "memory",
      "gate": {
        "defaultTtlMs": 1800000,
        "authorization": {
          "allow": [
            "*"
          ]
        },
        "inference": {
          "status": {
            "value": "Active",
            "confidence": 0.9,
            "presence": "literal",
            "utteranceSpan": {
              "start": 21,
              "end": 27
            }
          }
        }
      },
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "chat",
        "principal": {
          "kind": "member",
          "id": "ana"
        },
        "utterance": "Set invoice INV-2 to Active",
        "messageId": "msg-1"
      },
      "prior": [
        {
          "kind": "wrap-execute",
          "at": "2026-09-04T09:00:00.000Z",
          "tool": {
            "name": "update_invoice",
            "description": "Update an invoice",
            "entityType": "Invoice",
            "entityId": "invoice-1",
            "writeCapable": true,
            "fields": [
              {
                "name": "status",
                "kind": "enum",
                "description": "The invoice status",
                "required": true,
                "allowedValues": [
                  "Draft",
                  "Active",
                  "Retired"
                ],
                "pattern": null
              }
            ]
          },
          "args": {
            "status": "Draft"
          }
        },
        {
          "kind": "wrap-execute",
          "at": "2026-09-04T09:00:00.000Z",
          "tool": {
            "name": "update_invoice",
            "description": "Update an invoice",
            "entityType": "Invoice",
            "entityId": "invoice-2",
            "writeCapable": true,
            "fields": [
              {
                "name": "status",
                "kind": "enum",
                "description": "The invoice status",
                "required": true,
                "allowedValues": [
                  "Draft",
                  "Active",
                  "Retired"
                ],
                "pattern": null
              }
            ]
          },
          "args": {
            "status": "Draft"
          }
        },
        {
          "kind": "wrap-execute",
          "at": "2026-09-04T09:00:00.000Z",
          "tool": {
            "name": "update_invoice",
            "description": "Update an invoice",
            "entityType": "Invoice",
            "entityId": "invoice-3",
            "writeCapable": true,
            "fields": [
              {
                "name": "status",
                "kind": "enum",
                "description": "The invoice status",
                "required": true,
                "allowedValues": [
                  "Draft",
                  "Active",
                  "Retired"
                ],
                "pattern": null
              }
            ]
          },
          "args": {
            "status": "Draft"
          }
        }
      ],
      "step": {
        "kind": "expireDue",
        "at": "2026-09-04T09:45:00.000Z",
        "limit": 2
      }
    },
    "expect": {
      "expired": {
        "count": 2,
        "more": true
      },
      "telemetry": [
        "docket.expired"
      ],
      "store": {
        "count": 3,
        "pending": 0
      }
    }
  },
  {
    "id": "sequence-a/rehydration-order",
    "rules": [
      "DK-5",
      "AZ-5"
    ],
    "title": "A reconnecting client asks what it missed and is given, in one page and in this order, everything still waiting for a decision and then everything approved that the executor has not reported on. The second half is the one that matters after a crash: an approved, unexecuted row is the only record that a write was authorised and has not happened, and a client that never saw it would lose the write silently.",
    "given": {
      "clock": "2026-09-04T09:00:00.000Z",
      "store": "memory",
      "gate": {
        "defaultTtlMs": 1800000,
        "authorization": {
          "allow": [
            "*"
          ]
        },
        "inference": {
          "status": {
            "value": "Active",
            "confidence": 0.9,
            "presence": "literal",
            "utteranceSpan": {
              "start": 21,
              "end": 27
            }
          }
        }
      },
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "chat",
        "principal": {
          "kind": "member",
          "id": "ana"
        },
        "utterance": "Set invoice INV-2 to Active",
        "messageId": "msg-1"
      },
      "prior": [
        {
          "kind": "wrap-execute",
          "as": "first",
          "at": "2026-09-04T09:00:00.000Z",
          "tool": {
            "name": "update_invoice",
            "description": "Update an invoice",
            "entityType": "Invoice",
            "entityId": "invoice-1",
            "writeCapable": true,
            "fields": [
              {
                "name": "status",
                "kind": "enum",
                "description": "The invoice status",
                "required": true,
                "allowedValues": [
                  "Draft",
                  "Active",
                  "Retired"
                ],
                "pattern": null
              }
            ]
          },
          "args": {
            "status": "Draft"
          }
        },
        {
          "kind": "wrap-execute",
          "as": "second",
          "at": "2026-09-04T09:00:00.000Z",
          "tool": {
            "name": "update_invoice",
            "description": "Update an invoice",
            "entityType": "Invoice",
            "entityId": "invoice-2",
            "writeCapable": true,
            "fields": [
              {
                "name": "status",
                "kind": "enum",
                "description": "The invoice status",
                "required": true,
                "allowedValues": [
                  "Draft",
                  "Active",
                  "Retired"
                ],
                "pattern": null
              }
            ]
          },
          "args": {
            "status": "Draft"
          }
        },
        {
          "kind": "decide",
          "at": "2026-09-04T09:00:00.000Z",
          "entry": "first",
          "principal": {
            "kind": "member",
            "id": "ana"
          },
          "decision": {
            "kind": "approve"
          },
          "refusal": null
        }
      ],
      "step": {
        "kind": "rehydrate",
        "at": "2026-09-04T09:00:00.000Z",
        "page": {
          "limit": 10
        }
      }
    },
    "expect": {
      "page": {
        "count": 2,
        "more": false,
        "statuses": [
          "pending",
          "approved"
        ]
      },
      "store": {
        "count": 2,
        "pending": 1,
        "approvedUnexecuted": 1
      }
    }
  },
  {
    "id": "sequence-a/coverage-refused-at-wire-up",
    "rules": [
      "CV-4",
      "CV-1"
    ],
    "title": "A write-capable tool the gate cannot intercept - here one with no execute of its own to stand in front of - is refused when the host wires it, not on the first request that happens to use it. There is no option that turns the gate off for a covered tool: the host either makes the tool interceptable or declares it uncovered, which files every later proposal from it blocked rather than letting it through.",
    "given": {
      "clock": "2026-09-04T09:00:00.000Z",
      "store": "memory",
      "gate": {
        "defaultTtlMs": 1800000,
        "authorization": {
          "allow": [
            "*"
          ]
        },
        "inference": {
          "status": {
            "value": "Active",
            "confidence": 0.9,
            "presence": "literal",
            "utteranceSpan": {
              "start": 21,
              "end": 27
            }
          }
        }
      },
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "chat",
        "principal": {
          "kind": "member",
          "id": "ana"
        },
        "utterance": "Set invoice INV-2 to Active",
        "messageId": "msg-1"
      },
      "prior": [],
      "step": {
        "kind": "wrap-execute",
        "at": "2026-09-04T09:00:00.000Z",
        "tool": {
          "name": "provider_write",
          "description": "Update an invoice",
          "entityType": "Invoice",
          "entityId": "invoice-1",
          "writeCapable": true,
          "fields": [
            {
              "name": "status",
              "kind": "enum",
              "description": "The invoice status",
              "required": true,
              "allowedValues": [
                "Draft",
                "Active",
                "Retired"
              ],
              "pattern": null
            }
          ],
          "omitExecute": true
        },
        "args": {
          "status": "Draft"
        }
      }
    },
    "expect": {
      "error": {
        "code": "coverage-refused",
        "messageContains": "no-execute"
      },
      "telemetry": [
        "coverage.refused"
      ],
      "store": {
        "count": 0
      }
    }
  },
  {
    "id": "sequence-a/mandatory-field-empty-blocks-standing-order",
    "rules": [
      "GT-5",
      "AF-1",
      "AF-2"
    ],
    "title": "A Standing Order that would fire by the book does not fire, because a field the entity requires has no known value. Nothing else is wrong with it: the policy names no risk threshold and predicates on nothing, so the only thing standing between this proposal and a write with no person present is the empty required field. The verdict degrades to ReviewerConfirmation, the row is pending with no attestation, and standing-order.blocked says why. A confidence floor would not have caught it either way round - the aggregate is already zero whenever any proposed field is Empty, and the populated confidence reads 0.92 over the one field that was filled.",
    "given": {
      "clock": "2026-09-04T09:00:00.000Z",
      "store": "memory",
      "gate": {
        "defaultTtlMs": 1800000,
        "authorization": {
          "allow": [
            "*"
          ]
        },
        "inference": {
          "status": {
            "value": "Active",
            "confidence": 0.92,
            "presence": "literal",
            "utteranceSpan": {
              "start": 21,
              "end": 27
            }
          }
        },
        "policies": [
          {
            "id": "auto-approve-invoice-status",
            "version": "1.0.0",
            "declaredInputs": [],
            "verdict": {
              "requirement": "StandingOrder",
              "reason": "invoice status changes are routine"
            }
          }
        ]
      },
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "chat",
        "principal": {
          "kind": "member",
          "id": "ana"
        },
        "utterance": "Set invoice INV-2 to Active",
        "messageId": "msg-1"
      },
      "prior": [],
      "step": {
        "kind": "wrap-execute",
        "at": "2026-09-04T09:00:00.000Z",
        "tool": {
          "name": "update_invoice",
          "description": "Update an invoice",
          "entityType": "Invoice",
          "entityId": "invoice-1",
          "writeCapable": true,
          "fields": [
            {
              "name": "status",
              "kind": "enum",
              "description": "The invoice status",
              "required": true,
              "allowedValues": [
                "Draft",
                "Active",
                "Retired"
              ],
              "pattern": null
            },
            {
              "name": "reference",
              "kind": "text",
              "description": "The supplier reference",
              "required": true,
              "allowedValues": null,
              "pattern": null
            }
          ]
        },
        "args": {
          "status": "Draft",
          "reference": null
        }
      }
    },
    "expect": {
      "entry": {
        "status": "pending",
        "requirement": "ReviewerConfirmation",
        "execution": null,
        "attestation": null,
        "blocked": null,
        "expiresAtOffsetMs": 1800000,
        "affidavit": {
          "aggregateConfidence": 0,
          "populatedConfidence": 0.92,
          "emptyFieldCount": 1,
          "fields": [
            {
              "name": "status",
              "value": "Active",
              "source": "Conversation",
              "bound": true,
              "isMandatory": true
            },
            {
              "name": "reference",
              "value": null,
              "source": "Empty",
              "bound": false,
              "isMandatory": true,
              "confidence": 0
            }
          ]
        }
      },
      "card": {
        "requiresConfirmation": true,
        "warningsContain": [
          "GT-5",
          "reference"
        ]
      },
      "telemetry": [
        "standing-order.blocked",
        "affidavit.filed"
      ],
      "telemetryAbsent": [
        "standing-order.fired"
      ],
      "store": {
        "pending": 1,
        "approvedUnexecuted": 0
      }
    }
  },
  {
    "id": "sequence-a/optional-field-empty-standing-order-fires",
    "rules": [
      "GT-5",
      "AF-1",
      "AZ-1"
    ],
    "title": "The same half-filled proposal, with the empty field optional rather than required, and the Standing Order fires: approved, unexecuted and attested to the policy in one write. An empty optional field does not block a person-free approval by rule - it is a field the entity can do without, and the record still shows it empty at confidence zero. A host that wants a floor here writes one into its own policy over populatedConfidence or emptyFieldCount; this package defines no threshold on any of the three numbers.",
    "given": {
      "clock": "2026-09-04T09:00:00.000Z",
      "store": "memory",
      "gate": {
        "defaultTtlMs": 1800000,
        "authorization": {
          "allow": [
            "*"
          ]
        },
        "inference": {
          "status": {
            "value": "Active",
            "confidence": 0.92,
            "presence": "literal",
            "utteranceSpan": {
              "start": 21,
              "end": 27
            }
          }
        },
        "policies": [
          {
            "id": "auto-approve-invoice-status",
            "version": "1.0.0",
            "declaredInputs": [],
            "verdict": {
              "requirement": "StandingOrder",
              "reason": "invoice status changes are routine"
            }
          }
        ]
      },
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "conv-1",
        "channel": "chat",
        "principal": {
          "kind": "member",
          "id": "ana"
        },
        "utterance": "Set invoice INV-2 to Active",
        "messageId": "msg-1"
      },
      "prior": [],
      "step": {
        "kind": "wrap-execute",
        "at": "2026-09-04T09:00:00.000Z",
        "tool": {
          "name": "update_invoice",
          "description": "Update an invoice",
          "entityType": "Invoice",
          "entityId": "invoice-1",
          "writeCapable": true,
          "fields": [
            {
              "name": "status",
              "kind": "enum",
              "description": "The invoice status",
              "required": true,
              "allowedValues": [
                "Draft",
                "Active",
                "Retired"
              ],
              "pattern": null
            },
            {
              "name": "reference",
              "kind": "text",
              "description": "The supplier reference",
              "required": false,
              "allowedValues": null,
              "pattern": null
            }
          ]
        },
        "args": {
          "status": "Draft",
          "reference": null
        }
      }
    },
    "expect": {
      "entry": {
        "status": "approved",
        "requirement": "StandingOrder",
        "execution": "unexecuted",
        "blocked": null,
        "expiresAtOffsetMs": 1800000,
        "attestation": {
          "kind": "standing-order",
          "policyId": "auto-approve-invoice-status",
          "version": "1.0.0"
        },
        "affidavit": {
          "aggregateConfidence": 0,
          "populatedConfidence": 0.92,
          "emptyFieldCount": 1,
          "fields": [
            {
              "name": "status",
              "value": "Active",
              "source": "Conversation",
              "bound": true,
              "isMandatory": true
            },
            {
              "name": "reference",
              "value": null,
              "source": "Empty",
              "bound": false,
              "isMandatory": false,
              "confidence": 0
            }
          ]
        }
      },
      "telemetry": [
        "standing-order.fired",
        "affidavit.filed"
      ],
      "telemetryAbsent": [
        "standing-order.blocked"
      ],
      "store": {
        "pending": 0,
        "approvedUnexecuted": 1
      }
    }
  },
  {
    "id": "sequence-c/relay-auto-approve-bound-external",
    "rules": [
      "PV-4",
      "AZ-1",
      "PV-2",
      "GT-1"
    ],
    "title": "A capture arrives over a trusted relay's own surface, already carrying its provenance: the value is External and its binding names the relay, the channel identity the message came from and the relay's id for that message. The policy predicates on External and every declared input is bound, so the Standing Order is honoured: the row is filed approved, unexecuted and attested to the policy that fired, in one write. No transport code is involved - the relay is an identity and a binding, not a protocol this package speaks.",
    "given": {
      "clock": "2026-09-04T09:00:00.000Z",
      "store": "memory",
      "gate": {
        "defaultTtlMs": 1800000,
        "authorization": {
          "allow": [
            "*"
          ]
        },
        "policies": [
          {
            "id": "relay-capture",
            "version": "1.0.0",
            "declaredInputs": [
              "External"
            ],
            "verdict": {
              "requirement": "StandingOrder"
            }
          }
        ]
      },
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "wa-1",
        "channel": "mcp",
        "principal": {
          "kind": "service",
          "id": "whatsapp-relay",
          "assertedMember": "ana",
          "relay": {
            "channelIdentity": "+94770000000",
            "messageId": "wamid-1"
          }
        },
        "utterance": "Active",
        "messageId": "wamid-1"
      },
      "prior": [],
      "step": {
        "kind": "file",
        "at": "2026-09-04T09:00:00.000Z",
        "toolName": "relay_capture",
        "operation": {
          "kind": "create",
          "entityType": "Reading",
          "entityId": null,
          "fields": [
            "status"
          ]
        },
        "preparedFields": [
          {
            "name": "status",
            "kind": "text",
            "value": "Active",
            "isMandatory": true,
            "provenance": {
              "source": "External",
              "confidence": 1,
              "note": "Captured from the relay message",
              "binding": {
                "kind": "external-ref",
                "ref": {
                  "system": "whatsapp-relay",
                  "recordId": "wamid-1",
                  "relay": {
                    "principal": "whatsapp-relay",
                    "channelIdentity": "+94770000000",
                    "messageId": "wamid-1"
                  }
                }
              }
            }
          }
        ]
      }
    },
    "expect": {
      "entry": {
        "status": "approved",
        "execution": "unexecuted",
        "requirement": "StandingOrder",
        "blocked": null,
        "channel": "mcp",
        "toolName": "relay_capture",
        "attestation": {
          "kind": "standing-order",
          "policyId": "relay-capture",
          "version": "1.0.0"
        },
        "decision": null,
        "affidavit": {
          "operationType": "create",
          "entityType": "Reading",
          "entityId": null,
          "aggregateConfidence": 1,
          "populatedConfidence": 1,
          "emptyFieldCount": 0,
          "fields": [
            {
              "name": "status",
              "value": "Active",
              "previousValue": null,
              "source": "External",
              "bound": true,
              "bindingKind": "external-ref"
            }
          ]
        }
      },
      "card": {
        "requiresConfirmation": false
      },
      "telemetry": [
        "standing-order.fired",
        "affidavit.filed"
      ]
    }
  },
  {
    "id": "sequence-c/relayed-decision-member-via-relay",
    "rules": [
      "AZ-1",
      "AZ-3"
    ],
    "title": "A person answered the card on the relay's channel, so the relay makes the decision on their behalf. The attestation is member-via-relay and names both: the person the relay asserted, and the relay itself with the channel identity and the message the answer arrived in. It is never member - the relay asserted an identity rather than authenticating one, and the record has to say which of those happened.",
    "given": {
      "clock": "2026-09-04T09:00:00.000Z",
      "store": "memory",
      "gate": {
        "defaultTtlMs": 1800000,
        "authorization": {
          "allow": [
            "*"
          ]
        }
      },
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "wa-1",
        "channel": "mcp",
        "principal": {
          "kind": "service",
          "id": "whatsapp-relay",
          "assertedMember": "ana",
          "relay": {
            "channelIdentity": "+94770000000",
            "messageId": "wamid-1"
          }
        },
        "utterance": "Active",
        "messageId": "wamid-1"
      },
      "prior": [
        {
          "kind": "file",
          "as": "filed",
          "at": "2026-09-04T09:00:00.000Z",
          "toolName": "relay_capture",
          "operation": {
            "kind": "create",
            "entityType": "Reading",
            "entityId": null,
            "fields": [
              "status"
            ]
          },
          "preparedFields": [
            {
              "name": "status",
              "kind": "text",
              "value": "Active",
              "isMandatory": true,
              "provenance": {
                "source": "External",
                "confidence": 1,
                "note": "Captured from the relay message",
                "binding": {
                  "kind": "external-ref",
                  "ref": {
                    "system": "whatsapp-relay",
                    "recordId": "wamid-1",
                    "relay": {
                      "principal": "whatsapp-relay",
                      "channelIdentity": "+94770000000",
                      "messageId": "wamid-1"
                    }
                  }
                }
              }
            }
          ]
        }
      ],
      "step": {
        "kind": "decide",
        "at": "2026-09-04T09:00:00.000Z",
        "principal": {
          "kind": "service",
          "id": "whatsapp-relay",
          "assertedMember": "ana",
          "relay": {
            "channelIdentity": "+94770000000",
            "messageId": "wamid-1"
          }
        },
        "decision": {
          "kind": "approve",
          "reason": "confirmed on the channel"
        }
      }
    },
    "expect": {
      "entry": {
        "status": "approved",
        "execution": "unexecuted",
        "attestation": {
          "kind": "member-via-relay",
          "memberId": "ana",
          "relay": {
            "principal": "whatsapp-relay",
            "channelIdentity": "+94770000000",
            "messageId": "wamid-1"
          }
        },
        "decision": {
          "kind": "approve",
          "reason": "confirmed on the channel"
        }
      }
    }
  },
  {
    "id": "sequence-c/unbound-external-asks-a-person",
    "rules": [
      "PV-4",
      "PV-5"
    ],
    "title": "The same capture with nothing behind its External tag. A grade any caller can assert, pointing at no record anyone can re-derive, must not be what keys an approval with no person present: the policy predicates on External, the tag is unbound, and the Standing Order is not honoured. The write is not refused - it is moved toward a person, which is the only direction this degradation ever goes - and the card says why.",
    "given": {
      "clock": "2026-09-04T09:00:00.000Z",
      "store": "memory",
      "gate": {
        "defaultTtlMs": 1800000,
        "authorization": {
          "allow": [
            "*"
          ]
        },
        "policies": [
          {
            "id": "relay-capture",
            "version": "1.0.0",
            "declaredInputs": [
              "External"
            ],
            "verdict": {
              "requirement": "StandingOrder"
            }
          }
        ]
      },
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "wa-1",
        "channel": "mcp",
        "principal": {
          "kind": "service",
          "id": "whatsapp-relay",
          "assertedMember": "ana",
          "relay": {
            "channelIdentity": "+94770000000",
            "messageId": "wamid-1"
          }
        },
        "utterance": "Active",
        "messageId": "wamid-1"
      },
      "prior": [],
      "step": {
        "kind": "file",
        "at": "2026-09-04T09:00:00.000Z",
        "toolName": "relay_capture",
        "operation": {
          "kind": "create",
          "entityType": "Reading",
          "entityId": null,
          "fields": [
            "status"
          ]
        },
        "preparedFields": [
          {
            "name": "status",
            "kind": "text",
            "value": "Active",
            "isMandatory": true,
            "provenance": {
              "source": "External",
              "confidence": 1,
              "note": "Captured from the relay message",
              "binding": null
            }
          }
        ]
      }
    },
    "expect": {
      "entry": {
        "status": "pending",
        "requirement": "ReviewerConfirmation",
        "execution": null,
        "attestation": null,
        "blocked": null,
        "affidavit": {
          "fields": [
            {
              "name": "status",
              "value": "Active",
              "source": "External",
              "bound": false
            }
          ]
        }
      },
      "card": {
        "requiresConfirmation": true,
        "warningsContain": [
          "PV-4"
        ]
      },
      "telemetry": [
        "standing-order.blocked"
      ],
      "telemetryAbsent": [
        "standing-order.fired"
      ]
    }
  },
  {
    "id": "sequence-c/relay-may-not-attest-member",
    "rules": [
      "AZ-3",
      "AZ-2"
    ],
    "title": "A machine caller with nobody to speak for and no relay assertion to carry tries to decide. It is refused: the strongest attestation a service principal can honestly make is member-via-relay, naming a person and a channel, and it has neither. There is no parameter through which a caller names whose signature a decision is, so there is no path by which a machine attests member - the refusal is the type system's, and the runtime check exists for a caller that came in untyped.",
    "given": {
      "clock": "2026-09-04T09:00:00.000Z",
      "store": "memory",
      "gate": {
        "defaultTtlMs": 1800000,
        "authorization": {
          "allow": [
            "*"
          ]
        }
      },
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "wa-1",
        "channel": "mcp",
        "principal": {
          "kind": "service",
          "id": "whatsapp-relay",
          "assertedMember": "ana",
          "relay": {
            "channelIdentity": "+94770000000",
            "messageId": "wamid-1"
          }
        },
        "utterance": "Active",
        "messageId": "wamid-1"
      },
      "prior": [
        {
          "kind": "file",
          "as": "filed",
          "at": "2026-09-04T09:00:00.000Z",
          "toolName": "relay_capture",
          "operation": {
            "kind": "create",
            "entityType": "Reading",
            "entityId": null,
            "fields": [
              "status"
            ]
          },
          "preparedFields": [
            {
              "name": "status",
              "kind": "text",
              "value": "Active",
              "isMandatory": true,
              "provenance": {
                "source": "External",
                "confidence": 1,
                "note": "Captured from the relay message",
                "binding": {
                  "kind": "external-ref",
                  "ref": {
                    "system": "whatsapp-relay",
                    "recordId": "wamid-1",
                    "relay": {
                      "principal": "whatsapp-relay",
                      "channelIdentity": "+94770000000",
                      "messageId": "wamid-1"
                    }
                  }
                }
              }
            }
          ]
        }
      ],
      "step": {
        "kind": "decide",
        "at": "2026-09-04T09:00:00.000Z",
        "principal": {
          "kind": "service",
          "id": "whatsapp-relay"
        },
        "decision": {
          "kind": "approve",
          "reason": "the relay says so"
        }
      }
    },
    "expect": {
      "error": {
        "code": "decision-unauthorized",
        "messageContains": "AZ-3"
      },
      "entry": {
        "status": "pending",
        "attestation": null,
        "decision": null,
        "amendments": null,
        "preservedAmendments": null
      },
      "telemetry": [
        "decision.unauthorized"
      ]
    }
  },
  {
    "id": "sequence-c/relay-decision-other-tenant-not-found",
    "rules": [
      "AZ-2"
    ],
    "title": "The relay is trusted, its assertion is well formed, and the entry belongs to another tenant. The answer is that no such entry exists - the same answer an identifier that was never filed gets - because any other answer would let a caller learn which identifiers are real by asking. The tenant is the boundary, and it is checked before the host's own authorization port is consulted.",
    "given": {
      "clock": "2026-09-04T09:00:00.000Z",
      "store": "memory",
      "gate": {
        "defaultTtlMs": 1800000,
        "authorization": {
          "allow": [
            "*"
          ]
        }
      },
      "ctx": {
        "tenantId": "tenant-a",
        "conversationId": "wa-1",
        "channel": "mcp",
        "principal": {
          "kind": "service",
          "id": "whatsapp-relay",
          "assertedMember": "ana",
          "relay": {
            "channelIdentity": "+94770000000",
            "messageId": "wamid-1"
          }
        },
        "utterance": "Active",
        "messageId": "wamid-1"
      },
      "prior": [
        {
          "kind": "file",
          "as": "filed",
          "at": "2026-09-04T09:00:00.000Z",
          "toolName": "relay_capture",
          "operation": {
            "kind": "create",
            "entityType": "Reading",
            "entityId": null,
            "fields": [
              "status"
            ]
          },
          "preparedFields": [
            {
              "name": "status",
              "kind": "text",
              "value": "Active",
              "isMandatory": true,
              "provenance": {
                "source": "External",
                "confidence": 1,
                "note": "Captured from the relay message",
                "binding": {
                  "kind": "external-ref",
                  "ref": {
                    "system": "whatsapp-relay",
                    "recordId": "wamid-1",
                    "relay": {
                      "principal": "whatsapp-relay",
                      "channelIdentity": "+94770000000",
                      "messageId": "wamid-1"
                    }
                  }
                }
              }
            }
          ]
        }
      ],
      "step": {
        "kind": "decide",
        "at": "2026-09-04T09:00:00.000Z",
        "tenantId": "tenant-b",
        "principal": {
          "kind": "service",
          "id": "whatsapp-relay",
          "assertedMember": "ana",
          "relay": {
            "channelIdentity": "+94770000000",
            "messageId": "wamid-1"
          }
        },
        "decision": {
          "kind": "approve",
          "reason": "confirmed on the channel"
        }
      }
    },
    "expect": {
      "error": {
        "code": "entry-not-found"
      },
      "entry": {
        "status": "pending",
        "attestation": null,
        "decision": null
      },
      "telemetry": [
        "decision.unauthorized"
      ]
    }
  },
];

/** The 7 canonical byte vectors, in manifest order (SR-1). */
export const canonicalVectors: readonly CanonicalVectorDocument[] = [
  {
    "id": "canonical/create-shaped",
    "rules": [
      "SR-1",
      "AF-1",
      "AF-3"
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
              "conversationTurn": 1
            },
            "prior": []
          },
          "isMandatory": true,
          "kind": "enum",
          "allowedValues": [
            "Active",
            "Retired"
          ],
          "pattern": null
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
              "conversationTurn": null
            },
            "prior": []
          },
          "isMandatory": false,
          "kind": "text",
          "allowedValues": null,
          "pattern": null
        }
      ],
      "aggregateConfidence": 0,
      "populatedConfidence": 0.9,
      "emptyFieldCount": 1,
      "warnings": [],
      "requiresConfirmation": true
    },
    "amendments": null,
    "reviewerAct": null,
    "expectedBytesUtf8": "{\"aggregateConfidence\":0,\"emptyFieldCount\":1,\"entityId\":null,\"entityType\":\"Widget\",\"fields\":[{\"allowedValues\":[\"Active\",\"Retired\"],\"isMandatory\":true,\"kind\":\"enum\",\"name\":\"Status\",\"pattern\":null,\"previousValue\":null,\"provenance\":{\"current\":{\"confidence\":0.9,\"conversationTurn\":1,\"evidence\":\"Extracted from the turn\",\"source\":\"Conversation\"},\"prior\":[]},\"value\":\"Active\"},{\"allowedValues\":null,\"isMandatory\":false,\"kind\":\"text\",\"name\":\"Owner\",\"pattern\":null,\"previousValue\":null,\"provenance\":{\"current\":{\"confidence\":0,\"conversationTurn\":null,\"evidence\":null,\"source\":\"Empty\"},\"prior\":[]},\"value\":null}],\"operationType\":\"WriteCreate\",\"populatedConfidence\":0.9,\"requiresConfirmation\":true,\"warnings\":[]}",
    "expectedSha256": "4f4f83330f99ae64e36b54439efcf9556e1b7a46054d750a9485bc41a992b48f"
  },
  {
    "id": "canonical/update-shaped",
    "rules": [
      "SR-1",
      "AF-3",
      "PV-1"
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
              "conversationTurn": 4
            },
            "prior": [
              {
                "source": "Inferred",
                "confidence": 0.4,
                "evidence": "Guessed from the payment terms",
                "conversationTurn": 4
              }
            ]
          },
          "isMandatory": true,
          "kind": "date",
          "allowedValues": null,
          "pattern": null
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
                "ref": "erp:purchase-order/77"
              }
            },
            "prior": []
          },
          "isMandatory": false,
          "kind": "text",
          "allowedValues": null,
          "pattern": null
        },
        {
          "name": "Total",
          "value": {
            "amount": "4000.10",
            "currency": "GBP"
          },
          "previousValue": {
            "amount": "40.00",
            "currency": "GBP"
          },
          "provenance": {
            "current": {
              "source": "Computed",
              "confidence": 1,
              "evidence": "Sum of the line items",
              "conversationTurn": null,
              "binding": {
                "kind": "computation-ref",
                "ref": "invoice.total@v3"
              }
            },
            "prior": []
          },
          "isMandatory": true,
          "kind": "number",
          "allowedValues": null,
          "pattern": null
        }
      ],
      "aggregateConfidence": 0.82,
      "populatedConfidence": 0.82,
      "emptyFieldCount": 0,
      "warnings": [
        "The total changed by more than 10x."
      ],
      "requiresConfirmation": true
    },
    "amendments": null,
    "reviewerAct": null,
    "expectedBytesUtf8": "{\"aggregateConfidence\":0.82,\"emptyFieldCount\":0,\"entityId\":\"INV-2026-0044\",\"entityType\":\"Invoice\",\"fields\":[{\"allowedValues\":null,\"isMandatory\":true,\"kind\":\"date\",\"name\":\"DueDate\",\"pattern\":null,\"previousValue\":\"2026-09-15\",\"provenance\":{\"current\":{\"confidence\":0.82,\"conversationTurn\":4,\"evidence\":\"Extracted from the turn\",\"source\":\"Conversation\"},\"prior\":[{\"confidence\":0.4,\"conversationTurn\":4,\"evidence\":\"Guessed from the payment terms\",\"source\":\"Inferred\"}]},\"value\":\"2026-10-01\"},{\"allowedValues\":null,\"isMandatory\":false,\"kind\":\"text\",\"name\":\"Reference\",\"pattern\":null,\"previousValue\":null,\"provenance\":{\"current\":{\"binding\":{\"kind\":\"external-ref\",\"ref\":\"erp:purchase-order/77\"},\"confidence\":1,\"conversationTurn\":null,\"evidence\":\"Read from the purchase-order system\",\"source\":\"External\"},\"prior\":[]},\"value\":\"PO-77\"},{\"allowedValues\":null,\"isMandatory\":true,\"kind\":\"number\",\"name\":\"Total\",\"pattern\":null,\"previousValue\":{\"amount\":\"40.00\",\"currency\":\"GBP\"},\"provenance\":{\"current\":{\"binding\":{\"kind\":\"computation-ref\",\"ref\":\"invoice.total@v3\"},\"confidence\":1,\"conversationTurn\":null,\"evidence\":\"Sum of the line items\",\"source\":\"Computed\"},\"prior\":[]},\"value\":{\"amount\":\"4000.10\",\"currency\":\"GBP\"}}],\"operationType\":\"WriteUpdate\",\"populatedConfidence\":0.82,\"requiresConfirmation\":true,\"warnings\":[\"The total changed by more than 10x.\"]}",
    "expectedSha256": "125220b31c330f0b05a176c9652b8037a0aea55fefed7b1e59d1e5b1edfff333"
  },
  {
    "id": "canonical/wire-evidence-card-request",
    "rules": [
      "SR-1",
      "SR-3"
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
              "conversationTurn": null
            },
            "prior": []
          },
          "isMandatory": true,
          "kind": "enum",
          "allowedValues": [
            "Active",
            "Retired"
          ],
          "pattern": null
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
              "conversationTurn": 3
            },
            "prior": []
          },
          "isMandatory": false,
          "kind": "number",
          "allowedValues": null,
          "pattern": "^\\d+(\\.\\d+)?$"
        }
      ],
      "aggregateConfidence": 0.95,
      "warnings": [],
      "requiresConfirmation": true
    },
    "amendments": null,
    "reviewerAct": null,
    "expectedBytesUtf8": "{\"aggregateConfidence\":0.95,\"entityId\":\"W-1\",\"entityType\":\"Widget\",\"fields\":[{\"allowedValues\":[\"Active\",\"Retired\"],\"isMandatory\":true,\"kind\":\"enum\",\"name\":\"Status\",\"pattern\":null,\"previousValue\":null,\"provenance\":{\"current\":{\"confidence\":1,\"conversationTurn\":null,\"evidence\":\"User stated: Status\",\"source\":\"UserStated\"},\"prior\":[]},\"value\":\"Active\"},{\"allowedValues\":null,\"isMandatory\":false,\"kind\":\"number\",\"name\":\"Weight\",\"pattern\":\"^\\\\d+(\\\\.\\\\d+)?$\",\"previousValue\":10,\"provenance\":{\"current\":{\"confidence\":0.9,\"conversationTurn\":3,\"evidence\":\"Extracted from search_widget\",\"source\":\"Conversation\"},\"prior\":[]},\"value\":12.5}],\"operationType\":\"WriteUpdate\",\"requiresConfirmation\":true,\"warnings\":[]}",
    "expectedSha256": "5bd969aeb4a19bc4f54c6fadc78c83da42ab78c8d5a2d8a826851482b5a95bb0"
  },
  {
    "id": "canonical/wire-evidence-card-request-amended",
    "rules": [
      "SR-1",
      "AF-1",
      "AF-2",
      "AF-4",
      "DK-2",
      "PV-2"
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
              "conversationTurn": null
            },
            "prior": []
          },
          "isMandatory": true,
          "kind": "enum",
          "allowedValues": [
            "Active",
            "Retired"
          ],
          "pattern": null
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
              "conversationTurn": 3
            },
            "prior": []
          },
          "isMandatory": false,
          "kind": "number",
          "allowedValues": null,
          "pattern": "^\\d+(\\.\\d+)?$"
        }
      ],
      "aggregateConfidence": 0.95,
      "warnings": [],
      "requiresConfirmation": true
    },
    "amendments": {
      "Status": "Retired",
      "Weight": null
    },
    "reviewerAct": {
      "entryId": "8f14e45f-ceea-467e-bd76-000000000001",
      "decisionAt": "2026-09-04T09:12:00.000Z",
      "by": "ana"
    },
    "expectedBytesUtf8": "{\"aggregateConfidence\":1,\"entityId\":\"W-1\",\"entityType\":\"Widget\",\"fields\":[{\"allowedValues\":[\"Active\",\"Retired\"],\"isMandatory\":true,\"kind\":\"enum\",\"name\":\"Status\",\"pattern\":null,\"previousValue\":null,\"provenance\":{\"current\":{\"at\":\"2026-09-04T09:12:00.000Z\",\"binding\":{\"kind\":\"reviewer-act\",\"ref\":{\"decisionAt\":\"2026-09-04T09:12:00.000Z\",\"entryId\":\"8f14e45f-ceea-467e-bd76-000000000001\"}},\"confidence\":1,\"conversationTurn\":null,\"note\":\"Amended by ana on Docket entry 8f14e45f-ceea-467e-bd76-000000000001\",\"source\":\"UserStated\"},\"prior\":[{\"confidence\":1,\"conversationTurn\":null,\"evidence\":\"User stated: Status\",\"source\":\"UserStated\"}]},\"value\":\"Retired\"}],\"operationType\":\"WriteUpdate\",\"requiresConfirmation\":true,\"warnings\":[]}",
    "expectedSha256": "6da4ce05a06a73a73d614782ec337bac27384b3ee65d69a1dd00858710c7ec9d"
  },
  {
    "id": "canonical/key-order-stress",
    "rules": [
      "SR-1"
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
        "a/b": "a solidus, which JSON never escapes"
      },
      "middle": [
        {
          "second": 2,
          "first": 1
        },
        {
          "b": [
            3,
            2,
            1
          ],
          "a": {
            "y": null,
            "x": true
          }
        }
      ],
      "alpha": "written last, sorts first"
    },
    "amendments": null,
    "reviewerAct": null,
    "expectedBytesUtf8": "{\"alpha\":\"written last, sorts first\",\"middle\":[{\"first\":1,\"second\":2},{\"a\":{\"x\":true,\"y\":null},\"b\":[3,2,1]}],\"zeta\":{\"\":\"the empty key\",\"10\":\"integer-shaped key\",\"2\":\"another integer-shaped key\",\"A\":\"uppercase A\",\"B\":\"uppercase B\",\"a\":\"prefix\",\"a/b\":\"a solidus, which JSON never escapes\",\"ab\":\"prefix plus one\",\"b\":\"lowercase b\",\"é\":\"e plus combining acute, U+0065 U+0301\",\"é\":\"e-acute precomposed, U+00E9\",\"\":\"private use, U+E000\",\"😀\":\"emoji key, U+1F600\"}}",
    "expectedSha256": "bfb9d23217cd75bc12976620e641b735b73448db6072104d09d94489246fec3a"
  },
  {
    "id": "canonical/number-forms",
    "rules": [
      "SR-1"
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
        100000000000000000000
      ]
    },
    "amendments": null,
    "reviewerAct": null,
    "expectedBytesUtf8": "{\"beyond2p53\":9007199254740992,\"exp21\":1000000000000000000000,\"exp23\":123456789012345690000000,\"half\":0.5,\"integer\":42,\"negativeInteger\":-17,\"negativeTiny\":-0.000000012345,\"negativeZero\":0,\"nested\":[0,-0.5,0.000001,0.00001,1000000,100000000000000000000],\"one\":1,\"sumOfTenths\":0.30000000000000004,\"tinier\":0.0000000015,\"tiny\":0.0000001}",
    "expectedSha256": "61a744d2ab4b9285a2706e3f26c2b4e8baa14c85ddfc0b3252bcde0274a3aaf6"
  },
  {
    "id": "canonical/money-and-escapes",
    "rules": [
      "SR-1",
      "SR-2"
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
            "currency": "GBP"
          },
          "previousValue": {
            "amount": "0",
            "currency": "GBP"
          },
          "provenance": {
            "current": {
              "source": "Computed",
              "confidence": 1,
              "evidence": "Sum of the line items",
              "conversationTurn": null,
              "binding": {
                "kind": "computation-ref",
                "ref": "invoice.total@v3"
              }
            },
            "prior": []
          },
          "isMandatory": true,
          "kind": "number",
          "allowedValues": null,
          "pattern": null
        },
        {
          "name": "Refund",
          "value": {
            "currency": "JPY",
            "amount": "-1250"
          },
          "previousValue": null,
          "provenance": {
            "current": {
              "source": "UserStated",
              "confidence": 1,
              "evidence": "Reviewer typed it",
              "conversationTurn": null
            },
            "prior": []
          },
          "isMandatory": false,
          "kind": "number",
          "allowedValues": null,
          "pattern": null
        },
        {
          "name": "Ceiling",
          "value": {
            "amount": "123456789012345678901234567890.99",
            "currency": "LKR"
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
                "ref": "ledger:limit/9"
              }
            },
            "prior": []
          },
          "isMandatory": false,
          "kind": "number",
          "allowedValues": null,
          "pattern": null
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
              "conversationTurn": 2
            },
            "prior": []
          },
          "isMandatory": false,
          "kind": "text",
          "allowedValues": null,
          "pattern": null
        }
      ],
      "aggregateConfidence": 0.7,
      "populatedConfidence": 0.7,
      "emptyFieldCount": 0,
      "warnings": [],
      "requiresConfirmation": true
    },
    "amendments": null,
    "reviewerAct": null,
    "expectedBytesUtf8": "{\"aggregateConfidence\":0.7,\"emptyFieldCount\":0,\"entityId\":\"INV-2026-0045\",\"entityType\":\"Invoice\",\"fields\":[{\"allowedValues\":null,\"isMandatory\":true,\"kind\":\"number\",\"name\":\"Total\",\"pattern\":null,\"previousValue\":{\"amount\":\"0\",\"currency\":\"GBP\"},\"provenance\":{\"current\":{\"binding\":{\"kind\":\"computation-ref\",\"ref\":\"invoice.total@v3\"},\"confidence\":1,\"conversationTurn\":null,\"evidence\":\"Sum of the line items\",\"source\":\"Computed\"},\"prior\":[]},\"value\":{\"amount\":\"4000.10\",\"currency\":\"GBP\"}},{\"allowedValues\":null,\"isMandatory\":false,\"kind\":\"number\",\"name\":\"Refund\",\"pattern\":null,\"previousValue\":null,\"provenance\":{\"current\":{\"confidence\":1,\"conversationTurn\":null,\"evidence\":\"Reviewer typed it\",\"source\":\"UserStated\"},\"prior\":[]},\"value\":{\"amount\":\"-1250\",\"currency\":\"JPY\"}},{\"allowedValues\":null,\"isMandatory\":false,\"kind\":\"number\",\"name\":\"Ceiling\",\"pattern\":null,\"previousValue\":null,\"provenance\":{\"current\":{\"binding\":{\"kind\":\"external-ref\",\"ref\":\"ledger:limit/9\"},\"confidence\":1,\"conversationTurn\":null,\"evidence\":\"Read from the ledger\",\"source\":\"External\"},\"prior\":[]},\"value\":{\"amount\":\"123456789012345678901234567890.99\",\"currency\":\"LKR\"}},{\"allowedValues\":null,\"isMandatory\":false,\"kind\":\"text\",\"name\":\"Memo\",\"pattern\":null,\"previousValue\":null,\"provenance\":{\"current\":{\"confidence\":0.7,\"conversationTurn\":2,\"evidence\":\"Taken verbatim from the turn\",\"source\":\"Conversation\"},\"prior\":[]},\"value\":\"quote \\\" backslash \\\\ tab \\t newline \\n cr \\r backspace \\b formfeed \\f nul \\u0000 unit-separator \\u001f solidus a/b accented éüñ script 日本語 emoji 😀 private-use \"}],\"operationType\":\"WriteUpdate\",\"populatedConfidence\":0.7,\"requiresConfirmation\":true,\"warnings\":[]}",
    "expectedSha256": "2970e9ad511c5b2a7d9b96e2fd6cf4389620dcbb616422e1e80a22670536b9c1"
  },
];

/** Every conformance fixture and byte vector, keyed by its manifest id. */
export const conformanceById: Readonly<
  Record<string, ConformanceFixtureDocument | CanonicalVectorDocument>
> = {
  "gate/substance-hollow-refused": conformanceFixtures[0]!,
  "gate/substance-zero-field-refused": conformanceFixtures[1]!,
  "gate/ttl-from-verdict": conformanceFixtures[2]!,
  "gate/ttl-from-policy-default": conformanceFixtures[3]!,
  "gate/ttl-from-gate-default": conformanceFixtures[4]!,
  "gate/standing-order-by-the-book": conformanceFixtures[5]!,
  "gate/standing-order-threshold-under": conformanceFixtures[6]!,
  "gate/standing-order-threshold-over": conformanceFixtures[7]!,
  "gate/standing-order-unbound-input": conformanceFixtures[8]!,
  "gate/standing-order-bound-input": conformanceFixtures[9]!,
  "gate/multiparty-blocked": conformanceFixtures[10]!,
  "gate/referral-blocked": conformanceFixtures[11]!,
  "gate/coverage-refused-declared": conformanceFixtures[12]!,
  "gate/update-previous-values": conformanceFixtures[13]!,
  "gate/create-null-previous-values": conformanceFixtures[14]!,
  "gate/inference-conversation-and-inferred": conformanceFixtures[15]!,
  "gate/threshold-without-scorer": conformanceFixtures[16]!,
  "decide/approve": conformanceFixtures[17]!,
  "decide/reject": conformanceFixtures[18]!,
  "decide/second-decision-refused": conformanceFixtures[19]!,
  "decide/expired-amendments-preserved": conformanceFixtures[20]!,
  "decide/blocked-refused": conformanceFixtures[21]!,
  "decide/amend-recompute": conformanceFixtures[22]!,
  "decide/unresolved-identity": conformanceFixtures[23]!,
  "decide/wrong-tenant": conformanceFixtures[24]!,
  "decide/authorization-declined": conformanceFixtures[25]!,
  "decide/relay-member-via-relay": conformanceFixtures[26]!,
  "decide/relay-without-assertion-refused": conformanceFixtures[27]!,
  "decide/execution-executed": conformanceFixtures[28]!,
  "decide/execution-failed": conformanceFixtures[29]!,
  "decide/execution-on-pending-refused": conformanceFixtures[30]!,
  "decide/resubmit-prefills": conformanceFixtures[31]!,
  "decide/executed-only-through-a-report": conformanceFixtures[32]!,
  "decide/authorization-throws": conformanceFixtures[33]!,
  "decide/execution-recorded-once": conformanceFixtures[34]!,
  "decide/execution-second-report-refused": conformanceFixtures[35]!,
  "sequence-a/approve-round-trip": conformanceFixtures[36]!,
  "sequence-a/reject-round-trip": conformanceFixtures[37]!,
  "sequence-a/typed-inputs-on-the-card": conformanceFixtures[38]!,
  "sequence-a/picker-external-binding": conformanceFixtures[39]!,
  "sequence-a/mandatory-field-left-empty": conformanceFixtures[40]!,
  "sequence-a/mandatory-field-reviewer-approves": conformanceFixtures[41]!,
  "sequence-a/expiry-then-resubmit": conformanceFixtures[42]!,
  "sequence-a/late-amendments-preserved": conformanceFixtures[43]!,
  "sequence-a/interleaved-conversations": conformanceFixtures[44]!,
  "sequence-a/replay-keeps-the-deadline": conformanceFixtures[45]!,
  "sequence-a/sweep-pages": conformanceFixtures[46]!,
  "sequence-a/rehydration-order": conformanceFixtures[47]!,
  "sequence-a/coverage-refused-at-wire-up": conformanceFixtures[48]!,
  "sequence-a/mandatory-field-empty-blocks-standing-order": conformanceFixtures[49]!,
  "sequence-a/optional-field-empty-standing-order-fires": conformanceFixtures[50]!,
  "sequence-c/relay-auto-approve-bound-external": conformanceFixtures[51]!,
  "sequence-c/relayed-decision-member-via-relay": conformanceFixtures[52]!,
  "sequence-c/unbound-external-asks-a-person": conformanceFixtures[53]!,
  "sequence-c/relay-may-not-attest-member": conformanceFixtures[54]!,
  "sequence-c/relay-decision-other-tenant-not-found": conformanceFixtures[55]!,
  "canonical/create-shaped": canonicalVectors[0]!,
  "canonical/update-shaped": canonicalVectors[1]!,
  "canonical/wire-evidence-card-request": canonicalVectors[2]!,
  "canonical/wire-evidence-card-request-amended": canonicalVectors[3]!,
  "canonical/key-order-stress": canonicalVectors[4]!,
  "canonical/number-forms": canonicalVectors[5]!,
  "canonical/money-and-escapes": canonicalVectors[6]!,
};

/** `conformance/fixture.schema.json` — what a declarative fixture may say. */
export const fixtureSchema: JsonSchemaDocument = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://affiant.dev/conformance/0.1.0/fixture.schema.json",
  "title": "ConformanceFixture",
  "description": "One declarative conformance fixture: a wiring, a sequence of acts, and what must then be true. Written out from the reference runner's own key tables (Sakwala/affiant-ts, packages/core/src/testing.ts — FIXTURE_KEYS and STEP_KEYS), so that a document this schema accepts is a document that runner will run rather than reject. The allowed key sets are the same in both places and every object here is additionalProperties:false, deliberately: a misspelled expectation key is a key the checker never reads, so the fixture asserts nothing about that fact and every implementation passes it, including a broken one. Adding a clause to the format means adding it in both places in the same change. This schema describes the FIXTURE FORMAT and refers to nothing outside itself; the wire shapes a fixture's matchers are about live in schemas/0.1.0/. The seven canonical/*.json byte vectors are a different document shape and are not described here — see conformance/RUNNER.md, 'The canonical vectors'.",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "id",
    "rules",
    "title",
    "given",
    "expect"
  ],
  "properties": {
    "id": {
      "description": "A stable id, unique across the set, prefixed by the set it lives in. Never renamed: a parity manifest cites it by name, so a rename silently changes what a published document refers to.",
      "type": "string",
      "pattern": "^(gate|decide|sequence-a|sequence-c)/[a-z0-9]+(-[a-z0-9]+)*$"
    },
    "rules": {
      "description": "The rulebook ids this fixture checks. At least one, and each must be a rule INVARIANTS.md defines — the coverage lint checks both directions.",
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "string",
        "pattern": "^(AF|PV|GT|DK|AZ|SR|RT|CV|TL)-[0-9]+$"
      }
    },
    "title": {
      "description": "What the fixture asserts, in a sentence a reviewer can read without opening the JSON. It is the test name in every runner.",
      "type": "string",
      "minLength": 1
    },
    "given": {
      "$ref": "#/$defs/given"
    },
    "expect": {
      "$ref": "#/$defs/expect"
    }
  },
  "$defs": {
    "jsonValue": {
      "description": "Any JSON value. Field values are the host's domain data; the protocol does not constrain them.",
      "$comment": "No type constraint on purpose."
    },
    "isoInstant": {
      "type": "string",
      "format": "date-time"
    },
    "unitInterval": {
      "type": "number",
      "minimum": 0,
      "maximum": 1
    },
    "amendments": {
      "description": "A reviewer's amendments: field name to the new value, where null means the reviewer CLEARED the field, which is distinct from the key being absent (DK-2).",
      "type": "object"
    },
    "provenanceSource": {
      "type": "string",
      "enum": [
        "Empty",
        "Default",
        "Inferred",
        "Conversation",
        "Computed",
        "External",
        "UserStated"
      ]
    },
    "bindingKind": {
      "type": "string",
      "enum": [
        "utterance-span",
        "reviewer-act",
        "form-input",
        "external-ref",
        "computation-ref"
      ]
    },
    "binding": {
      "description": "What to look at to check a value (PV-2): a kind and the reference it points at.",
      "type": "object",
      "additionalProperties": false,
      "required": [
        "kind",
        "ref"
      ],
      "properties": {
        "kind": {
          "$ref": "#/$defs/bindingKind"
        },
        "ref": {
          "type": "object"
        }
      }
    },
    "interceptorBinding": {
      "description": "The two binding kinds a deterministic interceptor may mint (PV-3): a machine points at a record or a computation, never at a person's act.",
      "type": "object",
      "additionalProperties": false,
      "required": [
        "kind",
        "ref"
      ],
      "properties": {
        "kind": {
          "type": "string",
          "enum": [
            "external-ref",
            "computation-ref"
          ]
        },
        "ref": {
          "type": "object"
        }
      }
    },
    "fieldKind": {
      "type": "string",
      "enum": [
        "text",
        "number",
        "date",
        "enum"
      ]
    },
    "requirementKind": {
      "type": "string",
      "enum": [
        "StandingOrder",
        "ReviewerConfirmation",
        "ReferralRequired",
        "MultiParty"
      ]
    },
    "blocked": {
      "description": "Why no decision on an entry will be accepted (AZ-4, CV-4), or null.",
      "oneOf": [
        {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "code"
          ],
          "properties": {
            "code": {
              "type": "string",
              "enum": [
                "requirement-not-implemented",
                "coverage-refused"
              ]
            },
            "level": {
              "$ref": "#/$defs/requirementKind"
            },
            "category": {
              "type": "string",
              "enum": [
                "no-execute",
                "provider-executed",
                "hosted-mcp"
              ]
            },
            "toolName": {
              "type": "string"
            }
          }
        },
        {
          "type": "null"
        }
      ]
    },
    "principal": {
      "description": "Who is acting on the turn (AZ-2, AZ-3). null is UNRESOLVED, which is not the same as anonymous.",
      "oneOf": [
        {
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
              "type": "string"
            }
          }
        },
        {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "kind",
            "id"
          ],
          "properties": {
            "kind": {
              "const": "service"
            },
            "id": {
              "type": "string"
            },
            "relay": {
              "description": "The message this service is carrying, when it is a relay.",
              "type": "object",
              "additionalProperties": false,
              "required": [
                "channelIdentity",
                "messageId"
              ],
              "properties": {
                "channelIdentity": {
                  "description": "The identity, on the relay's own channel, the message came from — a phone number, a handle, whatever the relay names people by. Unconstrained on purpose: the protocol does not own the relay's namespace."
                },
                "messageId": {
                  "type": "string"
                }
              }
            },
            "assertedMember": {
              "description": "The person this service says it is speaking for. An assertion, never an authentication: it does not upgrade the principal to member (AZ-3).",
              "type": "string"
            }
          }
        },
        {
          "type": "null"
        }
      ]
    },
    "given": {
      "description": "The wiring, the acts, and the turn they happen in.",
      "type": "object",
      "additionalProperties": false,
      "required": [
        "gate",
        "clock",
        "ctx",
        "step"
      ],
      "properties": {
        "gate": {
          "$ref": "#/$defs/gate"
        },
        "store": {
          "description": "Which reference store to file into. Only the in-memory one exists at v0.1.",
          "type": "string",
          "enum": [
            "memory"
          ]
        },
        "clock": {
          "description": "The instant the clock starts at. Every step may move it forward with `at`.",
          "$ref": "#/$defs/isoInstant"
        },
        "ctx": {
          "$ref": "#/$defs/ctx"
        },
        "prior": {
          "description": "The acts that set the scene. Each may declare the refusal it is expected to produce, so a reader sees the refusal beside the act that caused it.",
          "type": "array",
          "items": {
            "$ref": "#/$defs/step"
          }
        },
        "step": {
          "description": "The act under test. expect.error is about this one.",
          "$ref": "#/$defs/step"
        }
      }
    },
    "gate": {
      "description": "Everything the gate is built from. A driver binds each of these to its own implementation's equivalent (conformance/DRIVER.md).",
      "type": "object",
      "additionalProperties": false,
      "required": [
        "defaultTtlMs",
        "authorization"
      ],
      "properties": {
        "policies": {
          "description": "The approval chain, in order (AZ-4).",
          "type": "array",
          "items": {
            "$ref": "#/$defs/policy"
          }
        },
        "riskScorer": {
          "description": "What the host's risk function returns, or null for no scorer wired (GT-5).",
          "type": [
            "number",
            "null"
          ]
        },
        "interceptors": {
          "description": "Deterministic resolvers (PV-2, GT-1 step 2).",
          "type": "array",
          "items": {
            "$ref": "#/$defs/interceptor"
          }
        },
        "defaultTtlMs": {
          "description": "The deadline applied when neither the verdict nor the policy names one (GT-4).",
          "type": "integer",
          "minimum": 1
        },
        "authorization": {
          "$ref": "#/$defs/authorization"
        },
        "inference": {
          "description": "What the host's inference reports, keyed by field name (GT-1 step 3). Scripted, never computed: the gate's contract is that it asks the host for values and tags whatever it gets.",
          "oneOf": [
            {
              "type": "object",
              "additionalProperties": {
                "$ref": "#/$defs/inferredField"
              }
            },
            {
              "type": "null"
            }
          ]
        },
        "entities": {
          "description": "What the host's entities hold now, keyed \"<entityType>/<entityId>\" (AF-3). An entity the table does not name does not exist, and the projection port answers null.",
          "type": "object",
          "additionalProperties": {
            "type": "object"
          }
        },
        "uncovered": {
          "description": "Tools the host declared it cannot intercept (CV-4).",
          "type": "array",
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "tool",
              "category"
            ],
            "properties": {
              "tool": {
                "type": "string"
              },
              "category": {
                "type": "string",
                "enum": [
                  "no-execute",
                  "provider-executed",
                  "hosted-mcp"
                ]
              }
            }
          }
        },
        "sessions": {
          "description": "Whether a rehydration surface is wired (DK-5). Defaults to true.",
          "type": "boolean"
        }
      }
    },
    "authorization": {
      "description": "The host's answer to \"may this principal act on this entry\" (AZ-2): an allowlist of principal ids, \"*\" admitting everyone. `throws` makes the port fall over instead of answering, which the gate must read as a refusal and never as an approval.",
      "type": "object",
      "additionalProperties": false,
      "required": [
        "allow"
      ],
      "properties": {
        "allow": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "throws": {
          "type": "boolean"
        }
      }
    },
    "policy": {
      "description": "One approval policy, as a fixture states it: what it is, what it predicates on, and what it says.",
      "type": "object",
      "additionalProperties": false,
      "required": [
        "id",
        "version",
        "verdict"
      ],
      "properties": {
        "id": {
          "description": "The host's id, written into a Standing Order attestation (AZ-1).",
          "type": "string"
        },
        "version": {
          "type": "string"
        },
        "declaredInputs": {
          "description": "The provenance sources it predicates on (PV-4).",
          "type": "array",
          "items": {
            "$ref": "#/$defs/provenanceSource"
          }
        },
        "declaresThreshold": {
          "description": "Whether any verdict it can return names a threshold (GT-5, CV-1). The static twin of Verdict.threshold, so a gate whose policies need a risk scorer it was not given is refused at wire-up.",
          "type": "boolean"
        },
        "defaultTtlMs": {
          "description": "Its own default deadline (GT-4).",
          "type": [
            "integer",
            "null"
          ],
          "minimum": 1
        },
        "verdict": {
          "oneOf": [
            {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "requirement"
              ],
              "properties": {
                "requirement": {
                  "$ref": "#/$defs/requirementKind"
                },
                "ttlMs": {
                  "type": "integer",
                  "minimum": 1
                },
                "threshold": {
                  "description": "The risk ceiling, on a StandingOrder verdict only (GT-5).",
                  "type": "number"
                },
                "reason": {
                  "type": "string"
                }
              }
            },
            {
              "type": "null"
            }
          ]
        }
      }
    },
    "interceptor": {
      "description": "One deterministic resolver (PV-2): a name for the record and the fields it resolves.",
      "type": "object",
      "additionalProperties": false,
      "required": [
        "name",
        "fields"
      ],
      "properties": {
        "name": {
          "type": "string"
        },
        "fields": {
          "type": "object",
          "additionalProperties": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "value",
              "source",
              "confidence",
              "binding"
            ],
            "properties": {
              "value": {
                "$ref": "#/$defs/jsonValue"
              },
              "source": {
                "type": "string",
                "enum": [
                  "External",
                  "Computed"
                ]
              },
              "confidence": {
                "$ref": "#/$defs/unitInterval"
              },
              "binding": {
                "$ref": "#/$defs/interceptorBinding"
              },
              "evidence": {
                "type": [
                  "string",
                  "null"
                ]
              }
            }
          }
        }
      }
    },
    "inferredField": {
      "description": "One field the scripted inference port reports.",
      "type": "object",
      "additionalProperties": false,
      "required": [
        "value",
        "confidence",
        "presence"
      ],
      "properties": {
        "value": {
          "$ref": "#/$defs/jsonValue"
        },
        "confidence": {
          "description": "How confident the port claims to be. Clamped by the pipeline (PV-1).",
          "type": "number"
        },
        "presence": {
          "description": "Literally present in the turn (Conversation) or reasoned to (Inferred).",
          "type": "string",
          "enum": [
            "literal",
            "inferred"
          ]
        },
        "utteranceSpan": {
          "oneOf": [
            {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "start",
                "end"
              ],
              "properties": {
                "start": {
                  "type": "integer",
                  "minimum": 0
                },
                "end": {
                  "type": "integer",
                  "minimum": 0
                }
              }
            },
            {
              "type": "null"
            }
          ]
        }
      }
    },
    "ctx": {
      "description": "The turn every step runs in (GT-2): explicit in every property, nothing ambient. A step may override the principal, the tenant or the conversation.",
      "type": "object",
      "additionalProperties": false,
      "required": [
        "tenantId",
        "conversationId",
        "channel"
      ],
      "properties": {
        "tenantId": {
          "type": "string"
        },
        "conversationId": {
          "type": "string"
        },
        "channel": {
          "type": "string"
        },
        "principal": {
          "$ref": "#/$defs/principal"
        },
        "utterance": {
          "type": "string"
        },
        "messageId": {
          "type": "string"
        }
      }
    },
    "toolFields": {
      "description": "The fields a tool declares, with their reviewer-facing shape.",
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "name",
          "kind"
        ],
        "properties": {
          "name": {
            "type": "string"
          },
          "kind": {
            "$ref": "#/$defs/fieldKind"
          },
          "description": {
            "type": [
              "string",
              "null"
            ]
          },
          "required": {
            "type": "boolean"
          },
          "allowedValues": {
            "oneOf": [
              {
                "type": "array",
                "items": {
                  "type": "string"
                }
              },
              {
                "type": "null"
              }
            ]
          },
          "pattern": {
            "type": [
              "string",
              "null"
            ]
          }
        }
      }
    },
    "tool": {
      "description": "A tool definition, as a wrap-execute step states it. The runner supplies an `execute` that fails if the gate ever calls it, which makes GT-6 a tripwire on every such fixture.",
      "type": "object",
      "additionalProperties": false,
      "required": [
        "name",
        "entityType",
        "fields"
      ],
      "properties": {
        "name": {
          "type": "string"
        },
        "description": {
          "type": "string"
        },
        "entityType": {
          "type": "string"
        },
        "entityId": {
          "description": "null for a create-shaped tool.",
          "type": [
            "string",
            "null"
          ]
        },
        "writeCapable": {
          "type": "boolean"
        },
        "executedBy": {
          "type": "string",
          "enum": [
            "host",
            "provider"
          ]
        },
        "hostedMcp": {
          "type": "boolean"
        },
        "omitExecute": {
          "description": "Whether the tool carries no execute at all — the no-execute category (CV-4).",
          "type": "boolean"
        },
        "operationLabel": {
          "type": "string"
        },
        "fields": {
          "$ref": "#/$defs/toolFields"
        }
      }
    },
    "operation": {
      "description": "One create-or-update a tool proposes against one entity. Spelled as a discriminated union rather than a nullable id, because the create branch is what turns into previousValue: null on every field (AF-3).",
      "type": "object",
      "additionalProperties": false,
      "required": [
        "kind",
        "entityType",
        "entityId",
        "fields"
      ],
      "properties": {
        "kind": {
          "type": "string",
          "enum": [
            "create",
            "update"
          ]
        },
        "entityType": {
          "type": "string"
        },
        "entityId": {
          "type": [
            "string",
            "null"
          ]
        },
        "fields": {
          "type": "array",
          "items": {
            "type": "string"
          }
        }
      },
      "allOf": [
        {
          "if": {
            "properties": {
              "kind": {
                "const": "create"
              }
            },
            "required": [
              "kind"
            ]
          },
          "then": {
            "properties": {
              "entityId": {
                "type": "null"
              }
            }
          }
        },
        {
          "if": {
            "properties": {
              "kind": {
                "const": "update"
              }
            },
            "required": [
              "kind"
            ]
          },
          "then": {
            "properties": {
              "entityId": {
                "type": "string"
              }
            }
          }
        }
      ]
    },
    "preparedField": {
      "description": "A field the host has already tagged, for a capture whose provenance is settled (Sequence C's way in).",
      "type": "object",
      "additionalProperties": false,
      "required": [
        "name",
        "kind",
        "value"
      ],
      "properties": {
        "name": {
          "type": "string"
        },
        "kind": {
          "$ref": "#/$defs/fieldKind"
        },
        "value": {
          "$ref": "#/$defs/jsonValue"
        },
        "isMandatory": {
          "type": "boolean"
        },
        "provenance": {
          "description": "The tag in force, or absent for \"proposed, provenance unknown\" (AF-1).",
          "oneOf": [
            {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "source",
                "confidence"
              ],
              "properties": {
                "source": {
                  "$ref": "#/$defs/provenanceSource"
                },
                "confidence": {
                  "$ref": "#/$defs/unitInterval"
                },
                "binding": {
                  "oneOf": [
                    {
                      "$ref": "#/$defs/binding"
                    },
                    {
                      "type": "null"
                    }
                  ]
                },
                "note": {
                  "type": [
                    "string",
                    "null"
                  ]
                }
              }
            },
            {
              "type": "null"
            }
          ]
        }
      }
    },
    "stepCommon": {
      "description": "What every step may say about when it happens and who performs it. These keys are legal on every kind; the kind adds its own.",
      "type": "object",
      "properties": {
        "kind": {
          "type": "string"
        },
        "as": {
          "description": "A label later steps and expectations can name this step's entry by.",
          "type": "string"
        },
        "at": {
          "description": "Moves the clock before the step runs.",
          "$ref": "#/$defs/isoInstant"
        },
        "principal": {
          "$ref": "#/$defs/principal"
        },
        "tenantId": {
          "description": "The tenant this step is performed from, when it is not the fixture's (AZ-2).",
          "type": "string"
        },
        "conversationId": {
          "description": "The conversation this step is performed in, when it is not the fixture's (GT-2).",
          "type": "string"
        },
        "entry": {
          "description": "The entry this step acts on: a label from `as`, or the last one filed.",
          "type": "string"
        },
        "refusal": {
          "description": "The refusal code this step is expected to produce. Declared on the step so a reader sees the refusal beside the act that caused it. The step under test may state its refusal here or in expect.error; a refusal declared here is compared wherever it is declared.",
          "type": [
            "string",
            "null"
          ]
        }
      }
    },
    "scope": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "tenantId": {
          "type": "string"
        },
        "conversationId": {
          "type": "string"
        }
      }
    },
    "step": {
      "description": "One act on the gate. The gate's whole surface is reachable from these eight kinds, so a fixture about a decision and a fixture about a filing differ in their steps, not in their format.",
      "type": "object",
      "required": [
        "kind"
      ],
      "oneOf": [
        {
          "title": "wrap-execute",
          "description": "Sequence A's way in: a model calls a wrapped tool (GT-6, CV-4).",
          "allOf": [
            {
              "$ref": "#/$defs/stepCommon"
            }
          ],
          "unevaluatedProperties": false,
          "required": [
            "kind",
            "tool",
            "args"
          ],
          "properties": {
            "kind": {
              "const": "wrap-execute"
            },
            "tool": {
              "$ref": "#/$defs/tool"
            },
            "args": {
              "type": "object"
            }
          }
        },
        {
          "title": "file",
          "description": "Sequence C's way in: a capture the host assembled (GT-1).",
          "allOf": [
            {
              "$ref": "#/$defs/stepCommon"
            }
          ],
          "unevaluatedProperties": false,
          "required": [
            "kind",
            "toolName",
            "operation"
          ],
          "properties": {
            "kind": {
              "const": "file"
            },
            "toolName": {
              "type": "string"
            },
            "operation": {
              "$ref": "#/$defs/operation"
            },
            "schema": {
              "oneOf": [
                {
                  "$ref": "#/$defs/toolFields"
                },
                {
                  "type": "null"
                }
              ]
            },
            "preparedFields": {
              "oneOf": [
                {
                  "type": "array",
                  "items": {
                    "$ref": "#/$defs/preparedField"
                  }
                },
                {
                  "type": "null"
                }
              ]
            },
            "args": {
              "$ref": "#/$defs/jsonValue"
            },
            "operationLabel": {
              "type": [
                "string",
                "null"
              ]
            }
          }
        },
        {
          "title": "decide",
          "description": "Approve, amend or reject (DK-1, AZ-1, AZ-2).",
          "allOf": [
            {
              "$ref": "#/$defs/stepCommon"
            }
          ],
          "unevaluatedProperties": false,
          "required": [
            "kind",
            "decision"
          ],
          "properties": {
            "kind": {
              "const": "decide"
            },
            "decision": {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "kind"
              ],
              "properties": {
                "kind": {
                  "type": "string",
                  "enum": [
                    "approve",
                    "reject"
                  ]
                },
                "amendments": {
                  "oneOf": [
                    {
                      "$ref": "#/$defs/amendments"
                    },
                    {
                      "type": "null"
                    }
                  ]
                },
                "reason": {
                  "type": [
                    "string",
                    "null"
                  ]
                }
              }
            }
          }
        },
        {
          "title": "resubmit",
          "description": "File an expired entry again (DK-1). A resubmission is a NEW entry, never a reopened one.",
          "allOf": [
            {
              "$ref": "#/$defs/stepCommon"
            }
          ],
          "unevaluatedProperties": false,
          "required": [
            "kind"
          ],
          "properties": {
            "kind": {
              "const": "resubmit"
            }
          }
        },
        {
          "title": "markExecuted",
          "description": "Report what the host's executor did (DK-1, AZ-5, AZ-7). The framework never performs the write.",
          "allOf": [
            {
              "$ref": "#/$defs/stepCommon"
            }
          ],
          "unevaluatedProperties": false,
          "required": [
            "kind",
            "outcome"
          ],
          "properties": {
            "kind": {
              "const": "markExecuted"
            },
            "outcome": {
              "type": "string",
              "enum": [
                "executed",
                "failed"
              ]
            },
            "detail": {
              "type": [
                "string",
                "null"
              ]
            }
          }
        },
        {
          "title": "expireDue",
          "description": "The host-scheduled sweep (DK-3). Bounded and paged: the limit is the fixture's, never the store's whole contents.",
          "allOf": [
            {
              "$ref": "#/$defs/stepCommon"
            }
          ],
          "unevaluatedProperties": false,
          "required": [
            "kind",
            "limit"
          ],
          "properties": {
            "kind": {
              "const": "expireDue"
            },
            "limit": {
              "type": "integer",
              "minimum": 1
            },
            "scope": {
              "$ref": "#/$defs/scope"
            }
          }
        },
        {
          "title": "get",
          "description": "Read the entry as it stands, with expiry applied (DK-1).",
          "allOf": [
            {
              "$ref": "#/$defs/stepCommon"
            }
          ],
          "unevaluatedProperties": false,
          "required": [
            "kind"
          ],
          "properties": {
            "kind": {
              "const": "get"
            }
          }
        },
        {
          "title": "rehydrate",
          "description": "One page of what a reconnecting client needs (DK-5).",
          "allOf": [
            {
              "$ref": "#/$defs/stepCommon"
            }
          ],
          "unevaluatedProperties": false,
          "required": [
            "kind",
            "page"
          ],
          "properties": {
            "kind": {
              "const": "rehydrate"
            },
            "page": {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "limit"
              ],
              "properties": {
                "limit": {
                  "type": "integer",
                  "minimum": 1
                },
                "cursor": {
                  "type": [
                    "string",
                    "null"
                  ]
                }
              }
            },
            "scope": {
              "$ref": "#/$defs/scope"
            }
          }
        }
      ]
    },
    "expect": {
      "description": "What must be true after the step under test. Every clause is optional and every matcher is PARTIAL: a fixture states the facts its rule is about and says nothing about the rest, so an unrelated addition to a Docket row does not break thirty documents. What a fixture may NOT do is state nothing at all — minProperties here is the schema's half of the runner's vacuity check, which counts leaf facts and rejects `{}`, `{ \"entry\": {} }` and `{ \"telemetryAbsent\": [] }` alike.",
      "type": "object",
      "additionalProperties": false,
      "minProperties": 1,
      "properties": {
        "error": {
          "description": "The refusal the step under test must produce, or null/absent for none.",
          "oneOf": [
            {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "code"
              ],
              "properties": {
                "code": {
                  "type": "string"
                },
                "messageContains": {
                  "type": "string"
                }
              }
            },
            {
              "type": "null"
            }
          ]
        },
        "entry": {
          "oneOf": [
            {
              "$ref": "#/$defs/entryMatcher"
            },
            {
              "type": "null"
            }
          ]
        },
        "card": {
          "oneOf": [
            {
              "$ref": "#/$defs/cardMatcher"
            },
            {
              "type": "null"
            }
          ]
        },
        "superseded": {
          "description": "The row a resubmit superseded.",
          "oneOf": [
            {
              "$ref": "#/$defs/entryMatcher"
            },
            {
              "type": "null"
            }
          ]
        },
        "telemetry": {
          "description": "Telemetry keys that must have been emitted at some point (TL-1). A key outside the registry fails the fixture.",
          "oneOf": [
            {
              "type": "array",
              "items": {
                "type": "string"
              }
            },
            {
              "type": "null"
            }
          ]
        },
        "telemetryAbsent": {
          "description": "Telemetry keys that must NEVER have been emitted.",
          "oneOf": [
            {
              "type": "array",
              "items": {
                "type": "string"
              }
            },
            {
              "type": "null"
            }
          ]
        },
        "store": {
          "description": "What the Docket holds afterwards.",
          "oneOf": [
            {
              "type": "object",
              "additionalProperties": false,
              "properties": {
                "count": {
                  "type": "integer",
                  "minimum": 0
                },
                "pending": {
                  "type": "integer",
                  "minimum": 0
                },
                "approvedUnexecuted": {
                  "type": "integer",
                  "minimum": 0
                }
              }
            },
            {
              "type": "null"
            }
          ]
        },
        "expired": {
          "description": "What an expireDue step reported (DK-3).",
          "oneOf": [
            {
              "type": "object",
              "additionalProperties": false,
              "properties": {
                "count": {
                  "type": "integer",
                  "minimum": 0
                },
                "more": {
                  "type": "boolean"
                }
              }
            },
            {
              "type": "null"
            }
          ]
        },
        "page": {
          "description": "What a rehydrate step returned (DK-5).",
          "oneOf": [
            {
              "type": "object",
              "additionalProperties": false,
              "properties": {
                "count": {
                  "type": "integer",
                  "minimum": 0
                },
                "more": {
                  "type": "boolean"
                },
                "statuses": {
                  "type": "array",
                  "items": {
                    "type": "string"
                  }
                }
              }
            },
            {
              "type": "null"
            }
          ]
        },
        "found": {
          "description": "Whether the row a get step read was found.",
          "type": "boolean"
        },
        "canonicalHash": {
          "description": "The row's canonical hash (SR-1): the Affidavit and its accepted amendments, taken through the implementation's own exported helper — the value a host's execution grant binds to, as 64 lowercase hex characters.",
          "type": "string",
          "pattern": "^[0-9a-f]{64}$"
        }
      }
    },
    "entryMatcher": {
      "description": "A partial matcher over a Docket row. `status` is the status the row READS (a row past its deadline reads expired whether or not a sweep has run); `attestation` is the attestor, not the whole attestation record; `expiresAtOffsetMs` and `canonicalDiffersFromProposal` are derived facts with no property of their own on the wire.",
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "status": {
          "type": "string",
          "enum": [
            "pending",
            "approved",
            "rejected",
            "expired"
          ]
        },
        "execution": {
          "type": [
            "string",
            "null"
          ],
          "enum": [
            "unexecuted",
            "executed",
            "failed",
            null
          ]
        },
        "executionDetail": {
          "type": [
            "string",
            "null"
          ]
        },
        "requirement": {
          "$ref": "#/$defs/requirementKind"
        },
        "blocked": {
          "$ref": "#/$defs/blocked"
        },
        "toolName": {
          "type": "string"
        },
        "channel": {
          "type": "string"
        },
        "tenantId": {
          "type": "string"
        },
        "conversationId": {
          "type": "string"
        },
        "attestation": {
          "description": "The attestor as it must read (AZ-1, AZ-3), or null for no attestation. This is the attestation record's `by`, not the whole record: the instant and the entry id are checked by the runner on every fixture that states an attestation at all.",
          "$ref": "#/$defs/attestor"
        },
        "decision": {
          "oneOf": [
            {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "kind",
                "reason"
              ],
              "properties": {
                "kind": {
                  "type": "string",
                  "enum": [
                    "approve",
                    "reject"
                  ]
                },
                "reason": {
                  "type": [
                    "string",
                    "null"
                  ]
                }
              }
            },
            {
              "type": "null"
            }
          ]
        },
        "amendments": {
          "oneOf": [
            {
              "$ref": "#/$defs/amendments"
            },
            {
              "type": "null"
            }
          ]
        },
        "preservedAmendments": {
          "description": "The amendments a decision carried AFTER the deadline had passed, with the act that carried them (DK-1).",
          "oneOf": [
            {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "amendments",
                "at",
                "by"
              ],
              "properties": {
                "amendments": {
                  "$ref": "#/$defs/amendments"
                },
                "at": {
                  "$ref": "#/$defs/isoInstant"
                },
                "by": {
                  "type": "string"
                }
              }
            },
            {
              "type": "null"
            }
          ]
        },
        "lineage": {
          "description": "supersedes / supersededBy, where \"@some\" asserts only that the link is present — a fixture cannot state a derived entry id.",
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "supersedes": {
              "type": [
                "string",
                "null"
              ]
            },
            "supersededBy": {
              "type": [
                "string",
                "null"
              ]
            }
          }
        },
        "expiresAtOffsetMs": {
          "description": "The deadline, as milliseconds after the instant the entry was filed (GT-4).",
          "type": "integer"
        },
        "affidavit": {
          "$ref": "#/$defs/affidavitMatcher"
        },
        "amendedAffidavit": {
          "description": "The state an accepted amendment produced, or null while none has (AF-4).",
          "oneOf": [
            {
              "$ref": "#/$defs/affidavitMatcher"
            },
            {
              "type": "null"
            }
          ]
        },
        "canonicalDiffersFromProposal": {
          "description": "Whether the row's canonical form differs from its proposal's (SR-1). true is the substitution guard: a grant minted over the Affidavit a reviewer was shown must not validate the one they amended.",
          "type": "boolean"
        }
      }
    },
    "attestor": {
      "description": "Who agreed (AZ-1, AZ-3). A machine caller can never produce a `member` attestation; the strongest a relayed decision can carry is `member-via-relay`, which names both the person and the relay.",
      "oneOf": [
        {
          "title": "member",
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
              "type": "string"
            }
          }
        },
        {
          "title": "member-via-relay",
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
              "type": "string"
            },
            "relay": {
              "type": "object"
            }
          }
        },
        {
          "title": "standing-order",
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
              "type": "string"
            },
            "version": {
              "type": "string"
            }
          }
        },
        {
          "type": "null"
        }
      ]
    },
    "affidavitMatcher": {
      "description": "A partial matcher over an Affidavit. Stating `fields` asserts the field list exactly, in order (AF-1).",
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "operationType": {
          "type": "string",
          "enum": [
            "create",
            "update"
          ]
        },
        "entityType": {
          "type": "string"
        },
        "entityId": {
          "type": [
            "string",
            "null"
          ]
        },
        "aggregateConfidence": {
          "$ref": "#/$defs/unitInterval"
        },
        "populatedConfidence": {
          "oneOf": [
            {
              "$ref": "#/$defs/unitInterval"
            },
            {
              "type": "null"
            }
          ]
        },
        "emptyFieldCount": {
          "type": "integer",
          "minimum": 0
        },
        "fields": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/fieldMatcher"
          }
        }
      }
    },
    "fieldMatcher": {
      "description": "A partial matcher over one sworn field. `source`, `bound`, `bindingKind` and `priorSources` are projections of the field's provenance chain, not properties of their own.",
      "type": "object",
      "additionalProperties": false,
      "required": [
        "name"
      ],
      "properties": {
        "name": {
          "type": "string"
        },
        "value": {
          "$ref": "#/$defs/jsonValue"
        },
        "previousValue": {
          "$ref": "#/$defs/jsonValue"
        },
        "kind": {
          "type": "string"
        },
        "isMandatory": {
          "type": "boolean"
        },
        "source": {
          "$ref": "#/$defs/provenanceSource"
        },
        "bound": {
          "description": "Whether the tag in force points at something checkable (PV-2, PV-4).",
          "type": "boolean"
        },
        "bindingKind": {
          "oneOf": [
            {
              "$ref": "#/$defs/bindingKind"
            },
            {
              "type": "null"
            }
          ]
        },
        "confidence": {
          "$ref": "#/$defs/unitInterval"
        },
        "priorSources": {
          "description": "The grades the chain displaced, newest first. Nothing is ever dropped from a chain.",
          "type": "array",
          "items": {
            "$ref": "#/$defs/provenanceSource"
          }
        }
      }
    },
    "cardMatcher": {
      "description": "A partial matcher over an Evidence Card. `warningsContain` is a substring assertion over the card's warnings, not a property. `presentation` is the envelope's rendering hints, stated as the WHOLE array and in the card's own order.",
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "requiresConfirmation": {
          "type": "boolean"
        },
        "warningsContain": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "priorAmendments": {
          "oneOf": [
            {
              "$ref": "#/$defs/amendments"
            },
            {
              "type": "null"
            }
          ]
        },
        "blocked": {
          "$ref": "#/$defs/blocked"
        },
        "protocolVersion": {
          "type": "string"
        },
        "aggregateConfidence": {
          "$ref": "#/$defs/unitInterval"
        },
        "populatedConfidence": {
          "oneOf": [
            {
              "$ref": "#/$defs/unitInterval"
            },
            {
              "type": "null"
            }
          ]
        },
        "emptyFieldCount": {
          "type": "integer",
          "minimum": 0
        },
        "fields": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/cardFieldMatcher"
          }
        },
        "presentation": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/cardPresentationMatcher"
          }
        }
      }
    },
    "cardFieldMatcher": {
      "description": "The reviewer-facing shape of one SWORN field on the card, in order: its kind and its value. The closed value set and the input mask are not here: from v0.1 they are presentation and live on the card envelope, which cardPresentationMatcher states.",
      "type": "object",
      "additionalProperties": false,
      "required": [
        "name"
      ],
      "properties": {
        "name": {
          "type": "string"
        },
        "kind": {
          "type": "string"
        },
        "value": {
          "$ref": "#/$defs/jsonValue"
        },
        "isMandatory": {
          "type": "boolean"
        }
      }
    },
    "cardPresentationMatcher": {
      "description": "One of the card envelope's rendering hints: the field it is about, the kind a surface should render, the closed set an amendment input offers, and the pattern that input is masked with. Presentation, never substance - the gate validates no value against either, and nothing here is part of the canonical form a host's execution grant binds to (SR-1). A hint the host did not declare is ABSENT, which is how the wire spells \"render this field from its own kind\".",
      "type": "object",
      "additionalProperties": false,
      "required": [
        "name"
      ],
      "properties": {
        "name": {
          "type": "string"
        },
        "kind": {
          "type": "string"
        },
        "allowedValues": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/jsonValue"
          }
        },
        "pattern": {
          "type": "string"
        }
      }
    }
  }
};

/** `conformance/canonical-vector.schema.json` — what a byte vector says. */
export const canonicalVectorSchema: JsonSchemaDocument = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://affiant.dev/conformance/0.1.0/canonical-vector.schema.json",
  "title": "CanonicalVector",
  "description": "One canonical-serialization byte vector (INVARIANTS.md SR-1). A different document shape from a declarative fixture: an input Affidavit, the amendments accepted on it, the decision they arrived on, and the exact canonical bytes and SHA-256 those produce. Unlike a fixture, the expected values here ARE written by an implementation — a 1,500-byte canonical document typed by hand is a transcription waiting to enshrine a typo. What makes a vector trustworthy is that three paths sharing no code have to agree on it: the implementation, a second canonicalizer written out from the rule, and an off-the-shelf SHA-256. A driver reproduces the bytes and the digest; it does not re-derive them.",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "id",
    "rules",
    "note",
    "input",
    "amendments",
    "reviewerAct",
    "expectedBytesUtf8",
    "expectedSha256"
  ],
  "properties": {
    "id": {
      "description": "A stable id, unique across the set. Cited by name in a parity manifest.",
      "type": "string",
      "pattern": "^canonical/[a-z0-9]+(-[a-z0-9]+)*$"
    },
    "rules": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "string",
        "pattern": "^(AF|PV|GT|DK|AZ|SR|RT|CV|TL)-[0-9]+$"
      }
    },
    "note": {
      "description": "What this vector is about, in prose: which property of the canonical form it stresses and why it is worth a vector of its own.",
      "type": "string",
      "minLength": 1
    },
    "input": {
      "description": "The Affidavit to canonicalise, in the reference implementation's in-memory shape.",
      "type": "object"
    },
    "amendments": {
      "description": "The amendments accepted on the input, or null. A vector with amendments pins the SWORN form — the Affidavit combined with its accepted amendments — which is what a host's execution grant binds to, never the proposal alone.",
      "type": [
        "object",
        "null"
      ]
    },
    "reviewerAct": {
      "description": "The decision the amendments arrived on, or null when there were none. It is part of the canonical input because an amended field's tag names the act that amended it (PV-2).",
      "type": [
        "object",
        "null"
      ]
    },
    "expectedBytesUtf8": {
      "description": "The exact canonical document, as UTF-8 text. Every key sorted by code point at every level, no insignificant whitespace.",
      "type": "string",
      "minLength": 1
    },
    "expectedSha256": {
      "description": "The SHA-256 of those bytes, as 64 lowercase hex characters.",
      "type": "string",
      "pattern": "^[0-9a-f]{64}$"
    }
  }
};

/** `conformance/results.schema.json` — the run document a driver emits. */
export const resultsSchema: JsonSchemaDocument = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://affiant.dev/conformance/0.1.0/results.schema.json",
  "title": "ConformanceRunResult",
  "description": "What one conformance run reports: which implementation was under test, which protocol tag it was run against, and what every fixture in the manifest did. A driver emits this document (conformance/DRIVER.md); the parity manifest (conformance/PARITY.md) is derived from it and CI asserts the two agree. The document is machine-readable on purpose — a run that only printed to a terminal could tell a reader that something failed; it could not produce the list of everything an implementation does not yet pass, which is the document the driver exists to publish.",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "schemaVersion",
    "implementation",
    "protocolTag",
    "producedAt",
    "summary",
    "results"
  ],
  "properties": {
    "schemaVersion": {
      "description": "The version of THIS result format, so a consumer can tell a v0.1 run from a later one.",
      "type": "string",
      "const": "0.1.0"
    },
    "implementation": {
      "description": "What was under test.",
      "type": "object",
      "additionalProperties": false,
      "required": [
        "name",
        "version"
      ],
      "properties": {
        "name": {
          "description": "The implementation's identifier, matching the parity manifest's — \"dotnet\", \"typescript\".",
          "type": "string",
          "pattern": "^[a-z0-9]+(-[a-z0-9]+)*$"
        },
        "version": {
          "description": "The version of the implementation the run exercised — a package version, a release tag, or a commit.",
          "type": "string"
        },
        "commit": {
          "description": "The commit the run was built from, when there is one.",
          "type": "string"
        },
        "runtime": {
          "description": "Where it ran, when an implementation runs on more than one runtime (RT-1): \"node\", \"bun\", \"workerd\", \"net8.0\". A run per runtime, each its own document.",
          "type": "string"
        }
      }
    },
    "protocolTag": {
      "description": "The affiant-protocol tag the fixtures were taken from — the tag the driver pins (DRIVER.md). A result whose tag is not the one the parity manifest names is not a comparison.",
      "type": "string"
    },
    "producedAt": {
      "type": "string",
      "format": "date-time"
    },
    "summary": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "total",
        "passed",
        "failed",
        "errored",
        "skipped"
      ],
      "properties": {
        "total": {
          "type": "integer",
          "minimum": 0
        },
        "passed": {
          "type": "integer",
          "minimum": 0
        },
        "failed": {
          "type": "integer",
          "minimum": 0
        },
        "errored": {
          "type": "integer",
          "minimum": 0
        },
        "skipped": {
          "type": "integer",
          "minimum": 0
        },
        "durationMs": {
          "type": "number",
          "minimum": 0
        }
      }
    },
    "results": {
      "description": "One entry per fixture in conformance/fixtures/MANIFEST.json, section \"conformance\" — every one of them, including the ones that passed. A run that reported only failures could not be checked for completeness.",
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "id",
          "outcome"
        ],
        "properties": {
          "id": {
            "description": "The fixture's id, exactly as the manifest spells it.",
            "type": "string"
          },
          "outcome": {
            "description": "pass — every stated fact held. fail — at least one did not; `diff` says which. error — the driver could not run the fixture at all (a port it cannot supply, a step kind it has not bound, a crash); an error is NOT a pass and NOT a silent skip. skipped — deliberately not run, and only for a reason the parity manifest declares (an exemption inherited from the rulebook, or a runtime claim the implementation does not make).",
            "type": "string",
            "enum": [
              "pass",
              "fail",
              "error",
              "skipped"
            ]
          },
          "diff": {
            "description": "Every stated fact that did not hold, each with the path it was found at and the two values. Present on `fail`; on `error` it may carry the one entry describing what went wrong. A driver that stopped at the first mismatch could tell you a fixture failed; it could not produce the list a parity manifest is derived from.",
            "type": "array",
            "items": {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "at"
              ],
              "properties": {
                "at": {
                  "description": "A dotted path into the expectation — \"entry.status\", \"card.fields[1].kind\".",
                  "type": "string"
                },
                "expected": {
                  "description": "What the fixture said."
                },
                "actual": {
                  "description": "What the implementation did."
                }
              }
            }
          },
          "durationMs": {
            "type": "number",
            "minimum": 0
          },
          "reason": {
            "description": "Why a `skipped` fixture was skipped, or what an `error` was. Free text for a person.",
            "type": "string"
          }
        }
      }
    }
  }
};

/** `conformance/parity/MANIFEST.schema.json` — the parity manifest a run is asserted against. */
export const parityManifestSchema: JsonSchemaDocument = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://affiant.dev/conformance/0.1.0/parity-manifest.schema.json",
  "title": "ParityManifest",
  "description": "One implementation's published, CI-asserted statement of exactly which conformance fixtures it does not pass, and why. The point is that a gap is a published fact with a name, not something a reader has to discover by running the suite. The implementation's CI asserts that the set of failing ids from its own run equals `failing[].id` here EXACTLY — a fixture that starts passing and a fixture that starts failing both fail the build, in either direction, because a manifest that only caught regressions would let a fix rot unrecorded. See conformance/PARITY.md.",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "schemaVersion",
    "implementation",
    "version",
    "protocolTag",
    "producedAt",
    "failing",
    "runtimes",
    "exemptions"
  ],
  "properties": {
    "schemaVersion": {
      "description": "The version of THIS manifest format.",
      "type": "string",
      "const": "0.1.0"
    },
    "implementation": {
      "description": "The implementation this manifest is about — \"dotnet\", \"typescript\". One manifest per implementation, named parity/<implementation>-v<protocol minor>.json.",
      "type": "string",
      "pattern": "^[a-z0-9]+(-[a-z0-9]+)*$"
    },
    "version": {
      "description": "The version of that implementation the run exercised — the package version a reader can install and reproduce this against.",
      "type": "string"
    },
    "protocolTag": {
      "description": "The affiant-protocol tag the fixtures came from. A manifest produced against one tag says nothing about another; a driver bumps its pin and its manifest in the same pull request.",
      "type": "string"
    },
    "producedAt": {
      "type": "string",
      "format": "date-time"
    },
    "runLog": {
      "description": "Where the run that produced this manifest can be read — a path in this repository, or a URL to a CI run. The manifest is the claim; the log is the evidence.",
      "type": "string"
    },
    "failing": {
      "description": "Every fixture the implementation does not pass, by id. EXACTLY these and no others: an empty array is the strongest possible statement and is what a conformant implementation publishes.",
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "id",
          "rules",
          "disposition",
          "detail"
        ],
        "properties": {
          "id": {
            "description": "The fixture id, exactly as conformance/fixtures/MANIFEST.json spells it.",
            "type": "string"
          },
          "rules": {
            "description": "The rulebook ids the fixture checks — copied from the fixture, so a reader sees which rule is unmet without opening it.",
            "type": "array",
            "minItems": 1,
            "items": {
              "type": "string",
              "pattern": "^(AF|PV|GT|DK|AZ|SR|RT|CV|TL)-[0-9]+$"
            }
          },
          "disposition": {
            "description": "What is being done about it. \"fixed\" — corrected in a release that has SHIPPED, which `fixedIn` must name; this row exists because the release under test still fails it. \"planned\" — scheduled for a named release that has not shipped, which `plannedFor` must name. \"fenced\" — the implementation does not do this, and a specific host-side workaround makes it safe, which `fence` must describe; a fence is what is true today, so a fenced row MAY also name the release the fix is scheduled for in `plannedFor`. \"ignored\" — nothing is being done and nothing is scheduled, and `detail` must say why in a sentence a reader can disagree with. There is no fifth value: a failure with no disposition is a failure nobody has looked at, and a schedule that names no release is not a plan.",
            "type": "string",
            "enum": [
              "fixed",
              "planned",
              "fenced",
              "ignored"
            ]
          },
          "detail": {
            "description": "What the implementation does instead, and why it matters — one or two sentences, written for somebody deciding whether to adopt it. Not a stack trace.",
            "type": "string",
            "minLength": 1
          },
          "fixedIn": {
            "description": "The release that corrects it, which must be one that has SHIPPED — a version a reader can install. Required when disposition is \"fixed\", and legal on no other disposition: a correction still to come is `plannedFor`.",
            "type": "string"
          },
          "plannedFor": {
            "description": "The release the fix is scheduled for — a version string, not a date and not \"soon\". Required when disposition is \"planned\". Optional when it is \"fenced\", because a fence describes what is true today and the fix behind it may still be scheduled. Legal on no other disposition: a shipped correction is `fixedIn`, and an \"ignored\" row is by definition scheduled for nothing.",
            "type": "string"
          },
          "fence": {
            "description": "The host-side workaround that contains the gap, named specifically enough to be applied. Required when disposition is \"fenced\".",
            "type": "string"
          },
          "issue": {
            "description": "Where the gap is recorded in the implementation's own issues.",
            "type": "string"
          },
          "oracle": {
            "description": "True when this fixture is on the negative-oracle list (conformance/ORACLE.md) for the release under test — that is, it was EXPECTED to fail here, and its failing is the evidence the fixture is a real test rather than a formality.",
            "type": "boolean"
          }
        },
        "allOf": [
          {
            "if": {
              "properties": {
                "disposition": {
                  "const": "fixed"
                }
              },
              "required": [
                "disposition"
              ]
            },
            "then": {
              "required": [
                "fixedIn"
              ]
            }
          },
          {
            "if": {
              "properties": {
                "disposition": {
                  "const": "planned"
                }
              },
              "required": [
                "disposition"
              ]
            },
            "then": {
              "required": [
                "plannedFor"
              ]
            }
          },
          {
            "if": {
              "properties": {
                "disposition": {
                  "const": "fenced"
                }
              },
              "required": [
                "disposition"
              ]
            },
            "then": {
              "required": [
                "fence"
              ]
            }
          },
          {
            "if": {
              "properties": {
                "disposition": {
                  "enum": [
                    "fixed",
                    "ignored"
                  ]
                }
              },
              "required": [
                "disposition"
              ]
            },
            "then": {
              "not": {
                "required": [
                  "plannedFor"
                ]
              }
            }
          },
          {
            "if": {
              "properties": {
                "disposition": {
                  "enum": [
                    "planned",
                    "fenced",
                    "ignored"
                  ]
                }
              },
              "required": [
                "disposition"
              ]
            },
            "then": {
              "not": {
                "required": [
                  "fixedIn"
                ]
              }
            }
          }
        ]
      }
    },
    "runtimes": {
      "description": "The runtimes this manifest holds for (RT-1). The suite is run on each one and the failing set must be the same on all of them; a fixture that fails on one runtime only is a failing fixture, recorded once, with the runtime named in its detail.",
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "name",
          "claimed"
        ],
        "properties": {
          "name": {
            "description": "The runtime — \"node\", \"bun\", \"workerd\", \"net8.0\".",
            "type": "string"
          },
          "version": {
            "type": "string"
          },
          "claimed": {
            "description": "Whether the implementation CLAIMS this runtime. A runtime it does not claim is not a gap; a runtime it claims and does not run the suite on is.",
            "type": "boolean"
          },
          "note": {
            "type": "string"
          }
        }
      }
    },
    "exemptions": {
      "description": "The rulebook exemptions this implementation inherits — the rules conformance/lint/coverage-exemptions.json excuses from carrying a fixture, restated here so a reader of this document alone knows which rules no fixture in the run covers. Copied, never invented: an implementation cannot exempt itself from a rule.",
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "rule",
          "reason"
        ],
        "properties": {
          "rule": {
            "type": "string",
            "pattern": "^(AF|PV|GT|DK|AZ|SR|RT|CV|TL)-[0-9]+$"
          },
          "until": {
            "description": "The protocol version the exemption holds until, or \"always\".",
            "type": "string"
          },
          "reason": {
            "type": "string",
            "minLength": 1
          },
          "checkedInstead": {
            "description": "What this implementation checks in the fixture's place — the suite, lint or guard that stands in for it.",
            "type": "string"
          }
        }
      }
    },
    "notes": {
      "description": "Anything a reader of this document alone would otherwise have to ask about.",
      "type": "string"
    }
  }
};

/**
 * `conformance/lint/coverage-exemptions.json` — the rules the rulebook excuses from
 * carrying a conformance fixture at this version, each with a reason. A driver
 * **copies** these into its parity manifest and adds what it checks instead; it may
 * not invent one, because exempting yourself from a rule is not a parity report.
 */
export const coverageExemptions = {
  "$note": "Rules exempt from the coverage lint's fixture requirement (INVARIANTS.md, 'Coverage lint'). Each entry names the rule, the version the exemption holds for, and the reason. The lint that reads this file arrives with the v0.1 conformance suite.",
  "protocolVersion": "0.1.0",
  "exemptions": [
    {
      "rule": "SR-5",
      "until": "always",
      "reason": "exempt by construction: the transport is not the protocol; the negative case is the set of host-shaped seed examples no rule cites as a check"
    },
    {
      "rule": "CV-2",
      "until": "0.2.0",
      "reason": "text complete at v0.1; the call-site fixtures arrive with the first adapter"
    },
    {
      "rule": "CV-3",
      "until": "0.2.0",
      "reason": "text complete at v0.1; the delegation fixtures arrive with the first adapter"
    },
    {
      "rule": "CV-5",
      "until": "0.2.0",
      "reason": "text complete at v0.1; an adapter documentation lint arrives with the first adapter"
    },
    {
      "rule": "AF-5",
      "until": "always",
      "reason": "a schema-level rule: checked by the schema lint over the tool-result fixtures and a type-level suite, not by a declarative gate fixture"
    },
    {
      "rule": "SR-3",
      "until": "always",
      "reason": "a schema-level rule: checked by the schema lint over every fixture"
    },
    {
      "rule": "RT-1",
      "until": "always",
      "reason": "a runtime rule: checked by the three-runtime CI matrix and a no-Node-types type-check of the core sources"
    },
    {
      "rule": "RT-2",
      "until": "always",
      "reason": "a runtime rule: checked by a budget suite on the implementation's own CI"
    },
    {
      "rule": "RT-3",
      "until": "always",
      "reason": "a runtime rule: checked by a source lint that fails the build"
    },
    {
      "rule": "TL-1",
      "until": "always",
      "reason": "a registry rule: checked by the registry-integrity suite and by every fixture that asserts telemetry"
    },
    {
      "rule": "TL-2",
      "until": "always",
      "reason": "a registry rule: checked by the attribute-name suite against the published standards"
    }
  ]
} as const;
