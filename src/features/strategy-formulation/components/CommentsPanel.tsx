import { useState } from "react";
import { useAsync } from "@shared/hooks/useAsync";
import { Button } from "@shared/components/Button/Button";
import { Loading } from "@shared/components/Loading/Loading";
import { ErrorState } from "@shared/components/ErrorState/ErrorState";
import { resolveCurrentUserId } from "@infrastructure/authentication/currentUser";
import { listComments, addComment } from "../services/commentService";
import type { CommentType } from "../models/comment";

/** Change Request is disabled once the strategy is Approved or Rejected (spec §3). */
export function CommentsPanel({ strategyId, changeRequestBlocked }: { strategyId: string; changeRequestBlocked: boolean }) {
  const { data, loading, error, reload } = useAsync(() => listComments(strategyId), [strategyId]);
  const [text, setText] = useState("");
  const [type, setType] = useState<CommentType>("Comment");
  const [posting, setPosting] = useState(false);

  async function handlePost() {
    if (!text.trim()) return;
    const authorId = await resolveCurrentUserId();
    if (!authorId) return;
    setPosting(true);
    try {
      await addComment(strategyId, text, type, authorId);
      setText("");
      reload();
    } finally {
      setPosting(false);
    }
  }

  return (
    <div>
      <div className="inline-fields">
        <select value={type} onChange={(e) => setType(e.target.value as CommentType)}>
          <option value="Comment">Comment</option>
          <option value="ChangeRequest" disabled={changeRequestBlocked}>
            Change Request
          </option>
        </select>
        <input type="text" value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a comment…" style={{ flex: 1 }} />
        <Button size="sm" disabled={!text.trim() || posting} onClick={handlePost}>
          Post
        </Button>
      </div>

      {loading ? (
        <Loading label="Loading comments…" />
      ) : error ? (
        <ErrorState message={error} />
      ) : !data || data.length === 0 ? (
        <div className="empty-state"><h4>No comments yet</h4></div>
      ) : (
        data.map((c) => (
          <div className="item" key={c.id}>
            <div className="item-head">
              <span className="title">{c.authorName}</span>
              {c.type === "ChangeRequest" && <span className="badge st-changes">Change Request</span>}
              {c.status === "Resolved" && <span className="badge st-approved">Resolved</span>}
            </div>
            <div>{c.text}</div>
          </div>
        ))
      )}
    </div>
  );
}
