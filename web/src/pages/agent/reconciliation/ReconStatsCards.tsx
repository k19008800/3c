import { memo, useMemo } from 'react'
import type { SettlementData } from './types'
import { formatAmount } from './types'

// ── Props ──

interface Props {
  data: SettlementData | null
  loading: boolean
}

// ── Component ──

function ReconStatsCards({ data, loading }: Props) {
  const items = useMemo(() => {
    if (!data) return []
    return [
      { label: '期初余额', value: formatAmount(data.openingBalance), color: 'text-slate-700', highlight: false },
      { label: '本月扣费', value: `-${formatAmount(data.monthDeduction)}`, color: 'text-red-600', highlight: false },
      { label: '本月冻结', value: `-${formatAmount(data.monthFreeze)}`, color: 'text-amber-600', highlight: false },
      {
        label: '本月解冻',
        value: data.monthUnfreeze > 0 ? `+${formatAmount(data.monthUnfreeze)}` : formatAmount(data.monthUnfreeze),
        color: 'text-green-600',
        highlight: false,
      },
      {
        label: '本月退款',
        value: data.monthRefund > 0 ? `+${formatAmount(data.monthRefund)}` : formatAmount(data.monthRefund),
        color: 'text-blue-600',
        highlight: false,
      },
      { label: '期末余额', value: formatAmount(data.closingBalance), color: 'text-indigo-600 font-bold', highlight: true },
    ]
  }, [data])

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bg-white border border-slate-200 rounded-xl p-5 animate-pulse">
            <div className="h-3 w-16 bg-slate-200 rounded mb-2" />
            <div className="h-6 w-24 bg-slate-200 rounded" />
          </div>
        ))}
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {items.map((item, i) => (
        <div
          key={i}
          className={`bg-white border border-slate-200 rounded-xl p-5 ${item.highlight ? 'ring-2 ring-indigo-500' : ''}`}
        >
          <div className="text-sm text-slate-500 mb-2">{item.label}</div>
          <div className={`text-xl ${item.color}`}>
            ¥ {item.value}
          </div>
        </div>
      ))}
    </div>
  )
}

export default memo(ReconStatsCards)
