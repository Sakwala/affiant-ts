import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AffidavitField, EvidenceCardRequest } from "@affiant/contract";

import "../src/register.js";
import type { EvidenceCardDecisionDetail } from "../src/index.js";
import { EVIDENCE_CARD_DECISION_EVENT, EVIDENCE_CARD_TAG_NAME } from "../src/index.js";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

// The v0.1 conformance fixtures `@affiant/contract` pins — the primary wire shape
// this element renders.
const v01Dir = join(
  packageRoot,
  "..",
  "contract",
  "protocol",
  "fixtures",
  "v0.1",
  "evidence-card-request",
);
function v01Fixture(name: string): EvidenceCardRequest {
  return JSON.parse(readFileSync(join(v01Dir, `${name}.json`), "utf8")) as EvidenceCardRequest;
}

// The `0.0.1-seed` wire fixture — untouched, because it is what the shipped .NET
// framework still sends. Used only by the "0.0.1-seed fallback" suite below.
const legacyDir = join(packageRoot, "..", "contract", "protocol", "fixtures", "wire");
function legacyFixture(name: string): EvidenceCardRequest {
  return JSON.parse(readFileSync(join(legacyDir, `${name}.json`), "utf8")) as EvidenceCardRequest;
}

const firstFiling = v01Fixture("01-first-filing");
const resubmission = v01Fixture("03-resubmission");
const presentationHints = v01Fixture("04-presentation-hints");
const legacyFirstFiling = legacyFixture("evidence-card-request");

function mount(request: EvidenceCardRequest | null, attributes: Record<string, string> = {}) {
  const card = document.createElement(EVIDENCE_CARD_TAG_NAME);
  for (const [name, value] of Object.entries(attributes)) card.setAttribute(name, value);
  document.body.append(card);
  if (request !== null) card.request = request;
  return card;
}

function shadowText(card: HTMLElement): string {
  return card.shadowRoot?.textContent ?? "";
}

function decisions(card: HTMLElement): EvidenceCardDecisionDetail[] {
  const seen: EvidenceCardDecisionDetail[] = [];
  card.addEventListener(EVIDENCE_CARD_DECISION_EVENT, (event) => {
    seen.push(event.detail);
  });
  return seen;
}

function button(card: HTMLElement, kind: "approve" | "reject"): HTMLButtonElement {
  const found = card.shadowRoot?.querySelector<HTMLButtonElement>(`button.${kind}`);
  if (!found) throw new Error(`no ${kind} button`);
  return found;
}

/** The amend control for `field` — an `<input>` when it has no closed set, a `<select>` when it does. */
function amendControl(card: HTMLElement, field: string): HTMLInputElement | HTMLSelectElement {
  const found = card.shadowRoot?.querySelector<HTMLInputElement | HTMLSelectElement>(
    `[data-field="${field}"]`,
  );
  if (!found) throw new Error(`no amend control for ${field}`);
  return found;
}

function type(control: HTMLInputElement | HTMLSelectElement, value: string): void {
  control.value = value;
  control.dispatchEvent(new Event("input"));
}

/** `source` with the properties at each dotted `path` deleted, however deep they sit. */
function without(source: EvidenceCardRequest, ...paths: string[]): unknown {
  const copy = JSON.parse(JSON.stringify(source)) as Record<string, unknown>;
  for (const path of paths) {
    const segments = path.split(".");
    const last = segments.pop() as string;
    let node = copy;
    for (const segment of segments) {
      node = node[segment] as Record<string, unknown>;
    }
    delete node[last];
  }
  return copy;
}

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe("registration", () => {
  it("defines the element under its published tag name", () => {
    expect(customElements.get(EVIDENCE_CARD_TAG_NAME)).toBeTypeOf("function");
  });

  it("gives every instance an open shadow root", () => {
    expect(mount(null).shadowRoot).not.toBeNull();
  });
});

