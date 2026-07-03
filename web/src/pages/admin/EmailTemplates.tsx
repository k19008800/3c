import { useEffect, useState, useCallback } from 'react'
import { get, put } from '@/lib/api'
import { Loader2, AlertCircle, CheckCircle2, Eye, EyeOff, Mail, Save, Edit3, Plus } from 'lucide-react'

interface EmailTemplate {
  id: number
  name: string
  subjectZh: string
  subjectEn: string
  bodyHtmlZh: string
  bodyHtmlEn: string
  updatedAt: string | null
}

const TEMPLATE_LABELS: Record<string, string> = {
  register_verify: '注册验证',
  password_reset: '密码重置',
  recharge_confirm: '充值确认',
  real_name_result: '实名结果通知',
  login_alert: '异地登录提醒',
  account_banned: '账号封禁通知',
}

const TEMPLATE_ORDER = [
  'register_verify',
  'password_reset',
  'recharge_confirm',
  'real_name_result',
  'login_alert',
  'account_banned',
]

export default function AdminEmailTemplates() {
  const [templates, setTemplates] = useState<EmailTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')

  // Editing state
  const [editingName, setEditingName] = useState<string | null>(null)
  const [editValue, setEditValue] = useState({
    subjectZh: '', subjectEn: '', bodyHtmlZh: '', bodyHtmlEn: '',
  })
  const [previewKey, setPreviewKey] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

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

  // Sort by template order
  const sortedTemplates = [...templates].sort((a, b) => {
    const ia = TEMPLATE_ORDER.indexOf(a.name)
    const ib = TEMPLATE_ORDER.indexOf(b.name)
    if (ia !== -1 && ib !== -1) return ia - ib
    if (ia !== -1) return -1
    if (ib !== -1) return 1
    return a.name.localeCompare(b.name)
  })

  const handleEdit = (tmpl: EmailTemplate) => {
    setEditingName(tmpl.name)
    setEditValue({
      subjectZh: tmpl.subjectZh,
      subjectEn: tmpl.subjectEn,
      bodyHtmlZh: tmpl.bodyHtmlZh,
      bodyHtmlEn: tmpl.bodyHtmlEn,
    })
    setPreviewKey(null)
  }

  const handleSave = async (name: string) => {
    setSaving(true)
    setError('')
    try {
      await put(`/api/v1/admin/email-templates/${encodeURIComponent(name)}`, editValue)
      setMsg(`模板 "${TEMPLATE_LABELS[name] || name}" 已更新`)
      setEditingName(null)
      fetchTemplates()
    } catch (err: any) {
      setError(err.message || '更新模板失败')
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    setEditingName(null)
    setPreviewKey(null)
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
      <div className="flex items-center gap-3">
        <Mail size={28} className="text-blue-600" />
        <h1 className="text-2xl font-bold text-slate-900">邮件模板管理</h1>
      </div>

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

      {/* Template list */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 text-left">
                <th className="px-4 py-3 text-sm font-medium text-slate-500">模板名称</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">中文主题</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">英文主题</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">更新时间</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {sortedTemplates.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-12 text-slate-400">
                    暂无邮件模板，请先执行 seed 初始化
                  </td>
                </tr>
              ) : (
                sortedTemplates.map((tmpl) => (
                  <tr key={tmpl.name} className="hover:bg-slate-50 transition">
                    <td className="px-4 py-3 text-sm font-medium text-slate-800">
                      {TEMPLATE_LABELS[tmpl.name] || tmpl.name}
                      <div className="text-xs text-slate-400 font-mono mt-0.5">{tmpl.name}</div>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600 max-w-[200px] truncate">
                      {tmpl.subjectZh || '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600 max-w-[200px] truncate">
                      {tmpl.subjectEn || '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500 whitespace-nowrap">
                      {tmpl.updatedAt ? new Date(tmpl.updatedAt).toLocaleString('zh-CN') : '-'}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleEdit(tmpl)}
                        className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
                      >
                        <Edit3 size={14} />
                        编辑
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Edit Modal ── */}
      {editingName && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={(e) => { if (e.target === e.currentTarget) handleCancel() }}
        >
          <div
            className="bg-white rounded-xl w-full max-w-3xl max-h-[90vh] shadow-xl overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between shrink-0">
              <h2 className="text-lg font-semibold text-slate-900">
                编辑模板 - {TEMPLATE_LABELS[editingName] || editingName}
              </h2>
              <button onClick={handleCancel} className="text-slate-400 hover:text-slate-600 text-xl leading-none">&times;</button>
            </div>

            {/* Body */}
            <div className="px-6 py-4 space-y-4 overflow-y-auto flex-1">
              {/* Chinese subject */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">中文主题 *</label>
                <input
                  type="text"
                  value={editValue.subjectZh}
                  onChange={(e) => setEditValue(p => ({ ...p, subjectZh: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                  placeholder="输入中文主题"
                />
              </div>

              {/* English subject */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">英文主题</label>
                <input
                  type="text"
                  value={editValue.subjectEn}
                  onChange={(e) => setEditValue(p => ({ ...p, subjectEn: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                  placeholder="Enter English subject"
                />
              </div>

              {/* Chinese HTML body */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm font-medium text-slate-700">中文 HTML 正文 *</label>
                  <button
                    type="button"
                    onClick={() => setPreviewKey(previewKey === 'zh' ? null : 'zh')}
                    className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
                  >
                    {previewKey === 'zh' ? <EyeOff size={12} /> : <Eye size={12} />}
                    {previewKey === 'zh' ? '关闭预览' : '预览'}
                  </button>
                </div>
                {previewKey === 'zh' ? (
                  <div
                    className="w-full min-h-[180px] px-3 py-2 border border-slate-200 rounded-lg bg-white text-sm prose prose-sm max-w-none overflow-auto"
                    dangerouslySetInnerHTML={{ __html: editValue.bodyHtmlZh }}
                  />
                ) : (
                  <textarea
                    value={editValue.bodyHtmlZh}
                    onChange={(e) => setEditValue(p => ({ ...p, bodyHtmlZh: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition font-mono text-sm resize-y"
                    rows={8}
                    placeholder="中文 HTML 正文"
                  />
                )}
              </div>

              {/* English HTML body */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm font-medium text-slate-700">英文 HTML 正文</label>
                  <button
                    type="button"
                    onClick={() => setPreviewKey(previewKey === 'en' ? null : 'en')}
                    className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
                  >
                    {previewKey === 'en' ? <EyeOff size={12} /> : <Eye size={12} />}
                    {previewKey === 'en' ? '关闭预览' : '预览'}
                  </button>
                </div>
                {previewKey === 'en' ? (
                  <div
                    className="w-full min-h-[180px] px-3 py-2 border border-slate-200 rounded-lg bg-white text-sm prose prose-sm max-w-none overflow-auto"
                    dangerouslySetInnerHTML={{ __html: editValue.bodyHtmlEn }}
                  />
                ) : (
                  <textarea
                    value={editValue.bodyHtmlEn}
                    onChange={(e) => setEditValue(p => ({ ...p, bodyHtmlEn: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition font-mono text-sm resize-y"
                    rows={8}
                    placeholder="English HTML body"
                  />
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-end gap-3 shrink-0">
              <button
                onClick={handleCancel}
                className="px-4 py-2 text-sm border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition"
              >
                取消
              </button>
              <button
                onClick={() => handleSave(editingName!)}
                disabled={saving || !editValue.subjectZh || !editValue.bodyHtmlZh}
                className="flex items-center gap-1.5 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition"
              >
                {saving && <Loader2 className="animate-spin" size={14} />}
                <Save size={14} />
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
