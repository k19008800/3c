import { useEffect, useState, useCallback } from 'react'
import { get, post } from '@/lib/api'
import type { PaginatedData } from '@/types'
import PaginationBar from '@/components/ui/PaginationBar'
import {
  Loader2, AlertCircle, RefreshCw, FileText,
  Plus, Download, CheckCircle, XCircle, Clock,
  Search, Filter, Calendar, DollarSign, Building,
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
  issuedAt?: string
  bankName?: string
  bankAccount?: string
  companyAddress?: string
  companyPhone?: string
  refOrderId?: number
  description?: string
  createdAt: string
  updatedAt: string
}

interface AvailableAmount {
  totalRecharge: string
  usedAmount: string
  availableAmount: string
  minInvoiceAmount: string
}

interface CreateInvoiceRequest {
  amount: string
  invoiceType: 'normal' | 'special'
  invoiceTitle: string
  invoiceTaxId?: string
  bankName?: string
  bankAccount?: string
  companyAddress?: string
  companyPhone?: string
  refOrderId?: number
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

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [availableAmount, setAvailableAmount] = useState<AvailableAmount | null>(null)
  
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: card, 20,
    total: 0,
    totalPages: 1,
  })
  
  const [filters, setFilters] = useState({
    status: '',
    search: '',
    startDate: '',
    endDate: '',
  })
  
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [createLoading, setCreateLoading] = useState(false)
  const [createForm, setCreateForm] = useState<CreateInvoiceRequest>({
    amount: '',
    invoiceType: 'normal',
    invoiceTitle: '',
    invoiceTaxId: '',
    bankName: '',
    bankAccount: '',
    companyAddress: '',
    companyPhone: '',
  })

  // ── Data Fetching ──

  const fetchInvoices = useCallback(async () => {
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
      })

      const response = await get<PaginatedData<Invoice>>(`/api/v1/invoices?${params}`)
      setInvoices(response.data?.items || [])
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

  const fetchAvailableAmount = useCallback(async () => {
    try {
      const response = await get<AvailableAmount>('/api/v1/invoices/available-amount')
      setAvailableAmount(response.data)
    } catch (err) {
      console.error('获取可开票额度失败:', err)
    }
  }, [])

  useEffect(() => {
    fetchInvoices()
    fetchAvailableAmount()
  }, [fetchInvoices, fetchAvailableAmount])

  // ── Handlers ──

  const handlePageChange = (page: number) => {
    setPagination(prev => ({ ...prev, page }))
  }

  const handleFilterChange = (key: keyof typeof filters, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }))
    setPagination(prev => ({ ...prev, page: 1 }))
  }

  const handleApplyFilters = () => {
    fetchInvoices()
  }

  const handleResetFilters = () => {
    setFilters({
      status: '',
      search: '',
      startDate: '',
      endDate: '',
    })
    setPagination(prev => ({ ...prev, page: 1 }))
  }

  const handleCreateInvoice = async () => {
    if (!createForm.amount || !createForm.invoiceTitle) {
      setError('金额和发票抬头为必填项')
      return
    }

    setCreateLoading(true)
    try {
      await post('/api/v1/invoices', createForm)
      setShowCreateModal(false)
      setCreateForm({
        amount: '',
        invoiceType: 'normal',
        invoiceTitle: '',
        invoiceTaxId: '',
        bankName: '',
        bankAccount: '',
        companyAddress: '',
        companyPhone: '',
      })
      fetchInvoices()
      fetchAvailableAmount()
    } catch (err: any) {
      setError(err.message || '提交发票申请失败')
    } finally {
      setCreateLoading(false)
    }
  }

  const handleDownloadInvoice = async (invoiceId: number) => {
    try {
      const response = await get(`/api/v1/invoices/${invoiceId}/download`)
      // 这里处理PDF下载逻辑
      console.log('下载发票:', invoiceId)
    } catch (err) {
      setError('下载发票失败')
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
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm"
          >
            <Plus size={16} />
            申请开票
          </button>
        </div>

        {/* Available Amount Card */}
        {availableAmount && (
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-800 mb-1">可开票额度</h3>
                <p className="text-2xl font-bold text-blue-600">
                  {formatCurrency(availableAmount.availableAmount)}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  累计充值: {formatCurrency(availableAmount.totalRecharge)} • 
                  已开票: {formatCurrency(availableAmount.usedAmount)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-500">最低开票金额</p>
                <p className="text-sm font-semibold text-slate-700">
                  {formatCurrency(availableAmount.minInvoiceAmount)}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">状态筛选</label>
              <select
                value={filters.status}
                onChange={(e) => handleFilterChange('status', e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              >
                <option value="">全部状态</option>
                <option value="pending">待审核</option>
                <option value="processing">处理中</option>
                <option value="approved">已批准</option>
                <option value="issued">已开票</option>
                <option value="cancelled">已取消</option>
                <option value="rejected">已拒绝</option>
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
                  placeholder="发票抬头/编号"
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

        {/* Invoices Table */}
        {!loading && invoices.length === 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 text-center">
            <FileText className="h-12 w-12 text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-slate-700 mb-2">暂无发票记录</h3>
            <p className="text-slate-500 mb-4">您还没有申请过发票</p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
            >
              申请第一张发票
            </button>
          </div>
        )}

        {!loading && invoices.length > 0 && (
          <>
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-slate-50 text-left">
                      <th className="px-4 py-3 text-sm font-medium text-slate-500">发票编号</th>
                      <th className="px-4 py-3 text-sm font-medium text-slate-500">抬头</th>
                      <th className="px-4 py-3 text-sm font-medium text-slate-500">金额</th>
                      <th className="px-4 py-3 text-sm font-medium text-slate-500">状态</th>
                      <th className="px-4 py-3 text-sm font-medium text-slate-500">类型</th>
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
                            <div className="text-sm font-medium text-slate-900">
                              {invoice.invoiceNumber || `INV-${invoice.id.toString().padStart(6, '0')}`}
                            </div>
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
                            <span className="text-sm text-slate-600">
                              {invoice.invoiceType === 'special' ? '增值税专票' : '普通发票'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-500">
                            {formatDate(invoice.createdAt)}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              {invoice.status === 'issued' && (
                                <button
                                  onClick={() => handleDownloadInvoice(invoice.id)}
                                  className="flex items-center gap-1 text-sm text-blue-500 hover:text-blue-700 transition"
                                >
                                  <Download size={14} />
                                  下载
                                </button>
                              )}
                              <button
                                onClick={() => {/* 查看详情 */}}
                                className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 transition"
                              >
                                详情
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

        {/* Create Invoice Modal */}
        {showCreateModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl shadow-lg max-w-md w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-bold text-slate-900">申请开票</h2>
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
                      开票金额 <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                      <input
                        type="number"
                        value={createForm.amount}
                        onChange={(e) => setCreateForm(prev => ({ ...prev, amount: e.target.value }))}
                        placeholder="请输入开票金额"
                        className="w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg text-sm"
                      />
                    </div>
                    {availableAmount && (
                      <p className="text-xs text-slate-500 mt-1">
                        可开票额度: {formatCurrency(availableAmount.availableAmount)} • 
                        最低金额: {formatCurrency(availableAmount.minInvoiceAmount)}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      发票类型 <span className="text-red-500">*</span>
                    </label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setCreateForm(prev => ({ ...prev, invoiceType: 'normal' }))}
                        className={`flex-1 px-4 py-2 border rounded-lg text-sm ${createForm.invoiceType === 'normal' ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-slate-50 border-slate-300 text-slate-700'}`}
                      >
                        普通发票
                      </button>
                      <button
                        type="button"
                        onClick={() => setCreateForm(prev => ({ ...prev, invoiceType: 'special' }))}
                        className={`flex-1 px-4 py-2 border rounded-lg text-sm ${createForm.invoiceType === 'special' ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-slate-50 border-slate-300 text-slate-700'}`}
                      >
                        增值税专票
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      发票抬头 <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={createForm.invoiceTitle}
                      onChange={(e) => setCreateForm(prev => ({ ...prev, invoiceTitle: e.target.value }))}
                      placeholder="请输入发票抬头"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    />
                  </div>

                  {createForm.invoiceType === 'special' && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">
                          纳税人识别号
                        </label>
                        <input
                          type="text"
                          value={createForm.invoiceTaxId || ''}
                          onChange={(e) => setCreateForm(prev => ({ ...prev, invoiceTaxId: e.target.value }))}
                          placeholder="请输入纳税人识别号"
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">
                          开户银行
                        </label>
                        <input
                          type="text"
                          value={createForm.bankName || ''}
                          onChange={(e) => setCreateForm(prev => ({ ...prev, bankName: e.target.value }))}
                          placeholder="请输入开户银行"
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">
                          银行账号
                        </label>
                        <input
                          type="text"
                          value={createForm.bankAccount || ''}
                          onChange={(e) => setCreateForm(prev => ({ ...prev, bankAccount: e.target.value }))}
                          placeholder="请输入银行账号"
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">
                          公司地址
                        </label>
                        <input
                          type="text"
                          value={createForm.companyAddress || ''}
                          onChange={(e) => setCreateForm(prev => ({ ...prev, companyAddress: e.target.value }))}
                          placeholder="请输入公司地址"
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">
                          公司电话
                        </label>
                        <input
                          type="text"
                          value={createForm.companyPhone || ''}
                          onChange={(e) => setCreateForm(prev => ({ ...prev, companyPhone: e.target.value }))}
                          placeholder="请输入公司电话"
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                        />
                      </div>
                    </>
                  )}

                  <div className="pt-4 border-t border-slate-200">
                    <div className="flex gap-3">
                      <button
                        onClick={() => setShowCreateModal(false)}
                        className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition"
                      >
                        取消
                      </button>
                      <button
                        onClick={handleCreateInvoice}
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