import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { get, post, patch, del } from '@/lib/api'
import type {
  Agent,
  CommissionRule,
} from '@/types'
import {
  Loader2,
  AlertCircle,
  ArrowLeft,
  RefreshCw,
  Percent,
  Activity,
  Users,
  Link2,
  DollarSign,
  Tag,
  ChevronRight,
  Plus,
  Trash2,
  Edit3,
  X,
} from 'lucide-react'
import FeatureDescription from '@/components/admin/FeatureDescription'

type DetailTab = 'rules' | 'parent' | 'clients'

export default function AdminAgentDetail() {
  const { agentId } = useParams<{ agentId: string }>()
  const navigate = useNavigate()
  const id = parseInt(agentId || '0', 10)

  const [agent, setAgent] = useState<Agent | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<DetailTab>('rules')

  const fetchAgent = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setError('')
    try {
      const found = await get<Agent>(`/api/v1/admin/agents/${id}`)
      if (!found) {
        setError('代理商不存在')
        return
      }
      setAgent(found)
    } catch (err: any) {
      setError(err.message || '获取代理商信息失败')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    fetchAgent()
  }, [fetchAgent])

  if (!id) {
    return (
      <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm">
        <AlertCircle size={16} />
        无效的代理商 ID
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin" size={32} />
      </div>
    )
  }

  if (error || !agent) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => navigate('/admin/agents')}
          className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
        >
          <ArrowLeft size={16} />返回代理列表
        </button>
        <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm">
          <AlertCircle size={16} />
          {error || '代理商不存在'}
        </div>
      </div>
    )
  }

  const tabs: { key: DetailTab; label: string; icon: React.ReactNode }[] = [
    { key: 'rules', label: '佣金规则', icon: <Percent size={16} /> },
    { key: 'parent', label: '上级代理商', icon: <Link2 size={16} /> },
    { key: 'clients', label: '客户管理', icon: <Users size={16} /> },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/admin/agents')}
            className="p-1.5 rounded-lg hover:bg-slate-200 transition"
          >
            <ArrowLeft size={20} className="text-slate-500" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">代理商详情</h1>
            <FeatureDescription page="admin/agents/detail" className="ml-2" />
            <p className="text-sm text-slate-500 mt-0.5">
              #{agent.id} · {agent.nickname || '-'} · {agent.email || '-'}
              {' · '}
              总佣金 ¥{Number(agent.totalCommission || 0).toFixed(2)}
              {' · '}
              待提现 ¥{Number(agent.pendingWithdraw || 0).toFixed(2)} · 可提现 ¥{Number(agent.availableBalance || 0).toFixed(2)}
            </p>
          </div>
        </div>
        <button
          onClick={() => fetchAgent()}
          className="flex items-center gap-1 px-3 py-1.5 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition"
        >
          <RefreshCw size={14} />
          刷新
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-lg w-fit">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition ${
              tab === t.key
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === 'rules' && <CommissionRulesTab agentId={id} />}
      {tab === 'parent' && <ParentAgentTab agentId={id} />}
      {tab === 'clients' && <ClientsTab agentId={id} />}
    </div>
  )
}

// ══════════════════════════════════════════════
//  Commission Rules Tab
// ══════════════════════════════════════════════

const RULE_TYPE_CONFIG: Record<
  string,
  { label: string; icon: React.ReactNode; color: string; desc: string }
> = {
  sale: {
    label: '销售佣金',
    icon: <DollarSign size={18} />,
    color: 'border-l-blue-500',
    desc: '新客户首次购买产生的佣金',
  },
  renewal: {
    label: '续费佣金',
    icon: <Activity size={18} />,
    color: 'border-l-green-500',
    desc: '老客户续费产生的佣金',
  },
  team: {
    label: '团队佣金',
    icon: <Users size={18} />,
    color: 'border-l-purple-500',
    desc: '下级代理商团队业绩分佣',
  },
  activity: {
    label: '活动佣金',
    icon: <Tag size={18} />,
    color: 'border-l-orange-500',
    desc: '营销活动专属佣金配置',
  },
}

