import { Pencil, Trash2, ShieldAlert } from 'lucide-react'
import type { AutoRule } from './types'
import { eventTypeLabel, actionLabel } from './types'

interface Props {
  rules: AutoRule[]
  onEdit: (rule: AutoRule) => void
  onDelete: (rule: AutoRule) => void
  onToggle: (rule: AutoRule) => void
}

function RuleCard({ rule, onEdit, onDelete, onToggle }: {
  rule: AutoRule
  onEdit: (rule: AutoRule) => void
  onDelete: (rule: AutoRule) => void
  onToggle: (rule: AutoRule) => void
}) {
  const isBanAction = rule.action === 'ban_ip' || rule.action === 'ban_user'

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-4 hover:shadow-sm transition">
      {/* 开关 */}
      <button
        onClick={() => onToggle(rule)}
        className={`shrink-0 w-10 h-6 rounded-full transition-colors relative ${
          rule.enabled ? 'bg-green-500' : 'bg-slate-300'
        }`}
      >
        <div
          className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
            rule.enabled ? 'translate-x-[18px]' : 'translate-x-0.5'
          }`}
        />
      </button>

      {/* 信息 */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-slate-900">{rule.name}</span>
          <span className="text-xs text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
            {eventTypeLabel(rule.eventType)}
          </span>
          <span
            className={`text-xs px-1.5 py-0.5 rounded ${
              isBanAction
                ? 'bg-red-50 text-red-600'
                : 'bg-amber-50 text-amber-600'
            }`}
          >
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
          onClick={() => onEdit(rule)}
          className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-blue-600 transition"
          title="编辑"
        >
          <Pencil size={15} />
        </button>
        <button
          onClick={() => onDelete(rule)}
          className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-red-600 transition"
          title="删除"
        >
          <Trash2 size={15} />
        </button>
      </div>
    </div>
  )
}

export default function RuleList({ rules, onEdit, onDelete, onToggle }: Props) {
  if (rules.length === 0) {
    return (
      <div className="text-center py-16 text-slate-400">
        <ShieldAlert size={48} className="mx-auto mb-3 opacity-50" />
        <p className="text-lg font-medium">暂无自动规则</p>
        <p className="text-sm mt-1">点击"新增规则"创建第一条自动处置规则</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {rules.map((rule) => (
        <RuleCard
          key={rule.id}
          rule={rule}
          onEdit={onEdit}
          onDelete={onDelete}
          onToggle={onToggle}
        />
      ))}
    </div>
  )
}
