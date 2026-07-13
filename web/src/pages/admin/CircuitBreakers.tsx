import { useEffect, useState, useCallback } from 'react'
import { get, post } from '@/lib/api'
import type { CircuitBreakerStatus } from '@/types'
import {
  Zap,
  Activity,
  CheckCircle2,
  XCircle,
  AlertCircle,
  AlertTriangle,
  Loader2,
  RefreshCw,
} from 'lucide-react'
import FeatureDescription from '@/components/admin/FeatureDescription'

/* ── helpers ── */

const STATE_MAP = {
  closed: { label: '正常运行', icon: CheckCircle2, color: 'text-green-600 bg-green-50' },
  open: { label: '已熔断', icon: XCircle, color: 'text-red-600 bg-red-50' },
  'half-open': { label: '半开探测', icon: AlertTriangle, color: 'text-yellow-600 bg-yellow-50' },
} as const

function stateConfig(state: string) {
  return STATE_MAP[state as keyof typeof STATE_MAP] || {
    label: state,
    icon: AlertTriangle,
    color: 'text-slate-600 bg-slate-50',
  }
}

function fmtTimestamp(ts: number | null): string {
  if (!ts) return '-'
  return new Date(ts * 1000).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

/* ════════════════════════════════════════
   CircuitBreakersDashboard Component
   ════════════════════════════════════════ */

export default function CircuitBreakersDashboard() {
  const [circuits, setCircuits] = useState<CircuitBreakerStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [resetting, setResetting] = useState<number | null>(null)
  const [successMsg, setSuccessMsg] = useState('')

  const fetchCircuits = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await get<{ items: CircuitBreakerStatus[]; summary: any }>('/api/v1/admin/circuit-breakers')
      setCircuits(data.items ?? [])
    } catch (err: any) {
      setError(err.message || '获取熔断器状态失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchCircuits()
  }, [fetchCircuits])

  const handleReset = async (vendorModelId: number, vendorName: string) => {
    setResetting(vendorModelId)
    setSuccessMsg('')
    try {
      await post(`/api/v1/admin/circuit-breakers/${vendorModelId}/reset`)
      setSuccessMsg(`已重置 ${vendorName} 的熔断器`)
      await fetchCircuits()
    } catch (err: any) {
      setError(err.message || '重置失败')
    } finally {
      setResetting(null)
    }
  }

  /* ── stats ── */
  const total = circuits.length
  const closedCount = circuits.filter((c) => c.state === 'closed').length
  const openCount = circuits.filter((c) => c.state === 'open').length
  const halfOpenCount = circuits.filter((c) => c.state === 'half-open').length
  const unhealthyCount = openCount + halfOpenCount

  /* ── loading state ── */
  if (loading && circuits.length === 0) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-slate-400" size={32} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap size={24} className="text-slate-700" />
          <h1 className="text-2xl font-bold text-slate-900">熔断器看板</h1>
          <FeatureDescription page="admin/circuit-breakers" className="ml-2" />
        </div>
        <button
          onClick={fetchCircuits}
          disabled={loading}
          className="flex items-center gap-1 px-3 py-1.5 text-xs text-slate-600 bg-white rounded-lg border border-slate-200 hover:bg-slate-50 transition disabled:opacity-50"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          刷新
        </button>
      </div>

      {/* ── Messages ── */}
      {successMsg && (
        <div className="flex items-center gap-2 text-green-700 bg-green-50 p-3 rounded-lg text-sm">
          <CheckCircle2 size={16} />
          {successMsg}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {/* ── Stats cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {/* Total */}
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600">
              <Activity size={18} />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900">{total}</div>
          <div className="text-xs text-slate-500">熔断器总数</div>
        </div>

        {/* Closed (normal) */}
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 rounded-lg bg-green-50 text-green-600">
              <CheckCircle2 size={18} />
            </div>
          </div>
          <div className="text-2xl font-bold text-green-600">{closedCount}</div>
          <div className="text-xs text-slate-500">正常运行</div>
        </div>

        {/* Open (tripped) */}
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <div className={`p-2 rounded-lg ${openCount > 0 ? 'bg-red-50 text-red-600' : 'bg-slate-50 text-slate-400'}`}>
              <XCircle size={18} />
            </div>
          </div>
          <div className={`text-2xl font-bold ${openCount > 0 ? 'text-red-600' : 'text-slate-900'}`}>{openCount}</div>
          <div className="text-xs text-slate-500">已熔断</div>
        </div>

        {/* Half-open */}
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <div className={`p-2 rounded-lg ${halfOpenCount > 0 ? 'bg-yellow-50 text-yellow-600' : 'bg-slate-50 text-slate-400'}`}>
              <AlertTriangle size={18} />
            </div>
          </div>
          <div className={`text-2xl font-bold ${halfOpenCount > 0 ? 'text-yellow-600' : 'text-slate-900'}`}>{halfOpenCount}</div>
          <div className="text-xs text-slate-500">半开探测</div>
        </div>
      </div>

      {/* ── Alerts banner ── */}
      {unhealthyCount > 0 && (
        <div className="flex items-center gap-2 p-3 text-sm text-orange-700 bg-orange-50 rounded-lg border border-orange-200">
          <AlertTriangle size={16} className="shrink-0" />
          <span>
            当前有 <strong>{unhealthyCount}</strong> 个熔断器处于非正常状态，流量已被自动切换到其他健康供应商。
            {openCount > 0 && ' 确认上游恢复后，可手动点击"重置"关闭熔断。'}
          </span>
        </div>
      )}

      {/* ── Circuit Breaker Table ── */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 text-left">
                <th className="px-4 py-3 text-sm font-medium text-slate-500">供应商</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">模型</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">熔断状态</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">熔断时间</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">连续失败次数</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {circuits.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-slate-400">
                    暂无熔断器数据
                  </td>
                </tr>
              ) : (
                circuits.map((cb) => {
                  const cfg = stateConfig(cb.state)
                  const StateIcon = cfg.icon
                  const isUnhealthy = cb.state === 'open' || cb.state === 'half-open'

                  return (
                    <tr key={cb.vendorModelId} className="hover:bg-slate-50 transition">
                      <td className="px-4 py-3 text-sm font-medium text-slate-800">
                        {cb.vendorName}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">
                        <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded">
                          {cb.upstreamModelName}
                        </code>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full ${cfg.color}`}
                        >
                          <StateIcon size={12} />
                          {cfg.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-500">
                        {fmtTimestamp(cb.openedAt)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`text-sm font-mono ${
                            cb.failuresSinceTrip > 0 ? 'text-red-600' : 'text-slate-500'
                          }`}
                        >
                          {cb.failuresSinceTrip}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {isUnhealthy ? (
                          <button
                            onClick={() => handleReset(cb.vendorModelId, cb.vendorName)}
                            disabled={resetting === cb.vendorModelId}
                            className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition disabled:opacity-50"
                          >
                            {resetting === cb.vendorModelId ? (
                              <Loader2 size={12} className="animate-spin" />
                            ) : (
                              <RefreshCw size={12} />
                            )}
                            手动重置
                          </button>
                        ) : (
                          <span className="text-xs text-slate-300">-</span>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
