// ═══════════════════════════════════════════════════
//  AgentClients — 代理商客户管理页（独立路由入口）
//  代理到 agent-detail/AgentClientsTab 子组件
// ═══════════════════════════════════════════════════

import { useParams, useNavigate } from 'react-router-dom'
import { AlertCircle, ArrowLeft } from 'lucide-react'
import AgentClientsTab from './agent-detail/AgentClientsTab'
import FeatureDescription from '@/components/admin/FeatureDescription'

export default function AdminAgentClients() {
  const { agentId } = useParams<{ agentId: string }>()
  const navigate = useNavigate()
  const id = parseInt(agentId || '0', 10)

  if (!id) {
    return (
      <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm">
        <AlertCircle size={16} />
        无效的代理商 ID
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/admin/agents')}
          className="p-1.5 rounded-lg hover:bg-slate-200 transition"
        >
          <ArrowLeft size={20} className="text-slate-500" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">代理商客户管理</h1>
          <FeatureDescription page="admin/agents/clients" className="ml-2" />
        </div>
      </div>

      {/* Clients tab content */}
      <AgentClientsTab agentId={id} />
    </div>
  )
}
