import { useState } from "react";
import { Button } from "@shared/components/Button/Button";
import { Loading } from "@shared/components/Loading/Loading";
import { ErrorState } from "@shared/components/ErrorState/ErrorState";
import { EmptyState } from "@shared/components/EmptyState/EmptyState";
import { ContextBar, AddPocTacticFlow, useKpiPocTacticImpacts } from "@features/target-setting";
import type { Poc, Tactic } from "@features/strategy-formulation";
import type { ExecutionMonitoringFilters } from "../hooks/useExecutionMonitoringFilters";
import { useExecutionPlan, type ExecutionPlanKpi } from "../hooks/useExecutionPlan";
import { AddExecutionPocTacticFlow } from "./AddExecutionPocTacticFlow";
import { TaskTree } from "./TaskTree";

const fmt = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString(undefined, { maximumFractionDigits: 2 }));

function isPoc(item: Poc | Tactic): item is Poc {
  return "strategyKpiId" in item && !("driverKpiId" in item);
}

/** One POC/Tactic item — identity, its own related/driver KPI trail, and its task tree.
 * `kpiId` is always the real KPI this item is shown under on this tab (the surrounding KpiCard's
 * own id) — NOT item.strategyKpiId, which is the Strategy-KPI junction record's id, a different
 * table (stf_strategykpis) than the one objectiv_MainDepartmentKPI binds to (strategy_kpises);
 * sending the junction id there 404s ("Entity 'strategy_KPIS' ... Does Not Exist"). */
function ItemCard({
  item,
  kpiId,
  kpiAchievementId,
  businessUnitId,
  month,
  year,
}: {
  item: Poc | Tactic;
  kpiId: string;
  kpiAchievementId?: string;
  businessUnitId: string;
  month: number;
  year: number;
}) {
  const kind = isPoc(item) ? "Poc" : "Tactic";
  const kpiTrail = item.strategyKpiName ?? item.kpiName;
  return (
    <div className="item" style={{ margin: "6px 0", padding: 8, borderRadius: 8, border: "1px solid var(--border)" }}>
      <div className="item-head" style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <span className="pill">{kind === "Tactic" ? "Tactic" : "POC"}</span>
        <span className="title">
          <b>{item.name}</b>
        </span>
        {kpiTrail && (
          <span className="muted" style={{ fontSize: 11.5 }}>
            driver: {kpiTrail}
          </span>
        )}
      </div>
      <TaskTree
        kind={kind}
        itemId={item.id}
        itemName={item.name}
        kpiId={kpiId}
        processId={isPoc(item) ? undefined : item.processId}
        kpiAchievementId={kpiAchievementId}
        businessUnitId={businessUnitId}
        month={month}
        year={year}
      />
    </div>
  );
}

/** An Output KPI's own POCs/Tactics — used from within the Output-KPI-direct add flow too, since
 * that one already has its own eligible/connected state via useKpiPocTacticImpacts at the page level. */
function PocTacticList({
  pocs,
  tactics,
  kpiId,
  kpiAchievementId,
  businessUnitId,
  month,
  year,
  onAddClick,
  addLabel,
}: {
  pocs: Poc[];
  tactics: Tactic[];
  kpiId: string;
  kpiAchievementId?: string;
  businessUnitId: string;
  month: number;
  year: number;
  onAddClick: () => void;
  addLabel: string;
}) {
  const items: (Poc | Tactic)[] = [...pocs, ...tactics];
  return (
    <div>
      <div className="section-label" style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span>POCs / Tactics</span>
        <Button size="xs" variant="primary" onClick={onAddClick}>
          {addLabel}
        </Button>
      </div>
      {items.length === 0 ? (
        <div className="muted" style={{ fontSize: 12 }}>None yet.</div>
      ) : (
        items.map((item) => (
          <ItemCard
            key={item.id}
            item={item}
            kpiId={kpiId}
            kpiAchievementId={kpiAchievementId}
            businessUnitId={businessUnitId}
            month={month}
            year={year}
          />
        ))
      )}
    </div>
  );
}

