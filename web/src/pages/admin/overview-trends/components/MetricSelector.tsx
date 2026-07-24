import { TrendingUp, Zap, DollarSign, Clock, CheckCircle, PhoneCall } from 'lucide-react'
import type { MetricKey, ChartStyle } from '../types'

interface MetricSelectorProps {
  activeMetric: MetricKey
  onMetricChange: (m: MetricKey) => void
  chartStyle: ChartStyle
  onStyleChange: (s: ChartStyle) => void
}

const METRICS: { key: MetricKey; label: string; icon: any }[] = [
  { key: 'calls', label: '调用量', icon: PhoneCall },
  { key: 'tokens', label: 'Token', icon: Zap },
  { key: 'cost', label: '成本', icon: DollarSign },
  { key: 'revenue', label: '收入', icon: TrendingUp },
  { key: 'duration', label: '延迟', icon: Clock },
  { key: 'successRate', label: '成功率', icon: CheckCircle },
]

const STYLES: { key: ChartStyle; label: string }[] = [
  { key: 'line', label: '折线' },
  { key: 'area', label: '面积' },
  { key: 'bar', label: '柱状' },
]

export default function MetricSelector({
  activeMetric,
  onMetricChange,
  chartStyle,
  onStyleChange,
}: MetricSelectorProps) {
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
                activeMetric === m.key
                  ? 'bg-blue-50 text-blue-700 border-blue-300'
                  : 'hover:bg-slate-50'
              }`}
            >
              <Icon size={14} />
              {m.label}
            </button>
          )
        })}
      </div>

      {/* Chart Styles */}
      <div className="flex gap-1">
        {STYLES.map((s) => (
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