// ═══════════════════════════════════════════════════════════════════
//  Dataverse Live Service — Power Apps Code App adapter
//  Reads/writes via generated services (NOT Xrm.WebApi).
//  Tables: crd04_regions, businessunit, cr603_chklst_departments,
//  hr_function, strategy_kpis, pm_kpiceiling, pm_model
// ═══════════════════════════════════════════════════════════════════

import type {
  Region,
  BusinessUnit,
  Department,
  HrFunction,
  StrategyKpi,
  KpiCeiling,
  KpiAchievement,
  FinancialModel,
  ModelStatus,
  ModelType,
  EntityKind,
  YesNo,
  ModelTerm,
  RelationFactor,
  TermType,
  Operator,
  FactorDirection,
  Proposal,
  Conflict,
  TargetSource,
  ConflictType,
  ProposalStatus,
  ConflictStatus,
  TargetVersion,
  OrgOutput,
  OrgOutcome,
  OutputContribution,
  OutcomeContribution,
  OrgOutputAchievement,
  OrgOutcomeAchievement,
  RegionChoice,
  WorkingDays,
} from '../models/types';
import { financialStore } from './financialStore';

import { Crd04_regionsesService } from '../../../generated/services/Crd04_regionsesService';
import { BusinessunitsService } from '../../../generated/services/BusinessunitsService';
import { Cr603_chklst_departmentsesService } from '../../../generated/services/Cr603_chklst_departmentsesService';
import { Hr_functionsService } from '../../../generated/services/Hr_functionsService';
import { Strategy_kpisesService } from '../../../generated/services/Strategy_kpisesService';
import { Pm_kpiceilingsService } from '../../../generated/services/Pm_kpiceilingsService';
import { Pm_kpiachievmentsService } from '../../../generated/services/Pm_kpiachievmentsService';
import { Pm_modelsService } from '../../../generated/services/Pm_modelsService';
import { Pm_modeltermsService } from '../../../generated/services/Pm_modeltermsService';
import { Pm_relationfactorsService } from '../../../generated/services/Pm_relationfactorsService';
import { Pm_proposalsService } from '../../../generated/services/Pm_proposalsService';
import { Pm_conflictsService } from '../../../generated/services/Pm_conflictsService';
import { Pm_targetversionsService } from '../../../generated/services/Pm_targetversionsService';
import { Pm_orgoutputsService } from '../../../generated/services/Pm_orgoutputsService';
import { Pm_orgoutcomesService } from '../../../generated/services/Pm_orgoutcomesService';
import { Pm_outputcontributionsService } from '../../../generated/services/Pm_outputcontributionsService';
import { Pm_outcomecontributionsService } from '../../../generated/services/Pm_outcomecontributionsService';
import { Pm_orgoutputachievmentsService } from '../../../generated/services/Pm_orgoutputachievmentsService';
import { Pm_orgoutcomeachievmentsService } from '../../../generated/services/Pm_orgoutcomeachievmentsService';
import { Pm_workingdaysesService } from '../../../generated/services/Pm_workingdaysesService';
import type { Pm_kpiceilings, Pm_kpiceilingsBase } from '../../../generated/models/Pm_kpiceilingsModel';
import type { Pm_modelsBase } from '../../../generated/models/Pm_modelsModel';
import type { Pm_modeltermsBase } from '../../../generated/models/Pm_modeltermsModel';
import type { Pm_relationfactorsBase } from '../../../generated/models/Pm_relationfactorsModel';
import type { Pm_proposalsBase } from '../../../generated/models/Pm_proposalsModel';
import type { Pm_conflictsBase } from '../../../generated/models/Pm_conflictsModel';
import type { Pm_kpiachievmentsBase } from '../../../generated/models/Pm_kpiachievmentsModel';
import type { Pm_orgoutputachievmentsBase } from '../../../generated/models/Pm_orgoutputachievmentsModel';
import type { Pm_orgoutcomeachievmentsBase } from '../../../generated/models/Pm_orgoutcomeachievmentsModel';
import {
  Strategy_kpisesbtm_kpilayer,
  Strategy_kpisesbtm_polarity,
  Strategy_kpisesbtm_unitofmeasure,
  Strategy_kpisesstrategy_aggregatetype,
  Strategy_kpisesstrategy_kpitype,
} from '../../../generated/models/Strategy_kpisesModel';
import { getClient } from '@microsoft/power-apps/data';
import { reconcileCeilingStatuses } from '../utils/ceilingStatus';

// ───────────────────────────────────────────────────────────────────
//  Helpers
// ───────────────────────────────────────────────────────────────────

function normalizeGuid(id: unknown): string {
  if (id == null) return '';
  return String(id).replace(/[{}]/g, '').toLowerCase().trim();
}

function extractGuidFromODataPath(value: string): string {
  const match = value.match(/\(([0-9a-fA-F-]{36})\)/);
  return match ? normalizeGuid(match[1]) : normalizeGuid(value);
}

/** Resolve a lookup GUID from Code App / Web API shapes. */
function extractLookupId(value: unknown): string {
  if (value == null || value === '') return '';
  if (typeof value === 'string') return extractGuidFromODataPath(value);
  if (typeof value === 'object') {
    const rec = value as Record<string, unknown>;
    const nested =
      rec.id ??
      rec.Id ??
      rec.businessunitid ??
      rec.crd04_regionsid ??
      rec.strategy_kpisid ??
      rec.hr_functionid ??
      rec.cr603_chklst_departmentsid ??
      rec.pm_kpiceilingid;
    if (nested != null && nested !== '') return extractLookupId(nested);
  }
  return '';
}

function lookupId(record: Record<string, unknown>, logicalName: string): string {
  return (
    extractLookupId(record[`_${logicalName}_value`]) ||
    extractLookupId(record[logicalName]) ||
    extractLookupId(record[`${logicalName}id`])
  );
}

function lookupName(record: Record<string, unknown>, logicalName: string): string {
  const formatted =
    record[`${logicalName}name`] ??
    record[`_${logicalName}_value@OData.Community.Display.V1.FormattedValue`] ??
    record[`_${logicalName}_value@Microsoft.Dynamics.CRM.formattedvalue`];
  if (typeof formatted === 'string' && formatted.trim()) return formatted.trim();

  const obj = record[logicalName];
  if (obj && typeof obj === 'object') {
    const rec = obj as Record<string, unknown>;
    const name =
      rec.name ??
      rec.Name ??
      rec.btm_kpibusinessname ??
      rec.crd04_id ??
      rec.cr603_department ??
      rec.hr_functionname ??
      rec.hr_name;
    if (typeof name === 'string' && name.trim()) return name.trim();
  }
  return '';
}

function decimalValue(val: unknown): number | undefined {
  if (val == null || val === '') return undefined;
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (typeof val === 'object' && val !== null && 'Value' in val) {
    const inner = (val as { Value: unknown }).Value;
    return typeof inner === 'number' && Number.isFinite(inner) ? inner : undefined;
  }
  const n = Number(val);
  return Number.isFinite(n) ? n : undefined;
}

function choiceNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) return Number(value.trim());
  if (value && typeof value === 'object') {
    const rec = value as Record<string, unknown>;
    const inner = rec.Value ?? rec.value ?? rec.Id ?? rec.id;
    if (typeof inner === 'number' && Number.isFinite(inner)) return inner;
    if (typeof inner === 'string' && /^-?\d+$/.test(inner.trim())) return Number(inner.trim());
  }
  return NaN;
}

function optionLabel(value: unknown, name?: unknown): string {
  const fromName = typeof name === 'string' ? name : '';
  if (fromName.trim()) return fromName.trim().toLowerCase();
  if (typeof value === 'string' && value.trim() && !/^-?\d+$/.test(value.trim())) {
    return value.trim().toLowerCase();
  }
  if (value && typeof value === 'object') {
    const rec = value as Record<string, unknown>;
    const lab = rec.Label ?? rec.label ?? rec.Name ?? rec.name;
    if (typeof lab === 'string' && lab.trim()) return lab.trim().toLowerCase();
  }
  return '';
}

const APPROVED_NAME_PREFIX = '[Approved] ';

function isApprovedProposalName(name?: string): boolean {
  return Boolean(name && /^\s*\[approved\]/i.test(name));
}

function markApprovedProposalName(name?: string): string {
  const base = (name || 'Proposal').replace(/^\s*\[approved\]\s*/i, '').trim();
  return `${APPROVED_NAME_PREFIX}${base}`.slice(0, 200);
}

function unmarkApprovedProposalName(name?: string): string | undefined {
  if (!name) return name;
  return name.replace(/^\s*\[approved\]\s*/i, '').trim() || name;
}

function unwrapList<T>(res: unknown): T[] {
  if (!res) return [];
  if (Array.isArray(res)) return res as T[];

  const root = res as Record<string, unknown>;
  const candidates = [root.data, root.result, root.value, root.entities, root];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate as T[];
    if (candidate && typeof candidate === 'object') {
      const inner = candidate as Record<string, unknown>;
      if (Array.isArray(inner.value)) return inner.value as T[];
      if (Array.isArray(inner.data)) return inner.data as T[];
      if (Array.isArray(inner.result)) return inner.result as T[];
      if (Array.isArray(inner.entities)) return inner.entities as T[];
    }
  }
  return [];
}

function unwrapRecord<T>(res: unknown): T | undefined {
  if (!res || typeof res !== 'object') return undefined;
  const root = res as Record<string, unknown>;
  const data = root.data ?? root.result ?? root.record ?? root.value ?? root;
  if (data && typeof data === 'object' && !Array.isArray(data)) return data as T;
  return undefined;
}

/** Pull a primary-key GUID from the many shapes Code Apps / Web API return on create. */
function extractCreatedId(res: unknown, primaryKey: string): string {
  if (!res) return '';
  if (typeof res === 'string') return extractGuidFromODataPath(res);

  const root = res as Record<string, unknown>;
  const candidates: unknown[] = [
    root[primaryKey],
    root.id,
    root.Id,
    root.entityId,
    root.EntityId,
    root.data,
    root.result,
    root.record,
    root.value,
  ];

  for (const c of candidates) {
    if (typeof c === 'string' && c) {
      const g = extractGuidFromODataPath(c);
      if (isLikelyGuid(g)) return g;
    }
    if (c && typeof c === 'object' && !Array.isArray(c)) {
      const rec = c as Record<string, unknown>;
      const nested = [
        rec[primaryKey],
        rec.id,
        rec.Id,
        rec.entityId,
        rec['@odata.id'],
        rec['odata.id'],
      ];
      for (const n of nested) {
        if (typeof n === 'string' && n) {
          const g = extractGuidFromODataPath(n);
          if (isLikelyGuid(g)) return g;
        }
      }
    }
  }

  // Some SDK wrappers nest again under data.data
  if (root.data && typeof root.data === 'object') {
    const inner = extractCreatedId(root.data, primaryKey);
    if (inner) return inner;
  }
  return '';
}

function odataBind(entitySet: string, id: string): string {
  return `/${entitySet}(${normalizeGuid(id)})`;
}

function escapeODataString(value: string): string {
  return value.replace(/'/g, "''");
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Dedicated Code App client for a single Dataverse entity set. */
function getCodeAppClient(dataSourceName: string, primaryKey: string) {
  return getClient({
    [dataSourceName]: {
      tableId: '',
      version: '',
      primaryKey,
      dataSourceType: 'Dataverse',
      apis: {},
    },
  });
}

function choiceLabel(
  map: Record<string | number, string>,
  value: unknown,
  formattedName: unknown,
  fallback: string
): string {
  if (typeof formattedName === 'string' && formattedName.trim()) return formattedName.trim();
  if (value == null || value === '') return fallback;
  const numeric = typeof value === 'number' ? value : Number(value);
  if (Number.isFinite(numeric) && map[numeric]) return map[numeric];
  if (typeof value === 'string' && value.trim()) return value.trim();
  return fallback;
}

function recordId(record: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const id = extractLookupId(record[key]);
    if (id) return id;
  }
  const odataId = record['@odata.id'] ?? record['odata.id'];
  if (typeof odataId === 'string') return extractGuidFromODataPath(odataId);
  return '';
}

function isDisabledFlag(value: unknown): boolean {
  if (value === true || value === 1 || value === '1') return true;
  if (typeof value === 'string' && value.toLowerCase() === 'true') return true;
  return false;
}

/** True when hosted in Power Apps (iframe) or Xrm is present. */
export function isDataverseEnvironment(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (window.self !== window.top) return true;
  } catch {
    return true;
  }
  const w = window as Window & { PowerApps?: unknown; Xrm?: unknown };
  return typeof w.PowerApps !== 'undefined' || typeof w.Xrm !== 'undefined';
}

interface XrmWebApiLike {
  retrieveMultipleRecords: (entity: string, query: string) => Promise<{ entities?: Record<string, unknown>[] }>;
  createRecord: (entity: string, data: Record<string, unknown>) => Promise<{ id?: string }>;
  updateRecord: (entity: string, id: string, data: Record<string, unknown>) => Promise<unknown>;
  deleteRecord: (entity: string, id: string) => Promise<unknown>;
}

function getXrmWebApi(): XrmWebApiLike | null {
  if (typeof window === 'undefined') return null;
  const tryGet = (target: unknown): XrmWebApiLike | null => {
    try {
      const webApi = (target as { Xrm?: { WebApi?: XrmWebApiLike } })?.Xrm?.WebApi;
      return webApi ?? null;
    } catch {
      return null;
    }
  };
  return tryGet(window) || tryGet(window.parent) || tryGet(window.top) || null;
}

// ───────────────────────────────────────────────────────────────────
//  Mappers
// ───────────────────────────────────────────────────────────────────

function mapRegion(e: Record<string, unknown>): Region {
  return {
    regionid: normalizeGuid(e.crd04_regionsid),
    name: String(e.crd04_id || e.crd04_name || 'Unnamed Region'),
  };
}

function mapBusinessUnit(e: Record<string, unknown>): BusinessUnit {
  const regionid =
    lookupId(e, 'cr603_region') ||
    extractLookupId(e._cr603_region_value) ||
    extractLookupId(e.cr603_Region) ||
    extractLookupId(e.cr603_regionname);
  const id = recordId(e, 'businessunitid', 'BusinessUnitId', 'businessUnitId', 'Id', 'id');
  const name = String(e.name ?? e.Name ?? e.fileasname ?? e.FileAsName ?? '').trim();
  return {
    businessunitid: id,
    name: name || id || 'Unnamed BU',
    regionid: regionid || undefined,
  };
}

function mapDepartment(e: Record<string, unknown>): Department {
  return {
    departmentid: recordId(e, 'cr603_chklst_departmentsid', 'Id', 'id'),
    name: String(e.cr603_department || e.hr_name || 'Unnamed Dept'),
    businessunitid:
      lookupId(e, 'cr603_company') ||
      lookupId(e, 'cr603_Company') ||
      extractLookupId(e._cr603_company_value) ||
      undefined,
  };
}

function functionDisplayName(raw: unknown): string {
  const name = String(raw ?? '').trim();
  if (!name) return 'Unnamed Function';
  const slash = name.indexOf('/');
  if (slash > 0) {
    const onlyFunction = name.slice(0, slash).trim();
    if (onlyFunction) return onlyFunction;
  }
  return name;
}

function mapFunction(e: Record<string, unknown>): HrFunction {
  return {
    functionid: recordId(e, 'hr_functionid', 'Id', 'id'),
    name: functionDisplayName(e.hr_functionname || e.hr_name),
    departmentid: lookupId(e, 'hr_department') || lookupId(e, 'hr_Department') || '',
  };
}

function mapKpi(e: Record<string, unknown>): StrategyKpi {
  const name = String(
    e.btm_kpibusinessname ||
      e.strategy_newcolumn ||
      e.cr18c_kpicode ||
      e.strategy_kpiname ||
      ''
  ).trim();

  return {
    strategy_kpisid: recordId(e, 'strategy_kpisid', 'strategy_kpisId', 'Id', 'id'),
    btm_kpibusinessname: name || 'Unnamed KPI',
    strategy_kpitype: choiceLabel(
      Strategy_kpisesstrategy_kpitype,
      e.strategy_kpitype,
      e.strategy_kpitypename,
      'OutPut'
    ) as StrategyKpi['strategy_kpitype'],
    btm_unitofmeasure: choiceLabel(
      Strategy_kpisesbtm_unitofmeasure,
      e.btm_unitofmeasure,
      e.btm_unitofmeasurename,
      '%'
    ) as StrategyKpi['btm_unitofmeasure'],
    btm_kpilayer: choiceLabel(
      Strategy_kpisesbtm_kpilayer,
      e.btm_kpilayer,
      e.btm_kpilayername,
      'Driver'
    ) as StrategyKpi['btm_kpilayer'],
    strategy_aggregatetype: choiceLabel(
      Strategy_kpisesstrategy_aggregatetype,
      e.strategy_aggregatetype,
      e.strategy_aggregatetypename,
      'Value'
    ) as StrategyKpi['strategy_aggregatetype'],
    btm_polarity: choiceLabel(
      Strategy_kpisesbtm_polarity,
      e.btm_polarity,
      e.btm_polarityname,
      'Higher is Better'
    ) as StrategyKpi['btm_polarity'],
    strategy_department:
      lookupId(e, 'strategy_department') || lookupId(e, 'strategy_Department') || '',
    strategy_departmentname: lookupName(e, 'strategy_department') || undefined,
    strategy_function: lookupId(e, 'strategy_function') || lookupId(e, 'strategy_Function') || '',
    strategy_functionname: lookupName(e, 'strategy_function') || undefined,
    strategy_region: lookupId(e, 'strategy_region') || lookupId(e, 'strategy_Region') || undefined,
    strategy_regionname: lookupName(e, 'strategy_region') || undefined,
  };
}

function mapCeiling(e: Record<string, unknown>): KpiCeiling {
  const rawStatus = e.pm_kpiceilingstatus ?? e.statuscode;
  const statuscode = rawStatus != null ? Number(rawStatus) : 1;
  const isConstraintRaw = e.pm_isconstraint;
  const enforced =
    isConstraintRaw === 1 ||
    isConstraintRaw === true ||
    isConstraintRaw === 'Enforced' ||
    isConstraintRaw === '1';

  return {
    pm_kpiceilingid: normalizeGuid(e.pm_kpiceilingid),
    pm_kpi: lookupId(e, 'pm_kpi'),
    pm_kpiname: lookupName(e, 'pm_kpi') || undefined,
    pm_businessunit: lookupId(e, 'pm_businessunit'),
    pm_businessunitname: lookupName(e, 'pm_businessunit') || undefined,
    pm_min: decimalValue(e.pm_min),
    pm_max: decimalValue(e.pm_max),
    pm_isconstraint: enforced ? 'Enforced' : 'Off',
    pm_effectivedate: String(e.pm_effectivedate || new Date().toISOString()).substring(0, 10),
    statuscode,
    status: statuscode === 2 ? 'Superseded' : 'Active',
  };
}

