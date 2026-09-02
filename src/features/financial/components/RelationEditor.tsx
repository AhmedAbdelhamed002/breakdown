import { Button } from '@shared/components/Button/Button';
import type { RelationFactor, StrategyKpi, FactorDirection } from '../models/types';
import { SearchableSelect } from './SearchableSelect';

interface RelationEditorProps {
  factors: RelationFactor[];
  onFactorsChange: (factors: RelationFactor[]) => void;
  availableKpis: StrategyKpi[];
  /** KPIs allowed as factors (excludes result / calculated KPIs). */
  selectableKpis?: StrategyKpi[];
  emptyHint?: string;
  readOnly?: boolean;
  /** BI-supplied baseline from pm_kpiachievment — not edited on the model */
  baseline?: number | null;
}

export function RelationEditor({
  factors,
  onFactorsChange,
  availableKpis,
  selectableKpis,
  emptyHint,
  readOnly = false,
  baseline = null,
}: RelationEditorProps) {
  const pickerKpis = selectableKpis ?? availableKpis;
  const kpiOptions = pickerKpis.map((kpi) => ({
    value: kpi.strategy_kpisid,
    label: kpi.btm_kpibusinessname || 'Unnamed KPI',
  }));
  const handleAddFactor = () => {
    const firstKpi = pickerKpis[0];
    if (!firstKpi) return;
    onFactorsChange([
      ...factors,
      {
        pm_relationfactorid: 'rf_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
        pm_model: '',
        pm_factorkpi: firstKpi.strategy_kpisid,
        pm_direction: 'Increases',
        pm_inputpct: 10,
        pm_resultpct: 5,
      },
    ]);
  };

  const handleRemoveFactor = (index: number) => {
    onFactorsChange(factors.filter((_, i) => i !== index));
  };

  const handleUpdateFactor = (index: number, updates: Partial<RelationFactor>) => {
    onFactorsChange(factors.map((f, i) => (i === index ? { ...f, ...updates } : f)));
  };

  const setResultDirection = (index: number, dir: 'increases' | 'decreases') => {
    const f = factors[index];
    if (!f) return;
    const mag = Math.abs(f.pm_resultpct || 0);
    handleUpdateFactor(index, { pm_resultpct: dir === 'decreases' ? -mag : mag });
  };

  const setResultMagnitude = (index: number, raw: number) => {
    const f = factors[index];
    if (!f) return;
    const sign = (f.pm_resultpct ?? 0) < 0 ? -1 : 1;
    handleUpdateFactor(index, { pm_resultpct: sign * Math.abs(raw || 0) });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>
          Baseline result
        </div>
        <div
          style={{
            padding: '10px 12px',
            borderRadius: 'var(--r-sm)',
            border: '1px solid var(--border)',
            background: 'var(--bg)',
            fontWeight: 600,
            fontSize: 15,
            color: baseline == null ? 'var(--text-muted)' : 'var(--text-primary)',
          }}
        >
          {baseline == null ? '—' : baseline}
        </div>
        <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-muted)' }}>
          Provided by BI (KPI Achievement) — each line below nudges it up or down.
        </div>
      </div>

      {factors.length === 0 ? (
        <div className="alert alert-info" style={{ margin: 0 }}>
          No factors yet — add one below.
          {pickerKpis.length === 0 && emptyHint ? ` ${emptyHint}` : ''}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {factors.map((factor, index) => {
            const outDir = (factor.pm_resultpct ?? 0) < 0 ? 'decreases' : 'increases';
            return (
              <div
                key={factor.pm_relationfactorid || index}
                style={{
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--r)',
                  padding: 14,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                  position: 'relative',
                }}
              >
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => handleRemoveFactor(index)}
                    title="Remove"
                    style={{ position: 'absolute', top: 8, right: 8, background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}
                  >
                    ✕
                  </button>
                )}

                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>When</div>
                <SearchableSelect
                  disabled={readOnly}
                  value={factor.pm_factorkpi}
                  onChange={(kpiId) => {
                    if (!pickerKpis.some((k) => k.strategy_kpisid === kpiId)) return;
                    handleUpdateFactor(index, { pm_factorkpi: kpiId });
                  }}
                  placeholder={pickerKpis.length ? 'Search KPI…' : emptyHint || 'No eligible KPIs'}
                  options={kpiOptions}
                  valueLabel={availableKpis.find((k) => k.strategy_kpisid === factor.pm_factorkpi)?.btm_kpibusinessname}
                />

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <select
                    disabled={readOnly}
                    value={factor.pm_direction}
                    onChange={(e) => handleUpdateFactor(index, { pm_direction: e.target.value as FactorDirection })}
                    style={{ width: 'auto' }}
                  >
                    <option value="Increases">increases</option>
                    <option value="Decreases">decreases</option>
                  </select>
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>by</span>
                  <input
                    type="number"
                    disabled={readOnly}
                    value={factor.pm_inputpct}
                    onChange={(e) => handleUpdateFactor(index, { pm_inputpct: parseFloat(e.target.value) || 0 })}
                    style={{ width: 72, textAlign: 'right' }}
                  />
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>%</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 500 }}>→ result</span>
                  <select
                    disabled={readOnly}
                    value={outDir}
                    onChange={(e) => setResultDirection(index, e.target.value as 'increases' | 'decreases')}
                    style={{ width: 'auto' }}
                  >
                    <option value="increases">increases</option>
                    <option value="decreases">decreases</option>
                  </select>
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>by</span>
                  <input
                    type="number"
                    disabled={readOnly}
                    value={Math.abs(factor.pm_resultpct || 0)}
                    onChange={(e) => setResultMagnitude(index, parseFloat(e.target.value) || 0)}
                    style={{ width: 72, textAlign: 'right' }}
                  />
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>%</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!readOnly && (
        <Button onClick={handleAddFactor} disabled={pickerKpis.length === 0} style={{ alignSelf: 'flex-start' }}>
          + Add factor
        </Button>
      )}
    </div>
  );
}
