import { Loader2, GitCompare } from 'lucide-react'
import type { LogSummary, ApiKey } from '@/types'

interface KeyComparisonData {
  keyId: number
  keyName: string
  summary: LogSummary | null
  loading: boolean
  error: string
}

interface KeyComparisonProps {
  showComparison: boolean
  setShowComparison: (value: boolean) => void
  compareKeyA: number | ''
  setCompareKeyA: (value: number | '') => void
  compareKeyB: number | ''
  setCompareKeyB: (value: number | '') => void
  apiKeys: ApiKey[]
  comparisonDataA: KeyComparisonData | null
  comparisonDataB: KeyComparisonData | null
}

function ComparisonCard({ data, label }: { data: KeyComparisonData | null, label: string }) {
  if (!data) {
    return (
      <div className="flex-1 bg-slate-50 rounded-lg p-4 text-center text-sm text-slate-400">
        请选择 API Key
      </div>
    )
  }

  if (data.loading) {
    return (
      <div className="flex-1 bg-slate-50 rounded-lg p-4 flex items-center justify-center">
        <Loader2 className="animate-spin" size={20} />
      </div>
    )
  }

  if (data.error) {
    return (
      <div className="flex-1 bg-red-50 rounded-lg p-4 text-sm text-red-600">
        {data.error}
      </div>
    )
  }

  const s = data.summary
  return (
    <div className="flex-1 bg-slate-50 rounded-lg p-4 space-y-3">
      <p className="text-sm font-medium text-slate-800 truncate" title={data.keyName}>
        {data.keyName}
      </p>
      {s ? (
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <span className="text-slate-400">总调用</span>
            <p className="font-semibold text-slate-800">{s.totalCalls.toLocaleString()}</p>
          </div>
          <div>
            <span className="text-slate-400">成功率</span>
            <p className="font-semibold text-slate-800">{s.successRate.toFixed(1)}%</p>
          </div>
          <div>
            <span className="text-slate-400">Token</span>
            <p className="font-semibold text-slate-800">{Number(s.totalTokens).toLocaleString()}</p>
          </div>
          <div>
            <span className="text-slate-400">消费</span>
            <p className="font-semibold text-slate-800">¥{Number(s.totalCost).toFixed(4)}</p>
          </div>
          <div>
            <span className="text-slate-400">成功</span>
            <p className="font-semibold text-green-600">{s.successCalls.toLocaleString()}</p>
          </div>
          <div>
            <span className="text-slate-400">失败</span>
            <p className="font-semibold text-red-600">{s.failedCalls.toLocaleString()}</p>
          </div>
          <div className="col-span-2">
            <span className="text-slate-400">平均耗时</span>
            <p className="font-semibold text-slate-800">{s.avgDuration.toFixed(0)}ms</p>
          </div>
        </div>
      ) : (
        <p className="text-sm text-slate-400">暂无数据</p>
      )}
    </div>
  )
}

export default function KeyComparison({
  showComparison,
  setShowComparison,
  compareKeyA,
  setCompareKeyA,
  compareKeyB,
  setCompareKeyB,
  apiKeys,
  comparisonDataA,
  comparisonDataB,
}: KeyComparisonProps) {
  return (
    <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <GitCompare size={20} className="text-indigo-500" />
          <h2 className="text-lg font-semibold text-slate-900">API Key 对比</h2>
        </div>
        <button
          onClick={() => setShowComparison(!showComparison)}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border transition ${
            showComparison
              ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
              : 'border-slate-300 text-slate-600 hover:bg-slate-50'
          }`}
        >
          <GitCompare size={14} />
          {showComparison ? '关闭对比' : '开启对比'}
        </button>
      </div>

      {showComparison && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Key A</label>
              <select
                value={compareKeyA}
                onChange={(e) => setCompareKeyA(e.target.value ? Number(e.target.value) : '')}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">选择 Key...</option>
                {apiKeys.filter(k => k.status).map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.name} ({k.keyPrefix}...)
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Key B</label>
              <select
                value={compareKeyB}
                onChange={(e) => setCompareKeyB(e.target.value ? Number(e.target.value) : '')}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">选择 Key...</option>
                {apiKeys.filter(k => k.status && k.id !== compareKeyA).map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.name} ({k.keyPrefix}...)
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex gap-4">
            <ComparisonCard data={comparisonDataA} label="Key A" />
            <div className="flex items-center">
              <span className="text-slate-300 font-bold text-lg">VS</span>
            </div>
            <ComparisonCard data={comparisonDataB} label="Key B" />
          </div>
        </div>
      )}
    </div>
  )
}