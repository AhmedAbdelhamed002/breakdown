/**
 * Exact-or-child match, not a blind prefix check. `pathname.startsWith(to)` alone is wrong once
 * one nav item's route is itself a prefix of another's — every page under it would then wrongly
 * show that item as active too.
 *
 * The boundary-checked version below (`pathname === to || pathname.startsWith(to + "/")`) still
 * isn't enough on its own if a nav item's own route were ever the literal parent segment of
 * unrelated sibling routes — pass `exact: true` for an item like that to require a literal match
 * instead. No current item needs it (each top-level module's bare route now redirects to its own
 * default sub-page rather than rendering content directly), but the flag stays available for the
 * next one that does.
 */
export function isActivePath(pathname: string, to: string, exact?: boolean): boolean {
  if (exact) return pathname === to;
  return pathname === to || pathname.startsWith(`${to}/`);
}

export interface NavItem {
  to?: string;
  label: string;
  /** Raw inline-SVG markup (rendered via dangerouslySetInnerHTML — values are developer-authored constants below, never user input). */
  icon?: string;
  /** Require a literal pathname match — set when `to` is itself a path segment shared by unrelated sibling routes. */
  exact?: boolean;
  /** Optional subtitle shown under the page title in the topbar when this item is active. */
  description?: string;
  children?: NavItem[];
}

export interface TopTab {
  key: string;
  to: string;
  label: string;
  /** Raw inline-SVG markup, same convention as NavItem.icon. */
  icon?: string;
}

/** Icons ported 1:1 from the legacy Strategy Formulation web resource's own sidebar markup. Exported so the app Home page can reuse the same glyphs its module cards link to. */
export const ICON = {
  strategy: '<svg viewBox="0 0 24 24"><path d="M3 11l9-7 9 7"/><path d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9"/></svg>',
  tree: '<svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16"/></svg>',
  align: '<svg viewBox="0 0 24 24"><path d="M3 12h18M12 3v18"/><circle cx="12" cy="12" r="9"/></svg>',
  exec: '<svg viewBox="0 0 24 24"><path d="M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>',
  cr: '<svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M9 10h6M9 13h4"/></svg>',
  themes: '<svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h10M4 17h7"/></svg>',
  create: '<svg viewBox="0 0 24 24"><path d="M12 19V5M5 12l7-7 7 7"/></svg>',
  list: '<svg viewBox="0 0 24 24"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>',
  unassigned: '<svg viewBox="0 0 24 24"><path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="9"/></svg>',
  unlinked:
    '<svg viewBox="0 0 24 24"><path d="M12 2v6M12 22v-6M4.9 4.9l4.2 4.2M14.9 14.9l4.2 4.2M2 12h6M16 12h6M4.9 19.1l4.2-4.2M14.9 9.1l4.2-4.2"/></svg>',
  proposals: '<svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M9 10h6M9 13h4"/></svg>',
  conflicts: '<svg viewBox="0 0 24 24"><path d="M12 9v4M12 17h.01"/><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/></svg>',
  compliance: '<svg viewBox="0 0 24 24"><path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="9"/></svg>',
  activity: '<svg viewBox="0 0 24 24"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>',
  gauge: '<svg viewBox="0 0 24 24"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
  shield: '<svg viewBox="0 0 24 24"><path d="M12 2 3 7v6c0 5 4 9 9 9s9-4 9-9V7z"/></svg>',
  setup: '<svg viewBox="0 0 24 24"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/><path d="M5 8h5M5 12h3"/></svg>',
};

/** The top-level module tabs shown in the header. */
export const TOP_TABS: TopTab[] = [
  { key: "obj", to: "/org-objectives", label: "Org Objectives", icon: ICON.align },
  { key: "strat", to: "/strategy-formulation", label: "Strategy Formulation", icon: ICON.strategy },
  { key: "pm", to: "/modeler-target-setting", label: "Modeler & Target Setting", icon: ICON.gauge },
  { key: "exec-mon", to: "/execution-monitoring", label: "Execution & Monitoring", icon: ICON.exec },
  { key: "gov", to: "/governance", label: "Governance", icon: ICON.shield },
];

