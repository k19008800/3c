import { useMemo } from 'react'
import { Mail, Send, Activity, TrendingUp } from 'lucide-react'

interface TemplateStatsProps {
  totalTemplates: number
  hasContent: number
  hasEnglish: number
}

/** A tiny inline sparkline bar chart showing relative proportions */
function MiniChart({ values, max }: { values: number[]; max: number }) {
  if (max === 0) return null
  return (
    <div className="flex items-end gap-[2px] h-12 mt-2">
      {values.map((v, i) => {
        const pct = max > 0 ? (v / max) * 100 : 0
        return (
          <div
            key={i}
            className="flex-1 rounded-t bg-blue-500/70 transition-all hover:bg-blue-600"
            style={{ height: `${Math.max(pct, 2)}%` }}
            title={`${v}`}
          />
        )
      })}
    </div>
  )
}

export default function TemplateStats({ totalTemplates, hasContent, hasEnglish }: TemplateStatsProps) {
  const stats = useMemo(() => {
    const withContent = hasContent
    const withEnglish = hasEnglish
    const coveragePct = totalTemplates > 0 ? Math.round((withContent / totalTemplates) * 100) : 0
    const enCoveragePct = totalTemplates > 0 ? Math.round((withEnglish / totalTemplates) * 100) : 0
    return { withContent, withEnglish, coveragePct, enCoveragePct }
  }, [totalTemplates, hasContent, hasEnglish])

  const chartValues = useMemo(() => {
    return [totalTemplates, stats.withContent, stats.withEnglish, stats.coveragePct]
  }, [totalTemplates, stats.withContent, stats.withEnglish, stats.coveragePct])

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Total */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
        <div className="flex items-center gap-2 text-blue-600 mb-1">
          <Mail size={18} />
          <span className="text-xs font-medium uppercase tracking-wider text-slate-400">模板总数</span>
        </div>
        <div className="text-2xl font-bold text-slate-900">{totalTemplates}</div>
        <MiniChart values={chartValues} max={Math.max(...chartValues, 1)} />
      </div>

      {/* With content */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
        <div className="flex items-center gap-2 text-green-600 mb-1">
          <Send size={18} />
          <span className="text-xs font-medium uppercase tracking-wider text-slate-400">已配置内容</span>
        </div>
        <div className="text-2xl font-bold text-slate-900">{stats.withContent}</div>
        <div className="text-xs text-slate-400 mt-1">
          覆盖率 {stats.coveragePct}%
          <div className="mt-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-green-500 rounded-full transition-all"
              style={{ width: `${stats.coveragePct}%` }}
            />
          </div>
        </div>
      </div>

      {/* With English */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
        <div className="flex items-center gap-2 text-purple-600 mb-1">
          <Activity size={18} />
          <span className="text-xs font-medium uppercase tracking-wider text-slate-400">英文配置</span>
        </div>
        <div className="text-2xl font-bold text-slate-900">{stats.withEnglish}</div>
        <div className="text-xs text-slate-400 mt-1">
          覆盖率 {stats.enCoveragePct}%
          <div className="mt-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-purple-500 rounded-full transition-all"
              style={{ width: `${stats.enCoveragePct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Activity summary */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
        <div className="flex items-center gap-2 text-amber-600 mb-1">
          <TrendingUp size={18} />
          <span className="text-xs font-medium uppercase tracking-wider text-slate-400">综合</span>
        </div>
        <div className="text-2xl font-bold text-slate-900">{stats.coveragePct}%</div>
        <div className="text-xs text-slate-400 mt-1">
          内容覆盖率
          <div className="mt-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-amber-500 rounded-full transition-all"
              style={{ width: `${stats.coveragePct}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
