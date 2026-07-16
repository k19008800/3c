/**
 * QuickActions — 快捷操作网格
 *
 * 管理控制台高频功能入口，每个带图标、名称、说明文字。
 */

import { useNavigate } from 'react-router-dom'
import {
  Key, Upload, Plus, Terminal, DollarSign, Activity,
  UserPlus, Shield, FileText, Settings,
} from 'lucide-react'

interface QuickAction {
  id: string
  label: string
  icon: any
  description: string
  href: string
  badge?: number
}

const ACTIONS: QuickAction[] = [
  { id: 'create-key', label: '创建 API Key', icon: Key,
    description: '创建新的访问密钥', href: '/console/admin/api-keys?action=create' },
  { id: 'batch-import', label: '批量导入 Key', icon: Upload,
    description: 'CSV 批量导入上游密钥', href: '/console/admin/vendors?tab=import' },
  { id: 'add-channel', label: '新增通道', icon: Plus,
    description: '创建供应商-模型映射', href: '/console/admin/vendor-models?action=create' },
  { id: 'debug', label: '在线调试', icon: Terminal,
    description: '测试转发接口连通性', href: '/console/admin/playground' },
  { id: 'recharge-review', label: '充值审核', icon: DollarSign,
    description: '待审核充值订单', href: '/console/admin/recharge-orders?status=pending' },
  { id: 'system-health', label: '系统健康', icon: Activity,
    description: '查看各服务状态', href: '/console/admin/system-health' },
  { id: 'create-user', label: '创建用户', icon: UserPlus,
    description: '添加新用户/客户', href: '/console/admin/users?action=create' },
  { id: 'security', label: '安全中心', icon: Shield,
    description: '安全事件与风控', href: '/console/admin/security' },
]

export default function QuickActions({ pendingCount }: { pendingCount?: number }) {
  const navigate = useNavigate()

  return (
    <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-800">🔥 快捷操作</h3>
        <span className="text-xs text-slate-400">高频功能快速入口</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {ACTIONS.map((action) => (
          <button
            key={action.id}
            onClick={() => navigate(action.href)}
            className="flex flex-col items-center gap-1.5 p-3 rounded-xl border border-slate-100 
                       hover:border-blue-200 hover:bg-blue-50/50 transition group relative"
          >
            <div className="p-2 rounded-lg bg-slate-50 group-hover:bg-blue-100 transition">
              <action.icon size={18} className="text-slate-500 group-hover:text-blue-600 transition" />
            </div>
            <span className="text-xs font-medium text-slate-600 group-hover:text-blue-700 transition">
              {action.label}
            </span>
            <span className="text-[10px] text-slate-400 group-hover:text-blue-500 transition text-center leading-tight">
              {action.description}
            </span>
            {action.badge && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] 
                             rounded-full flex items-center justify-center font-medium">
                {action.badge}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
