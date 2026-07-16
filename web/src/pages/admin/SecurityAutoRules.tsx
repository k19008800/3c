import { useEffect, useState, useCallback } from 'react'
import { get, post, put, del } from '@/lib/api'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { Plus, Pencil, Trash2, Loader2, ShieldAlert } from 'lucide-react'

// ── Types ──

interface AutoRule {
  id: number
  name: string
  description: string | null
  eventType: string
  countThreshold: number
  timeWindowSeconds: number
  action: string
  actionParams: Record<string, any>
  enabled: boolean
  createdAt: string
  updatedAt: string
}

interface RuleFormData {
  name: string
  description: string
  eventType: string
  countThreshold: number
  timeWindowSeconds: number
  action: string
  actionParams: string
  enabled: boolean
}

const EVENT_TYPES = [
  { value: 'login_failed', label: '登录失败' },
  { value: 'brute_force', label: '暴力破解' },
  { value: 'unusual_ip', label: '异常IP' },
  { value: 'multi_device', label: '多设备登录' },
  { value: 'suspicious_operation', label: '可疑操作' },
  { value: 'api_abuse', label: 'API滥用' },
]

const ACTIONS = [
  { value: 'ban_ip', label: '封禁IP' },
  { value: 'ban_user', label: '封禁用户' },
  { value: 'notify_admin', label: '通知管理员' },
  { value: 'limit_login', label: '限制登录' },
]

const emptyForm: RuleFormData = {
  name: '', description: '', eventType: 'login_failed',
  countThreshold: 5, timeWindowSeconds: 300, action: 'notify_admin',
  actionParams: '{}', enabled: true,
}

export default function SecurityAutoRules() {
  const [rules, setRules] = useState<AutoRule[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [form, setForm] = useState<RuleFormData>(emptyForm)
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

  const openCreate = () => {
    setEditId(null)
    setForm(emptyForm)
    setShowForm(true)
  }

  const openEdit = (rule: AutoRule) => {
    setEditId(rule.id)
    setForm({
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
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const body = {
        ...form,
        actionParams: (() => { try { return JSON.parse(form.actionParams) } catch { return {} } })(),
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
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await del(`/api/v1/admin/security/auto-rules/${deleteTarget.id}`)
      setDeleteTarget(null)
      await fetchRules()
    } catch (err: any) {
      setError(err.message || '删除失败')
    }
  }

  const toggleEnabled = async (rule: AutoRule) => {
    try {
      await put(`/api/v1/admin/security/auto-rules/${rule.id}`, { enabled: !rule.enabled })
      await fetchRules()
    } catch (err: any) {
      setError(err.message || '操作失败')
    }
  }

  const eventTypeLabel = (v: string) => EVENT_TYPES.find(e => e.value === v)?.label ?? v
  const actionLabel = (v: string) => ACTIONS.find(a => a.value === v)?.label ?? v

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

      {error && (
        <div className="mb-4 px-4 py-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
          {error}
        </div>
      )}

      {/* Rule List */}
      {rules.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <ShieldAlert size={48} className="mx-auto mb-3 opacity-50" />
          <p className="text-lg font-medium">暂无自动规则</p>
          <p className="text-sm mt-1">点击"新增规则"创建第一条自动处置规则</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rules.map(rule => (
            <div
              key={rule.id}
              className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-4 hover:shadow-sm transition"
            >
              {/* 开关 */}
              <button
                onClick={() => toggleEnabled(rule)}
                className={`shrink-0 w-10 h-6 rounded-full transition-colors relative ${
                  rule.enabled ? 'bg-green-500' : 'bg-slate-300'
                }`}
              >
                <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                  rule.enabled ? 'translate-x-[18px]' : 'translate-x-0.5'
                }`} />
              </button>

              {/* 信息 */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-slate-900">{rule.name}</span>
                  <span className="text-xs text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                    {eventTypeLabel(rule.eventType)}
                  </span>
                  <span className={`text-xs px-1.5 py-0.5 rounded ${
                    rule.action === 'ban_ip' || rule.action === 'ban_user'
                      ? 'bg-red-50 text-red-600'
                      : 'bg-amber-50 text-amber-600'
                  }`}>
                    {actionLabel(rule.action)}
                  </span>
                </div>
                {rule.description && (
                  <p className="text-xs text-slate-500 mt-0.5 truncate">{rule.description}</p>
                )}
                <p className="text-xs text-slate-400 mt-0.5">
                  触发条件：{rule.timeWindowSeconds}秒内 {rule.countThreshold} 次
                  {rule.actionParams?.banDurationSeconds && ` → 封禁 ${rule.actionParams.banDurationSeconds}秒`}
                </p>
              </div>

              {/* 操作 */}
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => openEdit(rule)}
                  className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-blue-600 transition"
                  title="编辑"
                >
                  <Pencil size={15} />
                </button>
                <button
                  onClick={() => setDeleteTarget(rule)}
                  className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-red-600 transition"
                  title="删除"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => !saving && setShowForm(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 p-6" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-slate-900 mb-4">
              {editId ? '编辑规则' : '新增规则'}
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">规则名称 *</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">描述</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" rows={2} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">事件类型</label>
                  <select value={form.eventType} onChange={e => setForm(f => ({ ...f, eventType: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white">
                    {EVENT_TYPES.map(et => <option key={et.value} value={et.value}>{et.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">执行动作</label>
                  <select value={form.action} onChange={e => setForm(f => ({ ...f, action: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white">
                    {ACTIONS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">触发次数</label>
                  <input type="number" value={form.countThreshold} onChange={e => setForm(f => ({ ...f, countThreshold: parseInt(e.target.value) || 1 }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" min={1} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">时间窗口(秒)</label>
                  <input type="number" value={form.timeWindowSeconds} onChange={e => setForm(f => ({ ...f, timeWindowSeconds: parseInt(e.target.value) || 60 }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" min={1} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">动作参数 (JSON)</label>
                <textarea value={form.actionParams} onChange={e => setForm(f => ({ ...f, actionParams: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono" rows={2}
                  placeholder='{"banDurationSeconds": 3600}' />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowForm(false)} disabled={saving}
                className="px-4 py-2 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50">
                取消
              </button>
              <button onClick={handleSave} disabled={saving || !form.name.trim()}
                className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5">
                {saving && <Loader2 className="animate-spin" size={14} />}
                {editId ? '保存修改' : '创建规则'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="删除规则"
        message={`确定删除规则「${deleteTarget?.name}」？此操作不可撤销。`}
        variant="danger"
        confirmLabel="删除"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}

