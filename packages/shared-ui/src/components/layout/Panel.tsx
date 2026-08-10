import React from "react";
import { HelpIcon } from "../help/HelpIcon";
import "../../admin-system.css";

/**
 * Panel 组件属性
 */
export interface PanelProps {
  /** 面板标题（原型 panel-header h3，如 "👥 客户列表"） */
  title?: React.ReactNode;
  /** 标题旁 `?` 帮助文本 */
  help?: string;
  /** 标题右侧插槽（原型「＋新增客户」等按钮） */
  extra?: React.ReactNode;
  /** 面板主体内容 */
  children?: React.ReactNode;
  /** 是否无内边距（如图表/排行表格用 rank-table-wrap） */
  flush?: boolean;
  /** 自定义类名 */
  className?: string;
}

/**
 * Panel — 原型「面板」容器
 *
 * 对应原型 admin-design-system.css 的 `.panel/.panel-header/.panel-body`：
 * 白底卡片 + 顶部标题栏（左侧标题 + `?` 帮助 + 右侧按钮插槽）。
 *
 * @example
 * ```tsx
 * <Panel title="👥 客户列表" help="…" extra={<button className="c3-btn c3-btn--primary c3-btn--sm">＋新增客户</button>}>
 *   <Table … />
 * </Panel>
 * ```
 */
export const Panel: React.FC<PanelProps> = ({ title, help, extra, children, flush, className }) => {
  const cls = ["c3-panel", className].filter(Boolean).join(" ");
  return (
    <section className={cls}>
      {(title || extra) && (
        <header className="c3-panel__header">
          <h3 style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {title}
            {help && <HelpIcon text={help} level="page" />}
          </h3>
          {extra && <div className="c3-btn-group">{extra}</div>}
        </header>
      )}
      <div className="c3-panel__body" style={flush ? { padding: 0 } : undefined}>
        {children}
      </div>
    </section>
  );
};
