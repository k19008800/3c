/**
 * RecentActivity — 最近活动列表（充值 + 调用）
 *
 * 独立加载数据，展示最近充值记录和调用记录各 6 条。
 */

import { useEffect, useState, useMemo } from 'react'
import { DollarSign, PhoneCall } from 'lucide-react'
import { get } from '@/lib/api'

/* ── Status helper configs ── */

const callStatusLabel: Record<string, string> = {
  success: '成功',
  failed: '失败',
  timeout: '超时',
}
const callStatusColor: Record<string, string> = {
  success: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
  timeout: 'bg-yellow-100 text-yellow-700',
}

const rechargeStatusLabel: Record<string, string> = {
  pending: '待处理',
  paid: '已完成',
  cancelled: '已取消',
}
const rechargeStatusColor: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  paid: 'bg-green-100 text-green-700',
  cancelled: 'bg-slate-100 text-slate-600',
}

/* ── Date formatter ── */

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/* ── Recent Recharges Table ── */

function RecentRecharges({ items }: { items: any[] }) {
  if (items.length === 0) {
    return <div className="text-center py-10 text-sm text-slate-400">暂无充值记录</div>
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-50 text-left">
            <th className="px-4 py-3 text-xs font-medium text-slate-500">用户</th>
            <th className="px-4 py-3 text-right text-xs font-medium text-slate-500">金额</th>
            <th className="px-4 py-3 text-xs font-medium text-slate-500">状态</th>
            <th className="px-4 py-3 text-xs font-medium text-slate-500">时间</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {items.slice(0, 6).map((r: any) => (
            <tr key={r.id} className="hover:bg-slate-50">
              <td className="px-4 py-3 text-slate-800 max-w-[120px] truncate">
                {r.nickname || r.email}
              </td>
              <td className="px-4 py-3 text-right font-semibold">
                ¥{parseFloat(r.amount).toFixed(2)}
              </td>
              <td className="px-4 py-3">
                <span
                  className={`inline-flex px-1.5 py-0.5 rounded-full text-xs font-medium ${rechargeStatusColor[r.status] || 'bg-slate-100'}`}
                >
                  {rechargeStatusLabel[r.status] || r.status}
                </span>
              </td>
              <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">
                {formatTime(r.createdAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* ── Recent Calls Table ── */

function RecentCalls({ items }: { items: any[] }) {
  if (items.length === 0) {
    return <div className="text-center py-10 text-sm text-slate-400">暂无调用记录</div>
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-50 text-left">
            <th className="px-4 py-3 text-xs font-medium text-slate-500">用户</th>
            <th className="px-4 py-3 text-xs font-medium text-slate-500">模型</th>
            <th className="px-4 py-3 text-right text-xs font-medium text-slate-500">Tokens</th>
            <th className="px-4 py-3 text-xs font-medium text-slate-500">状态</th>
            <th className="px-4 py-3 text-xs font-medium text-slate-500">时间</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {items.slice(0, 6).map((c: any) => (
            <tr key={c.id} className="hover:bg-slate-50">
              <td className="px-4 py-3 text-slate-800 max-w-[100px] truncate">{c.email}</td>
              <td
                className="px-4 py-3 text-slate-600 max-w-[130px] truncate text-xs"
                title={c.modelName}
              >
                {c.modelName}
              </td>
              <td className="px-4 py-3 text-right font-mono text-xs">
                {c.totalTokens.toLocaleString()}
              </td>
              <td className="px-4 py-3">
                <span
                  className={`inline-flex px-1.5 py-0.5 rounded-full text-xs font-medium ${callStatusColor[c.status] || 'bg-slate-100'}`}
                >
                  {callStatusLabel[c.status] || c.status}
                </span>
              </td>
              <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">
                {formatTime(c.createdAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* ── Main Component ── */

export default function RecentActivity() {
  const [recent, setRecent] = useState<{
    recentRecharges: any[]
    recentCalls: any[]
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    get('/api/v1/admin/dashboard/recent-activity')
      .then((data) => {
        if (!cancelled) setRecent(data)
      })
      .catch((err: any) => {
        if (!cancelled) setError(err.message || '获取最近活动失败')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const { recharges, calls } = useMemo(
    () => ({
      recharges: recent?.recentRecharges ?? [],
      calls: recent?.recentCalls ?? [],
    }),
    [recent],
  )

  /* ── Loading ── */
  if (loading && !recent) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {[1, 2].map((i) => (
          <div
            key={i}
            className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden animate-pulse"
          >
            <div className="h-11 bg-slate-100" />
            <div className="h-[200px] flex items-center justify-center">
              <div className="w-5 h-5 border-2 border-slate-300 border-t-transparent rounded-full animate-spin" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  /* ── Error ── */
  if (error && !recent) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <DollarSign size={16} className="text-emerald-600" />
              <h3 className="text-sm font-semibold text-slate-800">最近充值</h3>
            </div>
          </div>
          <div className="text-center py-10 text-sm text-red-500">{error}</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <PhoneCall size={16} className="text-violet-600" />
              <h3 className="text-sm font-semibold text-slate-800">最近调用</h3>
            </div>
          </div>
          <div className="text-center py-10 text-sm text-red-500">{error}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Recent Recharges */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <DollarSign size={16} className="text-emerald-600" />
            <h3 className="text-sm font-semibold text-slate-800">最近充值</h3>
          </div>
        </div>
        <RecentRecharges items={recharges} />
      </div>

      {/* Recent Calls */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <PhoneCall size={16} className="text-violet-600" />
            <h3 className="text-sm font-semibold text-slate-800">最近调用</h3>
          </div>
        </div>
        <RecentCalls items={calls} />
      </div>
    </div>
  )
}
