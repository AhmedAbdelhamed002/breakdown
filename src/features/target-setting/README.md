# target-setting

**Owner:** Developer 3

Target Setting UI, business logic, services, models, Dataverse integration,
and components live here exclusively.

Shape: `pages/ components/ services/ models/ hooks/ utils/ constants/` +
`index.ts` (public API — only export what other modules/`app` are allowed to
import).

Do not import internal files from `features/strategy-formulation/*` or
`features/financial/*` — only their `index.ts`. See `docs/module-ownership.md`.
