import React from 'react';

interface CalendarGridProps {
  year: number;
  month: number; // 1-based
  daysInMonth: number;
  dayWeights: Record<number, number>;
  onWeightChange: (day: number, weight: number) => void;
}

const getDayOfWeek = (year: number, month: number, day: number) => {
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(year, month - 1, day).getDay()];
};

export const CalendarGrid: React.FC<CalendarGridProps> = ({
  year,
  month,
  daysInMonth,
  dayWeights,
  onWeightChange
}) => {
  const cells = [];

  for (let d = 1; d <= daysInMonth; d++) {
    const w = dayWeights[d] !== undefined ? dayWeights[d] : 1;
    const dow = getDayOfWeek(year, month, d);
    cells.push(
      <div key={d} className={`cal-day ${w !== 1 ? 'cal-adj' : ''}`}>
        <div className="cal-dn">
          {d} <span className="cal-dow">{dow}</span>
        </div>
        <input
          type="number"
          step="0.25"
          min="0"
          max="1"
          value={w}
          onChange={(e) => onWeightChange(d, parseFloat(e.target.value) || 0)}
          className="cal-w"
        />
      </div>
    );
  }

  return (
    <div className="cal-grid">
      {cells}
    </div>
  );
};
