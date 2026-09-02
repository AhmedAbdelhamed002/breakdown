import {
  Region, BusinessUnit, Department, HrFunction, StrategyKpi,
  FinancialModel, ModelTerm, RelationFactor, KpiAchievement,
  KpiCeiling, OrgOutput, OrgOutcome, OutputContribution,
  OutcomeContribution, OrgOutputOutcome, ModelStatus, Proposal, Conflict
} from '../models/types';

// 1. Mock Reference Data
const REGIONS: Region[] = [
  { regionid: 'r1', name: 'KSA' },
  { regionid: 'r2', name: 'Egypt' },
];

const BUSINESS_UNITS: BusinessUnit[] = [
  { businessunitid: 'bu1', name: 'AHJ — KSA', regionid: 'r1' },
  { businessunitid: 'bu2', name: 'AKW — KSA', regionid: 'r1' },
  { businessunitid: 'bu3', name: 'ALW — KSA', regionid: 'r1' },
  { businessunitid: 'bu4', name: 'MKR — KSA', regionid: 'r1' },
  { businessunitid: 'bu5', name: 'SNB — KSA', regionid: 'r1' },
  { businessunitid: 'bu6', name: 'AMH — EGY', regionid: 'r2' },
  { businessunitid: 'bu7', name: 'ARC — EGY', regionid: 'r2' },
  { businessunitid: 'bu8', name: 'SMH — EGY', regionid: 'r2' },
  { businessunitid: 'bu9', name: 'ASH — EGY', regionid: 'r2' },
  { businessunitid: 'bu10', name: 'AOH — EGY', regionid: 'r2' },
];

const DEPARTMENTS: Department[] = [
  { departmentid: 'd1', name: 'Medical', businessunitid: 'bu1' },
];

const FUNCTIONS: HrFunction[] = [
  { functionid: 'f1', name: 'Medical - OPD', departmentid: 'd1' },
  { functionid: 'f2', name: 'Medical - ICU', departmentid: 'd1' },
  { functionid: 'f3', name: 'Medical - ER', departmentid: 'd1' },
  { functionid: 'f4', name: 'Medical - OR', departmentid: 'd1' },
];

