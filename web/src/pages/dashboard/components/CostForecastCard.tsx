import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine,
} from 'recharts'
import { TrendingUp, TrendingDown, Minus, AlertTriangle, Wallet, Calendar } from 'lucide-react'
import { Loader2, AlertCircle } from 'lucide-react'
import { useCostForecast } from '@/hooks/useCostForecast'

/**
 * 格式化金额
 */
function fmtCost(value: string | number): string {
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (num >= 100) return `¥${num.toFixed(2)}`
  if (num >= 1) return `¥${num.toFixed(4)}`
  return `¥${num.toFixed(6)}`
}

/**
 * 格式化日期 (YYYY-MM-DD -> MM/DD)
 */
function fmtDate(dateStr: string): string {
  const parts = dateStr.split('-')
  return `${parts[1]}/${parts[2]}`
}

/**
 * 获取预警级别对应的颜色和样式
 */
function getWarningStyles(level: 'none' | 'low' | 'medium' | 'high') {
  switch (level) {
    case 'high':
      return {
        bg: 'bg-red-50',
        border: 'border-red-200',
        text: 'text-red-700',
        icon: 'text-red-500',
      }
    case 'medium':
      return {
        bg: 'bg-amber-50',
        border: 'border-amber-200',
        text: 'text-amber-700',
        icon: 'text-amber-500',
      }
    case 'low':
      return {
        bg: 'bg-blue-50',
        border: 'border-blue-200',
        text: 'text-blue-700',
        icon: 'text-blue-500',
      }
    default:
      return {
        bg: 'bg-slate-50',
        border: 'border-slate-200',
        text: 'text-slate-700',
        icon: 'text-slate-500',
      }
  }
}

/**
 * 获取趋势图标和颜色
 */
function getTrendInfo(trend: 'increasing' | 'decreasing' | 'stable') {
  switch (trend) {
    case 'increasing':
      return { Icon: TrendingUp, color: 'text-red-500', label: '消费上升' }
    case 'decreasing':
      return { Icon: TrendingDown, color: 'text-green-500', label: '消费下降' }
    default:
      return { Icon: Minus, color: 'text-slate-500', label: '消费稳定' }
  }
}

