import { useEffect, useState, useCallback, useMemo } from 'react'
import { get, put, post } from '@/lib/api'
import type { NotificationItem } from '@/types'
import PaginationBar from '@/components/ui/PaginationBar'
import {
  Loader2, Bell, CheckCircle2, Info, AlertTriangle,
  CreditCard, Shield, Mail, Gift, Zap, Wallet,
  TrendingDown, Ban, Megaphone, HandCoins, UserPlus,
  Lock, RotateCcw, Key,
} from 'lucide-react'

// ── Relative time formatter ──

function relativeTime(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diffMs = now - then
  if (diffMs < 0) return new Date(dateStr).toLocaleDateString('zh-CN')
  const seconds = Math.floor(diffMs / 1000)
  if (seconds < 60) return '刚刚'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}小时前`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}天前`
  return new Date(dateStr).toLocaleDateString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// ── Category definitions ──

type CategoryKey = '' | 'system' | 'order' | 'security' | 'other'

const categories: { key: CategoryKey; label: string }[] = [
  { key: '', label: '全部' },
  { key: 'system', label: '系统' },
  { key: 'order', label: '订单' },
  { key: 'security', label: '安全' },
  { key: 'other', label: '其他' },
]

const categoryTypeMap: Record<CategoryKey, string[]> = {
  '': [],
  system: [
    'system', 'system_announcement', 'balance_low', 'quota_warning',
    'quota_exceeded', 'warning', 'new_model',
  ],
  order: [
    'recharge', 'redemption_success', 'withdraw_result',
    'commission_settled', 'promotion', 'redemption_used',
    'redemption_expiring', 'redemption_fraud', 'redemption_revoked',
  ],
  security: ['security', 'login_alert', 'account_banned'],
  other: [
    'account', 'agent_client_event', 'api_key_event',
    'real_name_approved', 'real_name_rejected',
  ],
}

// ── Enhanced type configuration ──

const typeConfig: Record<string, { icon: any; color: string }> = {
  system: { icon: Info, color: 'text-blue-500 bg-blue-50' },
  security: { icon: Shield, color: 'text-red-500 bg-red-50' },
  recharge: { icon: CreditCard, color: 'text-green-500 bg-green-50' },
  account: { icon: Mail, color: 'text-purple-500 bg-purple-50' },
  warning: { icon: AlertTriangle, color: 'text-amber-500 bg-amber-50' },
  promotion: { icon: Gift, color: 'text-pink-500 bg-pink-50' },
  balance_low: { icon: Wallet, color: 'text-orange-500 bg-orange-50' },
  quota_warning: { icon: AlertTriangle, color: 'text-yellow-500 bg-yellow-50' },
  quota_exceeded: { icon: Ban, color: 'text-red-500 bg-red-50' },
  redemption_success: { icon: Gift, color: 'text-green-500 bg-green-50' },
  new_model: { icon: Zap, color: 'text-blue-500 bg-blue-100' },
  system_announcement: { icon: Megaphone, color: 'text-indigo-500 bg-indigo-50' },
  withdraw_result: { icon: TrendingDown, color: 'text-slate-500 bg-slate-50' },
  commission_settled: { icon: HandCoins, color: 'text-emerald-500 bg-emerald-50' },
  agent_client_event: { icon: UserPlus, color: 'text-teal-500 bg-teal-50' },
  login_alert: { icon: Shield, color: 'text-red-500 bg-red-50' },
  account_banned: { icon: Lock, color: 'text-red-600 bg-red-100' },
  api_key_event: { icon: Key, color: 'text-cyan-500 bg-cyan-50' },
  real_name_approved: { icon: CheckCircle2, color: 'text-green-500 bg-green-50' },
  real_name_rejected: { icon: AlertTriangle, color: 'text-red-500 bg-red-50' },
  redemption_used: { icon: RotateCcw, color: 'text-slate-500 bg-slate-50' },
  redemption_expiring: { icon: AlertTriangle, color: 'text-amber-500 bg-amber-50' },
  redemption_fraud: { icon: Ban, color: 'text-red-500 bg-red-50' },
  redemption_revoked: { icon: Ban, color: 'text-slate-500 bg-slate-50' },
}

function getTypeConfig(type: string) {
  return typeConfig[type] || { icon: Bell, color: 'text-slate-500 bg-slate-50' }
}

// ── Type label translations ──

const typeLabels: Record<string, string> = {
  system: '系统通知',
  security: '安全通知',
  recharge: '充值通知',
  account: '账户通知',
  warning: '警告',
  promotion: '促销活动',
  balance_low: '余额不足',
  quota_warning: '额度警告',
  quota_exceeded: '额度超限',
  redemption_success: '兑换成功',
  new_model: '新模型上线',
  system_announcement: '全站公告',
  withdraw_result: '提现结果',
  commission_settled: '佣金结算',
  agent_client_event: '客户事件',
  login_alert: '异常登录',
  account_banned: '账户封禁',
  api_key_event: 'API Key 事件',
  real_name_approved: '实名通过',
  real_name_rejected: '实名驳回',
  redemption_used: '兑换码已使用',
  redemption_expiring: '兑换码即将过期',
  redemption_fraud: '兑换风控告警',
  redemption_revoked: '兑换码已撤销',
}

