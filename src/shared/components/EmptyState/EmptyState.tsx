interface Props {
  title: string;
  description?: string;
}
export function EmptyState({ title, description }: Props) {
  return (
    <div className="empty-state">
      <h4>{title}</h4>
      {description && <p>{description}</p>}
    </div>
  );
}
