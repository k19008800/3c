/**
 * OperationalKpiPanel — 运营 KPI 看板（12 项核心商业指标）
 *
 * 对应运营版 PRD §1.3 核心商业指标
 * 数据源: GET /api/v1/admin/operational/kpi
 *
 * 指标列表:
 *  1. DAU（日活跃用户）
 *  2. 日调用量
 *  3. MRR（月流水）
 *  4. 毛利率
 *  5. 7日留存率
 *  6. 30日留存率
 *  7. 代理活跃度
 *  8. Key 使用率
 *  9. 供应商健康度
 * 10. 告警收敛率
 * 11. 自助结算率
 * 12. ARPU（客单价）
 */

import { useEffect, useState } from 'react'
import { Loader2, AlertCircle, TrendingUp, TrendingDown, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react'
import { get } from '@/lib/api'
import type { OperationalKpiData, UserTierData, KpiTrendItem } from '@/types'

/* ── Warning threshold icons ── */

function thresholdIcon(label: string, ok: boolean) {
  if (ok) return <span className="text-emerald-500 text-xs font-semibold mr-1">●</span>
  return <span className="text-red-500 text-xs font-semibold mr-1 animate-pulse">●</span>
}

const KpiNameMap: Record<string, string> = {
  dau: 'DAU',
  daily_calls: '调用量',
  mrr: 'MRR',
  gross_margin: '毛利率',
  retention_7d: '7日留存',
  retention_30d: '30日留存',
  agent_active: '代理活跃',
  key_usage: 'Key 使用率',
  arpu: 'ARPU',
}

function fmtKpiValue(key: string, val: string | number): string {
  if (val === 'N/A' || val == null) return 'N/A'
  if (key === 'mrr' || key === 'arpu') return `¥${Number(val).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`
  if (key === 'dau' || key === 'daily_calls') return Number(val).toLocaleString()
  if (key === 'gross_margin' || key === 'agent_active' || key === 'key_usage') return `${Number(val).toFixed(1)}%`
  if (typeof val === 'string' && val.endsWith('%')) return val
  if (typeof val === 'number' && key !== 'daily_calls' && key !== 'dau') return val.toFixed(2)
  return String(val)
}

function fmtChange(val: number): { text: string; up: boolean } {
  if (val === 0) return { text: '0%', up: true }
  const up = val > 0
  return { text: `${up ? '+' : ''}${val.toFixed(1)}%`, up }
}

/* ── KPI Metric Card ── */

function KpiMetricCard({
  label, value, change, alert, children,
}: {
  label: string
  value: string
  change?: { text: string; up: boolean }
  alert?: boolean
  children?: React.ReactNode
}) {
  return (
    <div className={`bg-white rounded-xl shadow-sm border p-4 ${alert ? 'border-red-300 ring-1 ring-red-200' : 'border-slate-200'}`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-slate-500 font-medium">
          {alert !== undefined && thresholdIcon(label, !alert)}
          {label}
        </span>
        {change && (
          <span className={`flex items-center gap-0.5 text-xs font-medium ${change.up ? 'text-emerald-600' : 'text-red-500'}`}>
            {change.up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {change.text}
          </span>
        )}
      </div>
      <div className="text-xl font-bold text-slate-900">{value}</div>
      {children}
    </div>
  )
}

/* ── Main Panel ── */

export default function OperationalKpiPanel() {
  const [kpi, setKpi] = useState<OperationalKpiData | null>(null)
  const [tiers, setTiers] = useState<UserTierData | null>(null)
  const [trends, setTrends] = useState<KpiTrendItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState(true)

  const fetchData = async () => {
    setLoading(true)
    setError('')
    try {
      const [kpiRes, tierRes, trendRes] = await Promise.all([
        get<OperationalKpiData>('/api/v1/admin/operational/kpi'),
        get<UserTierData>('/api/v1/admin/operational/user-tiers'),
        get<{ series: KpiTrendItem[] }>('/api/v1/admin/operational/trends'),
      ])
      setKpi(kpiRes)
      setTiers(tierRes)
      setTrends(trendRes?.series ?? [])
    } catch (err: any) {
      setError(err.message || '获取运营 KPI 数据失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [])

  if (!kpi && loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div className="flex items-center gap-2 text-slate-400 text-sm">
          <Loader2 size={16} className="animate-spin" />加载运营 KPI…
        </div>
      </div>
    )
  }

  if (!kpi && error) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-red-200 p-6">
        <div className="flex items-center gap-2 text-red-600 text-sm">
          <AlertCircle size={16} />{error}
          <button onClick={fetchData} className="ml-2 px-2 py-1 text-xs bg-red-50 text-red-600 rounded hover:bg-red-100">重试</button>
        </div>
      </div>
    )
  }

  const s = kpi!
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <button onClick={() => setExpanded(!expanded)} className="flex items-center gap-2 text-sm font-semibold text-slate-800 hover:text-slate-600">
          <span>运营 KPI 看板</span>
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-slate-400">{s.updatedAt ? `更新 ${new Date(s.updatedAt).toLocaleTimeString('zh-CN')}` : ''}</span>
          <button onClick={fetchData} disabled={loading} className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="p-5 space-y-6">
          {/* ── KPI 4x3 Grid ── */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
            {/* 1. DAU */}
            <KpiMetricCard
              label="DAU（日活跃）"
              value={fmtKpiValue('dau', s.dau)}
              change={fmtChange(s.dauChange)}
              alert={s.dauAlert}
            />

            {/* 2. 日调用量 */}
            <KpiMetricCard
              label="日调用量"
              value={fmtKpiValue('daily_calls', s.dailyCalls)}
              change={fmtChange(s.callChange)}
              alert={s.callGrowthAlert}
            />

            {/* 3. MRR */}
            <KpiMetricCard
              label="MRR（月流水）"
              value={fmtKpiValue('mrr', s.mrr)}
              change={fmtChange(s.mrrChange)}
              alert={s.mrrAlert}
            />

            {/* 4. 毛利率 */}
            <KpiMetricCard
              label="毛利率"
              value={fmtKpiValue('gross_margin', s.grossMargin)}
              alert={s.marginAlert}
            />

            {/* 5. 7日留存 */}
            <KpiMetricCard
              label="7日留存率"
              value={s.retentionRate7 === 'N/A' ? 'N/A' : `${s.retentionRate7}%`}
              alert={s.retentionRate7 !== 'N/A' && parseFloat(s.retentionRate7) < 20}
            />

            {/* 6. 30日留存 */}
            <KpiMetricCard
              label="30日留存率"
              value={s.retentionRate30 === 'N/A' ? 'N/A' : `${s.retentionRate30}%`}
              alert={s.retentionRate30 !== 'N/A' && parseFloat(s.retentionRate30) < 10}
            />

            {/* 7. 代理活跃度 */}
            <KpiMetricCard
              label="代理活跃度"
              value={`${s.agentActiveRate}%`}
              alert={s.agentActiveRate < 50}
            />

            {/* 8. Key 使用率 */}
            <KpiMetricCard
              label="Key 使用率"
              value={`${s.keyUsageRate}%`}
              alert={s.keyUsageRate < 40}
            />

            {/* 9. ARPU */}
            <KpiMetricCard
              label="ARPU（客单价）"
              value={fmtKpiValue('arpu', s.arpu)}
            />

            {/* 10. 自助结算率 */}
            <KpiMetricCard
              label="自助结算率"
              value={s.selfSettleRate}
              alert={s.selfSettleRate !== 'N/A' && parseFloat(s.selfSettleRate) < 70}
            />

            {/* 11. 告警收敛率 */}
            <KpiMetricCard
              label="告警收敛率"
              value={s.convergenceRate}
              alert={s.convergenceRate !== 'N/A' && parseFloat(s.convergenceRate) < 60}
            />

            {/* 12. 总用户 */}
            <KpiMetricCard
              label="总用户"
              value={s.totalUsers.toLocaleString()}
            />
          </div>

          {/* ── 供应商健康度 ── */}
          {s.vendorHealth && s.vendorHealth.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">供应商健康度（24h）</h4>
              <div className="flex flex-wrap gap-2">
                {s.vendorHealth.map(v => (
                  <div key={v.vendorName} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium ${
                    v.status === 'healthy' ? 'bg-emerald-50 text-emerald-700' :
                    v.status === 'warning' ? 'bg-amber-50 text-amber-700' :
                    'bg-red-50 text-red-700'
                  }`}>
                    <span className={`w-2 h-2 rounded-full ${
                      v.status === 'healthy' ? 'bg-emerald-500' :
                      v.status === 'warning' ? 'bg-amber-500' : 'bg-red-500'
                    }`} />
                    {v.vendorName}
                    <span className="font-mono">{v.availability.toFixed(2)}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── 近 7 天趋势 MiniTable ── */}
          {trends.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">近 7 天趋势</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="text-left py-2 px-2 text-slate-400 font-medium">日期</th>
                      <th className="text-right py-2 px-2 text-slate-400 font-medium">调用量</th>
                      <th className="text-right py-2 px-2 text-slate-400 font-medium">DAU</th>
                      <th className="text-right py-2 px-2 text-slate-400 font-medium">Token</th>
                      <th className="text-right py-2 px-2 text-slate-400 font-medium">费用</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trends.slice(0, 7).map(t => (
                      <tr key={t.date} className="border-b border-slate-50 hover:bg-slate-50/50">
                        <td className="py-2 px-2 text-slate-700">{t.date}</td>
                        <td className="py-2 px-2 text-right text-slate-600 font-mono">{t.calls.toLocaleString()}</td>
                        <td className="py-2 px-2 text-right text-slate-600 font-mono">{t.dau}</td>
                        <td className="py-2 px-2 text-right text-slate-600 font-mono">{t.tokens >= 1e6 ? `${(t.tokens / 1e6).toFixed(1)}M` : t.tokens.toLocaleString()}</td>
                        <td className="py-2 px-2 text-right text-slate-600 font-mono">¥{t.cost.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── 用户分层 ── */}
          {tiers && tiers.tiers.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">用户分层（近 30 天消费）</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="text-left py-2 px-2 text-slate-400 font-medium">层级</th>
                      <th className="text-left py-2 px-2 text-slate-400 font-medium">定义</th>
                      <th className="text-right py-2 px-2 text-slate-400 font-medium">人数</th>
                      <th className="text-right py-2 px-2 text-slate-400 font-medium">占比</th>
                      <th className="text-right py-2 px-2 text-slate-400 font-medium">总消费</th>
                      <th className="text-right py-2 px-2 text-slate-400 font-medium">人均</th>
                      <th className="text-left py-2 px-2 text-slate-400 font-medium">策略</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tiers.tiers.map(t => {
                      const colorClass =
                        t.key === 'seed' ? 'text-purple-600' :
                        t.key === 'active' ? 'text-blue-600' :
                        t.key === 'normal' ? 'text-slate-700' :
                        t.key === 'dormant' ? 'text-amber-600' :
                        'text-slate-400'
                      return (
                        <tr key={t.key} className="border-b border-slate-50 hover:bg-slate-50/50">
                          <td className={`py-2 px-2 font-semibold ${colorClass}`}>{t.name}</td>
                          <td className="py-2 px-2 text-slate-500">{t.definition}</td>
                          <td className="py-2 px-2 text-right font-mono text-slate-700">{t.count.toLocaleString()}</td>
                          <td className="py-2 px-2 text-right text-slate-600">{t.percentage}%</td>
                          <td className="py-2 px-2 text-right font-mono text-slate-700">¥{t.totalSpend.toFixed(2)}</td>
                          <td className="py-2 px-2 text-right font-mono text-slate-600">¥{t.avgSpend.toFixed(2)}</td>
                          <td className="py-2 px-2 text-slate-400 text-[11px] max-w-[200px] truncate" title={t.strategy}>{t.strategy}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
