import { Button } from '@shared/components/Button/Button';
import { DataTable, type Column } from '@shared/components/DataTable/DataTable';
import { MONTH_NAMES } from '../constants';
import type { TesterConflictPreview } from '../hooks/useFinancialModeler';
import type { TargetSource } from '../models/types';

interface ConflictConfirmModalProps {
  open: boolean;
  conflicts: TesterConflictPreview[];
  isBusy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

function sourceLabel(source: TargetSource): string {
  if (source === 'TopDownMonthly') return 'Top-down monthly';
  if (source === 'Breakdown') return 'Breakdown';
  if (source === 'BottomUp') return 'Bottom-up';
  if (source === 'FinancialModeler') return 'Financial modeler';
  return 'Forecast';
}

const COLUMNS: Column<TesterConflictPreview>[] = [
  {
    key: 'entity',
    header: 'Entity',
    render: (row) => (
      <>
        {row.entityName}
        <div style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-muted)' }}>
          {row.entityKind}
          {row.businessUnit ? ` · ${row.businessUnit}` : ''}
        </div>
      </>
    ),
  },
  { key: 'proposed', header: 'Proposed', render: (row) => row.proposed },
  { key: 'existing', header: 'Existing', render: (row) => row.existing },
  { key: 'existingSource', header: 'Existing source', render: (row) => sourceLabel(row.existingSource) },
  { key: 'period', header: 'Period', render: (row) => `${MONTH_NAMES[row.month - 1] || row.month} ${row.year}` },
];

export function ConflictConfirmModal({
  open,
  conflicts,
  isBusy = false,
  onCancel,
  onConfirm,
}: ConflictConfirmModalProps) {
  if (!open) return null;

  return (
    <div className="modal-back" role="presentation">
      <div
        className="modal wide"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="fm-conflict-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <h3 id="fm-conflict-title" style={{ margin: 0 }}>Conflicts found</h3>
            <p style={{ margin: '8px 0 0', fontSize: 13, lineHeight: 1.5, color: 'var(--text-secondary)' }}>
              Proposed values disagree with existing targets. Confirm to save the proposal(s) and raise these
              conflicts. Cancel leaves nothing saved.
            </p>
          </div>
        </div>

        <div className="modal-body">
          <DataTable
            columns={COLUMNS}
            rows={conflicts}
            rowKey={(row) => `${row.entityName}-${row.entityKind}-${row.businessUnit ?? ''}-${row.year}-${row.month}`}
          />
        </div>

        <div className="modal-foot">
          <Button disabled={isBusy} onClick={onCancel}>Cancel</Button>
          <Button variant="accent" disabled={isBusy} onClick={onConfirm}>
            {isBusy ? 'Saving…' : 'Save with conflicts'}
          </Button>
        </div>
      </div>
    </div>
  );
}
