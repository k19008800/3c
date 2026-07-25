import { useEffect, useState } from 'react'
import { Loader2, AlertCircle, Sparkles, TrendingUp, Zap, Shield, Check, X, RefreshCw, ChevronDown, ChevronUp, BarChart3 } from 'lucide-react'

interface Recommendation {
  vendorId: number
  vendorName: string
  modelId: number
  modelName: string
  upstreamModelName: string
  costScore: number
  latencyScore: number
  reliabilityScore: number
  overallScore: number
  avgCostPerCall: number
  avgLatencyMs: number
  successRate: number
  totalCalls: number
  reasons: string[]
  currentConfig?: {
    weight: number
    status: boolean
    isDown: boolean
  }
}

interface RecommendationsData {
  recommendations: Recommendation[]
  analysisPeriod: {
    days: number
    since: string
    until: string
  }
  totalAnalyzed: number
  modelCount: number
}

interface CompareData {
  modelName: string
  vendors: Array<{
    vendorName: string
    vendorModelId: number
    totalCalls: number
    successCalls: number
    successRate: number
    totalCost: number
    avgCostPerCall: number
    totalTokens: number
    avgLatencyMs: number
  }>
  analysisPeriod: { days: number; since: string }
}

export default function RoutingRecommendations() {
  const [data, setData] = useState<RecommendationsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [days, setDays] = useState(7)
  const [modelName, setModelName] = useState('')
  const [expandedModel, setExpandedModel] = useState<string | null>(null)
  const [compareData, setCompareData] = useState<CompareData | null>(null)
  const [compareLoading, setCompareLoading] = useState(false)
  const [applyingId, setApplyingId] = useState<number | null>(null)

  const fetchRecommendations = async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      params.set('days', String(days))
      if (modelName) params.set('modelName', modelName)

      const res = await fetch(`/api/v1/admin/routing/recommendations?${params}`)
      const json = await res.json()
      if (json.code !== 0) throw new Error(json.message || '请求失败')
      setData(json.data)
    } catch (err: any) {
      setError(err.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchRecommendations()
  }, [])

  const handleApply = async (vendorModelId: number, action: 'enable' | 'disable' | 'set_weight' | 'clear_down', weight?: number) => {
    setApplyingId(vendorModelId)
    try {
      const res = await fetch('/api/v1/admin/routing/recommendations/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vendorModelId, action, weight }),
      })
      const json = await res.json()
      if (json.code !== 0) throw new Error(json.message || '应用失败')
      // 刷新推荐
      await fetchRecommendations()
    } catch (err: any) {
      alert(err.message || '应用失败')
    } finally {
      setApplyingId(null)
    }
  }

  const handleCompare = async (name: string) => {
    if (expandedModel === name) {
      setExpandedModel(null)
      setCompareData(null)
      return
    }

    setExpandedModel(name)
    setCompareLoading(true)
    try {
      const res = await fetch(`/api/v1/admin/routing/recommendations/compare?modelName=${encodeURIComponent(name)}&days=${days}`)
      const json = await res.json()
      if (json.code !== 0) throw new Error(json.message || '请求失败')
      setCompareData(json.data)
    } catch (err: any) {
      console.error('对比加载失败:', err)
    } finally {
      setCompareLoading(false)
    }
  }

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600'
    if (score >= 60) return 'text-yellow-600'
    return 'text-red-600'
  }

  const getScoreBg = (score: number) => {
    if (score >= 80) return 'bg-green-100'
    if (score >= 60) return 'bg-yellow-100'
    return 'bg-red-100'
  }

  // 按模型分组
  const groupedByModel = new Map<string, Recommendation[]>()
  for (const rec of data?.recommendations || []) {
    if (!groupedByModel.has(rec.modelName)) groupedByModel.set(rec.modelName, [])
    groupedByModel.get(rec.modelName)!.push(rec)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="text-purple-600" size={24} />
          <h1 className="text-2xl font-bold">智能路由推荐</h1>
        </div>
        <button
          onClick={fetchRecommendations}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-2 text-sm border rounded-lg hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          刷新
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
        <div className="flex items-center gap-4">
          <div>
            <label className="block text-xs text-slate-500 mb-1">分析周期</label>
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="px-3 py-1.5 border rounded text-sm"
            >
              <option value={1}>最近 1 天</option>
              <option value={3}>最近 3 天</option>
              <option value={7}>最近 7 天</option>
              <option value={14}>最近 14 天</option>
              <option value={30}>最近 30 天</option>
            </select>
          </div>
          <div className="flex-1">
            <label className="block text-xs text-slate-500 mb-1">模型名称（可选）</label>
            <input
              type="text"
              placeholder="输入模型名称筛选..."
              value={modelName}
              onChange={(e) => setModelName(e.target.value)}
              className="w-full px-3 py-1.5 border rounded text-sm"
            />
          </div>
          <button
            onClick={fetchRecommendations}
            disabled={loading}
            className="px-4 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 mt-4"
          >
            分析
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-4 bg-red-50 text-red-700 rounded-lg">
          <AlertCircle size={20} />
          {error}
        </div>
      )}

      {/* Stats */}
      {data && (
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
            <div className="text-sm text-slate-500">分析周期</div>
            <div className="text-2xl font-bold mt-1">{data.analysisPeriod.days} 天</div>
            <div className="text-xs text-slate-400 mt-1">
              {new Date(data.analysisPeriod.since).toLocaleDateString()} - {new Date(data.analysisPeriod.until).toLocaleDateString()}
            </div>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
            <div className="text-sm text-slate-500">分析供应商数</div>
            <div className="text-2xl font-bold mt-1">{data.totalAnalyzed}</div>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
            <div className="text-sm text-slate-500">涉及模型数</div>
            <div className="text-2xl font-bold mt-1">{data.modelCount}</div>
          </div>
        </div>
      )}

      {/* Recommendations */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="animate-spin" size={32} />
        </div>
      ) : !data || data.recommendations.length === 0 ? (
        <div className="bg-white rounded-xl p-8 text-center text-slate-500">
          <Sparkles size={48} className="mx-auto mb-4 text-slate-300" />
          <p>暂无推荐数据</p>
          <p className="text-sm mt-2">需要每个供应商至少 10 次调用才能进行分析</p>
        </div>
      ) : (
        <div className="space-y-4">
          {Array.from(groupedByModel.entries()).map(([modelName, recs]) => (
            <div key={modelName} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              {/* Model Header */}
              <div
                className="flex items-center justify-between px-4 py-3 bg-slate-50 cursor-pointer hover:bg-slate-100"
                onClick={() => handleCompare(modelName)}
              >
                <div className="flex items-center gap-3">
                  <span className="font-semibold">{modelName}</span>
                  <span className="text-xs text-slate-500">{recs.length} 个供应商</span>
                </div>
                <div className="flex items-center gap-2">
                  {recs[0] && (
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${getScoreBg(recs[0].overallScore)} ${getScoreColor(recs[0].overallScore)}`}>
                      最优: {recs[0].vendorName} ({recs[0].overallScore}分)
                    </span>
                  )}
                  {expandedModel === modelName ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </div>
              </div>

              {/* Recommendations List */}
              <div className="divide-y divide-slate-100">
                {recs.map((rec, idx) => (
                  <div key={`${rec.vendorId}-${rec.modelId}`} className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="font-medium">{rec.vendorName}</span>
                          <span className="text-xs text-slate-500">({rec.upstreamModelName})</span>
                          {idx === 0 && (
                            <span className="px-1.5 py-0.5 bg-yellow-100 text-yellow-700 text-xs rounded">推荐</span>
                          )}
                          {rec.currentConfig?.isDown && (
                            <span className="px-1.5 py-0.5 bg-red-100 text-red-700 text-xs rounded">宕机</span>
                          )}
                          {!rec.currentConfig?.status && (
                            <span className="px-1.5 py-0.5 bg-slate-100 text-slate-700 text-xs rounded">已禁用</span>
                          )}
                        </div>

                        {/* Scores */}
                        <div className="flex items-center gap-4 mb-2">
                          <div className="flex items-center gap-1">
                            <TrendingUp size={14} className="text-slate-400" />
                            <span className="text-xs text-slate-500">成本:</span>
                            <span className={`text-sm font-medium ${getScoreColor(rec.costScore)}`}>{rec.costScore}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Zap size={14} className="text-slate-400" />
                            <span className="text-xs text-slate-500">延迟:</span>
                            <span className={`text-sm font-medium ${getScoreColor(rec.latencyScore)}`}>{rec.latencyScore}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Shield size={14} className="text-slate-400" />
                            <span className="text-xs text-slate-500">可靠性:</span>
                            <span className={`text-sm font-medium ${getScoreColor(rec.reliabilityScore)}`}>{rec.reliabilityScore}</span>
                          </div>
                          <div className="ml-2 px-2 py-0.5 rounded bg-purple-100 text-purple-700 text-sm font-medium">
                            综合: {rec.overallScore}
                          </div>
                        </div>

                        {/* Stats */}
                        <div className="flex items-center gap-4 text-xs text-slate-500 mb-2">
                          <span>平均成本: ¥{rec.avgCostPerCall.toFixed(4)}/次</span>
                          <span>平均延迟: {Math.round(rec.avgLatencyMs)}ms</span>
                          <span>成功率: {(rec.successRate * 100).toFixed(2)}%</span>
                          <span>调用次数: {rec.totalCalls}</span>
                        </div>

                        {/* Reasons */}
                        <div className="flex flex-wrap gap-1">
                          {rec.reasons.map((reason, i) => (
                            <span key={i} className="text-xs px-2 py-0.5 bg-slate-100 rounded">
                              {reason}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex flex-col gap-2 ml-4">
                        {rec.currentConfig?.isDown && (
                          <button
                            onClick={() => handleApply(rec.vendorId, 'clear_down')}
                            disabled={applyingId === rec.vendorId}
                            className="flex items-center gap-1 px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                          >
                            {applyingId === rec.vendorId ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                            清除宕机
                          </button>
                        )}
                        {!rec.currentConfig?.status && (
                          <button
                            onClick={() => handleApply(rec.vendorId, 'enable')}
                            disabled={applyingId === rec.vendorId}
                            className="flex items-center gap-1 px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                          >
                            {applyingId === rec.vendorId ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                            启用
                          </button>
                        )}
                        {idx !== 0 && rec.currentConfig?.status && (
                          <button
                            onClick={() => handleApply(rec.vendorId, 'set_weight', 100)}
                            disabled={applyingId === rec.vendorId}
                            className="flex items-center gap-1 px-2 py-1 text-xs border rounded hover:bg-slate-50 disabled:opacity-50"
                          >
                            {applyingId === rec.vendorId ? <Loader2 size={12} className="animate-spin" /> : <TrendingUp size={12} />}
                            提高权重
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Compare View */}
              {expandedModel === modelName && (
                <div className="border-t border-slate-200 p-4 bg-slate-50">
                  <div className="flex items-center gap-2 mb-3">
                    <BarChart3 size={16} className="text-slate-500" />
                    <span className="text-sm font-medium">性能对比</span>
                  </div>
                  {compareLoading ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="animate-spin" size={20} />
                    </div>
                  ) : compareData && compareData.modelName === modelName ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-slate-500">
                            <th className="pb-2 font-medium">供应商</th>
                            <th className="pb-2 font-medium text-right">调用次数</th>
                            <th className="pb-2 font-medium text-right">成功率</th>
                            <th className="pb-2 font-medium text-right">平均成本</th>
                            <th className="pb-2 font-medium text-right">平均延迟</th>
                            <th className="pb-2 font-medium text-right">总成本</th>
                          </tr>
                        </thead>
                        <tbody>
                          {compareData.vendors.map((v, i) => (
                            <tr key={i} className="border-t border-slate-200">
                              <td className="py-2">{v.vendorName}</td>
                              <td className="py-2 text-right">{v.totalCalls.toLocaleString()}</td>
                              <td className="py-2 text-right">
                                <span className={v.successRate >= 0.99 ? 'text-green-600' : v.successRate >= 0.95 ? 'text-yellow-600' : 'text-red-600'}>
                                  {(v.successRate * 100).toFixed(2)}%
                                </span>
                              </td>
                              <td className="py-2 text-right">¥{v.avgCostPerCall.toFixed(4)}</td>
                              <td className="py-2 text-right">{v.avgLatencyMs}ms</td>
                              <td className="py-2 text-right">¥{v.totalCost.toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
