import { useState, useEffect, useCallback } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend, Cell,
} from 'recharts'
import {
  GitCompare, TrendingUp, TrendingDown, Minus, RefreshCw, ArrowRight,
  FileText, DollarSign, Zap, Clock, CheckCircle, XCircle,
} from 'lucide-react'
import { Loader2, AlertCircle } from 'lucide-react'
import { get } from '@/lib/api'

// ── 类型定义 ──

interface PeriodStats {
  calls: number
  tokens: number
  cost: number
  successCount: number
  failedCount: number
  avgDurationMs: number
  successRate: number
}

interface ChangeInfo {
  calls: string
  tokens: string
  cost: string
  successRate: string
  avgDurationMs: string
}

interface CompareResponse {
  mode: 'previous' | 'yoy'
  days: number
  currentPeriod: { start: string; end: string; stats: PeriodStats }
  previousPeriod: { start: string; end: string; stats: PeriodStats }
  changes: ChangeInfo
}

// ── 工具函数 ──

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

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

function ChangeBadge({ value, label, goodUp, goodDown }: {
  value: string
  label: string
  goodUp?: boolean
  goodDown?: boolean
}) {
  const isPos = value.startsWith('+')
  const isNeg = value.startsWith('-')
  const isGood = (isPos && goodUp) || (isNeg && goodDown) || (!isPos && !isNeg)

  let color: string
  let Icon: typeof TrendingUp
  if (value === '0%' || value === '+0.0%' || value === '-0.0%') {
    color = 'text-slate-500'
    Icon = Minus
  } else if (isPos) {
    color = isGood ? 'text-green-500' : 'text-red-500'
    Icon = isGood ? TrendingUp : TrendingDown
  } else if (isNeg) {
    color = isGood ? 'text-green-500' : 'text-red-500'
    Icon = isGood ? TrendingDown : TrendingUp
  } else {
    color = 'text-slate-500'
    Icon = Minus
  }

  return (
    <div className="flex items-center gap-1 text-sm">
      <Icon size={14} className={color} />
      <span className={color}>{value}</span>
      <span className="text-slate-500 text-xs ml-1">{label}</span>
    </div>
  )
}

// ── 主组件 ──

