import { useMemo } from 'react'
import { Loader2, ChevronUp, Clock, Zap } from 'lucide-react'
import type { HourlyData } from './types'
import { shortDate, dayOfWeek, fmtNum, formatHour, movingAverage } from './types'

/* ═══════════════════════════════════════════════════
   TimeSeriesChart — bar chart with MA line
   ═══════════════════════════════════════════════════ */

interface TimeSeriesChartProps {
  data: { label: string; value: number }[]
  title: string
  unit: string
  barGradientFrom: string
  barGradientTo: string
  peakColor: string
  formatValue: (v: number) => string
  onBarClick?: (index: number, label: string) => void
}

export default function TimeSeriesChart({
  data, title, unit, barGradientFrom, barGradientTo, peakColor, formatValue, onBarClick,
}: TimeSeriesChartProps) {
  const stats = useMemo(() => {
    const vals = data.map((d) => d.value)
    const mx = Math.max(...vals, 1)
    const av = vals.reduce((a, b) => a + b, 0) / vals.length
    const pi = vals.indexOf(mx)
    const sp = Math.max(...vals.filter((v) => v < mx), 0)
    return { values: vals, max: mx, avg: av, peakIndex: pi, secondPeak: sp, secondPeakIndex: vals.indexOf(sp), highlightThreshold: mx * 0.85 }
  }, [data])

  const { values: vs, max, avg, peakIndex, secondPeak, secondPeakIndex, highlightThreshold } = stats

  const maWindow = data.length >= 20 ? 5 : data.length >= 10 ? 3 : 0
  const maValues = maWindow > 0 ? movingAverage(vs, maWindow) : []

  if (data.length === 0) return null

  const PT = 28, PB = 22, CH = 180, YR = CH - PT - PB
  const effectiveMax = Math.max(max, 1)
  const toY = (v: number) => CH - PB - (v / effectiveMax) * YR

  const n = data.length
  const BAW = 100
  const gap = Math.max(1.5, Math.min(4, BAW / n / 4))
  const bw = Math.max(3, Math.min(20, (BAW - gap * (n + 1)) / n))

  const maPts: string[] = []
  maValues.forEach((v, i) => {
    if (v === null) return
    maPts.push(`${gap + i * (bw + gap) + bw / 2},${toY(v)}`)
  })

  const xLabelInt = n <= 10 ? 1 : n <= 20 ? 2 : 3
  const barX = (i: number) => gap + i * (bw + gap)
  const annotatePeak = peakIndex >= 0

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
        <div className="flex items-center gap-3 text-[10px] text-slate-400">
          <span>日均 {formatValue(avg)}</span>
          <span>峰值 {formatValue(max)}</span>
        </div>
      </div>
      <svg viewBox={`0 0 ${BAW} ${CH}`} className="w-full cursor-pointer" preserveAspectRatio="none" style={{ height: 140 }}>
        <defs>
          <linearGradient id={`bg-${title}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={barGradientFrom} stopOpacity="0.85" />
            <stop offset="100%" stopColor={barGradientTo} stopOpacity="0.35" />
          </linearGradient>
          <linearGradient id={`pg-${title}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={peakColor} stopOpacity="0.9" />
            <stop offset="100%" stopColor={peakColor} stopOpacity="0.5" />
          </linearGradient>
          <linearGradient id={`ag-${title}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={barGradientFrom} stopOpacity="0.15" />
            <stop offset="100%" stopColor={barGradientFrom} stopOpacity="0.02" />
          </linearGradient>
          <filter id={`sh-${title}`}>
            <feDropShadow dx="0" dy="1" stdDeviation="1.5" floodColor={barGradientFrom} floodOpacity="0.25" />
          </filter>
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map((f) => {
          const y = CH - PB - f * YR
          return <line key={f} x1={gap} y1={y} x2={BAW - gap} y2={y} stroke="#e2e8f0" strokeWidth="0.5" />
        })}
        {maPts.length > 1 && (
          <polygon points={`${maPts.join(' ')} ${maPts[maPts.length - 1].split(',')[0]},${CH - PB} ${maPts[0].split(',')[0]},${CH - PB}`} fill={`url(#ag-${title})`} />
        )}
        {data.map((d, i) => {
          const h = Math.max(1, (d.value / effectiveMax) * YR)
          const x = barX(i)
          const y = CH - PB - h
          const isPk = i === peakIndex
          return (
            <g key={d.label}>
              <rect x={x} y={y} width={bw} height={h} rx={1.5} className="transition-opacity duration-200 hover:opacity-80"
                fill={isPk ? `url(#pg-${title})` : `url(#bg-${title})`}
                filter={d.value >= highlightThreshold ? `url(#sh-${title})` : undefined}
                style={{ cursor: onBarClick ? 'pointer' : 'default' }}
                onClick={() => onBarClick?.(i, d.label)}
              />
              <rect x={x - gap / 2} y={0} width={bw + gap} height={CH} fill="transparent"
                style={{ cursor: onBarClick ? 'pointer' : 'default' }}
                onClick={() => onBarClick?.(i, d.label)}
              />
              <title>{d.label} ({dayOfWeek(d.label)})\n{formatValue(d.value)} {unit}{isPk ? '\n🏆 峰值' : ''}</title>
            </g>
          )
        })}
        {maPts.length > 1 && (
          <polyline points={maPts.join(' ')} fill="none" stroke={barGradientFrom} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity={0.8} />
        )}
        {annotatePeak && (
          <g>
            <text x={barX(peakIndex) + bw / 2} y={toY(max) - 6} textAnchor="middle" fontSize="6" fontWeight="bold" fill={peakColor}>🔺</text>
            <text x={barX(peakIndex) + bw / 2} y={toY(max) - 14} textAnchor="middle" fontSize="5" fill={peakColor} fontWeight="bold">{formatValue(max)}</text>
            <text x={barX(peakIndex) + bw / 2} y={CH - PB + 12} textAnchor="middle" fontSize="5" fill={peakColor}>{shortDate(data[peakIndex].label)}</text>
          </g>
        )}
        {secondPeakIndex !== -1 && secondPeakIndex !== peakIndex && (secondPeak / max) > 0.85 && (
          <text x={barX(secondPeakIndex) + bw / 2} y={toY(secondPeak) - 6} textAnchor="middle" fontSize="5" fill="#f97316" fontWeight="bold">{formatValue(secondPeak)}</text>
        )}
        {data.filter((_, i) => i % xLabelInt === 0 || i === n - 1).map((d) => {
          const idx = data.indexOf(d)
          const isLast = idx === n - 1
          return (
            <text key={d.label} x={barX(idx) + bw / 2} y={CH - 4} textAnchor="middle" fontSize="6"
              fill={isLast ? '#6366f1' : '#94a3b8'} fontWeight={isLast ? 'bold' : 'normal'}>
              {shortDate(d.label)}
            </text>
          )
        })}
      </svg>
    </div>
  )
}

