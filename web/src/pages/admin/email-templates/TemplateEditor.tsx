import { useState, useCallback } from 'react'
import { Loader2, Save, Eye, EyeOff, Settings } from 'lucide-react'
import EmailTemplatePreview from '@/components/admin/EmailTemplatePreview'
import type { EditForm } from './types'
import { TEMPLATE_LABELS } from './types'

interface TemplateEditorProps {
  templateName: string
  initialValue: EditForm
  saving: boolean
  onSave: (name: string, value: EditForm) => void
  onCancel: () => void
}

export default function TemplateEditor({
  templateName,
  initialValue,
  saving,
  onSave,
  onCancel,
}: TemplateEditorProps) {
  const [editValue, setEditValue] = useState<EditForm>(initialValue)
  const [showPreview, setShowPreview] = useState(true)
  const [previewLang, setPreviewLang] = useState<'zh' | 'en' | null>(null)

  const handleChange = useCallback((field: keyof EditForm, value: string) => {
    setEditValue((prev) => ({ ...prev, [field]: value }))
  }, [])

  const handleSave = useCallback(() => {
    onSave(templateName, editValue)
  }, [templateName, editValue, onSave])

  const togglePreview = useCallback((lang: 'zh' | 'en') => {
    setPreviewLang((prev) => (prev === lang ? null : lang))
  }, [])

  const isValid = editValue.subjectZh.trim() && editValue.bodyHtmlZh.trim()

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div
        className="bg-white rounded-xl w-full max-w-6xl max-h-[90vh] shadow-xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-slate-900">
              编辑模板 - {TEMPLATE_LABELS[templateName] || templateName}
            </h2>
            <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-xs rounded font-mono">
              {templateName}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowPreview(!showPreview)}
              className={`flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg border transition ${
                showPreview
                  ? 'bg-blue-50 border-blue-300 text-blue-700'
                  : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
              }`}
            >
              {showPreview ? <Eye size={14} /> : <EyeOff size={14} />}
              {showPreview ? '隐藏预览' : '显示预览'}
            </button>
            <button onClick={onCancel} className="text-slate-400 hover:text-slate-600 text-xl leading-none">
              &times;
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-4 space-y-4 overflow-y-auto flex-1">
          {showPreview ? (
            // 新版预览模式
            <EmailTemplatePreview
              templateName={templateName}
              subjectZh={editValue.subjectZh}
              subjectEn={editValue.subjectEn}
              bodyHtmlZh={editValue.bodyHtmlZh}
              bodyHtmlEn={editValue.bodyHtmlEn}
              onContentChange={(field, value) => handleChange(field as keyof EditForm, value)}
            />
          ) : (
            // 传统编辑模式
            <>
              {/* Chinese subject */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">中文主题 *</label>
                <input
                  type="text"
                  value={editValue.subjectZh}
                  onChange={(e) => handleChange('subjectZh', e.target.value)}
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
                  onChange={(e) => handleChange('subjectEn', e.target.value)}
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
                    onClick={() => togglePreview('zh')}
                    className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
                  >
                    {previewLang === 'zh' ? <EyeOff size={12} /> : <Eye size={12} />}
                    {previewLang === 'zh' ? '关闭预览' : '预览'}
                  </button>
                </div>
                {previewLang === 'zh' ? (
                  <div
                    className="w-full min-h-[180px] px-3 py-2 border border-slate-200 rounded-lg bg-white text-sm prose prose-sm max-w-none overflow-auto"
                    dangerouslySetInnerHTML={{ __html: editValue.bodyHtmlZh }}
                  />
                ) : (
                  <textarea
                    value={editValue.bodyHtmlZh}
                    onChange={(e) => handleChange('bodyHtmlZh', e.target.value)}
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
                    onClick={() => togglePreview('en')}
                    className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
                  >
                    {previewLang === 'en' ? <EyeOff size={12} /> : <Eye size={12} />}
                    {previewLang === 'en' ? '关闭预览' : '预览'}
                  </button>
                </div>
                {previewLang === 'en' ? (
                  <div
                    className="w-full min-h-[180px] px-3 py-2 border border-slate-200 rounded-lg bg-white text-sm prose prose-sm max-w-none overflow-auto"
                    dangerouslySetInnerHTML={{ __html: editValue.bodyHtmlEn }}
                  />
                ) : (
                  <textarea
                    value={editValue.bodyHtmlEn}
                    onChange={(e) => handleChange('bodyHtmlEn', e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition font-mono text-sm resize-y"
                    rows={8}
                    placeholder="English HTML body"
                  />
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-end gap-3 shrink-0">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !isValid}
            className="flex items-center gap-1.5 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition"
          >
            {saving && <Loader2 className="animate-spin" size={14} />}
            <Save size={14} />
            保存
          </button>
        </div>
      </div>
    </div>
  )
}
