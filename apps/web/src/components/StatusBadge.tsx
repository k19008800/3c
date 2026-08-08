import type { ReactNode } from "react";

export type BadgeStatus =
  | "active"
  | "inactive"
  | "pending"
  | "success"
  | "error"
  | "warning"
  | "info"
  | "default";

export interface StatusBadgeProps {
  status: BadgeStatus;
  children: ReactNode;
}

const STATUS_LABELS: Record<BadgeStatus, string> = {
  active: "活跃",
  inactive: "停用",
  pending: "待处理",
  success: "成功",
  error: "失败",
  warning: "警告",
  info: "信息",
  default: "默认",
};

export default function StatusBadge({ status, children }: StatusBadgeProps) {
  return (
    <span
      className={`status-badge status-badge--${status}`}
      title={STATUS_LABELS[status]}
    >
      {children}
    </span>
  );
}
