import { Stf_kpiachievmentbreakdownsService } from '../../../generated/services/Stf_kpiachievmentbreakdownsService';
import { Stf_kpiachievmentbreakdownsstf_breakdowntype } from '../../../generated/models/Stf_kpiachievmentbreakdownsModel';
import { Pm_kpiachievmentsService } from '../../../generated/services/Pm_kpiachievmentsService';
import { DIMENSION_SOURCES, DimensionOption, dimensionSource } from './BreakdownDimensionService';
import { BreakdownPath, BreakdownRow } from '../models/types';
import { actualForOption, targetForOption } from '../utils/breakdownFigures';

/**
 * BreakdownService — the recursive target breakdown, on Dataverse.
 *
 * Mirrors the prototype's breakdown screen, with each of its datasets pointed at the real table:
 *
 * | prototype              | Dataverse                                                        |
 * | ---------------------- | ---------------------------------------------------------------- |
 * | `S.bkdRows`            | `stf_kpiachievmentbreakdowns`                                    |
 * | parent KPI target      | `pm_kpiachievments.pm_target` (the row `stf_Total` points at)     |
 * | shortfall → proposal   | `pm_proposals` + `pm_conflicts` (via TargetWriteService)          |
 *
 * The prototype keyed every breakdown row by kpi+bu+month+year. Here that context lives on the
 * KPI achievement record instead: a breakdown row hangs off it through `stf_Total` ("KPI Total
 * (Parent)"), so a KPI with no achievement row for the month has nothing to break down — the
 * same case the prototype flags as "no target this month".
 *
 * Column mapping, row for row with the prototype's shape:
 *   name → stf_name · dimension → stf_breakdowntype · path → stf_breakdownpath
 *   level → stf_breakdownlevel · parent → stf_parent (self-lookup)
 *   target → comp_breakdowntarget · actual → stf_value · baseline → stf_baseline
 *   historical → stf_historical
 *
 * A row also records *which* value of the dimension it is: the matching lookup (stf_Account,
 * stf_Physician, stf_Employee …) or, for Payment Type, the stf_paymenttype choice. Which column
 * that is per dimension lives in BreakdownDimensionService; stf_name keeps the picked record's
 * label alongside it, so a row still reads on its own without expanding the lookup.
 */

/** stf_breakdowntype's options, as generated from the environment. */
export const BREAKDOWN_DIMENSIONS = Stf_kpiachievmentbreakdownsstf_breakdowntype;

export type BreakdownDimension = (typeof BREAKDOWN_DIMENSIONS)[keyof typeof BREAKDOWN_DIMENSIONS];

/** Dimension label → its option value, so rows can be written from the label the UI shows. */
const DIMENSION_VALUE = new Map<string, number>(
  Object.entries(BREAKDOWN_DIMENSIONS).map(([value, label]) => [label, Number(value)])
);

/** The KPI achievement a breakdown hangs off — the "total" the rows must reconcile to. */
export interface BreakdownAnchor {
  /** The pm_kpiachievments record id, or null when the KPI has no row for this BU/month. */
  achievementId: string | null;
  /** Its pm_target — the parent target at the root level. */
  target: number | null;
}

/** One value of a dimension in a mirrored component breakdown, and the figure it carries. */
export interface ComponentBreakdownNode {
  dimension: string;
  optionId: string;
  label: string;
  value: number;
}

export interface ComponentBreakdownInput {
  componentKpiId: string;
  /** The component's name — the root of the path label written on each row. */
  componentKpiName: string;
  buId: string;
  year: number;
  month: number;
  /**
   * The ancestry the written rows sit under, outermost first. Empty when the breakdown being
   * mirrored is at level 1. Every row the dialog fills is a sibling of the others, so there is one
   * shared chain rather than one per row.
   */
  ancestors: ComponentBreakdownNode[];
  /** The sibling rows to write beneath that ancestry. */
  rows: ComponentBreakdownNode[];
}

export interface CreateRowInput {
  achievementId: string;
  /** The readable ancestry written to stf_breakdownpath. */
  pathLabel: string;
  parentRowId: string | null;
  dimension: string;
  level: number;
  /** The value of the dimension this row is: a record from its table, or a choice option. */
  option: DimensionOption;
  target: number;
}

/** How many achievement ids to put in one `or` filter — keeps the request URL a sane length. */
const TOTAL_FILTER_BATCH = 20;

