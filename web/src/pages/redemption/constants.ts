// Redemption 模块常量

export const codeStatusMap: Record<string, { label: string; color: string }> = {
  unused: { label: '未使用', color: 'bg-blue-100 text-blue-700' },
  used: { label: '已使用', color: 'bg-green-100 text-green-700' },
  expired: { label: '已过期', color: 'bg-slate-100 text-slate-500' },
  revoked: { label: '已作废', color: 'bg-red-100 text-red-700' },
}

export const usageActionMap: Record<string, { label: string; color: string }> = {
  created: { label: '创建', color: 'bg-blue-100 text-blue-700' },
  redeemed: { label: '兑换', color: 'bg-green-100 text-green-700' },
  used: { label: '使用', color: 'bg-purple-100 text-purple-700' },
  gifted: { label: '转赠', color: 'bg-orange-100 text-orange-700' },
  received: { label: '接收', color: 'bg-cyan-100 text-cyan-700' },
  expired: { label: '过期', color: 'bg-slate-100 text-slate-500' },
  revoked: { label: '作废', color: 'bg-red-100 text-red-700' },
  partial_use: { label: '部分使用', color: 'bg-amber-100 text-amber-700' },
}

export const giftStatusMap: Record<string, { label: string; color: string }> = {
  pending: { label: '待接收', color: 'bg-amber-100 text-amber-700' },
  accepted: { label: '已接收', color: 'bg-green-100 text-green-700' },
  rejected: { label: '已拒绝', color: 'bg-red-100 text-red-700' },
  expired: { label: '已过期', color: 'bg-slate-100 text-slate-500' },
}

export const activityStatusMap: Record<string, { label: string; color: string }> = {
  active: { label: '进行中', color: 'bg-green-100 text-green-700' },
  upcoming: { label: '即将开始', color: 'bg-blue-100 text-blue-700' },
  ended: { label: '已结束', color: 'bg-slate-100 text-slate-500' },
}