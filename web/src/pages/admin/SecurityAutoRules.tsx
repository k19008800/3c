import { useEffect, useState, useCallback } from 'react'
import { get, post, put, del } from '@/lib/api'
import { Loader2, Plus } from 'lucide-react'
import FeatureDescription from '@/components/admin/FeatureDescription'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import type { AutoRule, RuleFormData } from './security-rules/types'
import { emptyForm } from './security-rules/types'
import RuleStatsCards from './security-rules/RuleStatsCards'
import RuleList from './security-rules/RuleList'
import RuleForm from './security-rules/RuleForm'

export default function SecurityAutoRules() {
  const [rules, setRules] = useState<AutoRule[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [formDefaults, setFormDefaults] = useState<RuleFormData | undefined>(undefined)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<AutoRule | null>(null)
  const [error, setError] = useState('')

  const fetchRules = useCallback(async () => {
    setLoading(true)
    try {
      const res = await get<{ list: AutoRule[] }>('/api/v1/admin/security/auto-rules')
      setRules(res.list ?? [])
    } catch (err: any) {
      setError(err.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchRules() }, [fetchRules])

  const openCreate = useCallback(() => {
    setEditId(null)
    setFormDefaults(undefined)
    setShowForm(true)
  }, [])

  const openEdit = useCallback((rule: AutoRule) => {
    setEditId(rule.id)
    setFormDefaults({
      name: rule.name,
      description: rule.description ?? '',
      eventType: rule.eventType,
      countThreshold: rule.countThreshold,
      timeWindowSeconds: rule.timeWindowSeconds,
      action: rule.action,
      actionParams: JSON.stringify(rule.actionParams, null, 2),
      enabled: rule.enabled,
    })
    setShowForm(true)
  }, [])

  const handleSave = useCallback(async (form: RuleFormData) => {
    setSaving(true)
    try {
      const body = {
        ...form,
        actionParams: (() => {
          try { return JSON.parse(form.actionParams) } catch { return {} }
        })(),
      }
      if (editId) {
        await put(`/api/v1/admin/security/auto-rules/${editId}`, body)
      } else {
        await post('/api/v1/admin/security/auto-rules', body)
      }
      setShowForm(false)
      await fetchRules()
    } catch (err: any) {
      setError(err.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }, [editId, fetchRules])

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return
    try {
      await del(`/api/v1/admin/security/auto-rules/${deleteTarget.id}`)
      setDeleteTarget(null)
      await fetchRules()
    } catch (err: any) {
      setError(err.message || '删除失败')
    }
  }, [deleteTarget, fetchRules])

  const toggleEnabled = useCallback(async (rule: AutoRule) => {
    try {
      await put(`/api/v1/admin/security/auto-rules/${rule.id}`, { enabled: !rule.enabled })
      await fetchRules()
    } catch (err: any) {
      setError(err.message || '操作失败')
    }
  }, [fetchRules])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin" size={32} />
      </div>
    )
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900">自动处置规则</h1>
          <FeatureDescription page="admin/security/auto-rules" className="ml-2" />
          <p className="text-sm text-slate-500 mt-1">
            配置安全事件的自动响应规则，支持按事件类型+触发条件自动执行封禁/通知等操作
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition"
        >
          <Plus size={16} /> 新增规则
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 px-4 py-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
          {error}
        </div>
      )}

      {/* Stats Cards */}
      <div className="mb-4">
        <RuleStatsCards rules={rules} />
      </div>

      {/* Rule List */}
      <RuleList
        rules={rules}
        onEdit={openEdit}
        onDelete={setDeleteTarget}
        onToggle={toggleEnabled}
      />

      {/* Create/Edit Modal */}
      <RuleForm
        open={showForm}
        editId={editId}
        saving={saving}
        initialData={formDefaults}
        onSubmit={handleSave}
        onClose={() => setShowForm(false)}
      />

      {/* Delete Confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="删除规则"
        message={`确定删除规则「${deleteTarget?.name}」?此操作不可撤销。`}
        variant="danger"
        confirmLabel="删除"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