function mapCalculationType(e: Record<string, unknown>): ModelType {
  const labelCandidates = [
    e.pm_calculationtypename,
    e.pm_calculationtype,
    e.pm_kindname,
    e.pm_kind,
  ];
  for (const candidate of labelCandidates) {
    const label = String(candidate ?? '').toLowerCase();
    if (label.includes('relation')) return 'Relation';
    if (label.includes('equation')) return 'Equation';
  }
  // pm_modeltype on pm_model is lifecycle (Draft / Under Review / Sealed) — not Equation/Relation
  return 'Equation';
}

function mapModelLifecycleValue(e: Record<string, unknown>): number {
  const n = choiceNumber(e.pm_modeltype);
  if (n === PM_MODELTYPE_APPROVED_BY_FINANCE) return PM_MODELTYPE_APPROVED_BY_FINANCE;
  if (n === PM_MODELTYPE_SEALED) return PM_MODELTYPE_SEALED;
  if (n === PM_MODELTYPE_UNDER_REVIEW) return PM_MODELTYPE_UNDER_REVIEW;
  if (n === PM_MODELTYPE_DRAFT) return PM_MODELTYPE_DRAFT;

  const fromName = parseModelStatusLabel(
    optionLabel(e.pm_modeltype, e.pm_modeltypename ?? e.pm_modelstatusname ?? e.pm_modelstatus)
  );
  if (fromName === 'Approved By Finance') return PM_MODELTYPE_APPROVED_BY_FINANCE;
  if (fromName === 'Sealed') return PM_MODELTYPE_SEALED;
  if (fromName === 'In Review') return PM_MODELTYPE_UNDER_REVIEW;
  return PM_MODELTYPE_DRAFT;
}

function mapModelStatus(e: Record<string, unknown>): ModelStatus {
  const lifecycle = mapModelLifecycleValue(e);
  if (lifecycle === PM_MODELTYPE_SEALED) return 'Sealed';
  if (lifecycle === PM_MODELTYPE_APPROVED_BY_FINANCE) return 'Approved By Finance';
  if (lifecycle === PM_MODELTYPE_UNDER_REVIEW) return 'In Review';

  const fromName = parseModelStatusLabel(
    e.pm_modeltypename ?? e.pm_modelstatusname ?? e.pm_modelstatus
  );
  if (fromName) return fromName;

  return 'Draft';
}

function mapResultKind(e: Record<string, unknown>): EntityKind {
  const label = String(e.pm_resultkindname ?? e.pm_resultkind ?? '').toLowerCase();
  if (label.includes('outcome')) return 'OrgOutcome';
  if (label.includes('output')) return 'OrgOutput';
  if (label.includes('kpi')) return 'KPI';
  // Generated pm_resultkind: 1 Org Outcome, 2 Org Output, 3 KPI
  const n = Number(e.pm_resultkind);
  if (n === 1) return 'OrgOutcome';
  if (n === 2) return 'OrgOutput';
  return 'KPI';
}

function mapUseWorkingDays(e: Record<string, unknown>): YesNo {
  const label = String(e.pm_useworkingdaysname ?? e.pm_useworkingdays ?? '').toLowerCase();
  if (label === 'yes' || label === '1' || label === 'true') return 'Yes';
  const n = Number(e.pm_useworkingdays);
  return n === 1 ? 'Yes' : 'No';
}

function parseModelStatusLabel(raw: unknown): ModelStatus | undefined {
  const label = String(raw ?? '').trim().toLowerCase();
  if (!label) return undefined;
  if (label.includes('seal')) return 'Sealed';
  if (label.includes('finance') || label.includes('approved by')) return 'Approved By Finance';
  if (label.includes('review')) return 'In Review';
  if (label.includes('return')) return 'Returned';
  if (label.includes('supersed')) return 'Superseded';
  if (label.includes('retir') || label === 'inactive') return 'Retired';
  if (label.includes('draft') || label === 'active') return 'Draft';
  return undefined;
}

export const PM_MODELTYPE_DRAFT = 1;
export const PM_MODELTYPE_UNDER_REVIEW = 2;
export const PM_MODELTYPE_SEALED = 3;
export const PM_MODELTYPE_APPROVED_BY_FINANCE = 4;

/** Calculation kind choice on pm_model (Equation / Relation). */
export const PM_CALC_EQUATION = 1;
export const PM_CALC_RELATION = 2;

function mapModel(e: Record<string, unknown>): FinancialModel {
  const calculatedKpi = lookupId(e, 'pm_calculatedkpi');
  const resultRef =
    calculatedKpi ||
    lookupId(e, 'pm_kpi') ||
    lookupId(e, 'pm_resultref') ||
    lookupId(e, 'pm_resultkpi') ||
    lookupId(e, 'pm_strategykpi') ||
    lookupId(e, 'pm_result') ||
    lookupId(e, 'pm_linkedoutput') ||
    lookupId(e, 'pm_linkedoutcome');
  const resultName =
    lookupName(e, 'pm_calculatedkpi') ||
    lookupName(e, 'pm_kpi') ||
    lookupName(e, 'pm_resultref') ||
    lookupName(e, 'pm_resultkpi') ||
    lookupName(e, 'pm_strategykpi') ||
    lookupName(e, 'pm_linkedoutput') ||
    lookupName(e, 'pm_linkedoutcome') ||
    (typeof e.pm_name === 'string' ? e.pm_name : '');

  return {
    pm_modelid: normalizeGuid(e.pm_modelid),
    pm_name: typeof e.pm_name === 'string' ? e.pm_name : undefined,
    pm_resultkind: mapResultKind(e),
    pm_resultref: resultRef,
    pm_resultrefname: resultName || undefined,
    pm_calculatedkpi: calculatedKpi || undefined,
    pm_calculatedkpiname: lookupName(e, 'pm_calculatedkpi') || undefined,
    pm_scope: lookupId(e, 'pm_scope'),
    pm_scopename: lookupName(e, 'pm_scope') || undefined,
    pm_modeltype: mapCalculationType(e),
    pm_modeltypevalue: mapModelLifecycleValue(e),
    pm_linkedoutput: lookupId(e, 'pm_linkedoutput') || undefined,
    pm_linkedoutputname: lookupName(e, 'pm_linkedoutput') || undefined,
    pm_linkedoutcome: lookupId(e, 'pm_linkedoutcome') || undefined,
    pm_linkedoutcomename: lookupName(e, 'pm_linkedoutcome') || undefined,
    pm_useworkingdays: mapUseWorkingDays(e),
    pm_version: e.pm_version != null ? String(e.pm_version) : '1.0',
    pm_baseline: decimalValue(e.pm_baseline),
    statuscode: mapModelStatus(e),
    statusLabel:
      (typeof e.pm_modeltypename === 'string' && e.pm_modeltypename.trim()
        ? e.pm_modeltypename.trim()
        : undefined) ||
      lookupName(e, 'pm_modeltype') ||
      undefined,
  };
}

// ───────────────────────────────────────────────────────────────────
//  LIVE DATAVERSE READ OPERATIONS
// ───────────────────────────────────────────────────────────────────

export async function fetchRegionsFromDataverse(): Promise<Region[]> {
  try {
    const res = await Crd04_regionsesService.getAll({
      select: ['crd04_regionsid', 'crd04_id'],
      orderBy: ['crd04_id asc'],
      maxPageSize: 500,
    });
    const list = unwrapList<Record<string, unknown>>(res)
      .map(mapRegion)
      .filter((r) => r.regionid);
    if (list.length > 0) return list;
    if (res) return [];
  } catch (err) {
    console.warn('[DataverseService] Generated service fetch regions notice:', err);
  }

  const xrm = getXrmWebApi();
  if (xrm) {
    try {
      const res = await xrm.retrieveMultipleRecords(
        'crd04_regions',
        '?$select=crd04_regionsid,crd04_id&$orderby=crd04_id asc'
      );
      if ((res.entities?.length ?? 0) > 0) {
        return (res.entities as Record<string, unknown>[]).map(mapRegion);
      }
    } catch (err) {
      console.warn('[DataverseService] Xrm fetch regions notice:', err);
    }
  }

  return isDataverseEnvironment() ? [] : financialStore.getRegions();
}

function normalizeBusinessUnits(raw: unknown): BusinessUnit[] {
  const rows = unwrapList<Record<string, unknown>>(raw);
  return rows
    .filter((e) => !isDisabledFlag(e.isdisabled ?? e.IsDisabled))
    .map(mapBusinessUnit)
    .filter((bu) => bu.businessunitid);
}

export async function fetchBusinessUnitsFromDataverse(): Promise<BusinessUnit[]> {
  const attempts: Array<{ label: string; run: () => Promise<unknown> }> = [
    {
      label: 'client.businessunits',
      run: () =>
        getCodeAppClient('businessunits', 'businessunitid').retrieveMultipleRecordsAsync('businessunits', {
          select: ['businessunitid', 'name', 'fileasname', 'isdisabled', '_cr603_region_value'],
          top: 500,
        }),
    },
    {
      label: 'client.businessunits.unfiltered',
      run: () =>
        getCodeAppClient('businessunits', 'businessunitid').retrieveMultipleRecordsAsync('businessunits', { top: 500 }),
    },
    {
      label: 'BusinessunitsService.getAll',
      run: () => BusinessunitsService.getAll({ top: 500 }),
    },
    {
      label: 'BusinessunitsService.getAll.plain',
      run: () => BusinessunitsService.getAll(),
    },
  ];

  const errors: string[] = [];
  for (const attempt of attempts) {
    try {
      const res = await attempt.run();
      const list = normalizeBusinessUnits(res);
      if (list.length > 0) {
        console.log(`[DataverseService] Loaded ${list.length} business units via ${attempt.label}`);
        return list;
      }
      console.warn(`[DataverseService] ${attempt.label} returned 0 BUs. Raw:`, res);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`${attempt.label}: ${message}`);
      console.warn(`[DataverseService] ${attempt.label} failed:`, err);
    }
  }

  const xrm = getXrmWebApi();
  if (xrm) {
    try {
      const res = await xrm.retrieveMultipleRecords(
        'businessunit',
        '?$select=businessunitid,name,fileasname,isdisabled,_cr603_region_value&$filter=isdisabled eq false&$orderby=name asc'
      );
      const list = normalizeBusinessUnits(res);
      if (list.length > 0) return list;
    } catch (err) {
      errors.push(`Xrm: ${err instanceof Error ? err.message : String(err)}`);
      console.warn('[DataverseService] Xrm fetch BUs notice:', err);
    }
  }

  if (isDataverseEnvironment()) {
    throw new Error(
      `No business units loaded from Dataverse. ${errors[0] ?? 'businessunits data source is not registered in the Code App.'}`
    );
  }
  return financialStore.getBusinessUnits();
}

export async function fetchDepartmentsFromDataverse(): Promise<Department[]> {
  const attempts: Array<{ label: string; run: () => Promise<unknown> }> = [
    {
      label: 'client.departments',
      run: () =>
        getCodeAppClient('cr603_chklst_departmentses', 'cr603_chklst_departmentsid').retrieveMultipleRecordsAsync(
          'cr603_chklst_departmentses',
          { top: 500 }
        ),
    },
    {
      label: 'Cr603_chklst_departmentsesService.getAll',
      run: () => Cr603_chklst_departmentsesService.getAll({ top: 500 }),
    },
    {
      label: 'Cr603_chklst_departmentsesService.getAll.plain',
      run: () => Cr603_chklst_departmentsesService.getAll(),
    },
  ];

  for (const attempt of attempts) {
    try {
      const res = await attempt.run();
      const list = unwrapList<Record<string, unknown>>(res)
        .filter((e) => !isInactiveRecord(e))
        .map(mapDepartment)
        .filter((d) => d.departmentid);
      if (list.length > 0) {
        console.log(`[DataverseService] Loaded ${list.length} departments via ${attempt.label}`);
        return list;
      }
    } catch (err) {
      console.warn(`[DataverseService] ${attempt.label} failed:`, err);
    }
  }

  const xrm = getXrmWebApi();
  if (xrm) {
    try {
      const res = await xrm.retrieveMultipleRecords(
        'cr603_chklst_departments',
        '?$select=cr603_chklst_departmentsid,cr603_department,hr_name,_cr603_company_value&$filter=statecode eq 0'
      );
      if ((res.entities?.length ?? 0) > 0) {
        return (res.entities as Record<string, unknown>[]).map(mapDepartment);
      }
    } catch (err) {
      console.warn('[DataverseService] Xrm fetch departments notice:', err);
    }
  }

  return isDataverseEnvironment() ? [] : financialStore.getDepartments();
}

export async function fetchFunctionsFromDataverse(): Promise<HrFunction[]> {
  const attempts: Array<{ label: string; run: () => Promise<unknown> }> = [
    {
      label: 'client.functions',
      run: () =>
        getCodeAppClient('hr_functions', 'hr_functionid').retrieveMultipleRecordsAsync('hr_functions', { top: 500 }),
    },
    {
      label: 'Hr_functionsService.getAll',
      run: () =>
        Hr_functionsService.getAll({
          top: 500,
          select: ['hr_functionid', 'hr_functionname', 'hr_name'],
        }),
    },
    {
      label: 'Hr_functionsService.getAll.plain',
      run: () => Hr_functionsService.getAll(),
    },
  ];

  for (const attempt of attempts) {
    try {
      const res = await attempt.run();
      const list = unwrapList<Record<string, unknown>>(res)
        .filter((e) => !isInactiveRecord(e))
        .map(mapFunction)
        .filter((f) => f.functionid);
      if (list.length > 0) {
        console.log(`[DataverseService] Loaded ${list.length} functions via ${attempt.label}`);
        return list;
      }
    } catch (err) {
      console.warn(`[DataverseService] ${attempt.label} failed:`, err);
    }
  }

  const xrm = getXrmWebApi();
  if (xrm) {
    try {
      const res = await xrm.retrieveMultipleRecords(
        'hr_function',
        '?$select=hr_functionid,hr_name,hr_functionname,_hr_department_value&$filter=statecode eq 0'
      );
      if ((res.entities?.length ?? 0) > 0) {
        return (res.entities as Record<string, unknown>[]).map(mapFunction);
      }
    } catch (err) {
      console.warn('[DataverseService] Xrm fetch functions notice:', err);
    }
  }

  return isDataverseEnvironment() ? [] : financialStore.getFunctions();
}

function isInactiveRecord(e: Record<string, unknown>): boolean {
  const state = e.statecode;
  return state === 1 || state === '1' || state === 'Inactive';
}

function normalizeKpis(raw: unknown): StrategyKpi[] {
  return unwrapList<Record<string, unknown>>(raw)
    .map(mapKpi)
    .filter((k) => k.strategy_kpisid)
    .sort((a, b) => a.btm_kpibusinessname.localeCompare(b.btm_kpibusinessname));
}

const STRATEGY_KPI_SELECT = [
  'strategy_kpisid',
  'btm_kpibusinessname',
  'strategy_newcolumn',
  'cr18c_kpicode',
  'strategy_kpitype',
  'btm_unitofmeasure',
  'btm_kpilayer',
  'strategy_aggregatetype',
  'btm_polarity',
  'statecode',
  '_strategy_department_value',
  '_strategy_function_value',
  '_strategy_region_value',
  'strategy_departmentname',
  'strategy_functionname',
  'strategy_regionname',
] as const;

const STRATEGY_KPI_PAGE_SIZE = 5000;
const STRATEGY_KPI_MAX_PAGES = 100;

function dedupeKpisById(kpis: StrategyKpi[]): StrategyKpi[] {
  const byId = new Map<string, StrategyKpi>();
  for (const kpi of kpis) {
    const id = normalizeGuid(kpi.strategy_kpisid);
    if (!id || byId.has(id)) continue;
    byId.set(id, { ...kpi, strategy_kpisid: id });
  }
  return [...byId.values()].sort((a, b) =>
    a.btm_kpibusinessname.localeCompare(b.btm_kpibusinessname)
  );
}

/**
 * Load every row from strategy_kpis (entity set strategy_kpises) — same table
 * pm_proposal.pm_kpi binds to. No statecode / region / department filter.
 * Pages with skipToken until the catalog is exhausted.
 */
async function fetchAllStrategyKpisUnfiltered(
  runPage: (skipToken?: string) => Promise<{ list: StrategyKpi[]; skipToken?: string }>
): Promise<StrategyKpi[]> {
  const collected: StrategyKpi[] = [];
  let skipToken: string | undefined;
  for (let page = 0; page < STRATEGY_KPI_MAX_PAGES; page++) {
    const result = await runPage(skipToken);
    collected.push(...result.list);
    if (!result.skipToken) break;
    skipToken = result.skipToken;
  }
  return dedupeKpisById(collected);
}

