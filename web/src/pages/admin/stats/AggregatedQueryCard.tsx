import { useState, useCallback, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Filter, ChevronUp, ChevronDown } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts'
import { Loader2 } from 'lucide-react'
import { get } from '@/lib/api'
import { GRANULARITIES } from './types'
import { type AggSeriesItem, type AggSummary, type ModelBreakdownItem, type VendorBreakdownItem } from './types'

interface AggregatedQueryCardProps {
  period: string
}

export default function AggregatedQueryCard({ period }: AggregatedQueryCardProps) {
  const [aggOpen, setAggOpen] = useState(false)
  const [aggGranularity, setAggGranularity] = useState('day')
  const [aggModelFilter, setAggModelFilter] = useState('')
  const [aggVendorFilter, setAggVendorFilter] = useState('')
  const [aggSeries, setAggSeries] = useState<AggSeriesItem[]>([])
  const [aggSummary, setAggSummary] = useState<AggSummary | null>(null)
  const [aggModelBreakdown, setAggModelBreakdown] = useState<ModelBreakdownItem[]>([])
  const [aggVendorBreakdown, setAggVendorBreakdown] = useState<VendorBreakdownItem[]>([])
  const [aggLoading, setAggLoading] = useState(false)

  const fetchAggregated = useCallback(async () => {
    setAggLoading(true)
    try {
      const d = period === '7d' ? 7 : period === '30d' ? 30 : 90
      const now = new Date()
      const start = new Date(now.getTime() - d * 86400000).toISOString()
      const end = now.toISOString()
      const params: Record<string, any> = { start, end, granularity: aggGranularity }
      if (aggModelFilter) params.model_name = aggModelFilter
      if (aggVendorFilter) params.vendor_name = aggVendorFilter
      const data = await get<{ series: AggSeriesItem[]; summary: AggSummary; modelBreakdown: ModelBreakdownItem[]; vendorBreakdown: VendorBreakdownItem[] }>('/api/v1/admin/stats/usage/summary', params)
      setAggSeries(data.series)
      setAggSummary(data.summary)
      setAggModelBreakdown(data.modelBreakdown ?? [])
      setAggVendorBreakdown(data.vendorBreakdown ?? [])
    } catch (err: any) {
      console.error('聚合查询失败:', err)
    } finally {
      setAggLoading(false)
    }
  }, [period, aggGranularity, aggModelFilter, aggVendorFilter])

  useEffect(() => {
    if (aggOpen) fetchAggregated()
  }, [aggOpen, fetchAggregated])

  return (
    <Card>
      <CardHeader className="cursor-pointer select-none" onClick={() => setAggOpen(!aggOpen)}>
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2">
            <Filter size={16} className="text-indigo-500" />
            聚合查询
            <span className="text-xs text-slate-400 font-normal">多维度聚合 + 模型/供应商细分</span>
          </span>
          {aggOpen ? <ChevronUp size={18} className="text-slate-400" /> : <ChevronDown size={18} className="text-slate-400" />}
        </CardTitle>
      </CardHeader>
      {aggOpen && (
        <CardContent className="border-t border-slate-100 pt-4">
          <div className="flex flex-wrap gap-3 mb-4 items-end">
            <div>
              <label className="text-xs text-slate-500 block mb-1">聚合粒度</label>
              <select
                value={aggGranularity}
                onChange={e => setAggGranularity(e.target.value)}
                className="border border-slate-200 rounded-md px-3 py-1.5 text-sm bg-white"
              >
                {GRANULARITIES.map(g => (
                  <option key={g.value} value={g.value}>{g.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">模型筛选</label>
              <input
                type="text"
                placeholder="留空全部"
                value={aggModelFilter}
                onChange={e => setAggModelFilter(e.target.value)}
                className="border border-slate-200 rounded-md px-3 py-1.5 text-sm w-36"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">供应商筛选</label>
              <input
                type="text"
                placeholder="留空全部"
                value={aggVendorFilter}
                onChange={e => setAggVendorFilter(e.target.value)}
                className="border border-slate-200 rounded-md px-3 py-1.5 text-sm w-36"
              />
            </div>
            <button
              onClick={fetchAggregated}
              className="bg-indigo-500 text-white text-sm px-4 py-1.5 rounded-md hover:bg-indigo-600"
            >
              查询
            </button>
          </div>

          {aggSummary && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <div className="bg-slate-50 p-3 rounded-lg text-center">
                <div className="text-lg font-bold text-slate-800">{aggSummary.totalCalls.toLocaleString()}</div>
                <div className="text-[10px] text-slate-500">总调用</div>
              </div>
              <div className="bg-slate-50 p-3 rounded-lg text-center">
                <div className="text-lg font-bold text-purple-700">{Number(aggSummary.totalTokens).toLocaleString()}</div>
                <div className="text-[10px] text-slate-500">总 Token</div>
              </div>
              <div className="bg-slate-50 p-3 rounded-lg text-center">
                <div className="text-lg font-bold text-green-700">¥{Number(aggSummary.totalCost).toFixed(4)}</div>
                <div className="text-[10px] text-slate-500">总花费</div>
              </div>
              <div className="bg-slate-50 p-3 rounded-lg text-center">
                <div className="text-lg font-bold text-orange-700">{aggSummary.avgDuration}ms</div>
                <div className="text-[10px] text-slate-500">平均延迟</div>
              </div>
            </div>
          )}

          {aggLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="animate-spin" size={20} />
            </div>
          ) : aggSeries.length > 0 ? (
            <div className="h-64 mb-4">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={aggSeries}>
                  <defs>
                    <linearGradient id="colorAggTokens2" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366F1" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#6366F1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="timeBucket" tick={{ fontSize: 10 }} tickLine={false} />
                  <YAxis tick={{ fontSize: 11 }} tickLine={false} tickFormatter={(v: number) => v >= 10000 ? `${(v / 10000).toFixed(0)}万` : String(v)} />
                  <Tooltip />
                  <Area type="monotone" dataKey="totalTokens" stroke="#6366F1" fill="url(#colorAggTokens2)" name="Token" strokeWidth={2} />
                  <Area type="monotone" dataKey="totalCalls" stroke="#3B82F6" fill="none" name="调用次数" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : null}

          {!aggLoading && (aggModelBreakdown.length > 0 || aggVendorBreakdown.length > 0) && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div>
                <h4 className="text-sm font-medium text-slate-700 mb-2">按模型细分</h4>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={aggModelBreakdown.slice(0, 10)} layout="vertical" margin={{ left: 100 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v: number) => v >= 10000 ? `${(v / 10000).toFixed(0)}万` : String(v)} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 9 }} width={90} />
                      <Tooltip />
                      <Bar dataKey="totalTokens" fill="#8B5CF6" name="Token" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div>
                <h4 className="text-sm font-medium text-slate-700 mb-2">按供应商细分</h4>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={aggVendorBreakdown.slice(0, 10)} layout="vertical" margin={{ left: 80 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v: number) => `¥${v}`} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 9 }} width={70} />
                      <Tooltip />
                      <Bar dataKey="totalCost" fill="#10B981" name="花费" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}

          {!aggLoading && aggSeries.length > 0 && (
            <div className="mt-4">
              <h4 className="text-sm font-medium text-slate-700 mb-2">时间序列明细</h4>
              <div className="overflow-x-auto max-h-48 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-slate-50">
                    <tr className="text-left">
                      <th className="px-3 py-1.5 font-medium text-slate-500">时间</th>
                      <th className="px-3 py-1.5 font-medium text-slate-500 text-right">调用</th>
                      <th className="px-3 py-1.5 font-medium text-slate-500 text-right">Token</th>
                      <th className="px-3 py-1.5 font-medium text-slate-500 text-right">花费</th>
                      <th className="px-3 py-1.5 font-medium text-slate-500 text-right">延迟</th>
                      <th className="px-3 py-1.5 font-medium text-slate-500 text-right">用户</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {aggSeries.map((s, i) => (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="px-3 py-1.5 text-slate-600 whitespace-nowrap font-mono">{s.timeBucket.slice(0, 16)}</td>
                        <td className="px-3 py-1.5 text-right text-slate-600">{s.totalCalls.toLocaleString()}</td>
                        <td className="px-3 py-1.5 text-right text-slate-600">{Number(s.totalTokens).toLocaleString()}</td>
                        <td className="px-3 py-1.5 text-right text-slate-600">¥{Number(s.totalCost).toFixed(4)}</td>
                        <td className="px-3 py-1.5 text-right text-slate-600">{s.avgDuration}ms</td>
                        <td className="px-3 py-1.5 text-right text-slate-600">{s.uniqueUsers}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  )
}