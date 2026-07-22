// ═══════════════════════════════════════════════════
//  AgentDetail — 代理商详情页入口（≤300 行）
//  子组件目录：agent-detail/
// ═══════════════════════════════════════════════════

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { get } from '@/lib/api'
import { Loader2, AlertCircle } from 'lucide-react'
import FeatureDescription from '@/components/admin/FeatureDescription'
import type { Agent, AgentClientDetail } from '@/types'
import { DETAIL_TABS } from './agent-detail/config'
import type { DetailTab } from './agent-detail/types'
import DetailHeader from './agent-detail/DetailHeader'
import CommissionRulesTab from './agent-detail/CommissionTab'
import AgentInfoTab from './agent-detail/AgentInfoTab'
import AgentClientsTab from './agent-detail/AgentClientsTab'

export default function AdminAgentDetail() {
  const { agentId } = useParams<{ agentId: string }>()
  const id = parseInt(agentId || '0', 10)

  const [agent, setAgent] = useState<Agent | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<DetailTab>('rules')
  const [clientCount, setClientCount] = useState<number | undefined>()

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

  const fetchClientCount = useCallback(async () => {
    if (!id) return
    try {
      const res = await get<AgentClientDetail>(
        `/api/v1/admin/agents/${id}/clients`,
        { page: 1, pageSize: 1 }
      )
      setClientCount(res.total)
    } catch {
      // silently fail — client count is supplemental
    }
  }, [id])

  useEffect(() => {
    fetchAgent()
    fetchClientCount()
  }, [fetchAgent, fetchClientCount])

  // ── Invalid ID ──
  if (!id) {
    return (
      <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm">
        <AlertCircle size={16} />
        无效的代理商 ID
      </div>
    )
  }

  // ── Loading ──
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin" size={32} />
      </div>
    )
  }

  // ── Error ──
  if (error || !agent) {
    return (
      <div className="space-y-4">
        <DetailHeaderSkeleton />
        <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm">
          <AlertCircle size={16} />
          {error || '代理商不存在'}
        </div>
      </div>
    )
  }

  // ── Tab content ──
  const tabContent = useMemo(() => {
    switch (tab) {
      case 'rules':
        return <CommissionRulesTab agentId={id} />
      case 'parent':
        return <AgentInfoTab agentId={id} />
      case 'clients':
        return <AgentClientsTab agentId={id} />
    }
  }, [tab, id])

  return (
    <div className="space-y-6">
      {/* Header with stat cards + trend chart */}
      <DetailHeader
        agent={agent}
        onRefresh={fetchAgent}
        clientCount={clientCount}
      />

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-lg w-fit">
        {DETAIL_TABS.map((t) => (
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

      {/* Tab content */}
      {tabContent}
    </div>
  )
}

/* ═══════════════════════════════════════════════════
   Skeleton for error state back link area
   ═══════════════════════════════════════════════════ */

function DetailHeaderSkeleton() {
  return (
    <div className="flex items-center gap-3">
      <div className="w-9 h-9 bg-slate-200 rounded-lg animate-pulse" />
      <div className="space-y-1">
        <div className="w-40 h-6 bg-slate-200 rounded animate-pulse" />
        <div className="w-80 h-4 bg-slate-200 rounded animate-pulse" />
      </div>
    </div>
  )
}
