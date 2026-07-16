import { useState, useEffect, useRef, useCallback } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Cpu, Key, FileText, Wallet,
  Users, Settings, ClipboardList, ShieldCheck, FileSearch,
  ChevronLeft, ChevronRight, LogOut, Menu, X, ChevronDown,
  Building2, GitBranch, Handshake, ScrollText, BarChart3, DollarSign,
  AlertTriangle, Lock, Bell, Settings2, Mail, ShieldAlert, PieChart, Megaphone,
  Zap, TrendingUp, Gift, Gauge, Newspaper, Activity, RotateCcw, Heart, Globe,
} from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { useImpersonate } from '@/hooks/use-impersonate'
import { cn } from '@/lib/utils'
import { get, post } from '@/lib/api'
import { useSiteConfig } from '@/hooks/use-site-config'
import { Perm, hasPerm, hasAnyPerm, isAdminRole } from '@/lib/permissions'
import type { NotificationItem } from '@/types'

type NavItem = {
  to: string
  icon: React.ComponentType<{ size?: number }>
  label: string
  /** 显示条件：用户需同时满足所有权限位（AND 语义） */
  requiredPerms?: bigint[]
  /** 显示条件：用户需满足任意一个权限位（OR 语义），仅 agent role 回退使用 */
  anyPerms?: bigint[]
}

// ── 用户端导航（agent 也可见，因为 agent 也是用户）──
const navGroups: { label: string; items: NavItem[] }[] = [
  {
    label: '总览',
    items: [
      { to: '/console', icon: LayoutDashboard, label: '仪表盘' },
    ],
  },
  {
    label: '资源与服务',
    items: [
      { to: '/console/models', icon: Cpu, label: '模型列表' },
      { to: '/console/api-keys', icon: Key, label: 'API 密钥' },
      { to: '/console/docs', icon: FileText, label: 'API 文档' },
    ],
  },
  {
    label: '数据与分析',
    items: [
      { to: '/console/logs', icon: FileText, label: '调用日志' },
      { to: '/console/operation-logs', icon: ScrollText, label: '操作日志' },
      { to: '/console/stats', icon: TrendingUp, label: '用量统计' },
    ],
  },
  {
    label: '财务与消费',
    items: [
      { to: '/console/recharge', icon: Wallet, label: '充值' },
      { to: '/console/redemption', icon: Gift, label: '兑换码' },
      { to: '/console/invoices', icon: FileText, label: '发票管理' },
      { to: '/console/refunds', icon: RotateCcw, label: '退款申请' },
    ],
  },
  {
    label: '账户',
    items: [
      { to: '/console/real-name', icon: ShieldCheck, label: '实名认证' },
      { to: '/console/security', icon: Lock, label: '账号安全' },
      { to: '/console/settings', icon: Settings2, label: '个人设置' },
    ],
  },
  {
    label: '消息',
    items: [
      { to: '/console/announcements', icon: Newspaper, label: '全站公告' },
      { to: '/console/notifications', icon: Bell, label: '通知中心' },
    ],
  },
]

type AdminGroup = { label: string; items: NavItem[] }

