import { useState, useCallback, useEffect } from 'react'
import { get, post, patch, del } from '@/lib/api'
import type { PaginatedData } from '@/types'
import { usePersistedFilters } from '@/hooks/use-persisted-filters'
import {
  Plus,
  Trash2,
  Edit2,
  Search,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  Upload,
  Download,
  Filter,
} from 'lucide-react'
import PaginationBar from '@/components/ui/PaginationBar'
import { Badge } from '@/components/ui/badge'
import Modal from '@/components/ui/Modal'

interface SensitiveWord {
  id: number
  word: string
  category: string
  severity: string
  description: string | null
  hitCount: number
  lastHitAt: string | null
  enabled: boolean
  createdBy: number | null
  createdAt: string
  updatedAt: string
}

const CATEGORIES = [
  { value: 'general', label: '通用' },
  { value: 'political', label: '政治' },
  { value: 'porn', label: '色情' },
  { value: 'fraud', label: '欺诈' },
  { value: 'violence', label: '暴力' },
  { value: 'custom', label: '自定义' },
]

const SEVERITIES = [
  { value: 'low', label: '低', color: 'bg-slate-100 text-slate-700' },
  { value: 'medium', label: '中', color: 'bg-amber-100 text-amber-700' },
  { value: 'high', label: '高', color: 'bg-orange-100 text-orange-700' },
  { value: 'critical', label: '严重', color: 'bg-red-100 text-red-700' },
]

