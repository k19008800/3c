import { memo, useMemo } from 'react'
import {
  Search, X, Download, AlertCircle, Loader2, CheckCircle2, Info,
} from 'lucide-react'
import type { AgentCommission } from '@/types'
import PaginationBar from '@/components/ui/PaginationBar'
import { STATUS_BADGE, STATUS_LABEL, TYPE_OPTIONS, STATUS_OPTIONS, fmt4 } from './types'

// ── Props ──

interface Props {
  rows: AgentCommission[]
  total: number
  page: number
  pageSize: number
  totalPages: number
  loading: boolean
  error: string
  onErrorClear: () => void
  statusFilter: string
  typeFilter: string
  startDate: string
  endDate: string
  customerSearch: string
  onStatusFilter: (v: string) => void
  onTypeFilter: (v: string) => void
  onStartDate: (v: string) => void
  onEndDate: (v: string) => void
  onCustomerSearch: (v: string) => void
  onSearch: () => void
  onReset: () => void
  onExport: () => void
  onPageChange: (p: number) => void
  onPageSizeChange: (s: number) => void
  onOpenDetail: (row: AgentCommission) => void
}

// ── Component ──

function CommissionList({
  rows, total, page, pageSize, totalPages, loading, error, onErrorClear,
  statusFilter, typeFilter, startDate, endDate, customerSearch,
  onStatusFilter, onTypeFilter, onStartDate, onEndDate, onCustomerSearch,
  onSearch, onReset, onExport, onPageChange, onPageSizeChange, onOpenDetail,
}: Props) {
  return (
    <>
      {/* ── Error banner ── */}
      {error && (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm">
          <AlertCircle size={16} />
          {error}
          <button onClick={onErrorClear} className="ml-auto p-0.5 hover:bg-red-100 rounded">
            <X size={14} />
          </button>
        </div>
      )}

      {/* ── 筛选区 ── */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
        <div className="flex flex-wrap items-end gap-3">
          {/* 状态 */}
          <div>
            <label className="block text-xs text-slate-500 mb-1">状态</label>
            <select
              value={statusFilter}
              onChange={(e) => onStatusFilter(e.target.value)}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[100px]"
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* 类型 */}
          <div>
            <label className="block text-xs text-slate-500 mb-1">类型</label>
            <select
              value={typeFilter}
              onChange={(e) => onTypeFilter(e.target.value)}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[120px]"
            >
              {TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* 日期范围 */}
          <div>
            <label className="block text-xs text-slate-500 mb-1">开始日期</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => onStartDate(e.target.value)}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">结束日期</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => onEndDate(e.target.value)}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* 客户搜索 */}
          <div>
            <label className="block text-xs text-slate-500 mb-1">客户</label>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={customerSearch}
                onChange={(e) => onCustomerSearch(e.target.value)}
                placeholder="客户昵称/邮箱"
                className="pl-8 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-44"
              />
            </div>
          </div>

          {/* 按钮 */}
          <div className="flex gap-2">
            <button
              onClick={onSearch}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition"
            >
              查询
            </button>
            <button
              onClick={onReset}
              className="px-4 py-2 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition"
            >
              重置
            </button>
            <button
              onClick={onExport}
              className="flex items-center gap-1 px-4 py-2 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition"
            >
              <Download size={14} />
              导出
            </button>
          </div>
        </div>
      </div>

      {/* ── 表格 ── */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 text-left">
                <th className="px-4 py-3 text-sm font-medium text-slate-500">ID</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">客户</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">调用成本</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">佣金金额</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">净佣金</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">类型</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">状态</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">凭证号</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">创建时间</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr><td colSpan={10} className="text-center py-16"><Loader2 className="animate-spin inline-block" size={24} /></td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={10} className="text-center py-16 text-slate-400">暂无佣金记录</td></tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50 transition">
                    <td className="px-4 py-3 text-sm text-slate-600">{r.id}</td>
                    <td className="px-4 py-3">
                      <div>
                        <p className="text-sm text-slate-800">{r.customerName || '-'}</p>
                        {r.customerEmail && <p className="text-xs text-slate-400">{r.customerEmail}</p>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">¥{fmt4(r.callCost)}</td>
                    <td className="px-4 py-3 text-sm font-medium text-green-600">¥{fmt4(r.commissionAmount)}</td>
                    <td className="px-4 py-3 text-sm text-slate-700">¥{fmt4(r.netAmount)}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{r.commissionTypeLabel || '-'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_BADGE[r.status] || 'bg-slate-100 text-slate-700'}`}>
                        {r.status === 'settled' && <CheckCircle2 size={11} />}
                        {STATUS_LABEL[r.status] || r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs font-mono text-slate-500">{r.voucherNo || '-'}</td>
                    <td className="px-4 py-3 text-sm text-slate-500 whitespace-nowrap">
                      {new Date(r.createdAt).toLocaleString('zh-CN')}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => onOpenDetail(r)}
                        className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 transition"
                      >
                        <Info size={13} />
                        详情
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {total > 0 && (
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
    </>
  )
}

export default memo(CommissionList)
