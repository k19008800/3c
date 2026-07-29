import { useEffect, useState, useCallback } from 'react'
import { get, patch } from '@/lib/api'
import { Loader2, AlertCircle, CheckCircle2, Save, Shield } from 'lucide-react'
import FeatureDescription from '@/components/admin/FeatureDescription'

const TWOFA_OPTIONS = [
  { value: 'disabled', label: '关闭', desc: '不强制使用双因素认证' },
  { value: 'voluntary', label: '用户可选', desc: '用户可自行开启/关闭双因素认证' },
  { value: 'mandatory_admin', label: '管理员强制', desc: '管理员必须启用双因素认证，普通用户可选' },
  { value: 'mandatory_all', label: '全员强制', desc: '所有用户必须启用双因素认证' },
]

export default function TwoFactorPolicy() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [currentPolicy, setCurrentPolicy] = useState('voluntary')

  const fetchPolicy = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await get<{ list: Array<{ key: string; value: string }> }>('/api/v1/admin/configs/enhanced?group=security')
      const config = data.list?.find((c: any) => c.key === 'require_2fa')
      if (config) setCurrentPolicy(config.value)
    } catch (err: any) {
      setError(err.message || '获取策略配置失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchPolicy() }, [fetchPolicy])

  const handleSave = async () => {
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      await patch('/api/v1/admin/configs/enhanced/require_2fa', { value: currentPolicy })
      setSuccess('双因素认证策略已更新')
      setTimeout(() => setSuccess(''), 3000)
    } catch (err: any) {
      setError(err.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="animate-spin" size={32} />
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Shield className="text-blue-600" size={28} />
          双因素认证策略
          <FeatureDescription pageId="admin-2fa-policy" />
        </h1>
        <p className="text-slate-500 mt-2">
          设置系统级双因素认证策略。该策略与用户级设置采用 AND 逻辑：只有系统允许且用户开启时，2FA 才生效。
        </p>
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 p-3 text-sm text-red-600 bg-red-50 rounded-lg border border-red-200">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {success && (
        <div className="mb-4 flex items-center gap-2 p-3 text-sm text-green-600 bg-green-50 rounded-lg border border-green-200">
          <CheckCircle2 size={16} />
          {success}
        </div>
      )}

      <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-4">
        <div className="space-y-3">
          {TWOFA_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className={`flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition ${
                currentPolicy === opt.value
                  ? 'border-blue-400 bg-blue-50'
                  : 'border-slate-200 hover:bg-slate-50'
              }`}
            >
              <input
                type="radio"
                name="2fa-policy"
                value={opt.value}
                checked={currentPolicy === opt.value}
                onChange={(e) => setCurrentPolicy(e.target.value)}
                className="mt-1"
              />
              <div>
                <span className="font-medium text-slate-900">{opt.label}</span>
                <p className="text-sm text-slate-500 mt-0.5">{opt.desc}</p>
              </div>
            </label>
          ))}
        </div>

        <div className="pt-4 border-t border-slate-200">
          <h3 className="text-sm font-medium text-slate-900 mb-2">策略等级说明</h3>
          <table className="w-full text-sm text-slate-600">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left py-2 pr-4">策略等级</th>
                <th className="text-left py-2 pr-4">管理员</th>
                <th className="text-left py-2">普通用户</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-slate-100">
                <td className="py-2 pr-4">disabled</td>
                <td className="py-2 pr-4">关闭</td>
                <td className="py-2">关闭</td>
              </tr>
              <tr className="border-b border-slate-100">
                <td className="py-2 pr-4">voluntary</td>
                <td className="py-2 pr-4">可选</td>
                <td className="py-2">可选</td>
              </tr>
              <tr className="border-b border-slate-100">
                <td className="py-2 pr-4">mandatory_admin</td>
                <td className="py-2 pr-4">强制</td>
                <td className="py-2">可选</td>
              </tr>
              <tr>
                <td className="py-2 pr-4">mandatory_all</td>
                <td className="py-2 pr-4">强制</td>
                <td className="py-2">强制</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="pt-4 flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition"
          >
            {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
            保存策略
          </button>
        </div>
      </div>

      {/* 用户级 2FA 说明 */}
      <div className="mt-6 bg-blue-50 rounded-lg border border-blue-200 p-4">
        <h3 className="text-sm font-medium text-blue-800 mb-1">关联设置</h3>
        <p className="text-sm text-blue-600">
          用户在个人设置中自行启用/关闭双因素认证的页面位于：
          <a href="/console/security/2fa" className="underline ml-1 hover:text-blue-800">
            安全设置 → 双因素认证
          </a>
        </p>
        <p className="text-xs text-blue-400 mt-1">
          AND 逻辑：系统策略允许 且 用户已开启 时，登录需要 2FA 验证码。
        </p>
      </div>
    </div>
  )
}
