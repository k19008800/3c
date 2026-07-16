import { useState, useEffect, useMemo } from 'react'
import { get } from '@/lib/api'
import type {
  ReconciliationReport,
  ReconTrendPoint,
  ReconBalanceCheck,
} from '@/types'
import {
  Loader2, AlertCircle, FileText, DollarSign, Receipt, Percent, TrendingUp,
  Download, ChevronDown, ChevronRight, AlertTriangle, CheckCircle2,
  BarChart3, ArrowUpDown,
} from 'lucide-react'
import FeatureDescription from '@/components/admin/FeatureDescription'

// ── 格式化工具 ──

function fmt(v: string | number | null | undefined, digits = 2): string {
  const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : 0
  return n < 0 ? `-¥${Math.abs(n).toFixed(digits)}` : `¥${n.toFixed(digits)}`
}

function fmtCompact(v: string | number | null | undefined): string {
  const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : 0
  if (n >= 10000) return `¥${(n / 10000).toFixed(2)}万`
  return fmt(v)
}

function fmtDate(d: string): string {
  if (d.includes('~')) return d
  return d
}

// ── 迷你 SVG 趋势图 ──

function MiniTrendChart({ data, dataKey, color, height = 80 }: {
  data: ReconTrendPoint[]
  dataKey: keyof ReconTrendPoint
  color: string
  height?: number
}) {
  if (data.length < 2) return null

  const values = data.map(d => {
    const v = typeof d[dataKey] === 'string' ? parseFloat(d[dataKey] as string) : (d[dataKey] as number)
    return v
  })
  const max = Math.max(...values, 0.001)
  const min = Math.min(...values)
  const range = max - min || 1
  const width = 600
  const padding = { top: 10, bottom: 20, left: 0, right: 0 }
  const chartW = width - padding.left - padding.right
  const chartH = height - padding.top - padding.bottom
  const stepX = chartW / (data.length - 1)

  const points = values.map((v, i) => {
    const x = padding.left + i * stepX
    const y = padding.top + chartH - ((v - min) / range) * chartH
    return `${x},${y}`
  }).join(' ')

  // Y axis labels
  const yLabels = [
    { v: min, label: fmtCompact(String(min)) },
    { v: max, label: fmtCompact(String(max)) },
  ]

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      {/* Grid lines */}
      <line x1={padding.left} y1={padding.top} x2={width} y2={padding.top}
        stroke="#e2e8f0" strokeWidth="1" />
      <line x1={padding.left} y1={padding.top + chartH / 2} x2={width} y2={padding.top + chartH / 2}
        stroke="#e2e8f0" strokeWidth="1" strokeDasharray="4,4" />
      <line x1={padding.left} y1={padding.top + chartH} x2={width} y2={padding.top + chartH}
        stroke="#e2e8f0" strokeWidth="1" />
      {/* Y axis labels */}
      {yLabels.map((l, i) => (
        <text key={i} x={width - 4} y={i === 0 ? padding.top + 4 : padding.top + chartH}
          textAnchor="end" fill="#94a3b8" fontSize="10" fontFamily="monospace">
          {l.label}
        </text>
      ))}
      {/* Line */}
      <polyline points={points} fill="none" stroke={color} strokeWidth="2"
        strokeLinejoin="round" strokeLinecap="round" />
      {/* Dots */}
      {values.map((v, i) => (
        <circle key={i}
          cx={padding.left + i * stepX}
          cy={padding.top + chartH - ((v - min) / range) * chartH}
          r="2.5" fill={color} stroke="white" strokeWidth="1" />
      ))}
    </svg>
  )
}

// ── 异常记录徽章 ──

const severityBadge: Record<string, string> = {
  high: 'bg-red-100 text-red-700',
  medium: 'bg-yellow-100 text-yellow-700',
  low: 'bg-blue-100 text-blue-700',
}

const typeLabels: Record<string, string> = {
  orphan_commission: '孤立佣金',
  amount_anomaly: '金额异常',
  frequent_withdraw: '高频提现',
  unmatched_recharge: '充值未入账',
}

// ── 主组件 ──

