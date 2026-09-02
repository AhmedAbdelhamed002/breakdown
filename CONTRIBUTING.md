# Contributing

This repo is shared by three developers, each owning one feature module. See
[`docs/module-ownership.md`](docs/module-ownership.md) for who owns what and
[`docs/git-workflow.md`](docs/git-workflow.md) for branching/PR rules before
you start.

## Adding to your feature
1. Work only inside your owned `features/<your-module>/` folder:
   `pages/ components/ hooks/ services/ models/ utils/ constants/`.
2. Reuse existing shared components/hooks (`src/shared/`) before creating new ones.
3. Add your route in `src/app/routes/index.tsx` and your nav entry in
   `src/app/navigation/navItems.ts` — these are shared files, so keep the diff
   to just your one line and expect to rebase if another developer touched
   them too.
4. Export only what other code should use from your `index.ts`.
5. Keep features isolated — no `features/<yours>/... → features/<other>/<internal file>` imports. If you genuinely need something from another module, import it from that module's `index.ts`, or raise it for a shared/infrastructure home instead.

## Adding a new Dataverse datasource
1. Use the Power Apps CLI to add the datasource — this generates models/services under `src/generated/`.
2. **Never** edit generated files by hand.
3. Create an application service/adapter under your feature (`features/<your-module>/services/`), or under `infrastructure/dataverse/` only if the entity is genuinely cross-feature reference data — propose that explicitly rather than assuming.
4. Add a mapper/model under your feature if the Dataverse model should not leak upward into the UI.

## Touching shared/app/infrastructure
- Only if the code is truly generic and feature-agnostic (see
  "Shared Code Rule" in `ARCHITECTURE.md`).
- Must not import from any `features/*`.
- Keep the change small; these are the highest-conflict files in the repo.
  Pull/rebase before starting, and expect review from the technical owner of
  shared/infrastructure.

## Dependency direction (enforced)
```
UI → Hooks → Application Services → Adapters → Generated / SDK → Dataverse
Features → Shared → Infrastructure (never the reverse)
```
Never reverse it.

## Definition of Done
- `npm run typecheck` passes (see the known `src/generated/` SDK-mismatch
  issue in `README.md` if this fails for reasons unrelated to your change)
- `npm run lint` passes
- `npm run test` passes
- No generated files modified
- No unrelated refactors
- Errors handled via the shared mechanism
- Branch is rebased on latest `develop` before opening the PR
