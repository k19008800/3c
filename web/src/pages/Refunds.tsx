import { useEffect, useState, useCallback } from 'react'
import { get, post } from '@/lib/api'
import type { PaginatedData } from '@/types'
import PaginationBar from '@/components/ui/PaginationBar'
import {
  Loader2, AlertCircle, RefreshCw, RotateCcw,
  Plus, Search, Filter, Calendar, DollarSign,
  Clock, CheckCircle, XCircle, MessageSquare, Receipt,
} from 'lucide-react'

// ── Types ──

interface RefundRequest {
  id: number
  userId: number
  amount: string
  refundType: 'overcharge' | 'service_issue' | 'system_error' | 'other'
  reason: string
  status: 'pending' | 'reviewing' | 'approved' | 'rejected' | 'processed' | 'cancelled'
  refCallLogId?: number
  refOrderId?: number
  reviewNotes?: string
  processedAt?: string
  description?: string
  createdAt: string
  updatedAt: string
}

interface CreateRefundRequest {
  amount: string
  refundType: 'overcharge' | 'service_issue' | 'system_error' | 'other'
  reason: string
  refCallLogId?: number
  refOrderId?: number
}

// ── Status config ──

const statusConfig: Record<string, { label: string; icon: any; color: string; bgColor: string }> = {
  pending: { label: '待处理', icon: Clock, color: 'text-amber-600', bgColor: 'bg-amber-50 border-amber-200' },
  reviewing: { label: '审核中', icon: Loader2, color: 'text-blue-600', bgColor: 'bg-blue-50 border-blue-200' },
  approved: { label: '已批准', icon: CheckCircle, color: 'text-green-600', bgColor: 'bg-green-50 border-green-200' },
  rejected: { label: '已拒绝', icon: XCircle, color: 'text-red-600', bgColor: 'bg-red-50 border-red-200' },
  processed: { label: '已处理', icon: RotateCcw, color: 'text-purple-600', bgColor: 'bg-purple-50 border-purple-200' },
  cancelled: { label: '已取消', icon: XCircle, color: 'text-gray-600', bgColor: 'bg-gray-50 border-gray-200' },
}

const refundTypeConfig: Record<string, { label: string; description: string }> = {
  overcharge: { label: '多扣费', description: '系统多扣除了费用' },
  service_issue: { label: '服务问题', description: 'AI服务出现异常或未达预期' },
  system_error: { label: '系统错误', description: '平台系统错误导致的扣费' },
  other: { label: '其他原因', description: '其他退款原因' },
}

// ── Main Component ──

