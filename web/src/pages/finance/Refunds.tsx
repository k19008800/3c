import { useEffect, useState, useCallback } from 'react'
import { get, post } from '@/lib/api'
import PaginationBar from '@/components/ui/PaginationBar'
import {
  Loader2, AlertCircle, RefreshCw, RotateCcw, Plus, X,
  CheckCircle2,
} from 'lucide-react'

// ── Types ──

interface RefundItem {
  id: number
  amount: string
  refundType: string
  reason: string
  callId: string | null
  status: string
  remark: string | null
  createdAt: string
}

interface RefundsData {
  list: RefundItem[]
  total: number
}

const statusLabel: Record<string, string> = {
  pending: '待审核',
  approved: '已通过',
  completed: '已完成',
  rejected: '已拒绝',
}

const statusColor: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
}

const refundTypeLabel: Record<string, string> = {
  overcharge: '多收费用',
  service_issue: '服务问题',
  system_error: '系统错误',
  other: '其他',
}

const refundTypeOptions = [
  { value: 'overcharge', label: '多收费用' },
  { value: 'service_issue', label: '服务问题' },
  { value: 'system_error', label: '系统错误' },
  { value: 'other', label: '其他' },
]

// ════════════════════════════════════════════

// ── 退款申请（用户端）─-
//
// 【业务说明】
//   用户申请退款，选择退款类型（调用异常/充值错误/服务不满意），填写金额和原因。
//   支持按状态筛选（全部/待审核/已通过/已拒绝）。
//   审核通过后金额自动返还至用户余额。
//
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

  const totalPages = Math.ceil(total / pageSize)

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

      {error && (
        <div className="flex items-center gap-2 p-3 text-sm rounded-lg bg-red-50 text-red-600">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {/* Refund list */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-semibold text-slate-800">退款记录</h2>
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
              className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">全部状态</option>
              <option value="pending">待审核</option>
              <option value="approved">已通过</option>
              <option value="completed">已完成</option>
              <option value="rejected">已拒绝</option>
            </select>
          </div>
          <button
            onClick={fetchData}
            className="flex items-center gap-1 px-3 py-1.5 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50"
          >
            <RefreshCw size={14} /> 刷新
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="animate-spin text-slate-400" size={24} />
          </div>
        ) : list.length === 0 ? (
          <div className="py-12 text-center text-slate-400">暂无退款记录</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-left">
                    <th className="px-6 py-3 font-medium text-slate-500">ID</th>
                    <th className="px-6 py-3 font-medium text-slate-500 text-right">金额</th>
                    <th className="px-6 py-3 font-medium text-slate-500">类型</th>
                    <th className="px-6 py-3 font-medium text-slate-500">原因</th>
                    <th className="px-6 py-3 font-medium text-slate-500">关联调用</th>
                    <th className="px-6 py-3 font-medium text-slate-500">状态</th>
                    <th className="px-6 py-3 font-medium text-slate-500">提交时间</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {list.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50 transition">
                      <td className="px-6 py-4 font-mono text-xs text-slate-500">#{item.id}</td>
                      <td className="px-6 py-4 text-right font-mono text-slate-700">¥{Number(item.amount).toFixed(2)}</td>
                      <td className="px-6 py-4 text-slate-600">{refundTypeLabel[item.refundType] || item.refundType}</td>
                      <td className="px-6 py-4 text-slate-600 max-w-[200px] truncate" title={item.reason}>{item.reason}</td>
                      <td className="px-6 py-4 text-xs text-slate-400 font-mono">{item.callId || '-'}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${statusColor[item.status] || 'bg-slate-100 text-slate-600'}`}>
                          {statusLabel[item.status] || item.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-xs text-slate-400 whitespace-nowrap">
                        {new Date(item.createdAt).toLocaleString('zh-CN')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <PaginationBar
                page={page}
                onPageChange={setPage}
                pageSize={pageSize}
                onPageSizeChange={() => {}}
                total={total}
                totalPages={totalPages}
              />
            )}
          </>
        )}
      </div>

      {/* Apply refund modal */}
      {showModal && (
        <ApplyRefundModal
          onClose={() => setShowModal(false)}
          onSuccess={() => { setShowModal(false); fetchData() }}
        />
      )}
    </div>
  )
}

// ════════════════════════════════════════════
//  Apply refund modal
// ════════════════════════════════════════════

function ApplyRefundModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void
  onSuccess: () => void
}) {
  const [refundType, setRefundType] = useState('overcharge')
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [callId, setCallId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async () => {
    setError('')
    const amt = parseFloat(amount)
    if (!amt || amt <= 0) { setError('请输入有效退款金额'); return }
    if (!reason.trim()) { setError('请填写退款原因'); return }

    setSaving(true)
    try {
      await post('/api/v1/refunds', {
        amount: amt,
        refundType,
        reason: reason.trim(),
        callId: callId.trim() || undefined,
      })
      onSuccess()
    } catch (err: any) {
      setError(err.message || '提交退款申请失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">提交退款申请</h2>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">&times;</button>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 text-sm rounded-lg bg-red-50 text-red-600">
              <AlertCircle size={16} /> {error}
            </div>
          )}

          <div>
            <label className="block text-xs text-slate-500 mb-1">退款类型 <span className="text-red-500">*</span></label>
            <select
              value={refundType}
              onChange={(e) => setRefundType(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {refundTypeOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-slate-500 mb-1">退款金额 <span className="text-red-500">*</span></label>
            <div className="relative">
              <span className="absolute left-3 top-2 text-slate-400 text-sm">¥</span>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                min={0.01}
                step={0.01}
                className="w-full pl-8 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-500 mb-1">退款原因 <span className="text-red-500">*</span></label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="请详细描述退款原因"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-500 mb-1">关联调用 ID</label>
            <input
              type="text"
              value={callId}
              onChange={(e) => setCallId(e.target.value)}
              placeholder="选填，如有相关调用记录请填写 ID"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button onClick={onClose} disabled={saving} className="px-4 py-2 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50">取消</button>
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              {saving ? '提交中...' : '提交申请'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
