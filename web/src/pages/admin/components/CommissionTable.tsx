/**
 * CommissionTable - 佣金汇总表格
 * 从 FinanceCommissions.tsx 拆分
 */
import { useState, useMemo, memo } from 'react'
import { ChevronDown, ChevronRight, Search, Download } from 'lucide-react'
import PaginationBar from '@/components/ui/PaginationBar'

interface CommissionRollupRow {
  agentId: number
  agentName: string
  date: string
  totalCommission: string
  settledCommission: string
  pendingCommission: string
  recordCount: number
}

interface CommissionTableProps {
  rows: CommissionRollupRow[]
  loading: boolean
  onExpand: (agentId: number, date: string, agentName: string) => void
  onExport?: () => void
}

function CommissionTable({ rows, loading, onExpand, onExport }: CommissionTableProps) {
  const [page, setPage] = useState(1)
  const [searchQuery, setSearchQuery] = useState('')
  const pageSize = 20

  // Filter by search
  const filteredRows = useMemo(() => {
    if (!searchQuery.trim()) return rows
    const q = searchQuery.trim().toLowerCase()
    return rows.filter(r =>
      r.agentName.toLowerCase().includes(q) ||
      r.date.includes(q)
    )
  }, [rows, searchQuery])

  // Pagination
  const totalPages = Math.ceil(filteredRows.length / pageSize) || 1
  const pagedRows = useMemo(() => {
    const start = (page - 1) * pageSize
    return filteredRows.slice(start, start + pageSize)
  }, [filteredRows, page])

  // Format
  const fmt = (v: any) => `¥${parseFloat(String(v ?? 0)).toFixed(2)}`

  if (loading) {
    return (
      <div className="bg-white rounded-lg border p-8 text-center">
        <div className="animate-spin inline-block w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full" />
        <div className="text-gray-500 mt-2">加载中...</div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg border overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm">佣金汇总</span>
          <span className="text-xs text-gray-500">({filteredRows.length} 条)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setPage(1) }}
              placeholder="搜索代理商/日期"
              className="pl-7 pr-2 py-1 border rounded text-sm w-40"
            />
          </div>
          {onExport && (
            <button
              onClick={onExport}
              className="flex items-center gap-1 px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700"
            >
              <Download className="w-3 h-3" />
              导出
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      {pagedRows.length === 0 ? (
        <div className="p-8 text-center text-gray-500">暂无数据</div>
      ) : (
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="w-8 px-2 py-2"></th>
              <th className="px-2 py-2 text-left text-gray-600">代理商</th>
              <th className="px-2 py-2 text-left text-gray-600">日期</th>
              <th className="px-2 py-2 text-right text-gray-600">总佣金</th>
              <th className="px-2 py-2 text-right text-gray-600">已结算</th>
              <th className="px-2 py-2 text-right text-gray-600">待结算</th>
              <th className="px-2 py-2 text-right text-gray-600">记录数</th>
            </tr>
          </thead>
          <tbody>
            {pagedRows.map((row, idx) => (
              <tr
                key={`${row.agentId}-${row.date}`}
                className="border-b hover:bg-gray-50 cursor-pointer"
                onClick={() => onExpand(row.agentId, row.date, row.agentName)}
              >
                <td className="px-2 py-2">
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                </td>
                <td className="px-2 py-2 font-medium">{row.agentName}</td>
                <td className="px-2 py-2 text-gray-600">{row.date}</td>
                <td className="px-2 py-2 text-right font-mono">{fmt(row.totalCommission)}</td>
                <td className="px-2 py-2 text-right font-mono text-green-600">{fmt(row.settledCommission)}</td>
                <td className="px-2 py-2 text-right font-mono text-orange-600">{fmt(row.pendingCommission)}</td>
                <td className="px-2 py-2 text-right text-gray-600">{row.recordCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="px-4 py-2 border-t">
          <PaginationBar
            currentPage={page}
            totalPages={totalPages}
            onPageChange={setPage}
          />
        </div>
      )}
    </div>
  )
}

export default memo(CommissionTable)