function TypeBadge({ type }: { type: string }) {
  const cfg = getTypeConfig(type)
  const label = typeLabels[type] || type
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.color}`}>
      {label}
    </span>
  )
}

// ── Page ──

export default function Notifications() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [totalUnread, setTotalUnread] = useState(0)
  const [markLoading, setMarkLoading] = useState<number | null>(null)
  const [batchLoading, setBatchLoading] = useState(false)
  const [pageSize, setPageSize] = useState(20)
  const [typeFilter, setTypeFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<CategoryKey>('')
  const [unreadOnly, setUnreadOnly] = useState(false)

  // ── Batch selection ──
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())

  const allVisibleIds = useMemo(() => notifications.map((n) => n.id), [notifications])
  const allSelected = notifications.length > 0 && selectedIds.size === allVisibleIds.length

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(allVisibleIds))
    }
  }

  const clearSelection = () => setSelectedIds(new Set())

  // ── Data fetching ──

  const fetchNotifications = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params: any = { page, pageSize }
      if (typeFilter) params.type = typeFilter
      if (categoryFilter && categoryTypeMap[categoryFilter]?.length) {
        params.type = categoryTypeMap[categoryFilter].join(',')
      }
      if (unreadOnly) params.unreadOnly = true
      const res = await get<{
        list: NotificationItem[]
        total: number
        page: number
        pageSize: number
      }>('/api/v1/auth/notifications', params)
      setNotifications(res.list || [])
      setTotal(res.total)
    } catch (err: any) {
      setError(err.message || '获取通知失败')
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, typeFilter, categoryFilter, unreadOnly])

  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await get<{ unreadCount: number }>('/api/v1/me/notifications/unread-count')
      setTotalUnread(res.unreadCount)
    } catch {
      try {
        const res = await get<{ unreadCount: number }>('/api/v1/me/notifications/unread-count')
        if (typeof res.unreadCount === 'number') {
          setTotalUnread(res.unreadCount)
        } else {
          // fallback: try total field
          const res2 = await get<{ total: number }>('/api/v1/auth/notifications', { unreadOnly: true, pageSize: 1 })
          setTotalUnread(res2.total)
        }
      } catch {
        // ignore
      }
    }
  }, [])

  useEffect(() => {
    fetchNotifications()
    fetchUnreadCount()
  }, [fetchNotifications, fetchUnreadCount])

  // ── Actions ──

  const handleMarkRead = async (id: number) => {
    setMarkLoading(id)
    try {
      await put(`/api/me/notifications/${id}/read`)
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n))
      )
      setTotalUnread((prev) => Math.max(0, prev - 1))
    } catch (err: any) {
      setError(err.message || '标记已读失败')
    } finally {
      setMarkLoading(null)
    }
  }

  const handleBatchRead = async () => {
    if (selectedIds.size === 0) return
    setBatchLoading(true)
    try {
      await post('/api/v1/auth/notifications/read', { ids: Array.from(selectedIds) })
      const now = new Date().toISOString()
      setNotifications((prev) =>
        prev.map((n) => (selectedIds.has(n.id) && !n.readAt ? { ...n, readAt: now } : n))
      )
      setTotalUnread((prev) => Math.max(0, prev - selectedIds.size))
      clearSelection()
    } catch (err: any) {
      setError(err.message || '批量标记已读失败')
    } finally {
      setBatchLoading(false)
    }
  }

  const handleMarkAllRead = async () => {
    setBatchLoading(true)
    try {
      await post('/api/v1/auth/notifications/read', {})
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, readAt: n.readAt || new Date().toISOString() }))
      )
      setTotalUnread(0)
      clearSelection()
    } catch {
      // fallback
      try {
        await put('/api/me/notifications/read-all')
        setNotifications((prev) =>
          prev.map((n) => ({ ...n, readAt: n.readAt || new Date().toISOString() }))
        )
        setTotalUnread(0)
        clearSelection()
      } catch (err: any) {
        setError(err.message || '全部已读失败')
      }
    } finally {
      setBatchLoading(false)
    }
  }

  const totalPages = Math.ceil(total / pageSize)
  const hasUnread = notifications.some((n) => !n.readAt)

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Bell size={28} className="text-blue-600" />
          <h1 className="text-2xl font-bold text-slate-900">通知中心</h1>
          {totalUnread > 0 && (
            <span className="text-xs bg-red-500 text-white px-2 py-0.5 rounded-full">
              {totalUnread} 条未读
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {selectedIds.size > 0 && (
            <button
              onClick={handleBatchRead}
              disabled={batchLoading}
              className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 bg-blue-50 px-3 py-1.5 rounded-md transition disabled:opacity-50"
            >
              {batchLoading ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <CheckCircle2 size={12} />
              )}
              标记已读 ({selectedIds.size})
            </button>
          )}
          {selectedIds.size > 0 && (
            <button
              onClick={clearSelection}
              className="text-xs text-slate-400 hover:text-slate-600 px-2 py-1.5"
            >
              取消选择
            </button>
          )}
          {hasUnread && (
            <button
              onClick={handleMarkAllRead}
              disabled={batchLoading}
              className="text-xs text-blue-600 hover:text-blue-800 bg-blue-50 px-3 py-1.5 rounded-md transition disabled:opacity-50"
            >
              全部标为已读
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl p-3 shadow-sm border border-slate-200">
        <div className="flex flex-wrap items-center gap-3">
          {/* Category filter */}
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-slate-500 whitespace-nowrap">分类</label>
            <div className="flex gap-1">
              {categories.map((cat) => (
                <button
                  key={cat.key}
                  onClick={() => { setCategoryFilter(cat.key); setPage(1) }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition ${
                    categoryFilter === cat.key
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          <span className="text-slate-200">|</span>

          {/* Type filter */}
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-500 whitespace-nowrap">精确类型</label>
            <select
              value={typeFilter}
              onChange={(e) => { setTypeFilter(e.target.value); setPage(1) }}
              className="px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">全部类型</option>
              {Object.entries(typeLabels).map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
          </div>

          <span className="text-slate-200">|</span>

          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={unreadOnly}
              onChange={(e) => { setUnreadOnly(e.target.checked); setPage(1) }}
              className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-xs text-slate-500">仅看未读</span>
          </label>
        </div>
      </div>

      {error && (
        <div className="p-3 text-sm text-red-600 bg-red-50 rounded-lg">{error}</div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="animate-spin" size={32} />
        </div>
      )}

      {/* Empty state */}
      {!loading && notifications.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <Bell size={48} className="mb-3 opacity-50" />
          <p className="text-sm">暂无通知</p>
        </div>
      )}

      {/* Notification list */}
      {!loading && notifications.length > 0 && (
        <div className="space-y-2">
          {/* Select all bar */}
          {allVisibleIds.length > 0 && (
            <div className="flex items-center gap-2 px-1 pb-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleSelectAll}
                  className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-xs text-slate-400">
                  {allSelected ? '取消全选' : '全选'}
                </span>
              </label>
              {selectedIds.size > 0 && (
                <span className="text-xs text-slate-400">
                  已选 {selectedIds.size} 条
                </span>
              )}
            </div>
          )}

          {notifications.map((n) => {
            const cfg = getTypeConfig(n.type)
            const Icon = cfg.icon
            const isUnread = !n.readAt
            return (
              <div
                key={n.id}
                className={`relative flex items-start gap-3 p-4 rounded-xl border transition ${
                  isUnread
                    ? 'bg-blue-50/60 border-blue-100'
                    : 'bg-white border-slate-200 hover:border-slate-300'
                }`}
              >
                {/* Checkbox */}
                <div className="flex items-center pt-1 shrink-0">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(n.id)}
                    onChange={() => toggleSelect(n.id)}
                    className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                </div>

                {/* Unread indicator */}
                {isUnread && (
                  <span className="absolute top-4 left-10 w-2 h-2 rounded-full bg-blue-500" />
                )}

                {/* Icon */}
                <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${cfg.color}`}>
                  <Icon size={18} />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className={`text-sm ${isUnread ? 'font-semibold text-slate-900' : 'font-medium text-slate-700'}`}>
                          {n.title}
                        </h3>
                        <TypeBadge type={n.type} />
                      </div>
                      <p className="text-sm text-slate-500 mt-1 line-clamp-2 whitespace-pre-wrap">{n.content}</p>
                    </div>
                    {isUnread && (
                      <button
                        onClick={() => handleMarkRead(n.id)}
                        disabled={markLoading === n.id}
                        className="shrink-0 flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 bg-white px-2 py-1 rounded border border-blue-100 hover:border-blue-200 transition disabled:opacity-50 whitespace-nowrap"
                      >
                        {markLoading === n.id ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <CheckCircle2 size={12} />
                        )}
                        标为已读
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-1.5">
                    {relativeTime(n.createdAt)}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 0 && (
        <PaginationBar
          page={page}
          onPageChange={setPage}
          pageSize={pageSize}
          onPageSizeChange={setPageSize}
          total={total}
          totalPages={totalPages}
        />
      )}
    </div>
  )
}
