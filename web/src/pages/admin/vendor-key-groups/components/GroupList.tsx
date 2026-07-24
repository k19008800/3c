import { Plus, Info, ToggleRight, ToggleLeft, Edit3, Trash2 } from 'lucide-react'

interface KeyGroup {
  id: number
  vendorId: number
  name: string
  strategy: string
  description: string | null
  status: boolean
  keyCount: number
  activeCount: number
  downCount: number
  disabledCount: number
  createdAt: string
  updatedAt: string
}

interface GroupListProps {
  groups: KeyGroup[]
  selectedGroupId: number | null
  onSelect: (groupId: number) => void
  onToggle: (group: KeyGroup) => void
  onEdit: (group: KeyGroup) => void
  onDelete: (group: KeyGroup) => void
  onCreateGroup: () => void
}

export default function GroupList({
  groups,
  selectedGroupId,
  onSelect,
  onToggle,
  onEdit,
  onDelete,
  onCreateGroup,
}: GroupListProps) {
  const getStrategyLabel = (strategy: string) => {
    switch (strategy) {
      case 'round_robin': return '轮询'
      case 'weighted': return '加权'
      case 'failover': return '故障转移'
      case 'priority': return '优先级'
      default: return strategy
    }
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
        <h2 className="text-base font-semibold text-slate-800">资源池</h2>
        <button
          onClick={onCreateGroup}
          className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <Plus size={14} />新建
        </button>
      </div>

      {groups.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-10 text-slate-400">
          <Info size={32} className="text-slate-300" />
          <p className="text-sm">暂无资源池</p>
          <button
            onClick={onCreateGroup}
            className="flex items-center gap-1 px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Plus size={14} />立即新建
          </button>
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {groups.map(g => (
            <div
              key={g.id}
              className={`px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-slate-50 transition ${selectedGroupId === g.id ? 'bg-blue-50' : ''}`}
              onClick={() => onSelect(g.id)}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${g.status ? 'bg-green-500' : 'bg-slate-300'}`} />
                  <span className="text-sm font-medium text-slate-900 truncate">{g.name}</span>
                  <span className="text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 whitespace-nowrap">
                    {getStrategyLabel(g.strategy)}
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-xs text-slate-400">{g.keyCount} 个 Key</span>
                  {g.keyCount > 0 && (
                    <span className="flex items-center gap-2 text-xs">
                      <span className="text-green-600">🟢{g.activeCount}</span>
                      {g.downCount > 0 && <span className="text-red-600">🔴{g.downCount}</span>}
                      {g.disabledCount > 0 && <span className="text-slate-400">⚪{g.disabledCount}</span>}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={(e) => { e.stopPropagation(); onToggle(g) }}
                  className="p-1 text-slate-400 hover:text-blue-600 rounded"
                  title={g.status ? '停用' : '启用'}
                >
                  {g.status ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onEdit(g) }}
                  className="p-1 text-slate-400 hover:text-blue-600 rounded"
                  title="编辑"
                >
                  <Edit3 size={14} />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onDelete(g) }}
                  className="p-1 text-slate-400 hover:text-red-600 rounded"
                  title="删除"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}