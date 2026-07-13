import { useEffect, useState, useCallback } from 'react'
import { get } from '@/lib/api'
import type { AgentDashboard, AgentIncomeTrendData, AgentIncomeStructureData } from '@/types'
import {
  Loader2, Users, DollarSign, Wallet, Percent, RefreshCw,
  TrendingUp, TrendingDown, Minus, ArrowUpRight,
} from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts'

// ── helpers ──

function fmt2(v: string | number | null | undefined): string {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '0'))
  return n.toFixed(2)
}

// ── Colors ──

const PIE_COLORS = ['#3b82f6', '#10b981', '#f59e0b']
const PIE_FILLS = ['#eff6ff', '#ecfdf5', '#fffbeb']

// ── 日期选择 ──

const DATE_RANGES = [
  { value: 7, label: '7天' },
  { value: 30, label: '30天' },
  { value: 90, label: '90天' },
]

// ── Tooltip 自定义 ──

function TrendTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white shadow-lg border border-slate-200 rounded-lg p-3 text-sm space-y-1.5 min-w-[160px]">
      <p className="font-medium text-slate-700 border-b border-slate-100 pb-1 mb-1">{label}</p>
      {payload.map((entry: any, idx: number) => (
        <div key={idx} className="flex justify-between gap-4">
          <span style={{ color: entry.color }}>{entry.name}</span>
          <span className="font-medium">¥{fmt2(entry.value)}</span>
        </div>
      ))}
    </div>
  )
}

function PieTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="bg-white shadow-lg border border-slate-200 rounded-lg p-3 text-sm space-y-1 min-w-[140px]">
      <p className="font-medium text-slate-700">{d.label}</p>
      <p>金额: <span className="font-medium">¥{fmt2(d.amount)}</span></p>
      <p>笔数: <span className="font-medium">{d.count}</span></p>
      <p>占比: <span className="font-medium">{d.percentage}%</span></p>
    </div>
  )
}

// ══════════════════════════════════════════════
//  ── Dash: 增长趋势指示器 ──
// ══════════════════════════════════════════════

function GrowthBadge({ rate }: { rate: number }) {
  if (rate > 0.01) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs font-medium text-green-600">
        <TrendingUp size={12} />
        +{(rate * 100).toFixed(1)}%
      </span>
    )
  }
  if (rate < -0.01) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs font-medium text-red-600">
        <TrendingDown size={12} />
        {(rate * 100).toFixed(1)}%
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-0.5 text-xs font-medium text-slate-400">
      <Minus size={12} />
      持平
    </span>
  )
}

// ══════════════════════════════════════════════
//  Main Dashboard
// ══════════════════════════════════════════════

// ── 代理商仪表盘─-
//
// 【业务说明】
//   代理商专属仪表盘，展示名下客户数、累计佣金、可提现余额、分佣比例等 KPI 卡片。
//   收入趋势图支持 7/30/90 天切换，收入结构饼图展示各类型佣金占比。
//
// 【权限要求】角色=agent
// 【数据来源】GET /api/v1/agent/dashboard, GET /api/v1/agent/dashboard/income-trend, GET /api/v1/agent/dashboard/income-structure

