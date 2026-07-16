import { useEffect, useState, useCallback, useRef } from 'react'
import { get, post, patch, del } from '@/lib/api'
import { useAuth } from '@/hooks/use-auth'
import {
  Loader2, AlertCircle, CheckCircle2, ShieldCheck, Shield,
  Plus, Edit2, Trash2, X, Search, UserPlus, UserMinus,
  Lock, ChevronRight,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import FeatureDescription from '@/components/admin/FeatureDescription'
import RoleFormModal from './RoleFormModal'

// ── Types ──

interface RoleItem {
  id: number
  name: string
  label: string
  description: string | null
  permissions: bigint
  isSystem: boolean
  userCount: number
  createdAt: string
  updatedAt: string
}

interface PermItem {
  key: string
  label: string
  bit: number
}

interface UserInRole {
  userId: number
  email: string
  nickname: string | null
  assignedAt: string | null
}

interface CandidateUser {
  id: number
  email: string
  nickname: string | null
}

// ── Module config ──

const MODULES: { key: string; label: string; permPrefix: string }[] = [
  { key: 'dashboard', label: '仪表盘', permPrefix: 'DASHBOARD' },
  { key: 'users', label: '用户管理', permPrefix: 'USER' },
  { key: 'review', label: '审核', permPrefix: 'REVIEW' },
  { key: 'models', label: '模型供应商', permPrefix: 'MODEL' },
  { key: 'finance', label: '财务', permPrefix: 'FINANCE' },
  { key: 'config', label: '配置', permPrefix: 'CONFIG' },
  { key: 'security', label: '安全', permPrefix: 'SECURITY' },
  { key: 'audit', label: '审计', permPrefix: 'AUDIT' },
  { key: 'agents', label: '代理商', permPrefix: 'AGENT' },
  { key: 'logs', label: '日志', permPrefix: 'LOG' },
  { key: 'ops', label: '运维', permPrefix: 'OPS' },
  { key: 'reconciliation', label: '对账', permPrefix: 'RECONCILIATION' },
]

function getModuleKey(permKey: string): string {
  const mod = MODULES.find((m) => permKey.startsWith(m.permPrefix))
  return mod?.key ?? 'other'
}

// ── Form state ──

interface RoleForm {
  name: string
  label: string
  description: string
  permKeys: string[]
}

// ── Helper: check if bit is set in bigint string ──

function hasPerm(permStr: string | bigint, bit: number): boolean {
  const val = typeof permStr === 'string' ? BigInt(permStr) : permStr
  return ((val >> BigInt(bit)) & 1n) === 1n
}

function countPerms(permStr: string | bigint): number {
  let val = typeof permStr === 'string' ? BigInt(permStr) : permStr
  let count = 0
  while (val > 0n) {
    count += Number(val & 1n)
    val >>= 1n
  }
  return count
}

// ── Main Component ──

export default function AdminRoles() {
  const { user } = useAuth()
  const isSuperAdmin = user?.role === 'super_admin'

  // ── Roles list (left column) ──
  const [roles, setRoles] = useState<RoleItem[]>([])
  const [listLoading, setListLoading] = useState(true)
  const [listError, setListError] = useState('')
  const [searchText, setSearchText] = useState('')
  const [selectedRoleId, setSelectedRoleId] = useState<number | null>(null)

  // ── Permission list ──
  const [permItems, setPermItems] = useState<PermItem[]>([])
  const [permLoading, setPermLoading] = useState(false)

  // ── Role users (right column) ──
  const [roleUsers, setRoleUsers] = useState<UserInRole[]>([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [usersError, setUsersError] = useState('')

  // ── Assign user search ──
  const [assignSearch, setAssignSearch] = useState('')
  const [candidates, setCandidates] = useState<CandidateUser[]>([])
  const [candidatesLoading, setCandidatesLoading] = useState(false)
  const [selectedCandidateId, setSelectedCandidateId] = useState<number | null>(null)
  const [assigning, setAssigning] = useState(false)
  const assignSearchRef = useRef<HTMLInputElement>(null)
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>(null)

  // ── Modal state ──
  const [showModal, setShowModal] = useState(false)
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create')
  const [form, setForm] = useState<RoleForm>({ name: '', label: '', description: '', permKeys: [] })
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // ── Message ──
  const [msg, setMsg] = useState('')

  // ── Fetch roles ──
  const fetchRoles = useCallback(async () => {
    setListLoading(true)
    setListError('')
    try {
      const data = await get<{ list: RoleItem[] }>('/api/v1/admin/roles', { includeSystem: true })
      setRoles(data.list)
      if (!selectedRoleId && data.list.length > 0) {
        setSelectedRoleId(data.list[0].id)
      }
    } catch (err: any) {
      setListError(err.message || '获取角色列表失败')
    } finally {
      setListLoading(false)
    }
  }, [selectedRoleId])

  useEffect(() => {
    fetchRoles()
  }, [])

  // ── Fetch permissions list ──
  const fetchPerms = useCallback(async () => {
    setPermLoading(true)
    try {
      const data = await get<{ list: PermItem[] }>('/api/v1/admin/roles/permissions/list')
      setPermItems(data.list)
    } catch  {
      // silent
    } finally {
      setPermLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchPerms()
  }, [fetchPerms])

  // ── Fetch role users ──
  const fetchRoleUsers = useCallback(async (roleId: number) => {
    if (roleId <= 0) return
    setUsersLoading(true)
    setUsersError('')
    try {
      const data = await get<{ role: any; users: UserInRole[] }>(`/api/v1/admin/roles/users/${roleId}`)
      setRoleUsers(data.users)
    } catch (err: any) {
      setUsersError(err.message || '获取角色用户失败')
      setRoleUsers([])
    } finally {
      setUsersLoading(false)
    }
  }, [])

  useEffect(() => {
    if (selectedRoleId) {
      fetchRoleUsers(selectedRoleId)
    }
  }, [selectedRoleId, fetchRoleUsers])

  // ── Search users for assignment ──
  const searchUsers = useCallback(async (q: string) => {
    if (!q || q.length < 1) {
      setCandidates([])
      return
    }
    setCandidatesLoading(true)
    try {
      const data = await get<{ list: any[] }>(`/api/v1/admin/users`, { keyword: q, pageSize: 20 })
      // Filter out users already in this role
      const existingIds = new Set(roleUsers.map((u) => u.userId))
      setCandidates(
        data.list
          .filter((u) => !existingIds.has(u.id))
          .map((u) => ({ id: u.id, email: u.email, nickname: u.nickname }))
      )
    } catch  {
      setCandidates([])
    } finally {
      setCandidatesLoading(false)
    }
  }, [roleUsers])

  const handleAssignSearchChange = (value: string) => {
    setAssignSearch(value)
    setSelectedCandidateId(null)
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    searchTimerRef.current = setTimeout(() => searchUsers(value), 300)
  }

  // ── Assign user to role ──
  const handleAssignUser = async () => {
    if (!selectedCandidateId || !selectedRoleId) return
    setAssigning(true)
    try {
      await post(`/api/v1/admin/roles/${selectedRoleId}/users/${selectedCandidateId}`)
      setMsg('用户已分配')
      setAssignSearch('')
      setSelectedCandidateId(null)
      setCandidates([])
      fetchRoleUsers(selectedRoleId)
      // Update role user count
      setRoles((prev) =>
        prev.map((r) =>
          r.id === selectedRoleId ? { ...r, userCount: r.userCount + 1 } : r
        )
      )
    } catch (err: any) {
      setUsersError(err.message || '分配失败')
    } finally {
      setAssigning(false)
    }
  }

  // ── Remove user from role ──
  const handleRemoveUser = async (userId: number) => {
    if (!selectedRoleId) return
    const u = roleUsers.find((ru) => ru.userId === userId)
    if (!window.confirm(`确认将用户 "${u?.email || userId}" 移除该角色？`)) return
    try {
      await del(`/api/v1/admin/roles/${selectedRoleId}/users/${userId}`)
      setMsg('用户已移除')
      setRoleUsers((prev) => prev.filter((ru) => ru.userId !== userId))
      setRoles((prev) =>
        prev.map((r) =>
          r.id === selectedRoleId ? { ...r, userCount: r.userCount - 1 } : r
        )
      )
    } catch (err: any) {
      setUsersError(err.message || '移除失败')
    }
  }

  // ── Selected role ──
  const selectedRole = roles.find((r) => r.id === selectedRoleId) ?? null

  // ── Filtered roles ──
  const filteredRoles = roles.filter(
    (r) =>
      r.label.toLowerCase().includes(searchText.toLowerCase()) ||
      r.name.toLowerCase().includes(searchText.toLowerCase())
  )

  // ── Open Modal: Create ──
  const handleOpenCreate = () => {
    setModalMode('create')
    setForm({ name: '', label: '', description: '', permKeys: [] })
    setFormError('')
    setShowModal(true)
  }

  // ── Open Modal: Edit ──
  const handleOpenEdit = (role: RoleItem) => {
    setModalMode('edit')
    setForm({
      name: role.name,
      label: role.label,
      description: role.description || '',
      permKeys: permItems.filter(p => hasPerm(role.permissions, p.bit)).map(p => p.key),
    })
    setFormError('')
    setShowModal(true)
  }

  // ── Submit create/edit ──
  const handleSubmit = async () => {
    setFormError('')
    if (modalMode === 'create' && !form.name) {
      setFormError('请输入角色标签')
      return
    }
    if (!form.label) {
      setFormError('请输入角色名称')
      return
    }
    if (modalMode === 'create' && !/^[a-z][a-z0-9_]*$/.test(form.name)) {
      setFormError('角色标识必须以小写字母开头，只允许小写字母、数字和下划线')
      return
    }

    setSubmitting(true)
    try {
      if (modalMode === 'edit' && selectedRole) {
        await patch(`/api/v1/admin/roles/${selectedRole.id}`, {
          label: form.label,
          description: form.description,
          permissions: form.permKeys,
        })
        setMsg('角色已更新')
      } else {
        await post('/api/v1/admin/roles', {
          name: form.name,
          label: form.label,
          description: form.description,
          permissions: form.permKeys,
        })
        setMsg('角色已创建')
      }
      setShowModal(false)
      fetchRoles()
    } catch (err: any) {
      setFormError(err.message || '保存失败')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Delete role ──
  const handleDelete = async (role: RoleItem) => {
    if (!window.confirm(`确认删除角色 "${role.label}"？此操作不可撤销。`)) return
    try {
      await del(`/api/v1/admin/roles/${role.id}`)
      setMsg(`角色 "${role.label}" 已删除`)
      if (selectedRoleId === role.id) {
        setSelectedRoleId(roles.filter((r) => r.id !== role.id)[0]?.id ?? null)
      }
      fetchRoles()
    } catch (err: any) {
      setListError(err.message || '删除失败')
    }
  }

  // ── Role badge variant ──
  const roleBadgeVariant = (roleName: string) => {
    if (roleName === 'super_admin') return 'destructive'
    if (roleName === 'admin') return 'default'
    return 'secondary'
  }

  // ── Helper to compute edit/delete availability ──
  const isSystemRole = (role: RoleItem) => role.isSystem
  const isSuperAdminRole = (role: RoleItem) => role.name === 'super_admin'
  const canEditRole = (role: RoleItem) => isSystemRole(role) && !isSuperAdminRole(role)
  const canDeleteRole = (role: RoleItem) => !isSystemRole(role) && isSuperAdmin

  // ── Compute which perm keys are granted to the selected role ──
  const grantedPermKeys = selectedRole
    ? new Set(permItems.filter((p) => hasPerm(selectedRole.permissions, p.bit)).map((p) => p.key))
    : new Set<string>()

  // Group perms by module for display
  const groupPermsByModule = (grantedSet: Set<string>) => {
    return MODULES.map((mod) => {
      const modulePerms = permItems.filter((p) => getModuleKey(p.key) === mod.key)
      const granted = modulePerms.filter((p) => grantedSet.has(p.key))
      return { ...mod, total: modulePerms.length, granted: granted.length, perms: modulePerms, grantedSet }
    }).filter((m) => m.total > 0)
  }

  const permModulesDisplay = groupPermsByModule(grantedPermKeys)

  return (
    <div className="space-y-4">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">角色权限管理</h1>
        <FeatureDescription page="admin/roles" className="ml-2" />
        <Button onClick={handleOpenCreate} size="sm">
          <Plus size={16} className="mr-1" />
          创建角色
        </Button>
      </div>

      {/* ── Messages ── */}
      {msg && (
        <div className="flex items-center gap-2 text-green-700 bg-green-50 p-3 rounded-lg text-sm">
          <CheckCircle2 size={16} />
          {msg}
          <button onClick={() => setMsg('')} className="ml-auto text-green-500 hover:text-green-700">
            <X size={16} />
          </button>
        </div>
      )}
      {listError && (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm">
          <AlertCircle size={16} />
          {listError}
          <button onClick={() => setListError('')} className="ml-auto text-red-500 hover:text-red-700">
            <X size={16} />
          </button>
        </div>
      )}

      {/* ── Three-column layout ── */}
      <div className="grid grid-cols-12 gap-4 min-h-[600px]">
        {/* ── Left: Role List ── */}
        <div className="col-span-12 md:col-span-3 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
          {/* Search */}
          <div className="p-3 border-b border-slate-100">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="搜索角色..."
                className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {listLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="animate-spin" size={24} />
              </div>
            ) : filteredRoles.length === 0 ? (
              <div className="text-center py-12 text-slate-400 text-sm">无角色</div>
            ) : (
              filteredRoles.map((role) => {
                const active = role.id === selectedRoleId
                return (
                  <button
                    key={role.id}
                    onClick={() => setSelectedRoleId(role.id)}
                    className={`w-full text-left px-4 py-3 transition-colors border-b border-slate-50 last:border-b-0 hover:bg-slate-50 ${
                      active ? 'bg-blue-50 border-l-2 border-l-blue-600' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className={`p-1.5 rounded-lg shrink-0 ${
                          role.name === 'super_admin'
                            ? 'bg-red-100 text-red-600'
                            : role.isSystem
                              ? 'bg-blue-100 text-blue-600'
                              : 'bg-slate-100 text-slate-600'
                        }`}>
                          {role.name === 'super_admin' ? <Lock size={14} /> : <ShieldCheck size={14} />}
                        </div>
                        <span className="text-sm font-medium text-slate-800 truncate">{role.label}</span>
                      </div>
                      {active && <ChevronRight size={14} className="text-blue-500 shrink-0" />}
                    </div>
                    <div className="flex items-center gap-2 mt-1.5 ml-9">
                      <code className="text-xs text-slate-400">{role.name}</code>
                      {isSuperAdminRole(role) && (
                        <Badge variant="destructive" className="text-[10px] px-1 py-0">系统</Badge>
                      )}
                      {role.isSystem && !isSuperAdminRole(role) && (
                        <Badge variant="outline" className="text-[10px] px-1 py-0 text-blue-600 border-blue-200 bg-blue-50">系统</Badge>
                      )}
                      <span className="text-xs text-slate-400 ml-auto">{role.userCount}人</span>
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </div>

        {/* ── Center: Role Detail ── */}
        <div className="col-span-12 md:col-span-5 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          {!selectedRole ? (
            <div className="flex flex-col items-center justify-center h-full py-20 text-slate-400">
              <Shield size={40} className="mb-3 opacity-40" />
              <p className="text-sm">请选择一个角色查看详情</p>
            </div>
          ) : (
            <div className="p-5 space-y-5">
              {/* Basic Info */}
              <div>
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">{selectedRole.label}</h2>
                    <code className="text-sm text-slate-400">{selectedRole.name}</code>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {isSuperAdminRole(selectedRole) && (
                      <Badge variant="destructive">超级管理员</Badge>
                    )}
                    {isSystemRole(selectedRole) && !isSuperAdminRole(selectedRole) && (
                      <Badge variant="outline" className="text-blue-600 border-blue-200 bg-blue-50">系统预置</Badge>
                    )}
                  </div>
                </div>
                {selectedRole.description && (
                  <p className="text-sm text-slate-500 mt-2">{selectedRole.description}</p>
                )}
              </div>

              <div className="flex items-center gap-4 text-sm text-slate-500">
                <span>权限: {countPerms(selectedRole.permissions)} 项</span>
                <span>用户: {selectedRole.userCount} 人</span>
              </div>

              {/* Permission Matrix */}
              <div>
                <h3 className="text-sm font-semibold text-slate-700 mb-3">权限一览</h3>
                {permLoading ? (
                  <div className="flex justify-center py-6">
                    <Loader2 className="animate-spin" size={20} />
                  </div>
                ) : (
                  <div className="space-y-2">
                    {permModulesDisplay.map((mod) => (
                      <div
                        key={mod.key}
                        className={`rounded-lg border px-4 py-2.5 ${
                          mod.granted === mod.total
                            ? 'border-green-200 bg-green-50/40'
                            : mod.granted > 0
                              ? 'border-amber-200 bg-amber-50/40'
                              : 'border-slate-100 bg-slate-50/40'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${
                              mod.granted === mod.total
                                ? 'bg-green-500'
                                : mod.granted > 0
                                  ? 'bg-amber-400'
                                  : 'bg-slate-300'
                            }`} />
                            <span className="text-sm font-medium text-slate-700">{mod.label}</span>
                            <span className="text-xs text-slate-400">
                              {mod.granted}/{mod.total}
                            </span>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
                          {mod.perms.map((perm) => (
                            <span
                              key={perm.key}
                              className={`inline-flex items-center gap-1 text-xs ${
                                mod.grantedSet.has(perm.key)
                                  ? 'text-green-700'
                                  : 'text-slate-400'
                              }`}
                            >
                              {mod.grantedSet.has(perm.key) ? (
                                <CheckCircle2 size={12} className="text-green-500" />
                              ) : (
                                <X size={12} />
                              )}
                              {perm.label}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                {isSuperAdminRole(selectedRole) ? (
                  <span className="text-xs text-slate-400 italic">超级管理员角色不可编辑</span>
                ) : (
                  <>
                    {(canEditRole(selectedRole) || !isSystemRole(selectedRole)) && (
                      <Button variant="outline" size="sm" onClick={() => handleOpenEdit(selectedRole)}>
                        <Edit2 size={14} className="mr-1" />
                        {isSystemRole(selectedRole) ? '编辑信息' : '编辑角色'}
                      </Button>
                    )}
                    {canDeleteRole(selectedRole) && (
                      <Button variant="destructive" size="sm" onClick={() => handleDelete(selectedRole)}>
                        <Trash2 size={14} className="mr-1" />
                        删除
                      </Button>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── Right: Role Users ── */}
        <div className="col-span-12 md:col-span-4 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
          {!selectedRole ? (
            <div className="flex flex-col items-center justify-center h-full py-20 text-slate-400">
              <UserPlus size={40} className="mb-3 opacity-40" />
              <p className="text-sm">请选择角色管理用户</p>
            </div>
          ) : (
            <>
              {/* Assign user */}
              <div className="p-4 border-b border-slate-100 space-y-2">
                <h3 className="text-sm font-semibold text-slate-700">
                  分配用户到 {selectedRole.label}</h3>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      ref={assignSearchRef}
                      type="text"
                      value={assignSearch}
                      onChange={(e) => handleAssignSearchChange(e.target.value)}
                      placeholder="搜索邮箱或昵称?.."
                      className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
                {assignSearch && (
                  <div className="max-h-32 overflow-y-auto border border-slate-200 rounded-lg">
                    {candidatesLoading ? (
                      <div className="flex justify-center py-3">
                        <Loader2 className="animate-spin" size={16} />
                      </div>
                    ) : candidates.length === 0 ? (
                      <div className="text-center py-3 text-xs text-slate-400">
                        {assignSearch.length < 1 ? '请输入搜索条件' : '无匹配用户'}
                      </div>
                    ) : (
                      candidates.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => {
                            setSelectedCandidateId(c.id)
                            setAssignSearch(`${c.nickname || c.email} (${c.email})`)
                            setCandidates([])
                          }}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 transition-colors border-b border-slate-50 last:border-b-0"
                        >
                          <span className="text-slate-800">{c.nickname || c.email}</span>
                          {c.nickname && <span className="text-slate-400 ml-2">({c.email})</span>}
                        </button>
                      ))
                    )}
                  </div>
                )}
                <Button
                  size="sm"
                  className="w-full"
                  disabled={!selectedCandidateId || assigning}
                  onClick={handleAssignUser}
                >
                  {assigning ? (
                    <Loader2 className="animate-spin mr-1" size={14} />
                  ) : (
                    <UserPlus size={14} className="mr-1" />
                  )}
                  分配此用户?                </Button>
              </div>

              {/* User list */}
              <div className="flex-1 overflow-y-auto">
                <div className="px-4 py-2 bg-slate-50 text-xs font-medium text-slate-500 flex items-center justify-between border-b border-slate-100">
                  <span>当前用户（{roleUsers.length}）</span>
                </div>
                {usersLoading ? (
                  <div className="flex justify-center py-12">
                    <Loader2 className="animate-spin" size={20} />
                  </div>
                ) : usersError ? (
                  <div className="flex items-center gap-2 justify-center py-12 text-red-500 text-sm">
                    <AlertCircle size={16} />
                    {usersError}
                  </div>
                ) : roleUsers.length === 0 ? (
                  <div className="text-center py-12 text-slate-400 text-sm">暂无用户</div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {roleUsers.map((ru) => (
                      <div key={ru.userId} className="flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors">
                        <div className="min-w-0">
                          <p className="text-sm text-slate-800 truncate">
                            {ru.nickname || ru.email}
                          </p>
                          {ru.nickname && (
                            <p className="text-xs text-slate-400 truncate">{ru.email}</p>
                          )}
                          <p className="text-[10px] text-slate-300 mt-0.5">
                            ID: {ru.userId}{ru.assignedAt ? ` 路 ${new Date(ru.assignedAt).toLocaleDateString('zh-CN')} 分配` : ''}
                          </p>
                        </div>
                        <button
                          onClick={() => handleRemoveUser(ru.userId)}
                          className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                          title="移除该角色"
                        >
                          <UserMinus size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Modal: Create/Edit Role ── */}
      <RoleFormModal
        open={showModal}
        mode={modalMode}
        form={form}
        formError={formError}
        submitting={submitting}
        permItems={permItems}
        permLoading={permLoading}
        modules={MODULES}
        onClose={() => setShowModal(false)}
        onFormChange={(updater) => setForm(updater)}
        onSubmit={handleSubmit}
      />
    </div>
  )
}