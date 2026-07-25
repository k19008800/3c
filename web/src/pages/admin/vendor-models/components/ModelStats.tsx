import { useMemo } from 'react'
import MiniChart from '@/components/ui/MiniChart'
import { generateTrendData } from '../types'
import type { VendorModel } from '@/types'

interface ModelStatsProps {
  items: VendorModel[]
}

export default function ModelStats({ items }: ModelStatsProps) {
  const stats = useMemo(() => {
    const total = items.length
    const active = items.filter(item => item.status === true).length
    const down = items.filter(item => item.isDown === true).length
    const disabled = items.filter(item => item.status === false).length
    
    return { total, active, down, disabled }
  }, [items])

  const cards = useMemo(() => [
    {
      label: '总映射数',
      value: stats.total,
      color: '#3b82f6',
      textColor: 'text-slate-900',
      seed: 0,
      baseValue: Math.max(stats.total,15),
    },
    {
      label: '正常',
      value: stats.active,
      color: '#22c55e',
      textColor: 'text-green-600',
      seed: 1,
      baseValue: Math.max(stats.active, 1),
    },
    {
      label: '宕机',
      value: stats.down,
      color: '#ef4444',
      textColor: 'text-red-600',
      seed: 2,
      baseValue: Math.max(stats.down, 1),
    },
    {
      label: '已禁用',
      value: stats.disabled,
      color: '#94a3b8',
      textColor: 'text-slate-400',
      seed: 3,
      baseValue: Math.max(stats.disabled, 1),
    },
  ], [stats])

  if (items.length === 0) {
    return null
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