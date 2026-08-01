import { db, pool } from "../db/index";
import { adminRoles, userRoleAssignments, rolePermissionAuditLogs, type NewAdminRole } from "../db/schema/admin-roles";
import { eq } from "drizzle-orm";

/**
 * 权限管理服务层（§30 bitset 权限引擎）
 * 对齐 SPEC-§30-权限管理.md
 * - Perm 常量定义（bitset 位）
 * - 角色 CRUD + 用户角色分配 + 权限解析
 * - 审计日志
 */

// ============ bitset 权限常量 ============
export const Perm = {
  DASHBOARD_VIEW: 0,
  USER_LIST_VIEW: 1,
  USER_DETAIL_VIEW: 2,
  LOG_VIEW: 3,
  FINANCE_VIEW: 4,
  VENDOR_VIEW: 5,
  USER_CREATE: 6,
  USER_EDIT: 7,
  USER_DISABLE: 8,
  USER_DELETE: 9,
  USER_ROLE_ASSIGN: 10,
  USER_PERM_OVERRIDE: 11,
  BALANCE_VIEW: 12,
  BALANCE_ADJUST: 13,
  RECHARGE_MANAGE: 14,
  REFUND_PROCESS: 15,
  WITHDRAW_AUDIT: 16,
  TICKET_VIEW: 17,
  TICKET_REPLY: 18,
  TICKET_STATUS: 19,
  TICKET_ASSIGN: 20,
  TICKET_DELETE: 21,
  VENDOR_CREATE: 22,
  VENDOR_EDIT: 23,
  VENDOR_DISABLE: 24,
  MODEL_MANAGE: 25,
  CONFIG_VIEW: 26,
  CONFIG_EDIT: 27,
  ROLE_MANAGE: 28,
  AUDIT_VIEW: 29,
} as const;
export type PermKey = keyof typeof Perm;

export const ALL_PERMS = Object.values(Perm).reduce((mask, bit) => mask | (1n << BigInt(bit)), 0n);
export const ALL_EXCEPT_ROLE_MGMT = ALL_PERMS & ~(1n << BigInt(Perm.ROLE_MANAGE));
export const PERMS_VIEW_ONLY = (1n << BigInt(Perm.DASHBOARD_VIEW)) | (1n << BigInt(Perm.USER_LIST_VIEW)) | (1n << BigInt(Perm.USER_DETAIL_VIEW)) | (1n << BigInt(Perm.LOG_VIEW)) | (1n << BigInt(Perm.FINANCE_VIEW)) | (1n << BigInt(Perm.VENDOR_VIEW)) | (1n << BigInt(Perm.BALANCE_VIEW)) | (1n << BigInt(Perm.AUDIT_VIEW)) | (1n << BigInt(Perm.TICKET_VIEW)) | (1n << BigInt(Perm.CONFIG_VIEW));

export interface PermissionTreeGroup {
  group: string;
  groupIcon: string;
  permissions: { key: string; label: string; description?: string }[];
}

export const PERMISSION_TREE: PermissionTreeGroup[] = [
  { group: "数据查看", groupIcon: "??", permissions: [
    { key: "DASHBOARD_VIEW", label: "查看仪表盘" },
    { key: "USER_LIST_VIEW", label: "查看用户列表" },
    { key: "USER_DETAIL_VIEW", label: "查看用户详情" },
    { key: "LOG_VIEW", label: "查看调用日志" },
    { key: "FINANCE_VIEW", label: "查看财务数据" },
    { key: "VENDOR_VIEW", label: "查看供应商信息" },
  ]},
  { group: "用户管理", groupIcon: "??", permissions: [
    { key: "USER_CREATE", label: "创建用户", description: "创建新用户账号" },
    { key: "USER_EDIT", label: "编辑用户" },
    { key: "USER_DISABLE", label: "禁用/启用用户" },
    { key: "USER_DELETE", label: "删除用户" },
    { key: "USER_ROLE_ASSIGN", label: "分配角色" },
    { key: "USER_PERM_OVERRIDE", label: "权限覆写" },
  ]},
  { group: "资金操作", groupIcon: "??", permissions: [
    { key: "BALANCE_VIEW", label: "查看余额" },
    { key: "BALANCE_ADJUST", label: "调整余额", description: "需二次确认" },
    { key: "RECHARGE_MANAGE", label: "管理充值" },
    { key: "REFUND_PROCESS", label: "处理退款" },
    { key: "WITHDRAW_AUDIT", label: "审核提现" },
  ]},
  { group: "工单管理", groupIcon: "??", permissions: [
    { key: "TICKET_VIEW", label: "查看工单" },
    { key: "TICKET_REPLY", label: "回复工单" },
    { key: "TICKET_STATUS", label: "变更工单状态" },
    { key: "TICKET_ASSIGN", label: "分配工单" },
    { key: "TICKET_DELETE", label: "删除工单" },
  ]},
  { group: "供应商管理", groupIcon: "??", permissions: [
    { key: "VENDOR_CREATE", label: "创建供应商" },
    { key: "VENDOR_EDIT", label: "编辑供应商" },
    { key: "VENDOR_DISABLE", label: "停用供应商" },
    { key: "MODEL_MANAGE", label: "管理模型" },
  ]},
  { group: "系统配置", groupIcon: "??", permissions: [
    { key: "CONFIG_VIEW", label: "查看配置" },
    { key: "CONFIG_EDIT", label: "编辑配置" },
    { key: "ROLE_MANAGE", label: "角色管理" },
    { key: "AUDIT_VIEW", label: "查看审计日志" },
  ]},
];

