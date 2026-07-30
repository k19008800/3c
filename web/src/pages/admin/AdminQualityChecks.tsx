import { useEffect, useState, useCallback } from 'react'
import { Loader2, Plus, CheckCircle, Star } from 'lucide-react'
import { get, post, put } from '@/lib/api'

interface QualityCheck {
  id: number
  ticketId: number | null
  sessionId: number | null
  staffId: number
  reviewerId: number
  score: number
  dimensions: Record<string, number>
  feedback: string
  status: 'draft' | 'published'
  createdAt: string
  updatedAt: string
}

const DIMENSION_LABELS: Record<string, string> = {
  response_speed: '响应速度',
  attitude: '服务态度',
  accuracy: '问题解决准确度',
  communication: '沟通能力',
  professionalism: '专业度',
  proactiveness: '主动性',
}

export default function AdminQualityChecks() {
  const [checks, setChecks] = useState<QualityCheck[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState<Partial<QualityCheck>>({
    staffId: 0,
    ticketId: null,
    sessionId: null,
    score: 5,
    dimensions: { response_speed: 5, attitude: 5, accuracy: 5, communication: 5, professionalism: 5 },
    feedback: '',
    status: 'draft',
  })
  const pageSize = 20

  const loadChecks = useCallback(async (p: number) => {
    setLoading(true)
    try {
      const res = await get<{ list: QualityCheck[]; total: number; totalPages: number }>(
        `/api/v1/admin/support/quality-checks?page=${p}&pageSize=${pageSize}`
      )
      setChecks(res.list || [])
      setTotal(res.total)
      setPage(p)
    } catch (err) {
      console.error('加载质检记录失败', err)
    }
    setLoading(false)
  }, [])

  useEffect(() => { loadChecks(1) }, [])

  const handleCreate = async () => {
    try {
      await post('/api/v1/admin/support/quality-checks', form)
      setShowForm(false)
      resetForm()
      loadChecks(1)
    } catch (err: any) {
      alert('创建失败: ' + (err.message || '未知错误'))
    }
  }

  const handleUpdate = async () => {
    if (!editingId) return
    try {
      await put(`/api/v1/admin/support/quality-checks/${editingId}`, form)
      setEditingId(null)
      setShowForm(false)
      resetForm()
      loadChecks(page)
    } catch (err: any) {
      alert('更新失败: ' + (err.message || '未知错误'))
    }
  }

  const resetForm = () => {
    setForm({
      staffId: 0,
      ticketId: null,
      sessionId: null,
      score: 5,
      dimensions: { response_speed: 5, attitude: 5, accuracy: 5, communication: 5, professionalism: 5 },
      feedback: '',
      status: 'draft',
    })
  }

  const editCheck = (check: QualityCheck) => {
    setEditingId(check.id)
    setForm(check)
    setShowForm(true)
  }

  const getScoreColor = (score: number) => {
    if (score >= 8) return 'text-green-400'
    if (score >= 5) return 'text-yellow-400'
    return 'text-red-400'
  }

  if (loading && checks.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">
            客服质检 <span className="text-xs text-gray-500 align-top">[?]</span>
          </h1>
          <p className="text-sm text-gray-400 mt-1">质检评分管理，支持多维度评分和反馈</p>
        </div>
        <button
          onClick={() => { resetForm(); setShowForm(true) }}
          className="flex items-center gap-1 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm"
        >
          <Plus className="w-4 h-4" />新增质检
        </button>
      </div>

      {/* 质检列表 */}
      {checks.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <Star className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>暂无质检记录</p>
          <p className="text-sm mt-1">点击"新增质检"创建第一条记录</p>
        </div>
      ) : (
        <div className="space-y-3">
          {checks.map(check => {
            const avgScore = Object.values(check.dimensions).length > 0
              ? Object.values(check.dimensions).reduce((a, b) => a + b, 0) / Object.values(check.dimensions).length
              : check.score
            return (
              <div key={check.id} className="bg-gray-800 rounded-xl p-4 border border-gray-700">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <span className={`text-lg font-bold ${getScoreColor(Math.round(avgScore))}`}>
                      {avgScore.toFixed(1)}
                    </span>
                    <span className="text-gray-400 text-sm">/ 10</span>
                    <span className={`px-2 py-0.5 rounded text-xs ${
                      check.status === 'published' ? 'bg-green-900/50 text-green-400' : 'bg-yellow-900/50 text-yellow-400'
                    }`}>
                      {check.status === 'published' ? '已发布' : '草稿'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <span>客服 #{check.staffId}</span>
                    <span>评审 #{check.reviewerId}</span>
                    <span>{new Date(check.createdAt).toLocaleString('zh-CN')}</span>
                    <button
                      onClick={() => editCheck(check)}
                      className="px-2 py-1 bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-400 rounded text-xs"
                    >
                      编辑
                    </button>
                  </div>
                </div>

                {/* 维度评分 */}
                {Object.keys(check.dimensions).length > 0 && (
                  <div className="flex flex-wrap gap-3 mb-2">
                    {Object.entries(check.dimensions).map(([key, val]) => (
                      <span key={key} className="text-xs text-gray-400">
                        {DIMENSION_LABELS[key] || key}: <span className={getScoreColor(val)}>{val}/10</span>
                      </span>
                    ))}
                  </div>
                )}

                {check.feedback && (
                  <div className="text-sm text-gray-400 mt-2 bg-gray-700/50 rounded p-2">
                    {check.feedback}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* 分页 */}
      {total > pageSize && (
        <div className="flex items-center justify-between text-sm text-gray-400">
          <span>共 {total} 条</span>
          <div className="flex gap-2">
            <button disabled={page <= 1} onClick={() => loadChecks(page - 1)} className="px-3 py-1 bg-gray-700 rounded hover:bg-gray-600 disabled:opacity-50">上一页</button>
            <button disabled={page >= Math.ceil(total / pageSize)} onClick={() => loadChecks(page + 1)} className="px-3 py-1 bg-gray-700 rounded hover:bg-gray-600 disabled:opacity-50">下一页</button>
          </div>
        </div>
      )}

      {/* 新增/编辑弹窗 */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-xl p-6 w-full max-w-lg border border-gray-700">
            <h3 className="text-lg font-semibold text-gray-100 mb-4">
              {editingId ? '编辑质检' : '新增质检'}
            </h3>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-gray-400 block mb-1">客服 ID</label>
                  <input
                    type="number"
                    value={form.staffId || ''}
                    onChange={e => setForm({ ...form, staffId: Number(e.target.value) })}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-gray-200 text-sm"
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-400 block mb-1">总分</label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={form.score || 5}
                    onChange={e => setForm({ ...form, score: Number(e.target.value) })}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-gray-200 text-sm"
                  />
                </div>
              </div>

              {/* 维度评分 */}
              <div>
                <label className="text-sm text-gray-400 block mb-2">维度评分</label>
                <div className="grid grid-cols-2 gap-3">
                  {Object.entries(DIMENSION_LABELS).map(([key, label]) => (
                    <div key={key} className="flex items-center gap-2">
                      <span className="text-xs text-gray-400 w-16">{label}</span>
                      <input
                        type="number"
                        min={1}
                        max={10}
                        value={(form.dimensions as Record<string, number>)?.[key] || 5}
                        onChange={e => setForm({
                          ...form,
                          dimensions: { ...form.dimensions as Record<string, number>, [key]: Number(e.target.value) },
                        })}
                        className="w-16 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-gray-200 text-sm"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-sm text-gray-400 block mb-1">反馈备注</label>
                <textarea
                  value={form.feedback || ''}
                  onChange={e => setForm({ ...form, feedback: e.target.value })}
                  rows={3}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-gray-200 text-sm"
                />
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={form.status || 'draft'}
                  onChange={e => setForm({ ...form, status: e.target.value as 'draft' | 'published' })}
                  className="bg-gray-700 border border-gray-600 rounded px-3 py-2 text-gray-200 text-sm"
                >
                  <option value="draft">草稿</option>
                  <option value="published">发布</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => { setShowForm(false); setEditingId(null) }} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm">取消</button>
              <button onClick={editingId ? handleUpdate : handleCreate} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm">
                {editingId ? '更新' : '创建'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}