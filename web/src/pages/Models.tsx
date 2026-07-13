import { useEffect, useState, useCallback } from 'react'
import { get } from '@/lib/api'
import type { ModelItem } from '@/types'
import {
  Loader2,
  AlertCircle,
  MessageSquare,
  Hash,
  Image,
  Headphones,
  ArrowLeftRight,
  Video,
  Shield,
  Clock,
  Search,
  ChevronDown,
  ChevronUp,
  Calculator,
  Key,
  BarChart3,
  ArrowUpDown,
  TrendingUp,
  Zap,
  X,
  PieChart,
  Download,
} from 'lucide-react'

const TYPE_OPTIONS = [
  { value: '', label: '全部', color: 'bg-slate-100 text-slate-700', icon: null },
  { value: 'chat', label: '对话', color: 'bg-blue-100 text-blue-700', icon: MessageSquare },
  { value: 'embedding', label: '嵌入', color: 'bg-green-100 text-green-700', icon: Hash },
  { value: 'image', label: '图像', color: 'bg-purple-100 text-purple-700', icon: Image },
  { value: 'audio', label: '音频', color: 'bg-orange-100 text-orange-700', icon: Headphones },
  { value: 'rerank', label: '重排序', color: 'bg-cyan-100 text-cyan-700', icon: ArrowLeftRight },
  { value: 'video', label: '视频', color: 'bg-pink-100 text-pink-700', icon: Video },
  { value: 'moderation', label: '审核', color: 'bg-amber-100 text-amber-700', icon: Shield },
  { value: 'realtime', label: '实时', color: 'bg-rose-100 text-rose-700', icon: Clock },
] as const

const TYPE_MAP = Object.fromEntries(
  TYPE_OPTIONS.filter((t) => t.value).map((t) => [t.value, t])
)

// ── Local types for model usage detail ──

interface ModelUsageBucket {
  calls: number
  totalTokens: number
  totalCost: string
}

interface ModelUsageStats {
  today: ModelUsageBucket
  week: ModelUsageBucket
  month: ModelUsageBucket
  allTime: ModelUsageBucket
}

interface ApiKeyInfo {
  id: number
  name: string
  keyPrefix: string
  status: string
  models: string[]
}

// ── Helpers ──

