# Strategy Formulation — Technical & Business Specification

Extracted from the live production Dataverse web resource
`Strategy Formulation Module.html` (6,595 lines, single-file HTML/JS using
`Xrm.WebApi`/raw `fetch` against the Dataverse Web API). This is **not** a
mockup — it is the real, currently-deployed business logic for the Strategy
Formulation module, being reimplemented here as a React/TypeScript feature
(`src/features/strategy-formulation/`).

This document is the reference for that reimplementation. When behavior here
seems surprising, that surprise is almost always intentional — see section 6.

---

## 1. Dataverse entities/tables referenced

All entity logical names were declared once in the source's `E` schema map
and used exclusively through a `dv` helper (`dv.meta/retrieve/retrieveAll/
create/update/del/associate/...`). Metadata (`EntitySetName`,
`PrimaryNameAttribute`, `PrimaryIdAttribute`, nav-property names) was resolved
dynamically via `dv.meta`/`dv.navProps` rather than hardcoded almost
everywhere — the two exceptions are called out in section 6, item 11.

### Entities already wired (pm_*/strategy_kpis family)

| Logical name | Fields touched | Role |
|---|---|---|
| `pm_kpiachievment` | `pm_kpiachievmentid`, `pm_month`, `pm_year`, `pm_target`, `pm_actual`, `pm_kpi` (lookup→`strategy_kpis`), `pm_businessunit` (lookup→`businessunit`) | Monthly KPI **total** target/actual per Business Unit — written by the Targets step. No breakdown dimension is ever written here (`stf_kpiachievmentbreakdown` belongs to the separate Planning & Monitoring app). |
| `hr_function` | primary name (`hr_name`), `_hr_department_value` (FK) | Function master, filtered by department everywhere. |
| `strategy_kpis` | primary name, `strategy_kpitype` (Outcome/Output/Sub Outcome/Sub Output/Process/Sub Process/Input), `process_datasource` (0 Power App / 1 Dotcare / 2 Manual → "automated" flag), `cr18c_kpicode`, `_strategy_department_value`, `_strategy_function_value`, `strategy_aggregatetype` (989230000 Percentage→avg, 989230001 Value→sum) | Master KPI table; role (Outcome/Output/Process) is **always derived from this record**, never chosen by the user in the wizard. |
| `businessunit` | primary name, `_cr603_region_value` (FK) | Business Unit. |
| `systemuser` | `fullname`, `internalemailaddress`, `domainname`, `businessunitid`, `isdisabled`, `accessmode` | Every people-lookup (assignee, owner, actor, author, stakeholder, project roles). |

### New tables added for this feature (now wired as data sources)

