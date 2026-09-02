import type { KpiCeiling } from '../models/types';

function normalizeGuid(id: unknown): string {
  return String(id ?? '')
    .replace(/[{}]/g, '')
    .toLowerCase()
    .trim();
}

function ceilingGroupKey(c: KpiCeiling): string {
  return `${normalizeGuid(c.pm_kpi)}|${normalizeGuid(c.pm_businessunit)}`;
}

function effectiveDate(c: KpiCeiling): string {
  return String(c.pm_effectivedate || '').substring(0, 10);
}

export function isSupersededCeiling(ceiling: Pick<KpiCeiling, 'status' | 'statuscode'>): boolean {
  if (String(ceiling.status ?? '').toLowerCase() === 'superseded') return true;
  return Number(ceiling.statuscode) === 2;
}

export function todayIsoDate(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * One Active ceiling per KPI+BU: the latest effective date that is today or in the past.
 * Future-dated rows stay Superseded until their effective date.
 */
export function reconcileCeilingStatuses(list: KpiCeiling[], now: Date = new Date()): KpiCeiling[] {
  const today = todayIsoDate(now);
  const groups = new Map<string, KpiCeiling[]>();
  for (const ceiling of list) {
    const key = ceilingGroupKey(ceiling);
    const group = groups.get(key);
    if (group) group.push(ceiling);
    else groups.set(key, [ceiling]);
  }

  const activeIds = new Set<string>();
  for (const group of groups.values()) {
    const due = group.filter((c) => {
      const date = effectiveDate(c);
      return Boolean(date) && date <= today;
    });
    const sorted = [...due].sort((a, b) => {
      const dateCmp = effectiveDate(b).localeCompare(effectiveDate(a));
      if (dateCmp !== 0) return dateCmp;
      return String(b.pm_kpiceilingid).localeCompare(String(a.pm_kpiceilingid));
    });
    const winner = sorted[0];
    if (winner) activeIds.add(normalizeGuid(winner.pm_kpiceilingid));
  }

  return list.map((ceiling) => {
    const isActive = activeIds.has(normalizeGuid(ceiling.pm_kpiceilingid));
    if (isActive) {
      return {
        ...ceiling,
        status: 'Active' as const,
        statuscode: 1,
      };
    }
    const isFuture = effectiveDate(ceiling) > today;
    return {
      ...ceiling,
      status: 'Superseded' as const,
      statuscode: 2,
      pm_isconstraint: isFuture ? ceiling.pm_isconstraint : 'Off',
    };
  });
}
