import { useParams, useSearchParams } from "react-router-dom";
import { Loading } from "@shared/components/Loading/Loading";
import { ErrorState } from "@shared/components/ErrorState/ErrorState";
import { useStrategyWizard } from "../hooks/useStrategyWizard";
import type { StrategyWizard } from "../hooks/useStrategyWizard";
import { useOptions } from "../hooks/useOptions";
import { listDepartments } from "../services/referenceDataService";
import { listObjectiveDepartments } from "../services/objectiveDepartmentService";
import { listOperationalStrategies } from "../services/strategyService";
import { StatusBadge } from "../components/StatusBadge";
import { WizardStepper } from "../components/wizard/WizardStepper";
import { TrackStep } from "../components/wizard/TrackStep";
import { ObjectiveStrategyStep } from "../components/wizard/ObjectiveStrategyStep";
import { SupportLinkStep } from "../components/wizard/SupportLinkStep";
import { ServiceObjectiveStep } from "../components/wizard/ServiceObjectiveStep";
import { ProcessStep } from "../components/wizard/ProcessStep";
import { KpisStep } from "../components/wizard/KpisStep";
import { TacticsPocsStep } from "../components/wizard/TacticsPocsStep";
import { ReviewStep } from "../components/wizard/ReviewStep";
import type { WizardStepKey } from "../models/wizardState";
import { TRACK_SERVICE } from "../constants/optionSets";

const STEP_COMPONENTS: Record<WizardStepKey, (props: { wizard: StrategyWizard }) => JSX.Element> = {
  track: TrackStep,
  objectiveStrategy: ObjectiveStrategyStep,
  supportLink: SupportLinkStep,
  serviceObjective: ServiceObjectiveStep,
  process: ProcessStep,
  kpis: KpisStep,
  tacticsPocs: TacticsPocsStep,
  review: ReviewStep,
};

function WizardSummary({ wizard }: { wizard: StrategyWizard }) {
  const { core } = wizard.state;
  const isServiceTrack = core.track === TRACK_SERVICE;
  const departments = useOptions(listDepartments, []);
  const objectiveDepartments = useOptions(listObjectiveDepartments, []);
  const operationalStrategies = useOptions(listOperationalStrategies, []);

  return (
    <div className="card summary">
      <div className="card-head">
        <h3>Live summary</h3>
      </div>
      <div className="card-body">
        <div className="summary-row">
          <span className="k">Track</span>
          <span className="v">{isServiceTrack ? "Service" : "Operational"}</span>
        </div>
        <div className="summary-row">
          <span className="k">Strategy</span>
          <span className="v">{core.name || "—"}</span>
        </div>
        {isServiceTrack ? (
          <>
            <div className="summary-row">
              <span className="k">Supports</span>
              <span className="v">{operationalStrategies.find((s) => s.id === core.supportedStrategyId)?.name ?? "—"}</span>
            </div>
            <div className="summary-row">
              <span className="k">Function</span>
              <span className="v">{departments.find((d) => d.id === core.departmentId)?.label ?? "—"}</span>
            </div>
          </>
        ) : (
          <>
            <div className="summary-row">
              <span className="k">Objective</span>
              <span className="v">{objectiveDepartments.find((o) => o.id === core.objectiveDepartmentId)?.label ?? "—"}</span>
            </div>
            <div className="summary-row">
              <span className="k">Department</span>
              <span className="v">{departments.find((d) => d.id === core.departmentId)?.label ?? "—"}</span>
            </div>
          </>
        )}
        <div className="summary-row">
          <span className="k">KPIs</span>
          <span className="v">{wizard.state.kpis.length}</span>
        </div>
        <div className="summary-row">
          <span className="k">Tactics</span>
          <span className="v">{wizard.state.tactics.length}</span>
        </div>
        <div className="summary-row">
          <span className="k">POCs</span>
          <span className="v">{wizard.state.pocs.length}</span>
        </div>
        <div className="summary-row">
          <span className="k">Status</span>
          <span className="v">
            <StatusBadge status={wizard.state.revisionStatus} />
          </span>
        </div>
      </div>
    </div>
  );
}

export function StrategyWizardPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const objectiveDepartmentId = searchParams.get("objectiveDepartmentId") ?? undefined;
  const departmentId = searchParams.get("departmentId") ?? undefined;
  const primaryKpiId = searchParams.get("primaryKpiId") ?? undefined;
  const functionId = searchParams.get("functionId") ?? undefined;
  const strategyTypeParam = searchParams.get("strategyType");
  const strategyType = strategyTypeParam ? Number(strategyTypeParam) : undefined;
  const wizard = useStrategyWizard(
    id,
    objectiveDepartmentId ? { objectiveDepartmentId, departmentId, primaryKpiId, functionId, strategyType } : undefined
  );

  if (wizard.loading) return <Loading label="Loading strategy…" />;
  if (wizard.error && !wizard.state.strategyId) return <ErrorState message={wizard.error} />;

  const StepComponent = STEP_COMPONENTS[wizard.currentStep];

  return (
    <div style={{ padding: 24 }}>
      <WizardStepper steps={wizard.steps} activeIndex={wizard.state.stepIndex} onSelect={wizard.goToStep} />
      <div className="layout">
        <StepComponent wizard={wizard} />
        <WizardSummary wizard={wizard} />
      </div>
    </div>
  );
}
