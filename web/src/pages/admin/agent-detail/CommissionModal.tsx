// ═══════════════════════════════════════════════════
//  CommissionModal — 佣金规则创建/编辑弹窗
// ═══════════════════════════════════════════════════

import { useState, useCallback } from 'react'
import { post } from '@/lib/api'
import {
  Loader2,
  AlertCircle,
  Tag,
  Users,
} from 'lucide-react'
import type { CommissionRule } from '@/types'
import { RULE_TYPE_CONFIG } from './config'

interface CommissionModalProps {
  agentId: number
  rule: CommissionRule | null
  ruleType?: CommissionRule['ruleType']
  onClose: () => void
}

export default function CommissionModal({
  agentId,
  rule,
  ruleType,
  onClose,
}: CommissionModalProps) {
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

  const handleSubmit = useCallback(async () => {
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
      if (validUntil)
        body.validUntil = new Date(validUntil + 'T23:59:59').toISOString()

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
  }, [
    agentId,
    rate,
    isEnabled,
    maxCap,
    minTriggerAmount,
    validFrom,
    validUntil,
    activityName,
    activityType,
    fixedAmount,
    teamLevelLimit,
    type,
    onClose,
  ])

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
              <label className="block text-sm text-slate-700 mb-1">
                最低触发金额
              </label>
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
                  <label className="block text-sm text-slate-700 mb-1">
                    活动名称
                  </label>
                  <input
                    type="text"
                    value={activityName}
                    onChange={(e) => setActivityName(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="如：暑假促销"
                  />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-sm text-slate-700 mb-1">
                    活动类型
                  </label>
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
                  <label className="block text-sm text-slate-700 mb-1">
                    固定金额
                  </label>
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
                <label className="block text-sm text-slate-700 mb-1">
                  最大层级
                </label>
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
