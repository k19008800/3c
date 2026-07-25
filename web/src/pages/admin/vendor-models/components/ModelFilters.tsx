import { Search } from 'lucide-react'

interface ModelFiltersProps {
  keyword: string
  statusFilter: string
  onKeywordChange: (keyword: string) => void
  onStatusFilterChange: (statusFilter: string) => void
}

export default function ModelFilters({
  keyword,
  statusFilter,
  onKeywordChange,
  onStatusFilterChange,
}: ModelFiltersProps) {
  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
      <div className="flex flex-wrap gap-4 items-end">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs text-slate-500 mb-1">搜索</label>
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={keyword}
              onChange={(e) => onKeywordChange(e.target.value)}
              placeholder="搜索供应商、模型或上游名称"
              className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">状态</label>
          <select
            value={statusFilter}
            onChange={(e) => onStatusFilterChange(e.target.value)}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">全部</option>
            <option value="active">启用</option>
            <option value="disabled">禁用</option>
          </select>
        </div>
      </div>
    </div>
  )
}