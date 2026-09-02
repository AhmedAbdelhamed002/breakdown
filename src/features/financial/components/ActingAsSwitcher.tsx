import { useActingRole } from '../providers/ActingRoleContext';

interface ActingAsSwitcherProps {
  variant?: 'light' | 'dark';
}

export function ActingAsSwitcher({ variant = 'light' }: ActingAsSwitcherProps) {
  const { activeRole, setActiveRole, roles } = useActingRole();
  const dark = variant === 'dark';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <span
        style={{
          fontSize: 13,
          color: dark ? 'rgba(255,255,255,0.75)' : 'var(--text-muted)',
          fontWeight: 500,
          whiteSpace: 'nowrap',
        }}
      >
        Acting as
      </span>
      <div className="seg">
        {roles.map((role) => (
          <button
            key={role}
            type="button"
            className={activeRole === role ? 'on' : undefined}
            onClick={() => setActiveRole(role)}
          >
            {role}
          </button>
        ))}
      </div>
    </div>
  );
}
