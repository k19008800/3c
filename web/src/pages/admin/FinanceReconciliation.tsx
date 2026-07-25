import { useState, useEffect } from 'react'
import { Loader2, AlertCircle, RefreshCw, Download } from 'lucide-react'
import { SummaryCards, BalanceChecks } from './finance-reconciliation/components'
import { useReconciliation } from './finance-reconciliation/hooks'
import ExportDialog from '@/components/admin/ExportDialog'
import { useExport } from '@/hooks/useExport'
import AutoReconciliation from './finance-reconciliation/components/AutoReconciliation'

export default function FinanceReconciliation() {
  const { report, trend, checks, loading, error, fetchReconciliation } = useReconciliation()
  const [showExportDialog, setShowExportDialog] = useState(false)
  const { exportAndDownload } = useExport()
  const [activeTab, setActiveTab] = useState<'auto' | 'manual'>('auto')

  const [filters, setFilters] = useState({
    startDate: '',
    endDate: '',
    agentId: '',
  })

  useEffect(() => {
    if (activeTab === 'manual') {
      fetchReconciliation(filters)
    }
  }, [filters, fetchReconciliation, activeTab])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">财务对账</h1>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        <div className="flex border-b">
          <button
            onClick={() => setActiveTab('auto')}
            className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'auto'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            自动对账
          </button>
          <button
            onClick={() => setActiveTab('manual')}
            className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'manual'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            手动查询
          </button>
        </div>

        <div className="p-6">
          {activeTab === 'auto' ? (
            <AutoReconciliation />
          ) : (
            <>
              {/* Filters */}
              <div className="flex items-center gap-4 mb-6">
                <input
                  type="date"
                  value={filters.startDate}
                  onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
                  className="px-3 py-1.5 border rounded text-sm"
                />
                <input
                  type="date"
                  value={filters.endDate}
                  onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
                  className="px-3 py-1.5 border rounded text-sm"
                />
                <input
                  type="text"
                  placeholder="代理商ID"
                  value={filters.agentId}
                  onChange={(e) => setFilters({ ...filters, agentId: e.target.value })}
                  className="px-3 py-1.5 border rounded text-sm w-32"
                />
                <button
                  onClick={() => fetchReconciliation(filters)}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm border rounded-lg hover:bg-slate-50"
                >
                  <RefreshCw size={16} />
                  刷新
                </button>
                <button
                  onClick={() => setShowExportDialog(true)}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700"
                >
                  <Download size={16} />
                  导出报表
                </button>
              </div>

              {/* Error */}
              {error && (
                <div className="flex items-center gap-2 p-4 bg-red-50 text-red-700 rounded-lg mb-6">
                  <AlertCircle size={20} />
                  {error}
                </div>
              )}

              {/* Content */}
              {loading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="animate-spin" size={32} />
                </div>
              ) : (
                <>
                  <SummaryCards report={report} />
                  <BalanceChecks checks={checks} />
                </>
              )}

              <ExportDialog
                isOpen={showExportDialog}
                onClose={() => setShowExportDialog(false)}
                onExport={async (config) => {
                  const result = await exportAndDownload(config)
                  alert(`已导出 ${result.recordCount} 条记录`)
                }}
                type="balance"
                title="交易流水"
              />
            </>
          )}
        </div>
      </div>
    </div>
  )
}
