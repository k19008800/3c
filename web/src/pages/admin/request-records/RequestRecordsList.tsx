/**
 * RequestRecordsList — 请求记录列表页
 *
 * 表格展示所有用户的请求记录。
 * 筛选：邮箱搜索、模型名、风险等级、时间范围。
 * 分页：后端返回 page/pageSize/total。
 */

import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, Search, X, Loader2 } from 'lucide-react'
import { get } from '@/lib/api'
import PaginationBar from '@/components/ui/PaginationBar'
import RiskBadge from './components/RiskBadge'
import type { RequestRecordItem, RiskLevel } from './types'
import { fmtRequestSize, RISK_LEVEL_OPTIONS } from './types'

/* ── API 返回格式 ── */

interface ListResponse {
  list: RequestRecordItem[]
  total: number
  page: number
  pageSize: number
}

/* ── Main ── */

export default function RequestRecordsList() {
  const navigate = useNavigate()

  // 筛选条件
  const [filters, setFilters] = useState({
    email: '',
    modelName: '',
    riskLevel: '' as RiskLevel | '',
    startDate: '',
    endDate: '',
  })

  // 分页
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(0)

  // 数据
  const [list, setList] = useState<RequestRecordItem[]>([])
  const [loading, setLoading] = useState(false)

  // 是否有活跃筛选条件
  const hasActiveFilters = Object.entries(filters).some(([k, v]) => {
    if (k === 'startDate' || k === 'endDate') return false
    return v !== ''
  }) || filters.startDate !== '' || filters.endDate !== ''

  /** 获取列表数据 */
  const fetchList = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string, any> = { page, pageSize }
      if (filters.email) params.email = filters.email
      if (filters.modelName) params.modelName = filters.modelName
      if (filters.riskLevel) params.riskLevel = filters.riskLevel
      if (filters.startDate) params.startDate = filters.startDate
      if (filters.endDate) params.endDate = filters.endDate

      const data = await get<ListResponse>('/api/v1/admin/request-records', params)
      setList(data.list || [])
      setTotal(data.total || 0)
      setTotalPages(Math.ceil((data.total || 0) / (data.pageSize || pageSize)))
    } catch (err: any) {
      console.error('获取请求记录失败:', err)
      setList([])
      setTotal(0)
      setTotalPages(0)
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, filters])

  // 首次加载 & 筛选/分页变化时重新加载
  useEffect(() => {
    fetchList()
  }, [fetchList])

  /** 更新筛选条件（重置页码） */
  const setFilter = (key: string, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }))
    setPage(1)
  }

  /** 重置筛选 */
  const resetFilters = () => {
    setFilters({ email: '', modelName: '', riskLevel: '', startDate: '', endDate: '' })
    setPage(1)
  }

  /** 状态标签 */
  const getStatusBadge = (status: string) => {
    const map: Record<string, string> = {
      success: 'bg-green-100 text-green-700',
      failed: 'bg-red-100 text-red-700',
      timeout: 'bg-orange-100 text-orange-700',
      cancelled: 'bg-slate-100 text-slate-600',
    }
    const labelMap: Record<string, string> = {
      success: '成功', failed: '失败', timeout: '超时', cancelled: '已取消',
    }
    return (
      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${map[status] || 'bg-slate-100 text-slate-600'}`}>
        {labelMap[status] || status}
      </span>
    )
  }

  return (
    <div className="space-y-4">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">请求记录</h1>
      </div>

      {/* 筛选栏 */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
        <div className="flex flex-wrap gap-4 items-end">
          {/* 邮箱搜索 */}
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs text-slate-500 mb-1">用户邮箱</label>
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={filters.email}
                onChange={(e) => setFilter('email', e.target.value)}
                placeholder="搜索用户邮箱"
                className="w-full pl-9 pr-8 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-400 transition-colors"
              />
              {filters.email && (
                <button onClick={() => setFilter('email', '')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          {/* 模型名 */}
          <div className="flex-1 min-w-[160px]">
            <label className="block text-xs text-slate-500 mb-1">模型名称</label>
            <input
              type="text"
              value={filters.modelName}
              onChange={(e) => setFilter('modelName', e.target.value)}
              placeholder="如 gpt-4o"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-400 transition-colors"
            />
          </div>

          {/* 风险等级 */}
          <div>
            <label className="block text-xs text-slate-500 mb-1">风险等级</label>
            <select
              value={filters.riskLevel}
              onChange={(e) => setFilter('riskLevel', e.target.value)}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-400 transition-colors min-w-[120px]"
            >
              {RISK_LEVEL_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* 开始日期 */}
          <div>
            <label className="block text-xs text-slate-500 mb-1">开始日期</label>
            <input
              type="date"
              value={filters.startDate}
              onChange={(e) => setFilter('startDate', e.target.value)}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-400 transition-colors"
            />
          </div>

          {/* 结束日期 */}
          <div>
            <label className="block text-xs text-slate-500 mb-1">结束日期</label>
            <input
              type="date"
              value={filters.endDate}
              onChange={(e) => setFilter('endDate', e.target.value)}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-400 transition-colors"
            />
          </div>

          {/* 清除筛选 */}
          {hasActiveFilters && (
            <button
              onClick={resetFilters}
              className="flex items-center gap-1 px-3 py-2 text-sm text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition"
            >
              <X size={14} />
              清除筛选
            </button>
          )}
        </div>
      </div>

      {/* 表格 */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 text-left">
                <th className="px-4 py-3 text-sm font-medium text-slate-500">ID</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">用户邮箱</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">模型名</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500 text-right">请求体大小</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">响应状态</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">风险等级</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">创建时间</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={8} className="text-center py-12">
                    <Loader2 className="inline-block animate-spin" size={24} />
                  </td>
                </tr>
              ) : list.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-slate-400">
                    暂无请求记录数据
                  </td>
                </tr>
              ) : (
                list.map((record) => (
                  <tr key={record.id} className="hover:bg-slate-50 transition">
                    <td className="px-4 py-3 text-sm font-mono text-slate-600">
                      <button
                        onClick={() => navigate(`/admin/request-records/${record.id}`)}
                        className="text-blue-600 hover:text-blue-800 hover:underline"
                      >
                        #{record.id}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <button
                        onClick={() => navigate(`/admin/users?highlight=${record.userId}&tab=request-records`)}
                        className="text-blue-600 hover:text-blue-800 hover:underline"
                      >
                        {record.userEmail || '-'}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-slate-900">
                      {record.modelName}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-slate-600 font-mono">
                      {fmtRequestSize(record.requestSize)}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {getStatusBadge(record.status)}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <RiskBadge level={record.riskLevel} />
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500">
                      {record.createdAt ? record.createdAt.slice(0, 19).replace('T', ' ') : '-'}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <button
                        onClick={() => navigate(`/admin/request-records/${record.id}`)}
                        className="flex items-center gap-1 px-2 py-1 text-xs text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded transition"
                      >
                        <Eye size={14} />
                        详情
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <PaginationBar
          page={page}
          onPageChange={setPage}
          total={total}
          totalPages={totalPages}
          pageSize={pageSize}
          onPageSizeChange={(size) => { setPageSize(size); setPage(1) }}
        />
      </div>
    </div>
  )
}