import { useEffect, useState } from 'react'
import { Loader2, AlertCircle, RefreshCw, Download } from 'lucide-react'
import PaginationBar from '@/components/ui/PaginationBar'
import CommissionTable from './components/CommissionTable'
import CommissionFilters from './components/CommissionFilters'
import CommissionStats from './components/CommissionStats'
import { useFinanceCommissions } from './hooks'
import { fmt, toCSV, triggerDownload } from './utils'
import type { CommissionRollupRow } from '@/types'

export default function FinanceCommissionsPage() {
  const { rows, total, loading, error, fetchCommissions } = useFinanceCommissions()

  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [filters, setFilters] = useState({
    agentId: '',
    startDate: '',
    endDate: '',
    status: '',
    commissionType: '',
  })

  const totalPages = Math.ceil(total / pageSize)

  useEffect(() => {
    fetchCommissions({
      page,
      pageSize,
      ...filters,
    })
  }, [page, pageSize, filters, fetchCommissions])

  const handleExport = () => {
    const headers = ['代理商', '日期', '类型', '总佣金', '已结算', '待结算', '状态']
    const data = rows.map((r: CommissionRollupRow) => [
      r.agentEmail || `Agent #${r.agentId}`,
      r.reportDate,
      '—',
      fmt(Number(r.totalCommissionAmount) || 0),
      fmt(Number(r.settledAmount) || 0),
      fmt(Number(r.pendingAmount) || 0),
      r.pendingCount > 0 ? 'pending' : 'settled',
    ])
    const csv = toCSV(headers, data)
    triggerDownload(csv, `commissions-${new Date().toISOString().split('T')[0]}.csv`)
  }

  const handleExpand = (agentId: number, date: string, label: string) => {
    // TODO: 展开明细面板
    console.log('Expand:', agentId, date, label)
  }

  const handleRefresh = () => {
    fetchCommissions({ page, pageSize, ...filters })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">佣金管理</h1>
        <div className="flex gap-2">
          <button
            onClick={handleRefresh}
            className="flex items-center gap-1.5 px-3 py-2 text-sm border rounded-lg hover:bg-slate-50"
          >
            <RefreshCw size={16} />
            刷新
          </button>
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-2 text-sm border rounded-lg hover:bg-slate-50"
          >
            <Download size={16} />
            导出
          </button>
        </div>
      </div>

      {/* Stats */}
      <CommissionStats rows={rows} />

      {/* Filters */}
      <CommissionFilters filters={filters} setFilters={setFilters} />

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-4 bg-red-50 text-red-700 rounded-lg">
          <AlertCircle size={20} />
          {error}
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="animate-spin" size={32} />
          </div>
        ) : rows.length === 0 ? (
          <div className="text-center py-16 text-slate-500">暂无佣金记录</div>
        ) : (
          <CommissionTable rows={rows} onExpand={handleExpand} />
        )}

        {/* Pagination */}
        <div className="border-t border-slate-200 px-4 py-3">
          <PaginationBar
            page={page}
            pageSize={pageSize}
            total={total}
            totalPages={totalPages}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        </div>
      </div>
    </div>
  )
}