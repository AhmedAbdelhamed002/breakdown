import { Stf_executioncategoriesService } from "@generated/services/Stf_executioncategoriesService";
import { resultOrThrow } from "@infrastructure/dataverse/resultOrThrow";
import type { CategoryOption } from "../models/reference";

/**
 * Category dictionary lookup, scoped by Tactic(1)/POC(2) and the category's
 * own independent strategy-type option set. Progressively relaxes the filter
 * (scope+type -> scope -> type -> everything) rather than ever returning an
 * empty list, so a misconfigured category never silently hides every option
 * (docs/strategy-formulation-spec.md §6.8).
 */
export async function listCategories(scope: number, strategyType: number): Promise<CategoryOption[]> {
  const attempts = [
    `stf_categoryscope eq ${scope} and stf_strategytype eq ${strategyType}`,
    `stf_categoryscope eq ${scope}`,
    `stf_strategytype eq ${strategyType}`,
    undefined,
  ];

  for (const filter of attempts) {
    const rows = resultOrThrow(await Stf_executioncategoriesService.getAll({ filter }), "List categories");
    if (rows.length > 0) {
      return rows.map((r) => ({
        id: r.stf_executioncategoryid,
        label: r.stf_categoryname ?? "",
        scope: r.stf_categoryscope ?? scope,
        strategyType: r.stf_strategytype,
      }));
    }
  }
  return [];
}