function CommissionRulesTab({ agentId }: { agentId: number }) {
  const [rules, setRules] = useState<CommissionRule[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editingRule, setEditingRule] = useState<CommissionRule | null>(null)
  const [creatingType, setCreatingType] = useState<string | null>(null)

  const fetchRules = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await get<{ list: CommissionRule[] }>(
        `/api/v1/admin/agents/${agentId}/rules`
      )
      setRules(res.list)
    } catch (err: any) {
      setError(err.message || '获取佣金规则失败')
    } finally {
      setLoading(false)
    }
  }, [agentId])

  useEffect(() => {
    fetchRules()
  }, [fetchRules])

  const handleDelete = async (rule: CommissionRule) => {
    try {
      await del(`/api/v1/admin/agents/${agentId}/rules/${rule.id}`)
      setRules((prev) => prev.filter((r) => r.id !== rule.id))
    } catch (err: any) {
      setError(err.message || '删除失败')
    }
  }

  const existingTypes = new Set(rules.map((r) => r.ruleType))
  const allTypes = ['sale', 'renewal', 'team', 'activity']

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="animate-spin" size={24} />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {allTypes.map((type) => {
            const rule = rules.find((r) => r.ruleType === type)
            const cfg = RULE_TYPE_CONFIG[type]
            return (
              <div
                key={type}
                className={`bg-white rounded-xl border border-slate-200 border-l-4 ${cfg.color} shadow-sm`}
              >
                <div className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-slate-600">{cfg.icon}</span>
                      <span className="font-semibold text-slate-800">
                        {cfg.label}
                      </span>
                    </div>
                    <span className="text-xs text-slate-400">{cfg.desc}</span>
                  </div>

                  {rule ? (
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">比例</span>
                        <span className="font-medium text-slate-800">
                          {(Number(rule.rate) * 100).toFixed(2)}%
                        </span>
                      </div>

                      {rule.maxCap && (
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">封顶</span>
                          <span className="font-medium text-slate-800">
                            ¥{Number(rule.maxCap).toFixed(2)}
                          </span>
                        </div>
                      )}

                      {rule.minTriggerAmount && (
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">最低触发金额</span>
                          <span className="font-medium text-slate-800">
                            ¥{Number(rule.minTriggerAmount).toFixed(2)}
                          </span>
                        </div>
                      )}

                      {rule.validFrom && (
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">生效时间</span>
                          <span className="font-medium text-slate-800 text-xs">
                            {new Date(rule.validFrom).toLocaleDateString('zh-CN')}
                            {' ~ '}
                            {rule.validUntil
                              ? new Date(rule.validUntil).toLocaleDateString('zh-CN')
                              : '永久'}
                          </span>
                        </div>
                      )}

                      {rule.ruleType === 'activity' && rule.activityName && (
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">活动名称</span>
                          <span className="font-medium text-slate-800">
                            {rule.activityName}
                          </span>
                        </div>
                      )}

                      {rule.ruleType === 'activity' && rule.fixedAmount && (
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">固定金额</span>
                          <span className="font-medium text-slate-800">
                            ¥{Number(rule.fixedAmount).toFixed(2)}
                          </span>
                        </div>
                      )}

                      {rule.ruleType === 'activity' && rule.activityType && (
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">活动类型</span>
                          <span className="font-medium text-slate-800">
                            {ACTIVITY_TYPE_LABEL[rule.activityType] || rule.activityType}
                          </span>
                        </div>
                      )}

                      {rule.ruleType === 'team' && rule.teamLevelLimit && (
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">最大层级</span>
                          <span className="font-medium text-slate-800">
                            {rule.teamLevelLimit} 级
                          </span>
                        </div>
                      )}

                      <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full ${
                            rule.isEnabled
                              ? 'bg-green-100 text-green-700'
                              : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          {rule.isEnabled ? '已启用' : '已禁用'}
                        </span>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setEditingRule(rule)}
                            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
                          >
                            <Edit3 size={12} />
                            编辑
                          </button>
                          <button
                            onClick={() => handleDelete(rule)}
                            className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700"
                          >
                            <Trash2 size={12} />
                            删除
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="py-4 text-center">
                      <p className="text-sm text-slate-400 mb-3">
                        尚未配置{cfg.label}
                      </p>
                      <button
                        onClick={() => setCreatingType(type)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-blue-600 border border-blue-300 rounded-lg hover:bg-blue-50 transition"
                      >
                        <Plus size={14} />
                        添加规则
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Create / Edit Modal */}
      {(editingRule || creatingType) && (
        <CommissionRuleModal
          agentId={agentId}
          rule={editingRule}
          ruleType={creatingType as CommissionRule['ruleType'] | undefined}
          onClose={() => {
            setEditingRule(null)
            setCreatingType(null)
            fetchRules()
          }}
        />
      )}
    </div>
  )
}

const ACTIVITY_TYPE_LABEL: Record<string, string> = {
  register_bonus: '注册奖励',
  first_recharge: '首充奖励',
  invite_bonus: '邀请奖励',
  consumption_milestone: '消费里程碑',
}

// ══════════════════════════════════════════════
//  Commission Rule Modal (Create / Edit)
// ══════════════════════════════════════════════

function CommissionRuleModal({
  agentId,
  rule,
  ruleType,
  onClose,
}: {
  agentId: number
  rule: CommissionRule | null
  ruleType?: CommissionRule['ruleType']
  onClose: () => void
}) {
  const isEdit = !!rule
  const type = rule?.ruleType || ruleType || 'sale'

  const [rate, setRate] = useState(
    rule ? (Number(rule.rate) * 100).toFixed(2) : ''
  )
  const [isEnabled, setIsEnabled] = useState(rule?.isEnabled ?? true)
  const [maxCap, setMaxCap] = useState(rule?.maxCap || '')
  const [minTriggerAmount, setMinTriggerAmount] = useState(
    rule?.minTriggerAmount || ''
  )
  const [validFrom, setValidFrom] = useState(
    rule?.validFrom
      ? new Date(rule.validFrom).toISOString().slice(0, 10)
      : ''
  )
  const [validUntil, setValidUntil] = useState(
    rule?.validUntil
      ? new Date(rule.validUntil).toISOString().slice(0, 10)
      : ''
  )
  const [activityName, setActivityName] = useState(rule?.activityName || '')
  const [activityType, setActivityType] = useState(rule?.activityType || '')
  const [fixedAmount, setFixedAmount] = useState(rule?.fixedAmount || '')
  const [teamLevelLimit, setTeamLevelLimit] = useState(
    rule?.teamLevelLimit?.toString() || '1'
  )
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState('')

  const handleSubmit = async () => {
    const rateNum = parseFloat(rate)
    if (isNaN(rateNum) || rateNum < 0 || rateNum > 100) {
      setMessage('比例需在 0~100 之间')
      return
    }

    setSubmitting(true)
    setMessage('')

    try {
      const body: Record<string, any> = {
        ruleType: type,
        rate: (rateNum / 100).toFixed(4),
        isEnabled,
      }

      if (maxCap) body.maxCap = String(Number(maxCap).toFixed(6))
      if (minTriggerAmount)
        body.minTriggerAmount = String(Number(minTriggerAmount).toFixed(6))
      if (validFrom) body.validFrom = new Date(validFrom).toISOString()
      if (validUntil) body.validUntil = new Date(validUntil + 'T23:59:59').toISOString()

      if (type === 'activity') {
        if (activityName) body.activityName = activityName
        if (activityType) body.activityType = activityType
        if (fixedAmount)
          body.fixedAmount = String(Number(fixedAmount).toFixed(6))
      }

      if (type === 'team') {
        body.teamLevelLimit = parseInt(teamLevelLimit) || 1
      }

      await post(`/api/v1/admin/agents/${agentId}/rules`, body)
      onClose()
    } catch (err: any) {
      setMessage(err.message || '保存失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="p-6 space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">
              {isEdit ? '编辑' : '添加'}佣金规则
            </h2>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 text-xl"
            >
              &times;
            </button>
          </div>

          <div className="flex items-center gap-2 text-sm text-slate-500 bg-slate-50 px-3 py-2 rounded-lg">
            <Tag size={14} />
            {RULE_TYPE_CONFIG[type]?.label || type}
          </div>

          {message && (
            <div
              className={`flex items-center gap-2 p-3 text-sm rounded-lg ${
                message.includes('失败')
                  ? 'bg-red-50 text-red-600'
                  : 'bg-blue-50 text-blue-700'
              }`}
            >
              <AlertCircle size={16} />
              {message}
            </div>
          )}

          {/* Fields */}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-sm text-slate-700 mb-1">
                佣金比例 (%) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="如 25 表示 25%"
              />
            </div>

            <div className="col-span-2 sm:col-span-1">
              <label className="block text-sm text-slate-700 mb-1">封顶金额</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={maxCap}
                onChange={(e) => setMaxCap(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="不填则不封顶"
              />
            </div>

            <div className="col-span-2 sm:col-span-1">
              <label className="block text-sm text-slate-700 mb-1">最低触发金额</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={minTriggerAmount}
                onChange={(e) => setMinTriggerAmount(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="不填则无限制"
              />
            </div>

            <div className="col-span-2 sm:col-span-1">
              <label className="block text-sm text-slate-700 mb-1">生效日期</label>
              <input
                type="date"
                value={validFrom}
                onChange={(e) => setValidFrom(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="col-span-2 sm:col-span-1">
              <label className="block text-sm text-slate-700 mb-1">失效日期</label>
              <input
                type="date"
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Activity-specific fields */}
          {type === 'activity' && (
            <div className="border-t border-slate-200 pt-4 space-y-4">
              <h3 className="text-sm font-medium text-slate-700 flex items-center gap-1">
                <Tag size={14} />
                活动配置
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-sm text-slate-700 mb-1">活动名称</label>
                  <input
                    type="text"
                    value={activityName}
                    onChange={(e) => setActivityName(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="如：暑假促销"
                  />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-sm text-slate-700 mb-1">活动类型</label>
                  <select
                    value={activityType}
                    onChange={(e) => setActivityType(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">请选择</option>
                    <option value="register_bonus">注册奖励</option>
                    <option value="first_recharge">首充奖励</option>
                    <option value="invite_bonus">邀请奖励</option>
                    <option value="consumption_milestone">消费里程碑</option>
                  </select>
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-sm text-slate-700 mb-1">固定金额</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={fixedAmount}
                    onChange={(e) => setFixedAmount(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="按固定金额分佣时填写"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Team-specific fields */}
          {type === 'team' && (
            <div className="border-t border-slate-200 pt-4">
              <h3 className="text-sm font-medium text-slate-700 mb-3 flex items-center gap-1">
                <Users size={14} />
                团队配置
              </h3>
              <div className="max-w-xs">
                <label className="block text-sm text-slate-700 mb-1">最大层级</label>
                <select
                  value={teamLevelLimit}
                  onChange={(e) => setTeamLevelLimit(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                    <option key={n} value={n}>
                      {n} 级
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Enable toggle */}
          <div className="flex items-center gap-3 pt-2">
            <span className="text-sm text-slate-700">状态</span>
            <button
              onClick={() => setIsEnabled(!isEnabled)}
              className={`relative w-10 h-5 rounded-full transition ${
                isEnabled ? 'bg-green-500' : 'bg-slate-300'
              }`}
            >
              <span
                className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition ${
                  isEnabled ? 'left-5' : 'left-0.5'
                }`}
              />
            </button>
            <span className="text-sm text-slate-500">
              {isEnabled ? '已启用' : '已禁用'}
            </span>
          </div>

          {/* Actions */}
          <div className="flex gap-2 justify-end pt-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 border border-slate-300 rounded-lg"
            >
              取消
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="flex items-center gap-1 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting && <Loader2 size={14} className="animate-spin" />}
              {isEdit ? '保存修改' : '创建规则'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════
//  Parent Agent Tab
// ══════════════════════════════════════════════

function ParentAgentTab({ agentId }: { agentId: number }) {
  const [parentAgent, setParentAgent] = useState<{
    id: number
    email: string
    nickname: string
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showModal, setShowModal] = useState(false)

  const fetchParent = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const agentSelf = await get<Agent>(`/api/v1/admin/agents/${agentId}`)
      if (!agentSelf) {
        setError('代理商不存在')
        return
      }
      if (agentSelf.parentAgentId) {
        const parent = await get<Agent>(`/api/v1/admin/agents/${agentSelf.parentAgentId}`)
        if (parent) {
          setParentAgent({
            id: parent.id,
            email: parent.email || '',
            nickname: parent.nickname || '',
          })
        } else {
          setParentAgent({
            id: agentSelf.parentAgentId,
            email: '',
            nickname: '#ID 信息待加载',
          })
        }
      } else {
        setParentAgent(null)
      }
    } catch (err: any) {
      setError(err.message || '获取上级信息失败')
    } finally {
      setLoading(false)
    }
  }, [agentId])

  useEffect(() => {
    fetchParent()
  }, [fetchParent])

  const handleUnset = async () => {
    try {
      await patch(`/api/v1/admin/agents/${agentId}/parent`, {
        parentAgentId: null,
      })
      setParentAgent(null)
    } catch (err: any) {
      setError(err.message || '解除上级失败')
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200">
      <div className="p-6">
        {error && (
          <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm mb-4">
            <AlertCircle size={16} />
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="animate-spin" size={24} />
          </div>
        ) : (
          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-medium text-slate-700 mb-1">
                当前上级代理商
              </h3>
              {parentAgent ? (
                <div className="flex items-center justify-between bg-slate-50 rounded-lg p-4">
                  <div>
                    <p className="font-medium text-slate-800">
                      #{parentAgent.id} · {parentAgent.nickname || '-'}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {parentAgent.email || '-'}
                    </p>
                  </div>
                  <button
                    onClick={handleUnset}
                    className="flex items-center gap-1 px-3 py-1.5 text-sm text-red-600 border border-red-300 rounded-lg hover:bg-red-50 transition"
                  >
                    <X size={14} />
                    解除上级
                  </button>
                </div>
              ) : (
                <div className="bg-slate-50 rounded-lg p-4 text-center">
                  <p className="text-sm text-slate-400 mb-3">无上级代理商</p>
                </div>
              )}
            </div>

            <button
              onClick={() => setShowModal(true)}
              className="flex items-center gap-1 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
            >
              <Link2 size={14} />
              {parentAgent ? '更换上级' : '设置上级'}
            </button>
          </div>
        )}
      </div>

      {showModal && (
        <SetParentModal
          agentId={agentId}
          onClose={() => {
            setShowModal(false)
            fetchParent()
          }}
        />
      )}
    </div>
  )
}

function SetParentModal({
  agentId,
  onClose,
}: {
  agentId: number
  onClose: () => void
}) {
  const [parentAgentId, setParentAgentId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState('')

  const handleSubmit = async () => {
    const pid = parseInt(parentAgentId)
    if (!pid || pid <= 0 || pid === agentId) {
      setMessage('请输入有效的代理商ID（不能为自身）')
      return
    }
    setSubmitting(true)
    setMessage('')
    try {
      await patch(`/api/v1/admin/agents/${agentId}/parent`, {
        parentAgentId: pid,
      })
      onClose()
    } catch (err: any) {
      setMessage(err.message || '设置上级失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl w-full max-w-md shadow-xl">
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">设置上级代理商</h2>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 text-xl"
            >
              &times;
            </button>
          </div>

          <p className="text-xs text-slate-400">
            输入上级代理商的 ID。设置后，该上级将获得团队佣金分成（如果已配置 team 类型的佣金规则）。
          </p>

          {message && (
            <div
              className={`flex items-center gap-2 p-3 text-sm rounded-lg ${
                message.includes('失败')
                  ? 'bg-red-50 text-red-600'
                  : 'bg-blue-50 text-blue-700'
              }`}
            >
              <AlertCircle size={16} />
              {message}
            </div>
          )}

          <div>
            <label className="block text-sm text-slate-700 mb-1">
              上级代理商 ID <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              min="1"
              value={parentAgentId}
              onChange={(e) => setParentAgentId(e.target.value)}
              placeholder="输入上级代理商的 ID"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex gap-2 justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 border border-slate-300 rounded-lg"
            >
              取消
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="flex items-center gap-1 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting && <Loader2 size={14} className="animate-spin" />}
              确认设置
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════
//  Clients Tab
// ══════════════════════════════════════════════

function ClientsTab({ agentId }: { agentId: number }) {
  const navigate = useNavigate()

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">此页面与独立客户管理页面功能相同</p>
        <button
          onClick={() => navigate(`/admin/agents/${agentId}/clients`)}
          className="flex items-center gap-1 px-3 py-1.5 text-sm text-blue-600 border border-blue-300 rounded-lg hover:bg-blue-50 transition"
        >
          进入客户管理
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  )
}
