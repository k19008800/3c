import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Cpu, BarChart3, Wallet, Key, Bell, Settings,
  ChevronLeft, ChevronRight, LogOut, Menu, X, HelpCircle,
} from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { cn } from '@/lib/utils'

type NavItem = {
  to: string
  icon: React.ComponentType<{ size?: number }>
  label: string
}

const navItems: NavItem[] = [
  { to: '/vendor/dashboard', icon: LayoutDashboard, label: '工作台' },
  { to: '/vendor/models', icon: Cpu, label: '模型管理' },
  { to: '/vendor/stats', icon: BarChart3, label: '数据统计' },
  { to: '/vendor/finance', icon: Wallet, label: '财务中心' },
  { to: '/vendor/keys', icon: Key, label: 'API 管理' },
  { to: '/vendor/notifications', icon: Bell, label: '通知中心' },
  { to: '/vendor/settings', icon: Settings, label: '设置' },
]

export default function VendorSidebar({
  collapsed,
  onToggle,
}: {
  collapsed: boolean
  onToggle: () => void
}) {
  const location = useLocation()
  const { user, logout } = useAuth()
  const [mobileOpen, setMobileOpen] = useState(false)

  const isActive = (path: string) => {
    if (path === '/vendor/dashboard') return location.pathname === '/vendor/dashboard'
    return location.pathname.startsWith(path)
  }

  const renderNavItem = (item: NavItem) => (
    <Link
      key={item.to}
      to={item.to}
      className={cn(
        'flex items-center gap-3 px-3 py-2 rounded-md mb-0.5 transition-colors',
        isActive(item.to)
          ? 'bg-blue-600/20 text-blue-100'
          : 'text-slate-300 hover:bg-slate-800 hover:text-white',
        collapsed && 'justify-center px-0'
      )}
      title={collapsed ? item.label : undefined}
    >
      <item.icon size={20} />
      {!collapsed && <span className="text-sm">{item.label}</span>}
    </Link>
  )

  const sidebar = (
    <div
      className={cn(
        'flex flex-col h-full bg-slate-900 text-white transition-all duration-300',
        collapsed ? 'w-16' : 'w-60'
      )}
    >
      {/* Header */}
      <div
        className={cn(
          'flex items-center h-14 px-4 border-b border-slate-700',
          collapsed ? 'justify-center' : 'justify-between'
        )}
      >
        {!collapsed && (
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-md bg-blue-500 flex items-center justify-center text-xs font-bold text-white">
              3C
            </span>
            <span className="font-bold text-lg whitespace-nowrap text-blue-300">
              供应商门户
            </span>
          </div>
        )}
        <button
          onClick={onToggle}
          className="p-1 hover:bg-slate-700 rounded hidden lg:block text-slate-400"
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
        {navItems.map(renderNavItem)}
      </nav>

      {/* Footer */}
      <div className="border-t border-slate-700 p-3 space-y-2">
        {!collapsed && (
          <div className="text-xs text-slate-500 text-center">
            <a
              href="mailto:support@3cloud.ai"
              className="flex items-center justify-center gap-1 hover:text-slate-300 transition"
            >
              <HelpCircle size={12} />
              技术支持
            </a>
          </div>
        )}
        {!collapsed && user && (
          <div className="text-xs text-slate-400 truncate text-center">
            {user.email}
          </div>
        )}
        <button
          onClick={logout}
          className={cn(
            'flex items-center gap-2 text-slate-300 hover:text-red-400 transition-colors w-full',
            collapsed ? 'justify-center' : 'px-3 py-2'
          )}
          title="退出登录"
        >
          <LogOut size={18} />
          {!collapsed && <span className="text-sm">退出登录</span>}
        </button>
      </div>
    </div>
  )

  return (
    <>
      <button
        className="lg:hidden fixed top-3 left-3 z-50 p-2 bg-slate-900 text-white rounded-md"
        onClick={() => setMobileOpen(!mobileOpen)}
      >
        {mobileOpen ? <X size={20} /> : <Menu size={20} />}
      </button>
      <div className="hidden lg:block">{sidebar}</div>
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative z-50">{sidebar}</div>
        </div>
      )}
    </>
  )
}


