import { useAsync } from "@shared/hooks/useAsync";
import { Pm_orgoutputsService } from "@generated/services/Pm_orgoutputsService";
import { Pm_orgoutputoutcomesService } from "@generated/services/Pm_orgoutputoutcomesService";
import { Pm_orgoutcomesService } from "@generated/services/Pm_orgoutcomesService";
import { resultOrThrow } from "@infrastructure/dataverse/resultOrThrow";
import { listObjectives } from "@features/strategy-formulation/services/objectiveService";
import { listObjectiveDepartmentRows } from "@features/strategy-formulation/services/objectiveDepartmentService";
import { listDepartments } from "@features/strategy-formulation/services/referenceDataService";

export interface ObjectiveOverviewRow {
  id: string;
  title: string;
  outcomeName?: string;
  outputName?: string;
  departmentNames: string[];
  year?: string;
}

/**
 * Every Objective written so far, with its Org Outcome/Org Output resolved (via the
 * pm_orgoutputoutcome join, same as useOrgOutcomeCascade's own outputs-under-outcome
 * step) and its contributing departments joined — the "shared store" table shown
 * beneath the cascade, mirroring what also appears in the Strategy tree.
 */
export function useObjectivesOverview() {
  return useAsync<ObjectiveOverviewRow[]>(async () => {
    const [objectives, deptRows, departments, outputsRes, linksRes, outcomesRes] = await Promise.all([
      listObjectives(),
      listObjectiveDepartmentRows(),
      listDepartments(),
      Pm_orgoutputsService.getAll({ select: ["pm_orgoutputid", "pm_name"] }),
      Pm_orgoutputoutcomesService.getAll({ select: ["_pm_orgoutput_value", "_pm_orgoutcome_value"], filter: "statecode eq 0" }),
      Pm_orgoutcomesService.getAll({ select: ["pm_orgoutcomeid", "pm_name"] }),
    ]);
    const outputs = resultOrThrow(outputsRes, "List Org Outputs");
    const links = resultOrThrow(linksRes, "List Org Output/Outcome links");
    const outcomes = resultOrThrow(outcomesRes, "List Org Outcomes");

    const departmentNameById = new Map(departments.map((d) => [d.id, d.label]));
    const outputNameById = new Map(outputs.map((o) => [o.pm_orgoutputid, o.pm_name || "(unnamed output)"]));
    const outcomeNameById = new Map(outcomes.map((o) => [o.pm_orgoutcomeid, o.pm_name || "(unnamed outcome)"]));
    const outcomeIdByOutputId = new Map(
      links.filter((l) => l._pm_orgoutput_value && l._pm_orgoutcome_value).map((l) => [l._pm_orgoutput_value!, l._pm_orgoutcome_value!])
    );

    const departmentNamesByObjectiveId = new Map<string, string[]>();
    for (const row of deptRows) {
      const list = departmentNamesByObjectiveId.get(row.objectiveId) ?? [];
      list.push(row.departmentName || departmentNameById.get(row.departmentId) || "(unknown department)");
      departmentNamesByObjectiveId.set(row.objectiveId, list);
    }

    return objectives.map((o) => {
      const outputName = o.orgOutputId ? outputNameById.get(o.orgOutputId) : undefined;
      const outcomeId = o.orgOutputId ? outcomeIdByOutputId.get(o.orgOutputId) : undefined;
      return {
        id: o.id,
        title: o.title,
        outcomeName: outcomeId ? outcomeNameById.get(outcomeId) : undefined,
        outputName,
        departmentNames: departmentNamesByObjectiveId.get(o.id) ?? (o.departmentName ? [o.departmentName] : []),
        year: o.year,
      };
    });
  }, []);
}