describe("rendering a first filing", () => {
  let card: HTMLElement;

  beforeEach(() => {
    card = mount(firstFiling);
  });

  it("names the operation and the entity being written", () => {
    const text = shadowText(card);
    expect(text).toContain("update");
    expect(text).toContain("Invoice");
    expect(text).toContain("invoice-1");
  });

  it("labels the card for assistive technology", () => {
    const section = card.shadowRoot?.querySelector("section");
    expect(section?.getAttribute("aria-label")).toBe("Evidence card: update on Invoice invoice-1");
  });

  it("renders one row per sworn field, in wire order", () => {
    const names = [...(card.shadowRoot?.querySelectorAll(".field-name") ?? [])].map(
      (node) => node.textContent,
    );
    expect(names).toEqual(firstFiling.affidavit.fields.map((field) => field.name));
  });

  it("shows every field's provenance source as a badge", () => {
    const badges = [...(card.shadowRoot?.querySelectorAll(".badge") ?? [])].map(
      (node) => node.textContent,
    );
    expect(badges).toEqual(
      firstFiling.affidavit.fields.map((field) => field.provenance.current.source),
    );
  });

  it("exposes every confidence as a meter with its value", () => {
    const meters = [...(card.shadowRoot?.querySelectorAll('[role="meter"]') ?? [])];
    // One per field, plus the aggregate, plus the populated-fields minimum — v0.1
    // carries all three on every card (AF-2).
    expect(meters).toHaveLength(firstFiling.affidavit.fields.length + 2);
    expect(meters.map((node) => node.getAttribute("aria-valuenow"))).toEqual([
      "0.90",
      "0.80",
      "0.60",
      "0.70",
      "0.60",
      "0.60",
    ]);
    for (const node of meters) {
      expect(node.getAttribute("aria-valuemin")).toBe("0");
      expect(node.getAttribute("aria-valuemax")).toBe("1");
    }
  });

  it("shows each tag's note as a reviewer-facing line", () => {
    const text = shadowText(card);
    expect(text).toContain("Literally present in the turn: status");
    expect(text).toContain("Inferred from the turn: note");
  });

  it("marks a mandatory field as required", () => {
    const rows = [...(card.shadowRoot?.querySelectorAll(".field") ?? [])];
    expect(rows[0]?.querySelector(".mandatory")).not.toBeNull();
    expect(rows[1]?.querySelector(".mandatory")).not.toBeNull();
    expect(rows[2]?.querySelector(".mandatory")).toBeNull();
    expect(rows[3]?.querySelector(".mandatory")).toBeNull();
  });

  it("shows the deadline as a machine-readable time", () => {
    expect(card.shadowRoot?.querySelector("time")?.getAttribute("datetime")).toBe(
      firstFiling.requiredBy,
    );
  });

  it("shows no resubmission note when priorAmendments is null", () => {
    expect(card.shadowRoot?.querySelector(".note")).toBeNull();
  });
});

describe("the previous value", () => {
  it("shows it where the wire carries one, and not where it does not", () => {
    const withPrevious: EvidenceCardRequest = {
      ...firstFiling,
      affidavit: {
        ...firstFiling.affidavit,
        fields: [
          firstFiling.affidavit.fields[0]!,
          { ...firstFiling.affidavit.fields[1]!, previousValue: 25 },
          ...firstFiling.affidavit.fields.slice(2),
        ],
      },
    };

    const card = mount(withPrevious);
    const rows = [...(card.shadowRoot?.querySelectorAll(".field") ?? [])];

    expect(rows[0]?.querySelector(".previous")).toBeNull();
    expect(rows[1]?.querySelector(".previous")?.textContent).toContain("25");
    expect(rows[1]?.textContent).toContain("40");
  });
});

