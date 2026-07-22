// ============================================================
//  3cloud (3C) — 动态角色权限引擎
//  负责查询用户最终有效权限（从 admin_roles + overrides 中计算）
//  支持 Redis 缓存，TTL 60s
// ============================================================

import { eq } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { getRedis } from "../redis.js";
import { adminRoles, userRoleAssignments, userPermissionOverrides, users } from "../db/schema.js";
import { ROLE_PERMISSIONS } from "../middleware/auth.js";

const PERM_CACHE_TTL = 60;

/**
 * 获取用户最终有效权限 bitset
 * 优先级：user_permission_overrides > user_role_assignments > users.role -> hardcoded
 */
export async function getUserPermissions(userId: number): Promise<bigint> {
  const redis = getRedis();
  const cacheKey = `perm:user:${userId}`;
  const cached = await redis.get(cacheKey);
  if (cached !== null) return BigInt(cached);

  const db = getDb();

  // 1. 查用户权限微调
  const [override] = await db
    .select()
    .from(userPermissionOverrides)
    .where(eq(userPermissionOverrides.userId, userId))
    .limit(1);

  if (override) {
    const final = (override.grantPerms ?? 0n) & ~(override.denyPerms ?? 0n);
    await redis.setex(cacheKey, PERM_CACHE_TTL, final.toString());
    return final;
  }

  // 2. 查 user_role_assignments
  const [assignment] = await db
    .select({ roleId: userRoleAssignments.adminRoleId })
    .from(userRoleAssignments)
    .where(eq(userRoleAssignments.userId, userId))
    .limit(1);

  if (assignment) {
    const [role] = await db
      .select({ permissions: adminRoles.permissions })
      .from(adminRoles)
      .where(eq(adminRoles.id, assignment.roleId))
      .limit(1);

    if (role) {
      const perms = role.permissions ?? 0n;
      await redis.setex(cacheKey, PERM_CACHE_TTL, perms.toString());
      return perms;
    }
  }

  // 3. 回退到 users.role -> admin_roles 或硬编码
  const [userRow] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (userRow) {
    const [dbRole] = await db
      .select({ permissions: adminRoles.permissions })
      .from(adminRoles)
      .where(eq(adminRoles.name, userRow.role))
      .limit(1);

    if (dbRole) {
      const perms = dbRole.permissions ?? 0n;
      await redis.setex(cacheKey, PERM_CACHE_TTL, perms.toString());
      return perms;
    }

    const hardPerms = ROLE_PERMISSIONS[userRow.role] ?? 0n;
    await redis.setex(cacheKey, PERM_CACHE_TTL, hardPerms.toString());
    return hardPerms;
  }

  return 0n;
}

/**
 * 检查用户是否拥有指定权限位
 * 所有必须的权限位必须同时满足
 */
export async function hasPermission(userId: number, ...perms: bigint[]): Promise<boolean> {
  const userPerms = await getUserPermissions(userId);
  const required = perms.length > 0 ? perms.reduce((a, b) => a | b, 0n) : 0n;
  return (userPerms & required) === required;
}

/**
 * 清除单个用户的权限缓存
 */
export async function clearPermissionCache(userId: number): Promise<void> {
  const redis = getRedis();
  await redis.del(`perm:user:${userId}`);
}

/**
 * 清除所有用户的权限缓存（【优化】使用 SCAN 替代 KEYS）
 */
export async function clearAllPermissionCache(): Promise<void> {
  const redis = getRedis();
  let cursor = '0';
  const keys: string[] = [];
  do {
    const [nextCursor, batch] = await redis.scan(cursor, 'MATCH', 'perm:user:*', 'COUNT', 100);
    cursor = nextCursor;
    keys.push(...batch);
  } while (cursor !== '0');
  if (keys.length > 0) await redis.del(keys);
}

/**
 * 权限位描述映射
 */
export const PERM_LABELS: Record<number, string> = {
  0: "查看仪表盘",
  1: "查看用户列表",
  2: "查看用户详情",
  3: "编辑用户",
  4: "删除用户",
  5: "创建用户",
  6: "重置用户密码",
  7: "变更用户角色",
  8: "管理用户余额",
  9: "模拟登录",
  10: "查看审核列表",
  11: "审核操作",
  12: "管理模型/供应商",
  13: "查看财务",
  14: "管理佣金",
  15: "管理提现",
  16: "管理充值",
  17: "查看系统配置",
  18: "编辑系统配置",
  19: "查看安全",
  20: "安全操作",
  21: "查看审计日志",
  22: "查看代理商",
  23: "管理代理商",
  24: "查看日志",
  25: "运维操作",
  26: "查看对账报表",
};

/**
 * 获取权限位清单（用于前端展示）
 */
export function getPermissionList(): { key: string; bit: number; label: string }[] {
  const permMap: Record<string, number> = {
    DASHBOARD_VIEW: 0,
    USER_LIST: 1,
    USER_VIEW: 2,
    USER_EDIT: 3,
    USER_DELETE: 4,
    USER_CREATE: 5,
    USER_RESET_PWD: 6,
    USER_CHANGE_ROLE: 7,
    USER_BALANCE: 8,
    USER_IMPERSONATE: 9,
    REVIEW_LIST: 10,
    REVIEW_ACTION: 11,
    MODEL_MANAGE: 12,
    FINANCE_VIEW: 13,
    FINANCE_COMMISSION: 14,
    FINANCE_WITHDRAW: 15,
    FINANCE_RECHARGE: 16,
    CONFIG_VIEW: 17,
    CONFIG_EDIT: 18,
    SECURITY_VIEW: 19,
    SECURITY_ACTION: 20,
    AUDIT_VIEW: 21,
    AGENT_LIST: 22,
    AGENT_MANAGE: 23,
    LOG_VIEW: 24,
    OPS_READ: 25,
    RECONCILIATION_VIEW: 26,
  };
  return Object.entries(permMap).map(([key, bit]) => ({
    key,
    bit,
    label: PERM_LABELS[bit] ?? key,
  }));
}
