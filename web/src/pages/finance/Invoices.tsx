import { useEffect, useState, useCallback } from 'react'
import { get } from '@/lib/api'
import { FileText } from 'lucide-react'
import InvoiceStatsCards from './invoices/InvoiceStatsCards'
import InvoiceList from './invoices/InvoiceList'
import InvoiceForm from './invoices/InvoiceForm'
import type { InvoiceItem } from './invoices/types'

// ── 发票管理（用户端）─-
// 【业务说明】
//   用户申请开票，需先有已审核通过的充值记录。
//   显示可开票额度（= 累计已审核充值金额），申请金额不可超此额度。
//   支持按状态筛选（全部/待审核/已通过/已开票/已拒绝）。
// 【状态流转】pending → approved → issued | rejected
// 【前置条件】amount ≤ 累计已审核充值金额
// 【权限要求】登录即可申请
// 【数据来源】GET /api/v1/invoices, POST /api/v1/invoices, GET /api/v1/invoices/available-amount

export default function UserInvoices() {
  const [list, setList] = useState<InvoiceItem[]>([])
  const [total, setTotal] = useState(0)
  const [availableAmount, setAvailableAmount] = useState('0.00')
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
      const [invoices, avail] = await Promise.all([
        get<{ list: InvoiceItem[]; total: number }>('/api/v1/invoices', params),
        get<{ availableAmount: string }>('/api/v1/invoices/available-amount'),
      ])
      setList(invoices.list || [])
      setTotal(invoices.total || 0)
      setAvailableAmount(avail.availableAmount || '0.00')
    } catch (err: any) {
      setError(err.message || '获取发票数据失败')
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
      <div className="flex items-center gap-3">
        <FileText size={28} className="text-indigo-600" />
        <h1 className="text-2xl font-bold text-slate-900">发票管理</h1>
      </div>

      <InvoiceStatsCards
        availableAmount={availableAmount}
        onApply={() => setShowModal(true)}
      />

      {error && (
        <div className="flex items-center gap-2 p-3 text-sm rounded-lg bg-red-50 text-red-600">
          <span className="shrink-0">⚠</span> {error}
        </div>
      )}

      <InvoiceList
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
        <InvoiceForm
          availableAmount={availableAmount}
          onClose={() => setShowModal(false)}
          onSuccess={handleApplySuccess}
        />
      )}
    </div>
  )
}
