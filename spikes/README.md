# spikes

Throwaway experiments live here — a spike is a package that answers one question
(does X work on workerd? how does adapter Y behave?) and is deleted or promoted
once it has. Nothing in this directory is published.

The pnpm workspace includes `spikes/*`, so a spike may depend on the packages in
`packages/*` with `"workspace:*"` and is built and tested by the same commands.
