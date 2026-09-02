import { useAsync } from "@shared/hooks/useAsync";
import { ContributionService } from "@features/target-setting/services/ContributionService";
import { EntityService } from "@features/target-setting/services/EntityService";
import { listObjectives } from "../services/objectiveService";
import { listObjectiveDepartmentRows, type ObjectiveDepartmentRow } from "../services/objectiveDepartmentService";
import { listStrategies } from "../services/strategyService";
import { listOutputKpisByDepartment } from "../services/strategyKpiService";
import { listAllStrategySetups } from "../services/strategySetupService";
import { listDepartments, listFunctionsByDepartment } from "../services/referenceDataService";
import { STRATEGY_TYPE_DEPARTMENT, STRATEGY_TYPE_MARKET, STRATEGY_TYPE_SPECIALTY, STRATEGY_TYPE_SERVICE } from "../constants/optionSets";
import { STRATEGY_TYPE_FLAGS, STRATEGY_TYPE_LABELS, type StrategyTypeFlag, type StrategySetup } from "../models/strategySetup";
import type { Strategy } from "../models/strategy";
import type { Objective } from "../models/objective";

const STRATEGY_TYPE_CODE: Record<StrategyTypeFlag, number> = {
  departmentStrategy: STRATEGY_TYPE_DEPARTMENT,
  marketStrategy: STRATEGY_TYPE_MARKET,
  specialtyStrategy: STRATEGY_TYPE_SPECIALTY,
  serviceStrategy: STRATEGY_TYPE_SERVICE,
};

export interface KpiStrategyButton {
  flag: StrategyTypeFlag;
  label: string;
  strategyType: number;
  /** Set once a Strategy of this type already exists for this KPI under this objective-department. */
  existingStrategyId?: string;
}

export interface DepartmentKpiRow {
  kpiId: string;
  kpiName: string;
  functionId?: string;
  functionName?: string;
  /** Only the strategy types Strategy Setup marks required for this KPI's Function — never all 4 unconditionally. */
  buttons: KpiStrategyButton[];
  /** True once every required type already has a Strategy created. */
  covered: boolean;
}

export interface DepartmentCoverageRow {
  objDeptId: string;
  departmentId: string;
  departmentName: string;
  /**
   * This Department's Output-type KPIs — narrowed to only those linked (via
   * pm_outputcontribution) to the objective's own Org Output when it has one, so two
   * objectives sharing a contributing department don't both show that department's entire,
   * unrelated KPI catalog. Objectives with no Org Output link (legacy) still see every
   * Output-type KPI the department owns, since there's no narrower scope to apply.
   */
  kpis: DepartmentKpiRow[];
}

/** A Dept Output KPI linked (via pm_outputcontribution) to the Objective's own Org Output but whose department has no row of its own above (e.g. removed from "Contributing Departments" before saving) — same shape as DepartmentKpiRow, plus which department it's owned by since it isn't nested under one. */
export interface OrgOutputKpiRow {
  kpiId: string;
  kpiName: string;
  departmentId?: string;
  departmentName?: string;
  functionId?: string;
  functionName?: string;
  buttons: KpiStrategyButton[];
  covered: boolean;
}

export interface ObjectiveWithCoverage {
  objective: Objective;
  departments: DepartmentCoverageRow[];
  /** Service strategies supporting any of this objective's contributing departments, aggregated across all of them. */
  serviceStrategies: Strategy[];
  /** Dept Output KPIs linked to this objective's Org Output (pm_orgoutputkpi) — empty when the objective has no Org Output link. */
  orgOutputKpis: OrgOutputKpiRow[];
}

/** A Department row is "covered" once every one of its Output KPIs has all of its required strategy types created. */
export function isDepartmentRowCovered(row: DepartmentCoverageRow): boolean {
  return row.kpis.length > 0 && row.kpis.every((k) => k.covered);
}

/**
 * Builds the Objective -> contributing-Department -> Output-KPI -> Strategy-type
 * coverage tree. Each Department's box lists its Output KPIs (not its Strategies
 * directly); which of the 4 strategy-type buttons show per KPI comes from the
 * Strategy Setup row for (Department, the KPI's own Function) — a KPI whose
 * Function isn't set up to require any type shows no buttons at all.
 */
