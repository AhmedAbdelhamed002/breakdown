import { Pm_modelsService } from '@generated/services/Pm_modelsService';
import { Pm_modeltermsService } from '@generated/services/Pm_modeltermsService';
import { Pm_relationfactorsService } from '@generated/services/Pm_relationfactorsService';
import { Strategy_kpisesService } from '@generated/services/Strategy_kpisesService';
import { Pm_modelspm_resultkind, Pm_modelspm_modeltype } from '@generated/models/Pm_modelsModel';
import { Pm_modeltermspm_termtype } from '@generated/models/Pm_modeltermsModel';

/** Operators a model term can carry. '×' is the default when the picklist label is unmapped. */
export type OperatorSymbol = '×' | '÷' | '+' | '−';

export interface ModelTerm {
  id: string;
  name: string;
  sequence: number;
  /** A term is a KPI reference when it has a KPI lookup, otherwise a literal constant. */
  kind: 'kpi' | 'constant';
  /** Operator joining this term to the preceding one (ignored on the first term). */
  operator: OperatorSymbol;
  kpiId?: string;
  kpiName?: string;
  constantValue?: number;
}

/**
 * A sensitivity rule: "when {factorKpi} moves by {inputPct}%, the model result moves by
 * {resultPct}%". resultPct is signed — negative means the result moves the opposite way.
 */
export interface RelationFactor {
  id: string;
  name: string;
  kpiId?: string;
  kpiName?: string;
  inputPct: number;
  resultPct: number;
}

export interface FinancialModel {
  id: string;
  name: string;
  /** Lifecycle state. Only 'Sealed' models are safe to build live targets from. */
  status?: 'Draft' | 'Under Review' | 'Sealed' | 'Approved By Finance';
  /**
   * How the result is derived. Dataverse has no explicit field for this, so it's inferred
   * from which child rows exist: relation factors => 'Relation', otherwise 'Equation'.
   */
  kind: 'Equation' | 'Relation';
  /** ID of the selected result entity, resolved from the lookup for its result kind. */
  resultKpiId?: string;
  resultKpiName?: string;
  /** What the result refers to — a KPI, or an Org Output/Outcome directly. */
  resultKind: 'kpi' | 'output' | 'outcome';
  /** Relation models grow/shrink from this starting value; equation models don't use it. */
  baseline: number;
  /** When set, the computed result is multiplied by the month's working days. */
  useWorkingDays: boolean;
  terms: ModelTerm[];
  factors: RelationFactor[];
}

/** Map the operator picklist label to its symbol; anything unmapped multiplies. */
function toOperator(label?: string): OperatorSymbol {
  switch ((label || '').trim()) {
    case '÷':
    case 'Divide':
    case 'Division': return '÷';
    case '+':
    case 'Add':
    case 'Addition': return '+';
    case '−':
    case '-':
    case 'Subtract':
    case 'Subtraction': return '−';
    default: return '×';
  }
}

const KPI_NAME_PAGE_SIZE = 5000;
const KPI_NAME_MAX_PAGES = 100;

/**
 * Every KPI's id -> name across the whole catalog. Two things used to make a model term/relation
 * factor's KPI show as "Unnamed KPI" even though the KPI has a real name:
 *  1. A single unfiltered getAll() only returns its first page — strategy_kpises is large enough
 *     to exceed the default page size. Paged with skipToken until exhausted, same fix the
 *     financial feature already needed for this table (see dataverseService.ts's
 *     fetchAllStrategyKpisUnfiltered).
 *  2. strategy_newcolumn isn't the only name field on this table — a KPI created through the
 *     Financial Modeler's own KPI flow (EquationEditor/RelationEditor/KpiCeilingsView) only ever
 *     sets btm_kpibusinessname. Same precedence those screens already use: btm_kpibusinessname,
 *     then strategy_newcolumn, then cr18c_kpicode (see dataverseService.ts's mapKpi).
 * No statecode filter — a model term can still point at a KPI that's since been deactivated, and
 * it should keep showing that KPI's real name.
 */
