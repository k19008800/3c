import { useEffect, useState, useCallback } from 'react'
import { get } from '@/lib/api'
import type { AuditLog, AuditLogDetail, PaginatedData } from '@/types'
import PaginationBar from '@/components/ui/PaginationBar'
import { TableSkeleton } from '@/components/ui/skeleton'
import FeatureDescription from '@/components/admin/FeatureDescription'
import {
  Loader2,
  AlertCircle,
  Search,
  RefreshCw,
  Eye,
  X,
  Download,
} from 'lucide-react'

// ── 操作类型选项 ──

const ACTION_OPTIONS = [
  { value: '', label: '全部操作' },
  // 用户
  { value: 'user_create', label: '创建用户' },
  { value: 'user_disable', label: '禁用用户' },
  { value: 'user_enable', label: '启用用户' },
  { value: 'user_update', label: '编辑用户' },
  { value: 'user_password_reset', label: '重置密码' },
  { value: 'user_impersonate', label: '模拟登录' },
  // 资金
  { value: 'balance_adjust', label: '调整余额' },
  { value: 'recharge_confirm', label: '确认充值' },
  { value: 'recharge_first_confirm', label: '充值一级确认' },
  { value: 'recharge_second_confirm', label: '充值二级确认' },
  { value: 'order_cancel', label: '取消订单' },
  // 提现
  { value: 'withdraw_first_approve', label: '提现初审' },
  { value: 'withdraw_second_approve', label: '提现复审' },
  { value: 'withdraw_approve', label: '提现审批' },
  { value: 'withdraw_reject', label: '提现驳回' },
  { value: 'withdraw_paid', label: '提现打款' },
  // 审核
  { value: 'real_name_approve', label: '通过实名' },
  { value: 'real_name_reject', label: '驳回实名' },
  { value: 'role_change', label: '变更角色' },
  // 资源
  { value: 'vendor_create', label: '创建厂商' },
  { value: 'vendor_update', label: '编辑厂商' },
  { value: 'model_create', label: '创建模型' },
  { value: 'model_update', label: '编辑模型' },
  { value: 'config_update', label: '修改系统配置' },
  { value: 'agent_create', label: '创建代理商' },
  { value: 'agent_update', label: '编辑代理商' },
  { value: 'system_maintenance', label: '系统维护' },
]

const TARGET_TYPE_OPTIONS = [
  { value: '', label: '全部对象' },
  { value: 'user', label: '用户' },
  { value: 'vendor', label: '厂商' },
  { value: 'model', label: '模型' },
  { value: 'order', label: '订单' },
  { value: 'config', label: '系统配置' },
  { value: 'agent', label: '代理商' },
  { value: 'api_key', label: 'API Key' },
]

// ── 操作类型颜色标签 ──

const ACTION_COLORS: Record<string, string> = {
  // 红色 — 管控类
  user_disable: 'bg-red-100 text-red-700',
  user_enable: 'bg-red-100 text-red-700',
  user_password_reset: 'bg-red-100 text-red-700',
  user_impersonate: 'bg-red-100 text-red-700',
  // 橙色 — 资金类
  balance_adjust: 'bg-orange-100 text-orange-700',
  recharge_confirm: 'bg-orange-100 text-orange-700',
  recharge_first_confirm: 'bg-orange-100 text-orange-700',
  recharge_second_confirm: 'bg-orange-100 text-orange-700',
  order_cancel: 'bg-orange-100 text-orange-700',
  withdraw_approve: 'bg-orange-100 text-orange-700',
  withdraw_first_approve: 'bg-orange-100 text-orange-700',
  withdraw_second_approve: 'bg-orange-100 text-orange-700',
  withdraw_reject: 'bg-orange-100 text-orange-700',
  withdraw_paid: 'bg-orange-100 text-orange-700',
  // 绿色 — 审核类
  real_name_approve: 'bg-emerald-100 text-emerald-700',
  real_name_reject: 'bg-emerald-100 text-emerald-700',
  role_change: 'bg-emerald-100 text-emerald-700',
  // 蓝色 — 配置类
  vendor_create: 'bg-blue-100 text-blue-700',
  vendor_update: 'bg-blue-100 text-blue-700',
  model_create: 'bg-blue-100 text-blue-700',
  model_update: 'bg-blue-100 text-blue-700',
  config_update: 'bg-blue-100 text-blue-700',
  agent_create: 'bg-blue-100 text-blue-700',
  agent_update: 'bg-blue-100 text-blue-700',
  system_maintenance: 'bg-blue-100 text-blue-700',
}

