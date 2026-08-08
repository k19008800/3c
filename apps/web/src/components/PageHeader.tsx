import type { ReactNode } from "react";

export interface PageHeaderProps {
  title: string;
  helpText?: string;
  /** Optional action buttons placed at the right */
  actions?: ReactNode;
}

export default function PageHeader({ title, helpText, actions }: PageHeaderProps) {
  return (
    <div className="page-header">
      <h1 className="page-title">
        {title}
        <span className="help-icon" title={helpText ?? title}>
          [?]
        </span>
      </h1>
      {actions && <div className="page-header-actions">{actions}</div>}
    </div>
  );
}
