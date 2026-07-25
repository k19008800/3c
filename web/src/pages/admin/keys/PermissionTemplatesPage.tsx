import { useState, useEffect } from 'react'
import { get, post, put, del } from '@/lib/api'
import {
  Loader2, AlertCircle, Shield, Plus, Trash2, CheckCircle2, X,
  Edit2, Save, Copy,
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

// ── 预设模板 ──

const PRESET_TEMPLATES: Array<{
  name: string
  description: string
  permissions: ApiKeyPermissions
}> = [
  {
    name: '只读访问',
    description: '仅允许查看模型列表',
    permissions: {
      allowedEndpoints: ['/v1/models'],
      allowedModels: null,
      ipWhitelist: null,
      rateLimitPerMinute: 60,
    },
  },
  {
    name: 'Chat 专用',
    description: '仅允许 Chat Completions 接口',
    permissions: {
      allowedEndpoints: ['/v1/chat/completions', '/v1/models'],
      allowedModels: null,
      ipWhitelist: null,
      rateLimitPerMinute: 120,
    },
  },
  {
    name: 'Embedding 专用',
    description: '仅允许 Embeddings 接口',
    permissions: {
      allowedEndpoints: ['/v1/embeddings', '/v1/models'],
      allowedModels: null,
      ipWhitelist: null,
      rateLimitPerMinute: 300,
    },
  },
  {
    name: '高安全模式',
    description: 'IP 白名单 + 速率限制',
    permissions: {
      allowedEndpoints: null,
      allowedModels: null,
      ipWhitelist: ['127.0.0.1'], // 需要用户修改
      rateLimitPerMinute: 30,
    },
  },
]

// ── 主组件 ──

export default function PermissionTemplatesPage() {
  const [templates, setTemplates] = useState<PermissionTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [formData, setFormData] = useState<{
    name: string
    description: string
    permissions: ApiKeyPermissions
  }>({
    name: '',
    description: '',
    permissions: {},
  })
  const [saving, setSaving] = useState(false)

  // 输入状态
  const [newModel, setNewModel] = useState('')
  const [newIp, setNewIp] = useState('')
  const [newEndpoint, setNewEndpoint] = useState('')

  useEffect(() => {
    loadTemplates()
  }, [])

  async function loadTemplates() {
    setLoading(true)
    try {
      const data = await get<{ list: PermissionTemplate[] }>(
        '/api/v1/admin/keys/permission-templates'
      )
      setTemplates(data.list)
    } catch (e: any) {
      setError(e.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }

  function resetForm() {
    setFormData({ name: '', description: '', permissions: {} })
    setNewModel('')
    setNewIp('')
    setNewEndpoint('')
  }

  function handlePresetSelect(preset: typeof PRESET_TEMPLATES[0]) {
    setFormData({
      name: preset.name,
      description: preset.description,
      permissions: { ...preset.permissions },
    })
  }

  async function handleCreate() {
    if (!formData.name.trim()) {
      alert('请输入模板名称')
      return
    }
    setSaving(true)
    try {
      await post('/api/v1/admin/keys/permission-templates', formData)
      setShowCreate(false)
      resetForm()
      loadTemplates()
    } catch (e: any) {
      setError(e.message || '创建失败')
    } finally {
      setSaving(false)
    }
  }

  async function handleUpdate() {
    if (!editingId) return
    setSaving(true)
    try {
      await put(`/api/v1/admin/keys/permission-templates/${editingId}`, formData)
      setEditingId(null)
      resetForm()
      loadTemplates()
    } catch (e: any) {
      setError(e.message || '更新失败')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: number, name: string) {
    if (!window.confirm(`确定要删除模板 "${name}" 吗？`)) return
    try {
      await del(`/api/v1/admin/keys/permission-templates/${id}`)
      loadTemplates()
    } catch (e: any) {
      setError(e.message || '删除失败')
    }
  }

  function startEdit(template: PermissionTemplate) {
    setEditingId(template.id)
    setFormData({
      name: template.name,
      description: template.description || '',
      permissions: { ...template.permissions },
    })
    setShowCreate(false)
  }

  // 权限操作函数
  function addModel() {
    if (!newModel.trim()) return
    const models = formData.permissions.allowedModels || []
    if (!models.includes(newModel.trim())) {
      setFormData({
        ...formData,
        permissions: {
          ...formData.permissions,
          allowedModels: [...models, newModel.trim()],
        },
      })
    }
    setNewModel('')
  }

  function removeModel(model: string) {
    const models = formData.permissions.allowedModels || []
    setFormData({
      ...formData,
      permissions: {
        ...formData.permissions,
        allowedModels: models.filter(m => m !== model),
      },
    })
  }

  function addIp() {
    if (!newIp.trim()) return
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/
    if (!ipRegex.test(newIp.trim())) {
      alert('IP 格式无效')
      return
    }
    const ips = formData.permissions.ipWhitelist || []
    if (!ips.includes(newIp.trim())) {
      setFormData({
        ...formData,
        permissions: {
          ...formData.permissions,
          ipWhitelist: [...ips, newIp.trim()],
        },
      })
    }
    setNewIp('')
  }

  function removeIp(ip: string) {
    const ips = formData.permissions.ipWhitelist || []
    setFormData({
      ...formData,
      permissions: {
        ...formData.permissions,
        ipWhitelist: ips.filter(i => i !== ip),
      },
    })
  }

  function addEndpoint(endpoint: string) {
    const endpoints = formData.permissions.allowedEndpoints || []
    if (!endpoints.includes(endpoint)) {
      setFormData({
        ...formData,
        permissions: {
          ...formData.permissions,
          allowedEndpoints: [...endpoints, endpoint],
        },
      })
    }
  }

  function removeEndpoint(endpoint: string) {
    const endpoints = formData.permissions.allowedEndpoints || []
    setFormData({
      ...formData,
      permissions: {
        ...formData.permissions,
        allowedEndpoints: endpoints.filter(e => e !== endpoint),
      },
    })
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="animate-spin" size={32} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-slate-900">权限模板</h1>
          <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
            {templates.length} 个模板
          </span>
        </div>
        <button
          onClick={() => {
            setShowCreate(true)
            setEditingId(null)
            resetForm()
          }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm"
        >
          <Plus size={16} /> 创建模板
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

      {/* 模板列表 */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {templates.map(t => (
          <div
            key={t.id}
            className="bg-white border border-slate-200 rounded-lg p-4 space-y-3 hover:shadow-md transition"
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                  {t.name}
                  {t.isSystem && (
                    <span className="text-xs bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded">
                      系统
                    </span>
                  )}
                </h3>
                {t.description && (
                  <p className="text-xs text-slate-500 mt-1">{t.description}</p>
                )}
              </div>
              {!t.isSystem && (
                <div className="flex gap-1">
                  <button
                    onClick={() => startEdit(t)}
                    className="p-1.5 text-slate-400 hover:text-blue-600 rounded"
                  >
                    <Edit2 size={14} />
                  </button>
                  <button
                    onClick={() => handleDelete(t.id, t.name)}
                    className="p-1.5 text-slate-400 hover:text-red-600 rounded"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              )}
            </div>

            <div className="space-y-2 text-xs">
              {t.permissions.allowedModels && t.permissions.allowedModels.length > 0 && (
                <div>
                  <span className="text-slate-500">模型:</span>{' '}
                  {t.permissions.allowedModels.slice(0, 3).join(', ')}
                  {t.permissions.allowedModels.length > 3 && ' ...'}
                </div>
              )}
              {t.permissions.ipWhitelist && t.permissions.ipWhitelist.length > 0 && (
                <div>
                  <span className="text-slate-500">IP:</span>{' '}
                  {t.permissions.ipWhitelist.join(', ')}
                </div>
              )}
              {t.permissions.allowedEndpoints && t.permissions.allowedEndpoints.length > 0 && (
                <div>
                  <span className="text-slate-500">端点:</span>{' '}
                  {t.permissions.allowedEndpoints.length} 个
                </div>
              )}
              {t.permissions.rateLimitPerMinute && (
                <div>
                  <span className="text-slate-500">限速:</span>{' '}
                  {t.permissions.rateLimitPerMinute} 次/分钟
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* 创建/编辑弹窗 */}
      {(showCreate || editingId) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl p-6 w-full max-w-2xl shadow-xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold mb-4">
              {editingId ? '编辑模板' : '创建权限模板'}
            </h2>

            {/* 预设选择 */}
            {!editingId && (
              <div className="mb-4">
                <p className="text-xs text-slate-500 mb-2">快速选择预设：</p>
                <div className="flex flex-wrap gap-2">
                  {PRESET_TEMPLATES.map(preset => (
                    <button
                      key={preset.name}
                      onClick={() => handlePresetSelect(preset)}
                      className="px-3 py-1.5 text-xs bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200"
                    >
                      {preset.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-4">
              {/* 基本信息 */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">模板名称</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">描述</label>
                  <input
                    type="text"
                    value={formData.description}
                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* 模型权限 */}
              <div className="border border-slate-200 rounded-lg p-3 space-y-2">
                <label className="text-xs font-medium text-slate-600">允许的模型</label>
                <div className="flex flex-wrap gap-2">
                  {(formData.permissions.allowedModels || []).map(m => (
                    <span
                      key={m}
                      className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs"
                    >
                      <code className="font-mono">{m}</code>
                      <button onClick={() => removeModel(m)} className="hover:text-red-600">
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newModel}
                    onChange={e => setNewModel(e.target.value)}
                    placeholder="模型名称"
                    className="flex-1 px-2 py-1 text-sm border border-slate-300 rounded"
                    onKeyDown={e => e.key === 'Enter' && addModel()}
                  />
                  <button onClick={addModel} className="px-2 py-1 bg-blue-600 text-white rounded text-sm">
                    <Plus size={14} />
                  </button>
                </div>
              </div>

              {/* IP 白名单 */}
              <div className="border border-slate-200 rounded-lg p-3 space-y-2">
                <label className="text-xs font-medium text-slate-600">IP 白名单</label>
                <div className="flex flex-wrap gap-2">
                  {(formData.permissions.ipWhitelist || []).map(ip => (
                    <span
                      key={ip}
                      className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-mono"
                    >
                      {ip}
                      <button onClick={() => removeIp(ip)} className="hover:text-red-600">
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newIp}
                    onChange={e => setNewIp(e.target.value)}
                    placeholder="IP 地址"
                    className="flex-1 px-2 py-1 text-sm border border-slate-300 rounded"
                    onKeyDown={e => e.key === 'Enter' && addIp()}
                  />
                  <button onClick={addIp} className="px-2 py-1 bg-green-600 text-white rounded text-sm">
                    <Plus size={14} />
                  </button>
                </div>
              </div>

              {/* 端点权限 */}
              <div className="border border-slate-200 rounded-lg p-3 space-y-2">
                <label className="text-xs font-medium text-slate-600">允许的端点</label>
                <div className="flex flex-wrap gap-2">
                  {(formData.permissions.allowedEndpoints || []).map(ep => (
                    <span
                      key={ep}
                      className="inline-flex items-center gap-1 px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs font-mono"
                    >
                      {ep}
                      <button onClick={() => removeEndpoint(ep)} className="hover:text-red-600">
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2 flex-wrap">
                  {['/v1/chat/completions', '/v1/embeddings', '/v1/models'].map(ep => (
                    <button
                      key={ep}
                      onClick={() => addEndpoint(ep)}
                      className="px-2 py-1 text-xs bg-slate-100 text-slate-600 rounded hover:bg-slate-200"
                    >
                      + {ep}
                    </button>
                  ))}
                </div>
              </div>

              {/* 速率限制 */}
              <div className="border border-slate-200 rounded-lg p-3">
                <label className="text-xs font-medium text-slate-600">每分钟请求限制</label>
                <input
                  type="number"
                  value={formData.permissions.rateLimitPerMinute || ''}
                  onChange={e =>
                    setFormData({
                      ...formData,
                      permissions: {
                        ...formData.permissions,
                        rateLimitPerMinute: e.target.value ? Number(e.target.value) : null,
                      },
                    })
                  }
                  placeholder="留空表示不限制"
                  className="w-32 mt-2 px-2 py-1 text-sm border border-slate-300 rounded"
                />
              </div>
            </div>

            {/* 操作按钮 */}
            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => {
                  setShowCreate(false)
                  setEditingId(null)
                  resetForm()
                }}
                className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800"
              >
                取消
              </button>
              <button
                onClick={editingId ? handleUpdate : handleCreate}
                disabled={saving || !formData.name.trim()}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm"
              >
                {saving && <Loader2 className="animate-spin" size={14} />}
                <Save size={14} /> {editingId ? '保存' : '创建'}
              </button>
            </div>
          </div>
        </div>
      )}

      {templates.length === 0 && !loading && (
        <div className="flex flex-col items-center gap-3 py-12 text-slate-400">
          <Shield size={48} strokeWidth={1.5} />
          <p>暂无权限模板</p>
          <button
            onClick={() => setShowCreate(true)}
            className="text-blue-500 hover:text-blue-700 text-sm"
          >
            创建第一个模板
          </button>
        </div>
      )}
    </div>
  )
}
