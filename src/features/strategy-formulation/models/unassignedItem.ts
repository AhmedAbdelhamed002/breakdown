export interface UnassignedItem {
  id: string;
  kind: "Tactic" | "Poc";
  name?: string;
  current?: number;
  target?: number;
  kpiId?: string;
  kpiName?: string;
  departmentId?: string;
  functionId?: string;
}
