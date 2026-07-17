// ── KeyCreateForm — 创建 API Key 表单 ──
// 包含名称输入、权限模块选择、过期时间、创建成功弹窗

import { useState, useCallback } from 'react'
import { post } from '@/lib/api'
import {
  Loader2, AlertCircle, CheckCircle2, X, Copy, Plus,
} from 'lucide-react'

interface KeyCreateFormProps {
  open: boolean
  onClose: () => void
  onCreated: () => void
}

const VALID_MODULES = [
  'users', 'finance', 'vendors', 'models', 'agents',
  'security', 'system', 'audit', 'stats',
] as const

const VALID_ACTIONS = ['read', 'write', 'delete', '*'] as const

export default function KeyCreateForm({ open, onClose, onCreated }: KeyCreateFormProps) {
  const [name, setName] = useState('')
  const [permissions, setPermissions] = useState<string[]>([])
  const [expiresAt, setExpiresAt] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')
  const [createdKey, setCreatedKey] = useState<{ key: string; name: string } | null>(null)

  const togglePermission = useCallback((perm: string) => {
    setPermissions((prev) =>
      prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm],
    )
  }, [])

  const handleCreate = async () => {
    setFormError('')
    if (!name.trim()) {
      setFormError('请输入名称')
      return
    }
    setSubmitting(true)
    try {
      const data = await post<{
        id: number
        name: string
        key: string
        keyPrefix: string
        permissions: string[]
        createdAt: string
      }>('/api/v1/admin/api-keys', {
        name: name.trim(),
        permissions,
        expiresAt: expiresAt || undefined,
      })
      setCreatedKey({ key: data.key, name: data.name })
      setName('')
      setPermissions([])
      setExpiresAt('')
      onClose()
      onCreated()
    } catch (err: any) {
      setFormError(err.message || '创建失败')
    } finally {
      setSubmitting(false)
    }
  }

  const copyToClipboard = useCallback((text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      alert('已复制到剪贴板')
    })
  }, [])

  const resetForm = useCallback(() => {
    setName('')
    setPermissions([])
    setExpiresAt('')
    setFormError('')
  }, [])

  if (!open) return null

  return (
    <>
      {/* Create form card */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-amber-200 space-y-4">
        <h3 className="font-semibold text-slate-900">创建管理 API Key</h3>

        {formError && (
          <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm">
            <AlertCircle size={16} />
            {formError}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              名称 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="如：运维脚本 Key"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              权限 <span className="text-red-500">*</span>
            </label>
            <div className="space-y-2">
              {VALID_MODULES.map((mod) => (
                <div key={mod} className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-slate-600 w-16">{mod}</span>
                  {VALID_ACTIONS.map((act) => {
                    const perm = `${mod}:${act}`
                    const isAll = act === '*'
                    const selected = permissions.includes(perm)
                    return (
                      <button
                        key={perm}
                        type="button"
                        onClick={() => togglePermission(perm)}
                        className={`px-2 py-1 text-xs rounded border transition ${
                          selected
                            ? 'bg-amber-100 border-amber-400 text-amber-800'
                            : 'border-slate-200 text-slate-500 hover:border-slate-300'
                        }`}
                      >
                        {act}
                        {isAll ? ' (全部)' : ''}
                      </button>
                    )
                  })}
                </div>
              ))}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPermissions(['*:*'])}
                  className={`px-2 py-1 text-xs rounded border transition ${
                    permissions.includes('*:*')
                      ? 'bg-amber-100 border-amber-400 text-amber-800'
                      : 'border-slate-200 text-slate-500 hover:border-slate-300'
                  }`}
                >
                  *:* (全部权限)
                </button>
                {permissions.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setPermissions([])}
                    className="px-2 py-1 text-xs text-red-500 hover:text-red-700 transition"
                  >
                    清空选择
                  </button>
                )}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              过期时间（可选）
            </label>
            <input
              type="datetime-local"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleCreate}
            disabled={submitting}
            className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50 transition text-sm"
          >
            {submitting && <Loader2 className="animate-spin" size={16} />}
            <Plus size={16} />
            创建
          </button>
          <button
            onClick={() => {
              resetForm()
              onClose()
            }}
            className="px-4 py-2 border border-slate-300 text-slate-600 rounded-lg hover:bg-slate-50 transition text-sm"
          >
            取消
          </button>
        </div>
      </div>

      {/* Created key success modal */}
      {createdKey && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setCreatedKey(null)}
        >
          <div
            className="bg-white rounded-xl p-6 max-w-lg w-full mx-4 shadow-xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle2 size={20} />
                <h3 className="font-semibold">Key 创建成功</h3>
              </div>
              <button
                onClick={() => setCreatedKey(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={18} />
              </button>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-2">
              <p className="text-sm font-medium text-amber-800">
                请立即保存此 Key，关闭后将不再显示！
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-white px-3 py-2 rounded border border-amber-300 text-sm font-mono break-all select-all">
                  {createdKey.key}
                </code>
                <button
                  onClick={() => copyToClipboard(createdKey.key)}
                  className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded transition"
                  title="复制"
                >
                  <Copy size={16} />
                </button>
              </div>
              <p className="text-xs text-slate-500">名称：{createdKey.name}</p>
            </div>
            <button
              onClick={() => setCreatedKey(null)}
              className="w-full py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition text-sm"
            >
              我已保存
            </button>
          </div>
        </div>
      )}
    </>
  )
}
