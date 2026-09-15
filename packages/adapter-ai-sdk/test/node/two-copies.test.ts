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
 * The second copy here is the built `dist/`, loaded as its own module instance: it is a
 * different set of function objects and a different context-schema object, which is
 * exactly the situation being tested.
 *
 * The specifier is **computed at run time** and the module comes back as `unknown`, so
 * the type-check program does not depend on the build having happened — `pnpm
 * typecheck` runs before `pnpm build` in CI, and a static `import("../../dist/…")`
 * would make this file unresolvable there. When `dist/` is absent the suite prints why
 * and skips, the same way the packed-consumer suite does.
 *
 * Node-only: it loads a build artefact by path. Excluded from the workerd run by
 * `vitest.workers.config.ts`.
 */

import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

import { affiantTools, affiantToolsContext, TURN_CONTEXT_SCHEMA } from "../../src/index.js";
import { testGate, turnContext, writeTool } from "../support.js";

/** The part of the published surface this suite calls on the second copy. */
interface SecondCopy {
  readonly affiantTools: typeof affiantTools;
  readonly affiantToolsContext: typeof affiantToolsContext;
  readonly TURN_CONTEXT_SCHEMA: unknown;
}

const distEntry = fileURLToPath(new URL("../../dist/index.js", import.meta.url));
const built = existsSync(distEntry);
if (!built) {
  console.warn(
    "two-copies: skipped — packages/adapter-ai-sdk/dist is not built, so there is no " +
      "second copy of the package to load. Run `pnpm build` first.",
  );
}

/** The built package, loaded as a module instance of its own. */
async function secondCopy(): Promise<SecondCopy> {
  // The specifier is a value, not a literal: `tsc` has nothing to resolve here, which
  // is what keeps this file type-checkable before the build has run.
  const specifier: string = pathToFileURL(distEntry).href;
  const loaded: unknown = await import(/* @vite-ignore */ specifier);
  return loaded as SecondCopy;
}

describe.skipIf(!built)("a tool set built by a second copy of the package", () => {
  it("is recognised by this copy, and this copy's set by it", async () => {
    const second = await secondCopy();

    // Genuinely two module instances, not the same one twice.
    expect(second.affiantTools).not.toBe(affiantTools);
    expect(second.TURN_CONTEXT_SCHEMA).not.toBe(TURN_CONTEXT_SCHEMA);
    expect(second.TURN_CONTEXT_SCHEMA).toEqual(TURN_CONTEXT_SCHEMA);

    const gate = testGate();
    const ctx = turnContext();

    const theirs = second.affiantTools(gate, [writeTool()]);
    expect(Object.keys(affiantToolsContext(ctx, theirs))).toEqual(["update_ticket"]);

    const ours = affiantTools(gate, [writeTool()]);
    expect(Object.keys(second.affiantToolsContext(ctx, ours))).toEqual(["update_ticket"]);
  });

  it("still refuses a set holding two gates' tools when the copies are mixed", async () => {
    const second = await secondCopy();

    const mine = affiantTools(testGate(), [writeTool({ name: "update_ticket" })]);
    const theirs = second.affiantTools(testGate(), [writeTool({ name: "update_invoice" })]);

    expect(() => affiantToolsContext(turnContext(), { ...mine, ...theirs })).toThrow(
      /two different gates/,
    );
  });
});
