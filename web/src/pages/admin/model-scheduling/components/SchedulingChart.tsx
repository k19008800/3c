import {
  LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import type { SchedulingRealtimeMinute } from '@/types'
import { getModelColor } from '../types'

interface SchedulingChartProps {
  data: SchedulingRealtimeMinute[]
  metric: 'rpm' | 'tpm'
  chartStyle: 'line' | 'area'
}

export default function SchedulingChart({ data, metric, chartStyle }: SchedulingChartProps) {
  if (data.length === 0) return null

  // 获取所有模型名
  const models = [...new Set(data.flatMap(d => d.models?.map(m => m.modelName) || []))]

  // 转换为图表数据格式
  const chartData = data.map(d => {
    const point: Record<string, any> = { time: d.time }
    d.models?.forEach(m => {
      point[m.modelName] = metric === 'rpm' ? m.rpm : m.tpm
    })
    return point
  })

  return (
    <div className="h-80">
      <ResponsiveContainer width="100%" height="100%">
        {chartStyle === 'area' ? (
          <AreaChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="time" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip />
            <Legend />
            {models.map((model, idx) => (
              <Area
                key={model}
                type="monotone"
                dataKey={model}
                stroke={getModelColor(model, idx)}
                fill={getModelColor(model, idx)}
                fillOpacity={0.3}
              />
            ))}
          </AreaChart>
        ) : (
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="time" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip />
            <Legend />
            {models.map((model, idx) => (
              <Line
                key={model}
                type="monotone"
                dataKey={model}
                stroke={getModelColor(model, idx)}
                strokeWidth={2}
                dot={false}
              />
            ))}
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  )
}