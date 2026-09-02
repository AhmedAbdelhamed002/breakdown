import { useState } from "react";
import { Button } from "@shared/components/Button/Button";
import type { StrategyWizard } from "../../hooks/useStrategyWizard";
import { useItemImpactSummaries } from "../../hooks/useItemImpactSummaries";
import { TacticCreateDialog } from "../TacticCreateDialog";
import { TacticImpactDialog } from "../TacticImpactDialog";
import { PocCreateDialog } from "../PocCreateDialog";
import { PocImpactDialog } from "../PocImpactDialog";
import { AttachUnassignedItemDialog } from "../AttachUnassignedItemDialog";
import { ItemRelationshipCard, buildRelationshipTrail } from "./ItemRelationshipCard";
import type { Tactic } from "../../models/tactic";
import type { Poc } from "../../models/poc";

export function TacticsPocsStep({ wizard }: { wizard: StrategyWizard }) {
  const { core, kpis, tactics, pocs } = wizard.state;
  /** Service strategies scope via Supported Department/Supportive Function instead of Department/Function (same dual-track distinction as strategyService's searchStrategiesForCluster/strategyScope) — read the right pair before offering it to Attach Existing Unassigned Item. */
  const scopeDepartmentId = wizard.isServiceTrack ? core.supportedDepartmentId : core.departmentId;
  const scopeFunctionId = wizard.isServiceTrack ? core.supportiveFunctionId : core.functionId;
  const [tacticCreateDialog, setTacticCreateDialog] = useState<{ existing?: Tactic } | null>(null);
  const [tacticImpactDialog, setTacticImpactDialog] = useState<{ tactic: Tactic } | null>(null);
  const [pocCreateDialog, setPocCreateDialog] = useState<{ existing?: Poc } | null>(null);
  const [pocImpactDialog, setPocImpactDialog] = useState<{ poc: Poc } | null>(null);
  const [attachingItem, setAttachingItem] = useState(false);
  const { summaries, reload: reloadImpactSummaries } = useItemImpactSummaries(tactics, pocs);
  const itemsWithImpact = tactics.filter((t) => summaries.get(t.id)?.hasImpact).length + pocs.filter((p) => summaries.get(p.id)?.hasImpact).length;

  return (
    <div className="card">
      <div className="card-head">
        <div className="between">
          <h3>{wizard.isServiceTrack ? "Service Tactics & POCs" : "Tactics & POCs"}</h3>
          <Button size="sm" onClick={() => setAttachingItem(true)} disabled={!wizard.state.strategyId}>
            Attach Existing…
          </Button>
        </div>
      </div>
      <div className="card-body">
        <div className="flow-legend">
          <span className="seg">Strategy</span>
          <span className="arrow">→</span>
          <span className="seg">Tactic / POC</span>
          <span className="arrow">→</span>
          <span className="seg">KPI</span>
          <span className="arrow">→</span>
          <span className="seg">Financial Model</span>
          {(tactics.length > 0 || pocs.length > 0) && (
            <span className="muted" style={{ marginLeft: "auto", textTransform: "none", fontWeight: 500, letterSpacing: 0 }}>
              {tactics.length} Tactic{tactics.length === 1 ? "" : "s"} · {pocs.length} POC{pocs.length === 1 ? "" : "s"} · {itemsWithImpact} with Impact applied
            </span>
          )}
        </div>

        <div className="between">
          <div className="section-label" style={{ margin: 0 }}>Tactics</div>
          <Button size="sm" onClick={() => setTacticCreateDialog({})} disabled={kpis.length === 0}>
            + Add Tactic
          </Button>
        </div>
        {tactics.length === 0 ? (
          <div className="empty-state">
            <h4>No tactics yet</h4>
          </div>
        ) : (
          tactics.map((t) => {
            const kpiName = t.strategyKpiName ?? t.kpiName;
            const driverKpiName = kpis.find((k) => k.kpiId === t.driverKpiId)?.kpiName;
            return (
              <ItemRelationshipCard
                key={t.id}
                kind="Tactic"
                name={t.name ?? ""}
                trail={buildRelationshipTrail(kpiName, driverKpiName, summaries.get(t.id)?.financialModelName)}
                hasImpact={!!summaries.get(t.id)?.hasImpact}
                stats={[
                  { label: "Current → Target", value: `${t.currentBaseline ?? "—"} → ${t.target}` },
                  { label: "Deadline", value: t.deadline ?? "—" },
                  ...(t.neededBudget !== undefined ? [{ label: "Budget", value: t.neededBudget }] : []),
                ]}
                details={[
                  ...(t.categoryName ? [{ label: "Category", value: t.categoryName }] : []),
                  ...(t.assigneeName ? [{ label: "Assignee", value: t.assigneeName }] : []),
                  ...(t.processName ? [{ label: "Related Process", value: t.processName }] : []),
                ]}
                impactRecords={summaries.get(t.id)?.allImpacts}
                actions={
                  <>
                    <button className="btn btn-xs" onClick={() => setTacticCreateDialog({ existing: t })}>
                      View
                    </button>
                    <button className="btn btn-xs" onClick={() => setTacticImpactDialog({ tactic: t })}>
                      Impact
                    </button>
                  </>
                }
              />
            );
          })
        )}

        <div className="between" style={{ marginTop: 24 }}>
          <div className="section-label" style={{ margin: 0 }}>POCs</div>
          <Button size="sm" onClick={() => setPocCreateDialog({})} disabled={kpis.length === 0}>
            + Add POC
          </Button>
        </div>
        {pocs.length === 0 ? (
          <div className="empty-state">
            <h4>No POCs yet</h4>
          </div>
        ) : (
          pocs.map((p) => {
            const kpiName = p.strategyKpiName ?? p.kpiName;
            return (
              <ItemRelationshipCard
                key={p.id}
                kind="Poc"
                name={p.name ?? ""}
                trail={buildRelationshipTrail(kpiName, undefined, summaries.get(p.id)?.financialModelName)}
                hasImpact={!!summaries.get(p.id)?.hasImpact}
                stats={[
                  { label: "Target", value: p.kpiTargetValue ?? "—" },
                  { label: "Due", value: p.successDueDate ?? "—" },
                  { label: "Project", value: p.projectName ?? "Not linked yet" },
                  ...(p.neededBudget !== undefined ? [{ label: "Budget", value: p.neededBudget }] : []),
                ]}
                details={[
                  ...(p.categoryName ? [{ label: "Category", value: p.categoryName }] : []),
                  ...(p.regionName ? [{ label: "Region", value: p.regionName }] : []),
                  ...(p.specialtyName ? [{ label: "Specialty", value: p.specialtyName }] : []),
                ]}
                impactRecords={summaries.get(p.id)?.allImpacts}
                actions={
                  <>
                    <button className="btn btn-xs" onClick={() => setPocCreateDialog({ existing: p })}>
                      View
                    </button>
                    <button className="btn btn-xs" onClick={() => setPocImpactDialog({ poc: p })}>
                      Impact
                    </button>
                  </>
                }
              />
            );
          })
        )}

        {kpis.length === 0 && <div className="alert alert-warn">Add at least one KPI before adding Tactics or POCs.</div>}
      </div>
      <div className="card-foot">
        <Button onClick={wizard.goBack}>Back</Button>
        <Button variant="primary" onClick={wizard.goNext}>
          Continue
        </Button>
      </div>

      {tacticCreateDialog && (
        <TacticCreateDialog
          strategyKpis={kpis}
          strategyType={core.strategyType ?? 0}
          departmentId={core.departmentId}
          isServiceTrack={wizard.isServiceTrack}
          strategyRegionId={core.regionId}
          existing={tacticCreateDialog.existing}
          onClose={() => setTacticCreateDialog(null)}
          onSave={async (draft) => {
            const tactic = await wizard.addTactic(draft);
            setTacticCreateDialog(null);
            setTacticImpactDialog({ tactic });
            return tactic;
          }}
        />
      )}
      {tacticImpactDialog && (
        <TacticImpactDialog
          strategyKpis={kpis}
          functionId={core.functionId}
          businessUnitId={core.businessUnitId}
          strategyId={wizard.state.strategyId ?? ""}
          tactic={tacticImpactDialog.tactic}
          onLinkDriverKpi={(driverKpiId) => wizard.editTactic(tacticImpactDialog.tactic.id, { driverKpiId })}
          onClose={() => {
            setTacticImpactDialog(null);
            reloadImpactSummaries();
          }}
        />
      )}
      {pocCreateDialog && (
        <PocCreateDialog
          strategyKpis={kpis}
          strategyType={core.strategyType ?? 0}
          isServiceTrack={wizard.isServiceTrack}
          departmentId={core.departmentId}
          functionId={core.functionId}
          strategyId={wizard.state.strategyId}
          strategyRegionId={core.regionId}
          existing={pocCreateDialog.existing}
          onLinkProject={
            pocCreateDialog.existing
              ? async (projectId) => {
                  await wizard.editPoc(pocCreateDialog.existing!.id, { projectId });
                }
              : undefined
          }
          onClose={() => setPocCreateDialog(null)}
          onSave={async (draft) => {
            const poc = await wizard.addPoc(draft);
            setPocCreateDialog(null);
            setPocImpactDialog({ poc });
            return poc;
          }}
        />
      )}
      {pocImpactDialog && (
        <PocImpactDialog
          strategyKpis={kpis}
          functionId={core.functionId}
          businessUnitId={core.businessUnitId}
          strategyId={wizard.state.strategyId ?? ""}
          poc={pocImpactDialog.poc}
          onLinkStrategyKpi={(strategyKpiId) => wizard.editPoc(pocImpactDialog.poc.id, { strategyKpiId })}
          onClose={() => {
            setPocImpactDialog(null);
            reloadImpactSummaries();
          }}
        />
      )}
      {attachingItem && (
        <AttachUnassignedItemDialog
          departmentId={scopeDepartmentId}
          functionId={scopeFunctionId}
          onAttach={wizard.attachExistingItem}
          onClose={() => setAttachingItem(false)}
        />
      )}
    </div>
  );
}
