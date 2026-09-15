/**
 * What the compiler has to say about the published surface.
 *
 * Not a runtime suite — `vitest.config.ts` collects `test/**\/*.test.ts` and this file
 * is not one. `tsconfig.test.json` checks it, and a `@ts-expect-error` that stops being
 * an error fails that check, which is the assertion.
 */

import type { ToolDefinition } from "@affiant/core";

import { affiantTools, affiantToolsContext, stopWhenFiled } from "../src/index.js";
import type { AffiantToolDefinition } from "../src/index.js";

declare const gate: import("@affiant/core").Gate;
declare const ctx: import("@affiant/core").TurnContext;

// A host's own list, typed with the core's default generics, goes in without a cast.
declare const definitions: readonly ToolDefinition[];
const fromDefaults = affiantTools(gate, definitions);

// So does a list of concretely typed definitions.
declare const concrete: readonly ToolDefinition<{ readonly priority: string }, string>[];
affiantTools(gate, concrete);

// And so does the adapter's own extension of the shape.
declare const extended: readonly AffiantToolDefinition[];
affiantTools(gate, extended);

// The returned set is an ordinary `ToolSet` wherever one is wanted.
affiantToolsContext(ctx, fromDefaults);
stopWhenFiled();

// AZ-5: the SDK's approval flag is not settable on an adapter-built tool. The objects
// are frozen as well, so this holds at run time too — `test/hardening.test.ts`.
const entry = fromDefaults["update_ticket"];
if (entry !== undefined) {
  // @ts-expect-error needsApproval is not assignable on an adapter-built tool (AZ-5).
  entry.needsApproval = true;
}
