import { useMemo, useState } from 'react';
import { Button } from '@shared/components/Button/Button';
import type { ModelTerm, StrategyKpi, YesNo, TermType, Operator } from '../models/types';
import { SearchableSelect } from './SearchableSelect';

interface EquationEditorProps {
  terms: ModelTerm[];
  onTermsChange: (terms: ModelTerm[]) => void;
  availableKpis: StrategyKpi[];
  /** KPIs allowed as equation terms (excludes result / calculated KPIs). */
  selectableKpis?: StrategyKpi[];
  useWorkingDays: YesNo;
  onToggleWorkingDays: (v: YesNo) => void;
  readOnly?: boolean;
}

export function EquationEditor({
  terms,
  onTermsChange,
  availableKpis,
  selectableKpis,
  readOnly = false,
}: EquationEditorProps) {
  const [selectedKpi, setSelectedKpi] = useState<string>('');
  const [constantDraft, setConstantDraft] = useState<string>('');
  const pickerKpis = selectableKpis ?? availableKpis;

  const kpiOptions = useMemo(
    () =>
      pickerKpis.map((kpi) => ({
        value: kpi.strategy_kpisid,
        label: kpi.btm_kpibusinessname || 'Unnamed KPI',
      })),
    [pickerKpis]
  );

  const handleAddTerm = (term: Partial<ModelTerm>) => {
    if (readOnly) return;
    const newTerm: ModelTerm = {
      pm_modeltermid: '',
      pm_model: '',
      pm_sequence: terms.length + 1,
      pm_termtype: term.pm_termtype as TermType,
      pm_kpi: term.pm_kpi,
      pm_operator: term.pm_operator,
      pm_constant: term.pm_constant,
    };
    onTermsChange([...terms, newTerm]);
  };

  const handleRemoveTerm = (index: number) => {
    if (readOnly) return;
    const newTerms = terms.filter((_, i) => i !== index).map((t, i) => ({
      ...t,
      pm_sequence: i + 1,
    }));
    onTermsChange(newTerms);
  };

  const handleAddKpi = () => {
    if (!selectedKpi) return;
    if (!pickerKpis.some((k) => k.strategy_kpisid === selectedKpi)) return;
    handleAddTerm({ pm_termtype: 'KPI', pm_kpi: selectedKpi });
    setSelectedKpi('');
  };

  const handleAddConstant = () => {
    if (readOnly) return;
    const n = Number(constantDraft);
    if (constantDraft.trim() === '' || Number.isNaN(n)) return;
    handleAddTerm({ pm_termtype: 'Constant', pm_constant: n });
    setConstantDraft('');
  };

  const removeButton = (index: number) =>
    !readOnly && (
      <button
        onClick={() => handleRemoveTerm(index)}
        style={{ background: 'none', border: 'none', padding: '0 2px', cursor: 'pointer', color: 'inherit', opacity: 0.7, fontSize: 14, lineHeight: 1 }}
        title="Remove"
      >
        ×
      </button>
    );

  // Chip rendering — KPI terms use the shared removable-chip look, operators/
  // constants/brackets use the shared pill look (distinguishable by content).
  const renderChip = (term: ModelTerm, index: number) => {
    if (term.pm_termtype === 'KPI') {
      const kpi = availableKpis.find((k) => k.strategy_kpisid === term.pm_kpi);
      return (
        <span key={`${index}-${term.pm_termtype}`} className="chip">
          {kpi ? kpi.btm_kpibusinessname : `Unknown KPI (${term.pm_kpi})`}
          {removeButton(index)}
        </span>
      );
    }
    if (term.pm_termtype === 'Operator') {
      let opSymbol = term.pm_operator as string;
      if (opSymbol === '*') opSymbol = '×';
      else if (opSymbol === '/') opSymbol = '÷';
      return (
        <span key={`${index}-${term.pm_termtype}`} className="pill" style={{ fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {opSymbol}
          {removeButton(index)}
        </span>
      );
    }
    if (term.pm_termtype === 'Constant') {
      return (
        <span key={`${index}-${term.pm_termtype}`} className="pill" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {term.pm_constant}
          {removeButton(index)}
        </span>
      );
    }
    // Bracket
    return (
      <span
        key={`${index}-${term.pm_termtype}`}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)', fontSize: 14, fontWeight: 700, padding: '0 4px' }}
      >
        {term.pm_operator}
        {removeButton(index)}
      </span>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          alignItems: 'center',
          minHeight: 40,
          padding: 12,
          backgroundColor: 'var(--bg)',
          borderRadius: 'var(--r-sm)',
          border: '1px solid var(--border)',
        }}
      >
        {terms.length === 0 ? (
          <span style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: 12 }}>
            Equation is empty. Add terms below.
          </span>
        ) : (
          terms.map((term, index) => renderChip(term, index))
        )}
      </div>

      {!readOnly && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', minWidth: 260, flex: 1 }}>
            <SearchableSelect
              value={selectedKpi}
              options={kpiOptions}
              onChange={setSelectedKpi}
              placeholder={pickerKpis.length ? 'Search KPI…' : 'No KPIs'}
              allowEmpty
              emptyLabel="-- Select KPI --"
              disabled={readOnly || pickerKpis.length === 0}
            />
            <Button size="sm" onClick={handleAddKpi} disabled={!selectedKpi}>Add KPI</Button>
          </div>

          <div style={{ width: 1, height: 24, backgroundColor: 'var(--border)', margin: '0 8px' }} />

          <Button size="sm" onClick={() => handleAddTerm({ pm_termtype: 'Operator', pm_operator: '+' as Operator })}>+</Button>
          <Button size="sm" onClick={() => handleAddTerm({ pm_termtype: 'Operator', pm_operator: '−' as Operator })}>−</Button>
          <Button size="sm" onClick={() => handleAddTerm({ pm_termtype: 'Operator', pm_operator: '×' as Operator })}>×</Button>
          <Button size="sm" onClick={() => handleAddTerm({ pm_termtype: 'Operator', pm_operator: '÷' as Operator })}>÷</Button>

          <div style={{ width: 1, height: 24, backgroundColor: 'var(--border)', margin: '0 8px' }} />

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="number"
              step="any"
              value={constantDraft}
              placeholder="Constant"
              onChange={(e) => setConstantDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddConstant();
              }}
              style={{ width: 110 }}
            />
            <Button
              size="sm"
              onClick={handleAddConstant}
              disabled={constantDraft.trim() === '' || Number.isNaN(Number(constantDraft))}
            >
              Add constant
            </Button>
          </div>

          <div style={{ width: 1, height: 24, backgroundColor: 'var(--border)', margin: '0 8px' }} />

          <Button size="sm" onClick={() => handleAddTerm({ pm_termtype: 'Bracket', pm_operator: '(' as Operator })}>(</Button>
          <Button size="sm" onClick={() => handleAddTerm({ pm_termtype: 'Bracket', pm_operator: ')' as Operator })}>)</Button>
        </div>
      )}
    </div>
  );
}
