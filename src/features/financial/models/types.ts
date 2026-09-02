// ═══════════════════════════════════════════════════════════════════
//  Financial Modeler — Domain Types
//  Maps 1-to-1 to the Dataverse BI data-structure spec.
// ═══════════════════════════════════════════════════════════════════

// ── Choice-set enumerations ──────────────────────────────────────

/** Calculation kind used by the builder (equation vs relation). */
export type ModelType = "Equation" | "Relation";

/**
 * pm_model.pm_modeltype (display name: modeltype)
 * 1 = Draft, 2 = Under Review, 3 = Sealed, 4 = Approved By Finance
 */
export type ModelStatus =
  | "Draft"
  | "In Review"
  | "Approved By Finance"
  | "Sealed"
  | "Returned"
  | "Superseded"
  | "Retired";

/** pm_model.pm_resultkind / pm_proposal.pm_entitykind / etc.
 * Dataverse choice values: 1 Org Outcome, 2 Org Output, 3 KPI
 */
export type EntityKind = "KPI" | "OrgOutput" | "OrgOutcome";

/** pm_modelterm.pm_termtype */
export type TermType = "KPI" | "Operator" | "Bracket" | "Constant";

/** pm_modelterm.pm_operator (also used for bracket symbols on Bracket terms) */
export type Operator = "×" | "÷" | "+" | "−" | "(" | ")";

/** pm_relationfactor.pm_direction */
export type FactorDirection = "Increases" | "Decreases";

/** pm_kpiceiling.pm_isconstraint */
export type ConstraintEnforcement = "Enforced" | "Off";

/** pm_model.pm_useworkingdays */
export type YesNo = "Yes" | "No";

/** pm_proposal.statuscode */
export type ProposalStatus = "Active" | "Approved" | "Inactive";

/** pm_conflict.statuscode */
export type ConflictStatus = "Open" | "Approved" | "Rejected";

/** pm_conflict.pm_conflicttype */
export type ConflictType =
  | "ForecastVsMonthly"
  | "ChildrenVsParent"
  | "BottomUpBelowApproved"
  | "ModelBuilderVsOrgKpi";

/** pm_targetversion.pm_source / pm_proposal.pm_source */
export type TargetSource =
  | "Forecast"
  | "TopDownMonthly"
  | "Breakdown"
  | "BottomUp"
  | "FinancialModeler";

/** pm_activitylog.pm_actiontype */
export type ActionType =
  | "TargetSet"
  | "Proposal"
  | "Approval"
  | "Seal"
  | "ConflictRaised"
  | "ConflictResolved"
  | "ModelChange";

/** strategy_kpis.strategy_kpitype */
export type KpiType =
  | "OutCome"
  | "OutPut"
  | "Sub Outcome"
  | "Sub Output"
  | "Process"
  | "Sub Process"
  | "Input";

/** strategy_kpis.btm_kpilayer */
export type KpiLayer = "Cause" | "Driver" | "Effect";

/** strategy_kpis.btm_unitofmeasure */
export type UnitOfMeasure =
  | "%"
  | "Currency (SAR)"
  | "Currency (EGP)"
  | "Count"
  | "Days"
  | "Score"
  | "Ratio";

/** strategy_kpis.strategy_aggregatetype */
export type AggregateType = "Percentage" | "Value";

/** strategy_kpis.btm_polarity */
export type Polarity = "Higher is Better" | "Lower is Better";

/** strategy_kpis.btm_region (picklist) */
export type RegionChoice = "KSA" | "Egypt";

// ── Role persona for the "Acting as" switcher ────────────────────

export type ActingRole = "Dept Owner" | "Finance" | "BI" | "Function Mgr";

// ── Reference / Lookup entities ──────────────────────────────────

export interface BusinessUnit {
  businessunitid: string;
  name: string;
  regionid?: string;
}

export interface Region {
  regionid: string;
  name: string;
}

export interface Department {
  departmentid: string;
  name: string;
  /** Lookup → businessunit (cr603_Company) */
  businessunitid?: string;
}

export interface HrFunction {
  functionid: string;
  name: string;
  /** Lookup → department */
  departmentid: string;
}

// ── strategy_kpis  (EXPAND — existing + pm_ispmkpi) ─────────────

export interface StrategyKpi {
  strategy_kpisid: string;
  btm_kpibusinessname: string;
  strategy_kpitype: KpiType;
  strategy_aggregatetype: AggregateType;
  btm_kpilayer: KpiLayer;
  btm_unitofmeasure: UnitOfMeasure;
  btm_polarity: Polarity;
  btm_businessdefinition?: string;
  btm_kpiformula?: string;