// 2. Mock KPIs (strategy_kpis)
const KPIS: StrategyKpi[] = [
  // OPD KPIs
  { strategy_kpisid: 'kpi1', btm_kpibusinessname: 'OPD Patient Satisfaction %', strategy_kpitype: 'OutCome', btm_unitofmeasure: '%', btm_kpilayer: 'Effect', strategy_aggregatetype: 'Value', btm_polarity: 'Higher is Better', strategy_department: 'd1', strategy_function: 'f1' },
  { strategy_kpisid: 'kpi2', btm_kpibusinessname: 'OPD Profitability %', strategy_kpitype: 'OutCome', btm_unitofmeasure: '%', btm_kpilayer: 'Effect', strategy_aggregatetype: 'Value', btm_polarity: 'Higher is Better', strategy_department: 'd1', strategy_function: 'f1' },
  { strategy_kpisid: 'kpi3', btm_kpibusinessname: 'OPD Revenue Growth', strategy_kpitype: 'OutCome', btm_unitofmeasure: '%', btm_kpilayer: 'Effect', strategy_aggregatetype: 'Value', btm_polarity: 'Higher is Better', strategy_department: 'd1', strategy_function: 'f1' },
  { strategy_kpisid: 'kpi4', btm_kpibusinessname: 'OPD Volume', strategy_kpitype: 'OutPut', btm_unitofmeasure: 'Count', btm_kpilayer: 'Driver', strategy_aggregatetype: 'Value', btm_polarity: 'Higher is Better', strategy_department: 'd1', strategy_function: 'f1' },
  { strategy_kpisid: 'kpi5', btm_kpibusinessname: 'OPD Revenue', strategy_kpitype: 'OutPut', btm_unitofmeasure: 'Currency (SAR)', btm_kpilayer: 'Driver', strategy_aggregatetype: 'Value', btm_polarity: 'Higher is Better', strategy_department: 'd1', strategy_function: 'f1' },
  { strategy_kpisid: 'kpi6', btm_kpibusinessname: '% Overbooking', strategy_kpitype: 'Process', btm_unitofmeasure: '%', btm_kpilayer: 'Cause', strategy_aggregatetype: 'Value', btm_polarity: 'Higher is Better', strategy_department: 'd1', strategy_function: 'f1' },
  { strategy_kpisid: 'kpi7', btm_kpibusinessname: 'Case mix index', strategy_kpitype: 'Process', btm_unitofmeasure: '%', btm_kpilayer: 'Cause', strategy_aggregatetype: 'Value', btm_polarity: 'Higher is Better', strategy_department: 'd1', strategy_function: 'f1' },
  { strategy_kpisid: 'kpi8', btm_kpibusinessname: 'COE maturity score', strategy_kpitype: 'Process', btm_unitofmeasure: 'Score', btm_kpilayer: 'Cause', strategy_aggregatetype: 'Value', btm_polarity: 'Higher is Better', strategy_department: 'd1', strategy_function: 'f1' },
  { strategy_kpisid: 'kpi9', btm_kpibusinessname: '#of patients thanks to OPD department services', strategy_kpitype: 'Process', btm_unitofmeasure: 'Count', btm_kpilayer: 'Driver', strategy_aggregatetype: 'Value', btm_polarity: 'Higher is Better', strategy_department: 'd1', strategy_function: 'f1' },
  { strategy_kpisid: 'kpi10', btm_kpibusinessname: '% Claim rejection in OPD', strategy_kpitype: 'OutPut', btm_unitofmeasure: '%', btm_kpilayer: 'Driver', strategy_aggregatetype: 'Value', btm_polarity: 'Higher is Better', strategy_department: 'd1', strategy_function: 'f1' },
  { strategy_kpisid: 'kpi11', btm_kpibusinessname: '% leakage (lab/rad/procedures)', strategy_kpitype: 'OutPut', btm_unitofmeasure: '%', btm_kpilayer: 'Driver', strategy_aggregatetype: 'Value', btm_polarity: 'Higher is Better', strategy_department: 'd1', strategy_function: 'f1' },
  { strategy_kpisid: 'kpi12', btm_kpibusinessname: 'Patients per Hour', strategy_kpitype: 'Process', btm_unitofmeasure: 'Count', btm_kpilayer: 'Cause', strategy_aggregatetype: 'Value', btm_polarity: 'Higher is Better', strategy_department: 'd1', strategy_function: 'f1' },
  { strategy_kpisid: 'kpi13', btm_kpibusinessname: 'Hours per Day', strategy_kpitype: 'Process', btm_unitofmeasure: 'Count', btm_kpilayer: 'Cause', strategy_aggregatetype: 'Value', btm_polarity: 'Higher is Better', strategy_department: 'd1', strategy_function: 'f1' },
  { strategy_kpisid: 'kpi14', btm_kpibusinessname: 'Number of Clinics', strategy_kpitype: 'Process', btm_unitofmeasure: 'Count', btm_kpilayer: 'Cause', strategy_aggregatetype: 'Value', btm_polarity: 'Higher is Better', strategy_department: 'd1', strategy_function: 'f1' },
  { strategy_kpisid: 'kpi15', btm_kpibusinessname: 'OPD Utilization %', strategy_kpitype: 'Process', btm_unitofmeasure: '%', btm_kpilayer: 'Cause', strategy_aggregatetype: 'Value', btm_polarity: 'Higher is Better', strategy_department: 'd1', strategy_function: 'f1' },
  { strategy_kpisid: 'kpi16', btm_kpibusinessname: 'Charge per Visit', strategy_kpitype: 'Process', btm_unitofmeasure: 'Currency (SAR)', btm_kpilayer: 'Cause', strategy_aggregatetype: 'Value', btm_polarity: 'Higher is Better', strategy_department: 'd1', strategy_function: 'f1' },
  { strategy_kpisid: 'kpi17', btm_kpibusinessname: '% of clinic Cross referral', strategy_kpitype: 'Process', btm_unitofmeasure: '%', btm_kpilayer: 'Cause', strategy_aggregatetype: 'Value', btm_polarity: 'Higher is Better', strategy_department: 'd1', strategy_function: 'f1' },
  { strategy_kpisid: 'kpi18', btm_kpibusinessname: 'CPG Compliance', strategy_kpitype: 'Process', btm_unitofmeasure: '%', btm_kpilayer: 'Driver', strategy_aggregatetype: 'Value', btm_polarity: 'Higher is Better', strategy_department: 'd1', strategy_function: 'f1' },
  { strategy_kpisid: 'kpi19', btm_kpibusinessname: '% of cases exceeding 30 min', strategy_kpitype: 'Process', btm_unitofmeasure: '%', btm_kpilayer: 'Driver', strategy_aggregatetype: 'Value', btm_polarity: 'Higher is Better', strategy_department: 'd1', strategy_function: 'f1' },
  // ICU KPIs
  { strategy_kpisid: 'kpi20', btm_kpibusinessname: 'ICU Profitability %', strategy_kpitype: 'OutCome', btm_unitofmeasure: '%', btm_kpilayer: 'Effect', strategy_aggregatetype: 'Value', btm_polarity: 'Higher is Better', strategy_department: 'd1', strategy_function: 'f2' },
  { strategy_kpisid: 'kpi21', btm_kpibusinessname: 'ICU Patient Satisfaction Rate', strategy_kpitype: 'OutCome', btm_unitofmeasure: '%', btm_kpilayer: 'Effect', strategy_aggregatetype: 'Value', btm_polarity: 'Higher is Better', strategy_department: 'd1', strategy_function: 'f2' },
  { strategy_kpisid: 'kpi22', btm_kpibusinessname: '% DAMA from ICU', strategy_kpitype: 'OutPut', btm_unitofmeasure: '%', btm_kpilayer: 'Driver', strategy_aggregatetype: 'Value', btm_polarity: 'Lower is Better', strategy_department: 'd1', strategy_function: 'f2' },
  // ER KPIs
  { strategy_kpisid: 'kpi23', btm_kpibusinessname: 'ER Profitability', strategy_kpitype: 'OutCome', btm_unitofmeasure: '%', btm_kpilayer: 'Effect', strategy_aggregatetype: 'Value', btm_polarity: 'Higher is Better', strategy_department: 'd1', strategy_function: 'f3' },
  { strategy_kpisid: 'kpi24', btm_kpibusinessname: 'ER Patient Satisfaction Score', strategy_kpitype: 'OutCome', btm_unitofmeasure: 'Score', btm_kpilayer: 'Effect', strategy_aggregatetype: 'Value', btm_polarity: 'Higher is Better', strategy_department: 'd1', strategy_function: 'f3' },
  { strategy_kpisid: 'kpi25', btm_kpibusinessname: '72-Hour ER Revisit Rate', strategy_kpitype: 'OutPut', btm_unitofmeasure: '%', btm_kpilayer: 'Driver', strategy_aggregatetype: 'Value', btm_polarity: 'Lower is Better', strategy_department: 'd1', strategy_function: 'f3' },
  // OR KPIs
  { strategy_kpisid: 'kpi26', btm_kpibusinessname: 'OR Patient Satisfaction Rate', strategy_kpitype: 'OutCome', btm_unitofmeasure: '%', btm_kpilayer: 'Effect', strategy_aggregatetype: 'Value', btm_polarity: 'Higher is Better', strategy_department: 'd1', strategy_function: 'f4' },
  { strategy_kpisid: 'kpi27', btm_kpibusinessname: 'OR Revenue Growth Rate', strategy_kpitype: 'OutCome', btm_unitofmeasure: '%', btm_kpilayer: 'Effect', strategy_aggregatetype: 'Value', btm_polarity: 'Higher is Better', strategy_department: 'd1', strategy_function: 'f4' },
  { strategy_kpisid: 'kpi28', btm_kpibusinessname: 'Cancelled Operations Volume', strategy_kpitype: 'OutPut', btm_unitofmeasure: 'Count', btm_kpilayer: 'Driver', strategy_aggregatetype: 'Value', btm_polarity: 'Lower is Better', strategy_department: 'd1', strategy_function: 'f4' },
];

