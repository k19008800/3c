// ============================================================
//  MiniChart — 内嵌迷你趋势图组件
//  用于列表行内展示趋势数据（余额变化、调用量趋势等）
//  轻量级，固定尺寸，无 tooltip/legend/grid/axis
// ============================================================

import { useId, useMemo } from 'react'
import { Area, AreaChart, Bar, BarChart } from 'recharts'
import { cn } from '@/lib/utils'

/* ═══════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════ */

export interface MiniChartDataPoint {
  value: number
  label?: string
}

interface MiniChartProps {
  /** 数据点 */
  data: MiniChartDataPoint[]
  /** 图表宽度，默认 120 */
  width?: number
  /** 图表高度，默认 32 */
  height?: number
  /** 线条颜色，默认 #3b82f6 (blue-500) */
  color?: string
  /** 是否显示端点圆点，默认 false */
  showDot?: boolean
  /** 是否显示渐变填充区域，默认 true */
  gradient?: boolean
  /** 加载状态 */
  loading?: boolean
  /** 图表类型：line | bar，默认 line */
  type?: 'line' | 'bar'
  className?: string
}

/* ═══════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════ */

/** 为单数据点或重复值生成微小抖动，确保折线/柱状能渲染出视觉差异 */
function jitterData(points: MiniChartDataPoint[]): MiniChartDataPoint[] {
  if (points.length <= 1) return points

  const allSame = points.every((p) => p.value === points[0].value)
  if (!allSame) return points

  // 所有值相同时，加极小幅抖动保持可读性
  return points.map((p, i) => ({
    ...p,
    value: p.value + (i - (points.length - 1) / 2) * 0.001,
  }))
}

/** 为柱状图计算合理的 maxBarSize */
function calcBarSize(width: number, dataLength: number): number {
  if (dataLength <= 0) return 0
  const gap = 2 // 柱间最小间隙
  return Math.max(2, Math.min(24, (width - gap * (dataLength - 1)) / dataLength * 0.7))
}

/* ═══════════════════════════════════════════════════
   Empty State — 虚线占位线
   ═══════════════════════════════════════════════════ */

function EmptyChart({ width, height, className }: { width: number; height: number; className?: string }) {
  const midY = height / 2
  return (
    <svg
      width={width}
      height={height}
      className={cn('text-slate-300', className)}
      role="img"
      aria-label="No data"
    >
      <line
        x1={0}
        y1={midY}
        x2={width}
        y2={midY}
        stroke="currentColor"
        strokeWidth={1.5}
        strokeDasharray="4 3"
        strokeLinecap="round"
      />
    </svg>
  )
}

/* ═══════════════════════════════════════════════════
   Main Component
   ═══════════════════════════════════════════════════ */

export default function MiniChart({
  data,
  width = 120,
  height = 32,
  color = '#3b82f6',
  showDot = false,
  gradient = true,
  loading = false,
  type = 'line',
  className,
}: MiniChartProps) {
  const gradientId = useId()
  const isEmpty = data.length === 0

  // 避免 recharts 对空数据报错，同时抖动重复值
  const chartData = useMemo(() => {
    if (isEmpty) return []
    return jitterData(data)
  }, [data, isEmpty])

  // ── Loading skeleton ──
  if (loading) {
    return (
      <div
        className={cn('animate-pulse rounded bg-slate-200', className)}
        style={{ width, height }}
        role="status"
        aria-label="Loading chart"
      />
    )
  }

  // ── Empty placeholder ──
  if (isEmpty) {
    return <EmptyChart width={width} height={height} className={className} />
  }

  // ── 共享 margin，严格控制留白 ──
  const margin = {
    top: 1,
    right: showDot ? 4 : 1,
    bottom: 1,
    left: 1,
  }

  // ── Bar 模式 ──
  if (type === 'bar') {
    const barSize = calcBarSize(width, chartData.length)
    return (
      <BarChart
        className={className}
        width={width}
        height={height}
        data={chartData}
        margin={margin}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.8} />
            <stop
              offset="100%"
              stopColor={color}
              stopOpacity={gradient ? 0.15 : 0.6}
            />
          </linearGradient>
        </defs>
        <Bar
          dataKey="value"
          fill={`url(#${gradientId})`}
          radius={[2, 2, 0, 0]}
          maxBarSize={barSize}
          isAnimationActive={false}
        />
      </BarChart>
    )
  }

  // ── Line 模式（默认）— 用 AreaChart 实现渐变填充折线 ──
  const lastIndex = chartData.length - 1

  return (
    <AreaChart
      className={className}
      width={width}
      height={height}
      data={chartData}
      margin={margin}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop
            offset="0%"
            stopColor={color}
            stopOpacity={gradient ? 0.2 : 0}
          />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <Area
        type="monotone"
        dataKey="value"
        stroke={color}
        strokeWidth={1.5}
        fill={`url(#${gradientId})`}
        dot={
          showDot
            ? (props: any) => {
                if (props.index === lastIndex) {
                  return (
                    <circle
                      cx={props.cx}
                      cy={props.cy}
                      r={2.5}
                      fill={color}
                      stroke="#fff"
                      strokeWidth={1}
                    />
                  )
                }
                return null
              }
            : false
        }
        activeDot={false}
        isAnimationActive={false}
      />
    </AreaChart>
  )
}
