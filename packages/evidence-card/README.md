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

**Amending.** Every field gets an amend control. A field with no closed value set
gets a text box; a field the envelope's `presentation` gives an `allowedValues`
hint for gets a `<select>` instead, with one option per allowed value, so a
reviewer picks rather than retypes. A field with a `pattern` hint gets that
pattern on its text box's `pattern` attribute. Type or pick into any control and
the primary button becomes _Approve with amendments_; pressing it emits
`decision: "amend"` with only the fields that were touched. Whitespace-only
entries are ignored. A value picked from a closed set is sent back as the
underlying value that produced its label — a numeric enum's amendment is a
number, not the string a `<select>` always returns. Otherwise, a value for a
field whose `kind` is `"number"` is sent as a number when the typed text parses
as one, and as the typed text when it does not — never as `NaN`.

**Presentation, not substance.** `allowedValues` and `pattern` are hints the host
supplies on the card envelope's `presentation` array, never validated: a value
outside `allowedValues`, or not matching `pattern`, is still sent in an
amendment. A field with neither renders its amend control from its own `kind`
alone. For backward compatibility this element also reads a field's own
`allowedValues`/`pattern` and a tag's own `evidence` — the pre-v0.1
`0.0.1-seed` shape, kept only until the shipped .NET framework sends the
current wire.

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
describing a coloured bar. Amend controls — text box or `<select>` — carry their
own `aria-label`.

## The demo

`demo/` is the page published at the link above: the card, a read-only toggle and
a log of every `affiant-decision` event. It renders
`demo/fixture.json`, a copy of the pinned protocol's
`v0.1/evidence-card-request/04-presentation-hints.json` conformance fixture —
checked against that copy by a test in this package — chosen because it carries
both an `allowedValues` and a `pattern` hint, so the demo shows the `<select>`
and the pattern-masked input as well as a plain text field.

```bash
pnpm build                                   # builds the element and demo/dist
python3 -m http.server -d packages/evidence-card/demo/dist 8080
```

Every path in the built page is relative, so the same directory works from a local
server and from a project sub-path.

## Licence

Apache-2.0.
