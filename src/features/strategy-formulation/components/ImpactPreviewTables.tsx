import type { PocImpactPreview } from "@infrastructure/financialImpact/PocImpactService";

export const fmt = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: 2 });

export const IMPACT_ROLE_LABEL: Record<string, string> = {
  driver: "Driver",
  component: "Component",
  result: "Result",
  "outcome-component": "Component",
  "outcome-result": "Result",
};

/** Green when it moved up, red when it moved down, muted when it didn't move at all — same
 * before/after-delta color convention used across every Impact preview. */
export function deltaColor(change: number): string {
  if (change > 0) return "var(--success)";
  if (change < 0) return "var(--danger)";
  return "var(--text-muted)";
}

/** One row of a Financial Model / Outcome Impact table. The Result row (this preview's actual
 * takeaway number) is bolded so it doesn't read the same as the inputs that fed it; a Component
 * row that didn't move at all is muted so the eye lands on what actually changed. */
export function ImpactRow({ row }: { row: PocImpactPreview["kpiImpacts"][number] }) {
  const isKeyRow = row.role === "result" || row.role === "outcome-result";
  const unchanged = row.role !== "driver" && row.change === 0;
  const color = deltaColor(row.change);
  return (
    <tr style={unchanged ? { color: "var(--text-muted)" } : undefined}>
      <td style={isKeyRow ? { fontWeight: 700 } : undefined}>{row.kpiName}</td>
      <td>{row.kpiType ?? "—"}</td>
      <td>
        <span className="pill">{IMPACT_ROLE_LABEL[row.role] ?? row.role}</span>
      </td>
      <td className="tright mono">{fmt(row.before)}</td>
      <td className="tright mono" style={isKeyRow ? { fontWeight: 700, color: "var(--text-primary)" } : undefined}>
        {fmt(row.after)}
      </td>
      <td className="tright mono" style={{ color }}>
        {row.change > 0 ? "+" : ""}
        {fmt(row.change)}
      </td>
      <td className="tright mono" style={{ color }}>
        {row.changePercent == null ? "—" : `${row.changePercent >= 0 ? "+" : ""}${row.changePercent}%`}
      </td>
    </tr>
  );
}

export function ImpactTable({ rows }: { rows: PocImpactPreview["kpiImpacts"] }) {
  return (
    <div style={{ overflowX: "auto", marginBottom: 14 }}>
      <table className="data-table">
        <thead>
          <tr>
            <th>KPI</th>
            <th>Type</th>
            <th>Role</th>
            <th className="tright">Before</th>
            <th className="tright">After</th>
            <th className="tright">Change</th>
            <th className="tright">Change %</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <ImpactRow key={`${row.role}-${row.kpiId}`} row={row} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The "Driver KPI Impact" / "Financial Model Impact" / "Outcome Impact" tables for one calculated
 * preview — factored out so it can render once for a Non-Group item and once per Business Unit for
 * a Group item without duplicating this markup. Shared by POC Impact and Tactic Impact. */
export function ImpactPreviewTables({
  preview,
  driverName,
  currentValue,
  newValue,
  sectionPrefix = "",
}: {
  preview: PocImpactPreview;
  driverName: string;
  currentValue: number;
  newValue: number;
  sectionPrefix?: string;
}) {
  return (
    <>
      <div className="section-label">{sectionPrefix}Driver KPI Impact</div>
      <div className="resultbox" style={{ marginBottom: 14 }}>
        <div>
          <div className="sub">{driverName}</div>
          <div className="stat">
            {fmt(currentValue)} → {fmt(newValue)}{" "}
            <span style={{ color: deltaColor(preview.driverDelta) }}>
              ({preview.driverDelta >= 0 ? "+" : ""}
              {fmt(preview.driverDelta)})
            </span>
          </div>
        </div>
      </div>

      <div className="section-label">{sectionPrefix}Financial Model Impact</div>
      <ImpactTable rows={preview.kpiImpacts.filter((row) => row.role === "driver" || row.role === "component" || row.role === "result")} />

      {preview.kpiImpacts.some((row) => row.role === "outcome-component" || row.role === "outcome-result") && (
        <>
          <div className="section-label">{sectionPrefix}Outcome Impact</div>
          <div className="muted" style={{ fontSize: 11.5, marginBottom: 6 }}>
            Calculated impact — Outcome KPIs are never selectable as a Driver KPI, but the effect on them still shows here when they're part of this chain.
          </div>
          <ImpactTable rows={preview.kpiImpacts.filter((row) => row.role === "outcome-component" || row.role === "outcome-result")} />
        </>
      )}
    </>
  );
}
