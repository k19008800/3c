import { useEffect, useState, useCallback, Fragment } from 'react'
import { useNavigate } from 'react-router-dom'
import { get, post, patch, del } from '@/lib/api'
import { useImpersonate } from '@/hooks/use-impersonate'
import type {
  AdminUser, PaginatedData, LoginHistoryRecord, UserNote,
  UserIpWhitelistEntry, UserCallStats, AdminApiKey, OAuthBinding,
  RoleHistoryRecord, AuditLogRecord, BalanceLogRecord, ImpersonateResult,
  UserRealNameHistoryRecord
} from '@/types'
import {
  Loader2, AlertCircle, ChevronLeft, ChevronRight, ChevronDown,
  Search, UserPlus, Download, FileJson, LogIn,
  CheckCircle2, XCircle, Plus, Trash2, RefreshCw,
  Ban, User, Key, History, Shield, FileText,
  Wallet, Activity, Globe, MessageSquare, BarChart3,
  Lock,
} from 'lucide-react'

// ──────────────────────────────────────────────
//  Helpers
// ──────────────────────────────────────────────

const roleLabel: Record<string, string> = {
  super_admin: '超级管理员', admin: '管理员', user: '用户', agent: '代理商',
}
const roleColor: Record<string, string> = {
  super_admin: 'bg-purple-100 text-purple-700',
  admin: 'bg-blue-100 text-blue-700',
  user: 'bg-slate-100 text-slate-700',
  agent: 'bg-emerald-100 text-emerald-700',
}
const statusLabel: Record<string, string> = { active: '正常', disabled: '禁用', pending: '待验证', deleted: '已注销' }
const statusColor: Record<string, string> = { active: 'bg-green-100 text-green-700', disabled: 'bg-red-100 text-red-700', pending: 'bg-yellow-100 text-yellow-700', deleted: 'bg-slate-200 text-slate-500' }
const statusHelp: Record<string, string> = {
  active: '账户正常，已通过邮箱验证，可正常使用 API',
  pending: '邮箱未验证 — 用户注册后未点击验证邮件中的链接，无法使用 API 调度',
  disabled: '已被管理员禁用，可登录查看余额但无法请求 API',
  deleted: '用户已注销（软删除），不可登录不可重新注册',
}
const realNameLabel: Record<string, string> = { approved: '已认证', pending_review: '审核中', rejected: '已拒绝', unverified: '未认证' }

function fmt(v: string | null | undefined): string { return v ?? '-' }
function fmtDate(v: string | null | undefined): string {
  if (!v) return '-'
  try { return new Date(v).toLocaleString('zh-CN') } catch { return v }
}
function cmp(a: string, b: string): number { return a === b ? 0 : a < b ? -1 : 1 }

// ──────────────────────────────────────────────
//  Main Page
// ──────────────────────────────────────────────

