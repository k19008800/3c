import { useEffect, useState, useCallback } from 'react'
import { get, patch } from '@/lib/api'
import type { AdminConfig, PaginatedData } from '@/types'
import { Loader2, AlertCircle, CheckCircle2, Edit2, Save } from 'lucide-react'
import FeatureDescription from '@/components/admin/FeatureDescription'

export default function AdminConfigs() {
  const [configs, setConfigs] = useState<AdminConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [msg, setMsg] = useState('')

  const fetchConfigs = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await get<PaginatedData<AdminConfig>>('/api/v1/admin/configs')
      setConfigs(data.list)
    } catch (err: any) {
      setError(err.message || '获取配置失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchConfigs()
  }, [fetchConfigs])

  const handleEdit = (config: AdminConfig) => {
    setEditingKey(config.key)
    setEditValue(config.value)
  }

  const handleSave = async (key: string) => {
    try {
      await patch(`/api/v1/admin/configs/${encodeURIComponent(key)}`, { value: editValue })
      setMsg(`配置 "${key}" 已更新`)
      setEditingKey(null)
      fetchConfigs()
    } catch (err: any) {
      setError(err.message || '更新配置失败')
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
      <h1 className="text-2xl font-bold text-slate-900">系统配置</h1>
      <FeatureDescription page="admin/configs" className="ml-2" />

      {msg && (
        <div className="flex items-center gap-2 text-green-700 bg-green-50 p-3 rounded-lg text-sm">
          <CheckCircle2 size={16} />
          {msg}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 text-left">
                <th className="px-4 py-3 text-sm font-medium text-slate-500">配置项</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">说明</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">值</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">更新时间</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {configs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-12 text-slate-400">
                    暂无配置数据
                  </td>
                </tr>
              ) : (
                configs.map((config) => (
                  <tr key={config.key} className="hover:bg-slate-50 transition">
                    <td className="px-4 py-3 text-sm font-mono text-slate-800">{config.key}</td>
                    <td className="px-4 py-3 text-sm text-slate-500">{config.description || '-'}</td>
                    <td className="px-4 py-3">
                      {editingKey === config.key ? (
                        config.key === 'commission_settle_mode' ? (
                          <select
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            className="w-full px-2 py-1 border border-blue-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            autoFocus
                          >
                            <option value="auto">auto - 每日自动结算</option>
                            <option value="manual">manual - 财务手动结算</option>
                          </select>
                        ) : (
                          <input
                            type="text"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            className="w-full px-2 py-1 border border-blue-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            autoFocus
                          />
                        )
                      ) : (
                        <code className="text-sm bg-slate-100 px-2 py-1 rounded">
                          {config.key === 'commission_settle_mode'
                            ? (config.value === 'auto' ? 'auto - 每日自动结算' : 'manual - 财务手动结算')
                            : config.value}
                        </code>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500">
                      {config.updatedAt ? new Date(config.updatedAt).toLocaleString('zh-CN') : '-'}
                    </td>
                    <td className="px-4 py-3">
                      {editingKey === config.key ? (
                        <button
                          onClick={() => handleSave(config.key)}
                          className="flex items-center gap-1 text-sm text-green-600 hover:text-green-800"
                        >
                          <Save size={14} />
                          保存
                        </button>
                      ) : (
                        <button
                          onClick={() => handleEdit(config)}
                          className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
                        >
                          <Edit2 size={14} />
                          编辑
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
