// ──────────────────────────────────────────────
//  UserActivityTab — 用户操作轨迹标签页
// ──────────────────────────────────────────────

import { useState, useMemo } from 'react'
import { get } from '@/lib/api'
import { useUserActivity, CATEGORY_OPTIONS, STATUS_OPTIONS, ACTION_OPTIONS_BY_CATEGORY } from '../hooks/useUserActivity'
import { ActivityTimeline } from '../components/ActivityTimeline'
import { Loader2, Download, Filter, ChevronLeft, ChevronRight } from 'lucide-react'

interface UserActivityTabProps {
  userId: number
  onMsg?: (msg: string) => void
}

// ── 日期快捷选择 ──

const DATE_PRESETS = [
  { label: '今天', days: 0 },
  { label: '近 7 天', days: 7 },
  { label: '近 30 天', days: 30 },
  { label: '近 90 天', days: 90 },
]

function getDateByDaysAgo(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().split('T')[0]
}

export function UserActivityTab({ userId, onMsg }: UserActivityTabProps) {
  // 筛选状态
  const [category, setCategory] = useState('')
  const [action, setAction] = useState('')
  const [status, setStatus] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [page, setPage] = useState(1)
  const pageSize = 20

  // 操作选项（根据分类动态变化）
  const actionOptions = useMemo(() => {
    if (!category || category === 'system') {
      return [{ value: '', label: '全部操作' }]
    }
    const actions = ACTION_OPTIONS_BY_CATEGORY[category] || []
    return [{ value: '', label: '全部操作' }, ...actions]
  }, [category])

  // 分类变化时重置操作
  const handleCategoryChange = (newCategory: string) => {
    setCategory(newCategory)
    setAction('')
    setPage(1)
  }

  // Hook 获取数据
  const {
    activities,
    total,
    stats,
    loading,
    error,
    refetch,
    summary,
    summaryLoading,
  } = useUserActivity({
    userId,
    category: category || undefined,
    action: action || undefined,
    status: status || undefined,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    page,
    pageSize,
  })

  // 导出 CSV
  const handleExport = async () => {
    try {
      const query = new URLSearchParams()
      if (category) query.set('category', category)
      if (action) query.set('action', action)
      if (status) query.set('status', status)
      if (startDate) query.set('startDate', startDate)
      if (endDate) query.set('endDate', endDate)

      const url = `/api/v1/admin/users/${userId}/activity/export?${query.toString()}`
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      })
      if (!res.ok) throw new Error('导出失败')
      const blob = await res.blob()
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = `user_${userId}_activity_${new Date().toISOString().slice(0, 10)}.csv`
      link.click()
      URL.revokeObjectURL(link.href)
      onMsg?.('✅ 导出成功')
    } catch (err: any) {
      onMsg?.('❌ ' + (err.message || '导出失败'))
    }
  }

  // 日期快捷选择
  const handleDatePreset = (days: number) => {
    if (days === 0) {
      const today = new Date().toISOString().split('T')[0]
      setStartDate(today)
      setEndDate(today)
    } else {
      setStartDate(getDateByDaysAgo(days))
      setEndDate(new Date().toISOString().split('T')[0])
    }
    setPage(1)
  }

  // 清空筛选
  const handleClearFilters = () => {
    setCategory('')
    setAction('')
    setStatus('')
    setStartDate('')
    setEndDate('')
    setPage(1)
  }

  // 分页
  const totalPages = Math.ceil(total / pageSize)

  return (
    <div className="space-y-4">
      {/* 统计概览 */}
      {!summaryLoading && summary && (
        <div className="grid grid-cols-4 gap-3">
          <div className="bg-white border border-slate-200 rounded-lg p-3">
            <div className="text-xs text-slate-500">总操作数</div>
            <div className="text-xl font-semibold text-slate-800">{stats?.total ?? 0}</div>
          </div>
          <div className="bg-white border border-slate-200 rounded-lg p-3">
            <div className="text-xs text-slate-500">成功</div>
            <div className="text-xl font-semibold text-green-600">{summary.byStatus.success ?? 0}</div>
          </div>
          <div className="bg-white border border-slate-200 rounded-lg p-3">
            <div className="text-xs text-slate-500">失败</div>
            <div className="text-xl font-semibold text-red-600">{summary.byStatus.failure ?? 0}</div>
          </div>
          <div className="bg-white border border-slate-200 rounded-lg p-3">
            <div className="text-xs text-slate-500">进行中</div>
            <div className="text-xl font-semibold text-yellow-600">{summary.byStatus.pending ?? 0}</div>
          </div>
        </div>
      )}

      {/* 筛选器 */}
      <div className="bg-white border border-slate-200 rounded-lg p-3">
        <div className="flex items-center gap-2 mb-2">
          <Filter size={14} className="text-slate-400" />
          <span className="text-sm font-medium text-slate-600">筛选条件</span>
          {(category || action || status || startDate || endDate) && (
            <button
              onClick={handleClearFilters}
              className="text-xs text-blue-600 hover:text-blue-800"
            >
              清空
            </button>
          )}
        </div>

        <div className="grid grid-cols-5 gap-2">
          {/* 操作分类 */}
          <select
            value={category}
            onChange={(e) => handleCategoryChange(e.target.value)}
            className="px-2 py-1.5 text-sm border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {CATEGORY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>

          {/* 操作类型 */}
          <select
            value={action}
            onChange={(e) => { setAction(e.target.value); setPage(1) }}
            className="px-2 py-1.5 text-sm border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {actionOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>

          {/* 状态 */}
          <select
            value={status}
            onChange={(e) => { setStatus(e.target.value); setPage(1) }}
            className="px-2 py-1.5 text-sm border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>

          {/* 开始日期 */}
          <input
            type="date"
            value={startDate}
            onChange={(e) => { setStartDate(e.target.value); setPage(1) }}
            className="px-2 py-1.5 text-sm border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
          />

          {/* 结束日期 */}
          <input
            type="date"
            value={endDate}
            onChange={(e) => { setEndDate(e.target.value); setPage(1) }}
            className="px-2 py-1.5 text-sm border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {/* 日期快捷选择 */}
        <div className="flex items-center gap-2 mt-2">
          <span className="text-xs text-slate-400">快捷：</span>
          {DATE_PRESETS.map((preset) => (
            <button
              key={preset.label}
              onClick={() => handleDatePreset(preset.days)}
              className="text-xs px-2 py-0.5 bg-slate-100 hover:bg-slate-200 rounded"
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* 操作列表 */}
      <div className="bg-white border border-slate-200 rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="text-sm text-slate-500">
            共 {total} 条记录
          </div>
          <button
            onClick={handleExport}
            disabled={loading || total === 0}
            className="flex items-center gap-1 px-3 py-1.5 text-sm bg-slate-100 hover:bg-slate-200 rounded-lg disabled:opacity-50"
          >
            <Download size={14} />
            导出 CSV
          </button>
        </div>

        <ActivityTimeline activities={activities} loading={loading} />

        {/* 分页 */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-4 pt-4 border-t border-slate-100">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-1.5 rounded hover:bg-slate-100 disabled:opacity-50"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm text-slate-600">
              第 {page} / {totalPages} 页
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="p-1.5 rounded hover:bg-slate-100 disabled:opacity-50"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
