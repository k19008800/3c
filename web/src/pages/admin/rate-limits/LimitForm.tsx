import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { post } from '@/lib/api'
import type { OverrideItem } from './types'

interface OverrideDialogProps {
  open: boolean
  editItem: OverrideItem | null
  onClose: () => void
  onSaved: () => void
}

export default function OverrideDialog({ open, editItem, onClose, onSaved }: OverrideDialogProps) {
  const [userId, setUserId] = useState('')
  const [rpmLimit, setRpmLimit] = useState('')
  const [tpmLimit, setTpmLimit] = useState('')
  const [periodStart, setPeriodStart] = useState('')
  const [periodEnd, setPeriodEnd] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (editItem) {
      setUserId(String(editItem.userId))
      setRpmLimit(editItem.rpmLimit !== null ? String(editItem.rpmLimit) : '')
      setTpmLimit(editItem.tpmLimit !== null ? String(editItem.tpmLimit) : '')
      setPeriodStart(editItem.periodStart ? editItem.periodStart.slice(0, 10) : '')
      setPeriodEnd(editItem.periodEnd ? editItem.periodEnd.slice(0, 10) : '')
    } else {
      setUserId('')
      setRpmLimit('')
      setTpmLimit('')
      setPeriodStart('')
      setPeriodEnd('')
    }
    setError('')
  }, [editItem, open])

  if (!open) return null

  const handleSave = async () => {
    setError('')

    if (!editItem && !userId.trim()) {
      setError('请输入用户ID')
      return
    }
    const rpmVal = rpmLimit.trim() ? parseInt(rpmLimit, 10) : null
    const tpmVal = tpmLimit.trim() ? parseInt(tpmLimit, 10) : null
    if (!rpmVal && !tpmVal) {
      setError('至少设置 RPM 或 TPM 之一')
      return
    }
    if ((rpmVal !== null && rpmVal < 1) || (tpmVal !== null && tpmVal < 1)) {
      setError('RPM 和 TPM 必须大于 0')
      return
    }

    setSaving(true)
    try {
      const body: Record<string, unknown> = {
        userId: editItem ? editItem.userId : parseInt(userId, 10),
        rpmLimit: rpmVal,
        tpmLimit: tpmVal,
      }
      if (periodStart) body.periodStart = periodStart + 'T00:00:00.000Z'
      if (periodEnd) body.periodEnd = periodEnd + 'T23:59:59.000Z'
      await post('/api/v1/admin/rate-limits/overrides', body)
      onSaved()
      onClose()
    } catch (err: any) {
      setError(err.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handleBackdropClick = () => onClose()

  const handleContentClick = (e: React.MouseEvent) => e.stopPropagation()

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={handleBackdropClick}>
      <div className="bg-white rounded-xl shadow-xl border border-slate-200 p-6 w-full max-w-lg mx-4" onClick={handleContentClick}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-slate-900">
            {editItem ? '编辑限流覆盖' : '添加限流覆盖'}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4">
          {!editItem && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">用户 ID</label>
              <input
                type="number"
                min="1"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="输入用户 ID"
              />
            </div>
          )}

          {editItem && <CurrentWaterLevel editItem={editItem} />}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">RPM 限制（请求/分）</label>
            <input
              type="number"
              min="1"
              value={rpmLimit}
              onChange={(e) => setRpmLimit(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="留空表示不限制 RPM"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">TPM 限制（Token/分）</label>
            <input
              type="number"
              min="1"
              value={tpmLimit}
              onChange={(e) => setTpmLimit(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="留空表示不限制 TPM"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">生效日期</label>
              <input
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">过期日期</label>
              <input
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <p className="text-xs text-slate-400">留空则默认为当月</p>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 p-2 rounded">{error}</div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-slate-300 text-slate-600 rounded-lg text-sm hover:bg-slate-50 transition"
            >
              取消
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 transition"
            >
              {saving ? '保存中...' : '保存'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── 当前水位展示（编辑时） ──

function CurrentWaterLevel({ editItem }: { editItem: OverrideItem }) {
  const getRpmColor = () => {
    if (editItem.currentRpm > (editItem.rpmLimit ?? 99999)) return 'text-red-600'
    if (editItem.currentRpm > ((editItem.rpmLimit ?? 99999) * 0.7)) return 'text-yellow-600'
    return 'text-slate-900'
  }

  const getTpmColor = () => {
    if (editItem.currentTpm > (editItem.tpmLimit ?? 99999999)) return 'text-red-600'
    if (editItem.currentTpm > ((editItem.tpmLimit ?? 99999999) * 0.7)) return 'text-yellow-600'
    return 'text-slate-900'
  }

  return (
    <div>
      <div className="bg-slate-50 rounded-lg p-3 mb-3">
        <div className="text-xs text-slate-500 mb-2">当前实时水位（分钟窗口）</div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-xs text-slate-400">RPM</div>
            <div className={`text-lg font-bold ${getRpmColor()}`}>
              {editItem.currentRpm.toLocaleString()}
            </div>
            <div className="text-xs text-slate-400">上限: {editItem.rpmLimit?.toLocaleString() ?? '无'}</div>
          </div>
          <div>
            <div className="text-xs text-slate-400">TPM</div>
            <div className={`text-lg font-bold ${getTpmColor()}`}>
              {editItem.currentTpm.toLocaleString()}
            </div>
            <div className="text-xs text-slate-400">上限: {editItem.tpmLimit?.toLocaleString() ?? '无'}</div>
          </div>
        </div>
      </div>
      <div className="text-sm text-slate-500">
        用户：<span className="font-medium text-slate-800">{editItem.userNickname || `ID:${editItem.userId}`}</span>
        {editItem.userEmail && <span className="ml-1">({editItem.userEmail})</span>}
      </div>
    </div>
  )
}
