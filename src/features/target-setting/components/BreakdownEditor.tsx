import React, { useState } from 'react';
import { useBreakdown, DIMENSION_OPTIONS } from '../hooks/useBreakdown';
import { DimensionPicker } from './DimensionPicker';
import { BulkDimensionPanel } from './BulkDimensionPanel';
import { ConflictConfirmDialog } from '@shared/components/ConflictConfirmDialog/ConflictConfirmDialog';
import { ConflictBadge } from './ConflictBadge';
import { BreakdownModelDialog } from './BreakdownModelDialog';
import { MONTHS } from '../models/types';

const fmt = (value: number | null | undefined) =>
  value == null ? '—' : value.toLocaleString(undefined, { maximumFractionDigits: 2 });

interface BreakdownEditorProps {
  /** Everything useBreakdown returns, from whichever screen is hosting the editor. */
  breakdown: ReturnType<typeof useBreakdown>;
  businessUnitId: string;
  businessUnitLabel: string;
  year: number;
  month: number;
}

/**
 * BreakdownEditor — the recursive breakdown itself, without the screen around it.
 *
 * Both cycles use it: the Breakdown tab splits an approved target top-down, and the Bottom-up tab
 * builds rows for a KPI that has no target and writes what they come to as its target. Which of
 * the two it is comes from the hook, so the editor only has to render it.
 */