export async function fetchKpisFromDataverse(): Promise<StrategyKpi[]> {
  const errors: string[] = [];

  const attempts: Array<{
    label: string;
    runPage: (skipToken?: string) => Promise<{ list: StrategyKpi[]; skipToken?: string }>;
  }> = [
    {
      label: 'Strategy_kpisesService.getAll.paged',
      runPage: async (skipToken) => {
        const res = await Strategy_kpisesService.getAll({
          select: [...STRATEGY_KPI_SELECT],
          maxPageSize: STRATEGY_KPI_PAGE_SIZE,
          ...(skipToken ? { skipToken } : {}),
        });
        return { list: normalizeKpis(res), skipToken: res.skipToken };
      },
    },
    {
      label: 'client.strategy_kpises.paged',
      runPage: async (skipToken) => {
        const res = await getCodeAppClient('strategy_kpises', 'strategy_kpisid').retrieveMultipleRecordsAsync(
          'strategy_kpises',
          {
            select: [...STRATEGY_KPI_SELECT],
            maxPageSize: STRATEGY_KPI_PAGE_SIZE,
            ...(skipToken ? { skipToken } : {}),
          }
        );
        const token =
          res && typeof res === 'object' && 'skipToken' in res
            ? (res as { skipToken?: string }).skipToken
            : undefined;
        return { list: normalizeKpis(res), skipToken: token };
      },
    },
    {
      label: 'Strategy_kpisesService.getAll.unfiltered.paged',
      runPage: async (skipToken) => {
        const res = await Strategy_kpisesService.getAll({
          maxPageSize: STRATEGY_KPI_PAGE_SIZE,
          ...(skipToken ? { skipToken } : {}),
        });
        return { list: normalizeKpis(res), skipToken: res.skipToken };
      },
    },
  ];

  for (const attempt of attempts) {
    try {
      const list = await fetchAllStrategyKpisUnfiltered(attempt.runPage);
      if (list.length > 0) {
        console.log(`[DataverseService] Loaded ${list.length} KPIs via ${attempt.label} (no filters)`);
        return list;
      }
      console.warn(`[DataverseService] ${attempt.label} returned 0 KPIs`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`${attempt.label}: ${message}`);
      console.warn(`[DataverseService] ${attempt.label} failed:`, err);
    }
  }

  const xrm = getXrmWebApi();
  if (xrm) {
    try {
      const collected: StrategyKpi[] = [];
      let query =
        '?$select=strategy_kpisid,btm_kpibusinessname,strategy_newcolumn,cr18c_kpicode,strategy_kpitype,btm_unitofmeasure,btm_kpilayer,strategy_aggregatetype,btm_polarity,statecode,_strategy_department_value,_strategy_function_value,_strategy_region_value&$orderby=strategy_newcolumn asc';
      for (let page = 0; page < STRATEGY_KPI_MAX_PAGES; page++) {
        const res = await xrm.retrieveMultipleRecords('strategy_kpis', query);
        collected.push(...normalizeKpis(res));
        const nextLink =
          res && typeof res === 'object' && 'nextLink' in res
            ? String((res as { nextLink?: string }).nextLink ?? '')
            : '';
        if (!nextLink) break;
        const qIndex = nextLink.indexOf('?');
        query = qIndex >= 0 ? nextLink.slice(qIndex) : '';
        if (!query) break;
      }
      const list = dedupeKpisById(collected);
      if (list.length > 0) {
        console.log(`[DataverseService] Loaded ${list.length} KPIs via Xrm (no filters)`);
        return list;
      }
    } catch (err) {
      errors.push(`Xrm: ${err instanceof Error ? err.message : String(err)}`);
      console.warn('[DataverseService] Xrm fetch KPIs notice:', err);
    }
  }

  if (isDataverseEnvironment()) {
    throw new Error(
      `No KPIs loaded from strategy_kpis. ${errors[0] ?? 'strategy_kpises data source is not returning records.'}`
    );
  }
  return financialStore.getKpis();
}

export async function fetchCeilingsFromDataverse(): Promise<KpiCeiling[]> {
  try {
    const res = await Pm_kpiceilingsService.getAll({
      select: [
        'pm_kpiceilingid',
        'pm_name',
        'pm_min',
        'pm_max',
        'pm_isconstraint',
        'pm_effectivedate',
        'pm_kpiceilingstatus',
        '_pm_kpi_value',
        '_pm_businessunit_value',
      ],
      orderBy: ['pm_effectivedate desc'],
      maxPageSize: 5000,
    });
    let list = unwrapList<Record<string, unknown>>(res)
      .map(mapCeiling)
      .filter((c) => c.pm_kpiceilingid);

    if (list.length === 0) {
      const fallback = await Pm_kpiceilingsService.getAll({ maxPageSize: 5000 });
      list = unwrapList<Record<string, unknown>>(fallback)
        .map(mapCeiling)
        .filter((c) => c.pm_kpiceilingid);
    }
    if (list.length > 0 || res) return list;
  } catch (err) {
    console.warn('[DataverseService] Generated service fetch ceilings notice:', err);
    try {
      const fallback = await Pm_kpiceilingsService.getAll({ maxPageSize: 5000 });
      return unwrapList<Record<string, unknown>>(fallback)
        .map(mapCeiling)
        .filter((c) => c.pm_kpiceilingid);
    } catch (fallbackErr) {
      console.warn('[DataverseService] Fallback fetch ceilings notice:', fallbackErr);
    }
  }

  const xrm = getXrmWebApi();
  if (xrm) {
    try {
      const res = await xrm.retrieveMultipleRecords(
        'pm_kpiceiling',
        '?$select=pm_kpiceilingid,_pm_kpi_value,_pm_businessunit_value,pm_min,pm_max,pm_isconstraint,pm_effectivedate,pm_kpiceilingstatus,pm_name'
      );
      if (res?.entities) {
        return (res.entities as Record<string, unknown>[])
          .map(mapCeiling)
          .filter((c) => c.pm_kpiceilingid);
      }
    } catch (err) {
      console.warn('[DataverseService] Xrm fetch ceilings notice:', err);
    }
  }

  return isDataverseEnvironment() ? [] : financialStore.getCeilings();
}

function mapTargetSourceChoice(raw: unknown): TargetSource {
  const n = Number(raw);
  if (n === 2) return 'TopDownMonthly';
  if (n === 3) return 'Breakdown';
  if (n === 4) return 'BottomUp';
  if (n === 5) return 'FinancialModeler';
  const label = String(raw ?? '').toLowerCase();
  if (label.includes('top') || label.includes('monthly')) return 'TopDownMonthly';
  if (label.includes('break')) return 'Breakdown';
  if (label.includes('bottom')) return 'BottomUp';
  if (label.includes('model')) return 'FinancialModeler';
  return 'Forecast';
}

function mapTargetVersion(e: Record<string, unknown>): TargetVersion {
  const isCurrentRaw = e.pm_iscurrent;
  const isCurrent =
    isCurrentRaw === 1 ||
    isCurrentRaw === true ||
    String(e.pm_iscurrentname ?? '').toLowerCase() === 'yes';

  return {
    pm_targetversionid: normalizeGuid(e.pm_targetversionid),
    pm_entitykind:
      Number(e.pm_entitykind) === 3
        ? 'OrgOutcome'
        : Number(e.pm_entitykind) === 2
          ? 'OrgOutput'
          : 'KPI',
    pm_kpi: lookupId(e, 'pm_kpi') || undefined,
    pm_orgoutput: lookupId(e, 'pm_orgoutput') || undefined,
    pm_orgoutcome: lookupId(e, 'pm_orgoutcome') || undefined,
    pm_achievment: lookupId(e, 'pm_achievment'),
    pm_businessunit: lookupId(e, 'pm_businessunit'),
    pm_month: mapAchievementMonth(e),
    pm_year: Number(e.pm_year) || 0,
    pm_value: decimalValue(e.pm_value) ?? 0,
    pm_source: mapTargetSourceChoice(e.pm_source),
    pm_versionno: Number(e.pm_versionno) || 1,
    pm_supersedes: lookupId(e, 'pm_supersedes') || undefined,
    pm_iscurrent: isCurrent ? 'Yes' : 'No',
    pm_conflict: lookupId(e, 'pm_conflict') || undefined,
    pm_sourcemodel: lookupId(e, 'pm_sourcemodel') || undefined,
    pm_setby: lookupId(e, 'pm_setby') || undefined,
    pm_seton: e.pm_seton != null ? String(e.pm_seton) : undefined,
  };
}

export async function fetchTargetVersionsFromDataverse(): Promise<TargetVersion[]> {
  try {
    const res = await Pm_targetversionsService.getAll({
      select: [
        'pm_targetversionid',
        'pm_name',
        'pm_entitykind',
        'pm_value',
        'pm_source',
        'pm_month',
        'pm_year',
        'pm_versionno',
        'pm_iscurrent',
        '_pm_kpi_value',
        '_pm_orgoutput_value',
        '_pm_orgoutcome_value',
        '_pm_businessunit_value',
        '_pm_achievment_value',
        '_pm_sourcemodel_value',
      ],
      maxPageSize: 5000,
    });
    const list = unwrapList<Record<string, unknown>>(res)
      .map(mapTargetVersion)
      .filter((t) => t.pm_targetversionid);
    if (list.length > 0 || res) return list;
  } catch (err) {
    console.warn('[DataverseService] Generated service fetch target versions notice:', err);
  }

  const xrm = getXrmWebApi();
  if (xrm) {
    try {
      const res = await xrm.retrieveMultipleRecords(
        'pm_targetversion',
        '?$select=pm_targetversionid,pm_name,pm_entitykind,pm_value,pm_source,pm_month,pm_year,pm_versionno,pm_iscurrent,_pm_kpi_value,_pm_orgoutput_value,_pm_orgoutcome_value,_pm_businessunit_value,_pm_achievment_value&$top=5000'
      );
      return (res.entities ?? []).map((e) => mapTargetVersion(e as Record<string, unknown>));
    } catch (err) {
      console.warn('[DataverseService] Xrm fetch target versions notice:', err);
    }
  }

  return [];
}

function mapAchievementMonth(e: Record<string, unknown>): number {
  const n = Number(e.pm_month);
  if (Number.isFinite(n) && n >= 1 && n <= 12) return n;
  const label = String(e.pm_monthname ?? e.pm_month ?? '').toLowerCase();
  const names = [
    'january',
    'february',
    'march',
    'april',
    'may',
    'june',
    'july',
    'august',
    'september',
    'october',
    'november',
    'december',
  ];
  const idx = names.findIndex((m) => label.includes(m.slice(0, 3)));
  return idx >= 0 ? idx + 1 : 0;
}

function mapKpiAchievement(e: Record<string, unknown>): KpiAchievement {
  const deptLookup =
    lookupId(e, 'pm_department') || lookupId(e, 'stf_department') || '';
  const fnLookup = lookupId(e, 'pm_function') || lookupId(e, 'stf_function') || '';
  const stfDeptRaw = typeof e.stf_department === 'string' ? e.stf_department.trim() : '';
  const stfFnRaw = typeof e.stf_function === 'string' ? e.stf_function.trim() : '';

  return {
    pm_kpiachievmentid: normalizeGuid(e.pm_kpiachievmentid),
    pm_kpi: lookupId(e, 'pm_kpi'),
    pm_kpiname: lookupName(e, 'pm_kpi') || undefined,
    pm_businessunit: lookupId(e, 'pm_businessunit'),
    pm_businessunitname: lookupName(e, 'pm_businessunit') || undefined,
    pm_department: deptLookup || undefined,
    pm_departmentname:
      lookupName(e, 'pm_department') ||
      lookupName(e, 'stf_department') ||
      (stfDeptRaw && !isLikelyGuid(stfDeptRaw) ? stfDeptRaw : undefined),
    pm_function: fnLookup || undefined,
    pm_functionname:
      lookupName(e, 'pm_function') ||
      lookupName(e, 'stf_function') ||
      (stfFnRaw && !isLikelyGuid(stfFnRaw) ? stfFnRaw : undefined),
    pm_month: mapAchievementMonth(e),
    pm_year: Number(e.pm_year) || 0,
    pm_target: decimalValue(e.pm_target),
    pm_actual: decimalValue(e.pm_actual),
    pm_baseline: decimalValue(e.pm_baseline),
    pm_historical: decimalValue(e.pm_historical),
  };
}

export interface AchievementQueryFilters {
  businessUnitId?: string;
  month?: number;
  year?: number;
}

/**
 * Load actual / baseline / historical from pm_kpiachievments.
 * Prefer filtering by business unit + period when provided.
 */
export async function fetchKpiAchievementsFromDataverse(
  filters?: AchievementQueryFilters
): Promise<KpiAchievement[]> {
  const parts: string[] = ['statecode eq 0'];
  const buId = filters?.businessUnitId ? normalizeGuid(filters.businessUnitId) : '';
  if (buId && isLikelyGuid(buId)) {
    parts.push(`_pm_businessunit_value eq ${buId}`);
  }
    if (filters?.year != null && filters.year > 0) {
      parts.push(`pm_year eq ${filters.year}`);
    }
  const filter = parts.join(' and ');

  try {
    const res = await Pm_kpiachievmentsService.getAll({
      select: [
        'pm_kpiachievmentid',
        'pm_name',
        'pm_actual',
        'pm_baseline',
        'pm_historical',
        'pm_target',
        'pm_month',
        'pm_year',
        'statecode',
        '_pm_kpi_value',
        '_pm_businessunit_value',
        'stf_department',
        'stf_function',
      ],
      filter,
      maxPageSize: 5000,
    });
    let list = unwrapList<Record<string, unknown>>(res)
      .map(mapKpiAchievement)
      .filter((a) => a.pm_kpiachievmentid);

    if (list.length === 0) {
      const fallback = await Pm_kpiachievmentsService.getAll({
        filter: buId && isLikelyGuid(buId) ? `_pm_businessunit_value eq ${buId}` : undefined,
        maxPageSize: 5000,
      });
      list = unwrapList<Record<string, unknown>>(fallback)
        .map(mapKpiAchievement)
        .filter((a) => a.pm_kpiachievmentid);
    }

    if (list.length > 0) {
      console.log('[DataverseService] Loaded', list.length, 'KPI achievements from pm_kpiachievments');
      return list;
    }
    if (res) return [];
  } catch (err) {
    console.warn('[DataverseService] Fetch KPI achievements notice:', err);
    try {
      const fallback = await Pm_kpiachievmentsService.getAll({ maxPageSize: 5000 });
      return unwrapList<Record<string, unknown>>(fallback)
        .map(mapKpiAchievement)
        .filter((a) => a.pm_kpiachievmentid);
    } catch (fallbackErr) {
      console.warn('[DataverseService] Fallback fetch KPI achievements notice:', fallbackErr);
    }
  }

  const xrm = getXrmWebApi();
  if (xrm) {
    try {
      const qs = [
        '?$select=pm_kpiachievmentid,pm_name,pm_actual,pm_baseline,pm_historical,pm_target,pm_month,pm_year,_pm_kpi_value,_pm_businessunit_value,stf_department,stf_function',
        `&$filter=${encodeURIComponent(filter)}`,
      ].join('');
      const res = await xrm.retrieveMultipleRecords('pm_kpiachievment', qs);
      if (res?.entities) {
        return (res.entities as Record<string, unknown>[])
          .map(mapKpiAchievement)
          .filter((a) => a.pm_kpiachievmentid);
      }
    } catch (err) {
      console.warn('[DataverseService] Xrm fetch KPI achievements notice:', err);
    }
  }

  return isDataverseEnvironment() ? [] : financialStore.getAchievements();
}

export async function fetchModelsFromDataverse(): Promise<FinancialModel[]> {
  try {
    const res = await Pm_modelsService.getAll({
      select: [
        'pm_modelid',
        'pm_name',
        'pm_version',
        'pm_baseline',
        'pm_modeltype',
        'pm_modeltypename',
        'pm_resultkind',
        'pm_useworkingdays',
        'statuscode',
        'pm_modelstatus',
        '_pm_scope_value',
        '_pm_linkedoutput_value',
        '_pm_linkedoutcome_value',
        '_pm_calculatedkpi_value',
        '_pm_kpi_value',
        '_pm_resultref_value',
      ],
      orderBy: ['pm_name asc'],
      maxPageSize: 5000,
    });
    let list = unwrapList<Record<string, unknown>>(res)
      .map(mapModel)
      .filter((m) => m.pm_modelid);

    if (list.length === 0) {
      const fallback = await Pm_modelsService.getAll({ maxPageSize: 5000 });
      list = unwrapList<Record<string, unknown>>(fallback)
        .map(mapModel)
        .filter((m) => m.pm_modelid);
    }
    if (list.length > 0 || res) return list;
  } catch (err) {
    console.warn('[DataverseService] Generated service fetch models notice:', err);
    try {
      const fallback = await Pm_modelsService.getAll({ maxPageSize: 5000 });
      return unwrapList<Record<string, unknown>>(fallback)
        .map(mapModel)
        .filter((m) => m.pm_modelid);
    } catch (fallbackErr) {
      console.warn('[DataverseService] Fallback fetch models notice:', fallbackErr);
    }
  }

  const xrm = getXrmWebApi();
  if (xrm) {
    try {
      const res = await xrm.retrieveMultipleRecords(
        'pm_model',
        '?$select=pm_modelid,pm_name,pm_version,pm_baseline,pm_modeltype,pm_modeltypename,pm_resultkind,pm_useworkingdays,statuscode,pm_modelstatus,_pm_scope_value,_pm_linkedoutput_value,_pm_linkedoutcome_value,_pm_calculatedkpi_value,_pm_kpi_value,_pm_resultref_value'
      );
      if (res?.entities) {
        return (res.entities as Record<string, unknown>[])
          .map(mapModel)
          .filter((m) => m.pm_modelid);
      }
    } catch (err) {
      console.warn('[DataverseService] Xrm fetch models notice:', err);
      try {
        const res = await xrm.retrieveMultipleRecords('pm_model', '');
        if (res?.entities) {
          return (res.entities as Record<string, unknown>[])
            .map(mapModel)
            .filter((m) => m.pm_modelid);
        }
      } catch (fallbackErr) {
        console.warn('[DataverseService] Xrm fallback fetch models notice:', fallbackErr);
      }
    }
  }

  return isDataverseEnvironment() ? [] : financialStore.getModels();
}

export function isAwaitingReviewStatus(status: ModelStatus | string | undefined): boolean {
  const label = String(status ?? '').toLowerCase();
  return (
    label === 'in review' ||
    label === 'under review' ||
    label === 'approved by finance'
  );
}

export function isSealedStatus(status: ModelStatus | string | undefined): boolean {
  return String(status ?? '').toLowerCase() === 'sealed';
}

export function isApprovedByFinanceModel(model: FinancialModel): boolean {
  return (
    model.pm_modeltypevalue === PM_MODELTYPE_APPROVED_BY_FINANCE ||
    model.statuscode === 'Approved By Finance' ||
    String(model.statusLabel ?? '').toLowerCase().includes('finance')
  );
}

export function isAwaitingReviewModel(model: FinancialModel): boolean {
  return (
    model.pm_modeltypevalue === PM_MODELTYPE_UNDER_REVIEW ||
    model.pm_modeltypevalue === PM_MODELTYPE_APPROVED_BY_FINANCE ||
    isAwaitingReviewStatus(model.statuscode) ||
    isAwaitingReviewStatus(model.statusLabel) ||
    isApprovedByFinanceModel(model)
  );
}

export function isSealedModel(model: FinancialModel): boolean {
  return model.pm_modeltypevalue === PM_MODELTYPE_SEALED || isSealedStatus(model.statuscode);
}

