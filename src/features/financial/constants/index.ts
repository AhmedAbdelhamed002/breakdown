// ── Design tokens for the Financial Modeler ──
// Aliases onto the app's real theme (src/shared/styles/tokens.css /
// components.css) so Financial matches the rest of the app. Keys are kept
// stable because other features (e.g. Governance) import this module.

export const FM_COLORS = {
  // Page background
  pageBg: 'var(--bg)',
  // Card / panel background
  cardBg: 'var(--surface)',
  // Section header background
  sectionHeaderBg: 'var(--brand-black)',
  sectionHeaderText: '#ffffff',
  // Info banner background
  infoBannerBg: 'var(--primary-faint)',
  infoBannerText: 'var(--primary-dark)',
  // Warning banner
  warningBannerBg: 'var(--warning-bg)',
  warningBannerText: 'var(--warning)',
  // Accent / brand gold
  accent: 'var(--primary)',
  accentHover: 'var(--primary-dark)',
  // Status badges
  statusSealed: 'var(--primary)',
  statusSealedBg: 'var(--primary-faint)',
  statusDraft: 'var(--success)',
  statusDraftBg: 'var(--success-bg)',
  statusInReview: 'var(--info)',
  statusInReviewBg: 'var(--info-bg)',
  statusReturned: 'var(--danger)',
  statusReturnedBg: 'var(--danger-bg)',
  // Type badges (Equation/Relation)
  typeRelation: 'var(--primary-dark)',
  typeRelationBg: 'var(--primary-faint)',
  typeEquation: 'var(--accent)',
  typeEquationBg: 'var(--accent-faint)',
  // Text
  textPrimary: 'var(--text-primary)',
  textSecondary: 'var(--text-secondary)',
  textMuted: 'var(--text-muted)',
  // Borders
  border: 'var(--border)',
  borderLight: 'var(--border-light)',
  // Role chips
  roleFinance: 'var(--brand-black)',
  roleFinanceBg: 'var(--brand-black)',
  roleFinanceText: '#ffffff',
  roleBI: 'var(--primary)',
  roleBIText: '#ffffff',
  roleDeptOwner: 'var(--surface)',
  roleDeptOwnerBorder: 'var(--border)',
  roleFuncMgr: 'var(--surface)',
  roleFuncMgrBorder: 'var(--border)',
  // Table
  tableHeaderBg: 'var(--bg-secondary)',
  tableRowHover: 'var(--surface-hover)',
  // Positive / negative deltas
  positive: 'var(--success)',
  negative: 'var(--danger)',
  // No org link badge
  noOrgLink: 'var(--danger)',
  noOrgLinkBg: 'var(--danger-bg)',
} as const;

export const FM_RADIUS = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
} as const;

export const FM_SHADOW = {
  card: 'var(--shadow)',
  elevated: 'var(--shadow-md)',
  dropdown: 'var(--shadow-lg)',
} as const;

export const FM_FONT = {
  family: 'var(--font-sans)',
  headingFamily: 'var(--font-serif)',
  sizeXs: 11,
  sizeSm: 12,
  sizeMd: 13,
  sizeLg: 14,
  sizeXl: 16,
  sizeTitle: 20,
  sizeHeading: 24,
  weightNormal: 400,
  weightMedium: 500,
  weightSemibold: 600,
  weightBold: 700,
} as const;

export const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

/** Month labels 1–12 */
export const MONTH_LABELS: Record<number, string> = {
  1: 'January', 2: 'February', 3: 'March', 4: 'April',
  5: 'May', 6: 'June', 7: 'July', 8: 'August',
  9: 'September', 10: 'October', 11: 'November', 12: 'December',
};

/** Operator display characters */
export const OPERATOR_LABELS: Record<string, string> = {
  '×': '×',
  '÷': '÷',
  '+': '+',
  '−': '−',
};
