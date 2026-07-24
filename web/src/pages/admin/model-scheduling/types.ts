// ── Model Scheduling Types ──

import type { SchedulingRealtime } from '@/types'

export type { SchedulingRealtime }

export type MetricTab = 'rpm' | 'tpm'
export type ChartStyle = 'line' | 'area'

export const MODEL_COLORS: Record<string, string> = {
  'deepseek-v4-pro': '#0984e3',
  'deepseek-v4-flash': '#00b894',
  'gpt-4o': '#6c5ce7',
  'gpt-4o-mini': '#a29bfe',
  'claude-sonnet': '#ff6b6b',
  'claude-haiku': '#ffa502',
  'gemini-pro': '#2ed573',
  'qwen-turbo': '#1e90ff',
  'qwen-plus': '#ff6348',
  'kimi-k2.6': '#fd79a8',
}

export const FALLBACK_COLORS = [
  '#95a5a6', '#e17055', '#00cec9', '#fdcb6e',
  '#636e72', '#b2bec3', '#dfe6e9', '#74b9ff',
]

export function getModelColor(modelName: string, idx: number): string {
  return MODEL_COLORS[modelName] || FALLBACK_COLORS[idx % FALLBACK_COLORS.length]
}

export const METRIC_TABS: { key: MetricTab; label: string; color: string; unit: string }[] = [
  { key: 'rpm', label: 'RPM', color: '#0984e3', unit: '请求/分' },
  { key: 'tpm', label: 'TPM', color: '#6c5ce7', unit: 'Token/分 · 万' },
]

export const CHART_STYLES: { key: ChartStyle; label: string }[] = [
  { key: 'line', label: '折线' },
  { key: 'area', label: '面积' },
]