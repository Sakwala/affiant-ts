# @affiant/contract

The [Affiant](https://affiant.dev) wire format as TypeScript types, plus the JSON
Schemas themselves as importable objects — pinned to one git tag of the protocol
rulebook, [Sakwala/affiant-protocol](https://github.com/Sakwala/affiant-protocol).

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

`0.0.1-seed` — the tag `v0.0.1-seed` of `Sakwala/affiant-protocol`, recorded in
[`protocol/PIN`](protocol/PIN). Everything under `protocol/` is a byte-for-byte
copy of that tag: the eight JSON Schemas, the eight conformance fixtures, the
manifest and the pinned enum sets. `test/protocol-pin.test.ts` checksums every
copy against [`protocol/SHA256SUMS`](protocol/SHA256SUMS) on every run — offline
included — and fetches the same files from the tag itself whenever the network is
reachable. `test/generated.test.ts` then asserts that `src/schemas.ts` and
`test/fixtures.generated.ts`, the two committed generated modules, are exactly
what those copies say they should be.

The seed fixtures are hand-authored examples of what one shipped implementation
sends, not captures: their key sets — not their values — are asserted against the
shipped .NET serializer by the demo hosts' wire-shape tests. It is a seed, not a
designed protocol version. Types here are faithful to those examples and say so,
per type, in their doc comments.

The pinned tag `v0.0.1-seed` predates that correction, so its
`protocol/fixtures/MANIFEST.json` still spells the field `capturedFrom`; the next
tag renames it `derivedFrom`.

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
  "https://affiant.dev/schemas/0.0.1-seed/evidence-card-request.schema.json",
);
```

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

## Two rules the types follow

Both come from the schemas rather than from taste, and both are asserted in
`test/types.test-d.ts`:

- **Absent means `null`, never `undefined`.** The wire spells an absent optional
  value as an explicit `null`, so no property is optional. A type that made
  `priorAmendments` optional would let a producer omit the key and still compile,
  and the payload would fail validation at the far end of a network hop.
- **Arrays are never null.** Where a schema says an array is not nullable, an empty
  array is what an empty collection looks like.

## What is protocol and what is not

`Affidavit`, `AffidavitField`, `ProvenanceTag`, `ProvenanceChain`,
`ProvenanceSource`, `EvidenceCardRequest`, `DocketExpiringNotification` and
`DocketExpiredNotification` are protocol core: each has a schema at the pinned tag.

`ActionDecisionResult`, `SessionRehydrated`, `SystemNotification` and `UiGuidance`
are **host and transport shapes**, not protocol core. They are how one shipped host
talks to its own client, recorded in the protocol's fixtures as reference shapes.
They carry no schema at this tag, so nothing validates them, and a different host
is free to use a different vocabulary. Their doc comments say so.

## Runtimes

The types and the fixture suite are exercised on Node 22, Bun and Cloudflare
workerd in CI. See [CONTRIBUTING.md](../../CONTRIBUTING.md) for how to run each.

## Licence

Apache-2.0.