export default function AgentDashboard() {
  // 基础面板数据
  const [data, setData] = useState<AgentDashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // 收入趋势
  const [trendData, setTrendData] = useState<AgentIncomeTrendData | null>(null)
  const [trendDays, setTrendDays] = useState(30)
  const [trendLoading, setTrendLoading] = useState(false)

  // 收入结构
  const [structureData, setStructureData] = useState<AgentIncomeStructureData | null>(null)
  const [structureLoading, setStructureLoading] = useState(false)

  // ── 数据加载 ──

  const fetchDashboard = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await get<AgentDashboard>('/api/v1/agent/dashboard')
      setData(res)
    } catch (err: any) {
      setError(err.message || '获取面板数据失败')
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchTrend = useCallback(async (days: number) => {
    setTrendLoading(true)
    try {
      const res = await get<AgentIncomeTrendData>(`/api/v1/agent/dashboard/income-trend?days=${days}`)
      setTrendData(res)
    } catch {
      // 静默
    } finally {
      setTrendLoading(false)
    }
  }, [])

  const fetchStructure = useCallback(async () => {
    setStructureLoading(true)
    try {
      const res = await get<AgentIncomeStructureData>('/api/v1/agent/dashboard/income-structure')
      setStructureData(res)
    } catch {
      // 静默
    } finally {
      setStructureLoading(false)
    }
  }, [])

  useEffect(() => { fetchDashboard() }, [fetchDashboard])
  useEffect(() => { fetchTrend(trendDays) }, [fetchTrend, trendDays])
  useEffect(() => { fetchStructure() }, [fetchStructure])

  const handleRefresh = () => {
    fetchDashboard()
    fetchTrend(trendDays)
    fetchStructure()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin" size={32} />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm">
        {error}
      </div>
    )
  }

  if (!data) return null

  // ── 统计卡片配置 ──
  const cards = [
    {
      label: '名下客户',
      value: data.totalClients,
      icon: Users,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
    },
    {
      label: '累计佣金',
      value: `¥${fmt2(data.totalCommission)}`,
      icon: DollarSign,
      color: 'text-green-600',
      bg: 'bg-green-50',
    },
    {
      label: '可提现余额',
      value: `¥${fmt2(data.availableBalance)}`,
      icon: Wallet,
      color: 'text-orange-600',
      bg: 'bg-orange-50',
    },
    {
      label: '分佣比例',
      value: data.commissionRate && Number(data.commissionRate) > 0
        ? `${(Number(data.commissionRate) * 100).toFixed(1)}%`
        : '未配置',
      icon: Percent,
      color: data.commissionRate && Number(data.commissionRate) > 0 ? 'text-purple-600' : 'text-slate-400',
      bg: data.commissionRate && Number(data.commissionRate) > 0 ? 'bg-purple-50' : 'bg-slate-50',
    },
  ]

  // ── 图表数据构造 ──
  const trendChartData = (trendData?.trend ?? []).map((t: { date: string; totalAmount: string; settledAmount: string }) => ({
    date: t.date.slice(5), // MM-DD
    fullDate: t.date,
    总收入: parseFloat(t.totalAmount),
    已结算: parseFloat(t.settledAmount),
  })) ?? []

  const pieData = (structureData?.byType ?? [])
    .filter((t: { type: string; label: string; amount: string; count: number; percentage: number }) => t.percentage > 0)
    .map((t: { type: string; label: string; amount: string; count: number; percentage: number }) => ({
      name: t.type,
      label: t.label,
      value: t.percentage,
      amount: t.amount,
      count: t.count,
      percentage: t.percentage,
    })) ?? []

  const hasTrendData = trendChartData.length > 0
  const hasPieData = pieData.length > 0
  const hasTopClients = (structureData?.topClients?.length ?? 0) > 0

  return (
    <div className="space-y-6">
      {/* ── 顶栏 ── */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">代理商面板</h1>
        <button
          onClick={handleRefresh}
          className="flex items-center gap-1 px-3 py-1.5 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition"
        >
          <RefreshCw size={14} />
          刷新
        </button>
      </div>

      {/* ── 统计卡片 ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card) => (
          <div
            key={card.label}
            className="bg-white rounded-xl p-4 shadow-sm border border-slate-200"
          >
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${card.bg}`}>
                <card.icon size={20} className={card.color} />
              </div>
              <div>
                <p className="text-xs text-slate-500">{card.label}</p>
                <p className={`text-xl font-bold ${card.color}`}>{card.value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ════════════════════════════════════════════ */}
      {/*  收入趋势曲线                              */}
      {/* ════════════════════════════════════════════ */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold text-slate-700">收入趋势</h2>
            {trendData && (
              <div className="flex items-center gap-3 text-xs text-slate-500">
                <span>
                  累计: <strong className="text-slate-700">¥{fmt2(trendData.summary.totalIncome)}</strong>
                </span>
                <span className="hidden sm:inline">
                  日均: <strong className="text-slate-700">¥{fmt2(trendData.summary.avgDailyIncome)}</strong>
                </span>
                <span className="hidden sm:inline">
                  增长: <GrowthBadge rate={trendData.summary.growthRate} />
                </span>
              </div>
            )}
          </div>
          <div className="flex gap-1">
            {DATE_RANGES.map((r) => (
              <button
                key={r.value}
                onClick={() => setTrendDays(r.value)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition ${
                  trendDays === r.value
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        <div className="px-2 py-4">
          {trendLoading ? (
            <div className="flex items-center justify-center h-52">
              <Loader2 className="animate-spin" size={24} />
            </div>
          ) : !hasTrendData ? (
            <div className="text-center py-12 text-sm text-slate-400">
              选定时间内暂无收入数据
            </div>
          ) : (
            <div className="h-52 sm:h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendChartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: '#94a3b8' }}
                    tickLine={false}
                    axisLine={{ stroke: '#e2e8f0' }}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#94a3b8' }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v: number) => `¥${v.toFixed(0)}`}
                    width={60}
                  />
                  <Tooltip content={<TrendTooltip />} />
                  <Line
                    type="monotone"
                    dataKey="总收入"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 0 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="已结算"
                    stroke="#10b981"
                    strokeWidth={1.5}
                    strokeDasharray="4 3"
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 0 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* ── 底部快速统计 ── */}
        {trendData && hasTrendData && (
          <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/50 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs text-slate-500">
            <div>
              <span className="block">总天数</span>
              <span className="text-sm font-semibold text-slate-700">{trendData.summary.totalDays}天</span>
            </div>
            <div>
              <span className="block">日均收入</span>
              <span className="text-sm font-semibold text-slate-700">¥{fmt2(trendData.summary.avgDailyIncome)}</span>
            </div>
            <div>
              <span className="block">增长趋势</span>
              <GrowthBadge rate={trendData.summary.growthRate} />
            </div>
            <div>
              <span className="block">期末/期初</span>
              <GrowthBadge rate={trendData.summary.dailyGrowthRate} />
            </div>
          </div>
        )}
      </div>

      {/* ════════════════════════════════════════════ */}
      {/*  收入结构 + 重点客户 TOP5（上下排列）      */}
      {/* ════════════════════════════════════════════ */}

      {/* ── 收入结构饼图 ── */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">收入结构</h2>
          <a
            href="/agent/commissions"
            className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-0.5"
          >
            查看全部 <ArrowUpRight size={12} />
          </a>
        </div>
        <div className="px-2 py-4">
          {structureLoading ? (
            <div className="flex items-center justify-center h-36">
              <Loader2 className="animate-spin" size={20} />
            </div>
          ) : !hasPieData ? (
            <div className="text-center py-10 text-sm text-slate-400">暂无收入结构数据</div>
          ) : (
            <div className="flex flex-col sm:flex-row items-center gap-4">
              {/* 饼图 */}
              <div className="h-48 w-48 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={75}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {pieData.map((entry: { name: string; value: number }, idx: number) => (
                        <Cell
                          key={entry.name}
                          fill={PIE_COLORS[idx % PIE_COLORS.length]}
                          stroke={PIE_FILLS[idx % PIE_FILLS.length]}
                          strokeWidth={2}
                        />
                      ))}
                    </Pie>
                    <Tooltip content={<PieTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              {/* 图例列表 */}
              <div className="flex-1 space-y-2.5 self-start pt-2 w-full">
                {structureData?.byType
                  .filter((t: { type: string; label: string; amount: string; count: number; percentage: number }) => t.percentage > 0)
                  .map((t: { type: string; label: string; amount: string; count: number; percentage: number }, idx: number) => (
                    <div key={t.type} className="flex items-center justify-between px-2">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full inline-block shrink-0"
                          style={{ backgroundColor: PIE_COLORS[idx % PIE_COLORS.length] }}
                        />
                        <span className="text-sm text-slate-700">{t.label}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium text-slate-800">¥{fmt2(t.amount)}</span>
                        <span className="text-xs text-slate-400 min-w-[36px] text-right">
                          {t.percentage}%
                        </span>
                      </div>
                    </div>
                  ))}
                {/* 当月收入概览 */}
                {structureData && (
                  <div className="mt-3 pt-3 border-t border-slate-100 px-2 flex items-center justify-between text-xs text-slate-500">
                    <span>本月收入: <strong className="text-slate-700">¥{fmt2(structureData.monthIncome)}</strong></span>
                    <span>本月笔数: <strong className="text-slate-700">{structureData.monthRecords}</strong></span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── 重点客户 TOP5 ── */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">重点客户 TOP{Math.min(structureData?.topClients?.length ?? 5, 5)}</h2>
          <a
            href="/agent/clients"
            className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-0.5"
          >
            查看全部客户 <ArrowUpRight size={12} />
          </a>
        </div>
        {structureLoading ? (
          <div className="flex items-center justify-center h-36">
            <Loader2 className="animate-spin" size={20} />
          </div>
        ) : !hasTopClients ? (
          <div className="text-center py-10 text-sm text-slate-400">暂无客户数据</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {(structureData?.topClients ?? []).map((client: { customerUserId: number; customerName: string; customerEmail: string; totalAmount: string; commissionAmount: string; orderCount: number; lastOrderAt: string | null }, idx: number) => (
              <div
                key={client.customerUserId}
                className="px-5 py-3 flex items-center justify-between hover:bg-slate-50 transition"
              >
                <div className="flex items-center gap-3 min-w-0">
                  {/* 排名徽标 */}
                  <span
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                      idx === 0
                        ? 'bg-yellow-100 text-yellow-700'
                        : idx === 1
                        ? 'bg-slate-100 text-slate-600'
                        : idx === 2
                        ? 'bg-orange-50 text-orange-600'
                        : 'bg-slate-50 text-slate-400'
                    }`}
                  >
                    {idx + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-700 truncate">
                      {client.customerName || `客户#${client.customerUserId}`}
                    </p>
                    {client.orderCount > 0 && (
                      <p className="text-xs text-slate-400">
                        {client.orderCount} 笔订单
                        {client.lastOrderAt && <> · 最近 {new Date(client.lastOrderAt).toLocaleDateString('zh-CN')}</>}
                      </p>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0 ml-3">
                  <p className="text-sm font-semibold text-green-600">
                    ¥{fmt2(client.commissionAmount)}
                  </p>
                  <p className="text-xs text-slate-400">
                    消费 ¥{fmt2(client.totalAmount)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
