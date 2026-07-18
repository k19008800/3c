import { useMemo } from 'react'
import MiniChart from '@/components/ui/MiniChart'
import type { PageContent } from './types'

interface StatsCardsProps {
  pages: PageContent[]
  loading: boolean
}

export default function ContentStatsCards({ pages, loading }: StatsCardsProps) {
  const stats = useMemo(() => {
    const published = pages.filter((p) => p.status).length
    const draft = pages.filter((p) => !p.status).length
    const recent7 = pages.filter((p) => {
      const d = new Date(p.updated_at)
      const weekAgo = Date.now() - 7 * 86400000
      return d.getTime() > weekAgo
    }).length
    return { total: pages.length, published, draft, recent7 }
  }, [pages])

  const trend = useMemo(() => {
    const days: Record<string, number> = {}
    pages.forEach((p) => {
      const day = new Date(p.updated_at).toLocaleDateString('zh-CN')
      days[day] = (days[day] || 0) + 1
    })
    return Object.entries(days)
      .slice(-7)
      .map(([, count]) => ({ value: count }))
  }, [pages])

  const cards = [
    { label: '总页面', value: stats.total.toString(), color: '#3b82f6' },
    { label: '已发布', value: stats.published.toString(), color: '#22c55e' },
    { label: '草稿', value: stats.draft.toString(), color: '#f97316' },
    { label: '近7天更新', value: stats.recent7.toString(), color: '#a855f7' },
  ]

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className="bg-white border border-slate-200 rounded-xl p-4 space-y-2"
        >
          <span className="text-xs text-slate-500 font-medium">{card.label}</span>
          {loading ? (
            <div className="w-16 h-7 bg-slate-200 animate-pulse rounded" />
          ) : (
            <span className="text-xl font-bold text-slate-900">{card.value}</span>
          )}
          <MiniChart data={trend} type="bar" width={120} height={20} color={card.color} gradient={false} />
        </div>
      ))}
    </div>
  )
}
