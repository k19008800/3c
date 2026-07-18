// ── Shared types, helpers & constants for reconciliation pages ──

export interface SettlementData {
  period: string
  openingBalance: number
  monthDeduction: number
  monthFreeze: number
  monthUnfreeze: number
  monthRefund: number
  closingBalance: number
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
  refCodeId: number | null
  remark: string | null
  createdAt: string
}

export type TabKey = 'settlement' | 'ledger'

export const CHANGE_TYPE_LABEL: Record<string, string> = {
  deduction: '扣费',
  freeze: '冻结',
  unfreeze: '解冻',
  refund: '退款',
}

export const BALANCE_TYPE_LABEL: Record<string, string> = {
  available: '可用余额',
  frozen: '冻结余额',
}

export const CHANGE_TYPE_COLOR: Record<string, string> = {
  deduction: 'text-red-600',
  freeze: 'text-amber-600',
  unfreeze: 'text-green-600',
  refund: 'text-blue-600',
}

export function formatAmount(v: number | string): string {
  const n = typeof v === 'string' ? parseFloat(v) : v
  if (isNaN(n)) return '0.00'
  return n.toFixed(4)
}

export function fmtMicro(v: number): string {
  return (v / 1_000_000).toFixed(4)
}

export interface ReconStatItem {
  label: string
  value: string
  color: string
  highlight?: boolean
}

export function generateMonthOptions(): { value: string; label: string }[] {
  const now = new Date()
  const opts: { value: string; label: string }[] = []
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    opts.push({
      value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: `${d.getFullYear()}年${d.getMonth() + 1}月`,
    })
  }
  return opts
}
