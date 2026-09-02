export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="loading">
      <span className="spin" />
      <span>{label}</span>
    </div>
  );
}
