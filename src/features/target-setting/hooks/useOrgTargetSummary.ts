import { useState, useEffect, useMemo } from 'react';
import { BaseEntity, EntityService } from '../services/EntityService';
import { SummaryService } from '../services/SummaryService';
import { BusinessUnit, BusinessUnitService } from '@shared/services/BusinessUnitService';

/** One Org Outcome or Org Output line in the summary. */
export interface OrgSummaryRow {
  entity: BaseEntity;
  kindLabel: 'Org Outcome' | 'Org Output';
  target: number | null;
  /** A target that's actually set — 0 counts as missing, as it does in the prototype. */
  hasTarget: boolean;
}

export interface BuOrgSummary {
  bu: BusinessUnit;
  rows: OrgSummaryRow[];
  missingCount: number;
}

export interface OrgRegionSummary {
  regionId: string;
  regionName: string;
  bus: BuOrgSummary[];
}

/**
 * useOrgTargetSummary — Org Outcome then Org Output targets for a BU/month, as the prototype's Org
 * Target Summary lays them out. Every org entity is listed whether or not it has a target, since a
 * missing one is exactly what the screen is for.
 *
 * `allBUs` stacks every region and its business units instead of just the selected one.
 */
export function useOrgTargetSummary(
  businessUnitId: string,
  year: number,
  month: number,
  allBUs: boolean
) {
  const [outcomes, setOutcomes] = useState<BaseEntity[]>([]);
  const [outputs, setOutputs] = useState<BaseEntity[]>([]);
  const [businessUnits, setBusinessUnits] = useState<BusinessUnit[]>([]);
  const [outcomeTargets, setOutcomeTargets] = useState<Map<string, Map<string, number | null>>>(new Map());
  const [outputTargets, setOutputTargets] = useState<Map<string, Map<string, number | null>>>(new Map());

  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      EntityService.getOrgOutcomes(),
      EntityService.getOrgOutputs(),
      BusinessUnitService.getAllBusinessUnits()
    ])
      .then(([allOutcomes, allOutputs, bus]) => {
        if (cancelled) return;
        setOutcomes(allOutcomes);
        setOutputs(allOutputs);
        setBusinessUnits(bus);
      })
      .catch(err => { if (!cancelled) setError(err.message || 'Failed to load org entities'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const scopedBus = useMemo(() => (
    allBUs ? businessUnits : businessUnits.filter(bu => bu.id === businessUnitId)
  ), [allBUs, businessUnits, businessUnitId]);

  useEffect(() => {
    if (!scopedBus.length) { setOutcomeTargets(new Map()); setOutputTargets(new Map()); return; }
    let cancelled = false;
    const buIds = scopedBus.map(bu => bu.id);
    setLoading(true);
    Promise.all([
      SummaryService.getOutcomeTargets(buIds, year, month),
      SummaryService.getOutputTargets(buIds, year, month)
    ])
      .then(([forOutcomes, forOutputs]) => {
        if (cancelled) return;
        setOutcomeTargets(forOutcomes);
        setOutputTargets(forOutputs);
      })
      .catch(err => { if (!cancelled) setError(err.message || 'Failed to load targets'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [scopedBus, year, month]);

  const regions = useMemo<OrgRegionSummary[]>(() => {
    const byRegion = new Map<string, OrgRegionSummary>();

    scopedBus.forEach(bu => {
      const forOutcomes = outcomeTargets.get(bu.id) ?? new Map<string, number | null>();
      const forOutputs = outputTargets.get(bu.id) ?? new Map<string, number | null>();

      const toRow = (
        entity: BaseEntity,
        kindLabel: OrgSummaryRow['kindLabel'],
        targets: Map<string, number | null>
      ): OrgSummaryRow => {
        const target = targets.get(entity.id) ?? null;
        return { entity, kindLabel, target, hasTarget: target != null && target !== 0 };
      };

      // Outcomes first, then outputs — the order the prototype reads them in.
      const rows: OrgSummaryRow[] = [
        ...outcomes
          .map(e => toRow(e, 'Org Outcome', forOutcomes))
          .sort((a, b) => a.entity.name.localeCompare(b.entity.name)),
        ...outputs
          .map(e => toRow(e, 'Org Output', forOutputs))
          .sort((a, b) => a.entity.name.localeCompare(b.entity.name))
      ];

      const regionId = bu.regionId || 'unknown';
      const region = byRegion.get(regionId) ?? {
        regionId,
        regionName: bu.region || 'Unassigned region',
        bus: []
      };
      region.bus.push({ bu, rows, missingCount: rows.filter(row => !row.hasTarget).length });
      byRegion.set(regionId, region);
    });

    return Array.from(byRegion.values()).sort((a, b) => a.regionName.localeCompare(b.regionName));
  }, [scopedBus, outcomes, outputs, outcomeTargets, outputTargets]);

  return { regions, loading, error };
}
