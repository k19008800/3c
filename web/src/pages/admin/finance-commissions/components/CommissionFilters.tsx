import { Search, Filter } from 'lucide-react'

interface CommissionFiltersProps {
  filters: {
    agentId: string
    startDate: string
    endDate: string
    status: string
    commissionType: string
  }
  setFilters: (filters: any) => void
}

export default function CommissionFilters({ filters, setFilters }: CommissionFiltersProps) {
  const handleFilterChange = (key: string, value: string) => {
    setFilters({ ...filters, [key]: value })
  }

  const handleReset = () => {
    setFilters({
      agentId: '',
      startDate: '',
      endDate: '',
      status: '',
      commissionType: '',
    })
  }

  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
      <div className="flex items-center gap-2 mb-3">
        <Filter size={16} className="text-slate-500" />
        <span className="text-sm font-medium text-slate-700">筛选条件</span>
        <button
          onClick={handleReset}
          className="ml-auto text-xs text-blue-600 hover:text-blue-800"
        >
          重置筛选
        </button>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {/* 代理商ID */}
        <div className="relative">
          <label className="block text-xs text-slate-600 mb-1">代理商ID</label>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 text-slate-400" size={14} />
            <input
              type="text"
              placeholder="代理商ID"
              value={filters.agentId}
              onChange={(e) => handleFilterChange('agentId', e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 border rounded text-sm"
            />
          </div>
        </div>

        {/* 开始日期 */}
        <div>
          <label className="block text-xs text-slate-600 mb-1">开始日期</label>
          <input
            type="date"
            value={filters.startDate}
            onChange={(e) => handleFilterChange('startDate', e.target.value)}
            className="w-full px-3 py-1.5 border rounded text-sm"
          />
        </div>

        {/* 结束日期 */}
        <div>
          <label className="block text-xs text-slate-600 mb-1">结束日期</label>
          <input
            type="date"
            value={filters.endDate}
            onChange={(e) => handleFilterChange('endDate', e.target.value)}
            className="w-full px-3 py-1.5 border rounded text-sm"
          />
        </div>

        {/* 状态筛选 */}
        <div>
          <label className="block text-xs text-slate-600 mb-1">状态</label>
          <select
            value={filters.status}
            onChange={(e) => handleFilterChange('status', e.target.value)}
            className="w-full px-3 py-1.5 border rounded text-sm"
          >
            <option value="">全部状态</option>
            <option value="pending">待结算</option>
            <option value="settled">已结算</option>
          </select>
        </div>

        {/* 佣金类型 */}
        <div>
          <label className="block text-xs text-slate-600 mb-1">佣金类型</label>
          <select
            value={filters.commissionType}
            onChange={(e) => handleFilterChange('commissionType', e.target.value)}
            className="w-full px-3 py-1.5 border rounded text-sm"
          >
            <option value="">全部类型</option>
            <option value="order">订单佣金</option>
            <option value="topup">充值佣金</option>
            <option value="withdraw">提现佣金</option>
          </select>
        </div>
      </div>

      <div className="mt-3 text-xs text-slate-500">
        <span>提示：选择日期范围可筛选指定时间段的佣金记录</span>
      </div>
    </div>
  )
}