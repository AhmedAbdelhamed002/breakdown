import { useEffect, useState } from 'react';
import { Modal } from '@shared/components/Modal/Modal';
import { Button } from '@shared/components/Button/Button';
import {
  PocCreateDialog,
  TacticCreateDialog,
  PocImpactDialog,
  TacticImpactDialog,
  createPoc,
  createTactic,
  updatePoc,
  updateTactic,
  findOrCreateStrategyKpi,
  assignItemToStrategy,
  getStrategy,
  listPocsByStrategyKpis,
  listTacticsByStrategyKpis,
  type Poc,
  type Tactic,
  type StrategyKpi,
  type PocDraft,
  type TacticDraft,
  type UnassignedItem,
} from '@features/strategy-formulation';
import { AddPocTacticChoiceDialog } from './AddPocTacticChoiceDialog';
import { ExistingPocTacticPicker } from './ExistingPocTacticPicker';
import { StrategyPickerStep } from './StrategyPickerStep';
import type { ConnectedContribution, EligibleCandidate, EligibleClustered } from '../../hooks/useKpiPocTacticImpacts';

interface Props {
  kpiId: string;
  kpiName: string;
  departmentId?: string;
  functionId?: string;
  businessUnitId?: string;
  eligible: EligibleCandidate[];
  eligibleLoading: boolean;
  /** Skips straight to re-opening the Impact dialog for an already-connected item, instead of starting at the choice screen. */
  reopenConnected?: ConnectedContribution;
  /** Fired once an Impact dialog closes (cancelled or applied) — the caller reloads and dismisses the whole flow. */
  onDone: () => void;
  onClose: () => void;
}

type Step =
  | { name: 'choice' }
  | { name: 'existingPicker' }
  | { name: 'newType' }
  | { name: 'strategyPickerForNew'; kind: 'Poc' | 'Tactic' }
  | { name: 'strategyPickerForUnclustered'; kind: 'Poc' | 'Tactic'; item: UnassignedItem }
  | { name: 'busy' }
  | { name: 'createForm'; kind: 'Poc' | 'Tactic'; strategyId: string; strategyKpi: StrategyKpi; strategyType: number; isServiceTrack: boolean; strategyRegionId?: string }
  | { name: 'impact'; kind: 'Poc' | 'Tactic'; strategyId: string; strategyKpi: StrategyKpi; poc?: Poc; tactic?: Tactic };

/**
 * "+ POC / Tactic" on Top-down Annual — orchestrates the exact same Create Tactic/POC and Link
 * Financial Model & Calculate Impact dialogs Strategy Formulation uses, adding only the one thing
 * Top-down Annual doesn't otherwise need: picking (or creating) the Strategy a brand-new or
 * newly-clustered item belongs to, since those dialogs require a real Strategy-KPI link. Every
 * write here is an existing function (`findOrCreateStrategyKpi`, `assignItemToStrategy`,
 * `createPoc`/`createTactic`) — this file only sequences them.
 */
