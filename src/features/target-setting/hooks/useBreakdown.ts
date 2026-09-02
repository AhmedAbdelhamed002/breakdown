import { useState, useEffect, useCallback, useMemo } from 'react';
import { BreakdownService } from '../services/BreakdownService';
import { DIMENSION_LABELS, DimensionOption } from '../services/BreakdownDimensionService';
import { BaseEntity, EntityService } from '../services/EntityService';
import { FinancialModel, ModelService } from '@infrastructure/financialImpact/ModelService';
import { EvalContext } from '@infrastructure/financialImpact/ModelEvalService';
import { AchievementService } from '../services/AchievementService';
import { ConflictRecord, ConflictService } from '@infrastructure/financialImpact/ConflictService';
import { LedgerService } from '@infrastructure/financialImpact/LedgerService';
import { TargetWriteService } from '@infrastructure/financialImpact/TargetWriteService';
import { CONFLICT_TYPE_BY_SOURCE } from '@infrastructure/financialImpact/TargetSource';
import { ConflictDetectionService } from '../services/ConflictDetectionService';
import { ModelFillResult } from '../components/BreakdownModelDialog';
import { PendingConflict } from '@shared/components/ConflictConfirmDialog/ConflictConfirmDialog';
import { BreakdownRow, MONTHS, rollUpValues } from '../models/types';

/** A KPI on the landing list, with its month target and how deep it's already broken down. */
export interface BreakdownKpiRow {
  id: string;
  name: string;
  type: string;
  aggType: BaseEntity['aggType'];
  /** pm_target on the KPI's achievement record for this BU/month. */
  target: number | null;
  /** Whether that achievement record exists at all — nothing can be broken down without one. */
  hasAchievement: boolean;
  levels: number;
}

/**
 * A row as it stands on screen. Everything is edited here first; nothing reaches Dataverse until
 * Save breakdown is pressed, so leaving the screen throws the working copy away.
 */
export interface DraftRow extends BreakdownRow {
  /** Not in Dataverse yet — Save creates it. */
  isNew?: boolean;
  /** Edited since it was read — Save updates it. */
  isDirty?: boolean;
}

/**
 * Which cycle the screen is working in.
 *
 * 'top-down' is the original: an approved target is split, and the rows have to add up to it.
 * 'bottom-up' starts the other way round — the rows are built first, from a KPI that may have no
 * target at all, and what they add up to is proposed rather than reconciled.
 */
export type BreakdownCycle = 'top-down' | 'bottom-up';

interface BreakdownView {
  kpi: BaseEntity | null;
  /** When set, this breakdown row is the parent being broken down further. */
  focusRowId: string | null;
  /** The dimension currently shown under that parent — a parent has one path per dimension. */
  dimension: string | null;
  reverse: boolean;
  reverseLevel: number;
}

const EMPTY_VIEW: BreakdownView = {
  kpi: null, focusRowId: null, dimension: null, reverse: false, reverseLevel: 2
};

/** The dimension labels offered when starting a new breakdown. */
export const DIMENSION_OPTIONS = DIMENSION_LABELS;

let draftSequence = 0;
const nextDraftId = () => `draft-${++draftSequence}`;

export interface UseBreakdownOptions {
  businessUnitId: string;
  year: number;
  month: number;
  /**
   * Which cycle this screen runs. The Breakdown tab splits approved targets top-down; the
   * Bottom-up tab builds rows for KPIs that have no target and proposes what they come to.
   */
  cycle: BreakdownCycle;
  /** Only list KPIs that have a target for the month, or only those that don't. */
  require: 'with-target' | 'without-target';
  /**
   * Narrow the landing list to one department and/or function. Both are optional — a screen that
   * doesn't offer the selectors lists every KPI in the business unit. Only the list is narrowed;
   * `allKpis` stays whole, since it's what tells the evaluator which KPIs are percentages.
   */
  departmentId?: string;
  functionId?: string;
}

