import { useEffect, useState, useCallback } from 'react'
import { get, post } from '@/lib/api'
import FeatureDescription from '@/components/admin/FeatureDescription'
import PaginationBar from '@/components/ui/PaginationBar'
import {
  Loader2, AlertCircle, RefreshCw, DollarSign, Plus, CheckCircle2, History, TrendingUp, Settings2,
} from 'lucide-react'
import type { ChangeEvent } from 'react'

// ── Types ──

interface PriceListResponse {
  list: VendorModelRow[]
  multiplier: number
  total: number
}

interface VendorModelRow {
  id: number
  vendorId: number
  modelId: number
  modelName: string
  vendorName?: string
  upstreamModelName?: string
  sellPriceInput: string
  sellPriceOutput: string
  costPriceInput: string
  costPriceOutput: string
  status: boolean
  updatedAt: string
}

interface PriceHistoryRow {
  id: number
  modelName: string
  action: string
  oldValue: string | null
  newValue: string | null
  reason: string | null
  operator: string
  createdAt: string
}

function fmtPrice(v: string | number | null | undefined): string {
  const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : 0
  return isNaN(n) ? '0.00' : n.toFixed(6)
}

function calcMultiplier(sell: string | number, cost: string | number): number | null {
  const s = typeof sell === 'string' ? parseFloat(sell) : sell
  const c = typeof cost === 'string' ? parseFloat(cost) : cost
  if (!c || c === 0 || isNaN(s) || isNaN(c)) return null
  return s / c
}

// ════════════════════════════════════════════════

