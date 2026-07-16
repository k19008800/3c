import { cn } from '@/lib/utils'

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string
  variant?: 'text' | 'card' | 'table-row' | 'chart' | 'dashboard' | 'detail'
  count?: number
}

const VARIANT_CLASSES = {
  text: 'h-4 w-full',
  card: 'h-32 w-full rounded-xl',
  'table-row': 'h-12 w-full',
  chart: 'h-48 w-full rounded-lg',
  dashboard: '', // 特殊处理：渲染 5 个卡片 + 图表 + 表格
  detail: 'h-full w-full', // 特殊处理：渲染左侧导航+右侧内容
}

export function Skeleton({ className, variant, count = 1, ...props }: SkeletonProps) {
  if (variant === 'dashboard') {
    return <DashboardSkeleton />
  }

  if (variant === 'detail') {
    return <DetailSkeleton />
  }

  if (count > 1) {
    return (
      <div className="space-y-3">
        {Array.from({ length: count }).map((_, i) => (
          <div
            key={i}
            className={cn(
              'animate-pulse rounded-md bg-slate-200',
              variant ? VARIANT_CLASSES[variant] : 'h-4',
              className
            )}
            {...props}
          />
        ))}
      </div>
    )
  }

  return (
    <div
      className={cn(
        'animate-pulse rounded-md bg-slate-200',
        variant ? VARIANT_CLASSES[variant] : '',
        className
      )}
      {...props}
    />
  )
}

/** Convenience: puts skeleton rows inside a table body cell */
export function TableSkeleton({ rows = 5, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <tr>
      <td colSpan={cols} className="px-4 py-2">
        <div className="space-y-3 py-2">
          <Skeleton variant="table-row" count={rows} />
        </div>
      </td>
    </tr>
  )
}

/** Dashboard skeleton: mimics 5 stat cards + chart + table */
function DashboardSkeleton() {
  return (
    <div className="space-y-5">
      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
            <div className="animate-pulse">
              <div className="h-3 w-16 bg-slate-200 rounded mb-3" />
              <div className="h-6 w-20 bg-slate-200 rounded" />
            </div>
          </div>
        ))}
      </div>

      {/* Chart area */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
        <div className="animate-pulse space-y-4">
          <div className="flex gap-2">
            <div className="h-8 w-20 bg-slate-200 rounded" />
            <div className="h-8 w-20 bg-slate-200 rounded" />
            <div className="h-8 w-20 bg-slate-200 rounded" />
          </div>
          <div className="h-64 bg-slate-100 rounded-lg" />
        </div>
      </div>

      {/* Table area */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        <div className="animate-pulse p-6 space-y-3">
          <div className="h-4 w-32 bg-slate-200 rounded" />
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-12 bg-slate-100 rounded" />
          ))}
        </div>
      </div>
    </div>
  )
}

/** Detail page skeleton */
function DetailSkeleton() {
  return (
    <div className="flex gap-6 animate-pulse">
      <div className="w-64 space-y-3">
        <div className="h-8 w-24 bg-slate-200 rounded" />
        <div className="h-10 bg-slate-100 rounded" />
        <div className="h-10 bg-slate-100 rounded" />
        <div className="h-10 bg-slate-100 rounded" />
      </div>
      <div className="flex-1 space-y-4">
        <div className="h-8 w-48 bg-slate-200 rounded" />
        <div className="h-32 bg-slate-100 rounded" />
        <div className="h-64 bg-slate-100 rounded" />
      </div>
    </div>
  )
}
