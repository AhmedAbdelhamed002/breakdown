# Module Ownership

| Module | Path | Owner | Responsible for |
|---|---|---|---|
| Strategy Formulation | `src/features/strategy-formulation/` | Developer 1 | UI, business logic, services, models, Dataverse integration, components for Strategy Formulation |
| Financial | `src/features/financial/` | Developer 2 | UI, business logic, services, models, Dataverse integration, components for Financial |
| Target Setting | `src/features/target-setting/` | Developer 3 | UI, business logic, services, models, Dataverse integration, components for Target Setting |
| `src/app/`, `src/shared/`, `src/infrastructure/`, `package.json`, routing/config files | — | Technical owner (shared/controlled) | Application shell, generic reusable code, cross-cutting infrastructure |

## Rules

1. **Stay in your folder.** Strategy-specific code never lives in `shared/`,
   `app/`, or `infrastructure/` — only in `features/strategy-formulation/`
   (same rule for Financial and Target Setting). See "Shared Code Rule" in
   `ARCHITECTURE.md`.
2. **Public API only.** Other modules import a feature only via its
   `index.ts`. Never reach into another feature's `services/`, `models/`,
   etc. directly.
3. **No feature-to-feature imports** unless a cross-module contract is
   genuinely required — if so, stop and propose the cleanest shared contract
   (usually: promote the shared piece to `shared/` or `infrastructure/`,
   or expose it explicitly via the owning feature's `index.ts`) rather than
   importing an internal file.
4. **Shared-area changes need review from the technical owner.** Changes to
   `app/`, `shared/`, `infrastructure/`, `package.json`, `tsconfig.json`,
   `vite.config.ts`, or CI config should be small and reviewed — these are
   the highest-conflict, highest-blast-radius files in the repo.
5. **No circular ownership.** `Strategy → Financial → Target → Strategy` (or
   any cycle) is forbidden by construction — features only depend on
   `shared`/`infrastructure`, never on each other, except via an explicitly
   agreed public contract.
