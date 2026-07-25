import { useState, useEffect } from 'react'
import { get, put, post, del } from '@/lib/api'
import {
  Loader2, AlertCircle, Shield, Plus, Trash2, CheckCircle2, X,
  ChevronDown, ChevronRight, Copy, Edit2, Save,
} from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'

// ── Types ──

interface ApiKeyPermissions {
  allowedModels?: string[] | null
  ipWhitelist?: string[] | null
  allowedEndpoints?: string[] | null
  rateLimitPerMinute?: number | null
}

interface PermissionTemplate {
  id: number
  name: string
  description: string | null
  permissions: ApiKeyPermissions
  isSystem: boolean
  createdAt: string
  updatedAt: string
}

interface Props {
  keyId: number
  keyName: string
  onClose?: () => void
}

// ── 常用端点选项 ──

const ENDPOINT_OPTIONS = [
  { value: '/v1/chat/completions', label: 'Chat Completions' },
  { value: '/v1/completions', label: 'Completions' },
  { value: '/v1/embeddings', label: 'Embeddings' },
  { value: '/v1/models', label: 'Models List' },
  { value: '/v1/images/*', label: 'Images (All)' },
  { value: '/v1/audio/*', label: 'Audio (All)' },
]

// ── 主组件 ──

export default function KeyPermissionEditor({ keyId, keyName, onClose }: Props) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [templates, setTemplates] = useState<PermissionTemplate[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null)
  const [permissions, setPermissions] = useState<ApiKeyPermissions>({})
  const [useCustomPermissions, setUseCustomPermissions] = useState(true)

  // 输入状态
  const [newModel, setNewModel] = useState('')
  const [newIp, setNewIp] = useState('')
  const [newEndpoint, setNewEndpoint] = useState('')

  useEffect(() => {
    loadData()
  }, [keyId])

  async function loadData() {
    setLoading(true)
    try {
      // 加载权限配置
      const permData = await get<{
        keyId: number
        keyName: string
        permissions: ApiKeyPermissions | null
        templateId: number | null
        template: PermissionTemplate | null
      }>(`/api/v1/admin/keys/${keyId}/permissions`)

      // 加载模板列表
      const tplData = await get<{ list: PermissionTemplate[] }>(
        '/api/v1/admin/keys/permission-templates'
      )
      setTemplates(tplData.list)

      if (permData.templateId && permData.template) {
        setSelectedTemplateId(permData.templateId)
        setUseCustomPermissions(false)
        setPermissions(permData.template.permissions || {})
      } else if (permData.permissions) {
        setPermissions(permData.permissions)
        setUseCustomPermissions(true)
      }
    } catch (e: any) {
      setError(e.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }

  async function handleSave() {
    setSaving(true)
    try {
      await put(`/api/v1/admin/keys/${keyId}/permissions`, {
        permissions: useCustomPermissions ? permissions : null,
        templateId: useCustomPermissions ? null : selectedTemplateId,
      })
      alert('权限配置已保存')
      onClose?.()
    } catch (e: any) {
      setError(e.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  function handleAddModel() {
    if (!newModel.trim()) return
    const models = permissions.allowedModels || []
    if (!models.includes(newModel.trim())) {
      setPermissions({
        ...permissions,
        allowedModels: [...models, newModel.trim()],
      })
    }
    setNewModel('')
  }

  function handleRemoveModel(model: string) {
    const models = permissions.allowedModels || []
    setPermissions({
      ...permissions,
      allowedModels: models.filter(m => m !== model),
    })
  }

  function handleAddIp() {
    if (!newIp.trim()) return
    // 简单 IP 格式验证
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/
    if (!ipRegex.test(newIp.trim())) {
      alert('IP 格式无效，请输入 IPv4 或 CIDR 格式（如 192.168.1.1 或 10.0.0.0/24）')
      return
    }
    const ips = permissions.ipWhitelist || []
    if (!ips.includes(newIp.trim())) {
      setPermissions({
        ...permissions,
        ipWhitelist: [...ips, newIp.trim()],
      })
    }
    setNewIp('')
  }

  function handleRemoveIp(ip: string) {
    const ips = permissions.ipWhitelist || []
    setPermissions({
      ...permissions,
      ipWhitelist: ips.filter(i => i !== ip),
    })
  }

  function handleAddEndpoint(endpoint: string) {
    const endpoints = permissions.allowedEndpoints || []
    if (!endpoints.includes(endpoint)) {
      setPermissions({
        ...permissions,
        allowedEndpoints: [...endpoints, endpoint],
      })
    }
  }

  function handleRemoveEndpoint(endpoint: string) {
    const endpoints = permissions.allowedEndpoints || []
    setPermissions({
      ...permissions,
      allowedEndpoints: endpoints.filter(e => e !== endpoint),
    })
  }

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton variant="card" count={3} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="text-blue-600" size={20} />
          <h3 className="text-lg font-semibold text-slate-800">
            {keyName} — 权限配置
          </h3>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
          <X size={20} />
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm">
          <AlertCircle size={16} /> {error}
          <button onClick={() => setError('')} className="ml-auto text-red-500">
            <X size={16} />
          </button>
        </div>
      )}

      {/* 模板选择 vs 自定义 */}
      <div className="bg-slate-50 rounded-lg p-4 space-y-3">
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              checked={useCustomPermissions}
              onChange={() => setUseCustomPermissions(true)}
              className="w-4 h-4 text-blue-600"
            />
            <span className="text-sm font-medium text-slate-700">自定义权限</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              checked={!useCustomPermissions}
              onChange={() => setUseCustomPermissions(false)}
              className="w-4 h-4 text-blue-600"
            />
            <span className="text-sm font-medium text-slate-700">使用模板</span>
          </label>
        </div>

        {!useCustomPermissions && (
          <select
            value={selectedTemplateId || ''}
            onChange={e => {
              const id = Number(e.target.value)
              setSelectedTemplateId(id)
              const tpl = templates.find(t => t.id === id)
              if (tpl) setPermissions(tpl.permissions)
            }}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">选择权限模板</option>
            {templates.map(t => (
              <option key={t.id} value={t.id}>
                {t.name} {t.isSystem ? '(系统)' : ''}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* 权限配置表单 */}
      {(useCustomPermissions || selectedTemplateId) && (
        <div className="space-y-6">
          {/* 模型权限 */}
          <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
            <h4 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              允许的模型
              <span className="text-xs text-slate-400 font-normal">
                （留空表示不限制）
              </span>
            </h4>
            <div className="flex flex-wrap gap-2">
              {(permissions.allowedModels || []).map(model => (
                <span
                  key={model}
                  className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs"
                >
                  <code className="font-mono">{model}</code>
                  {useCustomPermissions && (
                    <button
                      onClick={() => handleRemoveModel(model)}
                      className="hover:text-red-600"
                    >
                      <X size={12} />
                    </button>
                  )}
                </span>
              ))}
            </div>
            {useCustomPermissions && (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newModel}
                  onChange={e => setNewModel(e.target.value)}
                  placeholder="模型名称（如 gpt-4, claude-*）"
                  className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  onKeyDown={e => e.key === 'Enter' && handleAddModel()}
                />
                <button
                  onClick={handleAddModel}
                  className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
                >
                  <Plus size={16} />
                </button>
              </div>
            )}
          </div>

          {/* IP 白名单 */}
          <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
            <h4 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              IP 白名单
              <span className="text-xs text-slate-400 font-normal">
                （留空表示不限制，支持 CIDR）
              </span>
            </h4>
            <div className="flex flex-wrap gap-2">
              {(permissions.ipWhitelist || []).map(ip => (
                <span
                  key={ip}
                  className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-mono"
                >
                  {ip}
                  {useCustomPermissions && (
                    <button
                      onClick={() => handleRemoveIp(ip)}
                      className="hover:text-red-600"
                    >
                      <X size={12} />
                    </button>
                  )}
                </span>
              ))}
            </div>
            {useCustomPermissions && (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newIp}
                  onChange={e => setNewIp(e.target.value)}
                  placeholder="IP 地址（如 192.168.1.1 或 10.0.0.0/24）"
                  className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  onKeyDown={e => e.key === 'Enter' && handleAddIp()}
                />
                <button
                  onClick={handleAddIp}
                  className="px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm"
                >
                  <Plus size={16} />
                </button>
              </div>
            )}
          </div>

          {/* 端点权限 */}
          <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
            <h4 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              允许的端点
              <span className="text-xs text-slate-400 font-normal">
                （留空表示不限制）
              </span>
            </h4>
            <div className="flex flex-wrap gap-2">
              {(permissions.allowedEndpoints || []).map(endpoint => (
                <span
                  key={endpoint}
                  className="inline-flex items-center gap-1 px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs font-mono"
                >
                  {endpoint}
                  {useCustomPermissions && (
                    <button
                      onClick={() => handleRemoveEndpoint(endpoint)}
                      className="hover:text-red-600"
                    >
                      <X size={12} />
                    </button>
                  )}
                </span>
              ))}
            </div>
            {useCustomPermissions && (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  {ENDPOINT_OPTIONS.filter(
                    opt => !(permissions.allowedEndpoints || []).includes(opt.value)
                  ).map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => handleAddEndpoint(opt.value)}
                      className="px-2 py-1 text-xs bg-slate-100 text-slate-600 rounded hover:bg-slate-200"
                    >
                      + {opt.label}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newEndpoint}
                    onChange={e => setNewEndpoint(e.target.value)}
                    placeholder="自定义端点（如 /v1/custom）"
                    className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    onKeyDown={e => {
                      if (e.key === 'Enter' && newEndpoint.trim()) {
                        handleAddEndpoint(newEndpoint.trim())
                        setNewEndpoint('')
                      }
                    }}
                  />
                  <button
                    onClick={() => {
                      if (newEndpoint.trim()) {
                        handleAddEndpoint(newEndpoint.trim())
                        setNewEndpoint('')
                      }
                    }}
                    className="px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm"
                  >
                    <Plus size={16} />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* 速率限制 */}
          <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
            <h4 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              每分钟请求限制
              <span className="text-xs text-slate-400 font-normal">
                （留空表示使用系统默认）
              </span>
            </h4>
            {useCustomPermissions ? (
              <input
                type="number"
                value={permissions.rateLimitPerMinute || ''}
                onChange={e =>
                  setPermissions({
                    ...permissions,
                    rateLimitPerMinute: e.target.value
                      ? Number(e.target.value)
                      : null,
                  })
                }
                placeholder="如 60"
                min={1}
                max={10000}
                className="w-32 px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            ) : (
              <p className="text-sm text-slate-600">
                {permissions.rateLimitPerMinute
                  ? `${permissions.rateLimitPerMinute} 次/分钟`
                  : '使用系统默认'}
              </p>
            )}
          </div>
        </div>
      )}

      {/* 保存按钮 */}
      {useCustomPermissions && (
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 transition"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm"
          >
            {saving && <Loader2 className="animate-spin" size={14} />}
            <Save size={14} /> 保存配置
          </button>
        </div>
      )}
    </div>
  )
}
