import { useEffect, useState, useCallback } from 'react'
import { get, post, put, del } from '@/lib/api'
import { Loader2, Plus, Send, Trash2, RefreshCw, Webhook } from 'lucide-react'
import FeatureDescription from '@/components/admin/FeatureDescription'

// ── Types ──

interface WebhookItem {
  id: number
  name: string
  url: string
  secret: string
  events: string
  enabled: boolean
  retryCount: number
  consecutiveFailures: number
  autoDisableAfter: number
  lastSentAt: string | null
  lastStatus: string | null
  createdAt: string
}

interface WebhookLog {
  webhookId: number
  event: string
  status: string
  statusCode: number
  timestamp: string
  attempt?: number
}

const WEBHOOK_EVENTS = [
  { value: 'recharge.completed', label: '充值完成' },
  { value: 'withdraw.completed', label: '提现完成' },
  { value: 'user.created', label: '用户注册' },
  { value: 'user.verified', label: '实名通过' },
  { value: 'agent.upgraded', label: '代理升级' },
  { value: 'key.expired', label: 'Key 过期' },
  { value: 'alert.triggered', label: '告警触发' },
  { value: 'order.created', label: '订单创建' },
  { value: 'order.completed', label: '订单完成' },
]

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  success: { label: '成功', color: 'text-green-600 bg-green-50' },
  failed: { label: '失败', color: 'text-red-600 bg-red-50' },
  error: { label: '异常', color: 'text-amber-600 bg-amber-50' },
}

