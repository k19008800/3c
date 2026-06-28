import { useEffect, useState, useCallback } from 'react'
import { get, post, del } from '@/lib/api'
import type { ApiKey, PaginatedData } from '@/types'
import { Loader2, AlertCircle, Plus, Copy, CheckCircle2, Trash2, Key } from 'lucide-react'

export default function ApiKeys() {
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [newKeyName, setNewKeyName] = useState('')
  const [creating, setCreating] = useState(false)
  const [createdKey, setCreatedKey] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const fetchKeys = useCallback(async () => {
    try {
      const data = await get<PaginatedData<ApiKey>>('/api/v1/api-keys')
      setKeys(data.list)
    } catch (err: any) {
      setError(err.message || '获取密钥列表失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchKeys()
  }, [fetchKeys])

  const handleCreate = async () => {
    if (!newKeyName.trim()) return
    setCreating(true)
    try {
      const data = await post<ApiKey>('/api/v1/api-keys', { name: newKeyName })
      setCreatedKey(data.key)
      setNewKeyName('')
      setShowCreate(false)
      fetchKeys()
    } catch (err: any) {
      setError(err.message || '创建密钥失败')
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (id: number) => {
    if (!window.confirm('确定要删除此 API 密钥吗？此操作不可撤销。')) return
    try {
      await del(`/api/v1/api-keys/${id}`)
      setKeys((prev) => prev.filter((k) => k.id !== id))
    } catch (err: any) {
      setError(err.message || '删除密钥失败')
    }
  }

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 3000)
    } catch {
      // fallback
      const textarea = document.createElement('textarea')
      textarea.value = text
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      setCopied(true)
      setTimeout(() => setCopied(false), 3000)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="animate-spin" size={32} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">API 密钥</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm"
        >
          <Plus size={16} />
          创建密钥
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {/* Created key display */}
      {createdKey && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2 text-green-700 font-medium">
            <CheckCircle2 size={18} />
            密钥创建成功！请立即复制并安全保存，关闭后将不再显示。
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 p-2 bg-white border border-green-200 rounded text-sm break-all font-mono">
              {createdKey}
            </code>
            <button
              onClick={() => handleCopy(createdKey)}
              className="flex items-center gap-1 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition text-sm"
            >
              {copied ? <CheckCircle2 size={16} /> : <Copy size={16} />}
              {copied ? '已复制' : '复制'}
            </button>
            <button
              onClick={() => setCreatedKey(null)}
              className="px-3 py-2 text-slate-500 hover:text-slate-700 transition text-sm"
            >
              关闭
            </button>
          </div>
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
            <h2 className="text-lg font-semibold mb-4">创建 API 密钥</h2>
            <input
              type="text"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              placeholder="密钥名称（如：生产环境）"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => { setShowCreate(false); setNewKeyName('') }}
                className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 transition"
              >
                取消
              </button>
              <button
                onClick={handleCreate}
                disabled={creating || !newKeyName.trim()}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition flex items-center gap-1"
              >
                {creating && <Loader2 className="animate-spin" size={14} />}
                确认创建
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Key list */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 text-left">
                <th className="px-4 py-3 text-sm font-medium text-slate-500">名称</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">密钥前缀</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">状态</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">最后使用</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">创建时间</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {keys.map((key) => (
                <tr key={key.id} className="hover:bg-slate-50 transition">
                  <td className="px-4 py-3 text-sm font-medium text-slate-900">{key.name}</td>
                  <td className="px-4 py-3">
                    <code className="text-xs bg-slate-100 px-2 py-1 rounded font-mono">
                      {key.keyPrefix}...
                    </code>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                        key.isActive
                          ? 'bg-green-100 text-green-700'
                          : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {key.status ? '启用' : '停用'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-500">
                    {key.lastUsedAt
                      ? new Date(key.lastUsedAt).toLocaleString('zh-CN')
                      : '从未使用'}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-500">
                    {new Date(key.createdAt).toLocaleString('zh-CN')}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleDelete(key.id)}
                      className="flex items-center gap-1 text-sm text-red-500 hover:text-red-700 transition"
                    >
                      <Trash2 size={14} />
                      删除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {keys.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-12 text-slate-400">
            <Key size={48} strokeWidth={1.5} />
            <p>暂无 API 密钥</p>
            <button
              onClick={() => setShowCreate(true)}
              className="text-blue-500 hover:text-blue-700 text-sm"
            >
              创建第一个密钥
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
