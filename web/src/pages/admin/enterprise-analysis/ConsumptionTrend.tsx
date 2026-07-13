import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { Loader2, Download, PieChart as PieIcon, BarChart3 } from 'lucide-react'
import type { DaySeries, ModelBreakdown } from './types'
import { fmt, CHART_TOOLTIP_STYLE } from './types'

interface Props {
  trends: DaySeries[] | null
  modelBreakdown: ModelBreakdown[]
  loadingModels: boolean
  onExportCSV: () => void
}

export default function ConsumptionTrend({ trends, modelBreakdown, loadingModels, onExportCSV }: Props) {
  const topModels = modelBreakdown.slice(0, 10)

  const statusPieData = (trends && trends.length > 0)
    ? [
      { name: '成功', value: trends.reduce((s, d) => s + d.calls.success, 0), color: '#00b894' },
      { name: '失败', value: trends.reduce((s, d) => s + d.calls.failed, 0), color: '#e17055' },
      { name: '超时', value: trends.reduce((s, d) => s + d.calls.timeout, 0), color: '#fdcb6e' },
    ].filter(d => d.value > 0)
    : []

  return (
    <div className="space-y-4">
      {/* 状态分布饼图 + 调用量 Top 模型柱状图 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 调用状态分布 */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200">
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
              <PieIcon size={14} /> 调用状态分布
            </h3>
          </div>
          <div className="p-4 flex items-center justify-center h-[260px]">
            {!trends ? (
              <Loader2 className="animate-spin text-slate-400" size={24} />
            ) : statusPieData.length === 0 ? (
              <span className="text-sm text-slate-400">暂无数据</span>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={statusPieData} cx="50%" cy="50%" innerRadius={55} outerRadius={90} dataKey="value" label={(({ name, percent }: { name: string; percent: number }) => `${name} ${(percent * 100).toFixed(0)}%`) as any}>
                    {statusPieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip formatter={((v: number) => v.toLocaleString()) as any} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Top 10 模型调用量 */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200">
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
              <BarChart3 size={14} /> Top 10 模型调用量
            </h3>
          </div>
          <div className="p-4 flex items-center justify-center h-[260px]">
            {loadingModels ? (
              <Loader2 className="animate-spin text-slate-400" size={24} />
            ) : topModels.length === 0 ? (
              <span className="text-sm text-slate-400">暂无数据</span>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={topModels} layout="vertical" margin={{ left: 20, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} stroke="#bbb" />
                  <YAxis type="category" dataKey="displayName" tick={{ fontSize: 11 }} stroke="#bbb" width={140} />
                  <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={((v: number) => v.toLocaleString()) as any} />
                  <Bar dataKey="totalCalls" fill="#0984e3" radius={[0, 4, 4, 0]} name="调用量" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* 每日调用明细表 */}
      {trends && trends.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-800">每日调用明细</h3>
            <div className="flex items-center gap-2">
              <button onClick={onExportCSV} className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 px-2 py-1 rounded hover:bg-slate-100"><Download size={12} /> 导出 CSV</button>
              <span className="text-xs text-slate-400">{trends.length} 天</span>
            </div>
          </div>
          <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white">
                <tr className="border-b border-slate-100 text-xs text-slate-400">
                  <th className="text-left px-4 py-3 font-medium">日期</th>
                  <th className="text-right px-4 py-3 font-medium">调用量</th>
                  <th className="text-right px-4 py-3 font-medium">成功</th>
                  <th className="text-right px-4 py-3 font-medium">失败</th>
                  <th className="text-right px-4 py-3 font-medium">成功率</th>
                  <th className="text-right px-4 py-3 font-medium">Token</th>
                  <th className="text-right px-4 py-3 font-medium">费用</th>
                  <th className="text-right px-4 py-3 font-medium">平均耗时</th>
                </tr>
              </thead>
              <tbody>
                {[...trends].reverse().map(d => (
                  <tr key={d.date} className="border-b border-slate-50 hover:bg-slate-50 transition">
                    <td className="px-4 py-2.5 text-slate-600">{d.date}</td>
                    <td className="px-4 py-2.5 text-right font-medium text-slate-800">{d.calls.total}</td>
                    <td className="px-4 py-2.5 text-right text-emerald-600">{d.calls.success}</td>
                    <td className="px-4 py-2.5 text-right text-red-500">{d.calls.failed}</td>
                    <td className="px-4 py-2.5 text-right">{d.calls.successRate}%</td>
                    <td className="px-4 py-2.5 text-right text-slate-600">{(d.calls.totalTokens / 10000).toFixed(1)}万</td>
                    <td className="px-4 py-2.5 text-right text-slate-700">¥{fmt(d.calls.totalCost)}</td>
                    <td className="px-4 py-2.5 text-right text-slate-500">{d.calls.avgDuration}ms</td>
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
