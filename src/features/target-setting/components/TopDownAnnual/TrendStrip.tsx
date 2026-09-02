import React from 'react';
import { ForecastProfileMonth } from '../../services/AnnualForecastService';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

interface TrendStripProps {
  title: string;
  data: ForecastProfileMonth[];
  showLabels?: boolean;
  aggType?: 'Percentage' | 'Value';
  /**
   * Each month's approved target, keyed by month number. When given, every month shows it under its
   * own figure, so a projection can be read against what is already approved for that month. Months
   * with no target read as an em dash rather than 0 — nothing approved is not a target of zero.
   */
  targets?: Record<number, number | null>;
}

export const TrendStrip: React.FC<TrendStripProps> = ({
  title, data, showLabels = false, aggType = 'Value', targets
}) => {
  const sum = data.reduce((acc, curr) => acc + curr.finalValue, 0);
  const avg = sum / (data.length || 1);

  // The projected-close strip rounds to whole numbers; the raw-actuals strip keeps up to 2 decimals.
  const sumDigits = showLabels ? { minimumFractionDigits: 0, maximumFractionDigits: 0 } : { minimumFractionDigits: 1, maximumFractionDigits: 2 };
  const monthDigits = showLabels ? { minimumFractionDigits: 0, maximumFractionDigits: 0 } : { minimumFractionDigits: 0, maximumFractionDigits: 2 };

  // Percentage KPIs average across months; everything else (values, org output/outcome) sums.
  const aggText = aggType === 'Percentage'
    ? `avg ${avg.toLocaleString(undefined, sumDigits)}`
    : `Σ ${sum.toLocaleString(undefined, sumDigits)}`;

  return (
    <>
      <div className="section-label" style={{ marginTop: 0 }}>
        {title} · {aggText}
      </div>
      <div className="year-strip">
        {data.map((item) => (
          <div
            key={item.month}
            className="mc"
            style={showLabels ? { background: item.kind === 'actual' ? 'var(--bg-secondary)' : 'var(--primary-faint)' } : undefined}
          >
            <b>{MONTHS[item.month - 1]}</b>
            <div className="mono">
              {item.finalValue.toLocaleString(undefined, monthDigits)}
            </div>
            {showLabels && (
              <div className="sub">
                {item.projectDelta > 0.5
                  ? `+${item.projectDelta.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
                  : item.kind}
              </div>
            )}
            {targets && (
              <div
                className="sub mono"
                title={targets[item.month] == null
                  ? `No target approved for ${MONTHS[item.month - 1]}`
                  : `${MONTHS[item.month - 1]}'s approved target`}
              >
                target {targets[item.month] == null
                  ? '—'
                  : targets[item.month]!.toLocaleString(undefined, monthDigits)}
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
};