export default function AdminPrices() {
  const [models, setModels] = useState<VendorModelRow[]>([])
  const [globalMultiplier, setGlobalMultiplier] = useState(1.33)
  const [history, setHistory] = useState<PriceHistoryRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  // Modal state
  const [editModel, setEditModel] = useState<VendorModelRow | null>(null)
  const [showBatchSellModal, setShowBatchSellModal] = useState(false)
  const [showBatchCostModal, setShowBatchCostModal] = useState(false)
  const [showMultiplierModal, setShowMultiplierModal] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [modelsRes, historyRes] = await Promise.all([
        get<PriceListResponse>('/api/v1/admin/finance/prices', {}),
        get<{ list: PriceHistoryRow[]; total: number }>('/api/v1/admin/finance/prices/history', { page, pageSize }),
      ])
      setModels(modelsRes?.list || [])
      setGlobalMultiplier(modelsRes?.multiplier ?? 1.01)
      setHistory(historyRes?.list || [])
      setTotal(historyRes?.total || 0)
    } catch (err: any) {
      setError(err.message || '获取价格数据失败')
    } finally {
      setLoading(false)
    }
  }, [page, pageSize])

  useEffect(() => { fetchData() }, [fetchData])

  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(''), 3000)
      return () => clearTimeout(timer)
    }
  }, [message])

  const totalPages = Math.ceil(total / pageSize)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="animate-spin text-slate-400" size={32} />
      </div>
    )
  }

  if (error && models.length === 0 && history.length === 0) {
    return (
      <div className="flex items-center gap-2 text-red-600 bg-red-50 p-4 rounded-lg text-sm">
        <AlertCircle size={18} />
        {error}
        <button onClick={fetchData} className="ml-2 px-3 py-1 bg-red-600 text-white rounded-lg text-xs hover:bg-red-700">重试</button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-900">价格管理</h1>
        <FeatureDescription page="admin/finance/prices" className="ml-2" />
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowBatchSellModal(true)}
            className="flex items-center gap-1.5 px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
          >
            <Plus size={15} /> 批量改售价
          </button>
          <button
            onClick={() => setShowBatchCostModal(true)}
            className="flex items-center gap-1.5 px-4 py-2 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition"
          >
            <DollarSign size={15} /> 批量改成本
          </button>
          <button
            onClick={() => setShowMultiplierModal(true)}
            className="flex items-center gap-1.5 px-4 py-2 text-sm bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition"
          >
            <Settings2 size={15} /> 倍率设置
          </button>
          <button
            onClick={fetchData}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-slate-600 bg-white rounded-lg border border-slate-200 hover:bg-slate-50 transition"
          >
            <RefreshCw size={15} /> 刷新
          </button>
        </div>
      </div>

      {/* Message */}
      {message && (
        <div className="flex items-center gap-2 p-3 text-sm rounded-lg bg-green-50 text-green-700">
          <CheckCircle2 size={16} /> {message}
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 p-3 text-sm rounded-lg bg-red-50 text-red-600">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {/* Current prices — full table: model | cost | sell | multiplier */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <DollarSign size={18} className="text-indigo-600" />
            <h2 className="text-base font-semibold text-slate-800">模型定价一览</h2>
          </div>
          <span className="text-xs text-slate-400">
            全局定价倍率: <span className="font-mono font-semibold text-indigo-600">{globalMultiplier.toFixed(2)}x</span>
            <button
              onClick={() => setShowMultiplierModal(true)}
              className="ml-2 text-indigo-500 hover:text-indigo-700 underline"
            >修改</button>
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left">
                <th className="px-6 py-3 font-medium text-slate-500">厂商</th>
                <th className="px-6 py-3 font-medium text-slate-500">模型名称</th>
                <th className="px-6 py-3 font-medium text-slate-500 text-right whitespace-nowrap">
                  成本 Input (元/百万token)
                </th>
                <th className="px-6 py-3 font-medium text-slate-500 text-right whitespace-nowrap">
                  成本 Output (元/百万token)
                </th>
                <th className="px-6 py-3 font-medium text-slate-500 text-right whitespace-nowrap">
                  售价 Input (元/百万token)
                </th>
                <th className="px-6 py-3 font-medium text-slate-500 text-right whitespace-nowrap">
                  售价 Output (元/百万token)
                </th>
                <th className="px-6 py-3 font-medium text-slate-500 text-right whitespace-nowrap">
                  实际倍率
                </th>
                <th className="px-6 py-3 font-medium text-slate-500 text-right">最后更新</th>
                <th className="px-6 py-3 font-medium text-slate-500">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {models.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center text-slate-400">暂无定价数据</td>
                </tr>
              ) : (
                models.map((m) => {
                  const inputMul = calcMultiplier(m.sellPriceInput, m.costPriceInput)
                  const outputMul = calcMultiplier(m.sellPriceOutput, m.costPriceOutput)
                  return (
                    <tr key={m.id} className="hover:bg-slate-50 transition">
                      <td className="px-6 py-3 text-xs text-slate-500 max-w-[120px] truncate" title={m.vendorName || '-'}>
                        {m.vendorName || '-'}
                      </td>
                      <td className="px-6 py-3 font-medium text-slate-900 max-w-[160px] truncate" title={m.modelName}>
                        {m.modelName}
                      </td>
                      <td className="px-6 py-3 text-right font-mono text-xs text-slate-500">{fmtPrice(m.costPriceInput)}</td>
                      <td className="px-6 py-3 text-right font-mono text-xs text-slate-500">{fmtPrice(m.costPriceOutput)}</td>
                      <td className="px-6 py-3 text-right font-mono text-xs text-indigo-700 font-medium">{fmtPrice(m.sellPriceInput)}</td>
                      <td className="px-6 py-3 text-right font-mono text-xs text-indigo-700 font-medium">{fmtPrice(m.sellPriceOutput)}</td>
                      <td className="px-6 py-3 text-right font-mono text-xs">
                        <span className={inputMul && inputMul < 1 ? 'text-red-600' : 'text-emerald-600'}>
                          {inputMul ? `${inputMul.toFixed(2)}x` : '-'}{' '}
                        </span>
                        <span className="text-slate-300">/</span>{' '}
                        <span className={outputMul && outputMul < 1 ? 'text-red-600' : 'text-emerald-600'}>
                          {outputMul ? `${outputMul.toFixed(2)}x` : '-'}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-right text-xs text-slate-400 whitespace-nowrap">
                        {m.updatedAt ? new Date(m.updatedAt).toLocaleString('zh-CN') : '-'}
                      </td>
                      <td className="px-6 py-3 whitespace-nowrap">
                        <button
                          onClick={() => setEditModel(m)}
                          className="text-indigo-600 hover:text-indigo-800 text-xs font-medium"
                        >
                          修改售价
                        </button>
                        <button
                          onClick={() => setEditModel({ ...m })}
                          className="ml-3 text-amber-600 hover:text-amber-800 text-xs font-medium"
                        >
                          修改成本
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Price change history */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center gap-2">
          <History size={18} className="text-slate-500" />
          <h2 className="text-base font-semibold text-slate-800">价格变更历史</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left">
                <th className="px-6 py-3 font-medium text-slate-500">时间</th>
                <th className="px-6 py-3 font-medium text-slate-500">操作人</th>
                <th className="px-6 py-3 font-medium text-slate-500">模型</th>
                <th className="px-6 py-3 font-medium text-slate-500">变更类型</th>
                <th className="px-6 py-3 font-medium text-slate-500">变动值</th>
                <th className="px-6 py-3 font-medium text-slate-500">原因</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {history.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-400">暂无变更记录</td>
                </tr>
              ) : (
                history.map((h) => (
                  <tr key={h.id} className="hover:bg-slate-50 transition">
                    <td className="px-6 py-4 whitespace-nowrap text-xs text-slate-500">
                      {new Date(h.createdAt).toLocaleString('zh-CN')}
                    </td>
                    <td className="px-6 py-4 text-slate-700">{h.operator}</td>
                    <td className="px-6 py-4 text-slate-700 max-w-[140px] truncate" title={h.modelName}>{h.modelName}</td>
                    <td className="px-6 py-4">
                      <ChangeTypeBadge action={h.action} />
                    </td>
                    <td className="px-6 py-4 text-xs font-mono text-slate-600">
                      {h.oldValue != null ? fmtPrice(h.oldValue) : '-'} → {h.newValue != null ? fmtPrice(h.newValue) : '-'}
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-500 max-w-[200px] truncate" title={h.reason || ''}>
                      {h.reason || '-'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <PaginationBar
            page={page}
            onPageChange={setPage}
            pageSize={pageSize}
            onPageSizeChange={() => {}}
            total={total}
            totalPages={totalPages}
          />
        )}
      </div>

      {/* Edit sell price modal */}
      {editModel && (
        <EditSellPriceModal
          model={editModel}
          onClose={() => setEditModel(null)}
          onSuccess={() => { setEditModel(null); setMessage('售价修改成功'); fetchData() }}
        />
      )}

      {/* Batch sell price modal */}
      {showBatchSellModal && (
        <BatchPriceModal
          models={models}
          mode="sell"
          onClose={() => setShowBatchSellModal(false)}
          onSuccess={() => { setShowBatchSellModal(false); setMessage('批量售价修改成功'); fetchData() }}
        />
      )}

      {/* Batch cost price modal */}
      {showBatchCostModal && (
        <BatchPriceModal
          models={models}
          mode="cost"
          onClose={() => setShowBatchCostModal(false)}
          onSuccess={() => { setShowBatchCostModal(false); setMessage('批量成本修改成功'); fetchData() }}
        />
      )}

      {/* Global multiplier modal */}
      {showMultiplierModal && (
        <MultiplierModal
          currentValue={globalMultiplier}
          onClose={() => setShowMultiplierModal(false)}
          onSuccess={() => { setShowMultiplierModal(false); setMessage('定价倍率更新成功'); fetchData() }}
        />
      )}
    </div>
  )
}

// ════════════════════════════════════════════════
//  Change type badge
// ════════════════════════════════════════════════

function ChangeTypeBadge({ action }: { action: string }) {
  const map: Record<string, { label: string; color: string }> = {
    pricing_multiplier: { label: '全局倍率', color: 'bg-violet-100 text-violet-700' },
    sell_price: { label: '售价调整', color: 'bg-indigo-100 text-indigo-700' },
    cost_price: { label: '成本调整', color: 'bg-amber-100 text-amber-700' },
    batch: { label: '批量调价', color: 'bg-emerald-100 text-emerald-700' },
  }
  const info = map[action] || { label: action, color: 'bg-slate-100 text-slate-600' }
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${info.color}`}>
      {info.label}
    </span>
  )
}

// ════════════════════════════════════════════════
//  Edit sell price modal (single model)
// ════════════════════════════════════════════════

function EditSellPriceModal({
  model,
  onClose,
  onSuccess,
}: {
  model: VendorModelRow
  onClose: () => void
  onSuccess: () => void
}) {
  const [inputPrice, setInputPrice] = useState(model.sellPriceInput)
  const [outputPrice, setOutputPrice] = useState(model.sellPriceOutput)
  const [costInput, setCostInput] = useState(model.costPriceInput)
  const [costOutput, setCostOutput] = useState(model.costPriceOutput)
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async () => {
    setError('')
    if (!reason.trim()) { setError('请填写变更原因'); return }
    setSaving(true)
    try {
      await post('/api/v1/admin/finance/prices/sell', {
        modelIds: [model.id],
        sellPriceInput: parseFloat(inputPrice),
        sellPriceOutput: parseFloat(outputPrice),
        reason: reason.trim(),
      })
      // Also update cost if changed
      if (costInput !== model.costPriceInput || costOutput !== model.costPriceOutput) {
        await post('/api/v1/admin/finance/prices/cost', {
          vendorModelIds: [model.id],
          costPriceInput: parseFloat(costInput),
          costPriceOutput: parseFloat(costOutput),
          reason: reason.trim(),
        })
      }
      onSuccess()
    } catch (err: any) {
      setError(err.message || '修改失败')
    } finally {
      setSaving(false)
    }
  }

  const inputMul = calcMultiplier(parseFloat(inputPrice) || 0, parseFloat(costInput) || 0)
  const outputMul = calcMultiplier(parseFloat(outputPrice) || 0, parseFloat(costOutput) || 0)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-lg shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">修改模型定价</h2>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">&times;</button>
          </div>

          <div className="bg-slate-50 rounded-lg p-3">
            <p className="text-sm font-medium text-slate-700">
              {model.vendorName ? <span className="text-xs text-slate-400 mr-1">[{model.vendorName}]</span> : null}
              {model.modelName}
            </p>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 text-sm rounded-lg bg-red-50 text-red-600">
              <AlertCircle size={16} /> {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">成本 Input (元/百万token)</label>
              <input
                type="text"
                value={costInput}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setCostInput(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">成本 Output (元/百万token)</label>
              <input
                type="text"
                value={costOutput}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setCostOutput(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">售价 Input (元/百万token)</label>
              <input
                type="text"
                value={inputPrice}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setInputPrice(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">售价 Output (元/百万token)</label>
              <input
                type="text"
                value={outputPrice}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setOutputPrice(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
              />
            </div>
          </div>

          {/* Real-time multiplier preview */}
          <div className="bg-slate-50 rounded-lg p-3 text-xs text-slate-500 space-y-1">
            <span className="font-medium text-slate-600">实时倍率: </span>
            <span className={inputMul && inputMul < 1 ? 'text-red-600 font-semibold' : 'text-emerald-600 font-semibold'}>
              Input {inputMul ? `${inputMul.toFixed(2)}x` : '-'}
            </span>
            <span className="mx-2 text-slate-300">|</span>
            <span className={outputMul && outputMul < 1 ? 'text-red-600 font-semibold' : 'text-emerald-600 font-semibold'}>
              Output {outputMul ? `${outputMul.toFixed(2)}x` : '-'}
            </span>
          </div>

          <div>
            <label className="block text-xs text-slate-500 mb-1">变更原因 <span className="text-red-500">*</span></label>
            <textarea
              value={reason}
              onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setReason(e.target.value)}
              rows={2}
              placeholder="请填写调价原因"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button onClick={onClose} disabled={saving} className="px-4 py-2 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50">取消</button>
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              {saving ? '提交中...' : '确认修改'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════
//  Batch price modal (sell or cost)
// ════════════════════════════════════════════════

function BatchPriceModal({
  models,
  mode,
  onClose,
  onSuccess,
}: {
  models: VendorModelRow[]
  mode: 'sell' | 'cost'
  onClose: () => void
  onSuccess: () => void
}) {
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [inputPrice, setInputPrice] = useState('')
  const [outputPrice, setOutputPrice] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [selectAll, setSelectAll] = useState(false)

  const isSell = mode === 'sell'
  const endpoint = isSell ? '/api/v1/admin/finance/prices/sell' : '/api/v1/admin/finance/prices/cost'

  const toggleSelectAll = () => {
    if (selectAll) {
      setSelectedIds([])
    } else {
      setSelectedIds(models.map((m) => m.id))
    }
    setSelectAll(!selectAll)
  }

  const toggleModel = (id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  const handleSubmit = async () => {
    setError('')
    if (selectedIds.length === 0) { setError('请至少选择一个模型'); return }
    if (!inputPrice || !outputPrice) { setError('请输入价格'); return }
    if (!reason.trim()) { setError('请填写变更原因'); return }
    setSaving(true)
    try {
      const body: any = {
        vendorModelIds: selectedIds,
        reason: reason.trim(),
      }
      if (isSell) {
        body.sellPriceInput = parseFloat(inputPrice)
        body.sellPriceOutput = parseFloat(outputPrice)
      } else {
        body.costPriceInput = parseFloat(inputPrice)
        body.costPriceOutput = parseFloat(outputPrice)
      }
      await post(endpoint, body)
      onSuccess()
    } catch (err: any) {
      setError(err.message || '批量调价失败')
    } finally {
      setSaving(false)
    }
  }

  const label = isSell ? '售价' : '成本价'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-xl shadow-xl max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">批量改{label}</h2>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">&times;</button>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 text-sm rounded-lg bg-red-50 text-red-600">
              <AlertCircle size={16} /> {error}
            </div>
          )}

          {/* Model selection */}
          <div>
            <label className="block text-xs text-slate-500 mb-2">
              选择模型 <span className="text-red-500">*</span>
              <span className="ml-2 text-slate-400">(已选 {selectedIds.length} 个)</span>
            </label>
            <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-lg">
              <label className="flex items-center gap-2 px-3 py-2 border-b border-slate-100 bg-slate-50 cursor-pointer hover:bg-slate-100">
                <input
                  type="checkbox"
                  checked={selectAll}
                  onChange={toggleSelectAll}
                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-sm text-slate-600">全选</span>
              </label>
              {models.map((m) => (
                <label key={m.id} className="flex items-center gap-2 px-3 py-2 border-b border-slate-50 cursor-pointer hover:bg-slate-50">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(m.id)}
                    onChange={() => toggleModel(m.id)}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-sm text-slate-700">
                    {m.vendorName ? <span className="text-xs text-slate-400 mr-1">[{m.vendorName}]</span> : null}
                    {m.modelName}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Price inputs */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">新 Input {label} (元/百万token) <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={inputPrice}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setInputPrice(e.target.value)}
                placeholder="0.000000"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">新 Output {label} (元/百万token) <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={outputPrice}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setOutputPrice(e.target.value)}
                placeholder="0.000000"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-500 mb-1">变更原因 <span className="text-red-500">*</span></label>
            <textarea
              value={reason}
              onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setReason(e.target.value)}
              rows={2}
              placeholder="请填写调价原因"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button onClick={onClose} disabled={saving} className="px-4 py-2 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50">取消</button>
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              {saving ? '提交中...' : `确认批量改${label}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════
//  Global multiplier settings modal
// ════════════════════════════════════════════════

function MultiplierModal({
  currentValue,
  onClose,
  onSuccess,
}: {
  currentValue: number
  onClose: () => void
  onSuccess: () => void
}) {
  const [value, setValue] = useState(String(currentValue))
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async () => {
    setError('')
    const num = parseFloat(value)
    if (isNaN(num) || num <= 0) { setError('请输入有效的正数倍率'); return }
    if (!reason.trim()) { setError('请填写变更原因'); return }
    setSaving(true)
    try {
      await post('/api/v1/admin/finance/prices/multiplier', {
        value: String(num),
        reason: reason.trim(),
      })
      onSuccess()
    } catch (err: any) {
      setError(err.message || '修改失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Settings2 size={18} className="text-violet-600" />
              全局定价倍率
            </h2>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">&times;</button>
          </div>

          <div className="bg-violet-50 rounded-lg p-3 text-xs text-violet-700">
            <TrendingUp size={14} className="inline mr-1" />
            当前倍率: <span className="font-mono font-bold">{currentValue.toFixed(2)}x</span>
            <br />
            <span className="text-violet-500">用于系统全局默认定价计算</span>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 text-sm rounded-lg bg-red-50 text-red-600">
              <AlertCircle size={16} /> {error}
            </div>
          )}

          <div>
            <label className="block text-xs text-slate-500 mb-1">新定价倍率 <span className="text-red-500">*</span></label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={value}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setValue(e.target.value)}
                className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 font-mono"
                placeholder="1.33"
              />
              <span className="text-slate-400 text-sm">x</span>
            </div>
            {parseFloat(value) !== currentValue && !isNaN(parseFloat(value)) && (
              <p className="mt-1 text-xs text-slate-400">
                从 {currentValue.toFixed(2)}x → {parseFloat(value).toFixed(2)}x
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs text-slate-500 mb-1">变更原因 <span className="text-red-500">*</span></label>
            <textarea
              value={reason}
              onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setReason(e.target.value)}
              rows={2}
              placeholder="请填写变更原因"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button onClick={onClose} disabled={saving} className="px-4 py-2 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50">取消</button>
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 text-sm bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50"
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              {saving ? '提交中...' : '确认修改'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
