import { useState, useEffect } from 'react'
import { Loader2, AlertCircle, RefreshCw, Download } from 'lucide-react'
import { SummaryCards, TrendChart, ModelTable, LowMarginAlert } from './profit-analysis/components'
import { useProfitAnalysis } from './profit-analysis/hooks'

export default function ProfitAnalysis() {
  const { data, loading, error, loadData, exportReport } = useProfitAnalysis()
  const [dateRange, setDateRange] = useState({
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
  })

  useEffect(() => {
    loadData(dateRange)
  }, [loadData, dateRange])

  const handleRefresh = () => loadData(dateRange)
  const handleExport = () => exportReport(dateRange)

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin" size={32} />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 p-4 bg-red-50 text-red-700 rounded-lg">
        <AlertCircle size={20} />
        {error}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">利润分析</h1>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={dateRange.startDate}
              onChange={(e) => setDateRange({ ...dateRange, startDate: e.target.value })}
              className="px-3 py-1.5 border rounded text-sm"
            />
            <span className="text-slate-400">—</span>
            <input
              type="date"
              value={dateRange.endDate}
              onChange={(e) => setDateRange({ ...dateRange, endDate: e.target.value })}
              className="px-3 py-1.5 border rounded text-sm"
            />
          </div>
          <button
            onClick={handleRefresh}
            className="flex items-center gap-1.5 px-3 py-2 text-sm border rounded-lg hover:bg-slate-50"
          >
            <RefreshCw size={16} />
            刷新
          </button>
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Download size={16} />
            导出
          </button>
        </div>
      </div>

      {data && (
        <>
          {/* Summary Cards */}
          <SummaryCards summary={data.summary} />

          {/* Low Margin Alert */}
          <LowMarginAlert models={data.lowMarginModels} />

          {/* Trend Chart */}
          <TrendChart trends={data.trends} />

          {/* Model Table */}
          <ModelTable models={data.models} />
        </>
      )}
    </div>
  )
}