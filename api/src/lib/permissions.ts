/**
 * 权限点静态映射 — 权限树展示与路由鉴权的单源（P0-3 假授权修复）
 *
 * 从 admin-permissions.ts 迁移并集中导出，保证「权限管理页权限树」与
 * `requirePerm` 中间件（middleware/require-perm.ts）使用同一份映射，杜绝漂移。
 *
 * 角色模型：users.role 单一主角色；super_admin 用 '*' 通配全部权限点。
 * 本期新增 `finance.adjust`（手动调账，仅 admin/super_admin，裁决 A5/Q6）。
 *
 * 角色枚举（ADR-0024，正式）：仅 customer/agent/sales/admin/super_admin。
 * `finance` 不是数据库角色枚举，而是「财务最小权限集」权限包（D-06 裁定草案，
 * `docs/_draft-rulings-D01-D08-2026-09.md`，待 BOSS 确认生效）；DB 的 user_role
 * 枚举本就无 `finance`，其仅通过 JWT payload(role='finance') 在测试/工单中复用。
 * 下表 ROLE_PERMS.finance 是权限包的便捷载体，正式承载应为 PERM_PACKAGES.finance，
 * 实际授予仍落到 canonical 角色的权限记录上。
 *
 * @see docs/ARCH-整改R1-R4-技术方案.md §5 权限点鉴权中间件
 * @see admin-permissions.ts（路由层改为从本文件导入）
 * @module lib/permissions
 */

/** 权限分组树（权限管理页展示用） */
export const PERM_GROUPS: { group: string; permissions: { key: string; label: string }[] }[] = [
  { group: '客户管理', permissions: [
    { key: 'customer.view', label: '查看客户' },
    { key: 'customer.edit', label: '编辑客户' },
    { key: 'customer.credit', label: '额度管理' },
    { key: 'customer.verify', label: '实名审核' },
    { key: 'dataExportGrant.view', label: '查看数据导出授权' },   // 数据导出授权管理（PRD §9）
    { key: 'dataExportGrant.edit', label: '管理数据导出授权' },
  ]},
  { group: '财务', permissions: [
    { key: 'finance.refund', label: '退款审核' },
    { key: 'finance.topup', label: '人工上账' },
    { key: 'finance.adjust', label: '手动调账' },   // 新增（裁决 A5）：仅 admin/super_admin 授予
    { key: 'finance.invoice', label: '发票管理' },
    { key: 'finance.reconciliation', label: '对账报表' },
    { key: 'FINANCE_RECON_APPROVE', label: '处理对账差异' },
  ]},
  { group: '供应商', permissions: [
    { key: 'supplier.view', label: '查看供应商' },
    { key: 'supplier.edit', label: '编辑供应商' },
    { key: 'supplier.pricing', label: '定价管理' },
  ]},
  { group: '系统', permissions: [
    { key: 'sys.config', label: '系统配置' },
    { key: 'sys.users', label: '用户权限' },
    { key: 'sys.cache', label: '缓存管理' },
    { key: 'sys.audit', label: '审计日志' },
  ]},
];

/**
 * 角色 → 权限 key 集合（单一主角色模型；super_admin='*' 通配）。
 * 仅含 ADR-0024 正式角色（customer/agent/sales/admin/super_admin）。
 */
export const ROLE_PERMS: Record<string, string[]> = {
  super_admin: ['*'],
  admin: ['customer.view', 'customer.edit', 'customer.credit', 'customer.verify', 'finance.refund', 'finance.topup', 'finance.adjust', 'finance.invoice', 'finance.reconciliation', 'FINANCE_RECON_APPROVE', 'supplier.view', 'supplier.edit', 'supplier.pricing', 'sys.config', 'sys.users', 'sys.audit', 'dataExportGrant.view', 'dataExportGrant.edit'],
  agent: ['customer.view', 'customer.credit'],
  sales: ['customer.view', 'customer.edit'],
};

/**
 * 权限包（非数据库角色）。`finance` 是财务最小权限集，供 UI/工单一键授予到
 * canonical 角色（ADR-0024）；不得写入 users.role。历史 ROLE_PERMS.finance
 * 由 require-perm 直接消费（测试/工单 JWT role='finance'），此处幂等等价。
 * （D-06 裁定草案，待 BOSS 确认后纳入正式权限记录。）
 */
export const PERM_PACKAGES: Record<string, string[]> = {
  finance: ['finance.refund', 'finance.topup', 'finance.invoice', 'finance.reconciliation', 'FINANCE_RECON_APPROVE', 'customer.view', 'supplier.pricing'],
};
// 兼容层：ROLE_PERMS.finance 与 PERM_PACKAGES.finance 一致，供 requirePerm('finance') 直达。
ROLE_PERMS['finance'] = PERM_PACKAGES['finance']!;
// 历史实现别名：保留旧 key，canonical 权限名以 FINANCE_RECON_APPROVE 为准。
export const LEGACY_RECONCILIATION_RESOLVE_PERM = 'finance.reconciliation.resolve';

/**
 * 展开通配符：'*' → 全部权限点；未定义角色 → 空集合。
 *
 * @param role - 用户主角色（users.role / JWT payload.role）
 * @returns 角色有效权限点列表
 */
export function effectivePerms(role: string): string[] {
  if (ROLE_PERMS[role]?.includes('*')) return PERM_GROUPS.flatMap((g) => g.permissions.map((p) => p.key));
  return ROLE_PERMS[role] ?? [];
}

/**
 * 权限点判定（路由中间件 requirePerm 与权限树展示共用）。
 *
 * @param role - 用户主角色
 * @param permKey - 权限点 key，如 'finance.topup' / 'finance.adjust'
 * @returns true = 拥有该权限点
 */
export function hasPerm(role: string, permKey: string): boolean {
  const eff = effectivePerms(role);
  return eff.includes('*') || eff.includes(permKey);
}
