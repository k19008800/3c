import { Badge } from '@/components/ui/badge'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Eye, EyeOff, Edit3, Trash2 } from 'lucide-react'
import type { PageContent } from './types'
import ContentEditor from './ContentEditor'
import ContentPreview from './ContentPreview'

interface ListProps {
  pages: PageContent[]
  loading: boolean
  editId: number | null
  onStartEdit: (page: PageContent) => void
  onSaveEdit: (content: string) => Promise<void>
  onCancelEdit: () => void
  onToggle: (page: PageContent) => Promise<void>
  onDelete: (page: PageContent) => void
}

export default function ContentList({
  pages, loading, editId,
  onStartEdit, onSaveEdit, onCancelEdit,
  onToggle, onDelete,
}: ListProps) {
  if (loading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-lg" />
        ))}
      </div>
    )
  }

  if (pages.length === 0) {
    return (
      <p className="text-slate-400 text-sm py-8 text-center">暂无页面内容</p>
    )
  }

  return (
    <div className="space-y-4">
      {pages.map((page) => (
        <Card key={page.id}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-3">
                <CardTitle className="text-lg">{page.title_zh}</CardTitle>
                <Badge variant="outline" className="font-mono text-xs">{page.slug}</Badge>
                <Badge variant={page.status ? 'default' : 'secondary'}>
                  {page.status ? '已发布' : '草稿'}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onToggle(page)}
                  className={`flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg transition ${page.status ? 'text-amber-600 bg-amber-50 hover:bg-amber-100' : 'text-green-600 bg-green-50 hover:bg-green-100'}`}
                  title={page.status ? '下架' : '发布'}
                >
                  {page.status ? <EyeOff size={14} /> : <Eye size={14} />}
                  {page.status ? '下架' : '发布'}
                </button>
                <button
                  onClick={() => onStartEdit(page)}
                  className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg text-blue-600 bg-blue-50 hover:bg-blue-100"
                >
                  <Edit3 size={14} /> 编辑
                </button>
                <button
                  onClick={() => onDelete(page)}
                  className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg text-red-600 bg-red-50 hover:bg-red-100"
                >
                  <Trash2 size={14} /> 删除
                </button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {editId === page.id ? (
              <ContentEditor
                pageId={page.id}
                initialContent={page.content_markdown_zh || ''}
                onSave={onSaveEdit}
                onCancel={onCancelEdit}
              />
            ) : (
              <>
                <ContentPreview markdown={page.content_markdown_zh} />
                <p className="text-xs text-slate-400 mt-2">
                  最后更新: {new Date(page.updated_at).toLocaleString('zh-CN')}
                  {page.updated_by ? ` by ${page.updated_by}` : ''}
                </p>
              </>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
