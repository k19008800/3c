import { useState, useEffect } from 'react'
import { get, patch, post } from '@/lib/api'
import {
  Loader2, AlertTriangle, ShieldAlert, RefreshCw, Search, Eye, X,
  CheckCircle2, Clock, Settings2, Scan,
} from 'lucide-react'
import PaginationBar from '@/components/ui/PaginationBar'

// ── Types ──

interface AlertItem {
  id: number
  alertType: string
  severity: string
  title: string
  description: string | null
  triggerCondition: string | null
  triggerCount: number
  lastTriggeredAt: string | null
  status: string
  handledBy: number | null
  handledAt: string | null
  handledNote: string | null
  createdAt: string
}

interface AlertRule {
  id: number
  ruleName: string
  ruleType: string
  enabled: boolean
  threshold: number | null
  cooldownMinutes: number
  lastEvaluated: string | null
  createdAt: string
}

// ── Severity colors ──

const severityColors: Record<string, string> = {
  critical: 'bg-red-100 text-red-700 border-red-200',
  high: 'bg-orange-100 text-orange-700 border-orange-200',
  medium: 'bg-amber-100 text-amber-700 border-amber-200',
  low: 'bg-blue-100 text-blue-700 border-blue-200',
}

const alertTypeLabels: Record<string, string> = {
  abnormal_operation: '异常操作',
  rate_limit: '频率超限',
  auth_failure: '认证失败',
  data_anomaly: '数据异常',
  system_error: '系统错误',
  security_event: '安全事件',
}

// ── Component ──

