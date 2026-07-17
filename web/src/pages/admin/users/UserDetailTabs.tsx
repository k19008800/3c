// ──────────────────────────────────────────────
//  UserDetailTabs — 用户详情中的各个标签页
//  包含：备注 / IP白名单 / OAuth绑定 /
//        角色历史 / 实名历史 / 余额流水
// ──────────────────────────────────────────────

import { useEffect, useState, useCallback } from 'react'
import { get, post, del } from '@/lib/api'
import type {
  UserNote, UserIpWhitelistEntry, OAuthBinding,
  RoleHistoryRecord, UserRealNameHistoryRecord, PaginatedData,
} from '@/types'
import { roleLabel, roleColor, fmtDate } from './_shared'
import { BalanceLogsTab } from './UserBalancePanel'
import { Loader2, Plus, Trash2 } from 'lucide-react'

// ── Notes Tab ─────────────────────────────────

interface NotesTabProps { userId: number; onMsg: (s: string) => void }

export function NotesTab({ userId, onMsg }: NotesTabProps) {
  const [data, setData] = useState<UserNote[]>([])
  const [loading, setLoading] = useState(true)
  const [content, setContent] = useState('')

  const fetch = useCallback(async () => {
    try { setData((await get<{ list: UserNote[] }>(`/api/v1/admin/users/${userId}/notes`)).list) }
    catch { } finally { setLoading(false) }
  }, [userId])
  useEffect(() => { fetch() }, [fetch])

  const add = async () => {
    if (!content.trim()) return
    try { await post(`/api/v1/admin/users/${userId}/notes`, { content }); setContent(''); fetch(); onMsg('✅ 备注已添加') }
    catch (err: any) { onMsg('❌ ' + (err.message || '')) }
  }

  const remove = async (noteId: number) => {
    try { await del(`/api/v1/admin/users/${userId}/notes/${noteId}`); fetch(); onMsg('✅ 备注已删除') }
    catch (err: any) { onMsg('❌ ' + (err.message || '')) }
  }

  if (loading) return <div className="text-center py-8"><Loader2 className="animate-spin inline-block" size={24} /></div>
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <textarea value={content} onChange={e => setContent(e.target.value)} placeholder="添加内部备注..." rows={2}
          className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <button onClick={add} disabled={!content.trim()}
          className="self-end px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1">
          <Plus size={14} /> 添加</button>
      </div>
      {data.length === 0 ? <p className="text-slate-400 text-sm text-center py-4">暂无备注</p> : (
        <div className="space-y-2">
          {data.map(n => (
            <div key={n.id} className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg">
              <div className="flex-1 min-w-0">
                <p className="text-sm whitespace-pre-wrap">{n.content}</p>
                <p className="text-xs text-slate-400 mt-1">{fmtDate(n.createdAt)}{n.updatedAt !== n.createdAt ? ` (编辑于 ${fmtDate(n.updatedAt)})` : ''} — 管理员 #{n.createdBy}</p>
              </div>
              <button onClick={() => remove(n.id)} className="text-red-400 hover:text-red-600 shrink-0"><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── IP Whitelist Tab ──────────────────────────

interface IpWhitelistTabProps { userId: number; onMsg: (s: string) => void }

export function IpWhitelistTab({ userId, onMsg }: IpWhitelistTabProps) {
  const [data, setData] = useState<UserIpWhitelistEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [ip, setIp] = useState('')
  const [desc, setDesc] = useState('')

  const fetch = useCallback(async () => {
    try { setData((await get<{ list: UserIpWhitelistEntry[] }>(`/api/v1/admin/users/${userId}/ip-whitelist`)).list) }
    catch { } finally { setLoading(false) }
  }, [userId])
  useEffect(() => { fetch() }, [fetch])

  const add = async () => {
    if (!ip.trim()) return
    try { await post(`/api/v1/admin/users/${userId}/ip-whitelist`, { ip: ip.trim(), description: desc.trim() || undefined }); setIp(''); setDesc(''); fetch(); onMsg('✅ IP 已加入白名单') }
    catch (err: any) { onMsg('❌ ' + (err.message || '')) }
  }

  const remove = async (id: number) => {
    try { await del(`/api/v1/admin/users/${userId}/ip-whitelist/${id}`); fetch(); onMsg('✅ IP 已移除') }
    catch (err: any) { onMsg('❌ ' + (err.message || '')) }
  }

  if (loading) return <div className="text-center py-8"><Loader2 className="animate-spin inline-block" size={24} /></div>
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input type="text" value={ip} onChange={e => setIp(e.target.value)} placeholder="IP 地址"
          className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <input type="text" value={desc} onChange={e => setDesc(e.target.value)} placeholder="备注（可选）"
          className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm" />
        <button onClick={add} disabled={!ip.trim()}
          className="px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1">
          <Plus size={14} /> 添加</button>
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

// ── OAuth Tab ─────────────────────────────────

interface OAuthTabProps { userId: number; onMsg: (s: string) => void }

export function OAuthTab({ userId, onMsg }: OAuthTabProps) {
  const [data, setData] = useState<OAuthBinding[]>([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    try { setData((await get<{ list: OAuthBinding[] }>(`/api/v1/admin/users/${userId}/oauth-bindings`)).list) }
    catch { } finally { setLoading(false) }
  }, [userId])
  useEffect(() => { fetch() }, [fetch])

  const unbind = async (provider: string) => {
    if (!confirm(`确定解绑 ${provider}？`)) return
    try { await post(`/api/v1/admin/users/${userId}/unbind-oauth`, { provider }); fetch(); onMsg(`✅ ${provider} 已解绑`) }
    catch (err: any) { onMsg('❌ ' + (err.message || '')) }
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

// ── Role History Tab ──────────────────────────

interface RoleHistoryTabProps { userId: number }

export function RoleHistoryTab({ userId }: RoleHistoryTabProps) {
  const [data, setData] = useState<RoleHistoryRecord[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    ;(async () => {
      try { setData((await get<{ list: RoleHistoryRecord[] }>(`/api/v1/admin/users/${userId}/role-history`)).list) }
      catch { } finally { setLoading(false) }
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

// ── Real Name History Tab ─────────────────────

interface RealNameHistoryTabProps { userId: number }

export function RealNameHistoryTab({ userId }: RealNameHistoryTabProps) {
  const [data, setData] = useState<UserRealNameHistoryRecord[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    ;(async () => {
      try { setData((await get<{ list: UserRealNameHistoryRecord[] }>(`/api/v1/admin/users/${userId}/real-name-history`)).list) }
      catch { } finally { setLoading(false) }
    })()
  }, [userId])

  const statusStyle: Record<string, string> = { pending_review: 'bg-yellow-100 text-yellow-700', approved: 'bg-green-100 text-green-700', rejected: 'bg-red-100 text-red-700' }
  const labelMap: Record<string, string> = { pending_review: '待审核', approved: '已通过', rejected: '已拒绝' }

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
              <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${statusStyle[r.status] || ''}`}>{labelMap[r.status] || r.status}</span>
            </div>
            <div className="text-xs text-slate-400">{new Date(r.createdAt).toLocaleString('zh-CN')}{r.reviewedAt && ` → ${new Date(r.reviewedAt).toLocaleString('zh-CN')}`}</div>
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

// ── Balance Logs Wrapper ──────────────────────

interface BalanceLogsSectionProps { userId: number }

export function BalanceLogsSection({ userId }: BalanceLogsSectionProps) {
  return <BalanceLogsTab userId={userId} />
}
