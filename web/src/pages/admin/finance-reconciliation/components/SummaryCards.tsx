import { DollarSign, Receipt, TrendingUp, Percent } from 'lucide-react'
import type { ReconciliationReport } from '@/types'
import { fmt, fmtCompact } from '../types'

interface SummaryCardsProps {
  report: ReconciliationReport | null
}

export default function SummaryCards({ report }: SummaryCardsProps) {
  const summary = report?.summary
  const cards = [
    {
      icon: DollarSign,
      label: '佣金总额',
      value: summary?.commission?.totalCommission,
      color: 'text-green-600'
    },
    {
      icon: Receipt,
      label: '提现总额',
      value: summary?.withdraw?.totalAmount,
      color: 'text-red-600'
    },
    {
      icon: TrendingUp,
      label: '充值总额',
      value: summary?.recharge?.totalAmount,
      color: 'text-blue-600'
    },
    {
      icon: Percent,
      label: '净收入',
      value: summary?.commission?.totalNet,
      color: 'text-purple-600'
    },
  ]

  return (
    <div className="grid grid-cols-4 gap-4">
      {cards.map((c, idx) => (
        <div key={idx} className="bg-white rounded-xl border p-4">
          <div className="flex items-center gap-2 text-slate-600 mb-2">
            <c.icon size={18} />
            <span className="text-sm">{c.label}</span>
          </div>
          <div className={`text-2xl font-bold ${c.color}`}>
            {c.value ? fmtCompact(c.value) : '—'}
          </div>
        </div>
      ))}
    </div>
  )
}