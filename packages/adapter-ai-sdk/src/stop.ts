/**
 * The stop condition: an agent loop ends once an Affidavit has been filed.
 *
 * **Rules served: AZ-5** (the Docket row is the record of approval authority, so the
 * loop stops at the filing rather than carrying a pretend approval forward), **AZ-7**
 * (the framework never performs the write — there is nothing for the model to do
 * after a filing but wait for a person).
 *
 * ## Why stop at all
 *
 * The SDK's loop ends on its own when a tool has no `execute`, when approval is
 * requested, or when the model stops calling tools. A gated write tool trips none of
 * those: it has an `execute`, it requests no approval, and it hands the model a
 * result the model may well want to keep working from. Left alone the model would
 * carry on as though the write had happened, and the next tool call would be built on
 * a write that is still sitting on a Docket waiting for a person.
 *
 * So the filing is the end of the turn. A person decides on the Docket; a host's
 * executor runs the approved row; a later turn tells the model what became of it.
 *
 * @packageDocumentation
 */

import type { StopCondition, ToolSet } from "ai";

/** Whether `output` is a gated result that says an Affidavit was filed. */
function isFiling(output: unknown): boolean {
  if (typeof output !== "object" || output === null) return false;
  const result = output as { readonly kind?: unknown; readonly entryId?: unknown };
  return result.kind === "write" && typeof result.entryId === "string";
}

/**
 * A `StopCondition` that holds as soon as the step just finished contains a filing.
 *
 * Pass it as `stopWhen` to `generateText`, `streamText` or a `ToolLoopAgent`. It is
 * matched on the tool's **own** result — the full gated result, not the summary the
 * model was shown — so a model that describes a filing in prose does not end the loop
 * and a filing the model never mentions does.
 *
 * It composes: `stopWhen: [stopWhenFiled(), stepCountIs(8)]` stops at whichever comes
 * first, and a host that wants the loop to continue past a filing simply does not
 * pass it.
 */
export function stopWhenFiled(): StopCondition<ToolSet> {
  return ({ steps }) => {
    const last = steps[steps.length - 1];
    if (last === undefined) return false;
    return last.toolResults.some((result) => isFiling(result.output));
  };
}
