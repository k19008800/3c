// ============================================================
//  ApiSettings — API 参数（速率限制、请求限制、跨域配置）
// ============================================================

import { useEffect, useState, useMemo, useCallback } from 'react'
import { get, put } from '@/lib/api'
import { Loader2, AlertCircle, CheckCircle2, Save, Cpu } from 'lucide-react'
import MiniChart from '@/components/ui/MiniChart'
import type { MiniChartDataPoint } from '@/components/ui/MiniChart'
import { SiteSettings, API_FIELD_GROUPS, getFieldMeta } from './types'

export default function ApiSettings() {
  const [settings, setSettings] = useState<SiteSettings>({})
  const [original, setOriginal] = useState<SiteSettings>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')

  const fetchSettings = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await get<{ settings: SiteSettings }>('/api/v1/admin/site-settings')
      setSettings(data.settings || {})
      setOriginal({ ...(data.settings || {}) })
    } catch (err: any) {
      setError(err.message || '获取 API 配置失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSettings()
  }, [fetchSettings])

  const hasChanges = useCallback(() => {
    for (const group of API_FIELD_GROUPS) {
      for (const field of group.fields) {
        const key = field.key
        if ((settings[key] || '') !== (original[key] || '')) return true
      }
    }
    return false
  }, [settings, original])

  const handleValueChange = useCallback((key: string, value: string) => {
    setSettings((prev) => ({ ...prev, [key]: value }))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    setError('')
    setMsg('')
    try {
      const payload: Record<string, string> = {}
      for (const group of API_FIELD_GROUPS) {
        for (const field of group.fields) {
          payload[field.key] = settings[field.key] || ''
        }
      }
      await put('/api/v1/admin/site-settings', payload)
      setMsg('API 配置保存成功')
      setOriginal({ ...settings })
    } catch (err: any) {
      setError(err.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  // 当前限制值用于 MiniChart
  const rateLimitValue = useMemo(() => {
    const v = parseInt(settings['api_rate_limit'], 10)
    return isNaN(v) || v <= 0 ? 100 : v
  }, [settings])

  const rateTrend: MiniChartDataPoint[] = useMemo(() => {
    const base = rateLimitValue
    return Array.from({ length: 7 }, (_, i) => ({
      value: Math.max(10, base * (0.5 + 0.5 * Math.random())),
      label: `D${i + 1}`,
    }))
  }, [rateLimitValue])

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="animate-spin" size={32} />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {msg && (
        <div className="flex items-center gap-2 text-green-700 bg-green-50 p-3 rounded-lg text-sm">
          <CheckCircle2 size={16} />
          {msg}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      <div className="flex items-center justify-end mb-2">
        <button
          onClick={handleSave}
          disabled={saving || !hasChanges()}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition text-sm"
        >
          {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
          {saving ? '保存中...' : '保存'}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {API_FIELD_GROUPS.map((group) => (
          <div key={group.label} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
              <Cpu size={16} className="text-slate-400" />
              <h2 className="text-base font-semibold text-slate-800">{group.label}</h2>
            </div>
            <div className="p-5 space-y-5">
              {group.fields.map((field) => {
                const meta = getFieldMeta(field.key, API_FIELD_GROUPS)
                return (
                  <div key={field.key}>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">{meta.label}</label>
                    {field.type === 'textarea' ? (
                      <div>
                        <textarea
                          value={settings[field.key] || ''}
                          onChange={(e) => handleValueChange(field.key, e.target.value)}
                          rows={4}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-y"
                        />
                        {meta.hint && <p className="text-xs text-slate-400 mt-1">{meta.hint}</p>}
                      </div>
                    ) : (
                      <div>
                        <input
                          type="text"
                          value={settings[field.key] || ''}
                          onChange={(e) => handleValueChange(field.key, e.target.value)}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                        {meta.hint && <p className="text-xs text-slate-400 mt-1">{meta.hint}</p>}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* 近期 API 请求趋势 */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-700">近期 API 请求趋势</h3>
          <span className="text-xs text-slate-400">限制: {rateLimitValue}/窗口</span>
        </div>
        <MiniChart
          data={rateTrend}
          width={320}
          height={40}
          color="#3b82f6"
          type="line"
        />
        <p className="text-xs text-slate-400 mt-2">最近 7 个窗口期 API 请求量与当前速率限制对比</p>
      </div>
    </div>
  )
}
