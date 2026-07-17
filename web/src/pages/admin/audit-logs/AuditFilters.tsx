// ── 审计日志筛选栏 ──

import { Search } from 'lucide-react'
import FilterBar from '@/components/ui/FilterBar'
import { ACTION_OPTIONS, TARGET_TYPE_OPTIONS } from './types'
import type { FilterValues } from './types'

interface Props {
  filters: FilterValues
  setFilter: <K extends keyof FilterValues>(key: K, value: FilterValues[K]) => void
  resetFilters: () => void
  hasActiveFilters: boolean
  onSearch: () => void
}

/** 操作人快速搜索输入框 */
function OperatorFilter({
  value,
  onChange,
}: {
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="relative">
      <label className="block text-xs text-slate-500 mb-1">操作人</label>
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="邮箱或昵称"
          className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
    </div>
  )
}

export default function AuditFilters(props: Props) {
  const { filters, setFilter, resetFilters, hasActiveFilters, onSearch } = props
  const { keyword, action, targetType, targetId, startDate, endDate } = filters

  return (
    <div className="space-y-3">
      <FilterBar
        filters={{ keyword, action, targetType, targetId, startDate, endDate }}
        setFilter={(key, value) => setFilter(key as keyof FilterValues, value as any)}
        resetFilters={resetFilters}
        hasActiveFilters={hasActiveFilters}
        onSearch={onSearch}
        fields={[
          { key: 'keyword', label: '关键词', type: 'text', placeholder: '搜索描述/操作人' },
          { key: 'action', label: '操作类型', type: 'select', options: ACTION_OPTIONS },
          { key: 'targetType', label: '对象类型', type: 'select', options: TARGET_TYPE_OPTIONS },
          { key: 'targetId', label: '对象 ID', type: 'number', placeholder: 'ID' },
          { key: 'startDate', label: '开始日期', type: 'date' },
          { key: 'endDate', label: '结束日期', type: 'date' },
        ]}
        extra={
          <OperatorFilter
            value={filters.operator}
            onChange={(v) => setFilter('operator', v)}
          />
        }
      />
    </div>
  )
}
