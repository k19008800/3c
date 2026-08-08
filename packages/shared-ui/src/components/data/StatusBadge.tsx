import React from "react";
import "./StatusBadge.css";

/**
 * StatusBadge 组件属性
 */
export interface StatusBadgeProps {
  /**
   * 状态类型
   * - success: 成功/启用/已完成（绿色）
   * - warning: 警告/待审核/即将过期（橙色）
   * - danger:  危险/驳回/禁用/错误（红色）
   * - info:    信息/提示（蓝色）
   * - default: 默认/取消/灰色态
   */
  status: "success" | "warning" | "danger" | "info" | "default";
  /** 标签文字 */
  children: React.ReactNode;
  /**
   * 形状变体
   * - tag:  方角标签（默认），适合表格/列表状态列
   * - pill: 圆角胶囊标签，适合充值记录等场景
   */
  variant?: "tag" | "pill";
  /** 自定义类名 */
  className?: string;
}

/**
 * StatusBadge — 状态标签组件
 *
 * 对应当前 ux-guidelines §17.3 的颜色方案。
 *
 * - tag 变体：方角，6px 圆角，通用场景
 * - pill 变体：圆角胶囊 12px，适合充值记录 / 状态流
 *
 * @example
 * <StatusBadge status="success">启用</StatusBadge>
 * <StatusBadge status="warning" variant="pill">待审核</StatusBadge>
 */
export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  children,
  variant = "tag",
  className,
}) => {
  const classNames = [
    "shared-status-badge",
    `shared-status-badge--${status}`,
    `shared-status-badge--${variant}`,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return <span className={classNames}>{children}</span>;
};

StatusBadge.displayName = "StatusBadge";
