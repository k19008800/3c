import { useAuth } from './use-auth'
import { useCallback } from 'react'

// 与服务端 auth.ts 中的 Perm 保持同步
export const Perm = {
  NONE: 0n,
  DASHBOARD_VIEW: 1n << 0n,
  USER_LIST: 1n << 1n,
  USER_VIEW: 1n << 2n,
  USER_EDIT: 1n << 3n,
  USER_DELETE: 1n << 4n,
  USER_CREATE: 1n << 5n,
  USER_RESET_PWD: 1n << 6n,
  USER_CHANGE_ROLE: 1n << 7n,
  USER_BALANCE: 1n << 8n,
  USER_IMPERSONATE: 1n << 9n,
  REVIEW_LIST: 1n << 10n,
  REVIEW_ACTION: 1n << 11n,
  MODEL_MANAGE: 1n << 12n,
  FINANCE_VIEW: 1n << 13n,
  FINANCE_COMMISSION: 1n << 14n,
  FINANCE_WITHDRAW: 1n << 15n,
  FINANCE_RECHARGE: 1n << 16n,
  CONFIG_VIEW: 1n << 17n,
  CONFIG_EDIT: 1n << 18n,
  SECURITY_VIEW: 1n << 19n,
  SECURITY_ACTION: 1n << 20n,
  AUDIT_VIEW: 1n << 21n,
  AGENT_LIST: 1n << 22n,
  AGENT_MANAGE: 1n << 23n,
  LOG_VIEW: 1n << 24n,
  OPS_READ: 1n << 25n,
  RECONCILIATION_VIEW: 1n << 26n,
} as const

// 角色权限映射（与后端 auth.ts 中的 ROLE_PERMISSIONS 一致，作为前端 fallback）
export const ROLE_PERMISSIONS: Record<string, bigint> = {
  super_admin: ~0n,
  admin:
    Perm.DASHBOARD_VIEW |
    Perm.USER_LIST | Perm.USER_VIEW | Perm.USER_EDIT | Perm.USER_CREATE |
    Perm.USER_RESET_PWD | Perm.USER_DELETE |
    Perm.USER_CHANGE_ROLE | Perm.USER_IMPERSONATE | Perm.USER_BALANCE |
    Perm.REVIEW_LIST | Perm.REVIEW_ACTION |
    Perm.MODEL_MANAGE | Perm.AGENT_LIST | Perm.AGENT_MANAGE |
    Perm.SECURITY_VIEW | Perm.SECURITY_ACTION |
    Perm.CONFIG_VIEW | Perm.LOG_VIEW | Perm.AUDIT_VIEW,
  finance_ops:
    Perm.DASHBOARD_VIEW |
    Perm.USER_LIST | Perm.USER_VIEW | Perm.USER_BALANCE |
    Perm.FINANCE_VIEW | Perm.FINANCE_COMMISSION |
    Perm.FINANCE_WITHDRAW | Perm.FINANCE_RECHARGE |
    Perm.RECONCILIATION_VIEW | Perm.LOG_VIEW | Perm.AGENT_LIST,
  ops:
    Perm.DASHBOARD_VIEW | Perm.OPS_READ |
    Perm.USER_LIST | Perm.USER_VIEW | Perm.REVIEW_LIST |
    Perm.MODEL_MANAGE | Perm.SECURITY_VIEW | Perm.SECURITY_ACTION |
    Perm.CONFIG_VIEW | Perm.CONFIG_EDIT |
    Perm.LOG_VIEW | Perm.AUDIT_VIEW | Perm.AGENT_LIST,
  support:
    Perm.USER_LIST | Perm.USER_VIEW | Perm.USER_RESET_PWD |
    Perm.REVIEW_LIST | Perm.REVIEW_ACTION | Perm.LOG_VIEW,
  auditor:
    Perm.AUDIT_VIEW | Perm.RECONCILIATION_VIEW |
    Perm.USER_LIST | Perm.USER_VIEW | Perm.LOG_VIEW | Perm.AGENT_LIST,
  user: Perm.NONE,
  agent: Perm.NONE,
}

export function usePerm() {
  const { user } = useAuth()

  const has = useCallback((...perms: bigint[]) => {
    if (!user?.role) return false
    const rolePerms = ROLE_PERMISSIONS[user.role]
    if (rolePerms === undefined) return false
    const required = perms.length > 0 ? perms.reduce((a, b) => a | b, 0n) : 0n
    return (rolePerms & required) === required
  }, [user?.role])

  return { has, role: user?.role }
}
