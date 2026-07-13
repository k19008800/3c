import { useEffect, useState, useCallback } from 'react'
import { get, post } from '@/lib/api'
import type { LoginHistoryItem, ActiveSession } from '@/types'
import { Loader2, Shield, LogOut, Smartphone, Globe, Monitor, Clock, CheckCircle2, XCircle, ShieldCheck, AlertTriangle, MapPin } from 'lucide-react'

// ── 账号安全（用户端）─-
//
// 【业务说明】
//   用户安全状态总览，包含三部分：
//   1. 安全评分：基于活跃会话数、失败登录率自动评估风险等级（安全/注意/风险）
//   2. 活跃会话：列出所有登录设备，支持单个下线或一键下线其他设备
//   3. 登录历史：展示最近登录记录（成功/失败、IP、地理位置、设备UA）
//   登录城市分布：在地图上汇总成功登录的城市频次
//
// 【安全评分逻辑】activeCount=0 & failRate<10% → 安全(绿)；activeCount≤2 & failRate<30% → 注意(黄)；其他 → 风险(红)
// 【权限要求】登录即可访问
// 【数据来源】GET /api/v1/auth/security/login-history, GET /api/v1/auth/security/sessions
// 【操作】POST /api/v1/auth/security/logout-session/:id, POST /api/v1/auth/security/logout-all

