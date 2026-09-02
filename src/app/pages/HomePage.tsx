import { useNavigate } from "react-router-dom";
import { ICON } from "../navigation/navItems";

interface QuickLink {
  label: string;
  to: string;
}

interface ModuleCard {
  key: string;
  label: string;
  icon: string;
  iconClass?: string;
  description: string;
  to: string;
  quickLinks: QuickLink[];
}

const MODULES: ModuleCard[] = [
  {
    key: "obj",
    label: "Org Objectives",
    icon: ICON.align,
    description:
      "Start of the planning hierarchy — cascade the organization's own Outcomes and Outputs down into department-owned Objectives that Strategies are then built against.",
    to: "/org-objectives",
    quickLinks: [{ label: "Open Org Objectives", to: "/org-objectives" }],
  },
  {
    key: "strat",
    label: "Strategy Formulation",
    icon: ICON.strategy,
    iconClass: "mod-strat",
    description:
      "Turn an Objective into a Strategy, then Tactics and POCs tied to KPIs and Financial Model Impact — top-down from the Strategy Tree, or bottom-up from unassigned items — through Review & Submit governance.",
    to: "/strategy-formulation/home",
    quickLinks: [
      { label: "Strategy Tree", to: "/strategy-formulation/tree" },
      { label: "Strategy Execution", to: "/strategy-formulation/execution" },
      { label: "Strategy Monitoring", to: "/strategy-formulation/monitoring" },
      { label: "Unassigned Tactics & POCs", to: "/strategy-formulation/unassigned" },
    ],
  },
  {
    key: "pm",
    label: "Modeler & Target Setting",
    icon: ICON.gauge,
    iconClass: "mod-pm",
    description:
      "Build the Financial Models (equations and relations) that turn a driver KPI's movement into a result, then set monthly/annual targets from them — Top-down, Bottom-up, and Breakdown.",
    to: "/modeler-target-setting/calendar",
    quickLinks: [
      { label: "Top-down · Monthly", to: "/modeler-target-setting/top-down-monthly" },
      { label: "Bottom-up", to: "/modeler-target-setting/bottom-up" },
      { label: "Financial Modeler", to: "/modeler-target-setting/financial-modeler/models" },
      { label: "Target Summary", to: "/modeler-target-setting/target-summary" },
    ],
  },
  {
    key: "exec-mon",
    label: "Execution & Monitoring",
    icon: ICON.exec,
    iconClass: "mod-exec",
    description:
      "Where a Strategy's plan meets the numbers — see each KPI's gap to target and what its POCs/Tactics are expected to close it, break the work into weekly tasks, and track it through to conclusion.",
    to: "/execution-monitoring/overview",
    quickLinks: [{ label: "Overview (gap)", to: "/execution-monitoring/overview" }],
  },
  {
    key: "gov",
    label: "Governance",
    icon: ICON.shield,
    iconClass: "mod-gov",
    description:
      "Where target-setting is checked — review Proposals and Conflicts raised elsewhere in the app, track Target Compliance, and audit every change in the Activity Log.",
    to: "/governance/proposals",
    quickLinks: [
      { label: "Proposals", to: "/governance/proposals" },
      { label: "Conflicts", to: "/governance/conflicts" },
      { label: "Target Compliance", to: "/governance/compliance" },
      { label: "Activity Log", to: "/governance/activity" },
    ],
  },
];

function ModuleTile({ mod, step }: { mod: ModuleCard; step: number }) {
  const navigate = useNavigate();
  return (
    <div className="home-module-card" onClick={() => navigate(mod.to)}>
      <span className="home-step-badge">{String(step).padStart(2, "0")}</span>
      <div className="home-module-head">
        <div className={`home-tile-icon ${mod.iconClass ?? ""}`}>
          <svg viewBox="0 0 24 24" dangerouslySetInnerHTML={{ __html: mod.icon }} />
        </div>
        <h3 className="home-module-title">{mod.label}</h3>
      </div>
      <p className="home-module-desc">{mod.description}</p>
      <div className="home-quicklinks">
        {mod.quickLinks.map((link) => (
          <a
            key={link.to}
            href={link.to}
            className="home-quicklink"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              navigate(link.to);
            }}
          >
            {link.label} →
          </a>
        ))}
      </div>
    </div>
  );
}

/**
 * The app's own landing page — reached on first load and via the header logo. Orients a new user
 * (what this app covers, in what order) and gets anyone to any of the four main modules and their
 * most-used screens in one click, without needing to already know the top nav's structure. The
 * planning cycle's order is conveyed structurally (a step number per card, left to right) rather
 * than with an explanatory paragraph.
 */
export function HomePage() {
  return (
    <div style={{ padding: 24 }}>
      <div className="home-hero">
        <h2>Welcome to Andalusia Pulse — Planning &amp; Monitoring</h2>
      </div>

      <div className="home-module-grid">
        {MODULES.map((mod, i) => (
          <ModuleTile key={mod.key} mod={mod} step={i + 1} />
        ))}
      </div>
    </div>
  );
}
