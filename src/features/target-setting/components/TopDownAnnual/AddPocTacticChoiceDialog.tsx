import { Modal } from '@shared/components/Modal/Modal';
import { Button } from '@shared/components/Button/Button';

interface Props {
  onChooseExisting: () => void;
  onChooseNew: () => void;
  onClose: () => void;
}

/** First step of "+ POC / Tactic" — which of the two flows the user wants, before anything else is asked. */
export function AddPocTacticChoiceDialog({ onChooseExisting, onChooseNew, onClose }: Props) {
  return (
    <Modal title="+ POC / Tactic" onClose={onClose} footer={<Button onClick={onClose}>Cancel</Button>}>
      <div className="grid-2">
        <div className="option-card" onClick={onChooseExisting}>
          <div className="badge track-op">Use existing POC/Tactic</div>
          <div className="hint" style={{ marginTop: 8 }}>
            Pick from POCs/Tactics already related to this KPI (directly, or through a Strategy) that don't have a
            Financial Model or Impact yet.
          </div>
        </div>
        <div className="option-card" onClick={onChooseNew}>
          <div className="badge track-sv">Create new POC/Tactic</div>
          <div className="hint" style={{ marginTop: 8 }}>
            Build a brand-new Tactic or POC, the same form Strategy Formulation uses, then link its Financial Model
            and calculate its Impact.
          </div>
        </div>
      </div>
    </Modal>
  );
}
