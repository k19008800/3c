import { useMemo } from 'react'
import { RefreshCw, Minus } from 'lucide-react'
import type { LedgerEntry } from './types'
import { changeTypeMap } from './types'

interface Props {
  entries: LedgerEntry[]
  onViewAll: () => void
}

export default function BalanceHistory({ entries, onViewAll }: Props) {
  const rows = useMemo(() => entries, [entries])

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200">
      <div className="px-6 pt-6 pb-0 flex items-center gap-2">
        <RefreshCw size={16} className="text-slate-400" />
        <h3 className="text-sm font-semibold text-slate-800">最近流水</h3>
      </div>
      {rows.length === 0 ? (
        <div className="py-12 text-center text-slate-400 text-sm">暂无流水记录</div>
      ) : (
        <div className="overflow-x-auto mt-2">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 text-left">
                <th className="px-4 py-3 text-sm font-medium text-slate-500">时间</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">类型</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">变动</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">变动前</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">变动后</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">备注</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {rows.map(entry => {
                const cfg = changeTypeMap[entry.changeType] || { label: entry.changeType, color: 'text-slate-600', icon: Minus }
                const Icon = cfg.icon
                return (
                  <tr key={entry.id} className="hover:bg-slate-50 transition">
                    <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                      {new Date(entry.createdAt).toLocaleString('zh-CN')}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`flex items-center gap-1 text-sm ${cfg.color}`}>
                        <Icon size={14} />
                        {cfg.label}
                      </span>
                    </td>
                    <td className={`px-4 py-3 text-sm font-medium ${entry.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {entry.amount >= 0 ? '+' : ''}{entry.amount.toFixed(6)}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">{entry.balanceBefore.toFixed(6)}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{entry.balanceAfter.toFixed(6)}</td>
                    <td className="px-4 py-3 text-sm text-slate-500 max-w-[160px] truncate" title={entry.remark || ''}>
                      {entry.remark || '-'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="p-4 text-center">
        <button
          onClick={onViewAll}
          className="text-sm text-blue-600 hover:text-blue-800 transition"
        >
          查看全部流水 →
        </button>
      </div>
    </div>
  )
}