async function fetchAllKpiNames(): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  let skipToken: string | undefined;
  for (let page = 0; page < KPI_NAME_MAX_PAGES; page++) {
    const res = await Strategy_kpisesService.getAll({
      select: ['strategy_kpisid', 'strategy_newcolumn', 'btm_kpibusinessname', 'cr18c_kpicode'],
      maxPageSize: KPI_NAME_PAGE_SIZE,
      ...(skipToken ? { skipToken } : {})
    });
    if (!res.success || !res.data) break;
    // Keyed lower-case — Dataverse GUIDs compare case-insensitively, but a plain Map doesn't, and
    // a lookup's raw _value can come back a different case than the target table's own primary key.
    for (const k of res.data) {
      const name = k.btm_kpibusinessname || k.strategy_newcolumn || k.cr18c_kpicode;
      if (k.strategy_kpisid && name) names.set(k.strategy_kpisid.toLowerCase(), name);
    }
    if (!res.skipToken) break;
    skipToken = res.skipToken;
  }
  return names;
}

/** Read a result kind out of a pm_resultkind label; undefined when the label says nothing. */
function toResultKind(label?: string): FinancialModel['resultKind'] | undefined {
  const l = (label || '').toLowerCase();
  if (l.includes('outcome')) return 'outcome';
  if (l.includes('output')) return 'output';
  if (l.includes('kpi')) return 'kpi';
  return undefined;
}

type ModelTermRecord = {
  pm_modeltermid: string;
  pm_name: string;
  pm_sequence?: number;
  pm_termtype?: Pm_modeltermspm_termtype;
  pm_termtypename?: string;
  pm_operatorname?: string;
  _pm_kpi_value?: string;
  pm_kpiname?: string;
  pm_constant?: number;
};

const OPERATOR_TOKENS = new Set(['×', '÷', '+', '−', '-', '*', '/']);

/**
 * Classify a term row. pm_termtype (the raw picklist value, e.g. 1/2/4) is reliably returned and
 * decisive when set — pm_termtypename (its formatted label) is a shadow annotation that isn't
 * reliably populated in this environment, and wasn't even in the select list, so it was always
 * undefined here. That forced every row through the shape-based fallback below, which
 * misclassifies a genuine Operator/Constant/Bracket row as a KPI term whenever it happens to
 * carry a leftover pm_KPI lookup value (confirmed against live data: a real Operator row here
 * carries a stray KPI reference) — inserting a spurious extra KPI chip into the equation and
 * leaving the row's real operator/constant unread. The shape fallback only runs when pm_termtype
 * itself is missing.
 */
function toTermType(row: ModelTermRecord): 'kpi' | 'operator' | 'constant' {
  if (row.pm_termtype === 1) return 'kpi';
  if (row.pm_termtype === 2) return 'operator';
  if (row.pm_termtype === 4) return 'constant';
  const label = (row.pm_termtypename || '').toLowerCase();
  if (label === 'kpi' || label === 'operator' || label === 'constant') return label;
  if (row._pm_kpi_value) return 'kpi';
  if (row.pm_operatorname || OPERATOR_TOKENS.has((row.pm_name || '').trim())) return 'operator';
  return 'constant';
}

/**
 * Flatten the model's term rows into operands. Operators live in their own rows (termtype
 * 'Operator'), so each operator is carried forward onto the operand that follows it — the first
 * operand has no preceding operator and its value is ignored when evaluating.
 */
function toEquationTerms(rows: ModelTermRecord[], lookupKpiName: (id?: string) => string | undefined): ModelTerm[] {
  let nextOperator: OperatorSymbol = '×';
  const terms: ModelTerm[] = [];

  rows.sort((a, b) => (a.pm_sequence ?? 0) - (b.pm_sequence ?? 0)).forEach(row => {
    const type = toTermType(row);
    if (type === 'operator') {
      nextOperator = toOperator(row.pm_operatorname || row.pm_name);
      return;
    }
    if (type === 'kpi' && row._pm_kpi_value) {
      terms.push({
        id: row.pm_modeltermid,
        name: row.pm_name,
        sequence: row.pm_sequence ?? 0,
        kind: 'kpi',
        operator: nextOperator,
        kpiId: row._pm_kpi_value,
        // Always the KPI's own name via the pm_kpi lookup — never pm_name, which is the model
        // term row's own (often generic, e.g. "Term 1") name and not the KPI it points to.
        kpiName: lookupKpiName(row._pm_kpi_value) || row.pm_kpiname
      });
      return;
    }
    if (type === 'constant') {
      terms.push({
        id: row.pm_modeltermid,
        name: row.pm_name,
        sequence: row.pm_sequence ?? 0,
        kind: 'constant',
        operator: nextOperator,
        constantValue: row.pm_constant ?? (Number(row.pm_name) || 0)
      });
    }
  });
  return terms;
}

