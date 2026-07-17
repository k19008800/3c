// ──────────────────────────────────────────────
//  UserLogPanel — 日志子面板
//  包含：登录历史 / 审计日志
//  调用统计详见 UserCallStatsTab.tsx
// ──────────────────────────────────────────────

import { useEffect, useState } from 'react'
import { get } from '@/lib/api'
import type { PaginatedData, LoginHistoryRecord, AuditLogRecord } from '@/types'
import { fmtDate } from './_shared'
import { Loader2 } from 'lucide-react'
import CallStatsTab from './UserCallStatsTab'

export { CallStatsTab }

// ── Login History Tab ─────────────────────────

interface LoginHistoryTabProps { userId: number }

export function LoginHistoryTab({ userId }: LoginHistoryTabProps) {
  const [data, setData] = useState<LoginHistoryRecord[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    ;(async () => {
      try { setData((await get<PaginatedData<LoginHistoryRecord>>(`/api/v1/admin/users/${userId}/login-history`)).list) }
      catch { } finally { setLoading(false) }
    })()
  }, [userId])

  if (loading) return <div className="text-center py-8"><Loader2 className="animate-spin inline-block" size={24} /></div>
  if (data.length === 0) return <p className="text-slate-400 text-sm text-center py-8">暂无登录记录</p>

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="bg-slate-50 text-left">
          <th className="px-3 py-2 text-slate-500">时间</th><th className="px-3 py-2 text-slate-500">IP</th>
          <th className="px-3 py-2 text-slate-500">User-Agent</th><th className="px-3 py-2 text-slate-500">状态</th>
          <th className="px-3 py-2 text-slate-500">失败原因</th>
        </tr></thead>
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

// ── Audit Logs Tab ────────────────────────────

interface AuditLogsTabProps { userId: number }

export function AuditLogsTab({ userId }: AuditLogsTabProps) {
  const [data, setData] = useState<AuditLogRecord[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    ;(async () => {
      try { setData((await get<PaginatedData<AuditLogRecord>>(`/api/v1/admin/users/${userId}/audit-logs`)).list) }
      catch { } finally { setLoading(false) }
    })()
  }, [userId])

  if (loading) return <div className="text-center py-8"><Loader2 className="animate-spin inline-block" size={24} /></div>
  if (data.length === 0) return <p className="text-slate-400 text-sm text-center py-8">暂无审计日志</p>

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="bg-slate-50 text-left">
          <th className="px-3 py-2 text-slate-500">时间</th><th className="px-3 py-2 text-slate-500">操作</th>
          <th className="px-3 py-2 text-slate-500">描述</th><th className="px-3 py-2 text-slate-500">操作人</th>
          <th className="px-3 py-2 text-slate-500">IP</th>
        </tr></thead>
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
