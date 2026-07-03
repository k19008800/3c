import { useState, useEffect, useRef, useCallback } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Cpu, Key, FileText, Wallet,
  Users, Settings, ClipboardList, ShieldCheck, FileSearch,
  ChevronLeft, ChevronRight, LogOut, Menu, X,
  Building2, GitBranch, Handshake, ScrollText, BarChart3, DollarSign,
  AlertTriangle, Lock, Bell, Settings2, Mail, ShieldAlert, PieChart,
} from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { useImpersonate } from '@/hooks/use-impersonate'
import { cn } from '@/lib/utils'
import { get, post } from '@/lib/api'
import type { NotificationItem } from '@/types'

const navItems = [
  { to: '/', icon: LayoutDashboard, label: '仪表盘', roles: ['user', 'admin', 'super_admin', 'agent'] },
  { to: '/models', icon: Cpu, label: '模型列表', roles: ['user', 'admin', 'super_admin', 'agent'] },
  { to: '/api-keys', icon: Key, label: 'API 密钥', roles: ['user', 'admin', 'super_admin', 'agent'] },
  { to: '/logs', icon: FileText, label: '调用日志', roles: ['user', 'admin', 'super_admin', 'agent'] },
  { to: '/recharge', icon: Wallet, label: '充值', roles: ['user', 'admin', 'super_admin', 'agent'] },
  { to: '/real-name', icon: ShieldCheck, label: '实名认证', roles: ['user', 'admin', 'super_admin', 'agent'] },
  { to: '/team', icon: Users, label: '团队管理', roles: ['user', 'admin', 'super_admin', 'agent'] },
  { to: '/security', icon: Lock, label: '账号安全', roles: ['user', 'admin', 'super_admin', 'agent'] },
  { to: '/notifications', icon: Bell, label: '通知中心', roles: ['user', 'admin', 'super_admin', 'agent'] },
  { to: '/settings', icon: Settings2, label: '个人设置', roles: ['user', 'admin', 'super_admin', 'agent'] },
  { to: '/docs', icon: FileText, label: 'API 文档', roles: ['user', 'admin', 'super_admin', 'agent'] },
]

const adminItems = [
  { to: '/admin', icon: BarChart3, label: '管理仪表盘', roles: ['admin', 'super_admin'] },
  { to: '/admin/enterprise-analysis', icon: PieChart, label: '企业数据分析', roles: ['admin', 'super_admin'] },
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
  { to: '/admin/email-templates', icon: Mail, label: '邮件模板', roles: ['admin', 'super_admin'] },
  { to: '/admin/security', icon: ShieldAlert, label: '安全总览', roles: ['admin', 'super_admin'] },
  { to: '/admin/security/events', icon: AlertTriangle, label: '安全事件', roles: ['admin', 'super_admin'] },
  { to: '/admin/security/config', icon: Settings, label: '安全配置', roles: ['admin', 'super_admin'] },
  { to: '/admin/security/bans', icon: Lock, label: '封禁管理', roles: ['admin', 'super_admin'] },
  { to: '/admin/security/alerts', icon: Bell, label: '告警通知', roles: ['admin', 'super_admin'] },
]

const agentItems = [
  { to: '/agent/dashboard', icon: BarChart3, label: '代理商面板', roles: ['agent'] },
  { to: '/agent/clients', icon: Users, label: '我的客户', roles: ['agent'] },
  { to: '/agent/commissions', icon: DollarSign, label: '分佣记录', roles: ['agent'] },
  { to: '/agent/withdraw', icon: Wallet, label: '提现', roles: ['agent'] },
]

// ── Notification dropdown ──
function NotificationDropdown({ collapsed }: { collapsed: boolean }) {
  const [open, setOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [loading, setLoading] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await get<{ total: number }>('/api/v1/auth/notifications', { unreadOnly: true, pageSize: 1 })
      setUnreadCount(res.total)
    } catch {
      // ignore
    }
  }, [])

  const fetchRecent = useCallback(async () => {
    setLoading(true)
    try {
      const res = await get<{ list: NotificationItem[] }>('/api/v1/auth/notifications', { page: 1, pageSize: 5 })
      setNotifications(res.list || [])
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchUnreadCount()
    const interval = setInterval(fetchUnreadCount, 60000) // poll every 60s
    return () => clearInterval(interval)
  }, [fetchUnreadCount])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  const handleToggle = () => {
    if (!open) fetchRecent()
    setOpen(!open)
  }

  const handleMarkRead = async (id: number) => {
    try {
      await post('/api/v1/auth/notifications/read', { ids: [id] })
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n))
      )
      setUnreadCount((prev) => Math.max(0, prev - 1))
    } catch {
      // ignore
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={handleToggle}
        className={cn(
          'relative p-2 rounded-lg transition-colors',
          open ? 'bg-slate-700 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
        )}
        title="通知"
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center w-4 h-4 text-[10px] font-bold text-white bg-red-500 rounded-full">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className={cn(
            'absolute bottom-full left-0 mb-2 w-80 bg-white rounded-xl shadow-xl border border-slate-200 z-50 overflow-hidden',
            collapsed && 'left-0',
            !collapsed && 'left-12'
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <span className="text-sm font-semibold text-slate-800">通知</span>
            <Link
              to="/notifications"
              onClick={() => setOpen(false)}
              className="text-xs text-blue-600 hover:text-blue-800"
            >
              查看全部
            </Link>
          </div>

          {/* List */}
          <div className="max-h-[320px] overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-sm">暂无通知</div>
            ) : (
              notifications.map((n) => {
                const isUnread = !n.readAt
                return (
                  <div
                    key={n.id}
                    className={`px-4 py-3 border-b border-slate-50 last:border-0 ${
                      isUnread ? 'bg-blue-50/40' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p
                          className={`text-sm truncate ${
                            isUnread ? 'font-semibold text-slate-900' : 'text-slate-700'
                          }`}
                        >
                          {n.title}
                        </p>
                        <p className="text-xs text-slate-400 mt-0.5 truncate">{n.content}</p>
                        <p className="text-[10px] text-slate-400 mt-1">
                          {new Date(n.createdAt).toLocaleString('zh-CN')}
                        </p>
                      </div>
                      {isUnread && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleMarkRead(n.id)
                          }}
                          className="shrink-0 text-[10px] text-blue-500 hover:text-blue-700 whitespace-nowrap mt-0.5"
                        >
                          标为已读
                        </button>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50">
            <Link
              to="/notifications"
              onClick={() => setOpen(false)}
              className="block text-center text-xs text-blue-600 hover:text-blue-800 font-medium"
            >
              查看全部通知 →
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}

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
      <div className={cn('border-t border-slate-700 p-3 space-y-2', collapsed && 'flex flex-col items-center')}>
        {!collapsed && user && (
          <div className="flex items-center gap-2">
            <NotificationDropdown collapsed={collapsed} />
            <div className="text-xs text-slate-400 truncate flex-1">{user.email}</div>
            <Link
              to="/settings"
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition"
              title="个人设置"
            >
              <Settings2 size={16} />
            </Link>
          </div>
        )}
        {collapsed && user && (
          <NotificationDropdown collapsed={collapsed} />
        )}
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
