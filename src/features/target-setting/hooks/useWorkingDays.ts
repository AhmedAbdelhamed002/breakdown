import { useState, useEffect, useMemo, useCallback } from 'react';
import { WorkingDaysRecord } from '../models/WorkingDays';
import { WorkingDaysService } from '../services/WorkingDaysService';

export const useWorkingDays = (initialBuId: string, initialYear: number, initialMonth: number) => {
  const [businessUnitId, setBusinessUnitId] = useState(initialBuId);
  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(initialMonth); // 1-12

  const [records, setRecords] = useState<WorkingDaysRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Draft state for day weights for the currently selected month/year
  const [dayWeights, setDayWeights] = useState<Record<number, number>>({});

  const loadRecords = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await WorkingDaysService.getAllWorkingDays();
      setRecords(data);
    } catch (err: any) {
      setError(err.message || 'Error loading working days');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

  // When month/year changes, reset day weights (or prefill with existing record if we had stored daily JSON, 
  // but since we only have total, we just reset to 1)
  useEffect(() => {
    setDayWeights({});
  }, [month, year, businessUnitId]);

  const daysInMonth = useMemo(() => new Date(year, month, 0).getDate(), [year, month]);

  const totalWorkingDays = useMemo(() => {
    let sum = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      const w = dayWeights[d] !== undefined ? dayWeights[d] : 1;
      sum += w;
    }
    return Math.round(sum * 100) / 100;
  }, [daysInMonth, dayWeights]);

  const setDayWeight = (day: number, weight: number) => {
    setDayWeights(prev => ({ ...prev, [day]: Math.max(0, Math.min(1, weight)) }));
  };

  const resetWeights = () => {
    setDayWeights({});
  };

  const saveWorkingDays = async () => {
    if (!businessUnitId) {
      setError('Please select a Business Unit');
      return;
    }
    setLoading(true);
    try {
      await WorkingDaysService.saveWorkingDays({
        businessUnitId,
        month,
        year,
        totalWorkingDays
      });
      await loadRecords(); // Refresh the list
    } catch (err: any) {
      setError(err.message || 'Error saving working days');
    } finally {
      setLoading(false);
    }
  };

  const deleteRecord = async (id: string) => {
    setLoading(true);
    try {
      await WorkingDaysService.deleteWorkingDays(id);
      await loadRecords();
    } catch (err: any) {
      setError(err.message || 'Error deleting working days');
    } finally {
      setLoading(false);
    }
  };

  // Find saved total for current context
  const currentSavedRecord = records.find(
    r => r.businessUnitId === businessUnitId && r.year === year && r.month === month
  );

  const filteredRecords = useMemo(() => {
    return records.filter(r => 
      (!businessUnitId || r.businessUnitId === businessUnitId) &&
      (!year || r.year === year)
    );
  }, [records, businessUnitId, year]);

  return {
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
    records: filteredRecords,
    loading,
    error,
    saveWorkingDays,
    deleteRecord,
    currentSavedRecord,
  };
};
