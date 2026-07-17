// ============================================================
//  ResponsePanel — 响应展示区（响应内容 + 链路追踪 _chain）
// ============================================================

import { useState } from 'react'
import {
  AlertCircle, Info, Terminal, ChevronDown, ChevronRight,
  CheckCircle2, XCircle, Cpu, Route, Shield, Globe,
} from 'lucide-react'
import type { PlaygroundResponse, ChainStep } from './types'

interface ResponsePanelProps {
  response: PlaygroundResponse | null
  error: string
}

const STEP_ICONS: Record<number, React.ComponentType<{ size?: number; className?: string }>> = {
  1: Cpu,   // 模型解析
  2: Route, // 路由选择
  3: Shield,// 限流检查
  4: Globe, // 上游转发
}

function StepIcon({ step, status }: { step: number; status: string }) {
  const Icon = STEP_ICONS[step] || Info
  return <Icon size={15} className={status === 'ok' ? 'text-green-500' : status === 'error' ? 'text-red-500' : 'text-slate-400'} />
}

export default function ResponsePanel({ response, error }: ResponsePanelProps) {
  const [showChain, setShowChain] = useState(true)

  // ── Error State ──
  if (error) {
    return (
      <div className="flex items-center gap-2 bg-red-50 border-l-4 border-red-500 px-4 py-3 rounded-r-lg text-sm text-red-700">
        <AlertCircle size={16} className="shrink-0" />
        {error}
      </div>
    )
  }

  // ── Empty State ──
  if (!response) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col items-center justify-center py-20 text-slate-400">
        <Terminal size={48} className="mb-3 text-slate-300" />
        <p className="text-sm">选择模型并输入消息，点击"发送调试请求"</p>
        <p className="text-xs mt-1">调试模式不会产生费用，每条请求包含链路追踪</p>
      </div>
    )
  }

  // ── Response State ──
  return (
    <div className="space-y-4">
      {/* Debug notice */}
      <div className="flex items-center gap-2 bg-amber-50 border-l-4 border-amber-400 px-4 py-2.5 rounded-r-lg text-sm text-amber-700">
        <Info size={15} className="shrink-0" />
        {response._warning || '调试模式响应'}
      </div>

      {/* Response Content */}
      <ResponseContent response={response} />

      {/* Chain Trace */}
      {response._chain && response._chain.length > 0 && (
        <ChainTracePanel
          chain={response._chain}
          showChain={showChain}
          onToggle={() => setShowChain(!showChain)}
        />
      )}
    </div>
  )
}

/* ── Response Content ── */

function ResponseContent({ response }: { response: PlaygroundResponse }) {
  const copyResponse = () => {
    navigator.clipboard.writeText(JSON.stringify(response, null, 2)).catch(() => {})
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-slate-200">
        <span className="text-xs font-medium text-slate-500">
          {response.id ? `ID: ${response.id}` : '响应'}
        </span>
        <button onClick={copyResponse} className="text-xs text-blue-500 hover:text-blue-700">
          复制 JSON
        </button>
      </div>
      <div className="p-4 max-h-60 overflow-auto">
        {response.error ? (
          <div className="text-red-600 text-sm">
            <p className="font-medium">{response.error.message}</p>
            <p className="text-xs text-red-400 mt-1">类型: {response.error.type}</p>
          </div>
        ) : response.choices ? (
          <div className="space-y-3">
            {response.choices.map((c, i) => (
              <div key={i} className="text-sm text-slate-700 whitespace-pre-wrap font-mono bg-slate-50 p-3 rounded-lg">
                {c.message.content}
              </div>
            ))}
            {response.usage && (
              <TokenUsage usage={response.usage} />
            )}
          </div>
        ) : (
          <pre className="text-xs text-slate-600 overflow-auto max-h-48">
            {JSON.stringify(response, null, 2)}
          </pre>
        )}
      </div>
    </div>
  )
}

/* ── Token Usage ── */

