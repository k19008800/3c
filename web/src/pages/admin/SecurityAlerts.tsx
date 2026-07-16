import { useEffect, useState, useCallback } from 'react'
import { get, patch, post } from '@/lib/api'
import type { SecurityConfig } from '@/types'
import { Loader2, AlertCircle, Save, Bell, Mail, Globe, RefreshCw, Send } from 'lucide-react'
import FeatureDescription from '@/components/admin/FeatureDescription'

export default function AdminSecurityAlerts() {
  const [configs, setConfigs] = useState<SecurityConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [editValues, setEditValues] = useState<Record<string, string>>({})

  const alertConfigKeys = [
    'alert_admin_email',
    'alert_high_risk_enabled',
    'alert_medium_risk_enabled',
    'alert_low_risk_enabled',
    'alert_webhook_url',
    'alert_daily_summary_enabled',
  ]

  const fetchConfigs = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await get<{ list: SecurityConfig[] }>('/api/v1/admin/security/config')
      const filtered = data.list.filter(c => alertConfigKeys.includes(c.key))
      setConfigs(filtered)
      const vals: Record<string, string> = {}
      filtered.forEach(c => {
        vals[c.key] = typeof c.value === 'object' ? String(c.value) : String(c.value)
      })
      setEditValues(vals)
    } catch (err: any) {
      setError(err.message || '获取告警配置失败')
    } finally {
      setLoading(false)
    }
  }, [])

  // 获取未确认高危事件作为"待处理告警"
  const [pendingAlerts, setPendingAlerts] = useState(0)
  const [testSending, setTestSending] = useState(false)
  const [testResult, setTestResult] = useState<string | null>(null)
  const fetchPendingAlerts = useCallback(async () => {
    try {
      const data = await get<any>('/api/v1/admin/security/events', {
        acknowledged: false,
        riskLevel: 'high',
        pageSize: 1,
      })
      setPendingAlerts(data.total)
    } catch { /* ignore */ }
  }, [])

  const handleSendTestAlert = async () => {
    setTestSending(true)
    setTestResult(null)
    try {
      const data = await post<{ ok: boolean; message?: string }>('/api/v1/admin/security/test-alert')
      setTestResult(data.message || '测试告警已发送')
    } catch (err: any) {
      setTestResult(err.message || '发送测试告警失败')
    } finally {
      setTestSending(false)
    }
  }

  useEffect(() => {
    fetchConfigs()
    fetchPendingAlerts()
  }, [fetchConfigs, fetchPendingAlerts])

  const handleSave = async (key: string) => {
    setSaving(key)
    try {
      let val: any = editValues[key]
      if (val === 'true') val = true
      else if (val === 'false') val = false
      try {
        // 尝试 JSON.parse 处理数字
        const parsed = JSON.parse(val)
        if (typeof parsed !== 'string') val = parsed
      } catch { /* keep string */ }
      await patch(`/api/v1/admin/security/config/${key}`, { value: val })
      await fetchConfigs()
    } catch (err: any) {
      setError(err.message || '保存失败')
    } finally {
      setSaving(null)
    }
  }

  const handleChange = (key: string, value: string) => {
    setEditValues(prev => ({ ...prev, [key]: value }))
  }

  const getOriginalValue = (key: string): string => {
    const cfg = configs.find(c => c.key === key)
    if (!cfg) return ''
    const v = typeof cfg.value === 'object' ? String(cfg.value) : String(cfg.value)
    return v
  }

  const isModified = (key: string): boolean => editValues[key] !== getOriginalValue(key)

  const renderToggle = (key: string, label: string, desc: string) => {
    const val = editValues[key]
    const isOn = val === 'true'
    return (
      <div key={key} className="flex items-center justify-between px-4 py-3 hover:bg-slate-50">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-700">{label}</p>
          <p className="text-xs text-slate-400 mt-0.5">{desc}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleChange(key, isOn ? 'false' : 'true')}
            className={`relative w-10 h-5 rounded-full transition-colors ${isOn ? 'bg-blue-600' : 'bg-slate-300'}`}
          >
            <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${isOn ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </button>
          {isModified(key) && (
            <button
              onClick={() => handleSave(key)}
              disabled={saving === key}
              className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition"
            >
              {saving === key ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            </button>
          )}
        </div>
      </div>
    )
  }

  const renderInput = (key: string, label: string, desc: string, placeholder: string) => {
    return (
      <div key={key} className="flex items-center justify-between px-4 py-3 hover:bg-slate-50">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-700">{label}</p>
          <p className="text-xs text-slate-400 mt-0.5">{desc}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <input
            type="text"
            value={editValues[key] ?? ''}
            onChange={e => handleChange(key, e.target.value)}
            placeholder={placeholder}
            className={`w-56 px-2 py-1.5 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              isModified(key) ? 'border-blue-400 bg-blue-50' : 'border-slate-300'
            }`}
          />
          {isModified(key) && (
            <button
              onClick={() => handleSave(key)}
              disabled={saving === key}
              className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition"
            >
              {saving === key ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Bell size={24} /> 告警通知
        </h1>
        <FeatureDescription page="admin/security/alerts" className="ml-2" />
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">
            待处理告警: <span className={`font-semibold ${pendingAlerts > 0 ? 'text-red-600' : 'text-green-600'}`}>{pendingAlerts}</span>
          </span>
          <button onClick={fetchPendingAlerts} className="p-1.5 text-slate-400 hover:text-slate-600 rounded">
            <RefreshCw size={14} />
          </button>
          <button
            onClick={handleSendTestAlert}
            disabled={testSending}
            className="flex items-center gap-1 px-3 py-1.5 text-xs text-blue-600 border border-blue-300 rounded-lg hover:bg-blue-50 transition disabled:opacity-50"
          >
            {testSending ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
            发送测试告警
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 text-sm text-red-600 bg-red-50 rounded-lg">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {testResult && (
        <div className={`flex items-center gap-2 p-3 text-sm rounded-lg ${
          testResult.includes('失败') ? 'text-red-600 bg-red-50' : 'text-green-600 bg-green-50'
        }`}>
          <AlertCircle size={16} /> {testResult}
          <button onClick={() => setTestResult(null)} className="ml-auto text-current opacity-50 hover:opacity-100">&times;</button>
        </div>
      )}

      {/* 待处理告警概览 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <div className={`p-2 rounded-lg ${pendingAlerts > 0 ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>
              <Bell size={18} />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900">{pendingAlerts}</div>
          <div className="text-xs text-slate-500">未处理高危告警</div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 rounded-lg bg-blue-50 text-blue-600"><Mail size={18} /></div>
          </div>
          <div className="text-sm font-mono text-slate-700 truncate">{editValues['alert_admin_email'] || '未配置'}</div>
          <div className="text-xs text-slate-500">通知接收邮箱</div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 rounded-lg bg-purple-50 text-purple-600"><Globe size={18} /></div>
          </div>
          <div className="text-sm text-slate-700 truncate">{editValues['alert_webhook_url'] || '未配置'}</div>
          <div className="text-xs text-slate-500">Webhook 地址</div>
        </div>
      </div>

      {/* 通知开关 */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
          <h2 className="font-semibold text-slate-700 flex items-center gap-1">
            <Bell size={16} /> 通知规则
          </h2>
        </div>
        <div className="divide-y divide-slate-100">
          {loading ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="animate-spin" size={20} /></div>
          ) : (
            <>
              {renderToggle('alert_high_risk_enabled', '高危事件即时通知', '暴力破解、账号封禁、厂商熔断等高危事件触发时立即发送通知')}
              {renderToggle('alert_medium_risk_enabled', '中危事件即时通知', '验证码挑战、新设备登录等中危事件触发时发送通知')}
              {renderToggle('alert_low_risk_enabled', '低危事件即时通知', '熔断恢复等低危事件触发时发送通知')}
              {renderToggle('alert_daily_summary_enabled', '每日安全摘要', '每天 09:00 发送过去 24h 安全事件汇总邮件')}
            </>
          )}
        </div>
      </div>

      {/* 通知配置 */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
          <h2 className="font-semibold text-slate-700 flex items-center gap-1">
            <Mail size={16} /> 通知渠道配置
          </h2>
        </div>
        <div className="divide-y divide-slate-100">
          {loading ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="animate-spin" size={20} /></div>
          ) : (
            <>
              {renderInput('alert_admin_email', '接收邮箱', '高危安全事件将发送到此邮箱', 'admin@example.com')}
              {renderInput('alert_webhook_url', 'Webhook URL（预留）', '高危事件 POST JSON 到该地址', 'https://hooks.example.com/alert')}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