describe("flagging evidence a reviewer should not skim past", () => {
  it("flags a field whose source is Empty and whose confidence is zero", () => {
    const unsourced: EvidenceCardRequest = {
      ...firstFiling,
      affidavit: {
        ...firstFiling.affidavit,
        fields: [
          {
            name: "owner",
            kind: "text",
            value: null,
            previousValue: null,
            provenance: {
              current: {
                source: "Empty",
                confidence: 0,
                note: null,
                at: "2026-09-04T09:00:00.000Z",
                conversationTurn: null,
                binding: null,
              },
              prior: [],
            },
            isMandatory: true,
          },
        ],
      },
    };

    const card = mount(unsourced);
    const row = card.shadowRoot?.querySelector(".field");

    expect(row?.getAttribute("data-flagged")).toBe("true");
    expect(row?.querySelector(".badge")?.getAttribute("data-source")).toBe("Empty");
    expect(row?.querySelector(".flag")?.textContent).toContain("No source and no confidence");
    expect(row?.querySelector(".value-null")?.textContent).toBe("empty");
  });

  it("does not flag a well-sourced field", () => {
    const card = mount(firstFiling);
    const rows = [...(card.shadowRoot?.querySelectorAll(".field") ?? [])];
    expect(rows.map((row) => row.getAttribute("data-flagged"))).toEqual([
      "false",
      "false",
      "false",
      "false",
    ]);
  });

  it("renders an agent-proposed value as text, never as markup", () => {
    const hostile: EvidenceCardRequest = {
      ...firstFiling,
      affidavit: {
        ...firstFiling.affidavit,
        fields: [
          {
            ...firstFiling.affidavit.fields[0]!,
            value: "<img src=x onerror=alert(1)>",
          },
        ],
      },
    };

    const card = mount(hostile);

    expect(card.shadowRoot?.querySelector("img")).toBeNull();
    expect(shadowText(card)).toContain("<img src=x onerror=alert(1)>");
  });
});

describe("rendering a resubmission", () => {
  it("lists the amendments a reviewer already made", () => {
    const card = mount(resubmission);
    const note = card.shadowRoot?.querySelector(".note");

    expect(note).not.toBeNull();
    expect(note?.textContent).toContain("Resubmission");
    expect(note?.textContent).toContain("status");
    expect(note?.textContent).toContain("Retired");
  });
});

describe("the decision event", () => {
  it("fires approve with no amendments when nothing was typed", () => {
    const card = mount(firstFiling);
    const seen = decisions(card);

    button(card, "approve").click();

    expect(seen).toEqual([{ docketId: firstFiling.docketId, decision: "approve", amendments: {} }]);
  });

  it("fires reject with no amendments even when something was typed", () => {
    const card = mount(firstFiling);
    const seen = decisions(card);

    type(amendControl(card, "status"), "Retired");
    button(card, "reject").click();

    expect(seen).toEqual([{ docketId: firstFiling.docketId, decision: "reject", amendments: {} }]);
  });

  it("fires amend when a reviewer typed a replacement and then approved", () => {
    const card = mount(firstFiling);
    const seen = decisions(card);

    type(amendControl(card, "status"), "Retired");
    type(amendControl(card, "amount"), "80");
    button(card, "approve").click();

    expect(seen).toHaveLength(1);
    expect(seen[0]?.decision).toBe("amend");
    expect(seen[0]?.docketId).toBe(firstFiling.docketId);
    // "amount" is a number field, so its amendment leaves as a number.
    expect(seen[0]?.amendments).toEqual({ status: "Retired", amount: 80 });
  });

  it("ignores whitespace-only typing", () => {
    const card = mount(firstFiling);
    const seen = decisions(card);

    type(amendControl(card, "status"), "   ");
    button(card, "approve").click();

    expect(seen[0]?.decision).toBe("approve");
    expect(seen[0]?.amendments).toEqual({});
  });

  it("keeps unparseable text for a number field rather than sending NaN", () => {
    const card = mount(firstFiling);
    const seen = decisions(card);

    type(amendControl(card, "amount"), "heavy");
    button(card, "approve").click();

    expect(seen[0]?.amendments).toEqual({ amount: "heavy" });
  });

  it("says on the button what pressing it would send", () => {
    const card = mount(firstFiling);
    expect(button(card, "approve").textContent).toBe("Approve");

    type(amendControl(card, "status"), "Retired");
    expect(button(card, "approve").textContent).toBe("Approve with amendments");

    type(amendControl(card, "status"), "");
    expect(button(card, "approve").textContent).toBe("Approve");
  });

  it("crosses the shadow boundary and bubbles, so a host can listen on an ancestor", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const card = document.createElement(EVIDENCE_CARD_TAG_NAME);
    host.append(card);
    card.request = firstFiling;

    const seen: EvidenceCardDecisionDetail[] = [];
    document.body.addEventListener(EVIDENCE_CARD_DECISION_EVENT, (event) => {
      seen.push((event as CustomEvent<EvidenceCardDecisionDetail>).detail);
    });

    button(card, "approve").click();

    expect(seen).toHaveLength(1);
  });

  it("emits nothing when there is no affidavit to decide on", () => {
    const card = mount(null);
    const seen = decisions(card);
    expect(card.shadowRoot?.querySelector("button")).toBeNull();
    expect(seen).toEqual([]);
  });
});