| Logical name | Fields read/written | Business object |
|---|---|---|
| **`strategy_strategy`** | primary name; `strategy_strategydescription` (auto-composed SMART text); `stf_strategytrack` (1 Operational/2 Service); `stf_revisionstatus` (1‑7, see §3); `strategy_startdate`, `strategy_enddate`; `strategy_strategytype` (989230000 Departmental / 989230001 Market / 989230002 Specialty / 989230003 Service); `strategy_strategylevel` (620930000 New / 620930001 Continuing); `cr18c_specialty` (text); `stf_ObjectiveDepartment` (lookup→`stf_objectivedepartment`, **create-only**); `cr18c_Department` (lookup, **create-only**); `cr18c_BusinessUnit` (lookup→`businessunit`, create-only); `strategy_Region` (lookup→`crd04_regions`, create-only); `strategy_Function` (lookup→`hr_function`, create-only); `cr18c_Process`/`cr18c_Subprocess` (lookup→`strategy_process`); `stf_SupportiveFunction`, `stf_SupportedStrategy` (self-lookup), `stf_SupportedDepartment` (service track only); `strategy_KPI` (Primary/Outcome KPI lookup→`strategy_kpis`), `strategy_kpiactual`, `strategy_kpitarget`; `stf_approvedon`, `stf_ApprovedBy` (lookup→`systemuser`) | The Strategy record itself. |
| **`stf_organizationalobjective`** | primary name, `stf_title`, `stf_objectivedescription` (SMART, ≤2000 chars, client-enforced), `stf_objectivetype` (1 Cross-Departmental/Organizational, 2 Departmental — immutable after create), `stf_objectivestatus` (1 Active/2 Achieved/3 Deferred), `stf_year`, `stf_Department` (Lead), `stf_Function`, `stf_BU`, `stf_Region`, `stf_ParentTheme` (lookup→`stf_theme`), `stf_Owner` (lookup→`systemuser`), `stf_PrimaryKPI` (lookup→`strategy_kpis`), `stf_currentvalue`, `stf_targetvalue`, `stf_startdate`, `stf_enddate` | The Organizational/Departmental Objective. |
| **`stf_objectivedepartment`** | primary name (`"{title} · {dept}"`), `stf_OrganizationalObjective` (lookup), `stf_Department` (lookup) | Junction: a contributing department "coverage row" for an objective. Strategies attach here, not directly to the objective. |
| **`stf_strategykpi`** | primary name (copy of KPI label), `stf_Strategy`, `stf_KPI` | Junction linking a Strategy to a KPI. Tactics/POCs reference **this junction**, not the KPI directly (except pre-cluster in Bottom-Up — see §6.19). |
| **`stf_strategytactic`** | primary name, `stf_tacticdescription`, `stf_target`, `stf_currentbaseline`, `stf_neededbudget` (operational only), `stf_deadline`, `stf_tacticstatus` (1 Active/2 Completed/3 Cancelled), `stf_serviceexecutionmode` (service only, fixed TMS), `stf_TacticCategory` (lookup→`stf_executioncategory`), `stf_Assignee` (lookup→`systemuser`), `stf_Process` (operational only), `stf_StrategyKPI`, `stf_kpi` (direct KPI lookup, Bottom-Up only) | Committed execution item. |
| **`stf_strategypoc`** | primary name, `stf_pocdescription`, `stf_experimentscope` (`Region`/`Specialty`/`Both`), `stf_kpitargetvalue`, `stf_successduedate`, `stf_killcondition`, `stf_from`, `stf_to`, `stf_neededbudget` (operational only), `stf_pocstatus` (1 Active/2 Succeeded/3 Failed/4 Retired), `stf_serviceexecutionmode` (service only: TMS or Project), `stf_POCCategory`, `stf_Project` (lookup→`cr603_projects`), `stf_StrategyKPI`, `stf_Region`, `stf_Specialty`, `stf_kpi` (Bottom-Up only) | **POC = "Proof of Concept"** — an experimental initiative ("What is tested", "Kill Condition", "Experiment Scope", success = KPI reaching a target by a due date). **Not** "point of contact" or "plan of care". |
| **`stf_executioncategory`** | primary name, `stf_categoryscope` (1 Tactic/2 POC), `stf_strategytype` (its **own independent** option set: 1 Departmental/2 Market/3 Specialty/4 Service — do not confuse with `strategy_strategy.strategy_strategytype`) | Category dictionary, scoped by track × entity. |
| **`strategy_process`** | primary name, `_strategy_department_value`, `_strategy_mainprocess_value` (self-referencing FK for sub-processes) | Process / Sub-Process dictionary. |
| **`stf_theme`** | primary name, `stf_description` | Strategic Theme — top of the roll-up hierarchy Objectives attach to. |
| **`stf_revisioncomment`** | primary name (fixed `"Comment"`), `stf_type` (1 Comment/2 Change Request), `stf_attachlevel` (1 Strategy/2 Tactic/3 POC — **label only, no FK**, see §6.15), `stf_text`, `stf_status` (1 Open/2 Resolved), `stf_ParentStrategy`, `stf_Author` | Comments & Change Requests attached to a strategy. |
| **`stf_decisionlog`** | `stf_action` (1 Submitted…8 Re-approved), `stf_timestamp` (**client-generated**, see §6.16), `stf_note`, `stf_ParentStrategy`, `stf_Actor` | Governance/decision audit trail. |
| **`stf_alignmentsession`** | primary name, `stf_reason` (1 Insufficient Tactics/POCs, 2 KPI Deficit, 3 Cross-Departmental), `stf_sessionstate` (Not Started/Done/Cancelled), `stf_fiscalyear`, `stf_cycle`, `stf_ParentStrategy` | Alignment session request against a strategy. |
| **`stf_alignmentstakeholder`** | primary name, `stf_AlignmentSession`, `stf_Stakeholder` (lookup→`systemuser`), `stf_Department` (optional) | Needed stakeholder for an alignment session. |
| **`cr603_chklst_departments`** | primary name | Department master used everywhere. |
| **`crd04_regions`** | primary name / `crd04_id` | Region master. |
| **`crd04_specialties`** | `crd04_specialtiesid`, `crd04_title` | Specialty list used only by the POC's "Experiment Scope" picker (**different** from `cr301_specialtyksa_service_hub`, which feeds the Strategy's own "Specialty" strategy-type field). |
| **`cr301_specialtyksa_service_hub`** | primary name | Specialty list feeding the Strategy's own Specialty field (saved as free text into `cr18c_specialty`). |
| **`hx_tasks`** (external "TMS" module) | `hx_tasktitle`, `hx_status`, `hx_priority`, `hx_startdate`, `hx_duedate`, `hx_taskdescription`, `cr603_posturl` (SharePoint link), `hx_assignee`, `tms_directmanagerlkup`, `project_followup`, `hx_raisedby` (lookups→`systemuser`), `stf_sourcetactic`/`stf_sourcepoc` (back-links), `cr18c_tasksource` (fixed 989230005 = "Strategy"), `objectiv_maindepartmentkpi` (lookup→`strategy_kpis`), `objectiv_process` (lookup→`strategy_process`) | TMS task created from a Tactic/POC breakdown. Only tasks carrying `stf_sourcetactic`/`stf_sourcepoc` are visible to this module. Deferred to a later phase (execution tracking). |
| **`cr603_projects`** (external "Project Module") | `projm_subsubprojectname` (the **real** display name — not the metadata `PrimaryNameAttribute`), plus many category/role/date fields — see source for the full list | Project/Charter record created from "Create Project Request (Charter)" inside Add/Edit POC. Deferred to a later phase (project charter). |

