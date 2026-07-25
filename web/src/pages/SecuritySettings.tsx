import { useState, useEffect } from 'react'
import { post, get, del } from '@/lib/api'
import {
  Loader2, Lock, Eye, EyeOff, Save, CheckCircle2, AlertCircle,
  Monitor, Smartphone, Globe, MonitorOff, LogOut,
} from 'lucide-react'

interface PasswordForm {
  oldPassword: string
  newPassword: string
  confirmPassword: string
}

interface SessionItem {
  id: number
  ip: string
  userAgent: string | null
  city: string | null
  country: string | null
  isActive: boolean
  lastActivity: string | null
  createdAt: string | null
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

  // ── 登录设备管理 ──
  const [sessions, setSessions] = useState<SessionItem[]>([])
  const [sessionsLoading, setSessionsLoading] = useState(false)
  const [logoutLoading, setLogoutLoading] = useState<number | null>(null)
  const [logoutAllLoading, setLogoutAllLoading] = useState(false)

  useEffect(() => { loadSessions() }, [])

  const loadSessions = async () => {
    setSessionsLoading(true)
    try {
      const res = await get<{ data: SessionItem[] }>('/api/v1/me/sessions')
      if (res?.data) setSessions(res.data)
    } catch { /* ignore */ }
    setSessionsLoading(false)
  }

  const handleLogoutSession = async (id: number) => {
    setLogoutLoading(id)
    try {
      await del(`/api/v1/me/sessions/${id}`)
      setSessions((prev) => prev.filter((s) => s.id !== id))
    } catch { /* ignore */ }
    setLogoutLoading(null)
  }

  const handleLogoutOthers = async () => {
    setLogoutAllLoading(true)
    try {
      await del('/api/v1/me/sessions/others')
      await loadSessions()
    } catch { /* ignore */ }
    setLogoutAllLoading(false)
  }

  const guessDeviceIcon = (ua: string | null) => {
    if (!ua) return Monitor
    const lua = ua.toLowerCase()
    if (lua.includes('mobile') || lua.includes('android') || lua.includes('iphone') || lua.includes('ipad')) return Smartphone
    if (lua.includes('bot') || lua.includes('curl') || lua.includes('python')) return Globe
    return Monitor
  }

  const guessDeviceName = (ua: string | null): string => {
    if (!ua) return '未知设备'
    const lua = ua.toLowerCase()
    if (lua.includes('chrome')) return 'Chrome'
    if (lua.includes('firefox')) return 'Firefox'
    if (lua.includes('safari') && !lua.includes('chrome')) return 'Safari'
    if (lua.includes('edge')) return 'Edge'
    if (lua.includes('mobile')) return '手机端'
    if (lua.includes('bot') || lua.includes('curl')) return 'API 调用'
    return '其他浏览器'
  }

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

      {/* ── 已登录设备 ── */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-slate-800 flex items-center gap-2">
            <Monitor size={18} /> 已登录设备
          </h2>
          {sessions.length > 1 && (
            <button
              onClick={handleLogoutOthers}
              disabled={logoutAllLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600 transition disabled:opacity-50"
            >
              {logoutAllLoading ? <Loader2 size={12} className="animate-spin" /> : <LogOut size={12} />}
              登出其他设备
            </button>
          )}
        </div>

        {sessionsLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 size={20} className="animate-spin text-slate-400" />
          </div>
        ) : sessions.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-4">暂无活跃会话</p>
        ) : (
          <div className="space-y-2">
            {sessions.map((s) => {
              const DeviceIcon = guessDeviceIcon(s.userAgent)
              return (
                <div
                  key={s.id}
                  className="flex items-center justify-between p-3 rounded-lg border border-slate-100 hover:bg-slate-50 transition"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500 shrink-0">
                      <DeviceIcon size={16} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-700">{guessDeviceName(s.userAgent)}</p>
                      <p className="text-xs text-slate-400 truncate">
                        {[s.city, s.country, s.ip].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-[10px] text-slate-400">
                      {s.lastActivity ? formatSessionTime(s.lastActivity) : ''}
                    </span>
                    <button
                      onClick={() => handleLogoutSession(s.id)}
                      disabled={logoutLoading === s.id}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg hover:bg-red-50 hover:text-red-600 hover:border-red-200 text-slate-500 transition disabled:opacity-50"
                    >
                      {logoutLoading === s.id ? (
                        <Loader2 size={10} className="animate-spin" />
                      ) : (
                        <LogOut size={10} />
                      )}
                      登出
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function formatSessionTime(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`
  if (diff < 604800000) return `${Math.floor(diff / 86400000)} 天前`
  return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}