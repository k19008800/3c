import { useEffect, useState, useCallback } from 'react'
import { get, patch } from '@/lib/api'
import type { SecurityConfig } from '@/types'
import { Loader2, AlertCircle, Save, Settings, RotateCcw, History, Clock, ArrowRight } from 'lucide-react'
import FeatureDescription from '@/components/admin/FeatureDescription'
import PaginationBar from '@/components/ui/PaginationBar'

// ── 默认值映射（与 seed.ts 一致） ──
const DEFAULT_VALUES: Record<string, any> = {
  max_ip_fail_per_min: 5,
  ip_ban_minutes: 5,
  max_user_fail_per_min: 5,
  user_captcha_after: 3,
  user_ban_minutes: 15,
  max_user_fail_24h: 10,
  geo_check_enabled: true,
  geo_physical_impossible_kmh: 1000,
  high_risk_countries: ['US', 'RU', 'KP', 'IR'],
  circuit_breaker_trip: 3,
  circuit_breaker_open_ms: 30000,
  circuit_breaker_halfopen_ms: 120000,
  max_concurrent_sessions_default: 5,
  session_expire_hours: 168,
}

const configGroups = [
  { title: 'IP 级风控', keys: ['max_ip_fail_per_min', 'ip_ban_minutes'] },
  { title: '账号级风控', keys: ['max_user_fail_per_min', 'user_captcha_after', 'user_ban_minutes', 'max_user_fail_24h'] },
  { title: '异地登录检测', keys: ['geo_check_enabled', 'geo_physical_impossible_kmh', 'high_risk_countries'] },
  { title: '厂商熔断', keys: ['circuit_breaker_trip', 'circuit_breaker_open_ms', 'circuit_breaker_halfopen_ms'] },
  { title: '会话管理', keys: ['max_concurrent_sessions_default', 'session_expire_hours'] },
]

