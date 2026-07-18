// ═══════════════════════════════════════════════════
//  CommissionTab — 佣金规则展示
//  弹窗逻辑已抽离至 CommissionModal.tsx
// ═══════════════════════════════════════════════════

import { useEffect, useState, useCallback, useMemo } from 'react'
import { get, del } from '@/lib/api'
import {
  Loader2,
  AlertCircle,
  Plus,
  Trash2,
  Edit3,
} from 'lucide-react'
import type { CommissionRule } from '@/types'
import { RULE_TYPE_CONFIG, ACTIVITY_TYPE_LABEL } from './config'
import CommissionModal from './CommissionModal'

/* ═══════════════════════════════════════════════════
   Commission Rules Tab
   ═══════════════════════════════════════════════════ */

interface CommissionRulesTabProps {
  agentId: number
}

export default function CommissionRulesTab({
  agentId,
}: CommissionRulesTabProps) {
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

  const handleDelete = useCallback(
    async (rule: CommissionRule) => {
      try {
        await del(`/api/v1/admin/agents/${agentId}/rules/${rule.id}`)
        setRules((prev) => prev.filter((r) => r.id !== rule.id))
      } catch (err: any) {
        setError(err.message || '删除失败')
      }
    },
    [agentId]
  )

  const allTypes = useMemo(() => ['sale', 'renewal', 'team', 'activity'], [])

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
              <RuleCard
                key={type}
                rule={rule}
                type={type}
                config={cfg}
                onEdit={() => setEditingRule(rule!)}
                onDelete={() => handleDelete(rule!)}
                onAdd={() => setCreatingType(type)}
              />
            )
          })}
        </div>
      )}

      {/* Create / Edit Modal */}
      {(editingRule || creatingType) && (
        <CommissionModal
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

/* ═══════════════════════════════════════════════════
   Rule card
   ═══════════════════════════════════════════════════ */

interface RuleCardProps {
  rule?: CommissionRule
  type: string
  config: { label: string; icon: React.ReactNode; color: string; desc: string }
  onEdit: () => void
  onDelete: () => void
  onAdd: () => void
}

function RuleCard({ rule, type, config, onEdit, onDelete, onAdd }: RuleCardProps) {
  return (
    <div
      className={`bg-white rounded-xl border border-slate-200 border-l-4 ${config.color} shadow-sm`}
    >
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-slate-600">{config.icon}</span>
            <span className="font-semibold text-slate-800">{config.label}</span>
          </div>
          <span className="text-xs text-slate-400">{config.desc}</span>
        </div>

        {rule ? (
          <RuleCardContent rule={rule} onEdit={onEdit} onDelete={onDelete} />
        ) : (
          <EmptyRuleCard onAdd={onAdd} label={config.label} />
        )}
      </div>
    </div>
  )
}

function RuleCardContent({
  rule,
  onEdit,
  onDelete,
}: {
  rule: CommissionRule
  onEdit: () => void
  onDelete: () => void
}) {
  return (
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
            onClick={onEdit}
            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
          >
            <Edit3 size={12} />
            编辑
          </button>
          <button
            onClick={onDelete}
            className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700"
          >
            <Trash2 size={12} />
            删除
          </button>
        </div>
      </div>
    </div>
  )
}

function EmptyRuleCard({
  onAdd,
  label,
}: {
  onAdd: () => void
  label: string
}) {
  return (
    <div className="py-4 text-center">
      <p className="text-sm text-slate-400 mb-3">尚未配置{label}</p>
      <button
        onClick={onAdd}
        className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-blue-600 border border-blue-300 rounded-lg hover:bg-blue-50 transition"
      >
        <Plus size={14} />
        添加规则
      </button>
    </div>
  )
}
