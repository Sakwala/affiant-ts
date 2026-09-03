// @vitest-environment node
import { describe, expect, it } from "vitest";

/**
 * The package has to be importable where there is no DOM.
 *
 * `import "@affiant/evidence-card/register"` used to throw
 * `ReferenceError: HTMLElement is not defined` while the module was still being
 * evaluated — `class AffiantEvidenceCard extends HTMLElement` at module scope —
 * so the `typeof customElements !== "undefined"` guard in `register.ts` could
 * never run and a Next.js or Remix server render crashed on the import.
 *
 * This file runs under the `node` environment rather than the happy-dom one the
 * rest of the suite uses, so `HTMLElement`, `customElements` and `document` are
 * all absent — the same globals a server render has.
 */
describe("importing the package without a DOM", () => {
  it("has no DOM to speak of", () => {
    expect(typeof HTMLElement).toBe("undefined");
    expect(typeof customElements).toBe("undefined");
    expect(typeof document).toBe("undefined");
  });

  it("does not throw from the side-effect entry point", async () => {
    await expect(import("../src/register.js")).resolves.toBeDefined();
  });

  it("does not throw from the main entry point either, and still exports the class", async () => {
    const { AffiantEvidenceCard, EVIDENCE_CARD_TAG_NAME } = await import("../src/index.js");

    expect(typeof AffiantEvidenceCard).toBe("function");
    expect(EVIDENCE_CARD_TAG_NAME).toBe("affiant-evidence-card");
  });
});
