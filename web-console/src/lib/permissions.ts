/**
 * 前端权限点工具 — 按钮级权限显隐（R3 前端落点）
 *
 * 职责：
 * - ROLE_PERMS 前端镜像（与 api/src/lib/permissions.ts 静态映射保持一致）
 * - hasPerm(role, permKey) 纯函数（'*' 通配）
 * - usePerm(permKey) hook（读 auth store 的 user.role）
 *
 * 说明：前端镜像与后端静态映射双份维护是现状妥协（后端为唯一安全源，
 * 前端仅展示层控制）；二期引入动态权限后前端改拉取 effective 权限列表，
 * 本文件预留 hasPerm(role, key) 纯函数形态便于迁移。
 *
 * @see 3cloud/docs/ARCH-整改R1-R4-技术方案.md §5.5
 * @module lib/permissions
 */

import { useAuthStore } from "../store/auth";

/** 角色 → 权限 key 集合（super_admin='*' 通配；与后端 ROLE_PERMS 保持一致） */
export const ROLE_PERMS: Record<string, string[]> = {
  super_admin: ["*"],
  admin: [
    "customer.view", "customer.edit", "customer.credit", "customer.verify",
    "finance.refund", "finance.topup", "finance.adjust", "finance.invoice",
    "finance.reconciliation", "supplier.view", "supplier.edit", "supplier.pricing",
    "sys.config", "sys.users", "sys.audit",
  ],
  finance: ["finance.refund", "finance.topup", "finance.invoice", "finance.reconciliation", "customer.view"],
  agent: ["customer.view", "customer.credit"],
  sales: ["customer.view", "customer.edit"],
};

/**
 * 权限点判定（纯函数）。
 *
 * 未知角色 / 空角色一律无权限；'*' 通配全部权限点。
 *
 * @param role - 当前用户角色（auth store 的 user.role）
 * @param permKey - 权限点 key，如 'finance.topup' / 'finance.adjust'
 * @returns 持有该权限点则为 true
 *
 * @example
 * hasPerm("finance", "finance.topup");  // true
 * hasPerm("finance", "finance.adjust"); // false
 */
export function hasPerm(role: string | undefined, permKey: string): boolean {
  if (!role) return false;
  const eff = ROLE_PERMS[role];
  if (!eff) return false;
  return eff.includes("*") || eff.includes(permKey);
}

/**
 * 按钮级权限 hook：读取 auth store 的 user.role 并判定权限点。
 *
 * @param permKey - 权限点 key
 * @returns 当前用户是否持有该权限点
 *
 * @example
 * const canTopup = usePerm("finance.topup"); // 控制「发起上账」按钮渲染
 */
export function usePerm(permKey: string): boolean {
  const role = useAuthStore((s) => s.user?.role);
  return hasPerm(role, permKey);
}