export function CostForecastCard() {
  const { forecast, loading, error, refetch } = useCostForecast()

  // 准备图表数据
  const chartData = useMemo(() => {
    if (!forecast || !forecast.dailySeries) return []

    const { slope, intercept } = forecast.regression
    const slopeNum = parseFloat(slope)
    const interceptNum = parseFloat(intercept)

    // 实际值 + 预测值（未来3天）
    const actualData = forecast.dailySeries.map((d, i) => ({
      date: fmtDate(d.date),
      actual: d.cost,
      predicted: slopeNum * i + interceptNum,
    }))

    // 添加未来3天的预测
    const lastDate = forecast.dailySeries[forecast.dailySeries.length - 1]?.date
    if (lastDate) {
      const lastDateParts = lastDate.split('-').map(Number)
      for (let i = 1; i <= 3; i++) {
        const futureDate = new Date(lastDateParts[0], lastDateParts[1] - 1, lastDateParts[2] + i)
        const futureDateStr = `${futureDate.getMonth() + 1}/${futureDate.getDate()}`
        const predictedValue = Math.max(0, slopeNum * (6 + i) + interceptNum)
        actualData.push({
          date: futureDateStr,
          actual: null as unknown as number,
          predicted: predictedValue,
        })
      }
    }

    return actualData
  }, [forecast])

  // 加载状态
  if (loading) {
    return (
      <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="animate-spin" size={24} />
        </div>
      </div>
    )
  }

  // 错误状态
  if (error) {
    return (
      <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm">
            <AlertCircle size={16} />
            {error}
          </div>
          <button
            onClick={refetch}
            className="text-xs text-blue-600 hover:underline"
          >
            重试
          </button>
        </div>
      </div>
    )
  }

  // 无数据
  if (!forecast) return null

  const warningStyles = getWarningStyles(forecast.warningLevel)
  const trendInfo = getTrendInfo(forecast.trend)

  return (
    <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp size={20} className="text-indigo-500" />
          <h2 className="text-lg font-semibold">成本预测与预警</h2>
        </div>
        <button
          onClick={refetch}
          className="text-xs text-slate-500 hover:text-slate-700 transition"
        >
          刷新
        </button>
      </div>

      {/* 预警提示 */}
      {forecast.warnings.length > 0 && (
        <div className={`flex items-start gap-2 p-3 rounded-lg border ${warningStyles.bg} ${warningStyles.border}`}>
          <AlertTriangle size={16} className={`${warningStyles.icon} shrink-0 mt-0.5`} />
          <div className="flex-1">
            {forecast.warnings.map((warning, i) => (
              <p key={i} className={`text-sm ${warningStyles.text}`}>
                {warning}
              </p>
            ))}
            <Link
              to="/recharge"
              className={`text-sm font-medium ${warningStyles.text} hover:underline mt-1 inline-block`}
            >
              去充值 →
            </Link>
          </div>
        </div>
      )}

      {/* 核心指标 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* 当前余额 */}
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg p-3 border border-blue-100">
          <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-1">
            <Wallet size={12} />
            <span>当前余额</span>
          </div>
          <p className="text-lg font-bold text-slate-900">{fmtCost(forecast.balance)}</p>
        </div>

        {/* 日均消费 */}
        <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-lg p-3 border border-purple-100">
          <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-1">
            <trendInfo.Icon size={12} className={trendInfo.color} />
            <span>日均消费</span>
          </div>
          <p className="text-lg font-bold text-slate-900">{fmtCost(forecast.avgDailyCost)}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">{trendInfo.label}</p>
        </div>

        {/* 本月已消费 */}
        <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg p-3 border border-green-100">
          <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-1">
            <Calendar size={12} />
            <span>本月已消费</span>
          </div>
          <p className="text-lg font-bold text-slate-900">{fmtCost(forecast.monthToDateCost)}</p>
        </div>

        {/* 预测本月总消费 */}
        <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-lg p-3 border border-amber-100">
          <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-1">
            <TrendingUp size={12} />
            <span>预测本月总消费</span>
          </div>
          <p className="text-lg font-bold text-slate-900">{fmtCost(forecast.predictedMonthTotal)}</p>
        </div>
      </div>

      {/* 趋势图 */}
      {chartData.length > 0 && (
        <div className="pt-4 border-t border-slate-100">
          <p className="text-xs text-slate-500 mb-3">消费趋势（最近7日 + 未来3日预测）</p>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                <YAxis
                  tick={{ fontSize: 11 }}
                  stroke="#94a3b8"
                  tickFormatter={(value) => `¥${value.toFixed(2)}`}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: 8,
                    border: '1px solid #e2e8f0',
                    fontSize: 12,
                  }}
                  formatter={(value: number, name: string) => {
                    if (value === null || value === undefined) return ['-', name]
                    return [fmtCost(value), name]
                  }}
                  labelFormatter={(label) => `日期: ${label}`}
                />
                {/* 分隔线：今日 */}
                <ReferenceLine
                  x={chartData[6]?.date}
                  stroke="#94a3b8"
                  strokeDasharray="4 2"
                  label={{ value: '今日', position: 'top', fontSize: 10, fill: '#94a3b8' }}
                />
                {/* 实际消费线 */}
                <Line
                  type="monotone"
                  dataKey="actual"
                  name="实际消费"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={{ r: 3, fill: '#3b82f6' }}
                  activeDot={{ r: 5 }}
                  connectNulls={false}
                />
                {/* 预测线 */}
                <Line
                  type="monotone"
                  dataKey="predicted"
                  name="预测消费"
                  stroke="#a78bfa"
                  strokeWidth={2}
                  strokeDasharray="4 2"
                  dot={{ r: 2, fill: '#a78bfa' }}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* 耗尽日期提示 */}
      {forecast.depletionDate && (
        <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 p-3 rounded-lg border border-amber-200">
          <Calendar size={14} className="text-amber-500" />
          <span>
            预计余额将在 <strong>{new Date(forecast.depletionDate).toLocaleDateString('zh-CN')}</strong> 耗尽
          </span>
          <Link to="/recharge" className="text-blue-600 hover:underline ml-auto">
            立即充值 →
          </Link>
        </div>
      )}

      {/* 最近7日消费统计 */}
      <div className="flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100">
        <span>最近7日总消费：{fmtCost(forecast.last7DaysCost)}</span>
        <span>预测剩余消费：{fmtCost(forecast.predictedRemainingCost)}</span>
      </div>
    </div>
  )
}
