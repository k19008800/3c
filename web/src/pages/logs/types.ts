import type { LogSummary } from '@/types'

// ── Logs page specific types ──

export interface ErrorPattern {
  pattern: string
  count: number
  percentage: number
}

export interface KeyComparisonData {
  keyId: number
  keyName: string
  summary: LogSummary | null
  loading: boolean
  error: string
}