import { useCallback, useEffect, useState } from "react";
import { ModelService } from "@infrastructure/financialImpact/ModelService";
import { listBusinessUnits } from "../services/referenceDataService";
import {
  getPocImpactConfigForPoc,
  getPocImpactRecordsForPoc,
} from "../services/pocImpactService";
import {
  getFinancialModelForTactic,
  getTacticImpactRecordsForTactic,
} from "../services/tacticImpactService";
import type { Tactic } from "../models/tactic";
import type { Poc } from "../models/poc";

export interface ImpactRecordSummary {
  id: string;
  buId?: string;
  buName?: string;
  /** Which KPI this specific row's value is for — the Driver KPI for a Tactic, or either the Driver
   * or one of the model's other affected/result KPIs for a POC (see PocImpactRecord/TacticImpactRecord). */
  kpiId?: string;
  month?: number;
  year?: number;
  driverNewValue?: number;
  summary?: string;
}

export interface ItemImpactSummary {
  financialModelId?: string;
  financialModelName?: string;
  hasImpact: boolean;
  lastImpact?: ImpactRecordSummary;
  /** Every Impact record for this item (oldest first), not just the last one — for "More details". */
  allImpacts: ImpactRecordSummary[];
}

/**
 * Per-Tactic/POC "is a Financial Model linked, has Impact been applied" summary — purely an
 * aggregation of the same functions PocImpactDialog/TacticImpactDialog already call when reopened
 * for an existing item, run once per item here for display in Tactics & POCs / Review & Submit.
 * Financial Model names are resolved once per distinct model id (not once per item) to avoid
 * redundant ModelService calls when several items share a model.
 */
export function useItemImpactSummaries(tactics: Tactic[], pocs: Poc[]) {
  const [summaries, setSummaries] = useState<Map<string, ItemImpactSummary>>(new Map());
  const [loading, setLoading] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);

  const tacticIds = tactics.map((t) => t.id).join(",");
  const pocIds = pocs.map((p) => p.id).join(",");

  useEffect(() => {
    let cancelled = false;
    if (tactics.length === 0 && pocs.length === 0) {
      setSummaries(new Map());
      return;
    }
    setLoading(true);

    async function load() {
      const modelNameCache = new Map<string, string | undefined>();
      async function modelName(modelId?: string): Promise<string | undefined> {
        if (!modelId) return undefined;
        if (!modelNameCache.has(modelId)) {
          modelNameCache.set(modelId, (await ModelService.getModelById(modelId))?.name);
        }
        return modelNameCache.get(modelId);
      }

      const buOptions = await listBusinessUnits();
      const buNames = new Map(buOptions.map((b) => [b.id, b.label]));
      function toImpactRecords(records: { id: string; buId?: string; kpiId?: string; month?: number; year?: number; driverNewValue?: number; summary?: string }[]): ImpactRecordSummary[] {
        return records.map((r) => ({ ...r, buName: r.buId ? buNames.get(r.buId) : undefined }));
      }

      const tacticEntries = Promise.all(
        tactics.map(async (t): Promise<[string, ItemImpactSummary]> => {
          const [financialModelId, rawRecords] = await Promise.all([
            getFinancialModelForTactic(t.id),
            getTacticImpactRecordsForTactic(t.id),
          ]);
          const allImpacts = toImpactRecords(rawRecords);
          return [
            t.id,
            {
              financialModelId,
              financialModelName: await modelName(financialModelId),
              hasImpact: allImpacts.length > 0,
              lastImpact: allImpacts[allImpacts.length - 1],
              allImpacts,
            },
          ];
        })
      );

      const pocEntries = Promise.all(
        pocs.map(async (p): Promise<[string, ItemImpactSummary]> => {
          const [config, rawRecords] = await Promise.all([getPocImpactConfigForPoc(p.id), getPocImpactRecordsForPoc(p.id)]);
          const allImpacts = toImpactRecords(rawRecords);
          return [
            p.id,
            {
              financialModelId: config.financialModelId,
              financialModelName: await modelName(config.financialModelId),
              hasImpact: allImpacts.length > 0,
              lastImpact: allImpacts[allImpacts.length - 1],
              allImpacts,
            },
          ];
        })
      );

      const [tEntries, pEntries] = await Promise.all([tacticEntries, pocEntries]);
      if (!cancelled) setSummaries(new Map([...tEntries, ...pEntries]));
    }

    load().finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tacticIds, pocIds, reloadTick]);

  /** Impact records live in a separate table (pm_pocimpacts/pm_tacticimpacts) — adding one to an
   * already-listed Tactic/POC doesn't change tacticIds/pocIds, so the effect above never reruns on
   * its own. Call this once PocImpactDialog/TacticImpactDialog closes to pick up what was just
   * applied without needing a full page reload. */
  const reload = useCallback(() => setReloadTick((x) => x + 1), []);

  return { summaries, loading, reload };
}
