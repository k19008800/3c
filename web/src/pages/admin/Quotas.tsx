// ── 额度管理入口页 ──
// 组合 QuotaStatsCards + CreateForm + QuotaList + EditModal

import { useEffect, useState, useCallback, useMemo } from 'react'
import { get, post, put, del } from '@/lib/api'
import FeatureDescription from '@/components/admin/FeatureDescription'
import { usePersistedFilters } from '@/hooks/use-persisted-filters'
import { Gauge, Plus } from 'lucide-react'
import type { QuotaRecord, QuotaCreateForm, QuotaEditForm } from './quotas/types'
import QuotaStatsCards from './quotas/QuotaStatsCards'
import QuotaList from './quotas/QuotaList'
import { CreateForm, EditModal } from './quotas/QuotaForm'

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
  const { searchUserId, status: statusFilter, page, pageSize } = filters as {
    searchUserId: string
    status: string
    page: number
    pageSize: number
  }
  const limit = pageSize
  const offset = (page - 1) * limit
  const totalPages = Math.ceil(total / limit)

  // ── Create form state ──
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState<QuotaCreateForm>({
    userId: '', quotaType: 'monthly', quotaAmount: '', alertPercent: '80',
    periodStart: '', periodEnd: '', reason: '', rpmLimit: null, tpmLimit: null,
  })
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')
  const [formSuccess, setFormSuccess] = useState('')

  // ── Edit form state ──
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState<QuotaEditForm>({
    quotaAmount: '', usedAmount: '', alertPercent: '', periodEnd: '',
    reason: '', rpmLimit: null, tpmLimit: null,
  })
  const [editSubmitting, setEditSubmitting] = useState(false)
  const [editError, setEditError] = useState('')

  // ── Stats ──
  const stats = useMemo(() => {
    if (loading || quotas.length === 0) return { active: 0, expired: 0, totalAmount: 0 }
    const now = new Date()
    let active = 0
    let expired = 0
    let totalAmount = 0
    for (const q of quotas) {
      const start = new Date(q.periodStart)
      const end = new Date(q.periodEnd)
      if (now >= start && now <= end) active++
      else expired++
      totalAmount += parseFloat(q.quotaAmount)
    }
    return { active, expired, totalAmount }
  }, [quotas, loading])

  // ── Data fetching ──
  const fetchQuotas = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params: any = { limit, offset }
      if (searchUserId) params.user_id = searchUserId
      if (statusFilter) params.status = statusFilter
      const data = await get<{ items: QuotaRecord[]; total: number }>(
        '/api/v1/admin/quotas', params,
      )
      setQuotas(data.items || [])
      setTotal(data.total)
    } catch (err: any) {
      setError(err.message || '获取额度列表失败')
    } finally {
      setLoading(false)
    }
  }, [limit, page, searchUserId, statusFilter])

  useEffect(() => {
    fetchQuotas()
  }, [fetchQuotas])

  // ── Create ──
  const handleCreate = useCallback(async () => {
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
      setForm({
        userId: '', quotaType: 'monthly', quotaAmount: '', alertPercent: '80',
        periodStart: '', periodEnd: '', reason: '', rpmLimit: null, tpmLimit: null,
      })
      setFormOpen(false)
      fetchQuotas()
    } catch (err: any) {
      setFormError(err.message || '设置失败')
    } finally {
      setSubmitting(false)
    }
  }, [form, fetchQuotas])

  // ── Delete ──
  const handleDelete = useCallback(
    async (record: QuotaRecord) => {
      if (!window.confirm('确认删除该额度规则?')) return
      try {
        await del('/api/v1/admin/quotas/' + record.id)
        fetchQuotas()
      } catch (err: any) {
        setError(err.message || '删除失败')
      }
    },
    [fetchQuotas],
  )

  // ── Edit ──
  const handleEditOpen = useCallback((record: QuotaRecord) => {
    setEditingId(record.id)
    setEditForm({
      quotaAmount: record.quotaAmount,
      usedAmount: record.usedAmount || '0',
      alertPercent: record.alertPercent,
      periodEnd: record.periodEnd.slice(0, 16),
      reason: record.reason || '',
      rpmLimit: record.rpmLimit,
      tpmLimit: record.tpmLimit,
    })
    setEditError('')
  }, [])

  const handleEditSave = useCallback(
    async (id: number) => {
      setEditError('')
      setEditSubmitting(true)
      try {
        const body: any = {}
        if (editForm.quotaAmount) body.quotaAmount = editForm.quotaAmount
        if (editForm.usedAmount !== '') body.usedAmount = editForm.usedAmount
        if (editForm.alertPercent)
          body.alertPercent = parseInt(editForm.alertPercent, 10)
        if (editForm.periodEnd) body.periodEnd = editForm.periodEnd
        if (editForm.reason) body.reason = editForm.reason
        if (editForm.rpmLimit !== undefined)
          body.rpmLimit = editForm.rpmLimit || null
        if (editForm.tpmLimit !== undefined)
          body.tpmLimit = editForm.tpmLimit || null

        await put(`/api/v1/admin/quotas/${id}`, body)
        setEditingId(null)
        fetchQuotas()
      } catch (err: any) {
        setEditError(err.message || '修改失败')
      } finally {
        setEditSubmitting(false)
      }
    },
    [editForm, fetchQuotas],
  )

  return (
    <div className="space-y-6">
      {/* Header */}
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

      {/* Stats Cards */}
      <QuotaStatsCards
        totalQuotas={total}
        activeCount={stats.active}
        expiredCount={stats.expired}
        totalAmount={stats.totalAmount}
        loading={loading}
      />

      {/* Create form */}
      <CreateForm
        form={form}
        formOpen={formOpen}
        submitting={submitting}
        formError={formError}
        formSuccess={formSuccess}
        onSetForm={setForm}
        onSubmit={handleCreate}
        onCancel={() => setFormOpen(false)}
      />

      {/* List with filters */}
      <QuotaList
        quotas={quotas}
        total={total}
        loading={loading}
        error={error}
        page={page}
        totalPages={totalPages}
        searchUserId={searchUserId}
        statusFilter={statusFilter}
        onSetFilter={(key, value) => setFilter(key as any, value)}
        onResetFilters={resetFilters}
        onHasActiveFilters={hasActiveFilters}
        onSearch={fetchQuotas}
        onEdit={handleEditOpen}
        onDelete={handleDelete}
      />

      {/* Edit modal */}
      <EditModal
        editingId={editingId}
        editForm={editForm}
        editSubmitting={editSubmitting}
        editError={editError}
        onSetEditForm={setEditForm}
        onSave={handleEditSave}
        onCancel={() => setEditingId(null)}
      />
    </div>
  )
}
