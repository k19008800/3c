import { useEffect, useState } from 'react'
import { get, put } from '@/lib/api'
import {
  Loader2, BellRing, Save, CheckCircle2, AlertCircle,
} from 'lucide-react'

interface NotificationPreferences {
  rechargeSuccess: boolean
  lowBalanceAlert: boolean
  lowBalanceThreshold: number
  dailyUsageSummary: boolean
}

const DEFAULT_PREFS: NotificationPreferences = {
  rechargeSuccess: true,
  lowBalanceAlert: true,
  lowBalanceThreshold: 10,
  dailyUsageSummary: true,
}

export default function PreferenceSettings() {
  const [prefs, setPrefs] = useState<NotificationPreferences>(DEFAULT_PREFS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [msgType, setMsgType] = useState<'success' | 'error'>('success')
  const [dirty, setDirty] = useState(false)

  // Fetch current preferences
  useEffect(() => {
    setLoading(true)
    get<NotificationPreferences>('/api/v1/preferences/notifications')
      .then((data) => {
        if (data && typeof data === 'object') {
          setPrefs({
            rechargeSuccess: data.rechargeSuccess ?? DEFAULT_PREFS.rechargeSuccess,
            lowBalanceAlert: data.lowBalanceAlert ?? DEFAULT_PREFS.lowBalanceAlert,
            lowBalanceThreshold: data.lowBalanceThreshold ?? DEFAULT_PREFS.lowBalanceThreshold,
            dailyUsageSummary: data.dailyUsageSummary ?? DEFAULT_PREFS.dailyUsageSummary,
          })
        }
      })
      .catch(() => {
        // Use defaults if endpoint not yet available
      })
      .finally(() => setLoading(false))
  }, [])

  const updatePref = <K extends keyof NotificationPreferences>(key: K, value: NotificationPreferences[K]) => {
    setPrefs((p) => ({ ...p, [key]: value }))
    setDirty(true)
  }

  const handleSave = async () => {
    setSaving(true)
    setMsg('')
    try {
      await put('/api/v1/preferences/notifications', prefs)
      setMsg('通知偏好保存成功')
      setMsgType('success')
      setDirty(false)
    } catch (err: any) {
      setMsg(err.message || '保存失败')
      setMsgType('error')
    } finally {
      setSaving(false)
      setTimeout(() => setMsg(''), 3000)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin" size={32} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-6">
        <h2 className="font-semibold text-slate-800 flex items-center gap-2">
          <BellRing size={18} /> 通知偏好
        </h2>

        {msg && (
          <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${
            msgType === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'
          }`}>
            {msgType === 'success' ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
            {msg}
          </div>
        )}

        <div className="space-y-5">
          {/* Recharge Success */}
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-sm font-medium text-slate-800">充值成功通知</p>
              <p className="text-xs text-slate-400 mt-0.5">充值到账时发送通知</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={prefs.rechargeSuccess}
                onChange={(e) => updatePref('rechargeSuccess', e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600" />
            </label>
          </div>

          {/* Low Balance Alert */}
          <div className="py-2 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-800">余额不足提醒</p>
                <p className="text-xs text-slate-400 mt-0.5">余额低于阈值时发送提醒</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={prefs.lowBalanceAlert}
                  onChange={(e) => updatePref('lowBalanceAlert', e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600" />
              </label>
            </div>
            {prefs.lowBalanceAlert && (
              <div className="flex items-center gap-3 ml-0 pl-0">
                <span className="text-sm text-slate-500">阈值：</span>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">¥</span>
                  <input
                    type="number"
                    value={prefs.lowBalanceThreshold}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value)
                      if (!isNaN(v) && v >= 0) updatePref('lowBalanceThreshold', v)
                    }}
                    min={0}
                    step={0.01}
                    className="w-28 pl-7 pr-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <span className="text-xs text-slate-400">余额低于此金额时提醒</span>
              </div>
            )}
          </div>

          {/* Daily Usage Summary */}
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-sm font-medium text-slate-800">每日用量汇总</p>
              <p className="text-xs text-slate-400 mt-0.5">每天发送当日用量统计</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={prefs.dailyUsageSummary}
                onChange={(e) => updatePref('dailyUsageSummary', e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600" />
            </label>
          </div>
        </div>

        <div className="pt-2 border-t border-slate-100">
          <button
            onClick={handleSave}
            disabled={saving || !dirty}
            className="flex items-center justify-center gap-1.5 px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium transition"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            保存偏好
          </button>
        </div>
      </div>
    </div>
  )
}