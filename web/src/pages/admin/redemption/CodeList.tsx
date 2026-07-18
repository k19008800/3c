import { useMemo, useCallback } from 'react'
import {
  Loader2, Download, ToggleLeft, ToggleRight, Trash2, X, Send, Search,
} from 'lucide-react'
import PaginationBar from '@/components/ui/PaginationBar'
import { codeStatusMap } from './types'
import type { RedemptionCode } from './types'

// ── Props ──

interface CodeListProps {
  codes: RedemptionCode[]
  total: number
  page: number
  pageSize: number
  loading: boolean
  selectedCodeIds: number[]
  revokingId: number | null
  exporting: boolean
  batchActionRunning: boolean
  statusFilter: string | undefined
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
  onStatusFilterChange: (status: string | undefined) => void
  onRevoke: (id: number) => void
  onExport: () => void
  onToggleSelect: (id: number) => void
  onSelectAll: () => void
  onClearSelection: () => void
  onBatchAction: (action: 'disable' | 'enable' | 'revoke') => void
  onGiftOpen: (codeId: number, codeDisplay: string) => void
}

// ── Component ──

export default function CodeList({
  codes,
  total,
  page,
  pageSize,
  loading,
  selectedCodeIds,
  revokingId,
  exporting,
  batchActionRunning,
  statusFilter,
  onPageChange,
  onPageSizeChange,
  onStatusFilterChange,
  onRevoke,
  onExport,
  onToggleSelect,
  onSelectAll,
  onClearSelection,
  onBatchAction,
  onGiftOpen,
}: CodeListProps) {
  const totalPages = useMemo(() => Math.ceil(total / pageSize), [total, pageSize])

  const handleFilterChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      onStatusFilterChange(e.target.value || undefined)
    },
    [onStatusFilterChange],
  )

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 space-y-4">
      {/* Batch action toolbar */}
      {selectedCodeIds.length > 0 && (
        <div className="px-4 pt-4 pb-2 flex items-center gap-3 bg-purple-50 border-b border-purple-100">
          <span className="text-sm text-purple-700">已选 {selectedCodeIds.length} 个兑换码</span>
          <button
            onClick={() => onBatchAction('disable')}
            disabled={batchActionRunning}
            className="flex items-center gap-1 px-3 py-1.5 bg-orange-500 text-white rounded-lg text-xs hover:bg-orange-600 disabled:opacity-50 transition"
          >
            {batchActionRunning ? <Loader2 className="animate-spin" size={12} /> : <ToggleLeft size={12} />}
            批量停用
          </button>
          <button
            onClick={() => onBatchAction('enable')}
            disabled={batchActionRunning}
            className="flex items-center gap-1 px-3 py-1.5 bg-green-500 text-white rounded-lg text-xs hover:bg-green-600 disabled:opacity-50 transition"
          >
            {batchActionRunning ? <Loader2 className="animate-spin" size={12} /> : <ToggleRight size={12} />}
            批量启用
          </button>
          <button
            onClick={() => onBatchAction('revoke')}
            disabled={batchActionRunning}
            className="flex items-center gap-1 px-3 py-1.5 bg-red-500 text-white rounded-lg text-xs hover:bg-red-600 disabled:opacity-50 transition"
          >
            {batchActionRunning ? <Loader2 className="animate-spin" size={12} /> : <Trash2 size={12} />}
            批量作废
          </button>
          <button
            onClick={onClearSelection}
            className="flex items-center gap-1 px-3 py-1.5 text-slate-500 hover:text-slate-700 text-xs transition"
          >
            <X size={12} />
            取消
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="p-4 flex items-center gap-4 border-b border-slate-100">
        <select
          value={statusFilter || ''}
          onChange={handleFilterChange}
          className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
        >
          <option value="">全部状态</option>
          <option value="unused">未使用</option>
          <option value="used">已使用</option>
          <option value="revoked">已作废</option>
        </select>
        <button
          onClick={onExport}
          disabled={exporting}
          className="flex items-center gap-1 px-3 py-1.5 border border-slate-300 rounded-lg text-sm hover:bg-slate-50 transition"
        >
          {exporting ? <Loader2 className="animate-spin" size={14} /> : <Download size={14} />}
          导出未使用码
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="animate-spin" size={24} />
        </div>
      ) : codes.length === 0 ? (
        <div className="py-12 text-center text-slate-400 text-sm">暂无兑换码</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 text-left">
                <th className="px-4 py-3 text-sm font-medium text-slate-500 w-10">
                  <input
                    type="checkbox"
                    checked={selectedCodeIds.length === codes.length && codes.length > 0}
                    onChange={onSelectAll}
                    className="rounded border-slate-300"
                  />
                </th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">兑换码</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">批次</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">面额</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">状态</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">创建时间</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {codes.map(c => {
                const sc = codeStatusMap[c.status] || { label: c.status, color: 'bg-slate-100 text-slate-700' }
                const isSelected = selectedCodeIds.includes(c.id)
                return (
                  <tr key={c.id} className={`hover:bg-slate-50 transition ${isSelected ? 'bg-purple-50' : ''}`}>
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => onToggleSelect(c.id)}
                        className="rounded border-slate-300"
                      />
                    </td>
                    <td className="px-4 py-3 text-sm font-mono text-slate-700">{c.code}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{c.batchName || '-'}</td>
                    <td className="px-4 py-3 text-sm font-medium text-green-600">￥{Number(c.amount).toFixed(2)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${sc.color}`}>{sc.label}</span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500 whitespace-nowrap">
                      {new Date(c.createdAt).toLocaleString('zh-CN')}
                    </td>
                    <td className="px-4 py-3">
                      {c.status === 'unused' && (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => onGiftOpen(c.id, c.code)}
                            className="flex items-center gap-1 text-xs text-purple-600 hover:text-purple-800 transition"
                          >
                            <Send size={12} />
                            转赠
                          </button>
                          <button
                            onClick={() => onRevoke(c.id)}
                            disabled={revokingId === c.id}
                            className="flex items-center gap-1 text-xs text-red-600 hover:text-red-800 transition"
                          >
                            {revokingId === c.id ? <Loader2 className="animate-spin" size={12} /> : <Trash2 size={12} />}
                            作废
                          </button>
                        </div>
                      )}
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
