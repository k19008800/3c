// ============================================================
//  AnnounceEditor — 创建 / 编辑公告弹窗
// ============================================================

import { useState, useCallback } from 'react'
import { post, patch } from '@/lib/api'
import {
  Loader2, AlertCircle, CheckCircle2,
} from 'lucide-react'
import type { Announcement, AnnouncementForm } from './types'
import { emptyForm } from './types'

interface AnnounceEditorProps {
  announcement: Announcement | null
  onClose: () => void
  onSuccess: () => void
}

export default function AnnounceEditor({ announcement, onClose, onSuccess }: AnnounceEditorProps) {
  const isEdit = !!announcement
  const [form, setForm] = useState<AnnouncementForm>(
    isEdit
      ? { title: announcement!.title, content: announcement!.content, type: announcement!.type, priority: announcement!.priority }
      : { ...emptyForm }
  )
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const update = useCallback((key: keyof AnnouncementForm, value: string | number) => {
    setForm((f) => ({ ...f, [key]: value }))
  }, [])

  const handleSubmit = useCallback(async () => {
    setMessage('')
    setError('')
    if (!form.title.trim()) { setError('请输入公告标题'); return }
    if (!form.content.trim()) { setError('请输入公告内容'); return }

    setSaving(true)
    try {
      if (isEdit) {
        const body: Partial<AnnouncementForm> = {}
        if (form.title !== announcement!.title) body.title = form.title.trim()
        if (form.content !== announcement!.content) body.content = form.content.trim()
        if (form.type !== announcement!.type) body.type = form.type
        if (form.priority !== announcement!.priority) body.priority = form.priority
        await patch(`/api/v1/admin/announcements/${announcement!.id}`, body)
        setMessage('公告已更新')
      } else {
        await post('/api/v1/admin/announcements', {
          title: form.title.trim(),
          content: form.content.trim(),
          type: form.type,
          priority: form.priority,
        })
        setMessage('公告已发布')
      }
      setTimeout(onSuccess, 800)
    } catch (err: any) {
      setError(err.message || (isEdit ? '更新失败' : '创建失败'))
    } finally {
      setSaving(false)
    }
  }, [isEdit, form, announcement, onSuccess])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl w-full max-w-lg shadow-xl">
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">{isEdit ? '编辑公告' : '发布公告'}</h2>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl">&times;</button>
          </div>

          {message && (
            <div className="flex items-center gap-2 p-3 text-sm rounded-lg bg-green-50 text-green-700">
              <CheckCircle2 size={16} />
              {message}
            </div>
          )}
          {error && (
            <div className="flex items-center gap-2 p-3 text-sm rounded-lg bg-red-50 text-red-600">
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          <div className="space-y-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">标题 <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => update('title', e.target.value)}
                placeholder="公告标题"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-500 mb-1">内容 <span className="text-red-500">*</span></label>
              <textarea
                value={form.content}
                onChange={(e) => update('content', e.target.value)}
                placeholder="公告内容（支持 Markdown）"
                rows={6}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              />
            </div>

            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-xs text-slate-500 mb-1">类型</label>
                <select
                  value={form.type}
                  onChange={(e) => update('type', e.target.value)}
                  disabled={isEdit}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="system_announcement">全站公告</option>
                  <option value="maintenance">维护通知</option>
                  <option value="update">更新日志</option>
                </select>
              </div>
              <div className="w-28">
                <label className="block text-xs text-slate-500 mb-1">优先级</label>
                <input
                  type="number"
                  value={form.priority}
                  onChange={(e) => update('priority', parseInt(e.target.value) || 0)}
                  min={0}
                  max={10}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 border border-slate-300 rounded-lg"
            >
              取消
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition"
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              {saving ? (isEdit ? '更新中...' : '发布中...') : (isEdit ? '保存' : '发布')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
