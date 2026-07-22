import { useState, useEffect, useCallback } from 'react'
import api from '@/lib/api'
import { Plus, Loader2, X } from 'lucide-react'
import FeatureDescription from '@/components/admin/FeatureDescription'
import type { PageContent, PageContentForm } from './page-contents/types'
import { emptyForm } from './page-contents/types'
import ContentStatsCards from './page-contents/ContentStatsCards'
import ContentList from './page-contents/ContentList'
import CreateContentModal from './page-contents/CreateContentModal'

export default function AdminPageContents() {
  const [pages, setPages] = useState<PageContent[]>([])
  const [loading, setLoading] = useState(true)
  const [editId, setEditId] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [showCreate, setShowCreate] = useState(false)

  const fetchPages = useCallback(() => {
    setLoading(true)
    api.get('/api/v1/admin/page-contents')
      .then(res => {
        const d = res.data as { code: number; data?: { list?: PageContent[] } }
        setPages(d.data?.list || [])
      })
      .catch(() => setPages([]))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { fetchPages() }, [fetchPages])

  const handleToggle = useCallback(async (page: PageContent) => {
    try {
      await api.patch(`/api/v1/admin/page-contents/${page.id}`, { status: !page.status })
      setPages(prev => prev.map(p => p.id === page.id ? { ...p, status: !p.status } : p))
    } catch (e: any) {
      setError(e?.response?.data?.message || e.message || '操作失败')
    }
  }, [])

  const handleStartEdit = useCallback((page: PageContent) => {
    setEditId(page.id)
    setError('')
  }, [])

  const handleSaveEdit = useCallback(async (content: string) => {
    if (!editId) return
    const updatedAt = new Date().toISOString()
    await api.patch(`/api/v1/admin/page-contents/${editId}`, { contentMarkdownZh: content })
    setPages(prev => prev.map(p => p.id === editId ? { ...p, content_markdown_zh: content, updated_at: updatedAt } : p))
    setEditId(null)
  }, [editId])

  const handleCancelEdit = useCallback(() => {
    setEditId(null)
  }, [])

  const handleDelete = useCallback(async (page: PageContent) => {
    if (!confirm(`确认删除页面 "${page.title_zh}"?此操作不可恢复。`)) return
    try {
      await api.delete(`/api/v1/admin/page-contents/${page.id}`)
      setPages(prev => prev.filter(p => p.id !== page.id))
    } catch (e: any) {
      setError(e?.response?.data?.message || e.message || '删除失败')
    }
  }, [])

  const handleCreate = useCallback(async (form: PageContentForm) => {
    await api.post('/api/v1/admin/page-contents', {
      slug: form.slug.trim(),
      titleZh: form.titleZh.trim(),
      titleEn: form.titleEn.trim() || undefined,
      contentMarkdownZh: form.contentMarkdownZh || undefined,
      contentMarkdownEn: form.contentMarkdownEn || undefined,
      status: form.status,
    })
    setShowCreate(false)
    fetchPages()
  }, [fetchPages])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center">
          <h1 className="text-2xl font-bold text-slate-900">页面内容管理</h1>
          <FeatureDescription page="admin/page-contents" className="ml-2" />
        </div>
        <button
          onClick={() => { setShowCreate(true); setError('') }}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition"
        >
          <Plus size={16} /> 新建页面
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm">
          {error}
          <button onClick={() => setError('')} className="ml-auto text-red-500"><X size={16} /></button>
        </div>
      )}

      <ContentStatsCards pages={pages} loading={loading} />

      <ContentList
        pages={pages}
        loading={loading}
        editId={editId}
        onStartEdit={handleStartEdit}
        onSaveEdit={handleSaveEdit}
        onCancelEdit={handleCancelEdit}
        onToggle={handleToggle}
        onDelete={handleDelete}
      />

      {showCreate && (
        <CreateContentModal
          onClose={() => { setShowCreate(false) }}
          onCreate={handleCreate}
        />
      )}
    </div>
  )
}
