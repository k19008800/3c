// ── 拒绝原因预设 ──
export const REJECT_REASONS = [
  '银行信息有误，请核对后重新提交',
  '风控拦截，请联系客服处理',
  '提现金额超限，请调整金额',
  '身份信息不符，请重新提交',
  '银行卡号格式错误',
  '开户行名称不完整',
]

// ── 审核模式 ──
export type ReviewKind = 'first-review' | 'second-review' | 'mark-paid'

// ── 统计数据类型 ──
export interface WithdrawStats {
  pendingFirstReview: number
  pendingSecondReview: number
  totalAmount: number
  totalPaid: number
  trend: { value: number }[]
}
