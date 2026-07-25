import { useState } from 'react'
import { Loader2, X, Plus, Trash2, Info } from 'lucide-react'

interface TemplateVariable {
  name: string
  label: string
  default?: string
  required?: boolean
  description?: string
}

interface FormData {
  name: string
  description: string
  category: string
  content: string
  tags: string
  variables: TemplateVariable[]
  enabled: boolean
  checkSensitive: boolean
  maxLength: string
  requireApproval: boolean
}

interface Props {
  initial: any | null
  onSave: (data: any) => Promise<void>
  saving: boolean
  onClose: () => void
}

export default function PromptTemplateForm({ initial, onSave, saving, onClose }: Props) {
  const [form, setForm] = useState<FormData>({
    name: initial?.name || '',
    description: initial?.description || '',
    category: initial?.category || 'custom',
    content: initial?.content || '',
    tags: initial?.tags?.join(', ') || '',
    variables: initial?.variables || [],
    enabled: initial?.enabled ?? true,
    checkSensitive: initial?.rules?.checkSensitive ?? false,
    maxLength: String(initial?.rules?.maxLength || ''),
    requireApproval: initial?.rules?.requireApproval ?? false,
  })
  const [error, setError] = useState('')

  const update = (field: keyof FormData, value: any) => {
    setForm((f) => ({ ...f, [field]: value }))
  }

  const addVariable = () => {
    update('variables', [...form.variables, { name: '', label: '', default: '', required: false }])
  }

  const updateVariable = (idx: number, field: string, value: any) => {
    const vars = [...form.variables]
    vars[idx] = { ...vars[idx], [field]: value }
    update('variables', vars)
  }

  const removeVariable = (idx: number) => {
    update('variables', form.variables.filter((_, i) => i !== idx))
  }

  const handleSubmit = async () => {
    setError('')

    if (!form.name.trim()) {
      setError('请输入模板名称')
      return
    }
    if (!form.content.trim()) {
      setError('请输入模板内容')
      return
    }

    const tags = form.tags
      .split(/[,，、\s]+/)
      .map((t) => t.trim())
      .filter(Boolean)

    const rules: Record<string, any> = {}
    if (form.checkSensitive) rules.checkSensitive = true
    if (form.maxLength) rules.maxLength = parseInt(form.maxLength, 10)
    if (form.requireApproval) rules.requireApproval = true

    await onSave({
      name: form.name.trim(),
      description: form.description.trim() || null,
      category: form.category,
      content: form.content,
      tags,
      variables: form.variables,
      rules,
      enabled: form.enabled,
    })
  }

  const categories = [
    { value: 'conversation', label: '对话' },
    { value: 'code', label: '代码' },
    { value: 'document', label: '文档' },
    { value: 'analysis', label: '分析' },
    { value: 'creative', label: '创意' },
    { value: 'security', label: '安全' },
    { value: 'custom', label: '自定义' },
  ]

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-semibold">{initial ? '编辑模板' : '新建模板'}</h2>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 text-red-600 text-sm">
              <Info size={14} /> {error}
            </div>
          )}

          {/* Basic Info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">名称 *</label>
              <input
                value={form.name}
                onChange={(e) => update('name', e.target.value)}
                placeholder="模板名称"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">分类</label>
              <select
                value={form.category}
                onChange={(e) => update('category', e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
              >
                {categories.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">描述</label>
            <input
              value={form.description}
              onChange={(e) => update('description', e.target.value)}
              placeholder="简要描述模板用途"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">标签（逗号分隔）</label>
            <input
              value={form.tags}
              onChange={(e) => update('tags', e.target.value)}
              placeholder="如：翻译, 优化, 格式化"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Template Content */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">模板内容 *</label>
            <p className="text-xs text-slate-400 mb-2">
              使用 {'{{variable_name}}'} 语法定义变量
            </p>
            <textarea
              value={form.content}
              onChange={(e) => update('content', e.target.value)}
              placeholder={`请将以下文本翻译成英文：\n\n原文：{{text}}\n\n语言风格：{{style}}`}
              rows={8}
              className="w-full px-4 py-3 border border-slate-200 rounded-lg text-sm font-mono resize-y focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Variables */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-slate-700">变量定义</label>
              <button
                onClick={addVariable}
                className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
              >
                <Plus size={12} /> 添加变量
              </button>
            </div>

            {form.variables.length === 0 && (
              <p className="text-xs text-slate-400">暂未定义变量，在内容中使用 {'{{variable_name}}'} 语法</p>
            )}

            <div className="space-y-2">
              {form.variables.map((v, i) => (
                <div key={i} className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg">
                  <input
                    value={v.name}
                    onChange={(e) => updateVariable(i, 'name', e.target.value)}
                    placeholder="变量名"
                    className="flex-1 px-2 py-1.5 border border-slate-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <input
                    value={v.label}
                    onChange={(e) => updateVariable(i, 'label', e.target.value)}
                    placeholder="显示名称"
                    className="flex-1 px-2 py-1.5 border border-slate-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <label className="flex items-center gap-1 text-xs text-slate-500 whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={v.required || false}
                      onChange={(e) => updateVariable(i, 'required', e.target.checked)}
                      className="rounded"
                    />
                    必填
                  </label>
                  <button
                    onClick={() => removeVariable(i)}
                    className="p-1 text-slate-400 hover:text-red-500"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Rules */}
          <div>
            <label className="text-sm font-medium text-slate-700 mb-2">审核规则</label>
            <div className="space-y-2 border border-slate-200 rounded-lg p-4">
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={form.checkSensitive}
                  onChange={(e) => update('checkSensitive', e.target.checked)}
                  className="rounded"
                />
                启用敏感词检查
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={form.requireApproval}
                  onChange={(e) => update('requireApproval', e.target.checked)}
                  className="rounded"
                />
                需审核后才能使用
              </label>
              <div className="flex items-center gap-2">
                <label className="text-sm text-slate-600 whitespace-nowrap">最大长度限制：</label>
                <input
                  type="number"
                  value={form.maxLength}
                  onChange={(e) => update('maxLength', e.target.value)}
                  placeholder="不限制"
                  className="w-28 px-2 py-1.5 border border-slate-200 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <span className="text-xs text-slate-400">字符</span>
              </div>
            </div>
          </div>

          {/* Status */}
          <div>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(e) => update('enabled', e.target.checked)}
                className="rounded"
              />
              启用模板
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-200">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-slate-200 rounded-lg text-sm hover:bg-slate-50"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : null}
            {initial ? '保存修改' : '创建模板'}
          </button>
        </div>
      </div>
    </div>
  )
}
