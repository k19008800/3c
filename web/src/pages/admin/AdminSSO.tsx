import { useEffect, useState } from 'react'
import { get, put, post } from '@/lib/api'
import { Loader2, Save, TestTube, ShieldCheck, Eye, EyeOff } from 'lucide-react'
import FeatureDescription from '@/components/admin/FeatureDescription'

interface SSOConfig {
  enabled: boolean
  provider: 'oidc' | 'saml' | 'ldap'
  config: {
    clientId: string
    clientSecret: string
    issuerUrl: string
    authorizationUrl: string
    tokenUrl: string
    userInfoUrl: string
    logoutUrl: string
    scopes: string
    groupMapping: Record<string, string>
    autoCreateUser: boolean
    defaultRole: string
    ldapUrl?: string
    ldapBindDn?: string
    ldapBindPassword?: string
    ldapBaseDn?: string
    ldapFilter?: string
    idpMetadataUrl?: string
  }
}

const PROVIDER_OPTIONS = [
  { value: 'oidc', label: 'OIDC (OpenID Connect)' },
  { value: 'saml', label: 'SAML 2.0' },
  { value: 'ldap', label: 'LDAP / AD' },
]

export default function AdminSSOPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [showSecret, setShowSecret] = useState(false)

  const [config, setConfig] = useState<SSOConfig>({
    enabled: false,
    provider: 'oidc',
    config: {
      clientId: '',
      clientSecret: '',
      issuerUrl: '',
      authorizationUrl: '',
      tokenUrl: '',
      userInfoUrl: '',
      logoutUrl: '',
      scopes: 'openid profile email',
      groupMapping: {},
      autoCreateUser: true,
      defaultRole: 'user',
    },
  })

  useEffect(() => {
    loadConfig()
  }, [])

  async function loadConfig() {
    setLoading(true)
    try {
      const res = await get('/api/v1/admin/settings/sso')
      if (res.data) setConfig(res.data)
    } catch (e: any) {
      setError(e?.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }

  function updateConfig<K extends keyof SSOConfig['config']>(key: K, value: SSOConfig['config'][K]) {
    setConfig(prev => ({
      ...prev,
      config: { ...prev.config, [key]: value },
    }))
  }

  async function handleSave() {
    setSaving(true)
    setMessage('')
    try {
      await put('/api/v1/admin/settings/sso', config)
      setMessage('SSO 配置已保存')
    } catch (e: any) {
      setMessage(`保存失败: ${e?.message}`)
    } finally {
      setSaving(false)
    }
  }

  async function handleTest() {
    setTesting(true)
    setMessage('')
    try {
      const res = await post('/api/v1/admin/settings/sso/test', {
        provider: config.provider,
        config: config.config,
      })
      const d = res.data
      if (d.status === 'success') {
        setMessage(`连接测试成功（${d.latency}ms）`)
      } else if (d.status === 'skipped') {
        setMessage(`跳过测试: ${d.message || ''}`)
      } else {
        setMessage(`连接测试失败: ${d.message || ''}`)
      }
    } catch (e: any) {
      setMessage(`测试异常: ${e?.message}`)
    } finally {
      setTesting(false)
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
        <ShieldCheck className="w-6 h-6 text-purple-600" />
        <h1 className="text-2xl font-bold">SSO 单点登录配置</h1>
        <FeatureDescription page="SSO 单点登录" />
      </div>

      {error && <div className="p-3 bg-red-50 text-red-700 rounded-lg border border-red-200 text-sm">{error}</div>}
      {message && (
        <div className={`p-3 rounded-lg text-sm ${message.includes('失败') || message.includes('异常') ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'}`}>
          {message}
        </div>
      )}

      <div className="bg-white rounded-lg border shadow-sm p-6 space-y-6">
        {/* 启用开关 */}
        <div className="flex items-center justify-between">
          <div>
            <div className="font-medium">启用 SSO 登录</div>
            <div className="text-xs text-gray-500">开启后登录页将显示"使用企业 SSO 登录"按钮</div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={config.enabled}
              onChange={e => setConfig(prev => ({ ...prev, enabled: e.target.checked }))}
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-purple-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-purple-600"></div>
          </label>
        </div>

        {/* 协议选择 */}
        <div>
          <label className="block text-sm font-medium mb-2">SSO 协议</label>
          <div className="flex gap-3">
            {PROVIDER_OPTIONS.map(p => (
              <button
                key={p.value}
                type="button"
                onClick={() => setConfig(prev => ({ ...prev, provider: p.value as SSOConfig['provider'] }))}
                className={`px-4 py-2 rounded-lg text-sm border transition ${config.provider === p.value ? 'border-purple-500 bg-purple-50 text-purple-700' : 'border-gray-200 hover:bg-gray-50'}`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* OIDC/SAML 通用字段 */}
        {(config.provider === 'oidc' || config.provider === 'saml') && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Client ID</label>
                <input
                  value={config.config.clientId}
                  onChange={e => updateConfig('clientId', e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm font-mono"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Client Secret</label>
                <div className="relative">
                  <input
                    type={showSecret ? 'text' : 'password'}
                    value={config.config.clientSecret}
                    onChange={e => updateConfig('clientSecret', e.target.value)}
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
                <label className="block text-sm font-medium mb-1">Issuer URL</label>
                <input
                  value={config.config.issuerUrl}
                  onChange={e => updateConfig('issuerUrl', e.target.value)}
                  placeholder="https://auth.example.com"
                  className="w-full px-3 py-2 border rounded-lg text-sm font-mono"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Authorization URL</label>
                <input
                  value={config.config.authorizationUrl}
                  onChange={e => updateConfig('authorizationUrl', e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm font-mono"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Token URL</label>
                <input
                  value={config.config.tokenUrl}
                  onChange={e => updateConfig('tokenUrl', e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm font-mono"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">UserInfo URL</label>
                <input
                  value={config.config.userInfoUrl}
                  onChange={e => updateConfig('userInfoUrl', e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm font-mono"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Logout URL</label>
                <input
                  value={config.config.logoutUrl}
                  onChange={e => updateConfig('logoutUrl', e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm font-mono"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Scopes</label>
                <input
                  value={config.config.scopes}
                  onChange={e => updateConfig('scopes', e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm font-mono"
                />
              </div>
            </div>
          </div>
        )}

        {/* LDAP 字段 */}
        {config.provider === 'ldap' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">LDAP URL</label>
              <input
                value={config.config.ldapUrl || ''}
                onChange={e => updateConfig('ldapUrl', e.target.value)}
                placeholder="ldap://ldap.example.com:389"
                className="w-full px-3 py-2 border rounded-lg text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Bind DN</label>
              <input
                value={config.config.ldapBindDn || ''}
                onChange={e => updateConfig('ldapBindDn', e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Bind Password</label>
              <div className="relative">
                <input
                  type={showSecret ? 'text' : 'password'}
                  value={config.config.ldapBindPassword || ''}
                  onChange={e => updateConfig('ldapBindPassword', e.target.value)}
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
              <label className="block text-sm font-medium mb-1">Base DN</label>
              <input
                value={config.config.ldapBaseDn || ''}
                onChange={e => updateConfig('ldapBaseDn', e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">用户过滤器</label>
              <input
                value={config.config.ldapFilter || ''}
                onChange={e => updateConfig('ldapFilter', e.target.value)}
                placeholder="(uid={{username}})"
                className="w-full px-3 py-2 border rounded-lg text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">IdP Metadata URL</label>
              <input
                value={config.config.idpMetadataUrl || ''}
                onChange={e => updateConfig('idpMetadataUrl', e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm font-mono"
              />
            </div>
          </div>
        )}

        {/* 用户映射 */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">默认用户角色</label>
            <select
              value={config.config.defaultRole}
              onChange={e => updateConfig('defaultRole', e.target.value)}
              className="px-3 py-2 border rounded-lg text-sm"
            >
              <option value="user">普通用户</option>
              <option value="agent">代理商</option>
              <option value="admin">管理员</option>
            </select>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={config.config.autoCreateUser}
              onChange={e => updateConfig('autoCreateUser', e.target.checked)}
              className="accent-purple-600"
            />
            <span className="text-sm">首次登录自动创建账号</span>
          </label>

          <div>
            <label className="block text-sm font-medium mb-1">Group 角色映射 (JSON)</label>
            <textarea
              value={JSON.stringify(config.config.groupMapping, null, 2)}
              onChange={e => {
                try {
                  updateConfig('groupMapping', JSON.parse(e.target.value))
                } catch { }
              }}
              className="w-full h-24 px-3 py-2 border rounded-lg text-sm font-mono"
            />
          </div>
        </div>

        {/* 操作按钮 */}
        <div className="flex gap-3 pt-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700 disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {saving ? '保存中...' : '保存配置'}
          </button>
          <button
            onClick={handleTest}
            disabled={testing || !config.enabled}
            className="flex items-center gap-2 px-4 py-2 border border-purple-300 text-purple-700 rounded-lg text-sm hover:bg-purple-50 disabled:opacity-50"
          >
            <TestTube className="w-4 h-4" />
            {testing ? '测试中...' : '测试连接'}
          </button>
        </div>
      </div>

      <div className="bg-blue-50 rounded-lg p-4 text-sm text-blue-800 border border-blue-200">
        <p className="font-medium mb-1">💡 说明</p>
        <ul className="list-disc ml-4 space-y-1">
          <li>支持 OIDC、SAML 2.0、LDAP/AD 三种 SSO 协议</li>
          <li>配置保存后登录页将显示"使用企业 SSO 登录"入口</li>
          <li>SSO 用户首次登录支持自动创建账号</li>
          <li>Group 映射支持按企业组织自动分配角色</li>
          <li>实际 SSO 回调流程需要在部署环境配置认证回调端点</li>
        </ul>
      </div>
    </div>
  )
}
