import { useEffect, useState } from 'react'
import { get, post } from '@/lib/api'
import { Loader2, Play, Square, History, AlertTriangle, Activity, Clock } from 'lucide-react'
import FeatureDescription from '@/components/admin/FeatureDescription'

// ── Types ──

interface Scenario {
  id: string
  label: string
  description: string
}

interface Vendor {
  id: number
  name: string
}

interface ActiveDrill {
  id: string
  vendorId: number
  vendorName: string
  scenarioId: string
  scenarioLabel: string
  duration: number
  startedAt: string
  autoStopAt: string
  status: string
  vmStatuses?: { id: number; modelName: string; circuitState: string; isDown: boolean }[]
}

interface DrillReport {
  id: string
  vendorName: string
  scenario: string
  durationSeconds: number
  vendorModelCount: number
  recoveredCount: number
  circuitBreakerTriggered: boolean
  autoFailover: boolean
  failoverLatency: number
  conclusion: string
  suggestion: string
  startedAt: string
  endedAt: string
}

const CIRCUIT_STATE_MAP: Record<string, { label: string; color: string }> = {
  closed: { label: '正常', color: 'text-green-600 bg-green-50' },
  open: { label: '熔断', color: 'text-red-600 bg-red-50' },
  half_open: { label: '半开', color: 'text-amber-600 bg-amber-50' },
}