// 3. Mock Financial Models
const MODELS: FinancialModel[] = [
  { pm_modelid: 'm1', pm_resultkind: 'KPI', pm_resultref: 'kpi1', pm_modeltype: 'Relation', statuscode: 'Sealed', pm_version: '1.0', pm_linkedoutput: undefined, pm_scope: 'f1', pm_useworkingdays: 'No' },
  { pm_modelid: 'm2', pm_resultkind: 'KPI', pm_resultref: 'kpi2', pm_modeltype: 'Relation', statuscode: 'Sealed', pm_version: '1.0', pm_linkedoutput: 'oo2', pm_scope: 'f1', pm_useworkingdays: 'No' },
  { pm_modelid: 'm3', pm_resultkind: 'KPI', pm_resultref: 'kpi3', pm_modeltype: 'Relation', statuscode: 'Draft', pm_version: '0.3', pm_linkedoutput: 'oo2', pm_scope: 'f1', pm_useworkingdays: 'No' },
  { pm_modelid: 'm4', pm_resultkind: 'KPI', pm_resultref: 'kpi4', pm_modeltype: 'Equation', statuscode: 'Sealed', pm_version: '1.0', pm_useworkingdays: 'Yes', pm_linkedoutput: 'oo1', pm_scope: 'f1' },
  { pm_modelid: 'm5', pm_resultkind: 'KPI', pm_resultref: 'kpi5', pm_modeltype: 'Equation', statuscode: 'Sealed', pm_version: '1.0', pm_useworkingdays: 'No', pm_linkedoutput: 'oo2', pm_scope: 'f1' },
];