describe("the readonly attribute", () => {
  it("hides the controls and leaves the evidence", () => {
    const card = mount(firstFiling, { readonly: "" });

    expect(card.shadowRoot?.querySelectorAll("button")).toHaveLength(0);
    expect(card.shadowRoot?.querySelectorAll("input")).toHaveLength(0);
    expect(card.shadowRoot?.querySelectorAll("select")).toHaveLength(0);
    expect(shadowText(card)).toContain("Conversation");
  });

  it("brings the controls back when it is removed", () => {
    const card = mount(firstFiling, { readonly: "" });
    card.removeAttribute("readonly");

    expect(card.shadowRoot?.querySelectorAll("button")).toHaveLength(2);
  });
});

describe("the src attribute", () => {
  it("fetches the envelope and renders it", async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify(firstFiling), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const card = mount(null, { src: "/api/docket/current" });

    await vi.waitFor(() => {
      expect(shadowText(card)).toContain("Conversation");
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/docket/current");
    expect(card.request?.docketId).toBe(firstFiling.docketId);
  });

  it("says so, visibly, when the fetch fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 503, statusText: "Service Unavailable" })),
    );

    const card = mount(null, { src: "/api/docket/current" });

    await vi.waitFor(() => {
      expect(shadowText(card)).toContain("Could not load the evidence");
    });
    expect(shadowText(card)).toContain("503");
  });
});

describe("a payload that is not an evidence card request", () => {
  function alertText(card: HTMLElement): string {
    return card.shadowRoot?.querySelector('[role="alert"]')?.textContent ?? "";
  }

  it.each([
    ["priorAmendments", "priorAmendments is missing"],
    ["affidavit.fields", "affidavit.fields is missing or not an array"],
    [
      "requiresConfirmation",
      "requiresConfirmation is missing or not a boolean, on the envelope or the affidavit",
    ],
    ["docketId", "docketId is missing or not a string"],
  ])("set as the request property with %s missing says why, and does not throw", (path, reason) => {
    const card = mount(null);

    expect(() => {
      card.request = without(firstFiling, path) as EvidenceCardRequest;
    }).not.toThrow();

    expect(alertText(card)).toContain(reason);
    expect(alertText(card)).toContain("Cannot show this evidence card");
    expect(card.request).toBeNull();
  });

  it("names the field when a field inside the affidavit is malformed", () => {
    const broken = JSON.parse(JSON.stringify(firstFiling)) as EvidenceCardRequest;
    // @ts-expect-error deliberately malformed: the wire is not to be trusted.
    delete broken.affidavit.fields[1].provenance;

    const card = mount(null);
    card.request = broken;

    expect(alertText(card)).toContain("affidavit.fields[1] has no provenance object");
  });

  it("says why when warnings is present but not an array", () => {
    const card = mount(null);
    card.request = { ...firstFiling, warnings: "oops" } as unknown as EvidenceCardRequest;
    expect(alertText(card)).toContain("warnings is present but not an array");
  });

  it("says why when presentation is present but not an array", () => {
    const card = mount(null);
    card.request = { ...firstFiling, presentation: "oops" } as unknown as EvidenceCardRequest;
    expect(alertText(card)).toContain("presentation is present but not an array");
  });

  it("says why when a presentation entry has no name", () => {
    const card = mount(null);
    card.request = {
      ...firstFiling,
      presentation: [{ allowedValues: ["a"] }],
    } as unknown as EvidenceCardRequest;
    expect(alertText(card)).toContain("presentation[0] has no name");
  });

  it("leaves the shadow root showing something a person can read, never blank", () => {
    const card = mount(null);
    card.request = without(firstFiling, "affidavit.fields") as EvidenceCardRequest;

    // The regression: the shadow root used to be left holding only <style>.
    expect(card.shadowRoot?.childElementCount).toBeGreaterThan(1);
    expect(shadowText(card).trim()).not.toBe("");
  });

  it("recovers when a good payload arrives after a bad one", () => {
    const card = mount(null);
    card.request = without(firstFiling, "affidavit.fields") as EvidenceCardRequest;
    card.request = firstFiling;

    expect(card.shadowRoot?.querySelector('[role="alert"]')).toBeNull();
    expect(shadowText(card)).toContain("Conversation");
  });

  it("fetched through src, says why in an alert rather than throwing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify(without(firstFiling, "affidavit.fields")), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
      ),
    );

    const card = mount(null, { src: "/api/docket/current" });

    await vi.waitFor(() => {
      expect(alertText(card)).toContain("Could not load the evidence");
    });
    expect(alertText(card)).toContain("affidavit.fields is missing or not an array");
    expect(card.request).toBeNull();
  });

  it("fetched through src, says so when the response is not JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response("<!doctype html><title>login</title>", {
            status: 200,
            headers: { "content-type": "text/html" },
          }),
      ),
    );

    const card = mount(null, { src: "/api/docket/current" });

    await vi.waitFor(() => {
      expect(alertText(card)).toContain("the response was not JSON");
    });
    expect(card.request).toBeNull();
  });

  it("announces every failure with role=alert", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 503, statusText: "Service Unavailable" })),
    );

    const card = mount(null, { src: "/api/docket/current" });

    await vi.waitFor(() => {
      expect(alertText(card)).toContain("503");
    });
    expect(card.shadowRoot?.querySelector('p[role="alert"]')).not.toBeNull();
  });
});

