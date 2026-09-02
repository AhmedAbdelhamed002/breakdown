# Dataverse Architecture

## The chain

Every feature accesses Dataverse through the same one-way chain — never
directly from a component:

```
Feature Page/Component
      ↓
Feature Hook
      ↓
Feature Application Service   (features/<module>/services/)
      ↓
Dataverse Repository / Generated Service Adapter
      ↓
Generated Service              (src/generated/services/ — READ-ONLY)
      ↓
Power Apps Code Apps SDK       (src/infrastructure/dataverse/client/powerAppsClient.ts)
      ↓
Dataverse
```

Concretely, for each module:

```
Strategy Formulation Feature → Strategy Service → Dataverse Repository / Generated Service → Dataverse
Financial Feature             → Financial Service → Dataverse Repository / Generated Service → Dataverse
Target Setting Feature        → Target Service    → Dataverse Repository / Generated Service → Dataverse
```

## Where things live

- **`src/generated/`** — CLI-owned, read-only. Location is fixed by the Power
  Apps CLI (`npx power-apps add-data-source` regenerates here) — never move
  it, even conceptually into `infrastructure/`.
- **`src/infrastructure/dataverse/client/powerAppsClient.ts`** — the SDK
  bootstrap (`initializePowerApps`), used once by
  `app/providers/PowerAppsProvider.tsx`. Not a data-access layer by itself.
- **`features/<module>/services/`** — where each developer's application
  service lives, wrapping the generated service(s) their feature needs, and
  where feature-specific business rules and mapping happen.
- **`infrastructure/dataverse/`** — only for adapters over data that is
  genuinely cross-feature reference data (not owned by any one of the three
  modules). Don't default here — propose it explicitly before adding an
  adapter that isn't obviously shared.

## Adding a new Dataverse table

1. `npx power-apps add-data-source` (requires `pac auth create` +
   `pac env select` first — see `README.md`).
2. Inspect the generated model and service — do not edit them.
3. Create an application service/adapter under your feature
   (`features/<module>/services/`).
4. Add a feature-level model/mapper if the Dataverse shape shouldn't leak
   into the UI as-is.
5. Keep generated code untouched.

## SDK version note

`src/generated/services/BusinessunitsService.ts` and `SystemusersService.ts`
call SDK functions — `serializeMultiSelectPicklistFields`,
`deserializeMultiSelectPicklistFields`, `uploadFileToRecord`,
`downloadImageFromRecord`, `deleteFileOrImageFromRecord` — that only exist in
`@microsoft/power-apps` `1.1.1`+. `package.json` pins `^1.2.13` for this
reason. If a future `add-data-source` regenerates against a different SDK
version, re-check that the pin still matches (`npm run typecheck` will tell
you immediately if it doesn't) instead of hand-editing the generated files.