function KpiCard({
  kpi,
  open,
  onToggle,
  onAddOutput,
  onAddProcess,
  businessUnitId,
  month,
  year,
}: {
  kpi: ExecutionPlanKpi;
  open: boolean;
  onToggle: () => void;
  onAddOutput: (kpi: ExecutionPlanKpi) => void;
  onAddProcess: (kpi: ExecutionPlanKpi) => void;
  businessUnitId: string;
  month: number;
  year: number;
}) {
  const gapBad = kpi.gap?.gap != null && kpi.gap.gap > 0;
  const badge = kpi.isOutput ? (
    <span className={`badge ${gapBad ? "st-returned" : "st-approved"}`}>{gapBad ? "gap" : "covered"}</span>
  ) : kpi.achievement ? (
    <span className={`badge ${kpi.achievement.cls}`}>{kpi.achievement.pct != null ? `${kpi.achievement.pct}%` : "—"}</span>
  ) : null;

  const subLine = kpi.isOutput
    ? `target ${fmt(kpi.gap?.target)} · needed growth ${kpi.gap?.pctGrowth != null ? `${kpi.gap.pctGrowth}%` : "—"} · expected ${fmt(kpi.gap?.impact)}${kpi.breakdownRows.length ? ` · ${kpi.breakdownRows.length} breakdowns` : ""}`
    : kpi.achievement
      ? `target ${fmt(kpi.achievement.target)} · actual ${fmt(kpi.achievement.actual)}`
      : "";

  return (
    <div className="card">
      <div className="card-head between" style={{ cursor: "pointer" }} onClick={onToggle}>
        <div>
          <h3>
            {kpi.name} <span className="pill">{kpi.type ?? "—"}</span>
          </h3>
          <div className="sub">{subLine}</div>
        </div>
        <div className="flex" style={{ gap: 10, alignItems: "center" }}>
          {badge}
          <span>{open ? "▾" : "▸"}</span>
        </div>
      </div>
      {open && (
        <div className="card-body">
          {kpi.isOutput ? (
            <>
              {kpi.gap && gapBad && (
                <div className="alert alert-warn" style={{ marginBottom: 8 }}>
                  Needed growth {kpi.gap.pctGrowth}% · expected impact {fmt(kpi.gap.impact)} ·{" "}
                  <b style={{ color: "var(--danger)" }}>{fmt(kpi.gap.gap)} short</b> — add POCs/Tactics to cover it.
                </div>
              )}
              {kpi.breakdownRows.length > 0 && (
                <>
                  <div className="section-label">Breakdowns</div>
                  {kpi.breakdownRows.map((b) => (
                    <div key={b.id} className="meta" style={{ display: "flex", gap: 10, marginBottom: 2 }}>
                      <span className="pill">{b.dimension}</span>
                      <span>{b.name}</span>
                      <span className="muted">
                        target {fmt(b.target)}
                        {b.actualRecorded ? ` · actual ${fmt(b.actual)}` : ""}
                      </span>
                    </div>
                  ))}
                </>
              )}
              <PocTacticList
                pocs={kpi.pocs}
                tactics={kpi.tactics}
                kpiId={kpi.id}
                kpiAchievementId={kpi.achievementId}
                businessUnitId={businessUnitId}
                month={month}
                year={year}
                onAddClick={() => onAddOutput(kpi)}
                addLabel="+ POC / Tactic"
              />
            </>
          ) : kpi.isProcess ? (
            <>
              <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
                Add a POC/Tactic here — its <b>driver is this process KPI</b>. You'll pick the Output KPI it's appended to in the popup.
              </div>
              <PocTacticList
                pocs={kpi.pocs}
                tactics={kpi.tactics}
                kpiId={kpi.id}
                kpiAchievementId={kpi.achievementId}
                businessUnitId={businessUnitId}
                month={month}
                year={year}
                onAddClick={() => onAddProcess(kpi)}
                addLabel="+ POC / Tactic on this process KPI"
              />
            </>
          ) : kpi.breakdownRows.length > 0 ? (
            <>
              <div className="section-label">Breakdowns</div>
              {kpi.breakdownRows.map((b) => (
                <div key={b.id} className="meta" style={{ display: "flex", gap: 10, marginBottom: 2 }}>
                  <span className="pill">{b.dimension}</span>
                  <span>{b.name}</span>
                  <span className="muted">
                    target {fmt(b.target)}
                    {b.actualRecorded ? ` · actual ${fmt(b.actual)}` : ""}
                  </span>
                </div>
              ))}
            </>
          ) : (
            <div className="muted" style={{ fontSize: 12 }}>
              {kpi.type ?? "This"} KPI — view only here. POCs/Tactics attach to Output or Process KPIs.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ExecutionPlanTab({ filters }: { filters: ExecutionMonitoringFilters }) {
  const { departmentId, setDepartmentId, functionId, setFunctionId, businessUnitId, setBusinessUnitId, month, setMonth, year, setYear } = filters;
  const { kpis, loading, error, reload } = useExecutionPlan(departmentId, functionId, businessUnitId, month, year);
  const [openKpi, setOpenKpi] = useState<Record<string, boolean>>({});
  const [addForOutput, setAddForOutput] = useState<ExecutionPlanKpi | null>(null);
  const [addForProcess, setAddForProcess] = useState<ExecutionPlanKpi | null>(null);

  // The Output-KPI-direct add flow needs its own eligible/connected state, same as Top-down Annual —
  // scoped to whichever Output KPI's "+ POC / Tactic" was just clicked (undefined otherwise).
  const { eligible, loading: eligibleLoading } = useKpiPocTacticImpacts(addForOutput?.id, businessUnitId);

  function toggle(id: string) {
    setOpenKpi((prev) => ({ ...prev, [id]: prev[id] === false ? true : prev[id] === undefined ? false : true }));
  }
  const isOpen = (id: string) => openKpi[id] !== false;

  function handleDone() {
    setAddForOutput(null);
    setAddForProcess(null);
    reload();
  }

  return (
    <div>
      <ContextBar
        departmentId={departmentId}
        setDepartmentId={setDepartmentId}
        functionId={functionId}
        setFunctionId={setFunctionId}
        businessUnitId={businessUnitId}
        setBusinessUnitId={setBusinessUnitId}
        month={month}
        setMonth={setMonth}
        year={year}
        setYear={setYear}
      />
      <div className="alert alert-info" style={{ marginTop: 12 }}>
        <b>Execution Plan — create the work.</b> All your KPIs are shown (outcome → output → process). On an Output KPI, expand a
        breakdown row and add POCs/Tactics (full impact dialog), then break into tasks. On a Process KPI, add a POC/Tactic whose driver
        is that process KPI and link it to an Output KPI in the popup (it's appended to that KPI's strategy).
      </div>

      {loading ? (
        <Loading label="Loading execution plan…" />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !businessUnitId ? (
        <div className="card" style={{ marginTop: 12 }}>
          <div className="card-body">
            <EmptyState title="Select a Business Unit" description="Pick a Business Unit above to see the execution plan." />
          </div>
        </div>
      ) : kpis.length === 0 ? (
        <div className="card" style={{ marginTop: 12 }}>
          <div className="card-body">
            <EmptyState title="No KPIs for this selection" />
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 12 }}>
          {kpis.map((kpi) => (
            <KpiCard
              key={kpi.id}
              kpi={kpi}
              open={isOpen(kpi.id)}
              onToggle={() => toggle(kpi.id)}
              onAddOutput={setAddForOutput}
              onAddProcess={setAddForProcess}
              businessUnitId={businessUnitId}
              month={month}
              year={year}
            />
          ))}
        </div>
      )}

      {addForOutput && (
        <AddPocTacticFlow
          kpiId={addForOutput.id}
          kpiName={addForOutput.name}
          departmentId={departmentId}
          functionId={functionId || undefined}
          businessUnitId={businessUnitId}
          eligible={eligible}
          eligibleLoading={eligibleLoading}
          onDone={handleDone}
          onClose={() => setAddForOutput(null)}
        />
      )}
      {addForProcess && (
        <AddExecutionPocTacticFlow
          processKpiId={addForProcess.id}
          processKpiName={addForProcess.name}
          departmentId={departmentId}
          functionId={functionId || undefined}
          businessUnitId={businessUnitId}
          onDone={handleDone}
          onClose={() => setAddForProcess(null)}
        />
      )}
    </div>
  );
}
