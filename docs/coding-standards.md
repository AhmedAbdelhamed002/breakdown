# Coding Standards

These extend `AGENTS.md` (the full engineering contract) with the specifics
that matter for a 3-developer shared repo.

## TypeScript
- `strict` mode is on — keep it on. No `any` without a comment explaining why.
- Prefer explicit interfaces/types for anything crossing a module boundary
  (a feature's `index.ts` exports, a service's return type).
- `noUnusedLocals` / `noUnusedParameters` are enforced — don't disable them.

## React
- Functional components + hooks only.
- Don't use hooks conditionally.
- Don't reach for `useMemo`/`useCallback` without a measured reason.
- Derive state where possible instead of duplicating it.

## File/module rules
- One default export per file where practical; named exports for utilities.
- A feature's only cross-module-visible file is `index.ts`. Keep it a thin
  barrel — re-export, don't implement logic there.
- Small, focused files over large multi-purpose ones — this matters more
  here than usual, since smaller files reduce merge-conflict surface between
  the three developers.

## Error handling
- Data-access errors go through `infrastructure/errors` (`AppError`) and are
  logged via `infrastructure/logging` (`logger`) — don't swallow errors
  silently, and don't invent a second error-handling mechanism per feature.
- UI shows user-friendly messages; technical detail goes to the logger.

## Naming
- Feature folders: kebab-case (`strategy-formulation`, `target-setting`).
- Components: PascalCase. Hooks: `useX`. Services: `XService` or verbs
  (`getX`, `createX`) matching the use case, not the CRUD operation.

## Linting & formatting
- `npm run lint` must pass before opening a PR.
- Don't disable ESLint rules inline without a one-line reason comment.

## Tests
- `npm run test` (Vitest) runs on every PR via CI.
- Pure logic (services, mappers, `shared/utils`) should have tests. UI
  smoke-level coverage is enough for pages/components in this phase.
