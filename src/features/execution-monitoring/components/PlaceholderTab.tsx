import { EmptyState } from "@shared/components/EmptyState/EmptyState";

/** Shown for the sub-tabs not yet built in this pass — see the plan's own scoping note: each of
 * these needs its own new data model (root causes, weekly TMS tasks with an execution/conclusion
 * phase) worth a separate, focused pass rather than guessing it alongside Overview (gap). */
export function PlaceholderTab({ label }: { label: string }) {
  return (
    <div className="card">
      <div className="card-head">
        <h3>{label}</h3>
      </div>
      <div className="card-body">
        <EmptyState
          title="Not built yet"
          description="This sub-tab is part of the Execution & Monitoring nav shell, but its own data model hasn't been scoped and built yet."
        />
      </div>
    </div>
  );
}