### Deliberately not wired (unconfirmed / dead)

- **`and_company`**, **`cr603_entities`** — the original source code itself
  flags these as *unconfirmed guessed logical names* (it shows a one-time
  warning toast if the lookup fails). Only needed for the Project Charter
  dialog, which is deferred. Verify against the live schema before wiring.
- **`stf_alignmentline`** — declared in the schema map but never used
  anywhere in the source. Dead reference, do not add.

### Known risk: possible Department-table mismatch

`hr_function` is filtered by `_hr_department_value`, while every other
Department picker in the app uses `cr603_chklst_departments`. The source
assumes these are the same underlying table; if `hr_function.hr_Department`
actually targets a different table, every Department→Function cascade
(New Strategy, Objective dialog, KPI filters, Bottom-Up, Unassigned) would
silently return wrong/empty results with no visible error. **Verify this
against the live schema before implementing the cascading pickers.**

---

## 2. The wizard flow

Wizard state: `step`, `track`, `strategyId`, `revStatus`, a core-strategy
fields object, `kpis[]`, `tactics[]`, `pocs[]`, `targets{}`. Step list
branches by track:

- **Service:** Track → Support Link → Objective → KPIs → Service Tactics & POCs → Review & Submit (6 steps)
- **Operational:** Track → Objective & Strategy → Process → KPIs → Tactics & POCs → Targets → Review & Submit (7 steps)

**Track**: choose Operational vs Service. Once the strategy exists in
Dataverse (`strategyId` set), the track can **never** change again (see §6.6).
Choosing Service forces strategy type to Service (989230003); leaving Service
resets it to Departmental (989230000).

**Objective & Strategy** (operational only): Parent Objective (via the
`stf_objectivedepartment` junction — manager *selects*, cannot create one),
Department/Function (inherited from the objective), Strategy Name, Scope
(Region/BU — Region="Group" disables BU, see §6.2), Measurable & Achievable
(Primary/Outcome KPI + Current + Target — drives the SMART description),
Strategy Type/Level, conditional Specialty picker (type=Specialty only),
Start/End dates, and a **read-only, auto-composed** description (§6.5).
Nearly every field uses a **per-field** "locked after save" check rather than
a whole-record lock (§6.4). Continue calls the shared strategy-draft save,
which validates the full required-fields list (name, objective-department,
dept, fn, region, bu-unless-region-is-"Group", primary KPI, current, target,
specialty-if-type-Specialty, start, end) — this same validator is reused by
the Submit-for-Review action (see §2 closing note).

