/**
 * Recognition across two copies of this package.
 *
 * A host on one version and a library on another put two copies of
 * `@affiant/adapter-ai-sdk` in one dependency tree. Neither can vouch for the other's
 * tools: what makes an object a gated tool is that *this* copy built it, and each copy
 * keeps its own register of what it built. What the second copy's `affiantToolsContext`
 * must not do is return an empty map — the generation would then run with no context
 * and every call would be refused for a reason that reads like the host's mistake. So
 * it **refuses by name**, and says the tool came from somewhere it cannot vouch for.
 *
 * The registered symbol (`Symbol.for`) is what makes that message possible: both copies
 * read the same key, so the second one can tell "a tool of this package's, built
 * elsewhere" from "a tool of the host's own". It is the diagnostic, not the credential.
 *
 * The second copy here is the built `dist/`, loaded as its own module instance: a
 * different set of function objects, a different context-schema object and a different
 * register, which is exactly the situation being tested.
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

import type { AffiantError } from "@affiant/core";
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
  it("is refused by this copy, by name, and this copy's set by it", async () => {
    const second = await secondCopy();

    // Genuinely two module instances, not the same one twice.
    expect(second.affiantTools).not.toBe(affiantTools);
    expect(second.TURN_CONTEXT_SCHEMA).not.toBe(TURN_CONTEXT_SCHEMA);
    expect(second.TURN_CONTEXT_SCHEMA).toEqual(TURN_CONTEXT_SCHEMA);

    const gate = testGate();
    const ctx = turnContext();

    const theirs = second.affiantTools(gate, [writeTool()]);
    expect(() => affiantToolsContext(ctx, theirs)).toThrow(/is not an object this copy/);

    const ours = affiantTools(gate, [writeTool()]);
    expect(() => second.affiantToolsContext(ctx, ours)).toThrow(/is not an object this copy/);
  });

  it("names the tool, so the message is about that entry and not the whole set", async () => {
    const second = await secondCopy();
    const theirs = second.affiantTools(testGate(), [writeTool({ name: "update_invoice" })]);

    const failure = (() => {
      try {
        affiantToolsContext(turnContext(), theirs);
        return null;
      } catch (error) {
        return error;
      }
    })();

    expect((failure as AffiantError).code).toBe("wireup-invalid");
    expect((failure as AffiantError).details["toolName"]).toBe("update_invoice");
    // The set did not come from this copy either, so the message points at the second
    // copy's own `affiantToolsContext` rather than at a replaced entry.
    expect((failure as AffiantError).message).toContain("second copy of this package");
  });

  it("refuses a mixed set on the copy before it ever reaches the two-gates check", async () => {
    const second = await secondCopy();

    const mine = affiantTools(testGate(), [writeTool({ name: "update_ticket" })]);
    const theirs = second.affiantTools(testGate(), [writeTool({ name: "update_invoice" })]);

    const failure = (() => {
      try {
        affiantToolsContext(turnContext(), { ...mine, ...theirs });
        return null;
      } catch (error) {
        return error;
      }
    })();

    // `update_ticket` is this copy's and passes; `update_invoice` is not, and that is
    // the refusal — the two-gates check never gets a chance to speak.
    expect((failure as AffiantError).details["toolName"]).toBe("update_invoice");
    expect((failure as AffiantError).message).toContain("is not an object this copy");
  });
});
