import { useEffect, useState } from "react";
import { Pm_orgoutcomesService } from "@generated/services/Pm_orgoutcomesService";
import { Pm_orgoutputsService } from "@generated/services/Pm_orgoutputsService";
import { Pm_orgoutputoutcomesService } from "@generated/services/Pm_orgoutputoutcomesService";
import { ContributionService } from "@features/target-setting/services/ContributionService";
import { EntityService } from "@features/target-setting/services/EntityService";
import { listDepartments } from "@features/strategy-formulation/services/referenceDataService";
import { getObjectiveByOrgOutput } from "@features/strategy-formulation/services/objectiveService";
import type { Objective } from "@features/strategy-formulation/models/objective";
import { resultOrThrow } from "@infrastructure/dataverse/resultOrThrow";

export interface PickerRow {
  id: string;
  label: string;
}

export interface MandatoryKpi {
  id: string;
  name: string;
  functionId?: string;
}

export interface MandatoryDepartmentGroup {
  departmentId: string;
  departmentName: string;
  kpis: MandatoryKpi[];
}

/**
 * Drives the 3-stage Org Outcome -> Org Output -> Mandatory Dept/KPI cascade.
 * Each stage's data reloads when its parent selection changes, and picking a
 * new parent clears every downstream selection/result (same reset idiom as
 * the Department -> Function -> KPI cascade in ObjectiveDialog.tsx).
 */
