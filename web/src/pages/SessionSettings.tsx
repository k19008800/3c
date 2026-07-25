import { useEffect, useState, useCallback } from 'react'
import { get, post } from '@/lib/api'
import type { ActiveSession } from '@/types'
import {
  Loader2, Monitor, Smartphone, LogOut,
} from 'lucide-react'

export default function SessionSettings() {
  const [sessions, setSessions] = useState<ActiveSession[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [loggingOut, setLoggingOut] = useState<number | null>(null)
  const [loggingOutAll, setLoggingOutAll] = useState(false)

  const fetchSessions = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await get<{ list: ActiveSession[] }>('/api/v1/auth/security/sessions')
      setSessions(data.list)
    } catch (err: any) {
      setError(err.message || '获取会话列表失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchSessions() }, [fetchSessions])

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

  const otherSessions = sessions.filter((s) => !s.isCurrent)

  return (
    <div className="bg-white rounded-xl border border-slate-200">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <h2 className="font-semibold text-slate-800 flex items-center gap-2">
          <Monitor size={18} /> 活跃会话 ({sessions.length})
        </h2>
        {otherSessions.length > 0 && (
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

      {error && (
        <div className="p-3 text-sm text-red-600 bg-red-50 border-b border-red-100">{error}</div>
      )}

      <div className="divide-y divide-slate-100">
        {sessions.length === 0 ? (
          <div className="px-4 py-8 text-center text-slate-400 text-sm">暂无活跃会话</div>
        ) : (
          sessions.map((s) => (
            <div
              key={s.id}
              className={`px-4 py-3 flex items-center justify-between ${
                s.isCurrent ? 'bg-blue-50/50' : ''
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                  <Smartphone size={16} className="text-slate-500" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-800">
                      {s.city || '未知地点'}
                      {s.userAgent ? ' · ' + s.userAgent.slice(0, 40) + '...' : ''}
                    </span>
                    {s.isCurrent && (
                      <span className="text-xs text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                        当前设备
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    IP: {s.ip} · 最近活跃:{' '}
                    {new Date(s.lastActivity).toLocaleString('zh-CN')}
                  </div>
                </div>
              </div>
              {!s.isCurrent && (
                <button
                  onClick={() => handleLogoutSession(s.id)}
                  disabled={loggingOut === s.id}
                  className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 transition disabled:opacity-50"
                >
                  {loggingOut === s.id ? (
                    <Loader2 className="animate-spin" size={12} />
                  ) : (
                    <LogOut size={12} />
                  )}
                  下线
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}