export default function Security() {
  const [loginHistory, setLoginHistory] = useState<LoginHistoryItem[]>([])
  const [sessions, setSessions] = useState<ActiveSession[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [loggingOut, setLoggingOut] = useState<number | null>(null)
  const [loggingOutAll, setLoggingOutAll] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [historyData, sessionsData] = await Promise.all([
        get<{ list: LoginHistoryItem[] }>('/api/v1/auth/security/login-history'),
        get<{ list: ActiveSession[] }>('/api/v1/auth/security/sessions'),
      ])
      setLoginHistory(historyData.list)
      setSessions(sessionsData.list)
    } catch (err: any) {
      setError(err.message || '获取安全信息失败')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const handleLogoutSession = async (sessionId: number) => {
    setLoggingOut(sessionId)
    try {
      await post(`/api/v1/auth/security/logout-session/${sessionId}`)
      setSessions((prev) => prev.filter((s) => s.id !== sessionId))
    } catch (err: any) {
      setError(err.message || '下线失败')
    } finally {
      setLoggingOut(null)
    }
  }

  const handleLogoutAll = async () => {
    setLoggingOutAll(true)
    try {
      await post('/api/v1/auth/security/logout-all')
      setSessions((prev) => prev.filter((s) => s.isCurrent))
    } catch (err: any) {
      setError(err.message || '下线失败')
    } finally {
      setLoggingOutAll(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin" size={32} />
      </div>
    )
  }

  return (
    <div className="space-y-8 max-w-3xl">
      <div className="flex items-center gap-3">
        <Shield size={28} className="text-blue-600" />
        <h1 className="text-2xl font-bold text-slate-900">账号安全</h1>
      </div>

      {error && (
        <div className="p-3 text-sm text-red-600 bg-red-50 rounded-lg">{error}</div>
      )}

      {/* 安全评分 */}
      {(() => {
        const activeCount = sessions.filter(s => !s.isCurrent).length
        const failedLogins = loginHistory.filter(h => !h.success).length
        const totalLogins = loginHistory.length || 1
        const failRate = failedLogins / totalLogins
        const score = activeCount === 0 && failRate < 0.1 ? 'high' : activeCount <= 2 && failRate < 0.3 ? 'medium' : 'low'
        const scoreConfig = {
          high: { label: '安全', color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200', icon: ShieldCheck },
          medium: { label: '注意', color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200', icon: AlertTriangle },
          low: { label: '风险', color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200', icon: AlertTriangle },
        }[score]
        const Icon = scoreConfig.icon
        return (
          <div className={`rounded-xl border p-4 ${scoreConfig.bg} ${scoreConfig.border}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Icon size={22} className={scoreConfig.color} />
                <div>
                  <p className={`text-sm font-semibold ${scoreConfig.color}`}>安全状态 — {scoreConfig.label}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {sessions.length} 个活跃会话 · {activeCount} 个其他设备
                    {failedLogins > 0 && <> · {failedLogins} 次失败登录</>}
                  </p>
                </div>
              </div>
              <div className="text-right text-xs text-slate-400">
                <button onClick={fetchData} className="text-blue-500 hover:text-blue-700">刷新</button>
              </div>
            </div>
            {/* Geo summary */}
            {(() => {
              const cities = new Map<string, number>()
              loginHistory.filter(h => h.success && h.city).forEach(h => { cities.set(h.city!, (cities.get(h.city!) || 0) + 1) })
              const sorted = [...cities.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
              if (sorted.length === 0) return null
              return (
                <div className="flex items-center gap-2 mt-3 flex-wrap">
                  <MapPin size={12} className="text-slate-400" />
                  {sorted.map(([city, cnt]) => (
                    <span key={city} className="text-[11px] text-slate-600 bg-white/70 px-2 py-0.5 rounded-full border border-slate-200">
                      {city} ({cnt})
                    </span>
                  ))}
                </div>
              )
            })()}
          </div>
        )
      })()}

      {/* 活跃会话 */}
      <section className="bg-white rounded-xl shadow-sm border border-slate-200">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <h2 className="font-semibold text-slate-800 flex items-center gap-2">
            <Monitor size={18} /> 活跃会话 ({sessions.length})
          </h2>
          {sessions.filter(s => !s.isCurrent).length > 0 && (
            <button
              onClick={handleLogoutAll}
              disabled={loggingOutAll}
              className="flex items-center gap-1 text-xs text-red-600 hover:text-red-800 bg-red-50 px-2.5 py-1.5 rounded-md transition disabled:opacity-50"
            >
              {loggingOutAll ? <Loader2 className="animate-spin" size={12} /> : <LogOut size={12} />}
              下线其他设备
            </button>
          )}
        </div>
        <div className="divide-y divide-slate-100">
          {sessions.length === 0 ? (
            <div className="px-4 py-8 text-center text-slate-400 text-sm">暂无活跃会话</div>
          ) : (
            sessions.map((s) => (
              <div key={s.id} className={`px-4 py-3 flex items-center justify-between ${s.isCurrent ? 'bg-blue-50/50' : ''}`}>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                    <Smartphone size={16} className="text-slate-500" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-800">
                        {s.city || '未知地点'} {s.userAgent ? s.userAgent.slice(0, 40) + '...' : ''}
                      </span>
                      {s.isCurrent && (
                        <span className="text-xs text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">当前设备</span>
                      )}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      IP: {s.ip} · 最近活跃: {new Date(s.lastActivity).toLocaleString('zh-CN')}
                    </div>
                  </div>
                </div>
                {!s.isCurrent && (
                  <button
                    onClick={() => handleLogoutSession(s.id)}
                    disabled={loggingOut === s.id}
                    className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 transition disabled:opacity-50"
                  >
                    {loggingOut === s.id ? <Loader2 className="animate-spin" size={12} /> : <LogOut size={12} />}
                    下线
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </section>

      {/* 登录历史 */}
      <section className="bg-white rounded-xl shadow-sm border border-slate-200">
        <div className="px-4 py-3 border-b border-slate-100">
          <h2 className="font-semibold text-slate-800 flex items-center gap-2">
            <Clock size={18} /> 最近登录记录
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-xs text-slate-500 uppercase tracking-wider bg-slate-50/50">
                <th className="px-4 py-2.5">结果</th>
                <th className="px-4 py-2.5">时间</th>
                <th className="px-4 py-2.5">IP</th>
                <th className="px-4 py-2.5">地点</th>
                <th className="px-4 py-2.5">设备</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loginHistory.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400 text-sm">暂无登录记录</td></tr>
              ) : (
                loginHistory.map((h) => (
                  <tr key={h.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      {h.success
                        ? <CheckCircle2 size={16} className="text-green-500" />
                        : <XCircle size={16} className="text-red-500" />
                      }
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600 whitespace-nowrap">
                      {new Date(h.createdAt).toLocaleString('zh-CN')}
                    </td>
                    <td className="px-4 py-3 text-sm font-mono text-slate-500">{h.ip}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {h.city ? `${h.city}${h.country ? `, ${h.country}` : ''}` : '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500 max-w-[200px] truncate">
                      {h.userAgent ? h.userAgent.slice(0, 50) + '...' : '-'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
