import { useState } from "react";
import { Button } from "@shared/components/Button/Button";
import { Field } from "@shared/components/Field/Field";
import { Badge } from "@shared/components/Badge/Badge";
import { LookupField } from "@shared/components/LookupField/LookupField";
import type { StrategyWizard } from "../../hooks/useStrategyWizard";
import { useOptions } from "../../hooks/useOptions";
import { searchKpis, listDepartments, listFunctionsByDepartment } from "../../services/referenceDataService";
import { countOutcomeKpis } from "../../services/strategyKpiService";

export function KpisStep({ wizard }: { wizard: StrategyWizard }) {
  const { core, kpis } = wizard.state;
  const [term, setTerm] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const departments = useOptions(listDepartments, []);
  const functions = useOptions(() => listFunctionsByDepartment(core.departmentId), [core.departmentId]);
  const options = useOptions(() => searchKpis(term, core.departmentId, core.functionId), [term, core.departmentId, core.functionId]);

  const outcomeCount = countOutcomeKpis(kpis);
  const outcomeOk = wizard.isServiceTrack || outcomeCount === 1;
  const existingKpiIds = new Set(kpis.map((k) => k.kpiId));
  const results = term.trim() ? options.filter((o) => !existingKpiIds.has(o.id)) : [];

  const automatedCount = kpis.filter((k) => k.automated).length;

  async function handleAdd(id: string, label: string) {
    setBusyId(id);
    try {
      await wizard.addKpi(id, label);
      setTerm("");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h3>KPI Assignment</h3>
          <div className="sub">Search all KPIs, optionally filter by department &amp; function. Exactly one Outcome KPI is required.</div>
        </div>
      </div>
      <div className="card-body">
        <div className="grid-2">
          <Field label="Department filter" hint="Locked to the strategy's own department.">
            <LookupField value={core.departmentId ?? ""} onChange={() => {}} options={departments} placeholder="All departments" disabled />
          </Field>
          <Field label="Function filter" hint="Locked to the strategy's own function.">
            <LookupField value={core.functionId ?? ""} onChange={() => {}} options={functions} placeholder="All functions" disabled />
          </Field>
        </div>

        <Field label="Add KPI">
          <input type="text" value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search KPIs…" />
        </Field>
        {results.length > 0 && (
          <div className="search-results">
            {results.map((o) => (
              <button
                key={o.id}
                type="button"
                className="search-result-row"
                disabled={busyId !== null}
                onClick={() => void handleAdd(o.id, o.label)}
              >
                {o.label}
              </button>
            ))}
          </div>
        )}

        <div className={`alert ${outcomeOk ? "alert-ok" : "alert-warn"}`}>
          {outcomeOk ? "✓ Exactly one Outcome KPI selected." : `Operational strategies require exactly one Outcome KPI (currently ${outcomeCount}).`}
        </div>

        {kpis.length === 0 ? (
          <div className="empty-state">
            <h4>No KPIs yet</h4>
          </div>
        ) : (
          kpis.map((k) => {
            const isPrimary = k.kpiId === core.primaryKpiId;
            const isOutcome = k.role === "Outcome";
            return (
              <div className="item" key={k.id}>
                <div className="item-head">
                  <span className={`kpi-role ${k.role.toLowerCase()}`}>{k.role}</span>
                  <span className="title">{k.kpiName}</span>
                  {k.automated ? <Badge status="auto">Automated</Badge> : <Badge status="manual">Manual</Badge>}
                </div>
                {(isPrimary || isOutcome) && (
                  <div className="meta">
                    <span>
                      {isPrimary
                        ? "Primary KPI — set on Objective & Strategy, can't be removed here"
                        : "Outcome KPI — auto-bound from the Main KPI, can't be removed here"}
                    </span>
                  </div>
                )}
              </div>
            );
          })
        )}

        {kpis.length > 0 && (
          <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>
            {automatedCount} automated · {kpis.length - automatedCount} manual
          </div>
        )}
      </div>
      <div className="card-foot">
        <Button onClick={wizard.goBack}>Back</Button>
        <Button variant="primary" disabled={!outcomeOk} onClick={wizard.goNext}>
          Continue
        </Button>
      </div>
    </div>
  );
}
