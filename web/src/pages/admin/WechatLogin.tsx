import { useEffect, useState } from 'react'
import { get, put } from '@/lib/api'
import { Loader2, Save, Eye, EyeOff, MessageCircle } from 'lucide-react'
import FeatureDescription from '@/components/admin/FeatureDescription'

interface WechatConfig {
  enabled: boolean
  appId: string
  appSecret: string
  redirectUri: string
  description: string
}

export default function WechatLoginPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [showSecret, setShowSecret] = useState(false)

  const [form, setForm] = useState<WechatConfig>({
    enabled: false,
    appId: '',
    appSecret: '',
    redirectUri: '',
    description: '',
  })

  useEffect(() => { loadConfig() }, [])

  async function loadConfig() {
    setLoading(true)
    try {
      const res = await get('/api/v1/admin/settings/wechat-login')
      if (res.data) setForm(res.data)
    } catch (e: any) {
      setMessage(`加载失败: ${e?.message}`)
    } finally {
      setLoading(false)
    }
  }

  function updateField<K extends keyof WechatConfig>(key: K, value: WechatConfig[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  async function handleSave() {
    setSaving(true)
    setMessage('')
    try {
      await put('/api/v1/admin/settings/wechat-login', {
        enabled: form.enabled,
        appId: form.appId,
        appSecret: form.appSecret,
        redirectUri: form.redirectUri,
        description: form.description,
      })
      setMessage('配置已保存')
    } catch (e: any) {
      setMessage(`保存失败: ${e?.message}`)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-2">
        <MessageCircle className="w-6 h-6 text-green-600" />
        <h1 className="text-2xl font-bold">微信扫码登录</h1>
        <FeatureDescription page="微信扫码账号登录" />
      </div>

      {message && (
        <div className={`p-3 rounded-lg text-sm ${message.includes('失败') || message.includes('失败') ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'}`}>
          {message}
        </div>
      )}

      {/* 配置表单 */}
      <div className="bg-white rounded-lg border shadow-sm p-6 space-y-5">
        {/* 启用开关 */}
        <div className="flex items-center justify-between">
          <div>
            <div className="font-medium">启用微信扫码登录</div>
            <div className="text-xs text-gray-500">开启后登录页将显示「微信扫码登录」按钮</div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={e => updateField('enabled', e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-green-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-green-600"></div>
          </label>
        </div>

        {/* AppID */}
        <div>
          <label className="block text-sm font-medium mb-1">AppID</label>
          <input
            value={form.appId}
            onChange={e => updateField('appId', e.target.value)}
            placeholder="wx1234567890abcdef"
            className="w-full px-3 py-2 border rounded-lg text-sm font-mono"
          />
          <p className="text-xs text-gray-400 mt-1">微信开放平台网站应用的 AppID</p>
        </div>

        {/* AppSecret */}
        <div>
          <label className="block text-sm font-medium mb-1">AppSecret</label>
          <div className="relative">
            <input
              type={showSecret ? 'text' : 'password'}
              value={form.appSecret}
              onChange={e => updateField('appSecret', e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm font-mono pr-10"
            />
            <button
              type="button"
              onClick={() => setShowSecret(!showSecret)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400"
            >
              {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* 回调地址 */}
        <div>
          <label className="block text-sm font-medium mb-1">回调地址（OAuth Redirect URI）</label>
          <input
            value={form.redirectUri}
            onChange={e => updateField('redirectUri', e.target.value)}
            placeholder="https://api.unmisa.com/api/v1/auth/wechat/callback"
            className="w-full px-3 py-2 border rounded-lg text-sm font-mono"
          />
          <p className="text-xs text-gray-400 mt-1">
            此地址需在微信开放平台「网站应用 → 接口信息 → OAuth2.0 回调域」中配置
          </p>
        </div>

        {/* 描述 */}
        <div>
          <label className="block text-sm font-medium mb-1">描述</label>
          <input
            value={form.description}
            onChange={e => updateField('description', e.target.value)}
            placeholder="例如：3Cloud 微信扫码登录"
            className="w-full px-3 py-2 border rounded-lg text-sm"
          />
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          {saving ? '保存中...' : '保存配置'}
        </button>
      </div>

      {/* 帮助说明 */}
      <div className="bg-blue-50 rounded-lg p-4 text-sm text-blue-800 border border-blue-200 space-y-1">
        <p className="font-medium">💡 配置步骤</p>
        <ol className="list-decimal ml-4 space-y-1">
          <li>前往 <a href="https://open.weixin.qq.com" target="_blank" rel="noreferrer" className="underline">微信开放平台 (open.weixin.qq.com)</a> 注册开发者账号</li>
          <li>创建「网站应用」，获取 AppID 和 AppSecret</li>
          <li>在「接口信息」中设置 OAuth2.0 回调域（域名即可，无需完整路径）</li>
          <li>将回调地址 <code className="text-xs bg-blue-100 px-1 rounded">https://api.unmisa.com/api/v1/auth/wechat/callback</code> 填入上方</li>
          <li>保存配置后，登录页将显示微信扫码登录按钮</li>
        </ol>
        <p className="mt-2 text-xs text-blue-600">
          💰 注意：微信开放平台网站应用扫码登录需通过开发者认证（300元/年）
        </p>
      </div>
    </div>
  )
}