import React from 'react';
import { useWorkingDays } from '../hooks/useWorkingDays';
import { ContextBar } from '../components/CalendarAdjustment/ContextBar';
import { CalendarGrid } from '../components/CalendarAdjustment/CalendarGrid';
import { SavedRecordsTable } from '../components/CalendarAdjustment/SavedRecordsTable';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const CalendarAdjustmentPage: React.FC = () => {
  const {
    businessUnitId,
    setBusinessUnitId,
    year,
    setYear,
    month,
    setMonth,
    daysInMonth,
    dayWeights,
    setDayWeight,
    resetWeights,
    totalWorkingDays,
    records,
    loading,
    error,
    saveWorkingDays,
    deleteRecord,
    currentSavedRecord,
  } = useWorkingDays('', new Date().getFullYear(), new Date().getMonth() + 1);

  return (
    <div className="view">
      <ContextBar
        businessUnitId={businessUnitId}
        setBusinessUnitId={setBusinessUnitId}
        year={year}
        setYear={setYear}
        month={month}
        setMonth={setMonth}
      />

      <div className="alert alert-info">
        Set a <b>weight</b> for any day (default <b>1</b> = full working day). Lower a day for a partial/holiday (e.g. 0.5), or 0 for a full non-working day. <b>Working days = sum of all day weights.</b> Saving writes one reference record for the selected BU and Month that models can multiply by.
      </div>

      {error && (
        <div className="alert alert-warn">
          {error}
        </div>
      )}

      <div className="card">
        <div className="card-head between">
          <div>
            <h3>{MONTHS[month - 1]} {year}</h3>
            <div className="sub">{daysInMonth} calendar days</div>
          </div>
          <div className="stat-inline">
            <div className="sub">Working days</div>
            <div className="stat" style={{ color: 'var(--primary)' }}>
              {totalWorkingDays}
            </div>
          </div>
        </div>

        <div className="card-body">
          {loading && <div style={{ marginBottom: 10 }}>Loading...</div>}
          
          <CalendarGrid
            year={year}
            month={month}
            daysInMonth={daysInMonth}
            dayWeights={dayWeights}
            onWeightChange={setDayWeight}
          />

          <div className="btn-row" style={{ marginTop: '14px' }}>
            <button className="btn btn-sm" onClick={resetWeights} disabled={loading}>
              Reset all to 1
            </button>
            <button className="btn btn-primary btn-sm" onClick={saveWorkingDays} disabled={loading || !businessUnitId}>
              Save working-days record
            </button>
            {currentSavedRecord ? (
              <span className="sub" style={{ alignSelf: 'center' }}>
                Saved: <b>{currentSavedRecord.totalWorkingDays}</b> working days
              </span>
            ) : (
              <span className="sub" style={{ alignSelf: 'center' }}>
                Not saved yet for this BU/month.
              </span>
            )}
          </div>
        </div>
      </div>

      <SavedRecordsTable records={records} onDelete={deleteRecord} />
    </div>
  );
};
