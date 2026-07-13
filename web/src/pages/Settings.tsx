import { useEffect, useState, useCallback } from 'react'
import { get, post, patch, put } from '@/lib/api'
import { useAuth } from '@/hooks/use-auth'
import type { LoginHistoryItem, ActiveSession } from '@/types'
import {
  Loader2, User, Shield, Monitor, Clock, Smartphone, LogOut,
  CheckCircle2, XCircle, AlertCircle, Save, Lock, Eye, EyeOff,
  Globe, RefreshCw, Mail, Bell, BellRing,
} from 'lucide-react'

type Tab = 'profile' | 'security' | 'sessions' | 'login-history' | 'notifications'

interface PasswordForm {
  oldPassword: string
  newPassword: string
  confirmPassword: string
}

interface NotificationPreferences {
  rechargeSuccess: boolean
  lowBalanceAlert: boolean
  lowBalanceThreshold: number
  dailyUsageSummary: boolean
}

const DEFAULT_PREFS: NotificationPreferences = {
  rechargeSuccess: true,
  lowBalanceAlert: true,
  lowBalanceThreshold: 10,
  dailyUsageSummary: true,
}

// ── 个人设置（用户端）─-
//
// 【业务说明】
//   用户个人信息管理，包含四个标签页：
//   1. 个人资料：昵称编辑，邮箱验证（发送验证码→输入验证→状态更新）
//   2. 安全：修改密码（旧密码验证→新密码确认→加密保存）
//   3. 通知偏好：充值成功通知、余额不足提醒（可设阈值）、每日用量汇总的开关
//   4. 会话管理：同 Security 页面的会话管理
//
// 【权限要求】登录即可访问
// 【数据来源】GET /api/v1/auth/me, PATCH /api/v1/auth/me
// 【密码规则】旧密码必须匹配，新密码 min 8 字符含大写+数字

export default function Settings() {
  const { user } = useAuth()
  const [tab, setTab] = useState<Tab>('profile')

  const tabs: { key: Tab; label: string; icon: any }[] = [
    { key: 'profile', label: '个人资料', icon: User },
    { key: 'security', label: '安全', icon: Shield },
    { key: 'sessions', label: '会话管理', icon: Monitor },
    { key: 'login-history', label: '登录历史', icon: Clock },
    { key: 'notifications', label: '通知偏好', icon: Bell },
  ]

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <User size={28} className="text-blue-600" />
        <h1 className="text-2xl font-bold text-slate-900">个人设置</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-lg p-1 overflow-x-auto">
        {tabs.map((t) => {
          const Icon = t.icon
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md whitespace-nowrap transition ${
                tab === t.key
                  ? 'bg-white shadow-sm text-slate-900'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Icon size={16} />
              {t.label}
            </button>
          )
        })}
      </div>

      {tab === 'profile' && <ProfileTab user={user} />}
      {tab === 'security' && <SecurityTab />}
      {tab === 'sessions' && <SessionsTab />}
      {tab === 'login-history' && <LoginHistoryTab />}
      {tab === 'notifications' && <NotificationsTab />}
    </div>
  )
}

