import React from 'react';
import { WorkingDaysRecord } from '../../models/WorkingDays';

interface SavedRecordsTableProps {
  records: WorkingDaysRecord[];
  onDelete: (id: string) => void;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const SavedRecordsTable: React.FC<SavedRecordsTableProps> = ({ records, onDelete }) => {
  return (
    <div className="card">
      <div className="card-head">
        <h3>Saved working-days records</h3>
      </div>
      <div className="card-body" style={{ padding: 0, overflow: 'auto' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>BU</th>
              <th>Month</th>
              <th className="tright">Year</th>
              <th className="tright">Working days</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {records.length > 0 ? (
              records.map(record => (
                <tr key={record.id}>
                  <td>{record.businessUnitName}</td>
                  <td>{MONTHS[record.month - 1]}</td>
                  <td className="tright mono">{record.year}</td>
                  <td className="tright mono">
                    <b>{record.totalWorkingDays}</b>
                  </td>
                  <td className="tright">
                    <button
                      className="btn btn-xs"
                      onClick={() => record.id && onDelete(record.id)}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="muted" style={{ padding: '14px' }}>
                  No records yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
