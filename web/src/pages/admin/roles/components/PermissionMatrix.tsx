import { CheckCircle2 } from 'lucide-react'
import type { RoleItem, PermItem } from '../types'
import { hasPerm, getModuleKey, MODULES } from '../types'

interface PermissionMatrixProps {
  role: RoleItem | null
  perms: PermItem[]
}

export default function PermissionMatrix({ role, perms }: PermissionMatrixProps) {
  if (!role) return null

  // 按 module 分组
  const grouped = perms.reduce((acc, p) => {
    const modKey = getModuleKey(p.key)
    if (!acc[modKey]) acc[modKey] = []
    acc[modKey].push(p)
    return acc
  }, {} as Record<string, PermItem[]>)

  return (
    <div className="bg-white rounded-xl border overflow-hidden">
      <div className="p-4 border-b bg-slate-50">
        <h3 className="font-semibold">{role.label} - 权限矩阵</h3>
      </div>
      <div className="divide-y">
        {MODULES.map((mod) => {
          const modPerms = grouped[mod.key] || []
          if (modPerms.length === 0) return null

          return (
            <div key={mod.key} className="p-4">
              <div className="text-sm font-medium text-slate-700 mb-2">{mod.label}</div>
              <div className="grid grid-cols-4 gap-2">
                {modPerms.map((p) => {
                  const enabled = hasPerm(role.permissions, p.bit)
                  return (
                    <div
                      key={p.key}
                      className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs ${
                        enabled ? 'bg-green-50 text-green-700' : 'bg-slate-50 text-slate-500'
                      }`}
                    >
                      {enabled && <CheckCircle2 size={12} />}
                      {p.label}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}