import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type { ActingRole } from '../models/types';

const ACTING_ROLES: ActingRole[] = ['Dept Owner', 'Finance', 'BI', 'Function Mgr'];

interface ActingRoleContextValue {
  activeRole: ActingRole;
  setActiveRole: (role: ActingRole) => void;
  roles: ActingRole[];
}

const ActingRoleContext = createContext<ActingRoleContextValue | null>(null);

export function ActingRoleProvider({ children }: { children: ReactNode }) {
  const [activeRole, setActiveRole] = useState<ActingRole>('Finance');
  const value = useMemo(
    () => ({ activeRole, setActiveRole, roles: ACTING_ROLES }),
    [activeRole]
  );
  return <ActingRoleContext.Provider value={value}>{children}</ActingRoleContext.Provider>;
}

export function useActingRole(): ActingRoleContextValue {
  const ctx = useContext(ActingRoleContext);
  if (!ctx) {
    throw new Error('useActingRole must be used within ActingRoleProvider');
  }
  return ctx;
}
