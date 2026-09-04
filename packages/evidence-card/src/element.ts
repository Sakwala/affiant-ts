import type {
  AffidavitField,
  AmendmentMap,
  EvidenceCardRequest,
  JsonValue,
} from "@affiant/contract";

import { CARD_STYLES } from "./styles.js";

/** The presentation hints this element actually reads for one field, from whichever wire shape carried them. See {@link presentationFor}. */
interface FieldHints {
  allowedValues: readonly JsonValue[] | null;
  pattern: string | null;
}

/** The tag name {@link https://developer.mozilla.org/docs/Web/API/CustomElementRegistry/define | customElements.define} registers under in `@affiant/evidence-card/register`. */
export const EVIDENCE_CARD_TAG_NAME = "affiant-evidence-card";

/** The event the card emits when a reviewer decides. */
export const EVIDENCE_CARD_DECISION_EVENT = "affiant-decision";

/** What a reviewer did with the card. */
export type EvidenceCardDecision = "approve" | "reject" | "amend";

/** The `detail` of an {@link EVIDENCE_CARD_DECISION_EVENT} event. */
export interface EvidenceCardDecisionDetail {
  /** The docket entry the decision applies to. */
  docketId: string;
  /**
   * `"approve"` — commit the affidavit as filed.
   * `"reject"` — commit nothing.
   * `"amend"` — commit the affidavit with {@link EvidenceCardDecisionDetail.amendments}
   * applied. A reviewer who types into any amendment box and then approves is
   * amending, not approving, so the host never has to guess which it was.
   */
  decision: EvidenceCardDecision;
  /**
   * The reviewer's replacement values, keyed by {@link AffidavitField.name}. Empty
   * for `"approve"` and `"reject"`. A value is the matching entry itself when the
   * reviewer picked it from a closed set (`presentation[].allowedValues` — a
   * `<select>` always returns a string, so a numeric enum's amendment is matched
   * back to the number the host declared, never sent as its string label), a
   * `number` when the field's `kind` is `"number"` and the typed text parses as
   * one, and the typed text otherwise. Always a JSON value: this map goes back on
   * the wire.
   */
  amendments: Record<string, JsonValue>;
}

const DECISION_EVENT_INIT = { bubbles: true, composed: true } as const;

/**
 * What the card extends.
 *
 * In a browser it is the real `HTMLElement`. Under Node — a server-side render, a
 * bundler walking the module graph, a test collector — there is no DOM, and
 * `class … extends undefined` throws while the module is still being evaluated,
 * so `import "@affiant/evidence-card/register"` would crash an SSR render before
 * any guard could run. Extending an inert stand-in instead makes importing this
 * package safe on every runtime; `register.ts` checks for a DOM before it defines
 * the tag, and constructing a card without one was never supported.
 */
const CardBase: typeof HTMLElement =
  typeof HTMLElement === "undefined" ? (class {} as unknown as typeof HTMLElement) : HTMLElement;

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className !== undefined) node.className = className;
  // Always textContent, never innerHTML: every value on this card was proposed by
  // an agent, and a card that renders agent output as markup is a hole.
  if (text !== undefined) node.textContent = text;
  return node;
}

/** How a value is shown. `null` and `undefined` become a visible "empty", not a blank. */
function formatValue(value: unknown): { text: string; isNull: boolean } {
  if (value === null || value === undefined) return { text: "empty", isNull: true };
  if (typeof value === "string") return { text: value, isNull: false };
  if (typeof value === "number" || typeof value === "boolean") {
    return { text: String(value), isNull: false };
  }
  return { text: JSON.stringify(value) ?? String(value), isNull: false };
}

function formatConfidence(confidence: number): string {
  return confidence.toFixed(2);
}

function formatPercent(confidence: number): string {
  return `${Math.round(Math.max(0, Math.min(1, confidence)) * 100)}%`;
}

function formatDeadline(iso: string): string {
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? iso : parsed.toLocaleString();
}

