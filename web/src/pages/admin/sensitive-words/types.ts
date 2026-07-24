// ── Sensitive Word Types ──

export interface SensitiveWord {
  id: number
  word: string
  category: string
  severity: string
  description: string | null
  hitCount: number
  lastHitAt: string | null
  enabled: boolean
  createdBy: number | null
  createdAt: string
  updatedAt: string
}

export const CATEGORIES = [
  { value: 'general', label: '通用' },
  { value: 'political', label: '政治' },
  { value: 'porn', label: '色情' },
  { value: 'fraud', label: '欺诈' },
  { value: 'violence', label: '暴力' },
  { value: 'custom', label: '自定义' },
]

export const SEVERITIES = [
  { value: 'low', label: '低', color: 'bg-slate-100 text-slate-700' },
  { value: 'medium', label: '中', color: 'bg-amber-100 text-amber-700' },
  { value: 'high', label: '高', color: 'bg-orange-100 text-orange-700' },
  { value: 'critical', label: '严重', color: 'bg-red-100 text-red-700' },
]

export interface WordForm {
  word: string
  category: string
  severity: string
  description: string
  enabled: boolean
}