import { useState, useEffect, useCallback } from 'react'
import { get, post } from '@/lib/api'
import {
  Loader2, RefreshCw, Save, AlertTriangle, Bell, CheckCircle2, XCircle,
  Settings2, TrendingUp, TrendingDown,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'

// ── Types ──

interface AlertRule {
  id: string
  type: string
  name: string
  description: string | null
  threshold: number
  severity: string
  enabled: boolean
  duration: number | null
  silencePeriod: number | null
  createdAt: string
  updatedAt: string
}

const RULE_TYPES: Record<string, { label: string; unit: string; icon: string }> = {
  api_error_rate: { label: 'API 失败率', unit: '%', icon: 'alert' },
  vendor_availability: { label: '供应商可用率', unit: '%', icon: 'alert' },
  api_response_time: { label: '响应时间 P95', unit: 'ms', icon: 'trend' },
  platform_balance: { label: '平台余额', unit: '¥', icon: 'balance' },
  user_failure_rate: { label: '用户失败率', unit: '%', icon: 'alert' },
  disk_usage: { label: '磁盘使用率', unit: '%', icon: 'disk' },
  cpu_usage: { label: 'CPU 使用率', unit: '%', icon: 'cpu' },
}

const DEFAULT_THRESHOLDS: Record<string, number> = {
  api_error_rate: 5,
  vendor_availability: 95,
  api_response_time: 2000,
  platform_balance: 100,
  user_failure_rate: 20,
  disk_usage: 85,
  cpu_usage: 80,
}

const SEVERITY_OPTIONS = [
  { value: 'critical', label: '🔴 紧急', color: 'red' },
  { value: 'high', label: '🟠 告警', color: 'orange' },
  { value: 'medium', label: '🟡 提醒', color: 'amber' },
  { value: 'low', label: '🔵 通知', color: 'blue' },
]

const severityColors: Record<string, string> = {
  critical: 'bg-red-100 text-red-700 border-red-200',
  high: 'bg-orange-100 text-orange-700 border-orange-200',
  medium: 'bg-amber-100 text-amber-700 border-amber-200',
  low: 'bg-blue-100 text-blue-700 border-blue-200',
  warning: 'bg-amber-100 text-amber-700 border-amber-200',
  info: 'bg-blue-100 text-blue-700 border-blue-200',
}

// 模拟命中趋势数据
const mockTrendData = [
  { name: '周一', api_error_rate: 3, vendor_availability: 1, api_response_time: 5, platform_balance: 0, user_failure_rate: 2, disk_usage: 4, cpu_usage: 6 },
  { name: '周二', api_error_rate: 4, vendor_availability: 2, api_response_time: 3, platform_balance: 0, user_failure_rate: 1, disk_usage: 3, cpu_usage: 5 },
  { name: '周三', api_error_rate: 7, vendor_availability: 3, api_response_time: 6, platform_balance: 1, user_failure_rate: 4, disk_usage: 5, cpu_usage: 8 },
  { name: '周四', api_error_rate: 5, vendor_availability: 1, api_response_time: 4, platform_balance: 0, user_failure_rate: 3, disk_usage: 4, cpu_usage: 4 },
  { name: '周五', api_error_rate: 6, vendor_availability: 4, api_response_time: 8, platform_balance: 0, user_failure_rate: 5, disk_usage: 6, cpu_usage: 7 },
  { name: '周六', api_error_rate: 2, vendor_availability: 0, api_response_time: 2, platform_balance: 0, user_failure_rate: 1, disk_usage: 2, cpu_usage: 3 },
  { name: '周日', api_error_rate: 3, vendor_availability: 1, api_response_time: 3, platform_balance: 0, user_failure_rate: 2, disk_usage: 3, cpu_usage: 5 },
]

export default function AlertRules() {
  const [rules, setRules] = useState<AlertRule[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<Record<string, { threshold: number; severity: string; enabled: boolean }>>({})
  const [message, setMessage] = useState({ type: '', text: '' })
  const [activeTrendType, setActiveTrendType] = useState('api_error_rate')

  // ── Fetch rules ──

  const fetchRules = useCallback(async () => {
    setLoading(true)
    try {
      const res = await get<AlertRule[]>('/api/v1/admin/monitoring/rules')
      const list = Array.isArray(res) ? res : (res as any).data ?? []
      setRules(list)

      // 初始化编辑表单
      const form: Record<string, { threshold: number; severity: string; enabled: boolean }> = {}
      for (const t of Object.keys(RULE_TYPES)) {
        const existing = list.find((r: AlertRule) => r.type === t)
        form[t] = {
          threshold: existing?.threshold ?? DEFAULT_THRESHOLDS[t] ?? 0,
          severity: existing?.severity ?? 'warning',
          enabled: existing?.enabled ?? false,
        }
      }
      setEditForm(form)
    } catch (err: any) {
      setMessage({ type: 'error', text: `加载失败: ${err.message}` })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchRules() }, [fetchRules])

  // ── Save rule ──

  const handleSave = useCallback(async (type: string) => {
    const form = editForm[type]
    if (!form) return

    setSaving(true)
    try {
      await post('/api/v1/admin/monitoring/rules', {
        type,
        threshold: form.threshold,
        severity: form.severity,
        enabled: form.enabled,
      })
      setMessage({ type: 'success', text: `${RULE_TYPES[type]?.label ?? type} 规则已保存` })
      setEditingId(null)
      fetchRules()
    } catch (err: any) {
      setMessage({ type: 'error', text: `保存失败: ${err.message}` })
    } finally {
      setSaving(false)
    }
  }, [editForm, fetchRules])

  const handleSaveAll = useCallback(async () => {
    setSaving(true)
    try {
      const types = Object.keys(RULE_TYPES)
      for (const type of types) {
        const form = editForm[type]
        if (form) {
          await post('/api/v1/admin/monitoring/rules', {
            type,
            threshold: form.threshold,
            severity: form.severity,
            enabled: form.enabled,
          })
        }
      }
      setMessage({ type: 'success', text: '全部规则已保存' })
      setEditingId(null)
      fetchRules()
    } catch (err: any) {
      setMessage({ type: 'error', text: `全部保存失败: ${err.message}` })
    } finally {
      setSaving(false)
    }
  }, [editForm, fetchRules])

  const updateForm = useCallback((type: string, field: string, value: any) => {
    setEditForm(prev => ({
      ...prev,
      [type]: { ...prev[type], [field]: value },
    }))
  }, [])

  // ── Render ──

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    )
  }

  const trendColors = ['#3b82f6', '#ef4444', '#f59e0b', '#10b981', '#8b5cf6', '#ec4899', '#06b6d4']
  const trendTypes = Object.keys(RULE_TYPES)
  const trendColorMap: Record<string, string> = {}
  trendTypes.forEach((t, i) => { trendColorMap[t] = trendColors[i % trendColors.length] })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">告警规则配置</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchRules}
            className="px-3 py-2 text-sm border border-slate-300 rounded-lg hover:bg-slate-50 flex items-center gap-1"
          >
            <RefreshCw className="w-4 h-4" /> 刷新
          </button>
          <button
            onClick={handleSaveAll}
            disabled={saving}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            全部保存
          </button>
        </div>
      </div>

      {/* Message */}
      {message.text && (
        <div className={`px-4 py-3 rounded-lg text-sm flex items-center gap-2 ${
          message.type === 'error'
            ? 'bg-red-50 text-red-700 border border-red-200'
            : 'bg-green-50 text-green-700 border border-green-200'
        }`}>
          {message.type === 'error' ? <XCircle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
          {message.text}
          <button onClick={() => setMessage({ type: '', text: '' })} className="ml-auto text-slate-400 hover:text-slate-600">
            <XCircle className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Rules Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-100">
          <p className="text-sm text-slate-600">
            配置系统监控告警规则，当指标超过阈值时自动触发告警通知。配置保存在 <code className="text-blue-600 bg-blue-50 px-1 rounded">monitoring_rules</code> 表中。
          </p>
        </div>

        <table className="w-full">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">指标</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">阈值</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">严重等级</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-slate-500 uppercase">状态</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-slate-500 uppercase">操作</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(RULE_TYPES).map(([type, meta]) => {
              const form = editForm[type]
              if (!form) return null

              const existing = rules.find(r => r.type === type)
              const isEditing = editingId === type

              return (
                <tr key={type} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-slate-400" />
                      <div>
                        <div className="text-sm font-medium text-slate-900">{meta.label}</div>
                        <div className="text-xs text-slate-400">
                          {existing ? `默认: ${meta.unit === '¥' ? '¥' : ''}${DEFAULT_THRESHOLDS[type]}${meta.unit === '¥' ? '' : meta.unit}` : '未配置'}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {isEditing ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          value={form.threshold}
                          onChange={e => updateForm(type, 'threshold', Number(e.target.value))}
                          className="w-20 px-2 py-1.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                        <span className="text-xs text-slate-400">
                          {meta.unit === '¥' ? '元' : meta.unit === 'ms' ? '毫秒' : meta.unit}
                        </span>
                      </div>
                    ) : (
                      <span className="text-sm text-slate-700">
                        {meta.unit === '¥' ? '¥' : ''}{form.threshold}{meta.unit === '¥' ? '' : meta.unit}
                        {meta.unit === 'ms' && ' 毫秒'}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {isEditing ? (
                      <select
                        value={form.severity}
                        onChange={e => updateForm(type, 'severity', e.target.value)}
                        className="px-2 py-1.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      >
                        {SEVERITY_OPTIONS.map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    ) : (
                      <span className={`px-2 py-1 text-xs font-medium rounded-full border ${severityColors[form.severity] ?? 'bg-slate-100 text-slate-600'}`}>
                        {SEVERITY_OPTIONS.find(o => o.value === form.severity)?.label ?? form.severity}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {isEditing ? (
                      <button
                        onClick={() => updateForm(type, 'enabled', !form.enabled)}
                        className={`w-10 h-5 rounded-full relative transition-colors ${
                          form.enabled ? 'bg-green-500' : 'bg-slate-300'
                        }`}
                      >
                        <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${
                          form.enabled ? 'left-5' : 'left-0.5'
                        }`} />
                      </button>
                    ) : (
                      form.enabled
                        ? <span className="inline-flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-1 rounded-full">
                            <CheckCircle2 className="w-3 h-3" /> 启用
                          </span>
                        : <span className="inline-flex items-center gap-1 text-xs text-slate-400 bg-slate-100 px-2 py-1 rounded-full">
                            <XCircle className="w-3 h-3" /> 禁用
                          </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {isEditing ? (
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => handleSave(type)}
                          disabled={saving}
                          className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                        >
                          {saving ? '保存中...' : '保存'}
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg hover:bg-slate-50"
                        >
                          取消
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setEditingId(type)}
                        className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg hover:bg-slate-50"
                      >
                        编辑
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Trend Chart */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-slate-500" />
            近 7 天告警命中趋势
          </h3>
          <div className="flex items-center gap-1">
            {trendTypes.map(t => (
              <button
                key={t}
                onClick={() => setActiveTrendType(t)}
                className={`px-2 py-1 text-xs rounded-md transition-colors ${
                  activeTrendType === t
                    ? 'bg-blue-100 text-blue-700 font-medium'
                    : 'text-slate-500 hover:bg-slate-100'
                }`}
              >
                {RULE_TYPES[t]?.label}
              </button>
            ))}
          </div>
        </div>

        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={mockTrendData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="name" fontSize={12} tickLine={false} axisLine={false} />
            <YAxis fontSize={12} tickLine={false} axisLine={false} />
            <Tooltip
              contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }}
              formatter={(value: number) => [`${value} 次`, RULE_TYPES[activeTrendType]?.label]}
            />
            <Bar
              dataKey={activeTrendType}
              fill={trendColorMap[activeTrendType] ?? '#3b82f6'}
              radius={[4, 4, 0, 0]}
              maxBarSize={40}
            />
          </BarChart>
        </ResponsiveContainer>

        <div className="flex flex-wrap gap-3 mt-4 pt-3 border-t border-slate-100">
          {trendTypes.map(t => (
            <div key={t} className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: trendColorMap[t] }} />
              <span className="text-xs text-slate-500">{RULE_TYPES[t]?.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* PRD Spec Reference */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <h4 className="text-sm font-semibold text-blue-800 mb-2">PRD 5.4.2 告警规则规格参考</h4>
        <table className="w-full text-xs text-blue-700">
          <thead>
            <tr className="border-b border-blue-200">
              <th className="py-1 pr-2 text-left">告警指标</th>
              <th className="py-1 px-2 text-left">条件</th>
              <th className="py-1 px-2 text-left">等级</th>
              <th className="py-1 pl-2 text-left">频率限制</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-blue-100"><td className="py-1 pr-2">API 失败率</td><td className="py-1 px-2">&gt; 5%（最近 5 分钟）</td><td className="py-1 px-2">🔴 紧急</td><td className="py-1 pl-2">5 分钟 1 次</td></tr>
            <tr className="border-b border-blue-100"><td className="py-1 pr-2">供应商可用率</td><td className="py-1 px-2">&lt; 95%（最近 5 分钟）</td><td className="py-1 px-2">🔴 紧急</td><td className="py-1 pl-2">5 分钟 1 次</td></tr>
            <tr className="border-b border-blue-100"><td className="py-1 pr-2">响应时间 P95</td><td className="py-1 px-2">&gt; 2s（最近 5 分钟）</td><td className="py-1 px-2">🟠 告警</td><td className="py-1 pl-2">15 分钟 1 次</td></tr>
            <tr className="border-b border-blue-100"><td className="py-1 pr-2">平台余额</td><td className="py-1 px-2">&lt; ¥100</td><td className="py-1 px-2">🟠 告警</td><td className="py-1 pl-2">1 小时 1 次</td></tr>
            <tr className="border-b border-blue-100"><td className="py-1 pr-2">用户失败率</td><td className="py-1 px-2">单用户 &gt; 20%（5 分钟）</td><td className="py-1 px-2">🟡 提醒</td><td className="py-1 pl-2">15 分钟 1 次</td></tr>
            <tr className="border-b border-blue-100"><td className="py-1 pr-2">磁盘使用率</td><td className="py-1 px-2">&gt; 85%</td><td className="py-1 px-2">🟠 告警</td><td className="py-1 pl-2">30 分钟 1 次</td></tr>
            <tr><td className="py-1 pr-2">CPU 使用率</td><td className="py-1 px-2">&gt; 80%（持续 5 分钟）</td><td className="py-1 px-2">🟠 告警</td><td className="py-1 pl-2">30 分钟 1 次</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
