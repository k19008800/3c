import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine, PieChart, Pie, Cell, BarChart, Bar, Legend,
} from 'recharts'
import {
  TrendingUp, TrendingDown, Minus, AlertTriangle, Wallet, Calendar, RefreshCw,
  PieChart as PieChartIcon, BarChart3, Lightbulb, ChevronDown, ChevronUp,
  Clock, DollarSign, Zap, Cpu,
} from 'lucide-react'
import { Loader2, AlertCircle } from 'lucide-react'
import { get } from '@/lib/api'

// ── 类型定义 ──

interface ForecastData {
  balance: string
  last7DaysCost: string
  avgDailyCost: string
  monthToDateCost: string
  predictedRemainingCost: string
  predictedMonthTotal: string
  depletionDate: string | null
  warnings: string[]
  warningLevel: 'none' | 'low' | 'medium' | 'high'
  trend: 'increasing' | 'decreasing' | 'stable'
  dailySeries: Array<{ date: string; cost: number }>
  regression: { slope: string; intercept: string }
}

interface CostBreakdownItem {
  name: string
  cost: number
  costPercent: string
  tokens: number
  calls: number
  avgCost: number
}

interface CostBreakdown {
  period: string
  totalCost: string
  totalCalls: number
  breakdown: CostBreakdownItem[]
}

interface OptimizationSuggestion {
  type: 'switch_model' | 'resize_model' | 'batch_requests' | 'cache_hit' | 'key_consolidation'
  title: string
  description: string
  estimatedSavings: string
  priority: 'high' | 'medium' | 'low'
  currentModel?: string
  suggestedModel?: string
}

// ── 颜色 ──

const COLORS = ['#6366f1', '#8b5cf6', '#a855f7', '#3b82f6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#14b8a6']
const PIE_COLORS = ['#6366f1', '#8b5cf6', '#a855f7', '#3b82f6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#14b8a6']

// ── 工具函数 ──

function fmt(value: string | number): string {
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (num >= 100) return `¥${num.toFixed(2)}`
  if (num >= 1) return `¥${num.toFixed(4)}`
  return `¥${num.toFixed(6)}`
}

function fmtDate(dateStr: string): string {
  const parts = dateStr.split('-')
  return `${parts[1]}/${parts[2]}`
}

