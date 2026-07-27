// ═══════════════════════════════════════════════════
//  VendorStatusSwitchDialog — 供应商状态切换确认弹窗 (PRD 4.3.1)
//  切换为维护/离线模式时显示影响范围、备用供应商
// ═══════════════════════════════════════════════════

import { useEffect, useState } from 'react'
import { Loader2, AlertTriangle, ShieldAlert } from 'lucide-react'
import { get, patch } from '@/lib/api'
import type { Vendor } from '@/types'

interface VendorAffectedInfo {
  totalModels: number
  affectedCalls: number
  affectedDau: number
  backupVendors: Array<{ id: number; name: string; status: string }>
}

interface Props {
  vendor: Vendor
  newStatus: 'active' | 'maintenance' | 'offline'
  onClose: () => void
  onConfirm: () => void
}

const STATUS_LABELS: Record<string, string> = {
  active: '在线',
  maintenance: '维护模式',
  offline: '离线',
}

const STATUS_COLORS: Record<string, string> = {
  active: 'text-green-600 bg-green-50',
  maintenance: 'text-amber-600 bg-amber-50',
  offline: 'text-red-600 bg-red-50',
}

export default function VendorStatusSwitchDialog({ vendor, newStatus, onClose, onConfirm }: Props) {
  const [info, setInfo] = useState<VendorAffectedInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    get<VendorAffectedInfo>(`/api/v1/admin/vendors/${vendor.id}/switch-info`, { targetStatus: newStatus })
      .then(d => { if (!cancelled) setInfo(d) })
      .catch(() => { if (!cancelled) setInfo(null) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [vendor.id, newStatus])

  const handleConfirm = async () => {
    setSaving(true)
    try {
      await patch(`/api/v1/admin/vendors/${vendor.id}`, { status: newStatus, switchReason: reason || undefined })
      onConfirm()
    } catch { } finally {
      setSaving(false)
    }
  }

  const fromLabel = STATUS_LABELS[vendor.status || 'active']
  const toLabel = STATUS_LABELS[newStatus]
  const isDowngrade = newStatus === 'offline' || (newStatus === 'maintenance' && vendor.status === 'active')

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl w-full max-w-lg p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-slate-900 mb-2 flex items-center gap-2">
          {isDowngrade ? <ShieldAlert size={20} className="text-amber-600" /> : <AlertTriangle size={20} className="text-blue-600" />}
          切换供应商状态
        </h3>

        <div className="flex items-center gap-3 py-3">
          <span className="text-sm text-slate-600">{vendor.name}</span>
          <span className={`text-xs px-2 py-0.5 rounded font-medium ${STATUS_COLORS[vendor.status || 'active']}`}>
            {fromLabel}
          </span>
          <span className="text-slate-300">→</span>
          <span className={`text-xs px-2 py-0.5 rounded font-medium ${STATUS_COLORS[newStatus]}`}>
            {toLabel}
          </span>
        </div>

        {isDowngrade && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
            <p className="text-xs text-amber-800 font-medium mb-1">⚠️ 切换影响</p>
            {loading ? (
              <div className="flex items-center gap-2 text-xs text-amber-600"><Loader2 size={12} className="animate-spin" /> 计算影响范围...</div>
            ) : info ? (
              <ul className="text-xs text-amber-700 space-y-1">
                <li>• {info.totalModels} 个模型的请求将受影响</li>
                <li>• 影响约 {info.affectedCalls.toLocaleString()} 次/日 调用</li>
                <li>• 影响约 {info.affectedDau} 个活跃用户</li>
                {info.backupVendors.length > 0 ? (
                  <li className="text-green-700 mt-1">
                    ✅ 备用供应商就绪：{info.backupVendors.map(v => v.name).join('、')}
                  </li>
                ) : (
                  <li className="text-red-700 mt-1">
                    ❌ 无备用供应商配置，请求将直接返回错误
                  </li>
                )}
              </ul>
            ) : (
              <p className="text-xs text-amber-700">无法获取影响数据，请确认切换无误后继续</p>
            )}
          </div>
        )}

        {newStatus === 'offline' && (
          <div className="mb-4">
            <label className="text-xs text-slate-500 mb-1 block">下线原因 <span className="text-red-500">*</span></label>
            <textarea
              className="w-full border border-slate-200 rounded-lg p-2.5 text-sm outline-none focus:border-blue-400 resize-none"
              rows={2}
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="请填写下线原因..."
            />
          </div>
        )}

        <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 transition"
          >
            取消
          </button>
          <button
            onClick={handleConfirm}
            disabled={saving || (newStatus === 'offline' && !reason.trim())}
            className={`px-4 py-2 text-sm text-white rounded-lg transition disabled:opacity-50 ${isDowngrade ? 'bg-amber-600 hover:bg-amber-700' : 'bg-blue-600 hover:bg-blue-700'}`}
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : null}
            确认切换为{toLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
