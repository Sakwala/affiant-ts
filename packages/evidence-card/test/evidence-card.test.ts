import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EvidenceCardRequest } from "@affiant/contract";

import "../src/register.js";
import type { EvidenceCardDecisionDetail } from "../src/index.js";
import { EVIDENCE_CARD_DECISION_EVENT, EVIDENCE_CARD_TAG_NAME } from "../src/index.js";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const wireDir = join(packageRoot, "..", "contract", "protocol", "fixtures", "wire");

function wireFixture(name: string): EvidenceCardRequest {
  return JSON.parse(readFileSync(join(wireDir, `${name}.json`), "utf8")) as EvidenceCardRequest;
}

const firstFiling = wireFixture("evidence-card-request");
const resubmission = wireFixture("evidence-card-request-resubmission");

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

function amendInput(card: HTMLElement, field: string): HTMLInputElement {
  const found = card.shadowRoot?.querySelector<HTMLInputElement>(`input[data-field="${field}"]`);
  if (!found) throw new Error(`no amend input for ${field}`);
  return found;
}

function type(input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event("input"));
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
    expect(text).toContain("WriteUpdate");
    expect(text).toContain("Widget");
    expect(text).toContain("W-1");
  });

  it("labels the card for assistive technology", () => {
    const section = card.shadowRoot?.querySelector("section");
    expect(section?.getAttribute("aria-label")).toBe("Evidence card: WriteUpdate on Widget W-1");
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

  it("shows the previous value where the wire carries one, and not where it does not", () => {
    const rows = [...(card.shadowRoot?.querySelectorAll(".field") ?? [])];
    expect(rows[0]?.querySelector(".previous")).toBeNull();
    expect(rows[1]?.querySelector(".previous")?.textContent).toContain("10");
    expect(rows[1]?.textContent).toContain("12.5");
  });

  it("exposes every confidence as a meter with its value", () => {
    const meters = [...(card.shadowRoot?.querySelectorAll('[role="meter"]') ?? [])];
    // One per field, plus the aggregate in the footer.
    expect(meters).toHaveLength(firstFiling.affidavit.fields.length + 1);
    expect(meters.map((node) => node.getAttribute("aria-valuenow"))).toEqual([
      "1.00",
      "0.90",
      "0.95",
    ]);
    for (const node of meters) {
      expect(node.getAttribute("aria-valuemin")).toBe("0");
      expect(node.getAttribute("aria-valuemax")).toBe("1");
    }
  });

  it("shows an enum field's closed set and each tag's evidence line", () => {
    const text = shadowText(card);
    expect(text).toContain("One of: Active, Retired");
    expect(text).toContain("User stated: Status");
    expect(text).toContain("Extracted from search_widget");
  });

  it("marks a mandatory field as required", () => {
    const rows = [...(card.shadowRoot?.querySelectorAll(".field") ?? [])];
    expect(rows[0]?.querySelector(".mandatory")).not.toBeNull();
    expect(rows[1]?.querySelector(".mandatory")).toBeNull();
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

describe("flagging evidence a reviewer should not skim past", () => {
  it("flags a field whose source is Empty and whose confidence is zero", () => {
    const unsourced: EvidenceCardRequest = {
      ...firstFiling,
      affidavit: {
        ...firstFiling.affidavit,
        fields: [
          {
            name: "Owner",
            value: null,
            previousValue: null,
            provenance: {
              current: { source: "Empty", confidence: 0, evidence: null, conversationTurn: null },
              prior: [],
            },
            isMandatory: true,
            kind: "text",
            allowedValues: null,
            pattern: null,
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
    expect(rows.map((row) => row.getAttribute("data-flagged"))).toEqual(["false", "false"]);
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
    expect(note?.textContent).toContain("Status");
    expect(note?.textContent).toContain("Retired");
    expect(note?.textContent).toContain("Weight");
    expect(note?.textContent).toContain("15");
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

    type(amendInput(card, "Status"), "Retired");
    button(card, "reject").click();

    expect(seen).toEqual([{ docketId: firstFiling.docketId, decision: "reject", amendments: {} }]);
  });

  it("fires amend when a reviewer typed a replacement and then approved", () => {
    const card = mount(firstFiling);
    const seen = decisions(card);

    type(amendInput(card, "Status"), "Retired");
    type(amendInput(card, "Weight"), "15");
    button(card, "approve").click();

    expect(seen).toHaveLength(1);
    expect(seen[0]?.decision).toBe("amend");
    expect(seen[0]?.docketId).toBe(firstFiling.docketId);
    // "Weight" is a number field, so its amendment leaves as a number.
    expect(seen[0]?.amendments).toEqual({ Status: "Retired", Weight: 15 });
  });

  it("ignores whitespace-only typing", () => {
    const card = mount(firstFiling);
    const seen = decisions(card);

    type(amendInput(card, "Status"), "   ");
    button(card, "approve").click();

    expect(seen[0]?.decision).toBe("approve");
    expect(seen[0]?.amendments).toEqual({});
  });

  it("keeps unparseable text for a number field rather than sending NaN", () => {
    const card = mount(firstFiling);
    const seen = decisions(card);

    type(amendInput(card, "Weight"), "heavy");
    button(card, "approve").click();

    expect(seen[0]?.amendments).toEqual({ Weight: "heavy" });
  });

  it("says on the button what pressing it would send", () => {
    const card = mount(firstFiling);
    expect(button(card, "approve").textContent).toBe("Approve");

    type(amendInput(card, "Status"), "Retired");
    expect(button(card, "approve").textContent).toBe("Approve with amendments");

    type(amendInput(card, "Status"), "");
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
    expect(shadowText(card)).toContain("UserStated");
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
      expect(shadowText(card)).toContain("UserStated");
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
  /** The fixture with one required key removed, however deep it sits. */
  function without(path: string): unknown {
    const copy = JSON.parse(JSON.stringify(firstFiling)) as Record<string, unknown>;
    const segments = path.split(".");
    const last = segments.pop() as string;
    let node = copy;
    for (const segment of segments) {
      node = node[segment] as Record<string, unknown>;
    }
    delete node[last];
    return copy;
  }

  function alertText(card: HTMLElement): string {
    return card.shadowRoot?.querySelector('[role="alert"]')?.textContent ?? "";
  }

  it.each([
    ["priorAmendments", "priorAmendments is missing"],
    ["affidavit.fields", "affidavit.fields is missing or not an array"],
    ["affidavit.warnings", "affidavit.warnings is missing or not an array"],
    [
      "affidavit.requiresConfirmation",
      "affidavit.requiresConfirmation is missing or not a boolean",
    ],
    ["docketId", "docketId is missing or not a string"],
  ])("set as the request property with %s missing says why, and does not throw", (path, reason) => {
    const card = mount(null);

    expect(() => {
      card.request = without(path) as EvidenceCardRequest;
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

  it("leaves the shadow root showing something a person can read, never blank", () => {
    const card = mount(null);
    card.request = without("affidavit.fields") as EvidenceCardRequest;

    // The regression: the shadow root used to be left holding only <style>.
    expect(card.shadowRoot?.childElementCount).toBeGreaterThan(1);
    expect(shadowText(card).trim()).not.toBe("");
  });

  it("recovers when a good payload arrives after a bad one", () => {
    const card = mount(null);
    card.request = without("affidavit.fields") as EvidenceCardRequest;
    card.request = firstFiling;

    expect(card.shadowRoot?.querySelector('[role="alert"]')).toBeNull();
    expect(shadowText(card)).toContain("UserStated");
  });

  it("fetched through src, says why in an alert rather than throwing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify(without("affidavit.fields")), {
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

describe("the demo fixture", () => {
  it("is the vendored wire fixture, unedited", () => {
    const demo = readFileSync(join(packageRoot, "demo", "fixture.json"), "utf8");
    const vendored = readFileSync(join(wireDir, "evidence-card-request.json"), "utf8");
    expect(demo).toBe(vendored);
  });
});
