import { cn } from '@/lib/utils'

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string
  variant?: 'text' | 'card' | 'table-row' | 'chart'
  count?: number
}

const VARIANT_CLASSES = {
  text: 'h-4 w-full',
  card: 'h-32 w-full rounded-xl',
  'table-row': 'h-12 w-full',
  chart: 'h-48 w-full rounded-lg',
}

export function Skeleton({ className, variant, count = 1, ...props }: SkeletonProps) {
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