export default function RefundsPage() {
  const [refunds, setRefunds] = useState<RefundRequest[]>([])
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
    search: '',
    startDate: '',
    endDate: '',
    refundType: '',
  })
  
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [createLoading, setCreateLoading] = useState(false)
  const [createForm, setCreateForm] = useState<CreateRefundRequest>({
    amount: '',
    refundType: 'other',
    reason: '',
  })

  // ── Data Fetching ──

  const fetchRefunds = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        pageSize: pagination.pageSize.toString(),
        ...(filters.status && { status: filters.status }),
        ...(filters.search && { search: filters.search }),
        ...(filters.startDate && { startDate: filters.startDate }),
        ...(filters.endDate && { endDate: filters.endDate }),
        ...(filters.refundType && { refundType: filters.refundType }),
      })

      const response = await get<PaginatedData<RefundRequest>>(`/api/v1/refunds?${params}`)
      setRefunds(response.data?.items || [])
      setPagination(prev => ({
        ...prev,
        total: response.data?.total || 0,
        totalPages: response.data?.totalPages || 1,
      }))
    } catch (err: any) {
      setError(err.message || '加载退款记录失败')
    } finally {
      setLoading(false)
    }
  }, [pagination.page, pagination.pageSize, filters])

  useEffect(() => {
    fetchRefunds()
  }, [fetchRefunds])

  // ── Handlers ──

  const handlePageChange = (page: number) => {
    setPagination(prev => ({ ...prev, page }))
  }

  const handleFilterChange = (key: keyof typeof filters, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }))
    setPagination(prev => ({ ...prev, page: 1 }))
  }

  const handleApplyFilters = () => {
    fetchRefunds()
  }

  const handleResetFilters = () => {
    setFilters({
      status: '',
      search: '',
      startDate: '',
      endDate: '',
      refundType: '',
    })
    setPagination(prev => ({ ...prev, page: 1 }))
  }

  const handleCreateRefund = async () => {
    if (!createForm.amount || !createForm.reason) {
      setError('金额和退款原因为必填项')
      return
    }

    setCreateLoading(true)
    try {
      await post('/api/v1/refunds', createForm)
      setShowCreateModal(false)
      setCreateForm({
        amount: '',
        refundType: 'other',
        reason: '',
      })
      fetchRefunds()
    } catch (err: any) {
      setError(err.message || '提交退款申请失败')
    } finally {
      setCreateLoading(false)
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

  const truncateText = (text: string, maxLength: number = 50) => {
    if (text.length <= maxLength) return text
    return text.substring(0, maxLength) + '...'
  }

  // ── UI ──

  return (
    <div className="p-4 lg:p-6">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900">退款申请</h1>
            <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
              {pagination.total} 条记录
            </span>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm"
          >
            <Plus size={16} />
            申请退款
          </button>
        </div>

        {/* Info Card */}
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-amber-100 rounded-lg">
              <Receipt className="h-5 w-5 text-amber-600" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-slate-800 mb-1">退款须知</h3>
              <ul className="text-xs text-slate-600 space-y-1">
                <li>• 退款申请将在1-3个工作日内审核</li>
                <li>• 请提供详细的退款原因和相关订单号</li>
                <li>• 审核通过后，退款将原路退回</li>
                <li>• 如有疑问，请联系客服 support@3cloud.ai</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">状态筛选</label>
              <select
                value={filters.status}
                onChange={(e) => handleFilterChange('status', e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              >
                <option value="">全部状态</option>
                <option value="pending">待处理</option>
                <option value="reviewing">审核中</option>
                <option value="approved">已批准</option>
                <option value="rejected">已拒绝</option>
                <option value="processed">已处理</option>
                <option value="cancelled">已取消</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">退款类型</label>
              <select
                value={filters.refundType}
                onChange={(e) => handleFilterChange('refundType', e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              >
                <option value="">全部类型</option>
                <option value="overcharge">多扣费</option>
                <option value="service_issue">服务问题</option>
                <option value="system_error">系统错误</option>
                <option value="other">其他原因</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">搜索</label>
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={filters.search}
                  onChange={(e) => handleFilterChange('search', e.target.value)}
                  placeholder="退款原因/订单号"
                  className="w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">开始日期</label>
              <input
                type="date"
                value={filters.startDate}
                onChange={(e) => handleFilterChange('startDate', e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">结束日期</label>
              <div className="flex gap-2">
                <input
                  type="date"
                  value={filters.endDate}
                  onChange={(e) => handleFilterChange('endDate', e.target.value)}
                  className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
                <div className="flex gap-1">
                  <button
                    onClick={handleApplyFilters}
                    className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
                  >
                    <Filter size={14} />
                  </button>
                  <button
                    onClick={handleResetFilters}
                    className="px-3 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm hover:bg-slate-200"
                  >
                    <RefreshCw size={14} />
                  </button>
                </div>
              </div>
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

        {/* Refunds Table */}
        {!loading && refunds.length === 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 text-center">
            <RotateCcw className="h-12 w-12 text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-slate-700 mb-2">暂无退款记录</h3>
            <p className="text-slate-500 mb-4">您还没有申请过退款</p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
            >
              申请第一笔退款
            </button>
          </div>
        )}

        {!loading && refunds.length > 0 && (
          <>
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-slate-50 text-left">
                      <th className="px-4 py-3 text-sm font-medium text-slate-500">退款编号</th>
                      <th className="px-4 py-3 text-sm font-medium text-slate-500">金额</th>
                      <th className="px-4 py-3 text-sm font-medium text-slate-500">类型</th>
                      <th className="px-4 py-3 text-sm font-medium text-slate-500">原因</th>
                      <th className="px-4 py-3 text-sm font-medium text-slate-500">状态</th>
                      <th className="px-4 py-3 text-sm font-medium text-slate-500">申请时间</th>
                      <th className="px-4 py-3 text-sm font-medium text-slate-500">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {refunds.map((refund) => {
                      const status = statusConfig[refund.status] || statusConfig.pending
                      const type = refundTypeConfig[refund.refundType] || refundTypeConfig.other
                      return (
                        <tr key={refund.id} className="hover:bg-slate-50 transition">
                          <td className="px-4 py-3">
                            <div className="text-sm font-medium text-slate-900">
                              REF-{refund.id.toString().padStart(6, '0')}
                            </div>
                            {refund.refCallLogId && (
                              <div className="text-xs text-slate-500">日志ID: {refund.refCallLogId}</div>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-sm font-semibold text-slate-900">
                              {formatCurrency(refund.amount)}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-sm text-slate-900">{type.label}</div>
                            <div className="text-xs text-slate-500">{type.description}</div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-sm text-slate-600 max-w-xs">
                              {truncateText(refund.reason, 60)}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${status.bgColor}`}>
                              <status.icon className={`h-3 w-3 ${status.color}`} />
                              <span className={status.color}>{status.label}</span>
                            </span>
                            {refund.reviewNotes && (
                              <div className="text-xs text-slate-500 mt-1">
                                {truncateText(refund.reviewNotes, 30)}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-500">
                            {formatDate(refund.createdAt)}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => {/* 查看详情 */}}
                                className="flex items-center gap-1 text-sm text-blue-500 hover:text-blue-700 transition"
                              >
                                <MessageSquare size={14} />
                                详情
                              </button>
                              {refund.status === 'pending' && (
                                <button
                                  onClick={() => {/* 取消申请 */}}
                                  className="flex items-center gap-1 text-sm text-red-500 hover:text-red-700 transition"
                                >
                                  取消
                                </button>
                              )}
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

        {/* Create Refund Modal */}
        {showCreateModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl shadow-lg max-w-md w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-bold text-slate-900">申请退款</h2>
                  <button
                    onClick={() => setShowCreateModal(false)}
                    className="text-slate-400 hover:text-slate-600"
                  >
                    <XCircle size={20} />
                  </button>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      退款金额 <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                      <input
                        type="number"
                        value={createForm.amount}
                        onChange={(e) => setCreateForm(prev => ({ ...prev, amount: e.target.value }))}
                        placeholder="请输入退款金额"
                        className="w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg text-sm"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      退款类型 <span className="text-red-500">*</span>
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {Object.entries(refundTypeConfig).map(([key, config]) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setCreateForm(prev => ({ ...prev, refundType: key as any }))}
                          className={`px-3 py-2 border rounded-lg text-sm text-left ${createForm.refundType === key ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-slate-50 border-slate-300 text-slate-700'}`}
                        >
                          <div className="font-medium">{config.label}</div>
                          <div className="text-xs text-slate-500 mt-0.5">{config.description}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      关联订单/日志ID（可选）
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="number"
                        value={createForm.refOrderId || ''}
                        onChange={(e) => setCreateForm(prev => ({ 
                          ...prev, 
                          refOrderId: e.target.value ? parseInt(e.target.value) : undefined 
                        }))}
                        placeholder="订单ID"
                        className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
                      />
                      <input
                        type="number"
                        value={createForm.refCallLogId || ''}
                        onChange={(e) => setCreateForm(prev => ({ 
                          ...prev, 
                          refCallLogId: e.target.value ? parseInt(e.target.value) : undefined 
                        }))}
                        placeholder="调用日志ID"
                        className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      退款原因 <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      value={createForm.reason}
                      onChange={(e) => setCreateForm(prev => ({ ...prev, reason: e.target.value }))}
                      placeholder="请详细描述退款原因，包括具体的时间、问题描述等"
                      rows={4}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    />
                    <p className="text-xs text-slate-500 mt-1">
                      请尽可能详细地描述问题，这将有助于我们快速处理您的退款申请
                    </p>
                  </div>

                  <div className="pt-4 border-t border-slate-200">
                    <div className="flex gap-3">
                      <button
                        onClick={() => setShowCreateModal(false)}
                        className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition"
                      >
                        取消
                      </button>
                      <button
                        onClick={handleCreateRefund}
                        disabled={createLoading}
                        className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {createLoading ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
                            提交中...
                          </>
                        ) : (
                          '提交申请'
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}