// Helper functions
export const roleLabel: Record<string, string> = {
  super_admin: '超级管理员',
  admin: '管理员', 
  user: '用户',
}

export const roleColor: Record<string, string> = {
  super_admin: 'bg-purple-100 text-purple-700',
  admin: 'bg-blue-100 text-blue-700',
  user: 'bg-slate-100 text-slate-700',
}

export const statusLabel: Record<string, string> = {
  active: '正常',
  disabled: '禁用', 
  pending: '待验证',
  deleted: '已注销'
}

export const statusColor: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  disabled: 'bg-red-100 text-red-700',
  pending: 'bg-yellow-100 text-yellow-700',
  deleted: 'bg-slate-200 text-slate-500'
}

export const realNameLabel: Record<string, string> = {
  approved: '已认证',
  pending_review: '审核中',
  rejected: '已拒绝',
  unverified: '未认证'
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

export function cmp(a: string, b: string): number {
  return a === b ? 0 : a < b ? -1 : 1
}

// Format numbers with commas
export function fmtNumber(num: number | null | undefined): string {
  if (num == null) return '-'
  return num.toLocaleString('zh-CN')
}

// Format currency
export function fmtCurrency(amount: number | null | undefined, currency = 'CNY'): string {
  if (amount == null) return '-'
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount)
}

// Format percentage
export function fmtPercent(value: number | null | undefined, decimals = 2): string {
  if (value == null) return '-'
  return `${value.toFixed(decimals)}%`
}

// Safe parse JSON
export function safeParseJson<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T
  } catch {
    return fallback
  }
}

// Debounce function
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null
  
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout)
    timeout = setTimeout(() => func(...args), wait)
  }
}

// Throttle function
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle = false
  
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args)
      inThrottle = true
      setTimeout(() => (inThrottle = false), limit)
    }
  }
}