describe("the three confidence numbers (AF-2)", () => {
  function totals(card: HTMLElement): string {
    return card.shadowRoot?.querySelector(".totals")?.textContent ?? "";
  }

  it("shows all three when the envelope and the affidavit agree", () => {
    const card = mount(firstFiling);

    expect(totals(card)).toContain("Aggregate confidence");
    expect(totals(card)).toContain("Populated fields");
    expect(totals(card)).toContain("Empty fields");

    const meters = [...(card.shadowRoot?.querySelectorAll('[role="meter"]') ?? [])];
    // One per field, the aggregate, and the populated minimum.
    expect(meters).toHaveLength(firstFiling.affidavit.fields.length + 2);
    expect(meters.at(-1)?.getAttribute("aria-valuenow")).toBe("0.60");
    expect(card.shadowRoot?.querySelector(".totals .total:last-child strong")?.textContent).toBe(
      "0",
    );
  });

  it("shows an empty-field count of zero rather than hiding it", () => {
    // `firstFiling` already carries `emptyFieldCount: 0` (AF-2) — `0` is an
    // answer, "nothing is unsourced", and a reviewer who cannot see the count
    // cannot tell the difference between that and a producer that never said.
    const card = mount(firstFiling);
    expect(totals(card)).toContain("Empty fields");
    expect(card.shadowRoot?.querySelector(".totals .total:last-child strong")?.textContent).toBe(
      "0",
    );
  });

  it("shows only the aggregate when neither the envelope nor the affidavit carries the other two", () => {
    const bare = without(
      firstFiling,
      "populatedConfidence",
      "emptyFieldCount",
      "affidavit.populatedConfidence",
      "affidavit.emptyFieldCount",
    ) as EvidenceCardRequest;
    const card = mount(bare);

    expect(totals(card)).toContain("Aggregate confidence");
    expect(totals(card)).not.toContain("Populated fields");
    expect(totals(card)).not.toContain("Empty fields");
    expect([...(card.shadowRoot?.querySelectorAll('[role="meter"]') ?? [])]).toHaveLength(
      firstFiling.affidavit.fields.length + 1,
    );
  });

  it("still reads them off the affidavit when the envelope omits them", () => {
    const affidavitOnly = without(
      firstFiling,
      "populatedConfidence",
      "emptyFieldCount",
    ) as EvidenceCardRequest;
    const card = mount({
      ...affidavitOnly,
      affidavit: { ...affidavitOnly.affidavit, populatedConfidence: 0.5, emptyFieldCount: 1 },
    });

    expect(totals(card)).toContain("Populated fields");
    expect(card.shadowRoot?.querySelector(".totals .total:last-child strong")?.textContent).toBe(
      "1",
    );
  });

  it("prefers the envelope over the affidavit when the two disagree", () => {
    const card = mount({
      ...firstFiling,
      populatedConfidence: 0.9,
      emptyFieldCount: 2,
      affidavit: {
        ...firstFiling.affidavit,
        populatedConfidence: 0.1,
        emptyFieldCount: 9,
      },
    });

    const meters = [...(card.shadowRoot?.querySelectorAll('[role="meter"]') ?? [])];
    expect(meters.at(-1)?.getAttribute("aria-valuenow")).toBe("0.90");
    expect(card.shadowRoot?.querySelector(".totals .total:last-child strong")?.textContent).toBe(
      "2",
    );
  });

  it("invents nothing from a value that is not a number", () => {
    const card = mount({
      ...firstFiling,
      populatedConfidence: "0.9",
      emptyFieldCount: Number.NaN,
      affidavit: {
        ...firstFiling.affidavit,
        populatedConfidence: "0.9",
        emptyFieldCount: Number.NaN,
      },
    } as unknown as EvidenceCardRequest);

    expect(totals(card)).not.toContain("Populated fields");
    expect(totals(card)).not.toContain("Empty fields");
  });
});

