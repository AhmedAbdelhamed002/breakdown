import { useEffect, useMemo, useState } from 'react';
import type {
  FinancialModel,
  ModelTerm,
  RelationFactor,
  StrategyKpi,
  TesterComponentRow,
  TesterPeriod,
  YesNo,
  ModelType,
  OrgRollupRow,
  EntityKind,
  OrgOutput,
  OrgOutcome,
} from '../models/types';
import { EquationEditor } from './EquationEditor';
import { RelationEditor } from './RelationEditor';
import {
  constraintRefusalMessage,
  recomputeResult,
  solveForResult,
  violatesConstraint,
} from '../utils/evaluator';
import {
  equationMissingOperators,
  insertDefaultMultiplyOperators,
} from '../utils/equationOperators';
import { MONTH_NAMES } from '../constants';
import { Button } from '@shared/components/Button/Button';
import { Badge } from '@shared/components/Badge/Badge';
import { DataTable, type Column } from '@shared/components/DataTable/DataTable';
import { getModelStatusInfo } from '../utils/modelStatus';
import { SearchableSelect } from './SearchableSelect';
import type { NoticeContent } from './NoticeModal';
import { relationFactorRowsMissingSourceMessage } from '../utils/modelKpiEligibility';
import {
  findRepeatedResultKpiId,
  percentFromTestValue,
  percentReferenceBase,
  testValueFromPercent,
} from '../utils/equationTestPercent';

interface BuilderTesterViewProps {
  model: FinancialModel;
  resultKpiName: string;
  functionName?: string;
  businessUnitName?: string;
  terms: ModelTerm[];
  factors: RelationFactor[];
  availableKpis: StrategyKpi[];
  orgOutputs?: OrgOutput[];
  orgOutcomes?: OrgOutcome[];
  rows: TesterComponentRow[];
  period: TesterPeriod;
  workingDays?: number | null;
  getOrgRollup?: (resultValue: number) => OrgRollupRow[];
  models?: FinancialModel[];
  getModelLabel?: (m: FinancialModel) => string;
  onSelectModel?: (modelId: string) => void;
  onPeriodChange: (period: TesterPeriod) => void;
  onTermsChange: (terms: ModelTerm[]) => void;
  onFactorsChange: (factors: RelationFactor[]) => void;
  onToggleWorkingDays: (v: YesNo) => void;
  onSwitchType: (type: ModelType) => void;
  onNameChange?: (name: string) => void;
  /** BI-supplied result baseline from KPI Achievement — not stored on pm_model */
  resultBaseline?: number | null;
  onResultChange?: (kind: EntityKind, refId: string, refName?: string) => void;
  onBack: () => void;
  isSavingDefinition?: boolean;
  saveError?: string | null;
  onSubmitForReview: (terms?: ModelTerm[]) => void | Promise<void>;
  onSaveTarget: (values: Record<string, number>, resultValue: number) => void | Promise<void>;
  onSaveProposal: (
    values: Record<string, number>,
    resultValue: number,
    terms?: ModelTerm[]
  ) => void | Promise<void>;
  onNotice?: (notice: NoticeContent) => void;
  /** Region / BU / Department / Function required to load KPI Achievements into Test. */
  testContextReady?: boolean;
  missingTestFilters?: string[];
}

function fmt(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—';
  return Math.round(n * 100) / 100 + '';
}

