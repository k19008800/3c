/**
 * @3cloud/shared-ui
 *
 * 3Cloud 共享 UI 组件库 — 纯 React + TypeScript，零第三方 UI 依赖
 *
 * 组件清单：
 * - HelpIcon / PageHelp     — `[?]` 帮助图标（页面级 + 按钮级）
 * - Toast / useToast         — 全局 Toast 通知系统
 * - Modal                    — 通用弹窗对话框
 * - Table / ColumnDef        — 通用数据表格（排序 / hover / 空数据）
 * - Pagination               — 分页组件（页码跳转 / 条数选择）
 * - EmptyState               — 空数据占位
 * - Skeleton / SkeletonGroup — 骨架屏加载态
 * - StatusBadge              — 状态标签（tag/pill）
 * - FormField / ConfirmPopover — 表单字段 / 气泡确认
 * - SearchBar / FilterBar / CopyButton — 搜索栏 / 筛选栏 / 复制按钮
 */

// ============================================================================
// Help — [`?`] 帮助图标
// ============================================================================
export { HelpIcon, PageHelp } from "./components/help/HelpIcon";
export type { HelpIconProps, PageHelpProps } from "./components/help/HelpIcon";

// ============================================================================
// Feedback — Toast 通知
// ============================================================================
export { ToastProvider, ToastContainer, useToast } from "./components/feedback/Toast";
export type { ToastAPI, ToastItem, ToastType, ToastProviderProps } from "./components/feedback/Toast";

// ============================================================================
// Feedback — Modal 弹窗
// ============================================================================
export { Modal } from "./components/feedback/Modal";
export type { ModalProps } from "./components/feedback/Modal";

// ============================================================================
// Data — 数据展示
// ============================================================================
export { Table } from "./components/data/Table";
export type { ColumnDef, TableProps } from "./components/data/Table";
export { Pagination } from "./components/data/Pagination";
export type { PaginationProps } from "./components/data/Pagination";
export { EmptyState } from "./components/data/EmptyState";
export type { EmptyStateProps } from "./components/data/EmptyState";
export { Skeleton, SkeletonGroup } from "./components/data/Skeleton";
export type { SkeletonProps, SkeletonGroupProps } from "./components/data/Skeleton";
export { StatusBadge } from "./components/data/StatusBadge";
export type { StatusBadgeProps } from "./components/data/StatusBadge";

// ============================================================================
// Form — 表单与交互
// ============================================================================
export { FormField } from "./components/form/FormField";
export type { FormFieldProps } from "./components/form/FormField";
export { ConfirmPopover } from "./components/form/ConfirmPopover";
export type { ConfirmPopoverProps } from "./components/form/ConfirmPopover";

// ============================================================================
// Navigation — 搜索与导航
// ============================================================================
export { SearchBar } from "./components/navigation/SearchBar";
export type { SearchBarProps } from "./components/navigation/SearchBar";
export { FilterBar } from "./components/navigation/FilterBar";
export type { FilterDef, FilterBarProps } from "./components/navigation/FilterBar";
export { CopyButton } from "./components/navigation/CopyButton";
export type { CopyButtonProps } from "./components/navigation/CopyButton";
