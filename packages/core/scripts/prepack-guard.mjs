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
 *   - the .NET parity report is public in the rulebook, at
 *     https://github.com/Sakwala/affiant-protocol/blob/v0.1.0/conformance/parity/dotnet-v0.1.json
 *     (the oracle run log is alongside it, under conformance/results/)
 *   - this repository's conformance driver is green on Node, Bun and workerd, and
 *     the `conformance` job is required on `main`: see
 *     packages/conformance-driver/conformance/parity/typescript-v0.1.json, which
 *     records `"failing": []` against `"protocolTag": "v0.1.0"`
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
if (process.env["AFFIANT_ALLOW_PUBLISH"] === "1") {
  console.log("AFFIANT_ALLOW_PUBLISH=1: packing @affiant/core.");
  process.exit(0);
}

console.error(
  "@affiant/core is published deliberately, never as a side effect: packing and publishing are refused unless AFFIANT_ALLOW_PUBLISH=1 is set",
);
console.error(
  "  The .NET parity report is public in the rulebook:\n" +
    "  https://github.com/Sakwala/affiant-protocol/blob/v0.1.0/conformance/parity/dotnet-v0.1.json\n" +
    "  (the oracle run log sits beside it, under conformance/results/). This\n" +
    "  repository's conformance driver is green on Node, Bun and workerd and required\n" +
    "  by branch protection: packages/conformance-driver/conformance/parity/typescript-v0.1.json\n" +
    '  records "failing": [] against "protocolTag": "v0.1.0". 0.1.0-alpha.0 went to npm\n' +
    "  on 2026-09-06 on that basis, from .github/workflows/publish.yml, which is the only\n" +
    "  thing that sets the override.\n" +
    "  To pack or publish anyway, set AFFIANT_ALLOW_PUBLISH=1.",
);
process.exit(1);