export function lifecycleStatusChoice(status: ModelStatus): 1 | 2 | 3 | 4 {
  if (status === 'Sealed') return PM_MODELTYPE_SEALED;
  if (status === 'Approved By Finance') return PM_MODELTYPE_APPROVED_BY_FINANCE;
  if (status === 'In Review') return PM_MODELTYPE_UNDER_REVIEW;
  return PM_MODELTYPE_DRAFT;
}

export function lifecycleStatusLabel(status: ModelStatus): string {
  if (status === 'In Review') return 'Under Review';
  if (status === 'Approved By Finance') return 'Approved By Finance';
  if (status === 'Sealed') return 'Sealed';
  return 'Draft';
}

export function applyModelLifecycle(
  model: FinancialModel,
  status: ModelStatus
): FinancialModel {
  return {
    ...model,
    statuscode: status,
    pm_modeltypevalue: lifecycleStatusChoice(status),
    statusLabel: lifecycleStatusLabel(status),
  };
}

function lifecycleWriteAttempts(status: ModelStatus): unknown[] {
  // Web API requires Edm.Int32 option-set values; try label only as a fallback.
  return [lifecycleStatusChoice(status), lifecycleStatusLabel(status)];
}

export async function updateModelLifecycleInDataverse(
  modelId: string,
  status: ModelStatus
): Promise<void> {
  const id = normalizeGuid(modelId);
  if (!isLikelyGuid(id)) return;

  let lastErr: unknown;
  for (const pm_modeltype of lifecycleWriteAttempts(status)) {
    const payload = { pm_modeltype } as Record<string, unknown>;
    try {
      const res = await Pm_modelsService.update(id, payload as never);
      assertOperationSuccess(res, 'pm_models lifecycle update');
      return;
    } catch (err) {
      lastErr = err;
      console.warn('[DataverseService] Generated lifecycle update notice:', err);
    }

    const xrm = getXrmWebApi();
    if (xrm) {
      try {
        await xrm.updateRecord('pm_model', id, payload);
        return;
      } catch (xrmErr) {
        lastErr = xrmErr;
      }
    }
  }

  if (isDataverseEnvironment()) {
    throw lastErr instanceof Error ? lastErr : new Error('Failed to update model type in Dataverse.');
  }
}

function mapTermType(e: Record<string, unknown>): TermType {
  const label = String(e.pm_termtypename ?? e.pm_termtype ?? '').toLowerCase();
  if (label.includes('oper')) return 'Operator';
  if (label.includes('const')) return 'Constant';
  if (label.includes('brack')) return 'Bracket';
  if (label.includes('kpi')) return 'KPI';
  const n = Number(e.pm_termtype);
  if (n === 2) return 'Operator';
  if (n === 3) return 'Bracket';
  if (n === 4) return 'Constant';
  return 'KPI';
}

function mapOperator(e: Record<string, unknown>): Operator | undefined {
  const label = String(e.pm_operatorname ?? e.pm_operator ?? e.pm_name ?? '').trim();
  const compact = label.replace(/\s+/g, '');
  if (!compact) return undefined;
  if (compact === '*' || compact.toLowerCase() === 'x' || compact === '×') return '×';
  if (compact === '/' || compact === '÷' || compact.startsWith('÷')) return '÷';
  if (compact === '+' ) return '+';
  if (compact === '-' || compact === '–' || compact === '−') return '−';
  if (compact === '(' || compact === ')') return compact as Operator;
  const n = Number(e.pm_operator);
  if (n === 1) return '×';
  if (n === 2) return '÷';
  if (n === 3) return '+';
  if (n === 4) return '−';
  return undefined;
}

function mapModelTerm(e: Record<string, unknown>): ModelTerm {
  const termType = mapTermType(e);
  const name = String(e.pm_name ?? '').trim();
  let operator: Operator | undefined;
  if (termType === 'Operator') {
    operator = mapOperator(e) ?? '×';
  } else if (termType === 'Bracket') {
    if (name.includes(')')) operator = ')';
    else if (name.includes('(')) operator = '(';
    else operator = mapOperator(e) ?? '(';
  }

  const constant =
    termType === 'Constant'
      ? decimalValue(e.pm_constant) ?? decimalValue(name)
      : undefined;

  return {
    pm_modeltermid: normalizeGuid(e.pm_modeltermid),
    pm_model: lookupId(e, 'pm_model'),
    pm_sequence: Number(e.pm_sequence) || 0,
    pm_termtype: termType,
    pm_kpi: termType === 'KPI' ? lookupId(e, 'pm_kpi') || undefined : undefined,
    pm_operator: operator,
    pm_constant: constant,
  };
}

function mapFactorDirection(e: Record<string, unknown>): FactorDirection {
  const label = String(e.pm_directionname ?? e.pm_direction ?? '').toLowerCase();
  if (label.includes('decr')) return 'Decreases';
  const n = Number(e.pm_direction);
  if (n === 2) return 'Decreases';
  return 'Increases';
}

function mapRelationFactor(e: Record<string, unknown>): RelationFactor {
  return {
    pm_relationfactorid: normalizeGuid(e.pm_relationfactorid),
    pm_model: lookupId(e, 'pm_model'),
    pm_factorkpi: lookupId(e, 'pm_factorkpi'),
    pm_direction: mapFactorDirection(e),
    pm_inputpct: Number(e.pm_inputpct) || 0,
    pm_resultpct: Number(e.pm_resultpct) || 0,
  };
}

export async function fetchModelTermsFromDataverse(modelId?: string): Promise<ModelTerm[]> {
  try {
    const options: {
      maxPageSize: number;
      filter?: string;
      orderBy?: string[];
      select?: string[];
    } = {
      maxPageSize: 5000,
      orderBy: ['pm_sequence asc'],
      select: [
        'pm_modeltermid',
        'pm_name',
        'pm_sequence',
        'pm_termtype',
        'pm_operator',
        'pm_constant',
        '_pm_kpi_value',
        '_pm_model_value',
      ],
    };
    if (modelId) options.filter = `_pm_model_value eq ${normalizeGuid(modelId)}`;
    const res = await Pm_modeltermsService.getAll(options);
    let list = unwrapList<Record<string, unknown>>(res)
      .map(mapModelTerm)
      .filter((t) => t.pm_modeltermid);
    if (list.length === 0) {
      const fallback = await Pm_modeltermsService.getAll({
        maxPageSize: 5000,
        filter: options.filter,
        orderBy: ['pm_sequence asc'],
      });
      list = unwrapList<Record<string, unknown>>(fallback)
        .map(mapModelTerm)
        .filter((t) => t.pm_modeltermid);
    }
    if (list.length > 0) return list.sort((a, b) => a.pm_sequence - b.pm_sequence);
  } catch (err) {
    console.warn('[DataverseService] Fetch model terms notice:', err);
    try {
      const fallback = await Pm_modeltermsService.getAll({ maxPageSize: 5000 });
      const list = unwrapList<Record<string, unknown>>(fallback)
        .map(mapModelTerm)
        .filter((t) => t.pm_modeltermid && (!modelId || t.pm_model === normalizeGuid(modelId)));
      if (list.length > 0) return list.sort((a, b) => a.pm_sequence - b.pm_sequence);
    } catch (fallbackErr) {
      console.warn('[DataverseService] Fallback fetch model terms notice:', fallbackErr);
    }
  }

  if (!isDataverseEnvironment()) {
    return modelId ? financialStore.getModelTerms(modelId) : [];
  }
  return [];
}

export async function fetchRelationFactorsFromDataverse(modelId?: string): Promise<RelationFactor[]> {
  try {
    const options: { maxPageSize: number; filter?: string } = { maxPageSize: 5000 };
    if (modelId) options.filter = `_pm_model_value eq ${normalizeGuid(modelId)}`;
    const res = await Pm_relationfactorsService.getAll(options);
    const list = unwrapList<Record<string, unknown>>(res)
      .map(mapRelationFactor)
      .filter((f) => f.pm_relationfactorid);
    if (list.length > 0) return list;
  } catch (err) {
    console.warn('[DataverseService] Fetch relation factors notice:', err);
  }

  if (!isDataverseEnvironment()) {
    return modelId ? financialStore.getRelationFactors(modelId) : [];
  }
  return [];
}

function mapOrgRegion(e: Record<string, unknown>): RegionChoice | undefined {
  const label = String(e.pm_regionname ?? e.pm_region ?? '').toLowerCase();
  if (label.includes('egypt') || label === '2') return 'Egypt';
  if (label.includes('ksa') || label.includes('saudi') || label === '1') return 'KSA';
  const n = Number(e.pm_region);
  if (n === 2) return 'Egypt';
  if (n === 1) return 'KSA';
  return undefined;
}

function mapOrgOutput(e: Record<string, unknown>): OrgOutput {
  return {
    pm_orgoutputid: normalizeGuid(e.pm_orgoutputid),
    pm_name: String(e.pm_name ?? '').trim() || 'Unnamed Org Output',
    pm_region: mapOrgRegion(e),
  };
}

function mapOrgOutcome(e: Record<string, unknown>): OrgOutcome {
  return {
    pm_orgoutcomeid: normalizeGuid(e.pm_orgoutcomeid),
    pm_name: String(e.pm_name ?? '').trim() || 'Unnamed Org Outcome',
  };
}

/** Load active rows from pm_orgoutputs for Definition result picker. */
export async function fetchOrgOutputsFromDataverse(): Promise<OrgOutput[]> {
  try {
    const res = await Pm_orgoutputsService.getAll({
      select: ['pm_orgoutputid', 'pm_name', 'pm_region', 'statecode'],
      filter: 'statecode eq 0',
      orderBy: ['pm_name asc'],
      maxPageSize: 5000,
    });
    let list = unwrapList<Record<string, unknown>>(res)
      .map(mapOrgOutput)
      .filter((o) => o.pm_orgoutputid);
    if (list.length === 0) {
      const fallback = await Pm_orgoutputsService.getAll({ maxPageSize: 5000 });
      list = unwrapList<Record<string, unknown>>(fallback)
        .map(mapOrgOutput)
        .filter((o) => o.pm_orgoutputid);
    }
    if (list.length > 0) {
      console.log('[DataverseService] Loaded', list.length, 'org outputs from pm_orgoutputs');
      return list;
    }
    if (res) return [];
  } catch (err) {
    console.warn('[DataverseService] Fetch org outputs notice:', err);
    try {
      const fallback = await Pm_orgoutputsService.getAll({ maxPageSize: 5000 });
      return unwrapList<Record<string, unknown>>(fallback)
        .map(mapOrgOutput)
        .filter((o) => o.pm_orgoutputid);
    } catch (fallbackErr) {
      console.warn('[DataverseService] Fallback fetch org outputs notice:', fallbackErr);
    }
  }

  const xrm = getXrmWebApi();
  if (xrm) {
    try {
      const res = await xrm.retrieveMultipleRecords(
        'pm_orgoutput',
        '?$select=pm_orgoutputid,pm_name,pm_region&$filter=statecode eq 0&$orderby=pm_name asc'
      );
      if (res?.entities) {
        return (res.entities as Record<string, unknown>[])
          .map(mapOrgOutput)
          .filter((o) => o.pm_orgoutputid);
      }
    } catch (err) {
      console.warn('[DataverseService] Xrm fetch org outputs notice:', err);
    }
  }

  return isDataverseEnvironment() ? [] : financialStore.getOrgOutputs();
}

/** Load active rows from pm_orgoutcomes for Definition result picker. */
export async function fetchOrgOutcomesFromDataverse(): Promise<OrgOutcome[]> {
  try {
    const res = await Pm_orgoutcomesService.getAll({
      select: ['pm_orgoutcomeid', 'pm_name', 'statecode'],
      filter: 'statecode eq 0',
      orderBy: ['pm_name asc'],
      maxPageSize: 5000,
    });
    let list = unwrapList<Record<string, unknown>>(res)
      .map(mapOrgOutcome)
      .filter((o) => o.pm_orgoutcomeid);
    if (list.length === 0) {
      const fallback = await Pm_orgoutcomesService.getAll({ maxPageSize: 5000 });
      list = unwrapList<Record<string, unknown>>(fallback)
        .map(mapOrgOutcome)
        .filter((o) => o.pm_orgoutcomeid);
    }
    if (list.length > 0) {
      console.log('[DataverseService] Loaded', list.length, 'org outcomes from pm_orgoutcomes');
      return list;
    }
    if (res) return [];
  } catch (err) {
    console.warn('[DataverseService] Fetch org outcomes notice:', err);
    try {
      const fallback = await Pm_orgoutcomesService.getAll({ maxPageSize: 5000 });
      return unwrapList<Record<string, unknown>>(fallback)
        .map(mapOrgOutcome)
        .filter((o) => o.pm_orgoutcomeid);
    } catch (fallbackErr) {
      console.warn('[DataverseService] Fallback fetch org outcomes notice:', fallbackErr);
    }
  }

  const xrm = getXrmWebApi();
  if (xrm) {
    try {
      const res = await xrm.retrieveMultipleRecords(
        'pm_orgoutcome',
        '?$select=pm_orgoutcomeid,pm_name&$filter=statecode eq 0&$orderby=pm_name asc'
      );
      if (res?.entities) {
        return (res.entities as Record<string, unknown>[])
          .map(mapOrgOutcome)
          .filter((o) => o.pm_orgoutcomeid);
      }
    } catch (err) {
      console.warn('[DataverseService] Xrm fetch org outcomes notice:', err);
    }
  }

  return isDataverseEnvironment() ? [] : financialStore.getOrgOutcomes();
}

function mapOutputContribution(e: Record<string, unknown>): OutputContribution {
  return {
    pm_outputcontributionid: normalizeGuid(e.pm_outputcontributionid),
    pm_sourcekpi: lookupId(e, 'pm_sourcekpi'),
    pm_sourcekpiname: lookupName(e, 'pm_sourcekpi') || undefined,
    pm_targetoutput: lookupId(e, 'pm_targetoutput'),
    pm_targetoutputname: lookupName(e, 'pm_targetoutput') || undefined,
    pm_businessunit: lookupId(e, 'pm_businessunit'),
    pm_businessunitname: lookupName(e, 'pm_businessunit') || undefined,
    pm_weightpct: Number(e.pm_weightpct) || 0,
    pm_effectivedate: String(e.pm_effectivedate || '').substring(0, 10),
  };
}

function mapOutcomeContribution(e: Record<string, unknown>): OutcomeContribution {
  return {
    pm_outcomecontributionid: normalizeGuid(e.pm_outcomecontributionid),
    pm_sourcekpi: lookupId(e, 'pm_sourcekpi'),
    pm_sourcekpiname: lookupName(e, 'pm_sourcekpi') || undefined,
    pm_targetoutcome: lookupId(e, 'pm_targetoutcome'),
    pm_targetoutcomename: lookupName(e, 'pm_targetoutcome') || undefined,
    pm_businessunit: lookupId(e, 'pm_businessunit'),
    pm_businessunitname: lookupName(e, 'pm_businessunit') || undefined,
    pm_weightpct: Number(e.pm_weightpct) || 0,
    pm_effectivedate: String(e.pm_effectivedate || '').substring(0, 10),
  };
}

function mapOrgOutputAchievement(e: Record<string, unknown>): OrgOutputAchievement {
  return {
    pm_orgoutputachievmentid: normalizeGuid(e.pm_orgoutputachievmentid),
    pm_orgoutput: lookupId(e, 'pm_orgoutput'),
    pm_businessunit: lookupId(e, 'pm_businessunit'),
    pm_month: mapAchievementMonth(e),
    pm_year: Number(e.pm_year) || 0,
    pm_target: decimalValue(e.pm_target),
    pm_actual: decimalValue(e.pm_actual),
    pm_baseline: decimalValue(e.pm_baseline),
    pm_historical: decimalValue(e.pm_historical),
  };
}

function mapOrgOutcomeAchievement(e: Record<string, unknown>): OrgOutcomeAchievement {
  return {
    pm_orgoutcomeachievmentid: normalizeGuid(e.pm_orgoutcomeachievmentid),
    pm_orgoutcome: lookupId(e, 'pm_orgoutcome'),
    pm_businessunit: lookupId(e, 'pm_businessunit'),
    pm_month: mapAchievementMonth(e),
    pm_year: Number(e.pm_year) || 0,
    pm_target: decimalValue(e.pm_target),
    pm_actual: decimalValue(e.pm_actual),
    pm_baseline: decimalValue(e.pm_baseline),
    pm_historical: decimalValue(e.pm_historical),
  };
}

export async function fetchOutputContributionsFromDataverse(): Promise<OutputContribution[]> {
  try {
    const res = await Pm_outputcontributionsService.getAll({
      select: [
        'pm_outputcontributionid',
        'pm_name',
        'pm_weightpct',
        'pm_effectivedate',
        'statecode',
        '_pm_sourcekpi_value',
        '_pm_targetoutput_value',
        '_pm_businessunit_value',
      ],
      filter: 'statecode eq 0',
      maxPageSize: 5000,
    });
    let list = unwrapList<Record<string, unknown>>(res)
      .map(mapOutputContribution)
      .filter((r) => r.pm_outputcontributionid);
    if (list.length === 0) {
      const fallback = await Pm_outputcontributionsService.getAll({ maxPageSize: 5000 });
      list = unwrapList<Record<string, unknown>>(fallback)
        .map(mapOutputContribution)
        .filter((r) => r.pm_outputcontributionid);
    }
    if (list.length > 0) {
      console.log('[DataverseService] Loaded', list.length, 'output contributions');
      return list;
    }
    if (res) return [];
  } catch (err) {
    console.warn('[DataverseService] Fetch output contributions notice:', err);
    try {
      const fallback = await Pm_outputcontributionsService.getAll({ maxPageSize: 5000 });
      return unwrapList<Record<string, unknown>>(fallback)
        .map(mapOutputContribution)
        .filter((r) => r.pm_outputcontributionid);
    } catch (fallbackErr) {
      console.warn('[DataverseService] Fallback fetch output contributions notice:', fallbackErr);
    }
  }
  return isDataverseEnvironment() ? [] : financialStore.getOutputContributions();
}

