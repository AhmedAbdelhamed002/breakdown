# CI / Deployment

## CI (implemented)

`.github/workflows/ci.yml` runs on every push and every Pull Request into
`develop`/`main`:

```
Checkout
   ↓
Install Dependencies (npm ci)
   ↓
Lint
   ↓
Type Check
   ↓
Build
   ↓
Unit Tests
```

A failing step blocks merge (branch protection should require this check —
set that up in the repo's GitHub settings once the workflow is on `main`).

All four steps (lint, typecheck, build, test) pass as of the baseline commit.

## Deployment (not implemented yet)

Production deployment is intentionally out of scope for this phase. When
it's needed:
- Decide how `power.config.json` / `environmentId` differs between
  dev/test/prod environments.
- Decide how/where the built `dist/` is published to the Power Platform
  environment (via `pac`/CLI in a CD job, or manual release).
- Add a separate `deploy.yml` (or a deploy job gated on the `main` branch)
  once that process is agreed — don't add deployment automation
  speculatively.
