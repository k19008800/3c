import { Loader2, AlertCircle, Handshake, Shield, AlertTriangle } from 'lucide-react'
import type { AgentOverviewItem } from './types'

// ── Risk level config ──

const riskLevelConfig: Record<string, { label: string; color: string; icon: any }> = {
  low: { label: '低风险', color: 'bg-green-100 text-green-700', icon: Shield },
  medium: { label: '中风险', color: 'bg-amber-100 text-amber-700', icon: AlertTriangle },
  high: { label: '高风险', color: 'bg-red-100 text-red-700', icon: AlertTriangle },
}

// ── Props ──

interface AgentOverviewProps {
  agents: AgentOverviewItem[]
  loading: boolean
  error: string
  onViewDetail: (agent: AgentOverviewItem) => void
}

// ── Component ──

export default function AgentOverview({ agents, loading, error, onViewDetail }: AgentOverviewProps) {
  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        <div className="flex justify-center py-12">
          <Loader2 className="animate-spin" size={24} />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        <div className="flex items-center gap-2 text-red-600 bg-red-50 p-4 rounded-lg text-sm m-4">
          <AlertCircle size={16} /> {error}
        </div>
      </div>
    )
  }

  if (agents.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        <div className="py-12 text-center text-slate-400 text-sm">暂无代理数据</div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-50 text-left">
              <th className="px-4 py-3 text-sm font-medium text-slate-500">代理名</th>
              <th className="px-4 py-3 text-sm font-medium text-slate-500 text-right">发放量</th>
              <th className="px-4 py-3 text-sm font-medium text-slate-500 text-right">使用量</th>
              <th className="px-4 py-3 text-sm font-medium text-slate-500 text-right">冻结 Token</th>
              <th className="px-4 py-3 text-sm font-medium text-slate-500 text-right">使用率</th>
              <th className="px-4 py-3 text-sm font-medium text-slate-500">风险等级</th>
              <th className="px-4 py-3 text-sm font-medium text-slate-500 text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {agents.map((agent) => {
              const riskCfg = riskLevelConfig[agent.riskLevel] || riskLevelConfig.low
              const RiskIcon = riskCfg.icon
              return (
                <tr key={agent.agentId} className="hover:bg-slate-50 transition">
                  <td className="px-4 py-3 text-sm font-medium text-slate-900">
                    <div className="flex items-center gap-2">
                      <Handshake size={16} className="text-slate-400" />
                      {agent.agentName}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-slate-700">{agent.issuedCount.toLocaleString()}</td>
                  <td className="px-4 py-3 text-sm text-right text-slate-700">{agent.usedCount.toLocaleString()}</td>
                  <td className="px-4 py-3 text-sm text-right text-orange-600">{Number(agent.frozenTokens).toFixed(2)}</td>
                  <td className="px-4 py-3 text-sm text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-16 h-2 bg-slate-200 rounded-full overflow-hidden inline-block">
                        <div
                          className="h-full bg-blue-500 rounded-full"
                          style={{ width: `${Math.min(100, agent.usageRate * 100)}%` }}
                        />
                      </div>
                      <span className="text-xs text-slate-500">{(agent.usageRate * 100).toFixed(1)}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${riskCfg.color}`}>
                      <RiskIcon size={12} />
                      {riskCfg.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => onViewDetail(agent)}
                        className="px-2.5 py-1 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition"
                      >
                        查看详情
                      </button>
                      <button className="px-2.5 py-1 text-xs font-medium text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-lg transition">
                        调整配额
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
