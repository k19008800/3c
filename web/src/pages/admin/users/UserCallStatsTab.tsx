// ──────────────────────────────────────────────
//  CallStatsTab — 调用统计子面板
//  （概览 / 按模型 / 趋势 / 按 Key）
// ──────────────────────────────────────────────

import { useEffect, useState, useCallback } from 'react'
import { get } from '@/lib/api'
import type { UserCallStats, UserCallStatsByModel } from '@/types'
import {
  Loader2, RefreshCw, BarChart3, PieChart, TrendingUp, Key, Clock, Download,
} from 'lucide-react'

interface CallStatsTabProps { userId: number }

export default function CallStatsTab({ userId }: CallStatsTabProps) {
  const [data, setData] = useState<UserCallStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [startDate, setStartDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 7); return d.toISOString().substring(0, 10)
  })
  const [endDate, setEndDate] = useState(() => new Date().toISOString().substring(0, 10))
  const [tab, setTab] = useState<'overview' | 'models' | 'trends' | 'keys'>('overview')

  const fetchData = useCallback(async () => {
    setLoading(true)
    try { setData(await get<UserCallStats>(`/api/v1/admin/users/${userId}/call-stats`, { startDate, endDate })) }
    catch { } finally { setLoading(false) }
  }, [userId, startDate, endDate])

  useEffect(() => { fetchData() }, [fetchData])

  const exportCSV = (type: string) => {
    if (!data) return
    const rows: string[] = []
    if (type === 'models' && data.byModel.length > 0) {
      rows.push('模型,调用次数,Token,费用')
      data.byModel.forEach(m => rows.push(`${m.modelName},${m.calls},${m.tokens},${m.cost}`))
    } else if (type === 'trends' && data.trends.length > 0) {
      rows.push('日期,调用次数,Token,费用')
      data.trends.forEach(d => rows.push(`${d.date},${d.calls},${d.tokens},${d.cost}`))
    } else if (type === 'keys' && data.byKey.length > 0) {
      rows.push('KeyID,调用次数,Token,费用')
      data.byKey.forEach(k => rows.push(`${k.apiKeyId},${k.calls},${k.tokens},${k.cost}`))
    } else if (type === 'summary') {
      const s = data.summary
      const rate = s.totalCalls > 0 ? ((s.successCalls / s.totalCalls) * 100).toFixed(1) + '%' : '0.0%'
      rows.push('指标,数值'); rows.push(`总调用,${s.totalCalls}`); rows.push(`成功调用,${s.successCalls}`)
      rows.push(`失败调用,${s.failedCalls}`); rows.push(`总Token,${s.totalTokens}`)
      rows.push(`总费用,${s.totalCost}`); rows.push(`平均耗时,${s.avgDuration}ms`); rows.push(`成功率,${rate}`)
    }
    if (rows.length > 0) {
      const blob = new Blob(['\ufeff' + rows.join('\n')], { type: 'text/csv;charset=utf-8' })
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
      a.download = `user_${userId}_callstats_${type}_${startDate}_${endDate}.csv`; a.click()
      URL.revokeObjectURL(a.href)
    }
  }

  if (loading && !data) return <div className="text-center py-8"><Loader2 className="animate-spin inline-block" size={24} /></div>
  if (!data) return <p className="text-slate-400 text-sm text-center py-8">暂无数据</p>

  const s = data.summary
  const t = data.today
  const successRate = s.totalCalls > 0 ? ((s.successCalls / s.totalCalls) * 100).toFixed(1) : '0.0'
  const subTabBtn = (k: string, label: string, Icon: any) => (
    <button key={k} onClick={() => setTab(k as any)}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition ${tab === k ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
      <Icon size={13} /> {label}
    </button>
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">起始：</span>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="px-2.5 py-1.5 border border-slate-300 rounded text-xs" />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">结束：</span>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="px-2.5 py-1.5 border border-slate-300 rounded text-xs" />
        </div>
        <button onClick={fetchData} className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition flex items-center gap-1"><RefreshCw size={12} /> 查询</button>
        <span className="text-[10px] text-slate-400 ml-auto">{startDate} ~ {endDate}</span>
      </div>

      <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit">
        {subTabBtn('overview', '概览', BarChart3)}{subTabBtn('models', '按模型', PieChart)}{subTabBtn('trends', '趋势', TrendingUp)}{subTabBtn('keys', '按Key', Key)}
      </div>

      {tab === 'overview' && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: '今日调用', v: t ? t.calls.toLocaleString() : '—', sub: t ? `${t.successCount} 成功 / ${t.failedCount} 失败` : '', color: 'border-blue-200 bg-blue-50' },
              { label: '总调用', v: s.totalCalls.toLocaleString(), sub: `Token ${s.totalTokens.toLocaleString()}`, color: 'border-purple-200 bg-purple-50' },
              { label: '成功率', v: `${successRate}%`, sub: `总消费 ¥${Number(s.totalCost).toFixed(4)}`, color: 'border-green-200 bg-green-50' },
              { label: '平均耗时', v: `${s.avgDuration}ms`, sub: `成功 ${s.successCalls} / 失败 ${s.failedCalls}`, color: 'border-amber-200 bg-amber-50' },
            ].map(c => (
              <div key={c.label} className={`rounded-lg border p-3 ${c.color}`}>
                <p className="text-xs text-slate-500 mb-1">{c.label}</p>
                <p className="text-lg font-bold text-slate-800">{c.v}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">{c.sub}</p>
              </div>
            ))}
          </div>
          {s.totalCalls > 0 && (
            <div className="bg-white rounded-lg border border-slate-200 p-3">
              <div className="flex justify-between text-xs mb-2"><span className="text-slate-500">成功率</span><span className="font-mono font-bold text-slate-700">{successRate}%</span></div>
              <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden"><div className="bg-emerald-500 h-3 rounded-full transition-all" style={{ width: `${Math.min(100, Number(successRate))}%` }} /></div>
              <div className="flex justify-between text-[10px] text-slate-400 mt-1"><span>成功 {s.successCalls}</span><span>失败 {s.failedCalls}</span></div>
            </div>
          )}
          <div className="flex justify-end"><button onClick={() => exportCSV('summary')} className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"><Download size={12} /> 导出</button></div>
        </div>
      )}

      {tab === 'models' && (
        <div className="space-y-3">
          {data.byModel.length === 0 ? <p className="p-6 text-center text-sm text-slate-400">暂无模型用量数据</p> : (
            <>
              <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                <table className="w-full text-xs">
                  <thead><tr className="bg-slate-50 text-left"><th className="px-4 py-2.5 font-medium text-slate-500">模型</th><th className="px-4 py-2.5 font-medium text-slate-500 text-right">调用</th><th className="px-4 py-2.5 font-medium text-slate-500 text-right">Token</th><th className="px-4 py-2.5 font-medium text-slate-500 text-right">费用</th><th className="px-4 py-2.5 font-medium text-slate-500 text-right">成功率</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.byModel.map((m: UserCallStatsByModel) => {
                      const total = (m.successCount ?? 0) + (m.failedCount ?? 0); const r = total > 0 ? ((m.successCount ?? 0) / total * 100).toFixed(1) : '—'
                      return (
                        <tr key={m.modelName} className="hover:bg-slate-50">
                          <td className="px-4 py-2.5 font-medium text-slate-700 font-mono">{m.modelName}</td>
                          <td className="px-4 py-2.5 text-right text-slate-600">{m.calls.toLocaleString()}</td>
                          <td className="px-4 py-2.5 text-right text-slate-600 font-mono">{m.tokens.toLocaleString()}</td>
                          <td className="px-4 py-2.5 text-right text-slate-900 font-mono font-medium">{'¥' + Number(m.cost).toFixed(4)}</td>
                          <td className="px-4 py-2.5 text-right">
                            <span className={`font-mono ${typeof r === 'string' ? 'text-slate-400' : Number(r) < 90 ? 'text-red-600' : Number(r) < 99 ? 'text-amber-600' : 'text-slate-600'}`}>{r}{typeof r !== 'string' && '%'}</span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-end"><button onClick={() => exportCSV('models')} className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"><Download size={12} /> 导出</button></div>
            </>
          )}
        </div>
      )}

      {tab === 'trends' && (
        <div className="space-y-3">
          {data.trends.length === 0 ? <p className="text-sm text-slate-400 py-8 text-center">暂无数据</p> : (
            <>
              <div className="bg-white rounded-lg border border-slate-200 p-4">
                <p className="text-xs font-medium text-slate-500 mb-3"><TrendingUp size={12} className="inline mr-1" />每日 Token 消耗趋势</p>
                {(() => { const max = Math.max(1, ...data.trends.map(d => d.tokens)); return (
                  <div className="flex items-end gap-2 h-28">
                    {data.trends.map(d => (
                      <div key={d.date} className="flex-1 flex flex-col items-center gap-1" title={`${d.date}: ${d.calls}次 / ${d.tokens.toLocaleString()} / ¥${Number(d.cost).toFixed(4)}`}>
                        <span className="text-[10px] text-slate-400 font-mono">{d.calls}</span>
                        <div className="w-full bg-blue-400 rounded-t" style={{ height: `${Math.max(3, (d.tokens / max) * 100)}%`, minHeight: 3 }} />
                        <span className="text-[10px] text-slate-400">{d.date.slice(5)}</span>
                      </div>
                    ))}
                  </div>
                )})()}
              </div>
              <div className="bg-white rounded-lg border border-slate-200 p-4">
                <p className="text-xs font-medium text-slate-500 mb-3"><Clock size={12} className="inline mr-1" />24 小时调用分布</p>
                {data.hourly.length === 0 ? <p className="text-sm text-slate-400 py-4 text-center">暂无数据</p> : (
                  (() => {
                    const maxCalls = Math.max(1, ...data.hourly.map(h => h.calls))
                    const hours = Array.from({ length: 24 }, (_, i) => { const f = data.hourly.find(h => h.hour === i); return f || { hour: i, calls: 0, tokens: 0 } })
                    return (
                      <div className="grid grid-cols-24 gap-px bg-slate-100 rounded-lg overflow-hidden">
                        {hours.map(h => {
                          const intensity = h.calls / Math.max(1, maxCalls)
                          const bg = intensity > 0.7 ? 'bg-blue-500' : intensity > 0.4 ? 'bg-blue-400' : intensity > 0.1 ? 'bg-blue-200' : 'bg-slate-50'
                          return <div key={h.hour} className={`${bg} p-2 text-center`} title={`${h.hour}:00 - ${h.calls}次 / ${h.tokens.toLocaleString()}`}><span className="text-[9px] text-slate-600 font-mono">{h.hour}</span></div>
                        })}
                      </div>
                    )
                  })()
                )}
              </div>
              <div className="flex justify-end"><button onClick={() => exportCSV('trends')} className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"><Download size={12} /> 导出</button></div>
            </>
          )}
        </div>
      )}

      {tab === 'keys' && (
        <div className="space-y-3">
          {data.byKey.length === 0 ? <p className="p-6 text-center text-sm text-slate-400">暂无 Key 用量数据</p> : (
            <>
              <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                <table className="w-full text-xs">
                  <thead><tr className="bg-slate-50 text-left"><th className="px-4 py-2.5 font-medium text-slate-500">Key ID</th><th className="px-4 py-2.5 font-medium text-slate-500 text-right">调用次数</th><th className="px-4 py-2.5 font-medium text-slate-500 text-right">Token</th><th className="px-4 py-2.5 font-medium text-slate-500 text-right">费用</th><th className="px-4 py-2.5 font-medium text-slate-500 text-right">占比</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {(() => { const tc = data.byKey.reduce((a, b) => a + b.calls, 0); return data.byKey.map(k => (
                      <tr key={k.apiKeyId} className="hover:bg-slate-50">
                        <td className="px-4 py-2.5 font-medium text-slate-700 font-mono">#{k.apiKeyId}</td>
                        <td className="px-4 py-2.5 text-right text-slate-600">{k.calls.toLocaleString()}</td>
                        <td className="px-4 py-2.5 text-right text-slate-600 font-mono">{k.tokens.toLocaleString()}</td>
                        <td className="px-4 py-2.5 text-right text-slate-900 font-mono font-medium">{'¥' + Number(k.cost).toFixed(4)}</td>
                        <td className="px-4 py-2.5 text-right text-slate-500">{tc > 0 ? `${((k.calls / tc) * 100).toFixed(0)}%` : '—'}</td>
                      </tr>
                    ))})()}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-end"><button onClick={() => exportCSV('keys')} className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"><Download size={12} /> 导出</button></div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
