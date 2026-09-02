import { Button } from "@shared/components/Button/Button";
import type { StrategyWizard } from "../../hooks/useStrategyWizard";
import { TRACK_OPERATIONAL, TRACK_SERVICE } from "../../constants/optionSets";

export function TrackStep({ wizard }: { wizard: StrategyWizard }) {
  const locked = !!wizard.state.strategyId;

  function choose(track: number) {
    if (locked) return;
    wizard.setTrack(track);
  }

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h3>Choose the strategy track</h3>
          <div className="sub">{locked ? "Locked — the strategy track cannot be changed once the strategy has been created." : "Locked once the first Tactic or POC is added (BRL-25)."}</div>
        </div>
      </div>
      <div className="card-body">
        <div className="grid-2">
          <div
            className={`option-card${wizard.state.core.track === TRACK_OPERATIONAL ? " selected" : ""}`}
            style={locked ? { cursor: "not-allowed", opacity: wizard.state.core.track === TRACK_OPERATIONAL ? 1 : 0.5 } : undefined}
            onClick={() => choose(TRACK_OPERATIONAL)}
          >
            <div className="badge track-op">Operational</div>
            <div className="hint" style={{ marginTop: 8 }}>
              What a department commits to do for itself. Parents an Objective, sets KPI targets, executes via P&amp;M and Project.
            </div>
          </div>
          <div
            className={`option-card${wizard.state.core.track === TRACK_SERVICE ? " selected" : ""}`}
            style={locked ? { cursor: "not-allowed", opacity: wizard.state.core.track === TRACK_SERVICE ? 1 : 0.5 } : undefined}
            onClick={() => choose(TRACK_SERVICE)}
          >
            <div className="badge track-sv">Service</div>
            <div className="hint" style={{ marginTop: 8 }}>
              A supportive function&rsquo;s directed commitment to help a department hit specific KPIs. No targets; routes to TMS / Project.
            </div>
          </div>
        </div>
      </div>
      <div className="card-foot">
        <div />
        <Button variant="primary" onClick={wizard.goNext}>
          Continue →
        </Button>
      </div>
    </div>
  );
}
