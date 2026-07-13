import { useEffect, useState, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import { get, post } from '@/lib/api'
import type { SecurityEvent, PaginatedData } from '@/types'
import RiskBadge from '@/components/security/RiskBadge'
import PaginationBar from '@/components/ui/PaginationBar'
import FeatureDescription from '@/components/admin/FeatureDescription'
import {
  Loader2, AlertCircle, ChevronLeft, ChevronRight, CheckCircle2,
  AlertTriangle, ShieldAlert, X, Download, CheckSquare, Square,
  Search, ExternalLink, Clock, Globe, Monitor, Info
} from 'lucide-react'

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
  const [pageSize, setPageSize] = useState(20)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState({ eventType: '', riskLevel: '', acknowledged: '' })

  // 详情弹窗
  const [detailEvent, setDetailEvent] = useState<SecurityEvent | null>(null)

  // 批量选择
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [batchAckLoading, setBatchAckLoading] = useState(false)

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
      setSelectedIds(new Set())
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

  const handleBatchAck = async () => {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return
    setBatchAckLoading(true)
    try {
      await post('/api/v1/admin/security/events/batch-ack', { ids })
      fetchEvents()
    } catch (err: any) {
      setError(err.message || '批量确认失败')
    } finally {
      setBatchAckLoading(false)
    }
  }

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === events.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(events.map(e => e.id)))
    }
  }

  // CSV 导出（当前页）
  const handleExportCsv = () => {
    const headers = ['时间', '风险等级', '事件类型', '用户ID', 'IP', '地点', 'UA', '详情', '处理状态']
    const rows = events.map(ev => [
      new Date(ev.createdAt).toLocaleString('zh-CN'),
      ev.riskLevel,
      eventTypeLabels[ev.eventType] || ev.eventType,
      ev.userId ?? '',
      ev.ip ?? '',
      ev.city ? `${ev.city}${ev.country ? `, ${ev.country}` : ''}` : '',
      ev.userAgent ?? '',
      typeof ev.detail === 'object' ? JSON.stringify(ev.detail) : String(ev.detail ?? ''),
      ev.acknowledged ? '已处理' : '未处理',
    ])

    const csv = [
      headers.join(','),
      ...rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')),
    ].join('\n')

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `安全事件_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const renderDetail = (ev: SecurityEvent) => {
    const detail = ev.detail
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="p-2.5 bg-slate-50 rounded-lg">
            <div className="text-[10px] text-slate-400 uppercase mb-0.5">事件 ID</div>
            <div className="text-sm font-mono text-slate-700">#{ev.id}</div>
          </div>
          <div className="p-2.5 bg-slate-50 rounded-lg">
            <div className="text-[10px] text-slate-400 uppercase mb-0.5">风险等级</div>
            <RiskBadge level={ev.riskLevel} />
          </div>
          <div className="p-2.5 bg-slate-50 rounded-lg">
            <div className="text-[10px] text-slate-400 uppercase mb-0.5">事件类型</div>
            <div className="text-sm text-slate-700">{eventTypeLabels[ev.eventType] || ev.eventType}</div>
          </div>
          <div className="p-2.5 bg-slate-50 rounded-lg">
            <div className="text-[10px] text-slate-400 uppercase mb-0.5">发生时间</div>
            <div className="text-sm text-slate-700 flex items-center gap-1">
              <Clock size={12} />{new Date(ev.createdAt).toLocaleString('zh-CN')}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-2.5 bg-slate-50 rounded-lg">
            <div className="text-[10px] text-slate-400 uppercase mb-0.5">用户</div>
            <div className="text-sm text-slate-700">
              {ev.userId ? (
                <Link to={`/admin/users?id=${ev.userId}`} className="text-blue-600 hover:text-blue-800 flex items-center gap-1">
                  #{ev.userId} <ExternalLink size={10} />
                </Link>
              ) : '-'}
            </div>
          </div>
          <div className="p-2.5 bg-slate-50 rounded-lg">
            <div className="text-[10px] text-slate-400 uppercase mb-0.5">IP 地址</div>
            <div className="text-sm font-mono text-slate-700 flex items-center gap-1">
              <Globe size={12} />{ev.ip ?? '-'}
            </div>
          </div>
          <div className="p-2.5 bg-slate-50 rounded-lg">
            <div className="text-[10px] text-slate-400 uppercase mb-0.5">地理位置</div>
            <div className="text-sm text-slate-700">{ev.city ? `${ev.city}${ev.country ? `, ${ev.country}` : ''}` : '-'}</div>
          </div>
        </div>
        {ev.userAgent && (
          <div className="p-2.5 bg-slate-50 rounded-lg">
            <div className="text-[10px] text-slate-400 uppercase mb-0.5">用户代理 (UA)</div>
            <div className="text-xs text-slate-500 font-mono break-all flex items-start gap-1">
              <Monitor size={12} className="mt-0.5 shrink-0" />{ev.userAgent}
            </div>
          </div>
        )}
        {detail && typeof detail === 'object' && Object.keys(detail).length > 0 && (
          <div className="p-2.5 bg-slate-50 rounded-lg">
            <div className="text-[10px] text-slate-400 uppercase mb-0.5">事件详情 (JSON)</div>
            <pre className="text-xs text-slate-600 font-mono bg-white p-2 rounded border border-slate-200 overflow-x-auto max-h-40">
              {JSON.stringify(detail, null, 2)}
            </pre>
          </div>
        )}
        {/* 提示：确认处理的作用范围 */}
        <div className="p-2.5 bg-blue-50 rounded-lg border border-blue-100">
          <div className="text-[10px] text-blue-600 uppercase mb-0.5">⚠️ 说明</div>
          <ul className="text-xs text-blue-700 space-y-1">
            <li>• 「确认处理」仅标记该事件为「已阅」的审计操作。如需提前解封用户，请前往<Link to="/admin/security/bans" className="underline font-medium">封禁管理</Link>操作。</li>
            <li>• 封禁信息存储在 Redis 中，不会修改用户资料表的任何字段，用户管理页不显示。</li>
            <li>• 封禁到期后自动解除，届时事件详情中仍可查看历史封禁记录。</li>
          </ul>
        </div>
        {ev.acknowledged && (
          <div className="p-2.5 bg-green-50 rounded-lg border border-green-100">
            <div className="text-[10px] text-green-600 uppercase mb-0.5">处理信息</div>
            <div className="text-xs text-green-700">
              已由管理员 #{ev.acknowledgedBy}
              {ev.acknowledgedAt ? ` 于 ${new Date(ev.acknowledgedAt).toLocaleString('zh-CN')}` : ''} 确认处理
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <ShieldAlert size={24} /> 安全事件
        </h1>
        <FeatureDescription page="admin/security/events" className="ml-2" />
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCsv}
            className="flex items-center gap-1 px-3 py-1.5 text-xs bg-slate-50 text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-100 transition"
          >
            <Download size={14} /> 导出CSV
          </button>
          {selectedIds.size > 0 && (
            <button
              onClick={handleBatchAck}
              disabled={batchAckLoading}
              className="flex items-center gap-1 px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition"
            >
              {batchAckLoading ? (
                <Loader2 className="animate-spin" size={14} />
              ) : (
                <CheckCircle2 size={14} />
              )}
              确认选中 ({selectedIds.size})
            </button>
          )}
        </div>
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
                  <th className="px-2 py-3 w-10 text-center">
                    <button onClick={toggleSelectAll} className="p-1 hover:bg-slate-200 rounded">
                      {selectedIds.size === events.length ? (
                        <CheckSquare size={14} className="text-blue-600" />
                      ) : (
                        <Square size={14} />
                      )}
                    </button>
                  </th>
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
                {events.map((ev) => (
                  <tr
                    key={ev.id}
                    className={`hover:bg-slate-50 cursor-pointer transition ${
                      !ev.acknowledged && ev.riskLevel === 'critical' ? 'bg-red-50' : ''
                    } ${selectedIds.has(ev.id) ? 'bg-blue-50/50' : ''}`}
                    onClick={() => setDetailEvent(ev)}
                  >
                    <td className="px-2 py-3 text-center">
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleSelect(ev.id) }}
                        className="p-1 hover:bg-slate-200 rounded"
                      >
                        {selectedIds.has(ev.id) ? (
                          <CheckSquare size={14} className="text-blue-600" />
                        ) : (
                          <Square size={14} className="text-slate-400" />
                        )}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500 whitespace-nowrap">
                      {new Date(ev.createdAt).toLocaleString('zh-CN')}
                    </td>
                    <td className="px-4 py-3"><RiskBadge level={ev.riskLevel} /></td>
                    <td className="px-4 py-3 text-sm font-medium text-slate-800">
                      {eventTypeLabels[ev.eventType] || ev.eventType}
                      {ev.eventType === 'ip_banned' && (
                        <Link to="/admin/security/bans" onClick={(e) => e.stopPropagation()} className="ml-1 text-blue-500 hover:text-blue-700 inline-flex">
                          <ExternalLink size={10} />
                        </Link>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {ev.userId ? (
                        <Link to={`/admin/users?id=${ev.userId}`} onClick={(e) => e.stopPropagation()} className="text-blue-600 hover:text-blue-800">
                          #{ev.userId}
                        </Link>
                      ) : '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500 font-mono">{ev.ip}</td>
                    <td className="px-4 py-3 text-sm text-slate-500">
                      {ev.city ? `${ev.city}${ev.country ? `, ${ev.country}` : ''}` : '-'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {ev.acknowledged ? (
                        <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">已确认</span>
                      ) : (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleAck(ev.id) }}
                          className="text-xs text-blue-600 hover:text-blue-800 bg-blue-50 px-2 py-0.5 rounded-full transition flex items-center gap-1 mx-auto"
                        >
                          <CheckCircle2 size={12} /> 确认
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <PaginationBar
          page={page}
          onPageChange={setPage}
          pageSize={pageSize}
          onPageSizeChange={setPageSize}
          total={total}
          totalPages={totalPages}
        />
      )}

      {/* 事件详情弹窗 */}
      {detailEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setDetailEvent(null)}>
          <div className="bg-white rounded-xl w-full max-w-2xl max-h-[85vh] overflow-y-auto shadow-xl mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between z-10">
              <h2 className="font-semibold text-slate-800 flex items-center gap-2">
                <Info size={18} />
                事件详情 #{detailEvent.id}
              </h2>
              <button onClick={() => setDetailEvent(null)} className="p-1 hover:bg-slate-100 rounded">
                <X size={18} />
              </button>
            </div>
            <div className="p-6">
              {renderDetail(detailEvent)}
            </div>
            <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-2">
              {!detailEvent.acknowledged && (
                <button
                  onClick={() => { handleAck(detailEvent.id); setDetailEvent(null) }}
                  className="flex items-center gap-1 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                >
                  <CheckCircle2 size={14} /> 标记已处理
                </button>
              )}
              <button
                onClick={() => setDetailEvent(null)}
                className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
