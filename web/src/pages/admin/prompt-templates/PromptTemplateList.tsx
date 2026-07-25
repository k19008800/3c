import { useState, useEffect } from 'react'
import { get, post, patch, del } from '@/lib/api'
import {
  Loader2, Plus, Search, Edit3, Trash2, Copy, CheckCircle2, X,
  FileText, Eye, EyeOff, RefreshCw,
} from 'lucide-react'
import PaginationBar from '@/components/ui/PaginationBar'
import PromptTemplateForm from './PromptTemplateForm'

// ── Types ──

interface TemplateVariable {
  name: string
  label: string
  default?: string
  required?: boolean
  description?: string
}

interface TemplateRules {
  checkSensitive?: boolean
  customRules?: string[]
  maxLength?: number
  forbiddenPatterns?: string[]
  requireApproval?: boolean
}

interface PromptTemplate {
  id: number
  name: string
  description: string | null
  category: string
  content: string
  variables: TemplateVariable[]
  rules: TemplateRules | null
  usageCount: number
  lastUsedAt: string | null
  enabled: boolean
  isPreset: boolean
  reviewStatus: string
  tags: string[]
  sortOrder: number
  createdBy: number | null
  createdAt: string
  updatedAt: string
}

// ── Category map ──

const categoryMap: Record<string, { label: string; color: string }> = {
  conversation: { label: '对话', color: 'bg-blue-100 text-blue-700' },
  code: { label: '代码', color: 'bg-green-100 text-green-700' },
  document: { label: '文档', color: 'bg-purple-100 text-purple-700' },
  analysis: { label: '分析', color: 'bg-amber-100 text-amber-700' },
  creative: { label: '创意', color: 'bg-pink-100 text-pink-700' },
  security: { label: '安全', color: 'bg-red-100 text-red-700' },
  custom: { label: '自定义', color: 'bg-slate-100 text-slate-700' },
}

function getCategoryInfo(cat: string) {
  return categoryMap[cat] || { label: cat, color: 'bg-slate-100 text-slate-700' }
}

// ── Component ──

