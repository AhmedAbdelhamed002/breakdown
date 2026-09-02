import React from 'react';

/** One disagreement the save is about to record. */
export interface PendingConflict {
  /** What the conflict is against — the KPI, Org Output or Org Outcome. */
  entityName: string;
  /** pm_conflicttype's label, so the reviewer reads the same words the record will carry. */
  conflictType: string;
  /** The approved target being undercut. */
  existingValue: number | null;
  /** What is about to be proposed instead. */
  proposedValue: number;
  /** Why this counts as a conflict, in one sentence. */
  reason: string;
  /** The month it applies to, when a save covers more than one. */
  monthLabel?: string;
}

interface ConflictConfirmDialogProps {
  open: boolean;
  /** What the save will do once confirmed, e.g. "Save 3 component proposals". */
  confirmLabel: string;
  conflicts: PendingConflict[];
  saving?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

const fmt = (value: number | null) =>
  value == null ? '—' : value.toLocaleString(undefined, { maximumFractionDigits: 2 });

/**
 * ConflictConfirmDialog — the last word before a save that will put a conflict on record.
 *
 * A proposal that undercuts an approved target isn't refused, but it isn't silent either: this
 * says which entity disagrees, by how much and why, and waits for the user to accept it. Cancel
 * leaves everything unsaved.
 */
export const ConflictConfirmDialog: React.FC<ConflictConfirmDialogProps> = ({
  open, confirmLabel, conflicts, saving, onCancel, onConfirm
}) => {
  if (!open || conflicts.length === 0) return null;

  return (
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-modal="true">
        <div className="modal-head">
          <b>
            {conflicts.length === 1
              ? 'This save raises a conflict'
              : `This save raises ${conflicts.length} conflicts`}
          </b>
          <button className="btn btn-xs" disabled={saving} onClick={onCancel}>close</button>
        </div>

        <div className="modal-body">
          <div className="alert alert-warn" style={{ marginBottom: '12px' }}>
            Saving is allowed — but each of these is recorded in the Conflicts table for review,
            and the proposal is flagged as conflicting.
          </div>

          <table className="data-table">
            <thead>
              <tr>
                <th>Entity</th>
                <th>Conflict</th>
                <th className="tright">Approved</th>
                <th className="tright">Proposed</th>
              </tr>
            </thead>
            <tbody>
              {conflicts.map((conflict, i) => (
                <tr key={`${conflict.entityName}-${conflict.monthLabel ?? ''}-${i}`}>
                  <td>
                    <b>{conflict.entityName}</b>
                    {conflict.monthLabel && <span className="muted"> · {conflict.monthLabel}</span>}
                    <div className="sub">{conflict.reason}</div>
                  </td>
                  <td><span className="pill">{conflict.conflictType}</span></td>
                  <td className="tright mono">{fmt(conflict.existingValue)}</td>
                  <td className="tright mono" style={{ color: 'var(--danger)' }}>{fmt(conflict.proposedValue)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="btn-row" style={{ marginTop: '14px', justifyContent: 'flex-end' }}>
            <button className="btn btn-sm" disabled={saving} onClick={onCancel}>Cancel — don't save</button>
            <button className="btn btn-primary btn-sm" disabled={saving} onClick={onConfirm}>
              {saving ? 'Saving…' : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