  /** Lookup → department */
  strategy_department: string;
  strategy_departmentname?: string;

  /** Lookup → hr_function */
  strategy_function: string;
  strategy_functionname?: string;

  /** Lookup → region */
  strategy_region?: string;
  strategy_regionname?: string;

  /** NEW column — true when KPI is used in any Sealed model */
  pm_ispmkpi?: boolean;
}

// ── pm_kpiachievment  (EXPAND — existing + baseline/historical) ──

export interface KpiAchievement {
  pm_kpiachievmentid: string;

  /** Lookup → strategy_kpis */
  pm_kpi: string;
  pm_kpiname?: string;

  /** Lookup → businessunit */
  pm_businessunit: string;
  pm_businessunitname?: string;

  /** Lookup → department */
  pm_department?: string;
  pm_departmentname?: string;

  /** Lookup → function */
  pm_function?: string;
  pm_functionname?: string;

  pm_month: number; // 1–12
  pm_year: number;

  /** Planning-owned target value */
  pm_target?: number;

  /** ★ BI-supplied actual */
  pm_actual?: number;

  /** NEW — ★ BI-supplied baseline */
  pm_baseline?: number;

  /** NEW — ★ BI-supplied historical */
  pm_historical?: number;
}

// ── pm_model  (NEW) ──────────────────────────────────────────────

export interface FinancialModel {
  pm_modelid: string;

  /** Display name from pm_model.pm_name */
  pm_name?: string;

  /** What the model calculates: KPI, OrgOutput, or OrgOutcome */
  pm_resultkind: EntityKind;

  /**
   * Polymorphic lookup — ID of the result entity.
   * Resolves to strategy_kpis | pm_orgoutput | pm_orgoutcome
   * depending on pm_resultkind.
   */
  pm_resultref: string;
  pm_resultrefname?: string;

  /** Lookup → strategy_kpis — calculated / affected KPI (pm_CalculatedKPI) */
  pm_calculatedkpi?: string;
  pm_calculatedkpiname?: string;

  /** Lookup → hr_function — the scope / function the model belongs to */
  pm_scope: string;
  pm_scopename?: string;

  /** Calculation kind: Equation | Relation */
  pm_modeltype: ModelType;

  /**
   * Dataverse `pm_modeltype` choice:
   * 1 = Draft, 2 = Under Review, 3 = Sealed, 4 = Approved By Finance
   */
  pm_modeltypevalue?: number;

  /** Lookup → pm_orgoutput — org output the model feeds */
  pm_linkedoutput?: string;
  pm_linkedoutputname?: string;

  /** Lookup → pm_orgoutcome — org outcome the model feeds */
  pm_linkedoutcome?: string;
  pm_linkedoutcomename?: string;

  pm_useworkingdays: YesNo;
  pm_version: string;

  /** Baseline is BI-supplied on pm_kpiachievment — not saved on the model */
  pm_baseline?: number;

  /** Mapped from pm_modeltype: Draft / In Review / Sealed */
  statuscode: ModelStatus;

  /** Dataverse pm_modeltypename label (Draft / Under Review / Sealed) */
  statusLabel?: string;
}

/** Linked org output / outcome shown on the Models list. */
export interface OrgLinkInfo {
  kind: 'Output' | 'Outcome';
  name: string;
}

// ── pm_modelterm  (NEW) ──────────────────────────────────────────

export interface ModelTerm {
  pm_modeltermid: string;

  /** Lookup → pm_model */
  pm_model: string;

  /** Token position (1, 2, 3…). The equation IS this ordering. */
  pm_sequence: number;

  pm_termtype: TermType;

  /** Lookup → strategy_kpis — filled when termtype = KPI */
  pm_kpi?: string;

  /** Filled when termtype = Operator */
  pm_operator?: Operator;

  /** Filled when termtype = Constant */
  pm_constant?: number;
}

// ── pm_relationfactor  (NEW) ─────────────────────────────────────

export interface RelationFactor {
  pm_relationfactorid: string;

  /** Lookup → pm_model */
  pm_model: string;

  /** Lookup → strategy_kpis */
  pm_factorkpi: string;

  pm_direction: FactorDirection;

  /** When factor KPI moves this % … */
  pm_inputpct: number;

  /** … result moves this % (signed) */
  pm_resultpct: number;
}

// ── pm_kpiceiling  (NEW) ─────────────────────────────────────────

export interface KpiCeiling {
  pm_kpiceilingid: string;

  /** Lookup → strategy_kpis */
  pm_kpi: string;
  pm_kpiname?: string;