describe("an entry no decision will be accepted on", () => {
  it("says so, where a reviewer cannot miss it", () => {
    const card = mount({
      ...firstFiling,
      blocked: { code: "requirement-not-implemented", level: "MultiParty" },
    });

    const banner = card.shadowRoot?.querySelector(".blocked");
    expect(banner?.textContent).toContain("No decision on this entry will be accepted");
    expect(banner?.textContent).toContain("MultiParty");
    expect(banner?.getAttribute("role")).toBe("alert");
  });

  it("names the uncovered category when that is why", () => {
    const card = mount({
      ...firstFiling,
      blocked: { code: "coverage-refused", category: "provider-executed", toolName: "x" },
    });

    expect(card.shadowRoot?.querySelector(".blocked")?.textContent).toContain("provider-executed");
  });

  it("shows no banner on an entry a person can decide", () => {
    expect(mount(firstFiling).shadowRoot?.querySelector(".blocked")).toBeNull();
    expect(
      mount({ ...firstFiling, blocked: null }).shadowRoot?.querySelector(".blocked"),
    ).toBeNull();
  });
});

describe("presentation hints (v0.1)", () => {
  let card: HTMLElement;

  beforeEach(() => {
    card = mount(presentationHints);
  });

  it("shows an enum field's closed set as readable text", () => {
    expect(shadowText(card)).toContain("One of: Draft, Active, Retired");
  });

  it("renders a field with allowedValues as a <select>, not a text input with a placeholder", () => {
    const control = amendControl(card, "status");
    expect(control.tagName).toBe("SELECT");
    const options = [...control.querySelectorAll("option")].map((option) => option.textContent);
    expect(options).toEqual(["leave blank to accept", "Draft", "Active", "Retired"]);
  });

  it("keeps a field with no allowedValues as a text input", () => {
    expect(amendControl(card, "dueOn").tagName).toBe("INPUT");
  });

  it("sets the pattern attribute from presentation[].pattern", () => {
    expect(amendControl(card, "amount").getAttribute("pattern")).toBe("^\\d+(\\.\\d{1,2})?$");
  });

  it("sends the picked option back as the amendment", () => {
    const seen = decisions(card);

    type(amendControl(card, "status"), "Retired");
    button(card, "approve").click();

    expect(seen[0]?.decision).toBe("amend");
    expect(seen[0]?.amendments).toEqual({ status: "Retired" });
  });

  it("sends a numeric enum's amendment as a number, not the string a <select> always returns", () => {
    const numericField: AffidavitField = {
      name: "priority",
      kind: "enum",
      value: 2,
      previousValue: null,
      provenance: {
        current: {
          source: "Conversation",
          confidence: 0.8,
          note: "Literally present in the turn: priority",
          at: "2026-09-04T09:00:00.000Z",
          conversationTurn: null,
          binding: null,
        },
        prior: [],
      },
      isMandatory: false,
    };
    const numericCard: EvidenceCardRequest = {
      ...presentationHints,
      affidavit: { ...presentationHints.affidavit, fields: [numericField] },
      presentation: [{ name: "priority", allowedValues: [1, 2, 3] }],
    };

    const priorityCard = mount(numericCard);
    const seen = decisions(priorityCard);

    type(amendControl(priorityCard, "priority"), "3");
    button(priorityCard, "approve").click();

    expect(seen[0]?.amendments).toEqual({ priority: 3 });
  });
});