/**
 * What the model's result refers to, and which record it is.
 *
 * pm_resultkind is read three ways because none is reliable alone: its formatted label isn't
 * always returned by the platform, its numeric option maps through the generated choice, and
 * either can be left stale on a model whose result was later pointed at a different entity. So a
 * declared kind is only honoured when its lookup is actually populated — otherwise the populated
 * lookup decides, since that's the record a target or proposal would be written against.
 */
function resolveResult(model: {
  pm_resultkind?: Pm_modelspm_resultkind;
  pm_resultkindname?: string;
  _pm_calculatedkpi_value?: string;
  pm_calculatedkpiname?: string;
  _pm_linkedoutcome_value?: string;
  pm_linkedoutcomename?: string;
  _pm_linkedoutput_value?: string;
  pm_linkedoutputname?: string;
}): Pick<FinancialModel, 'resultKind' | 'resultKpiId' | 'resultKpiName'> {
  const lookups: Record<FinancialModel['resultKind'], { id?: string; name?: string }> = {
    outcome: { id: model._pm_linkedoutcome_value, name: model.pm_linkedoutcomename },
    output: { id: model._pm_linkedoutput_value, name: model.pm_linkedoutputname },
    kpi: { id: model._pm_calculatedkpi_value, name: model.pm_calculatedkpiname }
  };

  const declared = toResultKind(model.pm_resultkindname)
    ?? toResultKind(model.pm_resultkind != null ? Pm_modelspm_resultkind[model.pm_resultkind] : undefined);

  const kinds: FinancialModel['resultKind'][] = ['outcome', 'output', 'kpi'];
  const resultKind = (declared && lookups[declared].id)
    ? declared
    : kinds.find(kind => lookups[kind].id) ?? declared ?? 'kpi';

  return {
    resultKind,
    resultKpiId: lookups[resultKind].id,
    resultKpiName: lookups[resultKind].name
  };
}

