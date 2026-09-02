import type { EquationPart } from "@infrastructure/financialImpact/ModelEvalService";

interface Props {
  parts: EquationPart[];
  style?: React.CSSProperties;
}

function renderPart(part: EquationPart, key: number) {
  switch (part.kind) {
    case "operand":
      return (
        <span key={key} className="eq-operand">
          {part.text}
        </span>
      );
    case "operator":
      return (
        <span key={key} className="eq-operator">
          {part.text}
        </span>
      );
    case "arrow":
      return (
        <span key={key} className="eq-arrow" aria-hidden="true">
          →
        </span>
      );
    case "percent":
      return (
        <span key={key} className={`eq-percent ${part.up ? "up" : "down"}`}>
          {part.up ? "↑" : "↓"}
          {part.text}
        </span>
      );
    default:
      return null;
  }
}

/**
 * A Relation model's factors, one stacked block per factor with a horizontal divider between
 * blocks — clearer than wrapping every factor into a single run-on chip row once there's more than
 * one. Consumes the same `equationParts(model)` data `EquationDisplay` does, split at its existing
 * 'separator' markers; `equationParts`/`EquationDisplay` themselves are unchanged, so Equation-kind
 * models (and every other screen using EquationDisplay) render exactly as before. Used only by the
 * Link Financial Model & Calculate Impact dialogs, only for Relation-kind models.
 */
export function RelationFactorsDisplay({ parts, style }: Props) {
  const blocks: EquationPart[][] = [[]];
  parts.forEach((part) => {
    if (part.kind === "separator") {
      blocks.push([]);
      return;
    }
    blocks[blocks.length - 1].push(part);
  });

  return (
    <div className="mini-eq" style={{ display: "block", ...style }}>
      {blocks.map((block, i) => (
        <div key={i}>
          {i > 0 && <hr className="relation-divider" />}
          <div className="relation-block">{block.map((part, j) => renderPart(part, j))}</div>
        </div>
      ))}
    </div>
  );
}
