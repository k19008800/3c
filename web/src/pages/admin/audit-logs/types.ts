// ── 共享类型与常量 ──

import type { AuditLog } from '@/types'

export interface FilterValues {
  keyword: string
  action: string
  targetType: string
  operator: string
  targetId: string
  startDate: string
  endDate: string
  page: number
  pageSize: number
}

export interface AuditStats {
  totalToday: number
  totalYesterday: number
  uniqueOperators: number
  topAction: string
  trend: { value: number; label?: string }[]
}

// ── 操作类型选项 ──

export const ACTION_OPTIONS = [
  { value: '', label: '全部操作' },
  // 用户
  { value: 'user_create', label: '创建用户' },
  { value: 'user_disable', label: '禁用用户' },
  { value: 'user_enable', label: '启用用户' },
  { value: 'user_update', label: '编辑用户' },
  { value: 'user_password_reset', label: '重置密码' },
  { value: 'user_impersonate', label: '模拟登录' },
  // 资金
  { value: 'balance_adjust', label: '调整余额' },
  { value: 'recharge_confirm', label: '确认充值' },
  { value: 'recharge_first_confirm', label: '充值一级确认' },
  { value: 'recharge_second_confirm', label: '充值二级确认' },
  { value: 'order_cancel', label: '取消订单' },
  // 提现
  { value: 'withdraw_first_approve', label: '提现初审' },
  { value: 'withdraw_second_approve', label: '提现复审' },
  { value: 'withdraw_approve', label: '提现审批' },
  { value: 'withdraw_reject', label: '提现驳回' },
  { value: 'withdraw_paid', label: '提现打款' },
  // 审核
  { value: 'real_name_approve', label: '通过实名' },
  { value: 'real_name_reject', label: '驳回实名' },
  { value: 'role_change', label: '变更角色' },
  // 资源
  { value: 'vendor_create', label: '创建厂商' },
  { value: 'vendor_update', label: '编辑厂商' },
  { value: 'model_create', label: '创建模型' },
  { value: 'model_update', label: '编辑模型' },
  { value: 'config_update', label: '修改系统配置' },
  { value: 'agent_create', label: '创建代理商' },
  { value: 'agent_update', label: '编辑代理商' },
  { value: 'system_maintenance', label: '系统维护' },
]

export const TARGET_TYPE_OPTIONS = [
  { value: '', label: '全部对象' },
  { value: 'user', label: '用户' },
  { value: 'vendor', label: '厂商' },
  { value: 'model', label: '模型' },
  { value: 'order', label: '订单' },
  { value: 'config', label: '系统配置' },
  { value: 'agent', label: '代理商' },
  { value: 'api_key', label: 'API Key' },
]

// ── 操作类型颜色标签 ──

export const ACTION_COLORS: Record<string, string> = {
  user_disable: 'bg-red-100 text-red-700',
  user_enable: 'bg-red-100 text-red-700',
  user_password_reset: 'bg-red-100 text-red-700',
  user_impersonate: 'bg-red-100 text-red-700',
  balance_adjust: 'bg-orange-100 text-orange-700',
  recharge_confirm: 'bg-orange-100 text-orange-700',
  recharge_first_confirm: 'bg-orange-100 text-orange-700',
  recharge_second_confirm: 'bg-orange-100 text-orange-700',
  order_cancel: 'bg-orange-100 text-orange-700',
  withdraw_approve: 'bg-orange-100 text-orange-700',
  withdraw_first_approve: 'bg-orange-100 text-orange-700',
  withdraw_second_approve: 'bg-orange-100 text-orange-700',
  withdraw_reject: 'bg-orange-100 text-orange-700',
  withdraw_paid: 'bg-orange-100 text-orange-700',
  real_name_approve: 'bg-emerald-100 text-emerald-700',
  real_name_reject: 'bg-emerald-100 text-emerald-700',
  role_change: 'bg-emerald-100 text-emerald-700',
  vendor_create: 'bg-blue-100 text-blue-700',
  vendor_update: 'bg-blue-100 text-blue-700',
  model_create: 'bg-blue-100 text-blue-700',
  model_update: 'bg-blue-100 text-blue-700',
  config_update: 'bg-blue-100 text-blue-700',
  agent_create: 'bg-blue-100 text-blue-700',
  agent_update: 'bg-blue-100 text-blue-700',
  system_maintenance: 'bg-blue-100 text-blue-700',
}

const LABEL_MAP: Record<string, string> = {}
for (const opt of ACTION_OPTIONS) {
  if (opt.value) LABEL_MAP[opt.value] = opt.label
}

/** 计算审计统计数据（从日志列表） */
export function computeAuditStats(logs: AuditLog[]): AuditStats {
  const now = new Date()
  const today = now.toISOString().slice(0, 10)
  const yesterday = new Date(now.getTime() - 86400000).toISOString().slice(0, 10)

  const todayLogs = logs.filter((l) => l.createdAt.startsWith(today))
  const yesterdayLogs = logs.filter((l) => l.createdAt.startsWith(yesterday))
  const operators = new Set(todayLogs.map((l) => l.operatorEmail || `#${l.operatorId}`))

  // Find most common action today
  const actionCounts: Record<string, number> = {}
  for (const l of todayLogs) {
    const key = l.actionLabel || l.action
    actionCounts[key] = (actionCounts[key] || 0) + 1
  }
  const topAction = Object.entries(actionCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || ''

  // Build 24h trend: bucket by hour
  const hourBuckets: number[] = new Array(24).fill(0)
  for (const l of todayLogs) {
    const h = parseInt(l.createdAt.slice(11, 13), 10)
    if (!isNaN(h)) hourBuckets[h]++
  }
  const trend = hourBuckets.map((v) => ({ value: v }))

  return {
    totalToday: todayLogs.length,
    totalYesterday: yesterdayLogs.length,
    uniqueOperators: operators.size,
    topAction,
    trend,
  }
}
