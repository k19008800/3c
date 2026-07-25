import { useEffect, useState, useCallback } from 'react'
import { get } from '@/lib/api'
import {
  Loader2, AlertCircle, Activity, Users, TrendingUp, Calendar,
  RefreshCw, Clock, Zap
} from 'lucide-react'

// ── 类型定义 ──

interface OverviewStats {
  activeUsers: number
  totalOperations: number
  avgDailyOperations: number
}

interface TrendItem {
  date: string
  total: number
  success: number
  failure: number
  uniqueUsers: number
}

interface ActionItem {
  action: string
  count: number
  failCount: number
  uniqueUsers: number
}

interface HourlyItem {
  hour: number
  count: number
}

interface TopUserItem {
  userId: number
  count: number
  failCount: number
  lastActive: string
  actions: string
}

// ── Tab 定义 ──

type Tab = 'overview' | 'trend' | 'actions' | 'hourly' | 'topUsers'

// ── 页面组件 ──

export default function AdminBehaviorAnalysis() {
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  // 各 Tab 数据状态
  const [overview, setOverview] = useState<OverviewStats | null>(null)
  const [trendList, setTrendList] = useState<TrendItem[]>([])
  const [actionList, setActionList] = useState<ActionItem[]>([])
  const [hourlyList, setHourlyList] = useState<HourlyItem[]>([])
  const [topUserList, setTopUserList] = useState<TopUserItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const tabs: { key: Tab; label: string; icon: typeof Activity }[] = [
    { key: 'overview', label: '概览', icon: Activity },
    { key: 'trend', label: '操作趋势', icon: TrendingUp },
    { key: 'actions', label: '操作分布', icon: Zap },
    { key: 'hourly', label: '时段分布', icon: Clock },
    { key: 'topUsers', label: '活跃用户', icon: Users },
  ]

  // ── 数据获取 ──

  const fetchData = useCallback(async (tab: Tab) => {
    setLoading(true)
    setError('')
    try {
      switch (tab) {
        case 'overview': {
          const res = await get<OverviewStats>('/api/v1/admin/behavior-analysis/overview')
          setOverview(res)
          break
        }
        case 'trend': {
          const res = await get<{ list: TrendItem[] }>('/api/v1/admin/behavior-analysis/trend', { days: 30 })
          setTrendList(res.list)
          break
        }
        case 'actions': {
          const res = await get<{ list: ActionItem[] }>('/api/v1/admin/behavior-analysis/action-distribution')
          setActionList(res.list)
          break
        }
        case 'hourly': {
          const res = await get<{ list: HourlyItem[] }>('/api/v1/admin/behavior-analysis/hourly-distribution')
          setHourlyList(res.list)
          break
        }
        case 'topUsers': {
          const res = await get<{ list: TopUserItem[] }>('/api/v1/admin/behavior-analysis/top-users', { limit: 20 })
          setTopUserList(res.list)
          break
        }
      }
    } catch (err: any) {
      setError(err.message || '获取数据失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData(activeTab) }, [activeTab, fetchData])

  // ── 渲染：概览 ──

  function renderOverview() {
    if (!overview) return null
    const cards = [
      { label: '30天活跃用户', value: overview.activeUsers, icon: Users, color: 'text-blue-600', bg: 'bg-blue-50' },
      { label: '30天操作总数', value: overview.totalOperations, icon: Activity, color: 'text-green-600', bg: 'bg-green-50' },
      { label: '日均操作数', value: overview.avgDailyOperations, icon: Calendar, color: 'text-purple-600', bg: 'bg-purple-50' },
    ]
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {cards.map(card => (
          <div key={card.label} className={`${card.bg} rounded-xl p-5`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">{card.label}</p>
                <p className={`text-3xl font-bold mt-1 ${card.color}`}>{card.value}</p>
              </div>
              <card.icon className={card.color} size={32} />
            </div>
          </div>
        ))}
      </div>
    )
  }

  // ── 渲染：操作趋势 ──

  function renderTrend() {
    if (trendList.length === 0) {
      return <p className="text-center text-gray-400 py-10">暂无趋势数据</p>
    }
    const maxVal = Math.max(...trendList.map(t => t.total), 1)
    return (
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs text-gray-500 px-1">
          <span>日期</span>
          <span>操作数</span>
        </div>
        {trendList.map(item => (
          <div key={item.date} className="flex items-center gap-3 px-2 py-1.5 hover:bg-gray-50 rounded">
            <span className="text-xs text-gray-500 w-16 flex-shrink-0">{item.date}</span>
            <div className="flex-1 flex items-center gap-1">
              <div
                className="h-4 bg-blue-400 rounded-sm transition-all"
                style={{ width: `${(item.total / maxVal) * 100}%` }}
              />
              <div
                className="h-4 bg-red-300 rounded-sm transition-all"
                style={{ width: `${(item.failure / maxVal) * 100}%` }}
              />
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-600 w-24 justify-end flex-shrink-0">
              <span className="text-blue-600">{item.success}</span>
              {item.failure > 0 && <span className="text-red-500">{item.failure}</span>}
              <span className="text-gray-400">| {item.uniqueUsers}u</span>
            </div>
          </div>
        ))}
        {trendList.length > 10 && (
          <div className="text-center pt-2 text-xs text-gray-400">
            共 {trendList.length} 天数据（蓝=成功 红=失败）
          </div>
        )}
      </div>
    )
  }

  // ── 渲染：操作分布 ──

  function renderActions() {
    if (actionList.length === 0) {
      return <p className="text-center text-gray-400 py-10">暂无操作数据</p>
    }
    const maxVal = Math.max(...actionList.map(a => a.count), 1)
    return (
      <div className="space-y-1">
        {actionList.map(item => (
          <div key={item.action} className="flex items-center gap-3 px-2 py-2 hover:bg-gray-50 rounded">
            <span className="text-sm font-mono text-gray-700 w-48 truncate flex-shrink-0" title={item.action}>
              {item.action}
            </span>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <div
                  className="h-5 bg-orange-400 rounded-sm transition-all"
                  style={{ width: `${(item.count / maxVal) * 100}%` }}
                />
                <span className="text-xs text-gray-600 w-16 text-right">{item.count}</span>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-500 w-32 flex-shrink-0 justify-end">
              {item.failCount > 0 && (
                <span className="text-red-500">失败 {item.failCount}</span>
              )}
              <span>{item.uniqueUsers} 用户</span>
            </div>
          </div>
        ))}
      </div>
    )
  }

  // ── 渲染：时段分布 ──

  function renderHourly() {
    if (hourlyList.length === 0) {
      return <p className="text-center text-gray-400 py-10">暂无时段数据</p>
    }
    const maxVal = Math.max(...hourlyList.map(h => h.count), 1)
    const labels = ['0-1时', '1-2时', '2-3时', '3-4时', '4-5时', '5-6时', '6-7时',
      '7-8时', '8-9时', '9-10时', '10-11时', '11-12时',
      '12-13时', '13-14时', '14-15时', '15-16时', '16-17时', '17-18时',
      '18-19时', '19-20时', '20-21时', '21-22时', '22-23时', '23-24时']

    // 构建完整 24 小时数组
    const hourMap = new Map(hourlyList.map(h => [h.hour, h.count]))
    const fullHours = Array.from({ length: 24 }, (_, i) => ({
      hour: i,
      count: hourMap.get(i) || 0,
    }))

    return (
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-xs text-gray-500 mb-2">
          峰值时段：
          {fullHours
            .sort((a, b) => b.count - a.count)
            .slice(0, 3)
            .map(h => labels[h.hour])
            .join('、')
          }
        </div>
        {fullHours.map(item => (
          <div key={item.hour} className="flex items-center gap-3 px-2 py-1 hover:bg-gray-50 rounded">
            <span className="text-xs text-gray-500 w-16 flex-shrink-0">{labels[item.hour]}</span>
            <div className="flex-1">
              <div
                className={`h-4 rounded-sm transition-all ${item.count > 0 ? 'bg-indigo-400' : 'bg-gray-100'}`}
                style={{ width: `${(item.count / maxVal) * 100}%` }}
              />
            </div>
            <span className="text-xs text-gray-600 w-12 text-right flex-shrink-0">{item.count}</span>
          </div>
        ))}
      </div>
    )
  }

  // ── 渲染：活跃用户 ──

  function renderTopUsers() {
    if (topUserList.length === 0) {
      return <p className="text-center text-gray-400 py-10">暂无用户数据</p>
    }
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-gray-500">
              <th className="pb-2 font-medium">#</th>
              <th className="pb-2 font-medium">用户 ID</th>
              <th className="pb-2 font-medium">操作总数</th>
              <th className="pb-2 font-medium">失败数</th>
              <th className="pb-2 font-medium">失败率</th>
              <th className="pb-2 font-medium">最近活跃</th>
              <th className="pb-2 font-medium">操作类型</th>
            </tr>
          </thead>
          <tbody>
            {topUserList.map((user, i) => (
              <tr key={user.userId} className="border-b last:border-0 hover:bg-gray-50">
                <td className="py-2 text-gray-400">{i + 1}</td>
                <td className="py-2 font-mono">{user.userId}</td>
                <td className="py-2">{user.count}</td>
                <td className="py-2 text-red-500">{user.failCount}</td>
                <td className="py-2">
                  {user.count > 0
                    ? `${((user.failCount / user.count) * 100).toFixed(1)}%`
                    : '0%'}
                </td>
                <td className="py-2 text-gray-500 text-xs">
                  {new Date(user.lastActive).toLocaleString('zh-CN')}
                </td>
                <td className="py-2 text-xs text-gray-500 max-w-[200px] truncate" title={user.actions}>
                  {user.actions}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  // ── 主渲染 ──

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="text-indigo-500" size={28} />
            用户行为分析
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            基于操作日志的多维度用户行为画像分析
          </p>
        </div>
        <button
          onClick={() => fetchData(activeTab)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
        >
          <RefreshCw size={14} />
          刷新
        </button>
      </div>

      {/* Tab 切换 */}
      <div className="flex gap-1 border-b">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.key
                ? 'border-indigo-500 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <tab.icon size={16} />
            {tab.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 text-sm text-red-600 bg-red-50 rounded-lg">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="animate-spin" size={32} />
        </div>
      ) : (
        <div className="min-h-[300px]">
          {activeTab === 'overview' && renderOverview()}
          {activeTab === 'trend' && renderTrend()}
          {activeTab === 'actions' && renderActions()}
          {activeTab === 'hourly' && renderHourly()}
          {activeTab === 'topUsers' && renderTopUsers()}
        </div>
      )}
    </div>
  )
}
