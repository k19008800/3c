import { Loader2, Save, X, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'

// ── Types ──

export interface RoleForm {
  name: string
  label: string
  description: string
  permKeys: string[]
}

interface PermItem {
  key: string
  label: string
  bit: number
}

interface ModuleConfig {
  key: string
  label: string
  permPrefix: string
}

interface RoleFormModalProps {
  open: boolean
  mode: 'create' | 'edit'
  form: RoleForm
  formError: string
  submitting: boolean
  permItems: PermItem[]
  permLoading: boolean
  modules: ModuleConfig[]
  onClose: () => void
  onFormChange: (updater: (prev: RoleForm) => RoleForm) => void
  onSubmit: () => void
}

// ── Helpers ──

function getModuleKey(permKey: string, modules: ModuleConfig[]): string {
  const mod = modules.find((m) => permKey.startsWith(m.permPrefix))
  return mod?.key ?? 'other'
}

// ── Component ──

export default function RoleFormModal({
  open, mode, form, formError, submitting,
  permItems, permLoading, modules,
  onClose, onFormChange, onSubmit,
}: RoleFormModalProps) {
  if (!open) return null

  const handleTogglePerm = (permKey: string) => {
    onFormChange((prev) => ({
      ...prev,
      permKeys: prev.permKeys.includes(permKey)
        ? prev.permKeys.filter((k) => k !== permKey)
        : [...prev.permKeys, permKey],
    }))
  }

  const handleSelectModule = (moduleKey: string, select: boolean) => {
    const keys = permItems.filter((p) => getModuleKey(p.key, modules) === moduleKey).map((p) => p.key)
    onFormChange((prev) => ({
      ...prev,
      permKeys: select
        ? [...new Set([...prev.permKeys, ...keys])]
        : prev.permKeys.filter((k) => !keys.includes(k)),
    }))
  }

  const handleSelectAll = (select: boolean) => {
    onFormChange((prev) => ({
      ...prev,
      permKeys: select ? permItems.map((p) => p.key) : [],
    }))
  }

  const isModuleAllSelected = (moduleKey: string) => {
    const keys = permItems.filter((p) => getModuleKey(p.key, modules) === moduleKey).map((p) => p.key)
    return keys.length > 0 && keys.every((k) => form.permKeys.includes(k))
  }

  const isModuleSomeSelected = (moduleKey: string) => {
    const keys = permItems.filter((p) => getModuleKey(p.key, modules) === moduleKey).map((p) => p.key)
    return keys.some((k) => form.permKeys.includes(k))
  }

  const allPermSelected = permItems.length > 0 && form.permKeys.length === permItems.length

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-slate-900">
            {mode === 'create' ? '创建新角色' : '编辑角色'}
          </h2>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>

        {formError && (
          <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm mb-4">
            <AlertCircle size={16} />
            {formError}
          </div>
        )}

        <div className="space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              角色标识 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => onFormChange((p) => ({ ...p, name: e.target.value }))}
              disabled={mode === 'edit'}
              placeholder="如: custom_role"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100"
            />
            {mode === 'create' && (
              <p className="text-xs text-slate-400 mt-1">仅创建时可设置，小写字母开头，只允许小写字母、数字和下划线</p>
            )}
          </div>

          {/* Label */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              角色名称 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.label}
              onChange={(e) => onFormChange((p) => ({ ...p, label: e.target.value }))}
              placeholder="例如 自定义角色"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">角色描述</label>
            <textarea
              value={form.description}
              onChange={(e) => onFormChange((p) => ({ ...p, description: e.target.value }))}
              placeholder="如: 具有部分管理权限的自定义角色"
              rows={2}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          {/* Permissions */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-medium text-slate-700">权限配置</label>
              <button
                onClick={() => handleSelectAll(!allPermSelected)}
                className="text-xs text-blue-600 hover:text-blue-800 font-medium"
              >
                {allPermSelected ? '取消全选' : '全选'}
              </button>
            </div>

            {permLoading ? (
              <div className="flex justify-center py-6">
                <Loader2 className="animate-spin" size={20} />
              </div>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                {modules.map((mod) => {
                  const modPerms = permItems.filter((p) => getModuleKey(p.key, modules) === mod.key)
                  if (modPerms.length === 0) return null
                  const modAllSelected = isModuleAllSelected(mod.key)
                  const modSomeSelected = isModuleSomeSelected(mod.key)
                  return (
                    <div key={mod.key} className="border border-slate-200 rounded-lg overflow-hidden">
                      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 cursor-pointer"
                        onClick={() => handleSelectModule(mod.key, !modAllSelected)}>
                        <label className="flex items-center gap-2 cursor-pointer" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={modAllSelected}
                            onChange={() => handleSelectModule(mod.key, !modAllSelected)}
                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-sm font-medium text-slate-700">{mod.label}</span>
                          <span className="text-xs text-slate-400">({modPerms.length})</span>
                        </label>
                        {modSomeSelected && !modAllSelected && (
                          <span className="text-xs text-slate-400">部分选中</span>
                        )}
                      </div>
                      <div className="px-4 py-3 flex flex-wrap gap-3">
                        {modPerms.map((perm) => (
                          <label key={perm.key} className="flex items-center gap-1.5 cursor-pointer group">
                            <input
                              type="checkbox"
                              checked={form.permKeys.includes(perm.key)}
                              onChange={() => handleTogglePerm(perm.key)}
                              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="text-sm text-slate-600 group-hover:text-slate-800">{perm.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-3 border-t border-slate-100">
            <Button onClick={onSubmit} disabled={submitting || permLoading}>
              {submitting ? <Loader2 className="animate-spin mr-1" size={16} /> : <Save size={16} className="mr-1" />}
              {mode === 'edit' ? '保存修改' : '创建角色'}
            </Button>
            <Button variant="outline" onClick={onClose}>取消</Button>
          </div>
        </div>
      </div>
    </div>
  )
}
