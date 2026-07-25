import { useEffect, useState, useCallback } from 'react'
import { get, post, put, del } from '@/lib/api'
import {
  Loader2, AlertCircle, FlaskConical, Plus, RefreshCw,
  Play, Pause, CheckCircle2, Trash2, Edit, X
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

interface ABTestDetail extends ABTest {
  results: {
    variant: string
    impressions: number
    conversions: number
    metrics: Record<string, number>
  }[]
}

const statusColors: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  running: 'bg-green-100 text-green-700',
  paused: 'bg-yellow-100 text-yellow-700',
  completed: 'bg-blue-100 text-blue-700',
}

const statusLabels: Record<string, string> = {
  draft: '草稿',
  running: '运行中',
  paused: '已暂停',
  completed: '已完成',
}

const defaultMetrics = ['latency', 'error_rate', 'token_usage']

export default function AdminABTesting() {
  const [tests, setTests] = useState<ABTest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [detailId, setDetailId] = useState<number | null>(null)
  const [detail, setDetail] = useState<ABTestDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  // 创建表单
  const [formName, setFormName] = useState('')
  const [formDesc, setFormDesc] = useState('')
  const [formTraffic, setFormTraffic] = useState(50)
  const [formVariants, setFormVariants] = useState<ABVariant[]>([
    { name: 'A', weight: 50, config: {} },
    { name: 'B', weight: 50, config: {} },
  ])
  const [formMetrics, setFormMetrics] = useState(defaultMetrics.join(', '))
  const [formRoute, setFormRoute] = useState('')
  const [creating, setCreating] = useState(false)

  const fetchTests = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await get<{ list: ABTest[] }>('/api/v1/admin/ab-testing')
      setTests(res.list)
    } catch (err: any) {
      setError(err.message || '获取实验列表失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchTests() }, [fetchTests])

  // ── 查看详情 ──

  const openDetail = async (id: number) => {
    setDetailId(id)
    setDetailLoading(true)
    setError('')
    try {
      const res = await get<ABTestDetail>(`/api/v1/admin/ab-testing/${id}`)
      setDetail(res)
    } catch (err: any) {
      setError(err.message || '获取详情失败')
    } finally {
      setDetailLoading(false)
    }
  }

  // ── 状态操作 ──

  const changeStatus = async (id: number, action: 'start' | 'pause' | 'complete') => {
    setError('')
    try {
      await post(`/api/v1/admin/ab-testing/${id}/${action}`)
      await fetchTests()
      setDetailId(null)
    } catch (err: any) {
      setError(err.message || '操作失败')
    }
  }

  // ── 删除 ──

  const deleteTest = async (id: number) => {
    if (!confirm('确定删除此实验？')) return
    setError('')
    try {
      await del(`/api/v1/admin/ab-testing/${id}`)
      await fetchTests()
      if (detailId === id) setDetailId(null)
    } catch (err: any) {
      setError(err.message || '删除失败')
    }
  }

  // ── 创建实验 ──

  const handleCreate = async () => {
    if (!formName.trim()) {
      setError('请输入实验名称')
      return
    }

    setCreating(true)
    setError('')

    // 验证权重总和
    const weightSum = formVariants.reduce((s, v) => s + (v.weight || 0), 0)
    if (weightSum !== 100) {
      setError(`变量权重必须为 100（当前 ${weightSum}）`)
      setCreating(false)
      return
    }

    try {
      await post('/api/v1/admin/ab-testing', {
        name: formName,
        description: formDesc,
        trafficPercent: formTraffic,
        variants: formVariants,
        metrics: formMetrics.split(',').map(m => m.trim()).filter(Boolean),
        targetRoute: formRoute,
      })
      setShowCreate(false)
      resetForm()
      await fetchTests()
    } catch (err: any) {
      setError(err.message || '创建失败')
    } finally {
      setCreating(false)
    }
  }

  const resetForm = () => {
    setFormName('')
    setFormDesc('')
    setFormTraffic(50)
    setFormVariants([{ name: 'A', weight: 50, config: {} }, { name: 'B', weight: 50, config: {} }])
    setFormMetrics(defaultMetrics.join(', '))
    setFormRoute('')
  }

  const updateVariant = (i: number, field: keyof ABVariant, value: any) => {
    setFormVariants(prev => prev.map((v, idx) => idx === i ? { ...v, [field]: value } : v))
  }

  const addVariant = () => {
    if (formVariants.length >= 10) return
    const equalWeight = Math.floor(100 / (formVariants.length + 1))
    setFormVariants(prev => [...prev.map(v => ({ ...v, weight: equalWeight })), { name: `V${prev.length + 1}`, weight: 100 - equalWeight * prev.length, config: {} }])
  }

  const removeVariant = (i: number) => {
    if (formVariants.length <= 2) return
    setFormVariants(prev => prev.filter((_, idx) => idx !== i))
  }

  // ── 渲染详情面板 ──

  function renderDetail() {
    if (!detailId) return null

    return (
      <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={() => setDetailId(null)}>
        <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[80vh] overflow-auto p-6 space-y-4" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">{detail?.name || '加载中...'}</h2>
            <button onClick={() => setDetailId(null)} className="p-1 hover:bg-gray-100 rounded"><X size={20} /></button>
          </div>

          {detailLoading ? (
            <div className="flex justify-center py-10"><Loader2 className="animate-spin" size={24} /></div>
          ) : detail ? (
            <>
              <div className="flex items-center gap-2">
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColors[detail.status]}`}>
                  {statusLabels[detail.status]}
                </span>
                <span className="text-sm text-gray-500">流量: {detail.trafficPercent}%</span>
                {detail.targetRoute && <span className="text-sm text-gray-500">路由: {detail.targetRoute}</span>}
              </div>
              <p className="text-sm text-gray-600">{detail.description || '暂无描述'}</p>

              {/* 变量权重 */}
              <div>
                <h4 className="text-sm font-medium mb-2">变量</h4>
                {detail.variants.map(v => (
                  <div key={v.name} className="flex items-center gap-2 mb-1">
                    <span className="text-sm w-10 font-mono">{v.name}</span>
                    <div className="flex-1 bg-gray-100 rounded-full h-5">
                      <div className="h-5 bg-indigo-400 rounded-full text-xs text-white flex items-center justify-center" style={{ width: `${v.weight}%` }}>
                        {v.weight}%
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* 结果 */}
              {detail.results.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium mb-2">实验结果</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left">
                          <th className="pb-1 font-medium">变量</th>
                          <th className="pb-1 font-medium">访问数</th>
                          <th className="pb-1 font-medium">转化数</th>
                          <th className="pb-1 font-medium">转化率</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.results.map(r => (
                          <tr key={r.variant} className="border-b last:border-0">
                            <td className="py-1 font-mono">{r.variant}</td>
                            <td className="py-1">{r.impressions}</td>
                            <td className="py-1">{r.conversions}</td>
                            <td className="py-1">{r.impressions > 0 ? `${((r.conversions / r.impressions) * 100).toFixed(1)}%` : '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* 操作按钮 */}
              <div className="flex items-center gap-2 pt-2">
                {detail.status === 'draft' && (
                  <button onClick={() => changeStatus(detail.id, 'start')} className="flex items-center gap-1 px-3 py-1.5 text-sm bg-green-500 text-white rounded-lg hover:bg-green-600">
                    <Play size={14} /> 启动
                  </button>
                )}
                {detail.status === 'running' && (
                  <button onClick={() => changeStatus(detail.id, 'pause')} className="flex items-center gap-1 px-3 py-1.5 text-sm bg-yellow-500 text-white rounded-lg hover:bg-yellow-600">
                    <Pause size={14} /> 暂停
                  </button>
                )}
                {(detail.status === 'draft' || detail.status === 'paused') && (
                  <button onClick={() => changeStatus(detail.id, 'complete')} className="flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600">
                    <CheckCircle2 size={14} /> 完成
                  </button>
                )}
              </div>
            </>
          ) : null}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FlaskConical className="text-purple-500" size={28} />
            A/B 测试
          </h1>
          <p className="text-sm text-gray-500 mt-1">创建与管理 A/B 实验，配置分流比例，查看实验结果</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchTests} className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
            <RefreshCw size={14} /> 刷新
          </button>
          <button onClick={() => { resetForm(); setShowCreate(true) }} className="flex items-center gap-1.5 px-4 py-2 text-sm bg-purple-500 text-white rounded-lg hover:bg-purple-600">
            <Plus size={16} /> 新建实验
          </button>
        </div>
      </div>

      {error && <div className="flex items-center gap-2 p-3 text-sm text-red-600 bg-red-50 rounded-lg"><AlertCircle size={16} /> {error}</div>}

      {/* 实验列表 */}
      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="animate-spin" size={32} /></div>
      ) : tests.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <FlaskConical size={48} className="mx-auto mb-3 opacity-30" />
          <p>暂无 A/B 实验</p>
          <p className="text-sm mt-1">点击「新建实验」创建一个实验</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {tests.map(test => (
            <div key={test.id} className="border rounded-xl p-4 hover:shadow-sm transition-shadow cursor-pointer" onClick={() => openDetail(test.id)}>
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h3 className="font-medium">{test.name}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">{test.description || '-'}</p>
                </div>
                <span className={`px-2 py-0.5 rounded text-xs font-medium flex-shrink-0 ${statusColors[test.status]}`}>
                  {statusLabels[test.status]}
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs text-gray-500">
                <span>流量: {test.trafficPercent}%</span>
                <span>变量: {test.variants.length}</span>
                <span>指标: {test.metrics.join(', ')}</span>
              </div>
              <div className="mt-2 flex items-center gap-1">
                {test.variants.map(v => (
                  <span key={v.name} className="text-xs font-mono text-gray-600 bg-gray-100 px-1.5 py-0.5 rounded">
                    {v.name}: {v.weight}%
                  </span>
                ))}
              </div>
              <div className="flex items-center justify-between mt-3 pt-2 border-t">
                <span className="text-xs text-gray-400">{new Date(test.createdAt).toLocaleString('zh-CN')}</span>
                <button
                  onClick={e => { e.stopPropagation(); deleteTest(test.id) }}
                  className="text-red-400 hover:text-red-600 p-1"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 创建弹窗 */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[80vh] overflow-auto p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">新建 A/B 实验</h2>
              <button onClick={() => setShowCreate(false)} className="p-1 hover:bg-gray-100 rounded"><X size={20} /></button>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">实验名称 *</label>
              <input type="text" value={formName} onChange={e => setFormName(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="例如：AI 路由优化实验" />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">描述</label>
              <textarea value={formDesc} onChange={e => setFormDesc(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm" rows={2} placeholder="实验目的..." />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">参与流量比例 {formTraffic}%</label>
              <input type="range" min={1} max={100} value={formTraffic} onChange={e => setFormTraffic(parseInt(e.target.value))} className="w-full" />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-medium">变量</label>
                {formVariants.length < 10 && (
                  <button onClick={addVariant} className="text-xs text-purple-600 hover:text-purple-700">+ 添加变量</button>
                )}
              </div>
              {formVariants.map((v, i) => (
                <div key={i} className="flex items-center gap-2 mb-2">
                  <input type="text" value={v.name} onChange={e => updateVariant(i, 'name', e.target.value)}
                    className="w-16 border rounded px-2 py-1 text-sm font-mono" />
                  <input type="number" min={1} max={100} value={v.weight} onChange={e => updateVariant(i, 'weight', parseInt(e.target.value) || 0)}
                    className="w-20 border rounded px-2 py-1 text-sm" />
                  <span className="text-xs text-gray-400">%</span>
                  {formVariants.length > 2 && (
                    <button onClick={() => removeVariant(i)} className="text-red-400 hover:text-red-600 p-1"><X size={14} /></button>
                  )}
                </div>
              ))}
              <p className="text-xs text-gray-400">总和: {formVariants.reduce((s, v) => s + (v.weight || 0), 0)}%（必须=100）</p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">观测指标</label>
              <input type="text" value={formMetrics} onChange={e => setFormMetrics(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="latency, error_rate, token_usage" />
              <p className="text-xs text-gray-400 mt-1">逗号分隔</p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">目标路由</label>
              <input type="text" value={formRoute} onChange={e => setFormRoute(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="例如: /api/v1/chat" />
            </div>

            <button onClick={handleCreate} disabled={creating}
              className="w-full py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 disabled:opacity-50">
              {creating ? '创建中...' : '创建实验'}
            </button>
          </div>
        </div>
      )}

      {renderDetail()}
    </div>
  )
}
