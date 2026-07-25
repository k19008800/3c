import React, { memo, useMemo } from 'react'
import type { AdminUser } from '@/types'
import { 
  roleLabel, roleColor, 
  statusLabel, statusColor, statusTooltip,
  userTypeLabel, realNameLabel,
  riskLabel, riskColor,
  fmt, fmtDate, fmtCurrency 
} from '../utils'
import { Eye, CheckCircle2, XCircle } from 'lucide-react'
import VirtualTable from '@/components/VirtualTable'
import TrendChart from './TrendChart'

interface VirtualUsersListProps {
  users: AdminUser[]
  selectedIds: Set<number>
  onSelect: (id: number) => void
  onSelectAll: () => void
  onViewDetail: (user: AdminUser) => void
  loading?: boolean
  height?: number
}

const VirtualUsersList: React.FC<VirtualUsersListProps> = memo(({
  users,
  selectedIds,
  onSelect,
  onSelectAll,
  onViewDetail,
  loading = false,
  height = 600,
}) => {
  // 定义表格列 - 完全照抄生产环境14列
  const columns = useMemo(() => [
    // 第1列: 复选框
    {
      key: 'selection',
      label: (
        <input
          type="checkbox"
          checked={selectedIds.size === users.length && users.length > 0}
          onChange={onSelectAll}
          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
        />
      ),
      width: 50,
      align: 'center' as const,
      render: (user: AdminUser) => (
        <input
          type="checkbox"
          checked={selectedIds.has(user.id)}
          onChange={() => onSelect(user.id)}
          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
        />
      ),
    },
    // 第2列: ID
    {
      key: 'id',
      label: 'ID',
      width: 80,
      render: (user: AdminUser) => (
        <div className="font-mono text-sm font-medium">{user.id}</div>
      ),
    },
    // 第3列: 邮箱
    {
      key: 'email',
      label: '邮箱',
      width: 220,
      render: (user: AdminUser) => (
        <div className="font-medium text-sm truncate" title={user.email}>
          {user.email}
        </div>
      ),
    },
    // 第4列: 昵称
    {
      key: 'nickname',
      label: '昵称',
      width: 150,
      render: (user: AdminUser) => (
        <div className="text-sm truncate" title={fmt(user.nickname)}>
          {fmt(user.nickname)}
        </div>
      ),
    },
    // 第5列: 余额趋势
    {
      key: 'balanceTrend',
      label: '余额趋势',
      width: 120,
      align: 'center' as const,
      render: () => (
        <div className="flex justify-center">
          <TrendChart type="balance" />
        </div>
      ),
    },
    // 第6列: 余额
    {
      key: 'balance',
      label: '余额',
      width: 120,
      align: 'right' as const,
      render: (user: AdminUser) => (
        <div className="font-mono text-sm font-medium">
          ¥{Number(user.balance).toFixed(2)}
        </div>
      ),
    },
    // 第7列: 调用趋势
    {
      key: 'callTrend',
      label: '调用趋势',
      width: 120,
      align: 'center' as const,
      render: () => (
        <div className="flex justify-center">
          <TrendChart type="calls" />
        </div>
      ),
    },
    // 第8列: 类型
    {
      key: 'userType',
      label: '类型',
      width: 100,
      render: (user: AdminUser) => (
        <span className="text-sm">
          {userTypeLabel[user.userType] || user.userType}
        </span>
      ),
    },
    // 第9列: 角色
    {
      key: 'role',
      label: '角色',
      width: 120,
      render: (user: AdminUser) => (
        <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${roleColor[user.role]}`}>
          {roleLabel[user.role] || user.role}
        </span>
      ),
    },
    // 第10列: 状态（带hover说明）
    {
      key: 'status',
      label: '状态',
      width: 140,
      render: (user: AdminUser) => (
        <div 
          className="relative group"
          title={statusTooltip[user.status] || user.status}
        >
          <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${statusColor[user.status] || 'bg-slate-100 text-slate-700'}`}>
            {statusLabel[user.status] || user.status}
          </span>
          {/* Hover tooltip */}
          {statusTooltip[user.status] && (
            <div className="absolute z-10 hidden group-hover:block bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-slate-800 text-white text-xs rounded whitespace-nowrap">
              {statusTooltip[user.status]}
              <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-slate-800"></div>
            </div>
          )}
        </div>
      ),
    },
    // 第11列: 风控
    {
      key: 'risk',
      label: '风控',
      width: 100,
      render: (user: AdminUser) => {
        // 简单判断风控状态（模拟）
        const riskStatus = user.isBanned ? 'banned' : 
                          user.balance && Number(user.balance) < 0 ? 'high' : 
                          user.balance && Number(user.balance) < 10 ? 'medium' : 
                          user.balance && Number(user.balance) < 50 ? 'low' : 'none'
        
        return (
          <span className={`text-sm ${riskColor[riskStatus] || 'text-slate-500'}`}>
            {riskLabel[riskStatus] || '-'}
          </span>
        )
      },
    },
    // 第12列: 实名
    {
      key: 'realNameStatus',
      label: '实名',
      width: 100,
      render: (user: AdminUser) => (
        <span className={`inline-flex items-center gap-1 text-xs ${
          user.realNameStatus === 'approved' ? 'text-green-600' :
          user.realNameStatus === 'pending_review' ? 'text-yellow-600' :
          user.realNameStatus === 'rejected' ? 'text-red-600' :
          'text-slate-500'
        }`}>
          {user.realNameStatus === 'approved' && <CheckCircle2 size={12} />}
          {user.realNameStatus === 'rejected' && <XCircle size={12} />}
          {realNameLabel[user.realNameStatus || 'unverified']}
        </span>
      ),
    },
    // 第13列: 注册时间
    {
      key: 'createdAt',
      label: '注册时间',
      width: 150,
      render: (user: AdminUser) => (
        <div className="text-xs text-slate-500">
          {new Date(user.createdAt).toLocaleDateString('zh-CN')}
        </div>
      ),
    },
    // 第14列: 操作（只有详情）
    {
      key: 'actions',
      label: '操作',
      width: 100,
      align: 'center' as const,
      render: (user: AdminUser) => (
        <button
          onClick={() => onViewDetail(user)}
          className="inline-flex items-center gap-1 px-3 py-1 text-sm bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition"
          title="查看用户详情"
        >
          <Eye size={14} />
          详情
        </button>
      ),
    },
  ], [selectedIds, users.length, onSelectAll, onSelect])

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
    <VirtualTable
      columns={columns}
      data={users}
      height={height}
      rowHeight={60}
    />
  )
})

export default VirtualUsersList