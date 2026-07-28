/**
 * TokenRankings — Token 消耗排名页面
 *
 * 按用户维度 Token 消耗排名表格。
 * 列：排名、用户邮箱、总 Token、总调用次数、平均 Token/次、总费用。
 * 点击用户 → 查看详情。
 *
 * API: GET /api/v1/admin/request-records/token-rankings（需后端配合）
 * 如果后端无此 API，回退到 /api/v1/admin/stats/users 拼凑
 */

import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, Crown, TrendingUp } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { get } from '@/lib/api'
import type { TokenRankingItem } from './types'
import { fmtTokens, fmtCost } from './types'

/* ── Main ── */

export default function TokenRankings() {
  const navigate = useNavigate()
  const [data, setData] = useState<TokenRankingItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchRankings = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      // 优先尝试专用 API
      const result = await get<TokenRankingItem[]>(
        '/api/v1/admin/request-records/token-rankings',
      )
      // 补上排名序号
      setData(
        (result || []).map((item, i) => ({
          ...item,
          rank: i + 1,
        })),
      )
    } catch {
      // 回退：从 admin/stats/users 接口获取用户排行数据，拼凑 TokenRankingItem
      try {
        const statsResult = await get<{
          list: Array<{
            userId: number
            email: string
            nickname?: string
            totalCalls: number
            totalTokens: number
            totalCost: string
          }>
        }>('/api/v1/admin/stats/users', { pageSize: 50 })
        const list = (statsResult.list || []).sort(
          (a, b) => b.totalTokens - a.totalTokens,
        )
        setData(
          list.map((item, i) => ({
            rank: i + 1,
            userId: item.userId,
            email: item.email,
            nickname: item.nickname || null,
            totalTokens: item.totalTokens,
            totalCalls: item.totalCalls,
            avgTokensPerCall:
              item.totalCalls > 0
                ? Math.round(item.totalTokens / item.totalCalls)
                : 0,
            totalCost: item.totalCost,
          })),
        )
      } catch (fallbackErr: any) {
        setError(fallbackErr.message || '获取排名数据失败')
        setData([])
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchRankings()
  }, [fetchRankings])

  // 图表数据（Top 10）
  const chartData = data.slice(0, 10).map((d) => ({
    name: d.nickname || d.email.split('@')[0],
    tokens: d.totalTokens,
    email: d.email,
  }))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">Token 消耗排名</h1>
        <button
          onClick={fetchRankings}
          disabled={loading}
          className="flex items-center gap-1 px-3 py-1.5 text-sm text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition"
        >
          <TrendingUp size={14} />
          刷新
        </button>
      </div>

      {/* 排行榜柱状图 Top 10 */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <p className="text-sm font-medium text-slate-700 mb-4">
          <Crown size={14} className="inline mr-1 text-amber-500" />
          Token 消耗 Top 10
        </p>
        <div className="h-72">
          {loading ? (
            <div className="h-full flex items-center justify-center">
              <Loader2 className="animate-spin" size={24} />
            </div>
          ) : chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" margin={{ left: 80 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis
                  type="number"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v: number) =>
                    v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 10_000 ? `${(v / 10_000).toFixed(1)}万` : String(v)
                  }
                />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={70} />
                <Tooltip
                  formatter={(value: any) => [fmtTokens(value), 'Token']}
                  labelFormatter={(label: any) => {
                    const item = chartData.find((d) => d.name === label)
                    return item ? `${item.email}` : label
                  }}
                />
                <Bar dataKey="tokens" fill="#3B82F6" radius={[0, 4, 4, 0]} name="Token" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-sm text-slate-400">
              暂无数据
            </div>
          )}
        </div>
      </div>

      {/* 排名表格 */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {error && (
          <div className="px-4 py-3 bg-red-50 text-red-600 text-sm">{error}</div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 text-left">
                <th className="px-4 py-3 text-sm font-medium text-slate-500 w-16">排名</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">用户</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500 text-right">总 Token</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500 text-right">总调用次数</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500 text-right">平均 Token/次</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500 text-right">总费用</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={6} className="text-center py-12">
                    <Loader2 className="inline-block animate-spin" size={24} />
                  </td>
                </tr>
              ) : data.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-slate-400">
                    暂无排名数据
                  </td>
                </tr>
              ) : (
                data.map((item) => (
                  <tr key={item.userId} className="hover:bg-slate-50 transition">
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${
                          item.rank === 1
                            ? 'bg-amber-100 text-amber-700'
                            : item.rank === 2
                              ? 'bg-slate-100 text-slate-600'
                              : item.rank === 3
                                ? 'bg-orange-100 text-orange-700'
                                : 'text-slate-500'
                        }`}
                      >
                        {item.rank}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <button
                        onClick={() => navigate(`/admin/users/${item.userId}`)}
                        className="text-blue-600 hover:text-blue-800 hover:underline"
                      >
                        {item.nickname || item.email || `用户 #${item.userId}`}
                      </button>
                      {item.email && item.nickname && (
                        <span className="text-slate-400 text-xs ml-1">({item.email})</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-mono text-slate-900 font-medium">
                      {fmtTokens(item.totalTokens)}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-slate-600">
                      {item.totalCalls.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-slate-600 font-mono">
                      {fmtTokens(item.avgTokensPerCall)}
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-mono text-slate-900 font-medium">
                      {fmtCost(item.totalCost)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}