let MODEL_TERMS: ModelTerm[] = [
  { pm_modeltermid: 'mt1', pm_model: 'm4', pm_termtype: 'KPI', pm_kpi: 'kpi12', pm_sequence: 1, pm_operator: '×' },
  { pm_modeltermid: 'mt2', pm_model: 'm4', pm_termtype: 'KPI', pm_kpi: 'kpi13', pm_sequence: 2, pm_operator: '×' },
  { pm_modeltermid: 'mt3', pm_model: 'm4', pm_termtype: 'KPI', pm_kpi: 'kpi14', pm_sequence: 3, pm_operator: '×' },
  { pm_modeltermid: 'mt4', pm_model: 'm4', pm_termtype: 'KPI', pm_kpi: 'kpi15', pm_sequence: 4 },
  { pm_modeltermid: 'mt5', pm_model: 'm5', pm_termtype: 'KPI', pm_kpi: 'kpi4', pm_sequence: 1, pm_operator: '×' },
  { pm_modeltermid: 'mt6', pm_model: 'm5', pm_termtype: 'KPI', pm_kpi: 'kpi16', pm_sequence: 2 },
];

let RELATION_FACTORS: RelationFactor[] = [
  { pm_relationfactorid: 'rf1', pm_model: 'm1', pm_factorkpi: 'kpi9', pm_direction: 'Increases', pm_inputpct: 10, pm_resultpct: 5 },
  { pm_relationfactorid: 'rf2', pm_model: 'm2', pm_factorkpi: 'kpi10', pm_direction: 'Increases', pm_inputpct: 10, pm_resultpct: -5 },
  { pm_relationfactorid: 'rf3', pm_model: 'm2', pm_factorkpi: 'kpi2', pm_direction: 'Increases', pm_inputpct: 0, pm_resultpct: 0 },
  { pm_relationfactorid: 'rf4', pm_model: 'm3', pm_factorkpi: 'kpi17', pm_direction: 'Increases', pm_inputpct: 10, pm_resultpct: 3 },
];