export default function AdminSecurityConfig() {
  const [tab, setTab] = useState<'config' | 'history'>('config')
  const [configs, setConfigs] = useState<SecurityConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState<string | null>(null)
  const [editValues, setEditValues] = useState<Record<string, string>>({})

  // 变更历史
  const [history, setHistory] = useState<any[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyPage, setHistoryPage] = useState(1)
  const [historyPageSize, setHistoryPageSize] = useState(20)
  const [historyTotal, setHistoryTotal] = useState(0)

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

  const fetchHistory = useCallback(async (page: number) => {
    setHistoryLoading(true)
    try {
      const data = await get<{ list: any[]; total: number }>('/api/v1/admin/security/config/history', { page, pageSize: 20 })
      setHistory(data.list)
      setHistoryTotal(data.total)
    } catch {
      // ignore
    } finally {
      setHistoryLoading(false)
    }
  }, [])

  useEffect(() => { fetchConfigs() }, [fetchConfigs])

  useEffect(() => {
    if (tab === 'history') fetchHistory(historyPage)
  }, [tab, historyPage, fetchHistory])

  const handleSave = async (key: string) => {
    setSaving(key)
    try {
      let val: any = editValues[key]
      try { val = JSON.parse(val) } catch { /* 保持字符串 */ }
      await patch(`/api/v1/admin/security/config/${key}`, { value: val })
      await fetchConfigs()
    } catch (err: any) {
      setError(err.message || '保存失败')
    } finally {
      setSaving(null)
    }
  }

  const handleReset = async (key: string) => {
    const defaultVal = DEFAULT_VALUES[key]
    if (defaultVal === undefined) {
      setError(`配置 ${key} 无默认值`)
      return
    }
    setSaving(key)
    try {
      await patch(`/api/v1/admin/security/config/${key}`, { value: defaultVal })
      await fetchConfigs()
    } catch (err: any) {
      setError(err.message || '重置失败')
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
    const v = typeof cfg.value === 'object' ? JSON.stringify(cfg.value) : String(cfg.value)
    return v
  }

  const isModified = (key: string): boolean => {
    return editValues[key] !== getOriginalValue(key)
  }

  const isDefault = (key: string): boolean => {
    const cfg = configs.find((c) => c.key === key)
    if (!cfg) return true
    const defaultVal = DEFAULT_VALUES[key]
    if (defaultVal === undefined) return true
    return String(cfg.value) === String(defaultVal)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Settings size={24} /> 安全配置
        </h1>
        <FeatureDescription page="admin/security/config" className="ml-2" />
        <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5">
          <button
            onClick={() => setTab('config')}
            className={`px-3 py-1.5 text-xs rounded-md transition ${tab === 'config' ? 'bg-white shadow-sm text-slate-800 font-medium' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <Settings size={14} className="inline mr-1" />策略配置
          </button>
          <button
            onClick={() => setTab('history')}
            className={`px-3 py-1.5 text-xs rounded-md transition ${tab === 'history' ? 'bg-white shadow-sm text-slate-800 font-medium' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <History size={14} className="inline mr-1" />变更历史
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 text-sm text-red-600 bg-red-50 rounded-lg">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {tab === 'config' && (
        loading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="animate-spin" size={24} /></div>
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
                          {isDefault(key) && (
                            <span className="text-[10px] text-green-600 bg-green-50 px-1.5 py-0.5 rounded">默认</span>
                          )}
                        </div>
                        <p className="text-sm text-slate-600 mt-0.5">{cfg.description}</p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <input
                          type="text"
                          value={editValues[key] ?? ''}
                          onChange={(e) => handleChange(key, e.target.value)}
                          className={`w-28 px-2 py-1.5 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                            isModified(key) ? 'border-blue-400 bg-blue-50' : 'border-slate-300'
                          }`}
                        />
                        {!isDefault(key) && !isModified(key) && (
                          <button
                            onClick={() => handleReset(key)}
                            disabled={saving === key}
                            title="恢复默认"
                            className="p-1.5 text-slate-400 hover:text-orange-600 hover:bg-orange-50 rounded transition"
                          >
                            {saving === key ? <Loader2 className="animate-spin" size={12} /> : <RotateCcw size={14} />}
                          </button>
                        )}
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
        )
      )}

      {tab === 'history' && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
            <h2 className="font-semibold text-slate-700 flex items-center gap-1">
              <History size={16} /> 安全配置变更记录
            </h2>
          </div>
          {historyLoading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="animate-spin" size={24} /></div>
          ) : history.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-slate-400">
              <History size={32} className="mb-2" />
              <p className="text-sm">暂无变更记录</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {history.map((h: any) => {
                const beforeVal = h.before?.value
                const afterVal = h.after?.value
                return (
                  <div key={h.id} className="px-4 py-3 hover:bg-slate-50">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-700">{h.description || '安全配置变更'}</p>
                        {beforeVal && afterVal && (
                          <div className="flex items-center gap-2 mt-1 text-xs">
                            <code className="text-red-500 bg-red-50 px-1.5 py-0.5 rounded font-mono">{beforeVal.slice(0, 80)}{beforeVal.length > 80 ? '...' : ''}</code>
                            <ArrowRight size={10} className="text-slate-400" />
                            <code className="text-green-600 bg-green-50 px-1.5 py-0.5 rounded font-mono">{afterVal.slice(0, 80)}{afterVal.length > 80 ? '...' : ''}</code>
                          </div>
                        )}
                      </div>
                      <div className="shrink-0 text-right ml-4">
                        <div className="text-xs text-slate-400 flex items-center gap-1">
                          <Clock size={10} />{new Date(h.createdAt).toLocaleString('zh-CN')}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">管理员 #{h.operatorId}{h.ip ? ` · ${h.ip}` : ''}</div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          {historyTotal > 0 && (
            <PaginationBar
              page={historyPage}
              onPageChange={setHistoryPage}
              pageSize={historyPageSize}
              onPageSizeChange={setHistoryPageSize}
              total={historyTotal}
              totalPages={Math.ceil(historyTotal / historyPageSize)}
            />
          )}
        </div>
      )}
    </div>
  )
}