/** A confidence bar plus its number, exposed to assistive technology as a meter. */
function meter(confidence: number, label: string): HTMLElement {
  const wrap = element("div", "meter-wrap");

  const bar = element("span", "meter");
  bar.setAttribute("role", "meter");
  bar.setAttribute("aria-label", label);
  bar.setAttribute("aria-valuemin", "0");
  bar.setAttribute("aria-valuemax", "1");
  bar.setAttribute("aria-valuenow", formatConfidence(confidence));
  bar.setAttribute("aria-valuetext", formatPercent(confidence));

  const fill = element("span", "meter-fill");
  fill.style.width = formatPercent(confidence);
  bar.append(fill);

  wrap.append(bar, element("span", "confidence-value", formatConfidence(confidence)));
  return wrap;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Why `value` is not an evidence card request, or `null` when it is one.
 *
 * Checks the keys common to both wire shapes this element accepts: the v0.1
 * envelope `@affiant/contract` now pins, and the `0.0.1-seed` shape the shipped
 * .NET framework still sends while it awaits alignment. `requiresConfirmation`
 * and `warnings` moved from the affidavit to the envelope between the two — the
 * policy chain's verdict and a reviewer's sentences are presentation, not
 * evidence, and SR-1 defines the canonical form over the Affidavit alone — so
 * this checks each wherever the payload actually put it rather than requiring one
 * location; see {@link warningsFor} and {@link presentationFor}, which read them
 * the same way. It is a structural check, not schema validation: `@affiant/contract`
 * ships the JSON Schemas for that, and running a validator would cost this
 * element its "no dependencies".
 *
 * Why check at all: the payload arrives from a host this element does not
 * control, over a network. Reading a missing key used to throw out of `#render`
 * and leave the shadow root holding nothing but its stylesheet — a blank card is
 * the worst possible failure for a surface whose whole job is to show a reviewer
 * what is about to be written.
 */
function describeInvalidRequest(value: unknown): string | null {
  if (!isRecord(value)) return "the payload is not an object";

  if (typeof value["docketId"] !== "string") return "docketId is missing or not a string";
  if (typeof value["requiredBy"] !== "string") return "requiredBy is missing or not a string";
  if (!("priorAmendments" in value)) return "priorAmendments is missing";
  const priorAmendments = value["priorAmendments"];
  if (priorAmendments !== null && !isRecord(priorAmendments)) {
    return "priorAmendments is neither an object nor null";
  }

  const affidavit = value["affidavit"];
  if (!isRecord(affidavit)) return "affidavit is missing or not an object";
  if (typeof affidavit["operationType"] !== "string") {
    return "affidavit.operationType is missing or not a string";
  }
  if (typeof affidavit["entityType"] !== "string") {
    return "affidavit.entityType is missing or not a string";
  }
  const entityId = affidavit["entityId"];
  if (entityId !== null && typeof entityId !== "string") {
    return "affidavit.entityId is neither a string nor null";
  }
  if (typeof affidavit["aggregateConfidence"] !== "number") {
    return "affidavit.aggregateConfidence is missing or not a number";
  }
  if (
    typeof value["requiresConfirmation"] !== "boolean" &&
    typeof affidavit["requiresConfirmation"] !== "boolean"
  ) {
    return "requiresConfirmation is missing or not a boolean, on the envelope or the affidavit";
  }
  // Optional on both wire shapes at v0.1 (AZ-4): a card with nothing for a
  // reviewer to read omits the key rather than carrying an empty array. Checked
  // only when present, wherever a producer put it.
  const warnings = value["warnings"];
  if (warnings !== undefined && !Array.isArray(warnings)) {
    return "warnings is present but not an array";
  }
  const legacyWarnings = affidavit["warnings"];
  if (legacyWarnings !== undefined && !Array.isArray(legacyWarnings)) {
    return "affidavit.warnings is present but not an array";
  }

  // `presentation` is the v0.1 home for the per-field hints the 0.0.1-seed shape
  // carried on each field (SR-1) — absent entirely on a card with no hints, so
  // only checked when the key is there at all.
  const presentation = value["presentation"];
  if (presentation !== undefined) {
    if (!Array.isArray(presentation)) return "presentation is present but not an array";
    for (const [index, hint] of presentation.entries()) {
      const reason = describeInvalidPresentationHint(hint);
      if (reason !== null) return `presentation[${String(index)}] ${reason}`;
    }
  }

  const fields = affidavit["fields"];
  if (!Array.isArray(fields)) return "affidavit.fields is missing or not an array";

  for (const [index, field] of fields.entries()) {
    const reason = describeInvalidField(field);
    if (reason !== null) return `affidavit.fields[${String(index)}] ${reason}`;
  }

  return null;
}

/** Why `value` is not a `presentation` entry, or `null` when it is one. */
function describeInvalidPresentationHint(value: unknown): string | null {
  if (!isRecord(value)) return "is not an object";
  if (typeof value["name"] !== "string" || value["name"] === "") {
    return "has no name, or a name that is not a string";
  }
  const allowedValues = value["allowedValues"];
  if (allowedValues !== undefined && !Array.isArray(allowedValues)) {
    return "has an allowedValues that is present but not an array";
  }
  const pattern = value["pattern"];
  if (pattern !== undefined && typeof pattern !== "string") {
    return "has a pattern that is present but not a string";
  }
  return null;
}

/**
 * Why `value` is not an affidavit field, or `null` when it is one.
 *
 * Does not check `allowedValues` or `pattern`: they are gone from the field at
 * v0.1 (SR-1 — they moved to the envelope's `presentation`, checked by
 * {@link describeInvalidPresentationHint}) and were never required on the
 * `0.0.1-seed` field either, so there is nothing on the field itself to require
 * here.
 */
function describeInvalidField(value: unknown): string | null {
  if (!isRecord(value)) return "is not an object";
  if (typeof value["name"] !== "string") return "has no name, or a name that is not a string";
  if (!("value" in value)) return "has no value";
  if (!("previousValue" in value)) return "has no previousValue";
  if (typeof value["isMandatory"] !== "boolean") return "has no boolean isMandatory";
  if (typeof value["kind"] !== "string") return "has no string kind";

  const provenance = value["provenance"];
  if (!isRecord(provenance)) return "has no provenance object";
  if (!Array.isArray(provenance["prior"])) return "has no provenance.prior array";
  const current = provenance["current"];
  if (!isRecord(current)) return "has no provenance.current object";
  if (typeof current["source"] !== "string") return "has no provenance.current.source string";
  if (typeof current["confidence"] !== "number") {
    return "has no provenance.current.confidence number";
  }
  // `note` is the v0.1 name; `evidence` is the `0.0.1-seed` spelling the shipped
  // .NET framework still sends (the whole record is the evidence, and this
  // property is the sentence a person reads). Checked wherever it is present;
  // neither is required, since a tag may have nothing to say.
  const note = current["note"];
  if (note !== undefined && note !== null && typeof note !== "string") {
    return "has a provenance.current.note that is neither a string nor null";
  }
  const evidence = current["evidence"];
  if (evidence !== undefined && evidence !== null && typeof evidence !== "string") {
    return "has a provenance.current.evidence that is neither a string nor null";
  }
  const conversationTurn = current["conversationTurn"];
  if (conversationTurn !== null && typeof conversationTurn !== "number") {
    return "has a provenance.current.conversationTurn that is neither a number nor null";
  }
  return null;
}

/** The visible, announced failure state. Never a blank card. */
function errorState(message: string): HTMLElement {
  const alert = element("p", "state error", message);
  alert.setAttribute("role", "alert");
  return alert;
}

/** Reads a number a producer may have added that the pinned schema does not define. */
function optionalNumber(source: unknown, key: string): number | null {
  if (typeof source !== "object" || source === null) return null;
  const value = (source as Record<string, unknown>)[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Reads a string under `key`, or `null` when it is absent or not a string. */
function optionalString(source: unknown, key: string): string | null {
  if (typeof source !== "object" || source === null) return null;
  const value = (source as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
}

/** Reads an array under `key`, or `null` when it is absent or not an array. */
function optionalJsonArray(source: unknown, key: string): readonly JsonValue[] | null {
  if (typeof source !== "object" || source === null) return null;
  const value = (source as Record<string, unknown>)[key];
  return Array.isArray(value) ? (value as JsonValue[]) : null;
}

/** Reads an array of strings under `key`, or `null` when it is absent or not one. */
function optionalStringArray(source: unknown, key: string): readonly string[] | null {
  if (typeof source !== "object" || source === null) return null;
  const value = (source as Record<string, unknown>)[key];
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? (value as string[])
    : null;
}

/**
 * The two of the three confidence numbers the pinned affidavit schema has nowhere to
 * put, read from wherever the producer could put them.
 *
 * The schema at `v0.0.1-seed` is `additionalProperties: false` over seven properties,
 * of which `aggregateConfidence` is one — so a producer that wants to show all three
 * puts the other two on the **envelope**, beside `protocolVersion`. A producer whose
 * own affidavit type is open may put them there instead. The envelope wins where both
 * are present, because it is the one the schema permits; neither is ever invented.
 */
function extraConfidence(request: EvidenceCardRequest): {
  populated: number | null;
  emptyFields: number | null;
} {
  const affidavit: unknown = request.affidavit;
  return {
    populated:
      optionalNumber(request, "populatedConfidence") ??
      optionalNumber(affidavit, "populatedConfidence"),
    emptyFields:
      optionalNumber(request, "emptyFieldCount") ?? optionalNumber(affidavit, "emptyFieldCount"),
  };
}

/**
 * Why this entry cannot be decided, in one line, or `null` when nothing says it is
 * blocked.
 *
 * A producer marks an entry blocked on the **envelope** — the affidavit's schema has
 * no room for it — and the reviewer surface has to show it, because the same card
 * carries no confirm flag and its buttons would post a decision nothing will accept.
 */
function blockedReason(request: EvidenceCardRequest): string | null {
  const blocked: unknown = (request as unknown as Record<string, unknown>)["blocked"];
  if (!isRecord(blocked)) return null;
  const code = blocked["code"];
  if (typeof code !== "string" || code === "") return null;
  const level = blocked["level"];
  const category = blocked["category"];
  const detail = typeof level === "string" ? level : typeof category === "string" ? category : null;
  const what = detail === null ? code : `${code} (${detail})`;
  return `No decision on this entry will be accepted: ${what}.`;
}

/**
 * Sentences a reviewer should see beside the record, read from wherever a
 * producer put them: the **envelope**'s `warnings` at v0.1, or the affidavit's
 * own `warnings` in the `0.0.1-seed` shape the shipped .NET framework still
 * sends. They moved because they are presentation, not evidence — SR-1 defines
 * the canonical form over the Affidavit alone, and a policy's sentence to a
 * reviewer is no more part of that than the confirm flag is (AZ-4). The legacy
 * key is a deliberate fallback, dropped once that framework is aligned.
 */
function warningsFor(request: EvidenceCardRequest): readonly string[] {
  if (request.warnings !== undefined) return request.warnings;
  return optionalStringArray(request.affidavit, "warnings") ?? [];
}

/**
 * The rendering hints for one field, read from wherever a producer put them: the
 * envelope's `presentation` array at v0.1 (looked up by {@link AffidavitField.name}),
 * or the field's own `allowedValues`/`pattern` in the `0.0.1-seed` shape the
 * shipped .NET framework still sends. A field with no hints in either place
 * renders from its own `kind` alone.
 *
 * They moved off the field for the same reason `warnings` moved off the
 * affidavit: a closed value set and an input mask are how a surface should
 * *show* the record, decided by the host and changing when the host changes its
 * mind, and swearing to them would put a rendering decision inside a hash a
 * grant is checked against (SR-1). The gate carries a hint and validates
 * nothing against it — a value outside `allowedValues`, or not matching
 * `pattern`, is still recorded.
 */
function presentationFor(request: EvidenceCardRequest, field: AffidavitField): FieldHints {
  const hint = request.presentation?.find((entry) => entry.name === field.name);
  return {
    allowedValues: hint?.allowedValues ?? optionalJsonArray(field, "allowedValues"),
    pattern: hint?.pattern ?? optionalString(field, "pattern"),
  };
}

/**
 * `<affiant-evidence-card>` — renders one Affiant Affidavit for a person to
 * approve, amend or reject.
 *
 * An Affidavit is the evidence behind a write an LLM agent proposed: per field,
 * the value it wants to write, the value that is there now, where the value came
 * from and how confident it is. The card's job is to make a reviewer able to say
 * yes, no or "not that value" in a few seconds, and to make a low-confidence or
 * unsourced field impossible to miss.
 *
 * No framework, no dependencies, no build step required of the host: it is a
 * custom element with its own shadow root.
 *
 * ```html
 * <script type="module" src="/node_modules/@affiant/evidence-card/dist/register.js"></script>
 * <affiant-evidence-card src="/api/docket/current"></affiant-evidence-card>
 * ```
 *
 * ```ts
 * import { AffiantEvidenceCard } from "@affiant/evidence-card";
 * customElements.define("my-review-card", AffiantEvidenceCard);
 *
 * card.request = requestFromTheWire;
 * card.addEventListener("affiant-decision", (event) => {
 *   const { docketId, decision, amendments } = event.detail;
 * });
 * ```
 */
export class AffiantEvidenceCard extends CardBase {
  static readonly observedAttributes: readonly string[] = ["src", "readonly"];

  readonly #shadow: ShadowRoot;
  #request: EvidenceCardRequest | null = null;
  /** Raw text the reviewer typed, by field name. Coerced only when the decision is emitted. */
  readonly #amendments = new Map<string, string>();
  #status: "empty" | "loading" | "ready" | "error" = "empty";
  #error: string | null = null;
  /** Guards against a slow `src` fetch overwriting a newer one. */
  #fetchSequence = 0;

  constructor() {
    super();
    this.#shadow = this.attachShadow({ mode: "open" });
  }

  /** The affidavit envelope to render. Setting it re-renders and clears any typed amendments. */
  get request(): EvidenceCardRequest | null {
    return this.#request;
  }

  set request(value: EvidenceCardRequest | null) {
    // A property set wins over an in-flight fetch started by `src`.
    this.#fetchSequence += 1;
    this.#amendments.clear();

    const reason = value === null ? null : describeInvalidRequest(value);
    if (reason !== null) {
      this.#request = null;
      this.#status = "error";
      this.#error = `Cannot show this evidence card: ${reason}`;
      this.#render();
      return;
    }

    this.#request = value;
    this.#error = null;
    this.#status = value === null ? "empty" : "ready";
    this.#render();
  }

  /** A URL to fetch the envelope from. Mirrors the `src` attribute. */
  get src(): string | null {
    return this.getAttribute("src");
  }

  set src(value: string | null) {
    if (value === null) this.removeAttribute("src");
    else this.setAttribute("src", value);
  }

  /** When true the card renders as a record only: no buttons, no amendment inputs. Mirrors the `readonly` attribute. */
  get readOnly(): boolean {
    return this.hasAttribute("readonly");
  }

  set readOnly(value: boolean) {
    if (value) this.setAttribute("readonly", "");
    else this.removeAttribute("readonly");
  }

  connectedCallback(): void {
    if (this.#shadow.childNodes.length === 0) this.#render();
  }

  attributeChangedCallback(name: string, _previous: string | null, value: string | null): void {
    if (name === "src") {
      if (value !== null && value !== "") void this.#load(value);
      return;
    }
    this.#render();
  }

  async #load(url: string): Promise<void> {
    const sequence = ++this.#fetchSequence;
    this.#status = "loading";
    this.#error = null;
    this.#render();

    try {
      const response = await fetch(url, { headers: { accept: "application/json" } });
      if (!response.ok) {
        throw new Error(`${String(response.status)} ${response.statusText}`.trim());
      }
      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw new Error("the response was not JSON");
      }

      const reason = describeInvalidRequest(payload);
      if (reason !== null) throw new Error(reason);

      if (sequence !== this.#fetchSequence) return;
      this.#request = payload as EvidenceCardRequest;
      this.#amendments.clear();
      this.#status = "ready";
    } catch (cause) {
      if (sequence !== this.#fetchSequence) return;
      this.#request = null;
      this.#status = "error";
      this.#error = `Could not load the evidence: ${
        cause instanceof Error ? cause.message : String(cause)
      }`;
    }

    this.#render();
  }

  #collectAmendments(): Record<string, JsonValue> {
    const request = this.#request;
    const fields = new Map(request?.affidavit.fields.map((f) => [f.name, f] as const) ?? []);
    const amendments: Record<string, JsonValue> = {};
    for (const [name, raw] of this.#amendments) {
      const text = raw.trim();
      if (text === "") continue;
      const field = fields.get(name);
      // A `<select>`'s `.value` is always a string — the DOM has no other way to
      // carry a selection — so a pick is matched back to the `allowedValues`
      // entry whose `String(value)` produced its label before anything is sent.
      // Without this a numeric enum's amendment would go back on the wire as the
      // string `"12"` rather than the number the host declared (SR-2 is about
      // Money specifically, but the same reasoning — a value's JSON type is part
      // of what was approved — applies to any typed hint).
      const allowedValues =
        request !== null && field !== undefined
          ? presentationFor(request, field).allowedValues
          : null;
      const picked = allowedValues?.find((candidate) => String(candidate) === text);
      if (picked !== undefined) {
        amendments[name] = picked;
      } else if (field?.kind === "number") {
        const asNumber = Number(text);
        amendments[name] = Number.isFinite(asNumber) ? asNumber : text;
      } else {
        amendments[name] = text;
      }
    }
    return amendments;
  }

  #emit(decision: "approve" | "reject"): void {
    const request = this.#request;
    if (request === null) return;

    const amendments = decision === "approve" ? this.#collectAmendments() : {};
    const amended = Object.keys(amendments).length > 0;

    this.dispatchEvent(
      new CustomEvent<EvidenceCardDecisionDetail>(EVIDENCE_CARD_DECISION_EVENT, {
        ...DECISION_EVENT_INIT,
        detail: {
          docketId: request.docketId,
          decision: amended ? "amend" : decision,
          amendments,
        },
      }),
    );
  }

  /**
   * Paints, and turns anything that escapes the painter into a visible failure.
   * The payload is checked before it is accepted, so this should never fire — but
   * a blank card is a bad enough outcome to be worth a second net.
   */
  #render(): void {
    try {
      this.#paint();
    } catch (cause) {
      this.#shadow.replaceChildren();
      const style = document.createElement("style");
      style.textContent = CARD_STYLES;
      const reason = cause instanceof Error ? cause.message : String(cause);
      this.#shadow.append(style, errorState(`Could not show the evidence: ${reason}`));
    }
  }

  #paint(): void {
    this.#shadow.replaceChildren();

    const style = document.createElement("style");
    style.textContent = CARD_STYLES;
    this.#shadow.append(style);

    if (this.#status === "loading") {
      this.#shadow.append(element("p", "state", "Loading the evidence…"));
      return;
    }
    if (this.#status === "error") {
      this.#shadow.append(errorState(this.#error ?? "Could not show the evidence."));
      return;
    }

    const request = this.#request;
    if (request === null) {
      this.#shadow.append(element("p", "state", "No affidavit to review."));
      return;
    }

    const { affidavit } = request;
    const entityLabel = affidavit.entityId ?? "new";

    const card = element("section", "card");
    card.setAttribute(
      "aria-label",
      `Evidence card: ${affidavit.operationType} on ${affidavit.entityType} ${entityLabel}`,
    );

    card.append(this.#renderHead(request, entityLabel));

    if (request.priorAmendments !== null) {
      card.append(this.#renderResubmission(request.priorAmendments));
    }

    const blocked = blockedReason(request);
    if (blocked !== null) {
      const banner = element("p", "blocked", blocked);
      banner.setAttribute("role", "alert");
      card.append(banner);
    }

    const warningLines = warningsFor(request);
    if (warningLines.length > 0) {
      const warnings = element("ul", "warnings");
      for (const warning of warningLines) warnings.append(element("li", undefined, warning));
      card.append(warnings);
    }

    const fields = element("ol", "fields");
    for (const field of affidavit.fields) fields.append(this.#renderField(field, request));
    card.append(fields);

    card.append(this.#renderFoot(request));
    this.#shadow.append(card);
  }

  #renderHead(request: EvidenceCardRequest, entityLabel: string): HTMLElement {
    const { affidavit } = request;
    const head = element("header", "head");

    const identity = element("div");
    identity.append(element("span", "operation", affidavit.operationType));
    const title = element("h2", "title", `${affidavit.entityType} `);
    title.append(element("span", "entity-id", entityLabel));
    identity.append(title);

    const deadline = element("div", "deadline");
    deadline.append(document.createTextNode("Required by "));
    const time = element("time", undefined, formatDeadline(request.requiredBy));
    time.setAttribute("datetime", request.requiredBy);
    deadline.append(time);

    head.append(identity, deadline);
    return head;
  }

  #renderResubmission(priorAmendments: AmendmentMap): HTMLElement {
    const note = element("div", "note");
    note.setAttribute("role", "note");
    note.append(
      element(
        "div",
        "note-title",
        "Resubmission — this review expired once and a reviewer had already amended:",
      ),
    );

    const list = element("ul");
    for (const [name, value] of Object.entries(priorAmendments)) {
      const item = element("li");
      item.append(element("code", undefined, name));
      const { text, isNull } = formatValue(value);
      item.append(document.createTextNode(" → "));
      item.append(element("code", isNull ? "value-null" : undefined, isNull ? "cleared" : text));
      list.append(item);
    }
    note.append(list);
    return note;
  }

  #renderField(field: AffidavitField, request: EvidenceCardRequest): HTMLElement {
    const tag = field.provenance.current;
    const unsourced = tag.source === "Empty";
    const noConfidence = tag.confidence === 0;
    const flagged = unsourced || noConfidence;

    const item = element("li", "field");
    item.dataset["flagged"] = String(flagged);

    const head = element("div", "field-head");
    head.append(element("span", "field-name", field.name));
    if (field.isMandatory) head.append(element("span", "mandatory", "required"));
    head.append(element("span", "kind", field.kind));
    item.append(head);

    const values = element("div", "values");
    values.append(this.#renderValue("Proposed", field.value, false));
    if (field.previousValue !== null && field.previousValue !== undefined) {
      values.append(this.#renderValue("Previously", field.previousValue, true));
    }
    item.append(values);

    const provenance = element("div", "provenance");
    const badge = element("span", "badge", tag.source);
    badge.dataset["source"] = tag.source;
    provenance.append(badge, meter(tag.confidence, `Confidence in ${field.name}`));
    item.append(provenance);

    if (flagged) {
      const reason = unsourced
        ? noConfidence
          ? "No source and no confidence — nothing stands behind this value."
          : "No source recorded for this value."
        : "Zero confidence in this value.";
      item.append(element("p", "flag", reason));
    }

    // `note` is the v0.1 name for the sentence a person reads; `evidence` is the
    // `0.0.1-seed` spelling the shipped .NET framework still sends. Read wherever
    // the tag actually carries it — a genuine v0.1 tag has no `evidence` key at
    // all, so the fallback costs nothing there.
    const note = optionalString(tag, "note") ?? optionalString(tag, "evidence");
    if (note !== null && note !== "") {
      item.append(element("p", "evidence", note));
    }

    const hints = presentationFor(request, field);
    if (hints.allowedValues !== null && hints.allowedValues.length > 0) {
      item.append(
        element(
          "p",
          "allowed",
          `One of: ${hints.allowedValues.map((value) => String(value)).join(", ")}`,
        ),
      );
    }

    if (!this.readOnly) item.append(this.#renderAmendInput(field, hints));

    return item;
  }

  #renderValue(label: string, value: unknown, previous: boolean): HTMLElement {
    const wrap = element("div", previous ? "value previous" : "value");
    wrap.append(element("span", "value-label", label));
    const { text, isNull } = formatValue(value);
    wrap.append(element("span", isNull ? "value-text value-null" : "value-text", text));
    return wrap;
  }

  /**
   * A closed value set renders as a real `<select>`, not a text box with the
   * options listed in the placeholder: a reviewer picks rather than retypes.
   * This is still only a hint, never a constraint (SR-1) — the gate validates
   * nothing against `allowedValues`, and `#collectAmendments` matches a pick back
   * to its original JSON value rather than trusting `<select>` to carry anything
   * but a string.
   */
  #renderAmendInput(field: AffidavitField, hints: FieldHints): HTMLElement {
    const label = element("label", "amend");
    label.append(element("span", "amend-label", "Amend"));

    const current = this.#amendments.get(field.name) ?? "";
    const control: HTMLInputElement | HTMLSelectElement =
      hints.allowedValues !== null && hints.allowedValues.length > 0
        ? this.#renderAmendSelect(hints.allowedValues, current)
        : this.#renderAmendTextInput(hints.pattern, current);

    control.dataset["field"] = field.name;
    control.setAttribute("aria-label", `Amend ${field.name}`);
    control.addEventListener("input", () => {
      this.#amendments.set(field.name, control.value);
      this.#syncApproveLabel();
    });

    label.append(control);
    return label;
  }

  #renderAmendSelect(allowedValues: readonly JsonValue[], current: string): HTMLSelectElement {
    const select = document.createElement("select");

    const blank = document.createElement("option");
    blank.value = "";
    blank.textContent = "leave blank to accept";
    select.append(blank);

    for (const value of allowedValues) {
      const option = document.createElement("option");
      // The label and the option's own `value` are both `String(value)` — a
      // `<select>` has no other way to carry a selection — but non-string entries
      // are a legitimate hint (an enum of numbers), so the label is never assumed
      // to already be the value a reviewer's pick should send.
      const text = String(value);
      option.value = text;
      option.textContent = text;
      select.append(option);
    }

    select.value = current;
    return select;
  }

  #renderAmendTextInput(pattern: string | null, current: string): HTMLInputElement {
    const input = element("input");
    input.type = "text";
    input.placeholder = "leave blank to accept";
    input.value = current;
    if (pattern !== null) input.setAttribute("pattern", pattern);
    return input;
  }

  #renderFoot(request: EvidenceCardRequest): HTMLElement {
    const { affidavit } = request;
    const foot = element("footer", "foot");

    const totals = element("div", "totals");
    const aggregate = element("div", "total");
    aggregate.append(element("span", undefined, "Aggregate confidence"));
    aggregate.append(meter(affidavit.aggregateConfidence, "Aggregate confidence"));
    totals.append(aggregate);

    // The other two of the three numbers, from the envelope or from an open
    // affidavit. Shown when they are there; never invented when they are not.
    const { populated, emptyFields } = extraConfidence(request);
    if (populated !== null) {
      const entry = element("div", "total");
      entry.append(element("span", undefined, "Populated fields"));
      entry.append(meter(populated, "Confidence across populated fields"));
      totals.append(entry);
    }
    if (emptyFields !== null) {
      const entry = element("div", "total");
      entry.append(element("span", undefined, "Empty fields"));
      entry.append(element("strong", undefined, String(emptyFields)));
      totals.append(entry);
    }
    foot.append(totals);

    if (this.readOnly) return foot;

    const actions = element("div", "actions");
    const approve = element("button", "approve", "Approve");
    approve.type = "button";
    approve.addEventListener("click", () => {
      this.#emit("approve");
    });

    const reject = element("button", "reject", "Reject");
    reject.type = "button";
    reject.addEventListener("click", () => {
      this.#emit("reject");
    });

    actions.append(approve, reject);
    foot.append(actions);
    return foot;
  }

  /** Keeps the primary button honest about what pressing it would send. */
  #syncApproveLabel(): void {
    const approve = this.#shadow.querySelector<HTMLButtonElement>("button.approve");
    if (approve === null) return;
    const amended = Object.keys(this.#collectAmendments()).length > 0;
    approve.textContent = amended ? "Approve with amendments" : "Approve";
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "affiant-evidence-card": AffiantEvidenceCard;
  }
  interface HTMLElementEventMap {
    "affiant-decision": CustomEvent<EvidenceCardDecisionDetail>;
  }
}
