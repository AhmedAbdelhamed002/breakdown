/** Icon glyphs for ImpactStepHeader — inline SVG paths, same convention as navItems.ts's own ICON constants. */
export const IMPACT_STEP_ICONS = {
  existing: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>',
  configure:
    '<circle cx="12" cy="12" r="3"/><path d="M12 1v6m0 10v6M4.2 4.2l4.2 4.2m7.2 7.2l4.2 4.2M1 12h6m10 0h6M4.2 19.8l4.2-4.2m7.2-7.2l4.2-4.2"/>',
};

interface Props {
  step: number;
  icon: string;
  label: string;
}

/**
 * A numbered section header ("1. Existing Impact", "2. Configure New Impact") for the Link
 * Financial Model & Calculate Impact dialogs — purely presentational, shared so both POC and
 * Tactic Impact read identically.
 */
export function ImpactStepHeader({ step, icon, label }: Props) {
  return (
    <div className="impact-step-header">
      <span className="icon">
        <svg viewBox="0 0 24 24" dangerouslySetInnerHTML={{ __html: icon }} />
      </span>
      <span>
        {step}. {label}
      </span>
    </div>
  );
}
