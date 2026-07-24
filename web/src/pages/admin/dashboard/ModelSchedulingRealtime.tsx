import { useEffect, useState } from 'react'
import { Loader2, AlertCircle, RefreshCw, Activity, Zap } from 'lucide-react'
import { SchedulingChart } from '../model-scheduling/components'
import { useScheduling } from '../model-scheduling/hooks'
import { METRIC_TABS, CHART_STYLES } from '../model-scheduling/types'

export default function ModelSchedulingRealtime() {
  const { data, loading, error, isPolling, fetchData, startPolling, stopPolling } = useScheduling()

  const [metric, setMetric] = useState<'rpm' | 'tpm'>('rpm')
  const [chartStyle, setChartStyle] = useState<'line' | 'area'>('line')

  useEffect(() => {
    startPolling(15000)
    return () => stopPolling()
  }, [startPolling, stopPolling])

  const series = data?.series || []
  const summary = data?.summary

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">模型调度实时监控</h1>
        <div className="flex gap-2">
          <button
            onClick={fetchData}
            className="flex items-center gap-1.5 px-3 py-2 text-sm border rounded-lg hover:bg-slate-50"
          >
            <RefreshCw size={16} />
            刷新
          </button>
          <button
            onClick={() => isPolling ? stopPolling() : startPolling(15000)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm border rounded-lg ${isPolling ? 'bg-green-50 text-green-700' : 'hover:bg-slate-50'}`}
          >
            <Activity size={16} />
            {isPolling ? '停止轮询' : '开始轮询'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-4">
        <div className="flex gap-2">
          {METRIC_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setMetric(tab.key)}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm border rounded-lg ${metric === tab.key ? 'bg-blue-50 text-blue-700 border-blue-300' : 'hover:bg-slate-50'}`}
            >
              {tab.key === 'rpm' ? <Activity size={16} /> : <Zap size={16} />}
              {tab.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          {CHART_STYLES.map((style) => (
            <button
              key={style.key}
              onClick={() => setChartStyle(style.key)}
              className={`px-3 py-2 text-sm border rounded-lg ${chartStyle === style.key ? 'bg-blue-50 text-blue-700 border-blue-300' : 'hover:bg-slate-50'}`}
            >
              {style.label}
            </button>
          ))}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-4 bg-red-50 text-red-700 rounded-lg">
          <AlertCircle size={20} />
          {error}
        </div>
      )}

      {/* Chart */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
        {loading && series.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="animate-spin" size={32} />
          </div>
        ) : (
          <SchedulingChart data={series} metric={metric} chartStyle={chartStyle} />
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border p-4">
          <div className="text-sm text-slate-600">总 RPM</div>
          <div className="text-2xl font-bold">{summary?.totalRpm || 0}</div>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <div className="text-sm text-slate-600">总 TPM</div>
          <div className="text-2xl font-bold">{summary?.totalTpm || 0}</div>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <div className="text-sm text-slate-600">模型数</div>
          <div className="text-2xl font-bold">{summary?.modelCount || 0}</div>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <div className="text-sm text-slate-600">平均延迟</div>
          <div className="text-2xl font-bold">{summary?.avgLatencyMs || 0}ms</div>
        </div>
      </div>
    </div>
  )
}