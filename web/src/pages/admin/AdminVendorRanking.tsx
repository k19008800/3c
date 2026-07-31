import { useState, useEffect, useCallback } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Legend,
} from 'recharts'
import {
  TrendingUp, TrendingDown, RefreshCw, Filter, Award, Zap,
  DollarSign, Clock, CheckCircle, XCircle, Cpu, AlertTriangle,
} from 'lucide-react'
import { Loader2, AlertCircle } from 'lucide-react'
import { get } from '@/lib/api'

interface VendorRanking {
  vendorId: number
  vendorName: string
  totalCost: number
  costPercent: string
  totalTokens: number
  callCount: number
  callPercent: string
  successRate: number
  failedCount: number
  avgDurationMs: number
  avgTokensPerCall: number
  costPerToken: number
  costPerCall: number
  score: number
  trend: 'stable' | 'warning' | 'critical'
}

interface RankingData {
  period: string
  sortBy: string
  totalCost: string
  totalCalls: number
  rankings: VendorRanking[]
}

function fmtCost(n: number): string {
  if (n >= 100) return `¥${n.toFixed(2)}`
  if (n >= 1) return `¥${n.toFixed(4)}`
  return `¥${n.toFixed(6)}`
}

function fmtCompact(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
  return n.toLocaleString()
}

