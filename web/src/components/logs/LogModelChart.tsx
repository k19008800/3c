import { useEffect, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Cell,
} from 'recharts'
import { get } from '@/lib/api'
import type { ModelStatsItem } from '@/types'
import { Loader2, AlertCircle } from 'lucide-react'

const COLORS = [
  '#3b82f6', '#8b5cf6', '#06b6d4', '#10b981',
  '#f59e0b', '#ef4444', '#ec4899', '#6366f1',
  '#14b8a6', '#84cc16',
]

interface Props {
  startDate?: string
  endDate?: string
}

export default function LogModelChart({ startDate, endDate }: Props) {
  const [data, setData] = useState<ModelStatsItem[]>([])
  const [tab, setTab] = useState<'calls' | 'tokens' | 'cost'>('calls')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    setLoading(true)
    setError('')
    const params: Record<string, string> = { limit: '10' }
    if (startDate) params.startDate = startDate
    if (endDate) params.endDate = endDate
    get<{ list: ModelStatsItem[] }>('/api/v1/logs/stats/by-model', params)
      .then((res) => setData(res.list || []))
      .catch((err) => setError(err.message || '获取模型统计失败'))
      .finally(() => setLoading(false))
  }, [startDate, endDate])

  const getChartData = () => {
    switch (tab) {
      case 'tokens':
        return data.map((d) => ({
          name: d.modelName || '未知',
          value: d.totalTokens || 0,
          label: (d.totalTokens || 0).toLocaleString(),
        }))
      case 'cost':
        return data.map((d) => ({
          name: d.modelName || '未知',
          value: parseFloat(d.totalCost || '0'),
          label: `¥${Number(d.totalCost || 0).toFixed(4)}`,
        }))
      default:
        return data.map((d) => ({
          name: d.modelName || '未知',
          value: d.calls || 0,
          label: `${d.calls} 次`,
        }))
    }
  }

  const chartData = getChartData()

  if (loading) {
    return (
      <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="animate-spin" size={24} />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
        <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm">
          <AlertCircle size={16} />
          {error}
        </div>
      </div>
    )
  }

  if (chartData.length === 0) return null

  return (
    <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-900">模型用量 Top 10</h3>
        <div className="flex items-center gap-1">
          {([
            { key: 'calls' as const, label: '调用' },
            { key: 'tokens' as const, label: 'Token' },
            { key: 'cost' as const, label: '消费' },
          ]).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-2.5 py-1 text-xs rounded-md transition ${
                tab === t.key
                  ? 'bg-indigo-100 text-indigo-700 font-medium'
                  : 'text-slate-500 hover:bg-slate-100'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Horizontal bar chart */}
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 0, right: 60, bottom: 0, left: 80 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 10 }} stroke="#94a3b8" />
            <YAxis
              type="category"
              dataKey="name"
              tick={{ fontSize: 11 }}
              stroke="#94a3b8"
              width={80}
            />
            <Tooltip
              contentStyle={{
                borderRadius: 8,
                border: '1px solid #e2e8f0',
                fontSize: 12,
              }}
              formatter={(_: any, __: any, props: any) => [props.payload.label, props.payload.name]}
            />
            <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={20}>
              {chartData.map((_, index) => (
                <Cell key={index} fill={COLORS[index % COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
