import { Search, X } from 'lucide-react'
import { useState } from 'react'

export type StatusTab = 'all' | 'active' | 'down' | 'disabled' | 'deleted'

interface KeyFiltersProps {
  tabCounts: {
    all: number
    active: number
    down: number
    disabled: number
    deleted: number
  }
  statusTab: StatusTab
  onTabChange: (tab: StatusTab) => void
  searchQuery: string
  onSearchChange: (query: string) => void
}

export default function KeyFilters({
  tabCounts,
  statusTab,
  onTabChange,
  searchQuery,
  onSearchChange,
}: KeyFiltersProps) {
  const [tempSearch, setTempSearch] = useState(searchQuery)

  const handleSearchChange = (value: string) => {
    setTempSearch(value)
    onSearchChange(value)
  }

  const handleClearSearch = () => {
    setTempSearch('')
    onSearchChange('')
  }

  return (
    <>
      {/* Stats cards */}
      <div className="grid grid-cols-5 gap-2 px-4 py-3 bg-slate-50 border-b border-slate-200">
        <div className="text-center cursor-pointer" onClick={() => onTabChange('all')}>
          <div className={`text-lg font-semibold ${statusTab === 'all' ? 'text-blue-600' : 'text-slate-900'}`}>
            {tabCounts.all}
          </div>
          <div className="text-[10px] text-slate-500">正常</div>
        </div>
        <div className="text-center cursor-pointer" onClick={() => onTabChange('active')}>
          <div className={`text-lg font-semibold ${statusTab === 'active' ? 'text-green-600' : 'text-green-600'}`}>
            {tabCounts.active}
          </div>
          <div className="text-[10px] text-slate-500">活跃</div>
        </div>
        <div className="text-center cursor-pointer" onClick={() => onTabChange('down')}>
          <div className={`text-lg font-semibold ${statusTab === 'down' ? 'text-red-600' : 'text-red-500'}`}>
            {tabCounts.down}
          </div>
          <div className="text-[10px] text-slate-500">宕机</div>
        </div>
        <div className="text-center cursor-pointer" onClick={() => onTabChange('disabled')}>
          <div className={`text-lg font-semibold ${statusTab === 'disabled' ? 'text-slate-600' : 'text-slate-400'}`}>
            {tabCounts.disabled}
          </div>
          <div className="text-[10px] text-slate-500">禁用</div>
        </div>
        <div className="text-center cursor-pointer" onClick={() => onTabChange('deleted')}>
          <div className={`text-lg font-semibold ${statusTab === 'deleted' ? 'text-orange-600' : 'text-orange-400'}`}>
            {tabCounts.deleted}
          </div>
          <div className="text-[10px] text-slate-500">已删除</div>
        </div>
      </div>

      {/* Tabs + Search */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-200 bg-white">
        <div className="flex items-center gap-1">
          {(['all', 'active', 'down', 'disabled', 'deleted'] as StatusTab[]).map(tab => (
            <button
              key={tab}
              onClick={() => onTabChange(tab)}
              className={`px-2.5 py-1 text-xs rounded-full transition ${
                statusTab === tab
                  ? 'bg-blue-100 text-blue-700 font-medium'
                  : 'text-slate-500 hover:bg-slate-100'
              }`}
            >
              {tab === 'all' ? '全部' : tab === 'active' ? '活跃' : tab === 'down' ? '宕机' : tab === 'disabled' ? '禁用' : '已删除'}
            </button>
          ))}
        </div>
        <div className="relative flex-1 max-w-xs ml-auto">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={tempSearch}
            onChange={e => handleSearchChange(e.target.value)}
            placeholder="搜索 Key / ID / 备注..."
            className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:ring-1 focus:ring-blue-400 focus:border-blue-400 outline-none"
          />
          {tempSearch && (
            <button
              onClick={handleClearSearch}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>
    </>
  )
}