function fmtCompact(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`
  return num.toString()
}

function getWarningLevel(level: string) {
  switch (level) {
    case 'high': return { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', badge: 'bg-red-100 text-red-700' }
    case 'medium': return { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', badge: 'bg-amber-100 text-amber-700' }
    case 'low': return { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', badge: 'bg-blue-100 text-blue-700' }
    default: return { bg: 'bg-slate-50', border: 'border-slate-200', text: 'text-slate-700', badge: 'bg-slate-100 text-slate-700' }
  }
}

function getPriorityClass(p: string) {
  switch (p) {
    case 'high': return 'text-red-600 bg-red-50'
    case 'medium': return 'text-amber-600 bg-amber-50'
    default: return 'text-blue-600 bg-blue-50'
  }
}

// ── 主组件 ──

export default function CostForecastPage() {
  const [forecast, setForecast] = useState<ForecastData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [modelBreakdown, setModelBreakdown] = useState<CostBreakdown | null>(null)
  const [breakdownPeriod, setBreakdownPeriod] = useState('7d')

  const [optimizations, setOptimizations] = useState<OptimizationSuggestion[]>([])
  const [optLoading, setOptLoading] = useState(false)

  const [chartTab, setChartTab] = useState<'forecast' | 'breakdown' | 'daily'>('forecast')

  const fetchAll = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [f, b] = await Promise.all([
        get<ForecastData>('/api/v1/me/stats/forecast'),
        get<CostBreakdown>(`/api/v1/me/stats/cost-breakdown?period=${breakdownPeriod}&groupBy=model`),
      ])
      setForecast(f)
      setModelBreakdown(b)
    } catch (err: any) {
      setError(err.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }, [breakdownPeriod])

  const fetchOptimizations = useCallback(async () => {
    setOptLoading(true)
    try {
      const data = await get<{ suggestions: OptimizationSuggestion[] }>('/api/v1/me/stats/optimization')
      setOptimizations(data.suggestions || [])
    } catch {
      // 静默失败
    } finally {
      setOptLoading(false)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])
  useEffect(() => { fetchOptimizations() }, [fetchOptimizations])

  // 图表数据
  const chartData = (() => {
    if (!forecast || !forecast.dailySeries) return []
    const { slope, intercept } = forecast.regression
    const slopeNum = parseFloat(slope)
    const interceptNum = parseFloat(intercept)

    const data = forecast.dailySeries.map((d, i) => ({
      date: fmtDate(d.date),
      actual: d.cost,
      predicted: slopeNum * i + interceptNum,
    }))

    const lastDate = forecast.dailySeries[forecast.dailySeries.length - 1]?.date
    if (lastDate) {
      const parts = lastDate.split('-').map(Number)
      for (let i = 1; i <= 3; i++) {
        const future = new Date(parts[0], parts[1] - 1, parts[2] + i)
        const futureStr = `${future.getMonth() + 1}/${future.getDate()}`
        data.push({
          date: futureStr,
          actual: null as unknown as number,
          predicted: Math.max(0, slopeNum * (6 + i) + interceptNum),
        })
      }
    }
    return data
  })()

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-2 text-red-600 bg-red-50 p-4 rounded-lg border border-red-200">
          <AlertCircle size={16} />
          <span className="text-sm">{error}</span>
          <button onClick={fetchAll} className="ml-auto text-xs text-blue-600 hover:underline">重试</button>
        </div>
      </div>
    )
  }

  const w = forecast ? getWarningLevel(forecast.warningLevel) : null

  return (
    <div className="p-6 space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">
            成本分析与预测 <span className="text-xs text-gray-500 align-top">[?]</span>
          </h1>
          <p className="text-sm text-gray-400 mt-1">实时监控消费趋势、预测月度成本、获取优化建议</p>
        </div>
        <button
          onClick={fetchAll}
          className="flex items-center gap-1.5 px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm"
        >
          <RefreshCw className="w-4 h-4" /> 刷新数据
        </button>
      </div>

      {/* 预警提示 */}
      {forecast && forecast.warnings.length > 0 && w && (
        <div className={`flex items-start gap-3 p-4 rounded-lg border ${w.bg} ${w.border}`}>
          <AlertTriangle size={20} className={`${w.text} shrink-0 mt-0.5`} />
          <div className="flex-1">
            {forecast.warnings.map((warning, i) => (
              <p key={i} className={`text-sm ${w.text}`}>{warning}</p>
            ))}
            <Link to="/console/recharge" className={`text-sm font-medium ${w.text} hover:underline mt-1 inline-block`}>
              去充值 →
            </Link>
          </div>
        </div>
      )}

      {/* 核心指标 */}
      {forecast && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          <MetricCard icon={<Wallet className="w-4 h-4" />} label="当前余额" value={fmt(forecast.balance)} color="blue" />
          <MetricCard icon={<DollarSign className="w-4 h-4" />} label="日均消费" value={fmt(forecast.avgDailyCost)} color="purple" sub={forecast.trend === 'increasing' ? '↑ 上升' : forecast.trend === 'decreasing' ? '↓ 下降' : '→ 稳定'} />
          <MetricCard icon={<Calendar className="w-4 h-4" />} label="本月已消费" value={fmt(forecast.monthToDateCost)} color="green" />
          <MetricCard icon={<TrendingUp className="w-4 h-4" />} label="预测本月总消费" value={fmt(forecast.predictedMonthTotal)} color="amber" />
          <MetricCard icon={<Clock className="w-4 h-4" />} label="预计剩余消费" value={fmt(forecast.predictedRemainingCost)} color="indigo" />
          <MetricCard icon={<AlertTriangle className="w-4 h-4" />} label="最近7日" value={fmt(forecast.last7DaysCost)} color="rose" />
        </div>
      )}

      {/* 图表区域 */}
      <div className="bg-gray-800 rounded-xl border border-gray-700">
        <div className="flex items-center border-b border-gray-700">
          <button
            onClick={() => setChartTab('forecast')}
            className={`px-4 py-3 text-sm font-medium ${chartTab === 'forecast' ? 'text-indigo-400 border-b-2 border-indigo-400' : 'text-gray-400 hover:text-gray-300'}`}
          >
            消费预测
          </button>
          <button
            onClick={() => setChartTab('breakdown')}
            className={`px-4 py-3 text-sm font-medium ${chartTab === 'breakdown' ? 'text-indigo-400 border-b-2 border-indigo-400' : 'text-gray-400 hover:text-gray-300'}`}
          >
            模型成本分解
          </button>
          <button
            onClick={() => setChartTab('daily')}
            className={`px-4 py-3 text-sm font-medium ${chartTab === 'daily' ? 'text-indigo-400 border-b-2 border-indigo-400' : 'text-gray-400 hover:text-gray-300'}`}
          >
            每日消费明细
          </button>
        </div>

        <div className="p-6">
          {chartTab === 'forecast' && (
            <div>
              <p className="text-sm text-gray-400 mb-4">最近7日消费 + 未来3日预测趋势</p>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#9CA3AF' }} />
                    <YAxis tick={{ fontSize: 11, fill: '#9CA3AF' }} tickFormatter={(v) => `¥${v.toFixed(2)}`} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151', borderRadius: 8, fontSize: 12 }}
                      formatter={(value: number, name: string) => {
                        if (value == null) return ['-', name]
                        return [fmt(value), name === 'actual' ? '实际消费' : '预测消费']
                      }}
                    />
                    <ReferenceLine x={chartData[6]?.date} stroke="#6B7280" strokeDasharray="4 2" label={{ value: '今日', position: 'top', fill: '#9CA3AF', fontSize: 10 }} />
                    <Line type="monotone" dataKey="actual" name="actual" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3, fill: '#3b82f6' }} connectNulls={false} />
                    <Line type="monotone" dataKey="predicted" name="predicted" stroke="#a78bfa" strokeWidth={2} strokeDasharray="4 2" dot={{ r: 2, fill: '#a78bfa' }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              {forecast?.depletionDate && (
                <div className="mt-4 flex items-center gap-2 text-sm text-amber-400 bg-amber-900/20 p-3 rounded-lg border border-amber-800">
                  <Calendar size={14} />
                  <span>预计余额将在 <strong>{new Date(forecast.depletionDate).toLocaleDateString('zh-CN')}</strong> 耗尽</span>
                  <Link to="/console/recharge" className="text-blue-400 hover:underline ml-auto">立即充值 →</Link>
                </div>
              )}
            </div>
          )}

          {chartTab === 'breakdown' && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm text-gray-400">按模型分解成本（{breakdownPeriod === '7d' ? '近7天' : breakdownPeriod === '30d' ? '近30天' : '近90天'}）</p>
                <div className="flex gap-1">
                  {['7d', '30d', '90d'].map(p => (
                    <button
                      key={p}
                      onClick={() => setBreakdownPeriod(p)}
                      className={`px-2 py-1 text-xs rounded ${breakdownPeriod === p ? 'bg-indigo-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
                    >
                      {p === '7d' ? '7天' : p === '30d' ? '30天' : '90天'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {modelBreakdown && modelBreakdown.breakdown.length > 0 && (
                  <>
                    <div>
                      <p className="text-xs text-gray-500 mb-2">成本占比</p>
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={modelBreakdown.breakdown.slice(0, 8)}
                              dataKey="cost"
                              nameKey="name"
                              cx="50%"
                              cy="50%"
                              outerRadius={80}
                              label={({ name, costPercent }) => `${name} ${costPercent}%`}
                              labelLine={true}
                            >
                              {modelBreakdown.breakdown.slice(0, 8).map((_, i) => (
                                <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip formatter={(value: number) => fmt(value)} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-2">调用次数与成本</p>
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={modelBreakdown.breakdown.slice(0, 8)}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                            <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#9CA3AF' }} />
                            <YAxis yAxisId="left" tick={{ fontSize: 10, fill: '#9CA3AF' }} tickFormatter={(v) => `¥${v}`} />
                            <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: '#9CA3AF' }} tickFormatter={fmtCompact} />
                            <Tooltip contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151', borderRadius: 8 }} />
                            <Legend />
                            <Bar yAxisId="left" dataKey="cost" name="成本" fill="#6366f1" radius={[4, 4, 0, 0]} />
                            <Bar yAxisId="right" dataKey="calls" name="调用次数" fill="#10b981" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </>
                )}
                {(!modelBreakdown || modelBreakdown.breakdown.length === 0) && (
                  <div className="col-span-2 text-center py-12 text-gray-500">暂无数据</div>
                )}
              </div>
            </div>
          )}

          {chartTab === 'daily' && modelBreakdown && (
            <div>
              <p className="text-sm text-gray-400 mb-4">每日消费演变（{breakdownPeriod === '7d' ? '近7天' : breakdownPeriod === '30d' ? '近30天' : '近90天'}）</p>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={modelBreakdown.breakdown.slice(0, 10)}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#9CA3AF' }} />
                    <YAxis tick={{ fontSize: 11, fill: '#9CA3AF' }} tickFormatter={(v) => `¥${v}`} />
                    <Tooltip contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151', borderRadius: 8 }} formatter={(value: number) => fmt(value)} />
                    <Bar dataKey="cost" name="成本" fill="#6366f1" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 优化建议 */}
      <div className="bg-gray-800 rounded-xl border border-gray-700">
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <div className="flex items-center gap-2">
            <Lightbulb className="w-5 h-5 text-amber-400" />
            <h2 className="text-lg font-semibold text-gray-100">用量优化建议</h2>
          </div>
          <button
            onClick={fetchOptimizations}
            className="text-xs text-gray-400 hover:text-gray-300"
          >
            <RefreshCw className="w-3.5 h-3.5 inline mr-1" />刷新
          </button>
        </div>
        <div className="p-4">
          {optLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
            </div>
          ) : optimizations.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Zap className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">暂无优化建议</p>
            </div>
          ) : (
            <div className="space-y-3">
              {optimizations.map((opt, i) => (
                <div key={i} className="bg-gray-750 rounded-lg p-4 border border-gray-700">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${getPriorityClass(opt.priority)}`}>
                        {opt.priority === 'high' ? '高优先级' : opt.priority === 'medium' ? '中优先级' : '低优先级'}
                      </span>
                      <span className="text-sm font-medium text-gray-200">{opt.title}</span>
                    </div>
                    <span className="text-xs text-green-400 font-medium">{opt.estimatedSavings}</span>
                  </div>
                  <p className="text-sm text-gray-400">{opt.description}</p>
                  {opt.currentModel && opt.suggestedModel && (
                    <div className="mt-2 flex items-center gap-2 text-xs text-gray-500">
                      <span className="bg-gray-700 px-2 py-0.5 rounded">{opt.currentModel}</span>
                      <span>→</span>
                      <span className="bg-indigo-900/30 text-indigo-400 px-2 py-0.5 rounded">{opt.suggestedModel}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 底部统计 */}
      {forecast && (
        <div className="flex items-center justify-between text-xs text-gray-500 bg-gray-800 rounded-lg p-3 border border-gray-700">
          <span>最近7日总消费：{fmt(forecast.last7DaysCost)}</span>
          <span>预测剩余消费：{fmt(forecast.predictedRemainingCost)}</span>
          {modelBreakdown && <span>总调用次数：{fmtCompact(modelBreakdown.totalCalls)}</span>}
        </div>
      )}
    </div>
  )
}

// ── 指标卡片 ──

function MetricCard({ icon, label, value, color, sub }: {
  icon: React.ReactNode
  label: string
  value: string
  color: string
  sub?: string
}) {
  const colorMap: Record<string, string> = {
    blue: 'from-blue-900/30 to-blue-800/10 border-blue-800 text-blue-400',
    purple: 'from-purple-900/30 to-purple-800/10 border-purple-800 text-purple-400',
    green: 'from-green-900/30 to-green-800/10 border-green-800 text-green-400',
    amber: 'from-amber-900/30 to-amber-800/10 border-amber-800 text-amber-400',
    indigo: 'from-indigo-900/30 to-indigo-800/10 border-indigo-800 text-indigo-400',
    rose: 'from-rose-900/30 to-rose-800/10 border-rose-800 text-rose-400',
  }
  const c = colorMap[color] || colorMap.blue
  return (
    <div className={`bg-gradient-to-br ${c} rounded-lg p-4 border`}>
      <div className="flex items-center gap-1.5 text-xs opacity-70 mb-1">
        {icon}
        <span>{label}</span>
      </div>
      <p className="text-lg font-bold text-white">{value}</p>
      {sub && <p className="text-[10px] opacity-60 mt-0.5">{sub}</p>}
    </div>
  )
}