export function permMask(keys: (keyof typeof Perm)[]): bigint {
  return keys.reduce((m, k) => m | (1n << BigInt(Perm[k])), 0n);
}

export function hasPerm(mask: bigint | number, bit: number): boolean {
  return (BigInt(mask) & (1n << BigInt(bit))) !== 0n;
}

export function maskToKeys(mask: bigint | number): string[] {
  const keys: string[] = [];
  const m = BigInt(mask);
  for (const [key, bit] of Object.entries(Perm)) {
    if ((m & (1n << BigInt(bit as number))) !== 0n) keys.push(key);
  }
  return keys;
}

// ============ 预设角色（§30.5 seed）============
export const DEFAULT_ROLES: NewAdminRole[] = [
  { name: "super_admin", label: "超级管理员", permissions: Number(ALL_PERMS), isSystem: true, sortOrder: 0 },
  { name: "admin", label: "管理员", permissions: Number(ALL_EXCEPT_ROLE_MGMT), isSystem: true, sortOrder: 1 },
  { name: "operator", label: "运营", permissions: Number(permMask(["DASHBOARD_VIEW","USER_LIST_VIEW","USER_DETAIL_VIEW","LOG_VIEW","FINANCE_VIEW","VENDOR_VIEW","USER_CREATE","USER_EDIT","USER_DISABLE","USER_DELETE","VENDOR_CREATE","VENDOR_EDIT","VENDOR_DISABLE","MODEL_MANAGE","CONFIG_VIEW","CONFIG_EDIT"])), isSystem: true, sortOrder: 2 },
  { name: "finance", label: "财务", permissions: Number(permMask(["DASHBOARD_VIEW","USER_LIST_VIEW","USER_DETAIL_VIEW","LOG_VIEW","FINANCE_VIEW","VENDOR_VIEW","BALANCE_VIEW","BALANCE_ADJUST","RECHARGE_MANAGE","REFUND_PROCESS","WITHDRAW_AUDIT","CONFIG_VIEW"])), isSystem: true, sortOrder: 3 },
  { name: "support", label: "客服", permissions: Number(permMask(["DASHBOARD_VIEW","USER_LIST_VIEW","USER_DETAIL_VIEW","LOG_VIEW","VENDOR_VIEW","BALANCE_VIEW","TICKET_VIEW","TICKET_REPLY","TICKET_STATUS","CONFIG_VIEW"])), isSystem: true, sortOrder: 4 },
  { name: "viewer", label: "只读查看者", permissions: Number(PERMS_VIEW_ONLY), isSystem: true, sortOrder: 5 },
];

export async function seedDefaultRoles(): Promise<void> {
  for (const r of DEFAULT_ROLES) {
    const exists = await pool.query("SELECT id FROM admin_roles WHERE name=$1 LIMIT 1", [r.name]);
    if (!exists.rows[0]) {
      await db.insert(adminRoles).values(r);
    }
  }
}

// ============ 角色 CRUD ============
export async function getUserActiveRoles(userId: number) {
  return (await pool.query(
    "SELECT r.* FROM admin_roles r JOIN user_role_assignments a ON a.role_id=r.id WHERE a.user_id=$1 AND a.revoked_at IS NULL",
    [userId],
  )).rows;
}

export async function getUserEffectivePermMask(userId: number): Promise<bigint> {
  const roles = await getUserActiveRoles(userId);
  let mask = 0n;
  for (const r of roles) {
    mask |= BigInt(r.permissions);
  }
  return mask;
}

export async function logPermissionChange(params: {
  action: string;
  operatorId?: number | null;
  targetUserId?: number | null;
  targetRoleId?: number | null;
  detail?: string;
  diff?: string;
}): Promise<void> {
  await db.insert(rolePermissionAuditLogs).values({
    action: params.action,
    operatorId: params.operatorId ?? null,
    targetUserId: params.targetUserId ?? null,
    targetRoleId: params.targetRoleId ?? null,
    detail: params.detail ?? null,
    diff: params.diff ?? null,
  });
}