/** Every column a row's pick can live in, so one read covers all dimensions. */
const DIMENSION_COLUMNS = Array.from(
  new Set(Object.values(DIMENSION_SOURCES).map(source => source.valueColumn))
);

const ROW_COLUMNS = [
  'stf_kpiachievmentbreakdownid', 'stf_name', 'stf_breakdownpath', 'stf_breakdownlevel',
  'stf_breakdowntype', 'comp_breakdowntarget', 'stf_value', 'stf_baseline', 'stf_historical',
  '_stf_parent_value', '_stf_total_value',
  ...DIMENSION_COLUMNS
];

/**
 * An alternate key on this table can reject a row the app considers valid.
 *
 * The key seen in this environment is (Physician, KPI Total), which stops the same physician being
 * recorded under both Cash and Credit — two different paths under one KPI. That's a legitimate
 * breakdown, so the app allows it and the key has to be widened to include the parent for it to go
 * through. The raw rejection is a wall of plugin detail; this says what actually happened.
 */
function readableWriteError(message: string, dimension: string, label: string): string {
  if (/duplicate record|Entity Key .* violated|DuplicateRecordEntityKey/i.test(message)) {
    return `Dataverse refused this row: it keeps one ${dimension.toLowerCase()} per KPI, and`
      + ` ${label} is already recorded under another part of this breakdown. The same`
      + ` ${dimension.toLowerCase()} under two different parents is a valid breakdown, so the`
      + ` alternate key on stf_kpiachievmentbreakdown needs to include the parent row for this to`
      + ` be allowed.`;
  }
  return message;
}

/**
 * A unique id for a breakdown row, written to stf_name ("Breakdown ID").
 *
 * The row's own record id isn't known until Dataverse has created it, so this is minted client
 * side: time-ordered, so rows sort in the order they were built, with a random tail so two rows
 * created in the same millisecond can't collide.
 */
