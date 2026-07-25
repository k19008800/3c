import { useEffect, useState, useCallback } from 'react'
import { get, post } from '@/lib/api'
import { Loader2, AlertCircle, ShieldAlert, CheckCircle2, RefreshCw } from 'lucide-react'

interface RiskEvent {
  id: number
  eventType: string
  riskLevel: string
  description: string | null
  ip: string | null
  userId: number | null
  acknowledged: boolean
  acknowledgedBy: number | null
  createdAt: string
}

const riskLevelColors: Record<string, string> = {
  low: 'bg-green-100 text-green-700',
  medium: 'bg-yellow-100 text-yellow-700',
  high: 'bg-orange-100 text-orange-700',
  critical: 'bg-red-100 text-red-700',
}

const riskLevelLabels: Record<string, string> = {
  low: '低', medium: '中', high: '高', critical: '严重',
}

const eventTypeLabels: Record<string, string> = {
  brute_force: '暴力破解',
  unusual_location: '异地登录',
  new_device: '新设备',
  ip_banned: 'IP封禁',
  user_banned: '账号封禁',
  user_captcha: '验证码挑战',
  circuit_trip: '厂商熔断',
  circuit_recovery: '熔断恢复',
  vendor_failure: '厂商失败',
  test_alert: '测试告警',
  risk_detected: '风控检测',
  sensitive_word: '敏感词触发',
  abnormal_ip: '异常IP',
  batch_operation: '批量操作',
  repeat_operation: '重复操作',
  risk_control: '风控模型',
}

const pageSize = 20

export default function RiskEventsList() {
  const [events, setEvents] = useState<RiskEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [riskFilter, setRiskFilter] = useState('all')
  const [ackFilter, setAckFilter] = useState('')

  const fetchEvents = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params: Record<string, any> = { page, pageSize }
      if (riskFilter !== 'all') params.riskLevel = riskFilter
      if (ackFilter) params.acknowledged = ackFilter

      const res = await get<{
        list: RiskEvent[]
        total: number
        page: number
        pageSize: number
      }>('/api/v1/admin/risk-control/events', params)
      setEvents(res.list)
      setTotal(res.total)
    } catch (err: any) {
      setError(err.message || '获取风险事件失败')
    } finally {
      setLoading(false)
    }
  }, [page, riskFilter, ackFilter])

  useEffect(() => { fetchEvents() }, [fetchEvents])

  const handleAcknowledge = async (id: number) => {
    try {
      await post(`/api/v1/admin/risk-control/events/${id}/acknowledge`)
      await fetchEvents()
    } catch (err: any) {
      setError(err.message || '确认失败')
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">风险事件列表</h2>
        <button
          onClick={() => { setPage(1); fetchEvents() }}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
        >
          <RefreshCw size={14} />
          刷新
        </button>
      </div>

      {/* 筛选 */}
      <div className="flex flex-wrap gap-3">
        <select
          value={riskFilter}
          onChange={e => { setRiskFilter(e.target.value); setPage(1) }}
          className="px-3 py-1.5 border rounded-lg text-sm"
        >
          <option value="all">所有风险等级</option>
          <option value="critical">严重</option>
          <option value="high">高</option>
          <option value="medium">中</option>
          <option value="low">低</option>
        </select>
        <select
          value={ackFilter}
          onChange={e => { setAckFilter(e.target.value); setPage(1) }}
          className="px-3 py-1.5 border rounded-lg text-sm"
        >
          <option value="">所有状态</option>
          <option value="false">未确认</option>
        </select>
        <span className="text-sm text-gray-500 self-center">
          共 {total} 条
        </span>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 text-sm text-red-600 bg-red-50 rounded-lg">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="animate-spin" size={32} />
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {events.length === 0 ? (
              <div className="text-center py-20 text-gray-400">
                <ShieldAlert size={48} className="mx-auto mb-3 opacity-30" />
                <p>暂无风险事件</p>
              </div>
            ) : (
              events.map(event => (
                <div
                  key={event.id}
                  className={`border rounded-xl p-4 transition-colors ${
                    !event.acknowledged && (event.riskLevel === 'critical' || event.riskLevel === 'high')
                      ? 'border-l-4 border-l-red-500 bg-red-50/30'
                      : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${riskLevelColors[event.riskLevel] || 'bg-gray-100 text-gray-600'}`}>
                          {riskLevelLabels[event.riskLevel] || event.riskLevel}
                        </span>
                        <span className="text-sm font-medium text-gray-700">
                          {eventTypeLabels[event.eventType] || event.eventType}
                        </span>
                        {!event.acknowledged && (
                          <span className="text-xs text-orange-500 font-medium">待确认</span>
                        )}
                      </div>
                      <p className="text-sm text-gray-600 truncate">
                        {event.description || '-'}
                      </p>
                      <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-400">
                        <span>IP: {event.ip || '-'}</span>
                        {event.userId && <span>用户ID: {event.userId}</span>}
                        <span>{new Date(event.createdAt).toLocaleString('zh-CN')}</span>
                      </div>
                    </div>
                    <div className="flex-shrink-0">
                      {!event.acknowledged ? (
                        <button
                          onClick={() => handleAcknowledge(event.id)}
                          className="flex items-center gap-1 px-3 py-1.5 text-xs text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100"
                        >
                          <CheckCircle2 size={14} />
                          确认
                        </button>
                      ) : (
                        <span className="flex items-center gap-1 px-3 py-1.5 text-xs text-green-600 bg-green-50 rounded-lg">
                          <CheckCircle2 size={14} />
                          已确认
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* 分页 */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                className="px-3 py-1.5 text-sm border rounded-lg disabled:opacity-30"
              >
                上一页
              </button>
              <span className="text-sm text-gray-500">
                第 {page} / {totalPages} 页
              </span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage(p => p + 1)}
                className="px-3 py-1.5 text-sm border rounded-lg disabled:opacity-30"
              >
                下一页
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
