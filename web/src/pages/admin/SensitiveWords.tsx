import { useState, useCallback, useEffect } from 'react'
import { Plus, RefreshCw, AlertCircle, Upload } from 'lucide-react'
import PaginationBar from '@/components/ui/PaginationBar'
import { usePersistedFilters } from '@/hooks/use-persisted-filters'
import { WordTable, WordForm } from './sensitive-words/components'
import { useSensitiveWords } from './sensitive-words/hooks'
import type { SensitiveWord, WordForm as WordFormType } from './sensitive-words/types'

export default function SensitiveWords() {
  const {
    words,
    total,
    loading,
    error,
    loadWords,
    createWord,
    updateWord,
    deleteWord,
  } = useSensitiveWords()

  const { filters, setFilter } = usePersistedFilters({
    storageKey: 'sensitive-words',
    defaults: {
      page: 1,
      pageSize: 20,
      keyword: '',
      category: '',
      severity: '',
      enabled: '',
    },
  })

  const [showForm, setShowForm] = useState(false)
  const [editWord, setEditWord] = useState<SensitiveWord | null>(null)
  const [showImport, setShowImport] = useState(false)
  const [importText, setImportText] = useState('')

  // Load on mount and filter change
  useEffect(() => {
    loadWords({
      page: filters.page,
      pageSize: filters.pageSize,
      keyword: filters.keyword || undefined,
      category: filters.category || undefined,
      severity: filters.severity || undefined,
      enabled: filters.enabled || undefined,
    })
  }, [filters, loadWords])

  const handleCreate = useCallback(() => {
    setEditWord(null)
    setShowForm(true)
  }, [])

  const handleEdit = useCallback((word: SensitiveWord) => {
    setEditWord(word)
    setShowForm(true)
  }, [])

  const handleDelete = useCallback(async (id: number) => {
    if (!window.confirm('确定删除此敏感词？')) return
    const ok = await deleteWord(id)
    if (ok) {
      loadWords({
        page: filters.page,
        pageSize: filters.pageSize,
      })
    }
  }, [deleteWord, loadWords, filters])

  const handleToggle = useCallback(async (id: number, enabled: boolean) => {
    await updateWord(id, { enabled })
    loadWords({
      page: filters.page,
      pageSize: filters.pageSize,
    })
  }, [updateWord, loadWords, filters])

  const handleSaveForm = useCallback(async (form: WordFormType) => {
    if (editWord) {
      const ok = await updateWord(editWord.id, form)
      if (ok) {
        loadWords({
          page: filters.page,
          pageSize: filters.pageSize,
        })
      }
      return ok
    } else {
      const created = await createWord(form)
      if (created) {
        loadWords({
          page: filters.page,
          pageSize: filters.pageSize,
        })
      }
      return !!created
    }
  }, [editWord, updateWord, createWord, loadWords, filters])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">敏感词库管理</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setShowImport(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm border rounded-lg hover:bg-slate-50"
          >
            <Upload size={16} />
            批量导入
          </button>
          <button
            onClick={handleCreate}
            className="flex items-center gap-1.5 px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Plus size={16} />
            新建
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
        <div className="flex items-center gap-4">
          <input
            type="text"
            value={filters.keyword}
            onChange={(e) => setFilter('keyword', e.target.value)}
            placeholder="搜索词汇..."
            className="flex-1 px-3 py-1.5 border rounded text-sm"
          />
          <select
            value={filters.category}
            onChange={(e) => setFilter('category', e.target.value)}
            className="px-3 py-1.5 border rounded text-sm"
          >
            <option value="">全部分类</option>
            <option value="general">通用</option>
            <option value="political">政治</option>
            <option value="porn">色情</option>
            <option value="fraud">欺诈</option>
            <option value="violence">暴力</option>
          </select>
          <select
            value={filters.severity}
            onChange={(e) => setFilter('severity', e.target.value)}
            className="px-3 py-1.5 border rounded text-sm"
          >
            <option value="">全部严重度</option>
            <option value="low">低</option>
            <option value="medium">中</option>
            <option value="high">高</option>
            <option value="critical">严重</option>
          </select>
          <button
            onClick={() => loadWords({
              page: filters.page,
              pageSize: filters.pageSize,
            })}
            className="p-2 hover:bg-slate-100 rounded"
          >
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-4 bg-red-50 text-red-700 rounded-lg">
          <AlertCircle size={20} />
          {error}
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <RefreshCw className="animate-spin" size={24} />
          </div>
        ) : words.length === 0 ? (
          <div className="text-center py-16 text-slate-500">暂无敏感词</div>
        ) : (
          <WordTable
            words={words}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onToggle={handleToggle}
          />
        )}

        {/* Pagination */}
        <div className="border-t border-slate-200 px-4 py-3">
          <PaginationBar
            page={filters.page}
            pageSize={filters.pageSize}
            total={total}
            totalPages={Math.ceil(total / filters.pageSize)}
            onPageChange={(p) => setFilter('page', p)}
            onPageSizeChange={(s) => {
              setFilter('pageSize', s)
              setFilter('page', 1)
            }}
          />
        </div>
      </div>

      {/* Form Modal */}
      {showForm && (
        <WordForm
          word={editWord}
          onSave={handleSaveForm}
          onClose={() => setShowForm(false)}
        />
      )}

      {/* Import Modal (simplified) */}
      {showImport && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl w-full max-w-lg p-6">
            <h3 className="text-lg font-semibold mb-4">批量导入</h3>
            <textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder="每行一个词汇..."
              className="w-full px-3 py-2 border rounded-lg h-64"
            />
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setShowImport(false)}
                className="px-4 py-2 text-sm border rounded-lg"
              >
                取消
              </button>
              <button
                onClick={async () => {
                  // TODO: implement batch import
                  setShowImport(false)
                  setImportText('')
                }}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg"
              >
                导入
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}