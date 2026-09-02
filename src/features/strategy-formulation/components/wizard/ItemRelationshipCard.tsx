import { useState, type ReactNode } from "react";
import type { ImpactRecordSummary } from "../../hooks/useItemImpactSummaries";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export interface RelationshipChip {
  label: string;
  /** Rendered as a muted placeholder chip (e.g. "No Financial Model linked yet") rather than the item's actual value. */
  empty?: boolean;
}

export interface ItemStat {
  label: string;
  value: ReactNode;
}

interface Props {
  kind: "Tactic" | "Poc";
  name: string;
  /** KPI -> Driver KPI (when it differs) -> Financial Model, already resolved to display strings by the caller. */
  trail: RelationshipChip[];
  hasImpact: boolean;
  stats: ItemStat[];
  /** Secondary facts (category, assignee, process, region/specialty…) — collapsed by default. */
  details?: ItemStat[];
  /** Every Impact record for this item — shown as a table under "More details", collapsed by default. */
  impactRecords?: ImpactRecordSummary[];
  /** Edit/Impact/Remove buttons in Tactics & POCs; omitted for a read-only summary in Review & Submit. */
  actions?: ReactNode;
}

/**
 * KPI -> Driver KPI (only when it actually differs) -> Financial Model, as display chips — the
 * one place both Tactics & POCs and Review & Submit build a card's relationship trail, so they
 * stay identical.
 */
export function buildRelationshipTrail(
  kpiName: string | undefined,
  driverKpiName: string | undefined,
  financialModelName: string | undefined
): RelationshipChip[] {
  const chips: RelationshipChip[] = [{ label: kpiName || "No KPI linked", empty: !kpiName }];
  if (driverKpiName && driverKpiName !== kpiName) chips.push({ label: driverKpiName });
  chips.push({ label: financialModelName || "No Financial Model linked yet", empty: !financialModelName });
  return chips;
}

/**
 * One Tactic/POC's own relationship card — used identically by the Tactics & POCs step (with
 * actions) and Review & Submit (read-only, actions omitted) so both screens present the same
 * KPI -> Financial Model relationship and Impact status the same way.
 */
export function ItemRelationshipCard({ kind, name, trail, hasImpact, stats, details, impactRecords, actions }: Props) {
  const [expanded, setExpanded] = useState(false);
  const hasDetails = (details && details.length > 0) || (impactRecords && impactRecords.length > 0);

  return (
    <div className="item">
      <div className="item-head">
        <span className={`badge ${kind === "Tactic" ? "track-op" : "track-sv"}`}>{kind}</span>
        <span className="title">{name || "(unnamed)"}</span>
        <span className={`impact-status ${hasImpact ? "linked" : "unlinked"}`}>{hasImpact ? "✓ Impact Applied" : "No Impact yet"}</span>
        {actions}
      </div>

      {trail.length > 0 && (
        <div className="rel-trail">
          {trail.map((chip, i) => (
            <span key={i} style={{ display: "contents" }}>
              {i > 0 && <span className="rel-arrow" aria-hidden="true">→</span>}
              <span className={`rel-chip${chip.empty ? " empty" : ""}`}>{chip.label}</span>
            </span>
          ))}
        </div>
      )}

      {stats.length > 0 && (
        <div className="stat-chip-row">
          {stats.map((s, i) => (
            <div className="stat-chip" key={i}>
              <span className="label">{s.label}</span>
              <span className="value">{s.value}</span>
            </div>
          ))}
        </div>
      )}

      {hasDetails && (
        <>
          <button type="button" className="btn btn-xs" onClick={() => setExpanded((v) => !v)} style={{ marginTop: 4 }}>
            {expanded ? "Hide details ▲" : "More details ▼"}
          </button>
          {expanded && (
            <>
              {details && details.length > 0 && (
                <div className="meta" style={{ marginTop: 8 }}>
                  {details.map((d, i) => (
                    <span key={i}>
                      {d.label}: <b>{d.value}</b>
                    </span>
                  ))}
                </div>
              )}

              {impactRecords && impactRecords.length > 0 && (
                <>
                  <div className="section-label" style={{ marginTop: 12 }}>
                    {kind === "Poc" ? "POC Impact" : "Tactic Impact"} ({impactRecords.length})
                  </div>
                  <table className="data-table" style={{ marginTop: 4 }}>
                    <thead>
                      <tr>
                        <th>Business Unit</th>
                        <th>Period</th>
                        <th className="tright">Driver New Value</th>
                        <th>Detail</th>
                      </tr>
                    </thead>
                    <tbody>
                      {impactRecords.map((r) => (
                        <tr key={r.id}>
                          <td>{r.buName ?? r.buId ?? "—"}</td>
                          <td>{r.month ? `${MONTHS[r.month - 1]} ${r.year}` : "—"}</td>
                          <td className="tright mono">{r.driverNewValue != null ? r.driverNewValue.toLocaleString() : "—"}</td>
                          <td className="muted" style={{ fontSize: 11.5 }}>{r.summary ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
