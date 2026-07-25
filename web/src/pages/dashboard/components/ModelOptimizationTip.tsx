// ============================================================
//  3cloud (3C) — 模型优化建议组件
//  显示更便宜的替代模型推荐
// ============================================================

import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Lightbulb,
  TrendingDown,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Zap,
  AlertCircle,
  CheckCircle2,
  Loader2,
} from 'lucide-react'
import { useModelOptimization, type ModelOptimization } from '@/hooks/useModelOptimization'

export default function ModelOptimizationTip() {
  const { data, loading, error, refetch } = useModelOptimization()
  const [expanded, setExpanded] = useState(true)
  const [applying, setApplying] = useState<string | null>(null)

  // 处理应用推荐（跳转到模型详情）
  const handleApply = async (opt: ModelOptimization) => {
    setApplying(opt.currentModel)
    // 跳转到模型详情页（带推荐模型参数）
    window.location.href = `/models/${encodeURIComponent(opt.recommendedModel)}?from=optimization&current=${encodeURIComponent(opt.currentModel)}`
  }

  // 加载中
  if (loading) {
    return (
      <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl p-6 border border-amber-200">
        <div className="flex items-center gap-3">
          <Loader2 className="animate-spin text-amber-500" size={20} />
          <span className="text-sm text-amber-700">正在分析您的模型使用情况...</span>
        </div>
      </div>
    )
  }

  // 错误
  if (error) {
    return (
      <div className="bg-red-50 rounded-xl p-4 border border-red-200">
        <div className="flex items-center gap-2 text-red-600">
          <AlertCircle size={16} />
          <span className="text-sm">{error}</span>
          <button
            onClick={refetch}
            className="ml-auto text-xs text-red-500 hover:text-red-700 underline"
          >
            重试
          </button>
        </div>
      </div>
    )
  }

  // 无优化建议
  if (!data || !data.hasOptimizations) {
    return null
  }

  const { optimizations, totalSavings } = data

  return (
    <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl shadow-sm border border-amber-200 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-5 hover:bg-amber-100/50 transition"
      >
        <div className="flex items-center gap-3">
          <div className="bg-amber-500 rounded-lg p-2">
            <Lightbulb className="text-white" size={20} />
          </div>
          <div className="text-left">
            <h3 className="text-base font-semibold text-amber-900">
              模型成本优化建议
            </h3>
            <p className="text-xs text-amber-700 mt-0.5">
              发现 {optimizations.length} 个优化机会，预计每月可节省 
              <span className="font-bold text-amber-900"> ¥{totalSavings.toFixed(2)}</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation()
              refetch()
            }}
            className="p-1.5 rounded-lg hover:bg-amber-200 transition"
            title="刷新"
          >
            <RefreshCw size={14} className="text-amber-600" />
          </button>
          {expanded ? (
            <ChevronUp size={18} className="text-amber-600" />
          ) : (
            <ChevronDown size={18} className="text-amber-600" />
          )}
        </div>
      </button>

      {/* Content */}
      {expanded && (
        <div className="px-5 pb-5 space-y-3 border-t border-amber-200">
          {/* Summary Banner */}
          <div className="bg-white/60 rounded-lg p-3 mt-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingDown className="text-green-600" size={16} />
              <span className="text-sm text-slate-700">
                基于您最近 <span className="font-medium">7 天</span> 的模型使用数据
              </span>
            </div>
            <div className="text-sm font-medium text-green-600">
              预计节省 ¥{totalSavings.toFixed(2)}/月
            </div>
          </div>

          {/* Optimization Cards */}
          {optimizations.map((opt, idx) => (
            <div
              key={`${opt.currentModel}-${opt.recommendedModel}`}
              className="bg-white rounded-lg border border-amber-100 p-4 hover:border-amber-300 transition"
            >
              <div className="flex items-start justify-between gap-4">
                {/* Left: Model comparison */}
                <div className="flex-1 space-y-3">
                  {/* Model transition */}
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-mono font-medium text-slate-700">
                      {opt.currentModel}
                    </span>
                    <ArrowRight size={14} className="text-amber-500" />
                    <span className="text-sm font-mono font-semibold text-green-600">
                      {opt.recommendedModel}
                    </span>
                  </div>

                  {/* Stats row */}
                  <div className="flex flex-wrap items-center gap-3 text-xs">
                    {/* Savings */}
                    <div className="flex items-center gap-1 bg-green-50 text-green-700 px-2 py-1 rounded">
                      <TrendingDown size={12} />
                      <span className="font-medium">节省 {opt.savingsPercent}%</span>
                      <span className="text-green-600">¥{opt.savings.toFixed(2)}/月</span>
                    </div>

                    {/* Capability match */}
                    <div className="flex items-center gap-1 bg-blue-50 text-blue-700 px-2 py-1 rounded">
                      <Zap size={12} />
                      <span>能力匹配 {opt.capabilityMatch}%</span>
                    </div>

                    {/* Usage */}
                    <div className="text-slate-500">
                      已用 {opt.usageCount.toLocaleString()} 次 / {formatTokens(opt.usageTokens)}
                    </div>
                  </div>

                  {/* Reason */}
                  <div className="flex items-start gap-1.5 text-xs text-slate-600">
                    <CheckCircle2 size={14} className="text-green-500 shrink-0 mt-0.5" />
                    <span>{opt.reason}</span>
                  </div>

                  {/* Cost comparison */}
                  <div className="flex items-center gap-4 text-xs text-slate-500">
                    <span>
                      当前: ¥{opt.currentCost.toFixed(2)}/百万 token
                    </span>
                    <span className="text-green-600 font-medium">
                      推荐: ¥{opt.recommendedCost.toFixed(2)}/百万 token
                    </span>
                  </div>
                </div>

                {/* Right: Apply button */}
                <button
                  onClick={() => handleApply(opt)}
                  disabled={applying === opt.currentModel}
                  className="shrink-0 px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white text-sm font-medium rounded-lg hover:from-amber-600 hover:to-orange-600 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {applying === opt.currentModel ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      应用中...
                    </>
                  ) : (
                    <>
                      应用推荐
                      <ArrowRight size={14} />
                    </>
                  )}
                </button>
              </div>
            </div>
          ))}

          {/* Footer tip */}
          <div className="text-xs text-amber-700 text-center pt-2">
            💡 优化建议仅供参考，实际效果取决于您的具体使用场景
          </div>
        </div>
      )}
    </div>
  )
}

// ── Helper: Format tokens ──
function formatTokens(tokens: number): string {
  if (tokens >= 1000000) {
    return `${(tokens / 1000000).toFixed(2)}M`
  } else if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(2)}K`
  }
  return tokens.toString()
}
