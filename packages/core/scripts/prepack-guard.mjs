#!/usr/bin/env node
/**
 * The publishing gate, as a script rather than a paragraph.
 *
 * `@affiant/core` claims to be the same framework as the .NET packages, held
 * equivalent by the rulebook at https://github.com/Sakwala/affiant-protocol. Two
 * things had to exist before that claim was checkable by somebody who did not write
 * either implementation: a **public parity report** naming, fixture by fixture, what
 * each implementation does not yet pass, and a **conformance driver** that runs the
 * shared fixture suite against this package and blocks a merge when it fails. Both
 * are now facts, not promises:
 *
 *   - the .NET parity report is public in the rulebook, beside the fixtures, under
 *     conformance/parity/dotnet-v0.1.json at the tag this implementation is pinned to
 *     (the oracle run log is alongside it, under conformance/results/)
 *   - this repository's conformance driver is green on Node, Bun and workerd, and
 *     the `conformance` job is required on `main`: see
 *     packages/conformance-driver/conformance/parity/typescript-v0.1.json, which
 *     records `"failing": []`
 *
 * The tag is **read from that manifest** rather than repeated here. It has moved once
 * already — v0.1.0 to v0.1.3 — and a literal in this file went stale without anything
 * failing, because nothing compares a sentence to a JSON file.
 *
 * `@affiant/core` went to npm on that basis, on 2026-09-06 at `0.1.0-alpha.0`, under
 * the `alpha` dist-tag and with a provenance attestation.
 *
 * The claim stays enforced where publishing actually happens, and a publish stays
 * something a person dispatched rather than something a script did. `prepack` runs
 * before `npm pack` and before `npm publish`, and this exits non-zero, which stops
 * both, until `AFFIANT_ALLOW_PUBLISH=1` is set — the deliberate override, which
 * nothing but the hand-dispatched publish workflow sets.
 *
 * Usage:
 *
 *   npm pack --dry-run                          refused, with the reason
 *   AFFIANT_ALLOW_PUBLISH=1 npm pack --dry-run  allowed
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

if (process.env["AFFIANT_ALLOW_PUBLISH"] === "1") {
  console.log("AFFIANT_ALLOW_PUBLISH=1: packing @affiant/core.");
  process.exit(0);
}

/** The manifest this message is about, in the sibling package that produces it. */
const manifestFile = fileURLToPath(
  new URL("../../conformance-driver/conformance/parity/typescript-v0.1.json", import.meta.url),
);

/** The protocol tag the committed manifest names, or `null` when it cannot be read. */
function protocolTag() {
  try {
    const manifest = JSON.parse(readFileSync(manifestFile, "utf8"));
    return typeof manifest.protocolTag === "string" ? manifest.protocolTag : null;
  } catch {
    return null;
  }
}

const tag = protocolTag();
const dotnetReport =
  tag === null
    ? "  https://github.com/Sakwala/affiant-protocol/tree/main/conformance/parity/dotnet-v0.1.json\n"
    : `  https://github.com/Sakwala/affiant-protocol/blob/${tag}/conformance/parity/dotnet-v0.1.json\n`;
const againstTag =
  tag === null
    ? '  records "failing": [] (the tag it records could not be read from the manifest).\n' +
      "  0.1.0-alpha.0 went to npm\n"
    : `  records "failing": [] against "protocolTag": "${tag}". 0.1.0-alpha.0 went to npm\n`;

console.error(
  "@affiant/core is published deliberately, never as a side effect: packing and publishing are refused unless AFFIANT_ALLOW_PUBLISH=1 is set",
);
console.error(
  "  The .NET parity report is public in the rulebook:\n" +
    dotnetReport +
    "  (the oracle run log sits beside it, under conformance/results/). This\n" +
    "  repository's conformance driver is green on Node, Bun and workerd and required\n" +
    "  by branch protection: packages/conformance-driver/conformance/parity/typescript-v0.1.json\n" +
    againstTag +
    "  on 2026-09-06 on that basis, from .github/workflows/publish.yml, which is the only\n" +
    "  thing that sets the override.\n" +
    "  To pack or publish anyway, set AFFIANT_ALLOW_PUBLISH=1.",
);
process.exit(1);