/** Sidebar items shown under each top-level tab (keyed by TopTab.key). */
export const SIDE_NAV: Record<string, NavItem[]> = {
  obj: [],
  pm: [
    {
      label: "Target Setting",
      icon: "◎",
      children: [
        { to: "/modeler-target-setting/calendar", label: "Calendar Adjustment" },
        { to: "/modeler-target-setting/top-down-annual", label: "Top-down · Annual" },
        { to: "/modeler-target-setting/top-down-monthly", label: "Top-down · Monthly", description: "Build the month target on a model" },
        { to: "/modeler-target-setting/bottom-up", label: "Bottom-up" },
        { to: "/modeler-target-setting/breakdown", label: "Breakdown" },
        { to: "/modeler-target-setting/target-summary", label: "Target Summary" },
        { to: "/modeler-target-setting/org-target-summary", label: "Org Target Summary" },
      ]
    },
    {
      label: "Financial Modeler",
      icon: "▦",
      children: [
        { to: "/modeler-target-setting/financial-modeler/models", label: "Models" },
        { to: "/modeler-target-setting/financial-modeler/builder", label: "Builder / Tester" },
        { to: "/modeler-target-setting/financial-modeler/review", label: "Review & Sealing" },
        { to: "/modeler-target-setting/financial-modeler/ceilings", label: "KPI Ceilings" },
      ],
    },
  ],
  // Flat — no Top Down Flow / Bottom-Up Flow sub-groups. Every item sits at the same level,
  // directly under the Strategy Formulation tab.
  strat: [
    { to: "/strategy-formulation/home", label: "Strategy", icon: ICON.strategy },
    { to: "/strategy-formulation/strategy-setup", label: "Strategy Setup", icon: ICON.setup },
    { to: "/strategy-formulation/tree", label: "Strategy Tree", icon: ICON.tree },
    { to: "/strategy-formulation/list", label: "Strategy List", icon: ICON.list },
    { to: "/strategy-formulation/alignment", label: "Alignment Sessions", icon: ICON.align },
    { to: "/strategy-formulation/execution", label: "Strategy Execution", icon: ICON.exec },
    { to: "/strategy-formulation/monitoring", label: "Strategy Monitoring", icon: ICON.compliance },
    { to: "/strategy-formulation/change-requests", label: "Change Requests", icon: ICON.cr },
    { to: "/strategy-formulation/themes", label: "Themes", icon: ICON.themes },
    { to: "/strategy-formulation/unassigned", label: "Unassigned Tactics & POCs", icon: ICON.unassigned },
  ],
  // One page (ExecutionMonitoringPage) reading a :tab route param, same pattern as Governance below —
  // each item is a distinct route rendering that same page with a different sub-view.
  "exec-mon": [
    { to: "/execution-monitoring/overview", label: "Overview (gap)", icon: ICON.gauge },
    { to: "/execution-monitoring/exec", label: "Execution (plan)", icon: ICON.exec },
    { to: "/execution-monitoring/conclusion", label: "Weekly Conclusion", icon: ICON.activity },
    { to: "/execution-monitoring/breakdowns", label: "Breakdowns", icon: ICON.list },
    { to: "/execution-monitoring/plan", label: "Execution Plan", icon: ICON.setup },
    { to: "/execution-monitoring/monitor", label: "Monitoring", icon: ICON.compliance },
  ],
  // From the FinancialModeler branch's new Governance module — one page (GovernancePage) reading
  // a :tab route param, so each item below is a distinct route rendering that same page.
  gov: [
    { to: "/governance/proposals", label: "Proposals", icon: ICON.proposals },
    { to: "/governance/conflicts", label: "Conflicts", icon: ICON.conflicts },
    { to: "/governance/compliance", label: "Target Compliance", icon: ICON.compliance },
    { to: "/governance/activity", label: "Activity Log", icon: ICON.activity },
  ],
};