export const BreakdownEditor: React.FC<BreakdownEditorProps> = ({
  breakdown, businessUnitId, businessUnitLabel, year, month
}) => {
  const {
    view, allKpis, models, evalContext,
    achievementId, kpiTarget, kpiConflicts,
    rows, paths, dimension, parentTarget, parentLabel, level, focusRow,
    rowsTotal, remaining, status, childDimensions, parentReference,
    isDuplicate, duplicateCount, aggType, isPercentage,
    targetsByOption, isDirty,
    reverseGroups,
    openRow, back, setPath, toggleReverse, setReverseLevel,
    newPath, addRow, addRowsBulk, repickRow, setRowTarget, deleteRow,
    splitEvenly, takeRemaining, discardChanges, applyModelFill,
    savePath, fillFromLastMonth,
    pendingSave, confirmPendingSave, cancelPendingSave,
    isBottomUp, claimsKpi, saving
  } = breakdown;

  /**
   * Which dimension a new breakdown path would use. Deliberately empty to start: preselecting the
   * first of the list made Account look like the dimension every breakdown was already being built
   * on, on both the Bottom-up and Breakdown screens. The dimension has to be chosen.
   */
  const [newDimension, setNewDimension] = useState<string>('');
  const [bulkMode, setBulkMode] = useState<'new-path' | 'add-rows' | null>(null);
  const [modelFillOpen, setModelFillOpen] = useState(false);

  const monthName = MONTHS[month - 1];
  if (!view.kpi) return null;

  /**
   * Whether the rows' total will be written as the KPI's target rather than proposed. Only a
   * level-1 bottom-up breakdown speaks for the KPI (`claimsKpi`), and only when nothing has been
   * approved for it yet — otherwise review has to settle it. Drill into a row and the rows answer
   * to that row instead, which is the top-down story.
   */
  const bottomUpWrites = claimsKpi && !(kpiTarget != null && kpiTarget !== 0);

    const statusColor = status === 'match' ? 'var(--success)' : status === 'short' ? 'var(--danger)' : 'var(--warning)';
    // Where rows added under this parent will sit — 'OPD Volume > Cash'.
    const pathPreview = [view.kpi.name, ...(focusRow ? [focusRow.name] : [])].join(' > ');
  return (
    <>

        <div className="between" style={{ marginBottom: '10px' }}>
          <div>
            <button className="btn btn-sm" onClick={back}>← Back</button>
            <span style={{ marginLeft: '10px', fontWeight: 700 }}>{parentLabel}</span>
            <span className="sub"> · parent target {fmt(parentTarget)}</span>
            <ConflictBadge conflicts={kpiConflicts} willConflict={status === 'short'} />
          </div>
          <div className="btn-row">
            <span className="eq-lbl">View path</span>
            {paths.length > 0 ? (
              <select value={view.dimension || ''} onChange={e => setPath(e.target.value)}>
                {paths.map(p => <option key={p.dimension} value={p.dimension}>{p.dimension}</option>)}
              </select>
            ) : (
              <span className="muted">no breakdown yet</span>
            )}
            <button className="btn btn-xs" onClick={toggleReverse}>
              {view.reverse ? '● level view' : '○ reverse view'}
            </button>
            <span
              className="pill"
              title={claimsKpi
                ? bottomUpWrites
                  ? "Building the rows first; what they come to becomes the KPI's target"
                  : 'Building the rows first and proposing what they come to'
                : `Splitting ${focusRow ? `${focusRow.name}'s` : 'an approved'} target, with the rows adding up to it`}
            >
              {isBottomUp ? 'bottom-up' : 'top-down'}
            </span>
          </div>
        </div>

        {duplicateCount > 0 && (
          <div className="alert alert-warn">
            {duplicateCount} value{duplicateCount === 1 ? ' is' : 's are'} listed twice in this same
            breakdown. Each value can appear once per breakdown — the same one under a different
            parent is a separate path and is fine.
          </div>
        )}

        {isDirty && (
          <div className="alert alert-warn stat-inline">
            <span style={{ flex: 1 }}>
              Unsaved changes — nothing is written to Dataverse until you press <b>Save breakdown</b>.
            </span>
            <button className="btn btn-xs" disabled={saving} onClick={discardChanges}>discard</button>
          </div>
        )}

        {claimsKpi ? (
          <div className="alert alert-info">
            <b>Bottom-up breakdown.</b> Build the rows first — there's no approved target to split.
            What they {isPercentage ? 'average' : 'add up'} to {bottomUpWrites
              ? <>is saved as {view.kpi.name}'s target for {monthName} {year}</>
              : <>is saved as a proposal for {view.kpi.name}, which is already targeted at {fmt(kpiTarget ?? 0)}</>}
            {!achievementId && ", and the month's achievement record is created to hold them"}.
          </div>
        ) : isBottomUp && focusRow ? (
          <div className="alert alert-info">
            Breaking <b>{focusRow.name}</b> down further. These rows {isPercentage ? 'average' : 'add up'} to
            {' '}{focusRow.name}'s own target of {fmt(parentTarget)} — not to {view.kpi.name}'s
            {kpiTarget != null && kpiTarget !== 0 && <> target of {fmt(kpiTarget)}</>}, which is a level up.
          </div>
        ) : !achievementId && (
          <div className="alert alert-warn">
            {view.kpi.name} has no achievement record for {monthName} {year} in {businessUnitLabel}, so there's no
            total to break down. Set its monthly target first, or switch to <b>bottom-up breakdown</b>.
          </div>
        )}

        <div className="card">
          <div className="card-body">
            <div className="link-builder" style={{ marginBottom: '10px' }}>
              Break this {level === 1 ? 'KPI target' : 'row'} down by{' '}
              <select
                value={newDimension}
                onChange={e => { setNewDimension(e.target.value); setBulkMode(null); }}
              >
                <option value="">choose a dimension…</option>
                {DIMENSION_OPTIONS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
              <DimensionPicker
                dimension={newDimension}
                disabled={(!achievementId && !isBottomUp) || saving || !newDimension}
                label="+ one at a time"
                onPick={option => newPath(newDimension, option)}
              />
              <button
                className="btn btn-sm"
                disabled={(!achievementId && !isBottomUp) || saving || !newDimension || bulkMode === 'new-path'}
                title={newDimension
                  ? `List every ${newDimension} and set all their targets at once`
                  : 'Choose a dimension first'}
                onClick={() => setBulkMode('new-path')}
              >
                {newDimension ? `+ all ${newDimension}s at once…` : '+ all at once…'}
              </button>
            </div>

            {bulkMode === 'new-path' && (
              <BulkDimensionPanel
                dimension={newDimension}
                existingTargets={{}}
                parentTarget={parentTarget}
                saving={saving}
                onCancel={() => setBulkMode(null)}
                onSave={async entries => {
                  addRowsBulk(entries, newDimension);
                  setBulkMode(null);
                }}
              />
            )}

            {view.dimension && (
              <div className="fillbar">
                Fill this breakdown from:
                <button className="btn btn-xs" disabled={saving} onClick={() => setModelFillOpen(true)}>
                  a financial model…
                </button>
                <button className="btn btn-xs" disabled={saving} onClick={() => fillFromLastMonth('value')}>
                  last-month values
                </button>
                <button className="btn btn-xs" disabled={saving} onClick={() => fillFromLastMonth('share')}>
                  last-month share
                </button>
              </div>
            )}

            {view.dimension ? (
              <>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>{dimension}</th>
                      <th>Path</th>
                      <th className="tright">Hist</th>
                      <th className="tright">Base</th>
                      <th className="tright">Actual</th>
                      <th className="tright">Target</th>
                      <th className="tright">% of parent</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="muted" style={{ padding: '12px' }}>
                          No rows in this breakdown yet — add one below or fill from last month.
                        </td>
                      </tr>
                    ) : rows.map(r => {
                      const kids = childDimensions(r.id);
                      return (
                        <tr key={r.id}>
                          <td>
                            <DimensionPicker
                              dimension={r.dimension}
                              value={r.name}
                              disabled={saving}
                              label="change"
                              onPick={option => repickRow(r.id, option)}
                            />
                            {kids.length > 0 && (
                              <span className="badge st-approved" title="further broken down"> ▸ {kids.join(', ')}</span>
                            )}
                            {isDuplicate(r) && (
                              <span
                                className="chip-flag chip-over"
                                title={`${r.name} is listed twice in this same breakdown. Remove one of them — the same ${r.dimension.toLowerCase()} under a different parent is fine.`}
                              >
                                duplicate
                              </span>
                            )}
                          </td>
                          <td className="muted" style={{ fontSize: '11px' }}>
                            {r.pathLabel || <span title="Written when the row is saved">{pathPreview}</span>}
                          </td>
                          <td className="tright mono muted">{fmt(r.historical)}</td>
                          <td className="tright mono muted">{fmt(r.baseline)}</td>
                          <td className="tright mono muted">{fmt(r.actual)}</td>
                          <td className="tright">
                            <input
                              // Uncontrolled so a figure can be typed without the field fighting
                              // every keystroke — but defaultValue is only read when the input
                              // mounts, so keying it on the target remounts the field whenever the
                              // row's figure is set from anywhere else. Without that, filling from
                              // a financial model (or last month, or split evenly) updates the
                              // draft and the total while every row still shows its old number.
                              key={`${r.id}-${r.target}`}
                              type="number"
                              defaultValue={r.target}
                              onBlur={e => {
                                const value = parseFloat(e.target.value) || 0;
                                if (value !== r.target) setRowTarget(r.id, value);
                              }}
                              style={{ width: '96px' }}
                            />
                          </td>
                          <td className="tright mono">
                            {!parentTarget ? '—'
                              : isPercentage ? `${fmt(r.target)}%`
                                : `${((r.target / parentTarget) * 100).toFixed(0)}%`}
                          </td>
                          <td className="tright">
                            <button className="btn btn-xs" title="break this down further" onClick={() => openRow(r.id)}>
                              break ▸
                            </button>
                            <button
                              className="btn btn-xs"
                              disabled={saving || remaining === 0}
                              title={`Add the unallocated ${fmt(remaining)} to this row`}
                              onClick={() => takeRemaining(r.id)}
                            >
                              +rest
                            </button>
                            <button className="btn btn-xs" disabled={saving} onClick={() => deleteRow(r.id)}>✕</button>
                          </td>
                        </tr>
                      );
                    })}
                    <tr className="row-total">
                      <td>{isPercentage ? 'Average' : 'Sum'} of {dimension}</td>
                      <td colSpan={4}></td>
                      <td className="tright mono" style={{ color: statusColor }}>{fmt(rowsTotal)}</td>
                      <td className="tright mono">
                        {parentTarget ? `${((rowsTotal / parentTarget) * 100).toFixed(0)}%` : '—'}
                      </td>
                      <td>
                        {status === 'short'
                          ? <span className="chip-flag chip-over">conflict</span>
                          : status === 'match'
                            ? <span className="badge st-approved">ok</span>
                            : <span className="chip-flag chip-warn">exceeds</span>}
                      </td>
                    </tr>
                  </tbody>
                </table>

                <div className="sub" style={{ marginTop: '8px' }}>
                  {claimsKpi
                    ? `These rows ${isPercentage ? 'average' : 'add up'} to ${fmt(rowsTotal)}, which is what will be ${bottomUpWrites ? 'saved as' : 'proposed for'} ${view.kpi.name}${bottomUpWrites ? "'s target" : ''}.`
                    : remaining === 0
                    ? `The rows ${isPercentage ? 'average to' : 'add up to'} the parent target of ${fmt(parentTarget)} exactly.`
                    : remaining > 0
                      ? isPercentage
                        ? `These rows average to ${fmt(rowsTotal)}, ${fmt(remaining)} under the parent target of ${fmt(parentTarget)}.`
                        : `${fmt(remaining)} of the parent target is still unallocated.`
                      : `The rows exceed the parent target of ${fmt(parentTarget)} by ${fmt(Math.abs(remaining))}.`}
                </div>

                <div className="btn-row" style={{ marginTop: '10px', alignItems: 'flex-start' }}>
                  <DimensionPicker
                    dimension={dimension}
                    disabled={saving}
                    label={`+ one ${dimension} row`}
                    onPick={addRow}
                  />
                  <button
                    className="btn btn-sm"
                    disabled={saving || bulkMode === 'add-rows'}
                    title={`List every ${dimension} and set all their targets at once`}
                    onClick={() => setBulkMode('add-rows')}
                  >
                    + all {dimension}s at once…
                  </button>
                  <button
                    className="btn btn-sm"
                    disabled={saving || rows.length === 0}
                    title="Share the parent target equally between these rows"
                    onClick={splitEvenly}
                  >
                    {isPercentage
                      ? `set all ${rows.length} row${rows.length === 1 ? '' : 's'} to ${fmt(parentTarget)}`
                      : `split parent across ${rows.length} row${rows.length === 1 ? '' : 's'}`}
                  </button>
                  <button className="btn btn-primary btn-sm" disabled={saving || !isDirty} onClick={savePath}>
                    Save breakdown
                  </button>
                  <span className="sub" style={{ alignSelf: 'center' }}>
                    {claimsKpi
                      ? bottomUpWrites
                        ? "The rows' total becomes the KPI's target; nothing has to reconcile to a parent."
                        : "The rows' total is proposed for the KPI, which is already targeted; nothing has to reconcile to a parent."
                      : isPercentage
                        ? `Rows must average to ${focusRow ? `${focusRow.name}'s` : 'the parent'} target of ${fmt(parentTarget)}; a lower average is saved as a proposal and raises a conflict.`
                        : `Rows must add up to ${focusRow ? `${focusRow.name}'s` : 'the parent'} target of ${fmt(parentTarget)}; a short total is saved as a proposal and raises a conflict.`}
                  </span>
                </div>

                {bulkMode === 'add-rows' && (
                  <BulkDimensionPanel
                    dimension={dimension}
                    existingTargets={targetsByOption}
                    parentTarget={parentTarget}
                    aggType={aggType}
                    saving={saving}
                    onCancel={() => setBulkMode(null)}
                    onSave={async entries => {
                      addRowsBulk(entries);
                      setBulkMode(null);
                    }}
                  />
                )}

                <div className="sub" style={{ marginTop: '8px' }}>
                  {view.kpi.name} · {monthName} {year} · {businessUnitLabel} — actual {fmt(parentReference.actual)},
                  baseline {fmt(parentReference.baseline)}, KPI target {fmt(kpiTarget)}
                </div>
              </>
            ) : (
              <div className="muted" style={{ padding: '12px' }}>
                Pick or add a breakdown dimension to begin.
              </div>
            )}
          </div>
        </div>

        {view.reverse && (
          <div className="card" style={{ borderColor: 'var(--primary)' }}>
            <div className="card-head between">
              <h3>Reverse view — aggregate by dimension at a level</h3>
              <select value={view.reverseLevel} onChange={e => setReverseLevel(+e.target.value)}>
                {[2, 3, 4].map(l => <option key={l} value={l}>Level {l}</option>)}
              </select>
            </div>
            <div className="card-body" style={{ padding: 0, overflow: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Value</th>
                    <th>Dimension</th>
                    <th className="tright">Summed target (this level, all paths)</th>
                    <th>From each parent</th>
                  </tr>
                </thead>
                <tbody>
                  {reverseGroups.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="muted" style={{ padding: '12px' }}>
                        No rows at this level yet. Break something down to level {view.reverseLevel} first.
                      </td>
                    </tr>
                  ) : reverseGroups.map(g => (
                    <tr key={`${g.dimension}-${g.name}`}>
                      <td>{g.name}</td>
                      <td className="muted">{g.dimension}</td>
                      <td className="tright mono"><b>{fmt(g.total)}</b></td>
                      <td className="muted" style={{ fontSize: '11px' }}>{g.parts.join('  ·  ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="card-foot">
              <span className="sub">
                Sums only rows at level {view.reverseLevel}, never mixing them with level-1 totals.
              </span>
            </div>
          </div>
        )}

        {modelFillOpen && (
          <BreakdownModelDialog
            kpi={view.kpi}
            rows={rows}
            dimension={dimension}
            models={models}
            entities={allKpis}
            businessUnitId={businessUnitId}
            businessUnitLabel={businessUnitLabel}
            year={year}
            month={month}
            evalContext={evalContext}
            isBottomUp={isBottomUp}
            saving={saving}
            onClose={() => setModelFillOpen(false)}
            onApply={async fill => {
              setModelFillOpen(false);
              await applyModelFill(fill);
            }}
          />
        )}

        <ConflictConfirmDialog
          open={!!pendingSave}
          confirmLabel={pendingSave?.confirmLabel ?? 'Save'}
          conflicts={pendingSave?.conflicts ?? []}
          saving={saving}
          onCancel={cancelPendingSave}
          onConfirm={confirmPendingSave}
        />
    </>
  );
};
