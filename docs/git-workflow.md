# Git Workflow

One shared repository, branch model:

```
main
  │
  └── develop
        │
        ├── feature/strategy-*
        ├── feature/financial-*
        └── feature/target-*
```

Examples: `feature/strategy-objectives`, `feature/strategy-kpi-management`,
`feature/financial-budget`, `feature/financial-calculations`,
`feature/target-kpi`, `feature/target-setting`.

**Never commit directly to `main` or `develop`.** All changes go through a
Pull Request into `develop`. `main` only receives merges from `develop` at a
release point.

## PR flow

```
Create feature branch off develop
        ↓
Implement a small, focused change
        ↓
Pull / rebase latest develop
        ↓
Run: npm run typecheck && npm run lint && npm run test && npm run build
        ↓
Push
        ↓
Open Pull Request into develop
        ↓
CI runs (see docs/deployment.md for what it checks)
        ↓
Code review — shared-area changes (app/, shared/, infrastructure/, package.json, config) need the technical owner's review
        ↓
Merge
```

Before opening a PR, make sure your branch is rebased on the latest
`develop` — this is what prevents an old branch from silently overwriting
newer work from one of the other two developers.

## Conflict prevention

Since the three developers work in different feature directories
(`features/strategy-formulation/`, `features/financial/`,
`features/target-setting/`), most changes won't conflict. The remaining
conflict-prone spots are the shared files:

- `src/app/routes/index.tsx`, `src/app/navigation/navItems.ts` — every
  feature adds one route + one nav entry here
- `src/app/`, `src/shared/`, `src/infrastructure/`
- `package.json`, `package-lock.json`
- `tsconfig.json`, `vite.config.ts`
- CI config (`.github/workflows/`)

To minimize friction:
- Keep changes to shared files small and self-contained (e.g. one route line).
- Pull/rebase frequently, not just before opening a PR.
- Get review from the technical owner for any shared/infrastructure change.
- Don't batch unrelated shared-file changes into a feature PR.
