// ── QuotaList — 配额列表表格 ──
// 包含用户信息、设置者、类型、RPM/TPM、金额、使用率、状态、周期、操作

import { useCallback, useMemo } from 'react'
import PaginationBar from '@/components/ui/PaginationBar'
import FilterBar from '@/components/ui/FilterBar'
import QuotaUsageChart from './QuotaUsageChart'
import type { QuotaRecord, QuotaEditForm } from './types'
import { Loader2, AlertCircle, Calendar } from 'lucide-react'

interface QuotaListProps {
  quotas: QuotaRecord[]
  total: number
  loading: boolean
  error: string
  page: number
  totalPages: number
  searchUserId: string
  statusFilter: string
  onSetFilter: (key: string, value: any) => void
  onResetFilters: () => void
  onHasActiveFilters: boolean
  onSearch: () => void
  onEdit: (record: QuotaRecord) => void
  onDelete: (record: QuotaRecord) => void
}

export default function QuotaList({
  quotas,
  total,
  loading,
  error,
  page,
  totalPages,
  searchUserId,
  statusFilter,
  onSetFilter,
  onResetFilters,
  onHasActiveFilters,
  onSearch,
  onEdit,
  onDelete,
}: QuotaListProps) {
  const isActive = useCallback((record: QuotaRecord) => {
    const now = new Date()
    const start = new Date(record.periodStart)
    const end = new Date(record.periodEnd)
    return now >= start && now <= end
  }, [])

  const renderedRows = useMemo(
    () =>
      quotas.map((q) => {
        const active = isActive(q)
        const alertVal = parseFloat(q.alertPercent) || 80
        const used = parseFloat(q.usedAmount || '0')
        const totalAmt = parseFloat(q.quotaAmount)
        const usage = totalAmt > 0 ? (used / totalAmt) * 100 : 0
        const exceeded = usage >= alertVal

        return (
          <tr key={q.id} className="hover:bg-slate-50 transition">
            <td className="px-4 py-3">
              <div className="text-sm font-medium text-slate-900">
                {q.userNickname || q.userEmail || `#${q.userId}`}
              </div>
              <div className="text-xs text-slate-400">ID: {q.userId}</div>
            </td>
            <td className="px-4 py-3">
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                  q.setByRole === 'admin'
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-emerald-100 text-emerald-700'
                }`}
              >
                {q.setByRole === 'admin' ? '管理员' : '代理商'}
              </span>
            </td>
            <td className="px-4 py-3 text-sm text-slate-600">
              {q.quotaType === 'monthly' ? '月度' : '一次性'}
            </td>
            <td className="px-4 py-3 text-sm text-slate-600">
              {q.rpmLimit ?? '-'}
            </td>
            <td className="px-4 py-3 text-sm text-slate-600">
              {q.tpmLimit ?? '-'}
            </td>
            <td className="px-4 py-3 text-sm font-medium text-slate-900">
              ￥{Number(q.quotaAmount).toFixed(2)}
            </td>
            <td className="px-4 py-3 text-sm text-slate-600">
              ￥{Number(q.usedAmount || 0).toFixed(2)}
            </td>
            <td className="px-4 py-3">
              <QuotaUsageChart
                usedAmount={q.usedAmount}
                quotaAmount={q.quotaAmount}
                alertPercent={q.alertPercent}
              />
            </td>
            <td className="px-4 py-3">
              <span
                className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                  active
                    ? 'bg-green-100 text-green-700'
                    : 'bg-slate-100 text-slate-500'
                }`}
              >
                {active ? '生效中' : '已过期'}
              </span>
            </td>
            <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
              <span className="flex items-center gap-1">
                <Calendar size={12} />
                {new Date(q.periodStart).toLocaleDateString('zh-CN')} ~{' '}
                {new Date(q.periodEnd).toLocaleDateString('zh-CN')}
              </span>
            </td>
            <td className="px-4 py-3">
              <button
                onClick={() => onEdit(q)}
                className="text-xs text-blue-600 hover:text-blue-800 transition"
              >
                修改
              </button>
              <button
                onClick={() => onDelete(q)}
                className="text-xs text-red-600 hover:text-red-800 transition ml-2"
              >
                删除
              </button>
            </td>
          </tr>
        )
      }),
    [quotas, isActive, onEdit, onDelete],
  )

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200">
      {/* Filters */}
      <FilterBar
        filters={{ searchUserId, status: statusFilter }}
        setFilter={(key, value) => onSetFilter(key as any, value)}
        resetFilters={onResetFilters}
        hasActiveFilters={onHasActiveFilters}
        onSearch={onSearch}
        fields={[
          {
            key: 'searchUserId',
            label: '用户 ID',
            type: 'number',
            placeholder: '用户 ID',
          },
          {
            key: 'status',
            label: '状态',
            type: 'select',
            options: [
              { value: '', label: '全部状态' },
              { value: 'active', label: '生效中' },
              { value: 'expired', label: '已过期' },
            ],
          },
        ]}
      />

      {/* Body */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="animate-spin" size={24} />
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 p-4 m-4 rounded-lg text-sm">
          <AlertCircle size={16} />
          {error}
        </div>
      ) : quotas.length === 0 ? (
        <div className="py-12 text-center text-slate-400 text-sm">
          暂无额度记录
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 text-left">
                <th className="px-4 py-3 text-sm font-medium text-slate-500">用户</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">设置者</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">类型</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">RPM</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">TPM</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">额度金额</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">已使用</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">使用率</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">状态</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">周期</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">{renderedRows}</tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {total > 0 && (
        <PaginationBar
          page={page}
          total={total}
          totalPages={totalPages}
          onPageChange={(p) => onSetFilter('page', p)}
        />
      )}
    </div>
  )
}
