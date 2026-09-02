# infrastructure/configuration

Reserved for cross-cutting configuration/env-loading code (as opposed to
`app/configuration/`, which is for application-shell-level config). Nothing
lives here yet — `power.config.json` and `.power/` are consumed directly by
the Power Apps SDK/CLI today, not through custom code.
