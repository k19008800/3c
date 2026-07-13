import { useEffect, useState, useCallback } from 'react'
import { get } from '@/lib/api'
import PaginationBar from '@/components/ui/PaginationBar'
import {
  Users, UserCheck, TrendingUp, RefreshCw,
  DollarSign, Layers, Calendar,
} from 'lucide-react'

// ── Types ──

interface SubAgent {
  id: number
  userId: number
  email: string
  nickname: string | null
  status: boolean
  totalCommission: string
  settledCommission: string
  teamDepth: number
  clientCount: number
  createdAt: string
}

interface TeamCommission {
  id: number
  commissionAmount: string
  callCost: string
  voucherNo: string | null
  sourceOrderId: string | null
  customerName: string | null
  customerEmail: string | null
  status: string
  createdAt: string
}

type TabKey = 'overview' | 'commissions'

// ── Labels ──

const STATUS_LABEL: Record<string, string> = {
  pending: '待结算',
  settled: '已结算',
  cancelled: '已取消',
}

function formatAmount(v: string | number): string {
  const n = typeof v === 'string' ? parseFloat(v) : v
  return isNaN(n) ? '0.00' : n.toFixed(4)
}

// ════════════════════════════════════════════

export default function AgentTeam() {
  const [activeTab, setActiveTab] = useState<TabKey>('overview')
  const [teamData, setTeamData] = useState<{ subAgents: SubAgent[]; teamTotalCommission: string; subAgentCount: number } | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchTeam = useCallback(async () => {
    setLoading(true)
    try {
      const res = await get<any>('/agent/team')
      setTeamData(res?.data)
    } catch (e: any) {
      console.error('Failed to load team', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchTeam() }, [fetchTeam])

  const tabs: { key: TabKey; label: string; icon: any }[] = [
    { key: 'overview', label: '团队概览', icon: Users },
    { key: 'commissions', label: '团队佣金', icon: TrendingUp },
  ]

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <RefreshCw size={32} className="animate-spin text-slate-400" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Users size={28} className="text-indigo-600" />
        <h1 className="text-2xl font-bold text-slate-900">我的团队</h1>
      </div>

      {/* Stats cards */}
      {teamData && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex items-center gap-2 text-sm text-slate-500 mb-2">
              <UserCheck size={16} />
              下级代理
            </div>
            <div className="text-2xl font-bold text-slate-900">{teamData.subAgentCount}</div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex items-center gap-2 text-sm text-slate-500 mb-2">
              <DollarSign size={16} />
              团队佣金
            </div>
            <div className="text-2xl font-bold text-green-600">
              ¥ {formatAmount(teamData.teamTotalCommission)}
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex items-center gap-2 text-sm text-slate-500 mb-2">
              <Layers size={16} />
              下级代理总客户
            </div>
            <div className="text-2xl font-bold text-indigo-600">
              {teamData.subAgents.reduce((s, a) => s + a.clientCount, 0)}
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === t.key
                ? 'bg-white text-indigo-600 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <t.icon size={16} />
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && teamData && <TeamOverview data={teamData.subAgents} />}
      {activeTab === 'commissions' && <TeamCommissions />}
    </div>
  )
}

// ════════════════════════════════════════════

function TeamOverview({ data }: { data: SubAgent[] }) {
  if (data.length === 0) {
    return (
      <div className="text-center py-16">
        <Users size={48} className="mx-auto text-slate-300 mb-3" />
        <div className="text-slate-500 text-sm">暂无下级代理</div>
        <div className="text-slate-400 text-xs mt-1">当有其他代理商被设为您的下级时，将在此展示</div>
      </div>
    )
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="text-left px-4 py-3 font-medium text-slate-600">代理商</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">层级</th>
              <th className="text-right px-4 py-3 font-medium text-slate-600">客户数</th>
              <th className="text-right px-4 py-3 font-medium text-slate-600">累计佣金</th>
              <th className="text-right px-4 py-3 font-medium text-slate-600">已结算</th>
              <th className="text-center px-4 py-3 font-medium text-slate-600">状态</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">加入时间</th>
            </tr>
          </thead>
          <tbody>
            {data.map(agent => (
              <tr key={agent.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-900">{agent.nickname || agent.email}</div>
                  <div className="text-xs text-slate-500">{agent.email}</div>
                </td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-50 text-indigo-700 text-xs rounded-full">
                    <Layers size={10} />
                    L{agent.teamDepth}
                  </span>
                </td>
                <td className="px-4 py-3 text-right text-slate-700">{agent.clientCount}</td>
                <td className="px-4 py-3 text-right font-mono text-xs text-green-600">
                  ¥ {formatAmount(agent.totalCommission)}
                </td>
                <td className="px-4 py-3 text-right font-mono text-xs text-slate-500">
                  ¥ {formatAmount(agent.settledCommission)}
                </td>
                <td className="px-4 py-3 text-center">
                  <span className={`inline-block px-2 py-0.5 text-xs rounded-full ${
                    agent.status ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
                  }`}>
                    {agent.status ? '活跃' : '停用'}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-500 text-xs">
                  {new Date(agent.createdAt).toLocaleDateString('zh-CN')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════

function TeamCommissions() {
  const [list, setList] = useState<TeamCommission[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  const [loading, setLoading] = useState(false)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  const fetchData = useCallback(async (p: number) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(p), pageSize: String(pageSize) })
      if (startDate) params.set('startDate', startDate)
      if (endDate) params.set('endDate', endDate)
      const res = await get<any>(`/agent/team/commissions?${params.toString()}`)
      setList(res?.data?.list ?? [])
      setTotal(res?.data?.total ?? 0)
    } catch (e: any) {
      console.error('Failed to load team commissions', e)
    } finally {
      setLoading(false)
    }
  }, [pageSize, startDate, endDate])

  useEffect(() => { setPage(1); fetchData(1) }, [startDate, endDate])
  useEffect(() => { fetchData(page) }, [page])

  const totalPages = Math.ceil(total / pageSize)

  return (
    <div className="space-y-4">
      {/* Date filters */}
      <div className="flex items-center gap-3">
        <Calendar size={14} className="text-slate-500" />
        <input
          type="date"
          value={startDate}
          onChange={e => setStartDate(e.target.value)}
          className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm"
          placeholder="开始日期"
        />
        <span className="text-slate-400 text-sm">至</span>
        <input
          type="date"
          value={endDate}
          onChange={e => setEndDate(e.target.value)}
          className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm"
          placeholder="结束日期"
        />
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12">
            <RefreshCw size={24} className="animate-spin text-slate-400" />
          </div>
        ) : list.length === 0 ? (
          <div className="text-center py-12 text-slate-400">暂无团队佣金记录</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="text-left px-4 py-3 font-medium text-slate-600">时间</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">来源客户</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">关联订单</th>
                    <th className="text-right px-4 py-3 font-medium text-slate-600">调用成本</th>
                    <th className="text-right px-4 py-3 font-medium text-slate-600">佣金</th>
                    <th className="text-center px-4 py-3 font-medium text-slate-600">状态</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">凭证号</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map(item => (
                    <tr key={item.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-4 py-3 text-slate-600 text-xs whitespace-nowrap">
                        {new Date(item.createdAt).toLocaleString('zh-CN')}
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm text-slate-900">{item.customerName || '-'}</div>
                        {item.customerEmail && (
                          <div className="text-xs text-slate-500">{item.customerEmail}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600 font-mono">{item.sourceOrderId || '-'}</td>
                      <td className="px-4 py-3 text-right font-mono text-xs text-slate-600">
                        ¥ {formatAmount(item.callCost)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs text-green-600 font-medium">
                        ¥ {formatAmount(item.commissionAmount)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-block px-2 py-0.5 text-xs rounded-full ${
                          item.status === 'settled' ? 'bg-green-100 text-green-700'
                          : item.status === 'pending' ? 'bg-amber-100 text-amber-700'
                          : 'bg-slate-100 text-slate-500'
                        }`}>
                          {STATUS_LABEL[item.status] || item.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500 font-mono">{item.voucherNo || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="px-4 py-3 border-t border-slate-200">
                <PaginationBar page={page} onPageChange={setPage} pageSize={pageSize} onPageSizeChange={() => {}} total={total} totalPages={totalPages} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
