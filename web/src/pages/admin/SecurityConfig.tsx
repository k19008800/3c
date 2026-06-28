import { useEffect, useState, useCallback } from 'react'
import { get, patch } from '@/lib/api'
import type { SecurityConfig } from '@/types'
import { Loader2, AlertCircle, Save, Settings } from 'lucide-react'

export default function AdminSecurityConfig() {
  const [configs, setConfigs] = useState<SecurityConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState<string | null>(null)
  const [editValues, setEditValues] = useState<Record<string, string>>({})

  const fetchConfigs = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await get<{ list: SecurityConfig[] }>('/api/v1/admin/security/config')
      setConfigs(data.list)
      const vals: Record<string, string> = {}
      data.list.forEach((c: SecurityConfig) => {
        vals[c.key] = typeof c.value === 'object' ? JSON.stringify(c.value) : String(c.value)
      })
      setEditValues(vals)
    } catch (err: any) {
      setError(err.message || '获取安全配置失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchConfigs() }, [fetchConfigs])

  const handleSave = async (key: string) => {
    setSaving(key)
    try {
      let val: any = editValues[key]
      // 尝试解析 JSON
      try { val = JSON.parse(val) } catch { /* 保持字符串 */ }
      await patch(`/api/v1/admin/security/config/${key}`, { value: val })
      await fetchConfigs()
    } catch (err: any) {
      setError(err.message || '保存失败')
    } finally {
      setSaving(null)
    }
  }

  const handleChange = (key: string, value: string) => {
    setEditValues((prev) => ({ ...prev, [key]: value }))
  }

  const getOriginalValue = (key: string): string => {
    const cfg = configs.find((c) => c.key === key)
    if (!cfg) return ''
    return typeof cfg.value === 'object' ? JSON.stringify(cfg.value) : String(cfg.value)
  }

  const isModified = (key: string): boolean => {
    return editValues[key] !== getOriginalValue(key)
  }

  const configGroups = [
    { title: 'IP 级风控', keys: ['max_ip_fail_per_min', 'ip_ban_minutes'] },
    { title: '账号级风控', keys: ['max_user_fail_per_min', 'user_captcha_after', 'user_ban_minutes', 'max_user_fail_24h'] },
    { title: '异地登录检测', keys: ['geo_check_enabled', 'geo_physical_impossible_kmh', 'high_risk_countries'] },
    { title: '厂商熔断', keys: ['circuit_breaker_trip', 'circuit_breaker_open_ms', 'circuit_breaker_halfopen_ms'] },
    { title: '会话管理', keys: ['max_concurrent_sessions_default', 'session_expire_hours'] },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Settings size={24} /> 安全配置
        </h1>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 text-sm text-red-600 bg-red-50 rounded-lg">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="animate-spin" size={24} />
        </div>
      ) : (
        configGroups.map((group) => (
          <div key={group.title} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
              <h2 className="font-semibold text-slate-800">{group.title}</h2>
            </div>
            <div className="divide-y divide-slate-100">
              {group.keys.map((key) => {
                const cfg = configs.find((c) => c.key === key)
                if (!cfg) return null
                return (
                  <div key={key} className="px-4 py-3 flex items-start gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <code className="text-xs font-mono text-slate-500">{key}</code>
                      </div>
                      <p className="text-sm text-slate-600 mt-0.5">{cfg.description}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <input
                        type="text"
                        value={editValues[key] ?? ''}
                        onChange={(e) => handleChange(key, e.target.value)}
                        className={`w-28 px-2 py-1.5 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                          isModified(key) ? 'border-blue-400 bg-blue-50' : 'border-slate-300'
                        }`}
                      />
                      {isModified(key) && (
                        <button
                          onClick={() => handleSave(key)}
                          disabled={saving === key}
                          className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 transition"
                        >
                          {saving === key ? <Loader2 className="animate-spin" size={12} /> : <Save size={12} />}
                          保存
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))
      )}
    </div>
  )
}
