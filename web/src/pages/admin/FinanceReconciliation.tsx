import { useEffect, useState } from 'react'
import { Loader2, AlertCircle, RefreshCw } from 'lucide-react'
import { SummaryCards, BalanceChecks } from './finance-reconciliation/components'
import { useReconciliation } from './finance-reconciliation/hooks'

export default function FinanceReconciliation() {
  const { report, trend, checks, loading, error, fetchReconciliation } = useReconciliation()

  const [filters, setFilters] = useState({
    startDate: '',
    endDate: '',
    agentId: '',
  })

  useEffect(() => {
    fetchReconciliation(filters)
  }, [filters, fetchReconciliation])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">财务对账</h1>
        <button
          onClick={() => fetchReconciliation(filters)}
          className="flex items-center gap-1.5 px-3 py-2 text-sm border rounded-lg hover:bg-slate-50"
        >
          <RefreshCw size={16} />
          刷新
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
        <div className="flex items-center gap-4">
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
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-4 bg-red-50 text-red-700 rounded-lg">
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
    </div>
  )
}