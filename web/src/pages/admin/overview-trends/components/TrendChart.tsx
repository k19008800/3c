import {
  LineChart, Line, BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import type { MetricKey } from '../types'

interface TrendChartProps {
  data: any[]
  metric: MetricKey
  chartStyle: 'line' | 'bar' | 'area'
  color: string
}

const METRIC_COLORS: Record<MetricKey, string> = {
  calls: '#0984e3',
  tokens: '#6c5ce7',
  cost: '#e17055',
  revenue: '#00b894',
  duration: '#fdcb6e',
  successRate: '#00cec9',
}

export default function TrendChart({ data, metric, chartStyle, color }: TrendChartProps) {
  if (data.length === 0) return null

  const chartColor = color || METRIC_COLORS[metric]

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        {chartStyle === 'area' ? (
          <AreaChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Area
              type="monotone"
              dataKey={metric}
              stroke={chartColor}
              fill={chartColor}
              fillOpacity={0.3}
            />
          </AreaChart>
        ) : chartStyle === 'bar' ? (
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Bar dataKey={metric} fill={chartColor} />
          </BarChart>
        ) : (
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Line
              type="monotone"
              dataKey={metric}
              stroke={chartColor}
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  )
}