export default function AdminWebhooksPage() {
  const [webhooks, setWebhooks] = useState<WebhookItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  // 表单
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [formName, setFormName] = useState('')
  const [formUrl, setFormUrl] = useState('')
  const [formEvents, setFormEvents] = useState<string[]>([])
  const [formRetry, setFormRetry] = useState(3)
  const [formAutoDisable, setFormAutoDisable] = useState(10)

  // 日志
  const [logsId, setLogsId] = useState<number | null>(null)
  const [logs, setLogs] = useState<WebhookLog[]>([])
  const [logsLoading, setLogsLoading] = useState(false)

  // 测试
  const [testingId, setTestingId] = useState<number | null>(null)

  const loadWebhooks = useCallback(async () => {
    setLoading(true)
    try {
      const res = await get('/api/v1/admin/webhooks')
      setWebhooks(res.data?.list || [])
    } catch (e: any) {
      setError(e?.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadWebhooks() }, [loadWebhooks])

  async function loadLogs(id: number) {
    setLogsId(id)
    setLogsLoading(true)
    try {
      const res = await get(`/api/v1/admin/webhooks/${id}/logs`)
      setLogs(res.data?.list || [])
    } catch { } finally {
      setLogsLoading(false)
    }
  }

  function resetForm() {
    setEditId(null)
    setFormName('')
    setFormUrl('')
    setFormEvents([])
    setFormRetry(3)
    setFormAutoDisable(10)
    setShowForm(false)
  }

  function editWebhook(w: WebhookItem) {
    setEditId(w.id)
    setFormName(w.name)
    setFormUrl(w.url)
    setFormEvents(w.events.split(',').filter(Boolean))
    setFormRetry(w.retryCount)
    setFormAutoDisable(w.autoDisableAfter)
    setShowForm(true)
  }

  async function handleSave() {
    if (!formName || !formUrl || formEvents.length === 0) {
      setMessage('请填写名称、URL 并选择事件')
      return
    }

    const body = {
      name: formName,
      url: formUrl,
      events: formEvents.join(','),
      retryCount: formRetry,
      autoDisableAfter: formAutoDisable,
    }

    try {
      if (editId) {
        await put(`/api/v1/admin/webhooks/${editId}`, body)
        setMessage('已更新')
      } else {
        await post('/api/v1/admin/webhooks', body)
        setMessage('创建成功')
      }
      resetForm()
      await loadWebhooks()
    } catch (e: any) {
      setMessage(`保存失败: ${e?.message}`)
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('确定删除此 Webhook？')) return
    try {
      await del(`/api/v1/admin/webhooks/${id}`)
      setMessage('已删除')
      await loadWebhooks()
    } catch (e: any) {
      setMessage(`删除失败: ${e?.message}`)
    }
  }

  async function handleTest(id: number) {
    setTestingId(id)
    setMessage('')
    try {
      const res = await post(`/api/v1/admin/webhooks/${id}/test`, {})
      setMessage(`测试结果: ${res.message}`)
    } catch (e: any) {
      setMessage(`测试失败: ${e?.message}`)
    } finally {
      setTestingId(null)
    }
  }

  function toggleEvent(e: string) {
    setFormEvents(prev => prev.includes(e) ? prev.filter(x => x !== e) : [...prev, e])
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* 标题 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Webhook className="w-6 h-6 text-blue-600" />
          <h1 className="text-2xl font-bold">全局 Webhook</h1>
          <FeatureDescription page="全局 Webhook 出站" />
        </div>
        <button
          onClick={() => { resetForm(); setShowForm(true) }}
          className="flex items-center gap-1 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
        >
          <Plus className="w-4 h-4" />
          添加 Webhook
        </button>
      </div>

      {error && <div className="p-3 bg-red-50 text-red-700 rounded-lg border border-red-200 text-sm">{error}</div>}
      {message && (
        <div className={`p-3 rounded-lg text-sm ${message.includes('失败') || message.includes('失败') ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'}`}>
          {message}
        </div>
      )}

      {/* 表单 */}
      {showForm && (
        <div className="bg-white rounded-lg border shadow-sm p-6 space-y-4">
          <h3 className="font-semibold">{editId ? '编辑 Webhook' : '新建 Webhook'}</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">名称</label>
              <input
                value={formName}
                onChange={e => setFormName(e.target.value)}
                placeholder="例如：充值通知"
                className="w-full px-3 py-2 border rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">目标 URL</label>
              <input
                value={formUrl}
                onChange={e => setFormUrl(e.target.value)}
                placeholder="https://example.com/webhook"
                className="w-full px-3 py-2 border rounded-lg text-sm font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">订阅事件（可多选）</label>
            <div className="flex flex-wrap gap-2">
              {WEBHOOK_EVENTS.map(e => (
                <button
                  key={e.value}
                  type="button"
                  onClick={() => toggleEvent(e.value)}
                  className={`px-3 py-1.5 rounded-lg text-xs border transition ${formEvents.includes(e.value) ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 hover:bg-gray-50'}`}
                >
                  {e.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div>
              <label className="block text-sm font-medium mb-1">重试次数</label>
              <input
                type="number" min={0} max={10}
                value={formRetry}
                onChange={e => setFormRetry(Number(e.target.value))}
                className="w-24 px-3 py-2 border rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">超过失败次数自动禁用</label>
              <input
                type="number" min={1} max={100}
                value={formAutoDisable}
                onChange={e => setFormAutoDisable(Number(e.target.value))}
                className="w-24 px-3 py-2 border rounded-lg text-sm"
              />
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <button onClick={handleSave} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
              {editId ? '保存' : '创建'}
            </button>
            <button onClick={resetForm} className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50">
              取消
            </button>
          </div>
        </div>
      )}

      {/* 列表 */}
      <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 border-b">
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">名称</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">URL</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">事件</th>
              <th className="px-4 py-3 text-center text-sm font-medium text-gray-600">状态</th>
              <th className="px-4 py-3 text-center text-sm font-medium text-gray-600">连续失败</th>
              <th className="px-4 py-3 text-center text-sm font-medium text-gray-600">操作</th>
            </tr>
          </thead>
          <tbody>
            {webhooks.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-400 text-sm">暂无 Webhook 配置</td>
              </tr>
            ) : webhooks.map(w => {
              const eventLabels = w.events.split(',').map(e => {
                const found = WEBHOOK_EVENTS.find(x => x.value === e)
                return found?.label || e
              })

              return (
                <tr key={w.id} className="border-b hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="text-sm font-medium">{w.name}</div>
                    <div className="text-xs text-gray-400 font-mono">ID: {w.id}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500 max-w-[200px] truncate font-mono">{w.url}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {eventLabels.map(el => (
                        <span key={el} className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">{el}</span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-0.5 inline-block rounded text-xs font-medium ${w.enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {w.enabled ? '启用' : '禁用'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center text-sm">
                    <span className={w.consecutiveFailures > 5 ? 'text-red-600 font-medium' : 'text-gray-500'}>
                      {w.consecutiveFailures}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => handleTest(w.id)}
                        disabled={testingId === w.id}
                        title="测试推送"
                        className="p-1.5 rounded hover:bg-gray-100 text-blue-600"
                      >
                        <Send className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => loadLogs(w.id)}
                        title="推送日志"
                        className="p-1.5 rounded hover:bg-gray-100 text-gray-600"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => editWebhook(w)}
                        title="编辑"
                        className="p-1.5 rounded hover:bg-gray-100 text-gray-600"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => handleDelete(w.id)}
                        title="删除"
                        className="p-1.5 rounded hover:bg-gray-100 text-red-500"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* 推送日志弹窗 */}
      {logsId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setLogsId(null)}>
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 p-6 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">推送日志</h3>
              <button onClick={() => setLogsId(null)} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
            </div>

            {logsLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
            ) : logs.length === 0 ? (
              <div className="text-center py-8 text-gray-400 text-sm">暂无推送记录</div>
            ) : (
              <div className="space-y-2">
                {logs.map((log, i) => {
                  const st = STATUS_MAP[log.status] || STATUS_MAP.error
                  return (
                    <div key={i} className="flex items-center justify-between p-2 bg-gray-50 rounded text-sm">
                      <div>
                        <span className="font-mono text-xs">{log.event}</span>
                        {log.attempt && <span className="text-xs text-gray-400 ml-2">第{log.attempt}次</span>}
                      </div>
                      <div className="flex items-center gap-2">
                        {log.statusCode && <span className="text-xs text-gray-400">{log.statusCode}</span>}
                        <span className={`px-2 py-0.5 rounded text-xs ${st.color}`}>{st.label}</span>
                        <span className="text-xs text-gray-400">{new Date(log.timestamp).toLocaleString()}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 帮助 */}
      <div className="bg-blue-50 rounded-lg p-4 text-sm text-blue-800 border border-blue-200">
        <p className="font-medium mb-1">💡 说明</p>
        <ul className="list-disc ml-4 space-y-1">
          <li>Webhook 用于将平台事件实时推送到外部系统（HMAC-SHA256 签名）</li>
          <li>创建后自动生成随机 secret，用于推送签名验证</li>
          <li>推送失败自动重试（指数退避），连续失败超过阈值自动禁用</li>
          <li>支持事件：充值/提现/用户注册/实名通过/代理升级/Key过期/告警/订单</li>
        </ul>
      </div>
    </div>
  )
}
