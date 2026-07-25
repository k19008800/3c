import { RefreshCw, CalendarDays } from 'lucide-react'
import type { TrendFiltersProps } from '../types'

export default function TrendFilters({ days, onDaysChange, loading, onRefresh }: TrendFiltersProps) {
  const DAYS_OPTIONS = [7, 14, 30, 60]

  return (
    <div className="flex items-center gap-2">
      {/* Days selector */}
      <div className="flex items-center gap-1">
        <CalendarDays size={16} className="text-slate-400" />
        {DAYS_OPTIONS.map((d) => (
          <button
            key={d}
            onClick={() => onDaysChange(d)}
            className={`px-2 py-1 text-xs border rounded ${
              days === d
                ? 'bg-blue-50 text-blue-700 border-blue-300'
                : 'hover:bg-slate-50'
            }`}
          >
            {d}天
          </button>
        ))}
      </div>
      
      <button
        onClick={onRefresh}
        disabled={loading}
        className="p-1.5 border rounded hover:bg-slate-50 disabled:opacity-50"
      >
        <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
      </button>
    </div>
  )
}