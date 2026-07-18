import { AlertTriangle } from 'lucide-react'
import type { DashboardHealth } from '@/types'

/* ── Props ── */
interface Props {
  health: DashboardHealth
}

/* ════════════════════════════════════════
   SystemMetrics
   Top Errors table (data-dependent, hidden when empty)
   ════════════════════════════════════════ */
export default function SystemMetrics({ health }: Props) {
  const { topErrors } = health.recentFailures

  if (topErrors.length === 0) return null

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle size={16} className="text-red-500" />
        <h3 className="text-sm font-semibold text-slate-700">Top 错误 (近 1h)</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-slate-400">
              <th className="pb-2 pr-4 font-medium">模型</th>
              <th className="pb-2 pr-4 font-medium">错误信息</th>
              <th className="pb-2 font-medium text-right">次数</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {topErrors.map((e, idx) => (
              <tr key={idx} className="hover:bg-slate-50">
                <td
                  className="py-2 pr-4 text-slate-700 max-w-[140px] truncate"
                  title={e.modelName}
                >
                  {e.modelName || '-'}
                </td>
                <td
                  className="py-2 pr-4 text-slate-500 max-w-[300px] truncate"
                  title={e.errorMessage}
                >
                  {e.errorMessage}
                </td>
                <td className="py-2 text-right">
                  <span className="inline-flex items-center justify-center min-w-[24px] px-1.5 py-0.5 bg-red-50 text-red-600 rounded text-[10px] font-medium">
                    {e.count}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