// 4. Mock KPI Achievements
const ACHIEVEMENTS: KpiAchievement[] = [
  { pm_kpiachievmentid: 'a1', pm_kpi: 'kpi1', pm_businessunit: 'bu1', pm_month: 1, pm_year: 2026, pm_actual: 83.36, pm_target: 85, pm_baseline: 80 },
  { pm_kpiachievmentid: 'a2', pm_kpi: 'kpi2', pm_businessunit: 'bu1', pm_month: 1, pm_year: 2026, pm_actual: 75.95, pm_target: 78, pm_baseline: 72 },
  { pm_kpiachievmentid: 'a3', pm_kpi: 'kpi3', pm_businessunit: 'bu1', pm_month: 1, pm_year: 2026, pm_actual: undefined, pm_target: undefined, pm_baseline: undefined },
  { pm_kpiachievmentid: 'a4', pm_kpi: 'kpi4', pm_businessunit: 'bu1', pm_month: 1, pm_year: 2026, pm_actual: 295.45, pm_target: 300, pm_baseline: undefined },
  { pm_kpiachievmentid: 'a5', pm_kpi: 'kpi12', pm_businessunit: 'bu1', pm_month: 1, pm_year: 2026, pm_actual: 12, pm_target: undefined, pm_baseline: 10 },
  { pm_kpiachievmentid: 'a6', pm_kpi: 'kpi13', pm_businessunit: 'bu1', pm_month: 1, pm_year: 2026, pm_actual: 8, pm_target: undefined, pm_baseline: undefined },
  { pm_kpiachievmentid: 'a7', pm_kpi: 'kpi14', pm_businessunit: 'bu1', pm_month: 1, pm_year: 2026, pm_actual: 5, pm_target: undefined, pm_baseline: undefined },
  { pm_kpiachievmentid: 'a8', pm_kpi: 'kpi15', pm_businessunit: 'bu1', pm_month: 1, pm_year: 2026, pm_actual: 57.95, pm_target: undefined, pm_baseline: 55 },
  { pm_kpiachievmentid: 'a9', pm_kpi: 'kpi16', pm_businessunit: 'bu1', pm_month: 1, pm_year: 2026, pm_actual: 350, pm_target: undefined, pm_baseline: undefined },
  { pm_kpiachievmentid: 'a10', pm_kpi: 'kpi6', pm_businessunit: 'bu1', pm_month: 1, pm_year: 2026, pm_actual: 57.95, pm_target: undefined, pm_baseline: undefined },
  { pm_kpiachievmentid: 'a11', pm_kpi: 'kpi7', pm_businessunit: 'bu1', pm_month: 1, pm_year: 2026, pm_actual: 58.9, pm_target: undefined, pm_baseline: undefined },
  { pm_kpiachievmentid: 'a12', pm_kpi: 'kpi8', pm_businessunit: 'bu1', pm_month: 1, pm_year: 2026, pm_actual: 82.65, pm_target: undefined, pm_baseline: undefined },
  { pm_kpiachievmentid: 'a13', pm_kpi: 'kpi9', pm_businessunit: 'bu1', pm_month: 1, pm_year: 2026, pm_actual: 295.45, pm_target: undefined, pm_baseline: undefined },
  { pm_kpiachievmentid: 'a14', pm_kpi: 'kpi10', pm_businessunit: 'bu1', pm_month: 1, pm_year: 2026, pm_actual: 87.07, pm_target: undefined, pm_baseline: undefined },
  { pm_kpiachievmentid: 'a15', pm_kpi: 'kpi11', pm_businessunit: 'bu1', pm_month: 1, pm_year: 2026, pm_actual: 80.59, pm_target: undefined, pm_baseline: undefined },
  { pm_kpiachievmentid: 'a16', pm_kpi: 'kpi18', pm_businessunit: 'bu1', pm_month: 1, pm_year: 2026, pm_actual: 75, pm_target: undefined, pm_baseline: undefined },
  { pm_kpiachievmentid: 'a17', pm_kpi: 'kpi19', pm_businessunit: 'bu1', pm_month: 1, pm_year: 2026, pm_actual: 12, pm_target: undefined, pm_baseline: undefined },
];