export function useObjectiveTree() {
  return useAsync<ObjectiveWithCoverage[]>(async () => {
    const [objectives, objDeptRows, strategies, departments, functions, allSetups] = await Promise.all([
      listObjectives(),
      listObjectiveDepartmentRows(),
      listStrategies(),
      listDepartments(),
      listFunctionsByDepartment(undefined),
      listAllStrategySetups(),
    ]);

    // The lookup-name companion fields (e.g. `stf_departmentname`) aren't
    // always populated by the SDK, so fall back to the already-loaded master
    // lists rather than showing a blank name.
    const departmentNameById = new Map(departments.map((d) => [d.id, d.label]));
    const functionNameById = new Map(functions.map((f) => [f.id, f.label]));
    const strategyNameById = new Map(strategies.map((s) => [s.id, s.name]));

    const setupByDeptFn = new Map<string, StrategySetup>();
    for (const s of allSetups) {
      if (s.departmentId && s.functionId) setupByDeptFn.set(`${s.departmentId}::${s.functionId}`, s);
    }

    // Every objective-department junction row, keyed by (objectiveId, departmentId) — an
    // Org-Output KPI's "existing strategy" match needs the same junction id Department rows
    // use, even though the KPI itself was reached via the objective's Org Output, not via
    // this junction table.
    const objDeptRowByObjDept = new Map<string, ObjectiveDepartmentRow>();
    for (const row of objDeptRows) {
      objDeptRowByObjDept.set(`${row.objectiveId}::${row.departmentId}`, row);
    }

    const orgOutputIdByObjectiveId = new Map(objectives.map((o) => [o.id, o.orgOutputId] as const));

    const strategiesByObjDept = new Map<string, Strategy[]>();
    for (const s of strategies) {
      if (!s.objectiveDepartmentId) continue;
      const list = strategiesByObjDept.get(s.objectiveDepartmentId) ?? [];
      list.push(s);
      strategiesByObjDept.set(s.objectiveDepartmentId, list);
    }

    // Output KPIs are fetched once per distinct Department, not once per
    // objective-department row — the same Department can contribute to
    // several objectives and would otherwise be queried redundantly.
    const distinctDeptIds = Array.from(new Set(objDeptRows.map((r) => r.departmentId)));
    const kpisByDept = new Map<string, Awaited<ReturnType<typeof listOutputKpisByDepartment>>>();
    await Promise.all(
      distinctDeptIds.map(async (deptId) => {
        kpisByDept.set(deptId, await listOutputKpisByDepartment(deptId));
      })
    );

    // Org-Output KPIs (pm_outputcontribution -> strategy_kpis), fetched once per distinct
    // Org Output an objective links to — same join used by the Org Objectives cascade's
    // useOrgOutcomeCascade.ts, just keyed here by objective instead of by cascade selection.
    const distinctOutputIds = Array.from(new Set(objectives.map((o) => o.orgOutputId).filter((id): id is string => !!id)));
    const [contributionsByOutput, allKpis] = await Promise.all([
      (async () => {
        const map = new Map<string, Awaited<ReturnType<typeof ContributionService.getContributingKpisForOutput>>>();
        await Promise.all(
          distinctOutputIds.map(async (outputId) => {
            map.set(outputId, await ContributionService.getContributingKpisForOutput(outputId));
          })
        );
        return map;
      })(),
      distinctOutputIds.length > 0 ? EntityService.getKpis() : Promise.resolve([]),
    ]);
    const kpiById = new Map(allKpis.map((k) => [k.id, k]));

    function buildOrgOutputKpiRows(objective: Objective, coveredByDepartmentRow: Set<string>): OrgOutputKpiRow[] {
      if (!objective.orgOutputId) return [];
      const links = contributionsByOutput.get(objective.orgOutputId) ?? [];
      const rows: OrgOutputKpiRow[] = [];
      const seenKpiIds = new Set<string>();
      for (const link of links) {
        const kpi = kpiById.get(link.sourceKpiId);
        if (!kpi || !kpi.departmentId || seenKpiIds.has(kpi.id)) continue;
        // Already shown under its own Department row above (the normal case, once that
        // department was added as "contributing") — this section only catches KPIs whose
        // department was removed from that list before the objective was saved.
        if (coveredByDepartmentRow.has(kpi.departmentId)) continue;
        seenKpiIds.add(kpi.id);
        const setup = kpi.functionId ? setupByDeptFn.get(`${kpi.departmentId}::${kpi.functionId}`) : undefined;
        const objDeptRow = objDeptRowByObjDept.get(`${objective.id}::${kpi.departmentId}`);
        const attachedStrategies = objDeptRow ? strategiesByObjDept.get(objDeptRow.id) ?? [] : [];
        const buttons: KpiStrategyButton[] = STRATEGY_TYPE_FLAGS.filter((flag) => setup?.[flag]).map((flag) => {
          const strategyType = STRATEGY_TYPE_CODE[flag];
          const existing = attachedStrategies.find((s) => s.primaryKpiId === kpi.id && s.strategyType === strategyType);
          return { flag, label: STRATEGY_TYPE_LABELS[flag], strategyType, existingStrategyId: existing?.id };
        });
        rows.push({
          kpiId: kpi.id,
          kpiName: link.sourceKpiName || kpi.name,
          departmentId: kpi.departmentId,
          departmentName: departmentNameById.get(kpi.departmentId) ?? "(unknown department)",
          functionId: kpi.functionId,
          functionName: kpi.functionId ? functionNameById.get(kpi.functionId) : undefined,
          buttons,
          covered: buttons.length > 0 && buttons.every((b) => !!b.existingStrategyId),
        });
      }
      return rows;
    }

    const rowsByObjective = new Map<string, DepartmentCoverageRow[]>();
    for (const row of objDeptRows) {
      const list = rowsByObjective.get(row.objectiveId) ?? [];
      const attachedStrategies = strategiesByObjDept.get(row.id) ?? [];
      let deptKpis = kpisByDept.get(row.departmentId) ?? [];

      // Scope down to just this objective's Org Output when it has one — otherwise every
      // objective sharing this department would show its entire, unrelated KPI catalog.
      const orgOutputId = orgOutputIdByObjectiveId.get(row.objectiveId);
      if (orgOutputId) {
        const linkedKpiIds = new Set((contributionsByOutput.get(orgOutputId) ?? []).map((link) => link.sourceKpiId));
        deptKpis = deptKpis.filter((kpi) => linkedKpiIds.has(kpi.id));
      }

      const kpiRows: DepartmentKpiRow[] = deptKpis.map((kpi) => {
        const setup = kpi.functionId ? setupByDeptFn.get(`${row.departmentId}::${kpi.functionId}`) : undefined;
        const buttons: KpiStrategyButton[] = STRATEGY_TYPE_FLAGS.filter((flag) => setup?.[flag]).map((flag) => {
          const strategyType = STRATEGY_TYPE_CODE[flag];
          const existing = attachedStrategies.find((s) => s.primaryKpiId === kpi.id && s.strategyType === strategyType);
          return { flag, label: STRATEGY_TYPE_LABELS[flag], strategyType, existingStrategyId: existing?.id };
        });
        return {
          kpiId: kpi.id,
          kpiName: kpi.name,
          functionId: kpi.functionId,
          functionName: kpi.functionId ? functionNameById.get(kpi.functionId) : undefined,
          buttons,
          covered: buttons.length > 0 && buttons.every((b) => !!b.existingStrategyId),
        };
      });

      list.push({
        objDeptId: row.id,
        departmentId: row.departmentId,
        departmentName: row.departmentName || departmentNameById.get(row.departmentId) || "(unknown department)",
        kpis: kpiRows,
      });
      rowsByObjective.set(row.objectiveId, list);
    }

    return objectives.map((objective) => {
      const departments = rowsByObjective.get(objective.id) ?? [];
      const deptIds = new Set(departments.map((d) => d.departmentId));
      const serviceStrategies = strategies
        .filter((s) => s.track === "Service" && s.supportedDepartmentId && deptIds.has(s.supportedDepartmentId))
        .map((s) => ({
          ...s,
          supportedStrategyName: s.supportedStrategyName || (s.supportedStrategyId ? strategyNameById.get(s.supportedStrategyId) : undefined),
        }));
      return {
        objective: {
          ...objective,
          departmentName: objective.departmentName || (objective.departmentId ? departmentNameById.get(objective.departmentId) : undefined),
          functionName: objective.functionName || (objective.functionId ? functionNameById.get(objective.functionId) : undefined),
        },
        departments,
        serviceStrategies,
        orgOutputKpis: buildOrgOutputKpiRows(objective, deptIds),
      };
    });
  }, []);
}
