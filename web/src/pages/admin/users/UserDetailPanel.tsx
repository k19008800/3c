// ──────────────────────────────────────────────
//  UserDetailPanel — 用户详情标签面板（弹窗）
//  标签页内容委托到独立子组件
// ──────────────────────────────────────────────

import { useState } from 'react'
import { post } from '@/lib/api'
import type { AdminUser } from '@/types'
import { roleLabel, statusLabel, statusColor, statusHelp, fmtDate } from './_shared'
import InfoTab from './UserInfoTab'
import {
  NotesTab, IpWhitelistTab, OAuthTab,
  RoleHistoryTab, RealNameHistoryTab, BalanceLogsSection,
} from './UserDetailTabs'
import ApiKeysTab from './UserKeyPanel'
import { LoginHistoryTab, AuditLogsTab, CallStatsTab } from './UserLogPanel'
import { ExportDataButton, ImpersonateButton, ChangeRoleDialog } from './ActionButtons'
import { CheckCircle2, Lock, RefreshCw, User, Shield, History, Activity, MessageSquare, Key, Globe, FileText, Wallet } from 'lucide-react'

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
] as const

type TabKey = (typeof TABS)[number]['key']

interface UserDetailModalProps { user: AdminUser; onClose: () => void }

export default function UserDetailModal({ user, onClose }: UserDetailModalProps) {
  const [tab, setTab] = useState<TabKey>('info')
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
            {user.isBanned && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700"><Lock size={10} /> 风控封禁中</span>}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl">&times;</button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200 overflow-x-auto shrink-0 px-2">
          {TABS.map(t => {
            const Icon = t.icon
            return (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`flex items-center gap-1.5 px-3.5 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition ${tab === t.key ? 'text-blue-600 border-blue-600' : 'text-slate-500 border-transparent hover:text-slate-700'}`}>
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
          {tab === 'balance-logs' && <BalanceLogsSection userId={user.id} />}
          {tab === 'role-history' && <RoleHistoryTab userId={user.id} />}
        </div>

        {/* Actions bar */}
        <div className="flex items-center gap-2 px-6 py-3 border-t border-slate-200 bg-slate-50 shrink-0">
          <ExportDataButton userId={user.id} onMsg={setMsg} />
          <button onClick={() => setShowChangeRole(true)}
            className="flex items-center gap-1 px-3 py-1 text-sm border border-amber-300 text-amber-700 bg-amber-50 rounded-lg hover:bg-amber-100 transition">
            <RefreshCw size={14} /> 变更角色</button>
          <ImpersonateButton userId={user.id} email={user.email} onMsg={setMsg} />
          {user.isBanned && (
            <button onClick={async () => {
              try { await post('/api/v1/admin/security/unban/user', { userId: user.id }); setMsg('✅ 用户已解封'); setTimeout(() => window.location.reload(), 1500) }
              catch (e: any) { setMsg('❌ 解封失败: ' + (e.message || '')) }
            }} className="flex items-center gap-1 px-3 py-1 text-sm text-green-600 bg-green-50 rounded-md hover:bg-green-100 transition">
              <Lock size={14} /> 解封此用户</button>
          )}
          <span className="text-xs text-slate-400 ml-auto">{user.lastLoginAt ? `最后登录: ${fmtDate(user.lastLoginAt)}` : '从未登录'}</span>
        </div>
      </div>

      {showChangeRole && (
        <ChangeRoleDialog userId={user.id} currentRole={user.role} currentLabel={roleLabel[user.role] || user.role} onClose={() => setShowChangeRole(false)} onMsg={setMsg} />
      )}
    </div>
  )
}