// 5. Mock KPI Ceilings
let CEILINGS: KpiCeiling[] = [
  { pm_kpiceilingid: 'c1', pm_kpi: 'kpi18', pm_businessunit: 'bu1', pm_min: 60, pm_max: 100, pm_isconstraint: 'Enforced', pm_effectivedate: '2026-01-01' },
  { pm_kpiceilingid: 'c2', pm_kpi: 'kpi19', pm_businessunit: 'bu2', pm_min: 0, pm_max: 15, pm_isconstraint: 'Enforced', pm_effectivedate: '2026-01-01' },
];

// 6. Mock Working Days
const WORKING_DAYS = [
  { buId: 'bu1', month: 1, year: 2026, days: 26 },
  { buId: 'bu1', month: 2, year: 2026, days: 24 },
  { buId: 'bu2', month: 1, year: 2026, days: 25 },
];

// 7. Mock Org Outputs & Outcomes
const ORG_OUTPUTS: OrgOutput[] = [
  { pm_orgoutputid: 'oo1', pm_name: 'Hospital Volume (KSA)', pm_region: 'KSA' },
  { pm_orgoutputid: 'oo2', pm_name: 'Hospital Revenue (KSA)', pm_region: 'KSA' },
];

const ORG_OUTCOMES: OrgOutcome[] = [
  { pm_orgoutcomeid: 'oc1', pm_name: 'Revenue Growth' },
  { pm_orgoutcomeid: 'oc2', pm_name: 'Profitability' },
  { pm_orgoutcomeid: 'oc3', pm_name: 'Patient Experience' },
];

const ORG_OUTPUT_OUTCOMES: OrgOutputOutcome[] = [
  { pm_orgoutputoutcomeid: 'ooo1', pm_orgoutput: 'oo1', pm_orgoutcome: 'oc1' },
  { pm_orgoutputoutcomeid: 'ooo2', pm_orgoutput: 'oo2', pm_orgoutcome: 'oc1' },
  { pm_orgoutputoutcomeid: 'ooo3', pm_orgoutput: 'oo2', pm_orgoutcome: 'oc2' },
];

const OUTPUT_CONTRIBUTIONS: OutputContribution[] = [
  { pm_outputcontributionid: 'outc1', pm_sourcekpi: 'kpi4', pm_targetoutput: 'oo1', pm_businessunit: 'bu1', pm_weightpct: 35, pm_effectivedate: '2026-01-01' },
  { pm_outputcontributionid: 'outc2', pm_sourcekpi: 'kpi5', pm_targetoutput: 'oo2', pm_businessunit: 'bu1', pm_weightpct: 40, pm_effectivedate: '2026-01-01' },
];

const OUTCOME_CONTRIBUTIONS: OutcomeContribution[] = [
  { pm_outcomecontributionid: 'outc3', pm_sourcekpi: 'kpi1', pm_targetoutcome: 'oc3', pm_businessunit: 'bu1', pm_weightpct: 25, pm_effectivedate: '2026-01-01' },
  { pm_outcomecontributionid: 'outc4', pm_sourcekpi: 'kpi2', pm_targetoutcome: 'oc2', pm_businessunit: 'bu1', pm_weightpct: 30, pm_effectivedate: '2026-01-01' },
];

let PROPOSALS: Proposal[] = [];
let CONFLICTS: Conflict[] = [];

function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

