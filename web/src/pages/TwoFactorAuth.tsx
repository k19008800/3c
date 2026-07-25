import { useState, useEffect } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { Shield, Key, Download, AlertCircle, CheckCircle, Copy, RefreshCw } from 'lucide-react'
import axios from 'axios'

interface TwoFactorStatus {
  enabled: boolean
  backupCodesCount: number
}

export default function TwoFactorAuth() {
  const [status, setStatus] = useState<TwoFactorStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [setupData, setSetupData] = useState<{
    secret: string
    otpauth: string
    backupCodes: string[]
  } | null>(null)
  const [verifyCode, setVerifyCode] = useState('')
  const [disablePassword, setDisablePassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [showBackupCodes, setShowBackupCodes] = useState(false)
  const [newBackupCodes, setNewBackupCodes] = useState<string[] | null>(null)

  // 获取 2FA 状态
  useEffect(() => {
    fetchStatus()
  }, [])

  const fetchStatus = async () => {
    try {
      const res = await axios.get('/api/v1/me/2fa/status')
      setStatus(res.data.data)
    } catch (err) {
      console.error('获取 2FA 状态失败:', err)
    } finally {
      setLoading(false)
    }
  }

  // 初始化 2FA
  const handleSetup = async () => {
    setError('')
    setSuccess('')
    setSubmitting(true)
    try {
      const res = await axios.post('/api/v1/me/2fa/setup')
      setSetupData(res.data.data)
    } catch (err: any) {
      setError(err.response?.data?.message || '初始化失败')
    } finally {
      setSubmitting(false)
    }
  }

  // 验证并启用 2FA
  const handleVerify = async () => {
    setError('')
    setSuccess('')
    if (!verifyCode || verifyCode.length !== 6) {
      setError('请输入 6 位验证码')
      return
    }
    setSubmitting(true)
    try {
      await axios.post('/api/v1/me/2fa/verify', { token: verifyCode })
      setSuccess('双因素认证已启用')
      setSetupData(null)
      setVerifyCode('')
      fetchStatus()
    } catch (err: any) {
      setError(err.response?.data?.message || '验证失败')
    } finally {
      setSubmitting(false)
    }
  }

  // 禁用 2FA
  const handleDisable = async () => {
    setError('')
    setSuccess('')
    if (!disablePassword) {
      setError('请输入密码')
      return
    }
    setSubmitting(true)
    try {
      await axios.post('/api/v1/me/2fa/disable', { password: disablePassword })
      setSuccess('双因素认证已禁用')
      setDisablePassword('')
      fetchStatus()
    } catch (err: any) {
      setError(err.response?.data?.message || '禁用失败')
    } finally {
      setSubmitting(false)
    }
  }

  // 重新生成备用码
  const handleRegenerateBackupCodes = async () => {
    setError('')
    setSuccess('')
    setSubmitting(true)
    try {
      const res = await axios.post('/api/v1/me/2fa/backup-codes')
      setNewBackupCodes(res.data.data.backupCodes)
      setShowBackupCodes(true)
      fetchStatus()
    } catch (err: any) {
      setError(err.response?.data?.message || '生成失败')
    } finally {
      setSubmitting(false)
    }
  }

  // 下载备用码
  const downloadBackupCodes = (codes: string[]) => {
    const content = `3Cloud 双因素认证备用码\n生成时间: ${new Date().toLocaleString()}\n\n${codes.join('\n')}\n\n请妥善保管这些备用码，每个备用码只能使用一次。`
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = '3cloud-2fa-backup-codes.txt'
    a.click()
    URL.revokeObjectURL(url)
  }

  // 复制到剪贴板
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    setSuccess('已复制到剪贴板')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Shield className="text-blue-600" size={28} />
          双因素认证
        </h1>
        <p className="text-slate-500 mt-2">
          为您的账户添加额外安全层，使用 Google Authenticator 或类似应用生成验证码
        </p>
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 p-3 text-sm text-red-600 bg-red-50 rounded-lg">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {success && (
        <div className="mb-4 flex items-center gap-2 p-3 text-sm text-green-600 bg-green-50 rounded-lg">
          <CheckCircle size={16} />
          {success}
        </div>
      )}

      {/* 2FA 状态 */}
      {status && !setupData && (
        <div className="bg-white rounded-lg border border-slate-200 p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">当前状态</h2>
              <p className="text-sm text-slate-500 mt-1">
                {status.enabled
                  ? '双因素认证已启用，您的账户受到额外保护'
                  : '双因素认证未启用'}
              </p>
            </div>
            <div
              className={`px-3 py-1 rounded-full text-sm font-medium ${
                status.enabled
                  ? 'bg-green-100 text-green-700'
                  : 'bg-slate-100 text-slate-600'
              }`}
            >
              {status.enabled ? '已启用' : '未启用'}
            </div>
          </div>

          {status.enabled ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                <div>
                  <p className="text-sm font-medium text-slate-900">备用码</p>
                  <p className="text-xs text-slate-500 mt-1">
                    剩余 {status.backupCodesCount} 个备用码
                  </p>
                </div>
                <button
                  onClick={handleRegenerateBackupCodes}
                  disabled={submitting}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition disabled:opacity-50"
                >
                  <RefreshCw size={14} />
                  重新生成
                </button>
              </div>

              <div className="pt-4 border-t border-slate-200">
                <h3 className="text-sm font-medium text-slate-900 mb-2">禁用双因素认证</h3>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={disablePassword}
                    onChange={(e) => setDisablePassword(e.target.value)}
                    placeholder="请输入密码"
                    className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={handleDisable}
                    disabled={submitting}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition"
                  >
                    禁用
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <button
              onClick={handleSetup}
              disabled={submitting}
              className="w-full py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition flex items-center justify-center gap-2"
            >
              <Key size={18} />
              启用双因素认证
            </button>
          )}
        </div>
      )}

      {/* 设置向导 */}
      {setupData && (
        <div className="space-y-6">
          {/* 步骤 1：扫描二维码 */}
          <div className="bg-white rounded-lg border border-slate-200 p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">
              步骤 1：扫描二维码
            </h2>
            <p className="text-sm text-slate-500 mb-4">
              使用 Google Authenticator、Microsoft Authenticator 或类似应用扫描下方二维码
            </p>
            <div className="flex justify-center mb-4">
              <div className="p-4 bg-white rounded-lg border-2 border-slate-200">
                <QRCodeSVG value={setupData.otpauth} size={200} />
              </div>
            </div>
            <div className="text-center">
              <p className="text-xs text-slate-500 mb-2">无法扫描？手动输入密钥：</p>
              <div className="flex items-center justify-center gap-2">
                <code className="px-3 py-1 bg-slate-100 rounded text-sm font-mono">
                  {setupData.secret}
                </code>
                <button
                  onClick={() => copyToClipboard(setupData.secret)}
                  className="p-1 text-slate-500 hover:text-slate-700"
                >
                  <Copy size={14} />
                </button>
              </div>
            </div>
          </div>

          {/* 步骤 2：验证码验证 */}
          <div className="bg-white rounded-lg border border-slate-200 p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">
              步骤 2：输入验证码
            </h2>
            <p className="text-sm text-slate-500 mb-4">
              输入认证应用显示的 6 位验证码以完成设置
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={verifyCode}
                onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                maxLength={6}
                className="flex-1 px-4 py-2 text-center text-2xl font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={handleVerify}
                disabled={submitting || verifyCode.length !== 6}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition"
              >
                验证
              </button>
            </div>
          </div>

          {/* 步骤 3：备用码 */}
          <div className="bg-white rounded-lg border border-slate-200 p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <Key size={20} />
              步骤 3：保存备用码
            </h2>
            <p className="text-sm text-slate-500 mb-4">
              这些备用码用于在无法访问认证应用时验证身份。请妥善保管，每个备用码只能使用一次。
            </p>
            <div className="grid grid-cols-2 gap-2 mb-4">
              {setupData.backupCodes.map((code, i) => (
                <div
                  key={i}
                  className="px-3 py-2 bg-slate-50 rounded text-center font-mono text-sm"
                >
                  {code}
                </div>
              ))}
            </div>
            <button
              onClick={() => downloadBackupCodes(setupData.backupCodes)}
              className="w-full py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition flex items-center justify-center gap-2"
            >
              <Download size={16} />
              下载备用码
            </button>
          </div>
        </div>
      )}

      {/* 新备用码弹窗 */}
      {showBackupCodes && newBackupCodes && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full m-4">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">新备用码</h2>
            <p className="text-sm text-slate-500 mb-4">
              旧备用码已失效，请保存这些新备用码：
            </p>
            <div className="grid grid-cols-2 gap-2 mb-4">
              {newBackupCodes.map((code, i) => (
                <div
                  key={i}
                  className="px-3 py-2 bg-slate-50 rounded text-center font-mono text-sm"
                >
                  {code}
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => downloadBackupCodes(newBackupCodes)}
                className="flex-1 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition flex items-center justify-center gap-2"
              >
                <Download size={16} />
                下载
              </button>
              <button
                onClick={() => {
                  setShowBackupCodes(false)
                  setNewBackupCodes(null)
                }}
                className="flex-1 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