function newBreakdownId(): string {
  return `BD-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

/** The label Dataverse returns next to a lookup or choice, when the annotation comes through. */
const FORMATTED_VALUE = '@OData.Community.Display.V1.FormattedValue';

function toRow(record: any, kpiId: string): BreakdownRow {
  const typeValue = record.stf_breakdowntype as number | undefined;
  const dimension = (typeValue != null
    ? BREAKDOWN_DIMENSIONS[typeValue as keyof typeof BREAKDOWN_DIMENSIONS]
    : '') || '';

  // What this row is a breakdown *into* — read from the dimension's own column, so a row whose
  // lookup was set outside this app still shows the right value.
  const source = dimensionSource(dimension);
  const rawValue = source ? record[source.valueColumn] : undefined;
  const optionId = rawValue == null ? null : String(rawValue);
  const optionLabel = source ? record[`${source.valueColumn}${FORMATTED_VALUE}`] : undefined;

  return {
    id: record.stf_kpiachievmentbreakdownid,
    kpi: kpiId,
    pathLabel: record.stf_breakdownpath || '',
    parentId: record._stf_parent_value || null,
    dimension,
    name: optionLabel || record.stf_name || '',
    optionId,
    level: record.stf_breakdownlevel ?? 1,
    historical: record.stf_historical ?? 0,
    baseline: record.stf_baseline ?? 0,
    actual: record.stf_value ?? 0,
    actualRecorded: record.stf_value != null,
    target: record.comp_breakdowntarget ?? 0
  };
}

export class BreakdownService {
  /**
   * The KPI's achievement record for a BU/month — the parent every root-level breakdown row
   * reconciles to. Returns a null id when there's no record, which is what stops a breakdown
   * from being started.
   */
  public static async getAnchor(
    kpiId: string, buId: string, year: number, month: number
  ): Promise<BreakdownAnchor> {
    if (!kpiId || !buId) return { achievementId: null, target: null };

    const res = await Pm_kpiachievmentsService.getAll({
      select: ['pm_kpiachievmentid', 'pm_target', '_pm_parent_value'],
      filter: `_pm_kpi_value eq ${kpiId} and _pm_businessunit_value eq ${buId} and pm_year eq ${year} and pm_month eq ${month} and statecode eq 0`
    });
    // A month can hold more than one row; the breakdown hangs off the total — the one with no
    // parent, preferring a total that carries a target.
    const rows = (res.data || []) as Record<string, any>[];
    const record = rows.find(r => !r._pm_parent_value && r.pm_target != null)
      ?? rows.find(r => !r._pm_parent_value)
      ?? rows[0];
    if (!record) return { achievementId: null, target: null };
    return { achievementId: record.pm_kpiachievmentid, target: record.pm_target ?? null };
  }

  /**
   * The achievement row a breakdown hangs off, created when the KPI has none for the month.
   *
   * A bottom-up breakdown starts before any target exists, and a breakdown row still needs a
   * parent to point at — so the row is created with pm_target left empty. What fills it in is
   * writeAnchorTarget, once the rows the breakdown is built from add up to something.
   */
  public static async ensureAnchor(
    kpiId: string, buId: string, year: number, month: number
  ): Promise<string> {
    const existing = await this.getAnchor(kpiId, buId, year, month);
    if (existing.achievementId) return existing.achievementId;

    const payload: any = {
      'pm_kpi@odata.bind': `/strategy_kpises(${kpiId})`,
      'pm_businessunit@odata.bind': `/businessunits(${buId})`,
      pm_year: year,
      pm_month: month
    };
    const res = await Pm_kpiachievmentsService.create(payload);
    if (!res.success || !res.data) {
      throw new Error(res.error?.message || 'Failed to create the KPI achievement row');
    }
    return res.data.pm_kpiachievmentid;
  }

  /**
   * Write a target straight onto the achievement row a breakdown hangs off.
   *
   * Used by the bottom-up cycle, where the rows are built first and what they add up to *is* the
   * KPI's target — there is nothing to review it against, so it goes on the record rather than
   * into pm_proposals. The id must be the one ensureAnchor/getAnchor returned: a month can hold
   * more than one achievement row, and this has to land on the same total the breakdown rows and
   * every summary screen read.
   */
  public static async writeAnchorTarget(achievementId: string, target: number): Promise<void> {
    const res = await Pm_kpiachievmentsService.update(achievementId, { pm_target: target });
    if (!res.success) {
      throw new Error(res.error?.message || "Failed to write the KPI's target");
    }
  }

  /**
   * Every KPI's achievement for one BU/month, keyed by KPI id — the landing list's totals in a
   * single read rather than one per KPI.
   */
  public static async getAnchors(
    buId: string, year: number, month: number
  ): Promise<Map<string, BreakdownAnchor>> {
    const anchors = new Map<string, BreakdownAnchor>();
    if (!buId) return anchors;

    const res = await Pm_kpiachievmentsService.getAll({
      select: ['pm_kpiachievmentid', 'pm_target', '_pm_kpi_value', '_pm_parent_value'],
      filter: `_pm_businessunit_value eq ${buId} and pm_year eq ${year} and pm_month eq ${month} and statecode eq 0`
    });
    (res.data || []).forEach(record => {
      if (!record._pm_kpi_value) return;
      // Same rule as getAnchor: the total wins, and a total with a target beats one without.
      const existing = anchors.get(record._pm_kpi_value);
      const isTotal = !(record as Record<string, any>)._pm_parent_value;
      if (existing && (!isTotal || (existing.target != null && record.pm_target == null))) return;
      anchors.set(record._pm_kpi_value, {
        achievementId: record.pm_kpiachievmentid,
        target: record.pm_target ?? null
      });
    });
    return anchors;
  }

  /**
   * Every breakdown row under a KPI achievement, at every level — the equivalent of the
   * prototype's `bkAll`. One read; the tree is grouped in memory from there.
   */
  public static async getAllRows(achievementId: string, kpiId: string): Promise<BreakdownRow[]> {
    if (!achievementId) return [];
    const res = await Stf_kpiachievmentbreakdownsService.getAll({
      select: ROW_COLUMNS,
      filter: `_stf_total_value eq ${achievementId} and statecode eq 0`
    });
    if (!res.success || !res.data) return [];
    return res.data.map(record => toRow(record, kpiId));
  }

  /**
   * How deep each of many KPI achievements is broken down, for the landing list. Reading this
   * per KPI would be a request each; instead the ids are batched into `or` filters, so the whole
   * list costs a handful of reads however many KPIs the business unit has.
   */
  public static async levelsByTotal(achievementIds: string[]): Promise<Map<string, number>> {
    const levels = new Map<string, number>();
    const ids = achievementIds.filter(Boolean);
    if (!ids.length) return levels;

    for (let i = 0; i < ids.length; i += TOTAL_FILTER_BATCH) {
      const batch = ids.slice(i, i + TOTAL_FILTER_BATCH);
      const res = await Stf_kpiachievmentbreakdownsService.getAll({
        select: ['stf_kpiachievmentbreakdownid', 'stf_breakdownlevel', '_stf_total_value'],
        filter: `(${batch.map(id => `_stf_total_value eq ${id}`).join(' or ')}) and statecode eq 0`
      });
      (res.data || []).forEach(record => {
        const totalId = record._stf_total_value;
        if (!totalId) return;
        const level = record.stf_breakdownlevel ?? 1;
        levels.set(totalId, Math.max(levels.get(totalId) ?? 0, level));
      });
    }
    return levels;
  }

  /** The distinct paths anchored at a parent row (null parent = the root paths on the KPI). */
  public static paths(rows: BreakdownRow[], parentRowId: string | null): BreakdownPath[] {
    const byDimension = new Map<string, BreakdownPath>();
    rows
      .filter(r => (r.parentId || null) === (parentRowId || null))
      .forEach(r => {
        if (byDimension.has(r.dimension)) return;
        byDimension.set(r.dimension, {
          id: r.dimension,
          dimension: r.dimension,
          kpi: r.kpi,
          parentId: parentRowId
        });
      });
    return Array.from(byDimension.values());
  }

  /**
   * What a value of a dimension is already targeted at, and what it was last recorded at, under a
   * KPI — both by the lowest-level-wins rule. The rule itself is in `../utils/breakdownFigures`,
   * which has no Dataverse imports and so can be tested; these forward to it.
   */
  public static targetForOption = targetForOption;

  public static actualForOption = actualForOption;

  /** The rows breaking a parent down by one dimension. */
  public static rowsOfPath(rows: BreakdownRow[], dimension: string, parentRowId: string | null): BreakdownRow[] {
    return rows.filter(r => r.dimension === dimension && (r.parentId || null) === (parentRowId || null));
  }

  /**
   * Where a row sits, spelled out: the KPI, then each ancestor's value down to its parent —
   * 'OPD Volume > Cash'. Written to stf_breakdownpath so the row reads on its own in the table.
   */
  public static pathLabel(kpiName: string, parentRowId: string | null, rows: BreakdownRow[]): string {
    const chain: string[] = [];
    let current = parentRowId ? rows.find(r => r.id === parentRowId) : undefined;
    while (current) {
      chain.unshift(current.name);
      current = current.parentId ? rows.find(r => r.id === current!.parentId) : undefined;
    }
    return [kpiName, ...chain].filter(Boolean).join(' > ');
  }

  /**
   * Write the row's pick: the dimension's lookup bound to the chosen record, or its choice
   * value, plus the label in stf_name.
   */
  private static applyOption(payload: any, dimension: string, option: DimensionOption): void {
    const source = dimensionSource(dimension);
    if (!source) throw new Error(`Unknown breakdown dimension "${dimension}"`);

    if (source.kind === 'choice') {
      payload[source.valueColumn] = Number(option.id);
      return;
    }
    payload[`${source.bindProperty}@odata.bind`] = `/${source.entitySet}(${option.id})`;
  }

  /** Create one breakdown row. Returns its id; the caller re-reads the tree from Dataverse. */
  public static async createRow(input: CreateRowInput): Promise<string> {
    const { achievementId, pathLabel, parentRowId, dimension, level, option, target } = input;

    const dimensionValue = DIMENSION_VALUE.get(dimension);
    if (dimensionValue == null) throw new Error(`Unknown breakdown dimension "${dimension}"`);

    const payload: any = {
      stf_name: newBreakdownId(),
      stf_breakdownpath: pathLabel,
      stf_breakdownlevel: level,
      stf_breakdowntype: dimensionValue,
      comp_breakdowntarget: target,
      'stf_Total@odata.bind': `/pm_kpiachievments(${achievementId})`
    };
    this.applyOption(payload, dimension, option);
    if (parentRowId) {
      payload['stf_parent@odata.bind'] = `/stf_kpiachievmentbreakdowns(${parentRowId})`;
    }

    const res = await Stf_kpiachievmentbreakdownsService.create(payload);
    if (!res.success || !res.data) {
      throw new Error(readableWriteError(
        res.error?.message || 'Failed to create breakdown row', dimension, option.label
      ));
    }
    return res.data.stf_kpiachievmentbreakdownid;
  }

  /**
   * Update a row's editable fields — its target, and which value of the dimension it points at.
   * Re-picking rewrites the lookup (or choice) and the label together, so the two never drift.
   */
  public static async updateRow(
    rowId: string,
    updates: { target?: number; dimension?: string; option?: DimensionOption; pathLabel?: string }
  ): Promise<void> {
    const payload: any = {};
    if (updates.target !== undefined) payload.comp_breakdowntarget = updates.target;
    if (updates.option && updates.dimension) this.applyOption(payload, updates.dimension, updates.option);
    if (updates.pathLabel !== undefined) payload.stf_breakdownpath = updates.pathLabel;
    if (!Object.keys(payload).length) return;

    const res = await Stf_kpiachievmentbreakdownsService.update(rowId, payload);
    if (!res.success) throw new Error(res.error?.message || 'Failed to update breakdown row');
  }

  /**
   * Record a model's component values as that component's own breakdown, mirroring the shape of
   * the breakdown they came from.
   *
   * The bottom-up cycle builds a KPI's figure out of rows rather than splitting an approved one, so
   * what a model works out for each component is a recorded figure, not something to review — it
   * goes into the component's own breakdown rather than into pm_proposals. The component's
   * achievement row for the month is created if it has none, since a breakdown row must hang off
   * one; its pm_target is left alone, because only the KPI being broken down is making a claim
   * about its own total here.
   *
   * A row already recorded for the same value of the dimension under the same parent is updated
   * rather than added to. That is not only the safer reading — the table carries an alternate key
   * on (dimension value, KPI Total), so a second row for the same value under one achievement is
   * refused outright.
   *
   * Ancestors that don't exist yet are created so the mirrored rows sit at the level they do in the
   * breakdown they came from, carrying the total of what is written beneath them. An ancestor that
   * already exists keeps its own figure — it may have children beyond the ones written here, so its
   * total isn't this fill's to overwrite.
   *
   * Returns how many rows were created and updated, for the caller's report.
   */
  public static async writeComponentBreakdown(
    input: ComponentBreakdownInput
  ): Promise<{ created: number; updated: number }> {
    const { componentKpiId, componentKpiName, buId, year, month, ancestors, rows } = input;
    if (!rows.length) return { created: 0, updated: 0 };

    const achievementId = await this.ensureAnchor(componentKpiId, buId, year, month);
    const existing = await this.getAllRows(achievementId, componentKpiId);
    let created = 0;
    let updated = 0;

    const match = (node: ComponentBreakdownNode, parentRowId: string | null) => existing.find(
      r => r.dimension === node.dimension
        && r.optionId === node.optionId
        && (r.parentId || null) === (parentRowId || null)
    );

    // Walk down the shared ancestry first, so each mirrored row has a real parent to bind to.
    const labels: string[] = [];
    let parentRowId: string | null = null;
    for (const [index, ancestor] of ancestors.entries()) {
      labels.push(ancestor.label);
      const found = match(ancestor, parentRowId);
      if (found) { parentRowId = found.id; continue; }
      parentRowId = await this.createRow({
        achievementId,
        pathLabel: [componentKpiName, ...labels.slice(0, -1)].filter(Boolean).join(' > '),
        parentRowId,
        dimension: ancestor.dimension,
        level: index + 1,
        option: { id: ancestor.optionId, label: ancestor.label },
        target: ancestor.value
      });
      created++;
    }

    const leafLevel = ancestors.length + 1;
    const leafPath = [componentKpiName, ...labels].filter(Boolean).join(' > ');
    for (const row of rows) {
      const found = match(row, parentRowId);
      if (found) {
        await this.updateRow(found.id, {
          target: row.value,
          dimension: row.dimension,
          option: { id: row.optionId, label: row.label },
          pathLabel: leafPath
        });
        updated++;
        continue;
      }
      await this.createRow({
        achievementId,
        pathLabel: leafPath,
        parentRowId,
        dimension: row.dimension,
        level: leafLevel,
        option: { id: row.optionId, label: row.label },
        target: row.value
      });
      created++;
    }

    return { created, updated };
  }

  /** Delete one row. Descendants are removed by the caller, deepest first. */
  public static async deleteRowById(rowId: string): Promise<void> {
    await Stf_kpiachievmentbreakdownsService.delete(rowId);
  }
}