function TokenUsage({ usage }: { usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } }) {
  return (
    <div className="flex gap-3 text-xs text-slate-400 pt-2 border-t border-slate-100">
      <span>↑ {usage.prompt_tokens}</span>
      <span>↓ {usage.completion_tokens}</span>
      <span>∑ {usage.total_tokens}</span>
    </div>
  )
}

/* ── Chain Trace Panel ── */

function ChainTracePanel({
  chain,
  showChain,
  onToggle,
}: {
  chain: ChainStep[]
  showChain: boolean
  onToggle: () => void
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition"
      >
        <div className="flex items-center gap-2">
          <Terminal size={16} className="text-indigo-500" />
          <span className="text-sm font-semibold text-slate-700">链路追踪</span>
          <span className="text-[10px] text-slate-400">
            {chain.length} 步
          </span>
        </div>
        {showChain ? <ChevronDown size={16} className="text-slate-400" /> : <ChevronRight size={16} className="text-slate-400" />}
      </button>

      {showChain && (
        <div className="px-4 pb-4 space-y-2 border-t border-slate-100">
          {chain.map((step, i) => (
            <ChainStepRow key={i} step={step} isLast={i === chain.length - 1} />
          ))}
        </div>
      )}
    </div>
  )
}

/* ── Chain Step Row ── */

function ChainStepRow({ step, isLast }: { step: ChainStep; isLast: boolean }) {
  return (
    <div className="flex gap-3 py-2">
      {/* Step indicator */}
      <div className="flex flex-col items-center">
        <div className={`w-7 h-7 rounded-full flex items-center justify-center ${
          step.status === 'ok' ? 'bg-green-100' : step.status === 'error' ? 'bg-red-100' : 'bg-slate-100'
        }`}>
          {step.status === 'ok' ? (
            <CheckCircle2 size={14} className="text-green-600" />
          ) : step.status === 'error' ? (
            <XCircle size={14} className="text-red-600" />
          ) : (
            <StepIcon step={step.step} status={step.status} />
          )}
        </div>
        {!isLast && <div className="w-px flex-1 bg-slate-200 min-h-[8px]" />}
      </div>

      {/* Step content */}
      <div className="flex-1 min-w-0 pb-2">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-slate-500">步骤 {step.step}</span>
          <StepIcon step={step.step} status={step.status} />
          <span className="text-sm font-medium text-slate-700">{step.name}</span>
          <span className={`ml-auto text-[10px] font-medium px-1.5 py-0.5 rounded ${
            step.status === 'ok' ? 'bg-green-50 text-green-600' :
            step.status === 'error' ? 'bg-red-50 text-red-600' : 'bg-slate-50 text-slate-400'
          }`}>
            {step.status === 'ok' ? '✓ 通过' : step.status === 'error' ? '✗ 失败' : '-'}
          </span>
        </div>
        <p className="text-xs text-slate-500 mt-1">{step.detail}</p>

        {/* Candidates */}
        {step.candidates && step.candidates.length > 0 && (
          <div className="mt-2 bg-slate-50 rounded-lg p-2 space-y-1">
            <p className="text-[10px] font-medium text-slate-400 mb-1">候选通道:</p>
            {step.candidates.map((c, ci) => (
              <div key={ci} className="flex items-center gap-2 text-[11px]">
                <span className={`w-1.5 h-1.5 rounded-full ${c.isDown ? 'bg-red-400' : 'bg-green-400'}`} />
                <span className="text-slate-600">{c.vendorName}</span>
                <span className="text-slate-400">¥{c.sellPrice}/k</span>
                {c.isDown && <span className="text-red-400 text-[10px]">已宕机</span>}
              </div>
            ))}
          </div>
        )}

        {/* Vendor info */}
        {step.vendorName && (
          <div className="mt-1 text-[11px] text-slate-500">
            选中的供应商: <span className="font-medium text-slate-700">{step.vendorName}</span>
            {step.upstreamModel && <> → 上游模型: <span className="font-medium">{step.upstreamModel}</span></>}
          </div>
        )}
      </div>
    </div>
  )
}
