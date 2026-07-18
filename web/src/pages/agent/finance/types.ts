import {
  TrendingUp, TrendingDown, Minus,
  ArrowUpRight, ArrowDownRight, Ban, Lock,
} from 'lucide-react'

export interface SettlementData {
  account: {
    settledCommission: string
    pendingWithdraw: string
    frozenAmount: string
    redemptionLocked: string
    available: string
  }
  monthSummary: {
    deduction: number
    freeze: number
    unfreeze: number
    netChange: number
  }
  recentEntries: LedgerEntry[]
}

export interface LedgerEntry {
  id: number
  balanceType: string
  changeType: string
  amount: number
  balanceBefore: number
  balanceAfter: number
  refType: string | null
  refId: number | null
  remark: string | null
  createdAt: string
}

export interface LedgerQueryResult {
  list: LedgerEntry[]
  total: number
  page: number
  pageSize: number
}

export const balanceTypeMap: Record<string, string> = {
  commission: '佣金',
  redemption: '兑换',
  withdraw: '提现',
  deduction: '扣款',
  freeze: '冻结',
  unfreeze: '解冻',
  refund: '退款',
  adjustment: '调整',
}

export const changeTypeMap: Record<string, { label: string; color: string; icon: any }> = {
  commission: { label: '佣金收入', color: 'text-green-600', icon: TrendingUp },
  deduction: { label: '扣款', color: 'text-red-600', icon: TrendingDown },
  freeze: { label: '冻结', color: 'text-orange-600', icon: Ban },
  unfreeze: { label: '解冻', color: 'text-green-600', icon: Lock },
  refund: { label: '退款', color: 'text-blue-600', icon: ArrowUpRight },
  withdraw: { label: '提现', color: 'text-red-600', icon: ArrowDownRight },
  adjustment: { label: '调整', color: 'text-purple-600', icon: Minus },
}

export function formatAmount(val: string | number): string {
  const n = typeof val === 'string' ? parseFloat(val) : val
  return n.toFixed(6)
}
