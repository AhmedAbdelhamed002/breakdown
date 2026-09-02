# Architecture

## Why this architecture

The single most important decision in this project:

**The UI must never know that data comes from Dataverse directly.**

Every read/write flows through a fixed chain, and the direction is one-way:

```
Page
 ↓
Hook
 ↓
Application Service
 ↓
Infrastructure Adapter
 ↓
Generated Service
 ↓
Power Platform SDK
 ↓
Dataverse
```

Architecture here exists to **protect us from change**, not to create work.
The only abstraction we insist on from day one is:

```
Generated Code
      ↑
   Adapter / Application Service
      ↑
        UI
```

That single boundary lets us change the implementation later without touching the UI.

## Layers

```
┌──────────────────────────────────────────────────────────────┐
│                       APP / UI LAYER                         │
│  Pages • Layouts • Components • Shared UI                    │
└─────────────────────────────┬────────────────────────────────┘
                              ▼
┌──────────────────────────────────────────────────────────────┐
│                        HOOKS LAYER                           │
│  State • UI Logic • Effects • Data Fetching • Reusable Logic │
└─────────────────────────────┬────────────────────────────────┘
                              ▼
┌──────────────────────────────────────────────────────────────┐
│                   APPLICATION SERVICES                       │
│  Use Cases • Validation • Mapping • Business Orchestration  │
└─────────────────────────────┬────────────────────────────────┘
                              ▼
┌──────────────────────────────────────────────────────────────┐
│                  INFRASTRUCTURE ADAPTERS                     │
│  Generated-Service Wrappers • Error Handling • Logging      │
└─────────────────────────────┬────────────────────────────────┘
                              ▼
┌──────────────────────────────────────────────────────────────┐
│                POWER PLATFORM / CODE APP SDK                 │
│       @microsoft/power-apps • Connectors • Client APIs       │
└─────────────────────────────┬────────────────────────────────┘
                              ▼
┌──────────────────────────────────────────────────────────────┐
│                         DATAVERSE                            │
│ Tables • Relationships • Security • Plugins • Business Rules│
└──────────────────────────────────────────────────────────────┘
```

## Feature-based, not layer-based

With three modules owned by three different developers, top-level
`services/`, `components/`, `hooks/` folders become a shared-edit bottleneck
and a merge-conflict magnet. Instead, each business domain is isolated end to
end:

```
features/
  strategy-formulation/   pages/ components/ hooks/ services/ models/ utils/ constants/  (Developer 1)
  financial/               pages/ components/ hooks/ services/ models/ utils/ constants/  (Developer 2)
  target-setting/          pages/ components/ hooks/ services/ models/ utils/ constants/  (Developer 3)
```

Each feature exposes only an `index.ts` — its public API. Other modules
(including `app/`) import from that barrel, never from a feature's internal
files. See [`docs/module-ownership.md`](docs/module-ownership.md).

## Generated ≠ Application code

`src/generated/` is treated as an **external dependency**. It is read-only
and its location is fixed by the Power Apps CLI tooling — it is not moved
under `infrastructure/` even conceptually it belongs to that layer.
Application/feature services wrap generated services so that use cases like
`getStrategyObjectives()`, `approveBudget()`, `setTarget()` live in feature
code — not in generated CRUD calls made directly from components.

## infrastructure vs shared vs features

- **`infrastructure/`** (was `core/` in the original template — renamed to
  match this project's target architecture; same role) — cross-cutting
  infrastructure: `dataverse/` (the Power Apps SDK client + the
  generated-code boundary), `logging/`, `errors/`, and reserved folders
  (`authentication/`, `http/`, `configuration/`) for when a real cross-cutting
  need appears. Never feature-specific.
- **`shared/`** — generic, reusable UI + utilities with zero business
  meaning (e.g. `DataTable`, `EmptyState`, `useAsync`, `formatCurrency`).
  Must not depend on any `features/*`. See [Shared Code Rule](#shared-code-rule).
- **`features/<name>/`** — everything specific to that module: pages,
  components, services, models, hooks, utils, constants.

Rule: don't put something in `shared/` or `infrastructure/` just because you
don't know where it goes. If it encodes a Strategy/Financial/Target rule, it
lives inside that feature.

## Shared Code Rule

A piece of code belongs in `shared/` only if it is generic, reusable, not
business-specific, and stable (`Button`, `Modal`, `DataTable`, `Loading`,
`ErrorState`, `Pagination`, date/formatting utilities). Feature-specific
components/services (a Strategy KPI widget, a Financial calculation service,
a Target evaluation service) stay inside their feature, even if another
feature could plausibly reuse a piece of it later — promote it to `shared/`
only when it's actually needed elsewhere and has been generalized.

## Dependency direction

```
App
 │
 ├── Features  →  Shared  →  Infrastructure
 └── (never the reverse, and never Feature A → Feature B directly)
```

Forbidden:
- `Infrastructure → Features`
- `Shared → Features`
- `Feature A → Feature B` internal files (only via the other feature's `index.ts`, and only when a cross-module contract is genuinely required — propose it first, don't just import)

## Alignment with Microsoft Code Apps

This matches Microsoft's own model: generated models/services and the Power
Apps client library are part of the base infrastructure; the host handles
runtime, auth, and loading; and adding a Dataverse datasource auto-generates
the models/services via the Power Apps CLI.

## Known deviation from the original template

The original template used `core/` for this layer and described a
"one isolated copy per developer, no shared repo" workflow. This project
renamed `core/` → `infrastructure/` (pure rename, same responsibilities) and
replaced that workflow with the shared-repo/branch/PR model in
[`docs/git-workflow.md`](docs/git-workflow.md), because three developers now
share one Dataverse-backed app instead of each maintaining a detached fork.