describe("warnings from the envelope", () => {
  it("renders each line from request.warnings", () => {
    const card = mount({
      ...firstFiling,
      warnings: ["CV-4: this proposal is on the record and cannot be approved through the gate."],
    });

    const list = card.shadowRoot?.querySelector(".warnings");
    expect(list?.textContent).toContain("CV-4");
    expect(list?.querySelectorAll("li")).toHaveLength(1);
  });

  it("shows nothing when warnings is an empty array", () => {
    const card = mount({ ...firstFiling, warnings: [] });
    expect(card.shadowRoot?.querySelector(".warnings")).toBeNull();
  });

  it("shows nothing when warnings is absent, same as an empty array", () => {
    expect(mount(firstFiling).shadowRoot?.querySelector(".warnings")).toBeNull();
  });
});

describe("a card with neither presentation nor warnings", () => {
  it("renders cleanly: no warnings list, every amend control a plain text input", () => {
    const card = mount(firstFiling);

    expect(card.shadowRoot?.querySelector(".warnings")).toBeNull();
    const controls = [...(card.shadowRoot?.querySelectorAll("[data-field]") ?? [])];
    expect(controls).toHaveLength(firstFiling.affidavit.fields.length);
    expect(controls.every((node) => node.tagName === "INPUT")).toBe(true);
  });
});

describe("the 0.0.1-seed fallback (kept for the shipped .NET framework, until it aligns)", () => {
  it("renders operationType, entityType and entityId exactly as the host sent them", () => {
    const card = mount(legacyFirstFiling);
    const text = shadowText(card);
    expect(text).toContain("WriteUpdate");
    expect(text).toContain("Widget");
    expect(text).toContain("W-1");
  });

  it("does not throw and shows no alert — the seed shape validates on its own", () => {
    const card = mount(legacyFirstFiling);
    expect(card.shadowRoot?.querySelector('[role="alert"]')).toBeNull();
  });

  it("reads a closed set and a pattern off the field itself, with no envelope presentation array", () => {
    const card = mount(legacyFirstFiling);

    expect(shadowText(card)).toContain("One of: Active, Retired");
    expect(amendControl(card, "Status").tagName).toBe("SELECT");
    expect(amendControl(card, "Weight").getAttribute("pattern")).toBe("^\\d+(\\.\\d+)?$");
  });

  it("reads a tag's reviewer sentence off `evidence`, the seed's spelling of `note`", () => {
    const text = shadowText(mount(legacyFirstFiling));
    expect(text).toContain("User stated: Status");
    expect(text).toContain("Extracted from search_widget");
  });

  it("still matches a picked option back to send an amendment", () => {
    const card = mount(legacyFirstFiling);
    const seen = decisions(card);

    type(amendControl(card, "Status"), "Retired");
    button(card, "approve").click();

    expect(seen[0]?.decision).toBe("amend");
    expect(seen[0]?.amendments).toEqual({ Status: "Retired" });
  });
});

describe("the demo fixture", () => {
  it("is the vendored v0.1 presentation-hints fixture, unedited", () => {
    const demo = readFileSync(join(packageRoot, "demo", "fixture.json"), "utf8");
    const vendored = readFileSync(join(v01Dir, "04-presentation-hints.json"), "utf8");
    expect(demo).toBe(vendored);
  });
});
