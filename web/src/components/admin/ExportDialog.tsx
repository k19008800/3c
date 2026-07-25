import { useState } from 'react'
import { X, Download, Calendar, FileSpreadsheet, FileText } from 'lucide-react'

export interface ExportConfig {
  type: 'recharge' | 'withdraw' | 'commission' | 'balance' | 'summary'
  format: 'csv' | 'xlsx'
  dateRange: {
    start: Date
    end: Date
  }
  filters?: {
    status?: string
    userId?: number
    minAmount?: number
    maxAmount?: number
  }
}

interface ExportDialogProps {
  isOpen: boolean
  onClose: () => void
  onExport: (config: ExportConfig) => Promise<void>
  type: ExportConfig['type']
  title: string
}

export default function ExportDialog({ isOpen, onClose, onExport, type, title }: ExportDialogProps) {
  const [format, setFormat] = useState<'csv' | 'xlsx'>('xlsx')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [userIdFilter, setUserIdFilter] = useState('')
  const [minAmount, setMinAmount] = useState('')
  const [maxAmount, setMaxAmount] = useState('')
  const [exporting, setExporting] = useState(false)

  if (!isOpen) return null

  const handleExport = async () => {
    if (!startDate || !endDate) {
      alert('请选择时间范围')
      return
    }

    const config: ExportConfig = {
      type,
      format,
      dateRange: {
        start: new Date(startDate),
        end: new Date(endDate + 'T23:59:59'),
      },
    }

    if (statusFilter) {
      config.filters = { ...config.filters, status: statusFilter }
    }
    if (userIdFilter) {
      config.filters = { ...config.filters, userId: parseInt(userIdFilter) }
    }
    if (minAmount) {
      config.filters = { ...config.filters, minAmount: parseFloat(minAmount) }
    }
    if (maxAmount) {
      config.filters = { ...config.filters, maxAmount: parseFloat(maxAmount) }
    }

    setExporting(true)
    try {
      await onExport(config)
      onClose()
    } catch (err: any) {
      alert(err.message || '导出失败')
    } finally {
      setExporting(false)
    }
  }

  const getStatusOptions = () => {
    switch (type) {
      case 'recharge':
        return (
          <>
            <option value="">全部状态</option>
            <option value="pending">待支付</option>
            <option value="paid">已支付</option>
            <option value="confirmed">已确认</option>
            <option value="failed">失败</option>
            <option value="expired">已过期</option>
          </>
        )
      case 'withdraw':
        return (
          <>
            <option value="">全部状态</option>
            <option value="pending">待审核</option>
            <option value="first_approved">初审通过</option>
            <option value="approved">已批准</option>
            <option value="rejected">已拒绝</option>
            <option value="paid">已打款</option>
            <option value="failed">失败</option>
          </>
        )
      case 'commission':
        return (
          <>
            <option value="">全部状态</option>
            <option value="pending">待结算</option>
            <option value="settled">已结算</option>
            <option value="cancelled">已取消</option>
          </>
        )
      case 'balance':
        return (
          <>
            <option value="">全部类型</option>
            <option value="recharge">充值</option>
            <option value="withdraw">提现</option>
            <option value="commission">佣金</option>
            <option value="consume">消费</option>
            <option value="refund">退款</option>
            <option value="adjust">调整</option>
          </>
        )
      default:
        return <option value="">全部</option>
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h3 className="text-lg font-semibold text-slate-900">
            导出{title}
          </h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-4 space-y-4">
          {/* 格式选择 */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              导出格式
            </label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="format"
                  value="xlsx"
                  checked={format === 'xlsx'}
                  onChange={(e) => setFormat(e.target.value as 'xlsx')}
                  className="text-blue-600"
                />
                <FileSpreadsheet size={18} className="text-green-600" />
                <span className="text-sm">Excel (.xlsx)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="format"
                  value="csv"
                  checked={format === 'csv'}
                  onChange={(e) => setFormat(e.target.value as 'csv')}
                  className="text-blue-600"
                />
                <FileText size={18} className="text-blue-600" />
                <span className="text-sm">CSV (.csv)</span>
              </label>
            </div>
          </div>

          {/* 时间范围 */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              <Calendar size={16} className="inline mr-1" />
              时间范围
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1">开始日期</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">结束日期</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* 筛选条件 */}
          <div className="border-t pt-4 space-y-3">
            <h4 className="text-sm font-medium text-slate-700">筛选条件（可选）</h4>

            {/* 状态筛选 */}
            <div>
              <label className="block text-xs text-slate-500 mb-1">状态</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {getStatusOptions()}
              </select>
            </div>

            {/* 用户 ID */}
            <div>
              <label className="block text-xs text-slate-500 mb-1">用户 ID</label>
              <input
                type="number"
                value={userIdFilter}
                onChange={(e) => setUserIdFilter(e.target.value)}
                placeholder="输入用户 ID"
                className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* 金额范围 */}
            <div>
              <label className="block text-xs text-slate-500 mb-1">金额范围</label>
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="number"
                  value={minAmount}
                  onChange={(e) => setMinAmount(e.target.value)}
                  placeholder="最小金额"
                  step="0.01"
                  className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <input
                  type="number"
                  value={maxAmount}
                  onChange={(e) => setMaxAmount(e.target.value)}
                  placeholder="最大金额"
                  step="0.01"
                  className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t bg-slate-50 rounded-b-lg">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-700 hover:text-slate-900 transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Download size={16} />
            {exporting ? '导出中...' : '导出'}
          </button>
        </div>
      </div>
    </div>
  )
}