// 8. Store Class / Module
export const financialStore = {
  getRegions: () => REGIONS,
  getBusinessUnits: () => BUSINESS_UNITS,
  getBusinessUnitsByRegion: (regionId?: string) => regionId ? BUSINESS_UNITS.filter(bu => !bu.regionid || bu.regionid === regionId) : BUSINESS_UNITS,
  getDepartments: () => DEPARTMENTS,
  getFunctions: () => FUNCTIONS,
  getFunctionsByDepartment: (departmentId?: string) => departmentId ? FUNCTIONS.filter(f => !f.departmentid || f.departmentid === departmentId) : FUNCTIONS,
  getKpis: () => KPIS,
  getKpisByDeptAndFunction: (deptId?: string, functionId?: string) => KPIS.filter(k => (!deptId || k.strategy_department === deptId) && (!functionId || k.strategy_function === functionId)),
  getKpiById: (id: string) => KPIS.find(k => k.strategy_kpisid === id),
  getModels: (functionId?: string) => functionId ? MODELS.filter(m => m.pm_scope === functionId) : MODELS,
  getModelById: (id: string) => MODELS.find(m => m.pm_modelid === id),
  getModelTerms: (modelId: string) => MODEL_TERMS.filter(mt => mt.pm_model === modelId),
  getRelationFactors: (modelId: string) => RELATION_FACTORS.filter(rf => rf.pm_model === modelId),
  getCeilings: () => CEILINGS,
  getWorkingDays: (buId: string, month: number, year: number) => WORKING_DAYS.find(wd => wd.buId === buId && wd.month === month && wd.year === year)?.days,
  getAchievement: (kpiId: string, buId: string, month: number, year: number) => ACHIEVEMENTS.find(a => a.pm_kpi === kpiId && a.pm_businessunit === buId && a.pm_month === month && a.pm_year === year),
  getAchievements: () => ACHIEVEMENTS,
  getOrgOutputs: () => ORG_OUTPUTS,
  getOrgOutcomes: () => ORG_OUTCOMES,
  getOutputContributions: () => OUTPUT_CONTRIBUTIONS,
  getOutcomeContributions: () => OUTCOME_CONTRIBUTIONS,
  getOrgOutputOutcomes: () => ORG_OUTPUT_OUTCOMES,
  getOrgLinkedOutputName: (modelId: string) => {
    const model = MODELS.find(m => m.pm_modelid === modelId);
    if (!model) return undefined;
    if (model.pm_linkedoutput) {
      return ORG_OUTPUTS.find(o => o.pm_orgoutputid === model.pm_linkedoutput)?.pm_name;
    }
    if (model.pm_linkedoutcome) {
      return ORG_OUTCOMES.find(o => o.pm_orgoutcomeid === model.pm_linkedoutcome)?.pm_name;
    }
    if (model.pm_resultkind === 'OrgOutput' && model.pm_resultref) {
      return ORG_OUTPUTS.find(o => o.pm_orgoutputid === model.pm_resultref)?.pm_name;
    }
    if (model.pm_resultkind === 'OrgOutcome' && model.pm_resultref) {
      return ORG_OUTCOMES.find(o => o.pm_orgoutcomeid === model.pm_resultref)?.pm_name;
    }
    return undefined;
  },
  getModelsByStatus: (status: ModelStatus) => MODELS.filter(m => m.statuscode === status),
  getProposals: () => PROPOSALS,

  createModel: (model: Omit<FinancialModel, 'pm_modelid'>): FinancialModel => {
    const newModel: FinancialModel = { ...model, pm_modelid: generateId() };
    MODELS.push(newModel);
    return newModel;
  },

  updateModel: (modelId: string, updates: Partial<FinancialModel>) => {
    const model = MODELS.find((m) => m.pm_modelid === modelId);
    if (model) Object.assign(model, updates);
  },

  updateModelTerms: (modelId: string, terms: Omit<ModelTerm, 'pm_modeltermid' | 'pm_model'>[]) => {
    MODEL_TERMS = MODEL_TERMS.filter(mt => mt.pm_model !== modelId);
    const newTerms: ModelTerm[] = terms.map(t => ({ ...t, pm_modeltermid: generateId(), pm_model: modelId }));
    MODEL_TERMS.push(...newTerms);
  },

  updateRelationFactors: (modelId: string, factors: Omit<RelationFactor, 'pm_relationfactorid' | 'pm_model'>[]) => {
    RELATION_FACTORS = RELATION_FACTORS.filter(rf => rf.pm_model !== modelId);
    const newFactors: RelationFactor[] = factors.map(f => ({ ...f, pm_relationfactorid: generateId(), pm_model: modelId }));
    RELATION_FACTORS.push(...newFactors);
  },

  submitForReview: (modelId: string) => {
    const model = MODELS.find(m => m.pm_modelid === modelId);
    if (model) {
      model.statuscode = 'In Review';
      model.pm_modeltypevalue = 2;
      model.statusLabel = 'Under Review';
    }
  },

  approveModel: (modelId: string, role: 'Finance' | 'BI') => {
    const model = MODELS.find((m) => m.pm_modelid === modelId);
    if (!model) return;
    if (role === 'Finance') {
      model.statuscode = 'Approved By Finance';
      model.pm_modeltypevalue = 4;
      model.statusLabel = 'Approved By Finance';
    } else {
      model.statuscode = 'Sealed';
      model.pm_modeltypevalue = 3;
      model.statusLabel = 'Sealed';
    }
  },

  returnModel: (modelId: string) => {
    const model = MODELS.find((m) => m.pm_modelid === modelId);
    if (model) {
      model.statuscode = 'Draft';
      model.pm_modeltypevalue = 1;
      model.statusLabel = 'Draft';
    }
  },

  sealModel: (modelId: string) => {
    const model = MODELS.find(m => m.pm_modelid === modelId);
    if (model) {
      model.statuscode = 'Sealed';
      model.pm_modeltypevalue = 3;
      model.statusLabel = 'Sealed';
    }
  },

  saveTarget: (kpiId: string, buId: string, month: number, year: number, value: number) => {
    const achievement = ACHIEVEMENTS.find(a => a.pm_kpi === kpiId && a.pm_businessunit === buId && a.pm_month === month && a.pm_year === year);
    if (achievement) {
      achievement.pm_target = value;
    } else {
      ACHIEVEMENTS.push({
        pm_kpiachievmentid: generateId(),
        pm_kpi: kpiId,
        pm_businessunit: buId,
        pm_month: month,
        pm_year: year,
        pm_target: value,
        pm_actual: undefined,
        pm_baseline: undefined
      });
    }
  },

  saveProposal: (proposal: Omit<Proposal, 'pm_proposalid'>) => {
    const id = generateId();
    PROPOSALS.push({ ...proposal, pm_proposalid: id });
    return id;
  },

  getConflicts: () => CONFLICTS,

  saveConflict: (conflict: Omit<Conflict, 'pm_conflictid'>) => {
    const id = generateId();
    CONFLICTS.push({ ...conflict, pm_conflictid: id });
    return id;
  },

  addCeiling: (ceiling: KpiCeiling | Omit<KpiCeiling, 'pm_kpiceilingid'>) => {
    const id =
      'pm_kpiceilingid' in ceiling && ceiling.pm_kpiceilingid
        ? ceiling.pm_kpiceilingid
        : generateId();
    CEILINGS.push({ ...ceiling, pm_kpiceilingid: id });
    return id;
  },

  removeCeiling: (ceilingId: string) => {
    CEILINGS = CEILINGS.filter(c => c.pm_kpiceilingid !== ceilingId);
  },

  updateCeiling: (ceilingId: string, updates: Partial<KpiCeiling>) => {
    const ceilingIndex = CEILINGS.findIndex(c => c.pm_kpiceilingid === ceilingId);
    if (ceilingIndex !== -1) {
      CEILINGS[ceilingIndex] = { ...CEILINGS[ceilingIndex], ...updates };
    }
  },

  updateProposal: (proposalId: string, updates: Partial<Proposal>) => {
    const row = PROPOSALS.find((p) => p.pm_proposalid === proposalId);
    if (row) Object.assign(row, updates);
  },

  updateConflict: (conflictId: string, updates: Partial<Conflict>) => {
    const row = CONFLICTS.find((c) => c.pm_conflictid === conflictId);
    if (row) Object.assign(row, updates);
  },

  deleteProposal: (proposalId: string) => {
    PROPOSALS = PROPOSALS.filter((p) => p.pm_proposalid !== proposalId);
    CONFLICTS = CONFLICTS.filter((c) => c.pm_proposal !== proposalId);
  },
};
