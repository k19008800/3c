import { useState, useEffect, useCallback } from 'react'
import { Lock, ShieldOff, UserX, X, Loader2 } from 'lucide-react'
import type { BanFormSubmitData } from './types'

interface Props {
  type: 'ip' | 'user'
  loading: boolean
  onSubmit: (data: BanFormSubmitData) => void
  onClose: () => void
}

function BanIpForm({ loading, onSubmit, onClose }: {
  loading: boolean
  onSubmit: (data: BanFormSubmitData) => void
  onClose: () => void
}) {
  const [ip, setIp] = useState('')
  const [duration, setDuration] = useState(60)

  const handleSubmit = useCallback(() => {
    if (!ip.trim()) return
    onSubmit({ ip: ip.trim(), duration })
  }, [ip, duration, onSubmit])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-slate-800 flex items-center gap-2">
            <ShieldOff size={18} /> 手动封禁 IP
          </h3>
          <button onClick={onClose} disabled={loading} className="p-1 hover:bg-slate-100 rounded">
            <X size={18} />
          </button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-slate-500 mb-1">IP 地址</label>
            <input
              type="text"
              value={ip}
              onChange={(e) => setIp(e.target.value)}
              placeholder="如 192.168.1.1"
              disabled={loading}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:opacity-50"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">封禁时长（分钟，1~1440）</label>
            <input
              type="number"
              value={duration}
              onChange={(e) => setDuration(Math.max(1, Math.min(1440, parseInt(e.target.value) || 1)))}
              disabled={loading}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:opacity-50"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} disabled={loading} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || !ip.trim()}
            className="px-4 py-2 text-sm bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 transition flex items-center gap-1"
          >
            {loading ? <Loader2 className="animate-spin" size={14} /> : <Lock size={14} />}
            确认封禁
          </button>
        </div>
      </div>
    </div>
  )
}

function BanUserForm({ loading, onSubmit, onClose }: {
  loading: boolean
  onSubmit: (data: BanFormSubmitData) => void
  onClose: () => void
}) {
  const [userId, setUserId] = useState('')
  const [duration, setDuration] = useState(1440)
  const [reason, setReason] = useState('')

  const handleSubmit = useCallback(() => {
    const uid = parseInt(userId, 10)
    if (!uid) return
    onSubmit({ userId: uid, duration, reason: reason.trim() || undefined })
  }, [userId, duration, reason, onSubmit])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-slate-800 flex items-center gap-2">
            <UserX size={18} /> 手动封禁用户
          </h3>
          <button onClick={onClose} disabled={loading} className="p-1 hover:bg-slate-100 rounded">
            <X size={18} />
          </button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-slate-500 mb-1">用户 ID</label>
            <input
              type="number"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="输入用户数字 ID"
              disabled={loading}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-50"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">封禁时长（分钟，1~43200，默认24小时）</label>
            <input
              type="number"
              value={duration}
              onChange={(e) => setDuration(Math.max(1, Math.min(43200, parseInt(e.target.value) || 1)))}
              disabled={loading}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-50"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">封禁原因（可选）</label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="如：异常调用、恶意刷单"
              disabled={loading}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-50"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} disabled={loading} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || !parseInt(userId, 10)}
            className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition flex items-center gap-1"
          >
            {loading ? <Loader2 className="animate-spin" size={14} /> : <Lock size={14} />}
            确认封禁
          </button>
        </div>
      </div>
    </div>
  )
}

export default function BanForm({ type, loading, onSubmit, onClose }: Props) {
  return type === 'ip' ? (
    <BanIpForm loading={loading} onSubmit={onSubmit} onClose={onClose} />
  ) : (
    <BanUserForm loading={loading} onSubmit={onSubmit} onClose={onClose} />
  )
}
