import React from "react";
import "./EmptyState.css";

/**
 * EmptyState 组件属性
 */
export interface EmptyStateProps {
  /** 占位图标，默认 "📭" */
  icon?: React.ReactNode;
  /** 提示标题，默认 "暂无数据" */
  title?: string;
  /** 提示描述，默认 "当前没有可显示的内容" */
  description?: string;
  /** 可选操作按钮 ReactNode（优先级高于 actionText/onAction） */
  action?: React.ReactNode;
  /** 操作按钮文字（与 onAction 配合使用） */
  actionText?: string;
  /** 操作按钮点击回调 */
  onAction?: () => void;
}

/**
 * EmptyState — 空数据占位组件
 *
 * 页面居中展示，灰色文字，可选操作按钮。
 * 对应 ux-guidelines §3 空数据态。
 *
 * @example
 * // 基本用法
 * <EmptyState />
 *
 * @example
 * // 自定义文案 + 操作
 * <EmptyState
 *   title="暂无充值记录"
 *   description="您还没有任何充值，快去充值吧"
 *   actionText="去充值"
 *   onAction={() => navigate('/recharge')}
 * />
 */
export const EmptyState: React.FC<EmptyStateProps> = ({
  icon = "📭",
  title = "暂无数据",
  description = "当前没有可显示的内容",
  action,
  actionText,
  onAction,
}) => {
  return (
    <div className="shared-empty-state">
      <div className="shared-empty-state__icon">{icon}</div>
      <div className="shared-empty-state__title">{title}</div>
      <div className="shared-empty-state__description">{description}</div>
      {action ? (
        <div className="shared-empty-state__action">{action}</div>
      ) : actionText && onAction ? (
        <button
          className="shared-empty-state__action-btn"
          onClick={onAction}
          type="button"
        >
          {actionText}
        </button>
      ) : null}
    </div>
  );
};

EmptyState.displayName = "EmptyState";
