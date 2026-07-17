// ──────────────────────────────────────────────
//  Users.tsx — 用户管理页面入口（统一调度子组件）
//  Refactored from 1947 lines → slim orchestrator
//  子组件位于 pages/admin/users/ 目录
// ──────────────────────────────────────────────

import { useEffect, useState, useCallback } from 'react'
import { get, post } from '@/lib/api'
import type { AdminUser, PaginatedData } from '@/types'
import FilterBar from '@/components/ui/FilterBar'
import FeatureDescription from '@/components/admin/FeatureDescription'
import { usePersistedFilters } from '@/hooks/use-persisted-filters'
import { UserPlus, Download, Ban, CheckCircle2, AlertCircle } from 'lucide-react'

// ── 子组件 ──
import UserStatsCard from './users/UserStatsCard'
import UserList from './users/UserList'
import UserDetailPanel from './users/UserDetailPanel'
import CreateUserModal from './users/CreateUserModal'

type FilterKey = 'keyword' | 'status' | 'role' | 'page' | 'pageSize'

export default function AdminUsers() {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // ── 持久化筛选 ──
  const { filters, setFilter, setFilters, resetFilters, hasActiveFilters } =
    usePersistedFilters({
      storageKey: 'admin-users',
      defaults: {
        keyword: '',
        status: '',
        role: '',
        page: 1,
        pageSize: 20,
      },
    })
  const { keyword, status: statusFilter, role: roleFilter, page, pageSize } =
    filters as {
      keyword: string
      status: string
      role: string
      page: number
      pageSize: number
    }

  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())

  const totalPages = Math.ceil(total / pageSize)

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params: any = { page, pageSize }
      if (keyword) params.keyword = keyword
      if (statusFilter) params.status = statusFilter
      if (roleFilter) params.role = roleFilter
      const data = await get<PaginatedData<AdminUser>>(
        '/api/v1/admin/users',
        params,
      )
      setUsers(data.list)
      setTotal(data.total)
    } catch (err: any) {
      setError(err.message || '获取用户列表失败')
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, keyword, statusFilter, roleFilter])

  useEffect(() => { fetchUsers() }, [fetchUsers])

  const toggleSelect = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleAll = useCallback(() => {
    setSelectedIds((prev) => {
      if (prev.size === users.length) return new Set()
      return new Set(users.map((u) => u.id))
    })
  }, [users])

  const handleBatchAction = async (action: 'disable' | 'enable') => {
    if (selectedIds.size === 0) return
    const ids = Array.from(selectedIds)
    try {
      if (action === 'disable')
        await post('/api/v1/admin/users/batch/disable', { userIds: ids })
      else await post('/api/v1/admin/users/batch/enable', { userIds: ids })
      setSelectedIds(new Set())
      fetchUsers()
    } catch (err: any) {
      setError(err.message || '批量操作失败')
    }
  }

  const handleExportCSV = async () => {
    try {
      const params: any = {}
      if (keyword) params.keyword = keyword
      if (statusFilter) params.status = statusFilter
      if (roleFilter) params.role = roleFilter
      const res = await fetch(
        `/api/v1/admin/users/export?${new URLSearchParams(params)}`,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('accessToken')}`,
          },
        },
      )
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `users_export_${Date.now()}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err: any) {
      setError('导出失败: ' + (err.message || ''))
    }
  }

  const handleUnban = async (userId: number) => {
    try {
      await post('/api/v1/admin/security/unban/user', { userId })
      fetchUsers()
    } catch (err: any) {
      setError('解封失败: ' + (err.message || ''))
    }
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">用户管理</h1>
        <FeatureDescription page="admin/users" className="ml-2" />
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3 py-2 text-sm border border-slate-300 rounded-lg hover:bg-slate-50 transition"
          >
            <Download size={15} /> 导出CSV
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
          >
            <UserPlus size={15} /> 创建用户
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <UserStatsCard />

      {/* Filters */}
      <FilterBar
        filters={{ keyword, status: statusFilter, role: roleFilter }}
        setFilter={(key, value) => setFilter(key as FilterKey, value)}
        resetFilters={resetFilters}
        hasActiveFilters={hasActiveFilters}
        onSearch={fetchUsers}
        fields={[
          {
            key: 'keyword',
            label: '搜索',
            type: 'text',
            placeholder: '搜索邮箱或昵称',
          },
          {
            key: 'status',
            label: '状态',
            type: 'select',
            options: [
              { value: '', label: '全部' },
              { value: 'active', label: '正常' },
              { value: 'disabled', label: '禁用' },
              { value: 'pending', label: '待验证' },
              { value: 'deleted', label: '已注销' },
            ],
          },
          {
            key: 'role',
            label: '角色',
            type: 'select',
            options: [
              { value: '', label: '全部' },
              { value: 'user', label: '用户' },
              { value: 'admin', label: '管理员' },
              { value: 'super_admin', label: '超级管理员' },
            ],
          },
        ]}
      />

      {/* Batch action bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-blue-50 border border-blue-200 rounded-lg text-sm">
          <span className="text-blue-700 font-medium">
            已选 {selectedIds.size} 项
          </span>
          <button
            onClick={() => handleBatchAction('disable')}
            className="flex items-center gap-1 px-3 py-1 text-red-600 bg-red-50 rounded-md hover:bg-red-100 transition"
          >
            <Ban size={14} /> 批量禁用
          </button>
          <button
            onClick={() => handleBatchAction('enable')}
            className="flex items-center gap-1 px-3 py-1 text-green-600 bg-green-50 rounded-md hover:bg-green-100 transition"
          >
            <CheckCircle2 size={14} /> 批量启用
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="text-slate-500 hover:text-slate-700 ml-auto"
          >
            取消选择
          </button>
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm">
          <AlertCircle size={16} /> {error}
          <button
            onClick={() => setError('')}
            className="ml-auto text-red-400 hover:text-red-600"
          >
            &times;
          </button>
        </div>
      )}

      {/* User List Table */}
      <UserList
        users={users}
        loading={loading}
        error={error}
        selectedIds={selectedIds}
        total={total}
        page={page}
        pageSize={pageSize}
        totalPages={totalPages}
        onToggleSelect={toggleSelect}
        onToggleAll={toggleAll}
        onSelectUser={setSelectedUser}
        onPageChange={(p) => setFilter('page', p)}
        onPageSizeChange={(s) => setFilters({ pageSize: s, page: 1 })}
        onUnban={handleUnban}
      />

      {/* User Detail Modal */}
      {selectedUser && (
        <UserDetailPanel
          user={selectedUser}
          onClose={() => {
            setSelectedUser(null)
            fetchUsers()
          }}
        />
      )}

      {/* Create User Modal */}
      {showCreate && (
        <CreateUserModal
          onClose={() => {
            setShowCreate(false)
            fetchUsers()
          }}
        />
      )}
    </div>
  )
}
