import { useEffect, useState, useCallback } from 'react'
import { get, post, del, patch } from '@/lib/api'
import type { ApiKey, PaginatedData } from '@/types'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Loader2, AlertCircle, Plus, Copy, CheckCircle2, Trash2, Key, Power, PowerOff,
  BarChart3, ChevronDown, ChevronRight, TrendingUp, Clock, Download,
  PieChart, Activity, X,
} from 'lucide-react'

// ── Types ──

interface KeyUsageDeep {
  keyName: string
  today: { calls: number; tokens: number; cost: string; successCount: number; failedCount: number; avgDurationMs: number }
  month: { calls: number; tokens: number; cost: string; successCount: number; failedCount: number }
  allTime: { calls: number; tokens: number; cost: string }
  trends: Array<{ date: string; calls: number; tokens: number; cost: string }>
  hourlyTrends: Array<{ hour: number; calls: number; tokens: number }>
  modelBreakdown: Array<{ modelName: string; calls: number; tokens: number; cost: string; successCount: number; failedCount: number }>
  allKeysSummary: Array<{ keyId: number; keyName: string; calls: number; tokens: number; cost: string }>
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

function pct(a: number, b: number): string {
  if (b === 0) return '—'
  return `${((a / b) * 100).toFixed(1)}%`
}

// ── Usage Dashboard (deep expandable) ──

function KeyUsageDashboard({ keyId, allKeys }: { keyId: number; allKeys: ApiKey[] }) {
  const [usage, setUsage] = useState<KeyUsageDeep | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<'overview' | 'models' | 'trends' | 'compare'>('overview')

  useEffect(() => {
    setLoading(true)
    get<KeyUsageDeep>(`/api/v1/user/api-keys/${keyId}/stats`)
      .then(setUsage)
      .catch(e => setError(e.message || '加载失败'))
      .finally(() => setLoading(false))
  }, [keyId])

  const handleExport = (period: string) => {
    const token = localStorage.getItem('accessToken')
    const a = document.createElement('a')
    a.href = `/api/v1/user/api-keys/${keyId}/stats/export?period=${period}`
    if (token) a.href += `&token=${token}`
    a.download = `key_usage_${period}.csv`
    a.click()
  }

  if (loading) {
    return (
      <td colSpan={7} className="px-6 py-6 bg-gradient-to-b from-blue-50/30 to-white border-b-2 border-blue-100">
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Skeleton variant="card" count={4} />
          </div>
          <Skeleton variant="chart" />
          <Skeleton variant="table-row" count={3} />
        </div>
      </td>
    )
  }
  if (error) return <td colSpan={7} className="px-6 py-4"><div className="p-4 text-sm text-red-600 bg-red-50 rounded-lg">{error}</div></td>
  if (!usage) return null

  const keyName = usage.keyName || `Key #${keyId}`

  return (
    <td colSpan={7} className="px-6 py-0 bg-gradient-to-b from-blue-50/30 to-white border-b-2 border-blue-100">
      <div className="space-y-4 py-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-slate-800">{keyName} — 用量分析</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              成功率: {pct(usage.today.successCount, usage.today.calls)}
              {usage.today.calls > 0 && <> · 平均耗时: {usage.today.avgDurationMs}ms</>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {(['today', 'month', 'all'] as const).map(p => (
              <button key={p} onClick={() => handleExport(p)}
                className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 transition">
                <Download size={12} /> 导出{p === 'today' ? '今日' : p === 'month' ? '本月' : '全部'}
              </button>
            ))}
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit">
          {([
            { k: 'overview' as const, label: '概览', icon: BarChart3 },
            { k: 'models' as const, label: '模型分布', icon: PieChart },
            { k: 'trends' as const, label: '趋势', icon: TrendingUp },
            { k: 'compare' as const, label: 'Key 对比', icon: Activity },
          ]).map(t => (
            <button key={t.k} onClick={() => setTab(t.k)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition ${tab === t.k ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              <t.icon size={13} /> {t.label}
            </button>
          ))}
        </div>

        {/* Tab: Overview */}
        {tab === 'overview' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {([
                { label: '今日调用', v: usage.today.calls.toLocaleString(), sub: `${usage.today.successCount} 成功 / ${usage.today.failedCount} 失败`, color: 'border-blue-200 bg-blue-50' },
                { label: '今日Token', v: fmtTokens(usage.today.tokens), sub: `消耗 ${fmtCost(usage.today.cost)}`, color: 'border-purple-200 bg-purple-50' },
                { label: '本月调用', v: usage.month.calls.toLocaleString(), sub: `${fmtTokens(usage.month.tokens)} / ${fmtCost(usage.month.cost)}`, color: 'border-green-200 bg-green-50' },
                { label: '累计', v: usage.allTime.calls.toLocaleString(), sub: `¥${parseFloat(usage.allTime.cost).toFixed(2)}`, color: 'border-amber-200 bg-amber-50' },
              ] as const).map(c => (
                <div key={c.label} className={`rounded-lg border p-3 ${c.color}`}>
                  <p className="text-xs text-slate-500 mb-1">{c.label}</p>
                  <p className="text-lg font-bold text-slate-800">{c.v}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">{c.sub}</p>
                </div>
              ))}
            </div>

            {/* Success rate bar */}
            {usage.today.calls > 0 && (
              <div className="bg-white rounded-lg border border-slate-200 p-3">
                <div className="flex justify-between text-xs mb-2">
                  <span className="text-slate-500">今日成功率</span>
                  <span className="font-mono font-bold text-slate-700">{pct(usage.today.successCount, usage.today.calls)}</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                  <div className="bg-emerald-500 h-3 rounded-full transition-all"
                    style={{ width: `${usage.today.calls > 0 ? (usage.today.successCount / usage.today.calls) * 100 : 0}%` }} />
                </div>
                <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                  <span>成功 {usage.today.successCount}</span>
                  <span>失败 {usage.today.failedCount}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab: Model Breakdown */}
        {tab === 'models' && (
          <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
            {usage.modelBreakdown.length === 0 ? (
              <p className="p-6 text-center text-sm text-slate-400">暂无数据</p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 text-left">
                    <th className="px-4 py-2.5 font-medium text-slate-500">模型</th>
                    <th className="px-4 py-2.5 font-medium text-slate-500 text-right">调用</th>
                    <th className="px-4 py-2.5 font-medium text-slate-500 text-right">Token</th>
                    <th className="px-4 py-2.5 font-medium text-slate-500 text-right">费用</th>
                    <th className="px-4 py-2.5 font-medium text-slate-500 text-right">成功率</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {usage.modelBreakdown.map((m, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 font-medium text-slate-700 font-mono">{m.modelName || '未知'}</td>
                      <td className="px-4 py-2.5 text-right text-slate-600">{m.calls.toLocaleString()}</td>
                      <td className="px-4 py-2.5 text-right text-slate-600 font-mono">{fmtTokens(m.tokens)}</td>
                      <td className="px-4 py-2.5 text-right text-slate-900 font-mono font-medium">{fmtCost(m.cost)}</td>
                      <td className="px-4 py-2.5 text-right">
                        <span className={`font-mono ${m.successCount + m.failedCount > 0 && m.successCount / (m.successCount + m.failedCount) < 0.9 ? 'text-red-600' : 'text-slate-600'}`}>
                          {pct(m.successCount, m.successCount + m.failedCount)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Tab: Trends */}
        {tab === 'trends' && (
          <div className="space-y-4">
            {/* 7-day bars */}
            <div className="bg-white rounded-lg border border-slate-200 p-4">
              <p className="text-xs font-medium text-slate-500 mb-3">最近 7 天 Token 消耗</p>
              {usage.trends.length === 0 ? (
                <p className="text-sm text-slate-400 py-4 text-center">暂无数据</p>
              ) : (() => {
                const max = Math.max(1, ...usage.trends.map(t => t.tokens))
                return (
                  <div className="flex items-end gap-2 h-28">
                    {usage.trends.map(t => (
                      <div key={t.date} className="flex-1 flex flex-col items-center gap-1" title={`${t.date}: ${t.calls}次 / ${fmtTokens(t.tokens)} / ${fmtCost(t.cost)}`}>
                        <span className="text-[10px] text-slate-400 font-mono">{t.calls}</span>
                        <div className="w-full bg-blue-400 rounded-t transition-all hover:bg-blue-500"
                          style={{ height: `${Math.max(3, (t.tokens / max) * 100)}%`, minHeight: 3 }} />
                        <span className="text-[10px] text-slate-400">{t.date.slice(3)}</span>
                      </div>
                    ))}
                  </div>
                )
              })()}
            </div>

            {/* 24h hourly heatmap */}
            <div className="bg-white rounded-lg border border-slate-200 p-4">
              <p className="text-xs font-medium text-slate-500 mb-3">
                <Clock size={12} className="inline mr-1" />24 小时调用分布
              </p>
              {usage.hourlyTrends.length === 0 ? (
                <p className="text-sm text-slate-400 py-4 text-center">暂无数据</p>
              ) : (() => {
                const maxH = Math.max(1, ...usage.hourlyTrends.map(h => h.calls))
                const hours = Array.from({ length: 24 }, (_, i) => {
                  const found = usage.hourlyTrends.find(h => h.hour === i)
                  return found || { hour: i, calls: 0, tokens: 0 }
                })
                return (
                  <div className="grid grid-cols-24 gap-px bg-slate-100 rounded-lg overflow-hidden">
                    {hours.map(h => {
                      const intensity = h.calls / Math.max(1, maxH)
                      let bg = 'bg-slate-50'
                      if (intensity > 0.7) bg = 'bg-blue-500'
                      else if (intensity > 0.4) bg = 'bg-blue-400'
                      else if (intensity > 0.1) bg = 'bg-blue-200'
                      return (
                        <div key={h.hour} className={`${bg} p-2 text-center transition-colors`}
                          title={`${h.hour}:00 - ${h.calls}次 / ${fmtTokens(h.tokens)}`}>
                          <span className="text-[9px] text-slate-600 font-mono">{h.hour}</span>
                        </div>
                      )
                    })}
                  </div>
                )
              })()}
            </div>
          </div>
        )}

        {/* Tab: All Key Comparison */}
        {tab === 'compare' && (
          <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
            {usage.allKeysSummary.length === 0 ? (
              <p className="p-6 text-center text-sm text-slate-400">暂无其他 Key</p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 text-left">
                    <th className="px-4 py-2.5 font-medium text-slate-500">密钥</th>
                    <th className="px-4 py-2.5 font-medium text-slate-500 text-right">今日调用</th>
                    <th className="px-4 py-2.5 font-medium text-slate-500 text-right">今日 Token</th>
                    <th className="px-4 py-2.5 font-medium text-slate-500 text-right">今日费用</th>
                    <th className="px-4 py-2.5 font-medium text-slate-500 text-right">占比</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {usage.allKeysSummary.map(k => {
                    const totalTokens = usage.allKeysSummary.reduce((a, b) => a + b.tokens, 0)
                    const isCurrent = k.keyId === keyId
                    return (
                      <tr key={k.keyId} className={`hover:bg-slate-50 ${isCurrent ? 'bg-blue-50/50 font-semibold' : ''}`}>
                        <td className="px-4 py-2.5 text-slate-700">
                          {k.keyName || `Key #${k.keyId}`}
                          {isCurrent && <span className="ml-1 text-[10px] text-blue-500 font-normal">(当前)</span>}
                        </td>
                        <td className="px-4 py-2.5 text-right text-slate-600">{k.calls.toLocaleString()}</td>
                        <td className="px-4 py-2.5 text-right text-slate-600 font-mono">{fmtTokens(k.tokens)}</td>
                        <td className="px-4 py-2.5 text-right text-slate-900 font-mono">{fmtCost(k.cost)}</td>
                        <td className="px-4 py-2.5 text-right text-slate-500 font-mono">
                          {totalTokens > 0 ? `${((k.tokens / totalTokens) * 100).toFixed(0)}%` : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </td>
  )
}

// ── Main Page ──

export default function ApiKeys() {
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [newKeyName, setNewKeyName] = useState('')
  const [creating, setCreating] = useState(false)
  const [createdKey, setCreatedKey] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [expandedKeyId, setExpandedKeyId] = useState<number | null>(null)

  const fetchKeys = useCallback(async () => {
    try {
      const data = await get<PaginatedData<ApiKey>>('/api/v1/api-keys')
      setKeys(data.list)
    } catch (err: any) {
      setError(err.message || '获取密钥列表失败')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchKeys() }, [fetchKeys])

  const handleCreate = async () => {
    if (!newKeyName.trim()) return
    setCreating(true)
    try {
      const data = await post<ApiKey>('/api/v1/api-keys', { name: newKeyName })
      setCreatedKey(data.key)
      setNewKeyName('')
      setShowCreate(false)
      fetchKeys()
    } catch (err: any) { setError(err.message || '创建密钥失败') }
    finally { setCreating(false) }
  }

  const handleToggleStatus = async (id: number, currentStatus: boolean) => {
    try {
      await patch(`/api/v1/api-keys/${id}`, { status: !currentStatus })
      setKeys(prev => prev.map(k => k.id === id ? { ...k, status: !currentStatus } : k))
    } catch (err: any) { setError(err.message || '状态更新失败') }
  }

  const handleDelete = async (id: number) => {
    if (!window.confirm('确定要删除此 API 密钥吗？此操作不可撤销。')) return
    try {
      await del(`/api/v1/api-keys/${id}`)
      setKeys(prev => prev.filter(k => k.id !== id))
    } catch (err: any) { setError(err.message || '删除密钥失败') }
  }

  const handleCopy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 3000) }
    catch {
      const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta)
      ta.select(); document.execCommand('copy'); document.body.removeChild(ta)
      setCopied(true); setTimeout(() => setCopied(false), 3000)
    }
  }

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin" size={32} /></div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-slate-900">API 密钥</h1>
          <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{keys.length} 个密钥</span>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm">
          <Plus size={16} /> 创建密钥
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm">
          <AlertCircle size={16} /> {error}
          <button onClick={() => setError('')} className="ml-auto text-red-500"><X size={16} /></button>
        </div>
      )}

      {createdKey && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2 text-green-700 font-medium"><CheckCircle2 size={18} /> 密钥创建成功！请立即复制并安全保存</div>
          <div className="flex items-center gap-2">
            <code className="flex-1 p-2 bg-white border border-green-200 rounded text-sm break-all font-mono">{createdKey}</code>
            <button onClick={() => handleCopy(createdKey)} className="flex items-center gap-1 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition text-sm">{copied ? <CheckCircle2 size={16} /> : <Copy size={16} />}{copied ? '已复制' : '复制'}</button>
            <button onClick={() => setCreatedKey(null)} className="px-3 py-2 text-slate-500 hover:text-slate-700 transition text-sm">关闭</button>
          </div>
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
            <h2 className="text-lg font-semibold mb-4">创建 API 密钥</h2>
            <input type="text" value={newKeyName} onChange={e => setNewKeyName(e.target.value)}
              placeholder="密钥名称（如：生产环境）" autoFocus
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4" />
            <div className="flex gap-2 justify-end">
              <button onClick={() => { setShowCreate(false); setNewKeyName('') }} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 transition">取消</button>
              <button onClick={handleCreate} disabled={creating || !newKeyName.trim()}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition flex items-center gap-1">
                {creating && <Loader2 className="animate-spin" size={14} />} 确认创建
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 text-left">
                <th className="px-4 py-3 text-sm font-medium text-slate-500 w-8"></th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">名称</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">密钥前缀</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">状态</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">最后使用</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">创建时间</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {keys.map(key => (
                <>
                  <tr key={key.id} className={`hover:bg-slate-50 transition ${expandedKeyId === key.id ? 'bg-blue-50/50' : ''}`}>
                    <td className="px-3 py-3">
                      <button onClick={() => setExpandedKeyId(expandedKeyId === key.id ? null : key.id)}
                        className="p-1 text-slate-400 hover:text-blue-600 rounded transition">
                        {expandedKeyId === key.id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-slate-900">{key.name}</td>
                    <td className="px-4 py-3"><code className="text-xs bg-slate-100 px-2 py-1 rounded font-mono">{key.keyPrefix}...</code></td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${key.status ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{key.status ? '启用' : '停用'}</span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500">{key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleString('zh-CN') : '从未使用'}</td>
                    <td className="px-4 py-3 text-sm text-slate-500">{new Date(key.createdAt).toLocaleString('zh-CN')}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button onClick={() => { handleCopy(key.key); setCopied(true); }}
                          className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 transition">
                          <Copy size={14} />
                        </button>
                        <button onClick={() => setExpandedKeyId(expandedKeyId === key.id ? null : key.id)}
                          className="flex items-center gap-1 text-sm text-blue-500 hover:text-blue-700 transition">
                          <BarChart3 size={14} /> 用量
                        </button>
                        <button onClick={() => handleToggleStatus(key.id, !!key.status)}
                          className={`flex items-center gap-1 text-sm transition ${key.status ? 'text-amber-500 hover:text-amber-700' : 'text-green-500 hover:text-green-700'}`}>
                          {key.status ? <PowerOff size={14} /> : <Power size={14} />}
                        </button>
                        <button onClick={() => handleDelete(key.id)}
                          className="flex items-center gap-1 text-sm text-red-500 hover:text-red-700 transition">
                          <Trash2 size={14} /> 删除
                        </button>
                      </div>
                    </td>
                  </tr>
                  {expandedKeyId === key.id && (
                    <tr key={`${key.id}-usage`}>
                      <KeyUsageDashboard keyId={key.id} allKeys={keys} />
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
        {keys.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-12 text-slate-400">
            <Key size={48} strokeWidth={1.5} />
            <p>暂无 API 密钥</p>
            <button onClick={() => setShowCreate(true)} className="text-blue-500 hover:text-blue-700 text-sm">创建第一个密钥</button>
          </div>
        )}
      </div>
    </div>
  )
}
