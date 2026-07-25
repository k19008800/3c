// ──────────────────────────────────────────────
//  useUserActivity — 用户操作轨迹 Hook
// ──────────────────────────────────────────────

import { useState, useEffect, useCallback } from 'react'
import { get } from '@/lib/api'
import type { UserActivityItem, UserActivityStats, UserActivitySummary, PaginatedData } from '@/types'

export interface UseUserActivityParams {
  userId: number
  category?: string
  action?: string
  status?: string
  startDate?: string
  endDate?: string
  page?: number
  pageSize?: number
}

export interface UseUserActivityResult {
  activities: UserActivityItem[]
  total: number
  page: number
  pageSize: number
  stats: UserActivityStats | null
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
  summary: UserActivitySummary | null
  summaryLoading: boolean
}

export function useUserActivity(params: UseUserActivityParams): UseUserActivityResult {
  const [activities, setActivities] = useState<UserActivityItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(params.page ?? 1)
  const [pageSize, setPageSize] = useState(params.pageSize ?? 20)
  const [stats, setStats] = useState<UserActivityStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [summary, setSummary] = useState<UserActivitySummary | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(true)

  const fetchActivities = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const query = new URLSearchParams()
      query.set('page', String(params.page ?? 1))
      query.set('pageSize', String(params.pageSize ?? 20))
      if (params.category) query.set('category', params.category)
      if (params.action) query.set('action', params.action)
      if (params.status) query.set('status', params.status)
      if (params.startDate) query.set('startDate', params.startDate)
      if (params.endDate) query.set('endDate', params.endDate)

      const res = await get<PaginatedData<UserActivityItem> & { stats: UserActivityStats }>(
        `/api/v1/admin/users/${params.userId}/activity?${query.toString()}`
      )
      setActivities(res.list)
      setTotal(res.total)
      setPage(res.page)
      setPageSize(res.pageSize)
      setStats(res.stats)
    } catch (err: any) {
      setError(err.message || '获取操作轨迹失败')
    } finally {
      setLoading(false)
    }
  }, [
    params.userId,
    params.page,
    params.pageSize,
    params.category,
    params.action,
    params.status,
    params.startDate,
    params.endDate,
  ])

  const fetchSummary = useCallback(async () => {
    setSummaryLoading(true)
    try {
      const res = await get<{ data: UserActivitySummary }>(
        `/api/v1/admin/users/${params.userId}/activity/summary`
      )
      setSummary(res)
    } catch {
      // 静默失败，摘要数据不是必须的
    } finally {
      setSummaryLoading(false)
    }
  }, [params.userId])

  useEffect(() => {
    fetchActivities()
  }, [fetchActivities])

  useEffect(() => {
    fetchSummary()
  }, [fetchSummary])

  return {
    activities,
    total,
    page,
    pageSize,
    stats,
    loading,
    error,
    refetch: fetchActivities,
    summary,
    summaryLoading,
  }
}

// ── 操作分类选项 ──

export const CATEGORY_OPTIONS = [
  { value: '', label: '全部分类' },
  { value: 'auth', label: '认证登录' },
  { value: 'api_key', label: 'API 密钥' },
  { value: 'finance', label: '财务交易' },
  { value: 'profile', label: '账户设置' },
  { value: 'agent', label: '代理商' },
  { value: 'system', label: '系统操作' },
]

// ── 操作状态选项 ──

export const STATUS_OPTIONS = [
  { value: '', label: '全部状态' },
  { value: 'success', label: '成功' },
  { value: 'failure', label: '失败' },
  { value: 'pending', label: '进行中' },
]

// ── 操作类型选项（按分类） ──

export const ACTION_OPTIONS_BY_CATEGORY: Record<string, Array<{ value: string; label: string }>> = {
  auth: [
    { value: 'login', label: '用户登录' },
    { value: 'logout', label: '用户登出' },
    { value: 'register', label: '用户注册' },
    { value: 'change_password', label: '修改密码' },
    { value: 'oauth_bind', label: 'OAuth 绑定' },
    { value: 'oauth_unbind', label: 'OAuth 解绑' },
  ],
  api_key: [
    { value: 'api_key_create', label: '创建 API Key' },
    { value: 'api_key_delete', label: '删除 API Key' },
    { value: 'api_key_rename', label: '重命名 API Key' },
    { value: 'api_key_reset', label: '重置 API Key' },
  ],
  finance: [
    { value: 'recharge_submit', label: '提交充值' },
    { value: 'redemption_use', label: '使用兑换码' },
    { value: 'withdraw_request', label: '发起提现' },
    { value: 'invoice_apply', label: '申请发票' },
    { value: 'refund_apply', label: '申请退款' },
  ],
  profile: [
    { value: 'realname_submit', label: '提交实名认证' },
    { value: 'profile_update', label: '更新个人资料' },
    { value: 'security_setup', label: '安全设置变更' },
  ],
  agent: [
    { value: 'agent_client_create', label: '创建客户' },
    { value: 'agent_client_update', label: '编辑客户' },
    { value: 'agent_quota_adjust', label: '调整额度' },
    { value: 'agent_withdraw', label: '代理商提现' },
    { value: 'agent_redemption_create', label: '生成兑换码' },
  ],
}