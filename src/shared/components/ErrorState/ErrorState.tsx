interface Props {
  title?: string;
  message: string;
  onRetry?: () => void;
}
export function ErrorState({ title = "Something went wrong", message, onRetry }: Props) {
  return (
    <div className="error-state">
      <h4>{title}</h4>
      <p>{message}</p>
      {onRetry && (
        <button className="btn btn-sm" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}
