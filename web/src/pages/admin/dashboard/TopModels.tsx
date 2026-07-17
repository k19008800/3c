/**
 * TopModels — Top 模型排行
 *
 * 展示调用量最高的模型及其 Token 消耗排行列表。
 */

import { useMemo } from 'react'
import type { AdminDashboardStats } from '@/types'

interface Props {
  models: AdminDashboardStats['topModels']
  title?: string
}

/* ── Token formatter ── */

function fmtTokens(v: number): string {
  if (v >= 1_000_000_000) return (v / 1_000_000_000).toFixed(2) + 'B'
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + 'M'
  if (v >= 1_000) return (v / 1_000).toFixed(1) + 'K'
  return v.toLocaleString()
}

/* ── Ranking colors ── */

const rankColors = [
  { bg: 'bg-amber-100', text: 'text-amber-700', label: '1st' },
  { bg: 'bg-slate-200', text: 'text-slate-600', label: '2nd' },
  { bg: 'bg-orange-100', text: 'text-orange-700', label: '3rd' },
  { bg: 'bg-slate-100', text: 'text-slate-500', label: `#4` },
  { bg: 'bg-slate-100', text: 'text-slate-500', label: `#5` },
]

const barGradients = [
  'from-blue-500 to-blue-400',
  'from-violet-500 to-violet-400',
  'from-emerald-500 to-emerald-400',
  'from-cyan-500 to-cyan-400',
  'from-sky-500 to-sky-400',
]

export default function TopModels({
  models,
  title = 'Top 模型排行',
}: Props) {
  const sorted = useMemo(
    () => [...(models ?? [])].sort((a, b) => b.totalTokens - a.totalTokens),
    [models],
  )

  const maxTokens = sorted.length > 0 ? sorted[0].totalTokens : 1

  /* ── Empty ── */
  if (sorted.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        <div className="px-5 py-4 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
        </div>
        <div className="text-center py-10 text-sm text-slate-400">暂无模型数据</div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200">
      <div className="px-5 py-4 border-b border-slate-100">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
          <span className="text-xs text-slate-400">
            共 {sorted.length} 个模型
          </span>
        </div>
      </div>
      <div className="p-5 space-y-3">
        {sorted.slice(0, 10).map((m, i) => {
          const pct = (m.totalTokens / maxTokens) * 100
          const rank = rankColors[Math.min(i, 4)]
          return (
            <div key={m.modelName} className="flex items-center gap-3">
              {/* Rank badge */}
              <span
                className={`inline-flex items-center justify-center w-7 h-5 text-[10px] font-semibold rounded ${rank.bg} ${rank.text} shrink-0`}
              >
                {rank.label}
              </span>

              {/* Model name */}
              <span
                className="text-xs text-slate-700 w-[140px] truncate shrink-0"
                title={m.modelName}
              >
                {m.modelName}
              </span>

              {/* Bar */}
              <div className="flex-1 h-4 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full bg-gradient-to-r ${barGradients[i < 5 ? i : 4]}`}
                  style={{ width: `${Math.max(pct, 1)}%`, transition: 'width 0.4s ease' }}
                />
              </div>

              {/* Calls count */}
              <span className="text-[11px] text-slate-400 w-12 text-right shrink-0">
                {m.total.toLocaleString()}
              </span>

              {/* Tokens */}
              <span className="text-xs font-semibold text-slate-600 w-14 text-right shrink-0">
                {fmtTokens(m.totalTokens)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