export default function AdminDrillPage() {
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [scenarios, setScenarios] = useState<Scenario[]>([])
  const [activeDrill, setActiveDrill] = useState<ActiveDrill | null>(null)
  const [history, setHistory] = useState<DrillReport[]>([])
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  // 表单状态
  const [selVendor, setSelVendor] = useState('')
  const [selScenario, setSelScenario] = useState('')
  const [duration, setDuration] = useState(5)

  // tab
  const [tab, setTab] = useState<'active' | 'history'>('active')

  useEffect(() => {
    loadAll()
  }, [])

  async function loadAll() {
    setLoading(true)
    setError('')
    try {
      const [vRes, sRes, aRes, hRes] = await Promise.all([
        get('/api/v1/admin/vendors?pageSize=200'),
        get('/api/v1/admin/drills/scenarios'),
        get('/api/v1/admin/drills/status'),
        get('/api/v1/admin/drills/history'),
      ])
      setVendors(vRes.data?.list || vRes.data || [])
      setScenarios(sRes.data || [])
      setActiveDrill(aRes.data || null)
      setHistory(hRes.data?.list || [])
    } catch (e: any) {
      setError(e?.message || '加载数据失败')
    } finally {
      setLoading(false)
    }
  }

  async function handleStart() {
    if (!selVendor || !selScenario) {
      setMessage('请选择目标和场景')
      return
    }
    setStarting(true)
    setMessage('')
    try {
      await post('/api/v1/admin/drills/start', {
        vendorId: Number(selVendor),
        scenarioId: selScenario,
        durationMinutes: duration,
      })
      setMessage(`演练已开始（${duration} 分钟）`)
      setSelVendor('')
      setSelScenario('')
      setDuration(5)
      await loadAll()
    } catch (e: any) {
      setMessage(`启动失败: ${e?.message}`)
    } finally {
      setStarting(false)
    }
  }

  async function handleStop() {
    setStopping(true)
    setMessage('')
    try {
      await post('/api/v1/admin/drills/stop', {})
      setMessage('演练已结束')
      await loadAll()
      setTab('history')
    } catch (e: any) {
      setMessage(`结束失败: ${e?.message}`)
    } finally {
      setStopping(false)
    }
  }

  function formatDuration(seconds: number): string {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return m > 0 ? `${m}分${s}秒` : `${s}秒`
  }

  function getTimeLeft(activeDrill: ActiveDrill): string {
    const remaining = new Date(activeDrill.autoStopAt).getTime() - Date.now()
    if (remaining <= 0) return '即将到期'
    const m = Math.floor(remaining / 60000)
    const s = Math.floor((remaining % 60000) / 1000)
    return `${m}分${s}秒`
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
      <div className="flex items-center gap-2">
        <Activity className="w-6 h-6 text-orange-600" />
        <h1 className="text-2xl font-bold">供应商故障演练</h1>
        <FeatureDescription page="供应商故障演练" />
      </div>

      {error && (
        <div className="p-3 bg-red-50 text-red-700 rounded-lg border border-red-200 text-sm">{error}</div>
      )}

      {message && (
        <div className={`p-3 rounded-lg text-sm ${message.includes('失败') ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'}`}>
          {message}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-4 border-b">
        <button
          onClick={() => setTab('active')}
          className={`pb-2 px-1 text-sm font-medium border-b-2 transition ${tab === 'active' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
        >
          当前演练
        </button>
        <button
          onClick={() => setTab('history')}
          className={`pb-2 px-1 text-sm font-medium border-b-2 transition ${tab === 'history' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
        >
          历史记录
        </button>
      </div>

      {tab === 'active' && (
        <div className="space-y-6">
          {/* 进行中的演练 */}
          {activeDrill && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-amber-600" />
                  <span className="font-semibold text-amber-800">演练进行中</span>
                </div>
                <button
                  onClick={handleStop}
                  disabled={stopping}
                  className="flex items-center gap-1 px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs hover:bg-red-700 disabled:opacity-50"
                >
                  <Square className="w-3 h-3" />
                  {stopping ? '结束中...' : '结束演练'}
                </button>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="text-gray-500">供应商</span>
                  <div className="font-medium">{activeDrill.vendorName}</div>
                </div>
                <div>
                  <span className="text-gray-500">场景</span>
                  <div className="font-medium">{activeDrill.scenarioLabel}</div>
                </div>
                <div>
                  <span className="text-gray-500">剩余时间</span>
                  <div className="font-medium flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    {getTimeLeft(activeDrill)}
                  </div>
                </div>
                <div>
                  <span className="text-gray-500">持续时长</span>
                  <div className="font-medium">{activeDrill.duration} 分钟</div>
                </div>
              </div>

              {/* 熔断器状态 */}
              {activeDrill.vmStatuses && activeDrill.vmStatuses.length > 0 && (
                <div className="mt-4">
                  <div className="text-xs text-gray-500 mb-2">受影响模型熔断器状态：</div>
                  <div className="space-y-1">
                    {activeDrill.vmStatuses.map((vm) => {
                      const state = CIRCUIT_STATE_MAP[vm.circuitState] || CIRCUIT_STATE_MAP.closed
                      return (
                        <div key={vm.id} className="flex items-center gap-2 text-xs">
                          <span className="w-32 truncate">{vm.modelName}</span>
                          <span className={`px-2 py-0.5 rounded-full ${state.color} font-medium`}>
                            {state.label}
                          </span>
                          {vm.isDown && <span className="text-red-500">下线</span>}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 无演练时显示启动表单 */}
          {!activeDrill && (
            <div className="bg-white rounded-lg border shadow-sm p-6">
              <h3 className="font-semibold mb-4">启动新演练</h3>

              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-sm font-medium mb-1">选择目标供应商</label>
                  <select
                    value={selVendor}
                    onChange={e => setSelVendor(e.target.value)}
                    className="w-full max-w-md px-3 py-2 border rounded-lg text-sm"
                  >
                    <option value="">-- 请选择 --</option>
                    {vendors.map(v => (
                      <option key={v.id} value={v.id}>{v.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">选择演练场景</label>
                  <div className="space-y-2">
                    {scenarios.map(s => (
                      <label
                        key={s.id}
                        className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer text-sm ${selScenario === s.id ? 'border-blue-500 bg-blue-50' : 'hover:bg-gray-50'}`}
                      >
                        <input
                          type="radio"
                          name="scenario"
                          value={s.id}
                          checked={selScenario === s.id}
                          onChange={e => setSelScenario(e.target.value)}
                          className="accent-blue-600"
                        />
                        <div>
                          <div className="font-medium">{s.label}</div>
                          <div className="text-xs text-gray-500">{s.description}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">持续时间（分钟，1~30）</label>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={duration}
                    onChange={e => setDuration(Math.min(Math.max(Number(e.target.value) || 1, 1), 30))}
                    className="w-32 px-3 py-2 border rounded-lg text-sm"
                  />
                </div>
              </div>

              <button
                onClick={handleStart}
                disabled={starting || !selVendor || !selScenario}
                className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg text-sm hover:bg-orange-700 disabled:opacity-50"
              >
                <Play className="w-4 h-4" />
                {starting ? '启动中...' : '开始演练'}
              </button>
            </div>
          )}

          {/* 刷新 */}
          <div className="flex justify-end">
            <button onClick={loadAll} className="px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-50">
              刷新状态
            </button>
          </div>
        </div>
      )}

      {/* 历史记录 */}
      {tab === 'history' && (
        <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">供应商</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">场景</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">持续时长</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">熔断器触发</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">切换延迟</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">时间</th>
              </tr>
            </thead>
            <tbody>
              {history.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-400 text-sm">暂无演练历史</td>
                </tr>
              ) : history.map(r => (
                <tr key={r.id} className="border-b hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium">{r.vendorName}</td>
                  <td className="px-4 py-3 text-sm">{r.scenario}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{formatDuration(r.durationSeconds)}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs ${r.circuitBreakerTriggered ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {r.circuitBreakerTriggered ? '已触发 ✅' : '未触发 ❌'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500 font-mono">{r.failoverLatency}ms</td>
                  <td className="px-4 py-3 text-sm text-gray-400">{r.startedAt ? new Date(r.startedAt).toLocaleString() : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 页面帮助 */}
      <div className="bg-blue-50 rounded-lg p-4 text-sm text-blue-800 border border-blue-200">
        <p className="font-medium mb-1">💡 说明</p>
        <ul className="list-disc ml-4 space-y-1">
          <li>故障演练模拟供应商故障，验证熔断器和自动切换是否正常工作</li>
          <li>演练仅通过注入失败计数影响熔断器，不影响真实用户请求</li>
          <li>支持 4 种演练场景：完全不可用、响应超时、服务端错误、空响应</li>
          <li>演练最长 30 分钟，到期自动结束并生成报告</li>
          <li>同一时间只允许一个演练进行</li>
        </ul>
      </div>
    </div>
  )
}
