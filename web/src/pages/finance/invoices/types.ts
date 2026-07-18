export interface InvoiceItem {
  id: number
  amount: string
  invoiceType: string
  title: string
  taxId: string | null
  bankInfo: string | null
  status: string
  reason: string | null
  createdAt: string
}

export interface InvoicesData {
  list: InvoiceItem[]
  total: number
  availableAmount: string
}

export const statusLabel: Record<string, string> = {
  pending: '待审核',
  approved: '已通过',
  issued: '已开票',
  rejected: '已拒绝',
}

export const statusColor: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-blue-100 text-blue-700',
  issued: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
}

export const invoiceTypeLabel: Record<string, string> = {
  normal: '普票',
  special: '专票',
}

export const STATUS_OPTIONS = [
  { value: 'all', label: '全部状态' },
  { value: 'pending', label: '待审核' },
  { value: 'approved', label: '已通过' },
  { value: 'issued', label: '已开票' },
  { value: 'rejected', label: '已拒绝' },
]
