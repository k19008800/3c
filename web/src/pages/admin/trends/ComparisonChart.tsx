import { useMemo } from 'react'
import type { DaySeries } from './types'
import { calcStdDev, fmtNum, dayOfWeek } from './types'

/* ═══════════════════════════════════════════════════
   ComparisonChart — peak / avg / min / CV analysis
   ═══════════════════════════════════════════════════ */

interface ComparisonChartProps {
  series: DaySeries[]
}

export default function ComparisonChart({ series }: ComparisonChartProps) {
  const peakCards = useMemo(() => {
    const callValues = series.map((s) => s.calls.total)
    if (callValues.length === 0) return []

    const callAvg = callValues.reduce((a, b) => a + b, 0) / callValues.length
    const callMax = Math.max(...callValues)
    const callMin = Math.min(...callValues)
    const callStdDev = calcStdDev(callValues, callAvg)
    const callCV = callAvg > 0 ? (callStdDev / callAvg) * 100 : 0
    const maxIdx = callValues.indexOf(callMax)
    const minIdx = callValues.indexOf(callMin)

    const labels = series.map((s) => s.date)

    return [
      {
        icon: '🏆',
        label: '最高日调用量',
        value: fmtNum(callMax),
        sub: `${labels[maxIdx] ?? ''} ${dayOfWeek(labels[maxIdx] ?? '')} · 超日均 ${
          callAvg > 0
            ? `+${((callMax / callAvg - 1) * 100).toFixed(0)}%`
            : '-'
        }`,
        bg: 'bg-purple-50',
        border: 'border-purple-200',
        labelColor: 'text-purple-700',
        valColor: 'text-purple-900',
        subColor: 'text-purple-400',
      },
      {
        icon: '📊',
        label: '日均调用量',
        value: fmtNum(Math.round(callAvg)),
        sub: `±${fmtNum(Math.round(callStdDev))} 标准差`,
        bg: 'bg-amber-50',
        border: 'border-amber-200',
        labelColor: 'text-amber-700',
        valColor: 'text-amber-900',
        subColor: 'text-amber-400',
      },
      {
        icon: '⬇️',
        label: '最低日调用量',
        value: fmtNum(callMin),
        sub: `${labels[minIdx] ?? ''} ${dayOfWeek(labels[minIdx] ?? '')}`,
        bg: 'bg-blue-50',
        border: 'border-blue-200',
        labelColor: 'text-blue-700',
        valColor: 'text-blue-900',
        subColor: 'text-blue-400',
      },
      {
        icon: '📈',
        label: '波动系数',
        value: `${callCV.toFixed(1)}%`,
        sub:
          callCV > 30
            ? 'CV=σ/μ · 高波动⚠️'
            : callCV > 15
              ? 'CV=σ/μ · 中等波动'
              : 'CV=σ/μ · 稳定',
        bg: callCV > 30 ? 'bg-red-50' : 'bg-green-50',
        border: callCV > 30 ? 'border-red-200' : 'border-green-200',
        labelColor: callCV > 30 ? 'text-red-700' : 'text-green-700',
        valColor: callCV > 30 ? 'text-red-900' : 'text-green-900',
        subColor: callCV > 30 ? 'text-red-400' : 'text-green-400',
      },
    ]
  }, [series])

  if (peakCards.length === 0) return null

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {peakCards.map((card) => (
        <div key={card.label} className={`${card.bg} ${card.border} rounded-xl border p-4`}>
          <div className={card.labelColor} style={{ fontSize: 24, lineHeight: 1 }}>
            {card.icon}
          </div>
          <p className={`text-[11px] ${card.labelColor} mt-1`}>{card.label}</p>
          <p className={`text-lg font-bold ${card.valColor} mt-0.5`}>{card.value}</p>
          <p className={`text-[10px] ${card.subColor} mt-0.5`}>{card.sub}</p>
        </div>
      ))}
    </div>
  )
}