export default function SensitiveWords() {
  const [words, setWords] = useState<SensitiveWord[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [editWord, setEditWord] = useState<SensitiveWord | null>(null)
  const [batchModalOpen, setBatchModalOpen] = useState(false)
  const [batchText, setBatchText] = useState('')
  const [batchCategory, setBatchCategory] = useState('general')
  const [batchSeverity, setBatchSeverity] = useState('medium')
  const [submitting, setSubmitting] = useState(false)

  const { filters, setFilter, setFilters, resetFilters, hasActiveFilters } = usePersistedFilters({
    storageKey: 'sensitive-words',
    defaults: {
      category: '',
      enabled: '',
      keyword: '',
      page: 1,
      pageSize: 50,
    },
  })

  const { category, enabled, keyword, page, pageSize } = filters as Record<string, any>
  const totalPages = Math.ceil(total / pageSize)

  const fetchWords = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params: Record<string, any> = { page, pageSize }
      if (category) params.category = category
      if (enabled) params.enabled = enabled
      if (keyword) params.keyword = keyword

      const data = await get<PaginatedData<SensitiveWord>>('/api/v1/admin/sensitive-words', params)
      setWords(data.list)
      setTotal(data.total)
    } catch (err: any) {
      setError(err.message || '获取敏感词列表失败')
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, category, enabled, keyword])

  useEffect(() => {
    fetchWords()
  }, [fetchWords])

  const handleToggleEnabled = async (word: SensitiveWord) => {
    try {
      await patch(`/api/v1/admin/sensitive-words/${word.id}`, { enabled: !word.enabled })
      fetchWords()
    } catch (err: any) {
      setError(err.message || '操作失败')
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('确定删除此敏感词?')) return
    try {
      await del(`/api/v1/admin/sensitive-words/${id}`)
      fetchWords()
    } catch (err: any) {
      setError(err.message || '删除失败')
    }
  }

  const handleSave = async () => {
    if (!editWord?.word.trim()) {
      setError('敏感词不能为空')
      return
    }
    setSubmitting(true)
    try {
      if (editWord.id) {
        await patch(`/api/v1/admin/sensitive-words/${editWord.id}`, {
          word: editWord.word,
          category: editWord.category,
          severity: editWord.severity,
          description: editWord.description,
        })
      } else {
        await post('/api/v1/admin/sensitive-words', {
          word: editWord.word,
          category: editWord.category,
          severity: editWord.severity,
          description: editWord.description,
        })
      }
      setEditModalOpen(false)
      setEditWord(null)
      fetchWords()
    } catch (err: any) {
      setError(err.message || '保存失败')
    } finally {
      setSubmitting(false)
    }
  }

  const handleBatchImport = async () => {
    const lines = batchText
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0)
    if (lines.length === 0) {
      setError('请输入要导入的敏感词')
      return
    }
    setSubmitting(true)
    try {
      const res = await post('/api/v1/admin/sensitive-words/batch', {
        words: lines,
        category: batchCategory,
        severity: batchSeverity,
      })
      setBatchModalOpen(false)
      setBatchText('')
      fetchWords()
      alert(`成功导入 ${res.count} 个敏感词`)
    } catch (err: any) {
      setError(err.message || '导入失败')
    } finally {
      setSubmitting(false)
    }
  }

  const exportCSV = () => {
    if (words.length === 0) return
    const headers = ['词汇', '分类', '严重度', '描述', '命中次数', '最后命中', '状态', '创建时间']
    const rows = words.map(w => [
      w.word,
      w.category,
      w.severity,
      w.description || '',
      w.hitCount,
      w.lastHitAt || '',
      w.enabled ? '启用' : '禁用',
      w.createdAt,
    ])
    const bom = '\uFEFF'
    const csv =
      bom +
      headers.join(',') +
      '\n' +
      rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `sensitive_words_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const categoryLabel = (cat: string) => {
    return CATEGORIES.find(c => c.value === cat)?.label || cat
  }

  const severityBadge = (sev: string) => {
    const s = SEVERITIES.find(s => s.value === sev) || SEVERITIES[1]
    return (
      <span className={`px-2 py-0.5 rounded text-xs ${s.color}`}>
        {s.label}
      </span>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">敏感词库管理</h1>
          <p className="text-sm text-slate-500 mt-1">用于提示词审计的敏感词检测，支持批量导入</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-500">共 {total} 条</span>
          <button
            onClick={() => {
              setEditWord({
                id: 0,
                word: '',
                category: 'general',
                severity: 'medium',
                description: null,
                hitCount: 0,
                lastHitAt: null,
                enabled: true,
                createdBy: null,
                createdAt: '',
                updatedAt: '',
              })
              setEditModalOpen(true)
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition"
          >
            <Plus size={14} /> 新增
          </button>
          <button
            onClick={() => setBatchModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition"
          >
            <Upload size={14} /> 批量导入
          </button>
          <button
            onClick={exportCSV}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition"
          >
            <Download size={14} /> 导出
          </button>
          <button
            onClick={() => {
              setFilter('page', 1)
              fetchWords()
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition"
          >
            <RefreshCw size={14} /> 刷新
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter size={16} className="text-slate-400" />
          <span className="text-sm font-medium text-slate-700">筛选条件</span>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-xs text-slate-500 mb-1">分类</label>
            <select
              value={category}
              onChange={e => setFilter('category', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">全部</option>
              {CATEGORIES.map(c => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">状态</label>
            <select
              value={enabled}
              onChange={e => setFilter('enabled', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">全部</option>
              <option value="true">启用</option>
              <option value="false">禁用</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">搜索词汇</label>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={keyword}
                onChange={e => setFilter('keyword', e.target.value)}
                placeholder="搜索词汇"
                className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm">
          <AlertTriangle size={16} /> {error}
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">词汇</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">分类</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">严重度</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">描述</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">命中次数</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">最后命中</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">状态</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-sm text-slate-500">
                  加载中...
                </td>
              </tr>
            ) : words.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-sm text-slate-500">
                  暂无数据
                </td>
              </tr>
            ) : (
              words.map(word => (
                <tr key={word.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-sm font-medium text-slate-900">{word.word}</td>
                  <td className="px-4 py-3">
                    <Badge variant="secondary">{categoryLabel(word.category)}</Badge>
                  </td>
                  <td className="px-4 py-3">{severityBadge(word.severity)}</td>
                  <td className="px-4 py-3 text-sm text-slate-600 max-w-xs truncate">
                    {word.description || '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-900">{word.hitCount}</td>
                  <td className="px-4 py-3 text-sm text-slate-500">
                    {word.lastHitAt ? new Date(word.lastHitAt).toLocaleString('zh-CN') : '-'}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleToggleEnabled(word)}
                      className={`px-2 py-0.5 rounded text-xs ${
                        word.enabled
                          ? 'bg-green-100 text-green-700'
                          : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {word.enabled ? '启用' : '禁用'}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setEditWord(word)
                          setEditModalOpen(true)
                        }}
                        className="text-blue-600 hover:text-blue-700"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        onClick={() => handleDelete(word.id)}
                        className="text-red-600 hover:text-red-700"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <PaginationBar
        page={page}
        pageSize={pageSize}
        total={total}
        totalPages={totalPages}
        onPageChange={p => setFilter('page', p)}
        onPageSizeChange={s => setFilters({ pageSize: s })}
      />

      {/* Edit Modal */}
      <Modal
        isOpen={editModalOpen}
        onClose={() => {
          setEditModalOpen(false)
          setEditWord(null)
        }}
        title={editWord?.id ? '编辑敏感词' : '新增敏感词'}
        size="sm"
      >
        {editWord && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs text-slate-500 mb-1">词汇</label>
              <input
                type="text"
                value={editWord.word}
                onChange={e => setEditWord({ ...editWord, word: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">分类</label>
              <select
                value={editWord.category}
                onChange={e => setEditWord({ ...editWord, category: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {CATEGORIES.map(c => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">严重度</label>
              <select
                value={editWord.severity}
                onChange={e => setEditWord({ ...editWord, severity: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {SEVERITIES.map(s => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">描述</label>
              <textarea
                value={editWord.description || ''}
                onChange={e => setEditWord({ ...editWord, description: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-20"
              />
            </div>
            <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-200">
              <button
                onClick={() => {
                  setEditModalOpen(false)
                  setEditWord(null)
                }}
                className="px-4 py-2 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition"
              >
                取消
              </button>
              <button
                onClick={handleSave}
                disabled={submitting || !editWord.word.trim()}
                className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Batch Import Modal */}
      <Modal
        isOpen={batchModalOpen}
        onClose={() => setBatchModalOpen(false)}
        title="批量导入敏感词"
        size="md"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-slate-500 mb-1">词汇列表（每行一个）</label>
            <textarea
              value={batchText}
              onChange={e => setBatchText(e.target.value)}
              placeholder="敏感词1&#10;敏感词2&#10;敏感词3"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-40"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-slate-500 mb-1">分类</label>
              <select
                value={batchCategory}
                onChange={e => setBatchCategory(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {CATEGORIES.map(c => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">严重度</label>
              <select
                value={batchSeverity}
                onChange={e => setBatchSeverity(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {SEVERITIES.map(s => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-200">
            <button
              onClick={() => setBatchModalOpen(false)}
              className="px-4 py-2 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition"
            >
              取消
            </button>
            <button
              onClick={handleBatchImport}
              disabled={submitting}
              className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? '导入中...' : '导入'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
