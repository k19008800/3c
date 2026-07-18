import { useEffect, useState, useCallback } from 'react'
import { get } from '@/lib/api'
import { RotateCcw, Plus, AlertCircle } from 'lucide-react'
import RefundStatsCards from './refunds/RefundStatsCards'
import RefundList from './refunds/RefundList'
import RefundReview from './refunds/RefundReview'
import type { RefundItem, RefundsData } from './refunds/types'

// ── 退款申请（用户端）─-
// 【业务说明】
//   用户申请退款，选择退款类型（调用异常/充值错误/服务不满意），填写金额和原因。
//   支持按状态筛选（全部/待审核/已通过/已拒绝）。
//   审核通过后金额自动返还至用户余额。
// 【状态流转】pending → approved | rejected
// 【权限要求】登录即可申请
// 【数据来源】GET /api/v1/refunds, POST /api/v1/refunds
// 【关联影响】approved → balance_logs(type=refund) → user balance restored

export default function UserRefunds() {
  const [list, setList] = useState<RefundItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [statusFilter, setStatusFilter] = useState('all')

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params: Record<string, any> = { page, pageSize }
      if (statusFilter !== 'all') params.status = statusFilter
      const res = await get<RefundsData>('/api/v1/refunds', params)
      setList(res.list || [])
      setTotal(res.total || 0)
    } catch (err: any) {
      setError(err.message || '获取退款记录失败')
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, statusFilter])

  useEffect(() => { fetchData() }, [fetchData])

  const handleApplySuccess = useCallback(() => {
    setShowModal(false)
    fetchData()
  }, [fetchData])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <RotateCcw size={28} className="text-indigo-600" />
          <h1 className="text-2xl font-bold text-slate-900">退款申请</h1>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
        >
          <Plus size={16} /> 提交退款申请
        </button>
      </div>

      <RefundStatsCards list={list} />

      {error && (
        <div className="flex items-center gap-2 p-3 text-sm rounded-lg bg-red-50 text-red-600">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      <RefundList
        list={list}
        total={total}
        page={page}
        pageSize={pageSize}
        loading={loading}
        statusFilter={statusFilter}
        onPageChange={setPage}
        onStatusFilterChange={setStatusFilter}
        onRefresh={fetchData}
      />

      {showModal && (
        <RefundReview
          onClose={() => setShowModal(false)}
          onSuccess={handleApplySuccess}
        />
      )}
    </div>
  )
}
