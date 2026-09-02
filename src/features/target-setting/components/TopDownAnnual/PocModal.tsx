import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BaseEntity } from '../../services/EntityService';
import { FinancialModel, ModelService } from '@infrastructure/financialImpact/ModelService';
import { EvalContext } from '@infrastructure/financialImpact/ModelEvalService';
import { LedgerService } from '@infrastructure/financialImpact/LedgerService';
import { PocTactic, PocTacticService } from '../../services/PocTacticService';
import { PocImpactService, PocImpactPreview } from '@infrastructure/financialImpact/PocImpactService';
import { ContributionService } from '../../services/ContributionService';
import { MONTHS } from '../../models/types';
import { SearchableSelect } from '@shared/components/SearchableSelect';
import { CONFLICT_TYPE_BY_SOURCE } from '@infrastructure/financialImpact/TargetSource';
import { ConflictConfirmDialog, PendingConflict } from '@shared/components/ConflictConfirmDialog/ConflictConfirmDialog';

interface PocModalProps {
  /** The entity the annual screen is targeting — a KPI, Org Output or Org Outcome. */
  entity: BaseEntity;
  /** Every KPI, for names and for the department/function filters. */
  entities: BaseEntity[];
  models: FinancialModel[];
  businessUnitId: string;
  businessUnitLabel: string;
  regionId?: string;
  departmentId?: string;
  functionId?: string;
  year: number;
  month: number;
  evalContext: EvalContext;
  onClose: () => void;
  /** Fired once the impact is applied, so the page can re-read its figures. */
  onApplied: (message: string) => void;
}

const fmt = (value: number | null | undefined) =>
  value == null ? '—' : value.toLocaleString(undefined, { maximumFractionDigits: 2 });

/**
 * PocModal — "Add POC / Tactic", the annual screen's way in to the same mechanism as target
 * setting, following the prototype's dialog.
 *
 * Pick the model the POC works through, the one component it drives, and what it drives that
 * component to. The dialog then shows what the model makes of it — and, when the result is an
 * Output, what a second model makes of that in turn — before anything is written.
 */
