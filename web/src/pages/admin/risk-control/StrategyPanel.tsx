import { useEffect, useState, useCallback } from 'react'
import { get, put } from '@/lib/api'
import { Loader2, AlertCircle, Save, ToggleLeft, ToggleRight } from 'lucide-react'

interface RiskStrategy {
  key: string
  name: string
  enabled: boolean
  weight: number
  threshold: number
  description: string
}

export default function StrategyPanel() {
  const [strategies, setStrategies] = useState<RiskStrategy[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const fetchStrategies = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await get<{ list: RiskStrategy[] }>('/api/v1/admin/risk-control/strategies')
      setStrategies(res.list)
    } catch (err: any) {
      setError(err.message || '获取策略配置失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchStrategies() }, [fetchStrategies])

  const updateStrategy = (key: string, field: 'enabled' | 'weight' | 'threshold', value: boolean | number) => {
    setStrategies(prev => prev.map(s =>
      s.key === key ? { ...s, [field]: value } : s
    ))
  }

  const handleSave = async () => {
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      await put('/api/v1/admin/risk-control/strategies', { strategies })
      setSuccess('风控策略已更新')
      setTimeout(() => setSuccess(''), 3000)
    } catch (err: any) {
      setError(err.message || '保存失败')
    } finally {
      setSaving(false)
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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">风控策略配置</h2>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1.5 px-4 py-2 text-sm bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50"
        >
          <Save size={16} />
          {saving ? '保存中...' : '保存配置'}
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 text-sm text-red-600 bg-red-50 rounded-lg">
          <AlertCircle size={16} /> {error}
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 p-3 text-sm text-green-600 bg-green-50 rounded-lg">
          <Save size={16} /> {success}
        </div>
      )}

      <div className="space-y-3">
        {strategies.map(strategy => (
          <div key={strategy.key} className="bg-white border rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium">{strategy.name}</h3>
                <p className="text-sm text-gray-500 mt-0.5">{strategy.description}</p>
              </div>
              <button
                onClick={() => updateStrategy(strategy.key, 'enabled', !strategy.enabled)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                  strategy.enabled
                    ? 'bg-green-100 text-green-700 hover:bg-green-200'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
              >
                {strategy.enabled ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                {strategy.enabled ? '已启用' : '已禁用'}
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">权重（0-100）</label>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={strategy.weight}
                    onChange={e => updateStrategy(strategy.key, 'weight', parseInt(e.target.value))}
                    className="flex-1"
                    disabled={!strategy.enabled}
                  />
                  <span className="text-sm font-mono w-8 text-right">{strategy.weight}</span>
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">触发阈值</label>
                <input
                  type="number"
                  min={1}
                  max={1000}
                  value={strategy.threshold}
                  onChange={e => updateStrategy(strategy.key, 'threshold', parseInt(e.target.value) || 1)}
                  className="w-24 px-2 py-1 border rounded text-sm"
                  disabled={!strategy.enabled}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
