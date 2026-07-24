import { useEffect, useState } from 'react'
import { Loader2, AlertCircle, RefreshCw, Settings2, TrendingUp, X } from 'lucide-react'
import PaginationBar from '@/components/ui/PaginationBar'
import { PriceTable } from './prices/components'
import { usePrices } from './prices/hooks'
import { fmtPrice } from './prices/types'
import type { VendorModelRow } from './prices/types'

export default function AdminPrices() {
  const { models, multiplier, history, total, loading, error, fetchPrices, updatePrice, batchUpdateSell } = usePrices()

  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  const [editModel, setEditModel] = useState<VendorModelRow | null>(null)
  const [showMultiplierModal, setShowMultiplierModal] = useState(false)
  const [newMultiplier, setNewMultiplier] = useState('1.33')

  useEffect(() => {
    fetchPrices()
  }, [fetchPrices])

  const handleSaveEdit = async () => {
    if (!editModel) return
    // TODO: 实际保存逻辑
    setEditModel(null)
  }

  const handleApplyMultiplier = async () => {
    const mult = parseFloat(newMultiplier)
    if (isNaN(mult) || mult <= 0) return
    const ok = await batchUpdateSell(mult)
    if (ok) setShowMultiplierModal(false)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">价格管理</h1>
        <div className="flex gap-2">
          <button
            onClick={fetchPrices}
            className="flex items-center gap-1.5 px-3 py-2 text-sm border rounded-lg hover:bg-slate-50"
          >
            <RefreshCw size={16} />
            刷新
          </button>
          <button
            onClick={() => setShowMultiplierModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm border rounded-lg hover:bg-slate-50"
          >
            <Settings2 size={16} />
            批量倍率
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border p-4">
          <div className="text-sm text-slate-600">总模型数</div>
          <div className="text-2xl font-bold">{total}</div>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <div className="text-sm text-slate-600">全局倍率</div>
          <div className="text-2xl font-bold">{multiplier.toFixed(2)}x</div>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <div className="text-sm text-slate-600">历史记录</div>
          <div className="text-2xl font-bold">{history.length}</div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-4 bg-red-50 text-red-700 rounded-lg">
          <AlertCircle size={20} />
          {error}
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="animate-spin" size={32} />
          </div>
        ) : models.length === 0 ? (
          <div className="text-center py-16 text-slate-500">暂无价格数据</div>
        ) : (
          <PriceTable models={models} onEdit={(m) => setEditModel(m)} />
        )}

        {/* Pagination */}
        <div className="border-t border-slate-200 px-4 py-3">
          <PaginationBar
            page={page}
            pageSize={pageSize}
            total={total}
            totalPages={Math.ceil(total / pageSize)}
            onPageChange={setPage}
            onPageSizeChange={() => {}}
          />
        </div>
      </div>

      {/* Edit Modal */}
      {editModel && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">编辑价格</h3>
              <button onClick={() => setEditModel(null)} className="p-1 hover:bg-slate-100 rounded">
                <X size={20} />
              </button>
            </div>
            <div className="space-y-4">
              <div className="text-sm text-slate-600">{editModel.modelName}</div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">售价(输入)</label>
                  <input
                    type="number"
                    step="0.000001"
                    defaultValue={editModel.sellPriceInput}
                    className="w-full px-3 py-2 border rounded-lg text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">售价(输出)</label>
                  <input
                    type="number"
                    step="0.000001"
                    defaultValue={editModel.sellPriceOutput}
                    className="w-full px-3 py-2 border rounded-lg text-sm font-mono"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <button
                  onClick={() => setEditModel(null)}
                  className="px-4 py-2 text-sm border rounded-lg"
                >
                  取消
                </button>
                <button
                  onClick={handleSaveEdit}
                  className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg"
                >
                  保存
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Multiplier Modal */}
      {showMultiplierModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl w-full max-w-sm p-6">
            <h3 className="text-lg font-semibold mb-4">批量设置倍率</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">新倍率</label>
                <input
                  type="number"
                  step="0.01"
                  value={newMultiplier}
                  onChange={(e) => setNewMultiplier(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setShowMultiplierModal(false)}
                  className="px-4 py-2 text-sm border rounded-lg"
                >
                  取消
                </button>
                <button
                  onClick={handleApplyMultiplier}
                  className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg"
                >
                  应用
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}