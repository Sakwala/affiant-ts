/**
 * The review page: one Evidence Card, one note box, one decision.
 *
 * Everything on it is what a host would write. The card is a custom element with
 * its own shadow root, registered by loading the built module the workspace
 * already ships; the page hands it a request object and listens for one event.
 */

/** The path the built `@affiant/evidence-card` module tree is served under, after the run's prefix. */
export const ELEMENT_MOUNT = "/element";

/**
 * Renders the review page for one docket entry.
 *
 * `prefix` is the per-run secret path every route lives under, so the page's own
 * fetches have to carry it too; `amendable` is the list of fields the server will
 * accept an amendment for, which the page says out loud so a reviewer does not
 * type into a box whose value will be refused.
 */
export function renderPage(docketId: string, prefix: string, amendable: readonly string[]): string {
  const id = JSON.stringify(docketId);
  const base = JSON.stringify(prefix);
  const amendableText =
    amendable.length === 0
      ? "No field of this call can be amended here."
      : `Only ${amendable.join(", ")} can be amended here — <code>path</code> and <code>preview</code> are evidence about the write, not parameters of it, so an amendment to either is refused and this entry stays open.`;
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Affiant &middot; review a proposed write</title>
    <style>
      :root {
        color-scheme: light dark;
        --page: #f6f7f8;
        --ink: #16191d;
        --muted: #5d666f;
        --line: #dfe3e7;
        --panel: #ffffff;
        --ok: #1f7a45;
        --no: #a3282f;
      }
      @media (prefers-color-scheme: dark) {
        :root {
          --page: #0e1114;
          --ink: #e6eaee;
          --muted: #98a2ac;
          --line: #262c33;
          --panel: #14181c;
          --ok: #5fce92;
          --no: #ef8a8f;
        }
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        padding: 36px 20px 64px;
        background: var(--page);
        color: var(--ink);
        font: 15px/1.6 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      }
      main { max-width: 760px; margin: 0 auto; display: grid; gap: 24px; }
      h1 { margin: 0; font-size: 20px; font-weight: 650; letter-spacing: -0.01em; }
      .lede { margin: 8px 0 0; color: var(--muted); max-width: 64ch; }
      .meta {
        margin: 10px 0 0;
        color: var(--muted);
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 12.5px;
      }
      label.note { display: grid; gap: 6px; font-size: 13px; color: var(--muted); }
      textarea {
        width: 100%;
        min-height: 70px;
        padding: 10px 12px;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: var(--panel);
        color: var(--ink);
        font: inherit;
        resize: vertical;
      }
      #outcome {
        margin: 0;
        padding: 14px 16px;
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 10px;
        white-space: pre-wrap;
      }
      #outcome:empty { display: none; }
      #outcome.ok { border-color: var(--ok); color: var(--ok); }
      #outcome.no { border-color: var(--no); color: var(--no); }
      footer { color: var(--muted); font-size: 13px; }
      footer a { color: inherit; }
      code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.95em; }
    </style>
    <script type="module" src="${prefix}${ELEMENT_MOUNT}/register.js"></script>
  </head>
  <body>
    <main>
      <header>
        <h1>A coding agent wants to write to a file</h1>
        <p class="lede">
          Below is the evidence behind it, field by field: the value it proposes, the value that is
          there now, where each value came from and how confident that source is. Nothing is written
          until you decide, and this page is served by the hook process on your own machine — closing
          it without deciding lets the review lapse, which denies the write.
        </p>
        <p class="meta">docket <span id="docket"></span> &middot; closes <span id="deadline">…</span></p>
      </header>

      <section aria-label="The proposed write">
        <affiant-evidence-card id="card"></affiant-evidence-card>
      </section>

      <p class="lede">${amendableText}</p>

      <label class="note">
        A note for the agent (optional — it is what the agent is told when you reject)
        <textarea id="note" placeholder="e.g. wrong file; put the helper in src/lib/ instead"></textarea>
      </label>

      <p id="outcome" role="status" aria-live="polite"></p>

      <footer>
        <a href="https://github.com/Sakwala/affiant-ts">Sakwala/affiant-ts</a> &middot;
        <a href="https://affiant.dev">affiant.dev</a>
      </footer>
    </main>

    <script type="module">
      const docketId = ${id};
      const base = ${base};
      const card = document.querySelector("#card");
      const note = document.querySelector("#note");
      const outcome = document.querySelector("#outcome");
      document.querySelector("#docket").textContent = docketId;

      function say(text, tone) {
        outcome.textContent = text;
        outcome.className = tone ?? "";
      }

      let deadline = null;
      function tick() {
        if (deadline === null) return;
        const left = Math.max(0, deadline - Date.now());
        const seconds = Math.floor(left / 1000);
        document.querySelector("#deadline").textContent =
          left === 0
            ? "the window has closed"
            : "in " + String(Math.floor(seconds / 60)) + "m " + String(seconds % 60) + "s";
        if (left === 0 && !card.readOnly) {
          card.readOnly = true;
          say("The review window closed without a decision. The write was denied — approval is never assumed.", "no");
        }
      }

      const response = await fetch(base + "/entries/" + encodeURIComponent(docketId), {
        headers: { accept: "application/json" },
      });
      if (!response.ok) {
        say("Could not load the docket entry: " + response.status, "no");
      } else {
        const entry = await response.json();
        card.request = entry.request;
        deadline = Date.parse(entry.request.requiredBy);
        tick();
        setInterval(tick, 1000);
        if (entry.status !== "pending") {
          card.readOnly = true;
          say("This entry is already " + entry.status + ". A docket entry is decided once.", "no");
        }
      }

      card.addEventListener("affiant-decision", async (event) => {
        const { decision, amendments } = event.detail;
        card.readOnly = true;
        say("Sending…");
        try {
          // The JSON content type is what keeps this endpoint out of the browser's
          // simple-request set, so it is required by the server, not decoration.
          const posted = await fetch(base + "/decision/" + encodeURIComponent(docketId), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              docketId,
              decision,
              amendments,
              reason: note.value.trim() === "" ? null : note.value.trim(),
            }),
          });
          const body = await posted.json();
          if (!posted.ok) {
            // 400 means the amendment could not be applied and nothing was spent:
            // the entry is still open, so hand the card back rather than freezing it.
            if (posted.status === 400) card.readOnly = false;
            say("Refused: " + (body.error ?? posted.status), "no");
            return;
          }
          // Only an approval is good news. An amended approval says so; anything
          // else takes the "no" tone, because it is not what the reviewer asked for.
          say(
            body.status === "approved"
              ? (body.amended ? "Recorded as approved, with your amendment." : "Recorded as approved.") +
                  " You can close this tab — the agent has its answer."
              : "Recorded as " + body.status + ". You can close this tab — the agent has its answer.",
            body.status === "approved" ? "ok" : "no",
          );
        } catch (cause) {
          say("Could not reach the hook process: " + String(cause), "no");
        }
      });
    </script>
  </body>
</html>
`;
}
