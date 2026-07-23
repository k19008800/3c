import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Download, UserPlus } from 'lucide-react'
import UserFilters from './components/UserFilters'
import UsersList from './components/UsersList'
import UserActions from './components/UserActions'
import { useUsers } from './hooks/useUsers'
import { useUserActions } from './hooks/useUserActions'

const UsersPage: React.FC = () => {
  const navigate = useNavigate()
  const [showCreate, setShowCreate] = useState(false)
  const [selectedUser, setSelectedUser] = useState<any>(null)
  
  const {
    users,
    total,
    loading,
    error,
    page,
    pageSize,
    filters,
    selectedIds,
    totalPages,
    setPage,
    setFilters,
    toggleSelect,
    toggleAll,
    handleBatchAction,
    handleExportCSV,
    refreshUsers
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
    // You could open a modal or navigate to detail page here
    console.log('View user detail:', user)
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
          onDisable={() => handleBatchAction('disable')}
          onEnable={() => handleBatchAction('enable')}
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
          onImpersonate={handleImpersonate}
          onDisable={handleDisable}
          onEnable={handleEnable}
          onResetPassword={handleResetPassword}
          loading={loading}
        />
      </div>

      {/* Pagination */}
      {totalPages >-1 && (
        <div className="flex items-center justify-between pt-4 border-t border-slate-200">
          <div className="text-sm text-slate-600">
            共 {total} 条记录，第 {page}/{totalPages} 页
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page <= 1}
              className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              上一页
            </button>
            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum = i + 1
                if (totalPages > 5) {
                  if (page <= 3) pageNum = i + 1
                  else if (page >= totalPages - 2) pageNum = totalPages - 4 + i
                  else pageNum = page - 2 + i
                }
                return (
                  <button
                    key={pageNum}
                    onClick={() => setPage(pageNum)}
                    className={`px-3 py-1.5 rounded-lg text-sm ${
                      page === pageNum
                        ? 'bg-blue-600 text-white'
                        : 'border border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    {pageNum}
                  </button>
                )
              })}
            </div>
            <button
              onClick={() => setPage(Math.min(totalPages, page + 1))}
              disabled={page >= totalPages}
              className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              下一页
            </button>
          </div>
        </div>
      )}

      {/* TODO: Add UserFormModal and UserDetailModal components */}
      {/* {showCreate && <UserFormModal onClose={() => setShowCreate(false)} />}
      {selectedUser && <UserDetailModal user={selectedUser} onClose={() => setSelectedUser(null)} />} */}
    </div>
  )
}

export default UsersPage