export async function fetchOutcomeContributionsFromDataverse(): Promise<OutcomeContribution[]> {
  try {
    const res = await Pm_outcomecontributionsService.getAll({
      select: [
        'pm_outcomecontributionid',
        'pm_name',
        'pm_weightpct',
        'pm_effectivedate',
        'statecode',
        '_pm_sourcekpi_value',
        '_pm_targetoutcome_value',
        '_pm_businessunit_value',
      ],
      filter: 'statecode eq 0',
      maxPageSize: 5000,
    });
    let list = unwrapList<Record<string, unknown>>(res)
      .map(mapOutcomeContribution)
      .filter((r) => r.pm_outcomecontributionid);
    if (list.length === 0) {
      const fallback = await Pm_outcomecontributionsService.getAll({ maxPageSize: 5000 });
      list = unwrapList<Record<string, unknown>>(fallback)
        .map(mapOutcomeContribution)
        .filter((r) => r.pm_outcomecontributionid);
    }
    if (list.length > 0) {
      console.log('[DataverseService] Loaded', list.length, 'outcome contributions');
      return list;
    }
    if (res) return [];
  } catch (err) {
    console.warn('[DataverseService] Fetch outcome contributions notice:', err);
    try {
      const fallback = await Pm_outcomecontributionsService.getAll({ maxPageSize: 5000 });
      return unwrapList<Record<string, unknown>>(fallback)
        .map(mapOutcomeContribution)
        .filter((r) => r.pm_outcomecontributionid);
    } catch (fallbackErr) {
      console.warn('[DataverseService] Fallback fetch outcome contributions notice:', fallbackErr);
    }
  }
  return isDataverseEnvironment() ? [] : financialStore.getOutcomeContributions();
}

export async function fetchOrgOutputAchievementsFromDataverse(): Promise<OrgOutputAchievement[]> {
  try {
    const res = await Pm_orgoutputachievmentsService.getAll({
      select: [
        'pm_orgoutputachievmentid',
        'pm_actual',
        'pm_baseline',
        'pm_historical',
        'pm_target',
        'pm_month',
        'pm_year',
        'statecode',
        '_pm_orgoutput_value',
        '_pm_businessunit_value',
      ],
      filter: 'statecode eq 0',
      maxPageSize: 5000,
    });
    const list = unwrapList<Record<string, unknown>>(res)
      .map(mapOrgOutputAchievement)
      .filter((r) => r.pm_orgoutputachievmentid);
    if (list.length > 0) return list;
  } catch (err) {
    console.warn('[DataverseService] Fetch org output achievements notice:', err);
  }
  return [];
}

export async function fetchOrgOutcomeAchievementsFromDataverse(): Promise<OrgOutcomeAchievement[]> {
  try {
    const res = await Pm_orgoutcomeachievmentsService.getAll({
      select: [
        'pm_orgoutcomeachievmentid',
        'pm_actual',
        'pm_baseline',
        'pm_historical',
        'pm_target',
        'pm_month',
        'pm_year',
        'statecode',
        '_pm_orgoutcome_value',
        '_pm_businessunit_value',
      ],
      filter: 'statecode eq 0',
      maxPageSize: 5000,
    });
    const list = unwrapList<Record<string, unknown>>(res)
      .map(mapOrgOutcomeAchievement)
      .filter((r) => r.pm_orgoutcomeachievmentid);
    if (list.length > 0) return list;
  } catch (err) {
    console.warn('[DataverseService] Fetch org outcome achievements notice:', err);
  }
  return [];
}

function mapWorkingDays(e: Record<string, unknown>): WorkingDays {
  return {
    pm_workingdaysid: normalizeGuid(e.pm_workingdaysid),
    pm_businessunit: lookupId(e, 'pm_businessunit'),
    pm_month: mapAchievementMonth(e),
    pm_year: Number(e.pm_year) || 0,
    pm_workingdays: decimalValue(e.pm_workingdays) ?? 0,
  };
}

/** Load calendar working-day counts from pm_workingdays (BU + month + year). */
export async function fetchWorkingDaysFromDataverse(): Promise<WorkingDays[]> {
  try {
    const res = await Pm_workingdaysesService.getAll({
      select: [
        'pm_workingdaysid',
        'pm_name',
        'pm_month',
        'pm_year',
        'pm_workingdays',
        'statecode',
        '_pm_businessunit_value',
      ],
      filter: 'statecode eq 0',
      maxPageSize: 5000,
    });
    let list = unwrapList<Record<string, unknown>>(res)
      .map(mapWorkingDays)
      .filter((r) => r.pm_workingdaysid);
    if (list.length === 0) {
      const fallback = await Pm_workingdaysesService.getAll({ maxPageSize: 5000 });
      list = unwrapList<Record<string, unknown>>(fallback)
        .map(mapWorkingDays)
        .filter((r) => r.pm_workingdaysid);
    }
    if (list.length > 0) {
      console.log('[DataverseService] Loaded', list.length, 'working-day rows from pm_workingdays');
      return list;
    }
    if (res) return [];
  } catch (err) {
    console.warn('[DataverseService] Fetch working days notice:', err);
    try {
      const fallback = await Pm_workingdaysesService.getAll({ maxPageSize: 5000 });
      return unwrapList<Record<string, unknown>>(fallback)
        .map(mapWorkingDays)
        .filter((r) => r.pm_workingdaysid);
    } catch (fallbackErr) {
      console.warn('[DataverseService] Fallback fetch working days notice:', fallbackErr);
    }
  }

  const xrm = getXrmWebApi();
  if (xrm) {
    try {
      const res = await xrm.retrieveMultipleRecords(
        'pm_workingdays',
        '?$select=pm_workingdaysid,pm_name,pm_month,pm_year,pm_workingdays,_pm_businessunit_value&$filter=statecode eq 0'
      );
      if (res?.entities) {
        return (res.entities as Record<string, unknown>[])
          .map(mapWorkingDays)
          .filter((r) => r.pm_workingdaysid);
      }
    } catch (err) {
      console.warn('[DataverseService] Xrm fetch working days notice:', err);
    }
  }

  return [];
}

// ───────────────────────────────────────────────────────────────────
//  LIVE DATAVERSE WRITE OPERATIONS (pm_kpiceilings)
// ───────────────────────────────────────────────────────────────────

function ceilingStatusValue(status: 'Active' | 'Superseded' | undefined, statuscode?: number): 1 | 2 {
  return statuscode === 2 || status === 'Superseded' ? 2 : 1;
}

function ceilingStatusPayload(status: 'Active' | 'Superseded' | undefined, statuscode?: number): {
  pm_kpiceilingstatus: 1 | 2;
} {
  return { pm_kpiceilingstatus: ceilingStatusValue(status, statuscode) };
}

export { reconcileCeilingStatuses };

export async function persistCeilingStatusReconciliation(
  before: KpiCeiling[],
  after: KpiCeiling[]
): Promise<void> {
  const beforeById = new Map(before.map((c) => [normalizeGuid(c.pm_kpiceilingid), c]));
  for (const ceiling of after) {
    const id = normalizeGuid(ceiling.pm_kpiceilingid);
    if (!id || id.startsWith('c_')) continue;
    const prev = beforeById.get(id);
    const statusChanged = !prev || prev.statuscode !== ceiling.statuscode;
    const constraintChanged = !prev || prev.pm_isconstraint !== ceiling.pm_isconstraint;
    if (!statusChanged && !constraintChanged) continue;
    await patchCeilingReconciliation(id, {
      statusValue: statusChanged ? (ceiling.statuscode === 2 ? 2 : 1) : undefined,
      constraintOff: constraintChanged && ceiling.pm_isconstraint === 'Off',
    });
  }
}

async function loadCeilingsForSupersede(): Promise<KpiCeiling[]> {
  return fetchCeilingsFromDataverse();
}

async function patchCeilingReconciliation(
  id: string,
  change: { statusValue?: 1 | 2; constraintOff?: boolean }
): Promise<void> {
  const payload: Record<string, unknown> = {};
  if (change.statusValue !== undefined) payload.pm_kpiceilingstatus = change.statusValue;
  if (change.constraintOff) payload.pm_isconstraint = 2;
  if (Object.keys(payload).length === 0) return;

  try {
    await Pm_kpiceilingsService.update(
      id,
      payload as unknown as Partial<Omit<Pm_kpiceilingsBase, 'pm_kpiceilingid'>>
    );
    console.log('[DataverseService] Saved ceiling reconciliation:', id, payload);
  } catch (err) {
    console.warn('[DataverseService] Generated service ceiling reconciliation notice:', err);
  }

  const xrm = getXrmWebApi();
  if (xrm) {
    try {
      await xrm.updateRecord('pm_kpiceiling', id, payload);
      console.log('[DataverseService] Saved ceiling reconciliation via Xrm:', id, payload);
    } catch (xrmErr) {
      console.error('[DataverseService] Xrm ceiling reconciliation error:', xrmErr);
    }
  }
}

async function patchCeilingStatus(id: string, statusValue: 1 | 2): Promise<void> {
  await patchCeilingReconciliation(id, { statusValue });
}

function buildCeilingCreatePayload(ceiling: Omit<KpiCeiling, 'pm_kpiceilingid'>, pmName: string): Record<string, unknown> {
  const kpiGuid = normalizeGuid(ceiling.pm_kpi);
  const buGuid = normalizeGuid(ceiling.pm_businessunit);

  if (!kpiGuid || kpiGuid.length < 32) {
    throw new Error('Cannot save ceiling: KPI id is not a Dataverse GUID.');
  }
  if (!buGuid || buGuid.length < 32) {
    throw new Error('Cannot save ceiling: Business Unit id is not a Dataverse GUID. Reload the page and pick a live BU.');
  }

  const status = ceilingStatusPayload(ceiling.status, ceiling.statuscode);

  const record: Record<string, unknown> = {
    pm_name: pmName,
    pm_kpiceilingstatus: status.pm_kpiceilingstatus,
    'pm_kpi@odata.bind': odataBind('strategy_kpises', kpiGuid),
    'pm_businessunit@odata.bind': odataBind('businessunits', buGuid),
    pm_effectivedate: ceiling.pm_effectivedate,
    pm_isconstraint: ceiling.pm_isconstraint === 'Enforced' ? 1 : 2,
  };

  if (ceiling.pm_min != null && ceiling.pm_min !== undefined) {
    record.pm_min = Number(ceiling.pm_min);
  }
  if (ceiling.pm_max != null && ceiling.pm_max !== undefined) {
    record.pm_max = Number(ceiling.pm_max);
  }

  return record;
}

async function findCeilingIdByName(pmName: string): Promise<string> {
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt > 0) await delay(500);
    try {
      const res = await Pm_kpiceilingsService.getAll({
        filter: `pm_name eq '${escapeODataString(pmName)}'`,
        orderBy: ['createdon desc'],
        top: 1,
      });
      const row = unwrapList<Pm_kpiceilings>(res)[0];
      const id = normalizeGuid(row?.pm_kpiceilingid);
      if (id) return id;
    } catch (err) {
      console.warn('[DataverseService] Retry-find ceiling notice:', err);
    }
  }
  return '';
}

export async function saveCeilingToDataverse(
  ceiling: Omit<KpiCeiling, 'pm_kpiceilingid'>
): Promise<string> {
  // New constraints are always saved as Active (statuscode = 1).
  const activeCeiling: Omit<KpiCeiling, 'pm_kpiceilingid'> = {
    ...ceiling,
    status: 'Active',
    statuscode: 1,
  };

  const pmName =
    activeCeiling.pm_kpiname || activeCeiling.pm_businessunitname
      ? `Ceiling · ${activeCeiling.pm_kpiname ?? 'KPI'} · ${activeCeiling.pm_businessunitname ?? 'BU'} · ${Date.now()}`
      : `KPI Ceiling ${normalizeGuid(activeCeiling.pm_kpi).slice(0, 8)} / ${normalizeGuid(activeCeiling.pm_businessunit).slice(0, 8)} @ ${Date.now()}`;

  const existingCeilings = await loadCeilingsForSupersede();

  const record = buildCeilingCreatePayload(activeCeiling, pmName);

  const tryCreate = async (payload: Record<string, unknown>) =>
    Pm_kpiceilingsService.create(
      payload as unknown as Omit<Pm_kpiceilingsBase, 'pm_kpiceilingid'>
    );

  try {
    let res;
    try {
      res = await tryCreate(record);
    } catch (createWithStatusErr) {
      console.warn('[DataverseService] Create with pm_kpiceilingstatus notice:', createWithStatusErr);
      const { pm_kpiceilingstatus: _ignored, ...withoutStatus } = record;
      res = await tryCreate(withoutStatus);
    }
    const created = unwrapRecord<Pm_kpiceilings>(res);
    let realId = normalizeGuid(created?.pm_kpiceilingid);
    if (!realId) realId = await findCeilingIdByName(pmName);
    if (!realId) {
      console.log('[DataverseService] Ceiling create accepted without id; using retry-find fallback name:', pmName);
      realId = await findCeilingIdByName(pmName);
    }

    if (realId) {
      const withNew = reconcileCeilingStatuses([
        ...existingCeilings.filter((c) => normalizeGuid(c.pm_kpiceilingid) !== realId),
        { ...activeCeiling, pm_kpiceilingid: realId },
      ]);
      await persistCeilingStatusReconciliation(existingCeilings, withNew);
    }

    if (realId) {
      console.log('[DataverseService] Created ceiling via Generated Service:', realId);
      return realId;
    }
    return '';
  } catch (err) {
    console.warn('[DataverseService] Generated service create ceiling notice:', err);

    const xrm = getXrmWebApi();
    if (xrm) {
      try {
        const res = await xrm.createRecord('pm_kpiceiling', record);
        const xrmId = res?.id ? normalizeGuid(res.id) : '';
        if (xrmId) {
          const withNew = reconcileCeilingStatuses([
            ...existingCeilings.filter((c) => normalizeGuid(c.pm_kpiceilingid) !== xrmId),
            { ...activeCeiling, pm_kpiceilingid: xrmId },
          ]);
          await persistCeilingStatusReconciliation(existingCeilings, withNew);
        }
        if (xrmId) return xrmId;
      } catch (xrmErr) {
        console.error('[DataverseService] Xrm create ceiling error:', xrmErr);
      }
    }

    throw err instanceof Error ? err : new Error('Failed to save KPI ceiling to Dataverse.');
  }
}

export async function updateCeilingInDataverse(
  ceilingId: string,
  updates: Partial<KpiCeiling>
): Promise<void> {
  const normCeilingId = normalizeGuid(ceilingId);
  if (!normCeilingId || normCeilingId.startsWith('c_')) {
    throw new Error('Cannot update ceiling: record has not been saved to Dataverse yet.');
  }

  const recordBase: Record<string, unknown> = {};
  if (updates.pm_kpi) {
    recordBase['pm_kpi@odata.bind'] = odataBind('strategy_kpises', updates.pm_kpi);
  }
  if (updates.pm_businessunit) {
    recordBase['pm_businessunit@odata.bind'] = odataBind('businessunits', updates.pm_businessunit);
  }
  if (updates.pm_min !== undefined) recordBase.pm_min = updates.pm_min != null ? Number(updates.pm_min) : null;
  if (updates.pm_max !== undefined) recordBase.pm_max = updates.pm_max != null ? Number(updates.pm_max) : null;
  if (updates.pm_effectivedate) recordBase.pm_effectivedate = updates.pm_effectivedate;
  if (updates.pm_isconstraint) recordBase.pm_isconstraint = updates.pm_isconstraint === 'Enforced' ? 1 : 2;

  const statusValue =
    updates.statuscode !== undefined || updates.status !== undefined
      ? ceilingStatusValue(updates.status, updates.statuscode)
      : undefined;

  if (Object.keys(recordBase).length > 0) {
    try {
      await Pm_kpiceilingsService.update(
        normCeilingId,
        recordBase as unknown as Partial<Omit<Pm_kpiceilingsBase, 'pm_kpiceilingid'>>
      );
      console.log('[DataverseService] Updated ceiling via Generated Service:', normCeilingId);
    } catch (err) {
      console.warn('[DataverseService] Generated service update ceiling notice:', err);
      const xrm = getXrmWebApi();
      if (xrm) {
        try {
          await xrm.updateRecord('pm_kpiceiling', normCeilingId, recordBase);
          console.log('[DataverseService] Updated ceiling via Xrm:', normCeilingId);
        } catch (xrmErr) {
          console.error('[DataverseService] Xrm update ceiling error:', xrmErr);
          if (statusValue === undefined) throw xrmErr;
        }
      } else if (statusValue === undefined) {
        throw err instanceof Error ? err : new Error('Failed to update KPI ceiling in Dataverse.');
      }
    }
  }

  if (statusValue !== undefined) {
    await patchCeilingStatus(normCeilingId, statusValue);
    return;
  }

  if (Object.keys(recordBase).length === 0) {
    throw new Error('Failed to update KPI ceiling in Dataverse.');
  }
}

export async function deleteCeilingFromDataverse(ceilingId: string): Promise<void> {
  const normCeilingId = normalizeGuid(ceilingId);
  if (!normCeilingId || normCeilingId.startsWith('c_')) return;

  try {
    await Pm_kpiceilingsService.delete(normCeilingId);
    console.log('[DataverseService] Deleted ceiling via Generated Service:', normCeilingId);
    return;
  } catch (err) {
    console.warn('[DataverseService] Generated service delete ceiling notice:', err);
  }

  const xrm = getXrmWebApi();
  if (xrm) {
    try {
      await xrm.deleteRecord('pm_kpiceiling', normCeilingId);
      console.log('[DataverseService] Deleted ceiling via Xrm:', normCeilingId);
      return;
    } catch (err) {
      console.error('[DataverseService] Xrm delete ceiling error:', err);
      throw err;
    }
  }

  throw new Error('Failed to delete KPI ceiling from Dataverse.');
}

// ───────────────────────────────────────────────────────────────────
//  LIVE DATAVERSE WRITE OPERATIONS (pm_models + pm_modelterms)
// ───────────────────────────────────────────────────────────────────

function isLikelyGuid(id: unknown): boolean {
  const g = normalizeGuid(id);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(g);
}

/** Generated pm_resultkind: 1 Org Outcome, 2 Org Output, 3 KPI */
function resultKindChoice(kind: EntityKind): 1 | 2 | 3 {
  if (kind === 'OrgOutcome') return 1;
  if (kind === 'OrgOutput') return 2;
  return 3;
}

function workingDaysChoice(v: YesNo): 1 | 2 {
  return v === 'Yes' ? 1 : 2;
}

function termTypeChoice(t: TermType): 1 | 2 | 3 | 4 {
  if (t === 'Operator') return 2;
  if (t === 'Bracket') return 3;
  if (t === 'Constant') return 4;
  return 1;
}

