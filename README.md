# Planning & Monitoring — Code App

A production Power Apps Code App (React + TypeScript + Dataverse) built on a
feature-based architecture with a strict dependency boundary between the UI and
generated Power Platform code.

## Stack
- React 18 + TypeScript (strict)
- Power Apps Code Apps SDK (`@microsoft/power-apps`)
- Vite
- React Router
- Dataverse (via generated models/services)

---

## Team model

This is **one shared repository** for three developers working concurrently
on three modules:

| Module | Owner | Path |
|---|---|---|
| Strategy Formulation | Developer 1 | `src/features/strategy-formulation/` |
| Financial | Developer 2 | `src/features/financial/` |
| Target Setting | Developer 3 | `src/features/target-setting/` |

`src/app/`, `src/shared/`, and `src/infrastructure/` are shared/controlled
areas — see [`docs/module-ownership.md`](docs/module-ownership.md) before
touching them. Branching and PR flow are in
[`docs/git-workflow.md`](docs/git-workflow.md).

## Getting started

### 1. Clone the repo
```bash
git clone https://github.com/Rashed1812/Planning-Monitoring-.git
cd Planning-Monitoring-/andalusia-codeapp
```

### 2. Install dependencies
```bash
npm install
```

### 3. Connect to the Power Platform environment (one-time, per developer)
You need auth + access to the Andalusia environment before local data works:
```bash
pac auth create          # sign in with your Power Platform account
pac env select --environment <environment-id>
```
> Ask the team lead for the correct `environment-id` if you don't have it.
> This step is per-developer/per-machine — `.power/` is git-ignored on
> purpose (see [`docs/dataverse.md`](docs/dataverse.md)).

### 4. Initialize the code app (if not already initialized)
```bash
npx power-apps init
```
This creates `power.config.json` and the `.power/` folder locally.
(`.power/` and `node_modules/` are git-ignored — never commit them.)

### 5. Run locally
```bash
npm run dev
```
Open the **Local Play** URL (not the plain localhost URL) in the *same browser
profile* as your Power Platform tenant.

### 6. Add your Dataverse data source
```bash
npx power-apps add-data-source
```
This generates typed models/services under `src/generated/`.
**Never edit generated files by hand** — regenerate them via the CLI.

---

## Scripts
- `npm run dev` — start dev server
- `npm run build` — typecheck + production build
- `npm run typecheck` — TypeScript only
- `npm run lint` — ESLint
- `npm run test` — Vitest

---

## Project layout
```
src/
├── app/             bootstrap, routing, navigation, layout, providers, guards, configuration
├── features/        strategy-formulation/ · financial/ · target-setting/ (one owner each)
├── shared/           generic reusable UI + utilities (no business logic)
├── infrastructure/   cross-cutting infra (dataverse, logging, errors, authentication, http, configuration)
└── generated/        auto-generated Power Platform code (READ-ONLY)
```

## Read before contributing
- [`ARCHITECTURE.md`](ARCHITECTURE.md) — why the architecture is shaped this way
- [`AGENTS.md`](AGENTS.md) — the engineering contract (also governs any AI assistant)
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — how to add features / datasources / components
- [`docs/module-ownership.md`](docs/module-ownership.md) — who owns what
- [`docs/git-workflow.md`](docs/git-workflow.md) — branching + PR flow
- [`docs/dataverse.md`](docs/dataverse.md) — Dataverse access chain
- [`docs/coding-standards.md`](docs/coding-standards.md)
- [`docs/deployment.md`](docs/deployment.md)
- [`docs/strategy-formulation-spec.md`](docs/strategy-formulation-spec.md) — data model, wizard flow, and business rules extracted from the legacy Strategy Formulation web resource

## Generated code
`src/generated/` is treated as an external dependency and is **read-only**.
Regenerate it via the Power Apps CLI; never edit it by hand.

> `@microsoft/power-apps` is pinned to `^1.2.13` — the generated services use
> SDK functions (`serializeMultiSelectPicklistFields`,
> `deserializeMultiSelectPicklistFields`, `uploadFileToRecord`,
> `downloadImageFromRecord`, `deleteFileOrImageFromRecord`) that only exist
> from `1.1.1` onward. Don't downgrade below that without checking
> `src/generated/` still compiles.
