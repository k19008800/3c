/**
 * ApiKeyPanel — API Key 轮换 Modal
 */

import { useState, useCallback } from 'react'
import { RefreshCw, Loader2, X, AlertCircle, Key } from 'lucide-react'
import api from '@/lib/api'

interface Props {
  open: boolean
  vendorKey: string
  onClose: () => void
  onRotated: (newKey: string) => void
}

export default function ApiKeyPanel({ open, vendorKey, onClose, onRotated }: Props) {
  const [newKey, setNewKey] = useState('')
  const [generated, setGenerated] = useState('')
  const [rotating, setRotating] = useState(false)
  const [error, setError] = useState('')

  const handleRotate = useCallback(async () => {
    setRotating(true)
    setError('')
    try {
      const res = await api.put('/api/vendor/key', { key: newKey || undefined }, {
        headers: { 'X-Vendor-Key': vendorKey },
      })
      const resultKey = res.data?.data?.key || res.data?.key || '新 Key 已生成'
      setGenerated(resultKey)
      onRotated(resultKey)
    } catch (e: any) {
      setError(e?.response?.data?.message || e.message || '轮换失败')
    } finally {
      setRotating(false)
    }
  }, [newKey, vendorKey, onRotated])

  const handleClose = useCallback(() => {
    setNewKey('')
    setGenerated('')
    setError('')
    onClose()
  }, [onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={handleClose}>
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Key size={18} />轮换 API Key
          </h3>
          <button onClick={handleClose} className="text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-red-600 bg-red-50 p-2 rounded text-sm mb-3">
            <AlertCircle size={16} />{error}
          </div>
        )}

        {generated ? (
          <div className="space-y-3">
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-700">
              Key 轮换成功！请保存新 Key：
            </div>
            <code className="block p-3 bg-slate-100 rounded-lg text-sm font-mono break-all">
              {generated}
            </code>
            <button
              onClick={handleClose}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg text-sm"
            >
              关闭
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              输入新 Key 留空则自动生成。轮换后旧 Key 立即失效。
            </p>
            <input
              type="text" value={newKey}
              onChange={e => setNewKey(e.target.value)}
              placeholder="留空自动生成"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={handleRotate}
              disabled={rotating}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-1"
            >
              {rotating ? (
                <Loader2 className="animate-spin" size={14} />
              ) : (
                <RefreshCw size={14} />
              )}
              确认轮换
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
