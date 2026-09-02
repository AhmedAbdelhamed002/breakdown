# strategy-formulation

**Owner:** Developer 1

Strategy Formulation UI, business logic, services, models, Dataverse
integration, and components live here exclusively.

Shape: `pages/ components/ services/ models/ hooks/ utils/ constants/` +
`index.ts` (public API — only export what other modules/`app` are allowed to
import).

Do not import internal files from `features/financial/*` or
`features/target-setting/*` — only their `index.ts`. See `docs/module-ownership.md`.
