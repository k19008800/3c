import { useEffect, useState, useCallback, useRef } from 'react'
import { get, post } from '@/lib/api'
import type { CommissionRecord, PaginatedData } from '@/types'
import { Loader2, AlertCircle, ChevronLeft, ChevronRight, Search } from 'lucide-react'

export default function AdminFinanceCommissions() {
  const [rows, setRows] = useState<CommissionRecord[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [agentId, setAgentId] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [settleMode, setSettleMode] = useState<string>('auto')
  const [operating, setOperating] = useState(false)
  const selectAllRef = useRef<HTMLInputElement>(null)

  const totalPages = Math.ceil(total / pageSize)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params: any = { page, pageSize }
      if (agentId) params.agentId = agentId
      if (statusFilter) params.status = statusFilter
      if (typeFilter) params.commissionType = typeFilter
      if (startDate) params.startDate = startDate
      if (endDate) params.endDate = endDate
      const res = await get<PaginatedData<CommissionRecord>>('/api/v1/admin/finance/commissions', params)
      setRows(res.list)
      setTotal(res.total)
    } catch (err: any) {
      setError(err.message || '获取佣金数据失败')
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, agentId, statusFilter, typeFilter, startDate, endDate])

  useEffect(() => { fetchData() }, [fetchData])

  useEffect(() => {
    get<any>('/api/v1/admin/configs?group=commission_settle').then((data: any) => {
      const mode = data.list?.find((c: any) => c.key === 'commission_settle_mode')
      if (mode) setSettleMode(mode.value)
    }).catch(() => {})
  }, [])

  const toggleSelectAll = () => {
    if (selectedIds.length === rows.filter(r => r.status === 'pending').length) {
      setSelectedIds([])
    } else {
      setSelectedIds(rows.filter(r => r.status === 'pending').map(r => r.id))
    }
  }

  const isAllSelected = rows.length > 0 && rows.filter(r => r.status === 'pending').length === selectedIds.length

  const handleBatchSettle = async () => {
    setOperating(true)
    try {
      await post('/api/v1/admin/finance/commissions/settle', { ids: selectedIds })
      setSelectedIds([])
      fetchData()
    } catch (err: any) {
      setError(err.message || '结算失败')
    } finally {
      setOperating(false)
    }
  }

  const handleBatchCancel = async () => {
    if (!confirm('确定作废选中的佣金记录？')) return
    setOperating(true)
    try {
      await post('/api/v1/admin/finance/commissions/cancel', { ids: selectedIds })
      setSelectedIds([])
      fetchData()
    } catch (err: any) {
      setError(err.message || '作废失败')
    } finally {
      setOperating(false)
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
      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${map[s] || 'bg-slate-100 text-slate-700'}`}>
        {label[s] || s}
      </span>
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

      <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <div>
            <label className="block text-xs text-slate-500 mb-1">代理商 ID</label>
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={agentId} onChange={(e) => { setAgentId(e.target.value); setPage(1) }}
                placeholder="输入代理商 ID" className="w-full pl-8 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">状态</label>
            <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">全部</option>
              <option value="pending">待结算</option>
              <option value="settled">已结算</option>
              <option value="cancelled">已取消</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">类型</label>
            <select value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setPage(1) }}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">全部</option>
              <option value="sale">销售佣金</option>
              <option value="team">团队佣金</option>
              <option value="activity">活动奖励</option>
              <option value="renewal">续费佣金</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">开始日期</label>
            <input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); setPage(1) }}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">结束日期</label>
            <input type="date" value={endDate} onChange={(e) => { setEndDate(e.target.value); setPage(1) }}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>
      </div>

      {settleMode === 'manual' && selectedIds.length > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 bg-blue-50 border border-blue-200 rounded-lg mb-4">
          <span className="text-sm text-blue-700">已选 {selectedIds.length} 条</span>
          <button onClick={handleBatchSettle}
            disabled={operating}
            className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {operating ? '结算中...' : '批量结算'}
          </button>
          <button onClick={handleBatchCancel}
            disabled={operating}
            className="px-4 py-1.5 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 disabled:opacity-50"
          >
            {operating ? '处理中...' : '批量作废'}
          </button>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 text-left">
                <th className="px-4 py-3">
                  <input type="checkbox" onChange={toggleSelectAll} checked={isAllSelected} ref={selectAllRef} />
                </th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">ID</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">代理商</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">调用成本</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">佣金</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">手续费</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">净额</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">类型</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">状态</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">时间</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">结算时间</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr><td colSpan={11} className="text-center py-12"><Loader2 className="animate-spin inline-block" size={24} /></td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={11} className="text-center py-12 text-slate-400">暂无佣金记录</td></tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50 transition">
                    <td className="px-4 py-3">
                      <input type="checkbox"
                        checked={selectedIds.includes(r.id)}
                        onChange={() => {
                          setSelectedIds(prev =>
                            prev.includes(r.id) ? prev.filter(id => id !== r.id) : [...prev, r.id]
                          )
                        }}
                        disabled={r.status !== 'pending'}
                      />
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">{r.id}</td>
                    <td className="px-4 py-3 text-sm text-slate-900">{r.agentNickname || r.agentEmail || `#${r.agentId}`}</td>
                    <td className="px-4 py-3 text-sm">¥{Number(r.callCost).toFixed(4)}</td>
                    <td className="px-4 py-3 text-sm font-medium text-green-600">¥{Number(r.commissionAmount).toFixed(4)}</td>
                    <td className="px-4 py-3 text-sm text-slate-500">¥{Number(r.feeAmount).toFixed(4)}</td>
                    <td className="px-4 py-3 text-sm font-medium">¥{Number(r.netAmount).toFixed(4)}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{r.commissionTypeLabel || r.commissionType}</td>
                    <td className="px-4 py-3">{statusBadge(r.status)}</td>
                    <td className="px-4 py-3 text-sm text-slate-500 whitespace-nowrap">{new Date(r.createdAt).toLocaleString('zh-CN')}</td>
                    <td className="px-4 py-3 text-sm text-slate-500 whitespace-nowrap">{r.settledAt ? new Date(r.settledAt).toLocaleString('zh-CN') : '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {total > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 bg-slate-50">
            <span className="text-sm text-slate-500">第 {page} / {totalPages} 页，共 {total} 条</span>
            <div className="flex items-center gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                className="p-1 rounded hover:bg-slate-200 disabled:opacity-30 transition"><ChevronLeft size={18} /></button>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                className="p-1 rounded hover:bg-slate-200 disabled:opacity-30 transition"><ChevronRight size={18} /></button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
