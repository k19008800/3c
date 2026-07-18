// ── KeyModelPricesModal — 配置 Key 对不同模型的专属折扣/价格 ──
// 场景 B：同一个 Key 在不同模型上设不同的定价

import { useEffect, useState, useCallback } from 'react'
import { get, post, del } from '@/lib/api'
import { DollarSign, Loader2, Save, Trash2, AlertCircle } from 'lucide-react'

interface ModelPriceRow {
  vendorModelId: number
  modelId: number
  modelName: string
  modelDisplayName: string | null
  upstreamModelName: string
  status: boolean
  baseSellPriceInput: number
  baseSellPriceOutput: number
  priceId: number | null
  type: string | null
  inputValue: number | null
  outputValue: number | null
}

interface Props {
  itemId: number
  groupId: number
  apiKeyPrefix: string | null
  open: boolean
  onClose: () => void
  onSaved: () => void
}

export default function KeyModelPricesModal({ itemId, groupId, apiKeyPrefix, open, onClose, onSaved }: Props) {
  const [rows, setRows] = useState<ModelPriceRow[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [dirty, setDirty] = useState(false)

  // 编辑中的行状态
  const [editMap, setEditMap] = useState<Record<number, {
    type: string
    inputValue: string
    outputValue: string
    enabled: boolean
  }>>({})

  const loadPrices = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await get<ModelPriceRow[]>(`/api/v1/admin/key-group-items/${itemId}/model-prices`)
      setRows(data)

      // 初始化编辑状态
      const map: Record<number, any> = {}
      for (const row of data) {
        map[row.vendorModelId] = {
          type: row.type ?? 'percent',
          inputValue: row.inputValue != null ? String(row.inputValue) : '',
          outputValue: row.outputValue != null ? String(row.outputValue) : '',
          enabled: row.priceId != null, // 已有交叉价 = 已启用
        }
      }
      setEditMap(map)
      setDirty(false)
    } catch (err: any) {
      setError(err.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }, [itemId])

  useEffect(() => {
    if (open) loadPrices()
  }, [open, loadPrices])

  const updateRow = (vendorModelId: number, field: string, value: any) => {
    setEditMap(prev => ({
      ...prev,
      [vendorModelId]: { ...prev[vendorModelId], [field]: value },
    }))
    setDirty(true)
  }

  const handleSave = async () => {
    setSaving(true)
    setError('')

    // 收集有编辑的行
    const prices: any[] = []
    for (const row of rows) {
      const edit = editMap[row.vendorModelId]
      if (!edit) continue

      if (edit.enabled) {
        prices.push({
          vendorModelId: row.vendorModelId,
          type: edit.type,
          inputValue: edit.inputValue ? parseFloat(edit.inputValue) : null,
          outputValue: edit.outputValue ? parseFloat(edit.outputValue) : null,
        })
      } else {
        // 禁用了 → 删除该交叉价（如果之前有）
        if (row.priceId != null) {
          await del(`/api/v1/admin/key-model-prices/${row.priceId}`).catch(() => {})
        }
      }
    }

    try {
      await post(`/api/v1/admin/key-group-items/${itemId}/model-prices/batch`, { prices })
      setDirty(false)
      onSaved()
      onClose()
    } catch (err: any) {
      setError(err.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-4xl shadow-xl mx-4 max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Key 模型价格配置</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Key: {apiKeyPrefix || `#${itemId}`} ｜ 设置该 Key 在各通道上的专属折扣/定价
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">&times;</button>
        </div>

        {error && (
          <div className="flex items-center gap-2 px-5 py-2 text-sm bg-red-50 text-red-600 border-b border-red-100">
            <AlertCircle size={14} />{error}
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="text-center py-12"><Loader2 className="animate-spin inline-block" size={28} /></div>
          ) : rows.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <DollarSign size={36} className="mx-auto mb-2 opacity-40" />
              <p className="text-sm">该分组下暂无关联的通道</p>
              <p className="text-xs text-slate-300 mt-1">请先在「模型映射」中配置该分组</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-left border-b border-slate-200">
                  <th className="px-3 py-2 text-xs font-medium text-slate-500 w-12">启用</th>
                  <th className="px-3 py-2 text-xs font-medium text-slate-500">模型</th>
                  <th className="px-3 py-2 text-xs font-medium text-slate-500">上游模型名</th>
                  <th className="px-3 py-2 text-xs font-medium text-slate-500 text-right">基价(入)</th>
                  <th className="px-3 py-2 text-xs font-medium text-slate-500 text-right">基价(出)</th>
                  <th className="px-3 py-2 text-xs font-medium text-slate-500 w-24">折扣类型</th>
                  <th className="px-3 py-2 text-xs font-medium text-slate-500 text-right w-28">
                    值(入)
                    <span className="font-normal text-slate-400 ml-1">percent</span>
                  </th>
                  <th className="px-3 py-2 text-xs font-medium text-slate-500 text-right w-28">
                    值(出)
                    <span className="font-normal text-slate-400 ml-1">percent</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map(row => {
                  const edit = editMap[row.vendorModelId] || { type: 'percent', inputValue: '', outputValue: '', enabled: false }
                  return (
                    <tr key={row.vendorModelId} className={`hover:bg-slate-50 ${!row.status ? 'opacity-50' : ''}`}>
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={edit.enabled}
                          onChange={e => updateRow(row.vendorModelId, 'enabled', e.target.checked)}
                          className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <span className="text-slate-900 font-medium">{row.modelDisplayName || row.modelName}</span>
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-400 font-mono">{row.upstreamModelName}</td>
                      <td className="px-3 py-2 text-right text-xs text-slate-600 font-mono">
                        ¥{row.baseSellPriceInput.toFixed(6)}
                      </td>
                      <td className="px-3 py-2 text-right text-xs text-slate-600 font-mono">
                        ¥{row.baseSellPriceOutput.toFixed(6)}
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={edit.type}
                          onChange={e => updateRow(row.vendorModelId, 'type', e.target.value)}
                          disabled={!edit.enabled}
                          className="w-full px-1.5 py-1 text-xs border border-slate-200 rounded focus:ring-1 focus:ring-blue-400 disabled:opacity-40"
                        >
                          <option value="percent">百分比</option>
                          <option value="absolute">固定价</option>
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          step="0.000001"
                          min="0"
                          max={edit.type === 'percent' ? '1' : undefined}
                          value={edit.inputValue}
                          onChange={e => updateRow(row.vendorModelId, 'inputValue', e.target.value)}
                          disabled={!edit.enabled}
                          placeholder={edit.type === 'percent' ? '0.8' : '0.0012'}
                          className="w-full px-2 py-1 text-xs text-right border border-slate-200 rounded font-mono focus:ring-1 focus:ring-blue-400 disabled:opacity-40"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          step="0.000001"
                          min="0"
                          max={edit.type === 'percent' ? '1' : undefined}
                          value={edit.outputValue}
                          onChange={e => updateRow(row.vendorModelId, 'outputValue', e.target.value)}
                          disabled={!edit.enabled}
                          placeholder={edit.type === 'percent' ? '0.8' : '0.0012'}
                          className="w-full px-2 py-1 text-xs text-right border border-slate-200 rounded font-mono focus:ring-1 focus:ring-blue-400 disabled:opacity-40"
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}

          {!loading && rows.length > 0 && (
            <div className="mt-4 text-xs text-slate-400 space-y-1 bg-slate-50 rounded-lg p-3">
              <p><strong>百分比模式：</strong>填入 0~1 之间的值，如 0.7 表示打 7 折，最终价 = 基价 × 百分比</p>
              <p><strong>固定价模式：</strong>直接填入价格 ¥/token，会完全替代基价</p>
              <p><strong>未启用的模型</strong>将使用 Key 统一价（如有设置）或通道价（基价）</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-slate-200 bg-slate-50 rounded-b-xl">
          <span className="text-xs text-slate-400">
            {dirty ? '⚠️ 有未保存的修改' : '✓ 已是最新'}
          </span>
          <div className="flex gap-2">
            <button onClick={onClose}
              className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800">取消</button>
            <button onClick={handleSave} disabled={saving || !dirty}
              className="flex items-center gap-1.5 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {saving ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />}
              保存配置
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
