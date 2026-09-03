/**
 * Side-effect entry point: defines `<affiant-evidence-card>` in the global custom
 * element registry, once, and never throws if something already claimed the name.
 *
 * ```ts
 * import "@affiant/evidence-card/register";
 * ```
 *
 * Importing this is safe where there is no DOM — a server-side render, a bundler,
 * a Node test. Without `HTMLElement` and `customElements` there is nothing to
 * register, so it registers nothing and returns; the element defines itself when
 * the same bundle reaches a browser.
 */
import { AffiantEvidenceCard, EVIDENCE_CARD_TAG_NAME } from "./element.js";

if (
  typeof HTMLElement !== "undefined" &&
  typeof customElements !== "undefined" &&
  customElements.get(EVIDENCE_CARD_TAG_NAME) === undefined
) {
  customElements.define(EVIDENCE_CARD_TAG_NAME, AffiantEvidenceCard);
}

export {
  AffiantEvidenceCard,
  EVIDENCE_CARD_DECISION_EVENT,
  EVIDENCE_CARD_TAG_NAME,
} from "./element.js";
export type { EvidenceCardDecision, EvidenceCardDecisionDetail } from "./element.js";
