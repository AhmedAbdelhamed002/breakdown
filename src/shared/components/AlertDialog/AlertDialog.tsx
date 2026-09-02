import React from 'react';

export type AlertDialogKind = 'success' | 'error' | 'info';

interface AlertDialogProps {
  open: boolean;
  kind?: AlertDialogKind;
  /** Defaults to a kind-appropriate title ("Success" / "Something went wrong" / "Notice"). */
  title?: string;
  message: string;
  onClose: () => void;
}

const ALERT_CLASS: Record<AlertDialogKind, string> = {
  success: 'alert-ok',
  error: 'alert-err',
  info: 'alert-info'
};

const DEFAULT_TITLE: Record<AlertDialogKind, string> = {
  success: 'Success',
  error: 'Something went wrong',
  info: 'Notice'
};

/**
 * AlertDialog — the app's own replacement for the browser's native `alert()`, which renders as a
 * generic "This page says" system popup inside the Power Apps player (unbranded, no styling, easy
 * to mistake for a platform error). Same backdrop/modal markup as ConflictConfirmDialog, so it
 * reads as part of this app rather than the browser chrome around it.
 */
export const AlertDialog: React.FC<AlertDialogProps> = ({ open, kind = 'info', title, message, onClose }) => {
  if (!open) return null;

  return (
    <div className="modal-backdrop">
      <div className="modal" role="alertdialog" aria-modal="true">
        <div className="modal-head">
          <b>{title ?? DEFAULT_TITLE[kind]}</b>
          <button className="btn btn-xs" onClick={onClose}>close</button>
        </div>
        <div className="modal-body">
          <div className={`alert ${ALERT_CLASS[kind]}`} style={{ marginBottom: 0, whiteSpace: 'pre-line' }}>
            {message}
          </div>
          <div className="btn-row" style={{ marginTop: '14px', justifyContent: 'flex-end' }}>
            <button className="btn btn-primary btn-sm" onClick={onClose} autoFocus>OK</button>
          </div>
        </div>
      </div>
    </div>
  );
};