export const PocModal: React.FC<PocModalProps> = ({
  entity, entities, models, businessUnitId, businessUnitLabel,
  regionId, departmentId, functionId, year, month, evalContext, onClose, onApplied
}) => {
  const [kind, setKind] = useState<'POC' | 'Tactic'>('POC');
  const [modelId, setModelId] = useState<string>('');
  const [driverKpiId, setDriverKpiId] = useState<string>('');
  const [startMonth, setStartMonth] = useState<number>(month);
  const [newValue, setNewValue] = useState<number>(0);
  const [currentValue, setCurrentValue] = useState<number>(0);
  const [outcomeModelId, setOutcomeModelId] = useState<string>('');

  /** An existing POC/Tactic to update, or '' to create one. */
  const [existingId, setExistingId] = useState<string>('');
  const [name, setName] = useState<string>('');
  const [existing, setExisting] = useState<PocTactic[]>([]);

  const [preview, setPreview] = useState<PocImpactPreview | null>(null);
  const [busy, setBusy] = useState<boolean>(false);
  /** Conflicts the apply would record, waiting on the user to accept them. */
  const [pendingConflicts, setPendingConflicts] = useState<PendingConflict[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const kpiName = useCallback(
    (id: string) => entities.find(e => e.id === id)?.name || id,
    [entities]
  );

  /** The models the selected entity takes part in — the prototype's modelsIncluding. */
  const relevantModels = useMemo(
    () => models.filter(m => ModelService.referencedKpiIds(m).includes(entity.id)),
    [models, entity]
  );

  useEffect(() => {
    if (relevantModels.some(m => m.id === modelId)) return;
    setModelId(relevantModels[0]?.id ?? '');
  }, [relevantModels, modelId]);

  const model = useMemo(
    () => relevantModels.find(m => m.id === modelId) ?? null,
    [relevantModels, modelId]
  );

  /** The driver has to be one of the model's components — that's what the model can move. */
  const componentIds = useMemo(
    () => (model ? ModelService.componentKpiIds(model) : []),
    [model]
  );

  useEffect(() => {
    if (componentIds.includes(driverKpiId)) return;
    setDriverKpiId(componentIds[0] ?? '');
    setOutcomeModelId('');
  }, [componentIds, driverKpiId]);

  /** The driver KPI's standing today, which the dialog shows as Current. */
  useEffect(() => {
    if (!driverKpiId || !businessUnitId) { setCurrentValue(0); return; }
    let cancelled = false;
    LedgerService.getLedger({ kind: 'kpi', id: driverKpiId }, businessUnitId, year)
      .then(ledger => {
        if (cancelled) return;
        const entry = ledger.months.find(m => m.month === startMonth);
        const from = entry?.baseline ?? entry?.actual ?? 0;
        setCurrentValue(from);
        setNewValue(prev => (prev === 0 ? from : prev));
      })
      .catch(() => { if (!cancelled) setCurrentValue(0); });
    return () => { cancelled = true; };
  }, [driverKpiId, businessUnitId, year, startMonth]);

  /**
   * Which POCs and Tactics can be reused here. For a KPI that's the ones driving it; for an Org
   * Output/Outcome it's the ones driving the KPIs that contribute to it, since neither table
   * links to an org entity directly. The Department and Function filters narrow that further, and
   * a Region narrows the POCs.
   */
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      let candidateIds: string[] = [];
      if (entity.kind === 'kpi') {
        candidateIds = [entity.id];
      } else if (businessUnitId) {
        const links = entity.kind === 'output'
          ? await ContributionService.getContributingKpisForOutput(entity.id, businessUnitId)
          : await ContributionService.getContributingKpisForOutcome(entity.id, businessUnitId);
        candidateIds = links.map(link => link.sourceKpiId);
      }

      const inScope = candidateIds.filter(id => {
        const kpi = entities.find(e => e.id === id);
        if (!kpi) return true;
        if (departmentId && kpi.departmentId !== departmentId) return false;
        if (functionId && kpi.functionId !== functionId) return false;
        return true;
      });

      const found = await PocTacticService.findForKpis(inScope, regionId);
      if (!cancelled) setExisting(found);
    };
    run().catch(() => { if (!cancelled) setExisting([]); });
    return () => { cancelled = true; };
  }, [entity, entities, businessUnitId, departmentId, functionId, regionId]);

  /** Sealed Outcome models that take the result KPI as a component. */
  const outcomeModels = useMemo(() => {
    const resultKpiId = model?.resultKind === 'kpi' ? model.resultKpiId : undefined;
    if (!resultKpiId) return [];
    return models.filter(m =>
      m.id !== model?.id && ModelService.componentKpiIds(m).includes(resultKpiId));
  }, [models, model]);

  /** The prototype asks for an Outcome model when the model's result is an Output KPI. */
  const resultKpi = useMemo(() => {
    const resultKpiId = model?.resultKind === 'kpi' ? model.resultKpiId : undefined;
    return resultKpiId ? entities.find(e => e.id === resultKpiId) ?? null : null;
  }, [model, entities]);

  const resultIsOutput = (resultKpi?.type || '').toLowerCase().includes('output');

  const outcomeModel = useMemo(
    () => outcomeModels.find(m => m.id === outcomeModelId) ?? null,
    [outcomeModels, outcomeModelId]
  );

  const buildInput = useCallback(() => {
    if (!model || !driverKpiId) return null;
    return {
      kind,
      pocId: existingId || undefined,
      name: name.trim() || existing.find(p => p.id === existingId)?.name || '',
      model,
      driverKpiId,
      driverKpiName: kpiName(driverKpiId),
      currentValue,
      newValue,
      month: startMonth,
      year,
      buId: businessUnitId,
      regionId,
      outcomeModel: resultIsOutput ? outcomeModel : null,
      evalContext,
      kpiName
    };
  }, [
    model, driverKpiId, kind, existingId, name, existing, currentValue, newValue,
    startMonth, year, businessUnitId, regionId, resultIsOutput, outcomeModel, evalContext, kpiName
  ]);

  // What the model makes of the new value, recomputed as the inputs settle.
  useEffect(() => {
    const input = buildInput();
    if (!input || !businessUnitId) { setPreview(null); return; }
    let cancelled = false;
    PocImpactService.preview(input)
      .then(result => { if (!cancelled) setPreview(result); })
      .catch(err => { if (!cancelled) setError(err.message || 'Could not work out the impact'); });
    return () => { cancelled = true; };
  }, [buildInput, businessUnitId]);

  const pickExisting = (id: string) => {
    setExistingId(id);
    const picked = existing.find(p => p.id === id);
    if (!picked) return;
    setName(picked.name);
    setKind(picked.kind);
    // Only adopt its driver when the selected model actually has that component.
    if (picked.driverKpiId && componentIds.includes(picked.driverKpiId)) {
      setDriverKpiId(picked.driverKpiId);
    }
    if (picked.targetValue != null) setNewValue(picked.targetValue);
  };

  const runApply = async () => {
    const input = buildInput();
    if (!input) { setError('Select a financial model and a driver KPI.'); return; }
    if (!input.name) { setError('Name the POC/Tactic or pick an existing one.'); return; }
    if (!componentIds.includes(driverKpiId)) {
      setError('The driver KPI must be a component of the selected model.');
      return;
    }
    if (!preview) { setError('The impact is still being worked out.'); return; }

    setPendingConflicts(null);
    setBusy(true);
    setError(null);
    try {
      await PocImpactService.applyWrites(input, preview);
      // Saving the POC/Tactic record itself is this screen's own responsibility — the shared
      // engine only ever writes targets/proposals/conflicts, never the POC/Tactic linkage.
      await PocTacticService.save({
        id: input.pocId,
        kind: input.kind,
        name: input.name,
        driverKpiId,
        currentBaseline: currentValue,
        targetValue: newValue,
        startDate: `${year}-${String(startMonth).padStart(2, '0')}-01`,
        regionId: input.regionId,
        modelId: input.model.id
      });
      const written = preview.writes.filter(w => w.outcome === 'target').length;
      const proposed = preview.writes.length - written;
      const conflicts = preview.writes.filter(w => w.outcome === 'conflict').length;
      onApplied(
        `${input.name} applied on ${businessUnitLabel} — ${written} target(s) written, ${proposed} proposal(s) raised`
        + (conflicts ? `, ${conflicts} of them in conflict.` : '.')
      );
    } catch (err: any) {
      setError(err.message || 'Could not apply the impact');
    } finally {
      setBusy(false);
    }
  };

  /**
   * The plan already says which values disagree with an approved target. Nothing is written
   * until the user has seen them and accepted.
   */
  const apply = () => {
    const conflicts = (preview?.writes ?? [])
      .filter(write => write.outcome === 'conflict')
      .map<PendingConflict>(write => ({
        entityName: write.kpiName,
        conflictType: CONFLICT_TYPE_BY_SOURCE['Financial Modelar'],
        existingValue: write.existingTarget,
        proposedValue: write.value,
        monthLabel: `${MONTHS[startMonth - 1]} ${year}`,
        reason: `${write.kpiName} is already approved at ${write.existingTarget} for the month, and this ${write.role} value proposes ${write.value}.`
      }));
    if (!conflicts.length) { runApply(); return; }
    setPendingConflicts(conflicts);
  };

  const confirmApply = async () => {
    setPendingConflicts(null);
    await runApply();
  };

  const delta = preview ? preview.resultAfter - preview.resultBefore : 0;
  const outcomeDelta = preview?.outcomeAfter != null && preview?.outcomeBefore != null
    ? preview.outcomeAfter - preview.outcomeBefore
    : null;

  return (
    <>
      <ConflictConfirmDialog
        open={!!pendingConflicts}
        confirmLabel="Apply impact anyway"
        conflicts={pendingConflicts ?? []}
        saving={busy}
        onCancel={() => setPendingConflicts(null)}
        onConfirm={confirmApply}
      />
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-modal="true">
        <div className="modal-head">
          <b>Add POC / Tactic — {entity.name} · {businessUnitLabel}</b>
          <button className="btn btn-xs" disabled={busy} onClick={onClose}>close</button>
        </div>

        <div className="modal-body">
          {error && <div className="alert alert-warn">{error}</div>}

          <div className="grid-2">
            <div>
              <label className="eq-lbl">Type</label>
              <select value={kind} onChange={e => setKind(e.target.value as 'POC' | 'Tactic')}>
                <option value="POC">POC</option>
                <option value="Tactic">Tactic</option>
              </select>
            </div>
            <div>
              <label className="eq-lbl">Financial model</label>
              <SearchableSelect
                options={relevantModels.map(m => ({
                  value: m.id, label: m.resultKpiName || m.name, hint: m.status || 'Draft'
                }))}
                value={modelId}
                onChange={setModelId}
                placeholder={relevantModels.length ? 'Select a model…' : `No model uses ${entity.name}`}
                disabled={!relevantModels.length}
              />
            </div>
          </div>

          <div className="section-label" style={{ marginTop: '10px' }}>Use existing POC/Tactic or create new</div>
          <SearchableSelect
            options={existing.map(p => ({
              value: p.id,
              label: p.name,
              hint: `${p.kind} → ${p.driverKpiId ? kpiName(p.driverKpiId) : '—'}`
            }))}
            value={existingId}
            onChange={pickExisting}
            placeholder="➕ Create new…"
            emptyLabel="➕ Create new…"
            style={{ width: '100%' }}
          />
          {!existingId && (
            <input
              placeholder="New POC/Tactic name"
              value={name}
              onChange={e => setName(e.target.value)}
              style={{ marginTop: '8px', width: '100%' }}
            />
          )}

          <div className="grid-2" style={{ marginTop: '10px' }}>
            <div>
              <label className="eq-lbl">Driver KPI (one component)</label>
              <select
                value={driverKpiId}
                onChange={e => { setDriverKpiId(e.target.value); setOutcomeModelId(''); }}
                disabled={!componentIds.length}
              >
                {componentIds.length === 0 ? (
                  <option value="">This model has no component KPI</option>
                ) : componentIds.map(id => {
                  const kpi = entities.find(e => e.id === id);
                  return (
                    <option key={id} value={id}>
                      {kpiName(id)}{kpi?.type ? ` [${kpi.type}]` : ''}
                    </option>
                  );
                })}
              </select>
            </div>
            <div>
              <label className="eq-lbl">Start month</label>
              <select value={startMonth} onChange={e => setStartMonth(+e.target.value)}>
                {MONTHS.map((label, i) => <option key={label} value={i + 1}>{label}</option>)}
              </select>
            </div>
          </div>

          <div className="grid-2" style={{ marginTop: '8px' }}>
            <div>
              <label className="eq-lbl">Current</label>
              <input value={fmt(currentValue)} disabled />
            </div>
            <div>
              <label className="eq-lbl">New value (this POC/Tactic drives it to)</label>
              <input
                type="number"
                step="0.01"
                value={newValue}
                onChange={e => setNewValue(parseFloat(e.target.value) || 0)}
              />
            </div>
          </div>

          {preview && model && (
            <div className="resultbox" style={{ marginTop: '10px' }}>
              <div>
                <div className="sub stat-inline">
                  Effect on {preview.resultKpiName || model.name}
                  {resultKpi?.type && <span className="pill">{resultKpi.type}</span>}
                </div>
                <div className="stat">
                  {fmt(preview.resultBefore)} → {fmt(preview.resultAfter)}{' '}
                  <span style={{ color: delta >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                    ({delta >= 0 ? '+' : ''}{fmt(delta)})
                  </span>
                </div>
              </div>
            </div>
          )}

          {resultIsOutput && (
            <>
              <div className="section-label" style={{ marginTop: '10px' }}>
                Result is an Output → pick an Outcome model that uses {resultKpi?.name}
              </div>
              {outcomeModels.length === 0 ? (
                <div className="alert alert-warn" style={{ marginTop: '6px' }}>
                  No model takes {resultKpi?.name} as a component, so the Outcome effect can't be
                  computed. Build one in the Financial Modeler to carry it through.
                </div>
              ) : (
                <select value={outcomeModelId} onChange={e => setOutcomeModelId(e.target.value)} style={{ width: '100%' }}>
                  <option value="">Select outcome model…</option>
                  {outcomeModels.map(m => (
                    <option key={m.id} value={m.id}>{m.resultKpiName || m.name}</option>
                  ))}
                </select>
              )}
              {preview?.outcomeAfter != null && (
                <div className="resultbox" style={{ marginTop: '8px' }}>
                  <div>
                    <div className="sub">Outcome impact · {preview.outcomeKpiName}</div>
                    <div className="stat">
                      {fmt(preview.outcomeBefore)} → {fmt(preview.outcomeAfter)}{' '}
                      <span style={{ color: (outcomeDelta ?? 0) >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                        ({(outcomeDelta ?? 0) >= 0 ? '+' : ''}{fmt(outcomeDelta)})
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {preview && preview.writes.length > 0 && (
            <table className="data-table" style={{ marginTop: '10px' }}>
              <thead>
                <tr>
                  <th>What this writes</th>
                  <th className="tright">Approved</th>
                  <th className="tright">Value</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {preview.writes.map(write => (
                  <tr key={`${write.role}-${write.kpiId}`}>
                    <td>{write.kpiName} <span className="muted">({write.role})</span></td>
                    <td className="tright mono muted">{fmt(write.existingTarget)}</td>
                    <td className="tright mono">{fmt(write.value)}</td>
                    <td>
                      {write.outcome === 'target' && <span className="badge st-approved">target</span>}
                      {write.outcome === 'proposal' && <span className="pill">proposal</span>}
                      {write.outcome === 'conflict' && <span className="chip-flag chip-over">conflict</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div className="sub" style={{ marginTop: '10px' }}>
            {model?.status === 'Sealed'
              ? 'Sealed model → writes targets (or a proposal + conflict if a target already exists).'
              : 'Draft model → saved as proposal only.'}{' '}
            The driver KPI, its current baseline and the value it is driven to are recorded on the{' '}
            {kind === 'POC' ? 'POC' : 'Tactic'}.
          </div>

          <div className="btn-row" style={{ marginTop: '14px', justifyContent: 'flex-end' }}>
            <button className="btn btn-sm" disabled={busy} onClick={onClose}>Cancel</button>
            <button className="btn btn-primary btn-sm" disabled={busy || !model} onClick={apply}>
              {busy ? 'Applying…' : 'Apply impact'}
            </button>
          </div>
        </div>
      </div>
    </div>
    </>
  );
};
