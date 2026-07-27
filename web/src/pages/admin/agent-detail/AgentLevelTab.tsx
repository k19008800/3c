// ═══════════════════════════════════════════════════
//  AgentLevelTab — 代理等级审核面板 (PRD 3.1)
//  管理员审核预备→一级 / 一级→高级 的晋升申请
// ═══════════════════════════════════════════════════

import { useEffect, useState, useCallback } from 'react'
import { post, get } from '@/lib/api'
import { Loader2, AlertCircle, Shield, CheckCircle2, XCircle } from 'lucide-react'
import type { Agent } from '@/types'
import { AGENT_LEVEL_CONFIG, AGENT_AUDIT_CONFIG } from './config'

interface Props {
  agentId: number
  onLevelChanged: () => void
}

export default function AgentLevelTab({ agentId, onLevelChanged }: Props) {
  const [agent, setAgent] = useState<Agent | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')
  const [remark, setRemark] = useState('')

  const fetchAgent = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const a = await get<Agent>(`/api/v1/admin/agents/${agentId}`)
      setAgent(a)
    } catch (err: any) {
      setError(err.message || '获取代理信息失败')
    } finally {
      setLoading(false)
    }
  }, [agentId])

  useEffect(() => { fetchAgent() }, [fetchAgent])

  const handleAudit = useCallback(async (action: 'approve' | 'reject') => {
    setActionLoading(true)
    setError('')
    setMsg('')
    try {
      const level = agent?.level === 'preparatory' ? 'primary' : 'advanced'
      await post(`/api/v1/admin/agents/${agentId}/audit`, {
        action,
        level: action === 'approve' ? level : undefined,
        remark: remark || undefined,
      })
      setMsg(action === 'approve' ? '审核通过，代理已晋升' : '已拒绝晋升申请')
      setRemark('')
      onLevelChanged()
      fetchAgent()
    } catch (err: any) {
      setError(err.message || '操作失败')
    } finally {
      setActionLoading(false)
    }
  }, [agentId, agent, remark, onLevelChanged, fetchAgent])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="animate-spin" size={28} />
      </div>
    )
  }

  if (!agent) {
    return (
      <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm">
        <AlertCircle size={16} />
        {error || '代理商不存在'}
      </div>
    )
  }

  const levelConfig = AGENT_LEVEL_CONFIG[agent.level] || AGENT_LEVEL_CONFIG.preparatory
  const auditConfig = AGENT_AUDIT_CONFIG[agent.auditStatus] || AGENT_AUDIT_CONFIG.approved
  const isPending = agent.auditStatus === 'pending'

  const possibleUpgrade = agent.level === 'preparatory'
    ? { from: '预备代理', to: '一级代理', target: 'primary' as const }
    : agent.level === 'primary'
    ? { from: '一级代理', to: '高级代理', target: 'advanced' as const }
    : null

  return (
    <div className="space-y-6">
      {/* 当前等级卡片 */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">代理等级信息</h3>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <span className="text-xs text-slate-500">当前等级</span>
            <p className={`text-lg font-bold mt-0.5 ${levelConfig.color}`}>
              {levelConfig.label}
            </p>
          </div>
          <div>
            <span className="text-xs text-slate-500">审核状态</span>
            <p className={`text-lg font-bold mt-0.5 ${auditConfig.color}`}>
              <span className={`inline-block px-2 py-0.5 rounded ${auditConfig.bg}`}>
                {auditConfig.label}
              </span>
            </p>
          </div>
          {agent.auditRemark && (
            <div className="col-span-2">
              <span className="text-xs text-slate-500">审核备注</span>
              <p className="text-sm text-slate-700 mt-0.5">{agent.auditRemark}</p>
            </div>
          )}
          {agent.accountManager && (
            <div>
              <span className="text-xs text-slate-500">专属客户经理</span>
              <p className="text-sm text-slate-700 mt-0.5">{agent.accountManager}</p>
            </div>
          )}
          <div>
            <span className="text-xs text-slate-500">优先技术支持</span>
            <p className={`text-sm font-medium mt-0.5 ${agent.prioritySupport ? 'text-green-600' : 'text-slate-400'}`}>
              {agent.prioritySupport ? '✅ 已开通' : '未开通'}
            </p>
          </div>
        </div>
      </div>

      {/* 审核操作 */}
      {isPending && possibleUpgrade && (
        <div className="bg-white rounded-xl border border-amber-200 p-5 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900 mb-2 flex items-center gap-2">
            <Shield size={18} className="text-amber-600" />
            等级晋升审核
          </h3>
          <p className="text-sm text-slate-600 mb-4">
            该代理申请从 <strong>{possibleUpgrade.from}</strong> 晋升为 <strong>{possibleUpgrade.to}</strong>
          </p>

          {error && (
            <div className="flex items-center gap-2 text-red-600 bg-red-50 p-2.5 rounded-lg text-sm mb-4">
              <AlertCircle size={14} /> {error}
            </div>
          )}
          {msg && (
            <div className="flex items-center gap-2 text-green-600 bg-green-50 p-2.5 rounded-lg text-sm mb-4">
              <CheckCircle2 size={14} /> {msg}
            </div>
          )}

          <div className="mb-4">
            <label className="text-xs text-slate-500 mb-1 block">审核备注（可选）</label>
            <textarea
              className="w-full border border-slate-200 rounded-lg p-2.5 text-sm outline-none focus:border-blue-400 resize-none"
              rows={2}
              value={remark}
              onChange={e => setRemark(e.target.value)}
              placeholder="填写审核意见..."
              disabled={actionLoading}
            />
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => handleAudit('approve')}
              disabled={actionLoading}
              className="flex items-center gap-1.5 px-5 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition"
            >
              {actionLoading ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={16} />}
              通过晋升
            </button>
            <button
              onClick={() => handleAudit('reject')}
              disabled={actionLoading}
              className="flex items-center gap-1.5 px-5 py-2 bg-red-100 text-red-700 rounded-lg text-sm font-medium hover:bg-red-200 disabled:opacity-50 transition"
            >
              <XCircle size={16} />
              拒绝
            </button>
          </div>
        </div>
      )}

      {/* 非待审状态展示 */}
      {!isPending && possibleUpgrade && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <h3 className="text-sm font-medium text-slate-700 mb-2">等级晋升</h3>
          <p className="text-sm text-slate-500">
            该代理当前没有待审核的晋升申请。
            {agent.auditStatus === 'approved' && agent.level === possibleUpgrade.target
              ? ' 已完成的晋升申请。'
              : ' 可从 ' + possibleUpgrade.from + ' 申请晋升为 ' + possibleUpgrade.to + '。'}
          </p>
        </div>
      )}

      {!possibleUpgrade && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <p className="text-sm text-slate-500">
            {agent.level === 'sub' ? '子代理由上级代理管理，等级不可通过管理员审核变更。' : ''}
            {agent.level === 'advanced' ? '高级代理已是最高等级。' : ''}
          </p>
        </div>
      )}
    </div>
  )
}
