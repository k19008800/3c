import { useMemo } from 'react'
import FilterBar from '@/components/ui/FilterBar'
import { eventTypeLabels } from './types'

interface EventFiltersProps {
  eventType: string
  riskLevel: string
  acknowledged: string
  setFilter: (key: string, value: any) => void
  resetFilters: () => void
  hasActiveFilters: boolean
}

export default function EventFilters({
  eventType,
  riskLevel,
  acknowledged,
  setFilter,
  resetFilters,
  hasActiveFilters,
}: EventFiltersProps) {
  const filterFields = useMemo(
    () => [
      {
        key: 'eventType',
        label: '事件类型',
        type: 'select' as const,
        options: [
          { value: '', label: '全部' },
          ...Object.entries(eventTypeLabels).map(([k, v]) => ({
            value: k,
            label: v,
          })),
        ],
      },
      {
        key: 'riskLevel',
        label: '风险等级',
        type: 'select' as const,
        options: [
          { value: '', label: '全部' },
          { value: 'critical', label: '严重' },
          { value: 'high', label: '高风险' },
          { value: 'medium', label: '中风险' },
          { value: 'low', label: '低风险' },
        ],
      },
      {
        key: 'acknowledged',
        label: '处理状态',
        type: 'select' as const,
        options: [
          { value: '', label: '全部' },
          { value: 'false', label: '未处理' },
          { value: 'true', label: '已处理' },
        ],
      },
    ],
    [],
  )

  return (
    <FilterBar
      filters={{ eventType, riskLevel, acknowledged }}
      setFilter={setFilter}
      resetFilters={resetFilters}
      hasActiveFilters={hasActiveFilters}
      fields={filterFields}
    />
  )
}
