import React from 'react';
import { useBusinessUnits } from '@shared/hooks/useBusinessUnits';
import { SearchableSelect } from '@shared/components/SearchableSelect';
import { useOrgMetadata } from '../../hooks/useOrgMetadata';

interface ContextBarProps {
  businessUnitId: string;
  setBusinessUnitId: (val: string) => void;
  year: number;
  setYear: (val: number) => void;
  month: number;
  setMonth: (val: number) => void;
  /** Department and Function only appear when the screen tracks them. */
  departmentId?: string;
  setDepartmentId?: (val: string) => void;
  functionId?: string;
  setFunctionId?: (val: string) => void;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const YEARS = [2024, 2025, 2026, 2027];

/**
 * ContextBar — the Business Unit, Month and Year every Target Setting screen works in, plus
 * Department and Function where the screen filters by them.
 *
 * There is no Region selector: a business unit belongs to exactly one region, so filtering by both
 * asked the same question twice. The region is shown next to each BU's name instead, which is what
 * it was ever needed for.
 *
 * The lists that can run long are searchable; Month and Year stay plain, since twelve and four
 * entries are quicker to click than to type.
 */
export const ContextBar: React.FC<ContextBarProps> = ({
  businessUnitId,
  setBusinessUnitId,
  year,
  setYear,
  month,
  setMonth,
  departmentId,
  setDepartmentId,
  functionId,
  setFunctionId
}) => {
  const { businessUnits, loading, error } = useBusinessUnits();
  const showDeptFn = !!setDepartmentId && !!setFunctionId;
  const { departments, functions, loading: metaLoading } = useOrgMetadata(showDeptFn ? departmentId : undefined);

  return (
    <div className="ctx">
      <div className="ctx-f">
        <label>BUSINESS UNIT</label>
        <SearchableSelect
          options={businessUnits.map(bu => ({
            value: bu.id,
            label: bu.name,
            hint: bu.region
          }))}
          value={businessUnitId}
          onChange={setBusinessUnitId}
          placeholder="Select BU…"
          loading={loading}
        />
        {error && <div style={{ color: 'red', fontSize: '10px' }}>Failed to load BUs</div>}
      </div>

      {showDeptFn && (
        <>
          <div className="ctx-f">
            <label>DEPARTMENT</label>
            <SearchableSelect
              options={departments.map(d => ({ value: d.id, label: d.name }))}
              value={departmentId || ''}
              onChange={val => {
                setDepartmentId!(val);
                // A function belongs to a department, so the old pick can't survive the change.
                setFunctionId!('');
              }}
              placeholder="All Departments"
              emptyLabel="All Departments"
              loading={metaLoading}
            />
          </div>

          <div className="ctx-f">
            <label>FUNCTION</label>
            <SearchableSelect
              options={functions.map(f => ({ value: f.id, label: f.name }))}
              value={functionId || ''}
              onChange={setFunctionId!}
              placeholder="All Functions"
              emptyLabel="All Functions"
              loading={metaLoading}
            />
          </div>
        </>
      )}

      <div className="ctx-f">
        <label>MONTH</label>
        <select value={month} onChange={(e) => setMonth(Number(e.target.value))}>
          {MONTHS.map((m, i) => (
            <option key={i + 1} value={i + 1}>{m}</option>
          ))}
        </select>
      </div>

      <div className="ctx-f">
        <label>YEAR</label>
        <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
          {YEARS.map(y => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>
    </div>
  );
};