function operatorChoice(op: Operator | string | undefined): 1 | 2 | 3 | 4 | undefined {
  if (!op) return undefined;
  const s = String(op).trim();
  if (s === '×' || s === '*' || s.toLowerCase() === 'x') return 1;
  if (s === '÷' || s === '/') return 2;
  if (s === '+') return 3;
  if (s === '−' || s === '-' || s === '–') return 4;
  return undefined;
}

function termDisplayName(term: ModelTerm, index: number): string {
  if (term.pm_termtype === 'KPI') return `KPI · ${term.pm_kpi?.slice(0, 8) || index + 1}`;
  if (term.pm_termtype === 'Operator') return String(term.pm_operator ?? `Op ${index + 1}`);
  if (term.pm_termtype === 'Bracket') return term.pm_operator === ')' ? ')' : '(';
  if (term.pm_termtype === 'Constant') {
    const n = Number(term.pm_constant);
    return Number.isFinite(n) ? String(n) : `Const ${index + 1}`;
  }
  return `Term ${index + 1}`;
}

/** Model display name: "{KPI or result} - Equation|Relation". */
export function generatedModelName(resultName?: string, modelType?: string): string {
  const raw = String(resultName ?? '').trim() || 'New model';
  const result = raw.replace(/\s*-\s*(Equation|Relation)\s*$/i, '').trim() || 'New model';
  const kind =
    modelType === 'Equation' || modelType === 'Relation'
      ? modelType
      : '';
  return (kind ? `${result} - ${kind}` : result).slice(0, 200);
}

export function resolvedModelName(model: FinancialModel): string {
  const custom = String(model.pm_name ?? '').trim();
  if (custom) return custom.slice(0, 200);
  return generatedModelName(model.pm_resultrefname || model.pm_calculatedkpiname, model.pm_modeltype);
}

function buildModelPayload(
  model: FinancialModel,
  options?: { uniqueName?: boolean; clientId?: string }
): Record<string, unknown> {
  const name = resolvedModelName(model);

  const payload: Record<string, unknown> = {
    pm_name: name,
    pm_version: model.pm_version || '0.1',
    pm_resultkind: resultKindChoice(model.pm_resultkind),
    pm_useworkingdays: workingDaysChoice(model.pm_useworkingdays),
    // Lifecycle on pm_model.pm_modeltype — must be option-set int (1 Draft, 2 Under Review, …)
    pm_modeltype: lifecycleStatusChoice(model.statuscode),
    statecode: 0,
  };

  // Client-assigned primary key — Code Apps create often returns an empty body.
  if (options?.clientId && isLikelyGuid(options.clientId)) {
    payload.pm_modelid = normalizeGuid(options.clientId);
  }

  const scopeId = normalizeGuid(model.pm_scope);
  if (isLikelyGuid(scopeId)) {
    payload['pm_scope@odata.bind'] = odataBind('hr_functions', scopeId);
  }

  const calculatedKpi = normalizeGuid(
    model.pm_resultkind === 'KPI' ? model.pm_calculatedkpi || model.pm_resultref : model.pm_calculatedkpi
  );
  if (model.pm_resultkind === 'KPI' && isLikelyGuid(calculatedKpi)) {
    payload['pm_CalculatedKPI@odata.bind'] = odataBind('strategy_kpises', calculatedKpi);
  }

  const linkedOutput = normalizeGuid(
    model.pm_resultkind === 'OrgOutput' ? model.pm_resultref : model.pm_linkedoutput
  );
  if (isLikelyGuid(linkedOutput)) {
    payload['pm_linkedoutput@odata.bind'] = odataBind('pm_orgoutputs', linkedOutput);
  }

  const linkedOutcome = normalizeGuid(
    model.pm_resultkind === 'OrgOutcome' ? model.pm_resultref : model.pm_linkedoutcome
  );
  if (isLikelyGuid(linkedOutcome)) {
    payload['pm_LinkedOutcome@odata.bind'] = odataBind('pm_orgoutcomes', linkedOutcome);
  }

  return payload;
}

function assertOperationSuccess(res: unknown, action: string): void {
  if (!res || typeof res !== 'object') return;
  const root = res as Record<string, unknown>;
  if (root.success === false) {
    const err = root.error;
    const msg =
      err instanceof Error
        ? err.message
        : typeof err === 'object' && err && 'message' in err
          ? String((err as { message: unknown }).message)
          : `${action} failed (success=false).`;
    throw new Error(msg);
  }
}

function newClientGuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().toLowerCase();
  }
  // Fallback UUID v4-ish
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Create or update a pm_model row. Returns the Dataverse model GUID.
 */
export async function saveModelToDataverse(model: FinancialModel): Promise<string> {
  const existingId = isLikelyGuid(model.pm_modelid) ? normalizeGuid(model.pm_modelid) : '';
  const clientId = existingId || newClientGuid();
  const payload = buildModelPayload(model, {
    uniqueName: !existingId,
    clientId: existingId ? undefined : clientId,
  });
  const savedName = String(payload.pm_name);
  const lookupToken = savedName.split(' ')[0]; // FM-xxxx

  const stripOptional = (src: Record<string, unknown>, keys: string[]) => {
    const next = { ...src };
    for (const k of keys) delete next[k];
    return next;
  };

  const tryCreate = async (body: Record<string, unknown>) =>
    Pm_modelsService.create(body as unknown as Omit<Pm_modelsBase, 'pm_modelid'>);

  const tryUpdate = async (id: string, body: Record<string, unknown>) =>
    Pm_modelsService.update(id, body as unknown as Partial<Omit<Pm_modelsBase, 'pm_modelid'>>);

  const createWithFallbacks = async (body: Record<string, unknown>) => {
    const attempts: Array<Record<string, unknown>> = [
      body,
      stripOptional(body, [
        'pm_linkedoutput@odata.bind',
        'pm_LinkedOutcome@odata.bind',
        'pm_CalculatedKPI@odata.bind',
      ]),
      stripOptional(body, [
        'pm_linkedoutput@odata.bind',
        'pm_LinkedOutcome@odata.bind',
        'pm_CalculatedKPI@odata.bind',
        'pm_scope@odata.bind',
      ]),
      stripOptional(body, [
        'pm_linkedoutput@odata.bind',
        'pm_LinkedOutcome@odata.bind',
        'pm_CalculatedKPI@odata.bind',
        'pm_scope@odata.bind',
        'pm_modelid',
      ]),
    ];

    let lastErr: unknown;
    for (const attempt of attempts) {
      try {
        const res = await tryCreate(attempt);
        assertOperationSuccess(res, 'pm_models create');
        return { res, usedClientId: Object.prototype.hasOwnProperty.call(attempt, 'pm_modelid') };
      } catch (err) {
        lastErr = err;
        console.warn('[DataverseService] Model create attempt notice:', err);
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error('Failed to create pm_model.');
  };

  const patchModelStatus = async (id: string) => {
    for (const pm_modeltype of lifecycleWriteAttempts(model.statuscode)) {
      try {
        await tryUpdate(id, { pm_modeltype } as Record<string, unknown>);
        return;
      } catch (err) {
        console.warn('[DataverseService] Optional pm_modeltype lifecycle patch notice:', err);
      }
    }
  };

  try {
    if (existingId) {
      const updateBody = stripOptional(payload, ['pm_modelid']);
      try {
        const res = await tryUpdate(existingId, updateBody);
        assertOperationSuccess(res, 'pm_models update');
      } catch (updErr) {
        console.warn('[DataverseService] Model update full payload notice:', updErr);
        const res = await tryUpdate(
          existingId,
          stripOptional(updateBody, [
            'pm_linkedoutput@odata.bind',
            'pm_LinkedOutcome@odata.bind',
            'pm_CalculatedKPI@odata.bind',
          ])
        );
        assertOperationSuccess(res, 'pm_models update');
      }
      await patchModelStatus(existingId);
      return existingId;
    }

    // Prefer Xrm when available — returns { id } reliably.
    const xrm = getXrmWebApi();
    if (xrm) {
      try {
        const xrmPayload = { ...payload };
        const xrmRes = await xrm.createRecord('pm_model', xrmPayload);
        const xrmId = xrmRes?.id ? normalizeGuid(xrmRes.id) : '';
        if (xrmId) {
          console.log('[DataverseService] Created model via Xrm:', xrmId, 'name:', savedName);
          await patchModelStatus(xrmId);
          return xrmId;
        }
      } catch (xrmFirstErr) {
        console.warn('[DataverseService] Xrm create first notice:', xrmFirstErr);
        try {
          const { pm_modelid: _drop, ...withoutPk } = payload;
          const xrmRes = await xrm.createRecord('pm_model', withoutPk);
          const xrmId = xrmRes?.id ? normalizeGuid(xrmRes.id) : '';
          if (xrmId) {
            await patchModelStatus(xrmId);
            return xrmId;
          }
        } catch (xrmSecondErr) {
          console.warn('[DataverseService] Xrm create without pk notice:', xrmSecondErr);
        }
      }
    }

    const { res, usedClientId } = await createWithFallbacks(payload);
    console.log(
      '[DataverseService] Model create raw response:',
      res,
      'keys:',
      res && typeof res === 'object' ? Object.keys(res as object) : [],
      'dataKeys:',
      (() => {
        const d = (res as { data?: unknown })?.data;
        return d && typeof d === 'object' ? Object.keys(d as object) : d;
      })()
    );

    let realId = extractCreatedId(res, 'pm_modelid');
    if (!realId) realId = extractCreatedId(unwrapRecord(res), 'pm_modelid');

    // If we sent a client GUID and create succeeded, trust it.
    if (!realId && usedClientId) {
      realId = clientId;
      console.log('[DataverseService] Using client-assigned pm_modelid:', realId);
    }

    if (!realId) realId = await findModelIdByName(savedName);
    if (!realId && lookupToken.startsWith('FM-')) {
      realId = await findModelIdByToken(lookupToken);
    }

    if (!realId) {
      throw new Error(
        `Model create returned no pm_modelid (name: ${savedName}). Response success may be empty — check console for raw response.`
      );
    }
    await patchModelStatus(realId);
    console.log('[DataverseService] Created model:', realId, 'name:', savedName);
    return realId;
  } catch (err) {
    console.warn('[DataverseService] Generated service save model notice:', err);

    const xrm = getXrmWebApi();
    if (xrm) {
      try {
        if (existingId) {
          await xrm.updateRecord('pm_model', existingId, stripOptional(payload, ['pm_modelid']));
          await patchModelStatus(existingId);
          return existingId;
        }
        const found = await findModelIdByName(savedName);
        if (found) {
          await xrm.updateRecord('pm_model', found, stripOptional(payload, ['pm_modelid']));
          await patchModelStatus(found);
          return found;
        }
        if (lookupToken.startsWith('FM-')) {
          const byToken = await findModelIdByToken(lookupToken);
          if (byToken) {
            await patchModelStatus(byToken);
            return byToken;
          }
        }
        const { pm_modelid: _drop, ...withoutPk } = payload;
        const res = await xrm.createRecord('pm_model', withoutPk);
        const xrmId = res?.id ? normalizeGuid(res.id) : '';
        if (xrmId) {
          await patchModelStatus(xrmId);
          return xrmId;
        }
      } catch (xrmErr) {
        console.error('[DataverseService] Xrm save model error:', xrmErr);
      }
    }

    throw err instanceof Error ? err : new Error('Failed to save model to Dataverse.');
  }
}

async function findModelIdByName(pmName: string): Promise<string> {
  const escaped = escapeODataString(pmName);
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt > 0) await delay(400 * attempt);
    try {
      const res = await Pm_modelsService.getAll({
        filter: `pm_name eq '${escaped}'`,
        orderBy: ['createdon desc'],
        top: 1,
      });
      const row = unwrapList<Record<string, unknown>>(res)[0];
      const id = normalizeGuid(row?.pm_modelid);
      if (id) return id;
    } catch (err) {
      console.warn('[DataverseService] Retry-find model (eq) notice:', err);
    }

    try {
      const res = await Pm_modelsService.getAll({
        orderBy: ['createdon desc'],
        top: 25,
      });
      const match = unwrapList<Record<string, unknown>>(res).find(
        (r) => String(r.pm_name ?? '') === pmName
      );
      const id = normalizeGuid(match?.pm_modelid);
      if (id) return id;
    } catch (err) {
      console.warn('[DataverseService] Retry-find model (recent) notice:', err);
    }
  }
  return '';
}

async function findModelIdByToken(token: string): Promise<string> {
  const escaped = escapeODataString(token);
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt > 0) await delay(400 * attempt);
    try {
      const res = await Pm_modelsService.getAll({
        filter: `contains(pm_name,'${escaped}')`,
        orderBy: ['createdon desc'],
        top: 5,
      });
      const row = unwrapList<Record<string, unknown>>(res).find((r) =>
        String(r.pm_name ?? '').includes(token)
      );
      const id = normalizeGuid(row?.pm_modelid);
      if (id) return id;
    } catch (err) {
      console.warn('[DataverseService] Find model by token notice:', err);
    }
  }
  return '';
}

function buildTermPayload(modelId: string, term: ModelTerm, index: number): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    pm_name: termDisplayName(term, index),
    pm_sequence: term.pm_sequence || index + 1,
    pm_termtype: termTypeChoice(term.pm_termtype),
    statecode: 0,
    'pm_model@odata.bind': odataBind('pm_models', modelId),
  };

  if (term.pm_termtype === 'KPI' && isLikelyGuid(term.pm_kpi)) {
    payload['pm_kpi@odata.bind'] = odataBind('strategy_kpises', normalizeGuid(term.pm_kpi));
  }

  if (term.pm_termtype === 'Constant') {
    const n = Number(term.pm_constant);
    payload.pm_constant = Number.isFinite(n) ? n : 0;
    payload.pm_name = String(payload.pm_constant);
  }

  if (term.pm_termtype === 'Operator') {
    const op = operatorChoice(term.pm_operator);
    if (op != null) payload.pm_operator = op;
  }

  // Brackets are a term type; the option set only has × ÷ + −, so store ( / ) in the name.
  if (term.pm_termtype === 'Bracket') {
    payload.pm_name = term.pm_operator === ')' ? ')' : '(';
  }

  return payload;
}

/**
 * Replace all pm_modelterms for a model with the given equation terms.
 */
export async function saveModelTermsToDataverse(
  modelId: string,
  terms: ModelTerm[]
): Promise<ModelTerm[]> {
  const normModelId = normalizeGuid(modelId);
  if (!isLikelyGuid(normModelId)) {
    throw new Error('Cannot save model terms: model id is not a Dataverse GUID.');
  }

  // Delete existing terms for this model
  try {
    const existing = await fetchModelTermsFromDataverse(normModelId);
    for (const t of existing) {
      if (!isLikelyGuid(t.pm_modeltermid)) continue;
      try {
        await Pm_modeltermsService.delete(t.pm_modeltermid);
      } catch (delErr) {
        console.warn('[DataverseService] Delete model term notice:', delErr);
        const xrm = getXrmWebApi();
        if (xrm) {
          try {
            await xrm.deleteRecord('pm_modelterm', t.pm_modeltermid);
          } catch (xrmDelErr) {
            console.warn('[DataverseService] Xrm delete model term notice:', xrmDelErr);
          }
        }
      }
    }
  } catch (err) {
    console.warn('[DataverseService] Load existing terms before replace notice:', err);
  }

  const saved: ModelTerm[] = [];
  for (let i = 0; i < terms.length; i++) {
    const term = terms[i];
    const payload = buildTermPayload(normModelId, term, i);
    const attempts: Array<Record<string, unknown>> = [
      payload,
      stripOptionalTerm(payload, ['pm_kpi@odata.bind']),
      stripOptionalTerm(payload, ['pm_kpi@odata.bind', 'pm_operator']),
    ];

    let createdId = '';
    let lastErr: unknown;
    for (const attempt of attempts) {
      try {
        const res = await Pm_modeltermsService.create(
          attempt as unknown as Omit<Pm_modeltermsBase, 'pm_modeltermid'>
        );
        createdId =
          normalizeGuid(unwrapRecord<Record<string, unknown>>(res)?.pm_modeltermid) ||
          extractCreatedId(res, 'pm_modeltermid');
        if (!createdId) createdId = `mt_${normModelId}_${i}`;
        lastErr = undefined;
        break;
      } catch (err) {
        lastErr = err;
        console.warn('[DataverseService] Create model term attempt notice:', err);
      }
    }

    if (!createdId) {
      const xrm = getXrmWebApi();
      if (xrm) {
        try {
          const res = await xrm.createRecord('pm_modelterm', payload);
          createdId = res?.id ? normalizeGuid(res.id) : `mt_${normModelId}_${i}`;
          lastErr = undefined;
        } catch (xrmErr) {
          lastErr = xrmErr;
          console.error('[DataverseService] Xrm create model term error:', xrmErr);
        }
      }
    }

    if (!createdId) {
      throw lastErr instanceof Error ? lastErr : new Error('Failed to save model term to Dataverse.');
    }

    saved.push({
      ...term,
      pm_modeltermid: createdId,
      pm_model: normModelId,
      pm_sequence: term.pm_sequence || i + 1,
      pm_constant: term.pm_termtype === 'Constant' ? Number(term.pm_constant) || 0 : term.pm_constant,
    });
  }

  console.log('[DataverseService] Saved', saved.length, 'model terms for model', normModelId);
  return saved;
}

function stripOptionalTerm(src: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const next = { ...src };
  for (const k of keys) delete next[k];
  return next;
}

function factorDirectionChoice(direction: FactorDirection): 1 | 2 {
  return direction === 'Decreases' ? 2 : 1;
}

function factorDisplayName(factor: RelationFactor, index: number): string {
  const kpi = factor.pm_factorkpi ? factor.pm_factorkpi.slice(0, 8) : String(index + 1);
  return `Factor · ${kpi}`;
}

function buildRelationFactorPayload(
  modelId: string,
  factor: RelationFactor,
  index: number
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    pm_name: factorDisplayName(factor, index),
    pm_direction: factorDirectionChoice(factor.pm_direction),
    pm_inputpct: Number(factor.pm_inputpct) || 0,
    pm_resultpct: Number(factor.pm_resultpct) || 0,
    statecode: 0,
    'pm_model@odata.bind': odataBind('pm_models', modelId),
  };

  const kpiId = normalizeGuid(factor.pm_factorkpi);
  if (isLikelyGuid(kpiId)) {
    payload['pm_factorkpi@odata.bind'] = odataBind('strategy_kpises', kpiId);
  }

  return payload;
}

