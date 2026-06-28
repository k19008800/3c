import { useEffect, useState, useCallback } from 'react'
import { get } from '@/lib/api'
import type { DashboardHealth } from '@/types'
import {
  Loader2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Activity,
  RefreshCw,
  Server,
  Database,
  HardDrive,
  Wifi,
  Clock,
  TrendingUp,
} from 'lucide-react'

/* ── helpers ── */

function fmtDuration(seconds: number): string {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const parts: string[] = []
  if (d > 0) parts.push(`${d}d`)
  if (h > 0) parts.push(`${h}h`)
  if (m > 0) parts.push(`${m}m`)
  return parts.join(' ') || '<1m'
}

function healthColor(score: string): string {
  const n = parseFloat(score)
  if (n >= 0.85) return 'text-green-600 bg-green-50'
  if (n >= 0.7) return 'text-yellow-600 bg-yellow-50'
  return 'text-red-600 bg-red-50'
}

function rateLimitPct(current: number, limit: number): number {
  if (limit <= 0) return 0
  return Math.min(Math.round((current / limit) * 100), 100)
}

function rateLimitColor(pct: number): string {
  if (pct >= 90) return 'bg-red-500'
  if (pct >= 70) return 'bg-yellow-500'
  return 'bg-green-500'
}

/* ════════════════════════════════════════
   SystemHealthPanel Component
   ════════════════════════════════════════ */

