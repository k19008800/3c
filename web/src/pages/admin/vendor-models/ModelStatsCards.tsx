import { useMemo } from 'react'
import MiniChart from '@/components/ui/MiniChart'
import { generateTrendData } from './types'

interface ModelStatsCardsProps {
  total: number
  active: number
  down: number
  disabled: number
  loading?: boolean
}

interface CardDef {
  label: string
  value: number
  color: string
  textColor: string
  seed: number
  baseValue: number
}

export default function ModelStatsCards({
  total,
  active,
  down,
  disabled,
  loading = false,
}: ModelStatsCardsProps) {
  const cards: CardDef[] = useMemo(
    () => [
      {
        label: '总映射数',
        value: total,
        color: '#3b82f6',
        textColor: 'text-slate-900',
        seed: 0,
        baseValue: Math.max(total, 1),
      },
      {
        label: '正常',
        value: active,
        color: '#22c55e',
        textColor: 'text-green-600',
        seed: 1,
        baseValue: Math.max(active, 1),
      },
      {
        label: '宕机',
        value: down,
        color: '#ef4444',
        textColor: 'text-red-600',
        seed: 2,
        baseValue: Math.max(down, 1),
      },
      {
        label: '已禁用',
        value: disabled,
        color: '#94a3b8',
        textColor: 'text-slate-400',
        seed: 3,
        baseValue: Math.max(disabled, 1),
      },
    ],
    [total, active, down, disabled]
  )

  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="bg-white rounded-xl p-4 shadow-sm border border-slate-200 animate-pulse"
          >
            <div className="h-3 w-16 bg-slate-200 rounded mb-3" />
            <div className="h-7 w-12 bg-slate-200 rounded mb-2" />
            <div className="h-8 bg-slate-100 rounded" />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className="bg-white rounded-xl p-4 shadow-sm border border-slate-200"
        >
          <p className="text-xs text-slate-500 mb-1">{card.label}</p>
          <p className={`text-2xl font-bold ${card.textColor}`}>
            {card.value}
          </p>
          <div className="mt-1 -mx-1">
            <MiniChart
              data={generateTrendData(card.baseValue, 7, card.seed)}
              width={200}
              height={28}
              color={card.color}
              showDot={false}
              gradient={true}
            />
          </div>
        </div>
      ))}
    </div>
  )
}
