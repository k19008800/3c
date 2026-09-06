import * as React from "react";
import { vi } from "vitest";

/**
 * @3cloud/shared-ui 的最小 mock 实现（jsdom 组件测试专用）。
 *
 * 约定：不为 shared-ui 组件本身写测试；组件级测试隔离 shared-ui 的
 * DOM 集成，仅验证业务页面把正确的 props/交互传给这些组件。本模块提供：
 *  - HelpIcon：渲染 `?` + 帮助文案（按钮级帮助放在 tooltip、页面级放弹窗，
 *    这里直接渲染 text 便于测试断言按钮旁确有 [?] 且文案正确）
 *  - useToast：返回可断言的 toast 间谍（共享于 vi.hoisted）
 *  - Table：遍历 dataSource x columns 调用 render，让行内操作按钮真实进入 DOM
 *  - 其余布局组件：最小透传/占位，保证页面可渲染
 *
 * 本模块仅在测试中经 vi.mock('@3cloud/shared-ui', async () => ...) 载入，
 * 不参与生产构建。
 */

/** Toast 间谍（跨 factory 与测试共享，便于断言 toast.error/success 被调用） */
export const toastSpies = {
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
};

/** 重置 toast 间谍（在 beforeEach 调用） */
export function resetToastSpies() {
  toastSpies.success.mockClear();
  toastSpies.error.mockClear();
  toastSpies.warning.mockClear();
  toastSpies.info.mockClear();
}

/** HelpIcon - 渲染 [?] 帮助标记。@param text 帮助内容 */
export function HelpIcon({ text }: { text?: string; level?: string; className?: string }) {
  return (
    <span className="help-icon" aria-label="Help">
      [?] {text ?? ""}
    </span>
  );
}

/** PageHeader - 顶栏信息上报，测试中渲染为空 */
export function PageHeader() {
  return null;
}

/** PageHeaderProvider - 透传 children（不维护 context，usePageHeader 返回 null） */
export function PageHeaderProvider({ children }: { children?: React.ReactNode }) {
  return <>{children}</>;
}

/** usePageHeader - 返回空顶栏信息 */
export function usePageHeader() {
  return null;
}

/** useToast - 返回可断言的 toast API 间谍 */
export function useToast() {
  return { toast: toastSpies };
}

/** Panel - 标题 + 帮助 + extra + children 透传 */
export function Panel({ title, help, extra, children }: {
  title?: React.ReactNode;
  help?: string;
  extra?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <section>
      {(title || extra) && (
        <header>
          <h3>
            {title}
            {help ? <HelpIcon text={help} /> : null}
          </h3>
          {extra}
        </header>
      )}
      <div>{children}</div>
    </section>
  );
}

/** Tag - 纯标签文本 */
export function Tag({ children }: { children?: React.ReactNode }) {
  return <span className="c3-tag">{children}</span>;
}

/**
 * Table - 遍历 dataSource x columns，调用每列 render(value, record, index)，
 * 使行内操作按钮（以用户身份登录/编辑/冻结等）真实渲染进 DOM。
 *
 * @param columns - 列定义（含 render）。
 * @param dataSource - 表格数据行。
 * @param rowKey - 行唯一键字段名或函数。
 * @param onRowClick - 行点击回调。
 * @returns 渲染出的 <table> 元素。
 */
export function Table<T = any>({
  columns,
  dataSource,
  rowKey,
  onRowClick,
}: {
  columns: Array<{
    key: string;
    title?: React.ReactNode;
    dataIndex?: string;
    width?: string;
    render?: (value: unknown, record: T, index: number) => React.ReactNode;
  }>;
  dataSource: T[];
  rowKey?: string | ((record: T, index: number) => string);
  onRowClick?: (record: T, index: number) => void;
}) {
  const keyOf = (r: T, i: number): string =>
    typeof rowKey === "function" ? rowKey(r, i) : String((r as Record<string, unknown>)[rowKey as string] ?? i);
  return (
    <table>
      <thead>
        <tr>
          {columns.map((c) => (
            <th key={c.key}>{c.title}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {dataSource.map((record, i) => (
          <tr key={keyOf(record, i)} onClick={() => onRowClick?.(record, i)}>
            {columns.map((c) => {
              const value = c.dataIndex ? (record as Record<string, unknown>)[c.dataIndex] : undefined;
              return (
                <td key={c.key}>{c.render ? c.render(value, record, i) : ((value ?? null) as React.ReactNode)}</td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Pagination - 占位（分页交互不在 Impersonation 测试范围） */
export function Pagination() {
  return null;
}

/** SkeletonGroup - 加载骨架，占位渲染空 */
export function SkeletonGroup() {
  return null;
}

/** EmptyState - 空态占位 */
export function EmptyState({ title }: { title?: React.ReactNode }) {
  return <div>{title}</div>;
}

/** TimeRangeFilter - 占位（时间筛选不在测试范围） */
export function TimeRangeFilter() {
  return null;
}

/** resolveTimeRange - 返回空起止（默认「全部」范围不参与业务断言） */
export function resolveTimeRange() {
  return { start: "", end: "" };
}

/** SearchBar - 最小受控输入 */
export function SearchBar({ value, placeholder, onChange }: {
  value?: string;
  placeholder?: string;
  onChange?: (v: string) => void;
}) {
  return (
    <input
      aria-label="search"
      placeholder={placeholder}
      value={value ?? ""}
      onChange={(e) => onChange?.(e.target.value)}
    />
  );
}

/** StatusBadge - 状态标签 */
export function StatusBadge({ children }: { children?: React.ReactNode }) {
  return <span className="c3-status-badge">{children}</span>;
}

/** Modal - 仅在 open 时渲染 children（Modal 弹窗逻辑不在测试范围） */
export function Modal({ open, children }: {
  open?: boolean;
  children?: React.ReactNode;
  onClose?: () => void;
}) {
  if (!open) return null;
  return <div role="dialog">{children}</div>;
}

/**
 * ConfirmPopover - 直接把 children（触发元素）渲染出来，
 * 不维护打开/确认状态（气泡二次确认逻辑不在组件级测试范围）。
 */
export function ConfirmPopover({ children }: {
  title?: string;
  description?: string;
  onConfirm?: () => void;
  onCancel?: () => void;
  children?: React.ReactNode;
}) {
  return <div className="c3-confirm-popover">{children}</div>;
}

