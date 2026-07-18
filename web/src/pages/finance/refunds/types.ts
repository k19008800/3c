export interface RefundItem {
  id: number
  amount: string
  refundType: string
  reason: string
  callId: string | null
  status: string
  remark: string | null
  createdAt: string
}

export interface RefundsData {
  list: RefundItem[]
  total: number
}

export const statusLabel: Record<string, string> = {
  pending: '待审核',
  approved: '已通过',
  completed: '已完成',
  rejected: '已拒绝',
}

export const statusColor: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
}

export const refundTypeLabel: Record<string, string> = {
  overcharge: '多收费用',
  service_issue: '服务问题',
  system_error: '系统错误',
  other: '其他',
}

export const REFUND_TYPE_OPTIONS = [
  { value: 'overcharge', label: '多收费用' },
  { value: 'service_issue', label: '服务问题' },
  { value: 'system_error', label: '系统错误' },
  { value: 'other', label: '其他' },
]

export const STATUS_OPTIONS = [
  { value: 'all', label: '全部状态' },
  { value: 'pending', label: '待审核' },
  { value: 'approved', label: '已通过' },
  { value: 'completed', label: '已完成' },
  { value: 'rejected', label: '已拒绝' },
]
