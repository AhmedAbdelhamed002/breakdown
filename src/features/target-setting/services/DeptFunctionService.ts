import { EntityService } from './EntityService';
import { OrgMetadataService } from './OrgMetadataService';

/**
 * DeptFunctionService — the department and function a KPI belongs to, as one label.
 *
 * Proposals carry it in pm_deptfunction so the review list can say whose number it is without
 * joining back to the KPI. Built from the KPI's own department and function, not from whatever
 * the screen's filters happen to be set to — a proposal belongs to the KPI's part of the
 * organisation however it was reached.
 *
 * Kept target-setting-local (not in the shared financial-impact infrastructure) since it depends
 * on this feature's own EntityService/OrgMetadataService catalogues — TargetWriteService takes
 * the resolved label as a plain optional string instead of importing this service directly.
 *
 * All three catalogues are small and change rarely, so they're read once per session.
 */

/** Separator between the two halves, e.g. `Medical-OPD`. */
const SEPARATOR = '-';

export class DeptFunctionService {
  private static cache?: Promise<{
    kpis: Map<string, { departmentId?: string; functionId?: string }>;
    departments: Map<string, string>;
    functions: Map<string, string>;
  }>;

  private static load() {
    if (!this.cache) {
      this.cache = (async () => {
        const [kpis, departments, functions] = await Promise.all([
          EntityService.getKpis().catch(() => []),
          OrgMetadataService.getDepartments().catch(() => []),
          OrgMetadataService.getFunctions().catch(() => [])
        ]);
        return {
          kpis: new Map(kpis.map(k => [k.id, { departmentId: k.departmentId, functionId: k.functionId }])),
          departments: new Map(departments.map(d => [d.id, d.name])),
          functions: new Map(functions.map(f => [f.id, f.name]))
        };
      })();
      this.cache.catch(() => { this.cache = undefined; });
    }
    return this.cache;
  }

  /**
   * `department-function` for a KPI, or undefined when neither is set — an empty column reads
   * better than a lone separator. Org Outputs and Outcomes have no department or function of their
   * own, so nothing is returned for them.
   */
  public static async labelFor(kpiId: string): Promise<string | undefined> {
    if (!kpiId) return undefined;
    try {
      const { kpis, departments, functions } = await this.load();
      const kpi = kpis.get(kpiId);
      if (!kpi) return undefined;

      const department = kpi.departmentId ? departments.get(kpi.departmentId) : undefined;
      const fn = kpi.functionId ? functions.get(kpi.functionId) : undefined;
      if (!department && !fn) return undefined;
      return [department ?? '', fn ?? ''].join(SEPARATOR);
    } catch {
      return undefined;
    }
  }
}
