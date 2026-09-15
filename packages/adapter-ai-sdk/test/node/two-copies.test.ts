/**
 * Recognition across two copies of this package.
 *
 * A host on one version and a library on another put two copies of
 * `@affiant/adapter-ai-sdk` in one dependency tree, and a tool set built by either has
 * to be recognised by either — otherwise `affiantToolsContext` returns an empty map,
 * the generation runs with no context, and every call is refused for a reason that has
 * nothing to do with the host's wiring.
 *
 * So recognition rests on a **registered symbol** (`Symbol.for`), which two copies
 * resolve to the same value, and not on the identity of any object either copy holds.
 * The second copy here is the built `dist/`, imported as its own module instance: it is
 * a different set of function objects and a different context-schema object, which is
 * exactly the situation being tested.
 *
 * Node-only: it imports a build artefact by path. Excluded from the workerd run by
 * `vitest.workers.config.ts`.
 */

import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { affiantTools, affiantToolsContext } from "../../src/index.js";
import { testGate, turnContext, writeTool } from "../support.js";

const distEntry = fileURLToPath(new URL("../../dist/index.js", import.meta.url));
const built = existsSync(distEntry);

describe.skipIf(!built)("a tool set built by a second copy of the package", () => {
  it("is recognised by this copy, and this copy's set by it", async () => {
    const second = (await import("../../dist/index.js")) as typeof import("../../src/index.js");

    // Genuinely two module instances, not the same one twice.
    expect(second.affiantTools).not.toBe(affiantTools);
    expect(second.TURN_CONTEXT_SCHEMA).not.toBe(
      (await import("../../src/index.js")).TURN_CONTEXT_SCHEMA,
    );

    const gate = testGate();
    const ctx = turnContext();

    const theirs = second.affiantTools(gate, [writeTool()]);
    expect(Object.keys(affiantToolsContext(ctx, theirs))).toEqual(["update_ticket"]);

    const ours = affiantTools(gate, [writeTool()]);
    expect(Object.keys(second.affiantToolsContext(ctx, ours))).toEqual(["update_ticket"]);
  });

  it("still refuses a set holding two gates' tools when the copies are mixed", async () => {
    const second = (await import("../../dist/index.js")) as typeof import("../../src/index.js");

    const mine = affiantTools(testGate(), [writeTool({ name: "update_ticket" })]);
    const theirs = second.affiantTools(testGate(), [writeTool({ name: "update_invoice" })]);

    expect(() => affiantToolsContext(turnContext(), { ...mine, ...theirs })).toThrow(
      /two different gates/,
    );
  });
});