function ActionBadge({ action }: { action: string }) {
  const color = ACTION_COLORS[action] || 'bg-slate-100 text-slate-700'
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>
      {action}
    </span>
  )
}

// ── 详情弹窗：展示变更 Diff ──

function DetailDialog({
  log,
  onClose,
}: {
  log: AuditLogDetail | null
  onClose: () => void
}) {
  const [loading, setLoading] = useState(false)
  const [detail, setDetail] = useState<AuditLogDetail | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!log) return
    setLoading(true)
    setError('')
    get<AuditLogDetail>(`/api/v1/admin/audit-logs/${log.id}`)
      .then(setDetail)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [log])

  if (!log) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">操作详情</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-100 transition">
            <X size={20} className="text-slate-500" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="animate-spin" size={28} />
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 text-red-600 bg-red-50 p-4 m-6 rounded-lg text-sm">
            <AlertCircle size={16} />
            {error}
          </div>
        ) : detail ? (
          <div className="p-6 space-y-5">
            {/* Meta grid */}
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-slate-400">操作人</span>
                <p className="text-slate-900 font-medium mt-0.5">
                  {detail.operatorNickname || detail.operatorEmail || `#${detail.operatorId}`}
                  <span className="text-slate-400 font-normal ml-2">
                    ({detail.operatorEmail || '-'})
                  </span>
                </p>
              </div>
              <div>
                <span className="text-slate-400">操作类型</span>
                <p className="mt-0.5">
                  <ActionBadge action={detail.actionLabel} />
                </p>
              </div>
              <div>
                <span className="text-slate-400">操作对象</span>
                <p className="text-slate-900 font-medium mt-0.5">
                  {detail.targetTypeLabel}
                  {detail.targetId ? ` #${detail.targetId}` : ''}
                  {detail.targetName ? (
                    <span className="text-slate-500 font-normal ml-1">({detail.targetName})</span>
                  ) : null}
                </p>
              </div>
              <div>
                <span className="text-slate-400">IP 地址</span>
                <p className="text-slate-900 font-mono text-xs mt-0.5">{detail.ip || '-'}</p>
              </div>
              <div className="col-span-2">
                <span className="text-slate-400">操作时间</span>
                <p className="text-slate-900 mt-0.5">
                  {new Date(detail.createdAt).toLocaleString('zh-CN', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })}
                </p>
              </div>
              {detail.description && (
                <div className="col-span-2">
                  <span className="text-slate-400">操作描述</span>
                  <p className="text-slate-900 mt-0.5">{detail.description}</p>
                </div>
              )}
            </div>

            {/* Diff section */}
            {(detail.before || detail.after) && (
              <div>
                <h3 className="text-sm font-medium text-slate-700 mb-3">变更内容</h3>
                <DiffViewer before={detail.before} after={detail.after} />
              </div>
            )}
          </div>
        ) : null}

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Diff 展示组件 ──

