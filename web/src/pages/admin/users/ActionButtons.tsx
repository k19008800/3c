// ──────────────────────────────────────────────
//  ActionButtons — 用户详情底部操作按钮组
//  包含：导出数据 / 模拟登录 / 变更角色
// ──────────────────────────────────────────────

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { post } from '@/lib/api'
import { useImpersonate } from '@/hooks/use-impersonate'
import type { ImpersonateResult } from '@/types'
import { roleColor, ROLE_OPTIONS } from './_shared'
import {
  FileJson, LogIn, RefreshCw, Loader2, AlertCircle,
} from 'lucide-react'

// ── Export Data ────────────────────────────────

interface ExportDataButtonProps {
  userId: number
  onMsg: (s: string) => void
}

export function ExportDataButton({ userId, onMsg }: ExportDataButtonProps) {
  const handle = async () => {
    try {
      const res = await fetch(
        `/api/v1/admin/users/${userId}/export-data`,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('accessToken')}`,
          },
        },
      )
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `user_${userId}_data_export_${Date.now()}.json`
      a.click()
      URL.revokeObjectURL(url)
      onMsg('✅ 数据导出完成')
    } catch (err: any) {
      onMsg('❌ ' + (err.message || ''))
    }
  }

  return (
    <button
      onClick={handle}
      className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-slate-300 rounded-lg hover:bg-slate-100 transition"
    >
      <FileJson size={14} /> 导出用户数据
    </button>
  )
}

// ── Impersonate ────────────────────────────────

interface ImpersonateButtonProps {
  userId: number
  email: string
  onMsg: (s: string) => void
}

export function ImpersonateButton({
  userId,
  email,
  onMsg,
}: ImpersonateButtonProps) {
  const [open, setOpen] = useState(false)
  const [duration, setDuration] = useState(30)
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)
  const { startImpersonate } = useImpersonate()
  const navigate = useNavigate()

  const handle = async () => {
    setLoading(true)
    try {
      const res = await post<ImpersonateResult>(
        '/api/v1/admin/users/impersonate',
        {
          userId,
          durationMinutes: duration,
          reason: reason || undefined,
        },
      )
      startImpersonate(
        res.accessToken,
        res.userId,
        email,
        res.expiresIn,
      )
      setOpen(false)
      window.location.href = '/'
    } catch (err: any) {
      onMsg('❌ ' + (err.message || ''))
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-slate-300 rounded-lg hover:bg-slate-100 transition"
      >
        <LogIn size={14} /> 模拟登录
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50"
          onClick={(e) => e.target === e.currentTarget && setOpen(false)}
        >
          <div
            className="bg-white rounded-xl w-full max-w-sm p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold mb-4">模拟登录</h3>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 text-sm">
              <p className="text-amber-800">
                即将以 <strong>{email}</strong> 的身份操作
              </p>
              <p className="text-amber-600 text-xs mt-1">
                跳转后将进入用户前台视角，可查看仪表盘、API Key 等
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1">
                  有效期（分钟）
                </label>
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">
                  原因（可选）
                </label>
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  placeholder="例如: 排查用户问题"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => setOpen(false)}
                className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800"
              >
                取消
              </button>
              <button
                onClick={handle}
                disabled={loading}
                className="flex items-center gap-1.5 px-4 py-2 text-sm bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50"
              >
                {loading && (
                  <Loader2 size={14} className="animate-spin" />
                )}
                确认，进入用户视角
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ── Change Role Dialog ────────────────────────

interface ChangeRoleDialogProps {
  userId: number
  currentRole: string
  currentLabel: string
  onClose: () => void
  onMsg: (s: string) => void
}

export function ChangeRoleDialog({
  userId,
  currentRole,
  currentLabel,
  onClose,
  onMsg,
}: ChangeRoleDialogProps) {
  const [newRole, setNewRole] = useState('')
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async () => {
    if (!newRole) {
      setError('请选择新角色')
      return
    }
    if (newRole === currentRole) {
      setError('新角色与当前角色相同')
      return
    }
    setLoading(true)
    setError('')
    try {
      await post(`/api/v1/admin/users/${userId}/change-role`, {
        role: newRole,
        reason: reason.trim() || undefined,
      })
      onMsg(
        `✅ 角色已变更: ${currentLabel} → ${ROLE_OPTIONS.find((r) => r.value === newRole)?.label || newRole}`,
      )
      onClose()
    } catch (err: any) {
      setError(err.message || '变更失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="bg-white rounded-xl w-full max-w-md p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold mb-4 flex items-center gap-2">
          <RefreshCw size={18} /> 变更用户角色
        </h3>

        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 mb-4 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-slate-500">当前角色：</span>
            <span
              className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${roleColor[currentRole] || 'bg-slate-100 text-slate-700'}`}
            >
              {currentLabel}
            </span>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs text-slate-500 mb-1">新角色 *</label>
            <select
              value={newRole}
              onChange={(e) => {
                setNewRole(e.target.value)
                setError('')
              }}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">请选择新角色</option>
              {ROLE_OPTIONS.filter((r) => r.value !== currentRole).map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">
              变更原因（可选）
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="例如: 调整为普通用户，不再承担管理职责"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">影响说明</label>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 space-y-1">
              <p>• 变更后用户刷新页面即可生效</p>
              <p>• 降级后会失去后台管理菜单的访问权限</p>
              <p>• 操作记录将写入角色变更历史</p>
            </div>
          </div>
        </div>

        {error && (
          <div className="mt-3 p-3 text-sm rounded-lg bg-red-50 text-red-600 flex items-center gap-2">
            <AlertCircle size={16} /> {error}
          </div>
        )}

        <div className="flex justify-end gap-2 mt-5">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || !newRole}
            className="flex items-center gap-1.5 px-4 py-2 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50"
          >
            {loading && <Loader2 size={14} className="animate-spin" />}
            确认变更
          </button>
        </div>
      </div>
    </div>
  )
}
