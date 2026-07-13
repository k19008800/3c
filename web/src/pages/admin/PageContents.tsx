import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Loader2, Save, X, Eye, EyeOff, Edit3, Trash2 } from 'lucide-react'
import api from '@/lib/api'
import FeatureDescription from '@/components/admin/FeatureDescription'

interface PageContent {
  id: number
  slug: string
  title_zh: string
  title_en: string | null
  content_markdown_zh: string | null
  status: boolean
  updated_at: string
}

export default function AdminPageContents() {
  const [pages, setPages] = useState<PageContent[]>([])
  const [loading, setLoading] = useState(true)
  const [editId, setEditId] = useState<number | null>(null)
  const [editContent, setEditContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const fetchPages = () => {
    setLoading(true)
    api.get('/api/v1/admin/page-contents')
      .then(res => {
        const d = res.data as { code: number; data?: { list?: PageContent[] } }
        setPages(d.data?.list || [])
      })
      .catch(() => setPages([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchPages() }, [])

  const handleToggle = async (page: PageContent) => {
    try {
      await api.patch(`/api/v1/admin/page-contents/${page.id}`, { status: !page.status })
      setPages(prev => prev.map(p => p.id === page.id ? { ...p, status: !p.status } : p))
    } catch (e: any) { setError(e?.response?.data?.message || e.message || '操作失败') }
  }

  const handleStartEdit = (page: PageContent) => {
    setEditId(page.id)
    setEditContent(page.content_markdown_zh || '')
    setError('')
  }

  const handleSave = async () => {
    if (!editId) return
    setSaving(true)
    setError('')
    try {
      await api.patch(`/api/v1/admin/page-contents/${editId}`, { contentMarkdownZh: editContent })
      setPages(prev => prev.map(p => p.id === editId ? { ...p, content_markdown_zh: editContent, updated_at: new Date().toISOString() } : p))
      setEditId(null)
    } catch (e: any) { setError(e?.response?.data?.message || e.message || '保存失败') }
    finally { setSaving(false) }
  }

  const handleDelete = async (page: PageContent) => {
    if (!confirm(`确认删除页面 "${page.title_zh}"？此操作不可恢复。`)) return
    try {
      await api.delete(`/api/v1/admin/page-contents/${page.id}`)
      setPages(prev => prev.filter(p => p.id !== page.id))
    } catch (e: any) { setError(e?.response?.data?.message || e.message || '删除失败') }
  }

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-lg" />)}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center">
        <h1 className="text-2xl font-bold text-slate-900">页面内容管理</h1>
        <FeatureDescription page="admin/page-contents" className="ml-2" />
      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm">
          {error}
          <button onClick={() => setError('')} className="ml-auto text-red-500"><X size={16} /></button>
        </div>
      )}

      {pages.length === 0 && <p className="text-slate-400 text-sm py-8 text-center">暂无页面内容</p>}

      {pages.map(page => (
        <Card key={page.id}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CardTitle className="text-lg">{page.title_zh}</CardTitle>
                <Badge variant="outline" className="font-mono text-xs">{page.slug}</Badge>
                <Badge variant={page.status ? 'default' : 'secondary'}>
                  {page.status ? '已发布' : '草稿'}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleToggle(page)}
                  className={`flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg transition ${page.status ? 'text-amber-600 bg-amber-50 hover:bg-amber-100' : 'text-green-600 bg-green-50 hover:bg-green-100'}`}
                  title={page.status ? '下架' : '发布'}
                >
                  {page.status ? <EyeOff size={14} /> : <Eye size={14} />}
                  {page.status ? '下架' : '发布'}
                </button>
                <button
                  onClick={() => handleStartEdit(page)}
                  className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg text-blue-600 bg-blue-50 hover:bg-blue-100 transition"
                >
                  <Edit3 size={14} /> 编辑
                </button>
                <button
                  onClick={() => handleDelete(page)}
                  className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg text-red-600 bg-red-50 hover:bg-red-100 transition"
                >
                  <Trash2 size={14} /> 删除
                </button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {editId === page.id ? (
              <div className="space-y-3">
                <textarea
                  value={editContent}
                  onChange={e => setEditContent(e.target.value)}
                  rows={6}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                  placeholder="Markdown 内容..."
                />
                <div className="flex items-center gap-2">
                  <button onClick={handleSave} disabled={saving}
                    className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
                    {saving ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />} 保存
                  </button>
                  <button onClick={() => setEditId(null)} className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-800">
                    取消
                  </button>
                </div>
              </div>
            ) : (
              <>
                <p className="text-sm text-slate-500 line-clamp-2">
                  {page.content_markdown_zh?.slice(0, 200) || '无内容'}
                </p>
                <p className="text-xs text-slate-400 mt-2">
                  最后更新: {new Date(page.updated_at).toLocaleString('zh-CN')}
                </p>
              </>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
