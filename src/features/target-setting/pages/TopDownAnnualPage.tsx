import React, { useEffect, useMemo, useState } from 'react';
import { useAnnualForecast } from '../hooks/useAnnualForecast';
import { useKpiPocTacticImpacts } from '../hooks/useKpiPocTacticImpacts';
import type { ConnectedContribution } from '../hooks/useKpiPocTacticImpacts';
import { useBusinessUnits } from '@shared/hooks/useBusinessUnits';
import { ContextBar } from '../components/CalendarAdjustment/ContextBar';
import { EntitySelector, TrendStrip, RollUpSection } from '../components/TopDownAnnual';
import { PocTacticContributionsPanel } from '../components/TopDownAnnual/PocTacticContributionsPanel';
import { AddPocTacticFlow } from '../components/TopDownAnnual/AddPocTacticFlow';
import { AnnualForecastService } from '../services/AnnualForecastService';
import { ConflictDetectionService } from '../services/ConflictDetectionService';
import { ConflictConfirmDialog, PendingConflict } from '@shared/components/ConflictConfirmDialog/ConflictConfirmDialog';
import { AlertDialog, AlertDialogKind } from '@shared/components/AlertDialog/AlertDialog';
import { MONTHS } from '../models/types';

/** A recorded figure, or an em dash when the year has nothing for it. */
const fmtOrDash = (value: number | null | undefined) =>
  value == null ? '—' : value.toLocaleString(undefined, { maximumFractionDigits: 2 });

