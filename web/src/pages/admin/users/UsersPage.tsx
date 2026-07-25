import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Download, UserPlus } from 'lucide-react'
import PaginationBar from '@/components/ui/PaginationBar'
import StatsCards from './components/StatsCards'
import UserFilters from './components/UserFilters'
import UsersList from './components/UsersList'
import UserActions from './components/UserActions'
import UserDetailPanel from './UserDetailPanel'
import BatchOperationDialog, { BatchActionType } from '@/components/admin/BatchOperationDialog'
import { useUsers } from './hooks/useUsers'
import { useUserActions } from './hooks/useUserActions'

const UsersPage: React.FC = () => {
  const navigate = useNavigate()
  const [showCreate, setShowCreate] = useState(false)
  const [selectedUser, setSelectedUser] = useState<any>(null)
  const [batchDialogOpen, setBatchDialogOpen] = useState(false)
  const [batchActionType, setBatchActionType] = useState<BatchActionType>('disable')
  
  const {
    users,
    total,
    stats,
    loading,
    error,
    page,
    pageSize,
    filters,
    selectedIds,
    setSelectedIds,
    totalPages,
    setPage,
    setPageSize,
    setFilters,
    toggleSelect,
    toggleAll,
    handleExportCSV,
    refreshUsers,
    refreshStats
  } = useUsers()

  const {
    disableUser,
    enableUser,
    impersonateUser,
    resetPassword,
    loading: actionsLoading,
    error: actionsError,
    successMessage
  } = useUserActions()

  const handleImpersonate = async (userId: number) => {
    await impersonateUser(userId)
  }

  const handleDisable = async (userId: number) => {
    if (await disableUser(userId)) {
      await refreshUsers()
    }
  }

  const handleEnable = async (userId: number) => {
    if (await enableUser(userId)) {
      await refreshUsers()
    }
  }

  const handleResetPassword = async (userId: number) => {
    await resetPassword(userId)
  }

  const handleViewDetail = (user: any) => {
    setSelectedUser(user)
    console.log('View user detail:', user)
  }

  // 批量操作处理
  const openBatchDialog = (action: BatchActionType) => {
    setBatchActionType(action)
    setBatchDialogOpen(true)
  }

  const handleBatchSuccess = async () => {
    setBatchDialogOpen(false)
    setSelectedIds(new Set())
    await refreshUsers()
    await refreshStats()
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">用户管理</h1>
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

      {/* Error and success messages */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="text-red-700 text-sm">{error}</div>
        </div>
      )}
      {actionsError && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="text-red-700 text-sm">{actionsError}</div>
        </div>
      )}
      {successMessage && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
          <div className="text-green-700 text-sm">{successMessage}</div>
        </div>
      )}

      {/* Stats Cards */}
      <StatsCards stats={stats} loading={loading && !users.length} />

      {/* Filters */}
      <UserFilters
        keyword={filters.keyword}
        status={filters.status}
        role={filters.role}
        onKeywordChange={(keyword) => setFilters({ keyword })}
        onStatusChange={(status) => setFilters({ status })}
        onRoleChange={(role) => setFilters({ role })}
      />

      {/* Batch Actions */}
      {selectedIds.size > 0 && (
        <UserActions
          selectedCount={selectedIds.size}
          onDisable={() => openBatchDialog('disable')}
          onEnable={() => openBatchDialog('enable')}
          onBalance={() => openBatchDialog('balance')}
          onLevel={() => openBatchDialog('level')}
          onExport={() => openBatchDialog('export')}
          onClear={() => setSelectedIds(new Set())}
          loading={actionsLoading}
        />
      )}

      {/* Users List */}
      <div className="relative">
        <UsersList
          users={users}
          selectedIds={selectedIds}
          onSelect={toggleSelect}
          onSelectAll={toggleAll}
          onViewDetail={handleViewDetail}
          loading={loading}
        />
      </div>

      {/* Pagination */}
      {totalPages > 0 && (
        <PaginationBar
          page={page}
          pageSize={pageSize}
          total={total}
          totalPages={totalPages}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      )}

      {/* User Detail Panel */}
      {selectedUser && (
        <UserDetailPanel
          user={selectedUser}
          onClose={() => setSelectedUser(null)}
        />
      )}

      {/* Batch Operation Dialog */}
      <BatchOperationDialog
        isOpen={batchDialogOpen}
        onClose={() => setBatchDialogOpen(false)}
        actionType={batchActionType}
        selectedCount={selectedIds.size}
        selectedIds={Array.from(selectedIds)}
        onSuccess={handleBatchSuccess}
      />
    </div>
  )
}

export default UsersPage