import { useState } from 'react'
import { Loader2, Save, X } from 'lucide-react'

interface EditorProps {
  pageId: number
  initialContent: string
  onSave: (content: string) => Promise<void>
  onCancel: () => void
}

export default function ContentEditor({ pageId, initialContent, onSave, onCancel }: EditorProps) {
  const [content, setContent] = useState(initialContent)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSave = async () => {
    setSaving(true)
    setError('')
    try {
      await onSave(content)
    } catch (err: any) {
      setError(err?.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 p-2 rounded text-sm">
          {error}
          <button onClick={() => setError('')} className="ml-auto"><X size={14} /></button>
        </div>
      )}
      <textarea
        value={content}
        onChange={e => setContent(e.target.value)}
        rows={6}
        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
        placeholder="Markdown 内容..."
      />
      <div className="flex items-center gap-2">
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
          {saving ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />} 保存
        </button>
        <button onClick={onCancel} className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-800">
          取消
        </button>
      </div>
    </div>
  )
}
