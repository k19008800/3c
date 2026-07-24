import { Loader2, Search, X } from 'lucide-react'
import PaginationBar from '@/components/ui/PaginationBar'
import type { AdminRedemptionLog } from '../types'

interface LogsTabProps {
  logs: AdminRedemptionLog[]
  total: number
  page: number
  pageSize: number
  loading: boolean
  filter: {
    email: string
    batchId: string
    startDate: string
    endDate: string
    code: string
  }
  totalPages: number
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
  onFilterChange: (filter: any) => void
  onApplyFilter: () => void
  onResetFilter: () => void
}

export default function LogsTab({
  logs,
  total,
  page,
  pageSize,
  loading,
  filter,
  totalPages,
  onPageChange,
  onPageSizeChange,
  onFilterChange,
  onApplyFilter,
  onResetFilter,
}: LogsTabProps) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 space-y-4">
      <div className="p-4 border-b border-slate-100">
        <div className="flex flex-wrap items-end gap-3">
          {([
            { key: 'email', label: '邮箱', placeholder: '搜索用户邮箱', w: 'w-44' },
            { key: 'batchId', label: '批次ID', placeholder: '批次ID', w: 'w-28' },
          ] as const).map(({ key, label, placeholder, w }) => (
            <div key={key}>
              <label className="block text-xs text-slate-500 mb-1">{label}</label>
              <input
                type={key === 'batchId' ? 'number' : 'text'}
                value={(filter as any)[key]}
                onChange={(e) => onFilterChange({ ...filter, [key]: e.target.value })}
                placeholder={placeholder}
                className={`px-3 py-1.5 border border-slate-300 rounded-lg text-sm ${w} focus:outline-none focus:ring-2 focus:ring-purple-500`}
              />
            </div>
          ))}
          <div>
            <label className="block text-xs text-slate-500 mb-1">起始日期</label>
            <input
              type="datetime-local"
              value={filter.startDate}
              onChange={(e) => onFilterChange({ ...filter, startDate: e.target.value })}
              className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">结束日期</label>
            <input
              type="datetime-local"
              value={filter.endDate}
              onChange={(e) => onFilterChange({ ...filter, endDate: e.target.value })}
              className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">兑换码</label>
            <input
              type="text"
              value={filter.code}
              onChange={(e) => onFilterChange({ ...filter, code: e.target.value })}
              placeholder="兑换码（模糊搜索）"
              className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm w-40 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={onApplyFilter}
              className="flex items-center gap-1 px-3 py-1.5 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700 transition"
            >
              <Search size={14} />筛选
            </button>
            <button
              onClick={onResetFilter}
              className="flex items-center gap-1 px-3 py-1.5 border border-slate-300 text-slate-600 rounded-lg text-sm hover:bg-slate-50 transition"
            >
              <X size={14} />重置
            </button>
          </div>
        </div>
      </div>
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="animate-spin" size={24} /></div>
      ) : logs.length === 0 ? (
        <div className="py-12 text-center text-slate-400 text-sm">暂无兑换流水</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 text-left">
                <th className="px-4 py-3 text-sm font-medium text-slate-500">兑换码</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">面额</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">用户ID</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">邮箱</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">昵称</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">IP</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">批次</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">时间</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {logs.map(log => (
                <tr key={log.id} className="hover:bg-slate-50 transition">
                  <td className="px-4 py-3 text-sm font-mono text-slate-700">{log.code}</td>
                  <td className="px-4 py-3 text-sm text-green-600">￥{Number(log.amount).toFixed(2)}</td>
                  <td className="px-4 py-3 text-sm text-slate-600">{log.userId}</td>
                  <td className="px-4 py-3 text-sm text-slate-600">{log.email || '-'}</td>
                  <td className="px-4 py-3 text-sm text-slate-600">{log.nickname || '-'}</td>
                  <td className="px-4 py-3 text-sm text-slate-500">{log.ip || '-'}</td>
                  <td className="px-4 py-3 text-sm text-slate-600">{log.batchName || String(log.batchId)}</td>
                  <td className="px-4 py-3 text-sm text-slate-500 whitespace-nowrap">{new Date(log.createdAt).toLocaleString('zh-CN')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {totalPages > 0 && (
        <PaginationBar page={page} onPageChange={onPageChange} pageSize={pageSize} onPageSizeChange={onPageSizeChange} total={total} totalPages={totalPages} />
      )}
    </div>
  )
}