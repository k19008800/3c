import { Loader2, AlertCircle } from 'lucide-react'

interface ErrorPattern {
  pattern: string
  count: number
  percentage: number
}

interface ErrorAnalysisPanelProps {
  statusFilter: string
  errorPatterns: ErrorPattern[]
  errorInsightLoading: boolean
}

export default function ErrorAnalysisPanel({
  statusFilter,
  errorPatterns,
  errorInsightLoading,
}: ErrorAnalysisPanelProps) {
  if (statusFilter !== 'failed') return null

  return (
    <div className="bg-white rounded-xl p-5 shadow-sm border border-red-200">
      <div className="flex items-center gap-2 mb-4">
        <AlertCircle size={20} className="text-red-500" />
        <h2 className="text-lg font-semibold text-slate-900">错误分析</h2>
      </div>
      {errorInsightLoading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="animate-spin" size={24} />
        </div>
      ) : errorPatterns.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-4">暂无错误数据可供分析</p>
      ) : (
        <div className="space-y-3">
          {errorPatterns.map((ep, idx) => (
            <div key={idx} className="flex items-start gap-3 p-3 bg-red-50 rounded-lg">
              <div className="w-6 h-6 rounded-full bg-red-200 flex items-center justify-center shrink-0 mt-0.5">
                <span className="text-xs font-bold text-red-700">{idx + 1}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-red-800 truncate" title={ep.pattern}>
                    {ep.pattern}
                  </p>
                  <span className="text-xs font-medium text-red-600 bg-red-100 px-2 py-0.5 rounded-full whitespace-nowrap">
                    {ep.count} 次 ({ep.percentage.toFixed(0)}%)
                  </span>
                </div>
                <div className="mt-1.5 w-full h-1.5 bg-red-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-red-400 rounded-full transition-all"
                    style={{ width: `${Math.min(100, ep.percentage)}%` }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}