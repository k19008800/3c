import { useState, useEffect } from 'react'
import { Plus, Edit2, Trash2, Eye, Copy, RefreshCw, Search, Filter, MoreVertical, Check, X, FileText, Code, MessageSquare, BarChart3, Settings } from 'lucide-react'
import PaginationBar from '@/components/ui/PaginationBar'
import { usePersistedFilters } from '@/hooks/use-persisted-filters'

// ── 类型定义 ──

interface TemplateVariable {
  name: string
  label: string
  default?: string
  required?: boolean
  description?: string
}

interface TemplateRules {
  checkSensitive?: boolean
  customRules?: string[]
  maxLength?: number
  forbiddenPatterns?: string[]
  requireApproval?: boolean
}

interface PromptTemplate {
  id: number
  name: string
  description: string | null
  category: string
  content: string
  variables: TemplateVariable[]
  rules: TemplateRules
  usageCount: number
  lastUsedAt: string | null
  enabled: boolean
  isPreset: boolean
  reviewStatus: string
  tags: string[]
  sortOrder: number
  createdBy: number | null
  createdAt: string
  updatedAt: string
  creatorName: string | null
}

interface Category {
  key: string
  label: string
  count: number
}

const CATEGORY_ICONS: Record<string, any> = {
  conversation: MessageSquare,
  code: Code,
  document: FileText,
  analysis: BarChart3,
  custom: Settings,
}

const CATEGORY_LABELS: Record<string, string> = {
  conversation: '通用对话',
  code: '代码生成',
  document: '文档写作',
  analysis: '数据分析',
  custom: '自定义',
}

