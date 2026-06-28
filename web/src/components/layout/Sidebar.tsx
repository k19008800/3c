import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Cpu, Key, FileText, Wallet,
  Users, Settings, ClipboardList, ShieldCheck, FileSearch,
  ChevronLeft, ChevronRight, LogOut, Menu, X,
  Building2, GitBranch, Handshake, ScrollText, BarChart3, DollarSign,
  AlertTriangle, Lock,
} from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { useImpersonate } from '@/hooks/use-impersonate'
import { cn } from '@/lib/utils'

const navItems = [
  { to: '/', icon: LayoutDashboard, label: '仪表盘', roles: ['user', 'admin', 'super_admin', 'agent'] },
  { to: '/models', icon: Cpu, label: '模型列表', roles: ['user', 'admin', 'super_admin', 'agent'] },
  { to: '/api-keys', icon: Key, label: 'API 密钥', roles: ['user', 'admin', 'super_admin', 'agent'] },
  { to: '/logs', icon: FileText, label: '调用日志', roles: ['user', 'admin', 'super_admin', 'agent'] },
  { to: '/recharge', icon: Wallet, label: '充值', roles: ['user', 'admin', 'super_admin', 'agent'] },
  { to: '/real-name', icon: ShieldCheck, label: '实名认证', roles: ['user', 'admin', 'super_admin', 'agent'] },
  { to: '/security', icon: Lock, label: '账号安全', roles: ['user', 'admin', 'super_admin', 'agent'] },
]

const adminItems = [
  { to: '/admin', icon: BarChart3, label: '管理仪表盘', roles: ['admin', 'super_admin'] },
  { to: '/admin/users', icon: Users, label: '用户管理', roles: ['admin', 'super_admin'] },
  { to: '/admin/models', icon: Cpu, label: '模型管理', roles: ['admin', 'super_admin'] },
  { to: '/admin/vendors', icon: Building2, label: '供应商管理', roles: ['admin', 'super_admin'] },
  { to: '/admin/vendor-models', icon: GitBranch, label: '模型映射', roles: ['admin', 'super_admin'] },
  { to: '/admin/agents', icon: Handshake, label: '代理商管理', roles: ['admin', 'super_admin'] },
  { to: '/admin/logs', icon: ScrollText, label: '调用日志', roles: ['admin', 'super_admin'] },
  { to: '/admin/recharge-orders', icon: ClipboardList, label: '充值订单', roles: ['admin', 'super_admin'] },
  { to: '/admin/real-name-review', icon: ShieldCheck, label: '实名审核', roles: ['admin', 'super_admin'] },
  { to: '/admin/configs', icon: Settings, label: '系统配置', roles: ['admin', 'super_admin'] },
  { to: '/admin/audit-logs', icon: FileSearch, label: '审计日志', roles: ['admin', 'super_admin'] },
  { to: '/admin/finance/dashboard', icon: BarChart3, label: '财务工作台', roles: ['admin', 'super_admin'] },
  { to: '/admin/finance/commissions', icon: DollarSign, label: '佣金流水', roles: ['admin', 'super_admin'] },
  { to: '/admin/finance/reconciliation', icon: ScrollText, label: '对账报表', roles: ['admin', 'super_admin'] },
  { to: '/admin/withdraws', icon: Wallet, label: '提现管理', roles: ['admin', 'super_admin'] },
  { to: '/admin/security', icon: Settings, label: '安全配置', roles: ['admin', 'super_admin'] },
  { to: '/admin/security/events', icon: AlertTriangle, label: '安全事件', roles: ['admin', 'super_admin'] },
]

const agentItems = [
  { to: '/agent/dashboard', icon: BarChart3, label: '代理商面板', roles: ['agent'] },
  { to: '/agent/clients', icon: Users, label: '我的客户', roles: ['agent'] },
  { to: '/agent/commissions', icon: DollarSign, label: '分佣记录', roles: ['agent'] },
  { to: '/agent/withdraw', icon: Wallet, label: '提现', roles: ['agent'] },
]

export default function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const location = useLocation()
  const { user, logout } = useAuth()
  const { isImpersonating, stopImpersonate } = useImpersonate()
  const [mobileOpen, setMobileOpen] = useState(false)
  const role = user?.role || 'user'

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/'
    if (path === '/admin') return location.pathname === '/admin'
    return location.pathname.startsWith(path)
  }

  const renderLinks = (items: typeof navItems) =>
    items.filter(item => item.roles.includes(role)).map((item) => (
      <Link
        key={item.to} to={item.to}
        className={cn(
          'flex items-center gap-3 px-3 py-2 rounded-md mb-1 transition-colors',
          isActive(item.to) ? 'bg-slate-700 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white',
          collapsed && 'justify-center'
        )}
        title={collapsed ? item.label : undefined}
      >
        <item.icon size={20} />
        {!collapsed && <span className="text-sm">{item.label}</span>}
      </Link>
    ))

  const sidebar = (
    <div className={cn('flex flex-col h-full bg-slate-900 text-white transition-all duration-300', collapsed ? 'w-16' : 'w-60')}>
      <div className={cn('flex items-center h-14 px-4 border-b border-slate-700', collapsed ? 'justify-center' : 'justify-between')}>
        {!collapsed && <span className="font-bold text-lg whitespace-nowrap">3Cloud 控制台</span>}
        <button onClick={onToggle} className="p-1 hover:bg-slate-700 rounded hidden lg:block">
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </div>
      <nav className="flex-1 overflow-y-auto py-2">
        <div className="px-3 py-2">
          {!collapsed && <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">👤 用户功能</p>}
          {renderLinks(navItems)}
        </div>
        {(role === 'admin' || role === 'super_admin') && (
          <div className="px-3 py-2 border-t border-slate-700">
            {!collapsed && <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">⚙️ 管理</p>}
            {renderLinks(adminItems)}
          </div>
        )}
        {role === 'agent' && (
          <div className="px-3 py-2 border-t border-slate-700">
            {!collapsed && <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">🏪 代理商功能</p>}
            {renderLinks(agentItems)}
          </div>
        )}
      </nav>
      <div className={cn('border-t border-slate-700 p-3', collapsed && 'flex flex-col items-center')}>
        {!collapsed && user && <div className="text-xs text-slate-400 mb-2 truncate">{user.email}</div>}
        {isImpersonating ? (
          <button
            onClick={() => { stopImpersonate(); window.location.href = '/admin/users' }}
            className={cn('flex items-center gap-2 text-red-300 hover:text-red-100 transition-colors w-full', collapsed ? 'justify-center' : 'px-3 py-2')}
            title="退出模拟"
          >
            <LogOut size={18} />
            {!collapsed && <span className="text-sm">退出模拟</span>}
          </button>
        ) : (
          <button onClick={logout} className={cn('flex items-center gap-2 text-slate-300 hover:text-red-400 transition-colors w-full', collapsed ? 'justify-center' : 'px-3 py-2')} title="退出登录">
            <LogOut size={18} />
            {!collapsed && <span className="text-sm">退出登录</span>}
          </button>
        )}
      </div>
    </div>
  )

  return (
    <>
      <button className="lg:hidden fixed top-3 left-3 z-50 p-2 bg-slate-900 text-white rounded-md" onClick={() => setMobileOpen(!mobileOpen)}>
        {mobileOpen ? <X size={20} /> : <Menu size={20} />}
      </button>
      <div className="hidden lg:block">{sidebar}</div>
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <div className="relative z-50">{sidebar}</div>
        </div>
      )}
    </>
  )
}