const adminGroups: AdminGroup[] = [
  {
    label: '📊 总览看板',
    items: [
      { to: '/console/admin', icon: BarChart3, label: '管理仪表盘', requiredPerms: [Perm.DASHBOARD_VIEW] },
      { to: '/console/admin/enterprise-analysis', icon: PieChart, label: '企业数据分析', requiredPerms: [Perm.DASHBOARD_VIEW] },
      { to: '/console/admin/stats', icon: TrendingUp, label: '聚合统计', requiredPerms: [Perm.DASHBOARD_VIEW] },
      { to: '/console/admin/circuit-breakers', icon: Zap, label: '熔断看板', requiredPerms: [Perm.DASHBOARD_VIEW] },
      { to: '/console/admin/system-health', icon: Heart, label: '系统健康', requiredPerms: [Perm.DASHBOARD_VIEW, Perm.OPS_READ] },
    ],
  },
  {
    label: '👤 用户运营',
    items: [
      { to: '/console/admin/users', icon: Users, label: '用户管理', requiredPerms: [Perm.USER_LIST] },
      { to: '/console/admin/real-name-review', icon: ShieldCheck, label: '实名审核', requiredPerms: [Perm.REVIEW_LIST] },
      { to: '/console/admin/quotas', icon: Gauge, label: '额度管理', requiredPerms: [Perm.USER_LIST, Perm.USER_BALANCE] },
      { to: '/console/admin/admin-api-keys', icon: Key, label: '管理 API Key', requiredPerms: [Perm.USER_LIST] },
      { to: '/console/admin/roles', icon: ShieldCheck, label: '角色权限', requiredPerms: [Perm.USER_CHANGE_ROLE] },
    ],
  },
  {
    label: '🤖 资源管理',
    items: [
      { to: '/console/admin/models', icon: Cpu, label: '模型管理', requiredPerms: [Perm.MODEL_MANAGE] },
      { to: '/console/admin/vendors', icon: Building2, label: '供应商管理', requiredPerms: [Perm.MODEL_MANAGE] },
      { to: '/console/admin/vendor-models', icon: GitBranch, label: '模型映射', requiredPerms: [Perm.MODEL_MANAGE] },
      { to: '/console/admin/vendor-self', icon: Key, label: '供应商自助', requiredPerms: [Perm.MODEL_MANAGE] },
      { to: '/console/admin/agents', icon: Handshake, label: '代理商管理', requiredPerms: [Perm.AGENT_LIST] },
    ],
  },
  {
    label: '💰 财务结算',
    items: [
      { to: '/console/admin/finance/dashboard', icon: BarChart3, label: '财务工作台', requiredPerms: [Perm.FINANCE_VIEW] },
      { to: '/console/admin/finance/commissions', icon: DollarSign, label: '佣金流水', requiredPerms: [Perm.FINANCE_COMMISSION] },
      { to: '/console/admin/finance/reconciliation', icon: ScrollText, label: '对账报表', requiredPerms: [Perm.RECONCILIATION_VIEW] },
      { to: '/console/admin/finance/code-cost', icon: BarChart3, label: '成本看板', requiredPerms: [Perm.FINANCE_VIEW] },
      { to: '/console/admin/finance/agent-cost', icon: TrendingUp, label: 'Agent成本', requiredPerms: [Perm.FINANCE_VIEW] },
      { to: '/console/admin/finance/admin-cost', icon: ShieldCheck, label: 'Admin成本', requiredPerms: [Perm.FINANCE_VIEW] },
      { to: '/console/admin/finance/settlement', icon: DollarSign, label: '结算对账', requiredPerms: [Perm.FINANCE_VIEW] },
      { to: '/console/admin/finance/profit-analysis', icon: PieChart, label: '利润分析', requiredPerms: [Perm.FINANCE_VIEW] },
      { to: '/console/admin/finance/prices', icon: DollarSign, label: '价格管理', requiredPerms: [Perm.FINANCE_VIEW] },
      { to: '/console/admin/finance/invoices', icon: FileText, label: '发票审核', requiredPerms: [Perm.FINANCE_VIEW] },
      { to: '/console/admin/finance/refunds', icon: RotateCcw, label: '退款审核', requiredPerms: [Perm.FINANCE_VIEW] },
      { to: '/console/admin/withdraws', icon: Wallet, label: '提现管理', requiredPerms: [Perm.FINANCE_WITHDRAW] },
      { to: '/console/admin/recharge-orders', icon: ClipboardList, label: '充值订单', requiredPerms: [Perm.FINANCE_RECHARGE] },
      { to: '/console/admin/redemption-codes', icon: Gift, label: '兑换码管理', requiredPerms: [Perm.MODEL_MANAGE] },
    ],
  },
  {
    label: '🛡️ 安全风控',
    items: [
      { to: '/console/admin/security', icon: ShieldAlert, label: '安全总览', requiredPerms: [Perm.SECURITY_VIEW] },
      { to: '/console/admin/security/events', icon: AlertTriangle, label: '安全事件', requiredPerms: [Perm.SECURITY_VIEW] },
      { to: '/console/admin/security/config', icon: Settings, label: '安全配置', requiredPerms: [Perm.SECURITY_ACTION] },
      { to: '/console/admin/security/bans', icon: Lock, label: '封禁管理', requiredPerms: [Perm.SECURITY_ACTION] },
      { to: '/console/admin/security/alerts', icon: Bell, label: '告警通知', requiredPerms: [Perm.SECURITY_VIEW] },
    ],
  },
  {
    label: '⚙️ 运维配置',
    items: [
      { to: '/console/admin/configs', icon: Settings, label: '系统配置', requiredPerms: [Perm.CONFIG_VIEW] },
      { to: '/console/admin/site-settings', icon: Globe, label: '站点设置', requiredPerms: [Perm.CONFIG_VIEW] },
      { to: '/console/admin/rate-limits', icon: Activity, label: '限流管理', requiredPerms: [Perm.OPS_READ] },
      { to: '/console/admin/email-templates', icon: Mail, label: '邮件模板', requiredPerms: [Perm.CONFIG_VIEW] },
      { to: '/console/admin/page-contents', icon: FileText, label: '内容管理', requiredPerms: [Perm.CONFIG_VIEW] },
    ],
  },
  {
    label: '📋 审计合规',
    items: [
      { to: '/console/admin/audit-logs', icon: FileSearch, label: '审计日志', requiredPerms: [Perm.AUDIT_VIEW] },
      { to: '/console/admin/operation-logs', icon: Activity, label: '操作日志', requiredPerms: [Perm.AUDIT_VIEW] },
      { to: '/console/admin/logs', icon: ScrollText, label: '调用日志', requiredPerms: [Perm.LOG_VIEW] },
      { to: '/console/admin/announcements', icon: Megaphone, label: '全站公告', requiredPerms: [Perm.MODEL_MANAGE] },
      { to: '/console/admin/campaigns', icon: Megaphone, label: '营销活动', requiredPerms: [Perm.MODEL_MANAGE] },
    ],
  },
]

