// ── 充值相关 ──

export interface RechargeOrder {
  id: number
  orderNo: string
  userId: number
  amount: number
  channel: string
  status: string
  createdAt: string
  paidAt?: string
  remark?: string
  bankName?: string
  accountNumber?: string
  transferDate?: string
  /** 双审字段 */
  firstConfirmedBy?: number | null
  firstConfirmedAt?: string | null
  secondConfirmedBy?: number | null
  secondConfirmedAt?: string | null
  voucherNo?: string | null
  confirmedBy?: number | null
  confirmedAt?: string | null
  channelOrderNo?: string | null
  voucherImage?: string | null
  expiresAt?: string | null
  userEmail?: string
  userNickname?: string | null
}
