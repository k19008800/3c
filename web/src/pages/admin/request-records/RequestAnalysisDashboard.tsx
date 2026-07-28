/**
 * RequestAnalysisDashboard — 用户请求分析看板
 *
 * 选择用户后展示统计卡片、分类饼图、时间线、模型分布、风险趋势。
 */

import { useState, useEffect, useCallback } from 'react'
import { Search, Loader2, X } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, Legend,
} from 'recharts'
import { get } from '@/lib/api'
import UserRequestStats from './components/UserRequestStats'
import ContentCategoryChart from './components/ContentCategoryChart'
import RequestTimeline from './components/RequestTimeline'
import type { UserRequestStats as UserRequestStatsType } from './types'
import { fmtTokens, fmtCost } from './types'

/* ── API 返回格式 ── */

interface UserSearchResult {
  id: number
  email: string
  nickname: string | null
}

interface AnalyticsResponse {
  stats: UserRequestStatsType
  requestBodies: any[]
}

/* ── Main ── */

export default function RequestAnalysisDashboard() {
  const [userSearch, setUserSearch] = useState('')
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [selectedUser, setSelectedUser] = useState<UserSearchResult | null>(null)

  const [stats, setStats] = useState<UserRequestStatsType | null>(null)
  const [requestBodies, setRequestBodies] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  /** 搜索用户 */
  const searchUser = useCallback(async () => {
    if (!userSearch.trim()) return
    setSearching(true)
    try {
      const data = await get<{ list: UserSearchResult[] }>('/api/v1/admin/users/search', {
        keyword: userSearch.trim(),
        pageSize: 10,
      })
      setSearchResults(data.list || [])
    } catch {
      setSearchResults([])
    } finally {
      setSearching(false)
    }
  }, [userSearch])

  /** 选择用户后加载分析数据 */
  useEffect(() => {
    if (!selectedUser) return
    setLoading(true)
    setError('')
    setStats(null)
    setRequestBodies([])

    Promise.all([
      get<AnalyticsResponse>(`/api/v1/admin/request-records/user/${selectedUser.id}`),
      get<UserRequestStatsType>('/api/v1/admin/request-records/analytics', {
        userId: selectedUser.id,
      }).catch(() => null),
    ])
      .then(([userData, analyticsData]) => {
        setStats(userData.stats || userData)
        setRequestBodies(userData.requestBodies || [])
      })
      .catch((err) => setError(err.message || '获取分析数据失败'))
      .finally(() => setLoading(false))
  }, [selectedUser])

  // 按回车搜索
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') searchUser()
  }

  const handleSelectUser = (user: UserSearchResult) => {
    setSelectedUser(user)
    setSearchResults([])
    setUserSearch('')
  }

  const handleClearUser = () => {
    setSelectedUser(null)
    setStats(null)
    setRequestBodies([])
  }

  const COLORS = ['#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444', '#EC4899', '#6366F1', '#14B8A6']

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-slate-900">用户请求分析</h1>

      {/* 用户选择 */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        {selectedUser ? (
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs text-slate-500">当前分析用户：</span>
              <span className="text-sm font-medium text-slate-900 ml-1">
                {selectedUser.nickname || selectedUser.email}
              </span>
              <span className="text-xs text-slate-400 ml-2">(ID: {selectedUser.id})</span>
            </div>
            <button
              onClick={handleClearUser}
              className="flex items-center gap-1 px-3 py-1.5 text-sm text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition"
            >
              <X size={14} /> 更换用户
            </button>
          </div>
        ) : (
          <div className="relative">
            <label className="block text-xs text-slate-500 mb-1">搜索用户（邮箱或昵称）</label>
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="输入用户邮箱搜索..."
                className="w-full pl-9 pr-10 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-400 transition-colors"
              />
              <button
                onClick={searchUser}
                disabled={!userSearch.trim() || searching}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-sm text-blue-600 hover:text-blue-800 disabled:text-slate-400"
              >
                {searching ? <Loader2 size={16} className="animate-spin" /> : '搜索'}
              </button>
            </div>

            {/* 搜索结果下拉 */}
            {searchResults.length > 0 && (
              <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                {searchResults.map((user) => (
                  <button
                    key={user.id}
                    onClick={() => handleSelectUser(user)}
                    className="w-full text-left px-4 py-2.5 text-sm hover:bg-slate-50 border-b border-slate-100 last:border-0 transition"
                  >
                    <span className="font-medium text-slate-900">{user.nickname || user.email}</span>
                    <span className="text-slate-400 ml-2">({user.email})</span>
                    <span className="text-slate-400 ml-1">ID: {user.id}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 加载中 */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="animate-spin" size={32} />
        </div>
      )}

      {/* 错误 */}
      {error && (
        <div className="bg-red-50 text-red-600 p-4 rounded-lg text-sm">{error}</div>
      )}

      {/* 分析内容 */}
      {!loading && !error && stats && (
        <>
          {/* 统计卡片 */}
          <UserRequestStats
            totalRequests={stats.totalRequests}
            highRiskRequests={stats.highRiskRequests}
            todayRequests={stats.todayRequests}
            activeModels={stats.activeModels}
          />

          {/* 图表区域 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 分类饼图 */}
            <ContentCategoryChart requestBodies={requestBodies} />

            {/* 模型使用分布 */}
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <p className="text-sm font-medium text-slate-700 mb-4">模型使用分布</p>
              <div className="h-64">
                {stats.modelDistribution.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={stats.modelDistribution}
                      layout="vertical"
                      margin={{ left: 100 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis type="number" tick={{ fontSize: 11 }} />
                      <YAxis
                        type="category"
                        dataKey="modelName"
                        tick={{ fontSize: 10 }}
                        width={90}
                      />
                      <Tooltip />
                      <Bar dataKey="count" fill="#8B5CF6" radius={[0, 4, 4, 0]} name="请求数" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-sm text-slate-400">
                    暂无数据
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 请求时间线 */}
          <RequestTimeline
            dailyData={stats.requestsByDay || []}
            hourlyData={stats.requestsByHour || []}
          />

          {/* 风险趋势 */}
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <p className="text-sm font-medium text-slate-700 mb-4">高风险请求趋势</p>
            <div className="h-64">
              {stats.riskTrend && stats.riskTrend.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={stats.riskTrend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Line
                      type="monotone"
                      dataKey="highRisk"
                      stroke="#EF4444"
                      strokeWidth={2}
                      dot={{ r: 3, fill: '#EF4444' }}
                      name="高风险请求"
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-sm text-slate-400">
                  暂无风险趋势数据
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* 未选择用户 */}
      {!loading && !error && !stats && !selectedUser && (
        <div className="py-20 text-center text-sm text-slate-400">
          请先搜索并选择一个用户以查看分析数据
        </div>
      )}
    </div>
  )
}