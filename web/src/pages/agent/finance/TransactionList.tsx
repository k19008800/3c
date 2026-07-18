import { useMemo } from 'react'
import { RefreshCw, AlertCircle, Minus, Loader2 } from 'lucide-react'
import PaginationBar from '@/components/ui/PaginationBar'
import type { LedgerEntry } from './types'
import { changeTypeMap, balanceTypeMap } from './types'

interface FilterState {
  balanceType: string
  changeType: string
}

interface Props {
  entries: LedgerEntry[]
  total: number
  page: number
  pageSize: number
  totalPages: number
  loading: boolean
  error: string
  filter: FilterState
  onFilterChange: (filter: FilterState) => void
  onQuery: () => void
  onReset: () => void
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
}

const balanceOptions = [
  { value: '', label: '全部' },
  { value: 'commission', label: '佣金' },
  { value: 'redemption', label: '兑换' },
  { value: 'withdraw', label: '提现' },
  { value: 'deduction', label: '扣款' },
  { value: 'freeze', label: '冻结' },
  { value: 'adjustment', label: '调整' },
]

const changeOptions = [
  { value: '', label: '全部' },
  { value: 'commission', label: '佣金收入' },
  { value: 'deduction', label: '扣款' },
  { value: 'freeze', label: '冻结' },
  { value: 'unfreeze', label: '解冻' },
  { value: 'refund', label: '退款' },
  { value: 'withdraw', label: '提现' },
  { value: 'adjustment', label: '调整' },
]

export default function TransactionList({
  entries, total, page, pageSize, totalPages,
  loading, error, filter,
  onFilterChange, onQuery, onReset,
  onPageChange, onPageSizeChange,
}: Props) {
  const rows = useMemo(() => entries, [entries])

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 space-y-4">
      {/* Filter bar */}
      <div className="p-4 border-b border-slate-100">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs text-slate-500 mb-1">余额类型</label>
            <select
              value={filter.balanceType}
              onChange={(e) => onFilterChange({ ...filter, balanceType: e.target.value })}
              className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              {balanceOptions.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">变动类型</label>
            <select
              value={filter.changeType}
              onChange={(e) => onFilterChange({ ...filter, changeType: e.target.value })}
              className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              {changeOptions.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <button onClick={onQuery}
              className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 transition">
              <RefreshCw size={14} />
              查询
            </button>
            <button onClick={onReset}
              className="flex items-center gap-1 px-3 py-1.5 border border-slate-300 text-slate-600 rounded-lg text-sm hover:bg-slate-50 transition">
              <AlertCircle size={14} />
              重置
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="animate-spin" size={24} />
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 p-4 rounded-lg text-sm m-4">
          <AlertCircle size={16} /> {error}
        </div>
      ) : rows.length === 0 ? (
        <div className="py-12 text-center text-slate-400 text-sm">暂无资金流水</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 text-left">
                <th className="px-4 py-3 text-sm font-medium text-slate-500">时间</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">余额类型</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">变动类型</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500 text-right">变动金额</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500 text-right">变动前</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500 text-right">变动后</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">参考</th>
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
                    <td className="px-4 py-3 text-sm text-slate-700">
                      {balanceTypeMap[entry.balanceType] || entry.balanceType}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`flex items-center gap-1 text-sm ${cfg.color}`}>
                        <Icon size={14} />
                        {cfg.label}
                      </span>
                    </td>
                    <td className={`px-4 py-3 text-sm font-medium text-right ${entry.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {entry.amount >= 0 ? '+' : ''}{entry.amount.toFixed(6)}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-slate-600 font-mono">{entry.balanceBefore.toFixed(6)}</td>
                    <td className="px-4 py-3 text-sm text-right text-slate-600 font-mono">{entry.balanceAfter.toFixed(6)}</td>
                    <td className="px-4 py-3 text-sm text-slate-500">
                      {entry.refType ? `${entry.refType}#${entry.refId || ''}` : '-'}
                    </td>
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
      {totalPages > 0 && (
        <PaginationBar
          page={page}
          onPageChange={onPageChange}
          pageSize={pageSize}
          onPageSizeChange={onPageSizeChange}
          total={total}
          totalPages={totalPages}
        />
      )}
    </div>
  )
}