export function BuilderTesterView({
  model,
  resultKpiName,
  functionName,
  businessUnitName,
  terms,
  factors,
  availableKpis,
  orgOutputs = [],
  orgOutcomes = [],
  rows,
  period,
  workingDays,
  getOrgRollup,
  models = [],
  getModelLabel,
  onSelectModel,
  onPeriodChange,
  onTermsChange,
  onFactorsChange,
  onToggleWorkingDays,
  onSwitchType,
  onNameChange,
  resultBaseline = null,
  onResultChange,
  onBack,
  isSavingDefinition = false,
  saveError = null,
  onSubmitForReview,
  onSaveTarget,
  onSaveProposal,
  onNotice,
  testContextReady = true,
  missingTestFilters = [],
}: BuilderTesterViewProps) {
  const locked =
    model.statuscode === 'Sealed' ||
    model.statuscode === 'In Review' ||
    model.statuscode === 'Approved By Finance' ||
    model.pm_modeltypevalue === 2 ||
    model.pm_modeltypevalue === 3 ||
    model.pm_modeltypevalue === 4;
  const isSealed = model.statuscode === 'Sealed' || model.pm_modeltypevalue === 3;
  const isDraft = model.statuscode === 'Draft';
  const isEquation = model.pm_modeltype === 'Equation';

  const [testValues, setTestValues] = useState<Record<string, number>>({});
  const [constraintNotes, setConstraintNotes] = useState<Record<string, string>>({});
  const [testDrafts, setTestDrafts] = useState<Record<string, string>>({});
  const [testPercentDrafts, setTestPercentDrafts] = useState<Record<string, string>>({});
  const [solveNote, setSolveNote] = useState('');
  const [targetDraft, setTargetDraft] = useState('');

  const componentRows = useMemo(
    () => rows.filter((r) => !r.isCalculatedResult),
    [rows]
  );

  const repeatedResultKpiId = useMemo(
    () => (isEquation ? findRepeatedResultKpiId(model, terms) : ''),
    [isEquation, model, terms]
  );

  const percentBaseRow = useMemo(() => {
    if (!repeatedResultKpiId) return undefined;
    return (
      rows.find(
        (r) =>
          String(r.kpiId ?? '')
            .replace(/[{}]/g, '')
            .toLowerCase()
            .trim() === repeatedResultKpiId
      ) || componentRows.find(
        (r) =>
          String(r.kpiId ?? '')
            .replace(/[{}]/g, '')
            .toLowerCase()
            .trim() === repeatedResultKpiId
      )
    );
  }, [rows, componentRows, repeatedResultKpiId]);

  const percentBase = useMemo(() => percentReferenceBase(percentBaseRow), [percentBaseRow]);
  const showTestPercent =
    isEquation && Boolean(repeatedResultKpiId) && percentBase != null && percentBase !== 0;

  const kpiIdsKey = componentRows.map((r) => r.kpiId).join('|');
  const achievementKey = componentRows
    .map(
      (r) =>
        `${r.kpiId}:${r.actualValue ?? 'n'}:${r.baselineValue ?? 'n'}:${r.historicalValue ?? 'n'}:${r.targetValue ?? 'n'}`
    )
    .join('|');

  useEffect(() => {
    const next: Record<string, number> = {};
    componentRows.forEach((r) => {
      next[r.kpiId] = r.currentValue;
    });
    setTestValues(next);
    setConstraintNotes({});
    setTestDrafts({});
    setTestPercentDrafts({});
    setSolveNote('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model.pm_modelid, period.month, period.year, period.fullYear]);

  useEffect(() => {
    setTestValues((prev) => {
      const next: Record<string, number> = {};
      componentRows.forEach((r) => {
        next[r.kpiId] = Object.prototype.hasOwnProperty.call(prev, r.kpiId)
          ? prev[r.kpiId]
          : r.currentValue;
      });
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kpiIdsKey]);

  useEffect(() => {
    setTestValues((prev) => {
      let changed = false;
      const next = { ...prev };
      componentRows.forEach((r) => {
        if ((next[r.kpiId] == null || next[r.kpiId] === 0) && r.currentValue) {
          next[r.kpiId] = r.currentValue;
          changed = true;
        }
      });
      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [achievementKey]);

  const kpiAgg = useMemo(() => {
    const m = new Map<string, string>();
    availableKpis.forEach((k) => {
      if (k.strategy_aggregatetype) m.set(k.strategy_kpisid, k.strategy_aggregatetype);
    });
    return m;
  }, [availableKpis]);

  const resultConstraint = useMemo(() => {
    const row =
      rows.find((r) => r.isCalculatedResult) ||
      rows.find((r) => r.kpiId === model.pm_resultref) ||
      rows.find((r) => r.kpiId === model.pm_calculatedkpi);
    return row?.ceiling;
  }, [rows, model.pm_resultref, model.pm_calculatedkpi]);

  const evalResult = useMemo(() => {
    const values = new Map<string, number>();
    const baseValues = new Map<string, number>();

    Object.entries(testValues).forEach(([kpiId, n]) => {
      if (Number.isFinite(n)) values.set(kpiId, n);
    });

    rows.forEach((r) => {
      if (r.isCalculatedResult) return;
      const typed = testValues[r.kpiId];
      const current = typed != null && Number.isFinite(typed) ? typed : r.currentValue;
      values.set(r.kpiId, current);
      baseValues.set(
        r.kpiId,
        r.baselineValue ?? r.actualValue ?? (current !== 0 ? current : 1)
      );
    });

    terms.forEach((t) => {
      if (t.pm_termtype !== 'KPI' || !t.pm_kpi || values.has(t.pm_kpi)) return;
      const typed = testValues[t.pm_kpi];
      if (typed != null && Number.isFinite(typed)) values.set(t.pm_kpi, typed);
    });

    return recomputeResult({
      type: isEquation ? 'Equation' : 'Relation',
      terms,
      factors,
      baseline: resultBaseline ?? 0,
      values,
      baseValues,
      workingDays: model.pm_useworkingdays === 'Yes' ? workingDays ?? undefined : undefined,
      resultConstraint,
      kpiAgg,
    });
  }, [
    isEquation,
    resultBaseline,
    model.pm_useworkingdays,
    terms,
    factors,
    rows,
    testValues,
    workingDays,
    resultConstraint,
    kpiAgg,
  ]);

  const orgRollup = useMemo(
    () => (getOrgRollup ? getOrgRollup(evalResult.value) : []),
    [getOrgRollup, evalResult.value]
  );

  const handleTestChange = (kpiId: string, value: number) => {
    const row = rows.find((r) => r.kpiId === kpiId);
    if (!row || row.isCalculatedResult) return;
    const n = Number(value);
    const next = Number.isFinite(n) ? n : 0;
    if (violatesConstraint(next, row.ceiling)) {
      setConstraintNotes((prev) => ({
        ...prev,
        [kpiId]: constraintRefusalMessage(row.kpiName, row.ceiling),
      }));
      return;
    }
    setConstraintNotes((prev) => {
      if (!prev[kpiId]) return prev;
      const rest = { ...prev };
      delete rest[kpiId];
      return rest;
    });
    setTestValues((prev) => ({ ...prev, [kpiId]: next }));
    setTestPercentDrafts((prev) => {
      if (prev[kpiId] === undefined) return prev;
      const rest = { ...prev };
      delete rest[kpiId];
      return rest;
    });
    setSolveNote('');
  };

  const handleTestPercentChange = (kpiId: string, percent: number) => {
    if (!showTestPercent || percentBase == null || percentBase === 0) return;
    const nextTest = Math.round(testValueFromPercent(percent, percentBase) * 100) / 100;
    handleTestChange(kpiId, nextTest);
  };

  const handleSolve = (rawTarget: number) => {
    if (!isEquation) return;
    const values = new Map<string, number>();
    const ceilings = new Map<string, { min?: number; max?: number }>();
    const comps: string[] = [];
    componentRows.forEach((r) => {
      comps.push(r.kpiId);
      values.set(r.kpiId, testValues[r.kpiId] ?? r.currentValue);
      if (r.ceiling) ceilings.set(r.kpiId, r.ceiling);
    });

    const solved = solveForResult(
      terms,
      comps,
      values,
      ceilings,
      rawTarget,
      model.pm_useworkingdays === 'Yes' ? workingDays ?? undefined : undefined,
      kpiAgg
    );

    const next: Record<string, number> = {};
    solved.vals.forEach((v, k) => {
      next[k] = Math.round(v * 100) / 100;
    });
    setTestValues((prev) => ({ ...prev, ...next }));
    setTestPercentDrafts({});
    setSolveNote(solved.ok ? '' : solved.reason);
    setTargetDraft(String(Math.round(rawTarget)));
  };

  const handleSave = (mode: 'target' | 'proposal', equationTerms = terms) => {
    if (!testContextReady) {
      onNotice?.({
        tone: 'warning',
        title: 'Cannot save',
        message: `Select ${missingFiltersLabel || 'BU, Department and Function'} in the filter bar before saving a proposal.`,
      });
      return;
    }
    // Relation: every factor KPI (not the result KPI) must have Actual or Baseline.
    if (!isEquation) {
      const factorRows = rows.filter((r) => !r.isCalculatedResult);
      const blocked = relationFactorRowsMissingSourceMessage(factorRows);
      if (blocked) {
        onNotice?.({
          tone: 'warning',
          title: 'Cannot save as proposal',
          message: blocked,
        });
        return;
      }
    }
    for (const r of componentRows) {
      const v = testValues[r.kpiId] ?? r.currentValue;
      if (violatesConstraint(v, r.ceiling)) {
        onNotice?.({
          tone: 'warning',
          title: 'Cannot save',
          message: constraintRefusalMessage(r.kpiName, r.ceiling),
        });
        return;
      }
    }
    const resultRow = rows.find((r) => r.isCalculatedResult);
    if (resultRow && violatesConstraint(evalResult.value, resultRow.ceiling ?? resultConstraint)) {
      onNotice?.({
        tone: 'warning',
        title: 'Cannot save',
        message: `Calculated result ${fmt(evalResult.value)} is outside its constraint ${
          resultRow.ceiling?.min != null || resultRow.ceiling?.max != null
            ? `[${resultRow.ceiling?.min ?? '—'}, ${resultRow.ceiling?.max ?? '—'}]`
            : ''
        }`,
      });
      return;
    }
    const componentValues: Record<string, number> = {};
    componentRows.forEach((r) => {
      const v = testValues[r.kpiId];
      if (v != null && Number.isFinite(v)) componentValues[r.kpiId] = v;
    });
    if (mode === 'target') void onSaveTarget(componentValues, evalResult.value);
    else void onSaveProposal(componentValues, evalResult.value, equationTerms);
  };

  const ensureEquationOperatorsThen = (proceed: (nextTerms: ModelTerm[]) => void) => {
    if (!isEquation || !equationMissingOperators(terms)) {
      proceed(terms);
      return;
    }
    onNotice?.({
      tone: 'warning',
      title: 'Operators required',
      message:
        'This equation has components with no operator between them.\n\nUse multiplication (×) by default, or add operators yourself. The model will not be saved until operators are set.',
      actions: [
        {
          label: 'I’ll add operators',
          variant: 'secondary',
          onClick: () => undefined,
        },
        {
          label: 'Use multiplication (×)',
          variant: 'primary',
          onClick: () => {
            const next = insertDefaultMultiplyOperators(terms);
            onTermsChange(next);
            proceed(next);
          },
        },
      ],
    });
  };

  const resultOptions = useMemo(() => {
    if (model.pm_resultkind === 'OrgOutcome') {
      return orgOutcomes.map((o) => ({ id: o.pm_orgoutcomeid, name: o.pm_name }));
    }
    if (model.pm_resultkind === 'OrgOutput') {
      return orgOutputs.map((o) => ({ id: o.pm_orgoutputid, name: o.pm_name }));
    }
    return availableKpis.map((k) => ({
      id: k.strategy_kpisid,
      name: k.btm_kpibusinessname,
    }));
  }, [model.pm_resultkind, availableKpis, orgOutputs, orgOutcomes]);

  const handleResultKindChange = (kind: EntityKind) => {
    if (!onResultChange) return;
    if (kind === 'OrgOutcome') {
      const first = orgOutcomes[0];
      onResultChange(kind, first?.pm_orgoutcomeid || '', first?.pm_name);
      return;
    }
    if (kind === 'OrgOutput') {
      const first = orgOutputs[0];
      onResultChange(kind, first?.pm_orgoutputid || '', first?.pm_name);
      return;
    }
    const first = availableKpis[0];
    onResultChange(kind, first?.strategy_kpisid || '', first?.btm_kpibusinessname);
  };

  const handleResultRefChange = (refId: string) => {
    if (!onResultChange) return;
    const opt = resultOptions.find((o) => o.id === refId);
    onResultChange(model.pm_resultkind, refId, opt?.name);
  };

  const componentIds = useMemo(() => {
    if (isEquation) {
      return [
        ...new Set(
          terms
            .filter((t) => t.pm_termtype === 'KPI' && t.pm_kpi)
            .map((t) => t.pm_kpi as string)
        ),
      ];
    }
    return [...new Set(factors.map((f) => f.pm_factorkpi).filter(Boolean))];
  }, [isEquation, terms, factors]);

  const orgLinkChips = useMemo(() => {
    return componentIds.map((id) => {
      const kpi = availableKpis.find((k) => k.strategy_kpisid === id);
      return { id, name: kpi?.btm_kpibusinessname || id };
    });
  }, [componentIds, availableKpis]);

  const hasOrgRollup = orgRollup.length > 0;
  const showNoLinkWarn =
    model.pm_resultkind === 'KPI' && !hasOrgRollup && Boolean(businessUnitName);

  const periodLabel = period.fullYear
    ? `full-year · ${period.year}`
    : `${MONTH_NAMES[period.month - 1]} ${period.year}`;

  const missingFiltersLabel = (() => {
    const items = missingTestFilters.filter(Boolean);
    if (items.length === 0) return '';
    if (items.length === 1) return items[0];
    if (items.length === 2) return `${items[0]} and ${items[1]}`;
    return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
  })();

  const hasAchievementData = rows.some(
    (r) => r.actualValue != null || r.baselineValue != null || r.historicalValue != null || r.targetValue != null
  );

  const { label: statusLabel, badge: statusBadge } = getModelStatusInfo(model);

  const testerColumns: Column<TesterComponentRow>[] = [
    {
      key: 'component',
      header: 'Component',
      render: (row) => {
        const isResult = Boolean(row.isCalculatedResult);
        const cur = isResult ? evalResult.value : testValues[row.kpiId] ?? row.currentValue;
        const outOfRange = !isResult && violatesConstraint(cur, row.ceiling);
        const constraintNote =
          constraintNotes[row.kpiId] || (outOfRange ? constraintRefusalMessage(row.kpiName, row.ceiling) : '');
        return (
          <>
            <div style={{ fontWeight: 500 }}>
              {row.kpiName}
              {isResult && <span className="pill" style={{ marginLeft: 6 }}>Result</span>}
              {row.isPercentage && <span className="pill" style={{ marginLeft: 6 }}>%</span>}
            </div>
            {row.ceiling && (
              <span style={{ display: 'inline-block', marginTop: 4, fontSize: 11, fontWeight: 600, color: 'var(--warning)' }}>
                Constraint: min {row.ceiling.min ?? 'none'} – max {row.ceiling.max ?? 'none'}
              </span>
            )}
            {constraintNote && (
              <span style={{ display: 'block', marginTop: 4, fontSize: 11, fontWeight: 600, color: 'var(--danger)', lineHeight: 1.35 }}>
                {constraintNote}
              </span>
            )}
          </>
        );
      },
    },
    {
      key: 'actual',
      header: 'Actual',
      render: (row) => <span style={{ color: 'var(--text-muted)', fontFamily: 'ui-monospace, monospace' }}>{fmt(row.actualValue)}</span>,
    },
    {
      key: 'baseline',
      header: 'Baseline',
      render: (row) => <span style={{ color: 'var(--text-muted)', fontFamily: 'ui-monospace, monospace' }}>{fmt(row.baselineValue)}</span>,
    },
    {
      key: 'historical',
      header: 'Historical',
      render: (row) => <span style={{ color: 'var(--text-muted)', fontFamily: 'ui-monospace, monospace' }}>{fmt(row.historicalValue)}</span>,
    },
    {
      key: 'target',
      header: 'Target',
      render: (row) => <span style={{ color: 'var(--text-muted)', fontFamily: 'ui-monospace, monospace' }}>{fmt(row.targetValue)}</span>,
    },
    {
      key: 'test',
      header: 'Test',
      render: (row) => {
        const isResult = Boolean(row.isCalculatedResult);
        const cur = isResult ? evalResult.value : testValues[row.kpiId] ?? row.currentValue;
        const base = row.baselineValue ?? row.actualValue ?? cur ?? 0;
        const smax = Math.max(base * 2, cur * 1.5, 1);
        const step = row.isPercentage ? 1 : base > 100 ? 1 : 0.1;
        const sliderMin = row.ceiling?.min ?? 0;
        const sliderMax = row.ceiling?.max != null ? row.ceiling.max : Math.max(smax, sliderMin + 1);
        const constraintNote =
          constraintNotes[row.kpiId] || (!isResult && violatesConstraint(cur, row.ceiling) ? constraintRefusalMessage(row.kpiName, row.ceiling) : '');
        const draft = testDrafts[row.kpiId];
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'stretch', minWidth: 140 }}>
            {isResult ? (
              <div
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  borderRadius: 'var(--r-sm)',
                  border: '1px solid var(--border)',
                  background: 'var(--bg)',
                  textAlign: 'right',
                  boxSizing: 'border-box',
                  fontFamily: 'ui-monospace, monospace',
                  fontSize: 13,
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                }}
                title="Calculated result — not editable. Change component Test values to update it."
              >
                {fmt(evalResult.value)}
              </div>
            ) : (
              <>
                <input
                  type="number"
                  step={0.01}
                  min={row.ceiling?.min}
                  max={row.ceiling?.max}
                  value={draft !== undefined ? draft : Math.round(cur * 100) / 100}
                  onChange={(e) => {
                    const raw = e.target.value;
                    setTestDrafts((prev) => ({ ...prev, [row.kpiId]: raw }));
                    if (raw === '' || raw === '-' || raw === '.' || raw === '-.') return;
                    const parsed = Number(raw);
                    if (!Number.isFinite(parsed)) return;
                    handleTestChange(row.kpiId, parsed);
                  }}
                  onBlur={() => {
                    const raw = testDrafts[row.kpiId];
                    if (raw !== undefined) {
                      const parsed = Number(raw);
                      if (Number.isFinite(parsed)) handleTestChange(row.kpiId, parsed);
                    }
                    setTestDrafts((prev) => {
                      if (prev[row.kpiId] === undefined) return prev;
                      const rest = { ...prev };
                      delete rest[row.kpiId];
                      return rest;
                    });
                  }}
                  style={{
                    textAlign: 'right',
                    fontFamily: 'ui-monospace, monospace',
                    fontSize: 13,
                    borderColor: constraintNote ? 'var(--danger)' : undefined,
                  }}
                />
                <input
                  type="range"
                  min={sliderMin}
                  max={sliderMax}
                  step={step}
                  value={Math.min(Math.max(cur, sliderMin), sliderMax)}
                  onChange={(e) => handleTestChange(row.kpiId, Number(e.target.value))}
                  style={{ width: '100%' }}
                />
              </>
            )}
          </div>
        );
      },
    },
    ...(showTestPercent
      ? [
          {
            key: 'testPercent',
            header: 'Test %',
            render: (row: TesterComponentRow) => {
              const isResult = Boolean(row.isCalculatedResult);
              if (isResult) {
                return <span style={{ color: 'var(--text-muted)', fontFamily: 'ui-monospace, monospace' }}>—</span>;
              }
              const cur = testValues[row.kpiId] ?? row.currentValue;
              const derivedPct = percentBase != null ? percentFromTestValue(cur, percentBase) : null;
              const pctDraft = testPercentDrafts[row.kpiId];
              return (
                <input
                  type="number"
                  step={0.01}
                  title={`% of ${percentBaseRow?.kpiName || 'repeated result KPI'} baseline (or actual if baseline is missing)`}
                  value={pctDraft !== undefined ? pctDraft : derivedPct == null ? '' : Math.round(derivedPct * 100) / 100}
                  onChange={(e) => {
                    const raw = e.target.value;
                    setTestPercentDrafts((prev) => ({ ...prev, [row.kpiId]: raw }));
                    if (raw === '' || raw === '-' || raw === '.' || raw === '-.') return;
                    const parsed = Number(raw);
                    if (!Number.isFinite(parsed)) return;
                    handleTestPercentChange(row.kpiId, parsed);
                  }}
                  onBlur={() => {
                    const raw = testPercentDrafts[row.kpiId];
                    if (raw !== undefined) {
                      const parsed = Number(raw);
                      if (Number.isFinite(parsed)) handleTestPercentChange(row.kpiId, parsed);
                    }
                    setTestPercentDrafts((prev) => {
                      if (prev[row.kpiId] === undefined) return prev;
                      const rest = { ...prev };
                      delete rest[row.kpiId];
                      return rest;
                    });
                  }}
                  style={{ textAlign: 'right', fontFamily: 'ui-monospace, monospace', fontSize: 13, width: '100%' }}
                />
              );
            },
          },
        ]
      : []),
  ];

  const rollupColumns: Column<OrgRollupRow>[] = [
    { key: 'level', header: 'Level', render: (r) => `Org ${r.kind}` },
    { key: 'entity', header: 'Entity', render: (r) => <strong>{r.orgEntityName}</strong> },
    {
      key: 'link',
      header: 'Link',
      render: (r) => <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{r.linkNote || (r.weightPct != null ? `${r.weightPct}%` : '—')}</span>,
    },
    {
      key: 'current',
      header: 'Current',
      render: (r) => <span style={{ fontFamily: 'ui-monospace, monospace' }}>{fmt(r.currentValue)}</span>,
    },
    {
      key: 'projected',
      header: 'Projected',
      render: (r) => (
        <span style={{ fontFamily: 'ui-monospace, monospace', color: r.delta > 0.5 ? 'var(--success)' : r.delta < -0.5 ? 'var(--danger)' : undefined }}>
          {r.delta > 0.5 ? '▲ ' : r.delta < -0.5 ? '▼ ' : ''}
          {fmt(r.projectedValue)}
        </span>
      ),
    },
    {
      key: 'existingTarget',
      header: 'Existing target',
      render: (r) => <span style={{ fontFamily: 'ui-monospace, monospace', color: 'var(--text-muted)' }}>{r.existingTarget != null ? fmt(r.existingTarget) : 'none'}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) =>
        r.conflict ? (
          <Badge status="rejected">conflict</Badge>
        ) : r.existingTarget != null ? (
          <Badge status="approved">ok</Badge>
        ) : null,
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h2 style={{ margin: '0 0 4px', fontFamily: 'var(--font-serif)', fontSize: 22, color: 'var(--brand-brown)' }}>
          Model Builder / Tester
        </h2>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>
          Build the equation or relation, test on real achievement data.
        </p>
      </div>

      {/* Model bar */}
      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '12px 16px' }}>
        <Button size="sm" onClick={onBack}>← Models</Button>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 220, flex: '1 1 240px' }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>Name</span>
          <input
            type="text"
            value={model.pm_name || ''}
            disabled={locked || !onNameChange}
            placeholder={resultKpiName}
            onChange={(e) => onNameChange?.(e.target.value.slice(0, 200))}
            style={{ flex: 1, minWidth: 160, fontWeight: 600 }}
          />
        </label>
        {models.length > 1 && onSelectModel && (
          <select
            value={model.pm_modelid}
            onChange={(e) => onSelectModel(e.target.value)}
            title="Switch model"
            style={{ maxWidth: 160, fontSize: 12, color: 'var(--text-muted)' }}
          >
            {models.map((m) => (
              <option key={m.pm_modelid} value={m.pm_modelid}>
                {getModelLabel?.(m) ?? m.pm_name ?? m.pm_modelid}
              </option>
            ))}
          </select>
        )}
        <Badge status={statusBadge}>{statusLabel}</Badge>
        <span className="pill">{model.pm_modeltype} model</span>
        {functionName && <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{functionName}</span>}
        <div style={{ flex: 1 }} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
          <input
            type="checkbox"
            checked={period.fullYear}
            onChange={(e) => onPeriodChange({ ...period, fullYear: e.target.checked })}
          />
          Full-year totals
        </label>
        {!period.fullYear && (
          <select
            value={period.month}
            onChange={(e) => onPeriodChange({ ...period, month: Number(e.target.value) })}
            style={{ width: 'auto' }}
          >
            {MONTH_NAMES.map((name, i) => (
              <option key={name} value={i + 1}>{name}</option>
            ))}
          </select>
        )}
        <select
          value={period.year}
          onChange={(e) => onPeriodChange({ ...period, year: Number(e.target.value) })}
          style={{ width: 'auto' }}
        >
          {[2025, 2026, 2027].map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>

      {showNoLinkWarn && (
        <div className="alert alert-warn">
          ⚠ No KPI in this model links to an Org Output/Outcome. Link one on Org Linkage so results roll up.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 16 }}>
        {/* Definition */}
        <div className="card">
          <div className="card-body" style={{ paddingBottom: 12 }}>
            <h3 style={{ margin: 0, fontFamily: 'var(--font-serif)', color: 'var(--brand-brown)' }}>Definition</h3>
            <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 12, color: 'var(--text-muted)' }}>
              <span>result:</span>
              <select
                value={model.pm_resultkind}
                disabled={locked || !onResultChange}
                onChange={(e) => handleResultKindChange(e.target.value as EntityKind)}
                style={{ width: 'auto' }}
              >
                <option value="OrgOutcome">Org Outcome</option>
                <option value="OrgOutput">Org Output</option>
                <option value="KPI">KPI</option>
              </select>
              <SearchableSelect
                value={model.pm_resultref || ''}
                disabled={locked || !onResultChange}
                onChange={handleResultRefChange}
                placeholder={model.pm_resultkind === 'KPI' ? 'Search KPI…' : 'Search…'}
                options={resultOptions.map((o) => ({ value: o.id, label: o.name }))}
                style={{ flex: 1, minWidth: 180 }}
              />
            </div>
          </div>

          <div className="card-body" style={{ paddingTop: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <select
              value={model.pm_modeltype}
              disabled={locked}
              onChange={(e) => onSwitchType(e.target.value as ModelType)}
              style={{ fontWeight: 600 }}
            >
              <option value="Equation">Equation</option>
              <option value="Relation">Relation</option>
            </select>

            {isEquation ? (
              <EquationEditor
                terms={terms}
                onTermsChange={onTermsChange}
                availableKpis={availableKpis}
                useWorkingDays={model.pm_useworkingdays}
                onToggleWorkingDays={onToggleWorkingDays}
                readOnly={locked}
              />
            ) : (
              <RelationEditor
                factors={factors}
                onFactorsChange={onFactorsChange}
                availableKpis={availableKpis}
                readOnly={locked}
                baseline={resultBaseline}
              />
            )}

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', fontSize: 12 }}>
              <span style={{ color: 'var(--text-muted)' }}>Org link:</span>
              {orgLinkChips.length === 0 ? (
                <span style={{ color: 'var(--text-muted)' }}>no components yet</span>
              ) : (
                orgLinkChips.map((c) => (
                  <span key={c.id} className="chip">
                    <span aria-hidden style={{ fontSize: 12, opacity: 0.85 }}>🔗</span>
                    {c.name}
                  </span>
                ))
              )}
            </div>

            <label
              style={{
                display: 'flex',
                gap: 10,
                alignItems: 'flex-start',
                padding: '12px 14px',
                background: 'var(--warning-bg)',
                borderRadius: 'var(--r-sm)',
                border: '1px solid var(--warning-light)',
                fontSize: 13,
                color: 'var(--warning)',
                cursor: locked ? 'default' : 'pointer',
              }}
            >
              <input
                type="checkbox"
                disabled={locked}
                checked={model.pm_useworkingdays === 'Yes'}
                onChange={(e) => onToggleWorkingDays(e.target.checked ? 'Yes' : 'No')}
                style={{ marginTop: 2 }}
              />
              <span>
                <b>× Working days</b> multiply the model result by this BU’s working days for the
                selected month and year
                {model.pm_useworkingdays === 'Yes' && (
                  <>
                    {' — '}
                    {workingDays != null ? (
                      <>
                        using <b>{fmt(workingDays)}</b>
                        {businessUnitName ? ` · ${businessUnitName}` : ''} ({periodLabel})
                      </>
                    ) : (
                      <span style={{ color: 'var(--danger)' }}>
                        {businessUnitName
                          ? 'no working-days record for this BU and period (using 1)'
                          : 'select a business unit (using 1)'}
                      </span>
                    )}
                  </>
                )}
              </span>
            </label>
          </div>
        </div>

        {/* Tester */}
        <div className="card">
          <div className="card-head">
            <div>
              <h3>
                Test — {periodLabel}
                {businessUnitName ? ` · ${businessUnitName}` : ''}
              </h3>
              {!testContextReady && (
                <div className="sub" style={{ color: 'var(--warning)' }}>
                  Select {missingFiltersLabel || 'Region, BU, Department, and Function'} above to load Actual /
                  Baseline / Historical / Target from KPI Achievements and make the test work.
                </div>
              )}
              {testContextReady && rows.length > 0 && !hasAchievementData && (
                <div className="sub">
                  No KPI Achievement found for the selected Region, BU, Department, Function, and period. You can
                  still type Test values — the result updates from the equation or relation as you edit.
                </div>
              )}
            </div>
          </div>
          <div className="card-body">
            {rows.length === 0 ? (
              <div style={{ padding: 16, color: 'var(--text-muted)' }}>Add components in the definition.</div>
            ) : (
              <DataTable columns={testerColumns} rows={rows} rowKey={(row) => row.kpiId} />
            )}
            {showTestPercent && percentBaseRow && (
              <p style={{ margin: '8px 0 0', fontSize: 11, color: 'var(--text-muted)' }}>
                Test % is relative to <b>{percentBaseRow.kpiName}</b>{' '}
                {percentBaseRow.baselineValue != null && Number.isFinite(percentBaseRow.baselineValue)
                  ? 'Baseline'
                  : 'Actual'}{' '}
                ({fmt(percentBase)}). Edit Test or Test % — the other updates automatically.
              </p>
            )}

            <div
              style={{
                marginTop: 16,
                padding: 16,
                background: isEquation ? 'var(--primary-faint)' : 'var(--bg)',
                borderRadius: 'var(--r-sm)',
                border: isEquation ? 'none' : '1px solid var(--border)',
                display: 'flex',
                justifyContent: 'space-between',
                gap: 16,
                flexWrap: 'wrap',
                alignItems: 'center',
              }}
            >
              <div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Result — {resultKpiName}</div>
                <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)' }}>
                  {isEquation && terms.length === 0 && componentRows.length === 0
                    ? '—'
                    : !isEquation && factors.length === 0
                      ? '—'
                      : !isEquation && resultBaseline == null
                        ? '—'
                        : fmt(evalResult.value)}
                  {evalResult.wasClamped && <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 600, color: 'var(--warning)' }}>clamped</span>}
                </div>
                {evalResult.expression && (
                  <div style={{ marginTop: 4, fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'ui-monospace, monospace' }}>
                    {evalResult.expression}
                  </div>
                )}
                {!isEquation && resultBaseline == null && (
                  <div style={{ marginTop: 4, fontSize: 11, color: 'var(--text-muted)' }}>
                    No achievement baseline for this result KPI.
                  </div>
                )}
              </div>
              <div style={{ minWidth: 220 }}>
                <div style={{ fontSize: 11, marginBottom: 6, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.3, fontWeight: 600 }}>
                  Set result{isEquation ? '' : ' (n/a for relation)'}
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {isEquation && (
                    <input
                      type="range"
                      min={0}
                      max={Math.max(evalResult.value * 2, 1)}
                      step={evalResult.value > 100 ? 1 : 0.1}
                      value={Number(targetDraft) || evalResult.value}
                      onChange={(e) => setTargetDraft(e.target.value)}
                      onMouseUp={(e) => handleSolve(Number((e.target as HTMLInputElement).value))}
                      onTouchEnd={(e) => handleSolve(Number((e.target as HTMLInputElement).value))}
                      style={{ flex: 1 }}
                      disabled={!isEquation}
                    />
                  )}
                  <input
                    type="number"
                    disabled={!isEquation}
                    value={targetDraft || Math.round(evalResult.value)}
                    onChange={(e) => setTargetDraft(e.target.value)}
                    onBlur={() => {
                      if (isEquation && targetDraft !== '') handleSolve(Number(targetDraft));
                    }}
                    style={{ width: 90 }}
                  />
                </div>
                {solveNote ? (
                  <div style={{ marginTop: 6, fontSize: 11, color: 'var(--danger)' }}>⚠ {solveNote}</div>
                ) : (
                  <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-muted)' }}>
                    drag to scale components proportionally; ceilinged hold
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Org roll-up */}
      <div className="card">
        <div className="card-head">
          <h3>Roll-up to organization (per-BU weight)</h3>
        </div>
        <div>
          {orgRollup.length === 0 ? (
            <div style={{ padding: 16, fontSize: 13, color: 'var(--text-muted)' }}>
              No output/outcome contribution found for this calculated KPI
              {businessUnitName ? ` in ${businessUnitName}` : ''}. Links come from the output contribution and
              outcome contribution tables.
            </div>
          ) : (
            <DataTable columns={rollupColumns} rows={orgRollup} rowKey={(r) => `${r.kind}-${r.orgEntityId}`} />
          )}
          {orgRollup.some((r) => r.conflict) && (
            <div className="alert alert-warn" style={{ margin: 16 }}>
              ⚠ Projected roll-up disagrees with an existing org target — saving will raise a conflict for review.
            </div>
          )}
        </div>
      </div>

      {/* Footer actions */}
      <div className="card" style={{ padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', maxWidth: 520 }}>
          {saveError ? (
            <span style={{ color: 'var(--danger)' }}>⚠ {saveError}</span>
          ) : (
            <>
              <b>Save as proposal</b> stores test values in pm_proposal (source: Financial Modelar).{' '}
              On a sealed model it does the same — it does not overwrite the sealed model.{' '}
              If a proposed value disagrees with an existing KPI, org output, or org outcome target, a{' '}
              <b>conflict</b> is raised and linked to the proposal.{' '}
              <b>Submit for review</b> sets the model to Under Review.
            </>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {isDraft && (
            <Button
              variant="primary"
              disabled={isSavingDefinition}
              onClick={() => ensureEquationOperatorsThen((nextTerms) => void onSubmitForReview(nextTerms))}
            >
              {isSavingDefinition ? 'Saving…' : 'Submit for review'}
            </Button>
          )}
          {isSealed ? (
            <Button variant="accent" disabled={isSavingDefinition} onClick={() => handleSave('target')}>
              {isSavingDefinition ? 'Saving…' : `Save as proposal (${period.fullYear ? '12 months' : MONTH_NAMES[period.month - 1]})`}
            </Button>
          ) : (
            <Button
              variant="accent"
              disabled={isSavingDefinition}
              onClick={() => ensureEquationOperatorsThen((nextTerms) => handleSave('proposal', nextTerms))}
            >
              {isSavingDefinition ? 'Saving…' : 'Save as proposal'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
