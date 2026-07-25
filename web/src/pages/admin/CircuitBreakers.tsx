import { useState, useEffect } from 'react'
import { get, post } from '@/lib/api'
import {
  Loader2, RefreshCw, Zap, AlertTriangle, CheckCircle2, Clock, RotateCcw,
  Activity,
} from 'lucide-react'

interface CircuitBreakerItem {
  key: string
  modelName: string
  vendorName: string
  state: 'closed' | 'open' | 'half-open'
  failureCount: number
  failureThreshold: number
  lastFailure: string | null
  cooldownUntil: string | null
}

interface CircuitHistoryItem {
  id: number
  circuitKey: string
  fromState: string
  toState: string
  reason: string | null
  createdAt: string
}

// ── State colors ──

const stateColors: Record<string, string> = {
  closed: 'bg-green-100 text-green-700',
  open: 'bg-red-100 text-red-700',
  'half-open': 'bg-amber-100 text-amber-700',
}

const stateLabels: Record<string, string> = {
  closed: '正常',
  open: '熔断',
  'half-open': '半开',
}

export default function CircuitBreaker() {
  const [breakers, setBreakers] = useState<CircuitBreakerItem[]>([])
  const [history, setHistory] = useState<CircuitHistoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [resetting, setResetting] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [showHistory, setShowHistory] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)

  const loadBreakers = async () => {
    setLoading(true)
    try {
      const res = await get<{ data: CircuitBreakerItem[] }>('/api/v1/admin/circuit-breakers')
      if (res?.data) setBreakers(res.data)
    } catch { /* ignore */ }
    setLoading(false)
  }

  const loadHistory = async () => {
    setHistoryLoading(true)
    try {
      const res = await get<{ data: CircuitHistoryItem[] }>('/api/v1/admin/circuit-breakers/history')
      if (res?.data) setHistory(res.data)
    } catch { /* ignore */ }
    setHistoryLoading(false)
  }

  useEffect(() => { loadBreakers() }, [])

  const handleReset = async (key: string) => {
    setResetting(key)
    try {
      await post(`/api/v1/admin/circuit-breakers/${encodeURIComponent(key)}/reset`, {})
      setMessage(`已重置 ${key}`)
      loadBreakers()
    } catch (err: any) {
      setMessage(err.message || '重置失败')
    }
    setResetting(null)
  }

  useEffect(() => {
    if (message) { const t = setTimeout(() => setMessage(''), 3000); return () => clearTimeout(t) }
  }, [message])

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Zap size={24} className="text-amber-500" />
            熔断器管理
          </h1>
          <p className="text-sm text-slate-500 mt-1">监控和管理 API 调用熔断状态，手动恢复故障模型</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { setShowHistory(!showHistory); if (!showHistory) loadHistory() }}
            className="flex items-center gap-1.5 px-3 py-2 border rounded-lg text-sm hover:bg-slate-50"
          >
            <Clock size={14} />
            历史记录
          </button>
          <button
            onClick={loadBreakers}
            className="flex items-center gap-1.5 px-3 py-2 border rounded-lg text-sm hover:bg-slate-50"
          >
            <RefreshCw size={14} />
            刷新
          </button>
        </div>
      </div>

      {/* Message */}
      {message && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-50 text-blue-700 text-sm">
          <CheckCircle2 size={14} /> {message}
        </div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-2xl font-bold text-green-600">{breakers.filter((b) => b.state === 'closed').length}</p>
          <p className="text-xs text-slate-500">正常</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-2xl font-bold text-red-600">{breakers.filter((b) => b.state === 'open').length}</p>
          <p className="text-xs text-slate-500">熔断中</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-2xl font-bold text-amber-600">{breakers.filter((b) => b.state === 'half-open').length}</p>
          <p className="text-xs text-slate-500">半开</p>
        </div>
      </div>

      {/* Circuit breaker list */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 text-left">
                <th className="px-4 py-3 text-sm font-medium text-slate-500">模型</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">供应商</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">状态</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">失败数/阈值</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">最后失败</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">冷却至</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={7} className="text-center py-12"><Loader2 size={20} className="animate-spin mx-auto text-slate-400" /></td></tr>
              ) : breakers.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-12 text-slate-400"><Activity size={40} className="mx-auto mb-2 opacity-50" />暂无熔断器</td></tr>
              ) : breakers.map((b) => (
                <tr key={b.key} className="hover:bg-slate-50 transition">
                  <td className="px-4 py-3 text-sm font-medium text-slate-800">{b.modelName}</td>
                  <td className="px-4 py-3 text-sm text-slate-500">{b.vendorName}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${stateColors[b.state] || stateColors.closed}`}>
                      {stateLabels[b.state] || b.state}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">{b.failureCount}/{b.failureThreshold}</td>
                  <td className="px-4 py-3 text-sm text-slate-500">
                    {b.lastFailure ? new Date(b.lastFailure).toLocaleString('zh-CN') : '—'}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-500">
                    {b.cooldownUntil ? new Date(b.cooldownUntil).toLocaleString('zh-CN') : '—'}
                  </td>
                  <td className="px-4 py-3">
                    {b.state !== 'closed' && (
                      <button
                        onClick={() => handleReset(b.key)}
                        disabled={resetting === b.key}
                        className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 disabled:opacity-50"
                      >
                        {resetting === b.key ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
                        重置
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* History Panel */}
      {showHistory && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-2">
          <h3 className="text-sm font-medium text-slate-700">熔断历史</h3>
          {historyLoading ? (
            <div className="flex justify-center py-4"><Loader2 size={16} className="animate-spin text-slate-400" /></div>
          ) : history.length === 0 ? (
            <p className="text-xs text-slate-400">暂无记录</p>
          ) : (
            <div className="space-y-1 max-h-60 overflow-y-auto">
              {history.map((h) => (
                <div key={h.id} className="flex items-center justify-between p-2 bg-slate-50 rounded-lg text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-slate-600">{h.circuitKey}</span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${stateColors[h.fromState] || ''}`}>
                      {stateLabels[h.fromState] || h.fromState}
                    </span>
                    <span className="text-slate-400">→</span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${stateColors[h.toState] || ''}`}>
                      {stateLabels[h.toState] || h.toState}
                    </span>
                    {h.reason && <span className="text-slate-500">— {h.reason}</span>}
                  </div>
                  <span className="text-slate-400">{new Date(h.createdAt).toLocaleString('zh-CN')}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
