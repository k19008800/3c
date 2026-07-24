import { Loader2, Search, X } from 'lucide-react'
import PaginationBar from '@/components/ui/PaginationBar'
import type { AuditLogItem } from '../types'

interface AuditLogsTabProps {
  auditLogs: AuditLogItem[]
  auditLogsTotal: number
  auditLogsPage: number
  auditLogsPageSize: number
  auditLogsLoading: boolean
  auditLogsTotalPages: number
  auditLogsFilter: {
    startDate: string
    endDate: string
  }
  onAuditLogsPageChange: (page: number) => void
  onAuditLogsPageSizeChange: (size: number) => void
  onAuditLogsFilterChange: (key: string, value: string) => void
  onApplyAuditLogsFilter: () => void
  onResetAuditLogsFilter: () => void
}

export default function AuditLogsTab({
  auditLogs,
  auditLogsTotal,
  auditLogsPage,
  auditLogsPageSize,
  auditLogsLoading,
  auditLogsTotalPages,
  auditLogsFilter,
  onAuditLogsPageChange,
  onAuditLogsPageSizeChange,
  onAuditLogsFilterChange,
  onApplyAuditLogsFilter,
  onResetAuditLogsFilter,
}: AuditLogsTabProps) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 space-y-4">
      <div className="p-4 border-b border-slate-100">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs text-slate-500 mb-1">起始日期</label>
            <input 
              type="datetime-local" 
              value={auditLogsFilter.startDate}
              onChange={(e) => onAuditLogsFilterChange('startDate', e.target.value)}
              className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" 
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">结束日期</label>
            <input 
              type="datetime-local" 
              value={auditLogsFilter.endDate}
              onChange={(e) => onAuditLogsFilterChange('endDate', e.target.value)}
              className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" 
            />
          </div>
          <div className="flex gap-2">
            <button 
              onClick={onApplyAuditLogsFilter}
              className="flex items-center gap-1 px-3 py-1.5 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700 transition"
            >
              <Search size={14} />筛选
            </button>
            <button 
              onClick={onResetAuditLogsFilter}
              className="flex items-center gap-1 px-3 py-1.5 border border-slate-300 text-slate-600 rounded-lg text-sm hover:bg-slate-50 transition"
            >
              <X size={14} />重置
            </button>
          </div>
        </div>
      </div>
      {auditLogsLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="animate-spin" size={24} /></div>
      ) : auditLogs.length === 0 ? (
        <div className="py-12 text-center text-slate-400 text-sm">暂无审计日志</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 text-left">
                <th className="px-4 py-3 text-sm font-medium text-slate-500">时间</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">操作人</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">操作类型</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">目标类型</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">详情</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {auditLogs.map(log => (
                <tr key={log.id} className="hover:bg-slate-50 transition">
                  <td className="px-4 py-3 text-sm text-slate-500 whitespace-nowrap">
                    {new Date(log.createdAt).toLocaleString('zh-CN')}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700">{log.operator}</td>
                  <td className="px-4 py-3 text-sm text-slate-600">{log.action}</td>
                  <td className="px-4 py-3 text-sm text-slate-600">{log.targetType}</td>
                  <td className="px-4 py-3 text-sm text-slate-500 max-w-[300px] truncate" title={log.detail}>
                    {log.detail}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {auditLogsTotalPages > 0 && (
        <PaginationBar 
          page={auditLogsPage} 
          onPageChange={onAuditLogsPageChange} 
          pageSize={auditLogsPageSize} 
          onPageSizeChange={onAuditLogsPageSizeChange} 
          total={auditLogsTotal} 
          totalPages={auditLogsTotalPages} 
        />
      )}
    </div>
  )
}