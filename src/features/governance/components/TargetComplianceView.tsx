import type { BusinessUnit, Department, HrFunction, Region, StrategyKpi } from '@features/financial';
import { FM_COLORS, FM_FONT, FM_RADIUS, MONTH_NAMES } from '@features/financial';
import type { ComplianceView } from '../hooks/useGovernance';

interface TargetComplianceViewProps {
  view: ComplianceView;
  onViewChange: (v: ComplianceView) => void;
  month: number;
  year: number;
  onMonthChange: (m: number) => void;
  onYearChange: (y: number) => void;
  regions: Region[];
  businessUnits: BusinessUnit[];
  selectedBuId: string;
  kpis: StrategyKpi[];
  departments: Department[];
  functions: HrFunction[];
  pmKpiIds: Set<string>;
  kpiTarget: (kpiId: string, buId: string) => number | null;
  isMissingTarget: (v: number | null | undefined) => boolean;
}

function norm(id: unknown): string {
  return String(id ?? '')
    .replace(/[{}]/g, '')
    .toLowerCase()
    .trim();
}

function kpiDeptFunctionLabel(
  kpi: StrategyKpi,
  departments: Department[],
  functions: HrFunction[]
): string {
  const dept =
    String(kpi.strategy_departmentname ?? '').trim() ||
    departments.find((d) => norm(d.departmentid) === norm(kpi.strategy_department))?.name ||
    '';
  const fn =
    String(kpi.strategy_functionname ?? '').trim() ||
    functions.find((f) => norm(f.functionid) === norm(kpi.strategy_function))?.name ||
    '';
  return [dept, fn].filter(Boolean).join(' · ') || '—';
}

export function TargetComplianceView({
  view,
  onViewChange,
  month,
  year,
  onMonthChange,
  onYearChange,
  regions,
  businessUnits,
  selectedBuId,
  kpis,
  departments,
  functions,
  pmKpiIds,
  kpiTarget,
  isMissingTarget,
}: TargetComplianceViewProps) {
  const pmKpis = kpis.filter((k) => pmKpiIds.has(norm(k.strategy_kpisid)));
  const periodLabel = `${MONTH_NAMES[month - 1] || month} ${year}`;

  const cards = businessUnits.filter(
    (b) => !selectedBuId || norm(b.businessunitid) === norm(selectedBuId)
  );

  const grouped = regions
    .map((region) => ({
      region,
      bus: cards.filter((b) => !b.regionid || b.regionid === region.regionid),
    }))
    .filter((g) => g.bus.length > 0);

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <select
          value={month}
          onChange={(e) => onMonthChange(Number(e.target.value))}
          style={{ padding: '8px 10px', borderRadius: 8, border: `1px solid ${FM_COLORS.border}` }}
        >
          {MONTH_NAMES.map((name, i) => (
            <option key={name} value={i + 1}>
              {name}
            </option>
          ))}
        </select>
        <input
          type="number"
          value={year}
          onChange={(e) => onYearChange(Number(e.target.value) || year)}
          style={{ width: 90, padding: '8px 10px', borderRadius: 8, border: `1px solid ${FM_COLORS.border}` }}
        />
        <button
          type="button"
          onClick={() => onViewChange('single')}
          style={{
            padding: '6px 12px',
            borderRadius: 999,
            border: `1px solid ${view === 'single' ? FM_COLORS.accent : FM_COLORS.border}`,
            background: view === 'single' ? FM_COLORS.accent : '#fff',
            fontWeight: 600,
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          Single BU
        </button>
        <button
          type="button"
          onClick={() => onViewChange('all')}
          style={{
            padding: '6px 12px',
            borderRadius: 999,
            border: `1px solid ${view === 'all' ? FM_COLORS.accent : FM_COLORS.border}`,
            background: view === 'all' ? FM_COLORS.accent : '#fff',
            fontWeight: 600,
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          All BUs
        </button>
      </div>

      <div
        style={{
          background: FM_COLORS.infoBannerBg,
          color: FM_COLORS.infoBannerText,
          padding: '12px 14px',
          borderRadius: FM_RADIUS.md,
          fontSize: FM_FONT.sizeSm,
          marginBottom: 16,
        }}
      >
        PM KPIs are KPIs referenced in a sealed financial model (result KPI plus formula/factor
        components). Missing = no target or target = 0 for {periodLabel}. “All BUs” checks every
        region / BU.
      </div>

      {pmKpis.length === 0 ? (
        <div style={{ color: FM_COLORS.textMuted }}>No sealed-model PM KPIs found.</div>
      ) : (
        grouped.map(({ region, bus }) => (
          <div key={region.regionid} style={{ marginBottom: 22 }}>
            {view === 'all' && (
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: 0.6,
                  color: FM_COLORS.textMuted,
                  marginBottom: 8,
                  textTransform: 'uppercase',
                }}
              >
                {region.name}
              </div>
            )}
            {bus.map((bu) => {
              const missing = pmKpis.filter((k) => isMissingTarget(kpiTarget(k.strategy_kpisid, bu.businessunitid)));
              const ok = missing.length === 0;
              return (
                <div
                  key={bu.businessunitid}
                  style={{
                    background: '#fff',
                    border: `1px solid ${FM_COLORS.border}`,
                    borderRadius: FM_RADIUS.lg,
                    marginBottom: 12,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '12px 16px',
                      borderBottom: `1px solid ${FM_COLORS.borderLight}`,
                    }}
                  >
                    <strong>{bu.name}</strong>
                    <span
                      style={{
                        padding: '2px 10px',
                        borderRadius: 999,
                        fontSize: 11,
                        fontWeight: 700,
                        background: ok ? FM_COLORS.statusDraftBg : FM_COLORS.warningBannerBg,
                        color: ok ? FM_COLORS.statusDraft : FM_COLORS.warningBannerText,
                      }}
                    >
                      {ok ? 'compliant' : `${missing.length} missing`}
                    </span>
                  </div>
                  {ok ? (
                    <div style={{ padding: 16, color: FM_COLORS.positive, fontWeight: 600 }}>
                      ✓ All PM KPIs have a target this month
                    </div>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ textAlign: 'left', background: FM_COLORS.tableHeaderBg }}>
                          <th style={{ padding: '8px 12px' }}>PM KPI</th>
                          <th style={{ padding: '8px 12px' }}>Type</th>
                          <th style={{ padding: '8px 12px' }}>Dept · Function</th>
                          <th style={{ padding: '8px 12px' }}>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {missing.map((k) => (
                          <tr key={k.strategy_kpisid} style={{ borderTop: `1px solid ${FM_COLORS.borderLight}` }}>
                            <td style={{ padding: '8px 12px' }}>
                              {k.btm_kpibusinessname}{' '}
                              <span
                                style={{
                                  marginLeft: 6,
                                  fontSize: 10,
                                  fontWeight: 700,
                                  color: FM_COLORS.typeEquation,
                                }}
                              >
                                PM KPI
                              </span>
                            </td>
                            <td style={{ padding: '8px 12px' }}>{k.strategy_kpitype}</td>
                            <td style={{ padding: '8px 12px' }}>
                              {kpiDeptFunctionLabel(k, departments, functions)}
                            </td>
                            <td style={{ padding: '8px 12px' }}>
                              <span
                                style={{
                                  padding: '2px 8px',
                                  borderRadius: 999,
                                  background: FM_COLORS.noOrgLinkBg,
                                  color: FM_COLORS.noOrgLink,
                                  fontSize: 11,
                                  fontWeight: 600,
                                }}
                              >
                                no target
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              );
            })}
          </div>
        ))
      )}
    </div>
  );
}
