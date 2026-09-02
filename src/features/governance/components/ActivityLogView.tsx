import { FM_COLORS, FM_FONT, FM_RADIUS } from '@features/financial';

export function ActivityLogView() {
  return (
    <div
      style={{
        background: '#fff',
        border: `1px dashed ${FM_COLORS.border}`,
        borderRadius: FM_RADIUS.lg,
        padding: 48,
        textAlign: 'center',
        color: FM_COLORS.textSecondary,
      }}
    >
      <div style={{ fontSize: 28, marginBottom: 10 }}>🔒</div>
      <div style={{ fontSize: FM_FONT.sizeLg, fontWeight: 700, color: FM_COLORS.textPrimary }}>
        Activity Log — coming soon
      </div>
      <p style={{ maxWidth: 420, margin: '10px auto 0', fontSize: 13 }}>
        This tab will be a read-only audit trail once the <code>pm_activitylog</code> table is
        available in Dataverse. Nothing is written or displayed here yet.
      </p>
    </div>
  );
}