export default function AdminFinanceReconciliation() {
  const today = new Date().toISOString().slice(0, 10)

  // 状态
  const [startDate, setStartDate] = useState(today)
  const [endDate, setEndDate] = useState(today)
  const [granularity, setGranularity] = useState<'day' | 'week' | 'month'>('day')
  const [report, setReport] = useState<ReconciliationReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // 交互状态
  const [showAgentDetail, setShowAgentDetail] = useState(false)
  const [showAnomalyDetail, setShowAnomalyDetail] = useState(false)
  const [sortTrendBy, setSortTrendBy] = useState<string>('date')
  const [trendFilter, setTrendFilter] = useState<string>('all')

  // ── 获取报表 ──

  const fetchReport = async () => {
    if (!startDate || !endDate) return
    setLoading(true)
    setError('')
    try {
      const params: Record<string, string> = { startDate, endDate, granularity }
      const res = await get<ReconciliationReport>('/api/v1/admin/finance/reconciliation', params)
      setReport(res)
    } catch (err: any) {
      setError(err.message || '获取对账数据失败')
    } finally {
      setLoading(false)
    }
  }

  // 首次加载
  useEffect(() => { fetchReport() }, [])

  // ── CSV 导出 ──

  const handleExportCsv = () => {
    const baseUrl = import.meta.env.VITE_API_BASE_URL || ''
    const params = new URLSearchParams({ startDate, endDate, granularity })
    window.open(`${baseUrl}/api/v1/admin/finance/reconciliation/export?${params}`, '_blank')
  }

  // ── 趋势数据排序 ──

  const sortedTrends = useMemo(() => {
    if (!report?.trends) return []
    const data = [...report.trends]

    // 筛选
    let filtered = data
    if (trendFilter !== 'all') {
      filtered = data.filter(d => {
        const comm = parseFloat(d.commissionAmount)
        const wdraw = parseFloat(d.withdrawAmount)
        const rech = parseFloat(d.rechargeAmount)
        if (trendFilter === 'commission') return comm > 0
        if (trendFilter === 'withdraw') return wdraw > 0
        if (trendFilter === 'recharge') return rech > 0
        return true
      })
    }

    // 排序
    filtered.sort((a, b) => {
      if (sortTrendBy === 'date') return a.date.localeCompare(b.date)
      const aVal = parseFloat(a[sortTrendBy as keyof ReconTrendPoint] as string || '0')
      const bVal = parseFloat(b[sortTrendBy as keyof ReconTrendPoint] as string || '0')
      return bVal - aVal
    })

    return filtered
  }, [report?.trends, sortTrendBy, trendFilter])

  // ── 渲染 ──

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">对账报表</h1>
        <FeatureDescription page="admin/finance/reconciliation" className="ml-2" />
        {report && (
          <button onClick={handleExportCsv}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition">
            <Download size={14} /> CSV 导出
          </button>
        )}
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {/* 查询条件 */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-xs text-slate-500 mb-1">起始日期</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">结束日期</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">粒度</label>
            <select value={granularity} onChange={(e) => setGranularity(e.target.value as any)}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="day">日</option>
              <option value="week">周</option>
              <option value="month">月</option>
            </select>
          </div>
          <button onClick={fetchReport} disabled={loading}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 transition">
            {loading ? <Loader2 className="animate-spin" size={16} /> : <FileText size={16} />}
            生成报表
          </button>
        </div>
      </div>

      {report && (
        <>
          {/* 资金平衡校验告警 */}
          {!report.balanceCheck.isBalanced && (
            <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl">
              <AlertTriangle size={20} className="text-red-500 mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold text-red-700 text-sm">资金不平衡！</p>
                <p className="text-red-600 text-xs mt-1">
                  收入({fmt(report.balanceCheck.totalIncome)}) — 支出(消耗{fmt(report.balanceCheck.totalExpense)} + 佣金{fmt(report.balanceCheck.totalCommission)} + 提现{fmt(report.balanceCheck.totalWithdraw)})
                  = 差额 {fmt(report.balanceCheck.diff)}
                </p>
                <p className="text-red-500 text-xs mt-0.5">建议立即核查该时段的充值、扣费记录</p>
              </div>
            </div>
          )}

          {/* 平衡正常时的小结 */}
          {report.balanceCheck.isBalanced && (
            <div className="flex items-start gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
              <CheckCircle2 size={20} className="text-emerald-500 mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold text-emerald-700 text-sm">资金平衡 ✓</p>
                <p className="text-emerald-600 text-xs mt-1">
                  平台利润 {fmt(report.balanceCheck.platformProfit)}
                  {parseFloat(report.balanceCheck.diff) !== 0 && `（容差内差值 ${fmt(report.balanceCheck.diff)}）`}
                </p>
              </div>
            </div>
          )}

          {/* 汇总卡片 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-slate-500 mb-1">佣金笔数</p>
                  <p className="text-2xl font-bold text-blue-600">{report.summary.commission.count}</p>
                  <p className="text-sm text-slate-500 mt-1">{fmt(report.summary.commission.totalCommission)}</p>
                </div>
                <div className="p-2.5 rounded-lg bg-blue-50 text-blue-600"><Percent size={20} /></div>
              </div>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-slate-500 mb-1">提现笔数</p>
                  <p className="text-2xl font-bold text-orange-600">{report.summary.withdraw.count}</p>
                  <p className="text-sm text-slate-500 mt-1">{fmt(report.summary.withdraw.totalAmount)}</p>
                </div>
                <div className="p-2.5 rounded-lg bg-orange-50 text-orange-600"><DollarSign size={20} /></div>
              </div>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-slate-500 mb-1">充值确认</p>
                  <p className="text-2xl font-bold text-emerald-600">{report.summary.recharge.count}</p>
                  <p className="text-sm text-slate-500 mt-1">{fmt(report.summary.recharge.totalAmount)}</p>
                </div>
                <div className="p-2.5 rounded-lg bg-emerald-50 text-emerald-600"><TrendingUp size={20} /></div>
              </div>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-slate-500 mb-1">提现手续费</p>
                  <p className="text-2xl font-bold text-violet-600">{fmt(report.summary.withdraw.totalFee)}</p>
                  <p className="text-sm text-slate-500 mt-1">{fmt(report.summary.withdraw.totalActual)}（实际到账）</p>
                </div>
                <div className="p-2.5 rounded-lg bg-violet-50 text-violet-600"><Receipt size={20} /></div>
              </div>
            </div>
          </div>

          {/* 数据详情表 */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h2 className="text-base font-semibold text-slate-800">数据详情 — {fmtDate(report.date)}</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50 text-left">
                    <th className="px-5 py-3 text-sm font-medium text-slate-500">分类</th>
                    <th className="px-5 py-3 text-sm font-medium text-slate-500">笔数</th>
                    <th className="px-5 py-3 text-sm font-medium text-slate-500">总金额</th>
                    <th className="px-5 py-3 text-sm font-medium text-slate-500">手续费</th>
                    <th className="px-5 py-3 text-sm font-medium text-slate-500">净额</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  <tr className="hover:bg-slate-50 transition">
                    <td className="px-5 py-3 text-sm font-medium text-slate-800">佣金</td>
                    <td className="px-5 py-3 text-sm">{report.summary.commission.count}</td>
                    <td className="px-5 py-3 text-sm">{fmt(report.summary.commission.totalCommission)}</td>
                    <td className="px-5 py-3 text-sm">{fmt(report.summary.commission.totalFee)}</td>
                    <td className="px-5 py-3 text-sm font-medium text-green-600">{fmt(report.summary.commission.totalNet)}</td>
                  </tr>
                  <tr className="hover:bg-slate-50 transition">
                    <td className="px-5 py-3 text-sm font-medium text-slate-800">提现</td>
                    <td className="px-5 py-3 text-sm">{report.summary.withdraw.count}</td>
                    <td className="px-5 py-3 text-sm">{fmt(report.summary.withdraw.totalAmount)}</td>
                    <td className="px-5 py-3 text-sm">{fmt(report.summary.withdraw.totalFee)}</td>
                    <td className="px-5 py-3 text-sm font-medium text-green-600">{fmt(report.summary.withdraw.totalActual)}</td>
                  </tr>
                  <tr className="hover:bg-slate-50 transition">
                    <td className="px-5 py-3 text-sm font-medium text-slate-800">充值确认</td>
                    <td className="px-5 py-3 text-sm">{report.summary.recharge.count}</td>
                    <td className="px-5 py-3 text-sm">{fmt(report.summary.recharge.totalAmount)}</td>
                    <td className="px-5 py-3 text-sm">-</td>
                    <td className="px-5 py-3 text-sm font-medium text-green-600">{fmt(report.summary.recharge.totalAmount)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* 维度拆分 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 按状态 */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100">
                <h2 className="text-base font-semibold text-slate-800">按状态拆分</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-slate-50 text-left">
                      <th className="px-5 py-3 text-sm font-medium text-slate-500">状态</th>
                      <th className="px-5 py-3 text-sm font-medium text-slate-500">笔数</th>
                      <th className="px-5 py-3 text-sm font-medium text-slate-500">金额</th>
                      <th className="px-5 py-3 text-sm font-medium text-slate-500">手续费</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {Object.entries(report.dimensions.byStatus).length === 0 ? (
                      <tr><td colSpan={4} className="px-5 py-6 text-center text-sm text-slate-400">暂无数据</td></tr>
                    ) : (
                      Object.entries(report.dimensions.byStatus).map(([key, item]) => (
                        <tr key={key} className="hover:bg-slate-50 transition">
                          <td className="px-5 py-3 text-sm text-slate-800">{item.label}</td>
                          <td className="px-5 py-3 text-sm">{item.count}</td>
                          <td className="px-5 py-3 text-sm">{fmt(item.totalAmount)}</td>
                          <td className="px-5 py-3 text-sm">{item.feeAmount ? fmt(item.feeAmount) : '-'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 按佣金类型 */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100">
                <h2 className="text-base font-semibold text-slate-800">按佣金类型拆分</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-slate-50 text-left">
                      <th className="px-5 py-3 text-sm font-medium text-slate-500">类型</th>
                      <th className="px-5 py-3 text-sm font-medium text-slate-500">笔数</th>
                      <th className="px-5 py-3 text-sm font-medium text-slate-500">金额</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {report.dimensions.byCommissionType.length === 0 ? (
                      <tr><td colSpan={3} className="px-5 py-6 text-center text-sm text-slate-400">暂无数据</td></tr>
                    ) : (
                      report.dimensions.byCommissionType.map((item, i) => (
                        <tr key={i} className="hover:bg-slate-50 transition">
                          <td className="px-5 py-3 text-sm text-slate-800">{item.label}</td>
                          <td className="px-5 py-3 text-sm">{item.count}</td>
                          <td className="px-5 py-3 text-sm">{fmt(item.totalAmount)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* 按代理商（可折叠） */}
          {report.dimensions.byAgent.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <button onClick={() => setShowAgentDetail(!showAgentDetail)}
                className="w-full px-5 py-4 flex items-center justify-between hover:bg-slate-50 transition border-b border-slate-100">
                <h2 className="text-base font-semibold text-slate-800">按代理商拆分（Top {report.dimensions.byAgent.length}）</h2>
                {showAgentDetail ? <ChevronDown size={18} className="text-slate-400" /> : <ChevronRight size={18} className="text-slate-400" />}
              </button>
              {showAgentDetail && (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-slate-50 text-left">
                        <th className="px-5 py-3 text-sm font-medium text-slate-500">代理商</th>
                        <th className="px-5 py-3 text-sm font-medium text-slate-500">佣金笔数</th>
                        <th className="px-5 py-3 text-sm font-medium text-slate-500">佣金总额</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {report.dimensions.byAgent.map((item, i) => (
                        <tr key={i} className="hover:bg-slate-50 transition">
                          <td className="px-5 py-3 text-sm text-slate-800">{item.label}</td>
                          <td className="px-5 py-3 text-sm">{item.count}</td>
                          <td className="px-5 py-3 text-sm">{fmt(item.totalAmount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* 异常记录（可折叠） */}
          {report.anomalies.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-red-200 overflow-hidden">
              <button onClick={() => setShowAnomalyDetail(!showAnomalyDetail)}
                className="w-full px-5 py-4 flex items-center justify-between hover:bg-red-50 transition border-b border-red-100">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={18} className="text-red-500" />
                  <h2 className="text-base font-semibold text-slate-800">异常记录（{report.anomalies.length} 条）</h2>
                </div>
                {showAnomalyDetail ? <ChevronDown size={18} className="text-slate-400" /> : <ChevronRight size={18} className="text-slate-400" />}
              </button>
              {showAnomalyDetail && (
                <div className="divide-y divide-red-100">
                  {report.anomalies.map((item, i) => (
                    <div key={i} className="px-5 py-3 flex items-start gap-3">
                      <div className={`mt-0.5 px-2 py-0.5 rounded text-xs font-medium ${severityBadge[item.severity] || 'bg-slate-100 text-slate-600'}`}>
                        {item.severity === 'high' ? '严重' : item.severity === 'medium' ? '中等' : '轻微'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-700">
                          <span className="font-medium">{typeLabels[item.type] || item.type}</span>
                          {' — '}{item.description}
                        </p>
                        {item.amount && (
                          <p className="text-xs text-slate-500 mt-0.5">涉及金额: {fmt(item.amount)}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 趋势图表 */}
          {sortedTrends.length >= 2 && (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-base font-semibold text-slate-800">趋势曲线</h2>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-blue-500" /> 佣金</span>
                      <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-orange-500" /> 提现</span>
                      <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> 充值</span>
                    </div>
                    <select value={trendFilter} onChange={(e) => setTrendFilter(e.target.value)}
                      className="text-xs px-2 py-1 border border-slate-200 rounded bg-white">
                      <option value="all">全部</option>
                      <option value="commission">仅佣金</option>
                      <option value="withdraw">仅提现</option>
                      <option value="recharge">仅充值</option>
                    </select>
                    <button onClick={() => setSortTrendBy(sortTrendBy === 'date' ? 'commissionAmount' : 'date')}
                      className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700">
                      <ArrowUpDown size={12} /> {sortTrendBy === 'date' ? '按日期' : '按金额'}
                    </button>
                  </div>
                </div>
              </div>
              <div className="p-5">
                <div className="space-y-6">
                  {/* 佣金趋势 */}
                  <div>
                    <p className="text-xs font-medium text-blue-600 mb-1">佣金总额趋势</p>
                    <MiniTrendChart data={sortedTrends} dataKey="commissionAmount" color="#3b82f6" />
                  </div>
                  {/* 提现趋势 */}
                  <div>
                    <p className="text-xs font-medium text-orange-600 mb-1">提现总额趋势</p>
                    <MiniTrendChart data={sortedTrends} dataKey="withdrawAmount" color="#f97316" />
                  </div>
                  {/* 充值趋势 */}
                  <div>
                    <p className="text-xs font-medium text-emerald-600 mb-1">充值总额趋势</p>
                    <MiniTrendChart data={sortedTrends} dataKey="rechargeAmount" color="#10b981" />
                  </div>
                </div>
                {/* 趋势数据表 */}
                <div className="mt-4 overflow-x-auto max-h-[400px] overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-white">
                      <tr className="text-left text-slate-500 border-b border-slate-200">
                        <th className="py-2 pr-3 font-medium">日期</th>
                        <th className="py-2 pr-3 font-medium">佣金</th>
                        <th className="py-2 pr-3 font-medium">笔数</th>
                        <th className="py-2 pr-3 font-medium">提现</th>
                        <th className="py-2 pr-3 font-medium">笔数</th>
                        <th className="py-2 pr-3 font-medium">充值</th>
                        <th className="py-2 font-medium">笔数</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {sortedTrends.map((t, i) => (
                        <tr key={i} className="hover:bg-slate-50">
                          <td className="py-1.5 pr-3 text-slate-600 whitespace-nowrap">{t.date}</td>
                          <td className="py-1.5 pr-3 font-mono">{fmt(t.commissionAmount, 2)}</td>
                          <td className="py-1.5 pr-3 text-slate-500">{t.commissionCount}</td>
                          <td className="py-1.5 pr-3 font-mono">{fmt(t.withdrawAmount, 2)}</td>
                          <td className="py-1.5 pr-3 text-slate-500">{t.withdrawCount}</td>
                          <td className="py-1.5 pr-3 font-mono">{fmt(t.rechargeAmount, 2)}</td>
                          <td className="py-1.5 text-slate-500">{t.rechargeCount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* 空状态 */}
      {!report && !loading && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
          <BarChart3 size={48} className="mx-auto text-slate-300 mb-4" />
          <p className="text-slate-400 text-sm">选择日期范围并点击"生成报表"</p>
          <p className="text-slate-400 text-xs mt-1">支持日/周/月粒度，自动资金平衡校验和异常检测</p>
        </div>
      )}
    </div>
  )
}
