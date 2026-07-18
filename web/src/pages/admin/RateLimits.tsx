import { useEffect, useState, useCallback, useMemo } from 'react'
import { get, patch } from '@/lib/api'
import { Loader2, AlertCircle, CheckCircle2, X, Zap, Users, Activity, Save, Edit2 } from 'lucide-react'
import FeatureDescription from '@/components/admin/FeatureDescription'
import type { RateLimitRule, WaterLevels, OverrideItem, TabKey } from './rate-limits/types'
import { groupKey } from './rate-limits/types'
import LimitStatsCards from './rate-limits/LimitStatsCards'
import LimitList from './rate-limits/LimitList'
import OverrideDialog from './rate-limits/LimitForm'
import LimitLogs from './rate-limits/LimitLogs'
import LimitAnalytics from './rate-limits/LimitAnalytics'

// ── Tabs ──

const TABS: { key: TabKey; label: string; icon: typeof Zap }[] = [
  { key: 'rules', label: '规则配置 + 实时水位', icon: Zap },
  { key: 'overrides', label: '用户覆盖规则', icon: Users },
  { key: 'hits', label: '限流命中事件', icon: Activity },
]

// ── 状态消息条 ──

function AlertBanner({
  type,
  msg,
  onDismiss,
}: {
  type: 'success' | 'error'
  msg: string
  onDismiss: () => void
}) {
  const colors = type === 'success'
    ? { bg: 'bg-green-50', text: 'text-green-700', icon: 'text-green-500' }
    : { bg: 'bg-red-50', text: 'text-red-600', icon: 'text-red-500' }
  const Icon = type === 'success' ? CheckCircle2 : AlertCircle

  return (
    <div className={`flex items-center gap-2 ${colors.bg} ${colors.text} p-3 rounded-lg text-sm`}>
      <Icon size={16} />
      {msg}
      <button onClick={onDismiss} className={`ml-auto ${colors.icon} hover:text-slate-700`}>
        <X size={14} />
      </button>
    </div>
  )
}

// ── 规则编辑卡片组 ──

