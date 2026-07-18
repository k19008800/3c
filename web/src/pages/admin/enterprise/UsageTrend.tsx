import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts'
import {
  Loader2, TrendingUp, PieChart as PieIcon, BarChart3, DollarSign,
  Activity, Download,
} from 'lucide-react'
import {
  type DaySeries, type ModelBreakdown,
  DIMENSIONS, DATE_RANGES, fmt, fmtCompact, fmtPercent, CHART_TOOLTIP_STYLE,
} from './types'
import { StatCard } from './AnalysisOverview'

/* ── Props ── */
interface UsageTrendProps {
  trends: DaySeries[] | null
  loadingTrend: boolean
  trendDimension: string
  daysRange: number
  selectedName: string
  chartData: { date: string; calls: number; tokens: number; cost: number; successRate: number; newUsers: number }[]
  summary: { totalCalls: number; totalTokens: number; totalCost: number; avgSuccessRate: number; avgDailyCost: number }
  momChange: string | null
  modelBreakdown: ModelBreakdown[]
  loadingModels: boolean
  onDimensionChange: (key: string) => void
  onDaysChange: (days: number) => void
  onExportCSV: () => void
}

function getChartLines(dimension: string) {
  switch (dimension) {
    case 'calls': return [{ key: 'calls', label: '调用量', color: '#0984e3', yAxisId: 'left' as const }]
    case 'tokens': return [{ key: 'tokens', label: 'Token(万)', color: '#6c5ce7', yAxisId: 'left' as const }]
    case 'cost': return [{ key: 'cost', label: '消费金额(¥)', color: '#00b894', yAxisId: 'left' as const }]
    case 'successRate': return [{ key: 'successRate', label: '成功率(%)', color: '#fdcb6e', yAxisId: 'left' as const }]
    default: return [{ key: 'calls', label: '调用量', color: '#0984e3', yAxisId: 'left' as const }]
  }
}

/* ════════════════════════════════════════
   UsageTrendSection — 趋势图 + 统计卡片
   ════════════════════════════════════════ */
export function UsageTrendSection({
  trends, trendDimension, daysRange, selectedName, chartData,
  summary, momChange, onDimensionChange, onDaysChange,
}: UsageTrendProps) {
  const lines = getChartLines(trendDimension)

  const dimensionButtons = (
    <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
      {DIMENSIONS.map(dim => (
        <button key={dim.key} onClick={() => onDimensionChange(dim.key)}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
            trendDimension === dim.key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}>
          {dim.label}
        </button>
      ))}
    </div>
  )

  const dateRangeButtons = (
    <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
      {DATE_RANGES.map(r => (
        <button key={r.value} onClick={() => onDaysChange(r.value)}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
            daysRange === r.value ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}>
          {r.label}
        </button>
      ))}
    </div>
  )

  return (
    <>
      {/* 趋势图 */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        <div className="px-5 py-4 border-b border-slate-100">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <TrendingUp size={16} className="text-slate-600" />
              <h3 className="text-sm font-semibold text-slate-800">
                {selectedName} 调用趋势
              </h3>
            </div>
            <div className="flex items-center gap-2">
              {dimensionButtons}
              {dateRangeButtons}
            </div>
          </div>
        </div>
        <div className="p-5">
          {!trends ? (
            <div className="h-[280px] flex flex-col items-center justify-center text-sm text-slate-400">
              <Loader2 className="animate-spin mb-2" size={24} />加载趋势数据...
            </div>
          ) : trends.length === 0 ? (
            <div className="h-[280px] flex items-center justify-center text-sm text-slate-400">暂无调用数据</div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#bbb" />
                  <YAxis yAxisId="left" tick={{ fontSize: 11 }} stroke="#bbb" />
                  <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                  <Legend />
                  {lines.map(l => (
                    <Line key={l.key} yAxisId={l.yAxisId} type="monotone" dataKey={l.key}
                      stroke={l.color} strokeWidth={2.5} dot={false} name={l.label} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
              <div className="flex items-center gap-3 text-xs text-slate-500 mt-2">
                {lines.map(l => (
                  <span key={l.key}>
                    <span className="inline-block w-3 h-0.5 align-middle mr-1" style={{ backgroundColor: l.color }} />
                    {l.label}
                  </span>
                ))}
                <span className="text-slate-300">|</span>
                <span className="text-slate-400">近 {daysRange} 天 · {trends.length} 天数据</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* 统计卡片 */}
      {trends && trends.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          <StatCard icon={<BarChart3 size={14} />} label={`${daysRange} 天总调用`}
            value={fmtCompact(summary.totalCalls)} color="text-blue-600" />
          <StatCard icon={<PieIcon size={14} />} label={`${daysRange} 天 Token`}
            value={`${(summary.totalTokens / 10000).toFixed(1)}万`} color="text-purple-600" />
          <StatCard icon={<DollarSign size={14} />} label={`${daysRange} 天总消费`}
            value={`¥${fmt(summary.totalCost)}`} color="text-emerald-600" />
          <StatCard icon={<Activity size={14} />} label="平均成功率"
            value={fmtPercent(summary.avgSuccessRate)} color="text-amber-600" />
          <StatCard icon={<TrendingUp size={14} />} label="日均消费"
            value={`¥${fmt(summary.avgDailyCost)}`} color="text-sky-600" />
          <StatCard
            icon={momChange && parseFloat(momChange) >= 0 ? <TrendingUp size={14} /> : <BarChart3 size={14} />}
            label="环比变化"
            value={momChange !== null ? `${parseFloat(momChange) >= 0 ? '+' : ''}${momChange}%` : '—'}
            sub="后半周期 vs 前半周期"
            color={momChange !== null && parseFloat(momChange) >= 0 ? 'text-emerald-600' : 'text-red-500'}
          />
        </div>
      )}
    </>
  )
}

/* ════════════════════════════════════════
   AnalysisTab
   ════════════════════════════════════════ */
export function AnalysisTab({
  trends, statusPieData, onExportCSV,
}: {
  trends: DaySeries[] | null
  statusPieData: { name: string; value: number; color: string }[]
  onExportCSV: () => void
}) {
  return (
    <div className="space-y-4">
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
                  <Pie data={statusPieData} cx="50%" cy="50%" innerRadius={55} outerRadius={90}
                    dataKey="value" label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}>
                    {statusPieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip formatter={(value: any) => Number(value).toLocaleString()} />
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
            {!trends ? (
              <Loader2 className="animate-spin text-slate-400" size={24} />
            ) : statusPieData.length === 0 ? (
              <span className="text-sm text-slate-400">暂无数据</span>
            ) : (
              <span className="text-sm text-slate-400">选择企业后查看模型详情</span>
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
              <button onClick={onExportCSV}
                className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 px-2 py-1 rounded hover:bg-slate-100">
                <Download size={12} /> 导出 CSV
              </button>
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
