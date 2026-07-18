// ── QuotaRecord — 配额记录接口 ──

export interface QuotaRecord {
  id: number
  userId: number
  userEmail: string | null
  userNickname: string | null
  quotaType: string
  quotaAmount: string
  usedAmount: string | null
  alertPercent: string
  periodStart: string
  periodEnd: string
  setBy: number
  setByRole: string
  rpmLimit: number | null
  tpmLimit: number | null
  reason: string | null
  createdAt: string
  updatedAt: string | null
}

export interface QuotaCreateForm {
  userId: string
  quotaType: string
  quotaAmount: string
  alertPercent: string
  periodStart: string
  periodEnd: string
  reason: string
  rpmLimit: number | null
  tpmLimit: number | null
}

export interface QuotaEditForm {
  quotaAmount: string
  usedAmount: string
  alertPercent: string
  periodEnd: string
  reason: string
  rpmLimit: number | null
  tpmLimit: number | null
}
