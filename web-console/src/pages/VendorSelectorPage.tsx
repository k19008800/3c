/**
 * @deprecated 已下线 —— 模型编码化改造（M-S-08 / T4）
 *
 * 旧「供应商/渠道选择」页（/me/channels、/vendor-selector）已随本次改造整体下线：
 * - 路由已从 App.tsx 移除，侧边栏入口已从 ConsoleLayout 移除；
 * - 渠道价目矩阵弹窗已迁移为「模型编码对比清单」，数据源为 /me/models 编码列表；
 * - 用户侧不再有独立的供应商/渠道选择，模型编码即锁定供应商。
 *
 * 本文件保留为空壳仅作历史标记，不再被任何路由/菜单引用，请勿恢复。
 *
 * @module pages
 */
export default function VendorSelectorPage() {
  return null;
}
