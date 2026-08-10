import React, { createContext, useContext, useEffect, useState } from "react";

/**
 * 页面顶栏信息 — 由页面通过 <PageHeader> 上报，布局读取后渲染到顶栏左侧
 */
export interface PageHeaderInfo {
  /** 页面标题（原型 topbar-left 的 h2） */
  title: string;
  /** 帮助说明文本（原型 `?` help-icon 的弹窗内容） */
  help?: string;
  /** 角色徽章文案（原型 ADMIN 徽章），默认按登录角色自动生成 */
  badge?: string;
}

interface PageHeaderContextValue {
  info: PageHeaderInfo | null;
  setInfo: (info: PageHeaderInfo | null) => void;
}

const PageHeaderContext = createContext<PageHeaderContextValue>({
  info: null,
  setInfo: () => {},
});

/**
 * PageHeaderProvider — 页面顶栏信息提供者
 *
 * 挂在布局（ConsoleLayout）内，包住 <Outlet />；布局用 usePageHeader()
 * 读取当前页面上报的标题/帮助/徽章，渲染到顶栏左侧。
 */
export const PageHeaderProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [info, setInfo] = useState<PageHeaderInfo | null>(null);
  return <PageHeaderContext.Provider value={{ info, setInfo }}>{children}</PageHeaderContext.Provider>;
};

/** 读取当前页面上报的顶栏信息（供布局使用） */
export function usePageHeader(): PageHeaderInfo | null {
  return useContext(PageHeaderContext).info;
}

/**
 * PageHeader — 页面顶栏上报组件（渲染为 null，仅注册标题）
 *
 * 页面内部调用一次即可把标题/帮助同步到顶栏。对应原型 topbar 结构。
 *
 * @example
 * ```tsx
 * export default function AdminCustomersPage() {
 *   return (
 *     <>
 *       <PageHeader title="客户列表" help="管理所有客户账户…" />
 *       <div className="c3-content">…</div>
 *     </>
 *   );
 * }
 * ```
 */
export const PageHeader: React.FC<PageHeaderInfo> = ({ title, help, badge }) => {
  const { setInfo } = useContext(PageHeaderContext);
  useEffect(() => {
    setInfo({ title, help, badge });
    return () => setInfo(null);
  }, [title, help, badge, setInfo]);
  return null;
};
