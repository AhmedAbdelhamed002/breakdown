# infrastructure/dataverse

- `client/powerAppsClient.ts` — SDK bootstrap (`initializePowerApps`), used by
  `app/providers/PowerAppsProvider.tsx`.
- `src/generated/` (top-level, unchanged location — do not move it; the Power
  Apps CLI regenerates it there) holds the CLI-generated models/services. It
  is read-only application code, treated as an external dependency.

Feature modules must not call `src/generated/` services directly from
components or pages. Each feature owns its own application
service/adapter (under `features/<name>/services/`) that wraps the generated
service for its use cases — see `docs/dataverse.md` for the full chain and
`AGENTS.md` § 11 for the workflow when adding a new Dataverse table.

If a Dataverse entity is genuinely cross-feature reference data (not owned by
Strategy, Financial, or Target Setting specifically), its adapter belongs
here instead of inside one feature — propose this explicitly rather than
guessing.
