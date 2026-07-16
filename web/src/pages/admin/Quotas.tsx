import { useEffect, useState, useCallback } from 'react'
import { get, post, put, del } from '@/lib/api'
import FilterBar from '@/components/ui/FilterBar'
import FeatureDescription from '@/components/admin/FeatureDescription'
import PaginationBar from '@/components/ui/PaginationBar'
import { usePersistedFilters } from '@/hooks/use-persisted-filters'
import {
  Loader2, Gauge, Plus, AlertCircle, CheckCircle2, Calendar,
} from 'lucide-react'

interface QuotaRecord {
  id: number
  userId: number
  userEmail: string | null
  userNickname: string | null
  quotaType: string
  quotaAmount: string
  usedAmount: string | null
  alertPercent: string
  periodStart: string
  periodEnd: string
  setBy: number
  setByRole: string
  rpmLimit: number | null
  tpmLimit: number | null
  reason: string | null
  createdAt: string
  updatedAt: string | null
}

export default function AdminQuotas() {
  const [quotas, setQuotas] = useState<QuotaRecord[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // ── 持久化筛选 ──
  const { filters, setFilter, resetFilters, hasActiveFilters } = usePersistedFilters({
    storageKey: 'admin-quotas',
    defaults: { searchUserId: '', status: '', page: 1, pageSize: 20 },
  })
  const { searchUserId, status: statusFilter, page, pageSize } = filters as { searchUserId: string; status: string; page: number; pageSize: number }
  const limit = pageSize
  const offset = (page - 1) * limit

  // Create form
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState({
    userId: '', quotaType: 'monthly', quotaAmount: '', alertPercent: '80',
    periodStart: '', periodEnd: '', reason: '',
    rpmLimit: null as number | null,
    tpmLimit: null as number | null,
  })
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')
  const [formSuccess, setFormSuccess] = useState('')

  // Edit form
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState({ quotaAmount: '', usedAmount: '', alertPercent: '', periodEnd: '', reason: '', rpmLimit: null as number | null, tpmLimit: null as number | null })
  const [editSubmitting, setEditSubmitting] = useState(false)
  const [editError, setEditError] = useState('')

  const fetchQuotas = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params: any = { limit, offset }
      if (searchUserId) params.user_id = searchUserId
      if (statusFilter) params.status = statusFilter
      const data = await get<{ items: QuotaRecord[]; total: number }>('/api/v1/admin/quotas', params)
      setQuotas(data.items || [])
      setTotal(data.total)
    } catch (err: any) {
      setError(err.message || '获取额度列表失败')
    } finally { setLoading(false) }
  }, [limit, page, searchUserId, statusFilter])

  useEffect(() => { fetchQuotas() }, [fetchQuotas])

  const handleCreate = async () => {
    setFormError('')
    setFormSuccess('')
    if (!form.userId || !form.quotaAmount || !form.periodStart || !form.periodEnd) {
      setFormError('请填写用户ID、额度金额和周期')
      return
    }
    setSubmitting(true)
    try {
      await post('/api/v1/admin/quotas', {
        userId: parseInt(form.userId, 10),
        quotaType: form.quotaType,
        quotaAmount: form.quotaAmount,
        alertPercent: parseInt(form.alertPercent, 10) || 80,
        periodStart: form.periodStart,
        periodEnd: form.periodEnd,
        reason: form.reason || undefined,
        rpmLimit: form.rpmLimit || undefined,
        tpmLimit: form.tpmLimit || undefined,
      })
      setFormSuccess('额度设置成功')
      setForm({ userId: '', quotaType: 'monthly', quotaAmount: '', alertPercent: '80', periodStart: '', periodEnd: '', reason: '', rpmLimit: null, tpmLimit: null })
      setFormOpen(false)
      fetchQuotas()
    } catch (err: any) {
      setFormError(err.message || '设置失败')
    } finally { setSubmitting(false) }
  }

  const handleDelete = async (record: QuotaRecord) => {
    if (!window.confirm('确认删除该额度规则？')) return
    try {
      await del('/api/v1/admin/quotas/' + record.id)
      fetchQuotas()
    } catch (err: any) {
      setError(err.message || '删除失败')
    }
  }

  const handleEdit = async (id: number) => {
    setEditError('')
    setEditSubmitting(true)
    try {
      const body: any = {}
      if (editForm.quotaAmount) body.quotaAmount = editForm.quotaAmount
      if (editForm.usedAmount !== '') body.usedAmount = editForm.usedAmount
      if (editForm.alertPercent) body.alertPercent = parseInt(editForm.alertPercent, 10)
      if (editForm.periodEnd) body.periodEnd = editForm.periodEnd
      if (editForm.reason) body.reason = editForm.reason
      if (editForm.rpmLimit !== undefined) body.rpmLimit = editForm.rpmLimit || null
      if (editForm.tpmLimit !== undefined) body.tpmLimit = editForm.tpmLimit || null

      await put(`/api/v1/admin/quotas/${id}`, body)
      setEditingId(null)
      fetchQuotas()
    } catch (err: any) {
      setEditError(err.message || '修改失败')
    } finally { setEditSubmitting(false) }
  }

  const usagePercent = (record: QuotaRecord) => {
    const used = parseFloat(record.usedAmount || '0')
    const total = parseFloat(record.quotaAmount)
    return total > 0 ? (used / total) * 100 : 0
  }

  const isActive = (record: QuotaRecord) => {
    const now = new Date()
    const start = new Date(record.periodStart)
    const end = new Date(record.periodEnd)
    return now >= start && now <= end
  }

  const totalPages = Math.ceil(total / limit)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Gauge size={28} className="text-indigo-600" />
          <h1 className="text-2xl font-bold text-slate-900">额度管理</h1>
          <FeatureDescription page="admin/quotas" className="ml-2" />
        </div>
        <button
          onClick={() => setFormOpen(!formOpen)}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition text-sm"
        >
          <Plus size={16} />
          设置额度
        </button>
      </div>

      {/* Create form */}
      {formOpen && (
        <div className="bg-white rounded-xl p-6 shadow-sm border border-indigo-200 space-y-4">
          <h3 className="font-semibold text-slate-900">设置用户额度</h3>

          {formError && (
            <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm">
              <AlertCircle size={16} />
              {formError}
            </div>
          )}
          {formSuccess && (
            <div className="flex items-center gap-2 text-green-700 bg-green-50 p-3 rounded-lg text-sm">
              <CheckCircle2 size={16} />
              {formSuccess}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">用户 ID *</label>
              <input type="number" value={form.userId} onChange={(e) => setForm(f => ({ ...f, userId: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">额度类型</label>
              <select value={form.quotaType} onChange={(e) => setForm(f => ({ ...f, quotaType: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="monthly">月度额度</option>
                <option value="one_time">一次性额度</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">额度金额 (￥) *</label>
              <input type="number" step="0.01" min="0" value={form.quotaAmount} onChange={(e) => setForm(f => ({ ...f, quotaAmount: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">告警百分比(%)</label>
              <input type="number" min="0" max="100" value={form.alertPercent} onChange={(e) => setForm(f => ({ ...f, alertPercent: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">RPM 限制（可选）</label>
              <input type="number" min="0" value={form.rpmLimit ?? ''} onChange={(e) => setForm(f => ({ ...f, rpmLimit: e.target.value ? parseInt(e.target.value) : null }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="每分钟请求数" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">TPM 限制（可选）</label>
              <input type="number" min="0" value={form.tpmLimit ?? ''} onChange={(e) => setForm(f => ({ ...f, tpmLimit: e.target.value ? parseInt(e.target.value) : null }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="每分钟 Token 数" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">开始时间 *</label>
              <input type="datetime-local" value={form.periodStart} onChange={(e) => setForm(f => ({ ...f, periodStart: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">结束时间 *</label>
              <input type="datetime-local" value={form.periodEnd} onChange={(e) => setForm(f => ({ ...f, periodEnd: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div className="md:col-span-3">
              <label className="block text-sm font-medium text-slate-700 mb-1">备注</label>
              <input type="text" value={form.reason} onChange={(e) => setForm(f => ({ ...f, reason: e.target.value }))}
                placeholder="可选" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
          </div>

          <div className="flex gap-2">
            <button onClick={handleCreate} disabled={submitting}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition text-sm flex items-center gap-2">
              {submitting && <Loader2 className="animate-spin" size={16} />}
              确认设置
            </button>
            <button onClick={() => setFormOpen(false)} className="px-4 py-2 border border-slate-300 text-slate-600 rounded-lg hover:bg-slate-50 transition text-sm">
              取消
            </button>
          </div>
        </div>
      )}

      {/* Filters — 持久化筛选栏 */}
      <FilterBar
        filters={{ searchUserId, status: statusFilter }}
        setFilter={(key, value) => setFilter(key as any, value)}
        resetFilters={resetFilters}
        hasActiveFilters={hasActiveFilters}
        onSearch={fetchQuotas}
        fields={[
          { key: 'searchUserId', label: '用户 ID', type: 'number', placeholder: '用户 ID' },
          { key: 'status', label: '状态', type: 'select', options: [
            { value: '', label: '全部状态' },
            { value: 'active', label: '生效中' },
            { value: 'expired', label: '已过期' },
          ]},
        ]}
      />

      {/* List */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="animate-spin" size={24} /></div>
        ) : error ? (
          <div className="flex items-center gap-2 text-red-600 bg-red-50 p-4 m-4 rounded-lg text-sm">
            <AlertCircle size={16} />
            {error}
          </div>
        ) : quotas.length === 0 ? (
          <div className="py-12 text-center text-slate-400 text-sm">暂无额度记录</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 text-left">
                  <th className="px-4 py-3 text-sm font-medium text-slate-500">用户</th>
                  <th className="px-4 py-3 text-sm font-medium text-slate-500">设置者</th>
                  <th className="px-4 py-3 text-sm font-medium text-slate-500">类型</th>
                  <th className="px-4 py-3 text-sm font-medium text-slate-500">RPM</th>
                  <th className="px-4 py-3 text-sm font-medium text-slate-500">TPM</th>
                  <th className="px-4 py-3 text-sm font-medium text-slate-500">额度金额</th>
                  <th className="px-4 py-3 text-sm font-medium text-slate-500">已使用</th>
                  <th className="px-4 py-3 text-sm font-medium text-slate-500">使用率</th>
                  <th className="px-4 py-3 text-sm font-medium text-slate-500">状态</th>
                  <th className="px-4 py-3 text-sm font-medium text-slate-500">周期</th>
                  <th className="px-4 py-3 text-sm font-medium text-slate-500">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {quotas.map(q => {
                  const usage = usagePercent(q)
                  const active = isActive(q)
                  const exceeded = usage >= parseFloat(q.alertPercent)
                  return (
                    <tr key={q.id} className="hover:bg-slate-50 transition">
                      <td className="px-4 py-3">
                        <div className="text-sm font-medium text-slate-900">{q.userNickname || q.userEmail || `#${q.userId}`}</div>
                        <div className="text-xs text-slate-400">ID: {q.userId}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                          q.setByRole === 'admin' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'
                        }`}>
                          {q.setByRole === 'admin' ? '管理员' : '代理商'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">{q.quotaType === 'monthly' ? '月度' : '一次性'}</td>
                      <td className="px-4 py-3 text-sm text-slate-600">{q.rpmLimit ?? '-'}</td>
                      <td className="px-4 py-3 text-sm text-slate-600">{q.tpmLimit ?? '-'}</td>
                      <td className="px-4 py-3 text-sm font-medium text-slate-900">￥{Number(q.quotaAmount).toFixed(2)}</td>
                      <td className="px-4 py-3 text-sm text-slate-600">￥{Number(q.usedAmount || 0).toFixed(2)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-2 bg-slate-200 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${usage >= 90 ? 'bg-red-500' : exceeded ? 'bg-amber-500' : 'bg-green-500'}`}
                              style={{ width: `${Math.min(100, usage)}%` }} />
                          </div>
                          <span className={`text-xs font-medium ${usage >= 90 ? 'text-red-600' : exceeded ? 'text-amber-600' : 'text-green-600'}`}>
                            {usage.toFixed(1)}%
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                          active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
                        }`}>
                          {active ? '生效中' : '已过期'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                        <span className="flex items-center gap-1">
                          <Calendar size={12} />
                          {new Date(q.periodStart).toLocaleDateString('zh-CN')} ~ {new Date(q.periodEnd).toLocaleDateString('zh-CN')}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button onClick={() => {
                          setEditingId(q.id)
                          setEditForm({
                            quotaAmount: q.quotaAmount,
                            usedAmount: q.usedAmount || '0',
                            alertPercent: q.alertPercent,
                            periodEnd: q.periodEnd.slice(0, 16),
                            reason: q.reason || '',
                            rpmLimit: q.rpmLimit,
                            tpmLimit: q.tpmLimit,
                          })
                          setEditError('')
                        }} className="text-xs text-blue-600 hover:text-blue-800 transition">
                          修改
                        </button>
                        <button onClick={() => handleDelete(q)} className="text-xs text-red-600 hover:text-red-800 transition ml-2">
                          删除
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {total > 0 && (
          <PaginationBar page={page} total={total} totalPages={totalPages} onPageChange={(p) => setFilter('page', p)} />
        )}
      </div>

      {/* Edit modal */}
      {editingId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setEditingId(null)}>
          <div className="bg-white rounded-xl p-6 max-w-lg w-full mx-4 shadow-xl space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-slate-900">修改额度 (ID: {editingId})</h3>

            {editError && (
              <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm">
                <AlertCircle size={16} />
                {editError}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">额度金额</label>
                <input type="number" step="0.01" value={editForm.quotaAmount} onChange={(e) => setEditForm(f => ({ ...f, quotaAmount: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">已使用</label>
                <input type="number" step="0.01" value={editForm.usedAmount} onChange={(e) => setEditForm(f => ({ ...f, usedAmount: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">告警百分比</label>
                <input type="number" min="0" max="100" value={editForm.alertPercent} onChange={(e) => setEditForm(f => ({ ...f, alertPercent: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">RPM 限制</label>
                <input type="number" min="0" value={editForm.rpmLimit ?? ''} onChange={(e) => setEditForm(f => ({ ...f, rpmLimit: e.target.value ? parseInt(e.target.value) : null }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">TPM 限制</label>
                <input type="number" min="0" value={editForm.tpmLimit ?? ''} onChange={(e) => setEditForm(f => ({ ...f, tpmLimit: e.target.value ? parseInt(e.target.value) : null }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">结束时间</label>
                <input type="datetime-local" value={editForm.periodEnd} onChange={(e) => setEditForm(f => ({ ...f, periodEnd: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">备注</label>
                <input type="text" value={editForm.reason} onChange={(e) => setEditForm(f => ({ ...f, reason: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
            </div>

            <div className="flex gap-2">
              <button onClick={() => handleEdit(editingId)} disabled={editSubmitting}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition text-sm flex items-center gap-2">
                {editSubmitting && <Loader2 className="animate-spin" size={16} />}
                保存
              </button>
              <button onClick={() => setEditingId(null)}
                className="px-4 py-2 border border-slate-300 text-slate-600 rounded-lg hover:bg-slate-50 transition text-sm">
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}