export default function PromptTemplates() {
  const [templates, setTemplates] = useState<PromptTemplate[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { filters, setFilter } = usePersistedFilters({
    storageKey: 'prompt-templates',
    defaults: {
      page: 1,
      pageSize: 20,
      category: '',
      enabled: '',
      keyword: '',
    },
  })

  const [selectedTemplate, setSelectedTemplate] = useState<PromptTemplate | null>(null)
  const [showDetail, setShowDetail] = useState(false)
  const [showEditor, setShowEditor] = useState(false)
  const [editorMode, setEditorMode] = useState<'create' | 'edit'>('create')
  const [previewContent, setPreviewContent] = useState<string>('')
  const [showPreview, setShowPreview] = useState(false)

  // ── 加载模板列表 ──

  const loadTemplates = async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      params.set('page', String(filters.page))
      params.set('pageSize', String(filters.pageSize))
      if (filters.category) params.set('category', filters.category)
      if (filters.enabled) params.set('enabled', filters.enabled)
      if (filters.keyword) params.set('keyword', filters.keyword)

      const res = await fetch(`/api/v1/admin/prompt-templates?${params}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      })
      const data = await res.json()
      if (data.code === 0) {
        setTemplates(data.data.list)
        setTotal(data.data.total)
      } else {
        setError(data.message)
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // ── 加载分类统计 ──

  const loadCategories = async () => {
    try {
      const res = await fetch('/api/v1/admin/prompt-templates/categories', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      })
      const data = await res.json()
      if (data.code === 0) {
        setCategories(data.data)
      }
    } catch (err) {
      console.error('加载分类失败', err)
    }
  }

  // ── 初始化预设模板 ──

  const initPresets = async () => {
    try {
      const res = await fetch('/api/v1/admin/prompt-templates/init-presets', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json',
        },
      })
      const data = await res.json()
      if (data.code === 0 && data.data.count > 0) {
        loadTemplates()
        loadCategories()
      }
    } catch (err) {
      console.error('初始化预设模板失败', err)
    }
  }

  useEffect(() => {
    loadTemplates()
    loadCategories()
    // 自动初始化预设模板
    initPresets()
  }, [filters])

  // ── 创建/编辑模板 ──

  const handleSave = async (template: Partial<PromptTemplate>) => {
    try {
      const url = editorMode === 'create'
        ? '/api/v1/admin/prompt-templates'
        : `/api/v1/admin/prompt-templates/${selectedTemplate?.id}`
      const method = editorMode === 'create' ? 'POST' : 'PATCH'

      const res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(template),
      })
      const data = await res.json()
      if (data.code === 0) {
        setShowEditor(false)
        setSelectedTemplate(null)
        loadTemplates()
        loadCategories()
      } else {
        alert(data.message)
      }
    } catch (err: any) {
      alert(err.message)
    }
  }

  // ── 删除模板 ──

  const handleDelete = async (id: number) => {
    if (!confirm('确定删除此模板？')) return
    try {
      const res = await fetch(`/api/v1/admin/prompt-templates/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      })
      const data = await res.json()
      if (data.code === 0) {
        loadTemplates()
        loadCategories()
      } else {
        alert(data.message)
      }
    } catch (err: any) {
      alert(err.message)
    }
  }

  // ── 启用/禁用模板 ──

  const handleToggle = async (id: number, enabled: boolean) => {
    try {
      const res = await fetch(`/api/v1/admin/prompt-templates/${id}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ enabled }),
      })
      const data = await res.json()
      if (data.code === 0) {
        loadTemplates()
      } else {
        alert(data.message)
      }
    } catch (err: any) {
      alert(err.message)
    }
  }

  // ── 复制模板 ──

  const handleCopy = async (template: PromptTemplate) => {
    try {
      const res = await fetch('/api/v1/admin/prompt-templates', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: `${template.name} (副本)`,
          description: template.description,
          category: template.category,
          content: template.content,
          variables: template.variables,
          rules: template.rules,
          tags: template.tags,
        }),
      })
      const data = await res.json()
      if (data.code === 0) {
        loadTemplates()
        loadCategories()
      } else {
        alert(data.message)
      }
    } catch (err: any) {
      alert(err.message)
    }
  }

  // ── 预览模板 ──

  const handlePreview = async (template: PromptTemplate, variables: Record<string, string> = {}) => {
    try {
      const res = await fetch('/api/v1/admin/prompt-templates/preview', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content: template.content, variables }),
      })
      const data = await res.json()
      if (data.code === 0) {
        setPreviewContent(data.data.result)
        setShowPreview(true)
      }
    } catch (err) {
      console.error('预览失败', err)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">提示词模板库</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setEditorMode('create')
              setSelectedTemplate(null)
              setShowEditor(true)
            }}
            className="flex items-center gap-1.5 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Plus size={16} />
            新建模板
          </button>
          <button
            onClick={() => { loadTemplates(); loadCategories(); }}
            className="flex items-center gap-1.5 px-3 py-2 text-sm border rounded-lg hover:bg-slate-50"
          >
            <RefreshCw size={16} />
            刷新
          </button>
        </div>
      </div>

      {/* Categories */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setFilter('category', '')}
          className={`px-3 py-1.5 rounded-lg text-sm ${
            !filters.category ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 hover:bg-slate-200'
          }`}
        >
          全部 ({categories.reduce((sum, c) => sum + c.count, 0)})
        </button>
        {categories.map(cat => {
          const Icon = CATEGORY_ICONS[cat.key] || Settings
          return (
            <button
              key={cat.key}
              onClick={() => setFilter('category', cat.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm ${
                filters.category === cat.key ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 hover:bg-slate-200'
              }`}
            >
              <Icon size={14} />
              {cat.label} ({cat.count})
            </button>
          )
        })}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
        <div className="flex items-center gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              placeholder="搜索模板名称或描述..."
              value={filters.keyword}
              onChange={(e) => setFilter('keyword', e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 border rounded-lg text-sm"
            />
          </div>
          <select
            value={filters.enabled}
            onChange={(e) => setFilter('enabled', e.target.value)}
            className="px-3 py-1.5 border rounded-lg text-sm"
          >
            <option value="">全部状态</option>
            <option value="true">已启用</option>
            <option value="false">已禁用</option>
          </select>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-4 bg-red-50 text-red-700 rounded-lg">
          <X size={20} />
          {error}
        </div>
      )}

      {/* Templates Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <RefreshCw className="animate-spin" size={24} />
        </div>
      ) : templates.length === 0 ? (
        <div className="text-center py-16 text-slate-500">暂无模板</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map(template => {
            const CategoryIcon = CATEGORY_ICONS[template.category] || Settings
            return (
              <div
                key={template.id}
                className={`bg-white rounded-xl border p-4 hover:shadow-md transition-shadow ${
                  !template.enabled ? 'opacity-60' : ''
                }`}
              >
                {/* Header */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className={`p-2 rounded-lg ${
                      template.category === 'conversation' ? 'bg-green-100 text-green-600' :
                      template.category === 'code' ? 'bg-purple-100 text-purple-600' :
                      template.category === 'document' ? 'bg-blue-100 text-blue-600' :
                      template.category === 'analysis' ? 'bg-orange-100 text-orange-600' :
                      'bg-slate-100 text-slate-600'
                    }`}>
                      <CategoryIcon size={18} />
                    </div>
                    <div>
                      <h3 className="font-medium">{template.name}</h3>
                      <p className="text-xs text-slate-500">{CATEGORY_LABELS[template.category] || template.category}</p>
                    </div>
                  </div>
                  {template.isPreset && (
                    <span className="px-2 py-0.5 text-xs bg-amber-100 text-amber-700 rounded">预设</span>
                  )}
                </div>

                {/* Description */}
                <p className="text-sm text-slate-600 mb-3 line-clamp-2">
                  {template.description || '暂无描述'}
                </p>

                {/* Variables */}
                {template.variables && template.variables.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-3">
                    {template.variables.map(v => (
                      <span key={v.name} className="px-2 py-0.5 text-xs bg-slate-100 rounded">
                        {v.label}
                      </span>
                    ))}
                  </div>
                )}

                {/* Stats */}
                <div className="flex items-center gap-4 text-xs text-slate-500 mb-3">
                  <span>使用 {template.usageCount} 次</span>
                  {template.lastUsedAt && (
                    <span>最近 {new Date(template.lastUsedAt).toLocaleDateString()}</span>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center justify-between pt-3 border-t">
                  <button
                    onClick={() => handleToggle(template.id, !template.enabled)}
                    className={`px-2 py-1 text-xs rounded ${
                      template.enabled ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {template.enabled ? '已启用' : '已禁用'}
                  </button>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => { setSelectedTemplate(template); setShowDetail(true); }}
                      className="p-1.5 hover:bg-slate-100 rounded"
                      title="查看详情"
                    >
                      <Eye size={14} />
                    </button>
                    <button
                      onClick={() => handlePreview(template)}
                      className="p-1.5 hover:bg-slate-100 rounded"
                      title="预览"
                    >
                      <FileText size={14} />
                    </button>
                    <button
                      onClick={() => handleCopy(template)}
                      className="p-1.5 hover:bg-slate-100 rounded"
                      title="复制"
                    >
                      <Copy size={14} />
                    </button>
                    {!template.isPreset && (
                      <>
                        <button
                          onClick={() => {
                            setEditorMode('edit')
                            setSelectedTemplate(template)
                            setShowEditor(true)
                          }}
                          className="p-1.5 hover:bg-slate-100 rounded"
                          title="编辑"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          onClick={() => handleDelete(template.id)}
                          className="p-1.5 hover:bg-red-100 text-red-600 rounded"
                          title="删除"
                        >
                          <Trash2 size={14} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Pagination */}
      <div className="bg-white rounded-xl border p-4">
        <PaginationBar
          page={filters.page}
          pageSize={filters.pageSize}
          total={total}
          totalPages={Math.ceil(total / filters.pageSize)}
          onPageChange={(p) => setFilter('page', p)}
          onPageSizeChange={(s) => {
            setFilter('pageSize', s)
            setFilter('page', 1)
          }}
        />
      </div>

      {/* Detail Modal */}
      {showDetail && selectedTemplate && (
        <TemplateDetailModal
          template={selectedTemplate}
          onClose={() => { setShowDetail(false); setSelectedTemplate(null); }}
          onEdit={() => {
            setShowDetail(false)
            setEditorMode('edit')
            setShowEditor(true)
          }}
          onPreview={(vars) => handlePreview(selectedTemplate, vars)}
        />
      )}

      {/* Editor Modal */}
      {showEditor && (
        <TemplateEditorModal
          mode={editorMode}
          template={selectedTemplate}
          onClose={() => { setShowEditor(false); setSelectedTemplate(null); }}
          onSave={handleSave}
        />
      )}

      {/* Preview Modal */}
      {showPreview && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl w-[800px] max-h-[80vh] overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="font-semibold">模板预览</h3>
              <button onClick={() => setShowPreview(false)} className="p-1 hover:bg-slate-100 rounded">
                <X size={18} />
              </button>
            </div>
            <div className="p-4 overflow-auto max-h-[calc(80vh-60px)]">
              <pre className="whitespace-pre-wrap text-sm bg-slate-50 p-4 rounded-lg">{previewContent}</pre>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── 详情弹窗 ──

function TemplateDetailModal({
  template,
  onClose,
  onEdit,
  onPreview,
}: {
  template: PromptTemplate
  onClose: () => void
  onEdit: () => void
  onPreview: (vars: Record<string, string>) => void
}) {
  const [variableValues, setVariableValues] = useState<Record<string, string>>({})

  useEffect(() => {
    // 初始化变量默认值
    const defaults: Record<string, string> = {}
    template.variables?.forEach(v => {
      defaults[v.name] = v.default || ''
    })
    setVariableValues(defaults)
  }, [template])

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl w-[900px] max-h-[90vh] overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <h3 className="font-semibold">{template.name}</h3>
            <p className="text-sm text-slate-500">{CATEGORY_LABELS[template.category] || template.category}</p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded">
            <X size={18} />
          </button>
        </div>
        <div className="p-4 overflow-auto max-h-[calc(90vh-120px)] space-y-4">
          {/* 基本信息 */}
          <div>
            <h4 className="text-sm font-medium mb-2">描述</h4>
            <p className="text-sm text-slate-600">{template.description || '暂无描述'}</p>
          </div>

          {/* 变量 */}
          {template.variables && template.variables.length > 0 && (
            <div>
              <h4 className="text-sm font-medium mb-2">变量</h4>
              <div className="space-y-2">
                {template.variables.map(v => (
                  <div key={v.name} className="flex items-start gap-3">
                    <div className="flex-1">
                      <label className="text-sm font-medium">{v.label}</label>
                      {v.description && (
                        <p className="text-xs text-slate-500">{v.description}</p>
                      )}
                    </div>
                    <input
                      type="text"
                      value={variableValues[v.name] || ''}
                      onChange={(e) => setVariableValues({ ...variableValues, [v.name]: e.target.value })}
                      placeholder={v.default}
                      className="w-64 px-3 py-1.5 border rounded text-sm"
                    />
                  </div>
                ))}
              </div>
              <button
                onClick={() => onPreview(variableValues)}
                className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
              >
                预览结果
              </button>
            </div>
          )}

          {/* 模板内容 */}
          <div>
            <h4 className="text-sm font-medium mb-2">模板内容</h4>
            <pre className="whitespace-pre-wrap text-sm bg-slate-50 p-4 rounded-lg max-h-64 overflow-auto">
              {template.content}
            </pre>
          </div>

          {/* 审核规则 */}
          <div>
            <h4 className="text-sm font-medium mb-2">审核规则</h4>
            <div className="bg-slate-50 p-3 rounded-lg text-sm space-y-1">
              <p>敏感词检测：{template.rules?.checkSensitive ? '✓ 启用' : '✗ 禁用'}</p>
              {template.rules?.maxLength && <p>最大长度：{template.rules.maxLength} 字符</p>}
              {template.rules?.requireApproval && <p>需要审核：是</p>}
            </div>
          </div>

          {/* 元数据 */}
          <div className="flex items-center gap-6 text-sm text-slate-500">
            <span>使用 {template.usageCount} 次</span>
            <span>创建于 {new Date(template.createdAt).toLocaleString()}</span>
            {template.creatorName && <span>创建者：{template.creatorName}</span>}
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 p-4 border-t">
          {!template.isPreset && (
            <button onClick={onEdit} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
              编辑
            </button>
          )}
          <button onClick={onClose} className="px-4 py-2 border rounded-lg text-sm hover:bg-slate-50">
            关闭
          </button>
        </div>
      </div>
    </div>
  )
}

// ── 编辑弹窗 ──

function TemplateEditorModal({
  mode,
  template,
  onClose,
  onSave,
}: {
  mode: 'create' | 'edit'
  template: PromptTemplate | null
  onClose: () => void
  onSave: (t: Partial<PromptTemplate>) => void
}) {
  const [form, setForm] = useState<Partial<PromptTemplate>>({
    name: '',
    description: '',
    category: 'custom',
    content: '',
    variables: [],
    rules: { checkSensitive: true, maxLength: 4000 },
    tags: [],
  })

  useEffect(() => {
    if (mode === 'edit' && template) {
      setForm({
        name: template.name,
        description: template.description || '',
        category: template.category,
        content: template.content,
        variables: template.variables,
        rules: template.rules,
        tags: template.tags,
      })
    }
  }, [mode, template])

  const handleAddVariable = () => {
    setForm({
      ...form,
      variables: [...(form.variables || []), { name: '', label: '', required: false }],
    })
  }

  const handleRemoveVariable = (index: number) => {
    setForm({
      ...form,
      variables: form.variables?.filter((_, i) => i !== index),
    })
  }

  const handleUpdateVariable = (index: number, field: keyof TemplateVariable, value: any) => {
    const newVars = [...(form.variables || [])]
    newVars[index] = { ...newVars[index], [field]: value }
    setForm({ ...form, variables: newVars })
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl w-[900px] max-h-[90vh] overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-semibold">{mode === 'create' ? '新建模板' : '编辑模板'}</h3>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded">
            <X size={18} />
          </button>
        </div>
        <div className="p-4 overflow-auto max-h-[calc(90vh-120px)] space-y-4">
          {/* 基本信息 */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium mb-1 block">模板名称 *</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-1.5 border rounded-lg text-sm"
                placeholder="输入模板名称"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">分类</label>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="w-full px-3 py-1.5 border rounded-lg text-sm"
              >
                <option value="conversation">通用对话</option>
                <option value="code">代码生成</option>
                <option value="document">文档写作</option>
                <option value="analysis">数据分析</option>
                <option value="custom">自定义</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">描述</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full px-3 py-1.5 border rounded-lg text-sm"
              rows={2}
              placeholder="模板用途说明"
            />
          </div>

          {/* 模板内容 */}
          <div>
            <label className="text-sm font-medium mb-1 block">模板内容 *</label>
            <textarea
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
              className="w-full px-3 py-1.5 border rounded-lg text-sm font-mono"
              rows={10}
              placeholder="使用 {{变量名}} 插入变量"
            />
          </div>

          {/* 变量定义 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium">变量定义</label>
              <button
                onClick={handleAddVariable}
                className="px-2 py-1 text-xs bg-slate-100 rounded hover:bg-slate-200"
              >
                + 添加变量
              </button>
            </div>
            {form.variables && form.variables.length > 0 && (
              <div className="space-y-2">
                {form.variables.map((v, i) => (
                  <div key={i} className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg">
                    <input
                      type="text"
                      value={v.name}
                      onChange={(e) => handleUpdateVariable(i, 'name', e.target.value)}
                      placeholder="变量名"
                      className="w-24 px-2 py-1 border rounded text-xs"
                    />
                    <input
                      type="text"
                      value={v.label}
                      onChange={(e) => handleUpdateVariable(i, 'label', e.target.value)}
                      placeholder="显示名称"
                      className="w-32 px-2 py-1 border rounded text-xs"
                    />
                    <input
                      type="text"
                      value={v.default || ''}
                      onChange={(e) => handleUpdateVariable(i, 'default', e.target.value)}
                      placeholder="默认值"
                      className="w-32 px-2 py-1 border rounded text-xs"
                    />
                    <label className="flex items-center gap-1 text-xs">
                      <input
                        type="checkbox"
                        checked={v.required}
                        onChange={(e) => handleUpdateVariable(i, 'required', e.target.checked)}
                      />
                      必填
                    </label>
                    <button
                      onClick={() => handleRemoveVariable(i)}
                      className="p-1 hover:bg-red-100 text-red-600 rounded"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 审核规则 */}
          <div>
            <label className="text-sm font-medium mb-2 block">审核规则</label>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.rules?.checkSensitive}
                  onChange={(e) => setForm({
                    ...form,
                    rules: { ...form.rules, checkSensitive: e.target.checked },
                  })}
                />
                敏感词检测
              </label>
              <div className="flex items-center gap-2 text-sm">
                <span>最大长度：</span>
                <input
                  type="number"
                  value={form.rules?.maxLength || 4000}
                  onChange={(e) => setForm({
                    ...form,
                    rules: { ...form.rules, maxLength: parseInt(e.target.value) },
                  })}
                  className="w-24 px-2 py-1 border rounded"
                />
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 p-4 border-t">
          <button onClick={onClose} className="px-4 py-2 border rounded-lg text-sm hover:bg-slate-50">
            取消
          </button>
          <button
            onClick={() => onSave(form)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  )
}
