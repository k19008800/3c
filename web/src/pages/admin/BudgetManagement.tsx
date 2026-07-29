import { useEffect, useState, useCallback } from 'react'
import { get, post, put, del } from '@/lib/api'
import { Loader2, AlertCircle, CheckCircle2, Plus, Save, Edit2, Trash2, DollarSign } from 'lucide-react'
import FeatureDescription from '@/components/admin/FeatureDescription'

interface BudgetQuota {
  id: number
  userId: number
  username?: string
  quotaType: string
  quotaAmount: string
  usedAmount?: string
  alertPercent: string
  periodStart: string
  periodEnd: string
  rpmLimit?: number
  tpmLimit?: number
  reason?: string
  setBy: number
  setByRole: string
  status: string
  createdAt: string
  updatedAt: string
}

const QUOTA_TYPES = [
  { value: 'monthly', label: '月预算' },
  { value: 'daily', label: '日预算' },
  { value: 'total', label: '总额预算' },
]

export default function AdminBudgetManagement() {
  const [quotas, setQuotas] = useState<BudgetQuota[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const pageSize = 20

  // 表单状态
  const [form, setForm] = useState({
    userId: 0,
    quotaType: 'monthly',
    quotaAmount: '',
    alertPercent: '80',
    periodStart: '',
    periodEnd: '',
    rpmLimit: '',
    tpmLimit: '',
    reason: '',
  })

  const fetchQuotas = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await get<{ list: BudgetQuota[]; total: number }>('/api/v1/admin/quotas', { page, pageSize })
      setQuotas(data.list || [])
      setTotal(data.total || 0)
    } catch (err: any) {
      setError(err.message || '获取预算列表失败')
    } finally {
      setLoading(false)
    }
  }, [page])

  useEffect(() => { fetchQuotas() }, [fetchQuotas])

  const resetForm = () => {
    setForm({ userId: 0, quotaType: 'monthly', quotaAmount: '', alertPercent: '80', periodStart: '', periodEnd: '', rpmLimit: '', tpmLimit: '', reason: '' })
    setEditingId(null)
  }

  const handleEdit = (q: BudgetQuota) => {
    setForm({
      userId: q.userId,
      quotaType: q.quotaType,
      quotaAmount: q.quotaAmount,
      alertPercent: q.alertPercent,
      periodStart: q.periodStart?.slice(0, 16) || '',
      periodEnd: q.periodEnd?.slice(0, 16) || '',
      rpmLimit: q.rpmLimit?.toString() || '',
      tpmLimit: q.tpmLimit?.toString() || '',
      reason: q.reason || '',
    })
    setEditingId(q.id)
    setShowForm(true)
  }

  const handleSave = async () => {
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      if (editingId) {
        await put(`/api/v1/admin/quotas/${editingId}`, { ...form, quotaAmount: Number(form.quotaAmount), alertPercent: Number(form.alertPercent), rpmLimit: form.rpmLimit ? Number(form.rpmLimit) : undefined, tpmLimit: form.tpmLimit ? Number(form.tpmLimit) : undefined })
        setSuccess('预算已更新')
      } else {
        await post('/api/v1/admin/quotas', { ...form, quotaAmount: Number(form.quotaAmount), alertPercent: Number(form.alertPercent), rpmLimit: form.rpmLimit ? Number(form.rpmLimit) : undefined, tpmLimit: form.tpmLimit ? Number(form.tpmLimit) : undefined })
        setSuccess('预算已创建')
      }
      setShowForm(false)
      resetForm()
      fetchQuotas()
      setTimeout(() => setSuccess(''), 3000)
    } catch (err: any) {
      setError(err.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('确定删除此预算配置？')) return
    try {
      await del(`/api/v1/admin/quotas/${id}`)
      setSuccess('预算已删除')
      fetchQuotas()
    } catch (err: any) {
      setError(err.message || '删除失败')
    }
  }

  const totalPages = Math.ceil(total / pageSize)

  if (loading && quotas.length === 0) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="animate-spin" size={32} />
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <DollarSign className="text-blue-600" size={28} />
              预算管理
              <FeatureDescription pageId="admin-budget" />
            </h1>
            <p className="text-slate-500 mt-1">管理用户和 API Key 的预算配额、熔断阈值和速率限制</p>
          </div>
          <button
            onClick={() => { resetForm(); setShowForm(true) }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
          >
            <Plus size={16} />
            新增预算
          </button>
        </div>

        {error && (
          <div className="mb-4 flex items-center gap-2 p-3 text-sm text-red-600 bg-red-50 rounded-lg border border-red-200">
            <AlertCircle size={16} /> {error}
          </div>
        )}
        {success && (
          <div className="mb-4 flex items-center gap-2 p-3 text-sm text-green-600 bg-green-50 rounded-lg border border-green-200">
            <CheckCircle2 size={16} /> {success}
          </div>
        )}

        {/* 预算表单弹窗 */}
        {showForm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowForm(false)}>
            <div className="bg-white rounded-lg p-6 max-w-lg w-full m-4 shadow-xl" onClick={e => e.stopPropagation()}>
              <h2 className="text-lg font-semibold text-slate-900 mb-4">
                {editingId ? '编辑预算' : '新增预算'}
              </h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">用户 ID</label>
                  <input type="number" value={form.userId} onChange={e => setForm(f => ({ ...f, userId: parseInt(e.target.value) || 0 }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">预算类型</label>
                    <select value={form.quotaType} onChange={e => setForm(f => ({ ...f, quotaType: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none">
                      {QUOTA_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">预算金额（元）</label>
                    <input type="number" step="0.01" value={form.quotaAmount} onChange={e => setForm(f => ({ ...f, quotaAmount: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">告警阈值（%）</label>
                  <input type="number" min="1" max="100" value={form.alertPercent} onChange={e => setForm(f => ({ ...f, alertPercent: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                  <p className="text-xs text-slate-400 mt-1">当使用量达到此百分比时触发告警</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">生效时间</label>
                    <input type="datetime-local" value={form.periodStart} onChange={e => setForm(f => ({ ...f, periodStart: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">到期时间</label>
                    <input type="datetime-local" value={form.periodEnd} onChange={e => setForm(f => ({ ...f, periodEnd: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">RPM 限制</label>
                    <input type="number" value={form.rpmLimit} onChange={e => setForm(f => ({ ...f, rpmLimit: e.target.value }))}
                      placeholder="可选" className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">TPM 限制</label>
                    <input type="number" value={form.tpmLimit} onChange={e => setForm(f => ({ ...f, tpmLimit: e.target.value }))}
                      placeholder="可选" className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">设置原因</label>
                  <textarea value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                    rows={2} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-200">
                <button onClick={() => setShowForm(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition">取消</button>
                <button onClick={handleSave} disabled={saving}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition">
                  {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                  保存
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 预算列表 */}
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left px-4 py-3 text-sm font-medium text-slate-600">用户ID</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-slate-600">类型</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-slate-600">预算金额</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-slate-600">告警阈值</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-slate-600">生效期</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-slate-600">状态</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-slate-600">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {quotas.map(q => (
                <tr key={q.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-sm text-slate-900">{q.userId}</td>
                  <td className="px-4 py-3 text-sm text-slate-600">{QUOTA_TYPES.find(t => t.value === q.quotaType)?.label || q.quotaType}</td>
                  <td className="px-4 py-3 text-sm text-right font-mono">{q.quotaAmount}</td>
                  <td className="px-4 py-3 text-sm text-right">{q.alertPercent}%</td>
                  <td className="px-4 py-3 text-sm text-slate-500">
                    {q.periodStart?.slice(0, 10)} ~ {q.periodEnd?.slice(0, 10)}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span className={`px-2 py-0.5 rounded-full text-xs ${
                      q.status === 'active' ? 'bg-green-100 text-green-700' :
                      q.status === 'expired' ? 'bg-slate-100 text-slate-500' : 'bg-yellow-100 text-yellow-700'
                    }`}>{q.status === 'active' ? '生效中' : q.status === 'expired' ? '已过期' : q.status}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => handleEdit(q)} className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded transition">
                        <Edit2 size={14} />
                      </button>
                      <button onClick={() => handleDelete(q.id)} className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded transition">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {quotas.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-slate-400">
                    暂无预算配置，点击右上角「新增预算」创建
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* 分页 */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4">
            <span className="text-sm text-slate-500">共 {total} 条</span>
            <div className="flex gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg disabled:opacity-50 hover:bg-slate-50 transition">上一页</button>
              <span className="px-3 py-1.5 text-sm text-slate-600">第 {page} / {totalPages} 页</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg disabled:opacity-50 hover:bg-slate-50 transition">下一页</button>
            </div>
          </div>
        )}

        {/* 预算熔断说明 */}
        <div className="mt-6 bg-blue-50 rounded-lg border border-blue-200 p-4">
          <h3 className="text-sm font-medium text-blue-800 mb-1">预算熔断机制</h3>
          <p className="text-sm text-blue-600">
            当用户消费达到预算金额的 <strong>alertPercent%</strong> 时，系统发送告警通知。
            达到 100% 时触发预算熔断，请求将返回 <code className="bg-blue-100 px-1 rounded">E037 QUOTA_EXCEEDED</code> 错误。
            熔断优先于限流检查。通过设置 RPM/TPM 限制，可在预算熔断前实施速率控制。
          </p>
        </div>
      </div>
    </div>
  )
}
