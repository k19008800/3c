import { useState } from 'react'
import { Loader2, AlertCircle } from 'lucide-react'
import { del } from '@/lib/api'
import type { VendorModel } from '@/types'

interface DeleteModalProps {
  item: VendorModel
  onClose: () => void
  onSuccess: () => void
}

export default function DeleteModal({ item, onClose, onSuccess }: DeleteModalProps) {
  const [deleting, setDeleting] = useState(false)
  const [message, setMessage] = useState('')

  const handleDelete = async () => {
    setDeleting(true)
    setMessage('')
    try {
      await del(`/api/v1/admin/vendor-models/${item.id}`)
      onSuccess()
    } catch (err: any) {
      setMessage('删除失败：' + (err.message || ''))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl w-full max-w-md shadow-xl">
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">确认删除</h2>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl">&times;</button>
          </div>

          {message && (
            <div className="flex items-center gap-2 p-3 text-sm rounded-lg bg-red-50 text-red-600">
              <AlertCircle size={16} />
              {message}
            </div>
          )}

          <p className="text-sm text-slate-600">
            确定要删除供应商 <strong>{item.vendorName || `#${item.vendorId}`}</strong> 下的模型映射
            <strong>{item.upstreamModelName}</strong>（{item.modelName || `#${item.modelId}`}）吗?
            此操作不可撤销。
          </p>

          <div className="flex gap-2 justify-end">
            <button onClick={onClose} className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-800">
              取消
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="flex items-center gap-1 px-4 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
            >
              {deleting && <Loader2 className="animate-spin" size={14} />}
              删除
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}