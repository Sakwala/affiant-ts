/**
 * The demo page: load the card, point it at a conformance fixture, and print
 * every decision the card emits.
 *
 * Everything here is what a host would write. The card is registered by importing
 * the side-effect entry; the payload arrives over `fetch` through the `src`
 * attribute; the host listens for one event.
 */
import "../src/register.js";
import type { EvidenceCardDecisionDetail } from "../src/index.js";
import { EVIDENCE_CARD_DECISION_EVENT } from "../src/index.js";

const card = document.querySelector("affiant-evidence-card");
const log = document.querySelector<HTMLPreElement>("#log");
const readonlyToggle = document.querySelector<HTMLInputElement>("#readonly");

if (card === null || log === null || readonlyToggle === null) {
  throw new Error("demo page markup is missing an element");
}

const logPanel: HTMLPreElement = log;

// Relative to this module, so the page works from any base path — including the
// project sub-path GitHub Pages serves it under.
card.setAttribute("src", new URL("./fixture.json", import.meta.url).href);

readonlyToggle.addEventListener("change", () => {
  card.readOnly = readonlyToggle.checked;
});

function stamp(): string {
  return new Date().toLocaleTimeString();
}

function record(detail: EvidenceCardDecisionDetail): void {
  const entry = document.createElement("div");
  entry.className = "entry";
  entry.textContent = `${stamp()}  ${detail.decision.toUpperCase()}\n${JSON.stringify(detail, null, 2)}`;
  logPanel.prepend(entry);
}

card.addEventListener(EVIDENCE_CARD_DECISION_EVENT, (event) => {
  record(event.detail);
});