export default function CostComparePage() {
  const [data, setData] = useState<CompareResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [mode, setMode] = useState<'previous' | 'yoy'>('previous')
  const [days, setDays] = useState(7)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await get<CompareResponse>(`/api/v1/me/stats/compare?mode=${mode}&days=${days}`)
      setData(res)
    } catch (err: any) {
      setError(err.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }, [mode, days])

  useEffect(() => { fetchData() }, [fetchData])

  // 对比图表数据
  const chartData = data ? [
    {
      name: '调用次数',
      current: data.currentPeriod.stats.calls,
      previous: data.previousPeriod.stats.calls,
      unit: '次',
    },
    {
      name: 'Token',
      current: data.currentPeriod.stats.tokens,
      previous: data.previousPeriod.stats.tokens,
      unit: '',
    },
    {
      name: '消费',
      current: data.currentPeriod.stats.cost,
      previous: data.previousPeriod.stats.cost,
      unit: '¥',
    },
    {
      name: '成功率',
      current: data.currentPeriod.stats.successRate,
      previous: data.previousPeriod.stats.successRate,
      unit: '%',
    },
    {
      name: '平均耗时',
      current: data.currentPeriod.stats.avgDurationMs,
      previous: data.previousPeriod.stats.avgDurationMs,
      unit: 'ms',
    },
  ] : []

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
          <button onClick={fetchData} className="ml-auto text-xs text-blue-600 hover:underline">重试</button>
        </div>
      </div>
    )
  }

  const current = data?.currentPeriod.stats
  const previous = data?.previousPeriod.stats
  const changes = data?.changes

  return (
    <div className="p-6 space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">
            费用对比分析 <span className="text-xs text-gray-500 align-top">[?]</span>
          </h1>
          <p className="text-sm text-gray-400 mt-1">环比/同比对比消费趋势，评估成本变化</p>
        </div>
        <button
          onClick={fetchData}
          className="flex items-center gap-1.5 px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm"
        >
          <RefreshCw className="w-4 h-4" /> 刷新
        </button>
      </div>

      {/* 控制栏 */}
      <div className="flex items-center gap-4 bg-gray-800 rounded-lg p-4 border border-gray-700">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-400">对比模式：</span>
          <div className="flex rounded-lg overflow-hidden border border-gray-600">
            <button
              onClick={() => setMode('previous')}
              className={`px-3 py-1.5 text-sm ${mode === 'previous' ? 'bg-indigo-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
            >
              环比
            </button>
            <button
              onClick={() => setMode('yoy')}
              className={`px-3 py-1.5 text-sm ${mode === 'yoy' ? 'bg-indigo-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
            >
              同比
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-400">周期：</span>
          <div className="flex rounded-lg overflow-hidden border border-gray-600">
            {[7, 30, 90].map(d => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`px-3 py-1.5 text-sm ${days === d ? 'bg-indigo-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
              >
                {d}天
              </button>
            ))}
          </div>
        </div>
        {data && (
          <span className="text-xs text-gray-500 ml-auto">
            {mode === 'previous' ? '环比' : '同比'}：{formatDate(data.previousPeriod.start)} ~ {formatDate(data.previousPeriod.end)}
            <ArrowRight className="inline w-3 h-3 mx-1" />
            {formatDate(data.currentPeriod.start)} ~ {formatDate(data.currentPeriod.end)}
          </span>
        )}
      </div>

      {/* 指标对比卡片 */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <CompareCard
          label="总调用"
          icon={<Zap className="w-4 h-4" />}
          current={current?.calls}
          previous={previous?.calls}
          change={changes?.calls}
          fmt={fmtCompact}
          color="blue"
        />
        <CompareCard
          label="总 Token"
          icon={<FileText className="w-4 h-4" />}
          current={current?.tokens}
          previous={previous?.tokens}
          change={changes?.tokens}
          fmt={fmtCompact}
          color="purple"
        />
        <CompareCard
          label="总消费"
          icon={<DollarSign className="w-4 h-4" />}
          current={current?.cost}
          previous={previous?.cost}
          change={changes?.cost}
          fmt={fmtCost}
          color="amber"
          goodDown
        />
        <CompareCard
          label="成功率"
          icon={<CheckCircle className="w-4 h-4" />}
          current={current?.successRate}
          previous={previous?.successRate}
          change={changes?.successRate}
          fmt={(v: number) => `${v.toFixed(1)}%`}
          color="green"
          goodUp
        />
        <CompareCard
          label="平均耗时"
          icon={<Clock className="w-4 h-4" />}
          current={current?.avgDurationMs}
          previous={previous?.avgDurationMs}
          change={changes?.avgDurationMs}
          fmt={(v: number) => `${v.toFixed(0)}ms`}
          color="rose"
          goodDown
        />
      </div>

      {/* 对比柱状图 */}
      <div className="bg-gray-800 rounded-xl border border-gray-700 p-6">
        <h2 className="text-lg font-semibold text-gray-100 mb-4">五维对比</h2>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} barSize={32}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#9CA3AF' }} />
              <YAxis tick={{ fontSize: 11, fill: '#9CA3AF' }} />
              <Tooltip
                contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151', borderRadius: 8 }}
                formatter={(value: number, name: string) => {
                  const idx = chartData.findIndex(d => d.name === name)
                  const unit = idx >= 0 ? chartData[idx]?.unit || '' : ''
                  return [`${name === 'current' ? '当前' : '对比'}${unit ? ` (${unit})` : ''}`, value]
                }}
              />
              <Legend
                formatter={(value) => value === 'current' ? '当前周期' : '对比周期'}
              />
              <Bar
                dataKey="current"
                name="current"
                fill="#6366f1"
                radius={[4, 4, 0, 0]}
              />
              <Bar
                dataKey="previous"
                name="previous"
                fill="#9CA3AF"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 详细对比表 */}
      <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-700">
          <h2 className="text-lg font-semibold text-gray-100">详细指标</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-700 text-gray-400">
              <th className="text-left px-4 py-3 font-medium">指标</th>
              <th className="text-right px-4 py-3 font-medium">当前周期</th>
              <th className="text-right px-4 py-3 font-medium">对比周期</th>
              <th className="text-right px-4 py-3 font-medium">变化</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700">
            {[
              { label: '调用次数', cur: current?.calls, prev: previous?.calls, chg: changes?.calls, fmt: fmtCompact },
              { label: '总 Token', cur: current?.tokens, prev: previous?.tokens, chg: changes?.tokens, fmt: fmtCompact },
              { label: '总消费', cur: current?.cost, prev: previous?.cost, chg: changes?.cost, fmt: fmtCost },
              { label: '成功次数', cur: current?.successCount, prev: previous?.successCount, chg: null, fmt: fmtCompact },
              { label: '失败次数', cur: current?.failedCount, prev: previous?.failedCount, chg: null, fmt: fmtCompact },
              { label: '成功率', cur: current?.successRate, prev: previous?.successRate, chg: changes?.successRate, fmt: (v: number) => `${v.toFixed(1)}%` },
              { label: '平均耗时', cur: current?.avgDurationMs, prev: previous?.avgDurationMs, chg: changes?.avgDurationMs, fmt: (v: number) => `${v.toFixed(0)}ms` },
            ].map((row, i) => (
              <tr key={i} className="hover:bg-gray-750">
                <td className="px-4 py-3 text-gray-300">{row.label}</td>
                <td className="px-4 py-3 text-right text-gray-100 font-medium">{row.fmt(row.cur!)}</td>
                <td className="px-4 py-3 text-right text-gray-400">{row.fmt(row.prev!)}</td>
                <td className="px-4 py-3 text-right">
                  {row.chg ? (
                    <ChangeBadge value={row.chg} label="" goodUp={row.label === '成功率'} goodDown={row.label === '总消费' || row.label === '平均耗时'} />
                  ) : (
                    <span className="text-gray-500">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── 对比卡片 ──

function CompareCard({ label, icon, current, previous, change, fmt, color, goodUp, goodDown }: {
  label: string
  icon: React.ReactNode
  current?: number
  previous?: number
  change?: string
  fmt: (v: number) => string
  color: string
  goodUp?: boolean
  goodDown?: boolean
}) {
  const colorMap: Record<string, string> = {
    blue: 'border-blue-800',
    purple: 'border-purple-800',
    amber: 'border-amber-800',
    green: 'border-green-800',
    rose: 'border-rose-800',
  }
  const border = colorMap[color] || 'border-gray-700'

  return (
    <div className={`bg-gray-800 rounded-lg p-4 border ${border}`}>
      <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-2">
        {icon}
        <span>{label}</span>
      </div>
      <div className="space-y-1">
        <p className="text-lg font-bold text-white">{current != null ? fmt(current) : '—'}</p>
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-500">对比：{previous != null ? fmt(previous) : '—'}</span>
          {change && <ChangeBadge value={change} label="" goodUp={goodUp} goodDown={goodDown} />}
        </div>
      </div>
    </div>
  )
}