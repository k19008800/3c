import React, { memo } from 'react'
import { Search, Filter, Trash2 } from 'lucide-react'

interface FiltersPanelProps {
  searchQuery: string
  statusTab: string
  showDeleted: boolean
  tabCounts: {
    all: number
    active: number
    down: number
    disabled: number
    deleted: number
  }
  onSearchChange: (query: string) => void
  onStatusTabChange: (tab: string) => void
  onShowDeletedChange: (show: boolean) => void
  onClearFilters: () => void
}

const FiltersPanel: React.FC<FiltersPanelProps> = memo(({
  searchQuery,
  statusTab,
  showDeleted,
  tabCounts,
  onSearchChange,
  onStatusTabChange,
  onShowDeletedChange,
  onClearFilters
}) => {
  const statusTabs = [
    { id: 'all', label: '全部', count: tabCounts.all, color: 'bg-slate-100 text-slate-700' },
    { id: 'active', label: '正常', count: tabCounts.active, color: 'bg-green-100 text-green-700' },
    { id: 'down', label: '故障', count: tabCounts.down, color: 'bg-red-100 text-red-700' },
    { id: 'disabled', label: '禁用', count: tabCounts.disabled, color: 'bg-yellow-100 text-yellow-700' },
    { id: 'deleted', label: '已删除', count: tabCounts.deleted, color: 'bg-slate-200 text-slate-500' }
  ]

  const hasActiveFilters = searchQuery || statusTab !== 'all' || showDeleted

  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Filter size={16} className="text-slate-400" />
          <h3 className="font-medium text-slate-900">筛选</h3>
        </div>
        
        {hasActiveFilters && (
          <button
            onClick={onClearFilters}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-slate-300 rounded-lg hover:bg-slate-50 transition"
          >
            <Trash2 size={14} />
            清除筛选
          </button>
        )}
      </div>

      <div className="space-y-4">
        {/* Search input */}
        <div>
          <label className="block text-xs text-slate-500 mb-1">搜索</label>
          <div className="relative">
            <Search 
              size={16} 
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" 
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="搜索Key前缀、ID或备注"
              className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Status tabs */}
        <div>
          <label className="block text-xs text-slate-500 mb-2">状态筛选</label>
          <div className="flex flex-wrap gap-2">
            {statusTabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => onStatusTabChange(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition ${
                  statusTab === tab.id
                    ? `${tab.color} ring-2 ring-opacity-50 ${
                        tab.id === 'active' ? 'ring-green-200' :
                        tab.id === 'down' ? 'ring-red-200' :
                        tab.id === 'disabled' ? 'ring-yellow-200' :
                        'ring-slate-200'
                      }`
                    : 'border border-slate-300 hover:bg-slate-50'
                }`}
              >
                <span>{tab.label}</span>
                {tab.count > 0 && (
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                    statusTab === tab.id 
                      ? tab.id === 'deleted' ? 'bg-slate-300' : 'bg-white bg-opacity-70'
                      : 'bg-slate-100'
                  }`}>
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Show deleted toggle */}
        <div className="flex items-center gap-3">
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={showDeleted}
              onChange={(e) => onShowDeletedChange(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            <span className="ml-3 text-sm text-slate-700">显示已删除项</span>
          </label>
          
          {showDeleted && (
            <span className="text-xs text-slate-500">
              ({tabCounts.deleted} 个已删除项)
            </span>
          )}
        </div>

        {/* Active filters summary */}
        {hasActiveFilters && (
          <div className="pt-3 border-t border-slate-100">
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <span className="text-slate-500">当前筛选:</span>
              {searchQuery && (
                <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded">
                  搜索: "{searchQuery}"
                </span>
              )}
              {statusTab !== 'all' && (
                <span className="px-2 py-1 bg-green-100 text-green-700 rounded">
                  状态: {statusTabs.find(t => t.id === statusTab)?.label}
                </span>
              )}
              {showDeleted && (
                <span className="px-2 py-1 bg-slate-200 text-slate-600 rounded">
                  显示已删除项
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
})

FiltersPanel.displayName = 'FiltersPanel'

export default FiltersPanel