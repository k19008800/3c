// ============================================================
//  3cloud (3C) — 前端权限常量
//  与后端 middleware/auth.ts Perm 位定义一致
//  BigInt 常量，用于前端 Sidebar 判断
// ============================================================

export const Perm = {
  DASHBOARD_VIEW:      1n << 0n,
  USER_LIST:           1n << 1n,
  USER_VIEW:           1n << 2n,
  USER_EDIT:           1n << 3n,
  USER_DELETE:          1n << 4n,
  USER_CREATE:          1n << 5n,
  USER_RESET_PWD:       1n << 6n,
  USER_CHANGE_ROLE:     1n << 7n,
  USER_BALANCE:         1n << 8n,
  USER_IMPERSONATE:     1n << 9n,
  REVIEW_LIST:          1n << 10n,
  REVIEW_ACTION:        1n << 11n,
  MODEL_MANAGE:         1n << 12n,
  FINANCE_VIEW:         1n << 13n,
  FINANCE_COMMISSION:   1n << 14n,
  FINANCE_WITHDRAW:     1n << 15n,
  FINANCE_RECHARGE:     1n << 16n,
  CONFIG_VIEW:          1n << 17n,
  CONFIG_EDIT:          1n << 18n,
  SECURITY_VIEW:        1n << 19n,
  SECURITY_ACTION:      1n << 20n,
  AUDIT_VIEW:           1n << 21n,
  AGENT_LIST:           1n << 22n,
  AGENT_MANAGE:         1n << 23n,
  LOG_VIEW:             1n << 24n,
  OPS_READ:             1n << 25n,
  RECONCILIATION_VIEW:  1n << 26n,
} as const;

/**
 * 检查一个权限位集是否包含所有指定的权限位。
 * permsStr: 从后端 /auth/me 返回的 permissions 字段（十进制字符串）
 * bits: 需要检查的权限位（可多个，同时满足）
 */
export function hasPerm(permsStr: string | undefined | null, ...bits: bigint[]): boolean {
  if (!permsStr) return false;
  try {
    const userPerms = BigInt(permsStr);
    // super_admin 拥有所有权限（~0n）
    if (userPerms === ~0n) return true;
    const required = bits.length > 0 ? bits.reduce((a, b) => a | b, 0n) : 0n;
    return (userPerms & required) === required;
  } catch {
    return false;
  }
}

/**
 * 检查是否拥有任意一个权限位（OR 语义）
 */
export function hasAnyPerm(permsStr: string | undefined | null, ...bits: bigint[]): boolean {
  if (!permsStr) return false;
  try {
    const userPerms = BigInt(permsStr);
    if (userPerms === ~0n) return true;
    return bits.some(b => (userPerms & b) !== 0n);
  } catch {
    return false;
  }
}

/**
 * 检查用户是否拥有任何管理员权限位（即不是纯 user/agent 角色）
 */
export function isAdminRole(permsStr: string | undefined | null): boolean {
  if (!permsStr) return false;
  try {
    const perms = BigInt(permsStr);
    if (perms === ~0n) return true;
    return hasAnyPerm(permsStr,
      Perm.DASHBOARD_VIEW, Perm.USER_LIST, Perm.MODEL_MANAGE,
      Perm.FINANCE_VIEW, Perm.SECURITY_VIEW, Perm.CONFIG_VIEW,
      Perm.AUDIT_VIEW, Perm.AGENT_LIST, Perm.LOG_VIEW,
    );
  } catch {
    return false;
  }
}
