import { Button } from "@shared/components/Button/Button";
import type { StrategyWizard } from "../../hooks/useStrategyWizard";
import { useOptions } from "../../hooks/useOptions";
import { listOperationalStrategies } from "../../services/strategyService";

export function ServiceObjectiveStep({ wizard }: { wizard: StrategyWizard }) {
  const { core } = wizard.state;
  const operationalStrategies = useOptions(listOperationalStrategies, []);
  const supported = operationalStrategies.find((s) => s.id === core.supportedStrategyId);

  return (
    <div className="card">
      <div className="card-head">
        <h3>Service Objective</h3>
        <div className="sub">Inherited from the operational strategy this service strategy supports</div>
      </div>
      <div className="card-body">
        {!supported ? (
          <div className="alert alert-warn">No supported strategy chosen yet — go back to Support Link.</div>
        ) : (
          <div className="info-row">
            <div>
              <span className="k">Supported Strategy</span>
              {supported.name}
            </div>
            <div>
              <span className="k">Supported Department</span>
              {supported.departmentName ?? "—"}
            </div>
            <div>
              <span className="k">Business Unit</span>
              {supported.businessUnitName ?? "—"}
            </div>
          </div>
        )}
      </div>
      <div className="card-foot">
        <Button onClick={wizard.goBack}>Back</Button>
        <Button variant="primary" onClick={wizard.goNext}>
          Continue
        </Button>
      </div>
    </div>
  );
}
