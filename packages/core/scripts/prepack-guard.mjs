#!/usr/bin/env node
/**
 * The publishing gate, as a script rather than a paragraph.
 *
 * `@affiant/core` claims to be the same framework as the .NET packages, held
 * equivalent by the rulebook at https://github.com/Sakwala/affiant-protocol. Two
 * things have to exist before that claim is checkable by somebody who did not write
 * either implementation: a **public parity report** naming, fixture by fixture, what
 * each implementation does not yet pass, and a **conformance driver** that runs the
 * shared fixture suite against this package and blocks a merge when it fails.
 * Until both are green, a tarball on npm would be a claim with nothing behind it.
 *
 * So the claim is enforced where publishing actually happens. `prepack` runs before
 * `npm pack` and before `npm publish`, and this exits non-zero, which stops both.
 * `AFFIANT_ALLOW_PUBLISH=1` is the deliberate override, for the release that comes
 * after the two conditions are met.
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
  "@affiant/core is not published until the parity report and the conformance driver are green",
);
console.error(
  "  The parity report is the public, per-implementation list of conformance fixtures each\n" +
    "  implementation does not yet pass; the conformance driver runs that suite against this\n" +
    "  package and blocks a merge when it fails. Both are recorded at\n" +
    "  https://github.com/Sakwala/affiant-protocol.\n" +
    "  To pack or publish anyway, set AFFIANT_ALLOW_PUBLISH=1.",
);
process.exit(1);