export default function OperationAlerts() {
  const [alerts, setAlerts] = useState<AlertItem[]>([])
  const [rules, setRules] = useState<AlertRule[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  const [typeFilter, setTypeFilter] = useState('')
  const [severityFilter, setSeverityFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [selected, setSelected] = useState<AlertItem | null>(null)
  const [showRules, setShowRules] = useState(false)
  const [message, setMessage] = useState('')

  const loadAlerts = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
      if (typeFilter) params.set('alertType', typeFilter)
      if (severityFilter) params.set('severity', severityFilter)
      if (statusFilter) params.set('status', statusFilter)
      const res = await get<{ data: { list: AlertItem[]; total: number } }>(
        `/api/v1/admin/operation-alerts?${params}`
      )
      if (res?.data) {
        setAlerts(res.data.list)
        setTotal(res.data.total)
      }
    } catch { /* ignore */ }
    setLoading(false)
  }

  const loadRules = async () => {
    try {
      const res = await get<{ data: AlertRule[] }>('/api/v1/admin/operation-alerts/rules')
      if (res?.data) setRules(res.data)
    } catch { /* ignore */ }
  }

  useEffect(() => { loadAlerts() }, [page, typeFilter, severityFilter, statusFilter])

  const handleHandle = async (id: number, action: 'resolved' | 'ignored', note?: string) => {
    try {
      await patch(`/api/v1/admin/operation-alerts/${id}`, { status: action, handledNote: note || null })
      setMessage(action === 'resolved' ? '已标记为已处理' : '已忽略')
      setSelected(null)
      loadAlerts()
    } catch (err: any) {
      setMessage(err.message || '操作失败')
    }
  }

  const handleScan = async () => {
    try {
      await post('/api/v1/admin/operation-alerts/scan', {})
      setMessage('已触发扫描')
      setTimeout(() => loadAlerts(), 1000)
    } catch (err: any) {
      setMessage(err.message || '扫描触发失败')
    }
  }

  const toggleRule = async (id: number, enabled: boolean) => {
    try {
      await patch(`/api/v1/admin/operation-alerts/rules/${id}`, { enabled: !enabled })
      loadRules()
    } catch { /* ignore */ }
  }

  useEffect(() => {
    if (message) { const t = setTimeout(() => setMessage(''), 3000); return () => clearTimeout(t) }
  }, [message])

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldAlert size={24} className="text-amber-500" />
            异常操作告警
          </h1>
          <p className="text-sm text-slate-500 mt-1">监控异常操作行为，及时发现和处理安全风险</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { setShowRules(!showRules); if (!showRules) loadRules() }}
            className="flex items-center gap-1.5 px-3 py-2 border rounded-lg text-sm hover:bg-slate-50"
          >
            <Settings2 size={14} />
            告警规则
          </button>
          <button
            onClick={handleScan}
            className="flex items-center gap-1.5 px-3 py-2 border rounded-lg text-sm hover:bg-slate-50"
          >
            <Scan size={14} />
            手动扫描
          </button>
          <button
            onClick={loadAlerts}
            className="flex items-center gap-1.5 px-3 py-2 border rounded-lg text-sm hover:bg-slate-50"
          >
            <RefreshCw size={14} />
            刷新
          </button>
        </div>
      </div>

      {/* Message */}
      {message && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-50 text-blue-700 text-sm">
          <CheckCircle2 size={14} /> {message}
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3 flex-wrap">
        <select
          value={typeFilter}
          onChange={(e) => { setTypeFilter(e.target.value); setPage(1) }}
          className="px-3 py-2 border rounded-lg text-sm bg-white"
        >
          <option value="">全部类型</option>
          {Object.entries(alertTypeLabels).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <select
          value={severityFilter}
          onChange={(e) => { setSeverityFilter(e.target.value); setPage(1) }}
          className="px-3 py-2 border rounded-lg text-sm bg-white"
        >
          <option value="">全部级别</option>
          <option value="critical">严重</option>
          <option value="high">高危</option>
          <option value="medium">中危</option>
          <option value="low">低危</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
          className="px-3 py-2 border rounded-lg text-sm bg-white"
        >
          <option value="">全部状态</option>
          <option value="pending">待处理</option>
          <option value="resolved">已处理</option>
          <option value="ignored">已忽略</option>
        </select>
      </div>

      {/* Rules Panel */}
      {showRules && (
        <div className="bg-white rounded-xl border border-amber-200 p-4 space-y-2">
          <h3 className="text-sm font-medium text-slate-700">告警规则配置</h3>
          {rules.length === 0 ? (
            <p className="text-xs text-slate-400">暂无规则</p>
          ) : (
            <div className="space-y-1">
              {rules.map((r) => (
                <div key={r.id} className="flex items-center justify-between p-2 bg-slate-50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-700">{r.ruleName}</span>
                    <span className="text-[10px] text-slate-400">{r.ruleType}</span>
                    {r.threshold && <span className="text-xs text-slate-500">阈值: {r.threshold}</span>}
                    {r.lastEvaluated && (
                      <span className="text-[10px] text-slate-400">
                        上次评估: {new Date(r.lastEvaluated).toLocaleString('zh-CN')}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => toggleRule(r.id, r.enabled)}
                    className={`px-2 py-1 rounded text-xs font-medium transition ${
                      r.enabled ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {r.enabled ? '启用' : '停用'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 text-left">
                <th className="px-4 py-3 text-sm font-medium text-slate-500">类型</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">严重级别</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">标题</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">触发次数</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">最后触发</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">状态</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={7} className="text-center py-12"><Loader2 size={20} className="animate-spin mx-auto text-slate-400" /></td></tr>
              ) : alerts.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-12 text-slate-400"><AlertTriangle size={40} className="mx-auto mb-2 opacity-50" />暂无告警</td></tr>
              ) : alerts.map((a) => {
                const sevCls = severityColors[a.severity] || severityColors.medium
                return (
                  <tr key={a.id} className="hover:bg-slate-50 transition">
                    <td className="px-4 py-3 text-sm text-slate-600">{alertTypeLabels[a.alertType] || a.alertType}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium border ${sevCls}`}>
                        {a.severity === 'critical' ? '严重' : a.severity === 'high' ? '高危' : a.severity === 'medium' ? '中危' : '低危'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <p className="text-sm font-medium text-slate-800">{a.title}</p>
                        {a.description && <p className="text-xs text-slate-400 truncate max-w-[200px]">{a.description}</p>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500">{a.triggerCount}</td>
                    <td className="px-4 py-3 text-sm text-slate-500">
                      {a.lastTriggeredAt ? new Date(a.lastTriggeredAt).toLocaleString('zh-CN') : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                        a.status === 'pending' ? 'bg-red-100 text-red-700' :
                        a.status === 'resolved' ? 'bg-green-100 text-green-700' :
                        'bg-slate-100 text-slate-500'
                      }`}>
                        {a.status === 'pending' ? '待处理' : a.status === 'resolved' ? '已处理' : '已忽略'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setSelected(a)}
                        className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
                      >
                        <Eye size={14} /> 详情
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="border-t border-slate-200 px-4 py-3">
          <PaginationBar
            page={page} pageSize={pageSize} total={total}
            totalPages={Math.ceil(total / pageSize)}
            onPageChange={setPage}
            onPageSizeChange={() => {}}
          />
        </div>
      </div>

      {/* Detail Modal */}
      {selected && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl w-full max-w-lg p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <AlertTriangle size={18} className="text-amber-500" />
                告警详情
              </h2>
              <button onClick={() => setSelected(null)} className="p-1 text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-slate-500">类型</span>
                  <p className="font-medium">{alertTypeLabels[selected.alertType] || selected.alertType}</p>
                </div>
                <div>
                  <span className="text-slate-500">严重级别</span>
                  <p><span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${
                    severityColors[selected.severity] || severityColors.medium
                  }`}>
                    {selected.severity === 'critical' ? '严重' : selected.severity === 'high' ? '高危' : selected.severity === 'medium' ? '中危' : '低危'}
                  </span></p>
                </div>
                <div>
                  <span className="text-slate-500">状态</span>
                  <p>{selected.status === 'pending' ? '待处理' : selected.status === 'resolved' ? '已处理' : '已忽略'}</p>
                </div>
                <div>
                  <span className="text-slate-500">触发次数</span>
                  <p className="font-medium">{selected.triggerCount} 次</p>
                </div>
              </div>

              <div>
                <span className="text-slate-500">标题</span>
                <p className="font-medium">{selected.title}</p>
              </div>

              {selected.description && (
                <div>
                  <span className="text-slate-500">描述</span>
                  <p className="text-slate-700 whitespace-pre-wrap">{selected.description}</p>
                </div>
              )}

              {selected.triggerCondition && (
                <div>
                  <span className="text-slate-500">触发条件</span>
                  <p className="text-slate-700">{selected.triggerCondition}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-slate-500">创建时间</span>
                  <p>{selected.createdAt ? new Date(selected.createdAt).toLocaleString('zh-CN') : '—'}</p>
                </div>
                <div>
                  <span className="text-slate-500">最后触发</span>
                  <p>{selected.lastTriggeredAt ? new Date(selected.lastTriggeredAt).toLocaleString('zh-CN') : '—'}</p>
                </div>
              </div>
            </div>

            {/* Actions */}
            {selected.status === 'pending' && (
              <div className="flex items-center justify-end gap-2 pt-2 border-t">
                <input
                  id="handleNote"
                  placeholder="处理备注（可选）"
                  className="flex-1 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  onKeyDown={(e: any) => {
                    if (e.key === 'Enter') handleHandle(selected.id, 'resolved', e.target.value)
                  }}
                />
                <button
                  onClick={() => handleHandle(selected.id, 'ignored')}
                  className="px-3 py-2 border rounded-lg text-sm hover:bg-slate-50"
                >
                  忽略
                </button>
                <button
                  onClick={() => handleHandle(selected.id, 'resolved')}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
                >
                  标记已处理
                </button>
              </div>
            )}

            <div className="flex justify-end">
              <button onClick={() => setSelected(null)} className="px-4 py-2 border rounded-lg text-sm hover:bg-slate-50">
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
