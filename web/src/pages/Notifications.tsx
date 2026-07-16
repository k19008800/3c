import { useEffect, useState, useCallback } from 'react'
import { get, put } from '@/lib/api'
import type { NotificationItem } from '@/types'
import PaginationBar from '@/components/ui/PaginationBar'
import {
  Loader2, Bell, CheckCircle2, Info, AlertTriangle,
  CreditCard, Shield, Mail, Gift, Zap, Wallet,
  TrendingDown, Ban, Megaphone, HandCoins, UserPlus,
} from 'lucide-react'

// ── Enhanced type configuration ──

const typeConfig: Record<string, { icon: any; color: string }> = {
  // Existing
  system: { icon: Info, color: 'text-blue-500 bg-blue-50' },
  security: { icon: Shield, color: 'text-red-500 bg-red-50' },
  recharge: { icon: CreditCard, color: 'text-green-500 bg-green-50' },
  account: { icon: Mail, color: 'text-purple-500 bg-purple-50' },
  warning: { icon: AlertTriangle, color: 'text-amber-500 bg-amber-50' },
  promotion: { icon: Gift, color: 'text-pink-500 bg-pink-50' },
  // New types
  balance_low: { icon: Wallet, color: 'text-orange-500 bg-orange-50' },
  quota_warning: { icon: AlertTriangle, color: 'text-yellow-500 bg-yellow-50' },
  quota_exceeded: { icon: Ban, color: 'text-red-500 bg-red-50' },
  redemption_success: { icon: Gift, color: 'text-green-500 bg-green-50' },
  new_model: { icon: Zap, color: 'text-blue-500 bg-blue-100' },
  system_announcement: { icon: Megaphone, color: 'text-indigo-500 bg-indigo-50' },
  withdraw_result: { icon: TrendingDown, color: 'text-slate-500 bg-slate-50' },
  commission_settled: { icon: HandCoins, color: 'text-emerald-500 bg-emerald-50' },
  agent_client_event: { icon: UserPlus, color: 'text-teal-500 bg-teal-50' },
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
  const [pageSize, setPageSize] = useState(20)
  const [typeFilter, setTypeFilter] = useState('')
  const [unreadOnly, setUnreadOnly] = useState(false)

  const fetchNotifications = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params: any = { page, pageSize }
      if (typeFilter) params.type = typeFilter
      if (unreadOnly) params.unread_only = true
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
  }, [page, pageSize, typeFilter, unreadOnly])

  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await get<{ total: number }>('/api/v1/me/notifications/unread-count')
      setTotalUnread(res.total)
    } catch {
      // fallback
      try {
        const res = await get<{ total: number }>('/api/v1/auth/notifications', { unreadOnly: true, pageSize: 1 })
        setTotalUnread(res.total)
      } catch {
        // ignore
      }
    }
  }, [])

  useEffect(() => {
    fetchNotifications()
    fetchUnreadCount()
  }, [fetchNotifications, fetchUnreadCount])

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

  const handleMarkAllRead = async () => {
    try {
      await put('/api/me/notifications/read-all')
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, readAt: n.readAt || new Date().toISOString() }))
      )
      setTotalUnread(0)
    } catch (err: any) {
      setError(err.message || '全部已读失败')
    }
  }

  const totalPages = Math.ceil(total / pageSize)

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
        {notifications.some((n) => !n.readAt) && (
          <button
            onClick={handleMarkAllRead}
            className="text-xs text-blue-600 hover:text-blue-800 bg-blue-50 px-3 py-1.5 rounded-md transition"
          >
            全部标为已读
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl p-3 shadow-sm border border-slate-200">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-500 whitespace-nowrap">通知类型</label>
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
          {notifications.map((n) => {
            const cfg = getTypeConfig(n.type)
            const Icon = cfg.icon
            const isUnread = !n.readAt
            return (
              <div
                key={n.id}
                className={`relative flex items-start gap-4 p-4 rounded-xl border transition ${
                  isUnread
                    ? 'bg-blue-50/60 border-blue-100'
                    : 'bg-white border-slate-200 hover:border-slate-300'
                }`}
              >
                {/* Unread indicator */}
                {isUnread && (
                  <span className="absolute top-4 left-3 w-2 h-2 rounded-full bg-blue-500" />
                )}

                {/* Icon */}
                <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ml-3 ${cfg.color}`}>
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
                    {new Date(n.createdAt).toLocaleString('zh-CN')}
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