export function useBreakdown({
  businessUnitId, year, month, cycle, require, departmentId, functionId
}: UseBreakdownOptions) {

  const [view, setView] = useState<BreakdownView>(EMPTY_VIEW);

  const [kpiRows, setKpiRows] = useState<BreakdownKpiRow[]>([]);
  /** Every KPI and model, so a row's target can be built on a financial model. */
  const [allKpis, setAllKpis] = useState<BaseEntity[]>([]);
  const [models, setModels] = useState<FinancialModel[]>([]);
  /** What Dataverse holds, as last read — the baseline the draft is compared against. */
  const [savedRows, setSavedRows] = useState<BreakdownRow[]>([]);
  /** The working copy every edit goes to. */
  const [draftRows, setDraftRows] = useState<DraftRow[]>([]);
  const [achievementId, setAchievementId] = useState<string | null>(null);
  const [kpiTarget, setKpiTarget] = useState<number | null>(null);
  const [kpiConflicts, setKpiConflicts] = useState<ConflictRecord[]>([]);

  /**
   * A model fill waiting to be written, in the bottom-up cycle — the per-row component values and
   * the names to record them under. Staged rather than written on the spot so the whole breakdown,
   * its own rows and its components' alike, lands in one go on Save breakdown; abandoning the
   * breakdown then writes nothing.
   */
  const [pendingComponentFill, setPendingComponentFill] = useState<{
    componentRowValues: Record<string, Record<string, number>>;
    components: { kpiId: string; kpiName: string }[];
  } | null>(null);

  /** A save waiting on the user to accept the conflicts it would record, and the work to run. */
  const [pendingSave, setPendingSave] = useState<{
    conflicts: PendingConflict[];
    confirmLabel: string;
    run: () => Promise<void>;
  } | null>(null);

  const [loading, setLoading] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  /* ---------- Landing: the BU's KPIs with their month target and breakdown depth ---------- */
  useEffect(() => {
    if (view.kpi) return;
    if (!businessUnitId) { setKpiRows([]); return; }

    let cancelled = false;
    setLoading(true);
    const run = async () => {
      const [kpis, buKpiIds, anchors, allModels] = await Promise.all([
        EntityService.getKpis(),
        AchievementService.getKpiIdsForBusinessUnit(businessUnitId),
        BreakdownService.getAnchors(businessUnitId, year, month),
        ModelService.getAllModels()
      ]);
      // The list is narrowed to the BU and, where the screen offers them, to a department and
      // function — read off the KPI's own columns, so no extra request. allKpis stays whole.
      const scoped = kpis.filter(k =>
        buKpiIds.has(k.id)
        && (!departmentId || k.departmentId === departmentId)
        && (!functionId || k.functionId === functionId)
      );
      if (!cancelled) { setAllKpis(kpis); setModels(allModels); }

      const levels = await BreakdownService.levelsByTotal(
        scoped.map(k => anchors.get(k.id)?.achievementId).filter((id): id is string => !!id)
      );

      const rows = scoped
        // A top-down breakdown splits a target, so a KPI without one has nothing to split;
        // bottom-up is the other way round and only wants the ones still missing a target.
        .filter(kpi => {
          const target = anchors.get(kpi.id)?.target;
          const hasTarget = target != null && target !== 0;
          return require === 'with-target' ? hasTarget : !hasTarget;
        })
        .map(kpi => {
        const anchor = anchors.get(kpi.id);
        return {
          id: kpi.id,
          name: kpi.name,
          type: kpi.type || 'Input',
          aggType: kpi.aggType,
          target: anchor?.target ?? null,
          hasAchievement: !!anchor?.achievementId,
          levels: anchor?.achievementId ? (levels.get(anchor.achievementId) ?? 0) : 0
        };
      });
      if (!cancelled) setKpiRows(rows);
    };
    run()
      .catch(err => { if (!cancelled) setError(err.message || 'Failed to load KPIs'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [view.kpi, businessUnitId, year, month, require, departmentId, functionId]);

  /* ---------- The open KPI's achievement (the "total") and all its breakdown rows ---------- */
  const loadRows = useCallback(async () => {
    if (!view.kpi || !businessUnitId) {
      setSavedRows([]); setDraftRows([]); setAchievementId(null); setKpiTarget(null); setKpiConflicts([]);
      setPendingComponentFill(null);
      return;
    }
    const entityRef = { kind: 'kpi' as const, id: view.kpi.id };
    const [anchor, conflicts] = await Promise.all([
      BreakdownService.getAnchor(view.kpi.id, businessUnitId, year, month),
      ConflictService.getConflicts(entityRef, businessUnitId, year, month)
    ]);
    setAchievementId(anchor.achievementId);
    setKpiTarget(anchor.target);
    setKpiConflicts(conflicts);

    const rows = anchor.achievementId
      ? await BreakdownService.getAllRows(anchor.achievementId, view.kpi.id)
      : [];
    setSavedRows(rows);
    setDraftRows(rows.map(row => ({ ...row })));
  }, [view.kpi, businessUnitId, year, month]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadRows()
      .catch(err => { if (!cancelled) setError(err.message || 'Failed to load breakdown'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [loadRows]);

  /* ---------- The screen's current parent: the KPI itself, or a row being broken down ---------- */
  const focusRow = useMemo(
    () => (view.focusRowId ? draftRows.find(r => r.id === view.focusRowId) ?? null : null),
    [view.focusRowId, draftRows]
  );

  const parentRowId = focusRow ? focusRow.id : null;
  const parentTarget = focusRow ? focusRow.target : (kpiTarget ?? 0);
  const parentLabel = focusRow
    ? `${view.kpi?.name} ▸ ${focusRow.name} (${focusRow.dimension})`
    : `${view.kpi?.name ?? ''} — ${MONTHS[month - 1]} ${year}`;
  const level = focusRow ? focusRow.level + 1 : 1;

  const paths = useMemo(() => BreakdownService.paths(draftRows, parentRowId), [draftRows, parentRowId]);

  // Keep the picker on a dimension that exists under the current parent.
  useEffect(() => {
    if (paths.some(p => p.dimension === view.dimension)) return;
    setView(v => ({ ...v, dimension: paths[0]?.dimension ?? null }));
  }, [paths, view.dimension]);

  const dimension = view.dimension ?? '';

  const rows = useMemo(
    () => (dimension ? BreakdownService.rowsOfPath(draftRows, dimension, parentRowId) : []),
    [draftRows, dimension, parentRowId]
  );

  /** What each linked record is already targeted at in this path — for the bulk sheet. */
  const targetsByOption = useMemo(() => {
    const byOption: Record<string, number> = {};
    rows.forEach(r => { if (r.optionId) byOption[r.optionId] = r.target; });
    return byOption;
  }, [rows]);

  /** How this KPI's parts make up the whole — averaged for a Percentage KPI, added for a Value one. */
  const aggType = view.kpi?.aggType;
  const isPercentage = aggType === 'Percentage';

  /**
   * What the rows come to, by that rule. A Value KPI's rows share the parent out between them; a
   * Percentage KPI's rows are each their own percentage and average to it.
   */
  const rowsTotal = useMemo(
    () => rollUpValues(rows.map(r => r.target || 0), aggType),
    [rows, aggType]
  );

  const isBottomUp = cycle === 'bottom-up';

  /**
   * Whether these rows speak for the KPI itself. Only true for a bottom-up breakdown at level 1,
   * where there is no parent row and what the rows come to *is* the KPI's figure.
   *
   * Drill into a row and that stops being true: rows under `Cash` reconcile to Cash's own target,
   * exactly as top-down does. The KPI's target is a level up and, for a Percentage KPI, isn't even
   * the same number — Cash 90 and Credit 70 average to a KPI target of 80, so physician rows
   * averaging to Cash's 90 are correct and must not be read against the 80.
   */
  const claimsKpi = isBottomUp && !focusRow;

  /** What the rows have to reconcile to, unless they are the KPI's own claim. */
  const status: 'match' | 'short' | 'exceeds' =
    claimsKpi || Math.abs(rowsTotal - parentTarget) < 0.5
      ? 'match'
      : rowsTotal < parentTarget ? 'short' : 'exceeds';

  /** What's left of the parent target once the rows on screen are counted. */
  const remaining = Math.round((parentTarget - rowsTotal) * 100) / 100;

  /** Which child paths hang under a row, so the table can show it's broken down further. */
  const childDimensions = useCallback(
    (rowId: string) => BreakdownService.paths(draftRows, rowId).map(p => p.dimension),
    [draftRows]
  );

  /**
   * Values listed twice in the *same* breakdown — the same physician appearing twice under Cash.
   *
   * The same value under a different parent is a different row, not a duplicate: Cash ▸ Dr Ahmed
   * and Credit ▸ Dr Ahmed are two distinct paths and both are legitimate. Only a repeat within one
   * parent and dimension is an error.
   */
  const duplicateKeys = useMemo(() => {
    const seen = new Map<string, number>();
    draftRows.forEach(r => {
      if (!r.optionId) return;
      const key = `${r.parentId ?? 'root'}:${r.dimension}:${r.optionId}`;
      seen.set(key, (seen.get(key) ?? 0) + 1);
    });
    return new Set(
      Array.from(seen.entries()).filter(([, count]) => count > 1).map(([key]) => key)
    );
  }, [draftRows]);

  /** Whether this row's value is listed twice under the same parent. */
  const isDuplicate = useCallback(
    (row: { dimension: string; optionId: string | null; parentId: string | null }) =>
      !!row.optionId
      && duplicateKeys.has(`${row.parentId ?? 'root'}:${row.dimension}:${row.optionId}`),
    [duplicateKeys]
  );

  /** Rows removed from the draft that Dataverse still holds. */
  const deletedRows = useMemo(
    () => savedRows.filter(saved => !draftRows.some(draft => draft.id === saved.id)),
    [savedRows, draftRows]
  );

  const isDirty = useMemo(
    () => draftRows.some(r => r.isNew || r.isDirty) || deletedRows.length > 0,
    [draftRows, deletedRows]
  );

  /* ---------- Navigation ---------- */
  const openKpi = useCallback((kpi: BaseEntity) => setView({ ...EMPTY_VIEW, kpi }), []);
  const closeKpi = useCallback(() => setView(EMPTY_VIEW), []);
  const openRow = useCallback((rowId: string) => setView(v => ({ ...v, focusRowId: rowId, dimension: null })), []);
  const setPath = useCallback((dim: string) => setView(v => ({ ...v, dimension: dim })), []);
  const toggleReverse = useCallback(() => setView(v => ({ ...v, reverse: !v.reverse })), []);
  const setReverseLevel = useCallback((lvl: number) => setView(v => ({ ...v, reverseLevel: lvl })), []);

  const back = useCallback(() => {
    setView(v => {
      if (!v.focusRowId) return EMPTY_VIEW;
      const current = draftRows.find(r => r.id === v.focusRowId);
      return { ...v, focusRowId: current?.parentId ?? null, dimension: null };
    });
  }, [draftRows]);

  /* ---------- Draft edits — none of these touch Dataverse ---------- */

  const makeDraftRow = useCallback((
    dim: string, option: DimensionOption, target: number
  ): DraftRow => ({
    id: nextDraftId(),
    kpi: view.kpi?.id ?? '',
    // The path is spelled out at save time, once every ancestor's name is settled.
    pathLabel: '',
    parentId: parentRowId,
    dimension: dim,
    name: option.label,
    optionId: option.id,
    level,
    historical: 0,
    baseline: 0,
    actual: 0,
    target,
    isNew: true
  }), [view.kpi, parentRowId, level]);

  /** Start breaking the current parent down by a dimension, with one value picked. */
  const newPath = useCallback((dim: string, option: DimensionOption) => {
    // A new row starts at nothing: the rows of a breakdown have to add up to the parent, so
    // seeding each one with the parent's whole target would overstate it from the first row.
    setDraftRows(prev => [...prev, makeDraftRow(dim, option, 0)]);
    setView(v => ({ ...v, dimension: dim }));
  }, [makeDraftRow]);

  const addRow = useCallback((option: DimensionOption) => {
    if (!dimension) return;
    setDraftRows(prev => [...prev, makeDraftRow(dimension, option, 0)]);
  }, [dimension, makeDraftRow]);

  /**
   * Put whatever is missing onto one row, so the rows close on the parent exactly. On a Percentage
   * KPI the gap is in the average, so the row has to move by the gap times the number of rows to
   * shift that average by it.
   */
  const takeRemaining = useCallback((rowId: string) => {
    const shift = isPercentage ? remaining * rows.length : remaining;
    setDraftRows(prev => prev.map(r => (
      r.id === rowId
        ? { ...r, target: Math.round((r.target + shift) * 100) / 100, isDirty: !r.isNew }
        : r
    )));
  }, [remaining, isPercentage, rows.length]);

  /** Add a draft row per entry, or update the row that already points at that value. */
  const addRowsBulk = useCallback((
    entries: { option: DimensionOption; target: number }[],
    dimensionOverride?: string
  ) => {
    const dim = dimensionOverride || dimension;
    if (!dim || !entries.length) return;
    setDraftRows(prev => {
      const next = [...prev];
      entries.forEach(entry => {
        const index = next.findIndex(r =>
          r.dimension === dim
          && (r.parentId || null) === (parentRowId || null)
          && r.optionId === entry.option.id);
        if (index >= 0) {
          next[index] = { ...next[index], target: entry.target, isDirty: !next[index].isNew };
          return;
        }
        next.push(makeDraftRow(dim, entry.option, entry.target));
      });
      return next;
    });
    setView(v => ({ ...v, dimension: dim }));
  }, [dimension, parentRowId, makeDraftRow]);

  const repickRow = useCallback((rowId: string, option: DimensionOption) => {
    setDraftRows(prev => prev.map(r => (
      r.id === rowId
        ? { ...r, name: option.label, optionId: option.id, isDirty: !r.isNew }
        : r
    )));
  }, []);

  const setRowTarget = useCallback((rowId: string, target: number) => {
    setDraftRows(prev => prev.map(r => (
      r.id === rowId ? { ...r, target, isDirty: !r.isNew } : r
    )));
  }, []);

  /** Drop a row and everything under it from the draft. */
  const deleteRow = useCallback((rowId: string) => {
    setDraftRows(prev => {
      const doomed = new Set([rowId]);
      let grew = true;
      while (grew) {
        grew = false;
        prev.forEach(r => {
          if (r.parentId && doomed.has(r.parentId) && !doomed.has(r.id)) { doomed.add(r.id); grew = true; }
        });
      }
      return prev.filter(r => !doomed.has(r.id));
    });
  }, []);

  /**
   * Set every row so the rows come to the parent target exactly.
   *
   * For a Value KPI that's an equal share — 1,000 across five rows is 200 each. For a Percentage
   * KPI the parts average, so an even split is each row *at* the target: five accounts at 80% each
   * average to 80%.
   */
  const splitEvenly = useCallback(() => {
    if (!rows.length) return;
    const share = isPercentage
      ? parentTarget
      : Math.round((parentTarget / rows.length) * 100) / 100;
    const ids = new Set(rows.map(r => r.id));
    setDraftRows(prev => prev.map(r => (
      ids.has(r.id) ? { ...r, target: share, isDirty: !r.isNew } : r
    )));
  }, [rows, parentTarget, isPercentage]);

  /** Throw the working copy away and go back to what Dataverse holds. */
  const discardChanges = useCallback(() => {
    setDraftRows(savedRows.map(row => ({ ...row })));
    // The staged component fill belongs to the draft it was worked out from — dropping one drops
    // the other, so a discarded breakdown never writes its components on the next save.
    setPendingComponentFill(null);
  }, [savedRows]);

  /* ---------- Save ---------- */

  /**
   * Write the draft: new rows created, edited rows updated, removed rows deleted — then the
   * reconciliation. Top-down: a total short of its parent is saved as a proposal and raises a
   * conflict, exactly as the prototype does. Bottom-up: the total becomes the KPI's target on
   * pm_kpiachievments, falling back to a proposal only if a target has since been approved.
   */
  const runSave = useCallback(async () => {
    if (!view.kpi || !businessUnitId) return;
    setSaving(true);
    try {
      // A bottom-up breakdown may be the first thing this KPI has for the month, so the row the
      // rows hang off is created here if it doesn't exist yet.
      const anchorId = achievementId ?? await BreakdownService.ensureAnchor(
        view.kpi.id, businessUnitId, year, month
      );
      // Deepest first, so a row is never left pointing at a parent that's already gone.
      const ordered = [...deletedRows].sort((a, b) => b.level - a.level);
      for (const row of ordered) {
        await BreakdownService.deleteRowById(row.id);
      }

      // Parents before children, so a new child can bind to its new parent's real id.
      const created = new Map<string, string>();
      const pending = draftRows.filter(r => r.isNew).sort((a, b) => a.level - b.level);
      for (const row of pending) {
        const parentId = row.parentId ? (created.get(row.parentId) ?? row.parentId) : null;
        const id = await BreakdownService.createRow({
          achievementId: anchorId,
          pathLabel: BreakdownService.pathLabel(view.kpi.name, row.parentId, draftRows),
          parentRowId: parentId,
          dimension: row.dimension,
          level: row.level,
          option: { id: row.optionId ?? '', label: row.name },
          target: row.target
        });
        created.set(row.id, id);
      }

      for (const row of draftRows.filter(r => r.isDirty && !r.isNew)) {
        await BreakdownService.updateRow(row.id, {
          target: row.target,
          dimension: row.dimension,
          option: { id: row.optionId ?? '', label: row.name },
          pathLabel: BreakdownService.pathLabel(view.kpi.name, row.parentId, draftRows)
        });
      }

      // A model fill staged by the bottom-up cycle: each component's per-row values become that
      // component's own breakdown, mirroring this one's shape under the component's achievement.
      // Written here rather than when the dialog closed, so the components and the rows they were
      // worked out from land together.
      let componentReport = '';
      if (pendingComponentFill) {
        // The chain these rows sit under, root first — every row the dialog filled is a sibling, so
        // there is one shared ancestry to mirror rather than one per row.
        const ancestorChain: DraftRow[] = [];
        let walk = parentRowId ? draftRows.find(r => r.id === parentRowId) : undefined;
        while (walk) {
          ancestorChain.unshift(walk);
          walk = walk.parentId ? draftRows.find(r => r.id === walk!.parentId) : undefined;
        }

        let createdRows = 0;
        let updatedRows = 0;
        const skipped: string[] = [];
        for (const component of pendingComponentFill.components) {
          // A model can name its own result as one of its components. Mirroring that would write
          // over the very rows just saved above — same achievement, same dimension, same values of
          // it — with the component figure instead of the row target, so it is left out.
          if (component.kpiId.toLowerCase() === view.kpi.id.toLowerCase()) {
            skipped.push(component.kpiName);
            continue;
          }
          const valueFor = (rowId: string) =>
            pendingComponentFill.componentRowValues[rowId]?.[component.kpiId] ?? 0;
          const componentAggType = allKpis.find(
            k => k.id.toLowerCase() === component.kpiId.toLowerCase()
          )?.aggType;
          const total = rollUpValues(rows.map(r => valueFor(r.id)), componentAggType);

          const written = await BreakdownService.writeComponentBreakdown({
            componentKpiId: component.kpiId,
            componentKpiName: component.kpiName,
            buId: businessUnitId,
            year,
            month,
            ancestors: ancestorChain.map(a => ({
              dimension: a.dimension,
              optionId: a.optionId ?? '',
              label: a.name,
              value: total
            })),
            rows: rows
              .filter(r => r.optionId)
              .map(r => ({
                dimension: r.dimension,
                optionId: r.optionId!,
                label: r.name,
                value: valueFor(r.id)
              }))
          });
          createdRows += written.created;
          updatedRows += written.updated;
        }
        setPendingComponentFill(null);
        componentReport = ` The model's components were recorded in their own breakdowns:`
          + ` ${createdRows} row(s) created, ${updatedRows} updated.`
          + (skipped.length ? ` ${skipped.join(', ')} was skipped — a model can't break itself down.` : '');
      }

      // Where the rows' total goes. Only a level-1 bottom-up breakdown is making a claim about the
      // KPI: it built the target out of nothing, so it writes pm_target straight onto the
      // achievement row, there being no approved figure for it to be reviewed against. Everything
      // else — top-down at any level, and a bottom-up row being drilled into — is reconciling to
      // the parent row above it, and only a shortfall there is worth a proposal.
      const short = !claimsKpi && rowsTotal < parentTarget - 0.5;
      // The KPI having since been approved at something else is the one case where a level-1
      // bottom-up must go through review rather than overwrite it.
      const approved = kpiTarget != null && kpiTarget !== 0;
      const wroteTarget = claimsKpi && !approved;

      if (wroteTarget) {
        await BreakdownService.writeAnchorTarget(anchorId, rowsTotal);
      } else if (claimsKpi || short) {
        await TargetWriteService.writeProposalWithConflict(
          { kind: 'kpi', id: view.kpi.id },
          view.kpi.name,
          businessUnitId,
          year,
          month,
          rowsTotal,
          isBottomUp ? 'BottomUp Breakdown' : 'Breakdown'
        );
      }

      await loadRows();
      alert((claimsKpi
        ? wroteTarget
          ? `Breakdown saved — ${rows.length} row(s) totalling ${rowsTotal}, written as ${view.kpi.name}'s target for the month.`
          : `Breakdown saved — ${rows.length} row(s) totalling ${rowsTotal}. ${view.kpi.name} is already approved at ${kpiTarget}, so the total went in as a proposal.`
        : short
          ? `Breakdown saved. Its rows total ${rowsTotal} against a parent target of ${parentTarget}, so the shortfall went in as a proposal and a conflict was raised.`
          : `Breakdown saved — ${rows.length} row(s) reconcile to the parent target of ${parentTarget}.`)
        + componentReport);
    } catch (err: any) {
      alert(`Error saving breakdown: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }, [
    view.kpi, businessUnitId, achievementId, deletedRows, draftRows, isBottomUp, claimsKpi,
    rowsTotal, parentTarget, kpiTarget, rows, year, month, loadRows,
    pendingComponentFill, parentRowId, allKpis
  ]);

  /** Ask first when saving would put a conflict on record. */
  const savePath = useCallback(async () => {
    if (!view.kpi || !businessUnitId) return;

    if (claimsKpi) {
      // These rows are the KPI's own figure, so the only thing they can disagree with is a target
      // approved for the KPI in the meantime.
      const conflicts = await ConflictDetectionService.detect(
        [{
          entityRef: { kind: 'kpi', id: view.kpi.id },
          entityName: view.kpi.name,
          value: rowsTotal,
          month,
          reason: `The ${rows.length} row(s) built here ${isPercentage ? 'average' : 'add up'} to ${rowsTotal}, and ${view.kpi.name} is already approved at a different figure for the month.`
        }],
        { buId: businessUnitId, year, source: 'BottomUp Breakdown' }
      );
      if (!conflicts.length) { runSave(); return; }
      setPendingSave({ confirmLabel: 'Save and propose anyway', run: runSave, conflicts });
      return;
    }

    // Anywhere below level 1 the rows answer to the row above them — never to the KPI, whose
    // target is a different number once a Percentage KPI's levels are averaged.
    if (rowsTotal >= parentTarget - 0.5) { runSave(); return; }
    setPendingSave({
      confirmLabel: 'Save breakdown anyway',
      run: runSave,
      conflicts: [{
        entityName: parentLabel,
        conflictType: CONFLICT_TYPE_BY_SOURCE.Breakdown,
        existingValue: parentTarget,
        proposedValue: rowsTotal,
        reason: `The ${rows.length} row(s) of this ${dimension || 'breakdown'} ${isPercentage ? 'average' : 'add up'} to ${rowsTotal}, ${Math.abs(remaining)} short of the parent target of ${parentTarget}.`
      }]
    });
  }, [
    view.kpi, businessUnitId, claimsKpi, isPercentage, rowsTotal, parentTarget, parentLabel,
    rows.length, dimension, remaining, year, month, runSave
  ]);

  const confirmPendingSave = useCallback(async () => {
    const pending = pendingSave;
    setPendingSave(null);
    if (pending) await pending.run();
  }, [pendingSave]);

  const cancelPendingSave = useCallback(() => setPendingSave(null), []);

  /**
   * Take the targets a financial model worked out for these rows, and record what sits behind them.
   *
   * The row targets go into the draft either way, so the breakdown still saves in one go. What
   * happens to the components depends on the cycle.
   *
   * Bottom-up builds a figure out of nothing, so there is no approved number for the model's work
   * to be reviewed against: each component's per-row values are staged as that component's own
   * breakdown rows and written on Save breakdown, alongside the KPI's own total going onto its
   * achievement record. Nothing goes into pm_proposals.
   *
   * Top-down is splitting a target that already exists, so the components and the resulting KPI are
   * proposals in their own right and are written here, once anything that disagrees with an
   * approved target has been confirmed.
   */
  const applyModelFill = useCallback(async (fill: ModelFillResult) => {
    if (!view.kpi || !businessUnitId) return;

    setDraftRows(prev => prev.map(r => (
      fill.rowTargets[r.id] != null
        ? { ...r, target: fill.rowTargets[r.id], isDirty: !r.isNew }
        : r
    )));

    if (isBottomUp) {
      setPendingComponentFill({
        componentRowValues: fill.componentRowValues,
        components: fill.componentProposals.map(p => ({ kpiId: p.kpiId, kpiName: p.kpiName }))
      });
      return;
    }

    const proposals = [...fill.componentProposals, fill.resultProposal];

    const writeProposals = async () => {
      setSaving(true);
      try {
        const conflicts = await ConflictDetectionService.detect(
          proposals.map(proposal => ({
            entityRef: { kind: 'kpi' as const, id: proposal.kpiId },
            entityName: proposal.kpiName,
            value: proposal.value,
            month
          })),
          { buId: businessUnitId, year, source: 'Financial Modelar' }
        );
        const conflicted = new Map(conflicts.map(c => [c.entityRef.id, c]));

        for (const proposal of proposals) {
          const conflict = conflicted.get(proposal.kpiId);
          const proposalId = await TargetWriteService.writeProposal({
            entityRef: { kind: 'kpi', id: proposal.kpiId },
            entityName: proposal.kpiName,
            buId: businessUnitId,
            year,
            month,
            value: proposal.value,
            modelId: fill.modelId,
            source: 'Financial Modelar',
            hasConflict: !!conflict
          });
          if (conflict) {
            await ConflictService.raiseConflict({
              entityRef: conflict.entityRef,
              entityName: conflict.entityName,
              buId: businessUnitId,
              year,
              month,
              existingValue: conflict.existingTarget,
              proposedValue: conflict.value,
              proposalId,
              source: 'Financial Modelar'
            });
          }
        }

        alert(
          `${proposals.length} proposal(s) saved from the model — ${fill.componentProposals.length} component(s)`
          + ` and ${view.kpi!.name}. The rows are filled in; press Save breakdown to keep them.`
        );
      } catch (err: any) {
        alert(`Error saving the model's proposals: ${err.message}`);
      } finally {
        setSaving(false);
      }
    };

    const conflicts = await ConflictDetectionService.detect(
      proposals.map(proposal => ({
        entityRef: { kind: 'kpi' as const, id: proposal.kpiId },
        entityName: proposal.kpiName,
        value: proposal.value,
        month
      })),
      { buId: businessUnitId, year, source: 'Financial Modelar' }
    );

    if (!conflicts.length) { await writeProposals(); return; }
    setPendingSave({
      confirmLabel: `Save ${proposals.length} proposal${proposals.length === 1 ? '' : 's'}`,
      run: writeProposals,
      conflicts
    });
  }, [view.kpi, businessUnitId, year, month, isBottomUp]);

  /**
   * Preload each row's target from last month — its own value, or its share of last month's
   * parent applied to this month's target. Loaded into the draft, so nothing is written until
   * Save, like the prototype's fill bar.
   */
  const fillFromLastMonth = useCallback(async (mode: 'value' | 'share') => {
    if (!view.kpi || !businessUnitId || !rows.length) return;
    const prevMonth = month > 1 ? month - 1 : 12;
    const prevYear = month > 1 ? year : year - 1;

    setSaving(true);
    try {
      const prevAnchor = await BreakdownService.getAnchor(view.kpi.id, businessUnitId, prevYear, prevMonth);
      if (!prevAnchor.achievementId) {
        alert(`No ${MONTHS[prevMonth - 1]} ${prevYear} record for ${view.kpi.name} in this business unit.`);
        return;
      }
      const prevRows = await BreakdownService.getAllRows(prevAnchor.achievementId, view.kpi.id);
      const prevParent = prevAnchor.target ?? 0;

      const filled = new Map<string, number>();
      rows.forEach(row => {
        // A row is the same one across months when it points at the same record of the same
        // dimension — the label is only a fallback for rows whose lookup was never set.
        const prior = prevRows.find(p => p.dimension === row.dimension && (
          row.optionId ? p.optionId === row.optionId : p.name === row.name
        ));
        if (!prior) return;
        filled.set(row.id, mode === 'value'
          ? prior.target
          : (prevParent ? Math.round((prior.target / prevParent) * parentTarget * 100) / 100 : 0));
      });

      setDraftRows(prev => prev.map(r => (
        filled.has(r.id) ? { ...r, target: filled.get(r.id)!, isDirty: !r.isNew } : r
      )));
      alert(`Loaded last month's ${mode === 'value' ? 'values' : 'shares'} into the draft — review, then Save breakdown.`);
    } catch (err: any) {
      alert(`Error filling from last month: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }, [view.kpi, businessUnitId, year, month, rows, parentTarget]);

  /* ---------- Reverse view: rows at one level, grouped by dimension + name ---------- */
  const reverseGroups = useMemo(() => {
    const groups = new Map<string, { dimension: string; name: string; total: number; parts: string[] }>();
    draftRows.filter(r => r.level === view.reverseLevel).forEach(r => {
      const key = `${r.dimension} · ${r.name}`;
      const group = groups.get(key) ?? { dimension: r.dimension, name: r.name, total: 0, parts: [] };
      group.total += r.target || 0;
      const parent = draftRows.find(p => p.id === r.parentId);
      group.parts.push(`${parent ? parent.name : 'root'}: ${r.target}`);
      groups.set(key, group);
    });
    return Array.from(groups.values());
  }, [draftRows, view.reverseLevel]);

  /** Percentage KPIs are stored 0-100 but behave as fractions inside an equation. */
  const evalContext: EvalContext = useMemo(() => ({
    percentageKpiIds: new Set(allKpis.filter(k => k.aggType === 'Percentage').map(k => k.id)),
    workingDays: null
  }), [allKpis]);

  /** The KPI's own recorded values for the month, shown as reference next to the parent target. */
  const [parentReference, setParentReference] = useState<{ actual: number | null; baseline: number | null }>({
    actual: null, baseline: null
  });
  useEffect(() => {
    if (!view.kpi || !businessUnitId) { setParentReference({ actual: null, baseline: null }); return; }
    let cancelled = false;
    LedgerService.getLedger({ kind: 'kpi', id: view.kpi.id }, businessUnitId, year)
      .then(ledger => {
        if (cancelled) return;
        const entry = ledger.months.find(m => m.month === month);
        setParentReference({ actual: entry?.actual ?? null, baseline: entry?.baseline ?? null });
      })
      .catch(() => { if (!cancelled) setParentReference({ actual: null, baseline: null }); });
    return () => { cancelled = true; };
  }, [view.kpi, businessUnitId, year, month]);

  return {
    view, kpiRows, allKpis, models, evalContext,
    achievementId, kpiTarget, kpiConflicts,
    rows, paths, dimension, parentTarget, parentLabel, level, focusRow,
    rowsTotal, remaining, status, childDimensions, parentReference,
    aggType, isPercentage,
    isDuplicate, duplicateCount: duplicateKeys.size,
    targetsByOption, isDirty,
    reverseGroups,
    openKpi, closeKpi, openRow, back, setPath, toggleReverse, setReverseLevel,
    isBottomUp, claimsKpi,
    newPath, addRow, addRowsBulk, repickRow, setRowTarget, deleteRow,
    splitEvenly, takeRemaining, discardChanges, applyModelFill,
    savePath, fillFromLastMonth,
    pendingSave, confirmPendingSave, cancelPendingSave,
    loading, saving, error
  };
}
