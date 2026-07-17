// ──────────────────────────────────────────────
//  ReviewList — 审核列表表格（含筛选、批量操作、分页）
// ──────────────────────────────────────────────

import { Loader2, Eye, CheckSquare } from 'lucide-react'
import PaginationBar from '@/components/ui/PaginationBar'
import FilterBar from '@/components/ui/FilterBar'
import { STATUS_TABS, STATUS_LABEL, USER_TYPE_LABEL, REJECT_REASONS } from './types'
import type { ReviewListProps } from './types'

export default function ReviewList({
  records, loading, total, page, pageSize, totalPages,
  activeTab, batchMode, selectedIds, batchRejectReason, batchReviewing,
  selectAllRef, onToggleSelect, onToggleSelectAll,
  onViewDetail, onPageChange, onPageSizeChange,
  onBatchApprove, onBatchReject, onBatchRejectReasonChange,
}: ReviewListProps) {
  if (loading && records.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
        <Loader2 className="animate-spin inline-block text-slate-400" size={24} />
      </div>
    )
  }

  const colSpan = batchMode ? 13 : 12

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      {/* Batch action bar */}
      {batchMode && selectedIds.size > 0 && (
        <div className="border-b border-blue-200 bg-blue-50/50 p-4 space-y-3">
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-600">
              已选 <strong>{selectedIds.size}</strong> 条
            </span>
            <button
              onClick={onBatchApprove}
              disabled={batchReviewing}
              className="flex items-center gap-1 px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 transition disabled:opacity-50"
            >
              <CheckSquare size={16} /> 批量通过
            </button>
            <button
              onClick={onBatchReject}
              disabled={batchReviewing}
              className="flex items-center gap-1 px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 transition disabled:opacity-50"
            >
              <CheckSquare size={16} /> 批量拒绝
            </button>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">拒绝原因（批量拒绝时填写）</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {REJECT_REASONS.map((reason) => (
                <button
                  key={reason}
                  type="button"
                  onClick={() => onBatchRejectReasonChange(reason)}
                  className={`text-xs px-2 py-1 rounded border transition ${
                    batchRejectReason === reason
                      ? 'border-red-400 bg-red-50 text-red-700'
                      : 'border-slate-200 text-slate-500 hover:border-red-300 hover:text-red-600'
                  }`}
                >
                  {reason.length > 12 ? reason.slice(0, 12) + '…' : reason}
                </button>
              ))}
            </div>
            <textarea
              value={batchRejectReason}
              onChange={e => onBatchRejectReasonChange(e.target.value)}
              placeholder="输入拒绝原因（批量拒绝时必填），用户将收到此信息"
              rows={2}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-50 text-left">
              {batchMode && (
                <th className="px-4 py-3 w-10">
                  <input
                    type="checkbox"
                    ref={selectAllRef}
                    checked={records.length > 0 && selectedIds.size === records.length}
                    onChange={onToggleSelectAll}
                    className="rounded border-slate-300"
                  />
                </th>
              )}
              <th className="px-4 py-3 text-sm font-medium text-slate-500">ID</th>
              <th className="px-4 py-3 text-sm font-medium text-slate-500">用户ID</th>
              <th className="px-4 py-3 text-sm font-medium text-slate-500">邮箱</th>
              <th className="px-4 py-3 text-sm font-medium text-slate-500">昵称</th>
              <th className="px-4 py-3 text-sm font-medium text-slate-500">类型</th>
              <th className="px-4 py-3 text-sm font-medium text-slate-500">真实姓名</th>
              <th className="px-4 py-3 text-sm font-medium text-slate-500">身份证号</th>
              <th className="px-4 py-3 text-sm font-medium text-slate-500">企业名</th>
              <th className="px-4 py-3 text-sm font-medium text-slate-500">版本</th>
              <th className="px-4 py-3 text-sm font-medium text-slate-500">状态</th>
              <th className="px-4 py-3 text-sm font-medium text-slate-500">提交时间</th>
              <th className="px-4 py-3 text-sm font-medium text-slate-500">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {records.length === 0 ? (
              <tr>
                <td colSpan={colSpan} className="text-center py-12 text-slate-400">
                  暂无记录
                </td>
              </tr>
            ) : (
              records.map(r => (
                <tr key={r.id} className={`hover:bg-slate-50 transition ${selectedIds.has(r.id) ? 'bg-blue-50' : ''}`}>
                  {batchMode && (
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(r.id)}
                        onChange={() => onToggleSelect(r.id)}
                        className="rounded border-slate-300"
                      />
                    </td>
                  )}
                  <td className="px-4 py-3 text-sm text-slate-500">{r.id}</td>
                  <td className="px-4 py-3 text-sm text-slate-600">{r.userId}</td>
                  <td className="px-4 py-3 text-sm text-slate-900">{r.email}</td>
                  <td className="px-4 py-3 text-sm text-slate-600">{r.nickname || '-'}</td>
                  <td className="px-4 py-3 text-xs">{USER_TYPE_LABEL[r.userType] || r.userType}</td>
                  <td className="px-4 py-3 text-sm text-slate-700">{r.realName || '-'}</td>
                  <td className="px-4 py-3 text-sm font-mono text-slate-600">
                    {r.idNumber ? r.idNumber.substring(0, 6) + '********' + r.idNumber.substring(14) : '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">{r.companyName || '-'}</td>
                  <td className="px-4 py-3 text-sm text-slate-400">v{r.version}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                      STATUS_TABS.find(t => t.key === r.status)?.color || 'bg-slate-100 text-slate-700'
                    }`}>
                      {STATUS_LABEL[r.status] || r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-500 whitespace-nowrap">
                    {r.createdAt ? new Date(r.createdAt).toLocaleString('zh-CN') : '-'}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => onViewDetail(r)}
                      className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
                    >
                      <Eye size={14} /> {activeTab === 'pending_review' ? '审核' : '详情'}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {total > 0 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 bg-slate-50">
          <PaginationBar
            page={page}
            onPageChange={onPageChange}
            pageSize={pageSize}
            onPageSizeChange={onPageSizeChange}
            total={total}
            totalPages={totalPages}
          />
        </div>
      )}
    </div>
  )
}
