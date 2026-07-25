import { useEffect, useState, useCallback } from 'react'
import { get, post, put, del } from '@/lib/api'
import {
  Loader2, AlertCircle, FlaskConical, Plus, RefreshCw,
  Play, Pause, CheckCircle2, Trash2, Edit3, GitBranch
} from 'lucide-react'

interface ABVariant {
  name: string
  weight: number
  config: Record<string, any>
}

interface ABTest {
  id: number
  name: string
  description: string
  status: 'draft' | 'running' | 'paused' | 'completed'
  trafficPercent: number
  variants: ABVariant[]
  metrics: string[]
  targetRoute: string
  startedAt: string | null
  completedAt: string | null
  createdAt: string
  createdBy: number
}

interface ABTestResult {
  id: number
  testId: number
  variant: string
  impressions: number
  conversions: number
  metrics: Record<string, number>
  updatedAt: string
}

const statusStyles: Record<string, { label: string; color: string }> = {
  draft: { label: '草稿', color: 'text-gray-600 bg-gray-100' },
  running: { label: '运行中', color: 'text-green-600 bg-green-50' },
  paused: { label: '已暂停', color: 'text-orange-600 bg-orange-50' },
  completed: { label: '已完成', color: 'text-blue-600 bg-blue-50' },
}

export default function AdminABTesting() {
  const [tests, setTests] = useState<ABTest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [testResults, setTestResults] = useState<Record<number, ABTestResult[]>>({})
  const [loadingDetail, setLoadingDetail] = useState(false)

  // 表单
  const [form, setForm] = useState({
    name: '',
    description: '',
    trafficPercent: 10,
    targetRoute: '',
    metrics: 'latency, error_rate',
    variants: [
      { name: '对照组', weight: 50, config: '{}' },
      { name: '实验组', weight: 50, config: '{}' },
    ] as { name: string; weight: number; config: string }[],
  })

  const fetchTests = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await get<{ list: ABTest[] }>('/api/v1/admin/ab-testing')
      setTests(res.list)
    } catch (err: any) {
      setError(err.message || '获取失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchTests() }, [fetchTests])

  const openCreate = () => {
    setEditId(null)
    setForm({ name: '', description: '', trafficPercent: 10, targetRoute: '', metrics: 'latency, error_rate',
      variants: [{ name: '对照组', weight: 50, config: '{}' }, { name: '实验组', weight: 50, config: '{}' }] })
    setShowForm(true)
  }

  const openEdit = (test: ABTest) => {
    setEditId(test.id)
    setForm({
      name: test.name,
      description: test.description,
      trafficPercent: test.trafficPercent,
      targetRoute: test.targetRoute,
      metrics: test.metrics.join(', '),
      variants: test.variants.map(v => ({ name: v.name, weight: v.weight, config: JSON.stringify(v.config, null, 2) })),
    })
    setShowForm(true)
  }

  const handleSave = async () => {
    setSaving(true)
    setError('')
    try {
      const variants = form.variants.map(v => ({
        name: v.name,
        weight: v.weight,
        config: v.config ? JSON.parse(v.config) : {},
      }))

      const body = {
        name: form.name,
        description: form.description,
        trafficPercent: form.trafficPercent,
        targetRoute: form.targetRoute,
        metrics: form.metrics.split(',').map(m => m.trim()).filter(Boolean),
        variants,
      }

      if (editId) {
        await put(`/api/v1/admin/ab-testing/${editId}`, body)
      } else {
        await post('/api/v1/admin/ab-testing', body)
      }

      setShowForm(false)
      await fetchTests()
    } catch (err: any) {
      setError(err.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('确定删除此实验？')) return
    setError('')
    try {
      await del(`/api/v1/admin/ab-testing/${id}`)
      await fetchTests()
    } catch (err: any) {
      setError(err.message || '删除失败')
    }
  }

  const handleStatus = async (id: number, action: 'start' | 'pause' | 'complete') => {
    setError('')
    try {
      await post(`/api/v1/admin/ab-testing/${id}/${action}`)
      await fetchTests()
      if (expandedId === id) handleExpand(id) // 刷新展开详情
    } catch (err: any) {
      setError(err.message || '操作失败')
    }
  }

  const handleExpand = async (id: number) => {
    if (expandedId === id) { setExpandedId(null); return }
    setExpandedId(id)
    setLoadingDetail(true)
    try {
      const res = await get<ABTest & { results: ABTestResult[] }>(`/api/v1/admin/ab-testing/${id}`)
      setTestResults(prev => ({ ...prev, [id]: res.results || [] }))
    } catch (err: any) {
      setError(err.message || '获取详情失败')
    } finally {
      setLoadingDetail(false)
    }
  }

  // 变体表单管理
  const updateVariant = (index: number, field: string, value: any) => {
    setForm(prev => {
      const variants = [...prev.variants]
      variants[index] = { ...variants[index], [field]: value }
      return { ...prev, variants }
    })
  }

  const addVariant = () => {
    setForm(prev => ({ ...prev, variants: [...prev.variants, { name: '', weight: 0, config: '{}' }] }))
  }

  const removeVariant = (index: number) => {
    setForm(prev => ({ ...prev, variants: prev.variants.filter((_, i) => i !== index) }))
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FlaskConical className="text-purple-500" size={28} />
            A/B 测试管理
          </h1>
          <p className="text-sm text-gray-500 mt-1">创建与运行 A/B 实验，对比不同配置的效果</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchTests} className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
            <RefreshCw size={14} /> 刷新
          </button>
          <button onClick={openCreate} className="flex items-center gap-1.5 px-4 py-2 text-sm bg-purple-500 text-white rounded-lg hover:bg-purple-600">
            <Plus size={16} /> 新建实验
          </button>
        </div>
      </div>

      {error && <div className="flex items-center gap-2 p-3 text-sm text-red-600 bg-red-50 rounded-lg"><AlertCircle size={16} /> {error}</div>}

      {/* 新建/编辑表单 */}
      {showForm && (
        <div className="border rounded-xl p-5 space-y-4">
          <h2 className="font-semibold">{editId ? '编辑实验' : '新建实验'}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">实验名称</label>
              <input type="text" value={form.name} onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
                className="w-full border rounded px-3 py-2 text-sm" placeholder="如：新定价策略测试" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">流量百分比</label>
              <input type="number" min={1} max={100} value={form.trafficPercent}
                onChange={e => setForm(prev => ({ ...prev, trafficPercent: parseInt(e.target.value) || 1 }))}
                className="w-full border rounded px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">目标路由</label>
              <input type="text" value={form.targetRoute} onChange={e => setForm(prev => ({ ...prev, targetRoute: e.target.value }))}
                className="w-full border rounded px-3 py-2 text-sm" placeholder="可选" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">观测指标（逗号分隔）</label>
              <input type="text" value={form.metrics} onChange={e => setForm(prev => ({ ...prev, metrics: e.target.value }))}
                className="w-full border rounded px-3 py-2 text-sm" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">变量配置</label>
              {form.variants.map((v, i) => (
                <div key={i} className="flex items-start gap-3 mb-2 p-3 bg-gray-50 rounded-lg">
                  <div className="flex-1">
                    <input type="text" value={v.name} onChange={e => updateVariant(i, 'name', e.target.value)}
                      className="w-full border rounded px-2 py-1.5 text-sm mb-1" placeholder="变量名" />
                    <textarea value={v.config} onChange={e => updateVariant(i, 'config', e.target.value)}
                      rows={2} className="w-full border rounded px-2 py-1.5 text-xs font-mono" placeholder="{}" />
                  </div>
                  <div className="w-20">
                    <input type="number" min={1} max={100} value={v.weight}
                      onChange={e => updateVariant(i, 'weight', parseInt(e.target.value) || 1)}
                      className="w-full border rounded px-2 py-1.5 text-sm" placeholder="权重" />
                    <span className="text-xs text-gray-400">权重%</span>
                  </div>
                  {form.variants.length > 2 && (
                    <button onClick={() => removeVariant(i)} className="p-1.5 text-red-400 hover:bg-red-50 rounded">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
              <button onClick={addVariant} className="text-sm text-purple-600 hover:text-purple-700 flex items-center gap-1">
                <Plus size={14} /> 添加变量
              </button>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleSave} disabled={saving || !form.name}
              className="px-4 py-2 bg-purple-500 text-white rounded-lg text-sm hover:bg-purple-600 disabled:opacity-50">
              {saving ? '保存中...' : (editId ? '保存修改' : '创建实验')}
            </button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2 border rounded-lg text-sm">取消</button>
          </div>
        </div>
      )}

      {/* 实验列表 */}
      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin" size={32} /></div>
      ) : (
        <div className="space-y-3">
          {tests.length === 0 ? (
            <div className="text-center py-20 text-gray-400">
              <FlaskConical size={48} className="mx-auto mb-3 opacity-30" />
              <p>暂无 A/B 实验</p>
              <button onClick={openCreate} className="mt-2 text-sm text-purple-600 hover:text-purple-700">创建第一个实验</button>
            </div>
          ) : (
            tests.map(test => {
              const s = statusStyles[test.status] || statusStyles.draft
              return (
                <div key={test.id}>
                  <div className="border rounded-xl p-4 hover:shadow-sm transition-shadow">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0 cursor-pointer" onClick={() => handleExpand(test.id)}>
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${s.color}`}>{s.label}</span>
                          <span className="font-medium">{test.name}</span>
                          <span className="text-xs text-gray-400">流量 {test.trafficPercent}%</span>
                        </div>
                        {test.description && <p className="text-sm text-gray-500 truncate">{test.description}</p>}
                        <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-400">
                          <span>{test.variants.length} 个变量</span>
                          <span>指标: {test.metrics.join(', ')}</span>
                          {test.startedAt && <span>开始: {new Date(test.startedAt).toLocaleDateString('zh-CN')}</span>}
                          <span className="text-xs text-gray-400">ID: {test.id}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {test.status === 'draft' && (
                          <button onClick={() => handleStatus(test.id, 'start')}
                            className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-green-600 bg-green-50 rounded-lg hover:bg-green-100">
                            <Play size={12} /> 启动
                          </button>
                        )}
                        {test.status === 'running' && (
                          <button onClick={() => handleStatus(test.id, 'pause')}
                            className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-orange-600 bg-orange-50 rounded-lg hover:bg-orange-100">
                            <Pause size={12} /> 暂停
                          </button>
                        )}
                        {(test.status === 'running' || test.status === 'paused') && (
                          <button onClick={() => handleStatus(test.id, 'complete')}
                            className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100">
                            <CheckCircle2 size={12} /> 完成
                          </button>
                        )}
                        <button onClick={() => openEdit(test)} className="p-1.5 text-gray-400 hover:text-gray-600">
                          <Edit3 size={14} />
                        </button>
                        {test.status === 'draft' && (
                          <button onClick={() => handleDelete(test.id)} className="p-1.5 text-red-400 hover:text-red-600">
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* 变量权重条 */}
                    <div className="flex h-2 rounded-full overflow-hidden mt-3 bg-gray-100">
                      {test.variants.map((v, i) => (
                        <div key={i}
                          className={`h-full ${['bg-purple-400', 'bg-green-400', 'bg-orange-400', 'bg-blue-400', 'bg-red-400'][i % 5]}`}
                          style={{ width: `${v.weight}%` }}
                        />
                      ))}
                    </div>
                    <div className="flex gap-4 mt-1 text-xs text-gray-500">
                      {test.variants.map((v, i) => (
                        <span key={i}>{v.name} ({v.weight}%)</span>
                      ))}
                    </div>
                  </div>

                  {/* 展开详情 */}
                  {expandedId === test.id && (
                    <div className="ml-4 pl-4 border-l-2 border-purple-200 space-y-2 py-2">
                      {loadingDetail ? (
                        <div className="flex items-center gap-2 text-sm text-gray-500 py-2"><Loader2 className="animate-spin" size={14} /> 加载中...</div>
                      ) : (
                        <>
                          {testResults[test.id] && testResults[test.id].length > 0 ? (
                            <div className="text-sm space-y-1">
                              {testResults[test.id].map(r => (
                                <div key={r.variant} className="flex items-center gap-2 px-2 py-1 bg-gray-50 rounded text-xs">
                                  <span className="font-medium">{r.variant}</span>
                                  <span>曝光 {r.impressions}</span>
                                  <span>转化 {r.conversions}</span>
                                  {Object.entries(r.metrics).map(([k, v]) => (
                                    <span key={k}>{k}: {v}</span>
                                  ))}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-gray-400 py-1">暂无实验数据</p>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
