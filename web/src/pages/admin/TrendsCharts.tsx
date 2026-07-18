import { useEffect, useState, useCallback } from 'react'
import { get } from '@/lib/api'
import { Loader2, AlertTriangle } from 'lucide-react'

import type { TrendsData, DaySeries, HourlyData, HourEntry } from './trends/types'
import { calcStdDev, fmtNum, dayOfWeek, fmtMoney } from './trends/types'
import TrendsCards from './trends/TrendsCards'
import TimeSeriesChart, { HourlyDrilldown, HourlyLoading } from './trends/TimeSeriesChart'
import ComparisonChart from './trends/ComparisonChart'
import ExportControls from './trends/ExportControls'

/* ═══════════════════════════════════════════════════
   Main Entry — TrendsCharts
   ═══════════════════════════════════════════════════ */

export default function TrendsCharts() {
  const [data, setData] = useState<TrendsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [days, setDays] = useState(7)

  // Hourly drilldown state
  const [drilldownDate, setDrilldownDate] = useState<string | null>(null)
  const [hourlyData, setHourlyData] = useState<HourlyData | null>(null)
  const [hourlyLoading, setHourlyLoading] = useState(false)

  const fetchTrends = useCallback(async (d: number) => {
    setLoading(true)
    setError('')
    try {
      const res = await get<TrendsData>(`/api/v1/admin/dashboard/trends?days=${d}`)
      setData(res)
    } catch (err: any) {
      setError(err.message || '获取趋势数据失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchTrends(days)
  }, [fetchTrends, days])

  // Reset drilldown when days change
  useEffect(() => {
    setDrilldownDate(null)
    setHourlyData(null)
  }, [days])

  const handleBarClick = useCallback(
    async (index: number, label: string) => {
      if (drilldownDate === label) {
        setDrilldownDate(null)
        setHourlyData(null)
        return
      }
      setDrilldownDate(label)
      setHourlyLoading(true)
      try {
        const res = await get<HourlyData>(`/api/v1/admin/dashboard/trends/hourly?date=${label}`)
        setHourlyData(res)
      } catch {
        setHourlyData(null)
      } finally {
        setHourlyLoading(false)
      }
    },
    [drilldownDate],
  )

  /* ── Loading / Error ── */
  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="animate-spin text-slate-400" size={24} />
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm">
        <AlertTriangle size={16} />
        {error}
        <button
          onClick={() => fetchTrends(days)}
          className="ml-2 px-3 py-1 bg-red-600 text-white rounded-lg text-xs hover:bg-red-700"
        >
          重试
        </button>
      </div>
    )
  }

  const { series } = data!

  /* ── Chart data ── */
  const callChartData = series.map((s) => ({ label: s.date, value: s.calls.total }))
  const revenueChartData = series.map((s) => ({ label: s.date, value: parseFloat(s.revenue.total) }))
  const userChartData = series.map((s) => ({ label: s.date, value: s.newUsers }))

  /* ── Peak analysis ── */
  const callValues = callChartData.map((d) => d.value)
  const callMax = Math.max(...callValues)

  return (
    <div className="space-y-4">
      <ExportControls
        days={days}
        onDaysChange={setDays}
        onRefresh={() => fetchTrends(days)}
        loading={loading}
      />

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm">
          <AlertTriangle size={16} />
          {error}
        </div>
      )}

      <TrendsCards series={series} />

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <TimeSeriesChart
          data={callChartData}
          title="调用量趋势"
          unit="次"
          barGradientFrom="#8b5cf6"
          barGradientTo="#a78bfa"
          peakColor="#ef4444"
          formatValue={(v) => fmtNum(v)}
          onBarClick={handleBarClick}
        />
        <TimeSeriesChart
          data={revenueChartData}
          title="收入趋势"
          unit="元"
          barGradientFrom="#10b981"
          barGradientTo="#6ee7b7"
          peakColor="#ef4444"
          formatValue={(v) => `¥${fmtMoney(v)}`}
        />
        <TimeSeriesChart
          data={userChartData}
          title="新增用户趋势"
          unit="人"
          barGradientFrom="#f59e0b"
          barGradientTo="#fbbf24"
          peakColor="#ef4444"
          formatValue={(v) => v.toLocaleString()}
        />
      </div>

      <ComparisonChart series={series} />

      {/* Hourly Drilldown */}
      {drilldownDate &&
        (hourlyLoading ? (
          <HourlyLoading />
        ) : hourlyData ? (
          <HourlyDrilldown
            date={drilldownDate}
            data={hourlyData}
            onClose={() => {
              setDrilldownDate(null)
              setHourlyData(null)
            }}
          />
        ) : null)}

      {/* Detail Table */}
      {series.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700">每日明细</h3>
            <span className="text-[10px] text-slate-400">
              提示: 点击上方柱状图查看时段分布
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 text-left text-slate-500">
                  <th className="px-4 py-2.5 font-medium">日期</th>
                  <th className="px-4 py-2.5 font-medium text-right">调用</th>
                  <th className="px-4 py-2.5 font-medium text-right">成功率</th>
                  <th className="px-4 py-2.5 font-medium text-right">Token</th>
                  <th className="px-4 py-2.5 font-medium text-right">消费</th>
                  <th className="px-4 py-2.5 font-medium text-right">收入</th>
                  <th className="px-4 py-2.5 font-medium text-right">新增</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {series.map((s) => (
                  <tr
                    key={s.date}
                    className={`hover:bg-slate-50 transition ${
                      s.calls.total === callMax ? 'bg-red-50 font-medium' : ''
                    } ${drilldownDate === s.date ? 'bg-indigo-50' : ''}`}
                  >
                    <td className="px-4 py-2.5 text-slate-700 font-mono">
                      {s.date}
                      {dayOfWeek(s.date) !== '周日' && dayOfWeek(s.date) !== '周六' ? (
                        <span className="ml-1 text-[10px] text-slate-400">
                          {dayOfWeek(s.date)}
                        </span>
                      ) : (
                        <span className="ml-1 text-[10px] text-red-400">
                          {dayOfWeek(s.date)}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right text-slate-800 font-medium">
                      {s.calls.total.toLocaleString()}
                      {s.calls.total === callMax && <span className="ml-1">🏆</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <span
                        className={`font-medium ${
                          s.calls.successRate >= 99
                            ? 'text-green-600'
                            : s.calls.successRate >= 95
                              ? 'text-yellow-600'
                              : 'text-red-600'
                        }`}
                      >
                        {s.calls.successRate}%
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right text-slate-700">
                      {fmtNum(s.calls.totalTokens)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-slate-700">
                      ¥{fmtMoney(s.calls.totalCost)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-emerald-700 font-medium">
                      ¥{fmtMoney(s.revenue.total)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-slate-700">
                      {s.newUsers}
                    </td>
                  </tr>
                ))}
                {/* Sum row */}
                <tr className="bg-slate-50 font-semibold text-slate-800">
                  <td className="px-4 py-2.5">合计</td>
                  <td className="px-4 py-2.5 text-right">
                    {series.reduce((a, s) => a + s.calls.total, 0).toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {(() => {
                      const t = series.reduce((a, s) => a + s.calls.total, 0)
                      const su = series.reduce((a, s) => a + s.calls.success, 0)
                      return t > 0 ? ((su / t) * 100).toFixed(1) + '%' : '-'
                    })()}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {fmtNum(series.reduce((a, s) => a + s.calls.totalTokens, 0))}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    ¥
                    {fmtMoney(
                      series.reduce((a, s) => a + parseFloat(s.calls.totalCost), 0),
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right text-emerald-600">
                    ¥
                    {fmtMoney(
                      series.reduce((a, s) => a + parseFloat(s.revenue.total), 0),
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {series.reduce((a, s) => a + s.newUsers, 0)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
