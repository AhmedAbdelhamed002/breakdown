import { useEffect } from 'react';
import { Button } from '@shared/components/Button/Button';

export type NoticeTone = 'success' | 'warning' | 'error' | 'info';

export interface NoticeAction {
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'secondary';
}

export interface NoticeContent {
  title: string;
  message: string;
  tone?: NoticeTone;
  actions?: NoticeAction[];
}

interface NoticeModalProps extends NoticeContent {
  open: boolean;
  onClose: () => void;
  confirmLabel?: string;
}

const TONE: Record<NoticeTone, { icon: string; color: string; bg: string }> = {
  success: { icon: '✓', color: 'var(--success)', bg: 'var(--success-bg)' },
  warning: { icon: '!', color: 'var(--warning)', bg: 'var(--warning-bg)' },
  error: { icon: '✕', color: 'var(--danger)', bg: 'var(--danger-bg)' },
  info: { icon: 'i', color: 'var(--info)', bg: 'var(--info-bg)' },
};

export function NoticeModal({
  open,
  title,
  message,
  tone = 'info',
  onClose,
  confirmLabel = 'OK',
  actions,
}: NoticeModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const style = TONE[tone];

  return (
    <div className="modal-back" role="presentation">
      <div
        className="modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="fm-notice-title"
        aria-describedby="fm-notice-message"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-body">
          <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
            <div
              aria-hidden
              style={{
                width: 36,
                height: 36,
                borderRadius: 999,
                background: style.bg,
                color: style.color,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: 16,
                flexShrink: 0,
              }}
            >
              {style.icon}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div id="fm-notice-title" style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>
                {title}
              </div>
              <div id="fm-notice-message" style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>
                {message}
              </div>
            </div>
          </div>
        </div>
        <div className="modal-foot">
          {(actions && actions.length > 0
            ? actions
            : [{ label: confirmLabel, onClick: onClose, variant: 'primary' as const }]
          ).map((action) => (
            <Button
              key={action.label}
              variant={action.variant === 'secondary' ? 'default' : 'accent'}
              onClick={() => {
                onClose();
                action.onClick();
              }}
            >
              {action.label}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