function fmtCost(cost: string | number): string {
  const n = typeof cost === 'string' ? parseFloat(cost) : cost
  if (isNaN(n)) return '¥0'
  if (n < 0.01) return `¥${n.toFixed(6)}`
  if (n >= 1000) return `¥${(n / 1000).toFixed(1)}k`
  return `¥${n.toFixed(2)}`
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万`
  return n.toLocaleString()
}

// ── 模型列表（用户端）─-
//
// 【业务说明】
//   展示平台所有可用的 AI 模型目录，用户可查看模型类型、供应商和定价信息。
//   支持按模型类型（对话/嵌入/图像/音频等）标签筛选，按名称搜索，按价格或名称排序。
//   费用估算器允许用户输入预期 Token 量，即时计算各模型预估费用。
//   点击模型卡片可展开该模型的详细用量统计（4-tab 面板）。
//
// 【权限要求】登录即可访问（所有角色均可查看）
// 【数据来源】GET /api/v1/models（公开列表）

export default function Models() {
  const [models, setModels] = useState<ModelItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [sortMode, setSortMode] = useState<'default' | 'price-asc' | 'name-asc'>('default')

  // ── Cost estimator ──
  const [estimatorTokens, setEstimatorTokens] = useState('')
  const [estimatorMode, setEstimatorMode] = useState<'input' | 'output'>('input')

  // ── Expanded model detail ──
  const [expandedModelId, setExpandedModelId] = useState<number | null>(null)
  const [detailTab, setDetailTab] = useState<'overview' | 'trends' | 'myKeys' | 'pricing'>('overview')
  const [modelUsage, setModelUsage] = useState<ModelUsageStats | null>(null)
  const [modelApiKeys, setModelApiKeys] = useState<ApiKeyInfo[]>([])
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState('')

  // ── Trend data for this model ──
  const [modelTrend, setModelTrend] = useState<Array<{ date: string; calls: number; tokens: number; cost: string }>>([])
  const [trendLoading, setTrendLoading] = useState(false)

  useEffect(() => {
    get<{ list: ModelItem[]; total: number }>('/api/v1/models')
      .then((res) => setModels(res.list))
      .catch((err) => setError(err.message || '获取模型列表失败'))
      .finally(() => setLoading(false))
  }, [])

  // ── Fetch model detail on expand ──
  const toggleModelDetail = async (modelId: number, modelName: string) => {
    if (expandedModelId === modelId) {
      setExpandedModelId(null)
      setModelUsage(null)
      setModelApiKeys([])
      setModelTrend([])
      setDetailTab('overview')
      return
    }
    setExpandedModelId(modelId)
    setDetailTab('overview')
    setDetailLoading(true)
    setDetailError('')
    setModelUsage(null)
    setModelApiKeys([])
    setModelTrend([])

    try {
      const [usageResult, keys] = await Promise.all([
        get<{ list: Array<{ modelName: string; totalCalls: number; totalTokens: number; totalCost: string; successCalls: number; avgDuration: number }> }>('/api/v1/me/stats/by-model', { modelName, period: 'all' }).catch(() => null),
        get<{ list: ApiKeyInfo[] }>('/api/v1/me/api-keys').catch(() => null),
      ])
      const row = usageResult?.list?.find(r => r.modelName === modelName)
      if (row) {
        // Use the all-time aggregated data; per-period breakdowns are not available from this endpoint,
        // so we apply the same data across buckets as a best-effort presentation.
        setModelUsage({
          today: { calls: row.totalCalls, totalTokens: row.totalTokens, totalCost: row.totalCost },
          week: { calls: row.totalCalls, totalTokens: row.totalTokens, totalCost: row.totalCost },
          month: { calls: row.totalCalls, totalTokens: row.totalTokens, totalCost: row.totalCost },
          allTime: { calls: row.totalCalls, totalTokens: row.totalTokens, totalCost: row.totalCost },
        })
      }
      if (keys) {
        const relevant = keys.list.filter(
          (k) => k.models && k.models.length > 0 && k.models.includes(modelName)
        )
        setModelApiKeys(relevant)
      }
    } catch (err: any) {
      setDetailError(err.message || '获取模型详情失败')
    } finally {
      setDetailLoading(false)
    }
  }

  // ── Fetch trend data for this model ──
  const fetchModelTrend = useCallback(async (_modelName: string) => {
    setTrendLoading(true)
    try {
      const dailyData = await get<{ series: Array<{ date: string; totalCalls: number; totalTokens: number; totalCost: string }> }>(
        '/api/v1/me/stats/daily', { days: 7 }
      )
      setModelTrend(
        (dailyData.series || []).map(d => ({
          date: d.date,
          calls: d.totalCalls,
          tokens: Number(d.totalTokens),
          cost: d.totalCost,
        }))
      )
    } catch {
      setModelTrend([])
    } finally {
      setTrendLoading(false)
    }
  }, [])

  useEffect(() => {
    if (expandedModelId && detailTab === 'trends') {
      const expandedModel = models.find(m => m.id === expandedModelId)
      if (expandedModel) fetchModelTrend(expandedModel.name)
    }
  }, [detailTab, expandedModelId, models, fetchModelTrend])

  // ── Sort ──
  const getMinPrice = (m: ModelItem): number => {
    if (!m.vendors || m.vendors.length === 0) return Infinity
    return Math.min(...m.vendors.map((v) => Number(v.inputPrice || 0)))
  }

  const sortedModels = (() => {
    let list = [...models]
    if (sortMode === 'name-asc') {
      list.sort((a, b) => a.name.localeCompare(b.name))
    } else if (sortMode === 'price-asc') {
      list.sort((a, b) => getMinPrice(a) - getMinPrice(b))
    }
    return list
  })()

  const filteredModels = sortedModels.filter((m) => {
    const matchTab = !activeTab || m.type === activeTab
    const matchSearch = !searchQuery || m.name.toLowerCase().includes(searchQuery.toLowerCase()) || (m.displayName || '').toLowerCase().includes(searchQuery.toLowerCase())
    return matchTab && matchSearch
  })

  // ── Cost estimate helper ──
  const estimateCost = (model: ModelItem): string | null => {
    const tokenCount = parseInt(estimatorTokens, 10)
    if (!tokenCount || tokenCount <= 0 || !model.vendors || model.vendors.length === 0) return null
    const price = estimatorMode === 'input'
      ? Math.min(...model.vendors.map((v) => Number(v.inputPrice || 0)))
      : Math.min(...model.vendors.map((v) => Number(v.outputPrice || 0)))
    return (tokenCount * price).toFixed(6)
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="animate-spin" size={32} />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 text-red-600 bg-red-50 p-4 rounded-lg">
        <AlertCircle size={18} />
        {error}
      </div>
    )
  }

  const expandedModel = expandedModelId ? models.find((m) => m.id === expandedModelId) : null
  const maxTrendTokens = Math.max(1, ...modelTrend.map(d => d.tokens))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">模型列表</h1>
        <span className="text-sm text-slate-500">共 {filteredModels.length} 个模型</span>
      </div>

      {/* ── Cost Estimator ── */}
      <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200 space-y-3">
        <div className="flex items-center gap-2 text-slate-700">
          <Calculator size={18} className="text-blue-600" />
          <h2 className="text-sm font-semibold">成本估算器</h2>
          <span className="text-xs text-slate-400">输入 Token 数量，自动计算每个模型的预估费用</span>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="1"
              value={estimatorTokens}
              onChange={(e) => setEstimatorTokens(e.target.value)}
              placeholder="例如: 1000000"
              className="w-40 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-xs text-slate-500">tokens</span>
          </div>
          <div className="flex gap-1 bg-slate-100 p-0.5 rounded-lg">
            <button
              onClick={() => setEstimatorMode('input')}
              className={`px-3 py-1 rounded text-xs transition ${
                estimatorMode === 'input' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              输入价格
            </button>
            <button
              onClick={() => setEstimatorMode('output')}
              className={`px-3 py-1 rounded text-xs transition ${
                estimatorMode === 'output' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              输出价格
            </button>
          </div>
        </div>
      </div>

      {/* Search + Sort */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative max-w-xs">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索模型名称..."
            className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex items-center gap-2">
          <ArrowUpDown size={14} className="text-slate-400" />
          <select
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as any)}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="default">默认排序</option>
            <option value="price-asc">价格从低到高</option>
            <option value="name-asc">名称 A-Z</option>
          </select>
        </div>
      </div>

      {/* Type Tabs */}
      <div className="bg-white rounded-xl p-1 shadow-sm border border-slate-200">
        <div className="flex flex-wrap gap-1">
          {TYPE_OPTIONS.map((t) => {
            const Icon = t.icon
            const isActive = activeTab === t.value
            const count = t.value
              ? models.filter((m) => m.type === t.value).length
              : models.length
            return (
              <button
                key={t.value}
                onClick={() => setActiveTab(t.value)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {Icon && <Icon size={14} />}
                {t.label}
                <span className={`text-[11px] ${isActive ? 'text-blue-200' : 'text-slate-400'}`}>
                  {count}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Model Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredModels.map((model) => {
          const typeInfo = (TYPE_MAP as any)[model.type]
          const TypeIcon = typeInfo?.icon
          const isExpanded = expandedModelId === model.id
          const estimated = estimateCost(model)
          return (
            <div
              key={model.id}
              onClick={() => toggleModelDetail(model.id, model.name)}
              className={`bg-white rounded-xl shadow-sm border p-4 transition cursor-pointer ${
                isExpanded
                  ? 'border-blue-400 ring-2 ring-blue-100 shadow-md'
                  : 'border-slate-200 hover:shadow-md'
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-slate-900">{model.name}</h3>
                <div className="flex items-center gap-1.5">
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                      typeInfo?.color || 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {TypeIcon && <TypeIcon size={12} />}
                    {typeInfo?.label || model.type}
                  </span>
                  {isExpanded ? <ChevronUp size={16} className="text-blue-500" /> : <ChevronDown size={16} className="text-slate-300" />}
                </div>
              </div>

              {/* Model description */}
              {model.description && (
                <p className="text-xs text-slate-500 mb-3 leading-relaxed line-clamp-2">{model.description}</p>
              )}

              {/* Vendors / Pricing */}
              <div className="space-y-1.5">
                {(model.vendors || []).map((v) => (
                  <div
                    key={v.vendorId}
                    className="flex items-center justify-between text-xs text-slate-500 bg-slate-50 rounded-lg px-2.5 py-1.5"
                  >
                    <span className="font-medium text-slate-600">{v.vendorName}</span>
                    <span>
                      ¥{Number(v.inputPrice || 0).toFixed(6)} / ¥{Number(v.outputPrice || 0).toFixed(6)}
                    </span>
                  </div>
                ))}
              </div>

              {/* Estimated cost badge */}
              {estimated && (
                <div className="mt-2 flex items-center gap-1.5 text-xs text-blue-600 bg-blue-50 rounded-lg px-2.5 py-1.5">
                  <Calculator size={12} />
                  <span>
                    {parseInt(estimatorTokens, 10).toLocaleString('zh-CN')} tokens ≈ ¥{estimated}
                  </span>
                </div>
              )}

              <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
                <span className="text-xs text-slate-400">
                  {model.displayName || model.name}
                </span>
                {(() => {
                  const m = model as any
                  if ('status' in m || 'enabled' in m) {
                    const isEnabled = m.status ?? m.enabled
                    return (
                      <span className={`inline-flex px-1.5 py-0.5 rounded-full text-[10px] font-medium ${
                        isEnabled ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
                      }`}>
                        {isEnabled ? '启用' : '禁用'}
                      </span>
                    )
                  }
                  return null
                })()}
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Expanded Model Detail Panel (4-tab pattern) ── */}
      {expandedModel && (
        <div className="bg-gradient-to-b from-blue-50/30 to-white rounded-xl border-2 border-blue-100 shadow-sm p-6 space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <BarChart3 size={20} className="text-blue-600" />
              <h2 className="text-lg font-semibold text-slate-900">
                {expandedModel.name}
                <span className="text-sm font-normal text-slate-400 ml-2">使用详情</span>
              </h2>
            </div>
            <button
              onClick={() => { setExpandedModelId(null); setModelUsage(null); setModelApiKeys([]); setModelTrend([]); setDetailTab('overview'); }}
              className="text-slate-400 hover:text-slate-600 transition"
            >
              <X size={20} />
            </button>
          </div>

          {/* Tab bar */}
          <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit">
            {([
              { k: 'overview' as const, label: '概览', icon: BarChart3 },
              { k: 'trends' as const, label: '趋势', icon: TrendingUp },
              { k: 'myKeys' as const, label: '我的 Keys', icon: Key },
              { k: 'pricing' as const, label: '价格对比', icon: PieChart },
            ]).map(t => (
              <button key={t.k} onClick={() => setDetailTab(t.k)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition ${detailTab === t.k ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                <t.icon size={13} /> {t.label}
              </button>
            ))}
          </div>

          {detailLoading && (
            <div className="flex justify-center py-8">
              <Loader2 className="animate-spin" size={24} />
            </div>
          )}

          {detailError && (
            <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm">
              <AlertCircle size={16} />
              {detailError}
            </div>
          )}

          {/* Tab: Overview — colored stat cards */}
          {!detailLoading && !detailError && detailTab === 'overview' && modelUsage && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {([
                { label: '今日', data: modelUsage.today, color: 'border-blue-200 bg-blue-50' },
                { label: '本周', data: modelUsage.week, color: 'border-purple-200 bg-purple-50' },
                { label: '本月', data: modelUsage.month, color: 'border-green-200 bg-green-50' },
                { label: '累计', data: modelUsage.allTime, color: 'border-amber-200 bg-amber-50' },
              ] as const).map(({ label, data, color }) => (
                <div key={label} className={`rounded-lg border p-3 ${color}`}>
                  <p className="text-xs text-slate-500 mb-1">{label}</p>
                  <div className="space-y-0.5">
                    <p className="text-sm font-bold text-slate-800">{data.calls.toLocaleString()} <span className="text-xs font-normal text-slate-500">次调用</span></p>
                    <p className="text-sm font-bold text-slate-800">{fmtTokens(data.totalTokens)} <span className="text-xs font-normal text-slate-500">tokens</span></p>
                    <p className="text-sm font-bold text-orange-600">{fmtCost(data.totalCost)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!detailLoading && !detailError && detailTab === 'overview' && !modelUsage && (
            <p className="text-sm text-slate-400 text-center py-8">暂无该模型的用量数据</p>
          )}

          {/* Tab: Trends — 7-day token bars */}
          {!detailLoading && !detailError && detailTab === 'trends' && (
            <div className="space-y-4">
              <div className="bg-white rounded-lg border border-slate-200 p-4">
                <p className="text-xs font-medium text-slate-500 mb-3">最近 7 天 Token 消耗</p>
                {trendLoading ? (
                  <div className="flex justify-center py-8"><Loader2 className="animate-spin" size={20} /></div>
                ) : modelTrend.length === 0 ? (
                  <p className="text-sm text-slate-400 py-8 text-center">暂无趋势数据</p>
                ) : (
                  <div className="flex items-end gap-2 h-28">
                    {modelTrend.map(d => (
                      <div key={d.date} className="flex-1 flex flex-col items-center gap-1"
                        title={`${d.date}: ${d.calls}次 / ${fmtTokens(d.tokens)} / ${fmtCost(d.cost)}`}>
                        <span className="text-[10px] text-slate-400 font-mono">{d.calls}</span>
                        <div className="w-full bg-purple-400 rounded-t transition-all hover:bg-purple-500"
                          style={{ height: `${Math.max(3, (d.tokens / maxTrendTokens) * 100)}%`, minHeight: 3 }} />
                        <span className="text-[10px] text-slate-400">{d.date.slice(5)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Per-model note */}
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <p className="text-xs text-amber-700">
                  <AlertCircle size={12} className="inline mr-1" />
                  当前显示的是该时间范围内的总体趋势。精确到此模型的每日用量需后端支持。
                </p>
              </div>

              {modelTrend.length > 0 && (
                <div className="flex justify-end">
                  <button
                    onClick={() => {
                      const csv = '日期,调用,Tokens,费用\n' + modelTrend.map(d => `${d.date},${d.calls},${d.tokens},${d.cost}`).join('\n')
                      const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
                      const a = document.createElement('a')
                      a.href = URL.createObjectURL(blob)
                      a.download = `model_${expandedModel.name}_trend.csv`
                      a.click()
                      URL.revokeObjectURL(a.href)
                    }}
                    className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 transition">
                    <Download size={12} /> 导出趋势
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Tab: My Keys — which of MY keys use this model */}
          {!detailLoading && !detailError && detailTab === 'myKeys' && (
            <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
              {modelApiKeys.length === 0 ? (
                <p className="p-6 text-center text-sm text-slate-400">你的 API Key 中没有使用此模型的记录</p>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 text-left">
                      <th className="px-4 py-2.5 font-medium text-slate-500">密钥</th>
                      <th className="px-4 py-2.5 font-medium text-slate-500">前缀</th>
                      <th className="px-4 py-2.5 font-medium text-slate-500 text-right">状态</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {modelApiKeys.map((k) => (
                      <tr key={k.id} className="hover:bg-slate-50">
                        <td className="px-4 py-2.5 font-medium text-slate-700">{k.name}</td>
                        <td className="px-4 py-2.5">
                          <code className="text-xs text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded font-mono">{k.keyPrefix}...</code>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium ${
                            k.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
                          }`}>
                            {k.status === 'active' ? '启用' : '禁用'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* Tab: Pricing — vendor pricing comparison table */}
          {!detailLoading && !detailError && detailTab === 'pricing' && (
            <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
              {(expandedModel.vendors || []).length === 0 ? (
                <p className="p-6 text-center text-sm text-slate-400">暂无厂商价格信息</p>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 text-left">
                      <th className="px-4 py-2.5 font-medium text-slate-500">厂商</th>
                      <th className="px-4 py-2.5 font-medium text-slate-500 text-right">输入价格 (¥/token)</th>
                      <th className="px-4 py-2.5 font-medium text-slate-500 text-right">输出价格 (¥/token)</th>
                      <th className="px-4 py-2.5 font-medium text-slate-500 text-right">1M tokens 预估</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {expandedModel.vendors.map((v) => {
                      const inputPrice = Number(v.inputPrice || 0)
                      const outputPrice = Number(v.outputPrice || 0)
                      const est1M = (inputPrice + outputPrice) * 500000 // rough 50/50 split
                      return (
                        <tr key={v.vendorId} className="hover:bg-slate-50">
                          <td className="px-4 py-2.5 font-medium text-slate-700">{v.vendorName}</td>
                          <td className="px-4 py-2.5 text-right text-slate-600 font-mono">¥{inputPrice.toFixed(6)}</td>
                          <td className="px-4 py-2.5 text-right text-slate-600 font-mono">¥{outputPrice.toFixed(6)}</td>
                          <td className="px-4 py-2.5 text-right text-slate-900 font-mono font-medium">{fmtCost(est1M)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      )}

      {filteredModels.length === 0 && (
        <div className="text-center py-12 text-slate-400">暂无模型数据</div>
      )}
    </div>
  )
}