export function useOrgOutcomeCascade() {
  const [outcomes, setOutcomes] = useState<PickerRow[]>([]);
  const [outcomesLoading, setOutcomesLoading] = useState(true);
  const [selectedOutcomeId, setSelectedOutcomeId] = useState("");

  const [outputs, setOutputs] = useState<PickerRow[]>([]);
  const [outputsLoading, setOutputsLoading] = useState(false);
  const [selectedOutputId, setSelectedOutputId] = useState("");

  const [mandatoryGroups, setMandatoryGroups] = useState<MandatoryDepartmentGroup[]>([]);
  const [mandatoryLoading, setMandatoryLoading] = useState(false);

  const [existingObjectiveForOutput, setExistingObjectiveForOutput] = useState<Objective | null>(null);
  const [existingObjectiveLoading, setExistingObjectiveLoading] = useState(false);
  const [existingObjectiveRefreshKey, setExistingObjectiveRefreshKey] = useState(0);

  // Stage 1: Org Outcomes (loaded once).
  useEffect(() => {
    let cancelled = false;
    setOutcomesLoading(true);
    Pm_orgoutcomesService.getAll({ filter: "statecode eq 0", orderBy: ["pm_name asc"] })
      .then((res) => {
        if (cancelled) return;
        const rows = resultOrThrow(res, "List Org Outcomes");
        setOutcomes(rows.map((r) => ({ id: r.pm_orgoutcomeid, label: r.pm_name || "(unnamed outcome)" })));
      })
      .catch(() => {
        if (!cancelled) setOutcomes([]);
      })
      .finally(() => {
        if (!cancelled) setOutcomesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function selectOutcome(id: string) {
    setSelectedOutcomeId(id);
    setSelectedOutputId("");
    setOutputs([]);
    setMandatoryGroups([]);
  }

  // Stage 2: Org Outputs linked to the selected Outcome, via pm_orgoutputoutcome.
  useEffect(() => {
    if (!selectedOutcomeId) {
      setOutputs([]);
      return;
    }
    let cancelled = false;
    setOutputsLoading(true);
    Pm_orgoutputoutcomesService.getAll({
      select: ["pm_orgoutputoutcomeid", "_pm_orgoutput_value"],
      filter: `_pm_orgoutcome_value eq '${selectedOutcomeId}' and statecode eq 0`,
    })
      .then(async (res) => {
        if (cancelled) return;
        const links = resultOrThrow(res, "List Org Outputs for outcome");
        const outputIds = Array.from(new Set(links.map((l) => l._pm_orgoutput_value).filter((v): v is string => !!v)));
        if (outputIds.length === 0) {
          setOutputs([]);
          return;
        }
        const outputRows = resultOrThrow(
          await Pm_orgoutputsService.getAll({
            select: ["pm_orgoutputid", "pm_name"],
            filter: outputIds.map((id) => `pm_orgoutputid eq '${id}'`).join(" or "),
          }),
          "Resolve Org Output names"
        );
        if (cancelled) return;
        setOutputs(outputRows.map((r) => ({ id: r.pm_orgoutputid, label: r.pm_name || "(unnamed output)" })));
      })
      .catch(() => {
        if (!cancelled) setOutputs([]);
      })
      .finally(() => {
        if (!cancelled) setOutputsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedOutcomeId]);

  function selectOutput(id: string) {
    setSelectedOutputId(id);
    setMandatoryGroups([]);
    setExistingObjectiveForOutput(null);
  }

  /** Re-checks whether an Objective now exists for the selected Output — call after creating one. */
  function refreshExistingObjective() {
    setExistingObjectiveRefreshKey((k) => k + 1);
  }

  // Whether an Objective already exists for the selected Output — the one-per-output gate.
  useEffect(() => {
    if (!selectedOutputId) {
      setExistingObjectiveForOutput(null);
      return;
    }
    let cancelled = false;
    setExistingObjectiveLoading(true);
    getObjectiveByOrgOutput(selectedOutputId)
      .then((objective) => {
        if (!cancelled) setExistingObjectiveForOutput(objective ?? null);
      })
      .catch(() => {
        if (!cancelled) setExistingObjectiveForOutput(null);
      })
      .finally(() => {
        if (!cancelled) setExistingObjectiveLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedOutputId, existingObjectiveRefreshKey]);

  // Stage 3: departments that own a Dept Output KPI contributing to the selected Output
  // (pm_outputcontribution -> strategy_kpis, grouped by strategy_kpis' owning department).
  useEffect(() => {
    if (!selectedOutputId) {
      setMandatoryGroups([]);
      return;
    }
    let cancelled = false;
    setMandatoryLoading(true);
    Promise.all([ContributionService.getContributingKpisForOutput(selectedOutputId), EntityService.getKpis(), listDepartments()])
      .then(([links, kpis, departments]) => {
        if (cancelled) return;
        const kpiById = new Map(kpis.map((k) => [k.id, k]));
        const departmentNameById = new Map(departments.map((d) => [d.id, d.label]));
        const groups = new Map<string, MandatoryDepartmentGroup>();
        for (const link of links) {
          const kpi = kpiById.get(link.sourceKpiId);
          // "Dept Output KPI" = any KPI linked to this Org Output via pm_outputcontribution
          // that's owned by a department — every such link counts, regardless of strategy_kpitype.
          if (!kpi || !kpi.departmentId) continue;
          const deptId = kpi.departmentId;
          const group = groups.get(deptId) ?? {
            departmentId: deptId,
            departmentName: departmentNameById.get(deptId) ?? "(unknown department)",
            kpis: [],
          };
          if (!group.kpis.some((k) => k.id === kpi.id)) {
            group.kpis.push({ id: kpi.id, name: link.sourceKpiName || kpi.name, functionId: kpi.functionId });
          }
          groups.set(deptId, group);
        }
        setMandatoryGroups(Array.from(groups.values()).sort((a, b) => a.departmentName.localeCompare(b.departmentName)));
      })
      .catch(() => {
        if (!cancelled) setMandatoryGroups([]);
      })
      .finally(() => {
        if (!cancelled) setMandatoryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedOutputId]);

  return {
    outcomes,
    outcomesLoading,
    selectedOutcomeId,
    selectOutcome,
    outputs,
    outputsLoading,
    selectedOutputId,
    selectOutput,
    mandatoryGroups,
    mandatoryLoading,
    existingObjectiveForOutput,
    existingObjectiveLoading,
    refreshExistingObjective,
  };
}