// ── 代理商导航 ──
const agentItems: NavItem[] = [
  { to: '/console/agent/dashboard', icon: BarChart3, label: '代理商面板' },
  { to: '/console/agent/clients', icon: Users, label: '我的客户' },
  { to: '/console/agent/commissions', icon: TrendingUp, label: '佣金历史' },
  { to: '/console/agent/withdraw', icon: Wallet, label: '提现' },
  { to: '/console/agent/finance', icon: DollarSign, label: '财务管理' },
  { to: '/console/agent/redemption', icon: Gift, label: '兑换码管理' },
  { to: '/console/agent/reconciliation', icon: BarChart3, label: '财务对账' },
  { to: '/console/agent/notifications', icon: Bell, label: '消息通知' },
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
      const res = await get<{ total: number }>('/api/v1/me/notifications/unread-count')
      setUnreadCount(res.total)
    } catch {
      try {
        const res = await get<{ total: number }>('/api/v1/auth/notifications', { unreadOnly: true, pageSize: 1 })
        setUnreadCount(res.total)
      } catch {
        // ignore
      }
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
    const interval = setInterval(fetchUnreadCount, 60000)
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
              to="/console/notifications"
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
              to="/console/notifications"
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

/**
 * 检查 NavItem 是否对当前用户可见
 */
function isNavItemVisible(item: NavItem, perms: string | undefined, role: string): boolean {
  // agent 角色特殊处理：agentItems 不需要权限位，直接按角色显示
  // 用户端 navGroups 对所有人都可见
  if (!item.requiredPerms && !item.anyPerms) return true

  // 按 requiredPerms 检查（AND 语义）
  if (item.requiredPerms && item.requiredPerms.length > 0) {
    return hasPerm(perms, ...item.requiredPerms)
  }

  // 按 anyPerms 检查（OR 语义）
  if (item.anyPerms && item.anyPerms.length > 0) {
    return hasAnyPerm(perms, ...item.anyPerms)
  }

  return true
}

export default function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const location = useLocation()
  const { user, logout } = useAuth()
  const { config: siteConfig } = useSiteConfig()
  const { isImpersonating, stopImpersonate } = useImpersonate()
  const [mobileOpen, setMobileOpen] = useState(false)
  const role = user?.role || 'user'
  const perms = user?.permissions

  const isActive = (path: string) => {
    if (path === '/console') return location.pathname === '/console'
    if (path === '/console/admin') return location.pathname === '/console/admin'
    return location.pathname.startsWith(path)
  }

  const renderNavItem = (item: NavItem) => (
    <Link
      key={item.to}
      to={item.to}
      className={cn(
        'flex items-center gap-3 px-3 py-1.5 rounded-md mb-0.5 transition-colors',
        isActive(item.to) ? 'bg-slate-700 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white',
        collapsed && 'justify-center'
      )}
      title={collapsed ? item.label : undefined}
    >
      <item.icon size={20} />
      {!collapsed && <span className="text-sm">{item.label}</span>}
    </Link>
  )

  const adminSectionVisible = isAdminRole(perms)
  // Track which admin groups are expanded (default all open)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(adminGroups.map(g => g.label)))

  const toggleGroup = (label: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(label)) next.delete(label)
      else next.add(label)
      return next
    })
  }

  const sidebar = (
    <div className={cn('flex flex-col h-full bg-slate-900 text-white transition-all duration-300', collapsed ? 'w-16' : 'w-60')}>
      <div className={cn('flex items-center h-14 px-4 border-b border-slate-700', collapsed ? 'justify-center' : 'justify-between')}>
        {!collapsed && (
          <div className="flex items-center gap-2 overflow-hidden">
            {siteConfig?.site_logo_url ? (
              <img
                src={siteConfig.site_logo_url}
                alt={siteConfig.site_name || 'Logo'}
                className="max-h-8 max-w-[140px] object-contain"
              />
            ) : (
              <span className="font-bold text-lg whitespace-nowrap">3Cloud 控制台</span>
            )}
          </div>
        )}
        <button onClick={onToggle} className="p-1 hover:bg-slate-700 rounded hidden lg:block">
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </div>
      <nav className="flex-1 overflow-y-auto py-2">
        {/* 用户端导航 — 所有角色均可见 */}
        {navGroups.map((group) => {
          const visibleItems = group.items.filter(item => isNavItemVisible(item, perms, role))
          if (visibleItems.length === 0) return null
          return (
            <div key={group.label} className="px-3 py-1">
              {!collapsed && (
                <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">{group.label}</p>
              )}
              {visibleItems.map(renderNavItem)}
            </div>
          )
        })}

        {/* 管理后台导航 — 基于权限位过滤，管理员可见，分组可折叠 */}
        {adminSectionVisible && (
          <div className="px-3 py-2 border-t border-slate-700">
            {!collapsed && (
              <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">⚙️ 管理</p>
            )}
            {adminGroups.map((group) => {
              const visibleItems = group.items.filter(item => isNavItemVisible(item, perms, role))
              if (visibleItems.length === 0) return null
              const isExpanded = expandedGroups.has(group.label)
              return (
                <div key={group.label} className="mb-0.5">
                  {!collapsed ? (
                    <button
                      onClick={() => toggleGroup(group.label)}
                      className="flex items-center justify-between w-full px-3 py-1 text-xs text-slate-400 hover:text-slate-200 transition-colors"
                    >
                      <span>{group.label}</span>
                      <ChevronDown size={12} className={cn('transition-transform', isExpanded ? 'rotate-0' : '-rotate-90')} />
                    </button>
                  ) : null}
                  {(collapsed || isExpanded) && visibleItems.map(renderNavItem)}
                </div>
              )
            })}
          </div>
        )}

        {/* 代理商导航 — agent 角色专用 */}
        {role === 'agent' && (
          <div className={cn('px-3 py-2', adminSectionVisible ? '' : 'border-t border-slate-700')}>
            {!collapsed && <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">🏪 代理商功能</p>}
            {agentItems.map(renderNavItem)}
          </div>
        )}
      </nav>
      <div className={cn('border-t border-slate-700 p-3 space-y-2', collapsed && 'flex flex-col items-center')}>
        {!collapsed && user && (
          <div className="flex items-center gap-2">
            <NotificationDropdown collapsed={collapsed} />
            <div className="text-xs text-slate-400 truncate flex-1">{user.email}</div>
            <Link
              to="/console/settings"
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
            onClick={() => { stopImpersonate(); window.location.href = '/console/admin/users' }}
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