export function AddPocTacticFlow({
  kpiId,
  kpiName,
  departmentId,
  functionId,
  businessUnitId,
  eligible,
  eligibleLoading,
  reopenConnected,
  onDone,
  onClose,
}: Props) {
  const [step, setStep] = useState<Step>(reopenConnected ? { name: 'busy' } : { name: 'choice' });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!reopenConnected) return;
    void pickClusteredExisting({
      source: 'clustered',
      kind: reopenConnected.kind,
      item: reopenConnected.item,
      strategyId: reopenConnected.strategyId,
    });
    // Runs once, for the item this dialog was opened to re-open — reopenConnected never changes mid-flow.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function pickClusteredExisting(candidate: EligibleClustered) {
    setStep({ name: 'busy' });
    try {
      const strategyKpi = await findOrCreateStrategyKpi(candidate.strategyId, kpiId, kpiName);
      setStep({
        name: 'impact',
        kind: candidate.kind,
        strategyId: candidate.strategyId,
        strategyKpi,
        poc: candidate.kind === 'Poc' ? (candidate.item as Poc) : undefined,
        tactic: candidate.kind === 'Tactic' ? (candidate.item as Tactic) : undefined,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to resolve this item’s Strategy KPI');
      setStep({ name: 'choice' });
    }
  }

  function handlePickExisting(candidate: EligibleCandidate) {
    if (candidate.source === 'clustered') {
      void pickClusteredExisting(candidate);
      return;
    }
    setStep({ name: 'strategyPickerForUnclustered', kind: candidate.kind, item: candidate.item });
  }

  async function handleStrategyPickedForNew(strategyId: string, kind: 'Poc' | 'Tactic') {
    setStep({ name: 'busy' });
    try {
      const [strategyKpi, strategy] = await Promise.all([findOrCreateStrategyKpi(strategyId, kpiId, kpiName), getStrategy(strategyId)]);
      setStep({ name: 'createForm', kind, strategyId, strategyKpi, strategyType: strategy.strategyType, isServiceTrack: strategy.track === 'Service', strategyRegionId: strategy.regionId });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to set up the new Strategy KPI');
      setStep({ name: 'choice' });
    }
  }

  async function handleStrategyPickedForUnclustered(strategyId: string, kind: 'Poc' | 'Tactic', item: UnassignedItem) {
    setStep({ name: 'busy' });
    try {
      await assignItemToStrategy(item, strategyId);
      const strategyKpi = await findOrCreateStrategyKpi(strategyId, kpiId, kpiName);
      const [pocs, tactics] = await Promise.all([
        kind === 'Poc' ? listPocsByStrategyKpis([strategyKpi.id]) : Promise.resolve([] as Poc[]),
        kind === 'Tactic' ? listTacticsByStrategyKpis([strategyKpi.id]) : Promise.resolve([] as Tactic[]),
      ]);
      setStep({
        name: 'impact',
        kind,
        strategyId,
        strategyKpi,
        poc: pocs.find((p) => p.id === item.id),
        tactic: tactics.find((t) => t.id === item.id),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to link this item to the Strategy');
      setStep({ name: 'choice' });
    }
  }

  async function handleCreateSave(draft: PocDraft | TacticDraft) {
    if (step.name !== 'createForm') throw new Error('Unexpected state');
    const { kind, strategyId, strategyKpi } = step;
    if (kind === 'Poc') {
      const poc = await createPoc(draft as PocDraft);
      setStep({ name: 'impact', kind, strategyId, strategyKpi, poc });
      return poc;
    }
    const tactic = await createTactic(draft as TacticDraft);
    setStep({ name: 'impact', kind, strategyId, strategyKpi, tactic });
    return tactic;
  }

  return (
    <>
      {error && (
        <Modal title="Something went wrong" onClose={() => setError(null)} footer={<Button onClick={() => setError(null)}>OK</Button>}>
          <div className="alert alert-warn">{error}</div>
        </Modal>
      )}

      {step.name === 'choice' && (
        <AddPocTacticChoiceDialog
          onChooseExisting={() => setStep({ name: 'existingPicker' })}
          onChooseNew={() => setStep({ name: 'newType' })}
          onClose={onClose}
        />
      )}

      {step.name === 'existingPicker' && (
        <ExistingPocTacticPicker eligible={eligible} loading={eligibleLoading} onPick={handlePickExisting} onClose={onClose} />
      )}

      {step.name === 'newType' && (
        <Modal title="Create new POC/Tactic" onClose={onClose} footer={<Button onClick={onClose}>Cancel</Button>}>
          <div className="grid-2">
            <div className="option-card" onClick={() => setStep({ name: 'strategyPickerForNew', kind: 'Poc' })}>
              <div className="badge track-sv">POC</div>
            </div>
            <div className="option-card" onClick={() => setStep({ name: 'strategyPickerForNew', kind: 'Tactic' })}>
              <div className="badge track-op">Tactic</div>
            </div>
          </div>
        </Modal>
      )}

      {step.name === 'strategyPickerForNew' && (
        <StrategyPickerStep
          title="Which Strategy does this belong to?"
          hint={`Creating a new ${step.kind} for KPI "${kpiName}" needs a Strategy to link it under — pick an existing one or create a new one.`}
          departmentId={departmentId}
          functionId={functionId}
          onPicked={(strategyId) => void handleStrategyPickedForNew(strategyId, step.kind)}
          onClose={onClose}
        />
      )}

      {step.name === 'strategyPickerForUnclustered' && (
        <StrategyPickerStep
          title="Which Strategy does this belong to?"
          hint={`"${step.item.name}" isn't linked to a Strategy yet — pick or create the one it belongs to before continuing.`}
          departmentId={departmentId ?? step.item.departmentId}
          functionId={functionId ?? step.item.functionId}
          onPicked={(strategyId) => void handleStrategyPickedForUnclustered(strategyId, step.kind, step.item)}
          onClose={onClose}
        />
      )}

      {step.name === 'busy' && (
        <Modal title="Working…" onClose={onClose}>
          <div className="muted">One moment…</div>
        </Modal>
      )}

      {step.name === 'createForm' && step.kind === 'Poc' && (
        <PocCreateDialog
          strategyKpis={[step.strategyKpi]}
          strategyType={step.strategyType}
          isServiceTrack={step.isServiceTrack}
          departmentId={departmentId}
          functionId={functionId}
          strategyId={step.strategyId}
          strategyRegionId={step.strategyRegionId}
          onClose={onClose}
          onSave={handleCreateSave as (draft: PocDraft) => Promise<Poc>}
        />
      )}
      {step.name === 'createForm' && step.kind === 'Tactic' && (
        <TacticCreateDialog
          strategyKpis={[step.strategyKpi]}
          strategyType={step.strategyType}
          isServiceTrack={step.isServiceTrack}
          departmentId={departmentId}
          strategyRegionId={step.strategyRegionId}
          onClose={onClose}
          onSave={handleCreateSave as (draft: TacticDraft) => Promise<Tactic>}
        />
      )}

      {step.name === 'impact' && step.kind === 'Poc' && step.poc && (
        <PocImpactDialog
          strategyKpis={[step.strategyKpi]}
          functionId={functionId}
          businessUnitId={businessUnitId}
          strategyId={step.strategyId}
          poc={step.poc}
          onLinkStrategyKpi={(strategyKpiId) => updatePoc(step.poc!.id, { strategyKpiId })}
          onClose={onDone}
        />
      )}
      {step.name === 'impact' && step.kind === 'Tactic' && step.tactic && (
        <TacticImpactDialog
          strategyKpis={[step.strategyKpi]}
          functionId={functionId}
          businessUnitId={businessUnitId}
          strategyId={step.strategyId}
          tactic={step.tactic}
          onLinkDriverKpi={(driverKpiId) => updateTactic(step.tactic!.id, { driverKpiId })}
          onClose={onDone}
        />
      )}
    </>
  );
}
