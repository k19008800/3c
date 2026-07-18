import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { Calendar, Download, RefreshCw } from 'lucide-react'
import { get, downloadUrl } from '@/lib/api'
import { generateMonthOptions } from './types'
import type { SettlementData } from './types'
import ReconStatsCards from './ReconStatsCards'

// ── 月度对账详情 ─-
//
// 展示指定月份的期初/期末余额、本月扣费/冻结/解冻/退款变动，
// 支持按日期范围导出 CSV 对账单。

function ReconDetail() {
  const [period, setPeriod] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const [data, setData] = useState<SettlementData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  const monthOptions = useMemo(() => generateMonthOptions(), [])

  const fetchSettlement = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await get<any>(`/api/v1/agent/finance/settlement?period=${period}`)
      if (res?.account && res?.monthSummary) {
        const settled = parseFloat(res.account.settledCommission ?? '0')
        const available = parseFloat(res.account.available ?? '0')
        setData({
          period,
          openingBalance: settled,
          monthDeduction: Math.abs(res.monthSummary.deduction ?? 0),
          monthFreeze: Math.abs(res.monthSummary.freeze ?? 0),
          monthUnfreeze: Math.abs(res.monthSummary.unfreeze ?? 0),
          monthRefund: 0,
          closingBalance: available,
        })
      } else {
        setData(null)
      }
    } catch (e: any) {
      setError(e.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }, [period])

  useEffect(() => { fetchSettlement() }, [fetchSettlement])

  const handleExportCSV = useCallback(() => {
    const params = new URLSearchParams()
    params.set('period', period)
    if (startDate) params.set('startDate', startDate)
    if (endDate) params.set('endDate', endDate)
    const filename = `对账报表_${period}${startDate ? '_' + startDate : ''}${endDate ? '_' + endDate : ''}.csv`
    downloadUrl(`/api/v1/agent/finance/settlement/export?${params.toString()}`, filename).catch(() => {
      const token = localStorage.getItem('accessToken')
      window.open(`/api/v1/agent/finance/settlement/export?${params.toString()}&token=${encodeURIComponent(token || '')}`, '_blank')
    })
  }, [period, startDate, endDate])

  return (
    <div className="space-y-6">
      {/* Month selector + Date range + Export */}
      <div className="flex flex-wrap items-center gap-3">
        <Calendar size={16} className="text-slate-500" />
        <select
          value={period}
          onChange={e => setPeriod(e.target.value)}
          className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
        >
          {monthOptions.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <div className="h-6 w-px bg-slate-200" />
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">起始</span>
          <input
            type="date"
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
            className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500 text-xs w-36"
          />
          <span className="text-xs text-slate-500">结束</span>
          <input
            type="date"
            value={endDate}
            onChange={e => setEndDate(e.target.value)}
            className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500 text-xs w-36"
          />
        </div>
        <div className="flex-1" />
        <button
          onClick={handleExportCSV}
          className="flex items-center gap-1 px-3 py-2 text-sm text-green-700 border border-green-300 rounded-lg hover:bg-green-50 transition"
        >
          <Download size={14} /> 导出 CSV
        </button>
        <button
          onClick={fetchSettlement}
          disabled={loading}
          className="flex items-center gap-1 px-3 py-2 text-sm text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          刷新
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <ReconStatsCards data={null} loading={true} />
      ) : data ? (
        <ReconStatsCards data={data} loading={false} />
      ) : (
        <div className="text-center py-12 text-slate-400">
          暂无对账数据
        </div>
      )}
    </div>
  )
}

export default memo(ReconDetail)
