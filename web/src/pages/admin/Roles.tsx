import { useEffect, useState } from 'react'
import { Loader2, AlertCircle, Plus, X } from 'lucide-react'
import { RoleList, PermissionMatrix, UserAssignment } from './roles/components'
import { useRoles, useRoleUsers } from './roles/hooks'
import type { RoleItem, RoleForm } from './roles/types'

export default function Roles() {
  const { roles, perms, loading, error, fetchRoles, createRole, updateRole, deleteRole } = useRoles()
  const [selectedRole, setSelectedRole] = useState<RoleItem | null>(null)
  const { users, candidates, loading: usersLoading, fetchUsers, fetchCandidates, assignUser, removeUser } = useRoleUsers(selectedRole?.id ?? null)

  const [showCreate, setShowCreate] = useState(false)
  const [editRole, setEditRole] = useState<RoleItem | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<RoleItem | null>(null)
  const [form, setForm] = useState<RoleForm>({ name: '', label: '', description: '', permKeys: [] })

  useEffect(() => {
    fetchRoles()
  }, [fetchRoles])

  useEffect(() => {
    if (selectedRole) {
      fetchUsers(selectedRole.id)
    }
  }, [selectedRole, fetchUsers])

  const handleCreate = async () => {
    const r = await createRole(form)
    if (r) {
      setShowCreate(false)
      setForm({ name: '', label: '', description: '', permKeys: [] })
    }
  }

  const handleDelete = async () => {
    if (!deleteConfirm) return
    const ok = await deleteRole(deleteConfirm.id)
    if (ok) {
      setDeleteConfirm(null)
      if (selectedRole?.id === deleteConfirm.id) {
        setSelectedRole(null)
      }
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">角色管理</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <Plus size={16} />
          新建角色
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-4 bg-red-50 text-red-700 rounded-lg">
          <AlertCircle size={20} />
          {error}
        </div>
      )}

      {/* Main content */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="animate-spin" size={32} />
        </div>
      ) : (
        <div className="grid grid-cols-12 gap-6">
          {/* Left: Role list */}
          <div className="col-span-3">
            <RoleList
              roles={roles}
              selectedId={selectedRole?.id ?? null}
              onSelect={(r) => setSelectedRole(r)}
              onEdit={(r) => setEditRole(r)}
              onDelete={(r) => setDeleteConfirm(r)}
            />
          </div>

          {/* Middle: Permission matrix */}
          <div className="col-span-5">
            <PermissionMatrix role={selectedRole} perms={perms} />
          </div>

          {/* Right: User assignment */}
          <div className="col-span-4">
            <UserAssignment
              roleId={selectedRole?.id ?? null}
              users={users}
              candidates={candidates}
              loading={usersLoading}
              onFetchCandidates={fetchCandidates}
              onAssign={assignUser}
              onRemove={removeUser}
            />
          </div>
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">新建角色</h3>
              <button onClick={() => setShowCreate(false)} className="p-1 hover:bg-slate-100 rounded">
                <X size={20} />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">角色名</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">显示名</label>
                <input
                  type="text"
                  value={form.label}
                  onChange={(e) => setForm({ ...form, label: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">描述</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                  rows={3}
                />
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm border rounded-lg">
                  取消
                </button>
                <button onClick={handleCreate} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg">
                  创建
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl w-full max-w-sm p-6">
            <h3 className="text-lg font-semibold mb-4">确认删除</h3>
            <p className="text-sm text-slate-600 mb-4">
              确定删除角色 <strong>{deleteConfirm.label}</strong>？
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteConfirm(null)} className="px-4 py-2 text-sm border rounded-lg">
                取消
              </button>
              <button onClick={handleDelete} className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg">
                删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}