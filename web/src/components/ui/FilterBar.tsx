/**
 * FilterBar — 统一筛选栏组件
 *
 * 配合 usePersistedFilters 使用，消除各页面重复的筛选栏代码。
 *
 * @example
 * <FilterBar
 *   filters={filters}
 *   setFilter={setFilter}
 *   resetFilters={resetFilters}
 *   hasActiveFilters={hasActiveFilters}
 *   fields={[
 *     { key: 'keyword', label: '搜索', type: 'text', placeholder: '名称/地址' },
 *     { key: 'status', label: '状态', type: 'select', options: statusOptions },
 *   ]}
 * />
 */

import { Search, X, Filter } from 'lucide-react'

interface FilterField {
  key: string
  label: string
  type: 'text' | 'select' | 'date' | 'dateRange' | 'number'
  options?: { value: string; label: string }[]
  placeholder?: string
  className?: string
}

interface FilterBarProps {
  filters: Record<string, any>
  setFilter: (key: string, value: any) => void
  resetFilters: () => void
  hasActiveFilters: boolean
  fields: FilterField[]
  /** 额外操作区（右侧） */
  extra?: React.ReactNode
  /** 搜索时按回车触发（仅 text 类型） */
  onSearch?: () => void
  /** 筛选条件变化时触发（用于重置页码等） */
  onFilterChange?: () => void
}

export default function FilterBar({
  filters,
  setFilter,
  resetFilters,
  hasActiveFilters,
  fields,
  extra,
  onSearch,
  onFilterChange,
}: FilterBarProps) {
  // 处理 text 类型按回车
  const handleKeyDown = (e: React.KeyboardEvent, key: string) => {
    if (e.key === 'Enter') {
      // 移除 onFilterChange 调用，setFilter 已自动处理页码重置
      if (onSearch) {
        onSearch()
      } else {
        // 默认回车即触发筛选（设值已通过 onChange 完成）
      }
    }
  }

  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
      <div className="flex flex-wrap gap-4 items-end">
        {fields.map((field) => {
          const value = filters[field.key] ?? ''

          if (field.type === 'text') {
            return (
              <div key={field.key} className={`flex-1 min-w-[200px] ${field.className ?? ''}`}>
                <label className="block text-xs text-slate-500 mb-1">{field.label}</label>
                <div className="relative">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={value}
                    onChange={(e) => setFilter(field.key, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(e, field.key)}
                    placeholder={field.placeholder}
                    className="w-full pl-9 pr-8 py-2 border border-slate-300 rounded-lg text-sm 
                               focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-400
                               transition-colors"
                  />
                  {value && (
                    <button
                      onClick={() => setFilter(field.key, '')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              </div>
            )
          }

          if (field.type === 'select') {
            return (
              <div key={field.key} className={field.className ?? ''}>
                <label className="block text-xs text-slate-500 mb-1">{field.label}</label>
                <select
                  value={value}
                  onChange={(e) => {
                    setFilter(field.key, e.target.value)
                    // 移除 onFilterChange 调用，避免重复调用
                    // setFilter 已自动处理页码重置
                  }}
                  className="px-3 py-2 border border-slate-300 rounded-lg text-sm 
                             focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-400
                             transition-colors min-w-[120px]"
                >
                  {field.options?.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            )
          }

          if (field.type === 'number') {
            return (
              <div key={field.key} className={field.className ?? ''}>
                <label className="block text-xs text-slate-500 mb-1">{field.label}</label>
                <input
                  type="number"
                  value={value}
                  onChange={(e) => {
                    setFilter(field.key, e.target.value ? Number(e.target.value) : '')
                    // 移除 onFilterChange 调用，setFilter 已自动处理页码重置
                  }}
                  placeholder={field.placeholder}
                  className="px-3 py-2 border border-slate-300 rounded-lg text-sm w-24
                             focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-400
                             transition-colors"
                />
              </div>
            )
          }

          return null
        })}

        {/* 清除筛选 */}
        {hasActiveFilters && (
          <button
            onClick={resetFilters}
            className="flex items-center gap-1 px-3 py-2 text-sm text-slate-500 
                       hover:text-slate-700 hover:bg-slate-100 rounded-lg transition"
          >
            <X size={14} />
            清除筛选
          </button>
        )}

        {/* 额外操作区 */}
        {extra}
      </div>
    </div>
  )
}
