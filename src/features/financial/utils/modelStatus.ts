import type { BadgeStatus } from '@shared/components/Badge/Badge';
import type { FinancialModel, ModelStatus } from '../models/types';

const BADGE_BY_STATUS: Record<ModelStatus, BadgeStatus> = {
  Draft: 'draft',
  'In Review': 'review',
  'Approved By Finance': 'approved',
  Sealed: 'sealed',
  Returned: 'returned',
  Superseded: 'superseded',
  Retired: 'retired',
};

const LABEL_BY_STATUS: Partial<Record<ModelStatus, string>> = {
  'In Review': 'Under Review',
};

/** Display label + shared Badge status for a model's `statuscode`/`statusLabel`. */
export function getModelStatusInfo(model: FinancialModel): { label: string; badge: BadgeStatus } {
  const code = (model.statuscode as ModelStatus) || 'Draft';
  return {
    label: model.statusLabel || LABEL_BY_STATUS[code] || code,
    badge: BADGE_BY_STATUS[code] ?? 'draft',
  };
}
