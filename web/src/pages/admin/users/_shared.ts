// ──────────────────────────────────────────────
//  Shared helpers, constants & formatters
//  Extracted from the original 1947-line Users.tsx
// ──────────────────────────────────────────────

export const roleLabel: Record<string, string> = {
  super_admin: '超级管理员',
  admin: '管理员',
  user: '用户',
  agent: '代理商',
}

export const roleColor: Record<string, string> = {
  super_admin: 'bg-purple-100 text-purple-700',
  admin: 'bg-blue-100 text-blue-700',
  user: 'bg-slate-100 text-slate-700',
  agent: 'bg-emerald-100 text-emerald-700',
}

export const statusLabel: Record<string, string> = {
  active: '正常',
  disabled: '禁用',
  pending: '待验证',
  deleted: '已注销',
}

export const statusColor: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  disabled: 'bg-red-100 text-red-700',
  pending: 'bg-yellow-100 text-yellow-700',
  deleted: 'bg-slate-200 text-slate-500',
}

export const statusHelp: Record<string, string> = {
  active: '账户正常，已通过邮箱验证，可正常使用 API',
  pending: '邮箱未验证 — 用户注册后未点击验证邮件中的链接，无法使用 API 调度',
  disabled: '已被管理员禁用，可登录查看余额但无法请求 API',
  deleted: '用户已注销（软删除），不可登录不可重新注册',
}

export const realNameLabel: Record<string, string> = {
  approved: '已认证',
  pending_review: '审核中',
  rejected: '已拒绝',
  unverified: '未认证',
}

export const ROLE_OPTIONS: { value: string; label: string }[] = [
  { value: 'user', label: '用户' },
  { value: 'admin', label: '管理员' },
  { value: 'agent', label: '代理商' },
  { value: 'super_admin', label: '超级管理员' },
]

export const balanceTypeLabel: Record<string, string> = {
  recharge: '充值',
  consumption: '消费',
  refund: '退款',
  trial_grant: '试用',
  admin_adjust: '管理员调整',
  negative_repay: '负数偿还',
}

export function fmt(v: string | null | undefined): string {
  return v ?? '-'
}

export function fmtDate(v: string | null | undefined): string {
  if (!v) return '-'
  try {
    return new Date(v).toLocaleString('zh-CN')
  } catch {
    return v
  }
}

export function fmtShortDate(v: string): string {
  try {
    return new Date(v).toLocaleDateString('zh-CN')
  } catch {
    return v
  }
}
