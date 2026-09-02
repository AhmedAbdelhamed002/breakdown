import type { ActingRole, FinancialModel } from '../models/types';
import { Button } from '@shared/components/Button/Button';
import { isSealedModel } from '../services/dataverseService';
import { getModelStatusInfo } from '../utils/modelStatus';

interface ModelReviewModalProps {
  model: FinancialModel;
  resultKpiName: string;
  definition: string;
  activeRole: ActingRole;
  showActions: boolean;
  isBusy?: boolean;
  onClose: () => void;
  onApprove: (modelId: string) => void;
  onReturn: (modelId: string) => void;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 12, padding: '8px 0' }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
        {label}
      </div>
      <div style={{ fontSize: 14, color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>{value || '—'}</div>
    </div>
  );
}

export function ModelReviewModal({
  model,
  resultKpiName,
  definition,
  activeRole,
  showActions,
  isBusy = false,
  onClose,
  onApprove,
  onReturn,
}: ModelReviewModalProps) {
  const { label: status } = getModelStatusInfo(model);
  // Single-step approval: Finance's Approve seals the model directly; BI can only Return/Reject
  // it back to Draft — there is no separate "BI seals" step anymore (ported from FinancialModeler).
  const isFinance = activeRole === 'Finance';
  const isBi = activeRole === 'BI';
  const sealed = isSealedModel(model);
  const canReturn = showActions && !sealed;
  const canApprove = showActions && isFinance && !sealed;

  return (
    <div className="modal-back">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>MODEL DETAILS</div>
            <h3 style={{ margin: '4px 0 0' }}>{resultKpiName || model.pm_name || 'Untitled model'}</h3>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="modal-body">
          <Row label="Status" value={status} />
          <Row label="Type" value={model.pm_modeltype || 'Equation'} />
          <Row label="Result kind" value={model.pm_resultkind} />
          <Row label="Result" value={resultKpiName} />
          <Row label="Function" value={model.pm_scopename || ''} />
          <Row label="Version" value={model.pm_version || '1.0'} />
          <Row label="Working days" value={model.pm_useworkingdays === 'Yes' ? 'Yes' : 'No'} />
          <Row label="Linked output" value={model.pm_linkedoutputname || ''} />
          <Row label="Linked outcome" value={model.pm_linkedoutcomename || ''} />
          <Row label="Definition" value={definition} />

          {isFinance && !sealed && (
            <p style={{ margin: '12px 0 0', fontSize: 13, color: 'var(--primary-dark)' }}>
              Approve seals this model. Reject returns it to Draft.
            </p>
          )}
          {isBi && !sealed && (
            <p style={{ margin: '12px 0 0', fontSize: 13, color: 'var(--warning)' }}>
              BI can only Return this model to Draft.
            </p>
          )}
        </div>

        {showActions && (
          <div className="modal-foot">
            {(isFinance || isBi) && (
              <Button variant="danger" disabled={isBusy || !canReturn} onClick={() => onReturn(model.pm_modelid)}>
                {isFinance ? 'Reject' : 'Return'}
              </Button>
            )}
            {isFinance && (
              <Button variant="accent" disabled={isBusy || !canApprove} onClick={() => onApprove(model.pm_modelid)}>
                Approve
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
