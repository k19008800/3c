import React, { memo } from 'react'
import { Search } from 'lucide-react'

interface UserFiltersProps {
  keyword: string
  status: string
  role: string
  onKeywordChange: (value: string) => void
  onStatusChange: (value: string) => void
  onRoleChange: (value: string) => void
}

const UserFilters: React.FC<UserFiltersProps> = memo(({
  keyword,
  status,
  role,
  onKeywordChange,
  onStatusChange,
  onRoleChange
}) => {
  const statusOptions = [
    { value: '', label: '全部状态' },
    { value: 'active', label: '正常' },
    { value: 'disabled', label: '禁用' },
    { value: 'pending', label: '待验证' },
    { value: 'deleted', label: '已注销' }
  ]

  const roleOptions = [
    { value: '', label: '全部角色' },
    { value: 'super_admin', label: '超级管理员' },
    { value: 'admin', label: '管理员' },
    { value: 'user', label: '用户' }
  ]

  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
      <div className="flex flex-wrap gap-4 items-end">
        {/* Search input */}
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs text-slate-500 mb-1">搜索</label>
          <div className="relative">
            <Search 
              size={16} 
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" 
            />
            <input
              type="text"
              value={keyword}
              onChange={(e) => onKeywordChange(e.target.value)}
              placeholder="搜索邮箱或昵称"
              className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Status filter */}
        <div>
          <label className="block text-xs text-slate-500 mb-1">状态</label>
          <select
            value={status}
            onChange={(e) => onStatusChange(e.target.value)}
            className="w-32 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {statusOptions.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {/* Role filter */}
        <div>
          <label className="block text-xs text-slate-500 mb-1">角色</label>
          <select
            value={role}
            onChange={(e) => onRoleChange(e.target.value)}
            className="w-32 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {roleOptions.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {/* Filter stats */}
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <span className="px-2 py-1 bg-slate-100 rounded">
            筛选条件: 
            {keyword && <span className="ml-1 text-blue-600">"{keyword}"</span>}
            {status && <span className="ml-1 text-green-600">{statusOptions.find(o => o.value === status)?.label}</span>}
            {role && <span className="ml-1 text-purple-600">{roleOptions.find(o => o.value === role)?.label}</span>}
          </span>
        </div>
      </div>
    </div>
  )
})

UserFilters.displayName = 'UserFilters'

export default UserFilters