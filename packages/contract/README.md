# @affiant/contract

The [Affiant](https://affiant.dev) wire format as TypeScript types, plus the JSON
Schemas and the whole conformance suite as importable objects — pinned to one ref of
the protocol rulebook,
[Sakwala/affiant-protocol](https://github.com/Sakwala/affiant-protocol).

Affiant turns every database write an LLM agent proposes into an **Affidavit**: a
per-field evidence record carrying the proposed value, the value it replaces, where
each value came from and how confident the producer is. An Affidavit is filed under
a **Docket** entry and shown to a person as an **Evidence Card**, which they
approve, amend or reject before the host commits anything.

This package is types and data. It has no runtime dependencies and does nothing at
import time.

> **Not on npm yet.** It lives in this repository and is consumed through the
> workspace. Publishing is a separate, deliberate step.

## Pinned protocol version

`0.1.0` — the first version of the wire that was _designed_, rather than a
description of what one implementation happened to send. The ref it is pinned to is
in [`protocol/PIN`](protocol/PIN).

That ref is the rulebook's **`v0.1.0`** tag. It may also be a full commit, which is
what it holds while a version's text is on the rulebook's default branch and its tag
has not been cut: a commit is as immutable as a tag and, unlike a tag, cannot be
moved under a running build.

Everything under `protocol/` is a byte-for-byte copy at that ref — 176 documents:

| Path                                                     | What it is                                                                                     |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `protocol/schemas/`                                      | the 21 v0.1 JSON Schemas                                                                       |
| `protocol/schemas/seed/`                                 | the 8 superseded `0.0.1-seed` schemas, kept because a shipped framework still sends that shape |
| `protocol/fixtures/v0.1/`                                | 46 positive and 23 negative per-schema fixtures                                                |
| `protocol/fixtures/{gate,decide,sequence-a,sequence-c}/` | the 56 promoted conformance fixtures                                                           |
| `protocol/fixtures/canonical/`                           | the 7 canonical byte vectors (SR-1)                                                            |
| `protocol/fixtures/wire/`                                | the 8 seed wire examples                                                                       |
| `protocol/conformance/`                                  | the four formats a driver reads, and the coverage-exemption list it copies                     |

`test/protocol-pin.test.ts` checksums every copy against
[`protocol/SHA256SUMS`](protocol/SHA256SUMS), and separately fetches the pinned ref
itself — as one archive, retried on a transient network failure — and compares
every copy against it byte for byte. A mismatch, a missing file, or a network that
still cannot be reached after retrying all fail that test; none of them skip it,
because this is a merge-blocking check and a skip would let ref drift merge
unnoticed. `test/generated.test.ts` then asserts that `src/schemas.ts`,
`src/conformance.ts` and `test/fixtures.generated.ts`, the three committed
generated modules, are exactly what those copies say they should be.

### What changed from the seed

The `0.0.1-seed` set describes the wire the shipped .NET framework sends, and the
two are deliberately not compatible. In v0.1: every envelope carries
`protocolVersion` (SR-4); the Affidavit carries all three of AF-2's confidence
numbers and the operation's **shape** (`create` | `update`) rather than the host's
verb (AF-3); per-field `allowedValues` and `pattern`, the `warnings` and
`requiresConfirmation` all move onto the card envelope, because the canonical form a
host's execution grant binds to is defined over the Affidavit and its accepted
amendments and nothing else (SR-1); `kind` is the discriminator on every union
(AF-5); and a provenance tag gains `at` and `binding` and renames `evidence` to
`note` (PV-1, PV-2).

The `Seed*` types name the superseded shape for a host translating at its own
boundary. `@affiant/core`'s `fromWire` **refuses** a seed payload rather than
guessing at a conversion: it is a different document, not a subset, and reading it
as this one would produce a record that swore to things nobody said.

## Using it

```ts
import type { EvidenceCardRequest, ProvenanceSource } from "@affiant/contract";
import { PROTOCOL_VERSION, PROVENANCE_SOURCES, isProvenanceSource } from "@affiant/contract";

function render(request: EvidenceCardRequest): void {
  for (const field of request.affidavit.fields) {
    const tag = field.provenance.current;
    console.log(field.name, tag.source, tag.confidence, field.previousValue);
  }
}
```

The schemas, for validating a payload yourself:

```ts
import { allSchemas, schemasByPath, schemasById } from "@affiant/contract/schemas";
import { Ajv2020 } from "ajv/dist/2020.js";

const ajv = new Ajv2020({ strict: true });
ajv.addSchema(allSchemas); // registers each by its own $id, so the $refs resolve
const validate = ajv.getSchema(
  "https://affiant.dev/schemas/0.1.0/evidence-card-request.schema.json",
);
```

Nothing is served from `affiant.dev/schemas/` yet: an `$id` here is an identifier
that makes the `$ref`s between these files resolve inside a validator that has
loaded them, not a URL a validator can fetch. Register them all rather than relying
on the network. The superseded set is `allSeedSchemas`, whose `$id`s carry
`0.0.1-seed`, so both versions can be registered with one validator.

The conformance suite, for running it against something:

```ts
import {
  PROTOCOL_PIN,
  canonicalVectors,
  conformanceFixtures,
  conformanceManifest,
} from "@affiant/contract/conformance";
```

A module rather than the JSON directly because the suite has to run inside workerd,
which has no filesystem, and JSON module support differs across the three runtimes
this package supports. [`@affiant/conformance-driver`](../conformance-driver) is
what runs it against `@affiant/core`.

The vendored JSON itself is shipped and reachable, for a host that would rather
read the files than import the objects — a validator in another language, a build
step that copies them, a checksum audit:

```ts
import affidavit from "@affiant/contract/protocol/schemas/affidavit.schema.json" with { type: "json" };

// or, to hand the path to something that is not an ES module loader:
const path = import.meta.resolve("@affiant/contract/protocol/fixtures/MANIFEST.json");
```

Every file under `protocol/` resolves this way, `protocol/PIN` and
`protocol/SHA256SUMS` included.

## Three rules the types follow

All three come from the schemas rather than from taste, and all three are asserted
in `test/types.test-d.ts`:

- **Absent means `null`, never `undefined`.** The wire spells an absent optional
  value as an explicit `null`, so almost no property is optional. A type that made
  `priorAmendments` optional would let a producer omit the key and still compile,
  and the payload would fail validation at the far end of a network hop.
- **Arrays are never null.** Where a schema says an array is not nullable, an empty
  array is what an empty collection looks like.
- **Four places are genuinely optional**, and each is a property that is meaningful
  only sometimes rather than a value that is sometimes missing: the
  non-discriminator properties of a union arm, the three properties of an
  `external-ref` binding a source either supports or does not, a
  `computation-ref`'s published constant, and the card envelope's `presentation` and
  `warnings`. Nothing swears to a presentation slot, so a producer with nothing to
  say says nothing rather than saying `null`.

## What is protocol and what is not

`Affidavit`, `AffidavitField`, `ProvenanceTag`, `ProvenanceChain`,
`ProvenanceSource`, `Binding`, `Money`, `EntityRef`, `Operation`, `ErrorCode`,
`Attestation`, `OutsideGateMarker`, `BlockedMarker`, `DocketEntry`, `AmendmentMap`,
`EvidenceCardRequest`, `FieldPresentation`, `ToolResult`, `DecisionResult`,
`Notification` and `TelemetryKeyRegistry` are protocol core: each has a schema at
the pinned ref, and one positive and one negative fixture pinned to it.

`ActionDecisionResult`, `ActionStatus`, `SessionRehydrated`, `SystemNotification`
and `UiGuidance` are **host and transport shapes**, not protocol core. They are how
one shipped host talks to its own client, recorded in the protocol's fixtures as
reference shapes. They carry no schema, so nothing validates them, and a different
host is free to use a different vocabulary. Their doc comments say so.

The `Seed*` types are the superseded `0.0.1-seed` wire, kept for a host translating
at its own boundary. A v0.1 producer never emits one.

## Runtimes

The types and the fixture suite are exercised on Node 22, Bun and Cloudflare
workerd in CI. See [CONTRIBUTING.md](../../CONTRIBUTING.md) for how to run each.

## Licence

Apache-2.0.
