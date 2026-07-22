import { useEffect, useState, useCallback } from 'react'
import { get, post } from '@/lib/api'
import type { SecurityEvent, PaginatedData } from '@/types'
import RiskBadge from '@/components/security/RiskBadge'
import { Loader2, AlertCircle, ChevronLeft, ChevronRight, CheckCircle2, AlertTriangle, ShieldAlert } from 'lucide-react'

const eventTypeLabels: Record<string, string> = {
  brute_force: '暴力破解', unusual_location: '异地登录', new_device: '新设备',
  ip_banned: 'IP封禁', user_banned: '账号封禁', user_captcha: '验证码挑战',
  circuit_trip: '厂商熔断', circuit_recovery: '熔断恢复', vendor_failure: '厂商失败',
}

const RISK_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 }

export default function AdminSecurityEvents() {
  const [events, setEvents] = useState<SecurityEvent[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState({ eventType: '', riskLevel: '', acknowledged: '' })

  const totalPages = Math.ceil(total / pageSize)

  const fetchEvents = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params: any = { page, pageSize }
      if (filter.eventType) params.eventType = filter.eventType
      if (filter.riskLevel) params.riskLevel = filter.riskLevel
      if (filter.acknowledged) params.acknowledged = filter.acknowledged === 'true'
      const data = await get<PaginatedData<SecurityEvent>>('/api/v1/admin/security/events', params)
      setEvents(data.list.sort((a, b) => {
        const ra = RISK_ORDER[a.riskLevel] ?? 99
        const rb = RISK_ORDER[b.riskLevel] ?? 99
        return ra - rb
      }))
      setTotal(data.total)
    } catch (err: any) {
      setError(err.message || '获取安全事件失败')
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, filter])

  useEffect(() => { fetchEvents() }, [fetchEvents])

  const handleAck = async (id: number) => {
    try {
      await post(`/api/v1/admin/security/events/${id}/ack`)
      fetchEvents()
    } catch (err: any) {
      setError(err.message || '确认失败')
    }
  }

  const renderRow = (ev: SecurityEvent) => (
    <tr key={ev.id} className={`hover:bg-slate-50 ${!ev.acknowledged && ev.riskLevel === 'critical' ? 'bg-red-50' : ''}`}>
      <td className="px-4 py-3 text-sm text-slate-500 whitespace-nowrap">
        {new Date(ev.createdAt).toLocaleString('zh-CN')}
      </td>
      <td className="px-4 py-3">
        <RiskBadge level={ev.riskLevel} />
      </td>
      <td className="px-4 py-3 text-sm font-medium text-slate-800">
        {eventTypeLabels[ev.eventType] || ev.eventType}
      </td>
      <td className="px-4 py-3 text-sm text-slate-600">{ev.userId ?? '-'}</td>
      <td className="px-4 py-3 text-sm text-slate-500 font-mono">{ev.ip}</td>
      <td className="px-4 py-3 text-sm text-slate-500">
        {ev.city ? `${ev.city}${ev.country ? `, ${ev.country}` : ''}` : '-'}
      </td>
      <td className="px-4 py-3 text-center">
        {ev.acknowledged ? (
          <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">已确认</span>
        ) : (
          <button
            onClick={() => handleAck(ev.id)}
            className="text-xs text-blue-600 hover:text-blue-800 bg-blue-50 px-2 py-0.5 rounded-full transition flex items-center gap-1 mx-auto"
          >
            <CheckCircle2 size={12} /> 确认
          </button>
        )}
      </td>
    </tr>
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <ShieldAlert size={24} /> 安全事件
        </h1>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 text-sm text-red-600 bg-red-50 rounded-lg">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-xs text-slate-500 mb-1">事件类型</label>
            <select value={filter.eventType} onChange={(e) => { setFilter(f => ({ ...f, eventType: e.target.value })); setPage(1) }}
              className="border border-slate-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">全部</option>
              {Object.entries(eventTypeLabels).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">风险等级</label>
            <select value={filter.riskLevel} onChange={(e) => { setFilter(f => ({ ...f, riskLevel: e.target.value })); setPage(1) }}
              className="border border-slate-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">全部</option>
              <option value="critical">严重</option>
              <option value="high">高风险</option>
              <option value="medium">中风险</option>
              <option value="low">低风险</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">处理状态</label>
            <select value={filter.acknowledged} onChange={(e) => { setFilter(f => ({ ...f, acknowledged: e.target.value })); setPage(1) }}
              className="border border-slate-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">全部</option>
              <option value="false">未处理</option>
              <option value="true">已处理</option>
            </select>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="animate-spin" size={24} /></div>
        ) : events.length === 0 ? (
          <div className="flex flex-col items-center py-12 text-slate-400">
            <ShieldAlert size={48} className="mb-2" />
            <p>暂无安全事件</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 text-left text-xs text-slate-500 uppercase tracking-wider">
                  <th className="px-4 py-3">时间</th>
                  <th className="px-4 py-3">风险</th>
                  <th className="px-4 py-3">类型</th>
                  <th className="px-4 py-3">用户</th>
                  <th className="px-4 py-3">IP</th>
                  <th className="px-4 py-3">地点</th>
                  <th className="px-4 py-3 text-center">状态</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {events.map(renderRow)}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-500">共 {total} 条</span>
          <div className="flex gap-2">
            <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
              className="px-3 py-1.5 border border-slate-300 rounded-md text-sm disabled:opacity-40 hover:bg-slate-50">
              <ChevronLeft size={16} />
            </button>
            <span className="px-3 py-1.5 text-sm text-slate-600">{page}/{totalPages}</span>
            <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
              className="px-3 py-1.5 border border-slate-300 rounded-md text-sm disabled:opacity-40 hover:bg-slate-50">
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
