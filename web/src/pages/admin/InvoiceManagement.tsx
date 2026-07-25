import { useEffect, useState, useCallback } from 'react'
import { get, post } from '@/lib/api'
import type { PaginatedData } from '@/types'
import PaginationBar from '@/components/ui/PaginationBar'
import {
  Loader2, AlertCircle, RefreshCw, FileText,
  CheckCircle, XCircle, Clock, Upload,
  Search, Filter, Download, Eye,
} from 'lucide-react'

// ── Types ──

interface Invoice {
  id: number
  userId: number
  amount: string
  invoiceType: 'normal' | 'special'
  invoiceTitle: string
  invoiceTaxId?: string
  status: 'pending' | 'processing' | 'approved' | 'issued' | 'cancelled' | 'rejected'
  invoiceNumber?: string
  invoiceFileUrl?: string
  issuedAt?: string
  bankName?: string
  bankAccount?: string
  companyAddress?: string
  companyPhone?: string
  refOrderId?: number
  rejectReason?: string
  createdAt: string
  updatedAt: string
  reviewedAt?: string
}

// ── Status config ──

const statusConfig: Record<string, { label: string; icon: any; color: string; bgColor: string }> = {
  pending: { label: '待审核', icon: Clock, color: 'text-amber-600', bgColor: 'bg-amber-50 border-amber-200' },
  processing: { label: '处理中', icon: Loader2, color: 'text-blue-600', bgColor: 'bg-blue-50 border-blue-200' },
  approved: { label: '已批准', icon: CheckCircle, color: 'text-green-600', bgColor: 'bg-green-50 border-green-200' },
  issued: { label: '已开票', icon: FileText, color: 'text-purple-600', bgColor: 'bg-purple-50 border-purple-200' },
  cancelled: { label: '已取消', icon: XCircle, color: 'text-gray-600', bgColor: 'bg-gray-50 border-gray-200' },
  rejected: { label: '已拒绝', icon: XCircle, color: 'text-red-600', bgColor: 'bg-red-50 border-red-200' },
}

// ── Main Component ──

