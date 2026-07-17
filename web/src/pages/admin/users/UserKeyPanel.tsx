// ──────────────────────────────────────────────
//  UserKeyPanel — API Key 管理子面板
//  包含：API Key 列表 + 单 Key 展开统计
// ──────────────────────────────────────────────

import { Fragment, useEffect, useState, useCallback } from 'react'
import { get, patch, del } from '@/lib/api'
import type { AdminApiKey, PaginatedData } from '@/types'
import MiniChart from '@/components/ui/MiniChart'
import PaginationBar from '@/components/ui/PaginationBar'
import { fmtDate } from './_shared'
import { Loader2, ChevronDown, BarChart3 } from 'lucide-react'

interface KeyStatsSummary { totalCalls: number; successCalls: number; failedCalls: number; totalTokens: number; totalCost: string; avgDuration: number; lastUsedAt?: string }
interface KeyTrends { series: { date: string; calls: number }[] }
interface CallLog { id: number; createdAt: string; modelName?: string; totalTokens: number; cost: string; durationMs?: number; status: string; errorMessage?: string }

function MiniStat({ label, value }: { label: string; value: string }) {
  return <div className="bg-white rounded border border-slate-200 px-2.5 py-1 min-w-[70px]"><div className="text-[10px] text-slate-400">{label}</div><div className="text-xs font-bold text-slate-700">{value}</div></div>
}