function RuleGroupCard({
  groupName,
  rules,
  editingKey,
  editValue,
  onStartEdit,
  onCancelEdit,
  onChangeEdit,
  onSave,
}: {
  groupName: string
  rules: RateLimitRule[]
  editingKey: string | null
  editValue: string
  onStartEdit: (key: string, value: string) => void
  onCancelEdit: () => void
  onChangeEdit: (v: string) => void
  onSave: (key: string) => void
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="bg-slate-50 px-4 py-2 border-b border-slate-200">
        <h3 className="text-sm font-semibold text-slate-600">{groupName}</h3>
      </div>
      <div className="divide-y divide-slate-100">
        {rules.map((rule) => (
          <div key={rule.key} className="px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400 font-mono">{rule.key}</span>
              {editingKey === rule.key ? (
                <button onClick={onCancelEdit} className="text-slate-400 hover:text-slate-600">
                  <X size={14} />
                </button>
              ) : (
                <button onClick={() => onStartEdit(rule.key, rule.value)} className="text-blue-500 hover:text-blue-700">
                  <Edit2 size={14} />
                </button>
              )}
            </div>
            <div className="mt-1">
              {editingKey === rule.key ? (
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    value={editValue}
                    onChange={(e) => onChangeEdit(e.target.value)}
                    className="flex-1 px-2 py-1 border border-blue-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    autoFocus
                  />
                  <button onClick={() => onSave(rule.key)} className="text-green-600 hover:text-green-800">
                    <Save size={16} />
                  </button>
                </div>
              ) : (
                <div className="flex items-baseline gap-2">
                  <span className="text-xl font-bold text-slate-900">
                    {parseInt(rule.value).toLocaleString()}
                  </span>
                  <span className="text-xs text-slate-400">
                    {rule.key.endsWith('rpm') ? '请求/分' : 'Token/分'}
                  </span>
                  {rule.isDefault && (
                    <span className="text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded">默认值</span>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── 主页面 ──

export default function AdminRateLimits() {
  const [rules, setRules] = useState<RateLimitRule[]>([])
  const [waterLevels, setWaterLevels] = useState<WaterLevels | null>(null)
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [activeTab, setActiveTab] = useState<TabKey>('rules')

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')

  const [showOverrideDialog, setShowOverrideDialog] = useState(false)
  const [editingOverride, setEditingOverride] = useState<OverrideItem | null>(null)

  // ── 获取规则 + 水位 ──

  const fetchRules = useCallback(async () => {
    try {
      const res = await get<{ rules: RateLimitRule[]; waterLevels: WaterLevels }>('/api/v1/admin/rate-limits/rules')
      setRules(res.rules)
      setWaterLevels(res.waterLevels)
    } catch (err: any) {
      setError(err.message || '获取限流规则失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchRules() }, [fetchRules])

  // ── 保存规则 ──

  const handleSaveRule = useCallback(async (key: string) => {
    try {
      await patch('/api/v1/admin/rate-limits/rules', {
        rules: [{ key, value: editValue }],
      })
      setMsg(`限流规则 "${key}" 已更新（预计 120 秒内全节点生效）`)
      setEditingKey(null)
      fetchRules()
    } catch (err: any) {
      setError(err.message || '更新失败')
    }
  }, [editValue, fetchRules])

  // ── 编辑操作 ──

  const handleStartEdit = useCallback((key: string, value: string) => {
    setEditingKey(key)
    setEditValue(value)
  }, [])

  const handleCancelEdit = useCallback(() => { setEditingKey(null) }, [])

  // ── 覆盖弹窗操作 ──

  const handleAddOverride = useCallback(() => {
    setEditingOverride(null)
    setShowOverrideDialog(true)
  }, [])

  const handleEditOverride = useCallback((item: OverrideItem) => {
    setEditingOverride(item)
    setShowOverrideDialog(true)
  }, [])

  const handleCloseOverride = useCallback(() => {
    setShowOverrideDialog(false)
    setEditingOverride(null)
  }, [])

  const handleSavedOverride = useCallback(() => {
    setMsg(editingOverride ? '限流覆盖已更新' : '限流覆盖已添加')
  }, [editingOverride])

  // ── 分组规则 ──

  const groupedRules = useMemo(() => {
    const groupNames = [...new Set(rules.map((r) => groupKey(r.key)))]
    return groupNames.map((g) => ({
      group: g,
      rules: rules.filter((r) => groupKey(r.key) === g),
    }))
  }, [rules])

  // ── Tab 标签渲染 ──

  const tabButtons = useMemo(() =>
    TABS.map((t) => (
      <button
        key={t.key}
        onClick={() => setActiveTab(t.key)}
        className={`px-4 py-2 text-sm font-medium rounded-t-lg transition ${
          activeTab === t.key
            ? 'bg-white text-blue-600 border border-b-white border-slate-200 -mb-[3px]'
            : 'text-slate-500 hover:text-slate-700'
        }`}
      >
        <t.icon size={16} className="inline mr-1" />
        {t.label}
      </button>
    )),
  [activeTab])

  // ── Loading ──

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="animate-spin" size={32} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">TPM/RPM 限流管理</h1>
        <FeatureDescription page="admin/rate-limits" className="ml-2" />
      </div>

      {msg && <AlertBanner type="success" msg={msg} onDismiss={() => setMsg('')} />}
      {error && <AlertBanner type="error" msg={error} onDismiss={() => setError('')} />}

      {/* Tab 切换 */}
      <div className="flex gap-2 border-b border-slate-200 pb-2">
        {tabButtons}
      </div>

      {/* Tab 1: 规则配置 + 实时水位 */}
      {activeTab === 'rules' && (
        <div className="space-y-6">
          <LimitStatsCards waterLevels={waterLevels} />

          <div>
            <h2 className="text-lg font-semibold text-slate-800 mb-3 flex items-center gap-2">
              <Activity size={18} className="text-blue-500" />
              限流规则设定
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {groupedRules.map((g) => (
                <RuleGroupCard
                  key={g.group}
                  groupName={g.group}
                  rules={g.rules}
                  editingKey={editingKey}
                  editValue={editValue}
                  onStartEdit={handleStartEdit}
                  onCancelEdit={handleCancelEdit}
                  onChangeEdit={setEditValue}
                  onSave={handleSaveRule}
                />
              ))}
            </div>
          </div>

          {/* 分析 */}
          <LimitAnalytics />
        </div>
      )}

      {/* Tab 2: 用户覆盖规则 */}
      {activeTab === 'overrides' && (
        <LimitList
          onEdit={handleEditOverride}
          onAdd={handleAddOverride}
          onMsg={setMsg}
          onError={setError}
        />
      )}

      {/* Tab 3: 限流命中事件 */}
      {activeTab === 'hits' && (
        <LimitLogs onError={setError} />
      )}

      {/* 覆盖弹窗 */}
      <OverrideDialog
        open={showOverrideDialog}
        editItem={editingOverride}
        onClose={handleCloseOverride}
        onSaved={handleSavedOverride}
      />
    </div>
  )
}
