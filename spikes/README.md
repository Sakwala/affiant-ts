# spikes

Throwaway experiments live here — a spike is a package that answers one question
(does X work on workerd? how does adapter Y behave?) and is deleted or promoted
once it has. Nothing in this directory is published.

The pnpm workspace includes `spikes/*`, so a spike may depend on the packages in
`packages/*` with `"workspace:*"` and is built and tested by the same commands.

## Open spikes

- [`claude-code-hook`](./claude-code-hook) — a Claude Code `PreToolUse` hook that
  puts an Evidence Card in front of a coding agent's `Write`, `Edit` or
  `MultiEdit`. Time-boxed 2026-09-04 to 2026-09-18; it asks whether a field-level
  review card is wanted inside the coding loop.
