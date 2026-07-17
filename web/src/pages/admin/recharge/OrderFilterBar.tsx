import { useCallback } from 'react'
import FilterBar from '@/components/ui/FilterBar'
import { CheckSquare } from 'lucide-react'

interface OrderFilterBarProps {
  status: string
  channel: string
  onFilterChange: (key: 'status' | 'channel' | 'page', value: any) => void
  onReset: () => void
  hasActiveFilters: boolean
  batchMode: boolean
  onToggleBatchMode: () => void
  /** 批量模式下已选数量 */
  selectedCount: number
}

const statusOptions = [
  { value: '', label: '全部' },
  { value: 'pending', label: '待支付' },
  { value: 'paid', label: '已支付' },
  { value: 'confirmed', label: '已确认' },
  { value: 'failed', label: '失败' },
  { value: 'expired', label: '已过期' },
  { value: 'cancelled', label: '已取消' },
]

const channelOptions = [
  { value: '', label: '全部' },
  { value: 'wechat_scan', label: '微信支付' },
  { value: 'alipay_scan', label: '支付宝' },
  { value: 'bank_transfer', label: '银行转账' },
]

export default function OrderFilterBar({
  status,
  channel,
  onFilterChange,
  onReset,
  hasActiveFilters,
  batchMode,
  onToggleBatchMode,
  selectedCount,
}: OrderFilterBarProps) {
  const handleSetFilter = useCallback(
    (key: string, value: any) => {
      onFilterChange(key as 'status' | 'channel', value)
    },
    [onFilterChange],
  )

  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
      <div className="flex items-center justify-between">
        <FilterBar
          filters={{ status, channel }}
          setFilter={handleSetFilter}
          resetFilters={onReset}
          hasActiveFilters={hasActiveFilters}
          fields={[
            {
              key: 'status',
              label: '状态',
              type: 'select',
              options: statusOptions,
            },
            {
              key: 'channel',
              label: '支付方式',
              type: 'select',
              options: channelOptions,
            },
          ]}
        />
        <button
          onClick={onToggleBatchMode}
          className={
            'flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border transition whitespace-nowrap ' +
            (batchMode
              ? 'bg-blue-50 border-blue-300 text-blue-700'
              : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50')
          }
        >
          <CheckSquare size={16} />
          {batchMode ? '退出批量' : '批量审核'}
        </button>
      </div>

      {/* 批量操作快捷栏 */}
      {batchMode && selectedCount > 0 && (
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-100">
          <span className="text-sm text-slate-500">已选 {selectedCount} 笔</span>
        </div>
      )}
    </div>
  )
}
