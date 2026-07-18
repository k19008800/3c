import { useMemo } from 'react'
import { Wallet, DollarSign, TrendingUp, Lock, CalendarDays } from 'lucide-react'
import type { SettlementData } from './types'
import { formatAmount } from './types'

interface Props {
  account: SettlementData['account']
  monthSummary: SettlementData['monthSummary']
}

export default function FinanceStatsCards({ account, monthSummary }: Props) {
  const cards = useMemo(() => [
    {
      label: '可用余额',
      value: formatAmount(account.available),
      color: 'border-green-200',
      bg: 'bg-green-500',
      icon: Wallet,
      textColor: 'text-green-600',
    },
    {
      label: '已结算佣金',
      value: formatAmount(account.settledCommission),
      color: 'border-slate-200',
      bg: 'bg-blue-500',
      icon: DollarSign,
      textColor: 'text-blue-600',
    },
    {
      label: '提现处理中',
      value: formatAmount(account.pendingWithdraw),
      color: 'border-slate-200',
      bg: 'bg-amber-500',
      icon: TrendingUp,
      textColor: 'text-amber-600',
    },
    {
      label: '冻结金额',
      value: formatAmount(account.frozenAmount),
      sub: `兑换码锁定: ¥${formatAmount(account.redemptionLocked)}`,
      color: 'border-slate-200',
      bg: 'bg-orange-500',
      icon: Lock,
      textColor: 'text-orange-600',
    },
  ], [account])

  const netChangeColor = monthSummary.netChange >= 0 ? 'text-green-600' : 'text-red-600'

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => (
          <div key={c.label} className={`bg-white rounded-xl p-6 shadow-sm border ${c.color}`}>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-slate-500">{c.label}</p>
                <p className={`text-2xl font-bold ${c.textColor} mt-1`}>¥{c.value}</p>
                {c.sub && <p className="text-xs text-slate-400 mt-1">{c.sub}</p>}
              </div>
              <div className={`p-3 rounded-lg ${c.bg}`}>
                <c.icon size={24} className="text-white" />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
        <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2 mb-4">
          <CalendarDays size={16} className="text-blue-500" />
          本月汇总（近30天）
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center p-4 bg-red-50 rounded-lg">
            <p className="text-xs text-red-500 font-medium">扣款</p>
            <p className="text-lg font-bold text-red-600 mt-1">¥{monthSummary.deduction.toFixed(2)}</p>
          </div>
          <div className="text-center p-4 bg-orange-50 rounded-lg">
            <p className="text-xs text-orange-500 font-medium">冻结</p>
            <p className="text-lg font-bold text-orange-600 mt-1">¥{monthSummary.freeze.toFixed(2)}</p>
          </div>
          <div className="text-center p-4 bg-green-50 rounded-lg">
            <p className="text-xs text-green-500 font-medium">解冻/退款</p>
            <p className="text-lg font-bold text-green-600 mt-1">¥{monthSummary.unfreeze.toFixed(2)}</p>
          </div>
          <div className="text-center p-4 bg-blue-50 rounded-lg">
            <p className="text-xs text-blue-500 font-medium">净变化</p>
            <p className={`text-lg font-bold mt-1 ${netChangeColor}`}>
              {monthSummary.netChange >= 0 ? '+' : ''}{monthSummary.netChange.toFixed(2)}
            </p>
          </div>
        </div>
      </div>
    </>
  )
}
