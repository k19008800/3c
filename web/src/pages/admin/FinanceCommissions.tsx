import React, { useEffect, useState, useCallback } from 'react'
import { get, post } from '@/lib/api'
import type { CommissionRecord, CommissionRollupRow, PaginatedData } from '@/types'
import { Loader2, AlertCircle, CheckCircle2, ChevronLeft, ChevronRight, ChevronDown, ChevronRight as ChevronRightSmall, Search } from 'lucide-react'

// ── 子组件：某代理商某天的明细表 ──
function DetailPanel({
  agentId,
  date,
  agentLabel,
  onClose,
  onSettled,
}: {
  agentId: number
  date: string
  agentLabel: string
  onClose: () => void
  onSettled: () => void
}) {
  const [rows, setRows] = useState<CommissionRecord[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [operating, setOperating] = useState(false)
  const [settleAllLoading, setSettleAllLoading] = useState(false)

  const totalPages = Math.ceil(total / pageSize)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params: any = { agentId, date, page, pageSize }
      if (statusFilter) params.status = statusFilter
      if (typeFilter) params.commissionType = typeFilter
      const res = await get<PaginatedData<CommissionRecord>>(
        '/api/v1/admin/finance/commissions/detail',
        params,
      )
      setRows(res.list)
      setTotal(res.total)
    } catch (err: any) {
      setError(err.message || '获取明细失败')
    } finally {
      setLoading(false)
    }
  }, [agentId, date, page, pageSize, statusFilter, typeFilter])

  useEffect(() => { fetchData() }, [fetchData])

  const toggleSelectAll = () => {
    const pendings = rows.filter((r) => r.status === 'pending')
    if (selectedIds.length === pendings.length) {
      setSelectedIds([])
    } else {
      setSelectedIds(pendings.map((r) => r.id))
    }
  }

  const isAllSelected =
    rows.filter((r) => r.status === 'pending').length > 0 &&
    rows.filter((r) => r.status === 'pending').length === selectedIds.length

  const handleBatchSettle = async () => {
    setOperating(true)
    setError('')
    setSuccess('')
    try {
      await post('/api/v1/admin/finance/commissions/settle', { ids: selectedIds })
      setSelectedIds([])
      setSuccess(`已结算 ${selectedIds.length} 笔`)
      fetchData()
      onSettled()
    } catch (err: any) {
      setError(err.message || '结算失败')
    } finally {
      setOperating(false)
    }
  }

  const handleBatchCancel = async () => {
    if (!confirm('确定作废选中的佣金记录？')) return
    setOperating(true)
    setError('')
    setSuccess('')
    try {
      await post('/api/v1/admin/finance/commissions/cancel', { ids: selectedIds })
      setSelectedIds([])
      setSuccess(`已作废 ${selectedIds.length} 笔`)
      fetchData()
      onSettled()
    } catch (err: any) {
      setError(err.message || '作废失败')
    } finally {
      setOperating(false)
    }
  }

  const handleSettleByFilters = async () => {
    const parts: string[] = [date]
    if (typeFilter) parts.push(`类型:${typeFilter}`)
    if (!confirm(`确定结算代理商「${agentLabel}」${parts.join(' ')}下的所有待结算佣金？不可撤销。`))
      return
    setSettleAllLoading(true)
    setError('')
    setSuccess('')
    try {
      const result = await post<{ settledCount: number }>(
        '/api/v1/admin/finance/commissions/settle-by-filters',
        { agentId, startDate: date, endDate: date, commissionType: typeFilter || undefined },
      )
      setSelectedIds([])
      setSuccess(`成功结算 ${result.settledCount} 笔`)
      fetchData()
      onSettled()
    } catch (err: any) {
      setError(err.message || '结算失败')
    } finally {
      setSettleAllLoading(false)
    }
  }

  const statusBadge = (s: string) => {
    const map: Record<string, string> = {
      pending: 'bg-orange-100 text-orange-700',
      settled: 'bg-green-100 text-green-700',
      cancelled: 'bg-slate-100 text-slate-500',
    }
    const label: Record<string, string> = {
      pending: '待结算',
      settled: '已结算',
      cancelled: '已取消',
    }
    return (
      <span
        className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${map[s] || 'bg-slate-100 text-slate-700'}`}
      >
        {label[s] || s}
      </span>
    )
  }

  return (
    <div className="bg-slate-50 rounded-lg p-4 mt-2 border border-slate-200">
      {/* 表头 */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-800">
            {agentLabel}
          </span>
          <span className="text-xs text-slate-400">|</span>
          <span className="text-sm text-slate-600">{date}</span>
          {total > 0 && (
            <span className="text-xs text-slate-400 ml-1">共 {total} 条</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* 明细筛选：状态 */}
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
            className="px-2 py-1 text-xs border border-slate-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">全部状态</option>
            <option value="pending">待结算</option>
            <option value="settled">已结算</option>
            <option value="cancelled">已取消</option>
          </select>
          {/* 明细筛选：类型 */}
          <select
            value={typeFilter}
            onChange={(e) => { setTypeFilter(e.target.value); setPage(1) }}
            className="px-2 py-1 text-xs border border-slate-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">全部类型</option>
            <option value="sale">销售佣金</option>
            <option value="team">团队佣金</option>
            <option value="activity">活动奖励</option>
            <option value="renewal">续费佣金</option>
          </select>
          <button
            onClick={handleSettleByFilters}
            disabled={settleAllLoading || loading}
            className="px-3 py-1 text-xs bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-50 transition"
          >
            {settleAllLoading ? '结算中...' : '一键结算当前筛选'}
          </button>
          <button
            onClick={onClose}
            className="px-3 py-1 text-xs bg-slate-200 text-slate-600 rounded hover:bg-slate-300 transition"
          >
            收起
          </button>
        </div>
      </div>

      {/* 错误/成功提示 */}
      {error && (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 p-2 rounded text-xs mb-2">
          <AlertCircle size={14} /> {error}
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 text-green-700 bg-green-50 p-2 rounded text-xs mb-2">
          <CheckCircle2 size={14} /> {success}
        </div>
      )}

      {/* 批量操作栏 */}
      {selectedIds.length > 0 && (
        <div className="flex items-center gap-3 px-3 py-2 bg-blue-50 border border-blue-200 rounded mb-2">
          <span className="text-xs text-blue-700">已选 {selectedIds.length} 条</span>
          <button
            onClick={handleBatchSettle}
            disabled={operating}
            className="px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 disabled:opacity-50 transition"
          >
            {operating ? '结算中...' : '批量结算'}
          </button>
          <button
            onClick={handleBatchCancel}
            disabled={operating}
            className="px-3 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700 disabled:opacity-50 transition"
          >
            {operating ? '处理中...' : '批量作废'}
          </button>
        </div>
      )}

      {/* 明细表格 */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-100 text-left">
              <th className="px-3 py-2">
                <input
                  type="checkbox"
                  onChange={toggleSelectAll}
                  checked={isAllSelected}
                />
              </th>
              <th className="px-3 py-2 font-medium text-slate-500">ID</th>
              <th className="px-3 py-2 font-medium text-slate-500">调用成本</th>
              <th className="px-3 py-2 font-medium text-slate-500">佣金</th>
              <th className="px-3 py-2 font-medium text-slate-500">手续费</th>
              <th className="px-3 py-2 font-medium text-slate-500">净额</th>
              <th className="px-3 py-2 font-medium text-slate-500">类型</th>
              <th className="px-3 py-2 font-medium text-slate-500">状态</th>
              <th className="px-3 py-2 font-medium text-slate-500">时间</th>
              <th className="px-3 py-2 font-medium text-slate-500">结算时间</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {loading ? (
              <tr>
                <td colSpan={10} className="text-center py-8">
                  <Loader2 className="animate-spin inline-block" size={18} />
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={10} className="text-center py-8 text-slate-400">
                  暂无明细记录
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="hover:bg-blue-50/50 transition">
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(r.id)}
                      onChange={() => {
                        setSelectedIds((prev) =>
                          prev.includes(r.id)
                            ? prev.filter((id) => id !== r.id)
                            : [...prev, r.id],
                        )
                      }}
                      disabled={r.status !== 'pending'}
                    />
                  </td>
                  <td className="px-3 py-2 text-slate-600">{r.id}</td>
                  <td className="px-3 py-2">¥{Number(r.callCost).toFixed(4)}</td>
                  <td className="px-3 py-2 font-medium text-green-600">
                    ¥{Number(r.commissionAmount).toFixed(4)}
                  </td>
                  <td className="px-3 py-2 text-slate-500">
                    ¥{Number(r.feeAmount).toFixed(4)}
                  </td>
                  <td className="px-3 py-2 font-medium">
                    ¥{Number(r.netAmount).toFixed(4)}
                  </td>
                  <td className="px-3 py-2 text-slate-600">
                    {r.commissionTypeLabel || r.commissionType}
                  </td>
                  <td className="px-3 py-2">{statusBadge(r.status)}</td>
                  <td className="px-3 py-2 text-slate-500 whitespace-nowrap">
                    {new Date(r.createdAt).toLocaleString('zh-CN')}
                  </td>
                  <td className="px-3 py-2 text-slate-500 whitespace-nowrap">
                    {r.settledAt ? new Date(r.settledAt).toLocaleString('zh-CN') : '-'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 明细分页 */}
      {total > 0 && (
        <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-200">
          <span className="text-xs text-slate-400">共 {total} 条</span>
          <div className="flex items-center gap-2">
            <select
              value={pageSize}
              onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1) }}
              className="text-xs border border-slate-300 rounded px-1 py-0.5 bg-white"
            >
              <option value={20}>20条/页</option>
              <option value={50}>50条/页</option>
              <option value={100}>100条/页</option>
            </select>
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="p-0.5 rounded hover:bg-slate-200 disabled:opacity-30"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="text-xs text-slate-500">
              {page}/{totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="p-0.5 rounded hover:bg-slate-200 disabled:opacity-30"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── 主页面 ──
export default function AdminFinanceCommissions() {
  const [rows, setRows] = useState<CommissionRollupRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [agentSearch, setAgentSearch] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [expandedKey, setExpandedKey] = useState<string | null>(null)
  const [pageInput, setPageInput] = useState('')

  const totalPages = Math.ceil(total / pageSize)

  useEffect(() => {
    setPageInput(String(page))
  }, [page])

  useEffect(() => {
    if (total > 0 && page > totalPages) {
      setPage(totalPages)
    }
  }, [total, page, totalPages])

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError('')
    setSuccess('')
    try {
      const params: any = { page, pageSize }
      if (agentSearch) params.agentSearch = agentSearch
      if (startDate) params.startDate = startDate
      if (endDate) params.endDate = endDate
      const res = await get<PaginatedData<CommissionRollupRow>>(
        '/api/v1/admin/finance/commissions',
        params,
      )
      setRows(res.list)
      setTotal(res.total)
    } catch (err: any) {
      setError(err.message || '获取佣金数据失败')
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, agentSearch, startDate, endDate])

  useEffect(() => { fetchData() }, [fetchData])

  const handlePageJump = () => {
    const p = parseInt(pageInput, 10)
    if (p >= 1 && p <= totalPages) {
      setPage(p)
    } else {
      setPageInput(String(page))
    }
  }

  const toggleExpand = (key: string) => {
    setExpandedKey((prev) => (prev === key ? null : key))
  }

  // 汇总行渲染
  const renderRollupRow = (r: CommissionRollupRow) => {
    const key = `${r.agentId}|${r.reportDate}`
    const isExpanded = expandedKey === key

    return (
      <tr key={key} className="hover:bg-slate-50 transition">
        {/* 展开按钮 */}
        <td className="px-4 py-3">
          <button
            onClick={() => toggleExpand(key)}
            className="p-0.5 rounded hover:bg-slate-200 transition text-slate-400"
            title="查看明细"
          >
            {isExpanded ? (
              <ChevronDown size={16} />
            ) : (
              <ChevronRightSmall size={16} />
            )}
          </button>
        </td>
        <td className="px-4 py-3 text-sm text-slate-600">{r.reportDate}</td>
        <td className="px-4 py-3 text-sm text-slate-900 font-medium">
          {r.agentNickname || r.agentEmail || `#${r.agentId}`}
        </td>
        <td className="px-4 py-3 text-sm">
          ¥{Number(r.totalCallCost).toFixed(4)}
        </td>
        <td className="px-4 py-3 text-sm font-medium text-green-600">
          ¥{Number(r.totalCommissionAmount).toFixed(4)}
        </td>
        <td className="px-4 py-3 text-sm text-slate-500">
          ¥{Number(r.totalFeeAmount).toFixed(4)}
        </td>
        <td className="px-4 py-3 text-sm font-medium">
          ¥{Number(r.totalNetAmount).toFixed(4)}
        </td>
        <td className="px-4 py-3 text-sm text-slate-600">
          {r.totalRecords} 条
        </td>
        <td className="px-4 py-3 text-xs">
          <div className="flex items-center gap-1">
            {r.pendingCount > 0 && (
              <span className="bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded text-xs">
                待{r.pendingCount}
              </span>
            )}
            {r.settledCount > 0 && (
              <span className="bg-green-100 text-green-700 px-1.5 py-0.5 rounded text-xs">
                已{r.settledCount}
              </span>
            )}
            {r.cancelledCount > 0 && (
              <span className="bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded text-xs">
                取{r.cancelledCount}
              </span>
            )}
          </div>
        </td>
      </tr>
    )
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">佣金流水</h1>

      {error && (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {success && (
        <div className="flex items-center gap-2 text-green-700 bg-green-50 p-3 rounded-lg text-sm">
          <CheckCircle2 size={16} /> {success}
        </div>
      )}

      {/* ══════ 筛选区 ══════ */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
        <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-0">
          <div>
            <label className="block text-xs text-slate-500 mb-1">代理商搜索</label>
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={agentSearch}
                onChange={(e) => { setAgentSearch(e.target.value); setPage(1) }}
                placeholder="邮箱或昵称"
                className="w-full pl-8 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">开始日期</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => { setStartDate(e.target.value); setPage(1) }}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">结束日期</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => { setEndDate(e.target.value); setPage(1) }}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex items-end">
            <span className="text-xs text-slate-400 leading-8">
              提示：点击左侧 <ChevronRightSmall size={12} className="inline" /> 展开查看明细
            </span>
          </div>
        </div>
      </div>

      {/* ══════ 汇总表格 ══════ */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 text-left">
                <th className="px-4 py-3 w-10"></th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">日期</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">代理商</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">调用成本</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">佣金</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">手续费</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">净额</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">记录数</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">状态分布</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={9} className="text-center py-12">
                    <Loader2 className="animate-spin inline-block" size={24} />
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-12 text-slate-400">
                    暂无佣金记录
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <React.Fragment key={`${r.agentId}|${r.reportDate}`}>
                    {renderRollupRow(r)}
                    {expandedKey === `${r.agentId}|${r.reportDate}` && (
                      <tr>
                        <td colSpan={9} className="px-4 pb-4 pt-0">
                          <DetailPanel
                            agentId={r.agentId}
                            date={r.reportDate}
                            agentLabel={
                              r.agentNickname || r.agentEmail || `#${r.agentId}`
                            }
                            onClose={() => setExpandedKey(null)}
                            onSettled={fetchData}
                          />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* ══════ 分页 ══════ */}
        {total > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 bg-slate-50">
            <span className="text-sm text-slate-500">共 {total} 条</span>
            <div className="flex items-center gap-3">
              <select
                value={pageSize}
                onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1) }}
                className="text-sm border border-slate-300 rounded px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value={20}>20条/页</option>
                <option value={50}>50条/页</option>
                <option value={100}>100条/页</option>
              </select>
              <span className="text-sm text-slate-500">第</span>
              <input
                type="text"
                value={pageInput}
                onChange={(e) => setPageInput(e.target.value.replace(/\D/g, ''))}
                onKeyDown={(e) => { if (e.key === 'Enter') handlePageJump() }}
                className="w-12 text-center text-sm border border-slate-300 rounded px-1 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-sm text-slate-500">/ {totalPages} 页</span>
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-1 rounded hover:bg-slate-200 disabled:opacity-30 transition"
              >
                <ChevronLeft size={18} />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="p-1 rounded hover:bg-slate-200 disabled:opacity-30 transition"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