/**
 * Replace all pm_relationfactors for a model with the given factor rows.
 */
export async function saveRelationFactorsToDataverse(
  modelId: string,
  factors: RelationFactor[]
): Promise<RelationFactor[]> {
  const normModelId = normalizeGuid(modelId);
  if (!isLikelyGuid(normModelId)) {
    throw new Error('Cannot save relation factors: model id is not a Dataverse GUID.');
  }

  try {
    const existing = await fetchRelationFactorsFromDataverse(normModelId);
    for (const f of existing) {
      if (!isLikelyGuid(f.pm_relationfactorid)) continue;
      try {
        await Pm_relationfactorsService.delete(f.pm_relationfactorid);
      } catch (delErr) {
        console.warn('[DataverseService] Delete relation factor notice:', delErr);
        const xrm = getXrmWebApi();
        if (xrm) {
          try {
            await xrm.deleteRecord('pm_relationfactor', f.pm_relationfactorid);
          } catch (xrmDelErr) {
            console.warn('[DataverseService] Xrm delete relation factor notice:', xrmDelErr);
          }
        }
      }
    }
  } catch (err) {
    console.warn('[DataverseService] Load existing relation factors before replace notice:', err);
  }

  const saved: RelationFactor[] = [];
  for (let i = 0; i < factors.length; i++) {
    const factor = factors[i];
    const payload = buildRelationFactorPayload(normModelId, factor, i);
    try {
      const res = await Pm_relationfactorsService.create(
        payload as unknown as Omit<Pm_relationfactorsBase, 'pm_relationfactorid'>
      );
      const created = unwrapRecord<Record<string, unknown>>(res);
      const id =
        normalizeGuid(created?.pm_relationfactorid) ||
        extractCreatedId(res, 'pm_relationfactorid') ||
        `rf_${normModelId}_${i}`;
      saved.push({
        ...factor,
        pm_relationfactorid: id,
        pm_model: normModelId,
      });
    } catch (err) {
      console.warn('[DataverseService] Create relation factor notice:', err);
      const xrm = getXrmWebApi();
      if (xrm) {
        try {
          const res = await xrm.createRecord('pm_relationfactor', payload);
          const id = res?.id ? normalizeGuid(res.id) : `rf_${normModelId}_${i}`;
          saved.push({
            ...factor,
            pm_relationfactorid: id,
            pm_model: normModelId,
          });
          continue;
        } catch (xrmErr) {
          console.error('[DataverseService] Xrm create relation factor error:', xrmErr);
        }
      }
      throw err instanceof Error ? err : new Error('Failed to save relation factor to Dataverse.');
    }
  }

  console.log('[DataverseService] Saved', saved.length, 'relation factors for model', normModelId);
  return saved;
}

/**
 * Persist a model to pm_models, plus equation terms and/or relation factors.
 * `statusOverride` controls lifecycle (Draft vs Under Review).
 */
export async function saveEquationModelToDataverse(
  model: FinancialModel,
  terms: ModelTerm[],
  statusOverride?: ModelStatus,
  factors: RelationFactor[] = []
): Promise<{
  modelId: string;
  terms: ModelTerm[];
  factors: RelationFactor[];
  model: FinancialModel;
}> {
  // When result is Org Output, link the model to that output on pm_models.
  const linkedFromResult =
    model.pm_resultkind === 'OrgOutput' && isLikelyGuid(model.pm_resultref)
      ? normalizeGuid(model.pm_resultref)
      : model.pm_linkedoutput;
  const outcomeFromResult =
    model.pm_resultkind === 'OrgOutcome' && isLikelyGuid(model.pm_resultref)
      ? normalizeGuid(model.pm_resultref)
      : model.pm_linkedoutcome;
  const calculatedKpi =
    model.pm_resultkind === 'KPI' && isLikelyGuid(model.pm_resultref)
      ? normalizeGuid(model.pm_resultref)
      : model.pm_calculatedkpi;

  const withStatus: FinancialModel = {
    ...model,
    pm_name: resolvedModelName(model),
    pm_calculatedkpi: calculatedKpi || model.pm_calculatedkpi,
    pm_linkedoutput: linkedFromResult || model.pm_linkedoutput,
    pm_linkedoutcome: outcomeFromResult || model.pm_linkedoutcome,
    statuscode: statusOverride ?? model.statuscode,
    pm_modeltypevalue: lifecycleStatusChoice(statusOverride ?? model.statuscode),
  };

  if (!isDataverseEnvironment()) {
    financialStore.updateModel(withStatus.pm_modelid, withStatus);
    if (withStatus.pm_modeltype === 'Equation') {
      financialStore.updateModelTerms(
        withStatus.pm_modelid,
        terms.map(({ pm_modeltermid: _id, pm_model: _m, ...rest }) => rest)
      );
    }
    if (withStatus.pm_modeltype === 'Relation') {
      financialStore.updateRelationFactors(
        withStatus.pm_modelid,
        factors.map(({ pm_relationfactorid: _id, pm_model: _m, ...rest }) => rest)
      );
    }
    return {
      modelId: withStatus.pm_modelid,
      terms,
      factors,
      model: withStatus,
    };
  }

  const modelId = await saveModelToDataverse(withStatus);
  const savedTerms =
    withStatus.pm_modeltype === 'Equation'
      ? await saveModelTermsToDataverse(modelId, terms)
      : [];
  const savedFactors =
    withStatus.pm_modeltype === 'Relation'
      ? await saveRelationFactorsToDataverse(modelId, factors)
      : [];

  return {
    modelId,
    terms: savedTerms,
    factors: savedFactors,
    model: applyModelLifecycle({ ...withStatus, pm_modelid: modelId }, withStatus.statuscode),
  };
}

function proposalSourceChoice(source: Proposal['pm_source']): number {
  if (source === 'TopDownMonthly') return 2;
  if (source === 'Breakdown') return 3;
  if (source === 'BottomUp') return 4;
  if (source === 'FinancialModeler') return 5;
  return 1; // Forecast
}

/** pm_proposal.pm_entitykind — still a separate option set (not the new pm_resultkind). */
function proposalEntityKindChoice(kind: EntityKind): 1 | 2 | 3 {
  if (kind === 'OrgOutcome') return 3;
  if (kind === 'OrgOutput') return 2;
  return 1; // KPI
}

function conflictTypeChoice(type: ConflictType): 1 | 2 | 3 | 4 {
  if (type === 'ForecastVsMonthly') return 1;
  if (type === 'ChildrenVsParent') return 2;
  if (type === 'BottomUpBelowApproved') return 3;
  return 4; // Model Builder Vs Org KPI
}

/** pm_conflict.pm_existingsource / pm_proposedsource — not the same order as pm_proposal.pm_source. */
function conflictSourceChoice(source: TargetSource): 1 | 2 | 3 | 4 | 5 {
  if (source === 'TopDownMonthly') return 1;
  if (source === 'Breakdown') return 2;
  if (source === 'BottomUp') return 3;
  if (source === 'FinancialModeler') return 5;
  return 4; // Forecast
}

function proposalDisplayName(proposal: Omit<Proposal, 'pm_proposalid'>): string {
  const entity =
    proposal.pm_kpiname ||
    proposal.pm_orgoutputname ||
    proposal.pm_orgoutcomename ||
    proposal.pm_entitykind;
  const parts = [
    'Proposal',
    entity,
    `M${proposal.pm_month}`,
    String(proposal.pm_year),
    String(proposal.pm_proposedvalue),
  ].filter(Boolean);
  return parts.join(' · ').slice(0, 200);
}

function buildProposalPayload(proposal: Omit<Proposal, 'pm_proposalid'>): Record<string, unknown> {
  const kpiId = normalizeGuid(proposal.pm_kpi);
  const outputId = normalizeGuid(proposal.pm_orgoutput);
  const outcomeId = normalizeGuid(proposal.pm_orgoutcome);
  const buId = normalizeGuid(proposal.pm_businessunit);
  const modelId = normalizeGuid(proposal.pm_sourcemodel);

  const payload: Record<string, unknown> = {
    pm_name: proposalDisplayName(proposal),
    pm_entitykind: proposalEntityKindChoice(proposal.pm_entitykind),
    pm_month: proposal.pm_month,
    pm_year: proposal.pm_year,
    pm_proposedvalue: Number(proposal.pm_proposedvalue),
    pm_source: proposalSourceChoice(proposal.pm_source),
    pm_hasconflict: proposal.pm_hasconflict === 'Yes' ? 1 : 2,
    statuscode: 1,
    statecode: 0,
  };

  if (isLikelyGuid(buId)) {
    payload['pm_businessunit@odata.bind'] = odataBind('businessunits', buId);
  }
  if (proposal.pm_entitykind === 'KPI' && isLikelyGuid(kpiId)) {
    payload['pm_kpi@odata.bind'] = odataBind('strategy_kpises', kpiId);
  }
  if (proposal.pm_entitykind === 'OrgOutput' && isLikelyGuid(outputId)) {
    payload['pm_orgoutput@odata.bind'] = odataBind('pm_orgoutputs', outputId);
  }
  if (proposal.pm_entitykind === 'OrgOutcome' && isLikelyGuid(outcomeId)) {
    payload['pm_orgoutcome@odata.bind'] = odataBind('pm_orgoutcomes', outcomeId);
  }
  if (isLikelyGuid(modelId)) {
    payload['pm_sourcemodel@odata.bind'] = odataBind('pm_models', modelId);
  }
  if (proposal.pm_deptfunction) {
    payload.pm_deptfunction = proposal.pm_deptfunction.slice(0, 4000);
  }

  return payload;
}

function conflictDisplayName(conflict: Omit<Conflict, 'pm_conflictid'>): string {
  const entity =
    conflict.pm_kpiname ||
    conflict.pm_orgoutputname ||
    conflict.pm_orgoutcomename ||
    conflict.pm_entitykind;
  return `Conflict · ${entity} · M${conflict.pm_month} ${conflict.pm_year}`.slice(0, 200);
}

function buildConflictPayload(conflict: Omit<Conflict, 'pm_conflictid'>): Record<string, unknown> {
  const kpiId = normalizeGuid(conflict.pm_kpi);
  const outputId = normalizeGuid(conflict.pm_orgoutput);
  const outcomeId = normalizeGuid(conflict.pm_orgoutcome);
  const buId = normalizeGuid(conflict.pm_businessunit);
  const proposalId = normalizeGuid(conflict.pm_proposal);
  const priorId = normalizeGuid(conflict.pm_priorversion);

  const payload: Record<string, unknown> = {
    pm_name: conflictDisplayName(conflict),
    pm_entitykind: proposalEntityKindChoice(conflict.pm_entitykind),
    pm_month: conflict.pm_month,
    pm_year: conflict.pm_year,
    pm_existingvalue: Number(conflict.pm_existingvalue),
    pm_proposedvalue: Number(conflict.pm_proposedvalue),
    pm_existingsource: conflictSourceChoice(conflict.pm_existingsource),
    pm_proposedsource: conflictSourceChoice(conflict.pm_proposedsource),
    pm_conflicttype: conflictTypeChoice(conflict.pm_conflicttype),
    pm_raisedon: conflict.pm_raisedon || new Date().toISOString(),
    statuscode: 1,
    statecode: 0,
  };

  if (isLikelyGuid(buId)) {
    payload['pm_businessunit@odata.bind'] = odataBind('businessunits', buId);
  }
  if (conflict.pm_entitykind === 'KPI' && isLikelyGuid(kpiId)) {
    payload['pm_kpi@odata.bind'] = odataBind('strategy_kpises', kpiId);
  }
  if (conflict.pm_entitykind === 'OrgOutput' && isLikelyGuid(outputId)) {
    payload['pm_orgoutput@odata.bind'] = odataBind('pm_orgoutputs', outputId);
  }
  if (conflict.pm_entitykind === 'OrgOutcome' && isLikelyGuid(outcomeId)) {
    payload['pm_orgoutcome@odata.bind'] = odataBind('pm_orgoutcomes', outcomeId);
  }
  if (isLikelyGuid(proposalId)) {
    payload['pm_proposal@odata.bind'] = odataBind('pm_proposals', proposalId);
  }
  if (isLikelyGuid(priorId)) {
    payload['pm_priorversion@odata.bind'] = odataBind('pm_targetversions', priorId);
  }

  return payload;
}

async function createDataverseRecord(
  serviceCreate: (payload: Record<string, unknown>) => Promise<unknown>,
  logicalName: string,
  primaryKey: string,
  payload: Record<string, unknown>
): Promise<string> {
  try {
    const res = await serviceCreate(payload);
    const id = extractCreatedId(res, primaryKey) || normalizeGuid(unwrapRecord<Record<string, unknown>>(res)?.[primaryKey]);
    if (id) return id;
  } catch (err) {
    console.warn(`[DataverseService] Generated create ${logicalName} notice:`, err);
  }

  const xrm = getXrmWebApi();
  if (xrm) {
    try {
      const res = await xrm.createRecord(logicalName, payload);
      return res?.id ? normalizeGuid(res.id) : '';
    } catch (xrmErr) {
      console.error(`[DataverseService] Xrm create ${logicalName} error:`, xrmErr);
    }
  }

  return '';
}

export interface ProposalConflictDraft {
  proposal: Omit<Proposal, 'pm_proposalid'>;
  conflict?: Omit<Conflict, 'pm_conflictid' | 'pm_proposal'>;
}

export interface SaveProposalsResult {
  proposalIds: string[];
  conflictIds: string[];
  conflictCount: number;
}

/**
 * Save test values as pm_proposal rows linked to the source model.
 */
export async function saveProposalsToDataverse(
  proposals: Array<Omit<Proposal, 'pm_proposalid'>>
): Promise<string[]> {
  const result = await saveProposalsAndConflictsToDataverse(
    proposals.map((proposal) => ({ proposal }))
  );
  return result.proposalIds;
}

/**
 * Create proposals, then raise linked pm_conflict rows when a draft includes a conflict.
 */
export async function saveProposalsAndConflictsToDataverse(
  drafts: ProposalConflictDraft[]
): Promise<SaveProposalsResult> {
  if (!drafts.length) {
    return { proposalIds: [], conflictIds: [], conflictCount: 0 };
  }

  if (!isDataverseEnvironment()) {
    const proposalIds: string[] = [];
    const conflictIds: string[] = [];
    for (const draft of drafts) {
      const proposalId = financialStore.saveProposal(draft.proposal);
      proposalIds.push(proposalId);
      if (draft.conflict) {
        const conflictId = financialStore.saveConflict({
          ...draft.conflict,
          pm_proposal: proposalId,
        });
        conflictIds.push(conflictId);
      }
    }
    return { proposalIds, conflictIds, conflictCount: conflictIds.length };
  }

  const proposalIds: string[] = [];
  const conflictIds: string[] = [];

  for (const draft of drafts) {
    const proposalPayload = buildProposalPayload(draft.proposal);
    const proposalId = await createDataverseRecord(
      (payload) =>
        Pm_proposalsService.create(payload as unknown as Omit<Pm_proposalsBase, 'pm_proposalid'>),
      'pm_proposal',
      'pm_proposalid',
      proposalPayload
    );
    if (!proposalId) {
      throw new Error('Failed to save proposal to Dataverse.');
    }
    proposalIds.push(proposalId);

    if (!draft.conflict) continue;

    const conflictPayload = buildConflictPayload({
      ...draft.conflict,
      pm_proposal: proposalId,
    });
    const conflictId = await createDataverseRecord(
      (payload) =>
        Pm_conflictsService.create(payload as unknown as Omit<Pm_conflictsBase, 'pm_conflictid'>),
      'pm_conflict',
      'pm_conflictid',
      conflictPayload
    );
    if (conflictId) conflictIds.push(conflictId);
    else {
      throw new Error('Proposal was saved, but raising the linked conflict in Dataverse failed.');
    }
  }

  return { proposalIds, conflictIds, conflictCount: conflictIds.length };
}

function mapProposalEntityKind(value: unknown, name: unknown): EntityKind {
  const label = String(name ?? '').toLowerCase();
  if (label.includes('outcome')) return 'OrgOutcome';
  if (label.includes('output')) return 'OrgOutput';
  const n = Number(value);
  if (n === 3) return 'OrgOutcome';
  if (n === 2) return 'OrgOutput';
  return 'KPI';
}

function mapProposalStatus(
  value: unknown,
  name: unknown,
  statecode: unknown,
  recordName?: string
): ProposalStatus {
  if (isApprovedProposalName(recordName)) return 'Approved';
  const label = optionLabel(
    value,
    name ?? (value && typeof value === 'object' ? undefined : value)
  );
  const stateLabel = optionLabel(statecode);
  if (label.includes('approv')) return 'Approved';
  if (
    label.includes('inactiv') ||
    label.includes('reject') ||
    stateLabel.includes('inactiv') ||
    choiceNumber(statecode) === 1
  ) {
    return 'Inactive';
  }
  // Option 2 is Inactive on the default pm_proposal status set.
  if (choiceNumber(value) === 2 && choiceNumber(statecode) !== 0) return 'Inactive';
  return 'Active';
}

function mapConflictSource(value: unknown, name: unknown): TargetSource {
  const label = String(name ?? value ?? '')
    .toLowerCase()
    .replace(/\s+/g, '');
  if (label.includes('topdown') || label.includes('monthly')) return 'TopDownMonthly';
  if (label.includes('breakdown')) return 'Breakdown';
  if (label.includes('bottom')) return 'BottomUp';
  if (label.includes('financial') || label.includes('model')) return 'FinancialModeler';
  if (label.includes('forecast')) return 'Forecast';
  const n = choiceNumber(value);
  if (n === 1) return 'TopDownMonthly';
  if (n === 2) return 'Breakdown';
  if (n === 3) return 'BottomUp';
  if (n === 5) return 'FinancialModeler';
  return 'Forecast';
}

function mapProposalSource(value: unknown, name: unknown): TargetSource {
  const label = String(name ?? value ?? '').toLowerCase().replace(/\s+/g, '');
  if (label.includes('topdown') || label.includes('monthly')) return 'TopDownMonthly';
  if (label.includes('breakdown')) return 'Breakdown';
  if (label.includes('bottom')) return 'BottomUp';
  if (label.includes('financial') || label.includes('model')) return 'FinancialModeler';
  const n = Number(value);
  if (n === 2) return 'TopDownMonthly';
  if (n === 3) return 'Breakdown';
  if (n === 4) return 'BottomUp';
  if (n === 5) return 'FinancialModeler';
  return 'Forecast';
}

