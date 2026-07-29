import { useEffect, useState } from 'react'
import { get, put, post } from '@/lib/api'
import { Loader2, RefreshCw, ArrowRight, Download, Upload, Server, Activity, CheckCircle, XCircle, AlertTriangle } from 'lucide-react'
import FeatureDescription from '@/components/admin/FeatureDescription'

interface EnvItem {
  id: string
  name: string
  color: string
  status: string
  config: Record<string, unknown>
  updatedAt: string | null
}

interface DiffResult {
  onlyInSource: { key: string; value: unknown }[]
  onlyInTarget: { key: string; value: unknown }[]
  different: { key: string; sourceValue: unknown; targetValue: unknown }[]
  sameKeys: string[]
}

interface HealthResult {
  overall: string
  checks: { name: string; status: string; latency: number }[]
}

export default function AdminEnvironmentsPage() {
  const [environments, setEnvironments] = useState<EnvItem[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  // Diff
  const [diffSource, setDiffSource] = useState('test')
  const [diffTarget, setDiffTarget] = useState('production')
  const [diffResult, setDiffResult] = useState<DiffResult | null>(null)
  const [diffLoading, setDiffLoading] = useState(false)

  // Sync
  const [syncSource, setSyncSource] = useState('test')
  const [syncTarget, setSyncTarget] = useState('production')
  const [syncMode, setSyncMode] = useState<'upsert' | 'overwrite' | 'skip'>('upsert')
  const [syncing, setSyncing] = useState(false)

  // Health
  const [healthMap, setHealthMap] = useState<Record<string, HealthResult>>({})
  const [healthLoading, setHealthLoading] = useState<Record<string, boolean>>({})

  useEffect(() => { loadEnvs() }, [])

  async function loadEnvs() {
    setLoading(true)
    try {
      const res = await get('/api/v1/admin/environments')
      setEnvironments(res.data?.list || [])
    } catch { } finally {
      setLoading(false)
    }
  }

  async function runDiff() {
    setDiffLoading(true)
    setDiffResult(null)
    try {
      const res = await get(`/api/v1/admin/environments/diff?source=${diffSource}&target=${diffTarget}`)
      setDiffResult(res.data)
    } catch (e: any) {
      setMessage(`差异对比失败: ${e?.message}`)
    } finally {
      setDiffLoading(false)
    }
  }

  async function runSync() {
    if (!confirm(`确认将 ${syncSource} 配置同步到 ${syncTarget}？`)) return
    setSyncing(true)
    setMessage('')
    try {
      const res = await post('/api/v1/admin/environments/sync', {
        sourceEnv: syncSource,
        targetEnv: syncTarget,
        mode: syncMode,
      })
      setMessage(`同步完成：${res.message}`)
    } catch (e: any) {
      setMessage(`同步失败: ${e?.message}`)
    } finally {
      setSyncing(false)
    }
  }

  async function healthCheck(envId: string) {
    setHealthLoading(prev => ({ ...prev, [envId]: true }))
    try {
      const res = await post(`/api/v1/admin/environments/${envId}/health-check`, {})
      setHealthMap(prev => ({ ...prev, [envId]: res.data }))
    } catch { } finally {
      setHealthLoading(prev => ({ ...prev, [envId]: false }))
    }
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
      <div className="flex items-center gap-2">
        <Server className="w-6 h-6 text-indigo-600" />
        <h1 className="text-2xl font-bold">多环境管理</h1>
        <FeatureDescription page="多环境配置管理与同步" />
      </div>

      {message && (
        <div className={`p-3 rounded-lg text-sm border ${message.includes('失败') ? 'bg-red-50 text-red-700 border-red-200' : 'bg-green-50 text-green-700 border-green-200'}`}>
          {message}
        </div>
      )}

      {/* 环境列表 + 健康检测 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {environments.map(env => (
          <div key={env.id} className="bg-white rounded-lg border shadow-sm p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={`w-3 h-3 rounded-full bg-${env.color}-500`} style={{ backgroundColor: env.color === 'red' ? '#ef4444' : env.color === 'green' ? '#22c55e' : env.color === 'blue' ? '#3b82f6' : '#f97316' }} />
                <span className="font-medium text-sm">{env.name}</span>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full ${env.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                {env.status === 'active' ? '活跃' : '未活跃'}
              </span>
            </div>

            <div className="text-xs text-gray-400">ID: {env.id}</div>

            {/* 健康检测结果 */}
            {healthMap[env.id] ? (
              <div className="space-y-1">
                <div className="flex items-center gap-1 text-xs">
                  {healthMap[env.id].overall === 'healthy' ? (
                    <CheckCircle className="w-3 h-3 text-green-500" />
                  ) : healthMap[env.id].overall === 'unhealthy' ? (
                    <XCircle className="w-3 h-3 text-red-500" />
                  ) : (
                    <AlertTriangle className="w-3 h-3 text-amber-500" />
                  )}
                  <span className={
                    healthMap[env.id].overall === 'healthy' ? 'text-green-600' :
                    healthMap[env.id].overall === 'unhealthy' ? 'text-red-600' : 'text-amber-600'
                  }>
                    {healthMap[env.id].overall === 'healthy' ? '健康' : healthMap[env.id].overall === 'unhealthy' ? '不健康' : '降级'}
                  </span>
                </div>
                {healthMap[env.id].checks.slice(0, 3).map(c => (
                  <div key={c.name} className="flex items-center justify-between text-xs text-gray-500">
                    <span>{c.name}</span>
                    <span className={c.status === 'passed' ? 'text-green-500' : c.status === 'failed' ? 'text-red-500' : 'text-amber-500'}>
                      {c.status === 'passed' ? '✓' : c.status === 'failed' ? '✗' : '!'} {c.latency}ms
                    </span>
                  </div>
                ))}
              </div>
            ) : null}

            <button
              onClick={() => healthCheck(env.id)}
              disabled={healthLoading[env.id]}
              className="w-full flex items-center justify-center gap-1 px-3 py-1.5 border rounded-lg text-xs hover:bg-gray-50 disabled:opacity-50"
            >
              <Activity className="w-3 h-3" />
              {healthLoading[env.id] ? '检测中...' : '健康检测'}
            </button>
          </div>
        ))}
      </div>

      {/* 配置同步 */}
      <div className="bg-white rounded-lg border shadow-sm p-6 space-y-4">
        <div className="flex items-center gap-2">
          <ArrowRight className="w-5 h-5 text-indigo-600" />
          <h2 className="font-semibold">配置同步</h2>
        </div>

        <div className="flex items-center gap-4 flex-wrap">
          <div>
            <label className="block text-xs text-gray-500 mb-1">源环境</label>
            <select value={syncSource} onChange={e => setSyncSource(e.target.value)} className="px-3 py-2 border rounded-lg text-sm">
              {environments.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          <ArrowRight className="w-4 h-4 text-gray-400 mt-5" />
          <div>
            <label className="block text-xs text-gray-500 mb-1">目标环境</label>
            <select value={syncTarget} onChange={e => setSyncTarget(e.target.value)} className="px-3 py-2 border rounded-lg text-sm">
              {environments.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">同步模式</label>
            <select value={syncMode} onChange={e => setSyncMode(e.target.value as any)} className="px-3 py-2 border rounded-lg text-sm">
              <option value="upsert">已有跳过，无则新建</option>
              <option value="overwrite">强制覆盖</option>
              <option value="skip">只新建不更新</option>
            </select>
          </div>
          <button
            onClick={runSync}
            disabled={syncing}
            className="mt-5 flex items-center gap-1 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50"
          >
            <Upload className="w-4 h-4" />
            {syncing ? '同步中...' : '执行同步'}
          </button>
        </div>
      </div>

      {/* 配置差异对比 */}
      <div className="bg-white rounded-lg border shadow-sm p-6 space-y-4">
        <div className="flex items-center gap-2">
          <RefreshCw className="w-5 h-5 text-indigo-600" />
          <h2 className="font-semibold">配置差异对比</h2>
        </div>

        <div className="flex items-center gap-4 flex-wrap">
          <div>
            <label className="block text-xs text-gray-500 mb-1">环境 A</label>
            <select value={diffSource} onChange={e => setDiffSource(e.target.value)} className="px-3 py-2 border rounded-lg text-sm">
              {environments.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          <span className="text-sm text-gray-400 mt-5">vs</span>
          <div>
            <label className="block text-xs text-gray-500 mb-1">环境 B</label>
            <select value={diffTarget} onChange={e => setDiffTarget(e.target.value)} className="px-3 py-2 border rounded-lg text-sm">
              {environments.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          <button
            onClick={runDiff}
            disabled={diffLoading}
            className="mt-5 flex items-center gap-1 px-4 py-2 border border-indigo-300 text-indigo-700 rounded-lg text-sm hover:bg-indigo-50 disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            {diffLoading ? '对比中...' : '对比差异'}
          </button>
        </div>

        {/* 差异结果 */}
        {diffResult && (
          <div className="space-y-3 pt-2">
            <div className="flex gap-3 text-sm">
              <span className="px-2 py-1 bg-blue-50 text-blue-700 rounded">相同: {diffResult.summary.same}</span>
              <span className="px-2 py-1 bg-amber-50 text-amber-700 rounded">仅 A 有: {diffResult.summary.onlyInSource}</span>
              <span className="px-2 py-1 bg-amber-50 text-amber-700 rounded">仅 B 有: {diffResult.summary.onlyInTarget}</span>
              <span className="px-2 py-1 bg-red-50 text-red-700 rounded">值不同: {diffResult.summary.different}</span>
            </div>

            {diffResult.different.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2">值不同 ({diffResult.different.length})</h4>
                <div className="space-y-2">
                  {diffResult.different.map(d => (
                    <div key={d.key} className="p-3 bg-red-50 rounded border border-red-100 text-sm">
                      <div className="font-mono text-xs text-gray-600 mb-1">{d.key}</div>
                      <div className="flex gap-4">
                        <div className="flex-1">
                          <div className="text-xs text-red-600 mb-1">A 值:</div>
                          <pre className="text-xs bg-white p-1 rounded overflow-x-auto">{JSON.stringify(d.sourceValue, null, 2)}</pre>
                        </div>
                        <div className="flex-1">
                          <div className="text-xs text-green-600 mb-1">B 值:</div>
                          <pre className="text-xs bg-white p-1 rounded overflow-x-auto">{JSON.stringify(d.targetValue, null, 2)}</pre>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(diffResult.onlyInSource.length > 0 || diffResult.onlyInTarget.length > 0) && (
              <div className="grid grid-cols-2 gap-4">
                {diffResult.onlyInSource.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium mb-2">仅 A 有 ({diffResult.onlyInSource.length})</h4>
                    <div className="space-y-1">
                      {diffResult.onlyInSource.map(o => (
                        <div key={o.key} className="p-2 bg-amber-50 rounded text-xs font-mono">{o.key}</div>
                      ))}
                    </div>
                  </div>
                )}
                {diffResult.onlyInTarget.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium mb-2">仅 B 有 ({diffResult.onlyInTarget.length})</h4>
                    <div className="space-y-1">
                      {diffResult.onlyInTarget.map(o => (
                        <div key={o.key} className="p-2 bg-amber-50 rounded text-xs font-mono">{o.key}</div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="bg-blue-50 rounded-lg p-4 text-sm text-blue-800 border border-blue-200">
        <p className="font-medium mb-1">💡 说明</p>
        <ul className="list-disc ml-4 space-y-1">
          <li>配置差异对比：比较两个环境的 system_configs，列出仅 A 有/仅 B 有/值不同项</li>
          <li>配置同步：将源环境配置复制到目标环境（支持三种同步模式）</li>
          <li>健康检测：检查各环境服务连通性（API/DB/Redis/存储）</li>
          <li>建议在同步前先做差异对比，确认变更范围</li>
        </ul>
      </div>
    </div>
  )
}
