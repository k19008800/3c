import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import type { AgentDashboard, AgentIncomeTrendData, AgentIncomeStructureData } from '@/types'

// ── types re-export ──

export type { AgentDashboard, AgentIncomeTrendData, AgentIncomeStructureData }

// ── helpers ──

export function fmt2(v: string | number | null | undefined): string {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '0'))
  return n.toFixed(2)
}

// ── Colors ──

export const PIE_COLORS = ['#3b82f6', '#10b981', '#f59e0b']
export const PIE_FILLS = ['#eff6ff', '#ecfdf5', '#fffbeb']

// ── 日期选择 ──

export const DATE_RANGES = [
  { value: 7, label: '7天' },
  { value: 30, label: '30天' },
  { value: 90, label: '90天' },
]

// ══════════════════════════════════════════════
//  ── Dash: 增长趋势指示器 ──
// ══════════════════════════════════════════════

export function GrowthBadge({ rate }: { rate: number }) {
  if (rate > 0.01) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs font-medium text-green-600">
        <TrendingUp size={12} />
        +{(rate * 100).toFixed(1)}%
      </span>
    )
  }
  if (rate < -0.01) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs font-medium text-red-600">
        <TrendingDown size={12} />
        {(rate * 100).toFixed(1)}%
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-0.5 text-xs font-medium text-slate-400">
      <Minus size={12} />
      持平
    </span>
  )
}

// ══════════════════════════════════════════════
//  ── Tooltip 自定义 ──
// ══════════════════════════════════════════════

export function TrendTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white shadow-lg border border-slate-200 rounded-lg p-3 text-sm space-y-1.5 min-w-[160px]">
      <p className="font-medium text-slate-700 border-b border-slate-100 pb-1 mb-1">{label}</p>
      {payload.map((entry: any, idx: number) => (
        <div key={idx} className="flex justify-between gap-4">
          <span style={{ color: entry.color }}>{entry.name}</span>
          <span className="font-medium">¥{fmt2(entry.value)}</span>
        </div>
      ))}
    </div>
  )
}

export function PieTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="bg-white shadow-lg border border-slate-200 rounded-lg p-3 text-sm space-y-1 min-w-[140px]">
      <p className="font-medium text-slate-700">{d.label}</p>
      <p>金额: <span className="font-medium">¥{fmt2(d.amount)}</span></p>
      <p>笔数: <span className="font-medium">{d.count}</span></p>
      <p>占比: <span className="font-medium">{d.percentage}%</span></p>
    </div>
  )
}

// ── props types ──

export interface KpiCardsProps {
  data: AgentDashboard
}

export interface TrendChartProps {
  data: AgentIncomeTrendData | null
  loading: boolean
  days: number
  onDaysChange: (days: number) => void
}

export interface RecentOrdersProps {
  data: AgentIncomeStructureData | null
  loading: boolean
}

export interface QuickActionsProps {
  onRefresh: () => void
}
