import React from 'react';
import { useTopDownMonthly } from '../hooks/useTopDownMonthly';
import { useBusinessUnits } from '@shared/hooks/useBusinessUnits';
import { ContextBar } from '../components/CalendarAdjustment/ContextBar';
import { SearchableSelect } from '@shared/components/SearchableSelect';
import { ConflictBadge } from '../components/ConflictBadge';
import { ConflictConfirmDialog } from '@shared/components/ConflictConfirmDialog/ConflictConfirmDialog';
import { ModelService } from '@infrastructure/financialImpact/ModelService';
import { equationParts } from '@infrastructure/financialImpact/ModelEvalService';
import { EquationDisplay } from '@shared/components/EquationDisplay';
import { MONTHS } from '../models/types';

/** A recorded figure, or an em dash when the month has nothing for it. */
const fmtOrDash = (value: number | null | undefined) =>
  value == null ? '—' : value.toLocaleString(undefined, { maximumFractionDigits: 2 });

export const TopDownMonthlyPage: React.FC = () => {
  const {
    businessUnitId, setBusinessUnitId,
    departmentId, setDepartmentId,
    functionId, setFunctionId,
    year, setYear,
    month, setMonth,
    entities,
    kpiScopeReady,
    selectedEntity, setSelectedEntity,
    availableModels,
    selectedModel, selectedModelId, setSelectedModelId,
    setTestValues,
    lockedFactorId, factorBasis, factorBasisLabel,
    componentValue, componentPercent, setComponentPercent,
    componentTargets, componentRecorded, componentFigures, isolatedEffect,
    resultOverride, setResultOverride,
    computedResult, finalResult,
    workingDays,
    contributingKpis, suggestedOrgTarget,
    orgCalcDraft, setOrgCalcDraft,
    existingEntityTarget, selectedEntityFigures,
    resultEntity, resultExistingTarget,
    entityConflicts, resultConflicts,
    resultWouldConflict, orgTargetWouldConflict,
    rollUpRows, rollUpLoading,
    confirmOrgTarget, saveModelResult,
    pendingSave, confirmPendingSave, cancelPendingSave,
    loading, saving, error
  } = useTopDownMonthly('', new Date().getFullYear());

  const { businessUnits } = useBusinessUnits();
  const selectedBu = businessUnits.find(bu => bu.id === businessUnitId);
  const businessUnitLabel = selectedBu ? [selectedBu.name, selectedBu.region].filter(Boolean).join(' — ') : '—';

  const isOutputOrOutcome = selectedEntity && (selectedEntity.kind === 'output' || selectedEntity.kind === 'outcome');
  const monthName = MONTHS[month - 1];

  /** Which of the three kinds the entity list is showing. */
  const [entityKind, setEntityKind] = React.useState<'outcome' | 'output' | 'kpi'>('kpi');
  const kindEntities = entities.filter(e => e.kind === entityKind);

  /** The KPI picker stays empty until a Department and a Function are both chosen. */
  const entityPlaceholder = entityKind !== 'kpi'
    ? 'Select an org entity…'
    : !kpiScopeReady
      ? 'Pick a Department and Function first…'
      : kindEntities.length
        ? 'Select a KPI…'
        : 'No KPI for this Department and Function';

  const handleTestValueChange = (kpiId: string, value: string) => {
    const num = parseFloat(value);
    setTestValues(prev => ({ ...prev, [kpiId]: isNaN(num) ? 0 : num }));
  };

  return (
    <div className="layout-col">
      <ContextBar
        businessUnitId={businessUnitId}
        setBusinessUnitId={setBusinessUnitId}
        departmentId={departmentId}
        setDepartmentId={setDepartmentId}
        functionId={functionId}
        setFunctionId={setFunctionId}
        year={year}
        setYear={setYear}
        month={month}
        setMonth={setMonth}
      />

      {error && <div className="alert alert-err">{error}</div>}

      <div className="alert alert-info">
        Method 2 — monthly. Pick an entity. For an <b>Org Output/Outcome</b>, the target auto-calculates as the sum of its contributing department KPI targets (editable, then confirm). For a KPI, build it on a model.
      </div>

      <div className="card">
        <div className="card-head between">
          <div>
            <h3>Monthly target — {monthName} {year} · {businessUnitLabel}</h3>
            {selectedEntity && (
              <div className="sub stat-inline">
                {selectedEntity.name} ({selectedEntity.kind})
                <ConflictBadge conflicts={entityConflicts} />
              </div>
            )}
            {selectedEntity && selectedEntityFigures && (
              selectedEntityFigures.hasRecord ? (
                <div className="sub">
                  In {businessUnitLabel} for {monthName} {year} — historical {fmtOrDash(selectedEntityFigures.historical)}
                  {' · '}baseline {fmtOrDash(selectedEntityFigures.baseline)}
                  {' · '}actual {fmtOrDash(selectedEntityFigures.actual)}
                  {' · '}target {fmtOrDash(selectedEntityFigures.target)}
                </div>
              ) : (
                <div className="sub warn-text">
                  ⚠ Nothing recorded for {selectedEntity.name} in {businessUnitLabel} for {monthName} {year}.
                </div>
              )
            )}
          </div>
          <div className="btn-row">
            <select
              value={entityKind}
              onChange={e => {
                setEntityKind(e.target.value as 'outcome' | 'output' | 'kpi');
                setSelectedEntity(null);
              }}
            >
              <option value="outcome">Org Outcome</option>
              <option value="output">Org Output</option>
              <option value="kpi">KPI</option>
            </select>
            <SearchableSelect
              options={kindEntities.map(ent => ({ value: ent.id, label: ent.name, hint: ent.type }))}
              value={selectedEntity?.kind === entityKind ? selectedEntity.id : ''}
              onChange={id => setSelectedEntity(kindEntities.find(en => en.id === id) || null)}
              placeholder={entityPlaceholder}
              disabled={entityKind === 'kpi' && !kpiScopeReady}
              style={{ maxWidth: '280px' }}
            />
            <SearchableSelect
              options={availableModels.map(m => ({ value: m.id, label: m.name, hint: m.status }))}
              value={selectedModelId}
              onChange={setSelectedModelId}
              placeholder={availableModels.length ? 'Select a model…' : 'No model includes this entity'}
              disabled={availableModels.length === 0}
              style={{ maxWidth: '280px' }}
            />
          </div>
        </div>
        <div className="card-body">
          <div className="sub">Or build it from a model below.</div>
        </div>
      </div>

      {isOutputOrOutcome && (
        <div className="card">
          <div className="card-head">
            <h3>Auto-calc from contributing department KPIs</h3>
            <div className="sub">{selectedEntity.name} · {monthName} {year} · {businessUnitLabel} — sum of contributors</div>
          </div>
          <div className="card-body">
            {contributingKpis.length === 0 && (
              <div className="alert alert-warn">
                No department KPI is linked to {selectedEntity.name} in {businessUnitLabel}. Add contributions on Org Linkage.
              </div>
            )}
            <div className="resultbox" style={{ marginTop: '12px' }}>
              <div>
                <div className="sub">Confirm target (editable)</div>
                <input
                  type="number"
                  value={orgCalcDraft ?? suggestedOrgTarget}
                  onChange={(e) => setOrgCalcDraft(parseFloat(e.target.value))}
                  style={{ width: '150px', fontSize: '18px' }}
                />
                <div className="sub stat-inline" style={{ marginTop: '4px' }}>
                  current target: {existingEntityTarget != null
                    ? existingEntityTarget.toLocaleString(undefined, { maximumFractionDigits: 0 })
                    : 'not set'}
                  <ConflictBadge conflicts={entityConflicts} willConflict={orgTargetWouldConflict} />
                </div>
                {orgTargetWouldConflict && (
                  <div className="sub warn-text" style={{ marginTop: '4px' }}>
                    ⚠ Lower than the approved target — confirming saves it as a proposal and raises a conflict.
                  </div>
                )}
              </div>
              <div className="resultset">
                <button className="btn btn-sm" disabled={loading || saving} onClick={() => setOrgCalcDraft(suggestedOrgTarget)}>
                  Reset to suggested ({suggestedOrgTarget.toLocaleString(undefined, { maximumFractionDigits: 0 })})
                </button>
                <button className="btn btn-primary btn-sm" disabled={loading || saving} onClick={confirmOrgTarget}>Confirm as target</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedEntity && (
        <div className="card">
          <div className="card-head"><h3>Optional — build on a model instead</h3></div>
          <div className="card-body">
            {!selectedModel ? (
              <div className="empty-state" style={{ padding: '24px' }}>
                <p className="muted">No model includes {selectedEntity.name}. Pick another entity, or add it to a model's components in the Financial Modeler.</p>
              </div>
            ) : (
              <>
                <EquationDisplay parts={equationParts(selectedModel)} style={{ margin: '0 0 12px' }} />
                {selectedModel.useWorkingDays && (
                  <div className="muted" style={{ fontSize: 12, margin: '-8px 0 12px' }}>× working days ({workingDays ?? 'not set'})</div>
                )}
                {lockedFactorId && (
                  factorBasis ? (
                    <div className="sub" style={{ margin: '-4px 0 12px' }}>
                      {resultEntity?.name} is both a term and the result of this model. Its factor row
                      is fixed at <b>{fmtOrDash(factorBasis)}</b> — its own {factorBasisLabel} for{' '}
                      {monthName} {year} — and the other components can be entered as a <b>% of it</b>.
                      Typing a percentage fills the New value and typing a value shows the percentage.
                      Only the other components and {resultEntity?.name} as the result are proposed;
                      the factor figure itself is not.
                    </div>
                  ) : (
                    <div className="sub warn-text" style={{ margin: '-4px 0 12px' }}>
                      ⚠ {resultEntity?.name} has no baseline or actual for {monthName} {year} in{' '}
                      {businessUnitLabel}, so its factor row is 0 and there is nothing to take a
                      percentage of — enter the other components' values directly.
                    </div>
                  )
                )}
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Component</th>
                      <th className="tright">Historical</th>
                      <th className="tright">Baseline</th>
                      <th className="tright">Actual</th>
                      <th className="tright">Current {monthName} target</th>
                      {lockedFactorId && (
                        <th
                          className="tright"
                          title={`A share of ${resultEntity?.name}'s own ${factorBasisLabel ?? 'figure'} for ${monthName} ${year}`}
                        >
                          % of {resultEntity?.name}
                        </th>
                      )}
                      <th className="tright">New</th>
                      <th className="tright">Effect on result (this change alone)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ModelService.componentKpiIds(selectedModel).map(kpiId => {
                      const label = selectedModel.kind === 'Relation'
                        ? selectedModel.factors.find(f => f.kpiId === kpiId)?.kpiName
                        : selectedModel.terms.find(t => t.kpiId === kpiId)?.kpiName;
                      const isLockedFactor = kpiId === lockedFactorId;
                      const currentVal = componentValue(kpiId);
                      const effect = isolatedEffect(kpiId);
                      return (
                        <tr key={kpiId}>
                          <td>
                            {label || kpiId}
                            {isLockedFactor && (
                              <div className="sub">factor — not proposed</div>
                            )}
                          </td>
                          <td className="tright mono muted">{fmtOrDash(componentFigures[kpiId]?.historical)}</td>
                          <td className="tright mono muted">{fmtOrDash(componentFigures[kpiId]?.baseline)}</td>
                          <td className="tright mono muted">{fmtOrDash(componentFigures[kpiId]?.actual)}</td>
                          <td className="tright mono muted">
                            {componentTargets[kpiId] != null ? (
                              componentTargets[kpiId]!.toLocaleString(undefined, { maximumFractionDigits: 2 })
                            ) : (
                              <span title={componentRecorded[kpiId]
                                ? `Recorded for ${monthName} ${year} in ${businessUnitLabel}, but pm_target is empty.`
                                : `No achievement row for ${monthName} ${year} in ${businessUnitLabel}.`}>
                                —
                              </span>
                            )}
                          </td>
                          {lockedFactorId && (
                            <td className="tright">
                              {isLockedFactor ? (
                                <span className="muted" title="This is the figure the other components' percentages are taken from">—</span>
                              ) : (
                                <input
                                  type="number"
                                  step="0.01"
                                  disabled={!factorBasis}
                                  title={factorBasis
                                    ? `${fmtOrDash(factorBasis)} is ${resultEntity?.name}'s ${factorBasisLabel} for ${monthName} ${year} — the figure the percentage is taken from`
                                    : `${resultEntity?.name} has no baseline or actual for ${monthName} ${year}, so there is nothing to take a percentage of`}
                                  value={componentPercent(kpiId) ?? ''}
                                  onChange={(e) => setComponentPercent(kpiId, parseFloat(e.target.value) || 0)}
                                  style={{ width: '72px' }}
                                />
                              )}
                            </td>
                          )}
                          <td className="tright">
                            <input
                              type="number"
                              step="0.01"
                              readOnly={isLockedFactor}
                              title={isLockedFactor
                                ? `${resultEntity?.name}'s own ${factorBasisLabel ?? 'figure'} for ${monthName} ${year} — not editable, since it's what the other components are a share of`
                                : undefined}
                              value={Math.round(currentVal * 100) / 100}
                              onChange={(e) => handleTestValueChange(kpiId, e.target.value)}
                              style={{ width: '96px', ...(isLockedFactor ? { opacity: 0.7 } : {}) }}
                            />
                          </td>
                          <td className="tright mono" style={{ fontSize: '11px' }}>
                            {Math.abs(effect) < 0.05 ? '—' : (
                              <span style={{ color: effect > 0 ? 'var(--success)' : 'var(--danger)' }}>
                                {effect.toLocaleString(undefined, { maximumFractionDigits: 2, signDisplay: 'always' })}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                <div className="resultbox" style={{ marginTop: '12px' }}>
                  <div>
                    <div className="sub stat-inline">
                      Combined result — {resultEntity?.name || selectedModel.name}
                      <ConflictBadge conflicts={resultConflicts} willConflict={resultWouldConflict} />
                    </div>
                    <div className="stat">{computedResult.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
                    <div className="sub">
                      its {monthName} target: {resultExistingTarget != null
                        ? resultExistingTarget.toLocaleString(undefined, { maximumFractionDigits: 2 })
                        : 'not set'}
                    </div>
                  </div>
                  <div className="resultset" style={{ flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                    <div className="resultset">
                      <label>Set result</label>
                      <input
                        type="number"
                        value={resultOverride ?? Math.round(computedResult * 100) / 100}
                        onChange={(e) => setResultOverride(parseFloat(e.target.value))}
                        disabled={selectedModel.kind === 'Relation'}
                        title={selectedModel.kind === 'Relation' ? 'Relation models derive the result from their factors' : undefined}
                        style={{ width: '110px' }}
                      />
                    </div>
                    {selectedModel.kind !== 'Relation' && resultOverride !== null && (
                      <div className="sub">will save &amp; roll up: {finalResult.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
                    )}
                  </div>
                </div>

                {selectedModel.resultKind !== 'kpi' && (
                  <div className="alert alert-info" style={{ marginTop: '10px' }}>
                    Result is the {selectedModel.resultKind === 'outcome' ? 'Org Outcome' : 'Org Output'} “{selectedModel.resultKpiName || selectedModel.name}” directly.
                  </div>
                )}

                {selectedEntity.kind !== 'outcome' && (
                  <div className="card" style={{ margin: '10px 0 0' }}>
                    <div className="card-head"><h3>How this reflects up to the org output / outcome</h3></div>
                    <div className="card-body" style={{ padding: 0, overflow: 'auto' }}>
                      {rollUpLoading ? (
                        <div className="muted" style={{ padding: '12px' }}>Loading roll-up data...</div>
                      ) : rollUpRows.length === 0 ? (
                        <div className="muted" style={{ padding: '12px' }}>
                          {selectedEntity.name} has no onward Org Output/Outcome link for {businessUnitLabel}.
                        </div>
                      ) : (
                        <table className="data-table">
                          <thead>
                            <tr>
                              <th>Level</th>
                              <th>Entity</th>
                              <th>Link</th>
                              <th className="tright">Current</th>
                              <th className="tright">Projected</th>
                              <th className="tright">Existing target</th>
                              <th></th>
                            </tr>
                          </thead>
                          <tbody>
                            {rollUpRows.map((row, i) => (
                              <tr key={`${row.level}-${row.entityId}-${i}`}>
                                <td>{row.level}</td>
                                <td><b>{row.entityName}</b></td>
                                <td className="muted" style={{ fontSize: '11px' }}>{row.link}</td>
                                <td className="tright mono">
                                  {row.current.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 })}
                                </td>
                                <td className="tright mono">
                                  <span style={{ color: row.projected > row.current ? 'var(--success)' : row.projected < row.current ? 'var(--danger)' : undefined }}>
                                    {row.projected > row.current ? '▲ ' : row.projected < row.current ? '▼ ' : ''}
                                    {row.projected.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </span>
                                </td>
                                <td className="tright mono">
                                  {row.existingTarget !== null
                                    ? row.existingTarget.toLocaleString(undefined, { maximumFractionDigits: 0 })
                                    : '—'}
                                </td>
                                <td>{row.hasConflict && <span className="chip-flag chip-over">conflict</span>}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                    {rollUpRows.some(r => r.hasConflict) && (
                      <div className="card-foot">
                        <div className="sub warn-text">⚠ Projected roll-up disagrees with an existing org target — saving will raise a conflict for review.</div>
                      </div>
                    )}
                  </div>
                )}

                {(resultWouldConflict || resultConflicts.length > 0) && (
                  <div className="alert alert-warn" style={{ marginTop: '10px', marginBottom: 0 }}>
                    {resultWouldConflict
                      ? <>⚠ {finalResult.toLocaleString(undefined, { maximumFractionDigits: 2 })} is lower than the approved {monthName} target
                        ({resultExistingTarget?.toLocaleString(undefined, { maximumFractionDigits: 2 })}) for <b>{resultEntity?.name}</b> —
                        saving flags the proposal as a conflict and records it for review.</>
                      : <>⚠ <b>{resultEntity?.name}</b> already has {resultConflicts.length > 1 ? `${resultConflicts.length} conflicts` : 'a conflict'} awaiting review for {monthName} {year}.</>}
                  </div>
                )}

                <div className="btn-row" style={{ marginTop: '12px' }}>
                  <button className="btn btn-primary btn-sm" disabled={loading || saving} onClick={saveModelResult}>Save as proposal</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
      <ConflictConfirmDialog
        open={!!pendingSave}
        confirmLabel={pendingSave?.confirmLabel ?? 'Save'}
        conflicts={pendingSave?.conflicts ?? []}
        saving={saving}
        onCancel={cancelPendingSave}
        onConfirm={confirmPendingSave}
      />
    </div>
  );
};
