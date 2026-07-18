import { useMemo } from 'react'
import type { AdminModel } from '@/types'

interface Props {
  models: AdminModel[]
  loading: boolean
  total: number
}

const TYPE_COLORS: Record<string, string> = {
  chat: 'bg-blue-500',
  embedding: 'bg-green-500',
  image: 'bg-purple-500',
  audio: 'bg-orange-500',
}

export default function ModelStatsCards({ models, loading, total }: Props) {
  const stats = useMemo(() => {
    const enabled = models.filter((m) => m.status).length
    const types = new Set(models.map((m) => m.type))
    return { enabled, disabled: models.length - enabled, typeCount: types.size }
  }, [models])

  const chartBars = useMemo(() => {
    const counts: Record<string, number> = {}
    models.forEach((m) => {
      counts[m.type] = (counts[m.type] || 0) + 1
    })
    const max = Math.max(...Object.values(counts), 1)
    return Object.entries(counts).map(([type, count]) => ({
      type,
      count,
      pct: (count / max) * 100,
    }))
  }, [models])

  if (loading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 animate-pulse"
          >
            <div className="h-3 w-16 bg-slate-200 rounded mb-3" />
            <div className="h-7 w-12 bg-slate-200 rounded" />
          </div>
        ))}
      </div>
    )
  }

  if (models.length === 0 && !total) {
    return null
  }

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
        <p className="text-xs text-slate-500 mb-1">模型总数</p>
        <p className="text-2xl font-bold text-slate-900">{total}</p>
      </div>
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
        <p className="text-xs text-slate-500 mb-1">已启用</p>
        <p className="text-2xl font-bold text-green-600">{stats.enabled}</p>
        {stats.disabled > 0 && (
          <p className="text-xs text-slate-400 mt-0.5">
            停用 {stats.disabled}
          </p>
        )}
      </div>
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
        <p className="text-xs text-slate-500 mb-1">模型类型数</p>
        <p className="text-2xl font-bold text-purple-600">{stats.typeCount}</p>
      </div>
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
        <p className="text-xs text-slate-500 mb-2">类型分布</p>
        {chartBars.length === 0 ? (
          <p className="text-xs text-slate-400">暂无数据</p>
        ) : (
          <div className="flex items-end gap-1 h-10">
            {chartBars.map(({ type, count, pct }) => (
              <div key={type} className="flex-1 flex flex-col items-center gap-0.5">
                <div
                  className={`w-full rounded-t transition-all ${
                    TYPE_COLORS[type] || 'bg-slate-400'
                  }`}
                  style={{ height: `${Math.max(pct, 4)}%` }}
                  title={`${type}: ${count}`}
                />
                <span className="text-[10px] text-slate-400 truncate w-full text-center">
                  {type.length > 5 ? type.slice(0, 4) + '…' : type}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
