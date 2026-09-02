# Architecture (detailed)

See [`../ARCHITECTURE.md`](../ARCHITECTURE.md) for the full rationale and
layer diagram. This page adds the mapping from the original Andalusia
template to this project's structure, for anyone comparing the two.

## Template → Planning & Monitoring mapping

| Original template | This project | Change |
|---|---|---|
| `src/app/` (bootstrap, routing, providers, layouts) | `src/app/` | Split `routes.tsx` → `routes/index.tsx`; extracted `navigation/navItems.ts` out of `MainLayout`; renamed `layouts/` → `layout/`; added reserved `configuration/`, `guards/` |
| `src/core/` (auth, permissions, power-platform, logging, errors, config) | `src/infrastructure/` | Pure rename — same responsibilities, matches the target spec's naming. `power-platform/client` moved to `dataverse/client/` |
| `src/features/collection/` (placeholder demo for a Collections/Offers app) | `src/features/{strategy-formulation,financial,target-setting}/` | Old demo domain removed; replaced with real per-developer module scaffolds (no business logic yet) |
| `src/shared/` | `src/shared/` | Unchanged |
| `src/generated/` | `src/generated/` | Unchanged location and content (only removed 2 stray, non-generated lines from `index.ts` that referenced nonexistent `Offer.model`/`OffersService`) |

## Why `infrastructure/dataverse/` has no per-entity repositories yet

The template's own `ARCHITECTURE.md` mandates an adapter/application-service
boundary in front of generated services, but no feature owns real logic yet
in this phase (business logic is explicitly out of scope for the
architecture-establishment pass). Each developer adds their feature's
adapter under `features/<module>/services/` when they start real work — see
[`dataverse.md`](dataverse.md).

## Why `authentication/`, `http/`, and `app/configuration|guards/` are README-only

The target architecture names these folders, but the template has no real
code for any of them: the Power Apps host handles auth, there's no custom
HTTP client, and no env/config loader or route guard exists. Creating empty
abstractions with no real implementation would violate `AGENTS.md`'s "no fake
repositories/APIs, no premature abstraction" rule. The folders exist (with a
short README each) so the target shape is discoverable; real code goes in
when a concrete need appears.
