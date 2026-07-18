import { useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts'
import { Loader2, PieChart as PieIcon, BarChart3, DollarSign } from 'lucide-react'
import { type ModelBreakdown, PIE_COLORS, fmt, CHART_TOOLTIP_STYLE } from './types'

/* ── Props ── */
interface ModelDistributionProps {
  modelBreakdown: ModelBreakdown[]
  loadingModels: boolean
}

/* ════════════════════════════════════════
   ModelsTab
   ════════════════════════════════════════ */
export default function ModelDistribution({ modelBreakdown, loadingModels }: ModelDistributionProps) {
  const typeGroups = useMemo(() => {
    return modelBreakdown.reduce<Record<string, { count: number; calls: number; tokens: number; cost: number }>>((acc, m) => {
      const t = m.type || 'other'
      if (!acc[t]) acc[t] = { count: 0, calls: 0, tokens: 0, cost: 0 }
      acc[t].count++
      acc[t].calls += m.totalCalls
      acc[t].tokens += m.totalTokens
      acc[t].cost += parseFloat(m.totalCost)
      return acc
    }, {})
  }, [modelBreakdown])

  const typePieData = useMemo(() =>
    Object.entries(typeGroups).map(([name, v]) => ({
      name: name === 'chat' ? '对话' : name === 'image' ? '图片' : name === 'audio' ? '音频' : name === 'embedding' ? '嵌入' : name,
      value: v.tokens,
      color: PIE_COLORS[Object.keys(typeGroups).indexOf(name) % PIE_COLORS.length],
    })),
  [typeGroups])

  const topTokenModels = useMemo(() =>
    [...modelBreakdown].sort((a, b) => b.totalTokens - a.totalTokens).slice(0, 8)
      .map(m => ({
        name: m.displayName || m.modelName || 'unknown',
        value: m.totalTokens,
        color: PIE_COLORS[modelBreakdown.indexOf(m) % PIE_COLORS.length],
      })),
  [modelBreakdown])

  const topCostModels = useMemo(() =>
    [...modelBreakdown].sort((a, b) => parseFloat(b.totalCost) - parseFloat(a.totalCost)).slice(0, 10),
  [modelBreakdown])

  const totalCalls = useMemo(() => modelBreakdown.reduce((s, m) => s + m.totalCalls, 0), [modelBreakdown])
  const totalTokens = useMemo(() => modelBreakdown.reduce((s, m) => s + m.totalTokens, 0), [modelBreakdown])
  const totalCost = useMemo(() => modelBreakdown.reduce((s, m) => s + parseFloat(m.totalCost), 0), [modelBreakdown])

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Token 饼图 */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200">
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
              <PieIcon size={14} /> Token 分布（Top 8）
            </h3>
          </div>
          <div className="p-4 flex items-center justify-center h-[280px]">
            {loadingModels ? (
              <Loader2 className="animate-spin text-slate-400" size={24} />
            ) : topTokenModels.length === 0 ? (
              <span className="text-sm text-slate-400">暂无数据</span>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={topTokenModels} cx="50%" cy="50%" innerRadius={50} outerRadius={95}
                    dataKey="value" label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`} paddingAngle={1}>
                    {topTokenModels.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip formatter={(v: any) => `${((v as number) / 10000).toFixed(1)}万`} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* 消费柱状图 */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200">
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
              <DollarSign size={14} /> 模型消费排行（Top 10）
            </h3>
          </div>
          <div className="p-4 flex items-center justify-center h-[280px]">
            {loadingModels ? (
              <Loader2 className="animate-spin text-slate-400" size={24} />
            ) : topCostModels.length === 0 ? (
              <span className="text-sm text-slate-400">暂无数据</span>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={topCostModels} layout="vertical" margin={{ left: 20, right: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} stroke="#bbb" tickFormatter={(v: number) => `¥${v}`} />
                  <YAxis type="category" dataKey="displayName" tick={{ fontSize: 11 }} stroke="#bbb" width={140} />
                  <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(value: any) => `¥${Number(value).toFixed(2)}`} />
                  <Bar dataKey="totalCost" fill="#00b894" radius={[0, 4, 4, 0]} name="消费" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* 模型类型分布 */}
      {typePieData.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200">
            <div className="px-5 py-4 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                <PieIcon size={14} /> 模型类型分布（按 Token）
              </h3>
            </div>
            <div className="p-4 flex items-center justify-center h-[240px]">
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={typePieData} cx="50%" cy="50%" outerRadius={80}
                    dataKey="value" label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}>
                    {typePieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip formatter={(v: any) => `${((v as number) / 10000).toFixed(1)}万`} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 模型使用概览 */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200">
            <div className="px-5 py-4 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                <BarChart3 size={14} /> 模型使用概览
              </h3>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-50 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-slate-800">{modelBreakdown.length}</div>
                  <div className="text-xs text-slate-400 mt-1">使用模型数</div>
                </div>
                <div className="bg-slate-50 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-slate-800">{totalCalls.toLocaleString()}</div>
                  <div className="text-xs text-slate-400 mt-1">总调用量</div>
                </div>
                <div className="bg-slate-50 rounded-lg p-3 text-center">
                  <div className="text-lg font-bold text-emerald-600">{(totalTokens / 10000).toFixed(1)}万</div>
                  <div className="text-xs text-slate-400 mt-1">总 Token</div>
                </div>
                <div className="bg-slate-50 rounded-lg p-3 text-center">
                  <div className="text-lg font-bold text-emerald-600">¥{fmt(totalCost)}</div>
                  <div className="text-xs text-slate-400 mt-1">总消费</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 模型详情表 */}
      {modelBreakdown.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-800">模型详情</h3>
            <span className="text-xs text-slate-400">{modelBreakdown.length} 个模型</span>
          </div>
          <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white">
                <tr className="border-b border-slate-100 text-xs text-slate-400">
                  <th className="text-left px-4 py-3 font-medium">模型名称</th>
                  <th className="text-center px-4 py-3 font-medium">类型</th>
                  <th className="text-right px-4 py-3 font-medium">调用量</th>
                  <th className="text-right px-4 py-3 font-medium">成功率</th>
                  <th className="text-right px-4 py-3 font-medium">Prompt Token</th>
                  <th className="text-right px-4 py-3 font-medium">Completion Token</th>
                  <th className="text-right px-4 py-3 font-medium">总 Token</th>
                  <th className="text-right px-4 py-3 font-medium">消费</th>
                  <th className="text-right px-4 py-3 font-medium">平均耗时</th>
                </tr>
              </thead>
              <tbody>
                {[...modelBreakdown].sort((a, b) => parseFloat(b.totalCost) - parseFloat(a.totalCost)).map((m, i) => (
                  <tr key={m.modelName || i} className="border-b border-slate-50 hover:bg-slate-50 transition">
                    <td className="px-4 py-2.5">
                      <span className="font-medium text-slate-800">{m.displayName || m.modelName}</span>
                      {m.modelName && m.displayName && m.displayName !== m.modelName && (
                        <span className="text-[10px] text-slate-400 ml-1">({m.modelName})</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                        m.type === 'chat' ? 'bg-blue-50 text-blue-600' :
                        m.type === 'image' ? 'bg-purple-50 text-purple-600' :
                        m.type === 'audio' ? 'bg-amber-50 text-amber-600' :
                        m.type === 'embedding' ? 'bg-emerald-50 text-emerald-600' :
                        'bg-slate-50 text-slate-500'
                      }`}>
                        {m.type === 'chat' ? '对话' : m.type === 'image' ? '图片' : m.type === 'audio' ? '音频' :
                         m.type === 'embedding' ? '嵌入' : m.type}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right font-medium text-slate-800">{m.totalCalls.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-right">{m.successRate}%</td>
                    <td className="px-4 py-2.5 text-right text-slate-600">{(m.promptTokens / 10000).toFixed(1)}万</td>
                    <td className="px-4 py-2.5 text-right text-slate-600">{(m.completionTokens / 10000).toFixed(1)}万</td>
                    <td className="px-4 py-2.5 text-right text-slate-700 font-medium">{(m.totalTokens / 10000).toFixed(1)}万</td>
                    <td className="px-4 py-2.5 text-right text-emerald-600 font-medium">¥{fmt(m.totalCost)}</td>
                    <td className="px-4 py-2.5 text-right text-slate-500">{m.avgDuration}ms</td>
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