export default function PromptTemplateList() {
  const [templates, setTemplates] = useState<PromptTemplate[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [keyword, setKeyword] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editItem, setEditItem] = useState<PromptTemplate | null>(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const loadList = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
      if (keyword) params.set('keyword', keyword)
      if (categoryFilter) params.set('category', categoryFilter)
      const res = await get<{ data: { list: PromptTemplate[]; total: number } }>(
        `/api/v1/admin/prompt-templates?${params}`
      )
      if (res?.data) {
        setTemplates(res.data.list)
        setTotal(res.data.total)
      }
    } catch { /* ignore */ }
    setLoading(false)
  }

  useEffect(() => { loadList() }, [page, pageSize, categoryFilter])

  const handleSearch = () => {
    setPage(1)
    loadList()
  }

  const handleDelete = async (id: number) => {
    if (!confirm('确定删除此模板？')) return
    try {
      await del(`/api/v1/admin/prompt-templates/${id}`)
      setMessage('删除成功')
      loadList()
    } catch (err: any) {
      setMessage(err.message || '删除失败')
    }
  }

  const handleToggle = async (id: number, enabled: boolean) => {
    try {
      await patch(`/api/v1/admin/prompt-templates/${id}`, { enabled: !enabled })
      loadList()
    } catch { /* ignore */ }
  }

  const handleSave = async (data: any) => {
    setSaving(true)
    try {
      if (editItem) {
        await patch(`/api/v1/admin/prompt-templates/${editItem.id}`, data)
        setMessage('更新成功')
      } else {
        await post('/api/v1/admin/prompt-templates', data)
        setMessage('创建成功')
      }
      setShowForm(false)
      setEditItem(null)
      loadList()
    } catch (err: any) {
      setMessage(err.message || '保存失败')
    }
    setSaving(false)
  }

  useEffect(() => {
    if (message) {
      const t = setTimeout(() => setMessage(''), 3000)
      return () => clearTimeout(t)
    }
  }, [message])

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">提示词模板库</h1>
          <p className="text-sm text-slate-500 mt-1">管理可复用的提示词模板，支持变量、标签和审核规则</p>
        </div>
        <button
          onClick={() => { setEditItem(null); setShowForm(true) }}
          className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
        >
          <Plus size={16} />
          新建模板
        </button>
      </div>

      {/* Message */}
      {message && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-50 text-blue-700 text-sm">
          <CheckCircle2 size={14} /> {message}
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="搜索模板名称..."
            className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select
          value={categoryFilter}
          onChange={(e) => { setCategoryFilter(e.target.value); setPage(1) }}
          className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
        >
          <option value="">全部分类</option>
          <option value="conversation">对话</option>
          <option value="code">代码</option>
          <option value="document">文档</option>
          <option value="analysis">分析</option>
          <option value="creative">创意</option>
          <option value="security">安全</option>
          <option value="custom">自定义</option>
        </select>
        <button onClick={loadList} className="p-2 border border-slate-200 rounded-lg hover:bg-slate-50">
          <RefreshCw size={16} className="text-slate-500" />
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 text-left">
                <th className="px-4 py-3 text-sm font-medium text-slate-500">名称</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">分类</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">标签</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">状态</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">使用次数</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">更新于</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center py-12">
                    <Loader2 size={20} className="animate-spin mx-auto text-slate-400" />
                  </td>
                </tr>
              ) : templates.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-slate-400">
                    <FileText size={40} className="mx-auto mb-2 opacity-50" />
                    暂无模板，点击上方「新建模板」开始
                  </td>
                </tr>
              ) : templates.map((t) => {
                const catInfo = getCategoryInfo(t.category)
                return (
                  <tr key={t.id} className="hover:bg-slate-50 transition">
                    <td className="px-4 py-3">
                      <div>
                        <p className="text-sm font-medium text-slate-800">{t.name}</p>
                        {t.description && (
                          <p className="text-xs text-slate-400 truncate max-w-[200px]">{t.description}</p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${catInfo.color}`}>
                        {catInfo.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 flex-wrap">
                        {t.tags?.slice(0, 3).map((tag, i) => (
                          <span key={i} className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded">
                            {tag}
                          </span>
                        ))}
                        {(t.tags?.length || 0) > 3 && (
                          <span className="text-[10px] text-slate-400">+{t.tags.length - 3}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                        t.enabled ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
                      }`}>
                        {t.enabled ? '启用' : '停用'}
                      </span>
                      {t.isPreset && (
                        <span className="ml-1 text-[10px] text-purple-500">预设</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500">{t.usageCount}</td>
                    <td className="px-4 py-3 text-sm text-slate-500">
                      {new Date(t.updatedAt).toLocaleDateString('zh-CN')}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => { setEditItem(t); setShowForm(true) }}
                          className="p-1.5 text-slate-500 hover:text-blue-600 rounded hover:bg-blue-50 transition"
                          title="编辑"
                        >
                          <Edit3 size={14} />
                        </button>
                        <button
                          onClick={() => handleToggle(t.id, t.enabled)}
                          className="p-1.5 text-slate-500 hover:text-amber-600 rounded hover:bg-amber-50 transition"
                          title={t.enabled ? '停用' : '启用'}
                        >
                          {t.enabled ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                        {!t.isPreset && (
                          <button
                            onClick={() => handleDelete(t.id)}
                            className="p-1.5 text-slate-500 hover:text-red-600 rounded hover:bg-red-50 transition"
                            title="删除"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="border-t border-slate-200 px-4 py-3">
          <PaginationBar
            page={page}
            pageSize={pageSize}
            total={total}
            totalPages={Math.ceil(total / pageSize)}
            onPageChange={setPage}
            onPageSizeChange={(s) => { setPageSize(s); setPage(1) }}
          />
        </div>
      </div>

      {/* Form Modal */}
      {showForm && (
        <PromptTemplateForm
          initial={editItem}
          onSave={handleSave}
          saving={saving}
          onClose={() => { setShowForm(false); setEditItem(null) }}
        />
      )}
    </div>
  )
}
