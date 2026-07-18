import { useEffect, useState, useCallback } from 'react'
import { get, put, post, del } from '@/lib/api'
import { Mail, Plus, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'
import FeatureDescription from '@/components/admin/FeatureDescription'
import TemplateList from './email-templates/TemplateList'
import TemplateEditor from './email-templates/TemplateEditor'
import TemplateStats from './email-templates/TemplateStats'
import type { EmailTemplate, EditForm } from './email-templates/types'
import { TEMPLATE_LABELS } from './email-templates/types'

export default function AdminEmailTemplates() {
  const [templates, setTemplates] = useState<EmailTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')

  // Editing state
  const [editingName, setEditingName] = useState<string | null>(null)
  const [editInitialValue, setEditInitialValue] = useState<EditForm>({
    subjectZh: '', subjectEn: '', bodyHtmlZh: '', bodyHtmlEn: '',
  })
  const [saving, setSaving] = useState(false)

  // Create modal state
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState({
    name: '',
    subjectZh: '',
    subjectEn: '',
    bodyHtmlZh: '',
    bodyHtmlEn: '',
  })
  const [creating, setCreating] = useState(false)

  const fetchTemplates = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await get<{ list: EmailTemplate[] }>('/api/v1/admin/email-templates')
      setTemplates(data.list)
    } catch (err: any) {
      setError(err.message || '获取邮件模板失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchTemplates()
  }, [fetchTemplates])

  const handleEdit = useCallback((tmpl: EmailTemplate) => {
    setEditingName(tmpl.name)
    setEditInitialValue({
      subjectZh: tmpl.subjectZh,
      subjectEn: tmpl.subjectEn,
      bodyHtmlZh: tmpl.bodyHtmlZh,
      bodyHtmlEn: tmpl.bodyHtmlEn,
    })
  }, [])

  const handleSave = useCallback(async (name: string, value: EditForm) => {
    setSaving(true)
    setError('')
    try {
      await put(`/api/v1/admin/email-templates/${encodeURIComponent(name)}`, value)
      setMsg(`模板 "${TEMPLATE_LABELS[name] || name}" 已更新`)
      setEditingName(null)
      fetchTemplates()
    } catch (err: any) {
      setError(err.message || '更新模板失败')
    } finally {
      setSaving(false)
    }
  }, [fetchTemplates])

  const handleCancelEdit = useCallback(() => {
    setEditingName(null)
  }, [])

  const handleDelete = useCallback(async (tmpl: EmailTemplate) => {
    const label = TEMPLATE_LABELS[tmpl.name] || tmpl.name
    if (!confirm(`确认删除邮件模板 "${label}"（${tmpl.name}）？此操作不可恢复。`)) return
    setError('')
    try {
      await del(`/api/v1/admin/email-templates/${encodeURIComponent(tmpl.name)}`)
      setMsg(`模板 "${label}" 已删除`)
      setTemplates(prev => prev.filter(t => t.name !== tmpl.name))
    } catch (err: any) {
      setError(err.message || '删除模板失败')
    }
  }, [])

  const handleCreate = useCallback(async () => {
    if (!createForm.name.trim() || !createForm.subjectZh.trim() || !createForm.bodyHtmlZh.trim()) {
      setError('模板名称、中文主题和中文正文不能为空')
      return
    }
    setCreating(true)
    setError('')
    try {
      await post('/api/v1/admin/email-templates', {
        name: createForm.name.trim(),
        subjectZh: createForm.subjectZh.trim(),
        subjectEn: createForm.subjectEn.trim() || undefined,
        bodyHtmlZh: createForm.bodyHtmlZh,
        bodyHtmlEn: createForm.bodyHtmlEn || undefined,
      })
      setMsg(`模板 "${createForm.name}" 已创建`)
      setShowCreate(false)
      setCreateForm({ name: '', subjectZh: '', subjectEn: '', bodyHtmlZh: '', bodyHtmlEn: '' })
      fetchTemplates()
    } catch (err: any) {
      setError(err.message || '创建模板失败')
    } finally {
      setCreating(false)
    }
  }, [createForm, fetchTemplates])

  // Derived statistics
  const stats = {
    totalTemplates: templates.length,
    hasContent: templates.filter((t) => t.subjectZh && t.bodyHtmlZh).length,
    hasEnglish: templates.filter((t) => t.subjectEn && t.bodyHtmlEn).length,
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Mail size={28} className="text-blue-600" />
          <h1 className="text-2xl font-bold text-slate-900">邮件模板管理</h1>
          <FeatureDescription page="admin/email-templates" className="ml-2" />
        </div>
        <button
          onClick={() => { setShowCreate(true); setError(''); setMsg('') }}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition"
        >
          <Plus size={16} /> 新建模板
        </button>
      </div>

      {/* Messages */}
      {msg && (
        <div className="flex items-center gap-2 text-green-700 bg-green-50 p-3 rounded-lg text-sm">
          <CheckCircle2 size={16} />
          {msg}
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {/* Stats cards */}
      <TemplateStats
        totalTemplates={stats.totalTemplates}
        hasContent={stats.hasContent}
        hasEnglish={stats.hasEnglish}
      />

      {/* Template table */}
      <TemplateList
        templates={templates}
        loading={loading}
        error={error}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />

      {/* Edit modal */}
      {editingName && (
        <TemplateEditor
          templateName={editingName}
          initialValue={editInitialValue}
          saving={saving}
          onSave={handleSave}
          onCancel={handleCancelEdit}
        />
      )}

      {/* Create modal */}
      {showCreate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={(e) => { if (e.target === e.currentTarget) { setShowCreate(false); setError('') }}}
        >
          <div
            className="bg-white rounded-xl w-full max-w-3xl max-h-[90vh] shadow-xl overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between shrink-0">
              <h2 className="text-lg font-semibold text-slate-900">新建邮件模板</h2>
              <button onClick={() => { setShowCreate(false); setError('') }} className="text-slate-400 hover:text-slate-600 text-xl leading-none">&times;</button>
            </div>

            {/* Body */}
            <div className="px-6 py-4 space-y-4 overflow-y-auto flex-1">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  模板名称 * <span className="text-slate-400 font-normal">（英文标识，如 register_verify）</span>
                </label>
                <input
                  type="text"
                  value={createForm.name}
                  onChange={(e) => setCreateForm(p => ({ ...p, name: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                  placeholder="register_verify"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">中文主题 *</label>
                <input
                  type="text"
                  value={createForm.subjectZh}
                  onChange={(e) => setCreateForm(p => ({ ...p, subjectZh: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  placeholder="请验证您的邮箱"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">英文主题</label>
                <input
                  type="text"
                  value={createForm.subjectEn}
                  onChange={(e) => setCreateForm(p => ({ ...p, subjectEn: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  placeholder="Please verify your email"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">中文 HTML 正文 *</label>
                <textarea
                  value={createForm.bodyHtmlZh}
                  onChange={(e) => setCreateForm(p => ({ ...p, bodyHtmlZh: e.target.value }))}
                  rows={8}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition font-mono text-sm resize-y"
                  placeholder="<h1>欢迎注册</h1><p>请点击以下链接验证邮箱...</p>"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">英文 HTML 正文</label>
                <textarea
                  value={createForm.bodyHtmlEn}
                  onChange={(e) => setCreateForm(p => ({ ...p, bodyHtmlEn: e.target.value }))}
                  rows={8}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition font-mono text-sm resize-y"
                  placeholder="<h1>Welcome</h1><p>Please click the link to verify...</p>"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-end gap-3 shrink-0">
              <button
                onClick={() => { setShowCreate(false); setError('') }}
                className="px-4 py-2 text-sm border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition"
              >
                取消
              </button>
              <button
                onClick={handleCreate}
                disabled={creating || !createForm.name.trim() || !createForm.subjectZh.trim() || !createForm.bodyHtmlZh.trim()}
                className="flex items-center gap-1.5 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition"
              >
                {creating && <Loader2 className="animate-spin" size={14} />}
                <Plus size={14} />
                创建
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
