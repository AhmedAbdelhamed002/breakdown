import { useState, useEffect, useMemo } from 'react';
import type { TesterComponentRow, FinancialModel, ModelTerm, RelationFactor } from '../models/types';
import { recomputeResult, solveForResult } from '../utils/evaluator';
import { FM_COLORS, FM_FONT, FM_RADIUS, FM_SHADOW } from '../constants';

interface ModelTesterProps {
  model: FinancialModel;
  resultKpiName: string;
  rows: TesterComponentRow[];
  terms: ModelTerm[];
  factors: RelationFactor[];
  workingDays?: number;
  onSaveTarget: (kpiId: string, value: number) => void;
  onSaveProposal: (value: number) => void;
}

/** @deprecated Prefer BuilderTesterView — kept for compatibility. */
export function ModelTester({
  model,
  resultKpiName,
  rows,
  terms,
  factors,
  workingDays = 22,
  onSaveTarget,
  onSaveProposal,
}: ModelTesterProps) {
  const [currentValues, setCurrentValues] = useState<Record<string, number>>({});
  const [targetInputOpen, setTargetInputOpen] = useState(false);
  const [targetValue, setTargetValue] = useState<string>('');

  useEffect(() => {
    const initial: Record<string, number> = {};
    rows.forEach((r) => {
      initial[r.kpiId] = r.currentValue !== undefined ? r.currentValue : r.baselineValue ?? r.actualValue ?? 0;
    });
    setCurrentValues(initial);
  }, [rows]);

  const evalResult = useMemo(() => {
    const values = new Map<string, number>();
    const baseValues = new Map<string, number>();
    rows.forEach((r) => {
      values.set(r.kpiId, currentValues[r.kpiId] ?? r.currentValue);
      baseValues.set(r.kpiId, r.actualValue ?? r.baselineValue ?? 1);
    });
    return recomputeResult({
      type: model.pm_modeltype,
      terms,
      factors,
      baseline: rows.find((r) => r.kpiId === model.pm_resultref)?.baselineValue ?? 0,
      values,
      baseValues,
      workingDays: model.pm_useworkingdays === 'Yes' ? workingDays : undefined,
    });
  }, [model, terms, factors, currentValues, rows, workingDays]);

  const handleValueChange = (kpiId: string, val: number) => {
    setCurrentValues((prev) => ({ ...prev, [kpiId]: val }));
  };

  const handleSolve = () => {
    const targetNum = parseFloat(targetValue);
    if (isNaN(targetNum)) return;

    const valuesMap = new Map<string, number>();
    const ceilingsMap = new Map<string, { min?: number; max?: number }>();
    const componentIds: string[] = [];

    rows.forEach((r) => {
      componentIds.push(r.kpiId);
      valuesMap.set(r.kpiId, currentValues[r.kpiId] ?? r.baselineValue);
      if (r.ceiling) ceilingsMap.set(r.kpiId, r.ceiling);
    });

    const solved = solveForResult(
      terms,
      componentIds,
      valuesMap,
      ceilingsMap,
      targetNum,
      model.pm_useworkingdays === 'Yes' ? workingDays : undefined
    );
    const nextVals: Record<string, number> = {};
    solved.vals.forEach((v, k) => {
      nextVals[k] = Math.round(v * 100) / 100;
    });
    setCurrentValues((prev) => ({ ...prev, ...nextVals }));
    setTargetInputOpen(false);
    setTargetValue('');
  };

  const handleReset = () => {
    const initial: Record<string, number> = {};
    rows.forEach((r) => {
      initial[r.kpiId] = r.actualValue ?? r.baselineValue ?? 0;
    });
    setCurrentValues(initial);
  };

  const isSealed = model.statuscode === 'Sealed';
  const isDraft = model.statuscode === 'Draft';

  return (
    <div
      style={{
        backgroundColor: '#fff',
        borderRadius: FM_RADIUS.lg,
        boxShadow: FM_SHADOW.card,
        padding: '24px',
        fontFamily: FM_FONT.family,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <h3 style={{ margin: 0 }}>{resultKpiName}</h3>
        <span>{model.pm_modeltype} Model</span>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16 }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', padding: 8, color: FM_COLORS.textMuted }}>Component</th>
            <th style={{ textAlign: 'right', padding: 8, color: FM_COLORS.textMuted }}>Actual</th>
            <th style={{ textAlign: 'right', padding: 8, color: FM_COLORS.textMuted }}>Baseline</th>
            <th style={{ textAlign: 'right', padding: 8, color: FM_COLORS.textMuted }}>Test</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const val = currentValues[row.kpiId] ?? row.currentValue;
            return (
              <tr key={row.kpiId}>
                <td style={{ padding: 8 }}>{row.kpiName}</td>
                <td style={{ padding: 8, textAlign: 'right' }}>{row.actualValue}</td>
                <td style={{ padding: 8, textAlign: 'right' }}>{row.baselineValue}</td>
                <td style={{ padding: 8, textAlign: 'right' }}>
                  <input
                    type="number"
                    value={val}
                    onChange={(e) => handleValueChange(row.kpiId, parseFloat(e.target.value) || 0)}
                    style={{ width: 90, padding: 4 }}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div style={{ fontSize: 28, fontWeight: 700, color: FM_COLORS.accent, marginBottom: 16 }}>
        {evalResult.value.toLocaleString(undefined, { maximumFractionDigits: 2 })}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        {targetInputOpen ? (
          <>
            <input
              type="number"
              value={targetValue}
              onChange={(e) => setTargetValue(e.target.value)}
              style={{ width: 100, padding: 6 }}
            />
            <button type="button" onClick={handleSolve}>
              Solve
            </button>
            <button type="button" onClick={() => setTargetInputOpen(false)}>
              Cancel
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setTargetInputOpen(true)}
            disabled={model.pm_modeltype !== 'Equation'}
          >
            Solve for Target
          </button>
        )}
        <button type="button" onClick={handleReset}>
          Reset
        </button>
        <div style={{ flex: 1 }} />
        {isDraft && (
          <button type="button" onClick={() => onSaveProposal(evalResult.value)}>
            Save as Proposal
          </button>
        )}
        {isSealed && (
          <button type="button" onClick={() => onSaveTarget(model.pm_resultref, evalResult.value)}>
            Save as Target
          </button>
        )}
      </div>
    </div>
  );
}