  /** Lookup → businessunit */
  pm_businessunit: string;
  pm_businessunitname?: string;

  /** Lower bound (undefined = no minimum) */
  pm_min?: number;

  /** Upper bound (undefined = no maximum) */
  pm_max?: number;

  pm_isconstraint: ConstraintEnforcement;
  pm_effectivedate: string; // ISO date

  /**
   * KPI Ceiling Status choice (`pm_kpiceilingstatus`):
   * 1 = Active, 2 = Superseded
   */
  statuscode?: number;
  status?: 'Active' | 'Superseded';
}

// ── pm_workingdays  (NEW) ────────────────────────────────────────

export interface WorkingDays {
  pm_workingdaysid: string;

  /** Lookup → businessunit */
  pm_businessunit: string;

  pm_month: number; // 1–12
  pm_year: number;

  /** Actual working days = Σ day weights */
  pm_workingdays: number;
}

// ── Org-level entities  (all NEW) ────────────────────────────────

export interface OrgOutput {
  pm_orgoutputid: string;
  pm_name: string;
  pm_region?: RegionChoice;
}

export interface OrgOutcome {
  pm_orgoutcomeid: string;
  pm_name: string;
}

export interface OrgOutputOutcome {
  pm_orgoutputoutcomeid: string;
  /** Lookup → pm_orgoutput */
  pm_orgoutput: string;
  /** Lookup → pm_orgoutcome */
  pm_orgoutcome: string;
}

export interface OutputContribution {
  pm_outputcontributionid: string;
  /** Lookup → strategy_kpis — dept output KPI (a Driver) */
  pm_sourcekpi: string;
  pm_sourcekpiname?: string;
  /** Lookup → pm_orgoutput */
  pm_targetoutput: string;
  pm_targetoutputname?: string;
  /** Lookup → businessunit */
  pm_businessunit: string;
  pm_businessunitname?: string;
  /** Contribution weight 0–100 */
  pm_weightpct: number;
  pm_effectivedate: string; // ISO date
}

export interface OutcomeContribution {
  pm_outcomecontributionid: string;
  /** Lookup → strategy_kpis — dept outcome KPI (an Effect) */
  pm_sourcekpi: string;
  pm_sourcekpiname?: string;
  /** Lookup → pm_orgoutcome */
  pm_targetoutcome: string;
  pm_targetoutcomename?: string;
  /** Lookup → businessunit */
  pm_businessunit: string;
  pm_businessunitname?: string;
  /** Contribution weight 0–100 */
  pm_weightpct: number;
  pm_effectivedate: string; // ISO date
}

export interface OrgOutputAchievement {
  pm_orgoutputachievmentid: string;
  pm_orgoutput: string;
  pm_businessunit: string;
  pm_month: number;
  pm_year: number;
  pm_target?: number;
  pm_actual?: number;
  pm_baseline?: number;
  pm_historical?: number;
}

export interface OrgOutcomeAchievement {
  pm_orgoutcomeachievmentid: string;
  pm_orgoutcome: string;
  pm_businessunit: string;
  pm_month: number;
  pm_year: number;
  pm_target?: number;
  pm_actual?: number;
  pm_baseline?: number;
  pm_historical?: number;
}

// ── pm_proposal  (NEW) ──────────────────────────────────────────

export interface Proposal {
  pm_proposalid: string;
  pm_entitykind: EntityKind;

  /** Filled when entitykind = KPI */
  pm_kpi?: string;
  /** Filled when entitykind = OrgOutput */
  pm_orgoutput?: string;
  /** Filled when entitykind = OrgOutcome */
  pm_orgoutcome?: string;

  pm_businessunit: string;
  pm_month: number;
  pm_year: number;
  pm_proposedvalue: number;
  pm_deptfunction?: string;
  pm_kpiname?: string;
  pm_orgoutputname?: string;
  pm_orgoutcomename?: string;
  pm_businessunitname?: string;

  /** Lookup → pm_model */
  pm_sourcemodel?: string;
  pm_sourcemodelname?: string;
  pm_name?: string;

  pm_source: TargetSource;
  pm_hasconflict: YesNo;
  statuscode: ProposalStatus;
  createdbyname?: string;
  createdon?: string;
}

// ── pm_targetversion  (NEW) ─────────────────────────────────────

export interface TargetVersion {
  pm_targetversionid: string;
  pm_entitykind: EntityKind;
  pm_kpi?: string;
  pm_orgoutput?: string;
  pm_orgoutcome?: string;