**Support Link** (service only): Strategy Name, Supportive Function (owner),
**Supported Operational Strategy** (single-select, filtered to operational
strategies in the same department — "supports exactly one operational
strategy", §6.7), auto-derived Supported Department/Linked Objective
(read-only), Business Unit (locked, derived from the picked strategy),
Start/End dates. Picking the supported strategy backfills
Function/BU/Department from it.

**Service Objective** (service only): pure display — shows the Linked
Objective/Supported Department/Supported Strategy inherited from Support
Link.

**Process** (operational only): Main Process (filtered to the strategy's
department) and Sub-Process (filtered to the chosen Main Process,
self-referencing lookup).

**KPIs** (both tracks): filter seed differs by track — operational uses its
own dept/fn; **service inherits the dept/fn of the SUPPORTED operational
strategy**, not its own. The Primary KPI chosen earlier is folded into the
same KPI list (marked primary) so it goes through the identical persist path
as any manually-added KPI. Each KPI's role (Outcome/Output/Process) and
"automated" flag are always **derived from the KPI record itself**, never
chosen by the user. **Validation:** operational strategies require **exactly
one** Outcome KPI (hard block on Continue, re-checked at submit — see §6.1);
service strategies have no such constraint. Removing an already-persisted KPI
requires confirmation and immediately deletes the junction row
(irreversible).

**Tactics & POCs** (shared Add/Edit dialogs for both tracks): Service
branching — Tactic's execution mode is locked to TMS-only and
Budget/Related-Process fields are hidden; POC's execution mode allows TMS
**or** Project, and Budget is hidden. Operational — Tactic shows Budget +
Related Process; POC always shows the "Related Project" block. Category
options are always fetched scoped by track × entity (§6.8). Tactic required
fields: name, KPI (from this strategy's own KPI list only), category,
assignee, target, deadline. POC required fields: name, KPI, category, scope
type + region/specialty (conditionally), KPI target value, success due date,
kill condition, from/to dates. On Continue, KPI junctions are persisted
first, then any Tactic/POC lacking an id is created.

**Targets** (operational only, → `pm_kpiachievment`): requires KPIs already
added and Start/End dates set; generates one column per calendar month
spanning Start→End inclusive, crossing year boundaries. On first load, two
auto-seed mechanisms run: load any BU that already has achievement rows for
these KPIs/years, and always add a tab for the strategy's own Business Unit
(even empty). Automated KPIs' inputs are disabled. Persisting does a fresh
existence check per KPI×BU×year immediately before writing, creating/updating
only where the value actually differs, skipping empty cells.

**Review & Submit**: summary table (Track/Strategy/Objective-or-Supports/
Department/KPIs/Tactics/POCs), governance badge + decision log, and action
buttons gated purely by `revStatus` (see §3).

**Important implementation note:** the required-fields validator for the
Objective & Strategy step must be a single shared function reused by both
that step's own Continue button and the Submit-for-Review action — some
entry paths (e.g. a bottom-up-created strategy reaching Review directly) can
skip the step's own validation, so the shared validator is the only thing
still blocking submission with required fields blank.

---

## 3. Status / approval workflow

Status values: `draft=1, submitted=2, review=3, changes=4, approved=5,
rejected=6, reopened=7`. Badge styling: 1→draft, 2→submitted, 3→review,
4→changes, 5→approved, 6→rejected, **7→reuses the "review" style** (no
distinct visual treatment).

- **Pending review** (status = submitted or review): the **entire** strategy
  (core fields, KPIs, Tactics, POCs) is locked read-only.
- **Locked** (pending review **or** approved): core details become read-only,
  but KPIs/Tactics/POCs/Targets can *still* be added — approved is a softer
  lock than submitted/review.

**Transitions:**
- **Submit for review**: requires the strategy to exist; re-validates the
  full required-fields list (jump back to step 1 if incomplete); requires a
  Main Process (operational only); requires exactly one Outcome KPI
  (operational, §6.1); requires ≥1 Tactic or POC total; persists
  tactics/pocs; sets status to review; logs `submitted`.
- **Approve**: confirm → status approved; additionally stamps approved-on/
  approved-by; logs `approved`.
- **Request changes**: prompts for a note → status changes; logs `changes`.
- **Reject**: **requires** a rationale (hard block if empty) → status
  rejected; logs `rejected`.
- **Reopen**: prompts for a scope note → status reopened; logs
  `reopenReq`. **No UI button anywhere triggers this in the source** — treat
  as an incomplete flow to finish deliberately, not to port silently as dead
  code (§6.14).

**No role/permission gate exists in the front end** — the Submit/Approve/
Reject buttons render purely based on current status, visible to whoever has
the record open. Any real approval-authority enforcement must come from
Dataverse security roles or be added explicitly in this app.

**Comments & Change Requests**: Type = Comment or Change Request; Change
Request is disabled once the strategy is Approved or Rejected. Raising a
Change Request **also** writes a decision-log row so it surfaces in
Governance too — plain Comments do not. Attach level (Strategy/Tactic/POC) is
a label only, with **no FK** to the specific record (§6.15). Resolve/Reopen
of a change request lives on a separate, cross-strategy Change Requests view
operating on all change-request rows across every strategy — not on the
per-strategy comments panel.

**Decision log**: every governance action appends a row with a
client-generated timestamp (§6.16) and the current user as actor; rendered
newest-first.

---

## 4. Role-based views

Only two roles are reachable via the role switcher: **Director**
("Organization Objectives") and **Dept Manager** ("Strategies").

- **Director view**: loads the full Objective→Department coverage tree.
  Filters: search, department, function, coverage state (all/gaps/covered).
  Each objective card shows every contributing department's operational
  strategies plus an aggregated "Service support" block. Director-only:
  "Create Objective", per-card "Edit", "Manage contributing departments".
- **Dept Manager view**: same underlying tree, oriented around authoring —
  cascading Department→Function→Objective→Strategy-Type filters, and a
  "Create New Strategy" action on each department coverage row that Director
  view lacks.
- **Supportive role**: fully coded in the source (a single supportive
  function's own service strategies, with a supported-department filter and
  "Create Service Strategy" action) but **unreachable** — the role switcher
  has no entry for it. Orphaned; a Service-function owner currently has no
  dedicated "my service strategies" screen. Worth resolving deliberately
  (either wire it up or drop it) rather than porting it as unreachable code.
- **Execution tracking, Change Requests, Alignment Sessions, Themes are not
  role-scoped at all** in the source — visible to anyone with the app open,
  narrowed only by client-side filters. (All deferred to a later phase here
  anyway.)

---

## 5. Secondary features (deferred — not in the current build phase)

These are documented for completeness but are **out of scope** for the
initial implementation (core wizard + approval workflow only):

- **Project Charter**: a 4-step mini-wizard (Basic Details, Categorization,
  Role Assignment, Review) opened from Add/Edit POC's "Related Project",
  writing to `cr603_projects` in two phases (scalars first, then
  person-lookup PATCHes resolved at runtime).
- **Execution tracking**: cross-strategy dataset joining Strategies → their
  Tactics/POCs → `hx_tasks` rows linked via `stf_sourcetactic`/
  `stf_sourcepoc`. Includes a task breakdown dialog and a task editor.
- **Excel export**: a picker UI feeding a row-builder that joins Objective/
  Department/KPI/Tactic/POC/Task data, written via a hand-rolled
  dependency-free `.xlsx`/ZIP writer (would use a library such as `exceljs`
  in this port rather than being hand-rewritten).
- **Target-setting periods** (`pm_kpiachievment`) is part of the Operational
  track's own wizard (section 2) and is **in scope**, distinct from the
  above.

---

## 6. Cross-cutting business rules and hidden constraints

These are the non-obvious invariants most likely to be silently broken during
reimplementation. Preserve them deliberately, don't "clean them up" as
apparent inconsistencies.

1. **Outcome-KPI-count rule**: operational strategies must carry **exactly
   one** Outcome-role KPI; service strategies have no such constraint.
   Enforced in three independent places (the KPIs step's own validation, its
   persist path, and Submit-for-Review) — all three need the same rule.
2. **Region "Group" gates Business Unit**: matches the Region's **display
   label** case-insensitively against the literal string `"group"` — not a
   stable key/flag column. Choosing Group disables and clears BU; the
   required-fields validator also stops requiring BU when Region is Group.
   This label-text match is fragile; preserve it exactly (or replace with a
   real flag column if one exists in the live schema) rather than assuming
   it's a bug.
3. **No native Strategy↔Business Unit relationship**: the Strategy's own
   Business Unit field is single-valued, but Targets lets users stage
   multiple BU tabs. A BU tab with zero saved monthly values has nothing
   persisting it and **silently disappears on reopen** — only achievement
   rows (and the strategy's own seeded BU) survive. This is a genuine
   modeling gap in the source to resolve deliberately (real junction, or
   accept the same limitation), not something to paper over incidentally.
4. **Per-field "locked after save," not whole-record lock**: most fields
   check "is this field's own value already saved" individually — a blank
   optional field stays editable even after the parent record is saved, but
   once populated it's frozen forever. Collapsing this to "lock everything
   once an ID exists" would be a **behavioral regression**.
5. **Descriptions are always machine-composed, never free-typed**: built from
   Verb (Increase, or Decrease only if target < current) + KPI +
   Dept[-Function] + optional BU/Region clause + current→target + start/end
   dates, shown read-only and re-derived on every relevant field change. The
   Objective description has a hard 2,000-character client-side cap; the
   Strategy description has none.
6. **Track lock**: once the strategy exists in Dataverse, the track can never
   change, full stop — regardless of what else exists on the record.
7. **Service strategies set no targets, and support exactly one operational
   strategy** — enforced by the Targets step no-op'ing for service, and by
   the Support Link step offering a single-select picker only.
8. **Category dictionary scoping**: categories are filtered by **both** scope
   (Tactic vs POC) **and** the category's **own independent** strategy-type
   option set (distinct from, and not to be confused with, the Strategy
   entity's own strategy-type). The lookup progressively relaxes filters
   (scope+type → scope → type → everything) rather than ever showing an
   empty list — dropping this fallback would silently change "always shows
   something" into "shows nothing" if a category is misconfigured.
9. **"Automated" KPI flag**: a KPI is automated (manual target entry
   disabled) whenever its data-source is set and **not** Manual — i.e. both
   Power App and Dotcare sources count as automated.
10. **Achievement rows are always whole-BU monthly totals** — this module
    deliberately never touches any breakdown dimension (that belongs to the
    separate Planning & Monitoring app).
11. **Two hardcoded entity-set names bypass the metadata layer** in the
    source: the POC region/specialty patch writes `@odata.bind` targets as
    literal pluralized entity-set names instead of resolving them dynamically
    like everywhere else. If the real entity-set names differ, those two
    calls would 404 silently. In this port, resolve entity sets consistently
    through one mechanism everywhere — don't reintroduce hardcoded set names.
12. **Two orphaned/dead pieces of the original design**: (a) the
    `stf_alignmentline` table is declared but never used; (b) the
    "Supportive" role is fully coded but unreachable from the role switcher.
13. A 5-value alignment-session status option set is defined in the source
    but never used — only a 3-value set (Not Started/Done/Cancelled) is
    actually wired to the real field. Only port the 3-value set.
14. **Reopen is fully implemented but has no UI trigger anywhere** — an
    incomplete in-year-change-request flow. Decide deliberately whether to
    finish or drop it; don't port it as unreachable dead code by default.
15. **Comments' "Attach level" has no real FK**: a comment "attached" to a
    Tactic cannot be traced to *which* Tactic. Needed if per-item comment
    threads are wanted going forward.
16. **Decision-log timestamps are client-generated**, not a platform
    created-on field — audit ordering trusts the browser clock. Consider
    using a server-generated timestamp in this port.
17. **Naming-convention outlier on `hx_tasks`**: two fields use a different
    prefix than the rest of that table's columns. Re-verify these against
    the live TMS schema before wiring (deferred phase, but flag now).
18. **Eager, irreversible Primary-KPI replacement**: picking a new Primary
    KPI immediately deletes the old KPI-junction row on selection — before
    the rest of the form is saved. Consider deferring this delete to the
    actual Save action in this port.
19. **Mutually-exclusive KPI-lookup invariant on Bottom-Up-created items**:
    Tactics/POCs created outside the main wizard carry a direct KPI lookup
    (`stf_kpi`) set at creation time. Once clustered into a strategy,
    assignment sets the strategy-KPI junction (`stf_strategykpi`) **and
    clears `stf_kpi` to null in the same update** — the two fields are never
    both set, never both null. Any code reading a Tactic/POC's KPI **after**
    clustering must go through the junction, not the direct lookup, which
    will be empty. (Relevant mainly to the deferred Bottom-Up/Unassigned
    flows, but the invariant matters wherever Tactic/POC KPI is read.)
20. **Possible Department-table mismatch** — see the "Known risk" callout at
    the end of section 1. Verify before implementing cascading Department→
    Function pickers.
