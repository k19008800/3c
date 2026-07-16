import React, { useEffect, useState, useCallback } from 'react'
import { get, post, patch, del } from '@/lib/api'
import PaginationBar from '@/components/ui/PaginationBar'
import { Badge } from '@/components/ui/badge'
import FilterBar from '@/components/ui/FilterBar'
import FeatureDescription from '@/components/admin/FeatureDescription'
import { usePersistedFilters } from '@/hooks/use-persisted-filters'
import {
  Loader2, Key, Plus, AlertCircle, CheckCircle2,
  ToggleLeft, ToggleRight, FileText, X, Copy, ChevronDown, ChevronUp, Terminal,
} from 'lucide-react'

interface AdminApiKeyItem {
  id: number
  name: string
  keyPrefix: string
  permissions: string[]
  status: string
  expiresAt: string | null
  lastUsedAt: string | null
  createdBy: number
  createdAt: string
}

interface AdminKeyUsageLog {
  id: number
  keyId: number
  action: string
  ip: string | null
  path: string | null
  success: boolean
  createdAt: string
}

const VALID_MODULES = ['users', 'finance', 'vendors', 'models', 'agents', 'security', 'system', 'audit', 'stats'] as const
const VALID_ACTIONS = ['read', 'write', 'delete', '*'] as const

