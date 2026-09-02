import { useState, useEffect, useMemo } from 'react';
import { BaseEntity, EntityService } from '../services/EntityService';
import { ModelService } from '@infrastructure/financialImpact/ModelService';
import { OrgMetadataService } from '../services/OrgMetadataService';
import { SummaryService } from '../services/SummaryService';
import { BusinessUnit, BusinessUnitService } from '@shared/services/BusinessUnitService';
import { kpiTypeRank } from '../models/types';

/** One KPI's line in the summary. */
export interface SummaryRow {
  kpi: BaseEntity;
  /** The KPI's own department and function, spelled out for the table. */
  departmentName: string;
  functionName: string;
  /** pm_target on the KPI's achievement row for this BU/month, or null when there isn't one. */
  target: number | null;
  /** A target that's actually set — 0 counts as missing, as it does in the prototype. */
  hasTarget: boolean;
  /** Referenced by a sealed model, so it must carry a target every month. */
  isPmKpi: boolean;
  /** Listed only because a sealed model needs it, not because it matches the filters. */
  outsideFilter: boolean;
}

export interface BuSummary {
  bu: BusinessUnit;
  rows: SummaryRow[];
  /** How many of the listed KPIs have no target for the month. */
  missingCount: number;
}

export interface RegionSummary {
  regionId: string;
  regionName: string;
  bus: BuSummary[];
}

/**
 * useTargetSummary — every KPI target for a BU/month, as the prototype's Target Summary lays it
 * out: sorted Outcome → Output → Process → Input, each with its department and function.
 *
 * The KPI list comes from the KPI table, not from what happens to have a target: a KPI with no
 * achievement row for the month is listed too and flagged, which is the point of the screen. The
 * Department and Function filters narrow that list, except for KPIs a sealed model depends on —
 * those appear whichever department they sit in, since a missing target breaks the model.
 *
 * `allBUs` stacks every region and its business units instead of just the selected one.
 */
export function useTargetSummary(
  businessUnitId: string,
  departmentId: string,
  functionId: string,
  year: number,
  month: number,
  allBUs: boolean
) {
  const [kpis, setKpis] = useState<BaseEntity[]>([]);
  const [pmKpiIds, setPmKpiIds] = useState<Set<string>>(new Set());
  const [departmentNames, setDepartmentNames] = useState<Map<string, string>>(new Map());
  const [functionNames, setFunctionNames] = useState<Map<string, string>>(new Map());
  const [businessUnits, setBusinessUnits] = useState<BusinessUnit[]>([]);
  const [targetsByBu, setTargetsByBu] = useState<Map<string, Map<string, number | null>>>(new Map());

  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Catalogue: KPIs, which of them a sealed model depends on, the org names, business units.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      EntityService.getKpis(),
      ModelService.getAllModels(),
      OrgMetadataService.getDepartments().catch(() => []),
      OrgMetadataService.getFunctions().catch(() => []),
      BusinessUnitService.getAllBusinessUnits()
    ])
      .then(([allKpis, models, departments, functions, bus]) => {
        if (cancelled) return;
        setKpis(allKpis);
        setPmKpiIds(SummaryService.pmKpiIds(models));
        setDepartmentNames(new Map(departments.map(d => [d.id, d.name])));
        setFunctionNames(new Map(functions.map(f => [f.id, f.name])));
        setBusinessUnits(bus);
      })
      .catch(err => { if (!cancelled) setError(err.message || 'Failed to load the summary'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  /** The business units on screen: all of them, or just the selected one. */
  const scopedBus = useMemo(() => (
    allBUs ? businessUnits : businessUnits.filter(bu => bu.id === businessUnitId)
  ), [allBUs, businessUnits, businessUnitId]);

  // The month's targets for those business units.
  useEffect(() => {
    if (!scopedBus.length) { setTargetsByBu(new Map()); return; }
    let cancelled = false;
    setLoading(true);
    SummaryService.getKpiTargets(scopedBus.map(bu => bu.id), year, month)
      .then(found => { if (!cancelled) setTargetsByBu(found); })
      .catch(err => { if (!cancelled) setError(err.message || 'Failed to load targets'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [scopedBus, year, month]);

  /**
   * A KPI is listed when it matches the Department and Function filters, or when a sealed model
   * depends on it — the latter is marked so the table can say why it's there.
   */
  const listedKpis = useMemo(() => kpis
    .map(kpi => {
      const matchesDepartment = !departmentId || kpi.departmentId === departmentId;
      const matchesFunction = !functionId || kpi.functionId === functionId;
      const matchesFilters = matchesDepartment && matchesFunction;
      return { kpi, matchesFilters, isPmKpi: pmKpiIds.has(kpi.id) };
    })
    .filter(entry => entry.matchesFilters || entry.isPmKpi),
  [kpis, departmentId, functionId, pmKpiIds]);

  const regions = useMemo<RegionSummary[]>(() => {
    const byRegion = new Map<string, RegionSummary>();

    scopedBus.forEach(bu => {
      const targets = targetsByBu.get(bu.id) ?? new Map<string, number | null>();

      const rows: SummaryRow[] = listedKpis
        .map(({ kpi, matchesFilters, isPmKpi }) => {
          const target = targets.get(kpi.id) ?? null;
          return {
            kpi,
            departmentName: (kpi.departmentId ? departmentNames.get(kpi.departmentId) : '') || '',
            functionName: (kpi.functionId ? functionNames.get(kpi.functionId) : '') || '',
            target,
            hasTarget: target != null && target !== 0,
            isPmKpi,
            outsideFilter: !matchesFilters
          };
        })
        .sort((a, b) =>
          kpiTypeRank(a.kpi.type) - kpiTypeRank(b.kpi.type) || a.kpi.name.localeCompare(b.kpi.name));

      const regionId = bu.regionId || 'unknown';
      const region = byRegion.get(regionId) ?? {
        regionId,
        regionName: bu.region || 'Unassigned region',
        bus: []
      };
      region.bus.push({
        bu,
        rows,
        missingCount: rows.filter(row => !row.hasTarget).length
      });
      byRegion.set(regionId, region);
    });

    return Array.from(byRegion.values()).sort((a, b) => a.regionName.localeCompare(b.regionName));
  }, [scopedBus, targetsByBu, listedKpis, departmentNames, functionNames]);

  return { regions, loading, error };
}
