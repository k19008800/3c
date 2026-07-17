// ──────────────────────────────────────────────
//  CreateUserModal — 创建用户弹窗
// ──────────────────────────────────────────────

import { useState } from 'react'
import { post } from '@/lib/api'
import { UserPlus, Loader2 } from 'lucide-react'

interface CreateUserModalProps {
  onClose: () => void
}

export default function CreateUserModal({ onClose }: CreateUserModalProps) {
  const [form, setForm] = useState({
    email: '',
    password: '',
    nickname: '',
    phone: '',
    userType: 'personal' as const,
    role: 'user' as const,
    balance: '0',
    discountRate: '1',
  })
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')

  const handleSubmit = async () => {
    if (!form.email || !form.password) {
      setMsg('邮箱和密码为必填')
      return
    }
    if (form.password.length < 6) {
      setMsg('密码至少6位')
      return
    }
    setLoading(true)
    setMsg('')
    try {
      await post('/api/v1/admin/users', form)
      setMsg('✅ 用户创建成功')
      setTimeout(onClose, 1200)
    } catch (err: any) {
      setMsg('❌ ' + (err.message || ''))
    } finally {
      setLoading(false)
    }
  }

  const update = (key: string, value: string) =>
    setForm((f) => ({ ...f, [key]: value }))

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="bg-white rounded-xl w-full max-w-md shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <UserPlus size={20} /> 创建用户
            </h2>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 text-xl"
            >
              &times;
            </button>
          </div>

          {msg && (
            <div className="p-3 text-sm rounded-lg bg-blue-50 text-blue-700">
              {msg}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs text-slate-500 mb-1">邮箱 *</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => update('email', e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs text-slate-500 mb-1">密码 *</label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => update('password', e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">昵称</label>
              <input
                type="text"
                value={form.nickname}
                onChange={(e) => update('nickname', e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">手机</label>
              <input
                type="text"
                value={form.phone}
                onChange={(e) => update('phone', e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">类型</label>
              <select
                value={form.userType}
                onChange={(e) => update('userType', e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              >
                <option value="personal">个人</option>
                <option value="enterprise">企业</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">角色</label>
              <select
                value={form.role}
                onChange={(e) => update('role', e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              >
                <option value="user">用户</option>
                <option value="admin">管理员</option>
                <option value="agent">代理商</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">初始余额</label>
              <input
                type="number"
                step="0.01"
                value={form.balance}
                onChange={(e) => update('balance', e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">折扣率</label>
              <input
                type="number"
                step="0.01"
                min="0"
                max="1"
                value={form.discountRate}
                onChange={(e) => update('discountRate', e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800"
            >
              取消
            </button>
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="flex items-center gap-1.5 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {loading && <Loader2 size={14} className="animate-spin" />} 创建
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
