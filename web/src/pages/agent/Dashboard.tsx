import { useEffect, useState, useCallback } from 'react'
import { Loader2 } from 'lucide-react'
import { get } from '@/lib/api'
import type { AgentDashboard, AgentIncomeTrendData, AgentIncomeStructureData } from '@/types'
import KpiCards from './agent-dashboard/KpiCards'
import TrendChart from './agent-dashboard/TrendChart'
import RecentOrders from './agent-dashboard/RecentOrders'
import QuickActions from './agent-dashboard/QuickActions'

// ── 代理商仪表盘─-
//
// 【业务说明】
//   代理商专属仪表盘，展示名下客户数、累计佣金、可提现余额、分佣比例等 KPI 卡片。
//   收入趋势图支持 7/30/90 天切换，收入结构饼图展示各类型佣金占比。
//
// 【权限要求】角色=agent
// 【数据来源】GET /api/v1/agent/dashboard, GET /api/v1/agent/dashboard/income-trend,
//            GET /api/v1/agent/dashboard/income-structure

export default function AgentDashboard() {
  // 基础面板数据
  const [data, setData] = useState<AgentDashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // 收入趋势
  const [trendData, setTrendData] = useState<AgentIncomeTrendData | null>(null)
  const [trendDays, setTrendDays] = useState(30)
  const [trendLoading, setTrendLoading] = useState(false)

  // 收入结构
  const [structureData, setStructureData] = useState<AgentIncomeStructureData | null>(null)
  const [structureLoading, setStructureLoading] = useState(false)

  // ── 数据加载 ──

  const fetchDashboard = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await get<AgentDashboard>('/api/v1/agent/dashboard')
      setData(res)
    } catch (err: any) {
      setError(err.message || '获取面板数据失败')
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchTrend = useCallback(async (days: number) => {
    setTrendLoading(true)
    try {
      const res = await get<AgentIncomeTrendData>(
        `/api/v1/agent/dashboard/income-trend?days=${days}`,
      )
      setTrendData(res)
    } catch {
      // 静默
    } finally {
      setTrendLoading(false)
    }
  }, [])

  const fetchStructure = useCallback(async () => {
    setStructureLoading(true)
    try {
      const res = await get<AgentIncomeStructureData>('/api/v1/agent/dashboard/income-structure')
      setStructureData(res)
    } catch {
      // 静默
    } finally {
      setStructureLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchDashboard()
  }, [fetchDashboard])

  useEffect(() => {
    fetchTrend(trendDays)
  }, [fetchTrend, trendDays])

  useEffect(() => {
    fetchStructure()
  }, [fetchStructure])

  const handleRefresh = useCallback(() => {
    fetchDashboard()
    fetchTrend(trendDays)
    fetchStructure()
  }, [fetchDashboard, fetchTrend, fetchStructure, trendDays])

  // ── 加载态 ──
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin" size={32} />
      </div>
    )
  }

  // ── 错误态 ──
  if (error) {
    return (
      <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm">
        {error}
      </div>
    )
  }

  // ── 空数据安全兜底 ──
  if (!data) return null

  return (
    <div className="space-y-6">
      <QuickActions onRefresh={handleRefresh} />
      <KpiCards data={data} />
      <TrendChart
        data={trendData}
        loading={trendLoading}
        days={trendDays}
        onDaysChange={setTrendDays}
      />
      <RecentOrders data={structureData} loading={structureLoading} />
    </div>
  )
}