  /** Lookup → pm_kpiachievment */
  pm_achievment: string;
  pm_businessunit: string;
  pm_month: number;
  pm_year: number;
  pm_value: number;
  pm_source: TargetSource;
  pm_versionno: number;

  /** Self-lookup — version this one replaced */
  pm_supersedes?: string;

  pm_iscurrent: YesNo;

  /** Lookup → pm_conflict */
  pm_conflict?: string;
  /** Lookup → pm_model */
  pm_sourcemodel?: string;
  /** Lookup → systemuser */
  pm_setby?: string;
  pm_seton?: string; // ISO date
}

// ── pm_conflict  (NEW) ──────────────────────────────────────────

export interface Conflict {
  pm_conflictid: string;
  pm_entitykind: EntityKind;
  pm_kpi?: string;
  pm_kpiname?: string;
  pm_orgoutput?: string;
  pm_orgoutputname?: string;
  pm_orgoutcome?: string;
  pm_orgoutcomename?: string;
  pm_businessunit: string;
  pm_businessunitname?: string;
  pm_month: number;
  pm_year: number;
  pm_existingvalue: number;
  pm_proposedvalue: number;
  pm_existingsource: TargetSource;
  pm_proposedsource: TargetSource;
  pm_conflicttype: ConflictType;
  /** Lookup → pm_proposal */
  pm_proposal?: string;
  /** Lookup → pm_targetversion */
  pm_priorversion?: string;
  /** Lookup → systemuser */
  pm_raisedby?: string;
  pm_raisedon?: string; // ISO date
  statuscode: ConflictStatus;
}

// ── pm_activitylog  (NEW) ───────────────────────────────────────

export interface ActivityLog {
  pm_activitylogid: string;
  pm_action: string;
  pm_actiontype: ActionType;
  pm_entitykind?: EntityKind;
  /** Lookup → strategy_kpis */
  pm_kpi?: string;
  /** Lookup → pm_model */
  pm_model?: string;
  /** Lookup → pm_conflict */
  pm_conflict?: string;
  /** Lookup → businessunit */
  pm_businessunit?: string;
  /** Lookup → systemuser */
  pm_by?: string;
  pm_on: string; // ISO date
}

// ── btm_kpidriverbinding  (EXISTS) ──────────────────────────────

export interface KpiDriverBinding {
  btm_kpidriverbindingid: string;
  /** The KPI being driven */
  btm_kpi: string;
  btm_kpiname?: string;
  /** The KPI that drives it */
  btm_driverkpi: string;
  btm_driverkpiname?: string;
  btm_driverweight: number;
  btm_impactdirection: "Positive" | "Negative";
}

// ═══════════════════════════════════════════════════════════════════
//  UI / View-model types (not persisted in Dataverse)
// ═══════════════════════════════════════════════════════════════════

/** Context-bar selection state */
export interface FilterContext {
  region: string;
  businessUnit: string;
  department: string;
  functionId: string;
}

/** Resolved term for display — carries the KPI name alongside the raw term */
export interface ResolvedTerm extends ModelTerm {
  kpiName?: string;
  kpiUnit?: UnitOfMeasure;
}

/** Row in the model tester scrubber */
export interface TesterComponentRow {
  kpiId: string;
  kpiName: string;
  unit: UnitOfMeasure;
  /** From pm_kpiachievment for the selected filters/period; null if no match */
  actualValue: number | null;
  baselineValue: number | null;
  historicalValue: number | null;
  /** From pm_kpiachievment.pm_target for the selected filters/period; null if no match */
  targetValue: number | null;
  /** Starting test value (usually actual ?? baseline) */
  currentValue: number;
  ceiling?: { min?: number; max?: number };
  isPercentage?: boolean;
  /** True when this row is the model's calculated KPI — Test value is computed, not typed. */
  isCalculatedResult?: boolean;
}

/** Tester period controls (Pulse S.tester) */
export interface TesterPeriod {
  month: number;
  year: number;
  fullYear: boolean;
}

/** Result of an equation or relation evaluation */
export interface EvalResult {
  value: number;
  /** true if the result was clamped by a ceiling */
  wasClamped: boolean;
  /** value before clamping (if different) */
  preClampValue?: number;
  /** Human-readable equation used for the Test result */
  expression?: string;
}

/** Org roll-up preview row */
export interface OrgRollupRow {
  orgEntityId: string;
  orgEntityName: string;
  kind: "Output" | "Outcome";
  linkNote?: string;
  weightPct?: number;
  currentValue: number | null;
  projectedValue: number | null;
  existingTarget?: number | null;
  conflict?: boolean;
  delta: number;
  deltaPct: number;
}
