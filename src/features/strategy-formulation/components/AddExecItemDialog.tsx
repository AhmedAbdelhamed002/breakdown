import { useState } from "react";
import { Modal } from "@shared/components/Modal/Modal";
import { Button } from "@shared/components/Button/Button";
import { useOptions } from "../hooks/useOptions";
import { listStrategyKpis } from "../services/strategyKpiService";
import { createTactic, updateTactic } from "../services/tacticService";
import { createPoc, updatePoc } from "../services/pocService";
import { TacticCreateDialog } from "./TacticCreateDialog";
import { TacticImpactDialog } from "./TacticImpactDialog";
import { PocCreateDialog } from "./PocCreateDialog";
import { PocImpactDialog } from "./PocImpactDialog";
import type { Strategy } from "../models/strategy";
import type { Tactic } from "../models/tactic";
import type { Poc } from "../models/poc";
import { TRACK_SERVICE } from "../constants/optionSets";

interface Props {
  strategy: Strategy;
  onCreated: () => void;
  onClose: () => void;
}

/**
 * Create a Tactic/POC directly against an existing strategy, bypassing the
 * wizard — the legacy source's "＋ Add Tactic / POC" on Execution Tracking.
 * Reuses the wizard's own TacticCreateDialog/PocCreateDialog (same required-fields
 * validation, and the same real Region/Specialty/Both scope control and
 * TMS-or-Project execution mode — see spec addendum items 26/27, both now
 * fixed at the shared-component level rather than reintroduced here), then
 * chains straight into the matching Impact dialog once the record is created.
 */
export function AddExecItemDialog({ strategy, onCreated, onClose }: Props) {
  const [kind, setKind] = useState<"Tactic" | "Poc" | null>(null);
  const [createdTactic, setCreatedTactic] = useState<Tactic | null>(null);
  const [createdPoc, setCreatedPoc] = useState<Poc | null>(null);
  const strategyKpis = useOptions(() => listStrategyKpis(strategy.id), [strategy.id]);
  const isServiceTrack = strategy.strategyType === TRACK_SERVICE || strategy.track === "Service";

  if (kind === null) {
    return (
      <Modal
        title="Add Tactic / POC"
        onClose={onClose}
        footer={
          <>
            <Button onClick={onClose}>Cancel</Button>
          </>
        }
      >
        {strategyKpis.length === 0 ? (
          <div className="alert alert-warn">
            This strategy has no KPIs yet. Add one from the strategy's KPIs step before creating a Tactic/POC here.
          </div>
        ) : (
          <div className="btn-row">
            <Button variant="primary" onClick={() => setKind("Tactic")}>
              Tactic
            </Button>
            <Button variant="accent" onClick={() => setKind("Poc")}>
              POC
            </Button>
          </div>
        )}
      </Modal>
    );
  }

  if (kind === "Tactic") {
    if (createdTactic) {
      return (
        <TacticImpactDialog
          strategyKpis={strategyKpis}
          businessUnitId={strategy.businessUnitId}
          strategyId={strategy.id}
          tactic={createdTactic}
          onLinkDriverKpi={(driverKpiId) => updateTactic(createdTactic.id, { driverKpiId })}
          onClose={() => {
            onCreated();
            onClose();
          }}
        />
      );
    }
    return (
      <TacticCreateDialog
        strategyKpis={strategyKpis}
        strategyType={strategy.strategyType}
        departmentId={strategy.departmentId}
        isServiceTrack={isServiceTrack}
        strategyRegionId={strategy.regionId}
        onSave={async (draft) => {
          const tactic = await createTactic(draft);
          setCreatedTactic(tactic);
          return tactic;
        }}
        onClose={onClose}
      />
    );
  }

  if (createdPoc) {
    return (
      <PocImpactDialog
        strategyKpis={strategyKpis}
        functionId={strategy.functionId}
        businessUnitId={strategy.businessUnitId}
        strategyId={strategy.id}
        poc={createdPoc}
        onLinkStrategyKpi={(strategyKpiId) => updatePoc(createdPoc.id, { strategyKpiId })}
        onClose={() => {
          onCreated();
          onClose();
        }}
      />
    );
  }

  return (
    <PocCreateDialog
      strategyKpis={strategyKpis}
      strategyType={strategy.strategyType}
      isServiceTrack={isServiceTrack}
      departmentId={strategy.departmentId}
      functionId={strategy.functionId}
      strategyId={strategy.id}
      strategyRegionId={strategy.regionId}
      onSave={async (draft) => {
        const poc = await createPoc(draft);
        setCreatedPoc(poc);
        return poc;
      }}
      onClose={onClose}
    />
  );
}
