import { useState } from "react";

/** Department, Function, Business Unit, Month, Year — the shared context every Execution &
 * Monitoring tab filters by (fed straight into target-setting's own ContextBar). */
export function useExecutionMonitoringFilters() {
  const [departmentId, setDepartmentId] = useState("");
  const [functionId, setFunctionId] = useState("");
  const [businessUnitId, setBusinessUnitId] = useState("");
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());

  return {
    departmentId, setDepartmentId,
    functionId, setFunctionId,
    businessUnitId, setBusinessUnitId,
    month, setMonth,
    year, setYear,
  };
}

export type ExecutionMonitoringFilters = ReturnType<typeof useExecutionMonitoringFilters>;
