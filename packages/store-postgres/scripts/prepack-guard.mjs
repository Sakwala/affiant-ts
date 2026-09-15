#!/usr/bin/env node
/**
 * The publishing gate, as a script rather than a paragraph.
 *
 * A publish of this package is something a person dispatched, not something a script
 * did. `prepack` runs before `npm pack` and before `npm publish`, and this exits
 * non-zero — which stops both — until `AFFIANT_ALLOW_PUBLISH=1` is set. That is the
 * deliberate override, and nothing but the hand-dispatched publish workflow sets it.
 *
 * Usage:
 *
 *   npm pack --dry-run                          refused, with the reason
 *   AFFIANT_ALLOW_PUBLISH=1 npm pack --dry-run  allowed
 */
if (process.env["AFFIANT_ALLOW_PUBLISH"] === "1") {
  console.log("AFFIANT_ALLOW_PUBLISH=1: packing @affiant/store-postgres.");
  process.exit(0);
}

console.error(
  "@affiant/store-postgres is not packed or published by an ordinary command.\n" +
    "Set AFFIANT_ALLOW_PUBLISH=1 to override; the publish workflow is the only thing that does.",
);
process.exit(1);
