import React, { memo } from 'react'
import { useImpersonate } from '@/hooks/use-impersonate'
import type { AdminUser } from '@/types'
import { roleLabel, roleColor, statusLabel, statusColor, fmt, fmtDate } from '../utils'
import {
  Eye,
  LogIn,
  User,
  CheckCircle2,
  XCircle,
  Trash2,
  RefreshCw,
  Ban,
  Wallet,
  Activity,
  Globe,
  MessageSquare,
  BarChart3,
} from 'lucide-react'

interface UsersListProps {
  users: AdminUser[]
  selectedIds: Set<number>
  onSelect: (id: number) => void
  onSelectAll: () => void
  onViewDetail: (user: AdminUser) => void
  onImpersonate: (userId: number) => Promise<void>
  onDisable: (userId: number) => Promise<void>
  onEnable: (userId: number) => Promise<void>
  onResetPassword: (userId: number) => Promise<void>
  loading?: boolean
}

const UsersList: React.FC<UsersListProps> = memo(({
  users,
  selectedIds,
  onSelect,
  onSelectAll,
  onViewDetail,
  onImpersonate,
  onDisable,
  onEnable,
  onResetPassword,
  loading = false
}) => {
  const { impersonate } = useImpersonate()

  const handleImpersonate = async (userId: number) => {
    try {
      await impersonate(userId)
    } catch (err) {
      console.error('Impersonate failed:', err)
    }
  }

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
        <p className="mt-2 text-slate-500">加载中...</p>
      </div>
    )
  }

  if (users.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-slate-400 mb-2">暂无用户数据</div>
        <p className="text-sm text-slate-500">尝试调整筛选条件或创建新用户</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-50 text-left border-b border-slate-200">
            <th className="py-3 px-4">
              <input
                type="checkbox"
                checked={selectedIds.size === users.length && users.length > 0}
                onChange={onSelectAll}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
            </th>
            <th className="py-3 px-4 text-slate-500 font-medium">用户ID</th>
            <th className="py-3 px-4 text-slate-500 font-medium">邮箱/昵称</th>
            <th className="py-3 px-4 text-slate-500 font-medium">角色</th>
            <th className="py-3 px-4 text-slate-500 font-medium">状态</th>
            <th className="py-3 px-4 text-slate-500 font-medium">实名状态</th>
            <th className="py-3 px-4 text-slate-500 font-medium">余额</th>
            <th className="py-3 px-4 text-slate-500 font-medium">最后登录</th>
            <th className="py-3 px-4 text-slate-500 font-medium">注册时间</th>
            <th className="py-3 px-4 text-slate-500 font-medium">操作</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {users.map(user => (
            <tr key={user.id} className="hover:bg-slate-50 transition-colors">
              <td className="py-3 px-4">
                <input
                  type="checkbox"
                  checked={selectedIds.has(user.id)}
                  onChange={() => onSelect(user.id)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
              </td>
              <td className="py-3 px-4 font-mono text-xs">{user.id}</td>
              <td className="py-3 px-4">
                <div className="font-medium">{user.email}</div>
                <div className="text-slate-500 text-xs">{fmt(user.nickname)}</div>
              </td>
              <td className="py-3 px-4">
                <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${roleColor[user.role]}`}>
                  {roleLabel[user.role] || user.role}
                </span>
              </td>
              <td className="py-3 px-4">
                <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${statusColor[user.status]}`}>
                  {statusLabel[user.status] || user.status}
                </span>
              </td>
              <td className="py-3 px-4">
                <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                  user.realNameStatus === 'approved' ? 'bg-green-100 text-green-700' :
                  user.realNameStatus === 'pending_review' ? 'bg-yellow-100 text-yellow-700' :
                  user.realNameStatus === 'rejected' ? 'bg-red-100 text-red-700' :
                  'bg-slate-100 text-slate-700'
                }`}>
                  {user.realNameStatus === 'approved' && <CheckCircle2 size={12} />}
                  {user.realNameStatus === 'pending_review' && <RefreshCw size={12} />}
                  {user.realNameStatus === 'rejected' && <XCircle size={12} />}
                  {user.realNameStatus === 'unverified' && '未认证'}
                  {user.realNameStatus !== 'unverified' && 
                    (user.realNameStatus === 'approved' ? '已认证' : 
                     user.realNameStatus === 'pending_review' ? '审核中' : '已拒绝')}
                </span>
              </td>
              <td className="py-3 px-4">
                <div className="flex items-center gap-1">
                  <Wallet size={14} className="text-slate-400" />
                  <span className="font-mono text-sm">¥{user.balance.toFixed(2)}</span>
                </div>
              </td>
              <td className="py-3 px-4 text-xs text-slate-500">{fmtDate(user.lastLoginAt)}</td>
              <td className="py-3 px-4 text-xs text-slate-500">{fmtDate(user.createdAt)}</td>
              <td className="py-3 px-4">
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => onViewDetail(user)}
                    className="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition"
                    title="查看详情"
                  >
                    <Eye size={14} />
                  </button>
                  <button
                    onClick={() => handleImpersonate(user.id)}
                    className="p-1.5 text-green-600 hover:text-green-800 hover:bg-green-50 rounded transition"
                    title="切换身份"
                  >
                    <LogIn size={14} />
                  </button>
                  {user.status === 'active' ? (
                    <button
                      onClick={() => onDisable(user.id)}
                      className="p-1.5 text-red-600 hover:text-red-800 hover:bg-red-50 rounded transition"
                      title="禁用用户"
                    >
                      <Ban size={14} />
                    </button>
                  ) : (
                    <button
                      onClick={() => onEnable(user.id)}
                      className="p-1.5 text-green-600 hover:text-green-800 hover:bg-green-50 rounded transition"
                      title="启用用户"
                    >
                      <CheckCircle2 size={14} />
                    </button>
                  )}
                  <button
                    onClick={() => onResetPassword(user.id)}
                    className="p-1.5 text-purple-600 hover:text-purple-800 hover:bg-purple-50 rounded transition"
                    title="重置密码"
                  >
                    <RefreshCw size={14} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
})

UsersList.displayName = 'UsersList'

export default UsersList