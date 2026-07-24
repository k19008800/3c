// ── Agents List Types ──

import type { Agent } from '@/types'

export type { Agent }

export interface AgentsListProps {
  onStatsChange?: () => void
}

// ── Helpers ──

import type { MiniChartDataPoint } from '@/components/ui/MiniChart'

export function buildCommissionTrend(agent: Agent): MiniChartDataPoint[] {
  const points: MiniChartDataPoint[] = []
  const total = Number(agent.totalCommission || 0)
  const settled = Number(agent.settledCommission || 0)
  const pending = Number(agent.pendingWithdraw || 0)
  if (total > 0 || settled > 0 || pending > 0) {
    if (total > 0) points.push({ value: total, label: '总佣金' })
    if (settled > 0) points.push({ value: settled, label: '已结算' })
    if (pending > 0) points.push({ value: pending, label: '待提现' })
  }
  if (points.length === 0) {
    points.push({ value: 0.001, label: '暂无' })
  }
  return points
}