export default function AdminUsers() {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())

  const totalPages = Math.ceil(total / pageSize)

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params: any = { page, pageSize }
      if (keyword) params.keyword = keyword
      if (statusFilter) params.status = statusFilter
      if (roleFilter) params.role = roleFilter
      const data = await get<PaginatedData<AdminUser>>('/api/v1/admin/users', params)
      setUsers(data.list)
      setTotal(data.total)
    } catch (err: any) {
      setError(err.message || '获取用户列表失败')
    } finally { setLoading(false) }
  }, [page, pageSize, keyword, statusFilter, roleFilter])

  useEffect(() => { fetchUsers() }, [fetchUsers])

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }
  const toggleAll = () => {
    if (selectedIds.size === users.length) setSelectedIds(new Set())
    else setSelectedIds(new Set(users.map(u => u.id)))
  }

  const handleBatchAction = async (action: 'disable' | 'enable') => {
    if (selectedIds.size === 0) return
    const ids = Array.from(selectedIds)
    try {
      if (action === 'disable') await post('/api/v1/admin/users/batch/disable', { userIds: ids })
      else await post('/api/v1/admin/users/batch/enable', { userIds: ids })
      setSelectedIds(new Set())
      fetchUsers()
    } catch (err: any) {
      setError(err.message || '批量操作失败')
    }
  }

  const handleExportCSV = async () => {
    try {
      const params: any = {}
      if (keyword) params.keyword = keyword
      if (statusFilter) params.status = statusFilter
      if (roleFilter) params.role = roleFilter
      const res = await fetch(`/api/v1/admin/users/export?${new URLSearchParams(params)}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}` }
      })
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = `users_export_${Date.now()}.csv`; a.click()
      URL.revokeObjectURL(url)
    } catch (err: any) {
      setError('导出失败: ' + (err.message || ''))
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">用户管理</h1>
        <div className="flex items-center gap-2">
          <button onClick={handleExportCSV} className="flex items-center gap-1.5 px-3 py-2 text-sm border border-slate-300 rounded-lg hover:bg-slate-50 transition">
            <Download size={15} /> 导出CSV
          </button>
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-1.5 px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">
            <UserPlus size={15} /> 创建用户
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs text-slate-500 mb-1">搜索</label>
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input type="text" value={keyword} onChange={e => { setKeyword(e.target.value); setPage(1) }} placeholder="搜索邮箱或昵称" className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">状态</label>
            <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1) }} className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">全部</option>
              <option value="active">正常</option>
              <option value="disabled">禁用</option>
              <option value="pending">待验证</option>
              <option value="deleted">已注销</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">角色</label>
            <select value={roleFilter} onChange={e => { setRoleFilter(e.target.value); setPage(1) }} className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">全部</option>
              <option value="user">用户</option>
              <option value="admin">管理员</option>
              <option value="super_admin">超级管理员</option>
            </select>
          </div>
        </div>
      </div>

      {/* Batch action bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-blue-50 border border-blue-200 rounded-lg text-sm">
          <span className="text-blue-700 font-medium">已选 {selectedIds.size} 项</span>
          <button onClick={() => handleBatchAction('disable')} className="flex items-center gap-1 px-3 py-1 text-red-600 bg-red-50 rounded-md hover:bg-red-100 transition"><Ban size={14} /> 批量禁用</button>
          <button onClick={() => handleBatchAction('enable')} className="flex items-center gap-1 px-3 py-1 text-green-600 bg-green-50 rounded-md hover:bg-green-100 transition"><CheckCircle2 size={14} /> 批量启用</button>
          <button onClick={() => setSelectedIds(new Set())} className="text-slate-500 hover:text-slate-700 ml-auto">取消选择</button>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 text-left">
                <th className="px-4 py-3 w-10">
                  <input type="checkbox" checked={users.length > 0 && selectedIds.size === users.length} onChange={toggleAll} className="rounded" />
                </th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">ID</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">邮箱</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">昵称</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">余额</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">类型</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">角色</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">状态</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">风控</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">实名</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">注册时间</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr><td colSpan={12} className="text-center py-12"><Loader2 className="animate-spin inline-block" size={24} /></td></tr>
              ) : users.length === 0 ? (
                <tr><td colSpan={12} className="text-center py-12 text-slate-400">暂无用户数据</td></tr>
              ) : (
                users.map(u => (
                  <tr key={u.id} className="hover:bg-slate-50 transition">
                    <td className="px-4 py-3"><input type="checkbox" checked={selectedIds.has(u.id)} onChange={() => toggleSelect(u.id)} className="rounded" /></td>
                    <td className="px-4 py-3 text-sm text-slate-600">{u.id}</td>
                    <td className="px-4 py-3 text-sm text-slate-900">{u.email}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{fmt(u.nickname)}</td>
                    <td className="px-4 py-3 text-sm font-medium">¥{Number(u.balance || 0).toFixed(4)}</td>
                    <td className="px-4 py-3"><span className="text-xs text-slate-500">{u.userType === 'enterprise' ? '企业' : '个人'}</span></td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${roleColor[u.role] || 'bg-slate-100 text-slate-700'}`}>{roleLabel[u.role] || u.role}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${statusColor[u.status] || ''}`} title={statusHelp[u.status] || ''}>{statusLabel[u.status] || u.status}</span>
                    </td>
                    <td className="px-4 py-3">
                      {u.isBanned ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                          <Lock size={10} /> 封禁中
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">{realNameLabel[u.realNameStatus || 'unverified']}</td>
                    <td className="px-4 py-3 text-sm text-slate-500 whitespace-nowrap">{new Date(u.createdAt).toLocaleDateString('zh-CN')}</td>
                    <td className="px-4 py-3 flex gap-1">
                      <button onClick={() => setSelectedUser(u)} className="text-sm text-blue-600 hover:text-blue-800">详情</button>
                      {u.isBanned && (
                        <button onClick={async () => { try { await post('/api/v1/admin/security/unban/user', { userId: u.id }); fetchUsers() } catch(e: any) { alert('解封失败: ' + (e.message || '')) } }} className="text-sm text-green-600 hover:text-green-800 ml-2">解封</button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {total > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 bg-slate-50">
            <span className="text-sm text-slate-500">第 {page} / {totalPages} 页，共 {total} 条</span>
            <div className="flex items-center gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="p-1 rounded hover:bg-slate-200 disabled:opacity-30 transition"><ChevronLeft size={18} /></button>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="p-1 rounded hover:bg-slate-200 disabled:opacity-30 transition"><ChevronRight size={18} /></button>
            </div>
          </div>
        )}
      </div>

      {selectedUser && <UserDetailModal user={selectedUser} onClose={() => { setSelectedUser(null); fetchUsers() }} />}
      {showCreate && <CreateUserModal onClose={() => { setShowCreate(false); fetchUsers() }} />}
    </div>
  )
}

// ──────────────────────────────────────────────
//  Create User Modal
// ──────────────────────────────────────────────

function CreateUserModal({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState({ email: '', password: '', nickname: '', phone: '', userType: 'personal' as const, role: 'user' as const, balance: '0', discountRate: '1' })
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')

  const handleSubmit = async () => {
    if (!form.email || !form.password) { setMsg('邮箱和密码为必填'); return }
    if (form.password.length < 6) { setMsg('密码至少6位'); return }
    setLoading(true); setMsg('')
    try {
      await post('/api/v1/admin/users', form)
      setMsg('✅ 用户创建成功')
      setTimeout(onClose, 1200)
    } catch (err: any) { setMsg('❌ ' + (err.message || '')) }
    finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-xl w-full max-w-md shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold flex items-center gap-2"><UserPlus size={20} /> 创建用户</h2>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl">&times;</button>
          </div>
          {msg && <div className="p-3 text-sm rounded-lg bg-blue-50 text-blue-700">{msg}</div>}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs text-slate-500 mb-1">邮箱 *</label>
              <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs text-slate-500 mb-1">密码 *</label>
              <input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div><label className="block text-xs text-slate-500 mb-1">昵称</label><input type="text" value={form.nickname} onChange={e => setForm(f => ({ ...f, nickname: e.target.value }))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" /></div>
            <div><label className="block text-xs text-slate-500 mb-1">手机</label><input type="text" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" /></div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">类型</label>
              <select value={form.userType} onChange={e => setForm(f => ({ ...f, userType: e.target.value as any }))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm">
                <option value="personal">个人</option><option value="enterprise">企业</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">角色</label>
              <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value as any }))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm">
                <option value="user">用户</option><option value="admin">管理员</option><option value="agent">代理商</option>
              </select>
            </div>
            <div><label className="block text-xs text-slate-500 mb-1">初始余额</label><input type="number" step="0.01" value={form.balance} onChange={e => setForm(f => ({ ...f, balance: e.target.value }))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" /></div>
            <div><label className="block text-xs text-slate-500 mb-1">折扣率</label><input type="number" step="0.01" min="0" max="1" value={form.discountRate} onChange={e => setForm(f => ({ ...f, discountRate: e.target.value }))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" /></div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800">取消</button>
            <button onClick={handleSubmit} disabled={loading} className="flex items-center gap-1.5 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {loading && <Loader2 size={14} className="animate-spin" />} 创建
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────
//  User Detail Modal (Tabbed)
// ──────────────────────────────────────────────

const TABS = [
  { key: 'info', label: '基本信息', icon: User },
  { key: 'real-name', label: '实名历史', icon: Shield },
  { key: 'login-history', label: '登录历史', icon: History },
  { key: 'call-stats', label: '调用统计', icon: Activity },
  { key: 'notes', label: '内部备注', icon: MessageSquare },
  { key: 'ip-whitelist', label: 'IP白名单', icon: Shield },
  { key: 'api-keys', label: 'API密钥', icon: Key },
  { key: 'oauth', label: 'OAuth绑定', icon: Globe },
  { key: 'audit-logs', label: '审计日志', icon: FileText },
  { key: 'balance-logs', label: '余额流水', icon: Wallet },
  { key: 'role-history', label: '角色历史', icon: RefreshCw },
]

function UserDetailModal({ user, onClose }: { user: AdminUser; onClose: () => void }) {
  const [tab, setTab] = useState('info')
  const [msg, setMsg] = useState('')
  const [showChangeRole, setShowChangeRole] = useState(false)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-xl" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold">用户详情 #{user.id}</h2>
            <span className="text-sm text-slate-500">{user.email}</span>
            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${statusColor[user.status] || ''}`} title={statusHelp[user.status] || ''}>{statusLabel[user.status] || user.status}</span>
            {user.isBanned && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                <Lock size={10} /> 风控封禁中
              </span>
            )}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl">&times;</button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200 overflow-x-auto shrink-0 px-2">
          {TABS.map(t => {
            const Icon = t.icon
            return (
              <button key={t.key} onClick={() => setTab(t.key)} className={`flex items-center gap-1.5 px-3.5 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition ${tab === t.key ? 'text-blue-600 border-blue-600' : 'text-slate-500 border-transparent hover:text-slate-700'}`}>
                <Icon size={15} /> {t.label}
              </button>
            )
          })}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {msg && <div className="mb-4 p-3 text-sm rounded-lg bg-blue-50 text-blue-700 flex items-center gap-2"><CheckCircle2 size={16} /> {msg}</div>}

          {tab === 'info' && <InfoTab user={user} onMsg={setMsg} />}
          {tab === 'real-name' && <RealNameHistoryTab userId={user.id} />}
          {tab === 'login-history' && <LoginHistoryTab userId={user.id} />}
          {tab === 'call-stats' && <CallStatsTab userId={user.id} />}
          {tab === 'notes' && <NotesTab userId={user.id} onMsg={setMsg} />}
          {tab === 'ip-whitelist' && <IpWhitelistTab userId={user.id} onMsg={setMsg} />}
          {tab === 'api-keys' && <ApiKeysTab userId={user.id} onMsg={setMsg} />}
          {tab === 'oauth' && <OAuthTab userId={user.id} onMsg={setMsg} />}
          {tab === 'audit-logs' && <AuditLogsTab userId={user.id} />}
          {tab === 'balance-logs' && <BalanceLogsTab userId={user.id} />}
          {tab === 'role-history' && <RoleHistoryTab userId={user.id} />}
        </div>

        {/* Actions bar */}
        <div className="flex items-center gap-2 px-6 py-3 border-t border-slate-200 bg-slate-50 shrink-0">
          <ExportDataButton userId={user.id} onMsg={setMsg} />
          <button onClick={() => setShowChangeRole(true)} className="flex items-center gap-1 px-3 py-1 text-sm border border-amber-300 text-amber-700 bg-amber-50 rounded-lg hover:bg-amber-100 transition"><RefreshCw size={14} /> 变更角色</button>
          <ImpersonateButton userId={user.id} email={user.email} onMsg={setMsg} />
          {user.isBanned && (
            <button onClick={async () => {
              try {
                await post('/api/v1/admin/security/unban/user', { userId: user.id })
                setMsg('✅ 用户已解封')
                setTimeout(() => window.location.reload(), 1500)
              } catch(e: any) { setMsg('❌ 解封失败: ' + (e.message || '')) }
            }} className="flex items-center gap-1 px-3 py-1 text-sm text-green-600 bg-green-50 rounded-md hover:bg-green-100 transition"><Lock size={14} /> 解封此用户</button>
          )}
          <span className="text-xs text-slate-400 ml-auto">
            {user.lastLoginAt ? `最后登录: ${fmtDate(user.lastLoginAt)}` : '从未登录'}
          </span>
        </div>
      </div>
      {showChangeRole && (
        <ChangeRoleDialog userId={user.id} currentRole={user.role} currentLabel={roleLabel[user.role] || user.role} onClose={() => setShowChangeRole(false)} onMsg={setMsg} />
      )}
    </div>
  )
}

// ──────────────────────────────────────────────
//  Tab: Info
// ──────────────────────────────────────────────

