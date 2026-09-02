import React from 'react';

interface ProjectRow {
  pocId: string;
  name: string;
  kind: string;
  modelName: string;
  driverKpiName: string;
  fromValue: number;
  newValue: number;
  effect: string;
}

interface ProjectStackTableProps {
  projects: ProjectRow[];
  onAddClick: () => void;
  onEditClick: (id: string) => void;
  onDeleteClick: (id: string) => void;
}

export const ProjectStackTable: React.FC<ProjectStackTableProps> = ({ projects, onAddClick, onEditClick, onDeleteClick }) => {
  return (
    <>
      <div className="section-label">POCs / Tactics — each drives one component of a model; results stack and accumulate into the target</div>
      <table className="data-table">
        <thead>
          <tr>
            <th>POC / Tactic</th>
            <th>Model</th>
            <th>Driver KPI</th>
            <th>From</th>
            <th className="tright">New value</th>
            <th>Effect on result</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {projects.length === 0 ? (
            <tr><td colSpan={7} className="muted" style={{ padding: '12px' }}>No POCs / Tactics — forecast holds at trend.</td></tr>
          ) : (
            projects.map(p => (
              <tr key={p.pocId}>
                <td><b>{p.name}</b> <span className="pill">{p.kind}</span></td>
                <td>{p.modelName}</td>
                <td>{p.driverKpiName}</td>
                <td className="mono">{p.fromValue}</td>
                <td className="tright mono">{p.newValue}</td>
                <td className="muted" style={{ fontSize: '11px' }}>{p.effect}</td>
                <td className="tright">
                  <button className="btn btn-xs" onClick={() => onEditClick(p.pocId)}>edit</button>{' '}
                  <button className="btn btn-xs" onClick={() => onDeleteClick(p.pocId)}>✕</button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      <button className="btn btn-sm" style={{ marginTop: '8px' }} onClick={onAddClick}>+ POC / Tactic</button>
    </>
  );
};
