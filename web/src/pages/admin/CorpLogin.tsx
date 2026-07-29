import { useEffect, useState } from 'react'
import { get, put } from '@/lib/api'
import { Loader2, Save, Eye, EyeOff, Building2, ShieldCheck } from 'lucide-react'
import FeatureDescription from '@/components/admin/FeatureDescription'

interface CorpApp {
  provider: string
  enabled: boolean
  appId: string
  agentId: string
  appSecret: string
  redirectUri: string
  description: string
}

const PROVIDER_META: Record<string, { name: string; icon: string; docs: string }> = {
  wecom: { name: '企业微信', icon: '🏢', docs: 'https://developer.work.weixin.qq.com' },
  dingtalk: { name: '钉钉', icon: '🔔', docs: 'https://open.dingtalk.com' },
  feishu: { name: '飞书', icon: '📘', docs: 'https://open.feishu.cn' },
}

const FIELD_LABELS: Record<string, { appId: string; agentId: string; appSecret: string }> = {
  wecom: { appId: 'CorpID', agentId: 'AgentId', appSecret: 'CorpSecret' },
  dingtalk: { appId: 'AppKey', agentId: 'AgentId', appSecret: 'AppSecret' },
  feishu: { appId: 'AppID', agentId: '（无需填写）', appSecret: 'AppSecret' },
}

export default function CorpLoginPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [activeTab, setActiveTab] = useState('wecom')
  const [showSecret, setShowSecret] = useState(false)

  const [form, setForm] = useState<CorpApp>({
    provider: 'wecom',
    enabled: false,
    appId: '',
    agentId: '',
    appSecret: '',
    redirectUri: '',
    description: '',
  })

  useEffect(() => { loadConfig(activeTab) }, [activeTab])

  async function loadConfig(provider: string) {
    setLoading(true)
    try {
      const res = await get(`/api/v1/admin/settings/corp-login/${provider}`)
      if (res.data) setForm(res.data)
    } catch (e: any) {
      setError(e?.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }

  function updateField<K extends keyof CorpApp>(key: K, value: CorpApp[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  async function handleSave() {
    setSaving(true)
    setMessage('')
    try {
      await put(`/api/v1/admin/settings/corp-login/${activeTab}`, {
        enabled: form.enabled,
        appId: form.appId,
        agentId: form.agentId,
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

  const meta = PROVIDER_META[activeTab]
  const labels = FIELD_LABELS[activeTab]

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
        <Building2 className="w-6 h-6 text-indigo-600" />
        <h1 className="text-2xl font-bold">企业通讯录登录</h1>
        <FeatureDescription page="企业通讯录账号登录" />
      </div>

      {error && <div className="p-3 bg-red-50 text-red-700 rounded-lg border border-red-200 text-sm">{error}</div>}
      {message && (
        <div className={`p-3 rounded-lg text-sm ${message.includes('失败') ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'}`}>
          {message}
        </div>
      )}

      {/* Tab 切换 */}
      <div className="flex gap-2 border-b pb-2">
        {Object.entries(PROVIDER_META).map(([key, val]) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-t-lg text-sm font-medium transition ${activeTab === key ? 'bg-white border border-b-white -mb-[2px] text-indigo-700' : 'text-gray-500 hover:text-gray-700'}`}
          >
            <span>{val.icon}</span>
            {val.name}
          </button>
        ))}
      </div>

      {/* 配置表单 */}
      <div className="bg-white rounded-lg border shadow-sm p-6 space-y-5">
        {/* 启用开关 */}
        <div className="flex items-center justify-between">
          <div>
            <div className="font-medium">启用 {meta.name} 扫码登录</div>
            <div className="text-xs text-gray-500">开启后登录页将显示 {meta.name} 扫码登录按钮</div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={e => updateField('enabled', e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
          </label>
        </div>

        {/* 基本字段 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">{labels.appId}</label>
            <input
              value={form.appId}
              onChange={e => updateField('appId', e.target.value)}
              placeholder={activeTab === 'wecom' ? 'wwd08c84234567890' : ''}
              className="w-full px-3 py-2 border rounded-lg text-sm font-mono"
            />
          </div>
          {activeTab !== 'feishu' && (
            <div>
              <label className="block text-sm font-medium mb-1">{labels.agentId}</label>
              <input
                value={form.agentId}
                onChange={e => updateField('agentId', e.target.value)}
                placeholder={activeTab === 'wecom' ? '1000001' : ''}
                className="w-full px-3 py-2 border rounded-lg text-sm font-mono"
              />
            </div>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">{labels.appSecret}</label>
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

        <div>
          <label className="block text-sm font-medium mb-1">回调地址</label>
          <input
            value={form.redirectUri}
            onChange={e => updateField('redirectUri', e.target.value)}
            placeholder="https://api.unmisa.com/api/v1/auth/corp-login/callback"
            className="w-full px-3 py-2 border rounded-lg text-sm font-mono"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">描述</label>
          <input
            value={form.description}
            onChange={e => updateField('description', e.target.value)}
            placeholder="例如：3Cloud 管理后台 SSO"
            className="w-full px-3 py-2 border rounded-lg text-sm"
          />
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          {saving ? '保存中...' : '保存配置'}
        </button>
      </div>

      {/* 帮助说明 */}
      <div className="bg-blue-50 rounded-lg p-4 text-sm text-blue-800 border border-blue-200 space-y-1">
        <p className="font-medium">💡 说明</p>
        <ul className="list-disc ml-4 space-y-1">
          <li>支持企业微信、钉钉、飞书三种企业通讯录扫码登录</li>
          <li>配置前需在对应的开放平台创建企业自建应用</li>
          <li>回调地址格式：<code className="text-xs bg-blue-100 px-1 rounded">{'{host}/api/v1/auth/corp-login/callback'}</code></li>
          <li>扫码登录后，首次需引导用户绑定已有 3Cloud 账号</li>
          <li>开发文档：<a href={meta.docs} target="_blank" rel="noreferrer" className="underline">{meta.docs}</a></li>
        </ul>
      </div>
    </div>
  )
}
