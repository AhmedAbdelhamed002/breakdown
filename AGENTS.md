# Code App Engineering Guidelines

## 1. Project Context
This is a production Power Apps Code App built with:
- React
- TypeScript
- Power Apps Code Apps SDK
- Dataverse
- Power Platform connectors

The application follows a feature-based architecture with strict separation
between UI, application logic, infrastructure, and generated Power Platform code.

Three developers share this one repository, each owning one feature module —
see [`docs/module-ownership.md`](docs/module-ownership.md) and
[`docs/git-workflow.md`](docs/git-workflow.md) before making cross-cutting
changes.

---

## 2. Golden Rules
1. Follow the existing architecture.
2. Do not introduce new architectural patterns without approval.
3. Do not modify generated code manually.
4. Do not move or rename generated files.
5. Do not access generated services directly from UI components.
6. Do not put business logic inside UI components.
7. Do not put Dataverse calls inside components.
8. Prefer small, focused files.
9. Reuse existing shared components before creating new ones.
10. Do not create duplicate utilities, hooks, or services.
11. Keep features isolated from each other.
12. Do not add dependencies unless there is a clear reason.

---

## 3. Folder Responsibilities

### /app
Application bootstrap, routing (`routes/`), navigation (`navigation/`),
layout (`layout/`), providers (`providers/`), and reserved `configuration/`
and `guards/` folders for when a real cross-cutting need appears there.

### /features
Business functionality, one owner per module:
- `strategy-formulation/` — Developer 1
- `financial/` — Developer 2
- `target-setting/` — Developer 3

Each feature contains its own:
- pages
- components
- hooks
- services
- models
- utils
- constants
- `index.ts` — the ONLY files other modules may import from this feature

### /infrastructure
Cross-cutting infrastructure (named `core/` in the original template — same
role, renamed to match this project's target architecture):
- `dataverse/` — the Power Apps SDK client + the generated-code boundary
- `logging/`
- `errors/`
- `authentication/`, `http/`, `configuration/` — reserved, currently
  documentation-only; add real code only when a concrete need exists

### /shared
Generic reusable UI and utilities.
Shared code must not depend on business features.

### /generated
Automatically generated Power Platform code.
This folder is READ-ONLY for application developers.
Never manually modify generated files.

---

## 4. Dependency Direction
Allowed dependency flow:

UI
→ Hooks
→ Application Services
→ Infrastructure Adapters
→ Generated Services / Power Platform SDK
→ Data Source

Do not reverse this dependency direction.

Forbidden:
- Generated → Features
- Dataverse → UI
- Component → Generated
- Shared → Feature
- Infrastructure → Feature
- Feature A → Feature B internal files (only via that feature's `index.ts`, and only when a cross-module contract is genuinely required)

---

## 5. Components
Components are responsible primarily for presentation and UI interaction.
Components should not:
- call Dataverse directly
- call generated services directly
- contain large business rules
- contain complex data-access logic

Keep components small and reusable.

---

## 6. Hooks
Hooks are responsible for:
- UI state
- UI behavior
- side effects
- reusable feature logic
- coordinating application services

Hooks should not contain low-level Dataverse access.
Use application services for data access.

---

## 7. Application Services
Application services represent application use cases.
Examples:
- getStrategyObjectives
- createFinancialBudget
- approveTarget
- rejectTarget
- searchStrategyObjectives

Application services may perform:
- validation
- mapping
- orchestration
- business rules that belong to the client

Sensitive business rules must remain server-side.

---

## 8. Generated Services
Generated services are infrastructure.
Use them through application/infrastructure adapters.
Never expose generated service types throughout the entire application
unless there is a strong reason.
Prefer application-level models and types.

---

## 9. Data Mapping
Do not expose Dataverse-specific models everywhere.
Prefer:

Dataverse Model
→ Mapper
→ Application Model
→ UI

This keeps the application independent from datasource details.

---

## 10. Adding a New Feature
Before implementing a new feature:
1. Inspect the existing architecture.
2. Identify reusable components/hooks/services.
3. Identify required data sources.
4. Identify existing generated models/services.
5. Propose files to create or modify.
6. Do not modify unrelated features.

Then implement the feature.

---

## 11. Adding a New Dataverse Table
Use the official Power Apps CLI workflow to add the datasource.
Do not manually create generated models/services.
After generation:
1. Inspect the generated model.
2. Inspect the generated service.
3. Create an application-level service/adapter.
4. Create application types if needed.
5. Add mapping when datasource models should not leak upward.
6. Keep generated code untouched.

---

## 12. Before Writing Code
For non-trivial tasks, first provide:

### Plan
- What will change?
- Why?
- Which files will be created?
- Which files will be modified?

Do not make architectural changes silently.
For small, obvious changes, implementation can proceed directly.

---

## 13. Code Quality
Use:
- TypeScript strict typing
- meaningful names
- small functions
- single responsibility
- reusable hooks
- reusable components
- explicit interfaces/types
- proper error handling

Avoid:
- any
- duplicated logic
- giant components
- giant hooks
- magic strings
- unnecessary abstractions
- premature optimization

---

## 14. React Rules
Prefer functional components.
Use hooks appropriately.
Do not use hooks conditionally.
Do not use useMemo/useCallback without a clear reason.
Keep effects focused and predictable.
Avoid unnecessary state.
Prefer derived values over duplicated state.

---

## 15. Error Handling
Data-access errors must be handled consistently.
Do not silently swallow errors.
Use the application's shared error-handling mechanism.
UI components should display user-friendly messages,
while technical details should be logged appropriately.

---

## 16. Security
Never hardcode:
- secrets
- tokens
- credentials
- environment-specific sensitive values

Never rely on client-side authorization alone.
Server-side / Dataverse security remains authoritative.

---

## 17. AI Behavior
The AI must act as an implementation assistant, not as the architect.
The AI must preserve the existing architecture.
Before creating a new folder or architectural pattern,
explain why it is needed.
Never rewrite large parts of the project unless explicitly requested.
Prefer incremental changes.
Reuse existing code before creating new code.
Do not modify generated files.
Do not refactor unrelated code while implementing a feature.

---

## 18. Definition of Done
A feature is considered complete only when:
- TypeScript compiles
- linting passes
- existing functionality is not broken
- errors are handled
- architecture rules are respected
- generated code was not modified manually
- unnecessary duplication was avoided
- tests are added where appropriate
