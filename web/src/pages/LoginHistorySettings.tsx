import { useEffect, useState } from 'react'
import { get } from '@/lib/api'
import type { LoginHistoryItem } from '@/types'
import {
  Loader2, Clock, CheckCircle2, XCircle,
} from 'lucide-react'

export default function LoginHistorySettings() {
  const [history, setHistory] = useState<LoginHistoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    setLoading(true)
    setError('')
    get<{ list: LoginHistoryItem[] }>('/api/v1/auth/security/login-history', { limit: 20 })
      .then((data) => setHistory(data.list))
      .catch((err: any) => setError(err.message || '获取登录历史失败'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin" size={32} />
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200">
      <div className="px-4 py-3 border-b border-slate-100">
        <h2 className="font-semibold text-slate-800 flex items-center gap-2">
          <Clock size={18} /> 最近登录记录
        </h2>
      </div>

      {error && (
        <div className="p-3 text-sm text-red-600 bg-red-50 border-b border-red-100">{error}</div>
      )}

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
            {history.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400 text-sm">
                  暂无登录记录
                </td>
              </tr>
            ) : (
              history.map((h) => (
                <tr key={h.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    {h.success ? (
                      <CheckCircle2 size={16} className="text-green-500" />
                    ) : (
                      <XCircle size={16} className="text-red-500" />
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600 whitespace-nowrap">
                    {new Date(h.createdAt).toLocaleString('zh-CN')}
                  </td>
                  <td className="px-4 py-3 text-sm font-mono text-slate-500">{h.ip}</td>
                  <td className="px-4 py-3 text-sm text-slate-600">
                    {h.city
                      ? `${h.city}${h.country ? `, ${h.country}` : ''}`
                      : '-'}
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
    </div>
  )
}