import { useEffect, useState, useCallback } from 'react'
import { get, put, post } from '@/lib/api'
import {
  Loader2, AlertCircle, Server, RefreshCw, Save, CheckCircle2,
  XCircle, Activity, Wifi, Database, HardDrive
} from 'lucide-react'

interface Environment {
  id: string
  name: string
  color: string
  status: 'active' | 'inactive' | 'maintenance'
  config: Record<string, any>
  updatedAt: string | null
}

interface HealthCheck {
  name: string
  status: 'passed' | 'warning' | 'failed'
  latency: number
}

interface HealthResult {
  environmentId: string
  overall: 'healthy' | 'degraded' | 'unhealthy'
  checks: HealthCheck[]
  checkedAt: string
}

const colorMap: Record<string, string> = {
  blue: 'border-blue-400 bg-blue-50',
  green: 'border-green-400 bg-green-50',
  orange: 'border-orange-400 bg-orange-50',
  red: 'border-red-400 bg-red-50',
  purple: 'border-purple-400 bg-purple-50',
}

const statusLabels: Record<string, { label: string; color: string }> = {
  active: { label: '运行中', color: 'text-green-600 bg-green-50' },
  inactive: { label: '未启动', color: 'text-gray-500 bg-gray-100' },
  maintenance: { label: '维护中', color: 'text-orange-600 bg-orange-50' },
}

const checkIcons: Record<string, typeof CheckCircle2> = {
  passed: CheckCircle2,
  warning: Activity,
  failed: XCircle,
}

const checkColors: Record<string, string> = {
  passed: 'text-green-600',
  warning: 'text-orange-500',
  failed: 'text-red-600',
}

