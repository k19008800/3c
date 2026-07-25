import React, { memo } from 'react'
import type { AdminUser } from '@/types'
import VirtualUsersList from './VirtualUsersList'

interface UsersListProps {
  users: AdminUser[]
  selectedIds: Set<number>
  onSelect: (id: number) => void
  onSelectAll: () => void
  onViewDetail: (user: AdminUser) => void
  loading?: boolean
  /** 虚拟滚动列表高度 */
  virtualScrollHeight?: number
}

const UsersList: React.FC<UsersListProps> = memo(({
  users,
  selectedIds,
  onSelect,
  onSelectAll,
  onViewDetail,
  loading = false,
  virtualScrollHeight = 600,
}) => {
  // 始终使用虚拟滚动（照抄生产环境）
  return (
    <VirtualUsersList
      users={users}
      selectedIds={selectedIds}
      onSelect={onSelect}
      onSelectAll={onSelectAll}
      onViewDetail={onViewDetail}
      loading={loading}
      height={virtualScrollHeight}
    />
  )
})

UsersList.displayName = 'UsersList'

export default UsersList