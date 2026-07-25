// ============================================================
//  3cloud (3C) — 账单周期概览卡片
//  显示当前账单周期信息、已出账/待结算/预估金额
// ============================================================

import { Link } from 'react-router-dom'
import {
  Calendar,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Clock,
  CreditCard,
  ChevronRight,
  Loader2,
  AlertCircle,
  Wallet,
} from 'lucide-react'
import { useBillingCycle, type BillingCycleData } from '@/hooks/useBillingCycle'

// ── 格式化金额 ──
function fmtCost(cost: string | number): string {
  const n = typeof cost === 'string' ? Number(cost) : cost
  if (n >= 1000) return `¥${n.toFixed(2)}`
  if (n >= 1) return `¥${n.toFixed(4)}`
  return `¥${n.toFixed(6)}`
}

// ── 格式化数字 ──
function fmtNum(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
  return n.toString()
}

export function BillingCycleCard() {
  const { data, loading, error, refresh } = useBillingCycle()

  if (loading) {
    return (
      <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="animate-spin text-slate-400" size={24} />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
        <div className="flex items-center gap-2 text-red-600">
          <AlertCircle size={18} />
          <span className="text-sm">{error}</span>
          <button
            onClick={refresh}
            className="ml-auto text-xs text-blue-600 hover:underline"
          >
            重试
          </button>
        </div>
      </div>
    )
  }

  if (!data) return null

  const momPositive = data.momChangePercent >= 0
  const progressColor =
    data.progressPercent >= 90
      ? 'bg-red-500'
      : data.progressPercent >= 70
        ? 'bg-amber-500'
        : 'bg-blue-500'

  return (
    <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Calendar size={20} className="text-indigo-500" />
          <h2 className="text-lg font-semibold">账单周期概览</h2>
        </div>
        <Link
          to="/billing"
          className="flex items-center gap-1 text-xs text-blue-600 hover:underline"
        >
          查看详情
          <ChevronRight size={14} />
        </Link>
      </div>

      {/* Period Progress */}
      <div className="mb-5">
        <div className="flex items-center justify-between text-sm mb-2">
          <span className="text-slate-500">
            {new Date(data.periodStart).toLocaleDateString('zh-CN', {
              month: 'long',
              day: 'numeric',
            })}
            {' ~ '}
            {new Date(data.periodEnd).toLocaleDateString('zh-CN', {
              month: 'long',
              day: 'numeric',
            })}
          </span>
          <span className="text-slate-600 font-medium">
            第 {data.daysPassed} 天 / 共 {data.daysInMonth} 天
          </span>
        </div>
        <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${progressColor}`}
            style={{ width: `${data.progressPercent}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-slate-400 mt-1">
          <span>周期进度 {data.progressPercent.toFixed(0)}%</span>
          <span>
            剩余 {data.daysInMonth - data.daysPassed} 天
          </span>
        </div>
      </div>

      {/* Amount Cards */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {/* 已出账 */}
        <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
          <div className="flex items-center gap-1.5 text-slate-500 text-xs mb-1.5">
            <CreditCard size={12} />
            <span>已出账</span>
          </div>
          <p className="text-lg font-bold text-slate-800">
            {fmtCost(data.billedAmount)}
          </p>
          <p className="text-[10px] text-slate-400 mt-0.5">上月结算</p>
        </div>

        {/* 待结算 */}
        <div className="bg-blue-50 rounded-lg p-3 border border-blue-100">
          <div className="flex items-center gap-1.5 text-blue-600 text-xs mb-1.5">
            <Clock size={12} />
            <span>待结算</span>
          </div>
          <p className="text-lg font-bold text-blue-700">
            {fmtCost(data.pendingAmount)}
          </p>
          <p className="text-[10px] text-blue-500 mt-0.5">
            {data.pendingCalls.toLocaleString()} 次调用
          </p>
        </div>

        {/* 预估账单 */}
        <div className="bg-indigo-50 rounded-lg p-3 border border-indigo-100">
          <div className="flex items-center gap-1.5 text-indigo-600 text-xs mb-1.5">
            <TrendingUp size={12} />
            <span>预估全月</span>
          </div>
          <p className="text-lg font-bold text-indigo-700">
            {fmtCost(data.estimatedAmount)}
          </p>
          <p className="text-[10px] text-indigo-500 mt-0.5">
            {data.estimationMethod === 'daily_average' ? '按日均推算' : '实际消费'}
          </p>
        </div>
      </div>

      {/* Stats Row */}
      <div className="flex items-center justify-between text-sm border-t border-slate-100 pt-4">
        {/* 日均消费 */}
        <div className="flex items-center gap-4">
          <div>
            <span className="text-slate-500">日均消费</span>
            <span className="ml-2 font-mono font-medium text-slate-700">
              {fmtCost(data.estimatedDailyAvg)}
            </span>
          </div>

          {/* 环比变化 */}
          <div className="flex items-center gap-1">
            <span className="text-slate-500">环比</span>
            <span
              className={`flex items-center gap-0.5 font-medium ${
                momPositive ? 'text-red-600' : 'text-green-600'
              }`}
            >
              {momPositive ? (
                <TrendingUp size={14} />
              ) : (
                <TrendingDown size={14} />
              )}
              {Math.abs(data.momChangePercent).toFixed(1)}%
            </span>
          </div>
        </div>

        {/* 充值信息 */}
        <div className="flex items-center gap-1.5 text-slate-500">
          <Wallet size={14} />
          <span>
            本月充值 {fmtCost(data.totalRecharge)}
          </span>
          {data.rechargeCount > 0 && (
            <span className="text-xs text-slate-400">
              ({data.rechargeCount} 笔)
            </span>
          )}
        </div>
      </div>

      {/* Mini Trend Chart */}
      {data.dailyTrend.length > 0 && (
        <div className="mt-4 pt-4 border-t border-slate-100">
          <p className="text-xs text-slate-500 mb-2">近 7 天消费趋势</p>
          <MiniTrendChart data={data.dailyTrend} />
        </div>
      )}
    </div>
  )
}

// ── Mini Trend Chart Component ──
function MiniTrendChart({ data }: { data: BillingCycleData['dailyTrend'] }) {
  const maxCost = Math.max(0.01, ...data.map((d) => Number(d.cost)))

  return (
    <div className="flex items-end gap-1 h-12">
      {data.map((d, i) => {
        const cost = Number(d.cost)
        const height = Math.max(2, (cost / maxCost) * 100)
        const isToday = i === data.length - 1

        return (
          <div
            key={d.date}
            className="flex-1 flex flex-col items-center gap-0.5"
            title={`${d.date}: ${fmtCost(d.cost)} (${d.calls} 次)`}
          >
            <div
              className={`w-full rounded-t transition-all ${
                isToday
                  ? 'bg-indigo-500'
                  : cost > 0
                    ? 'bg-indigo-300 hover:bg-indigo-400'
                    : 'bg-slate-200'
              }`}
              style={{ height: `${height}%`, minHeight: 2 }}
            />
            <span className="text-[9px] text-slate-400 font-mono">
              {d.date.slice(5)}
            </span>
          </div>
        )
      })}
    </div>
  )
}