export default function AdminEnvironments() {
  const [environments, setEnvironments] = useState<Environment[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [healthResults, setHealthResults] = useState<Record<string, HealthResult>>({})
  const [healthChecking, setHealthChecking] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editConfig, setEditConfig] = useState('')

  const fetchEnvs = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await get<{ list: Environment[] }>('/api/v1/admin/environments')
      setEnvironments(res.list)
    } catch (err: any) {
      setError(err.message || '获取环境列表失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchEnvs() }, [fetchEnvs])

  // 状态切换
  const cycleStatus = (id: string) => {
    setEnvironments(prev => prev.map(e => {
      if (e.id !== id) return e
      const next = e.status === 'active' ? 'inactive' : e.status === 'inactive' ? 'maintenance' : 'active'
      return { ...e, status: next }
    }))
  }

  // 修改名称
  const updateName = (id: string, name: string) => {
    setEnvironments(prev => prev.map(e => e.id === id ? { ...e, name } : e))
  }

  // 编辑配置 JSON
  const openConfigEdit = (env: Environment) => {
    setEditingId(env.id)
    setEditConfig(JSON.stringify(env.config || {}, null, 2))
  }

  const saveConfigEdit = (id: string) => {
    try {
      const parsed = JSON.parse(editConfig)
      setEnvironments(prev => prev.map(e => e.id === id ? { ...e, config: parsed } : e))
      setEditingId(null)
      setEditConfig('')
    } catch {
      setError('JSON 格式无效')
    }
  }

  // 批量保存
  const handleSave = async () => {
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      await put('/api/v1/admin/environments', { environments })
      setSuccess('环境配置已保存')
      setTimeout(() => setSuccess(''), 3000)
    } catch (err: any) {
      setError(err.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  // 健康检测
  const runHealthCheck = async (id: string) => {
    setHealthChecking(id)
    setError('')
    try {
      const res = await post<HealthResult>(`/api/v1/admin/environments/${id}/health-check`)
      setHealthResults(prev => ({ ...prev, [id]: res }))
    } catch (err: any) {
      setError(`健康检测失败: ${err.message}`)
    } finally {
      setHealthChecking(null)
    }
  }

  // 健康检测渲染
  function renderHealthResult(envId: string) {
    const result = healthResults[envId]
    if (!result) return null

    const overallColor = result.overall === 'healthy' ? 'text-green-600 bg-green-50'
      : result.overall === 'degraded' ? 'text-orange-600 bg-orange-50'
      : 'text-red-600 bg-red-50'

    return (
      <div className="mt-3 p-3 bg-gray-50 rounded-lg space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500">检测时间: {new Date(result.checkedAt).toLocaleString('zh-CN')}</span>
          <span className={`px-2 py-0.5 rounded text-xs font-medium ${overallColor}`}>
            {result.overall === 'healthy' ? '健康' : result.overall === 'degraded' ? '亚健康' : '异常'}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {result.checks.map(check => {
            const Icon = checkIcons[check.status] || CheckCircle2
            const color = checkColors[check.status] || 'text-gray-500'
            return (
              <div key={check.name} className="flex items-center justify-between px-2 py-1 bg-white rounded text-sm">
                <div className="flex items-center gap-1.5">
                  <Icon size={14} className={color} />
                  <span>{check.name}</span>
                </div>
                <span className="text-xs text-gray-400">{check.latency}ms</span>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Server className="text-indigo-500" size={28} />
            多环境管理
          </h1>
          <p className="text-sm text-gray-500 mt-1">管理开发/测试/预发/生产环境配置</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchEnvs} className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
            <RefreshCw size={14} /> 刷新
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 text-sm bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 disabled:opacity-50">
            <Save size={16} /> {saving ? '保存中...' : '全部保存'}
          </button>
        </div>
      </div>

      {error && <div className="flex items-center gap-2 p-3 text-sm text-red-600 bg-red-50 rounded-lg"><AlertCircle size={16} /> {error}</div>}
      {success && <div className="flex items-center gap-2 p-3 text-sm text-green-600 bg-green-50 rounded-lg"><CheckCircle2 size={16} /> {success}</div>}

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin" size={32} /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {environments.map(env => (
            <div key={env.id} className={`border-l-4 rounded-xl p-5 ${colorMap[env.color] || 'border-gray-400 bg-gray-50'}`}>
              {/* 头部 */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={env.name}
                    onChange={e => updateName(env.id, e.target.value)}
                    className="font-semibold text-lg bg-transparent border-none focus:outline-none focus:ring-0 p-0"
                  />
                  <span className="text-xs text-gray-400 font-mono">{env.id}</span>
                </div>
                <button
                  onClick={() => cycleStatus(env.id)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusLabels[env.status]?.color || 'bg-gray-100 text-gray-500'}`}
                >
                  {statusLabels[env.status]?.label || env.status}
                </button>
              </div>

              {/* 操作按钮 */}
              <div className="flex items-center gap-2 mb-3">
                <button
                  onClick={() => runHealthCheck(env.id)}
                  disabled={healthChecking === env.id}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-gray-600 bg-white border rounded-lg hover:bg-gray-50 disabled:opacity-50"
                >
                  {healthChecking === env.id ? <Loader2 className="animate-spin" size={12} /> : <Activity size={12} />}
                  健康检测
                </button>
                <button
                  onClick={() => openConfigEdit(env)}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-gray-600 bg-white border rounded-lg hover:bg-gray-50"
                >
                  编辑配置
                </button>
              </div>

              {/* 配置 JSON 编辑 */}
              {editingId === env.id && (
                <div className="mb-3 space-y-2">
                  <textarea
                    value={editConfig}
                    onChange={e => setEditConfig(e.target.value)}
                    rows={6}
                    className="w-full border rounded px-2 py-1.5 text-xs font-mono"
                  />
                  <div className="flex gap-2">
                    <button onClick={() => saveConfigEdit(env.id)} className="px-3 py-1 text-xs bg-indigo-500 text-white rounded">应用</button>
                    <button onClick={() => setEditingId(null)} className="px-3 py-1 text-xs border rounded">取消</button>
                  </div>
                </div>
              )}

              {/* 配置摘要 */}
              {editingId !== env.id && (
                <div className="text-xs text-gray-400 mb-2">
                  配置项: {Object.keys(env.config || {}).length} 项
                  {env.updatedAt && <span> | 更新: {new Date(env.updatedAt).toLocaleString('zh-CN')}</span>}
                </div>
              )}

              {/* 健康检测结果 */}
              {renderHealthResult(env.id)}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