// ── Tab: Profile ──
function ProfileTab({ user }: { user: any }) {
  const [nickname, setNickname] = useState(user?.nickname || '')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [msgType, setMsgType] = useState<'success' | 'error'>('success')

  // Email verification state
  const [sendingVerify, setSendingVerify] = useState(false)
  const [verifyCode, setVerifyCode] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [verifyMsg, setVerifyMsg] = useState('')
  const [showVerifyInput, setShowVerifyInput] = useState(false)

  const emailVerified = !!user?.emailVerifiedAt

  const handleSave = async () => {
    if (!nickname.trim()) {
      setMsg('昵称不能为空')
      setMsgType('error')
      return
    }
    setSaving(true)
    setMsg('')
    try {
      await patch('/api/v1/auth/me', { nickname: nickname.trim() })
      setMsg('昵称更新成功')
      setMsgType('success')
      // Update localStorage user
      const stored = localStorage.getItem('user')
      if (stored) {
        const u = JSON.parse(stored)
        u.nickname = nickname.trim()
        localStorage.setItem('user', JSON.stringify(u))
      }
    } catch (err: any) {
      setMsg(err.message || '更新失败')
      setMsgType('error')
    } finally {
      setSaving(false)
      setTimeout(() => setMsg(''), 3000)
    }
  }

  const handleSendVerify = async () => {
    setSendingVerify(true)
    setVerifyMsg('')
    try {
      await post('/api/v1/auth/resend-verify')
      setVerifyMsg('验证码已发送到您的邮箱')
      setShowVerifyInput(true)
    } catch (err: any) {
      setVerifyMsg(err.message || '发送失败')
    } finally {
      setSendingVerify(false)
    }
  }

  const handleVerify = async () => {
    if (!verifyCode.trim()) {
      setVerifyMsg('请输入验证码')
      return
    }
    setVerifying(true)
    setVerifyMsg('')
    try {
      await post('/api/v1/auth/verify-email', { code: verifyCode.trim() })
      setVerifyMsg('邮箱验证成功')
      // Reload user
      const me = await get<any>('/api/v1/auth/me')
      localStorage.setItem('user', JSON.stringify(me))
      window.location.reload()
    } catch (err: any) {
      setVerifyMsg(err.message || '验证失败')
    } finally {
      setVerifying(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Email verification warning */}
      {!emailVerified && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <AlertCircle size={20} className="text-amber-500 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-800">邮箱未验证</p>
              <p className="text-xs text-amber-600 mt-1">
                验证您的邮箱地址可以提升账户安全性，部分功能可能要求已验证邮箱
              </p>
              <div className="mt-3 space-y-2">
                <button
                  onClick={handleSendVerify}
                  disabled={sendingVerify}
                  className="flex items-center gap-1 text-xs text-amber-700 bg-amber-100 hover:bg-amber-200 px-3 py-1.5 rounded-md transition disabled:opacity-50"
                >
                  {sendingVerify ? <Loader2 size={12} className="animate-spin" /> : <Mail size={12} />}
                  {showVerifyInput ? '重新发送验证码' : '发送验证码'}
                </button>
                {showVerifyInput && (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={verifyCode}
                      onChange={(e) => setVerifyCode(e.target.value)}
                      placeholder="输入验证码"
                      maxLength={6}
                      className="w-32 px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      onClick={handleVerify}
                      disabled={verifying || !verifyCode.trim()}
                      className="flex items-center gap-1 text-xs text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-md transition disabled:opacity-50"
                    >
                      {verifying ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                      验证
                    </button>
                  </div>
                )}
                {verifyMsg && (
                  <p className={`text-xs mt-1 ${verifyMsg.includes('成功') ? 'text-green-600' : 'text-amber-700'}`}>
                    {verifyMsg}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Profile card */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
        <h2 className="font-semibold text-slate-800 flex items-center gap-2">
          <User size={18} /> 基本信息
        </h2>

        {msg && (
          <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${
            msgType === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'
          }`}>
            {msgType === 'success' ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
            {msg}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4">
          <div>
            <label className="block text-sm text-slate-500 mb-1">邮箱</label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={user?.email || ''}
                disabled
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 text-slate-500 cursor-not-allowed"
              />
              {emailVerified ? (
                <span className="flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-1 rounded whitespace-nowrap">
                  <CheckCircle2 size={12} /> 已验证
                </span>
              ) : (
                <span className="flex items-center gap-1 text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded whitespace-nowrap">
                  <XCircle size={12} /> 未验证
                </span>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm text-slate-500 mb-1">昵称</label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="设置昵称"
                maxLength={50}
                className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={handleSave}
                disabled={saving || !nickname.trim()}
                className="flex items-center gap-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium transition"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                保存
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm text-slate-500 mb-1">账户类型</label>
            <p className="text-sm text-slate-800">
              {user?.userType === 'enterprise' ? '企业账户' : '个人账户'}
            </p>
          </div>

          <div>
            <label className="block text-sm text-slate-500 mb-1">注册时间</label>
            <p className="text-sm text-slate-800">
              {user?.createdAt ? new Date(user.createdAt).toLocaleString('zh-CN') : '-'}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Tab: Security ──
function SecurityTab() {
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

// ── Tab: Sessions ──
function SessionsTab() {
  const [sessions, setSessions] = useState<ActiveSession[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [loggingOut, setLoggingOut] = useState<number | null>(null)
  const [loggingOutAll, setLoggingOutAll] = useState(false)

  const fetchSessions = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await get<{ list: ActiveSession[] }>('/api/v1/auth/security/sessions')
      setSessions(data.list)
    } catch (err: any) {
      setError(err.message || '获取会话列表失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchSessions() }, [fetchSessions])

  const handleLogoutSession = async (sessionId: number) => {
    setLoggingOut(sessionId)
    try {
      await post(`/api/v1/auth/security/logout-session/${sessionId}`)
      setSessions((prev) => prev.filter((s) => s.id !== sessionId))
    } catch (err: any) {
      setError(err.message || '下线失败')
    } finally {
      setLoggingOut(null)
    }
  }

  const handleLogoutAll = async () => {
    setLoggingOutAll(true)
    try {
      await post('/api/v1/auth/security/logout-all')
      setSessions((prev) => prev.filter((s) => s.isCurrent))
    } catch (err: any) {
      setError(err.message || '下线失败')
    } finally {
      setLoggingOutAll(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin" size={32} />
      </div>
    )
  }

  const otherSessions = sessions.filter((s) => !s.isCurrent)

  return (
    <div className="bg-white rounded-xl border border-slate-200">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <h2 className="font-semibold text-slate-800 flex items-center gap-2">
          <Monitor size={18} /> 活跃会话 ({sessions.length})
        </h2>
        {otherSessions.length > 0 && (
          <button
            onClick={handleLogoutAll}
            disabled={loggingOutAll}
            className="flex items-center gap-1 text-xs text-red-600 hover:text-red-800 bg-red-50 px-2.5 py-1.5 rounded-md transition disabled:opacity-50"
          >
            {loggingOutAll ? <Loader2 className="animate-spin" size={12} /> : <LogOut size={12} />}
            下线其他设备
          </button>
        )}
      </div>

      {error && (
        <div className="p-3 text-sm text-red-600 bg-red-50 border-b border-red-100">{error}</div>
      )}

      <div className="divide-y divide-slate-100">
        {sessions.length === 0 ? (
          <div className="px-4 py-8 text-center text-slate-400 text-sm">暂无活跃会话</div>
        ) : (
          sessions.map((s) => (
            <div
              key={s.id}
              className={`px-4 py-3 flex items-center justify-between ${
                s.isCurrent ? 'bg-blue-50/50' : ''
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                  <Smartphone size={16} className="text-slate-500" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-800">
                      {s.city || '未知地点'}
                      {s.userAgent ? ' · ' + s.userAgent.slice(0, 40) + '...' : ''}
                    </span>
                    {s.isCurrent && (
                      <span className="text-xs text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                        当前设备
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    IP: {s.ip} · 最近活跃:{' '}
                    {new Date(s.lastActivity).toLocaleString('zh-CN')}
                  </div>
                </div>
              </div>
              {!s.isCurrent && (
                <button
                  onClick={() => handleLogoutSession(s.id)}
                  disabled={loggingOut === s.id}
                  className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 transition disabled:opacity-50"
                >
                  {loggingOut === s.id ? (
                    <Loader2 className="animate-spin" size={12} />
                  ) : (
                    <LogOut size={12} />
                  )}
                  下线
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

// ── Tab: Login History ──
function LoginHistoryTab() {
  const [history, setHistory] = useState<LoginHistoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    setLoading(true)
    setError('')
    get<{ list: LoginHistoryItem[] }>('/api/v1/auth/security/login-history', { limit: 20 })
      .then((data) => setHistory(data.list))
      .catch((err: any) => setError(err.message || '获取登录历史失败'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin" size={32} />
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200">
      <div className="px-4 py-3 border-b border-slate-100">
        <h2 className="font-semibold text-slate-800 flex items-center gap-2">
          <Clock size={18} /> 最近登录记录
        </h2>
      </div>

      {error && (
        <div className="p-3 text-sm text-red-600 bg-red-50 border-b border-red-100">{error}</div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="text-left text-xs text-slate-500 uppercase tracking-wider bg-slate-50/50">
              <th className="px-4 py-2.5">结果</th>
              <th className="px-4 py-2.5">时间</th>
              <th className="px-4 py-2.5">IP</th>
              <th className="px-4 py-2.5">地点</th>
              <th className="px-4 py-2.5">设备</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {history.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400 text-sm">
                  暂无登录记录
                </td>
              </tr>
            ) : (
              history.map((h) => (
                <tr key={h.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    {h.success ? (
                      <CheckCircle2 size={16} className="text-green-500" />
                    ) : (
                      <XCircle size={16} className="text-red-500" />
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600 whitespace-nowrap">
                    {new Date(h.createdAt).toLocaleString('zh-CN')}
                  </td>
                  <td className="px-4 py-3 text-sm font-mono text-slate-500">{h.ip}</td>
                  <td className="px-4 py-3 text-sm text-slate-600">
                    {h.city
                      ? `${h.city}${h.country ? `, ${h.country}` : ''}`
                      : '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-500 max-w-[200px] truncate">
                    {h.userAgent ? h.userAgent.slice(0, 50) + '...' : '-'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Tab: Notification Preferences ──
function NotificationsTab() {
  const [prefs, setPrefs] = useState<NotificationPreferences>(DEFAULT_PREFS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [msgType, setMsgType] = useState<'success' | 'error'>('success')
  const [dirty, setDirty] = useState(false)

  // Fetch current preferences
  useEffect(() => {
    setLoading(true)
    get<NotificationPreferences>('/api/v1/preferences/notifications')
      .then((data) => {
        if (data && typeof data === 'object') {
          setPrefs({
            rechargeSuccess: data.rechargeSuccess ?? DEFAULT_PREFS.rechargeSuccess,
            lowBalanceAlert: data.lowBalanceAlert ?? DEFAULT_PREFS.lowBalanceAlert,
            lowBalanceThreshold: data.lowBalanceThreshold ?? DEFAULT_PREFS.lowBalanceThreshold,
            dailyUsageSummary: data.dailyUsageSummary ?? DEFAULT_PREFS.dailyUsageSummary,
          })
        }
      })
      .catch(() => {
        // Use defaults if endpoint not yet available
      })
      .finally(() => setLoading(false))
  }, [])

  const updatePref = <K extends keyof NotificationPreferences>(key: K, value: NotificationPreferences[K]) => {
    setPrefs((p) => ({ ...p, [key]: value }))
    setDirty(true)
  }

  const handleSave = async () => {
    setSaving(true)
    setMsg('')
    try {
      await put('/api/v1/preferences/notifications', prefs)
      setMsg('通知偏好保存成功')
      setMsgType('success')
      setDirty(false)
    } catch (err: any) {
      setMsg(err.message || '保存失败')
      setMsgType('error')
    } finally {
      setSaving(false)
      setTimeout(() => setMsg(''), 3000)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin" size={32} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-6">
        <h2 className="font-semibold text-slate-800 flex items-center gap-2">
          <BellRing size={18} /> 通知偏好
        </h2>

        {msg && (
          <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${
            msgType === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'
          }`}>
            {msgType === 'success' ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
            {msg}
          </div>
        )}

        <div className="space-y-5">
          {/* Recharge Success */}
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-sm font-medium text-slate-800">充值成功通知</p>
              <p className="text-xs text-slate-400 mt-0.5">充值到账时发送通知</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={prefs.rechargeSuccess}
                onChange={(e) => updatePref('rechargeSuccess', e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600" />
            </label>
          </div>

          {/* Low Balance Alert */}
          <div className="py-2 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-800">余额不足提醒</p>
                <p className="text-xs text-slate-400 mt-0.5">余额低于阈值时发送提醒</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={prefs.lowBalanceAlert}
                  onChange={(e) => updatePref('lowBalanceAlert', e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600" />
              </label>
            </div>
            {prefs.lowBalanceAlert && (
              <div className="flex items-center gap-3 ml-0 pl-0">
                <span className="text-sm text-slate-500">阈值：</span>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">¥</span>
                  <input
                    type="number"
                    value={prefs.lowBalanceThreshold}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value)
                      if (!isNaN(v) && v >= 0) updatePref('lowBalanceThreshold', v)
                    }}
                    min={0}
                    step={0.01}
                    className="w-28 pl-7 pr-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <span className="text-xs text-slate-400">余额低于此金额时提醒</span>
              </div>
            )}
          </div>

          {/* Daily Usage Summary */}
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-sm font-medium text-slate-800">每日用量汇总</p>
              <p className="text-xs text-slate-400 mt-0.5">每天发送当日用量统计</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={prefs.dailyUsageSummary}
                onChange={(e) => updatePref('dailyUsageSummary', e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600" />
            </label>
          </div>
        </div>

        <div className="pt-2 border-t border-slate-100">
          <button
            onClick={handleSave}
            disabled={saving || !dirty}
            className="flex items-center justify-center gap-1.5 px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium transition"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            保存偏好
          </button>
        </div>
      </div>
    </div>
  )
}
