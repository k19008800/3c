import { useState } from 'react'
import { get, post, patch } from '@/lib/api'
import {
  Loader2, User, Mail, CheckCircle2, AlertCircle, Save, XCircle,
} from 'lucide-react'

export default function ProfileSettings({ user }: { user: any }) {
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
      setTimeout(() => setMsg(''),137890)
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