export const TopDownAnnualPage: React.FC = () => {
  const {
    businessUnitId, setBusinessUnitId,
    departmentId, setDepartmentId,
    functionId, setFunctionId,
    year, setYear,
    month, setMonth,
    entities,
    kpiScopeReady,
    selectedEntity, setSelectedEntity,
    selectedEntityFigures,
    monthlyTargets,
    models,
    trailingProfile,
    forecastProfile,
    rollUpRows, rollUpLoading,
    loading, error
  } = useAnnualForecast('', new Date().getFullYear());

  const isKpiSelected = selectedEntity?.kind === 'kpi';
  const {
    connected: pocTacticContributions,
    eligible: pocTacticEligible,
    loading: pocTacticLoading,
    reload: reloadPocTacticImpacts,
  } = useKpiPocTacticImpacts(isKpiSelected ? selectedEntity!.id : undefined, businessUnitId);

  const [addFlowOpen, setAddFlowOpen] = useState(false);
  const [reopenConnected, setReopenConnected] = useState<ConnectedContribution | null>(null);
  const [saving, setSaving] = useState(false);

  /** Which connected POC/Tactic contributions are folded into the forecast below — a purely local
   * "proposal" step, never written to pm_pocimpacts/pm_tacticimpacts (Apply Impact already did
   * that). Scoped to the current KPI: reset whenever the selected entity changes, so one KPI's
   * applied state never leaks into another's. */
  const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    setAppliedIds(new Set());
  }, [selectedEntity?.id]);

  /** Contributions whose own last-applied Impact period matches the Month + Year currently
   * selected in the context filters. useKpiPocTacticImpacts only scopes by KPI — every POC/Tactic
   * ever connected to this KPI comes back regardless of which month its own Impact was calculated
   * for — so without this, changing Month here had no visible effect on the list at all. */
  const monthScopedContributions = useMemo(
    () => pocTacticContributions.filter((c) => c.summary.lastImpact?.month === month && c.summary.lastImpact?.year === year),
    [pocTacticContributions, month, year]
  );

  function toggleApplied(id: string) {
    setAppliedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function applyAllToForecast() {
    setAppliedIds(new Set(monthScopedContributions.map((c) => c.item.id)));
  }
  function removeAllFromForecast() {
    setAppliedIds(new Set());
  }

  /** forecastProfile with every applied item's own driverNewValue stacked onto its own month —
   * ForecastProfileMonth already carries a projectDelta field for exactly this (see
   * calculateBaselineForecast, which always leaves it at 0 today). Scoped to monthScopedContributions
   * (Month + Year, not just Year), so an item no longer shown after a Month change stops
   * contributing to the forecast too, even if its id lingers in appliedIds. */
  const proposedForecastProfile = useMemo(() => {
    const deltaByMonth = new Map<number, number>();
    for (const c of monthScopedContributions) {
      if (!appliedIds.has(c.item.id)) continue;
      const li = c.summary.lastImpact;
      if (!li?.month) continue;
      deltaByMonth.set(li.month, (deltaByMonth.get(li.month) ?? 0) + (li.driverNewValue ?? 0));
    }
    if (deltaByMonth.size === 0) return forecastProfile;
    return forecastProfile.map((m) => {
      const delta = deltaByMonth.get(m.month);
      return delta ? { ...m, projectDelta: m.projectDelta + delta, finalValue: m.finalValue + delta } : m;
    });
  }, [monthScopedContributions, appliedIds, forecastProfile]);
  /** A save waiting on the user to accept the conflicts it would record. */
  const [pendingSave, setPendingSave] = useState<
    { conflicts: PendingConflict[]; confirmLabel: string; run: () => Promise<void> } | null
  >(null);
  /** Replaces the native browser alert() for this screen's save outcome/error messages. */
  const [notice, setNotice] = useState<{ kind: AlertDialogKind; message: string } | null>(null);

  /**
   * The months this save is about: everything after the one being planned from.
   *
   * Earlier months are history. A recorded one is already settled, and an empty one now reads 0 —
   * re-proposing that would write a proposal of zero and raise a conflict against any target
   * approved for it, which says nothing about the plan being made.
   */
  const monthsToSave = useMemo(
    () => proposedForecastProfile.filter(m => m.month > month),
    [proposedForecastProfile, month]
  );

  /**
   * Which months would come in under a target that's already approved.
   *
   * Runs the shared detector every other screen uses rather than comparing here, so a KPI, an Org
   * Outcome and an Org Output are all judged by one rule — the entity's kind only decides which
   * table the ledger is read from. `below-only` matches what the save itself will do:
   * TargetWriteService raises a conflict when an approved target is higher than the proposed value,
   * and nothing is gained by warning about months it would let through.
   *
   * The detector reads each entity's ledger once for the whole year, so this stays a single read.
   */
  const findConflicts = async (): Promise<PendingConflict[]> => {
    if (!selectedEntity || !businessUnitId) return [];
    return ConflictDetectionService.detect(
      monthsToSave.map(m => ({
        entityRef: { kind: selectedEntity.kind, id: selectedEntity.id },
        entityName: selectedEntity.name,
        value: m.finalValue,
        month: m.month
      })),
      {
        buId: businessUnitId,
        year,
        source: 'Forecast',
        mode: 'below-only',
        monthLabel: month => `${MONTHS[month - 1]} ${year}`
      }
    );
  };

  /** Run the work, but let the user see the conflicts it would record first. */
  const guard = async (confirmLabel: string, run: () => Promise<void>) => {
    const conflicts = await findConflicts();
    if (!conflicts.length) { await run(); return; }
    setPendingSave({ conflicts, confirmLabel, run });
  };

  const { businessUnits } = useBusinessUnits();
  const selectedBu = businessUnits.find(bu => bu.id === businessUnitId);
  const businessUnitLabel = selectedBu ? [selectedBu.name, selectedBu.region].filter(Boolean).join(' — ') : undefined;

  const hasRelevantModel = !!selectedEntity && models.some(
    m => m.resultKpiId === selectedEntity.id || m.terms.some(t => t.kpiId === selectedEntity.id)
  );

  /** The Impact dialog closed (cancelled or applied) — reload this KPI's own contributions/eligible list. */
  const handleAddFlowDone = () => {
    setAddFlowOpen(false);
    setReopenConnected(null);
    reloadPocTacticImpacts();
  };

  const runSaveProposal = async () => {
    if (!selectedEntity || !businessUnitId || !monthsToSave.length) return;
    setSaving(true);
    try {
      const conflicted: number[] = [];
      for (const m of monthsToSave) {
        const outcome = await AnnualForecastService.saveProposal(selectedEntity, businessUnitId, year, m.month, m.finalValue);
        if (outcome.conflictRaised) conflicted.push(m.month);
      }
      setNotice({
        kind: 'success',
        message: `Forecast saved as proposals for ${selectedEntity.name} (${monthsToSave.length} month(s) from ${MONTHS[month]} ${year}).${
          conflicted.length ? ` ${conflicted.length} month(s) came in below an approved target and were raised as conflicts: ${conflicted.map(m => MONTHS[m - 1]).join(', ')}.` : ''
        }`
      });
    } catch (err: any) {
      setNotice({ kind: 'error', message: `Error saving proposal: ${err.message}` });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveProposal = () => guard('Save as proposals', runSaveProposal);

  const confirmPendingSave = async () => {
    const pending = pendingSave;
    setPendingSave(null);
    if (pending) await pending.run();
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
        Method 1 — start of year. Choose <b>what</b> to plan (Org Outcome / Org Output / KPI), read its last 12 months and trend year-close, then add <b>projects</b>. Each project raises a component of a model from a month; projects <b>stack</b> (same or different models) and the result accumulates into the target.
      </div>

      <div className="card">
        <EntitySelector
          entities={entities}
          selectedEntity={selectedEntity}
          onSelect={setSelectedEntity}
          kpiScopeReady={kpiScopeReady}
        >
          {selectedEntity && selectedEntityFigures && (
            selectedEntityFigures.hasRecord ? (
              <div className="sub">
                In {businessUnitLabel ?? '—'} for {year} — historical {fmtOrDash(selectedEntityFigures.historical)}
                {' · '}baseline {fmtOrDash(selectedEntityFigures.baseline)}
                {' · '}actual {fmtOrDash(selectedEntityFigures.actual)}
                {' · '}target {fmtOrDash(selectedEntityFigures.target)}
              </div>
            ) : (
              <div className="sub warn-text">
                ⚠ Nothing recorded for {selectedEntity.name} in {businessUnitLabel ?? '—'} for {year}.
              </div>
            )
          )}
        </EntitySelector>

        <div className="card-body">
          <TrendStrip
            title={`LAST 12 MONTHS (ACTUAL) — ${year - 1}`}
            data={trailingProfile}
            aggType={selectedEntity?.aggType}
          />
          <TrendStrip
            title={`PROJECTED CLOSE OF ${year}`}
            data={proposedForecastProfile}
            showLabels={true}
            aggType={selectedEntity?.aggType}
            targets={selectedEntity ? monthlyTargets : undefined}
          />
          {selectedEntity && !hasRelevantModel && (
            <span className="muted" style={{ marginLeft: '8px' }}>
              No model feeds this entity — pick another entity or build a model.
            </span>
          )}
          {isKpiSelected && (
            <PocTacticContributionsPanel
              connected={monthScopedContributions}
              loading={pocTacticLoading}
              disabled={!selectedEntity}
              month={month}
              year={year}
              forecastProfile={forecastProfile}
              appliedIds={appliedIds}
              onToggleApplied={toggleApplied}
              onApplyAll={applyAllToForecast}
              onRemoveAll={removeAllFromForecast}
              onOpen={(c) => setReopenConnected(c)}
              onAddClick={() => setAddFlowOpen(true)}
            />
          )}
          <RollUpSection
            rows={rollUpRows}
            loading={rollUpLoading}
            entityName={selectedEntity?.name}
            entityKind={selectedEntity?.kind}
            businessUnitLabel={businessUnitLabel}
          />
        </div>

        <div className="card-foot between">
          <div className="sub">
            {monthsToSave.length
              ? `Saving records ${MONTHS[month]}–Dec ${year} as proposals — ${monthsToSave.length} month(s). Months up to ${MONTHS[month - 1]} are history and are left as they are, and nothing is written straight to target from this screen.`
              : `${MONTHS[month - 1]} is the last month of ${year}, so there is nothing ahead to propose — pick an earlier month to plan from.`}
          </div>
          <div className="btn-row">
            <button
              className="btn btn-primary btn-sm"
              disabled={loading || saving || !selectedEntity || !monthsToSave.length}
              onClick={handleSaveProposal}
            >
              Save as proposal
            </button>
          </div>
        </div>
      </div>

      {isKpiSelected && selectedEntity && (addFlowOpen || reopenConnected) && (
        <AddPocTacticFlow
          kpiId={selectedEntity.id}
          kpiName={selectedEntity.name}
          departmentId={departmentId || selectedEntity.departmentId}
          functionId={functionId || selectedEntity.functionId}
          businessUnitId={businessUnitId}
          eligible={pocTacticEligible}
          eligibleLoading={pocTacticLoading}
          reopenConnected={reopenConnected ?? undefined}
          onDone={handleAddFlowDone}
          onClose={() => {
            setAddFlowOpen(false);
            setReopenConnected(null);
          }}
        />
      )}
      <ConflictConfirmDialog
        open={!!pendingSave}
        confirmLabel={pendingSave?.confirmLabel ?? 'Save'}
        conflicts={pendingSave?.conflicts ?? []}
        saving={saving}
        onCancel={() => setPendingSave(null)}
        onConfirm={confirmPendingSave}
      />
      <AlertDialog
        open={!!notice}
        kind={notice?.kind}
        message={notice?.message ?? ''}
        onClose={() => setNotice(null)}
      />
    </div>
  );
};