function InfoTab({ user, onMsg }: { user: AdminUser; onMsg: (s: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({
    nickname: user.nickname || '', phone: user.phone || '', avatarUrl: user.avatarUrl || '',
    status: user.status, userType: user.userType,
    discountRate: user.discountRate?.toString() || '', rpmOverride: user.rpmOverride?.toString() || '', tpmOverride: user.tpmOverride?.toString() || '',
    disabledReason: user.disabledReason || '', disabledUntil: user.disabledUntil || '',
  })
  const [rechargeAmt, setRechargeAmt] = useState('')
  const [rechargeDesc, setRechargeDesc] = useState('')
  const [newPwd, setNewPwd] = useState('')

  const handleUpdate = async () => {
    try {
      const body: any = {}
      if (form.nickname !== (user.nickname || '')) body.nickname = form.nickname
      if (form.phone !== (user.phone || '')) body.phone = form.phone
      if (form.avatarUrl !== (user.avatarUrl || '')) body.avatarUrl = form.avatarUrl
      if (form.status !== user.status) body.status = form.status
      if (form.userType !== user.userType) body.userType = form.userType
      if (form.discountRate) body.discountRate = parseFloat(form.discountRate)
      if (form.rpmOverride) body.rpmOverride = parseInt(form.rpmOverride)
      if (form.tpmOverride) body.tpmOverride = parseInt(form.tpmOverride)
      if (form.disabledReason !== (user.disabledReason || '')) body.disabledReason = form.disabledReason
      if (form.disabledUntil !== (user.disabledUntil || '')) body.disabledUntil = form.disabledUntil
      await patch(`/api/v1/admin/users/${user.id}`, body)
      onMsg('用户信息已更新')
      setEditing(false)
    } catch (err: any) { onMsg('❌ ' + (err.message || '')) }
  }

  const handleRecharge = async () => {
    const amt = parseFloat(rechargeAmt)
    if (!amt) return
    try {
      await post(`/api/v1/admin/users/${user.id}/recharge`, { amount: amt, description: rechargeDesc || undefined })
      onMsg(`✅ 已充值 ¥${amt.toFixed(4)}`)
      setRechargeAmt(''); setRechargeDesc('')
    } catch (err: any) { onMsg('❌ ' + (err.message || '')) }
  }

  const handleResetPwd = async () => {
    if (!newPwd || newPwd.length < 6) { onMsg('密码至少6位'); return }
    try {
      await post(`/api/v1/admin/users/${user.id}/reset-pwd`, { newPassword: newPwd })
      onMsg('✅ 密码已重置')
      setNewPwd('')
    } catch (err: any) { onMsg('❌ ' + (err.message || '')) }
  }

  return (
    <div className="space-y-6">
      {/* Basic Info Grid */}
      <div className="grid grid-cols-3 gap-4 text-sm">
        <div><span className="text-slate-500">ID：</span>{user.id}</div>
        <div><span className="text-slate-500">邮箱：</span>{user.email}</div>
        <div><span className="text-slate-500">昵称：</span>{fmt(user.nickname)}</div>
        <div><span className="text-slate-500">手机：</span>{fmt(user.phone)}</div>
        <div><span className="text-slate-500">类型：</span>{user.userType === 'enterprise' ? '企业' : '个人'}</div>
        <div><span className="text-slate-500">角色：</span>{roleLabel[user.role] || user.role}</div>
        <div><span className="text-slate-500">余额：</span>¥{Number(user.balance || 0).toFixed(6)}</div>
        <div><span className="text-slate-500">折扣率：</span>{user.discountRate ? `${(Number(user.discountRate) * 100).toFixed(2)}%` : '无'}</div>
        <div><span className="text-slate-500">实名：</span>{realNameLabel[user.realNameStatus || 'unverified']}{user.realName ? ` (${user.realName})` : ''}</div>
        <div><span className="text-slate-500">企业：</span>{fmt(user.companyName)}</div>
        <div><span className="text-slate-500">邮箱验证：</span>{user.emailVerifiedAt ? fmtDate(user.emailVerifiedAt) : <span className="text-amber-600 cursor-help" title="如确认用户身份可点击下方「手动验证邮箱」按钮跳过邮件验证">未验证 ⚠️</span>}</div>
        <div><span className="text-slate-500">最后登录：</span>{fmtDate(user.lastLoginAt)}</div>
        {user.stats && (
          <>
            <div><span className="text-slate-500">API Key数：</span>{user.stats.apiKeyCount}</div>
            <div><span className="text-slate-500">充值总额：</span>¥{Number(user.stats.totalRecharge || 0).toFixed(4)}</div>
            <div><span className="text-slate-500">充值单数：</span>{user.stats.orderCount}</div>
          </>
        )}
      </div>

      {/* Edit form */}
      {editing && (
        <div className="border-t pt-4 space-y-3">
          <h3 className="text-sm font-medium text-slate-700">编辑用户信息</h3>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="block text-xs text-slate-500 mb-1">昵称</label><input type="text" value={form.nickname} onChange={e => setForm(f => ({ ...f, nickname: e.target.value }))} className="w-full px-3 py-1.5 border border-slate-300 rounded text-sm" /></div>
            <div><label className="block text-xs text-slate-500 mb-1">手机</label><input type="text" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className="w-full px-3 py-1.5 border border-slate-300 rounded text-sm" /></div>
            <div><label className="block text-xs text-slate-500 mb-1">头像URL</label><input type="text" value={form.avatarUrl} onChange={e => setForm(f => ({ ...f, avatarUrl: e.target.value }))} className="w-full px-3 py-1.5 border border-slate-300 rounded text-sm" /></div>
            <div><label className="block text-xs text-slate-500 mb-1">角色</label><div className="flex items-center gap-2"><span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${roleColor[user.role] || 'bg-slate-100 text-slate-700'}`}>{roleLabel[user.role] || user.role}</span><span className="text-xs text-amber-600">如需变更请用底部「变更角色」</span></div></div>
            <div><label className="block text-xs text-slate-500 mb-1">状态</label><select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} className="w-full px-3 py-1.5 border border-slate-300 rounded text-sm"><option value="active">正常</option><option value="disabled">禁用</option><option value="pending">待验证</option></select></div>
            <div><label className="block text-xs text-slate-500 mb-1">类型</label><select value={form.userType} onChange={e => setForm(f => ({ ...f, userType: e.target.value }))} className="w-full px-3 py-1.5 border border-slate-300 rounded text-sm"><option value="personal">个人</option><option value="enterprise">企业</option></select></div>
            <div><label className="block text-xs text-slate-500 mb-1">折扣率 (0-1)</label><input type="number" step="0.01" min="0" max="1" value={form.discountRate} onChange={e => setForm(f => ({ ...f, discountRate: e.target.value }))} className="w-full px-3 py-1.5 border border-slate-300 rounded text-sm" /></div>
            <div><label className="block text-xs text-slate-500 mb-1">RPM上限</label><input type="number" value={form.rpmOverride} onChange={e => setForm(f => ({ ...f, rpmOverride: e.target.value }))} className="w-full px-3 py-1.5 border border-slate-300 rounded text-sm" /></div>
            <div><label className="block text-xs text-slate-500 mb-1">TPM上限</label><input type="number" value={form.tpmOverride} onChange={e => setForm(f => ({ ...f, tpmOverride: e.target.value }))} className="w-full px-3 py-1.5 border border-slate-300 rounded text-sm" /></div>
            <div><label className="block text-xs text-slate-500 mb-1">禁用原因</label><input type="text" value={form.disabledReason} onChange={e => setForm(f => ({ ...f, disabledReason: e.target.value }))} className="w-full px-3 py-1.5 border border-slate-300 rounded text-sm" /></div>
            <div><label className="block text-xs text-slate-500 mb-1">禁用至</label><input type="datetime-local" value={form.disabledUntil ? form.disabledUntil.substring(0, 16) : ''} onChange={e => setForm(f => ({ ...f, disabledUntil: e.target.value ? new Date(e.target.value).toISOString() : '' }))} className="w-full px-3 py-1.5 border border-slate-300 rounded text-sm" /></div>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setEditing(false)} className="px-3 py-1.5 text-sm text-slate-600">取消</button>
            <button onClick={handleUpdate} className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">保存</button>
          </div>
        </div>
      )}
      {!editing && (
        <div className="flex gap-2">
          <button onClick={() => setEditing(true)} className="text-sm text-blue-600 hover:text-blue-800">编辑用户信息</button>
        </div>
      )}

      {/* Manual Recharge */}
      <div className="border-t pt-4 space-y-3">
        <h3 className="text-sm font-medium text-slate-700">手动充值</h3>
        <div className="flex gap-2">
          <input type="number" step="0.01" min="0.01" value={rechargeAmt} onChange={e => setRechargeAmt(e.target.value)} placeholder="充值金额" className="flex-1 px-3 py-1.5 border border-slate-300 rounded text-sm" />
          <input type="text" value={rechargeDesc} onChange={e => setRechargeDesc(e.target.value)} placeholder="备注（可选）" className="flex-1 px-3 py-1.5 border border-slate-300 rounded text-sm" />
          <button onClick={handleRecharge} disabled={!rechargeAmt} className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">充值</button>
        </div>
      </div>

      {/* Reset Password */}
      <div className="border-t pt-4 space-y-3">
        <h3 className="text-sm font-medium text-slate-700">重置密码</h3>
        <div className="flex gap-2">
          <input type="password" value={newPwd} onChange={e => setNewPwd(e.target.value)} placeholder="新密码（至少6位）" className="flex-1 px-3 py-1.5 border border-slate-300 rounded text-sm" />
          <button onClick={handleResetPwd} disabled={!newPwd} className="px-3 py-1.5 text-sm bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50">重置</button>
        </div>
      </div>

      {/* Email Verification */}
      <EmailVerificationSection user={user} onMsg={onMsg} />

      {/* Manual Real-name Verification */}
      <RealNameAdminSection user={user} onMsg={onMsg} />
    </div>
  )
}

// ──────────────────────────────────────────────
//  Email Verification Section (in InfoTab)
// ──────────────────────────────────────────────

function EmailVerificationSection({ user, onMsg }: { user: AdminUser; onMsg: (s: string) => void }) {
  const [submitting, setSubmitting] = useState(false)

  if (user.emailVerifiedAt) {
    return (
      <div className="border-t pt-4 space-y-3">
        <h3 className="text-sm font-medium text-slate-700">邮箱验证</h3>
        <div className="flex items-center gap-2">
          <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
            ✅ 已验证
          </span>
          <span className="text-sm text-slate-500">验证时间: {fmtDate(user.emailVerifiedAt)}</span>
        </div>
        <button
          onClick={async () => {
            setSubmitting(true)
            try {
              await patch(`/api/v1/admin/users/${user.id}`, { status: 'pending' })
              onMsg('✅ 邮箱验证已撤销，用户状态变更为待验证')
              setTimeout(() => window.location.reload(), 1200)
            } catch (e: any) { onMsg('❌ ' + (e.message || '')) }
            finally { setSubmitting(false) }
          }}
          disabled={submitting}
          className="px-3 py-1.5 text-sm border border-red-300 text-red-600 rounded-lg hover:bg-red-50 transition disabled:opacity-50"
        >
          {submitting ? '处理中...' : '撤销验证（变更为待验证）'}
        </button>
      </div>
    )
  }

  return (
    <div className="border-t pt-4 space-y-3">
      <h3 className="text-sm font-medium text-slate-700">邮箱验证</h3>
      <div className="flex items-center gap-2 mb-2">
        <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
          ⚠️ 未验证
        </span>
        <span className="text-xs text-amber-600">
          用户注册后未点击验证邮件中的链接，当前账户状态为「待验证」
        </span>
      </div>
      <button
        onClick={async () => {
          setSubmitting(true)
          try {
            await patch(`/api/v1/admin/users/${user.id}`, { status: 'active' })
            onMsg('✅ 邮箱已手动验证，用户状态变更为正常')
            setTimeout(() => window.location.reload(), 1200)
          } catch (e: any) { onMsg('❌ ' + (e.message || '')) }
          finally { setSubmitting(false) }
        }}
        disabled={submitting}
        className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:opacity-50"
      >
        {submitting ? '处理中...' : '✅ 手动验证邮箱（变更为正常）'}
      </button>
    </div>
  )
}

// ──────────────────────────────────────────────
//  Real Name Admin Section (in InfoTab)
// ──────────────────────────────────────────────

function RealNameAdminSection({ user, onMsg }: { user: AdminUser; onMsg: (s: string) => void }) {
  const [action, setAction] = useState<'approve' | 'reject' | null>(null)
  const [realName, setRealName] = useState(user.realName || '')
  const [idNumber, setIdNumber] = useState(user.idNumber || '')
  const [companyName, setCompanyName] = useState(user.companyName || '')
  const [rejectReason, setRejectReason] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const isApproved = user.realNameStatus === 'approved'
  const isRejected = user.realNameStatus === 'rejected'
  const isPending = user.realNameStatus === 'pending_review'
  const isUnverified = user.realNameStatus === 'unverified'

  const statusStyle: Record<string, string> = {
    approved: 'bg-green-100 text-green-700',
    pending_review: 'bg-yellow-100 text-yellow-700',
    rejected: 'bg-red-100 text-red-700',
    unverified: 'bg-slate-100 text-slate-500',
  }

  const handleSubmit = async () => {
    if (action === 'approve') {
      if (!realName.trim()) { onMsg('请填写真实姓名'); return }
    }
    if (action === 'reject' && !rejectReason.trim()) { onMsg('请填写拒绝原因'); return }

    setSubmitting(true)
    try {
      const body: Record<string, any> = { action }
      if (action === 'approve') {
        body.realName = realName.trim()
        if (idNumber.trim()) body.idNumber = idNumber.trim()
        if (companyName.trim()) body.companyName = companyName.trim()
      } else {
        body.rejectReason = rejectReason.trim()
      }
      await post(`/api/v1/admin/users/${user.id}/manual-real-name`, body)
      onMsg(action === 'approve' ? '✅ 实名已手动通过' : '✅ 实名已拒绝')
      window.location.reload()
    } catch (err: any) {
      onMsg('❌ ' + (err.message || ''))
    } finally {
      setSubmitting(false)
      setAction(null)
    }
  }

  if (isApproved) {
    return (
      <div className="border-t pt-4 space-y-3">
        <h3 className="text-sm font-medium text-slate-700">实名管理</h3>
        <div className="flex items-center gap-2">
          <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${statusStyle.approved}`}>
            ✅ 已认证
          </span>
          {user.realName && <span className="text-sm text-slate-600">姓名: {user.realName}</span>}
          {user.companyName && <span className="text-sm text-slate-600">企业: {user.companyName}</span>}
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setAction('reject'); setRejectReason('') }} className="px-3 py-1.5 text-sm border border-red-300 text-red-600 rounded-lg hover:bg-red-50 transition">撤销认证</button>
        </div>
        {action === 'reject' && (
          <div className="space-y-2 border border-red-200 bg-red-50 rounded-lg p-3">
            <label className="block text-xs text-red-600 font-medium">撤销原因</label>
            <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} rows={2} className="w-full px-3 py-1.5 border border-red-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-red-500" placeholder="为什么撤销?" />
            <div className="flex gap-2">
              <button onClick={() => setAction(null)} className="px-3 py-1.5 text-sm text-slate-600">取消</button>
              <button onClick={handleSubmit} disabled={submitting || !rejectReason.trim()} className="px-3 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50">
                {submitting ? '提交中...' : '确认撤销'}
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  if (isUnverified || isRejected || isPending) {
    return (
      <div className="border-t pt-4 space-y-3">
        <h3 className="text-sm font-medium text-slate-700">实名管理</h3>
        <div className="flex items-center gap-2 mb-2">
          <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${statusStyle[user.realNameStatus] || statusStyle.unverified}`}>
            {realNameLabel[user.realNameStatus || 'unverified']}
          </span>
          {user.rejectReason && isRejected && (
            <span className="text-xs text-red-500">拒绝原因: {user.rejectReason}</span>
          )}
        </div>

        {!action && (
          <div className="flex gap-2">
            <button onClick={() => setAction('approve')} className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition">
              ✅ 手动通过实名
            </button>
            {isPending && (
              <button onClick={() => setAction('reject')} className="px-3 py-1.5 text-sm border border-red-300 text-red-600 rounded-lg hover:bg-red-50 transition">
                ❌ 拒绝
              </button>
            )}
          </div>
        )}

        {action === 'approve' && (
          <div className="space-y-3 border border-green-200 bg-green-50 rounded-lg p-4">
            <p className="text-xs text-green-700">手动确认实名认证，通过后该用户即可使用 API 调度</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-green-700 mb-1">真实姓名 *</label>
                <input type="text" value={realName} onChange={e => setRealName(e.target.value)} placeholder="输入姓名" className="w-full px-3 py-1.5 border border-green-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>
              <div>
                <label className="block text-xs text-green-700 mb-1">身份证号</label>
                <input type="text" value={idNumber} onChange={e => setIdNumber(e.target.value)} placeholder="可选" className="w-full px-3 py-1.5 border border-green-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-green-700 mb-1">企业名称</label>
                <input type="text" value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="企业认证可选" className="w-full px-3 py-1.5 border border-green-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setAction(null)} className="px-3 py-1.5 text-sm text-slate-600">取消</button>
              <button onClick={handleSubmit} disabled={submitting || !realName.trim()} className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">
                {submitting ? '提交中...' : '确认通过'}
              </button>
            </div>
          </div>
        )}

        {action === 'reject' && (
          <div className="space-y-2 border border-red-200 bg-red-50 rounded-lg p-3">
            <label className="block text-xs text-red-600 font-medium">拒绝原因</label>
            <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} rows={2} className="w-full px-3 py-1.5 border border-red-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-red-500" placeholder="为什么拒绝?" />
            <div className="flex gap-2">
              <button onClick={() => setAction(null)} className="px-3 py-1.5 text-sm text-slate-600">取消</button>
              <button onClick={handleSubmit} disabled={submitting || !rejectReason.trim()} className="px-3 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50">
                {submitting ? '提交中...' : '确认拒绝'}
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  return null
}

// ──────────────────────────────────────────────
//  Tab: Login History
// ──────────────────────────────────────────────

function LoginHistoryTab({ userId }: { userId: number }) {
  const [data, setData] = useState<LoginHistoryRecord[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      try { setData((await get<PaginatedData<LoginHistoryRecord>>(`/api/v1/admin/users/${userId}/login-history`)).list) }
      catch { }
      finally { setLoading(false) }
    })()
  }, [userId])

  if (loading) return <div className="text-center py-8"><Loader2 className="animate-spin inline-block" size={24} /></div>
  if (data.length === 0) return <p className="text-slate-400 text-sm text-center py-8">暂无登录记录</p>
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="bg-slate-50 text-left"><th className="px-3 py-2 text-slate-500">时间</th><th className="px-3 py-2 text-slate-500">IP</th><th className="px-3 py-2 text-slate-500">User-Agent</th><th className="px-3 py-2 text-slate-500">状态</th><th className="px-3 py-2 text-slate-500">失败原因</th></tr></thead>
        <tbody className="divide-y divide-slate-100">
          {data.map(r => (
            <tr key={r.id} className="hover:bg-slate-50">
              <td className="px-3 py-2 whitespace-nowrap">{fmtDate(r.createdAt)}</td>
              <td className="px-3 py-2 font-mono text-xs">{r.ip}</td>
              <td className="px-3 py-2 max-w-[200px] truncate text-xs text-slate-500" title={r.userAgent || ''}>{r.userAgent || '-'}</td>
              <td className="px-3 py-2">{r.success ? <span className="text-green-600">成功</span> : <span className="text-red-600">失败</span>}</td>
              <td className="px-3 py-2 text-slate-500">{r.failReason || '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ──────────────────────────────────────────────
//  Tab: Call Stats
// ──────────────────────────────────────────────

function CallStatsTab({ userId }: { userId: number }) {
  const [data, setData] = useState<UserCallStats | null>(null)
  const [trends, setTrends] = useState<UserCallTrends | null>(null)
  const [logs, setLogs] = useState<AdminCallLogItem[]>([])
  const [logTotal, setLogTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [days, setDays] = useState(7)
  const [granularity, setGranularity] = useState<'day' | 'hour'>('day')
  const [logPage, setLogPage] = useState(1)
  const logPageSize = 10

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const end = new Date(); const start = new Date(); start.setDate(start.getDate() - days)
    const startStr = start.toISOString().substring(0, 10)
    const endStr = end.toISOString().substring(0, 10)
    try {
      const [s, t, l] = await Promise.all([
        get<UserCallStats>(`/api/v1/admin/users/${userId}/call-stats`, { startDate: startStr, endDate: endStr }),
        get<UserCallTrends>(`/api/v1/admin/users/${userId}/call-trends`, { days, granularity }),
        get<PaginatedData<AdminCallLogItem>>(`/api/v1/admin/users/${userId}/call-logs`, { page: logPage, pageSize: logPageSize, startDate: startStr, endDate: endStr }),
      ])
      setData(s); setTrends(t); setLogs(l.list); setLogTotal(l.total)
    } catch { }
    finally { setLoading(false) }
  }, [userId, days, granularity, logPage])

  useEffect(() => { fetchAll() }, [fetchAll])

  if (loading && !data) return <div className="text-center py-8"><Loader2 className="animate-spin inline-block" size={24} /></div>
  if (!data) return <p className="text-slate-400 text-sm text-center py-8">暂无数据</p>
  const s = data.summary
  const trendData = (trends?.series ?? []).map(p => ({ label: p.date, value: p.calls.total }))
  const tokenTrendData = (trends?.series ?? []).map(p => ({ label: p.date, value: p.tokens.total }))
  const costTrendData = (trends?.series ?? []).map(p => ({ label: p.date, value: parseFloat(p.cost) }))

  const logTotalPages = Math.ceil(logTotal / logPageSize)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">时间范围：</span>
          <select value={days} onChange={e => { setDays(Number(e.target.value)); setLogPage(1) }} className="px-2 py-1 border border-slate-300 rounded text-sm">
            <option value={1}>最近1天</option><option value={7}>最近7天</option>
            <option value={30}>最近30天</option><option value={90}>最近90天</option>
          </select>
        </div>
        <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5 text-xs">
          <button onClick={() => { setGranularity('day'); setLogPage(1) }} className={`px-2 py-1 rounded-md transition ${granularity === 'day' ? 'bg-white shadow-sm font-medium' : 'text-slate-500'}`}>按天</button>
          <button onClick={() => { setGranularity('hour'); setLogPage(1) }} className={`px-2 py-1 rounded-md transition ${granularity === 'hour' ? 'bg-white shadow-sm font-medium' : 'text-slate-500'}`}>按小时</button>
        </div>
      </div>

      <div className="grid grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard label="总调用" value={s.totalCalls.toLocaleString()} />
        <StatCard label="成功" value={s.successCalls.toLocaleString()} color="text-green-600" />
        <StatCard label="失败" value={s.failedCalls.toLocaleString()} color="text-red-600" />
        <StatCard label="平均耗时" value={`${s.avgDuration}ms`} />
        <StatCard label="总Token" value={s.totalTokens.toLocaleString()} />
        <StatCard label="总费用" value={'¥' + Number(s.totalCost).toFixed(4)} />
      </div>

      {trendData.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
            <h4 className="text-xs text-slate-500 mb-1">调用量趋势</h4>
            <MiniBarChart data={trendData} barColor="fill-violet-400" height={100} />
          </div>
          <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
            <h4 className="text-xs text-slate-500 mb-1">Token趋势</h4>
            <MiniBarChart data={tokenTrendData} barColor="fill-blue-400" height={100} formatValue={v => v >= 10000 ? (v/10000).toFixed(1)+'w' : v.toLocaleString()} />
          </div>
          <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
            <h4 className="text-xs text-slate-500 mb-1">费用趋势</h4>
            <MiniBarChart data={costTrendData} barColor="fill-emerald-400" height={100} formatValue={v => '¥' + v.toFixed(2)} />
          </div>
        </div>
      )}

      <div>
        <h4 className="text-sm font-medium text-slate-700 mb-2">调用明细 {logTotal > 0 && <span className="text-xs text-slate-400 font-normal">（共 {logTotal} 条）</span>}</h4>
        {logs.length === 0 ? (
          <p className="text-slate-400 text-sm text-center py-4">暂无调用记录</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 text-left text-slate-500">
                  <th className="px-2 py-1.5">时间</th>
                  <th className="px-2 py-1.5">模型</th>
                  <th className="px-2 py-1.5">厂商</th>
                  <th className="px-2 py-1.5 text-right">输入Token</th>
                  <th className="px-2 py-1.5 text-right">输出Token</th>
                  <th className="px-2 py-1.5 text-right">总Token</th>
                  <th className="px-2 py-1.5 text-right">费用</th>
                  <th className="px-2 py-1.5 text-right">耗时</th>
                  <th className="px-2 py-1.5 text-center">状态</th>
                  <th className="px-2 py-1.5">IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.map(r => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="px-2 py-1.5 whitespace-nowrap text-slate-500">{fmtDate(r.createdAt)}</td>
                    <td className="px-2 py-1.5 font-medium">{r.modelName || '-'}</td>
                    <td className="px-2 py-1.5 text-slate-500">{r.vendorName || '-'}</td>
                    <td className="px-2 py-1.5 text-right">{r.promptTokens.toLocaleString()}</td>
                    <td className="px-2 py-1.5 text-right">{r.completionTokens.toLocaleString()}</td>
                    <td className="px-2 py-1.5 text-right font-medium">{r.totalTokens.toLocaleString()}</td>
                    <td className="px-2 py-1.5 text-right">{'¥' + Number(r.cost).toFixed(4)}</td>
                    <td className="px-2 py-1.5 text-right text-slate-500">{r.durationMs != null ? r.durationMs + 'ms' : '-'}</td>
                    <td className="px-2 py-1.5 text-center">
                      {r.status === 'success' ? <span className="text-green-600">Ok</span>
                        : r.status === 'failed' ? <span className="text-red-600" title={r.errorMessage || ''}>No</span>
                        : r.status === 'timeout' ? <span className="text-yellow-600">T</span>
                        : <span className="text-slate-400">-</span>}
                    </td>
                    <td className="px-2 py-1.5 font-mono text-[10px] text-slate-400">{r.ip || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {logTotalPages > 1 && (
          <div className="flex items-center justify-between mt-2">
            <span className="text-xs text-slate-400">第 {logPage}/{logTotalPages} 页</span>
            <div className="flex gap-1">
              <button disabled={logPage <= 1} onClick={() => setLogPage(p => p - 1)} className="px-2 py-1 text-xs border border-slate-300 rounded hover:bg-slate-100 disabled:opacity-30">上一页</button>
              <button disabled={logPage >= logTotalPages} onClick={() => setLogPage(p => p + 1)} className="px-2 py-1 text-xs border border-slate-300 rounded hover:bg-slate-100 disabled:opacity-30">下一页</button>
            </div>
          </div>
        )}
      </div>

      {data.byModel.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-slate-700 mb-2">按模型统计</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-slate-50 text-left"><th className="px-3 py-2 text-slate-500">模型</th><th className="px-3 py-2 text-slate-500">调用次数</th><th className="px-3 py-2 text-slate-500">Tokens</th><th className="px-3 py-2 text-slate-500">费用</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {data.byModel.map(m => (
                  <tr key={m.modelName} className="hover:bg-slate-50">
                    <td className="px-3 py-2">{m.modelName}</td>
                    <td className="px-3 py-2">{m.calls.toLocaleString()}</td>
                    <td className="px-3 py-2">{m.tokens.toLocaleString()}</td>
                    <td className="px-3 py-2">{'¥' + Number(m.cost).toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="bg-slate-50 rounded-lg p-3">
      <div className="text-xs text-slate-400 mb-1">{label}</div>
      <div className={`text-lg font-bold ${color || 'text-slate-800'}`}>{value}</div>
    </div>
  )
}

// ──────────────────────────────────────────────
//  Tab: Notes
// ──────────────────────────────────────────────

function NotesTab({ userId, onMsg }: { userId: number; onMsg: (s: string) => void }) {
  const [data, setData] = useState<UserNote[]>([])
  const [loading, setLoading] = useState(true)
  const [content, setContent] = useState('')

  const fetch = useCallback(async () => {
    try { setData((await get<{ list: UserNote[] }>(`/api/v1/admin/users/${userId}/notes`)).list) }
    catch { }
    finally { setLoading(false) }
  }, [userId])

  useEffect(() => { fetch() }, [fetch])

  const add = async () => {
    if (!content.trim()) return
    try {
      await post(`/api/v1/admin/users/${userId}/notes`, { content })
      setContent(''); fetch(); onMsg('✅ 备注已添加')
    } catch (err: any) { onMsg('❌ ' + (err.message || '')) }
  }

  const remove = async (noteId: number) => {
    try {
      await del(`/api/v1/admin/users/${userId}/notes/${noteId}`)
      fetch(); onMsg('✅ 备注已删除')
    } catch (err: any) { onMsg('❌ ' + (err.message || '')) }
  }

  if (loading) return <div className="text-center py-8"><Loader2 className="animate-spin inline-block" size={24} /></div>
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <textarea value={content} onChange={e => setContent(e.target.value)} placeholder="添加内部备注..." rows={2} className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <button onClick={add} disabled={!content.trim()} className="self-end px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1"><Plus size={14} /> 添加</button>
      </div>
      {data.length === 0 ? <p className="text-slate-400 text-sm text-center py-4">暂无备注</p> : (
        <div className="space-y-2">
          {data.map(n => (
            <div key={n.id} className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg">
              <div className="flex-1 min-w-0">
                <p className="text-sm whitespace-pre-wrap">{n.content}</p>
                <p className="text-xs text-slate-400 mt-1">
                  {fmtDate(n.createdAt)} {n.updatedAt !== n.createdAt ? `(编辑于 ${fmtDate(n.updatedAt)})` : ''} — 管理员 #{n.createdBy}
                </p>
              </div>
              <button onClick={() => remove(n.id)} className="text-red-400 hover:text-red-600 shrink-0"><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ──────────────────────────────────────────────
//  Tab: IP Whitelist
// ──────────────────────────────────────────────

function IpWhitelistTab({ userId, onMsg }: { userId: number; onMsg: (s: string) => void }) {
  const [data, setData] = useState<UserIpWhitelistEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [ip, setIp] = useState('')
  const [desc, setDesc] = useState('')

  const fetch = useCallback(async () => {
    try { setData((await get<{ list: UserIpWhitelistEntry[] }>(`/api/v1/admin/users/${userId}/ip-whitelist`)).list) }
    catch { }
    finally { setLoading(false) }
  }, [userId])

  useEffect(() => { fetch() }, [fetch])

  const add = async () => {
    if (!ip.trim()) return
    try {
      await post(`/api/v1/admin/users/${userId}/ip-whitelist`, { ip: ip.trim(), description: desc.trim() || undefined })
      setIp(''); setDesc(''); fetch(); onMsg('✅ IP 已加入白名单')
    } catch (err: any) { onMsg('❌ ' + (err.message || '')) }
  }

  const remove = async (id: number) => {
    try {
      await del(`/api/v1/admin/users/${userId}/ip-whitelist/${id}`)
      fetch(); onMsg('✅ IP 已移除')
    } catch (err: any) { onMsg('❌ ' + (err.message || '')) }
  }

  if (loading) return <div className="text-center py-8"><Loader2 className="animate-spin inline-block" size={24} /></div>
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input type="text" value={ip} onChange={e => setIp(e.target.value)} placeholder="IP 地址" className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <input type="text" value={desc} onChange={e => setDesc(e.target.value)} placeholder="备注（可选）" className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm" />
        <button onClick={add} disabled={!ip.trim()} className="px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1"><Plus size={14} /> 添加</button>
      </div>
      {data.length === 0 ? <p className="text-slate-400 text-sm text-center py-4">未设置 IP 白名单</p> : (
        <div className="space-y-1">
          {data.map(e => (
            <div key={e.id} className="flex items-center gap-3 p-2.5 bg-slate-50 rounded-lg text-sm">
              <span className="font-mono text-xs bg-slate-200 px-2 py-0.5 rounded">{e.ip}</span>
              <span className="text-slate-500 flex-1">{e.description || '-'}</span>
              <span className="text-xs text-slate-400">{fmtDate(e.createdAt)}</span>
              <button onClick={() => remove(e.id)} className="text-red-400 hover:text-red-600"><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ──────────────────────────────────────────────
//  Tab: API Keys
// ──────────────────────────────────────────────

function ApiKeysTab({ userId, onMsg }: { userId: number; onMsg: (s: string) => void }) {
  const [data, setData] = useState<AdminApiKey[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedKey, setExpandedKey] = useState<number | null>(null)

  const fetch = useCallback(async () => {
    try { setData((await get<{ list: AdminApiKey[] }>(`/api/v1/admin/users/${userId}/api-keys`)).list) }
    catch { }
    finally { setLoading(false) }
  }, [userId])

  useEffect(() => { fetch() }, [fetch])

  const toggleKey = async (keyId: number, currentStatus: boolean) => {
    try {
      await patch(`/api/v1/admin/users/${userId}/api-keys/${keyId}`, { status: !currentStatus })
      fetch(); onMsg(currentStatus ? '✅ 已禁用' : '✅ 已启用')
    } catch (err: any) { onMsg('❌ ' + (err.message || '')) }
  }

  const deleteKey = async (keyId: number) => {
    if (!confirm('确定删除此 API Key？')) return
    try {
      await del(`/api/v1/admin/users/${userId}/api-keys/${keyId}`)
      fetch(); onMsg('✅ 已删除')
    } catch (err: any) { onMsg('❌ ' + (err.message || '')) }
  }

  if (loading) return <div className="text-center py-8"><Loader2 className="animate-spin inline-block" size={24} /></div>
  if (data.length === 0) return <p className="text-slate-400 text-sm text-center py-8">该用户没有 API Key</p>
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="bg-slate-50 text-left"><th className="px-3 py-2 text-slate-500"></th><th className="px-3 py-2 text-slate-500">名称</th><th className="px-3 py-2 text-slate-500">前缀</th><th className="px-3 py-2 text-slate-500">状态</th><th className="px-3 py-2 text-slate-500">过期时间</th><th className="px-3 py-2 text-slate-500">最后使用</th><th className="px-3 py-2 text-slate-500">创建时间</th><th className="px-3 py-2 text-slate-500">操作</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {data.map(k => (
              <Fragment key={k.id}>
                <tr
                  className="hover:bg-slate-50 cursor-pointer transition"
                  onClick={() => setExpandedKey(expandedKey === k.id ? null : k.id)}
                >
                  <td className="px-3 py-2">
                    <ChevronDown
                      size={14}
                      className={`transition-transform duration-200 text-slate-400 ${expandedKey === k.id ? 'rotate-0' : '-rotate-90'}`}
                    />
                  </td>
                  <td className="px-3 py-2 font-medium">{k.name}</td>
                  <td className="px-3 py-2 font-mono text-xs">{k.keyPrefix}...</td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${k.status ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{k.status ? '启用' : '禁用'}</span>
                  </td>
                  <td className="px-3 py-2 text-xs">{fmtDate(k.expiresAt)}</td>
                  <td className="px-3 py-2 text-xs">{fmtDate(k.lastUsedAt)}</td>
                  <td className="px-3 py-2 text-xs">{fmtDate(k.createdAt)}</td>
                  <td className="px-3 py-2 flex gap-1">
                    <button onClick={e => { e.stopPropagation(); toggleKey(k.id, k.status) }} className="text-xs text-blue-600 hover:text-blue-800">{k.status ? '禁用' : '启用'}</button>
                    <button onClick={e => { e.stopPropagation(); deleteKey(k.id) }} className="text-xs text-red-600 hover:text-red-800">删除</button>
                  </td>
                </tr>
                {expandedKey === k.id && (
                  <tr>
                    <td colSpan={8} className="px-4 py-2 bg-slate-50">
                      <ApiKeyStatsPanel userId={userId} keyId={k.id} keyName={k.name} />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────
//  MiniBarChart (pure SVG, zero deps)
// ──────────────────────────────────────────────

function MiniBarChart({
  data, height = 100, barColor = 'fill-blue-500', formatValue,
}: {
  data: { label: string; value: number }[]
  height?: number
  barColor?: string
  formatValue?: (v: number) => string
}) {
  if (data.length === 0) return <div className={`h-${height}px flex items-center justify-center text-xs text-slate-400`}>无数据</div>

  const max = Math.max(...data.map(d => d.value), 1)
  const w = 100
  const bw = Math.max(3, Math.min(16, 80 / data.length))
  const gap = (w - bw * data.length) / (data.length + 1)
  const barArea = height - 18

  return (
    <svg viewBox={`0 0 ${w} ${height}`} className="w-full" preserveAspectRatio="none">
      {data.map((d, i) => {
        const bh = Math.max(1, (d.value / max) * barArea)
        const x = gap + i * (bw + gap)
        const y = height - bh - 2
        return (
          <g key={d.label} className="group">
            <rect x={x} y={y} width={bw} height={bh} rx={1.5} className={`${barColor} transition-all duration-300 hover:opacity-80`} />
            <rect x={x - gap / 2} y={0} width={bw + gap} height={height} fill="transparent" />
            <title>{d.label + ': ' + (formatValue ? formatValue(d.value) : d.value.toLocaleString())}</title>
          </g>
        )
      })}
      {data.filter((_, i) => data.length <= 10 || i % Math.ceil(data.length / 6) === 0 || i === data.length - 1).map(d => {
        const idx = data.indexOf(d)
        const x = gap + idx * (bw + gap) + bw / 2
        return <text key={d.label} x={x} y={height - 1} textAnchor="middle" className="fill-slate-400" fontSize="7">{d.label.slice(5)}</text>
      })}
    </svg>
  )
}

// ──────────────────────────────────────────────
//  ApiKeyStatsPanel (expanded per-key stats)
// ──────────────────────────────────────────────

function ApiKeyStatsPanel({ userId, keyId, keyName }: { userId: number; keyId: number; keyName: string }) {
  const [stats, setStats] = useState<ApiKeyCallStats | null>(null)
  const [trends, setTrends] = useState<ApiKeyCallTrends | null>(null)
  const [logs, setLogs] = useState<AdminCallLogItem[]>([])
  const [logTotal, setLogTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [days, setDays] = useState(7)
  const [logPage, setLogPage] = useState(1)
  const logPageSize = 10

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const end = new Date(); const start = new Date(); start.setDate(start.getDate() - days)
    const startStr = start.toISOString().substring(0, 10)
    const endStr = end.toISOString().substring(0, 10)
    try {
      const [s, t, l] = await Promise.all([
        get<ApiKeyCallStats>(`/api/v1/admin/users/${userId}/api-keys/${keyId}/call-stats`, { startDate: startStr, endDate: endStr }),
        get<ApiKeyCallTrends>(`/api/v1/admin/users/${userId}/api-keys/${keyId}/call-trends`, { days }),
        get<PaginatedData<AdminCallLogItem>>(`/api/v1/admin/users/${userId}/api-keys/${keyId}/call-logs`, { page: logPage, pageSize: logPageSize, startDate: startStr, endDate: endStr }),
      ])
      setStats(s); setTrends(t); setLogs(l.list); setLogTotal(l.total)
    } catch { }
    finally { setLoading(false) }
  }, [userId, keyId, days, logPage])

  useEffect(() => { fetchAll() }, [fetchAll])

  if (loading) return <Loader2 className="animate-spin inline-block" size={16} />

  const s = stats?.summary
  const trendData = (trends?.series ?? []).map(p => ({ label: p.date, value: p.calls }))
  const logTotalPages = Math.ceil(logTotal / logPageSize)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h5 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
          <BarChart3 size={14} /> {keyName}
        </h5>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-400">{days}天</span>
          <select value={days} onChange={e => { setDays(Number(e.target.value)); setLogPage(1) }} className="px-1.5 py-0.5 border border-slate-300 rounded text-[10px]">
            <option value={1}>1天</option><option value={7}>7天</option><option value={30}>30天</option>
          </select>
        </div>
      </div>

      {s && (
        <div className="flex flex-wrap gap-2">
          <MiniStat label="调用" value={s.totalCalls.toLocaleString()} />
          <MiniStat label="Token" value={s.totalTokens.toLocaleString()} />
          <MiniStat label="费用" value={'¥' + Number(s.totalCost).toFixed(4)} />
          <MiniStat label="成功率" value={s.totalCalls > 0 ? (s.successCalls / s.totalCalls * 100).toFixed(1) + '%' : '-'} />
          <MiniStat label="平均耗时" value={s.avgDuration + 'ms'} />
          <MiniStat label="最后使用" value={s.lastUsedAt ? fmtDate(s.lastUsedAt) : '-'} />
        </div>
      )}

      {trendData.length > 1 && (
        <div className="bg-white rounded border border-slate-200 p-2">
          <MiniBarChart data={trendData} barColor="fill-blue-400" height={60} />
        </div>
      )}

      <div>
        <h6 className="text-[10px] text-slate-500 mb-1 font-medium">最近调用 {logTotal > 0 && <span>({logTotal} 条)</span>}</h6>
        {logs.length === 0 ? (
          <p className="text-[10px] text-slate-400">无调用记录</p>
        ) : (
          <table className="w-full text-[10px]">
            <thead>
              <tr className="text-left text-slate-400">
                <th className="pr-2 py-1">时间</th><th className="pr-2 py-1">模型</th>
                <th className="pr-2 py-1 text-right">Token</th><th className="pr-2 py-1 text-right">费用</th>
                <th className="pr-2 py-1 text-right">耗时</th><th className="py-1 text-center">状态</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {logs.map(r => (
                <tr key={r.id}>
                  <td className="pr-2 py-1 whitespace-nowrap text-slate-400">{fmtDate(r.createdAt)}</td>
                  <td className="pr-2 py-1">{r.modelName || '-'}</td>
                  <td className="pr-2 py-1 text-right">{r.totalTokens.toLocaleString()}</td>
                  <td className="pr-2 py-1 text-right">{'¥' + Number(r.cost).toFixed(4)}</td>
                  <td className="pr-2 py-1 text-right text-slate-400">{r.durationMs != null ? r.durationMs + 'ms' : '-'}</td>
                  <td className="py-1 text-center">
                    {r.status === 'success' ? <span className="text-green-500">Ok</span>
                      : r.status === 'failed' ? <span className="text-red-500" title={r.errorMessage || ''}>No</span>
                      : <span className="text-slate-300">-</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {logTotalPages > 1 && (
          <div className="flex items-center justify-between mt-1">
            <span className="text-[10px] text-slate-400">{logPage}/{logTotalPages}</span>
            <div className="flex gap-1">
              <button disabled={logPage <= 1} onClick={() => setLogPage(p => p - 1)} className="px-1.5 py-0.5 text-[10px] border border-slate-300 rounded hover:bg-slate-100 disabled:opacity-30">上一页</button>
              <button disabled={logPage >= logTotalPages} onClick={() => setLogPage(p => p + 1)} className="px-1.5 py-0.5 text-[10px] border border-slate-300 rounded hover:bg-slate-100 disabled:opacity-30">下一页</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded border border-slate-200 px-2.5 py-1 min-w-[70px]">
      <div className="text-[10px] text-slate-400">{label}</div>
      <div className="text-xs font-bold text-slate-700">{value}</div>
    </div>
  )
}

// ──────────────────────────────────────────────
//  Tab: OAuth
// ──────────────────────────────────────────────

function OAuthTab({ userId, onMsg }: { userId: number; onMsg: (s: string) => void }) {
  const [data, setData] = useState<OAuthBinding[]>([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    try { setData((await get<{ list: OAuthBinding[] }>(`/api/v1/admin/users/${userId}/oauth-bindings`)).list) }
    catch { }
    finally { setLoading(false) }
  }, [userId])

  useEffect(() => { fetch() }, [fetch])

  const unbind = async (provider: string) => {
    if (!confirm(`确定解绑 ${provider}？`)) return
    try {
      await post(`/api/v1/admin/users/${userId}/unbind-oauth`, { provider })
      fetch(); onMsg(`✅ ${provider} 已解绑`)
    } catch (err: any) { onMsg('❌ ' + (err.message || '')) }
  }

  if (loading) return <div className="text-center py-8"><Loader2 className="animate-spin inline-block" size={24} /></div>
  if (data.length === 0) return <p className="text-slate-400 text-sm text-center py-8">未绑定第三方账号</p>
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="bg-slate-50 text-left"><th className="px-3 py-2 text-slate-500">平台</th><th className="px-3 py-2 text-slate-500">用户ID</th><th className="px-3 py-2 text-slate-500">邮箱</th><th className="px-3 py-2 text-slate-500">昵称</th><th className="px-3 py-2 text-slate-500">绑定时间</th><th className="px-3 py-2 text-slate-500">操作</th></tr></thead>
        <tbody className="divide-y divide-slate-100">
          {data.map(b => (
            <tr key={b.id} className="hover:bg-slate-50">
              <td className="px-3 py-2"><span className="capitalize font-medium">{b.provider}</span></td>
              <td className="px-3 py-2 text-xs font-mono">{b.providerUserId}</td>
              <td className="px-3 py-2 text-xs">{b.providerEmail || '-'}</td>
              <td className="px-3 py-2">{b.nickname || '-'}</td>
              <td className="px-3 py-2 text-xs">{fmtDate(b.createdAt)}</td>
              <td className="px-3 py-2"><button onClick={() => unbind(b.provider)} className="text-xs text-red-600 hover:text-red-800">解绑</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ──────────────────────────────────────────────
//  Tab: Audit Logs
// ──────────────────────────────────────────────

function AuditLogsTab({ userId }: { userId: number }) {
  const [data, setData] = useState<AuditLogRecord[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      try { setData((await get<PaginatedData<AuditLogRecord>>(`/api/v1/admin/users/${userId}/audit-logs`)).list) }
      catch { }
      finally { setLoading(false) }
    })()
  }, [userId])

  if (loading) return <div className="text-center py-8"><Loader2 className="animate-spin inline-block" size={24} /></div>
  if (data.length === 0) return <p className="text-slate-400 text-sm text-center py-8">暂无审计日志</p>
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="bg-slate-50 text-left"><th className="px-3 py-2 text-slate-500">时间</th><th className="px-3 py-2 text-slate-500">操作</th><th className="px-3 py-2 text-slate-500">描述</th><th className="px-3 py-2 text-slate-500">操作人</th><th className="px-3 py-2 text-slate-500">IP</th></tr></thead>
        <tbody className="divide-y divide-slate-100">
          {data.map(r => (
            <tr key={r.id} className="hover:bg-slate-50">
              <td className="px-3 py-2 whitespace-nowrap text-xs">{fmtDate(r.createdAt)}</td>
              <td className="px-3 py-2"><span className="text-xs bg-slate-100 px-1.5 py-0.5 rounded font-mono">{r.action}</span></td>
              <td className="px-3 py-2 max-w-[300px] truncate text-xs text-slate-600" title={r.description || ''}>{r.description || '-'}</td>
              <td className="px-3 py-2 text-xs">{r.operatorId ? `#${r.operatorId}` : '-'}</td>
              <td className="px-3 py-2 text-xs font-mono">{r.ip || '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ──────────────────────────────────────────────
//  Tab: Balance Logs
// ──────────────────────────────────────────────

function BalanceLogsTab({ userId }: { userId: number }) {
  const [data, setData] = useState<BalanceLogRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [typeFilter, setTypeFilter] = useState('')

  useEffect(() => {
    setLoading(true)
    ;(async () => {
      try {
        const params: any = {}
        if (typeFilter) params.type = typeFilter
        setData((await get<PaginatedData<BalanceLogRecord>>(`/api/v1/admin/users/${userId}/balance-logs`, params)).list)
      } catch { }
      finally { setLoading(false) }
    })()
  }, [userId, typeFilter])

  const typeLabel: Record<string, string> = { recharge: '充值', consumption: '消费', refund: '退款', trial_grant: '试用', admin_adjust: '管理员调整', negative_repay: '负数偿还' }

  if (loading) return <div className="text-center py-8"><Loader2 className="animate-spin inline-block" size={24} /></div>
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-500">类型：</span>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="px-2 py-1 border border-slate-300 rounded text-sm">
          <option value="">全部</option>
          {Object.entries(typeLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      {data.length === 0 ? <p className="text-slate-400 text-sm text-center py-4">暂无余额流水</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-slate-50 text-left"><th className="px-3 py-2 text-slate-500">时间</th><th className="px-3 py-2 text-slate-500">类型</th><th className="px-3 py-2 text-slate-500">金额</th><th className="px-3 py-2 text-slate-500">变更后余额</th><th className="px-3 py-2 text-slate-500">参考</th><th className="px-3 py-2 text-slate-500">描述</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {data.map(r => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2 whitespace-nowrap text-xs">{fmtDate(r.createdAt)}</td>
                  <td className="px-3 py-2"><span className="text-xs bg-slate-100 px-1.5 py-0.5 rounded">{typeLabel[r.type] || r.type}</span></td>
                  <td className={`px-3 py-2 font-medium ${Number(r.amount) >= 0 ? 'text-green-600' : 'text-red-600'}`}>{Number(r.amount) >= 0 ? '+' : ''}{Number(r.amount).toFixed(4)}</td>
                  <td className="px-3 py-2">¥{Number(r.balanceAfter).toFixed(4)}</td>
                  <td className="px-3 py-2 text-xs text-slate-500">{r.refType || '-'}</td>
                  <td className="px-3 py-2 max-w-[200px] truncate text-xs text-slate-500">{r.description || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ──────────────────────────────────────────────
//  Tab: Role History
// ──────────────────────────────────────────────

function RoleHistoryTab({ userId }: { userId: number }) {
  const [data, setData] = useState<RoleHistoryRecord[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      try { setData((await get<{ list: RoleHistoryRecord[] }>(`/api/v1/admin/users/${userId}/role-history`)).list) }
      catch { }
      finally { setLoading(false) }
    })()
  }, [userId])

  if (loading) return <div className="text-center py-8"><Loader2 className="animate-spin inline-block" size={24} /></div>
  if (data.length === 0) return <p className="text-slate-400 text-sm text-center py-8">暂无角色变更记录</p>
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="bg-slate-50 text-left"><th className="px-3 py-2 text-slate-500">时间</th><th className="px-3 py-2 text-slate-500">旧角色</th><th className="px-3 py-2 text-slate-500">新角色</th><th className="px-3 py-2 text-slate-500">操作人</th><th className="px-3 py-2 text-slate-500">原因</th></tr></thead>
        <tbody className="divide-y divide-slate-100">
          {data.map(r => (
            <tr key={r.id} className="hover:bg-slate-50">
              <td className="px-3 py-2 whitespace-nowrap text-xs">{fmtDate(r.createdAt)}</td>
              <td className="px-3 py-2"><span className="text-xs bg-slate-200 px-1.5 py-0.5 rounded">{roleLabel[r.oldRole || ''] || r.oldRole || '无'}</span></td>
              <td className="px-3 py-2"><span className={`text-xs px-1.5 py-0.5 rounded ${roleColor[r.newRole] || ''}`}>{roleLabel[r.newRole] || r.newRole}</span></td>
              <td className="px-3 py-2 text-xs">#{r.operatorId}</td>
              <td className="px-3 py-2 text-xs text-slate-500">{r.reason || '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ──────────────────────────────────────────────
//  Tab: Real Name History
// ──────────────────────────────────────────────

function RealNameHistoryTab({ userId }: { userId: number }) {
  const [data, setData] = useState<UserRealNameHistoryRecord[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      try { setData((await get<{ list: UserRealNameHistoryRecord[] }>(`/api/v1/admin/users/${userId}/real-name-history`)).list) }
      catch { }
      finally { setLoading(false) }
    })()
  }, [userId])

  const statusStyle: Record<string, string> = {
    pending_review: 'bg-yellow-100 text-yellow-700',
    approved: 'bg-green-100 text-green-700',
    rejected: 'bg-red-100 text-red-700',
  }
  const statusLabel: Record<string, string> = {
    pending_review: '待审核', approved: '已通过', rejected: '已拒绝',
  }

  if (loading) return <div className="text-center py-8"><Loader2 className="animate-spin inline-block" size={24} /></div>
  if (data.length === 0) return <p className="text-slate-400 text-sm text-center py-8">无实名审核记录</p>

  return (
    <div className="space-y-3">
      <div className="text-xs text-slate-500 mb-2">共 {data.length} 次提交记录</div>
      {data.map(r => (
        <div key={r.id} className="border border-slate-200 rounded-lg p-4 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs bg-slate-100 px-2 py-0.5 rounded font-medium">v{r.version}</span>
              <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${statusStyle[r.status] || ''}`}>
                {statusLabel[r.status] || r.status}
              </span>
            </div>
            <div className="text-xs text-slate-400">
              {new Date(r.createdAt).toLocaleString('zh-CN')}
              {r.reviewedAt && ` → ${new Date(r.reviewedAt).toLocaleString('zh-CN')}`}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div><span className="text-slate-500">姓名：</span>{r.realName || '-'}</div>
            <div><span className="text-slate-500">身份证：</span><span className="font-mono text-xs">{r.idNumber ? r.idNumber.substring(0, 6) + '********' + r.idNumber.substring(14) : '-'}</span></div>
            {r.companyName && <div className="col-span-2"><span className="text-slate-500">企业：</span>{r.companyName}</div>}
            {r.rejectReason && <div className="col-span-2 text-red-600 text-xs"><strong>拒绝原因：</strong>{r.rejectReason}</div>}
            {r.reviewerId && <div className="col-span-2 text-xs text-slate-400">审核人：#{r.reviewerId}</div>}
          </div>
        </div>
      ))}
    </div>
  )
}

// ──────────────────────────────────────────────
//  Action: Export Data
// ──────────────────────────────────────────────

function ExportDataButton({ userId, onMsg }: { userId: number; onMsg: (s: string) => void }) {
  const handle = async () => {
    try {
      const res = await fetch(`/api/v1/admin/users/${userId}/export-data`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}` }
      })
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = `user_${userId}_data_export_${Date.now()}.json`; a.click()
      URL.revokeObjectURL(url)
      onMsg('✅ 数据导出完成')
    } catch (err: any) { onMsg('❌ ' + (err.message || '')) }
  }
  return (
    <button onClick={handle} className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-slate-300 rounded-lg hover:bg-slate-100 transition">
      <FileJson size={14} /> 导出用户数据
    </button>
  )
}

// ──────────────────────────────────────────────
//  Action: Impersonate
// ──────────────────────────────────────────────

function ImpersonateButton({ userId, email, onMsg }: { userId: number; email: string; onMsg: (s: string) => void }) {
  const [open, setOpen] = useState(false)
  const [duration, setDuration] = useState(30)
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)
  const { startImpersonate } = useImpersonate()
  const navigate = useNavigate()

  const handle = async () => {
    setLoading(true)
    try {
      const res = await post<ImpersonateResult>('/api/v1/admin/users/impersonate', {
        userId, durationMinutes: duration, reason: reason || undefined,
      })
      // 保存模拟态并全量刷新，确保 AuthProvider 重新 fetchMe 拿到模拟用户数据
      startImpersonate(res.accessToken, res.userId, email, res.expiresIn)
      setOpen(false)
      window.location.href = '/'
    } catch (err: any) { onMsg('❌ ' + (err.message || '')) }
    finally { setLoading(false) }
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-slate-300 rounded-lg hover:bg-slate-100 transition">
        <LogIn size={14} /> 模拟登录
      </button>
      {open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50" onClick={e => e.target === e.currentTarget && setOpen(false)}>
          <div className="bg-white rounded-xl w-full max-w-sm p-6 shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-semibold mb-4">模拟登录</h3>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 text-sm">
              <p className="text-amber-800">即将以 <strong>{email}</strong> 的身份操作</p>
              <p className="text-amber-600 text-xs mt-1">跳转后将进入用户前台视角，可查看仪表盘、API Key 等</p>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1">有效期（分钟）</label>
                <input type="number" min={1} max={60} value={duration} onChange={e => setDuration(Number(e.target.value))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">原因（可选）</label>
                <input type="text" value={reason} onChange={e => setReason(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" placeholder="例如: 排查用户问题" />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setOpen(false)} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800">取消</button>
              <button onClick={handle} disabled={loading} className="flex items-center gap-1.5 px-4 py-2 text-sm bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50">
                {loading && <Loader2 size={14} className="animate-spin" />} 确认，进入用户视角
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ──────────────────────────────────────────────
//  Action: Change Role
// ──────────────────────────────────────────────

const ROLE_OPTIONS: { value: string; label: string }[] = [
  { value: 'user', label: '用户' },
  { value: 'admin', label: '管理员' },
  { value: 'agent', label: '代理商' },
  { value: 'super_admin', label: '超级管理员' },
]

function ChangeRoleDialog({ userId, currentRole, currentLabel, onClose, onMsg }: {
  userId: number
  currentRole: string
  currentLabel: string
  onClose: () => void
  onMsg: (s: string) => void
}) {
  const [newRole, setNewRole] = useState('')
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async () => {
    if (!newRole) { setError('请选择新角色'); return }
    if (newRole === currentRole) { setError('新角色与当前角色相同'); return }
    setLoading(true)
    setError('')
    try {
      await post(`/api/v1/admin/users/${userId}/change-role`, {
        role: newRole,
        reason: reason.trim() || undefined,
      })
      onMsg(`✅ 角色已变更: ${currentLabel} → ${ROLE_OPTIONS.find(r => r.value === newRole)?.label || newRole}`)
      onClose()
    } catch (err: any) {
      setError(err.message || '变更失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-xl w-full max-w-md p-6 shadow-xl" onClick={e => e.stopPropagation()}>
        <h3 className="text-base font-semibold mb-4 flex items-center gap-2">
          <RefreshCw size={18} /> 变更用户角色
        </h3>

        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 mb-4 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-slate-500">当前角色：</span>
            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${roleColor[currentRole] || 'bg-slate-100 text-slate-700'}`}>{currentLabel}</span>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs text-slate-500 mb-1">新角色 *</label>
            <select
              value={newRole}
              onChange={e => { setNewRole(e.target.value); setError('') }}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">请选择新角色</option>
              {ROLE_OPTIONS.filter(r => r.value !== currentRole).map(r => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">变更原因（可选）</label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="例如: 调整为普通用户，不再承担管理职责"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">影响说明</label>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 space-y-1">
              <p>• 变更后用户刷新页面即可生效</p>
              <p>• 降级后会失去后台管理菜单的访问权限</p>
              <p>• 操作记录将写入角色变更历史</p>
            </div>
          </div>
        </div>

        {error && (
          <div className="mt-3 p-3 text-sm rounded-lg bg-red-50 text-red-600 flex items-center gap-2">
            <AlertCircle size={16} /> {error}
          </div>
        )}

        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800">取消</button>
          <button
            onClick={handleSubmit}
            disabled={loading || !newRole}
            className="flex items-center gap-1.5 px-4 py-2 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50"
          >
            {loading && <Loader2 size={14} className="animate-spin" />}
            确认变更
          </button>
        </div>
      </div>
    </div>
  )
}
