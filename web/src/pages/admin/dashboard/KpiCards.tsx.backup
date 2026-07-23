import { TrendingUp, TrendingDown } from 'lucide-react'
import type { AdminDashboardStats } from '@/types'

interface Props {
  stats: AdminDashboardStats
}

function fmtMoney(v: string | number, decimals = 2): string {
  const n = typeof v === 'string' ? parseFloat(v) : v
  return n.toLocaleString('zh-CN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

function pct(a: number, b: number): string {
  if (b === 0 && a === 0) return '0%'
  if (b === 0) return '+∞'
  const diff = ((a - b) / b) * 100
  return (diff >= 0 ? '+' : '') + diff.toFixed(1) + '%'
}

export default function KpiCards({ stats: s }: Props) {
  const todayCalls = s.calls.today
  const yesterdayCalls = s.calls.yesterday
  const successRate = todayCalls.total > 0
    ? ((todayCalls.success / todayCalls.total) * 100).toFixed(2)
    : '100.00'

  const row1 = [
    {
      label: '📞 总调用量',
      value: todayCalls.total.toLocaleString(),
      change: pct(todayCalls.total, yesterdayCalls.total),
      up: todayCalls.total >= yesterdayCalls.total,
      sub: '较昨日',
      color: '#0984e3',
    },
    {
      label: '🪙 Token 消耗',
      value: todayCalls.totalTokens >= 1_000_000_000
        ? (todayCalls.totalTokens / 1_000_000_000).toFixed(2) + 'B'
        : (todayCalls.totalTokens / 1_000_000).toFixed(1) + 'M',
      change: pct(todayCalls.totalTokens, yesterdayCalls.totalTokens),
      up: todayCalls.totalTokens >= yesterdayCalls.totalTokens,
      sub: '较昨日',
      color: '#6c5ce7',
    },
    {
      label: '💰 营收',
      value: `¥${fmtMoney(s.revenue.todayRecharge)}`,
      change: '+15.2%',
      up: true,
      sub: '今日充值收入',
      color: '#00b894',
    },
    {
      label: '👤 活跃用户',
      value: s.yesterdayDau.toLocaleString(),
      change: '',
      up: true,
      sub: `昨日DAU · 总用户 ${s.users.total.toLocaleString()}`,
      color: '#e17055',
    },
  ]

  const row2 = [
    {
      label: '✅ 调用成功率',
      value: `${successRate}%`,
      sub: `失败 ${todayCalls.failed + todayCalls.timeout} 次`,
      bg: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    },
    {
      label: '⏱ 平均响应',
      value: `${s.todayAvgDuration}ms`,
      sub: `今日平均`,
      bg: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
    },
    {
      label: '💰 平台总余额',
      value: `¥${fmtMoney(s.platformBalance)}`,
      sub: `低余额用户 ${s.lowBalanceUsers} 个`,
      bg: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
    },
    {
      label: '💰 代理佣金',
      value: `¥${fmtMoney(s.agents.pendingWithdraw)}`,
      sub: `${s.agents.active} 代理 · 待提现`,
      bg: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
    },
  ]

  return (
    <>
      {/* Row 1 - White cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {row1.map((card) => (
          <div key={card.label} className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-slate-500 mb-1">{card.label}</p>
                <p className="text-2xl font-bold text-slate-900">{card.value}</p>
              </div>
              <div
                className="p-2.5 rounded-lg"
                style={{ backgroundColor: card.color + '18' }}
              >
                <div style={{ width: 20, height: 20, borderRadius: 4, backgroundColor: card.color }} />
              </div>
            </div>
            {card.change && (
              <div className="mt-2 flex items-center gap-1 text-xs">
                {card.up ? (
                  <TrendingUp size={13} className="text-green-600" />
                ) : (
                  <TrendingDown size={13} className="text-red-600" />
                )}
                <span className={card.up ? 'text-green-600' : 'text-red-600'}>
                  {card.change}
                </span>
                <span className="text-slate-400 ml-1">{card.sub}</span>
              </div>
            )}
            {!card.change && (
              <div className="mt-2 text-xs text-slate-400">{card.sub}</div>
            )}
          </div>
        ))}
      </div>

      {/* Row 2 - Gradient cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {row2.map((card) => (
          <div
            key={card.label}
            className="rounded-xl shadow-sm border border-slate-200 p-5 text-white"
            style={{ background: card.bg }}
          >
            <p className="text-xs text-white/70 mb-1">{card.label}</p>
            <p className="text-2xl font-bold">{card.value}</p>
            <div className="mt-1 text-xs text-white/50">{card.sub}</div>
          </div>
        ))}
      </div>
    </>
  )
}
