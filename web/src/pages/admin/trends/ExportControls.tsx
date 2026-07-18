import { RefreshCw, TrendingUp, BarChart3 } from 'lucide-react'

/* ═══════════════════════════════════════════════════
   ExportControls — days toggle + refresh + legend
   ═══════════════════════════════════════════════════ */

interface ExportControlsProps {
  days: number
  onDaysChange: (d: number) => void
  onRefresh: () => void
  loading: boolean
}

export default function ExportControls({
  days,
  onDaysChange,
  onRefresh,
  loading,
}: ExportControlsProps) {
  return (
    <>
      {/* Header + days toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp size={20} className="text-slate-700" />
          <h2 className="text-lg font-semibold text-slate-800">趋势</h2>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-slate-100 rounded-lg p-0.5 text-xs">
            {[7, 14, 30].map((d) => (
              <button
                key={d}
                onClick={() => onDaysChange(d)}
                className={`px-3 py-1 rounded-md transition ${
                  days === d
                    ? 'bg-white shadow-sm text-slate-800 font-medium'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {d}天
              </button>
            ))}
          </div>
          <button
            onClick={onRefresh}
            disabled={loading}
            className="p-1.5 text-slate-500 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition disabled:opacity-50"
            title="刷新"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-[11px] text-slate-500">
        <span className="flex items-center gap-1.5">
          <span
            className="w-3 h-3 rounded-sm"
            style={{ background: 'linear-gradient(135deg, #a78bfa, #7c3aed)' }}
          />
          每日调用量
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-4 h-0.5 rounded-full" style={{ background: '#7c3aed' }} />
          移动平均线
        </span>
        <span className="flex items-center gap-1.5">
          <span className="text-red-500">🔺</span>
          峰值标注
        </span>
        <span className="flex items-center gap-1.5 text-indigo-500">
          <BarChart3 size={12} />
          点击柱状展开时段
        </span>
      </div>
    </>
  )
}
