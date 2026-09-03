# @affiant/evidence-card

`<affiant-evidence-card>` — a dependency-free custom element that renders one
[Affiant](https://affiant.dev) **Affidavit** for a person to approve, amend or
reject.

An Affidavit is the evidence behind a database write an LLM agent has proposed:
per field, the value it wants to write, the value that is there now, where the
value came from and how confident it is. The card's job is to let a reviewer say
yes, no or "not that value" in a few seconds — and to make a field with no source
or no confidence impossible to skim past.

**Try it:** <https://sakwala.github.io/affiant-ts/>

> **Not on npm yet.** It lives in this repository and is consumed through the
> workspace. Publishing is a separate, deliberate step.

## No framework

No Lit, no React, no runtime dependency of any kind. It is one class extending
`HTMLElement` with its own open shadow root, so it drops into a React app, a Blazor
page, a Rails view or a plain HTML file the same way.

Importing it where there is no DOM — a server-side render, a bundler, a Node test
— is safe: it registers nothing and throws nothing, and the element defines itself
when the same bundle reaches a browser.

Every value on the card is written with `textContent`, never `innerHTML`. The
values were proposed by an agent; a card that rendered them as markup would be a
hole.

## Using it

Register the element and be done:

```ts
import "@affiant/evidence-card/register";
```

```html
<affiant-evidence-card src="/api/docket/current"></affiant-evidence-card>
```

Or hand it the envelope you already have, and register under your own tag name:

```ts
import { AffiantEvidenceCard } from "@affiant/evidence-card";
customElements.define("my-review-card", AffiantEvidenceCard);

const card = document.querySelector("my-review-card") as AffiantEvidenceCard;
card.request = requestFromTheWire; // an EvidenceCardRequest from @affiant/contract
```

Listen for the decision:

```ts
card.addEventListener("affiant-decision", (event) => {
  const { docketId, decision, amendments } = event.detail;
  // decision: "approve" | "reject" | "amend"
  // amendments: { [fieldName]: value }, empty unless decision is "amend"
});
```

The event is `composed` and bubbles, so a host can listen on any ancestor rather
than on each card.

### API

|                    |                                                                                                                   |
| ------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `request`          | property — the `EvidenceCardRequest` to render, or `null`. Setting it re-renders and clears any typed amendments. |
| `src`              | attribute and property — a URL the card `fetch`es the envelope from. A property set wins over an in-flight fetch. |
| `readonly`         | attribute, `readOnly` property — render the evidence with no buttons and no amendment inputs.                     |
| `affiant-decision` | event — `detail: { docketId, decision, amendments }`.                                                             |

**When the payload is wrong.** The card checks the envelope against every key the
pinned schemas require before it renders anything, and a payload that does not fit
— a missing key, a fetch that fails, a response that is not JSON — becomes a
visible `<p role="alert">` inside the shadow root naming the reason. It never
throws at the host and never leaves a blank card, because a reviewer who sees
nothing has no way to know that something was about to be written. This is a
structural check, not schema validation; `@affiant/contract` ships the JSON
Schemas for that.

**Amending.** Every field gets a text box. Type into any of them and the primary
button becomes _Approve with amendments_; pressing it emits `decision: "amend"`
with only the fields that were typed into. Whitespace-only entries are ignored. A
value for a field whose `kind` is `"number"` is sent as a number when the typed
text parses as one, and as the typed text when it does not — never as `NaN`.

## Theming

Four custom properties, set on the element or any ancestor:

```css
affiant-evidence-card {
  --affiant-card-bg: #fff; /* the card's background */
  --affiant-card-fg: #16191d; /* body text */
  --affiant-accent: #2c6e4f; /* confidence, the approve control, focus rings */
  --affiant-warn: #a8530b; /* what a reviewer should look at twice */
}
```

The defaults follow the reader's own colour scheme, so a host that sets none still
gets a card that is readable on a light page and on a dark one.

## Accessibility

The card is a `<section>` with an `aria-label` naming the operation and the entity.
The controls are real `<button>`s. Every confidence — per field and in aggregate —
is a `role="meter"` with `aria-valuenow`, `aria-valuemin`, `aria-valuemax` and an
`aria-valuetext` percentage, so a screen reader announces the number rather than
describing a coloured bar. Amendment inputs carry their own `aria-label`.

## The demo

`demo/` is the page published at the link above: the card, a read-only toggle and
a log of every `affiant-decision` event. It renders
`conformance/fixtures/wire/evidence-card-request.json` from the pinned protocol
tag — a hand-authored example from the rulebook's seed fixtures, whose key set is
asserted against the shipped .NET serializer by the demo hosts' wire-shape tests.

```bash
pnpm build                                   # builds the element and demo/dist
python3 -m http.server -d packages/evidence-card/demo/dist 8080
```

Every path in the built page is relative, so the same directory works from a local
server and from a project sub-path.

## Licence

Apache-2.0.