export class ModelService {
  public static async getAllModels(): Promise<FinancialModel[]> {
    const [modelsRes, termsRes, factorsRes, kpiNames] = await Promise.all([
      Pm_modelsService.getAll({
        select: [
          'pm_modelid', 'pm_name', 'pm_modeltype', 'pm_resultkind', 'pm_useworkingdays', 'pm_baseline',
          '_pm_calculatedkpi_value', '_pm_linkedoutcome_value', '_pm_linkedoutput_value'
        ],
        filter: 'statecode eq 0'
      }),
      Pm_modeltermsService.getAll({
        select: ['pm_modeltermid', 'pm_name', 'pm_sequence', 'pm_termtype', 'pm_operator', '_pm_kpi_value', 'pm_constant', '_pm_model_value'],
        filter: 'statecode eq 0'
      }),
      Pm_relationfactorsService.getAll({
        select: ['pm_relationfactorid', 'pm_name', '_pm_factorkpi_value', 'pm_inputpct', 'pm_resultpct', 'pm_direction', '_pm_model_value'],
        filter: 'statecode eq 0'
      }),
      // The KPI lookup's formatted name isn't reliably returned on term/factor rows, so read the
      // names from the KPI table itself and resolve them by id — fully paged (see fetchAllKpiNames).
      fetchAllKpiNames()
    ]);

    if (!modelsRes.success || !modelsRes.data) throw new Error('Failed to fetch models');
    if (!termsRes.success || !termsRes.data) throw new Error('Failed to fetch model terms');
    if (!factorsRes.success || !factorsRes.data) throw new Error('Failed to fetch relation factors');

    const lookupKpiName = (id?: string): string | undefined => (id ? kpiNames.get(id.toLowerCase()) : undefined);

    const modelsMap = new Map<string, FinancialModel>();

    modelsRes.data.forEach(m => {
      const result = resolveResult(m);
      modelsMap.set(m.pm_modelid, {
        id: m.pm_modelid,
        name: m.pm_name || 'Unnamed Model',
        // Read from the raw numeric pm_modeltype, not the pm_modeltypename shadow annotation —
        // that formatted-value annotation isn't reliably populated in this environment (same
        // issue as pm_modelterms' pm_termtype/pm_termtypename pair below), so status silently
        // came back undefined. pm_modeltypename is kept only as a fallback.
        status: (m.pm_modeltype != null ? Pm_modelspm_modeltype[m.pm_modeltype] : undefined) ?? (m.pm_modeltypename as FinancialModel['status']),
        kind: 'Equation', // corrected below once child rows are known
        ...result,
        baseline: m.pm_baseline ?? 0,
        // The picklist labels are environment-specific; treat any explicit "yes/true/option 1"
        // style label as enabled and fall back to disabled when it isn't set at all.
        useWorkingDays: !!m.pm_useworkingdays && /^(yes|true|option 1|1)$/i.test(String(m.pm_useworkingdaysname ?? m.pm_useworkingdays)),
        terms: [],
        factors: []
      });
    });

    // Terms are parsed per model so operator rows can be folded into the operand that follows.
    const termRowsByModel = new Map<string, ModelTermRecord[]>();
    termsRes.data.forEach(t => {
      if (!t._pm_model_value || !modelsMap.has(t._pm_model_value)) return;
      const rows = termRowsByModel.get(t._pm_model_value) ?? [];
      rows.push(t as ModelTermRecord);
      termRowsByModel.set(t._pm_model_value, rows);
    });
    termRowsByModel.forEach((rows, modelId) => {
      modelsMap.get(modelId)!.terms = toEquationTerms(rows, lookupKpiName);
    });

    factorsRes.data.forEach(f => {
      const model = f._pm_model_value ? modelsMap.get(f._pm_model_value) : undefined;
      if (!model) return;
      model.factors.push({
        id: f.pm_relationfactorid,
        name: f.pm_name,
        kpiId: f._pm_factorkpi_value,
        kpiName: lookupKpiName(f._pm_factorkpi_value) || f.pm_factorkpiname || f.pm_name,
        inputPct: f.pm_inputpct ?? 0,
        resultPct: f.pm_resultpct ?? 0
      });
    });

    return Array.from(modelsMap.values()).map(m => {
      m.kind = m.factors.length > 0 ? 'Relation' : 'Equation';
      // A model whose result is an Org Output/Outcome still needs a display name for it.
      if (!m.resultKpiName && m.resultKpiId) m.resultKpiName = lookupKpiName(m.resultKpiId);
      return m;
    });
  }

  /** One model by id — for a caller that already knows which model it needs, rather than loading every model to filter client-side. */
  public static async getModelById(modelId: string): Promise<FinancialModel | undefined> {
    const all = await this.getAllModels();
    return all.find(m => m.id === modelId);
  }

  /**
   * The KPIs that actually drive the result — used to build the component table and evaluate
   * the model, so it follows the model's kind: relation factors, or equation terms.
   */
  public static componentKpiIds(model: FinancialModel): string[] {
    const ids = model.kind === 'Relation'
      ? model.factors.map(f => f.kpiId)
      : model.terms.filter(t => t.kind === 'kpi').map(t => t.kpiId);
    return Array.from(new Set(ids.filter((id): id is string => !!id)));
  }

  /**
   * Every KPI a model mentions anywhere — result, model terms and relation factors. Used to
   * answer "which models is this KPI part of", so a KPI recorded in pm_modelterms still matches
   * even on a model whose result is driven by relation factors.
   */
  public static referencedKpiIds(model: FinancialModel): string[] {
    const ids = [
      model.resultKpiId,
      ...model.terms.filter(t => t.kind === 'kpi').map(t => t.kpiId),
      ...model.factors.map(f => f.kpiId)
    ];
    return Array.from(new Set(ids.filter((id): id is string => !!id)));
  }
}
