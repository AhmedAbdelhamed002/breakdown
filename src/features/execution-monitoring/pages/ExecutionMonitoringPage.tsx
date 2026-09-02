import { useParams } from "react-router-dom";
import { useExecutionMonitoringFilters } from "../hooks/useExecutionMonitoringFilters";
import { OverviewGapTab } from "../components/OverviewGapTab";
import { ExecutionPlanTab } from "../components/ExecutionPlanTab";
import { BreakdownsTab } from "../components/BreakdownsTab";
import { PlaceholderTab } from "../components/PlaceholderTab";

const TAB_LABELS: Record<string, string> = {
  overview: "Overview (gap)",
  exec: "Execution (plan)",
  conclusion: "Weekly Conclusion",
  breakdowns: "Breakdowns",
  plan: "Execution Plan",
  monitor: "Monitoring",
};

export function ExecutionMonitoringPage() {
  const { tab: tabParam } = useParams();
  const tab = tabParam && tabParam in TAB_LABELS ? tabParam : "overview";
  // Shared across every sub-tab so switching tabs (e.g. after "Add POCs/Tactics →") keeps the same
  // Department/Function/Business Unit/Month/Year the user was already looking at.
  const filters = useExecutionMonitoringFilters();

  return (
    <div style={{ padding: 24 }}>
      {tab === "overview" ? (
        <OverviewGapTab filters={filters} />
      ) : tab === "exec" ? (
        <ExecutionPlanTab filters={filters} />
      ) : tab === "breakdowns" ? (
        <BreakdownsTab filters={filters} />
      ) : (
        <PlaceholderTab label={TAB_LABELS[tab]} />
      )}
    </div>
  );
}
