import { useMemo } from 'react'
import { Activity } from 'lucide-react'
import type { WaterLevels } from './types'

// ── MiniChart: 小型趋势图 ──

interface MiniChartProps {
  data: number[]
  height?: number
  color?: string
  className?: string
}

export function MiniChart({ data, height = 32, color = '#3b82f6', className = '' }: MiniChartProps) {
  if (data.length < 2) return null

  const max = Math.max(...data, 1)
  const min = Math.min(...data)
  const range = max - min || 1
  const width = data.length * 8 + 8

  const points = useMemo(() => {
    return data
      .map((v, i) => `${i * 8 + 4},${height - ((v - min) / range) * (height - 4) - 2}`)
      .join(' ')
  }, [data, height, min, range])

  return (
    <svg width={width} height={height} className={className}>
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  )
}

// ── WaterBar: 水位条 ──

interface WaterBarProps {
  current: number
  limit: number
  label: string
  unit: string
  trend?: number[]
}

function WaterBar({ current, limit, label, unit, trend }: WaterBarProps) {
  const pct = limit > 0 ? Math.min(100, (current / limit) * 100) : 0
  const color = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-yellow-500' : 'bg-emerald-500'

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4">
      <div className="flex justify-between items-center mb-2">
        <span className="text-sm font-medium text-slate-700">{label}</span>
        <div className="flex items-center gap-2">
          {trend && <MiniChart data={trend} height={24} color={pct >= 70 ? '#eab308' : '#22c55e'} />}
          <span className="text-xs text-slate-400">{current.toLocaleString()} / {limit.toLocaleString()} {unit}</span>
        </div>
      </div>
      <div className="w-full bg-slate-100 rounded-full h-2.5">
        <div className={`${color} h-2.5 rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

// ── 活跃统计卡片 ──

function ActiveStatsCard({ activeUsers, activeKeys }: { activeUsers: number; activeKeys: number }) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4 flex items-center gap-4">
      <div className="flex-1">
        <div className="text-sm font-medium text-slate-700">活跃用户（窗口内）</div>
        <div className="text-2xl font-bold text-slate-900 mt-1">{activeUsers}</div>
      </div>
      <div className="w-px h-10 bg-slate-200" />
      <div className="flex-1">
        <div className="text-sm font-medium text-slate-700">活跃 API Key</div>
        <div className="text-2xl font-bold text-slate-900 mt-1">{activeKeys}</div>
      </div>
    </div>
  )
}

// ── 空状态 ──

function EmptyState() {
  return <div className="text-center py-8 text-slate-400 text-sm">暂无限流水位数据</div>
}

// ── Loading 骨架屏 ──

function LoadingSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-pulse">
      {[1, 2, 3].map((i) => (
        <div key={i} className="bg-white rounded-lg border border-slate-200 p-4">
          <div className="h-4 bg-slate-100 rounded w-1/3 mb-2" />
          <div className="h-2.5 bg-slate-100 rounded w-full" />
        </div>
      ))}
    </div>
  )
}

// ── 主组件 ──

interface LimitStatsCardsProps {
  waterLevels: WaterLevels | null
  loading?: boolean
  trendData?: {
    rpm: number[]
    tpm: number[]
  }
}

export default function LimitStatsCards({ waterLevels, loading, trendData }: LimitStatsCardsProps) {
  if (loading) return <LoadingSkeleton />

  if (!waterLevels) return <EmptyState />

  return (
    <div>
      <h2 className="text-lg font-semibold text-slate-800 mb-3 flex items-center gap-2">
        <Activity size={18} className="text-blue-500" />
        当前限流水位（分钟滑动窗口）
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <WaterBar
          current={waterLevels.globalRpm.current}
          limit={waterLevels.globalRpm.limit}
          label="全局 RPM"
          unit="次/分"
          trend={trendData?.rpm}
        />
        <WaterBar
          current={waterLevels.globalTpm.current}
          limit={waterLevels.globalTpm.limit}
          label="全局 TPM"
          unit="Token/分"
          trend={trendData?.tpm}
        />
        <ActiveStatsCard
          activeUsers={waterLevels.activeUsersInWindow}
          activeKeys={waterLevels.activeKeysInWindow}
        />
      </div>
    </div>
  )
}
