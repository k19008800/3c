import { Loader2, ToggleLeft, ToggleRight, Pencil, Download } from 'lucide-react'
import PaginationBar from '@/components/ui/PaginationBar'
import type { RedemptionBatch } from '../types'
import { batchStatusMap } from '../types'

interface BatchesTabProps {
  batches: RedemptionBatch[]
  total: number
  page: number
  pageSize: number
  loading: boolean
  togglingId: number | null
  exportingId: number | null
  totalPages: number
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
  onToggleStatus: (batch: RedemptionBatch) => void
  onEdit: (batch: RedemptionBatch) => void
  onExport: (batchId: number) => void
}

export default function BatchesTab({
  batches,
  total,
  page,
  pageSize,
  loading,
  togglingId,
  exportingId,
  totalPages,
  onPageChange,
  onPageSizeChange,
  onToggleStatus,
  onEdit,
  onExport,
}: BatchesTabProps) {
  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex justify-center py-12">
        <Loader2 className="animate-spin" size={24} />
      </div>
    )
  }

  if (batches.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 py-12 text-center text-slate-400 text-sm">
        暂无批次
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-50 text-left">
              <th className="px-4 py-3 text-sm font-medium text-slate-500">批次名称</th>
              <th className="px-4 py-3 text-sm font-medium text-slate-500">面额</th>
              <th className="px-4 py-3 text-sm font-medium text-slate-500">总数/已用</th>
              <th className="px-4 py-3 text-sm font-medium text-slate-500">使用率</th>
              <th className="px-4 py-3 text-sm font-medium text-slate-500">状态</th>
              <th className="px-4 py-3 text-sm font-medium text-slate-500">过期时间</th>
              <th className="px-4 py-3 text-sm font-medium text-slate-500">创建时间</th>
              <th className="px-4 py-3 text-sm font-medium text-slate-500">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {batches.map(b => {
              const usage = b.totalCount > 0 ? ((b.usedCount / b.totalCount) * 100).toFixed(1) : '0'
              const isActive = b.status === 'active'
              const isToggling = togglingId === b.id
              const st = batchStatusMap[b.status] || batchStatusMap.active
              return (
                <tr key={b.id} className="hover:bg-slate-50 transition">
                  <td className="px-4 py-3 text-sm font-medium text-slate-900">{b.name}</td>
                  <td className="px-4 py-3 text-sm text-green-600">￥{Number(b.amount).toFixed(2)}</td>
                  <td className="px-4 py-3 text-sm text-slate-600">{b.totalCount} / {b.usedCount}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-20 h-2 bg-slate-200 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.min(100, parseFloat(usage))}%` }} />
                      </div>
                      <span className="text-xs text-slate-500">{usage}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${st.color}`}>{st.label}</span>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-500">{b.expiresAt ? new Date(b.expiresAt).toLocaleString('zh-CN') : '永不过期'}</td>
                  <td className="px-4 py-3 text-sm text-slate-500 whitespace-nowrap">{new Date(b.createdAt).toLocaleString('zh-CN')}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button onClick={() => onToggleStatus(b)} disabled={isToggling}
                        className={`flex items-center gap-1 text-xs px-2 py-1 rounded transition ${isActive ? 'text-orange-600 hover:bg-orange-50' : 'text-green-600 hover:bg-green-50'}`}>
                        {isToggling ? <Loader2 className="animate-spin" size={14} /> : isActive ? <ToggleLeft size={14} /> : <ToggleRight size={14} />}
                        {isActive ? '停用' : '启用'}
                      </button>
                      <button onClick={() => onEdit(b)}
                        className="flex items-center gap-1 text-xs px-2 py-1 rounded text-blue-600 hover:bg-blue-50 transition"><Pencil size={14} />编辑</button>
                      <button onClick={() => onExport(b.id)} disabled={exportingId === b.id}
                        className="flex items-center gap-1 text-xs px-2 py-1 rounded text-green-600 hover:bg-green-50 transition">
                        {exportingId === b.id ? <Loader2 className="animate-spin" size={14} /> : <Download size={14} />}
                        导出CSV
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {totalPages > 0 && (
        <PaginationBar page={page} onPageChange={onPageChange} pageSize={pageSize} onPageSizeChange={onPageSizeChange} total={total} totalPages={totalPages} />
      )}
    </div>
  )
}