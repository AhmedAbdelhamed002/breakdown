import { useAsync } from "@shared/hooks/useAsync";
import { Loading } from "@shared/components/Loading/Loading";
import { ErrorState } from "@shared/components/ErrorState/ErrorState";
import { listDecisionLog } from "../services/workflowService";

export function DecisionLogList({ strategyId }: { strategyId: string }) {
  const { data, loading, error } = useAsync(() => listDecisionLog(strategyId), [strategyId]);

  if (loading) return <Loading label="Loading decision log…" />;
  if (error) return <ErrorState message={error} />;
  if (!data || data.length === 0) return <div className="empty-state"><h4>No decisions yet</h4></div>;

  return (
    <div>
      {data.map((entry) => (
        <div className="log-item" key={entry.id}>
          <span className="lt">{entry.timestamp ? new Date(entry.timestamp).toLocaleString() : ""}</span>
          <span className="lr">{entry.actionName}</span>
          <span style={{ flex: 1 }}>
            {entry.actorName}
            {entry.note && ` — ${entry.note}`}
          </span>
        </div>
      ))}
    </div>
  );
}
