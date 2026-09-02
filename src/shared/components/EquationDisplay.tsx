import React from 'react';
import type { EquationPart } from '@infrastructure/financialImpact/ModelEvalService';

interface EquationDisplayProps {
  parts: EquationPart[];
  style?: React.CSSProperties;
}

/**
 * Renders a Financial Model's equation as chips instead of one flat string — see equationParts'
 * own note on why: a KPI name can run long, and nothing tells a flat string where one name ends
 * and the next operator/percentage begins. Each operand gets its own bounded box here regardless.
 */
export const EquationDisplay: React.FC<EquationDisplayProps> = ({ parts, style }) => (
  <div className="mini-eq" style={style}>
    {parts.map((part, i) => {
      switch (part.kind) {
        case 'operand':
          return <span key={i} className="eq-operand">{part.text}</span>;
        case 'operator':
          return <span key={i} className="eq-operator">{part.text}</span>;
        case 'arrow':
          return <span key={i} className="eq-arrow" aria-hidden="true">→</span>;
        case 'percent':
          return (
            <span key={i} className={`eq-percent ${part.up ? 'up' : 'down'}`}>
              {part.up ? '↑' : '↓'}{part.text}
            </span>
          );
        case 'separator':
          return <span key={i} className="eq-sep" aria-hidden="true" />;
        default:
          return null;
      }
    })}
  </div>
);
