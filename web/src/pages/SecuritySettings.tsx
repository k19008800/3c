import { useState } from 'react'
import { post } from '@/lib/api'
import {
  Loader2, Lock, Eye, EyeOff, Save, CheckCircle2, AlertCircle,
} from 'lucide-react'

interface PasswordForm {
  oldPassword: string
  newPassword: string
  confirmPassword: string
}

export default function SecuritySettings() {
  const [form, setForm] = useState<PasswordForm>({
    oldPassword: '',
    newPassword: '',
    confirmPassword: '',
  })
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [msgType, setMsgType] = useState<'success' | 'error'>('success')
  const [showOld, setShowOld] = useState(false)
  const [showNew, setShowNew] = useState(false)

  const handleChange = (field: keyof PasswordForm, value: string) => {
    setForm((f) => ({ ...f, [field]: value }))
  }

  const handleSubmit = async () => {
    if (!form.oldPassword) {
      setMsg('请输入旧密码')
      setMsgType('error')
      return
    }
    if (form.newPassword.length < 6) {
      setMsg('新密码至少 6 位')
      setMsgType('error')
      return
    }
    if (form.newPassword !== form.confirmPassword) {
      setMsg('两次密码输入不一致')
      setMsgType('error')
      return
    }

    setSaving(true)
    setMsg('')
    try {
      await post('/api/v1/auth/change-password', {
        oldPassword: form.oldPassword,
        newPassword: form.newPassword,
      })
      setMsg('密码修改成功')
      setMsgType('success')
      setForm({ oldPassword: '', newPassword: '', confirmPassword: '' })
    } catch (err: any) {
      setMsg(err.message || '修改密码失败')
      setMsgType('error')
    } finally {
      setSaving(false)
      setTimeout(() => setMsg(''), 3000)
    }
  }

  const inputCls = 'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 pr-9'

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
      <h2 className="font-semibold text-slate-800 flex items-center gap-2">
        <Lock size={18} /> 修改密码
      </h2>

      {msg && (
        <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${
          msgType === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'
        }`}>
          {msgType === 'success' ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
          {msg}
        </div>
      )}

      <div className="space-y-3 max-w-md">
        <div>
          <label className="block text-sm text-slate-600 mb-1">当前密码</label>
          <div className="relative">
            <input
              type={showOld ? 'text' : 'password'}
              value={form.oldPassword}
              onChange={(e) => handleChange('oldPassword', e.target.value)}
              placeholder="输入当前密码"
              className={inputCls}
            />
            <button
              type="button"
              onClick={() => setShowOld(!showOld)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              {showOld ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        <div>
          <label className="block text-sm text-slate-600 mb-1">新密码</label>
          <div className="relative">
            <input
              type={showNew ? 'text' : 'password'}
              value={form.newPassword}
              onChange={(e) => handleChange('newPassword', e.target.value)}
              placeholder="至少 6 位"
              className={inputCls}
            />
            <button
              type="button"
              onClick={() => setShowNew(!showNew)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        <div>
          <label className="block text-sm text-slate-600 mb-1">确认新密码</label>
          <input
            type="password"
            value={form.confirmPassword}
            onChange={(e) => handleChange('confirmPassword', e.target.value)}
            placeholder="再次输入新密码"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <button
          onClick={handleSubmit}
          disabled={saving}
          className="flex items-center justify-center gap-1.5 px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium transition"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          修改密码
        </button>
      </div>
    </div>
  )
}