function DiffViewer({ before, after }: { before: any; after: any }) {
  if (!before && !after) return <p className="text-sm text-slate-400">无变更数据</p>

  const beforeObj = typeof before === 'object' && before !== null ? before : {}
  const afterObj = typeof after === 'object' && after !== null ? after : {}

  const allKeys = [...new Set([...Object.keys(beforeObj), ...Object.keys(afterObj)])].sort()

  if (allKeys.length === 0) {
    // 非对象：直接显示 JSON
    return (
      <div className="space-y-2">
        {before != null && (
          <div className="flex">
            <span className="shrink-0 w-12 text-xs font-medium text-red-500">变更前</span>
            <code className="text-xs bg-red-50 text-red-700 px-2 py-1 rounded flex-1 break-all">
              {typeof before === 'string' ? before : JSON.stringify(before)}
            </code>
          </div>
        )}
        {after != null && (
          <div className="flex">
            <span className="shrink-0 w-12 text-xs font-medium text-emerald-500">变更后</span>
            <code className="text-xs bg-emerald-50 text-emerald-700 px-2 py-1 rounded flex-1 break-all">
              {typeof after === 'string' ? after : JSON.stringify(after)}
            </code>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-slate-200 overflow-hidden text-sm">
      <table className="w-full">
        <thead>
          <tr className="bg-slate-50 text-left text-xs text-slate-500">
            <th className="px-3 py-2 font-medium">字段</th>
            <th className="px-3 py-2 font-medium">变更前</th>
            <th className="px-3 py-2 font-medium">变更后</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {allKeys.map((key) => {
            const beforeVal = JSON.stringify(beforeObj[key] ?? '__NULL__')
            const afterVal = JSON.stringify(afterObj[key] ?? '__NULL__')
            // 过滤未变化的内部字段
            if (beforeVal === afterVal && !['updatedAt', 'createdAt'].includes(key)) return null
            const changed = beforeVal !== afterVal

            return (
              <tr key={key} className={changed ? 'bg-yellow-50/40' : ''}>
                <td className="px-3 py-2 text-xs font-mono text-slate-600 w-28">{key}</td>
                <td className="px-3 py-2">
                  {beforeObj[key] != null ? (
                    <code className="text-xs bg-red-50 text-red-600 px-1.5 py-0.5 rounded break-all inline-block max-w-[200px]">
                      {beforeVal === '__NULL__' ? <span className="text-slate-300 italic">null</span> : beforeVal}
                    </code>
                  ) : (
                    <span className="text-slate-300 text-xs italic">-</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {afterObj[key] != null ? (
                    <code className="text-xs bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded break-all inline-block max-w-[200px]">
                      {afterVal === '__NULL__' ? <span className="text-slate-300 italic">null</span> : afterVal}
                    </code>
                  ) : (
                    <span className="text-slate-300 text-xs italic">-</span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── 操作人搜索（提供最近操作人快速选择）──

function OperatorFilter({
  value,
  onChange,
}: {
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="relative">
      <label className="block text-xs text-slate-500 mb-1">操作人</label>
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="邮箱或昵称"
          className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
    </div>
  )
}

// ── 主组件 ──

export default function AdminAuditLogs() {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Filters
  const [keyword, setKeyword] = useState('')
  const [actionFilter, setActionFilter] = useState('')
  const [targetTypeFilter, setTargetTypeFilter] = useState('')
  const [operatorKeyword, setOperatorKeyword] = useState('')
  const [targetIdFilter, setTargetIdFilter] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  // Detail
  const [detailLog, setDetailLog] = useState<AuditLog | null>(null)

  const totalPages = Math.ceil(total / pageSize)

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params: any = { page, pageSize }
      if (keyword) params.keyword = keyword
      if (actionFilter) params.action = actionFilter
      if (targetTypeFilter) params.targetType = targetTypeFilter
      if (targetIdFilter) params.targetId = targetIdFilter
      if (startDate) params.startDate = startDate
      if (endDate) params.endDate = endDate
      // 操作人搜索复用 keyword 传给后端（覆盖 keyword 时合并搜索）
      if (operatorKeyword) {
        params.keyword = operatorKeyword
      } else if (keyword) {
        params.keyword = keyword
      }
      const data = await get<PaginatedData<AuditLog>>('/api/v1/admin/audit-logs', params)
      setLogs(data.list)
      setTotal(data.total)
    } catch (err: any) {
      setError(err.message || '获取审计日志失败')
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, keyword, actionFilter, targetTypeFilter, targetIdFilter, operatorKeyword, startDate, endDate])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  const resetFilters = () => {
    setKeyword('')
    setActionFilter('')
    setTargetTypeFilter('')
    setTargetIdFilter('')
    setOperatorKeyword('')
    setStartDate('')
    setEndDate('')
    setPage(1)
  }

  const openDetail = async (log: AuditLog) => {
    setDetailLog(log)
  }

  const closeDetail = () => {
    setDetailLog(null)
  }

  // 操作人快速筛选
  const filterByOperator = (email: string | null) => {
    setOperatorKeyword(email || '')
    setPage(1)
  }

  // CSV 导出
  const exportCsv = () => {
    const params = new URLSearchParams()
    if (keyword) params.set('keyword', keyword)
    if (actionFilter) params.set('action', actionFilter)
    if (targetTypeFilter) params.set('targetType', targetTypeFilter)
    if (targetIdFilter) params.set('targetId', targetIdFilter)
    if (startDate) params.set('startDate', startDate)
    if (endDate) params.set('endDate', endDate)
    if (operatorKeyword) params.set('keyword', operatorKeyword)

    const token = localStorage.getItem('accessToken')
    const url = `/api/v1/admin/audit-logs/export?${params.toString()}`

    // 用 fetch 下载（通过 Authorization header）
    fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((res) => res.blob())
      .then((blob) => {
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`
        a.click()
        URL.revokeObjectURL(a.href)
      })
      .catch((err) => console.error('导出失败:', err))
  }

  const onPageChange = (p: number) => {
    setPage(p)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">审计日志</h1>
        <FeatureDescription page="admin/audit-logs" className="ml-2" />
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-500">共 {total} 条记录</span>
          <button
            onClick={exportCsv}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition"
          >
            <Download size={14} />
            导出 CSV
          </button>
          <button
            onClick={() => { setPage(1); fetchLogs() }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition"
          >
            <RefreshCw size={14} />
            刷新
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
        <div className="flex flex-wrap gap-4 items-end">
          {/* 关键词搜索 */}
          <div className="flex-1 min-w-[160px]">
            <label className="block text-xs text-slate-500 mb-1">关键词</label>
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={keyword}
                onChange={(e) => { setKeyword(e.target.value); setPage(1) }}
                onKeyDown={e => e.key === 'Enter' && fetchLogs()}
                placeholder="搜索描述/操作人"
                className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* 操作类型 */}
          <div>
            <label className="block text-xs text-slate-500 mb-1">操作类型</label>
            <select
              value={actionFilter}
              onChange={(e) => { setActionFilter(e.target.value); setPage(1) }}
              className="w-44 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {ACTION_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* 对象类型 */}
          <div>
            <label className="block text-xs text-slate-500 mb-1">对象类型</label>
            <select
              value={targetTypeFilter}
              onChange={(e) => { setTargetTypeFilter(e.target.value); setPage(1) }}
              className="w-36 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {TARGET_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* 对象 ID */}
          <div>
            <label className="block text-xs text-slate-500 mb-1">对象 ID</label>
            <input
              type="number"
              value={targetIdFilter}
              onChange={(e) => { setTargetIdFilter(e.target.value); setPage(1) }}
              placeholder="输入 ID"
              className="w-24 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* 日期区间 */}
          <div>
            <label className="block text-xs text-slate-500 mb-1">开始日期</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => { setStartDate(e.target.value); setPage(1) }}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">结束日期</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => { setEndDate(e.target.value); setPage(1) }}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <button
            onClick={resetFilters}
            className="px-3 py-2 text-sm text-slate-500 hover:text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 transition"
          >
            重置
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 text-left">
                <th className="px-4 py-3 text-sm font-medium text-slate-500 whitespace-nowrap">操作时间</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500 whitespace-nowrap">操作人</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500 whitespace-nowrap">操作类型</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500 whitespace-nowrap">操作对象</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500 whitespace-nowrap">变更摘要</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500 whitespace-nowrap">IP</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500 whitespace-nowrap">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <TableSkeleton rows={5} cols={7} />
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-slate-400">
                    暂无审计日志
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50 transition">
                    <td className="px-4 py-3 text-sm text-slate-500 whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString('zh-CN')}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700 max-w-[160px]">
                      <button
                        onClick={() => filterByOperator(log.operatorEmail)}
                        title={`筛选: ${log.operatorEmail || ''}`}
                        className="hover:text-blue-600 hover:underline transition truncate block max-w-full"
                      >
                        {log.operatorNickname || log.operatorEmail || `#${log.operatorId}`}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <ActionBadge action={log.actionLabel} />
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600 max-w-[180px] truncate">
                      {log.targetTypeLabel}
                      {log.targetId != null ? ` #${log.targetId}` : ''}
                      {log.targetName ? (
                        <span className="text-slate-400 ml-1">({log.targetName})</span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500 max-w-[220px] truncate" title={log.description || undefined}>
                      {log.description || '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-400 font-mono text-xs">{log.ip || '-'}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => openDetail(log)}
                        className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 transition"
                      >
                        <Eye size={14} />
                        查看变更
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
          <PaginationBar
            page={page}
            onPageChange={setPage}
            pageSize={pageSize}
            onPageSizeChange={setPageSize}
            total={total}
            totalPages={totalPages}
          />
        )}
      </div>

      {/* Detail dialog */}
      {detailLog && <DetailDialog log={detailLog as any} onClose={closeDetail} />}
    </div>
  )
}
