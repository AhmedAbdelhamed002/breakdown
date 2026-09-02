import type { ActingRole } from '@features/financial';

export const CAN = {
  approveProposal: (role: ActingRole) => role === 'Finance',
} as const;
