import { Shield, Edit2, Trash2 } from 'lucide-react'
import type { RoleItem } from '../types'

interface RoleListProps {
  roles: RoleItem[]
  selectedId: number | null
  onSelect: (r: RoleItem) => void
  onEdit: (r: RoleItem) => void
  onDelete: (r: RoleItem) => void
}

export default function RoleList({ roles, selectedId, onSelect, onEdit, onDelete }: RoleListProps) {
  return (
    <div className="bg-white rounded-xl border overflow-hidden">
      <div className="p-4 border-b bg-slate-50">
        <h3 className="font-semibold">角色列表</h3>
      </div>
      <div className="divide-y">
        {roles.map((r) => (
          <div
            key={r.id}
            onClick={() => onSelect(r)}
            className={`p-4 cursor-pointer hover:bg-slate-50 ${
              selectedId === r.id ? 'bg-blue-50 border-l-4 border-blue-600' : ''
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield size={18} className={r.isSystem ? 'text-blue-600' : 'text-slate-400'} />
                <div>
                  <div className="font-medium">{r.label}</div>
                  <div className="text-xs text-slate-600">{r.name}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-600">{r.userCount} 用户</span>
                {!r.isSystem && (
                  <>
                    <button
                      onClick={(e) => { e.stopPropagation(); onEdit(r) }}
                      className="p-1 text-slate-400 hover:text-blue-600"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); onDelete(r) }}
                      className="p-1 text-slate-400 hover:text-red-600"
                    >
                      <Trash2 size={14} />
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}