function ApiKeyStatsPanel({ userId, keyId, keyName }: { userId: number; keyId: number; keyName: string }) {
  const [stats, setStats] = useState<KeyStatsSummary | null>(null)
  const [trends, setTrends] = useState<KeyTrends | null>(null)
  const [logs, setLogs] = useState<CallLog[]>([])
  const [logTotal, setLogTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [days, setDays] = useState(7)
  const [logPage, setLogPage] = useState(1)
  const [logPageSize, setLogPageSize] = useState(20)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const end = new Date(); const start = new Date(); start.setDate(start.getDate() - days)
    const s = start.toISOString().substring(0, 10); const e = end.toISOString().substring(0, 10)
    try {
      const [st, tr, l] = await Promise.all([
        get<any>(`/api/v1/admin/users/${userId}/api-keys/${keyId}/call-stats`, { startDate: s, endDate: e }),
        get<any>(`/api/v1/admin/users/${userId}/api-keys/${keyId}/call-trends`, { days }),
        get<PaginatedData<CallLog>>(`/api/v1/admin/users/${userId}/api-keys/${keyId}/call-logs`, { page: logPage, pageSize: logPageSize, startDate: s, endDate: e }),
      ])
      setStats(st.summary); setTrends(tr); setLogs(l.list); setLogTotal(l.total)
    } catch { } finally { setLoading(false) }
  }, [userId, keyId, days, logPage])

  useEffect(() => { fetchAll() }, [fetchAll])
  if (loading) return <Loader2 className="animate-spin inline-block" size={16} />

  const s = stats
  const trendData = (trends?.series ?? []).map(p => ({ label: p.date, value: p.calls }))
  const logTotalPages = Math.ceil(logTotal / logPageSize)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h5 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5"><BarChart3 size={14} /> {keyName}</h5>
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
      {trendData.length > 1 && <div className="bg-white rounded border border-slate-200 p-2"><MiniChart data={trendData} width={300} height={60} type="line" color="#8b5cf6" /></div>}
      <div>
        <h6 className="text-[10px] text-slate-500 mb-1 font-medium">最近调用{logTotal > 0 && <span> ({logTotal} 条)</span>}</h6>
        {logs.length === 0 ? <p className="text-[10px] text-slate-400">无调用记录</p> : (
          <table className="w-full text-[10px]">
            <thead><tr className="text-left text-slate-400"><th className="pr-2 py-1">时间</th><th className="pr-2 py-1">模型</th><th className="pr-2 py-1 text-right">Token</th><th className="pr-2 py-1 text-right">费用</th><th className="pr-2 py-1 text-right">耗时</th><th className="py-1 text-center">状态</th></tr></thead>
            <tbody className="divide-y divide-slate-50">
              {logs.map(r => (
                <tr key={r.id}>
                  <td className="pr-2 py-1 whitespace-nowrap text-slate-400">{fmtDate(r.createdAt)}</td>
                  <td className="pr-2 py-1">{r.modelName || '-'}</td>
                  <td className="pr-2 py-1 text-right">{r.totalTokens.toLocaleString()}</td>
                  <td className="pr-2 py-1 text-right">{'¥' + Number(r.cost).toFixed(4)}</td>
                  <td className="pr-2 py-1 text-right text-slate-400">{r.durationMs != null ? r.durationMs + 'ms' : '-'}</td>
                  <td className="py-1 text-center">{r.status === 'success' ? <span className="text-green-500">Ok</span> : r.status === 'failed' ? <span className="text-red-500" title={r.errorMessage || ''}>No</span> : <span className="text-slate-300">-</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {logTotalPages > 0 && <PaginationBar page={logPage} onPageChange={setLogPage} pageSize={logPageSize} onPageSizeChange={setLogPageSize} total={logTotal} totalPages={logTotalPages} />}
      </div>
    </div>
  )
}

// ── API Keys Tab ───────────────────────────────

interface ApiKeysTabProps { userId: number; onMsg: (s: string) => void }

export default function ApiKeysTab({ userId, onMsg }: ApiKeysTabProps) {
  const [data, setData] = useState<AdminApiKey[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedKey, setExpandedKey] = useState<number | null>(null)

  const fetch = useCallback(async () => {
    try { setData((await get<{ list: AdminApiKey[] }>(`/api/v1/admin/users/${userId}/api-keys`)).list) }
    catch { } finally { setLoading(false) }
  }, [userId])

  useEffect(() => { fetch() }, [fetch])

  const toggleKey = async (keyId: number, cur: boolean) => {
    try { await patch(`/api/v1/admin/users/${userId}/api-keys/${keyId}`, { status: !cur }); fetch(); onMsg(cur ? '✅ 已禁用' : '✅ 已启用') }
    catch (err: any) { onMsg('❌ ' + (err.message || '')) }
  }

  const deleteKey = async (keyId: number) => {
    if (!confirm('确定删除此 API Key？')) return
    try { await del(`/api/v1/admin/users/${userId}/api-keys/${keyId}`); fetch(); onMsg('✅ 已删除') }
    catch (err: any) { onMsg('❌ ' + (err.message || '')) }
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
                <tr className="hover:bg-slate-50 cursor-pointer transition" onClick={() => setExpandedKey(expandedKey === k.id ? null : k.id)}>
                  <td className="px-3 py-2"><ChevronDown size={14} className={`transition-transform text-slate-400 ${expandedKey === k.id ? 'rotate-0' : '-rotate-90'}`} /></td>
                  <td className="px-3 py-2 font-medium">{k.name}</td>
                  <td className="px-3 py-2 font-mono text-xs">{k.keyPrefix}...</td>
                  <td className="px-3 py-2"><span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${k.status ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{k.status ? '启用' : '禁用'}</span></td>
                  <td className="px-3 py-2 text-xs">{fmtDate(k.expiresAt)}</td>
                  <td className="px-3 py-2 text-xs">{fmtDate(k.lastUsedAt)}</td>
                  <td className="px-3 py-2 text-xs">{fmtDate(k.createdAt)}</td>
                  <td className="px-3 py-2 flex gap-1">
                    <button onClick={e => { e.stopPropagation(); toggleKey(k.id, k.status) }} className="text-xs text-blue-600 hover:text-blue-800">{k.status ? '禁用' : '启用'}</button>
                    <button onClick={e => { e.stopPropagation(); deleteKey(k.id) }} className="text-xs text-red-600 hover:text-red-800">删除</button>
                  </td>
                </tr>
                {expandedKey === k.id && (
                  <tr><td colSpan={8} className="px-4 py-2 bg-slate-50"><ApiKeyStatsPanel userId={userId} keyId={k.id} keyName={k.name} /></td></tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
