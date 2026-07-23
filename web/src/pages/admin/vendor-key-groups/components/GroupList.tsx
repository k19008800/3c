import React, { memo } from 'react'
import type { KeyGroup } from '../hooks/useVendorKeyGroups'
import { strategyLabels } from '../utils'
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Settings,
  Trash2,
  Edit3,
  ToggleLeft,
  ToggleRight,
  ChevronRight
} from 'lucide-react'

interface GroupListProps {
  groups: KeyGroup[]
  selectedGroupId: number | null
  loading: boolean
  error: string
  onSelect: (groupId: number) => void
  onEdit: (group: KeyGroup) => void
  onDelete: (group: KeyGroup) => void
  onToggle: (group: KeyGroup) => void
  onCreateGroup: () => void
}

const GroupList: React.FC<GroupListProps> = memo(({
  groups,
  selectedGroupId,
  loading,
  error,
  onSelect,
  onEdit,
  onDelete,
  onToggle,
  onCreateGroup
}) => {
  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
        <div className="text-red-700 text-sm">{error}</div>
      </div>
    )
  }

  if (loading && groups.length === 0) {
    return (
      <div className="text-center py-8">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
        <p className="mt-2 text-slate-500">加载分组中...</p>
      </div>
    )
  }

  if (groups.length === 0) {
    return (
      <div className="text-center py-8">
        <div className="text-slate-400 mb-3">暂无密钥分组</div>
        <p className="text-sm text-slate-500 mb-4">请先创建一个密钥分组</p>
        <button
          onClick={onCreateGroup}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm"
        >
          创建分组
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-slate-900">密钥分组</h3>
        <button
          onClick={onCreateGroup}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
        >
          <span>+</span>
          创建分组
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {groups.map(group => {
          const isSelected = selectedGroupId === group.id
          const isActive = group.status
          
          return (
            <div
              key={group.id}
              className={`border rounded-lg p-4 transition-all cursor-pointer ${
                isSelected
                  ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                  : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
              }`}
              onClick={() => onSelect(group.id)}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-medium text-slate-900">{group.name}</h4>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onToggle(group)
                      }}
                      className="text-xs text-slate-400 hover:text-slate-600"
                      title={isActive ? '禁用分组' : '启用分组'}
                    >
                      {isActive ? (
                        <ToggleRight size={16} className="text-green-600" />
                      ) : (
                        <ToggleLeft size={16} className="text-red-600" />
                      )}
                    </button>
                  </div>
                  
                  {group.description && (
                    <p className="text-sm text-slate-500 mb-2">{group.description}</p>
                  )}
                  
                  <div className="flex items-center gap-3 text-xs text-slate-600 mb-2">
                    <span className="px-2 py-0.5 bg-slate-100 rounded">
                      {strategyLabels[group.strategy as keyof typeof strategyLabels] || group.strategy}
                    </span>
                    <span className="text-slate-400">|</span>
                    <span>创建: {new Date(group.createdAt).toLocaleDateString('zh-CN')}</span>
                  </div>
                </div>
                
                {isSelected && (
                  <ChevronRight size={20} className="text-blue-500 ml-2" />
                )}
              </div>

              {/* Stats */}
              <div className="grid grid-cols-4 gap-2 mb-3">
                <div className="text-center">
                  <div className="text-lg font-bold text-slate-900">{group.keyCount}</div>
                  <div className="text-xs text-slate-500">密钥</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-green-600">{group.activeCount}</div>
                  <div className="text-xs text-slate-500">正常</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-red-600">{group.downCount}</div>
                  <div className="text-xs text-slate-500">故障</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-yellow-600">{group.disabledCount}</div>
                  <div className="text-xs text-slate-500">禁用</div>
                </div>
              </div>

              {/* Status indicators */}
              <div className="flex flex-wrap gap-1.5 mb-3">
                {group.activeCount > 0 && (
                  <div className="flex items-center gap-1 text-xs text-green-700">
                    <CheckCircle2 size={12} />
                    <span>{group.activeCount}正常</span>
                  </div>
                )}
                {group.downCount > 0 && (
                  <div className="flex items-center gap-1 text-xs text-red-700">
                    <AlertTriangle size={12} />
                    <span>{group.downCount}故障</span>
                  </div>
                )}
                {group.disabledCount > 0 && (
                  <div className="flex items-center gap-1 text-xs text-yellow-700">
                    <XCircle size={12} />
                    <span>{group.disabledCount}禁用</span>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 pt-3 border-t border-slate-100">
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onEdit(group)
                  }}
                  className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs border border-slate-300 rounded hover:bg-slate-50 transition"
                >
                  <Edit3 size={12} />
                  编辑
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onDelete(group)
                  }}
                  className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs border border-red-300 text-red-600 rounded hover:bg-red-50 transition"
                >
                  <Trash2 size={12} />
                  删除
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onSelect(group.id)
                  }}
                  className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs border border-blue-300 text-blue-600 rounded hover:bg-blue-50 transition"
                >
                  <Settings size={12} />
                  管理密钥
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
})

GroupList.displayName = 'GroupList'

export default GroupList