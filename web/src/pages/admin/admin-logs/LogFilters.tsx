import FilterBar from '@/components/ui/FilterBar'
import { STATUS_OPTIONS } from './types'

/* ── Props ── */

interface LogFiltersProps {
  filters: Record<string, any>
  setFilter: (key: string, value: any) => void
  resetFilters: () => void
  hasActiveFilters: boolean
  onSearch: () => void
}

/* ── Fields ── */

const FILTER_FIELDS = [
  { key: 'keyword', label: '用户搜索', type: 'text' as const, placeholder: '搜索用户邮箱' },
  { key: 'modelName', label: '模型名称', type: 'text' as const, placeholder: '如 gpt-4o' },
  { key: 'status', label: '状态', type: 'select' as const, options: STATUS_OPTIONS as any },
  { key: 'startDate', label: '开始日期', type: 'date' as const },
  { key: 'endDate', label: '结束日期', type: 'date' as const },
]

/* ── Main ── */

export default function LogFilters({
  filters, setFilter, resetFilters, hasActiveFilters, onSearch,
}: LogFiltersProps) {
  return (
    <FilterBar
      filters={filters}
      setFilter={setFilter}
      resetFilters={resetFilters}
      hasActiveFilters={hasActiveFilters}
      fields={FILTER_FIELDS}
      onSearch={onSearch}
    />
  )
}