export default function AdminVendorRanking() {
  const [data, setData] = useState<RankingData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [period, setPeriod] = useState('30d')
  const [sortBy, setSortBy] = useState('cost')

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await get<RankingData>(`/api/v1/admin/vendors/ranking?period=${period}&sortBy=${sortBy}`)
      setData(res)
    } catch (err: any) {
      setError(err.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }, [period, sortBy])

  useEffect(() => { fetchData() }, [fetchData])

  // 雷达图数据
  const radarData = data?.rankings.slice(0, 5).map(v => ({
    name: v.vendorName.length > 10 ? v.vendorName.slice(0, 10) + '...' : v.vendorName,
    成功率: v.successRate,
    成本效率: Math.max(0, 100 - (v.costPerToken * 1e6)),
    响应速度: Math.max(0, 100 - (v.avgDurationMs / 100)),
    调用量: Math.min(100, (v.callCount / (data?.totalCalls || 1)) * 5000),
    综合评分: v.score,
  })) || []

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">
            供应商绩效排名 <span className="text-xs text-gray-500 align-top">[?]</span>
          </h1>
          <p className="text-sm text-gray-400 mt-1">多维度评估供应商表现，识别优质与待优化供应商</p>
        </div>
        <button onClick={fetchData} className="flex items-center gap-1.5 px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm">
          <RefreshCw className="w-4 h-4" /> 刷新
        </button>
      </div>

      {/* 控制栏 */}
      <div className="flex items-center gap-4 bg-gray-800 rounded-lg p-4 border border-gray-700">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-400" />
          <span className="text-sm text-gray-400">周期：</span>
          <div className="flex rounded-lg overflow-hidden border border-gray-600">
            {[
              { k: '7d', l: '7天' },
              { k: '30d', l: '30天' },
              { k: '90d', l: '90天' },
            ].map(p => (
              <button
                key={p.k}
                onClick={() => setPeriod(p.k)}
                className={`px-3 py-1.5 text-sm ${period === p.k ? 'bg-indigo-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
              >
                {p.l}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-400">排序：</span>
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
            className="bg-gray-700 border border-gray-600 text-gray-300 rounded-lg px-3 py-1.5 text-sm"
          >
            <option value="cost">按消费金额</option>
            <option value="calls">按调用次数</option>
            <option value="successRate">按成功率</option>
            <option value="latency">按响应速度</option>
            <option value="costEfficiency">按成本效率</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 text-red-600 bg-red-900/20 p-4 rounded-lg border border-red-800">
          <AlertCircle size={16} />
          <span className="text-sm">{error}</span>
          <button onClick={fetchData} className="ml-auto text-xs text-blue-400 hover:underline">重试</button>
        </div>
      ) : !data || data.rankings.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <Award className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>暂无供应商数据</p>
        </div>
      ) : (
        <>
          {/* 统计概览 */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
              <p className="text-xs text-gray-400 mb-1">总消费</p>
              <p className="text-xl font-bold text-white">{fmtCost(parseFloat(data.totalCost))}</p>
            </div>
            <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
              <p className="text-xs text-gray-400 mb-1">总调用</p>
              <p className="text-xl font-bold text-white">{fmtCompact(data.totalCalls)}</p>
            </div>
            <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
              <p className="text-xs text-gray-400 mb-1">供应商数量</p>
              <p className="text-xl font-bold text-white">{data.rankings.length}</p>
            </div>
          </div>

          {/* 雷达图 */}
          {radarData.length >= 3 && (
            <div className="bg-gray-800 rounded-xl border border-gray-700 p-6">
              <h2 className="text-lg font-semibold text-gray-100 mb-4">Top 5 供应商综合评分雷达图</h2>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={radarData}>
                    <PolarGrid stroke="#374151" />
                    <PolarAngleAxis dataKey="name" tick={{ fontSize: 10, fill: '#9CA3AF' }} />
                    <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 10, fill: '#9CA3AF' }} />
                    <Radar name="成功率" dataKey="成功率" stroke="#6366f1" fill="#6366f1" fillOpacity={0.1} />
                    <Radar name="成本效率" dataKey="成本效率" stroke="#10b981" fill="#10b981" fillOpacity={0.1} />
                    <Radar name="响应速度" dataKey="响应速度" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.1} />
                    <Radar name="综合评分" dataKey="综合评分" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.1} />
                    <Legend />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* 排名列表 */}
          <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-700">
              <h2 className="text-lg font-semibold text-gray-100">供应商排名</h2>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-700 text-gray-400">
                  <th className="text-left px-4 py-3 font-medium w-10">#</th>
                  <th className="text-left px-4 py-3 font-medium">供应商</th>
                  <th className="text-right px-4 py-3 font-medium">综合评分</th>
                  <th className="text-right px-4 py-3 font-medium">消费金额</th>
                  <th className="text-right px-4 py-3 font-medium">调用次数</th>
                  <th className="text-right px-4 py-3 font-medium">成功率</th>
                  <th className="text-right px-4 py-3 font-medium">平均耗时</th>
                  <th className="text-right px-4 py-3 font-medium">Token/调用</th>
                  <th className="text-right px-4 py-3 font-medium">成本/Token</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {data.rankings.map((v, i) => {
                  const scoreColor = v.score >= 85 ? 'text-green-400' : v.score >= 70 ? 'text-amber-400' : 'text-red-400'
                  const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : ''
                  return (
                    <tr key={v.vendorId} className="hover:bg-gray-750">
                      <td className="px-4 py-3">
                        <span className="text-lg">{medal || <span className="text-gray-500 text-sm">{i + 1}</span>}</span>
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-200">{v.vendorName}</td>
                      <td className={`px-4 py-3 text-right font-bold ${scoreColor}`}>{v.score}</td>
                      <td className="px-4 py-3 text-right text-gray-300">{fmtCost(v.totalCost)}</td>
                      <td className="px-4 py-3 text-right text-gray-300">{fmtCompact(v.callCount)}</td>
                      <td className="px-4 py-3 text-right">
                        <span className={v.successRate >= 98 ? 'text-green-400' : v.successRate >= 95 ? 'text-amber-400' : 'text-red-400'}>
                          {v.successRate.toFixed(1)}%
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-gray-300">{v.avgDurationMs}ms</td>
                      <td className="px-4 py-3 text-right text-gray-300">{fmtCompact(v.avgTokensPerCall)}</td>
                      <td className="px-4 py-3 text-right text-gray-300">{fmtCost(v.costPerToken)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* 消费分布柱状图 */}
          <div className="bg-gray-800 rounded-xl border border-gray-700 p-6">
            <h2 className="text-lg font-semibold text-gray-100 mb-4">消费分布 Top 10</h2>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.rankings.slice(0, 10)} layout="vertical" barSize={20}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis type="number" tick={{ fontSize: 10, fill: '#9CA3AF' }} tickFormatter={(v) => `¥${v}`} />
                  <YAxis type="category" dataKey="vendorName" tick={{ fontSize: 10, fill: '#9CA3AF' }} width={100} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151', borderRadius: 8 }}
                    formatter={(value: number) => [fmtCost(value), '消费金额']}
                  />
                  <Bar dataKey="totalCost" fill="#6366f1" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}
    </div>
  )
}