/* ═══════════════════════════════════════════════════
   HourlyDrilldown
   ═══════════════════════════════════════════════════ */

interface HourlyDrilldownProps {
  date: string
  data: HourlyData
  onClose: () => void
}

export function HourlyDrilldown({ date, data, onClose }: HourlyDrilldownProps) {
  const maxHour = Math.max(...data.hours.map((h) => h.total), 1)
  return (
    <div className="bg-white rounded-xl shadow-sm border border-indigo-200 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-300">
      <div className="px-4 py-3 border-b border-indigo-100 flex items-center justify-between bg-indigo-50">
        <div className="flex items-center gap-2">
          <Clock size={16} className="text-indigo-600" />
          <h3 className="text-sm font-semibold text-indigo-800">{date} ({dayOfWeek(date)}) · 时段分布</h3>
          <span className="text-[11px] text-indigo-500">全天 {data.total.toLocaleString()} 次调用</span>
        </div>
        <button onClick={onClose} className="p-1 text-indigo-400 hover:text-indigo-600 transition rounded hover:bg-indigo-100">
          <ChevronUp size={18} />
        </button>
      </div>
      <div className="p-4">
        <svg viewBox="0 0 720 100" className="w-full" style={{ height: 64 }}>
          <defs>
            <linearGradient id="hourGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#818cf8" stopOpacity="0.75" />
              <stop offset="100%" stopColor="#a5b4fc" stopOpacity="0.3" />
            </linearGradient>
          </defs>
          {data.hours.map((h, i) => {
            const bw2 = 26, gap2 = 4, x = i * (bw2 + gap2)
            const hgt = Math.max(1, (h.total / maxHour) * 68), y = 72 - hgt
            const isPk = h.hour === data.peakHour.hour
            return (
              <g key={h.hour}>
                <rect x={x} y={y} width={bw2} height={hgt} rx={2}
                  fill={isPk ? '#ef4444' : 'url(#hourGrad)'} opacity={isPk ? 0.9 : h.total === 0 ? 0.3 : 0.7}>
                  <title>{formatHour(h.hour)}: {h.total.toLocaleString()} 次</title>
                </rect>
                {isPk && <text x={x + bw2 / 2} y={y - 4} textAnchor="middle" fontSize="7" fill="#dc2626" fontWeight="bold">🔺 {h.total.toLocaleString()}</text>}
              </g>
            )
          })}
          {data.hours.filter((h) => h.hour % 3 === 0).map((h) => (
            <text key={h.hour} x={h.hour * 30 + 13} y={86} textAnchor="middle" fontSize="6" fill="#94a3b8">{formatHour(h.hour)}</text>
          ))}
        </svg>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-red-50 text-red-700 rounded-full text-[11px] font-medium">
            <Zap size={12} />
            峰值时段 {formatHour(data.peakHour.hour)} · {data.peakHour.total.toLocaleString()} 次
          </span>
          {data.peakHour.topModels.map((m, i) => (
            <span key={m.modelName}
              className={`inline-flex items-center px-2 py-1 rounded-full text-[11px] ${i === 0 ? 'bg-indigo-50 text-indigo-700 font-medium' : 'bg-slate-50 text-slate-600'}`}>
              #{i + 1} {m.modelName} ({m.total.toLocaleString()}次)
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ── Loading placeholder for drilldown ── */

export function HourlyLoading() {
  return (
    <div className="flex items-center justify-center py-6 bg-white rounded-xl border border-indigo-200">
      <Loader2 className="animate-spin text-indigo-400" size={20} />
    </div>
  )
}