export default function AdminInvoiceManagement() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 1,
  })
  
  const [filters, setFilters] = useState({
    status: '',
    userId: '',
  })
  
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [showRejectModal, setShowRejectModal] = useState(false)
  const [showIssueModal, setShowIssueModal] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [invoiceNo, setInvoiceNo] = useState('')
  const [fileUrl, setFileUrl] = useState('')
  const [actionLoading, setActionLoading] = useState(false)

  // ── Data Fetching ──

  const fetchInvoices = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        pageSize: pagination.pageSize.toString(),
        ...(filters.status && { status: filters.status }),
        ...(filters.userId && { userId: filters.userId }),
      })

      const response = await get<PaginatedData<Invoice>>(`/api/v1/admin/finance/invoices?${params}`)
      setInvoices(response.data?.items || response.data?.list || [])
      setPagination(prev => ({
        ...prev,
        total: response.data?.total || 0,
        totalPages: response.data?.totalPages || 1,
      }))
    } catch (err: any) {
      setError(err.message || '加载发票记录失败')
    } finally {
      setLoading(false)
    }
  }, [pagination.page, pagination.pageSize, filters])

  useEffect(() => {
    fetchInvoices()
  }, [fetchInvoices])

  // ── Handlers ──

  const handlePageChange = (page: number) => {
    setPagination(prev => ({ ...prev, page }))
  }

  const handleFilterChange = (key: keyof typeof filters, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }))
    setPagination(prev => ({ ...prev, page: 1 }))
  }

  const handleApprove = async (invoiceId: number) => {
    if (!confirm('确认审核通过该发票申请？')) return
    
    setActionLoading(true)
    try {
      await post(`/api/v1/admin/finance/invoices/${invoiceId}/approve`, {})
      fetchInvoices()
    } catch (err: any) {
      setError(err.message || '审核失败')
    } finally {
      setActionLoading(false)
    }
  }

  const handleReject = async () => {
    if (!rejectReason.trim()) {
      setError('请输入拒绝原因')
      return
    }

    setActionLoading(true)
    try {
      await post(`/api/v1/admin/finance/invoices/${selectedInvoice!.id}/reject`, {
        reason: rejectReason,
      })
      setShowRejectModal(false)
      setRejectReason('')
      setSelectedInvoice(null)
      fetchInvoices()
    } catch (err: any) {
      setError(err.message || '拒绝失败')
    } finally {
      setActionLoading(false)
    }
  }

  const handleIssue = async () => {
    if (!invoiceNo.trim()) {
      setError('请输入发票号码')
      return
    }

    setActionLoading(true)
    try {
      await post(`/api/v1/admin/finance/invoices/${selectedInvoice!.id}/issue`, {
        invoiceNo,
        fileUrl: fileUrl || undefined,
      })
      setShowIssueModal(false)
      setInvoiceNo('')
      setFileUrl('')
      setSelectedInvoice(null)
      fetchInvoices()
    } catch (err: any) {
      setError(err.message || '开票失败')
    } finally {
      setActionLoading(false)
    }
  }

  const handleUpload = async (invoiceId: number, file: File) => {
    const formData = new FormData()
    formData.append('file', file)

    setActionLoading(true)
    try {
      const response = await fetch(`/api/v1/admin/finance/invoices/${invoiceId}/upload`, {
        method: 'POST',
        body: formData,
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      })

      if (!response.ok) {
        throw new Error('上传失败')
      }

      fetchInvoices()
    } catch (err: any) {
      setError(err.message || '上传失败')
    } finally {
      setActionLoading(false)
    }
  }

  // ── Render Helpers ──

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const formatCurrency = (amount: string) => {
    return `¥${parseFloat(amount).toFixed(2)}`
  }

  // ── UI ──

  return (
    <div className="p-4 lg:p-6">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900">发票管理</h1>
            <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
              {pagination.total} 张发票
            </span>
          </div>
          <button
            onClick={fetchInvoices}
            className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition text-sm"
          >
            <RefreshCw size={16} />
            刷新
          </button>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">状态筛选</label>
              <select
                value={filters.status}
                onChange={(e) => handleFilterChange('status', e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              >
                <option value="">全部状态</option>
                <option value="pending">待审核</option>
                <option value="approved">已批准</option>
                <option value="issued">已开票</option>
                <option value="rejected">已拒绝</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">用户 ID</label>
              <input
                type="number"
                value={filters.userId}
                onChange={(e) => handleFilterChange('userId', e.target.value)}
                placeholder="输入用户 ID"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>
            
            <div className="flex items-end">
              <button
                onClick={fetchInvoices}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
              >
                <Filter size={14} className="inline mr-1" />
                应用筛选
              </button>
            </div>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4">
            <div className="flex items-center gap-2 text-red-700">
              <AlertCircle size={16} />
              <span className="text-sm">{error}</span>
            </div>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            <span className="ml-2 text-slate-600">加载中...</span>
          </div>
        )}

        {/* Invoices Table */}
        {!loading && invoices.length > 0 && (
          <>
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-slate-50 text-left">
                      <th className="px-4 py-3 text-sm font-medium text-slate-500">ID</th>
                      <th className="px-4 py-3 text-sm font-medium text-slate-500">用户</th>
                      <th className="px-4 py-3 text-sm font-medium text-slate-500">抬头</th>
                      <th className="px-4 py-3 text-sm font-medium text-slate-500">金额</th>
                      <th className="px-4 py-3 text-sm font-medium text-slate-500">状态</th>
                      <th className="px-4 py-3 text-sm font-medium text-slate-500">发票号</th>
                      <th className="px-4 py-3 text-sm font-medium text-slate-500">申请时间</th>
                      <th className="px-4 py-3 text-sm font-medium text-slate-500">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {invoices.map((invoice) => {
                      const status = statusConfig[invoice.status] || statusConfig.pending
                      return (
                        <tr key={invoice.id} className="hover:bg-slate-50 transition">
                          <td className="px-4 py-3">
                            <div className="text-sm font-medium text-slate-900">{invoice.id}</div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-sm text-slate-900">{invoice.userId}</div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-sm text-slate-900">{invoice.invoiceTitle}</div>
                            {invoice.invoiceTaxId && (
                              <div className="text-xs text-slate-500">税号: {invoice.invoiceTaxId}</div>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-sm font-semibold text-slate-900">
                              {formatCurrency(invoice.amount)}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${status.bgColor}`}>
                              <status.icon className={`h-3 w-3 ${status.color}`} />
                              <span className={status.color}>{status.label}</span>
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-sm text-slate-900">
                              {invoice.invoiceNumber || '-'}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-500">
                            {formatDate(invoice.createdAt)}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              {invoice.status === 'pending' && (
                                <>
                                  <button
                                    onClick={() => handleApprove(invoice.id)}
                                    disabled={actionLoading}
                                    className="flex items-center gap-1 text-sm text-green-600 hover:text-green-700 transition disabled:opacity-50"
                                  >
                                    <CheckCircle size={14} />
                                    通过
                                  </button>
                                  <button
                                    onClick={() => {
                                      setSelectedInvoice(invoice)
                                      setShowRejectModal(true)
                                    }}
                                    disabled={actionLoading}
                                    className="flex items-center gap-1 text-sm text-red-600 hover:text-red-700 transition disabled:opacity-50"
                                  >
                                    <XCircle size={14} />
                                    拒绝
                                  </button>
                                </>
                              )}
                              {invoice.status === 'approved' && (
                                <>
                                  <button
                                    onClick={() => {
                                      setSelectedInvoice(invoice)
                                      setShowIssueModal(true)
                                    }}
                                    disabled={actionLoading}
                                    className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 transition disabled:opacity-50"
                                  >
                                    <FileText size={14} />
                                    开票
                                  </button>
                                  <label className="flex items-center gap-1 text-sm text-purple-600 hover:text-purple-700 transition cursor-pointer">
                                    <Upload size={14} />
                                    上传
                                    <input
                                      type="file"
                                      accept=".pdf,.jpg,.png"
                                      className="hidden"
                                      onChange={(e) => {
                                        const file = e.target.files?.[0]
                                        if (file) handleUpload(invoice.id, file)
                                      }}
                                    />
                                  </label>
                                </>
                              )}
                              {invoice.status === 'issued' && invoice.invoiceFileUrl && (
                                <a
                                  href={invoice.invoiceFileUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 transition"
                                >
                                  <Download size={14} />
                                  下载
                                </a>
                              )}
                              <button
                                onClick={() => {
                                  setSelectedInvoice(invoice)
                                  setShowDetailModal(true)
                                }}
                                className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 transition"
                              >
                                <Eye size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Pagination */}
            <PaginationBar
              currentPage={pagination.page}
              totalPages={pagination.totalPages}
              totalItems={pagination.total}
              pageSize={pagination.pageSize}
              onPageChange={handlePageChange}
            />
          </>
        )}

        {/* Reject Modal */}
        {showRejectModal && selectedInvoice && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl shadow-lg max-w-md w-full p-6">
              <h2 className="text-xl font-bold text-slate-900 mb-4">拒绝发票申请</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    拒绝原因 <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    rows={4}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    placeholder="请输入拒绝原因"
                  />
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setShowRejectModal(false)
                      setRejectReason('')
                      setSelectedInvoice(null)
                    }}
                    className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleReject}
                    disabled={actionLoading}
                    className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition disabled:opacity-50"
                  >
                    {actionLoading ? '处理中...' : '确认拒绝'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Issue Modal */}
        {showIssueModal && selectedInvoice && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl shadow-lg max-w-md w-full p-6">
              <h2 className="text-xl font-bold text-slate-900 mb-4">标记已开票</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    发票号码 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={invoiceNo}
                    onChange={(e) => setInvoiceNo(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    placeholder="请输入发票号码"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    发票文件 URL（可选）
                  </label>
                  <input
                    type="text"
                    value={fileUrl}
                    onChange={(e) => setFileUrl(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    placeholder="已上传的文件 URL"
                  />
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setShowIssueModal(false)
                      setInvoiceNo('')
                      setFileUrl('')
                      setSelectedInvoice(null)
                    }}
                    className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleIssue}
                    disabled={actionLoading}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
                  >
                    {actionLoading ? '处理中...' : '确认开票'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Detail Modal */}
        {showDetailModal && selectedInvoice && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl shadow-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6">
              <h2 className="text-xl font-bold text-slate-900 mb-4">发票详情</h2>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-slate-500">ID</label>
                    <div className="text-sm font-medium text-slate-900">{selectedInvoice.id}</div>
                  </div>
                  <div>
                    <label className="text-sm text-slate-500">用户 ID</label>
                    <div className="text-sm font-medium text-slate-900">{selectedInvoice.userId}</div>
                  </div>
                  <div>
                    <label className="text-sm text-slate-500">金额</label>
                    <div className="text-sm font-medium text-slate-900">{formatCurrency(selectedInvoice.amount)}</div>
                  </div>
                  <div>
                    <label className="text-sm text-slate-500">状态</label>
                    <div className="text-sm font-medium text-slate-900">{statusConfig[selectedInvoice.status]?.label}</div>
                  </div>
                  <div>
                    <label className="text-sm text-slate-500">发票类型</label>
                    <div className="text-sm font-medium text-slate-900">
                      {selectedInvoice.invoiceType === 'special' ? '增值税专票' : '普通发票'}
                    </div>
                  </div>
                  <div>
                    <label className="text-sm text-slate-500">发票抬头</label>
                    <div className="text-sm font-medium text-slate-900">{selectedInvoice.invoiceTitle}</div>
                  </div>
                  {selectedInvoice.invoiceTaxId && (
                    <div>
                      <label className="text-sm text-slate-500">税号</label>
                      <div className="text-sm font-medium text-slate-900">{selectedInvoice.invoiceTaxId}</div>
                    </div>
                  )}
                  {selectedInvoice.invoiceNumber && (
                    <div>
                      <label className="text-sm text-slate-500">发票号码</label>
                      <div className="text-sm font-medium text-slate-900">{selectedInvoice.invoiceNumber}</div>
                    </div>
                  )}
                  {selectedInvoice.rejectReason && (
                    <div className="col-span-2">
                      <label className="text-sm text-slate-500">拒绝原因</label>
                      <div className="text-sm font-medium text-red-600">{selectedInvoice.rejectReason}</div>
                    </div>
                  )}
                  <div>
                    <label className="text-sm text-slate-500">申请时间</label>
                    <div className="text-sm font-medium text-slate-900">{formatDate(selectedInvoice.createdAt)}</div>
                  </div>
                  {selectedInvoice.reviewedAt && (
                    <div>
                      <label className="text-sm text-slate-500">审核时间</label>
                      <div className="text-sm font-medium text-slate-900">{formatDate(selectedInvoice.reviewedAt)}</div>
                    </div>
                  )}
                  {selectedInvoice.issuedAt && (
                    <div>
                      <label className="text-sm text-slate-500">开票时间</label>
                      <div className="text-sm font-medium text-slate-900">{formatDate(selectedInvoice.issuedAt)}</div>
                    </div>
                  )}
                </div>
              </div>
              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => {
                    setShowDetailModal(false)
                    setSelectedInvoice(null)
                  }}
                  className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition"
                >
                  关闭
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
