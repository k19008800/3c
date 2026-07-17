// ============================================================
//  types.ts — 活动管理共享类型
// ============================================================

/** 活动 */
export interface Campaign {
  id: number
  name: string
  description: string | null
  status: string // draft | active | ended | archived
  budget_amount: string
  start_at: string | null
  end_at: string | null
  createdAt: string
  updatedAt: string
}

/** 活动列表页统计 */
export interface CampaignStats {
  total: number
  active: number
  ended: number
  totalBudget: string
}

/** 代理分配记录 */
export interface Allocation {
  agent_id: number
  agent_name: string
  allocated: number
  used: number
  token_amount: number
  valid_days: number
}

/** 兑换码批次 */
export interface CodeBatch {
  id: number
  count: number
  faceValue: string
  validDays: number
  createdAt: string
  usedCount: number
}

/** 活动详情页效果统计 */
export interface CampaignDetailStats {
  participantCount: number
  redeemRate: number
  totalCommission: number
  roi: number
}

// ── Status helpers ──

export const statusLabel: Record<string, string> = {
  draft: '草稿',
  active: '进行中',
  ended: '已结束',
  archived: '已归档',
}

export const statusColor: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-600',
  active: 'bg-green-100 text-green-700',
  ended: 'bg-blue-100 text-blue-700',
  archived: 'bg-slate-200 text-slate-500',
}

export const statusOptions = [
  { value: 'draft', label: '草稿' },
  { value: 'active', label: '进行中' },
  { value: 'ended', label: '已结束' },
  { value: 'archived', label: '已归档' },
]

/** 空表单默认值 */
export const emptyForm = {
  name: '',
  description: '',
  start_at: '',
  end_at: '',
  budget_amount: '0',
}