export default function SystemHealthPanel() {
  const [health, setHealth] = useState<DashboardHealth | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchHealth = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await get<DashboardHealth>('/api/v1/admin/dashboard/health')
      setHealth(data)
    } catch (err: any) {
      setError(err.message || '获取健康数据失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchHealth()
  }, [fetchHealth])

  if (loading && !health) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="animate-spin text-slate-400" size={24} />
      </div>
    )
  }

  if (error && !health) {
    return (
      <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm">
        <AlertTriangle size={16} />
        {error}
      </div>
    )
  }

  const h = health!

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity size={20} className="text-slate-700" />
          <h2 className="text-lg font-semibold text-slate-800">系统健康</h2>
        </div>
        <button
          onClick={fetchHealth}
          className="flex items-center gap-1 px-3 py-1.5 text-xs text-slate-600 bg-white rounded-lg border border-slate-200 hover:bg-slate-50 transition"
        >
          <RefreshCw size={13} />
          刷新
        </button>
      </div>

      {/* ── Row 1: System Status + Rate Limit ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* System Status */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Server size={16} className="text-slate-600" />
            <h3 className="text-sm font-semibold text-slate-700">服务状态</h3>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs text-slate-500">
                <Server size={13} /> API
              </span>
              <span className="flex items-center gap-1 text-xs">
                <CheckCircle2 size={13} className="text-green-500" />
                运行中
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs text-slate-500">
                <Database size={13} /> PostgreSQL
              </span>
              <span className={`flex items-center gap-1 text-xs ${h.system.db ? 'text-green-600' : 'text-red-600'}`}>
                {h.system.db ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                {h.system.db ? '正常' : '异常'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs text-slate-500">
                <HardDrive size={13} /> Redis
              </span>
              <span className={`flex items-center gap-1 text-xs ${h.system.redis ? 'text-green-600' : 'text-red-600'}`}>
                {h.system.redis ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                {h.system.redis ? '正常' : '异常'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs text-slate-500">
                <Clock size={13} /> 运行时长
              </span>
              <span className="text-xs text-slate-700 font-mono">
                {fmtDuration(h.system.uptime)}
              </span>
            </div>
          </div>
        </div>

        {/* Rate Limit Water Level */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Activity size={16} className="text-violet-600" />
            <h3 className="text-sm font-semibold text-slate-700">限流水位</h3>
          </div>
          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-slate-500">全局 RPM</span>
                <span className="text-xs text-slate-700 font-mono">
                  {h.rateLimit.globalRpm.current} / {h.rateLimit.globalRpm.limit}
                </span>
              </div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${rateLimitColor(rateLimitPct(h.rateLimit.globalRpm.current, h.rateLimit.globalRpm.limit))}`}
                  style={{ width: `${rateLimitPct(h.rateLimit.globalRpm.current, h.rateLimit.globalRpm.limit)}%` }}
                />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-slate-500">全局 TPM</span>
                <span className="text-xs text-slate-700 font-mono">
                  {h.rateLimit.globalTpm.current.toLocaleString()} / {h.rateLimit.globalTpm.limit.toLocaleString()}
                </span>
              </div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${rateLimitColor(rateLimitPct(h.rateLimit.globalTpm.current, h.rateLimit.globalTpm.limit))}`}
                  style={{ width: `${rateLimitPct(h.rateLimit.globalTpm.current, h.rateLimit.globalTpm.limit)}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Recent Errors Summary */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={16} className={h.recentFailures.errorRate > 5 ? 'text-red-600' : 'text-slate-600'} />
            <h3 className="text-sm font-semibold text-slate-700">近 1h 错误</h3>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center mb-2">
            <div className="bg-slate-50 rounded-lg p-2">
              <p className="text-lg font-bold text-slate-800">{h.recentFailures.total}</p>
              <p className="text-[10px] text-slate-400">总调用</p>
            </div>
            <div className="bg-red-50 rounded-lg p-2">
              <p className="text-lg font-bold text-red-600">{h.recentFailures.failed}</p>
              <p className="text-[10px] text-red-400">失败</p>
            </div>
            <div className="bg-yellow-50 rounded-lg p-2">
              <p className="text-lg font-bold text-yellow-600">{h.recentFailures.timeout}</p>
              <p className="text-[10px] text-yellow-400">超时</p>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500">错误率</span>
            <span
              className={`text-xs font-semibold ${h.recentFailures.errorRate > 5 ? 'text-red-600' : 'text-slate-700'}`}
            >
              {h.recentFailures.errorRate}%
            </span>
          </div>
          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden mt-1">
            <div
              className={`h-full rounded-full ${h.recentFailures.errorRate > 5 ? 'bg-red-500' : h.recentFailures.errorRate > 2 ? 'bg-yellow-500' : 'bg-green-500'}`}
              style={{ width: `${Math.min(h.recentFailures.errorRate, 100)}%` }}
            />
          </div>
        </div>
      </div>

      {/* ── Row 2: Vendor Health ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Vendor status distribution */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Wifi size={16} className="text-slate-600" />
            <h3 className="text-sm font-semibold text-slate-700">厂商分布</h3>
          </div>
          <div className="space-y-2">
            {(Object.entries(h.vendors.statusDistribution) as [string, number][]).map(([status, count]) => (
              <div key={status} className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs text-slate-600">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      status === 'active' ? 'bg-green-500' :
                      status === 'degraded' ? 'bg-yellow-500' :
                      status === 'down' ? 'bg-red-500' :
                      'bg-slate-300'
                    }`}
                  />
                  {status === 'active' ? '正常' : status === 'degraded' ? '降级' : status === 'down' ? '宕机' : status}
                </span>
                <span className="text-xs font-medium text-slate-800">{count}</span>
              </div>
            ))}
            {Object.keys(h.vendors.statusDistribution).length === 0 && (
              <p className="text-xs text-slate-400 text-center py-2">暂无数据</p>
            )}
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100">
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-slate-500">平均健康评分</span>
              <span className={`font-semibold ${healthColor(h.vendors.avgHealthScore).split(' ')[0]}`}>
                {h.vendors.avgHealthScore}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">活跃模型 / 宕机</span>
              <span className="text-slate-700">
                {h.vendors.totalActiveModels}
                {h.vendors.downModelCount > 0 && (
                  <span className="text-red-500 ml-1">(↓{h.vendors.downModelCount})</span>
                )}
              </span>
            </div>
          </div>
        </div>

        {/* Unhealthy models list */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 lg:col-span-2">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={16} className={h.vendors.unhealthyModels.length > 0 ? 'text-amber-500' : 'text-green-500'} />
            <h3 className="text-sm font-semibold text-slate-700">
              异常厂商模型
              {h.vendors.unhealthyModels.length > 0 && (
                <span className="ml-1.5 text-xs font-normal text-slate-400">({h.vendors.unhealthyModels.length})</span>
              )}
            </h3>
          </div>
          {h.vendors.unhealthyModels.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-6 text-green-600">
              <CheckCircle2 size={18} />
              <span className="text-sm">所有厂商运行正常</span>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-slate-400">
                    <th className="pb-2 pr-2 font-medium">厂商</th>
                    <th className="pb-2 pr-2 font-medium">模型</th>
                    <th className="pb-2 pr-2 font-medium">评分</th>
                    <th className="pb-2 pr-2 font-medium">状态</th>
                    <th className="pb-2 pr-2 font-medium">恢复中</th>
                    <th className="pb-2 font-medium">上次检测</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {h.vendors.unhealthyModels.map((m) => (
                    <tr key={`${m.vendorName}-${m.upstreamModelName}`} className="hover:bg-slate-50">
                      <td className="py-2 pr-2 text-slate-700">{m.vendorName}</td>
                      <td className="py-2 pr-2 text-slate-600 max-w-[120px] truncate" title={m.modelName}>
                        {m.modelName}
                      </td>
                      <td className="py-2 pr-2">
                        <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium ${healthColor(m.healthScore)}`}>
                          {m.healthScore}
                        </span>
                      </td>
                      <td className="py-2 pr-2">
                        <span className={`inline-flex items-center gap-1 text-[10px] ${m.isDown ? 'text-red-600' : 'text-yellow-600'}`}>
                          {m.isDown ? <XCircle size={11} /> : <AlertTriangle size={11} />}
                          {m.isDown ? '宕机' : '降级'}
                        </span>
                      </td>
                      <td className="py-2 pr-2">
                        {m.consecutiveSuccess && m.consecutiveSuccess > 0 ? (
                          <span className="text-green-600 text-[10px]">
                            {m.consecutiveSuccess}/3
                          </span>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>
                      <td className="py-2 text-slate-400 text-[10px] whitespace-nowrap">
                        {m.lastCheckAgo !== null ? `${m.lastCheckAgo}s前` : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {/* Recovering section */}
          {h.vendors.recovering.length > 0 && (
            <div className="mt-3 pt-3 border-t border-slate-100">
              <div className="flex items-center gap-1.5 mb-2">
                <TrendingUp size={14} className="text-green-500" />
                <span className="text-xs font-medium text-green-700">恢复中</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {h.vendors.recovering.map((r) => (
                  <span
                    key={`${r.vendorName}-${r.upstreamModelName}`}
                    className="inline-flex items-center gap-1 px-2 py-1 bg-green-50 text-green-700 rounded-full text-[10px]"
                  >
                    {r.vendorName}/{r.modelName}
                    <span className="font-semibold">{r.consecutiveSuccess}/3</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Row 3: Top Errors ── */}
      {h.recentFailures.topErrors.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={16} className="text-red-500" />
            <h3 className="text-sm font-semibold text-slate-700">Top 错误 (近 1h)</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-slate-400">
                  <th className="pb-2 pr-4 font-medium">模型</th>
                  <th className="pb-2 pr-4 font-medium">错误信息</th>
                  <th className="pb-2 font-medium text-right">次数</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {h.recentFailures.topErrors.map((e, idx) => (
                  <tr key={idx} className="hover:bg-slate-50">
                    <td className="py-2 pr-4 text-slate-700 max-w-[140px] truncate" title={e.modelName}>
                      {e.modelName || '-'}
                    </td>
                    <td className="py-2 pr-4 text-slate-500 max-w-[300px] truncate" title={e.errorMessage}>
                      {e.errorMessage}
                    </td>
                    <td className="py-2 text-right">
                      <span className="inline-flex items-center justify-center min-w-[24px] px-1.5 py-0.5 bg-red-50 text-red-600 rounded text-[10px] font-medium">
                        {e.count}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