function mapConflictType(value: unknown, name: unknown): ConflictType {
  const label = String(name ?? '').toLowerCase();
  if (label.includes('forecast')) return 'ForecastVsMonthly';
  if (label.includes('children') || label.includes('parent')) return 'ChildrenVsParent';
  if (label.includes('bottom')) return 'BottomUpBelowApproved';
  const n = Number(value);
  if (n === 1) return 'ForecastVsMonthly';
  if (n === 2) return 'ChildrenVsParent';
  if (n === 3) return 'BottomUpBelowApproved';
  return 'ModelBuilderVsOrgKpi';
}

function mapConflictStatus(value: unknown, name: unknown, statecode: unknown): ConflictStatus {
  const label = String(name ?? '').toLowerCase();
  if (label.includes('approv')) return 'Approved';
  if (label.includes('reject')) return 'Rejected';
  if (Number(statecode) === 1) return 'Rejected';
  const n = Number(value);
  if (n === 2) return 'Approved';
  return 'Open';
}

function mapProposal(e: Record<string, unknown>): Proposal {
  return {
    pm_proposalid: normalizeGuid(e.pm_proposalid),
    pm_entitykind: mapProposalEntityKind(e.pm_entitykind, e.pm_entitykindname),
    pm_kpi: lookupId(e, 'pm_kpi') || undefined,
    pm_kpiname: lookupName(e, 'pm_kpi') || undefined,
    pm_orgoutput: lookupId(e, 'pm_orgoutput') || undefined,
    pm_orgoutputname: lookupName(e, 'pm_orgoutput') || undefined,
    pm_orgoutcome: lookupId(e, 'pm_orgoutcome') || undefined,
    pm_orgoutcomename: lookupName(e, 'pm_orgoutcome') || undefined,
    pm_businessunit: lookupId(e, 'pm_businessunit'),
    pm_businessunitname: lookupName(e, 'pm_businessunit') || undefined,
    pm_month: mapAchievementMonth(e),
    pm_year: Number(e.pm_year) || 0,
    pm_proposedvalue: decimalValue(e.pm_proposedvalue) ?? 0,
    pm_deptfunction: typeof e.pm_deptfunction === 'string' ? e.pm_deptfunction : undefined,
    pm_sourcemodel: lookupId(e, 'pm_sourcemodel') || undefined,
    pm_sourcemodelname: lookupName(e, 'pm_sourcemodel') || undefined,
    pm_name: typeof e.pm_name === 'string' ? e.pm_name : undefined,
    pm_source: mapProposalSource(e.pm_source, e.pm_sourcename),
    pm_hasconflict: e.pm_hasconflict === 1 || e.pm_hasconflict === 'Yes' || e.pm_hasconflictname === 'Yes' ? 'Yes' : 'No',
    statuscode: mapProposalStatus(
      e.statuscode,
      e.statuscodename ?? e['statuscode@OData.Community.Display.V1.FormattedValue'],
      e.statecode ?? e.statecodename,
      typeof e.pm_name === 'string' ? e.pm_name : undefined
    ),
    createdbyname: lookupName(e, 'createdby') || (typeof e.createdbyname === 'string' ? e.createdbyname : undefined) || undefined,
    createdon:
      typeof e.createdon === 'string'
        ? e.createdon
        : e.createdon instanceof Date
          ? e.createdon.toISOString()
          : undefined,
  };
}

function mapConflict(e: Record<string, unknown>): Conflict {
  const name = typeof e.pm_name === 'string' ? e.pm_name : undefined;
  return {
    pm_conflictid: recordId(e, 'pm_conflictid', 'Id', 'id'),
    pm_entitykind: mapProposalEntityKind(e.pm_entitykind, e.pm_entitykindname),
    pm_kpi: lookupId(e, 'pm_kpi') || undefined,
    pm_kpiname: lookupName(e, 'pm_kpi') || name,
    pm_orgoutput: lookupId(e, 'pm_orgoutput') || undefined,
    pm_orgoutputname: lookupName(e, 'pm_orgoutput') || undefined,
    pm_orgoutcome: lookupId(e, 'pm_orgoutcome') || undefined,
    pm_orgoutcomename: lookupName(e, 'pm_orgoutcome') || undefined,
    pm_businessunit: lookupId(e, 'pm_businessunit'),
    pm_businessunitname: lookupName(e, 'pm_businessunit') || undefined,
    pm_month: mapAchievementMonth(e),
    pm_year: Number(e.pm_year) || 0,
    pm_existingvalue: decimalValue(e.pm_existingvalue) ?? 0,
    pm_proposedvalue: decimalValue(e.pm_proposedvalue) ?? 0,
    pm_existingsource: mapConflictSource(e.pm_existingsource, e.pm_existingsourcename),
    pm_proposedsource: mapConflictSource(e.pm_proposedsource, e.pm_proposedsourcename),
    pm_conflicttype: mapConflictType(e.pm_conflicttype, e.pm_conflicttypename),
    pm_proposal: lookupId(e, 'pm_proposal') || undefined,
    pm_priorversion: lookupId(e, 'pm_priorversion') || undefined,
    pm_raisedby: lookupId(e, 'pm_raisedby') || undefined,
    pm_raisedon: typeof e.pm_raisedon === 'string' ? e.pm_raisedon : undefined,
    statuscode: mapConflictStatus(e.statuscode, e.statuscodename, e.statecode),
  };
}

export async function fetchProposalsFromDataverse(): Promise<Proposal[]> {
  const select = [
    'pm_proposalid',
    'pm_name',
    'pm_entitykind',
    'pm_proposedvalue',
    'pm_month',
    'pm_year',
    'pm_source',
    'pm_hasconflict',
    'pm_deptfunction',
    'statuscode',
    'statecode',
    'createdon',
    '_createdby_value',
    '_pm_kpi_value',
    '_pm_orgoutput_value',
    '_pm_orgoutcome_value',
    '_pm_businessunit_value',
    '_pm_sourcemodel_value',
  ];

  const load = async (filter?: string) => {
    const res = await Pm_proposalsService.getAll({
      select,
      filter,
      orderBy: ['createdon desc'],
      maxPageSize: 5000,
    });
    return unwrapList<Record<string, unknown>>(res);
  };

  try {
    const batches = await Promise.allSettled([
      load(),
      load('statecode eq 1'),
      load("statecode eq 'Inactive'"),
    ]);
    const byId = new Map<string, Proposal>();
    for (const batch of batches) {
      if (batch.status !== 'fulfilled') continue;
      for (const row of batch.value) {
        const mapped = mapProposal(row);
        if (mapped.pm_proposalid) byId.set(mapped.pm_proposalid, mapped);
      }
    }
    const list = [...byId.values()];
    if (list.length > 0) return list;
  } catch (err) {
    console.warn('[DataverseService] Fetch proposals notice:', err);
  }
  return isDataverseEnvironment() ? [] : financialStore.getProposals();
}

export async function fetchConflictsFromDataverse(): Promise<Conflict[]> {
  const collect = (rows: Record<string, unknown>[], byId: Map<string, Conflict>) => {
    for (const row of rows) {
      const mapped = mapConflict(row);
      const id = mapped.pm_conflictid || `row-${byId.size}`;
      if (!mapped.pm_conflictid) mapped.pm_conflictid = id;
      byId.set(mapped.pm_conflictid, mapped);
    }
  };

  const load = async (opts?: { filter?: string; select?: string[] }) => {
    const res = await Pm_conflictsService.getAll({
      ...(opts?.select ? { select: opts.select } : {}),
      ...(opts?.filter ? { filter: opts.filter } : {}),
      maxPageSize: 5000,
    });
    return unwrapList<Record<string, unknown>>(res);
  };

  const byId = new Map<string, Conflict>();
  const attempts: Array<{ label: string; run: () => Promise<Record<string, unknown>[]> }> = [
    { label: 'all', run: () => load() },
    { label: 'active', run: () => load({ filter: 'statecode eq 0' }) },
    { label: 'inactive-num', run: () => load({ filter: 'statecode eq 1' }) },
    { label: 'inactive-label', run: () => load({ filter: "statecode eq 'Inactive'" }) },
  ];

  for (const attempt of attempts) {
    try {
      collect(await attempt.run(), byId);
    } catch (err) {
      console.warn(`[DataverseService] Fetch conflicts (${attempt.label}) notice:`, err);
    }
  }

  if (byId.size > 0) return [...byId.values()];

  const xrm = getXrmWebApi();
  if (xrm) {
    try {
      const res = await xrm.retrieveMultipleRecords('pm_conflict', '');
      if (res?.entities) {
        collect(res.entities as Record<string, unknown>[], byId);
      }
    } catch (err) {
      console.warn('[DataverseService] Xrm fetch conflicts notice:', err);
    }
  }

  if (byId.size > 0) return [...byId.values()];
  return isDataverseEnvironment() ? [] : financialStore.getConflicts();
}

async function updateProposalRecord(id: string, fields: Record<string, unknown>): Promise<void> {
  try {
    const res = await Pm_proposalsService.update(id, fields as Partial<Omit<Pm_proposalsBase, 'pm_proposalid'>>);
    assertOperationSuccess(res, 'pm_proposal update');
    return;
  } catch (err) {
    console.warn('[DataverseService] Generated proposal update notice:', err);
    const xrm = getXrmWebApi();
    if (xrm) {
      await xrm.updateRecord('pm_proposal', id, fields);
      return;
    }
    throw err instanceof Error ? err : new Error('Could not update the proposal in Dataverse.');
  }
}

async function updateProposalWithAttempts(id: string, attempts: Array<Record<string, unknown>>): Promise<void> {
  let lastErr: unknown;
  for (const fields of attempts) {
    try {
      await updateProposalRecord(id, fields);
      return;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Could not update the proposal in Dataverse.');
}

async function updateConflictRecord(id: string, fields: Record<string, unknown>): Promise<void> {
  try {
    await Pm_conflictsService.update(id, fields as Partial<Omit<Pm_conflictsBase, 'pm_conflictid'>>);
    return;
  } catch (err) {
    console.warn('[DataverseService] Generated conflict update notice:', err);
  }
  const xrm = getXrmWebApi();
  if (xrm) {
    await xrm.updateRecord('pm_conflict', id, fields);
  }
}

async function upsertKpiAchievementTarget(proposal: Proposal): Promise<void> {
  const kpiId = normalizeGuid(proposal.pm_kpi);
  const buId = normalizeGuid(proposal.pm_businessunit);
  const existing = (await fetchKpiAchievementsFromDataverse({
    businessUnitId: buId,
    year: proposal.pm_year,
  })).find(
    (a) =>
      normalizeGuid(a.pm_kpi) === kpiId &&
      normalizeGuid(a.pm_businessunit) === buId &&
      a.pm_month === proposal.pm_month &&
      a.pm_year === proposal.pm_year
  );

  if (existing?.pm_kpiachievmentid) {
    await Pm_kpiachievmentsService.update(existing.pm_kpiachievmentid, {
      pm_target: proposal.pm_proposedvalue,
    });
    return;
  }

  const payload: Record<string, unknown> = {
    pm_name: `${proposal.pm_kpiname || 'KPI'} · ${proposal.pm_month}/${proposal.pm_year}`.slice(0, 200),
    pm_target: proposal.pm_proposedvalue,
    pm_month: proposal.pm_month,
    pm_year: proposal.pm_year,
  };
  if (isLikelyGuid(kpiId)) payload['pm_kpi@odata.bind'] = odataBind('strategy_kpises', kpiId);
  if (isLikelyGuid(buId)) payload['pm_businessunit@odata.bind'] = odataBind('businessunits', buId);
  await createDataverseRecord(
    (p) => Pm_kpiachievmentsService.create(p as unknown as Omit<Pm_kpiachievmentsBase, 'pm_kpiachievmentid'>),
    'pm_kpiachievment',
    'pm_kpiachievmentid',
    payload
  );
}

async function upsertOrgOutputAchievementTarget(proposal: Proposal): Promise<void> {
  const outputId = normalizeGuid(proposal.pm_orgoutput);
  const buId = normalizeGuid(proposal.pm_businessunit);
  const existing = (await fetchOrgOutputAchievementsFromDataverse()).find(
    (a) =>
      normalizeGuid(a.pm_orgoutput) === outputId &&
      normalizeGuid(a.pm_businessunit) === buId &&
      a.pm_month === proposal.pm_month &&
      a.pm_year === proposal.pm_year
  );
  if (existing?.pm_orgoutputachievmentid) {
    await Pm_orgoutputachievmentsService.update(existing.pm_orgoutputachievmentid, {
      pm_target: proposal.pm_proposedvalue,
    });
    return;
  }
  const payload: Record<string, unknown> = {
    pm_name: `${proposal.pm_orgoutputname || 'Output'} · ${proposal.pm_month}/${proposal.pm_year}`.slice(0, 200),
    pm_target: proposal.pm_proposedvalue,
    pm_month: proposal.pm_month,
    pm_year: proposal.pm_year,
  };
  if (isLikelyGuid(outputId)) payload['pm_orgoutput@odata.bind'] = odataBind('pm_orgoutputs', outputId);
  if (isLikelyGuid(buId)) payload['pm_businessunit@odata.bind'] = odataBind('businessunits', buId);
  await createDataverseRecord(
    (p) =>
      Pm_orgoutputachievmentsService.create(
        p as unknown as Omit<Pm_orgoutputachievmentsBase, 'pm_orgoutputachievmentid'>
      ),
    'pm_orgoutputachievment',
    'pm_orgoutputachievmentid',
    payload
  );
}

async function upsertOrgOutcomeAchievementTarget(proposal: Proposal): Promise<void> {
  const outcomeId = normalizeGuid(proposal.pm_orgoutcome);
  const buId = normalizeGuid(proposal.pm_businessunit);
  const existing = (await fetchOrgOutcomeAchievementsFromDataverse()).find(
    (a) =>
      normalizeGuid(a.pm_orgoutcome) === outcomeId &&
      normalizeGuid(a.pm_businessunit) === buId &&
      a.pm_month === proposal.pm_month &&
      a.pm_year === proposal.pm_year
  );
  if (existing?.pm_orgoutcomeachievmentid) {
    await Pm_orgoutcomeachievmentsService.update(existing.pm_orgoutcomeachievmentid, {
      pm_target: proposal.pm_proposedvalue,
    });
    return;
  }
  const payload: Record<string, unknown> = {
    pm_name: `${proposal.pm_orgoutcomename || 'Outcome'} · ${proposal.pm_month}/${proposal.pm_year}`.slice(0, 200),
    pm_target: proposal.pm_proposedvalue,
    pm_month: proposal.pm_month,
    pm_year: proposal.pm_year,
  };
  if (isLikelyGuid(outcomeId)) payload['pm_orgoutcome@odata.bind'] = odataBind('pm_orgoutcomes', outcomeId);
  if (isLikelyGuid(buId)) payload['pm_businessunit@odata.bind'] = odataBind('businessunits', buId);
  await createDataverseRecord(
    (p) =>
      Pm_orgoutcomeachievmentsService.create(
        p as unknown as Omit<Pm_orgoutcomeachievmentsBase, 'pm_orgoutcomeachievmentid'>
      ),
    'pm_orgoutcomeachievment',
    'pm_orgoutcomeachievmentid',
    payload
  );
}

export async function approveProposalInDataverse(proposal: Proposal): Promise<void> {
  if (!isDataverseEnvironment()) {
    financialStore.saveTarget(
      proposal.pm_kpi || '',
      proposal.pm_businessunit,
      proposal.pm_month,
      proposal.pm_year,
      proposal.pm_proposedvalue
    );
    financialStore.updateProposal(proposal.pm_proposalid, { statuscode: 'Approved' });
    financialStore.getConflicts()
      .filter((c) => c.pm_proposal === proposal.pm_proposalid)
      .forEach((c) => financialStore.updateConflict(c.pm_conflictid, { statuscode: 'Approved' }));
    return;
  }

  if (proposal.pm_entitykind === 'OrgOutput') await upsertOrgOutputAchievementTarget(proposal);
  else if (proposal.pm_entitykind === 'OrgOutcome') await upsertOrgOutcomeAchievementTarget(proposal);
  else await upsertKpiAchievementTarget(proposal);

  const approvedName = markApprovedProposalName(proposal.pm_name || proposalDisplayName(proposal));
  await updateProposalWithAttempts(proposal.pm_proposalid, [
    { statecode: 'Active', statuscode: 'Approved', pm_name: approvedName },
    { statecode: 0, statuscode: 'Approved', pm_name: approvedName },
    { statecode: 'Active', statuscode: 'Active', pm_name: approvedName },
    { statecode: 0, statuscode: 1, pm_name: approvedName },
  ]);

  const linked = (await fetchConflictsFromDataverse()).filter(
    (c) => normalizeGuid(c.pm_proposal) === normalizeGuid(proposal.pm_proposalid)
  );
  for (const conflict of linked) {
    await updateConflictRecord(conflict.pm_conflictid, { statecode: 1, statuscode: 2 });
  }
}

export async function rejectProposalInDataverse(proposal: Proposal): Promise<void> {
  if (!isDataverseEnvironment()) {
    financialStore.updateProposal(proposal.pm_proposalid, { statuscode: 'Inactive' });
    financialStore.getConflicts()
      .filter((c) => c.pm_proposal === proposal.pm_proposalid)
      .forEach((c) => financialStore.updateConflict(c.pm_conflictid, { statuscode: 'Rejected' }));
    return;
  }

  const restoredName = unmarkApprovedProposalName(proposal.pm_name);
  await updateProposalWithAttempts(proposal.pm_proposalid, [
    { statecode: 'Inactive', statuscode: 'Inactive', ...(restoredName ? { pm_name: restoredName } : {}) },
    { statecode: 1, statuscode: 2, ...(restoredName ? { pm_name: restoredName } : {}) },
    { statecode: 1, statuscode: 'Inactive', ...(restoredName ? { pm_name: restoredName } : {}) },
  ]);

  const linked = (await fetchConflictsFromDataverse()).filter(
    (c) => normalizeGuid(c.pm_proposal) === normalizeGuid(proposal.pm_proposalid)
  );
  for (const conflict of linked) {
    await updateConflictRecord(conflict.pm_conflictid, { statecode: 1, statuscode: 2 });
  }
}
