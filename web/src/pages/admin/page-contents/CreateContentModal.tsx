import { useState } from 'react'
import { Loader2, Plus } from 'lucide-react'
import type { PageContentForm } from './types'
import { emptyForm } from './types'

interface ModalProps {
  onClose: () => void
  onCreate: (form: PageContentForm) => Promise<void>
}

export default function CreateContentModal({ onClose, onCreate }: ModalProps) {
  const [form, setForm] = useState(emptyForm())
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async () => {
    if (!form.slug.trim() || !form.titleZh.trim()) {
      setError('slug 和中文标题不能为空')
      return
    }
    setCreating(true)
    setError('')
    try {
      await onCreate(form)
    } catch (e: any) {
      setError(e?.response?.data?.message || e.message || '创建失败')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] shadow-xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between shrink-0">
          <h2 className="text-lg font-semibold text-slate-900">新建页面</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">&times;</button>
        </div>

        {error && (
          <div className="mx-6 mt-3 text-red-600 bg-red-50 p-2 rounded text-sm">{error}</div>
        )}

        <div className="px-6 py-4 space-y-4 overflow-y-auto flex-1">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Slug * <span className="text-slate-400 font-normal">（唯一标识）</span></label>
            <input type="text" value={form.slug} onChange={e => setForm(p => ({ ...p, slug: e.target.value }))}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-mono text-sm"
              placeholder="api_docs" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">中文标题 *</label>
            <input type="text" value={form.titleZh} onChange={e => setForm(p => ({ ...p, titleZh: e.target.value }))}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
              placeholder="API 文档" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">英文标题</label>
            <input type="text" value={form.titleEn} onChange={e => setForm(p => ({ ...p, titleEn: e.target.value }))}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
              placeholder="API Documentation" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">中文 Markdown</label>
            <textarea value={form.contentMarkdownZh} onChange={e => setForm(p => ({ ...p, contentMarkdownZh: e.target.value }))}
              rows={6} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 font-mono resize-y"
              placeholder="Markdown 正文..." />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">英文 Markdown</label>
            <textarea value={form.contentMarkdownEn} onChange={e => setForm(p => ({ ...p, contentMarkdownEn: e.target.value }))}
              rows={6} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 font-mono resize-y"
              placeholder="English Markdown content..." />
          </div>
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-slate-700">初始状态</label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.checked }))} className="rounded" />
              <span className="text-sm text-slate-600">立即发布</span>
            </label>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-end gap-3 shrink-0">
          <button onClick={onClose}
            className="px-4 py-2 text-sm border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50">
            取消
          </button>
          <button onClick={handleSubmit} disabled={creating || !form.slug.trim() || !form.titleZh.trim()}
            className="flex items-center gap-1.5 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {creating && <Loader2 className="animate-spin" size={14} />}
            <Plus size={14} /> 创建
          </button>
        </div>
      </div>
    </div>
  )
}
