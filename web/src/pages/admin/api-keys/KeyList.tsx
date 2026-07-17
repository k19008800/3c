// ── KeyList — 管理 API Key 列表表格 ──
// 包含权限展示、状态切换、复制前缀、日志查看、使用示例展开、MiniChart 趋势列

import React, { useState, useCallback } from 'react'
import { Badge } from '@/components/ui/badge'
import PaginationBar from '@/components/ui/PaginationBar'
import MiniChart, { type MiniChartDataPoint } from '@/components/ui/MiniChart'
import {
  Loader2, AlertCircle, Copy, ToggleRight, ToggleLeft,
  FileText, Terminal, X,
} from 'lucide-react'
import UsageExampleRow from './UsageExampleRow'

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

interface KeyListProps {
  keys: AdminApiKeyItem[]
  total: number
  loading: boolean
  error: string
  page: number
  pageSize: number
  totalPages: number
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
  onRefresh: () => void
  onToggleStatus: (key: AdminApiKeyItem) => void
  onViewLogs: (keyId: number) => void
  onDelete: (key: AdminApiKeyItem) => void
  trends: Record<number, MiniChartDataPoint[]>
  trendsLoading: boolean
}

export default function KeyList({
  keys, total, loading, error, page, pageSize, totalPages,
  onPageChange, onPageSizeChange, onToggleStatus, onViewLogs, onDelete,
  trends, trendsLoading,
}: KeyListProps) {
  const [usageExampleOpen, setUsageExampleOpen] = useState<number | null>(null)

  const handleCopyKey = useCallback((keyPrefix: string) => {
    navigator.clipboard.writeText(`sk-${keyPrefix.toLowerCase()}****`).then(() => {
      alert('Key 前缀已复制到剪贴板（仅前缀，完整 Key 需在创建时保存）')
    })
  }, [])

  const colSpan = 9

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        <div className="flex justify-center py-12">
          <Loader2 className="animate-spin" size={24} />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        <div className="flex items-center gap-2 text-red-600 bg-red-50 p-4 m-4 rounded-lg text-sm">
          <AlertCircle size={16} />
          {error}
        </div>
      </div>
    )
  }

  if (keys.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        <div className="py-12 text-center text-slate-400 text-sm">暂无管理 API Key</div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200">
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
              <th className="px-4 py-3 text-sm font-medium text-slate-500">调用趋势</th>
              <th className="px-4 py-3 text-sm font-medium text-slate-500">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {keys.map((k) => (
              <React.Fragment key={k.id}>
                <tr className={`hover:bg-slate-50 transition ${usageExampleOpen === k.id ? 'bg-indigo-50/30' : ''}`}>
                  <td className="px-4 py-3 text-sm font-medium text-slate-900 whitespace-nowrap">{k.name}</td>
                  <td className="px-4 py-3 text-sm font-mono text-slate-500">{k.keyPrefix}...</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1 max-w-[180px]">
                      {k.permissions.map((perm) => (
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
                  <td className="px-4 py-3 text-sm text-slate-500 whitespace-nowrap">
                    {k.expiresAt ? new Date(k.expiresAt).toLocaleString('zh-CN') : '永久'}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-500 whitespace-nowrap">
                    {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString('zh-CN') : '从未'}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-500 whitespace-nowrap">
                    {new Date(k.createdAt).toLocaleString('zh-CN')}
                  </td>
                  <td className="px-4 py-3">
                    {trendsLoading ? (
                      <div className="w-[80px] h-[28px] bg-slate-100 rounded animate-pulse" />
                    ) : trends[k.id] ? (
                      <MiniChart data={trends[k.id]} width={80} height={28} color="#3b82f6" gradient />
                    ) : (
                      <span className="text-xs text-slate-300">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button onClick={() => handleCopyKey(k.keyPrefix)}
                        className="flex items-center gap-1 text-xs text-slate-500 hover:text-blue-600 transition" title="复制 Key 前缀">
                        <Copy size={14} /> 复制
                      </button>
                      <button onClick={() => onToggleStatus(k)}
                        className="flex items-center gap-1 text-xs text-slate-500 hover:text-blue-600 transition"
                        title={k.status === 'active' ? '禁用' : '启用'}>
                        {k.status === 'active' ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
                        {k.status === 'active' ? '禁用' : '启用'}
                      </button>
                      <button onClick={() => onViewLogs(k.id)}
                        className="flex items-center gap-1 text-xs text-slate-500 hover:text-blue-600 transition">
                        <FileText size={14} /> 日志
                      </button>
                      <button onClick={() => setUsageExampleOpen(usageExampleOpen === k.id ? null : k.id)}
                        className={`flex items-center gap-1 text-xs transition ${usageExampleOpen === k.id ? 'text-indigo-600' : 'text-slate-500 hover:text-indigo-600'}`}>
                        <Terminal size={14} /> 示例
                      </button>
                      <button onClick={() => onDelete(k)}
                        className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 transition">
                        <X size={14} /> 删除
                      </button>
                    </div>
                  </td>
                </tr>
                {usageExampleOpen === k.id && (
                  <UsageExampleRow keyItem={k} onClose={() => setUsageExampleOpen(null)} />
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 0 && (
        <PaginationBar
          page={page}
          onPageChange={onPageChange}
          pageSize={pageSize}
          onPageSizeChange={onPageSizeChange}
          total={total}
          totalPages={totalPages}
        />
      )}
    </div>
  )
}
