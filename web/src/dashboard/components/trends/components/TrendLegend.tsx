import { TrendingUp, Zap, DollarSign, Clock, CheckCircle, PhoneCall } from 'lucide-react'
import type { TrendLegendProps } from '../types'
import { METRIC_LABELS, CHART_STYLES } from '../utils'

export default function TrendLegend({ 
  metric, 
  chartStyle, 
  onMetricChange, 
  onStyleChange 
}: TrendLegendProps) {
  
  const METRICS = [
    { key: 'calls' as const, icon: PhoneCall },
    { key: 'tokens' as const, icon: Zap },
    { key: 'cost' as const, icon: DollarSign },
    { key: 'revenue' as const, icon: TrendingUp },
    { key: 'duration' as const, icon: Clock },
    { key: 'successRate' as const, icon: CheckCircle },
  ]

  return (
    <div className="flex items-center gap-4">
      {/* Metrics */}
      <div className="flex gap-1">
        {METRICS.map((m) => {
          const Icon = m.icon
          return (
            <button
              key={m.key}
              onClick={() => onMetricChange(m.key)}
              className={`flex items-center gap-1 px-2 py-1 text-xs border rounded ${
                metric === m.key
                  ? 'bg-blue-50 text-blue-700 border-blue-300'
                  : 'hover:bg-slate-50'
              }`}
            >
              <Icon size={14} />
              {METRIC_LABELS[m.key]}
            </button>
          )
        })}
      </div>

      {/* Chart Styles */}
      <div className="flex gap-1">
        {CHART_STYLES.map((s) => (
          <button
            key={s.key}
            onClick={() => onStyleChange(s.key)}
            className={`px-2 py-1 text-xs border rounded ${
              chartStyle === s.key
                ? 'bg-slate-100 text-slate-700 border-slate-300'
                : 'hover:bg-slate-50'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  )
}