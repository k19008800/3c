import { useEffect, useState } from 'react'
import { AlertTriangle, DollarSign, TrendingUp, Loader2, AlertCircle, Zap, Clock, CheckCircle2 } from 'lucide-react'
import { get } from '@/lib/api'
import type { LogAnomalies, DailyAnomaly, ExpensiveCall } from '@/types'

interface Props {
  days?: number
}

export default function LogAnomaliesPanel({ days = 7 }: Props) {
  const [data, setData] = useState<LogAnomalies | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<'anomalies' | 'expensive'>('anomalies')

  useEffect(() => {
    setLoading(true)
    setError('')
    get<LogAnomalies>('/api/v1/logs/anomalies', { days })
      .then(setData)
      .catch((err) => setError(err.message || '获取异常检测失败'))
      .finally(() => setLoading(false))
  }, [days])

  if (loading) {
    return (
      <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="animate-spin" size={20} />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
        <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm">
          <AlertCircle size={16} />
          {error}
        </div>
      </div>
    )
  }

  if (!data) return null

  const hasAnomalies = data.anomalies && data.anomalies.length > 0
  const hasExpensive = data.expensiveCalls && data.expensiveCalls.length > 0

  return (
    <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
          <TrendingUp size={16} className="text-amber-500" />
          成本分析
        </h3>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setTab('anomalies')}
            className={`px-2.5 py-1 text-xs rounded-md transition ${
              tab === 'anomalies' ? 'bg-amber-100 text-amber-700 font-medium' : 'text-slate-500 hover:bg-slate-100'
            }`}
          >
            异常日期{hasAnomalies ? ` (${data.anomalies.length})` : ''}
          </button>
          <button
            onClick={() => setTab('expensive')}
            className={`px-2.5 py-1 text-xs rounded-md transition ${
              tab === 'expensive' ? 'bg-amber-100 text-amber-700 font-medium' : 'text-slate-500 hover:bg-slate-100'
            }`}
          >
            高额调用{hasExpensive ? ` (${data.expensiveCalls.length})` : ''}
          </button>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-slate-50 rounded-lg p-3 text-center">
          <p className="text-xs text-slate-500">日均消费</p>
          <p className="text-sm font-semibold text-slate-900">¥{Number(data.avgDailyCost).toFixed(4)}</p>
        </div>
        <div className="bg-slate-50 rounded-lg p-3 text-center">
          <p className="text-xs text-slate-500">平均单次</p>
          <p className="text-sm font-semibold text-slate-900">¥{Number(data.avgCostPerCall).toFixed(6)}</p>
        </div>
        <div className="bg-slate-50 rounded-lg p-3 text-center">
          <p className="text-xs text-slate-500">异常阈值</p>
          <p className="text-sm font-semibold text-amber-700">¥{Number(data.costThreshold).toFixed(6)}</p>
        </div>
      </div>

      {/* Tab content */}
      {tab === 'anomalies' && (
        <>
          {!hasAnomalies ? (
            <div className="text-center py-6 text-sm text-slate-400">
              <CheckCircle2 size={24} className="mx-auto mb-2 text-green-400" />
              近 {days} 天未检测到消费异常
            </div>
          ) : (
            <div className="space-y-2">
              {data.anomalies.map((a, i) => (
                <div key={i} className="flex items-start gap-3 p-3 bg-amber-50 rounded-lg border border-amber-200">
                  <AlertTriangle size={16} className="text-amber-500 shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-amber-800">{a.date}</p>
                    <p className="text-xs text-amber-700 mt-0.5">{a.reason}</p>
                    <div className="flex gap-4 mt-1.5 text-[11px] text-amber-600">
                      <span>{a.totalCalls} 次调用</span>
                      <span>最高单次 ¥{Number(a.maxSingleCost).toFixed(6)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'expensive' && (
        <>
          {!hasExpensive ? (
            <div className="text-center py-6 text-sm text-slate-400">近 {days} 天无非正常高额调用</div>
          ) : (
            <div className="space-y-1.5">
              {data.expensiveCalls.map((c, i) => (
                <div key={c.id} className="flex items-center justify-between p-2.5 hover:bg-slate-50 rounded-lg transition text-sm">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className="text-xs text-slate-400 font-mono w-6 shrink-0">#{i + 1}</span>
                    <span className="text-slate-900 font-medium truncate">{c.modelName || '-'}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs text-slate-500">{c.totalTokens?.toLocaleString()} tok</span>
                    <span className="text-sm font-semibold text-red-600">¥{Number(c.cost).toFixed(6)}</span>
                    <span className="text-xs text-slate-400">{c.durationMs != null ? `${c.durationMs}ms` : '-'}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <style>{`
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-slide {
          animation: fadeSlideIn 0.2s ease-out;
        }
      `}</style>
    </div>
  )
}
