import { useEffect, useState, useCallback } from 'react'
import { get, downloadUrl } from '@/lib/api'
import type { AgentCommission, AgentCommissionSummary, PaginatedData } from '@/types'
import { usePagePreferences } from '@/hooks/use-page-preferences'
import CommissionStatsCards from './commissions/CommissionStatsCards'
import CommissionList from './commissions/CommissionList'
import CommissionSettings from './commissions/CommissionSettings'

// ── 佣金记录（代理商）─-
//
// 【业务说明】
//   代理商佣金明细，支持按类型（销售/团队/活动/续费）、状态（待结算/已结算/已取消）、
//   日期范围和客户名称筛选。顶部汇总卡片展示累计/待结算/已结算金额。
//   点击行可打开详情抽屉查看该笔佣金的完整信息（来源客户、关联订单、结算时间）。
//
// 【权限要求】角色=agent
// 【数据来源】GET /api/v1/agent/commissions, GET /api/v1/agent/commissions/summary

export default function AgentCommissions() {
  const [rows, setRows] = useState<AgentCommission[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [summary, setSummary] = useState<AgentCommissionSummary | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(true)

  const [statusFilter, setStatusFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [customerSearch, setCustomerSearch] = useState('')

  const [detailCommission, setDetailCommission] = useState<AgentCommission | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)

  const { filters, loaded: prefsLoaded, updateFilter } = usePagePreferences('agent_commissions')

  // ── Restore filters from prefs ──
  useEffect(() => {
    if (prefsLoaded && filters) {
      if (filters.status) setStatusFilter(filters.status)
      if (filters.type) setTypeFilter(filters.type)
      if (filters.startDate) setStartDate(filters.startDate)
      if (filters.endDate) setEndDate(filters.endDate)
      if (filters.customerSearch) setCustomerSearch(filters.customerSearch)
    }
  }, [prefsLoaded])

  const totalPages = Math.ceil(total / pageSize)

  const buildParams = useCallback(() => {
    const params: Record<string, string | number> = { page, pageSize }
    if (statusFilter) params.status = statusFilter
    if (typeFilter) params.commissionType = typeFilter
    if (startDate) params.startDate = startDate
    if (endDate) params.endDate = endDate
    if (customerSearch) params.customerSearch = customerSearch
    return params
  }, [page, pageSize, statusFilter, typeFilter, startDate, endDate, customerSearch])

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await get<PaginatedData<AgentCommission>>('/api/v1/agent/commissions', buildParams())
      setRows(res.list)
      setTotal(res.total)
    } catch (err: any) {
      setError(err.message || '获取佣金记录失败')
    } finally {
      setLoading(false)
    }
  }, [buildParams])

  const fetchSummary = useCallback(async () => {
    setSummaryLoading(true)
    try {
      const res = await get<AgentCommissionSummary>('/api/v1/agent/commissions/summary')
      setSummary(res)
    } catch {
      // silent fail
    } finally {
      setSummaryLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])
  useEffect(() => { fetchSummary() }, [fetchSummary])

  const handleSearch = useCallback(() => {
    setPage(1)
    updateFilter('status', statusFilter)
    updateFilter('type', typeFilter)
    updateFilter('startDate', startDate)
    updateFilter('endDate', endDate)
    updateFilter('customerSearch', customerSearch)
  }, [statusFilter, typeFilter, startDate, endDate, customerSearch, updateFilter])

  const handleReset = useCallback(() => {
    setStatusFilter('')
    setTypeFilter('')
    setStartDate('')
    setEndDate('')
    setCustomerSearch('')
    setPage(1)
  }, [])

  const handleExport = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (statusFilter) params.set('status', statusFilter)
      if (typeFilter) params.set('commissionType', typeFilter)
      if (startDate) params.set('startDate', startDate)
      if (endDate) params.set('endDate', endDate)
      const qs = params.toString()
      await downloadUrl(
        `/api/v1/agent/commissions/export${qs ? '?' + qs : ''}`,
        `commission_export_${Date.now()}.csv`,
      )
    } catch (err: any) {
      setError(err.message || '导出失败')
    }
  }, [statusFilter, typeFilter, startDate, endDate])

  const openDetail = useCallback((row: AgentCommission) => {
    setDetailCommission(row)
    setDrawerOpen(true)
  }, [])

  const closeDetail = useCallback(() => {
    setDrawerOpen(false)
    setDetailCommission(null)
  }, [])

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">分佣记录</h1>

      <CommissionStatsCards summary={summary} loading={summaryLoading} />

      <CommissionList
        rows={rows}
        total={total}
        page={page}
        pageSize={pageSize}
        totalPages={totalPages}
        loading={loading}
        error={error}
        onErrorClear={() => setError('')}
        statusFilter={statusFilter}
        typeFilter={typeFilter}
        startDate={startDate}
        endDate={endDate}
        customerSearch={customerSearch}
        onStatusFilter={setStatusFilter}
        onTypeFilter={setTypeFilter}
        onStartDate={setStartDate}
        onEndDate={setEndDate}
        onCustomerSearch={setCustomerSearch}
        onSearch={handleSearch}
        onReset={handleReset}
        onExport={handleExport}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
        onOpenDetail={openDetail}
      />

      <CommissionSettings
        commission={detailCommission}
        open={drawerOpen}
        onClose={closeDetail}
      />
    </div>
  )
}
