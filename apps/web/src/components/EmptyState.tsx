import type { ReactNode } from "react";

export interface EmptyStateProps {
  icon?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}

export default function EmptyState({
  icon = "📭",
  title,
  description,
  action,
}: EmptyStateProps) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon">{icon}</div>
      <h4 className="empty-state-title">{title}</h4>
      {description && (
        <p className="empty-state-desc">{description}</p>
      )}
      {action && <div className="empty-state-action">{action}</div>}
    </div>
  );
}