export default function AdminApiKeys() {
  const [keys, setKeys] = useState<AdminApiKeyItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // ── 持久化筛选 ──
  const { filters, setFilter, resetFilters, hasActiveFilters } = usePersistedFilters({
    storageKey: 'admin-api-keys',
    defaults: { keyword: '', page: 1, pageSize: 20 },
  })
  const { keyword, page, pageSize } = filters as { keyword: string; page: number; pageSize: number }

  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState({ name: '', permissions: [] as string[], expiresAt: '' })
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')
  const [createdKey, setCreatedKey] = useState<{ key: string; name: string } | null>(null)

  const [logKeyId, setLogKeyId] = useState<number | null>(null)
  const [logs, setLogs] = useState<AdminKeyUsageLog[]>([])
  const [logPage, setLogPage] = useState(1)
  const [logsLoading, setLogsLoading] = useState(false)
  const [copySuccess, setCopySuccess] = useState<number | null>(null)
  const [usageExampleOpen, setUsageExampleOpen] = useState<number | null>(null)

  const [deleteConfirm, setDeleteConfirm] = useState<AdminApiKeyItem | null>(null)

  const totalPages = Math.ceil(total / pageSize)

  const handleCopyKey = (keyPrefix: string) => {
    // 前缀不能直接复制完整 key，但可以在创建成功弹窗中复制
    navigator.clipboard.writeText(`sk-${keyPrefix.toLowerCase()}****`).then(() => {
      alert('Key 前缀已复制到剪贴板（仅前缀，完整 Key 需在创建时保存）')
    })
  }

  const handleDelete = async (key: AdminApiKeyItem) => {
    try {
      await del(`/api/v1/admin/api-keys/${key.id}`)
      setDeleteConfirm(null)
      fetchKeys()
    } catch (err: any) {
      alert(err.message || '删除失败')
    }
  }

  const fetchKeys = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params: any = { page, pageSize }
      if (keyword) params.keyword = keyword
      const data = await get<{ list: AdminApiKeyItem[]; total: number }>('/api/v1/admin/api-keys', params)
      setKeys(data.list || [])
      setTotal(data.total)
    } catch (err: any) {
      setError(err.message || '获取管理 Key 列表失败')
    } finally { setLoading(false) }
  }, [page, pageSize, keyword])

  useEffect(() => { fetchKeys() }, [fetchKeys])

  const fetchLogs = useCallback(async (keyId: number, p: number) => {
    setLogsLoading(true)
    try {
      const data = await get<{ list: AdminKeyUsageLog[]; total: number }>(`/api/v1/admin/api-keys/${keyId}/logs`, { page: p, pageSize: 20 })
      setLogs(data.list || [])
    } catch { /* ignore */ } finally { setLogsLoading(false) }
  }, [])

  const handleCreate = async () => {
    setFormError('')
    if (!form.name) {
      setFormError('请输入名称')
      return
    }
    setSubmitting(true)
    try {
      const data = await post<{ id: number; name: string; key: string; keyPrefix: string; permissions: string[]; createdAt: string }>(
        '/api/v1/admin/api-keys',
        {
          name: form.name,
          permissions: form.permissions,
          expiresAt: form.expiresAt || undefined,
        }
      )
      setCreatedKey({ key: data.key, name: data.name })
      setForm({ name: '', permissions: [], expiresAt: '' })
      setFormOpen(false)
      fetchKeys()
    } catch (err: any) {
      setFormError(err.message || '创建失败')
    } finally { setSubmitting(false) }
  }

  const handleToggleStatus = async (key: AdminApiKeyItem) => {
    try {
      if (key.status === 'active') {
        await del(`/api/v1/admin/api-keys/${key.id}`)
      } else {
        await patch(`/api/v1/admin/api-keys/${key.id}`, { status: 'active' })
      }
      fetchKeys()
    } catch (err: any) {
      alert(err.message || '操作失败')
    }
  }

  const handleViewLogs = (keyId: number) => {
    setLogKeyId(keyId)
    setLogPage(1)
    fetchLogs(keyId, 1)
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      alert('已复制到剪贴板')
    })
  }

  const togglePermission = (perm: string) => {
    setForm(f => ({
      ...f,
      permissions: f.permissions.includes(perm)
        ? f.permissions.filter(p => p !== perm)
        : [...f.permissions, perm],
    }))
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Key size={28} className="text-amber-600" />
          <h1 className="text-2xl font-bold text-slate-900">管理 API Key</h1>
          <FeatureDescription page="admin/admin-api-keys" className="ml-2" />
        </div>
        <button
          onClick={() => setFormOpen(!formOpen)}
          className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition text-sm"
        >
          <Plus size={16} />
          创建 Key
        </button>
      </div>

      {/* Create form */}
      {formOpen && (
        <div className="bg-white rounded-xl p-6 shadow-sm border border-amber-200 space-y-4">
          <h3 className="font-semibold text-slate-900">创建管理 API Key</h3>

          {formError && (
            <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm">
              <AlertCircle size={16} />
              {formError}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">名称 *</label>
              <input type="text" value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="如：运维脚本 Key" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">权限 *</label>
              <div className="space-y-2">
                {VALID_MODULES.map(mod => (
                  <div key={mod} className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-slate-600 w-16">{mod}</span>
                    {VALID_ACTIONS.map(act => {
                      const perm = `${mod}:${act}`
                      const isAll = act === '*'
                      const selected = form.permissions.includes(perm)
                      return (
                        <button key={perm} type="button" onClick={() => togglePermission(perm)}
                          className={`px-2 py-1 text-xs rounded border transition ${
                            selected ? 'bg-amber-100 border-amber-400 text-amber-800' : 'border-slate-200 text-slate-500 hover:border-slate-300'
                          }`}>
                          {act}{isAll ? ' (全部)' : ''}
                        </button>
                      )
                    })}
                  </div>
                ))}
                <button type="button" onClick={() => setForm(f => ({ ...f, permissions: ['*:*'] }))}
                  className={`px-2 py-1 text-xs rounded border transition ${
                    form.permissions.includes('*:*') ? 'bg-amber-100 border-amber-400 text-amber-800' : 'border-slate-200 text-slate-500 hover:border-slate-300'
                  }`}>
                  *:* (全部权限)
                </button>
                {form.permissions.length > 0 && (
                  <button type="button" onClick={() => setForm(f => ({ ...f, permissions: [] }))}
                    className="px-2 py-1 text-xs text-red-500 hover:text-red-700 transition">
                    清空选择
                  </button>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">过期时间（可选）</label>
              <input type="datetime-local" value={form.expiresAt} onChange={(e) => setForm(f => ({ ...f, expiresAt: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
            </div>
          </div>

          <div className="flex gap-2">
            <button onClick={handleCreate} disabled={submitting}
              className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50 transition text-sm flex items-center gap-2">
              {submitting && <Loader2 className="animate-spin" size={16} />}
              创建
            </button>
            <button onClick={() => setFormOpen(false)} className="px-4 py-2 border border-slate-300 text-slate-600 rounded-lg hover:bg-slate-50 transition text-sm">
              取消
            </button>
          </div>
        </div>
      )}

      {/* Created key modal */}
      {createdKey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setCreatedKey(null)}>
          <div className="bg-white rounded-xl p-6 max-w-lg w-full mx-4 shadow-xl space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle2 size={20} />
                <h3 className="font-semibold">Key 创建成功</h3>
              </div>
              <button onClick={() => setCreatedKey(null)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-2">
              <p className="text-sm font-medium text-amber-800">请立即保存此 Key，关闭后将不再显示！</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-white px-3 py-2 rounded border border-amber-300 text-sm font-mono break-all select-all">
                  {createdKey.key}
                </code>
                <button onClick={() => copyToClipboard(createdKey.key)}
                  className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded transition" title="复制">
                  <Copy size={16} />
                </button>
              </div>
              <p className="text-xs text-slate-500">名称：{createdKey.name}</p>
            </div>
            <button onClick={() => setCreatedKey(null)}
              className="w-full py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition text-sm">
              我已保存
            </button>
          </div>
        </div>
      )}

      {/* Filters — 持久化筛选栏 */}
      <FilterBar
        filters={{ keyword }}
        setFilter={(key, value) => setFilter(key as any, value)}
        resetFilters={resetFilters}
        hasActiveFilters={hasActiveFilters}
        onSearch={fetchKeys}
        fields={[
          { key: 'keyword', label: '搜索', type: 'text', placeholder: '搜索 Key 名称' },
        ]}
      />

      {/* Key list */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="animate-spin" size={24} /></div>
        ) : error ? (
          <div className="flex items-center gap-2 text-red-600 bg-red-50 p-4 m-4 rounded-lg text-sm">
            <AlertCircle size={16} />
            {error}
          </div>
        ) : keys.length === 0 ? (
          <div className="py-12 text-center text-slate-400 text-sm">暂无管理 API Key</div>
        ) : keys.length === 0 ? (
          <div className="py-12 text-center text-slate-400 text-sm">未找到匹配的 Key</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 text-left">
                  <th className="px-4 py-3 text-sm font-medium text-slate-500">名称</th>
                  <th className="px-4 py-3 text-sm font-medium text-slate-500">Key 前缀</th>
                  <th className="px-4 py-3 text-sm font-medium text-slate-500">权限</th>
                  <th className="px-4 py-3 text-sm font-medium text-slate-500">状态</th>
                  <th className="px-4 py-3 text-sm font-medium text-slate-500">过期时间</th>
                  <th className="px-4 py-3 text-sm font-medium text-slate-500">上次使用</th>
                  <th className="px-4 py-3 text-sm font-medium text-slate-500">创建时间</th>
                  <th className="px-4 py-3 text-sm font-medium text-slate-500">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {keys.map(k => (
                  <React.Fragment key={k.id}>
                  <tr className={`hover:bg-slate-50 transition ${usageExampleOpen === k.id ? 'bg-indigo-50/30' : ''}`}>
                    <td className="px-4 py-3 text-sm font-medium text-slate-900">{k.name}</td>
                    <td className="px-4 py-3 text-sm font-mono text-slate-500">{k.keyPrefix}...</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {k.permissions.map(perm => (
                          <Badge key={perm} variant="outline" className="text-xs max-w-[120px] truncate">{perm}</Badge>
                        ))}
                        {k.permissions.length === 0 && <span className="text-xs text-slate-400">无</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                        k.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
                      }`}>
                        {k.status === 'active' ? '启用' : '禁用'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500">{k.expiresAt ? new Date(k.expiresAt).toLocaleString('zh-CN') : '永久'}</td>
                    <td className="px-4 py-3 text-sm text-slate-500">{k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString('zh-CN') : '从未'}</td>
                    <td className="px-4 py-3 text-sm text-slate-500 whitespace-nowrap">{new Date(k.createdAt).toLocaleString('zh-CN')}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button onClick={() => {
                          handleCopyKey(k.keyPrefix)
                        }}
                          className="flex items-center gap-1 text-xs text-slate-500 hover:text-blue-600 transition"
                          title="复制 Key 前缀">
                          <Copy size={14} />
                          复制
                        </button>
                        <button onClick={() => handleToggleStatus(k)}
                          className="flex items-center gap-1 text-xs text-slate-500 hover:text-blue-600 transition"
                          title={k.status === 'active' ? '禁用' : '启用'}>
                          {k.status === 'active' ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
                          {k.status === 'active' ? '禁用' : '启用'}
                        </button>
                        <button onClick={() => handleViewLogs(k.id)}
                          className="flex items-center gap-1 text-xs text-slate-500 hover:text-blue-600 transition">
                          <FileText size={14} />
                          日志
                        </button>
                        <button onClick={() => setUsageExampleOpen(usageExampleOpen === k.id ? null : k.id)}
                          className={`flex items-center gap-1 text-xs transition ${usageExampleOpen === k.id ? 'text-indigo-600' : 'text-slate-500 hover:text-indigo-600'}`}>
                          <Terminal size={14} />
                          示例
                        </button>
                        <button onClick={() => setDeleteConfirm(k)}
                          className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 transition">
                          <X size={14} />
                          删除
                        </button>
                      </div>
                    </td>
                  </tr>
                  {usageExampleOpen === k.id && (
                    <tr className="bg-indigo-50/30 border-b border-indigo-100">
                      <td colSpan={8} className="px-6 py-4">
                        <div className="space-y-3">
                          <div className="flex items-center gap-2 text-sm font-medium text-indigo-800">
                            <Terminal size={16} />
                            使用示例
                          </div>

                          <div className="space-y-2">
                            <p className="text-xs font-medium text-slate-500">curl 命令</p>
                            <div className="relative group">
                              <pre className="bg-slate-900 text-green-400 text-xs p-4 rounded-lg overflow-x-auto font-mono leading-relaxed">
{`# 查询用户列表（GET 请求）
curl -H "Authorization: Bearer sk-${k.keyPrefix.toLowerCase()}..." \
  ${window.location.origin}/api/v1/admin/users?page=1&pageSize=10

# 创建用户（POST 请求）
curl -X POST \
  -H "Authorization: Bearer sk-${k.keyPrefix.toLowerCase()}..." \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"******","role":"user"}' \
  ${window.location.origin}/api/v1/admin/users

# 更新模型（PATCH 请求）
curl -X PATCH \
  -H "Authorization: Bearer sk-${k.keyPrefix.toLowerCase()}..." \
  -H "Content-Type: application/json" \
  -d '{"status":"active"}' \
  ${window.location.origin}/api/v1/admin/models/1`}
                              </pre>
                              <button
                                onClick={() => {
                                  const text = `# 查询用户列表（GET 请求）
curl -H "Authorization: Bearer sk-${k.keyPrefix.toLowerCase()}..." \
  ${window.location.origin}/api/v1/admin/users?page=1&pageSize=10

# 创建用户（POST 请求）
curl -X POST \
  -H "Authorization: Bearer sk-${k.keyPrefix.toLowerCase()}..." \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"******","role":"user"}' \
  ${window.location.origin}/api/v1/admin/users

# 更新模型（PATCH 请求）
curl -X PATCH \
  -H "Authorization: Bearer sk-${k.keyPrefix.toLowerCase()}..." \
  -H "Content-Type: application/json" \
  -d '{"status":"active"}' \
  ${window.location.origin}/api/v1/admin/models/1`
                                  navigator.clipboard.writeText(text)
                                }}
                                className="absolute top-2 right-2 px-2 py-1 text-[10px] bg-slate-700 text-slate-300 rounded hover:bg-slate-600 transition opacity-0 group-hover:opacity-100"
                              >
                                复制全部
                              </button>
                            </div>
                          </div>

                          <div className="space-y-1">
                            <p className="text-xs font-medium text-slate-500">Node.js（使用 fetch）</p>
                            <pre className="bg-slate-100 text-xs p-3 rounded-lg font-mono">
{`const res = await fetch('${window.location.origin}/api/v1/admin/users', {
  headers: { 'Authorization': 'Bearer sk-${k.keyPrefix.toLowerCase()}...' }
})
const data = await res.json()`}
                            </pre>
                          </div>

                          <div className="text-xs text-slate-400 bg-indigo-50/50 p-3 rounded-lg">
                            <p className="font-medium text-indigo-600 mb-1">⚠️ 注意事项</p>
                            <ul className="list-disc pl-4 space-y-0.5">
                              <li>将 <code className="bg-indigo-100 px-1 rounded">sk-{k.keyPrefix.toLowerCase()}...</code> 替换为实际的完整 API Key</li>
                              <li>管理 API Key 仅用于服务端调用，请勿暴露到前端代码中</li>
                              <li>请将 API 地址 <code className="bg-indigo-100 px-1 rounded">{window.location.origin}</code> 替换为实际部署地址</li>
                              {k.permissions.length > 0 && (
                                <li>当前 Key 权限范围：<code className="bg-indigo-100 px-1 rounded">{k.permissions.join(', ')}</code></li>
                              )}
                            </ul>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {totalPages > 0 && (
          <PaginationBar page={page} onPageChange={(p) => setFilter('page', p)} pageSize={pageSize} onPageSizeChange={(s) => { setFilter('pageSize', s); setFilter('page', 1) }} total={total} totalPages={totalPages} />
        )}
      </div>

      {/* Usage logs drawer */}
      {logKeyId !== null && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-black/50" onClick={() => setLogKeyId(null)}>
          <div className="bg-white rounded-xl p-6 max-w-3xl w-full mx-4 shadow-xl space-y-4 max-h-[70vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                <FileText size={18} />
                Key 使用日志 (ID: {logKeyId})
              </h3>
              <button onClick={() => setLogKeyId(null)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
            </div>

            {logsLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="animate-spin" size={20} /></div>
            ) : logs.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-sm">暂无使用记录</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-slate-50 text-left">
                      <th className="px-3 py-2 text-xs font-medium text-slate-500">操作</th>
                      <th className="px-3 py-2 text-xs font-medium text-slate-500">路径</th>
                      <th className="px-3 py-2 text-xs font-medium text-slate-500">IP</th>
                      <th className="px-3 py-2 text-xs font-medium text-slate-500">结果</th>
                      <th className="px-3 py-2 text-xs font-medium text-slate-500">时间</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {logs.map(log => (
                      <tr key={log.id} className="text-sm">
                        <td className="px-3 py-2 text-slate-700">{log.action}</td>
                        <td className="px-3 py-2 text-slate-500 font-mono text-xs">{log.path || '-'}</td>
                        <td className="px-3 py-2 text-slate-500">{log.ip || '-'}</td>
                        <td className="px-3 py-2">
                          <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${log.success ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                            {log.success ? '成功' : '失败'}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{new Date(log.createdAt).toLocaleString('zh-CN')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setDeleteConfirm(null)}>
          <div className="bg-white rounded-xl p-6 max-w-sm w-full mx-4 shadow-xl space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">确认删除</h2>
              <button onClick={() => setDeleteConfirm(null)} className="text-slate-400 hover:text-slate-600 text-xl">&times;</button>
            </div>
            <p className="text-sm text-slate-600">
              确定要删除 API Key <span className="font-semibold text-slate-900">{deleteConfirm.name}</span> 吗？此操作不可撤销。
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 transition">
                取消
              </button>
              <button onClick={() => handleDelete(deleteConfirm)}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition">
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}