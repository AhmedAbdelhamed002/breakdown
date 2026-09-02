import type { WizardStepKey } from "../../models/wizardState";

const STEP_LABEL: Record<WizardStepKey, string> = {
  track: "Track",
  objectiveStrategy: "Objective & Strategy",
  supportLink: "Support Link",
  serviceObjective: "Service Objective",
  process: "Process",
  kpis: "KPIs",
  tacticsPocs: "Tactics & POCs",
  review: "Review & Submit",
};

interface Props {
  steps: WizardStepKey[];
  activeIndex: number;
  onSelect: (index: number) => void;
}

export function WizardStepper({ steps, activeIndex, onSelect }: Props) {
  return (
    <div className="stepper">
      {steps.map((step, index) => (
        <button
          key={step}
          type="button"
          className={`step${index === activeIndex ? " active" : ""}${index < activeIndex ? " done" : ""}`}
          onClick={() => onSelect(index)}
        >
          <span className="n">{index + 1}</span>
          {STEP_LABEL[step]}
        </button>
      ))}
    </div>
  );
}
