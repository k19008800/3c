import { useEffect, useState, useCallback } from 'react'
import { get } from '@/lib/api'
import { Card } from '@/components/ui/card'
import FeatureDescription from '@/components/admin/FeatureDescription'
import { BarChart3, AlertCircle } from 'lucide-react'
import PeriodSelector from './stats/PeriodSelector'
import OverviewCards from './stats/OverviewCards'
import ModelDistribution from './stats/ModelDistribution'
import TopUsers from './stats/TopUsers'
import TrendChart from './stats/TrendChart'
import HourlyDistribution from './stats/HourlyDistribution'
import VendorBreakdownCard from './stats/VendorBreakdownCard'
import AggregatedQueryCard from './stats/AggregatedQueryCard'
import TabNavigation from './stats/TabNavigation'
import { type OverviewStats, type ModelStatItem, type VendorStatItem, type UserStatItem, type HourlyItem, type TrendItem, type StatsTab } from './stats/types'

export default function AdminStats() {
  const [period, setPeriod] = useState('30d')
  const [tab, setTab] = useState<StatsTab>('overview')
  const [error, setError] = useState('')
  const [overview, setOverview] = useState<OverviewStats | null>(null)
  const [loadingOverview, setLoadingOverview] = useState(true)
  const [modelStats, setModelStats] = useState<ModelStatItem[]>([])
  const [loadingModels, setLoadingModels] = useState(true)
  const [vendorStats, setVendorStats] = useState<VendorStatItem[]>([])
  const [loadingVendors, setLoadingVendors] = useState(true)
  const [userStats, setUserStats] = useState<UserStatItem[]>([])
  const [loadingUsers, setLoadingUsers] = useState(true)
  const [hourlyData, setHourlyData] = useState<HourlyItem[]>([])
  const [loadingHourly, setLoadingHourly] = useState(true)
  const [trendData, setTrendData] = useState<TrendItem[]>([])
  const [loadingTrend, setLoadingTrend] = useState(true)

  const fetchAll = useCallback(async () => {
    setError('')
    const d = period === '7d' ? 7 : period === '30d' ? 30 : 90
    setLoadingOverview(true)
    setLoadingModels(true)
    setLoadingVendors(true)
    setLoadingUsers(true)
    setLoadingHourly(true)
    setLoadingTrend(true)
    try {
      const [ov, byModel, byVendor, byUser, hourly, trend] = await Promise.all([
        get<OverviewStats>('/api/v1/admin/stats/overview', { period }),
        get<{ items: ModelStatItem[] }>('/api/v1/admin/stats/by-model', { limit: 50 }),
        get<{ items: VendorStatItem[] }>('/api/v1/admin/stats/by-vendor', { limit: 20 }),
        get<{ items: UserStatItem[] }>('/api/v1/admin/stats/by-user', { limit: 50, days: d }),
        get<{ hours: HourlyItem[] }>('/api/v1/admin/stats/hourly'),
        get<{ series: TrendItem[] }>('/api/v1/admin/stats/trend', { days: d }),
      ])
      setOverview(ov)
      setModelStats(byModel.items)
      setVendorStats(byVendor.items)
      setUserStats(byUser.items ?? [])
      setHourlyData(hourly.hours)
      setTrendData(trend.series)
    } catch (err: any) {
      setError(err.message || '获取统计数据失败')
    } finally {
      setLoadingOverview(false)
      setLoadingModels(false)
      setLoadingVendors(false)
      setLoadingUsers(false)
      setLoadingHourly(false)
      setLoadingTrend(false)
    }
  }, [period])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  const handleExport = useCallback((exportPeriod: string, dataType: string) => {
    const token = localStorage.getItem('accessToken')
    const a = document.createElement('a')
    a.href = `/api/v1/admin/stats/export?period=${exportPeriod}&type=${dataType}&token=${token ?? ''}`
    a.download = `stats_${dataType}_${exportPeriod}.csv`
    a.click()
  }, [])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BarChart3 size={28} className="text-blue-600" />
          <h1 className="text-2xl font-bold text-slate-900">聚合统计</h1>
          <FeatureDescription page="admin/stats" className="ml-2" />
        </div>
        <PeriodSelector value={period} onChange={setPeriod} />
      </div>
      {error && (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {/* Tabbed Panel */}
      <div className="bg-gradient-to-b from-blue-50/30 to-white rounded-2xl border border-blue-100/50 p-5 space-y-4">
        <TabNavigation
          tab={tab}
          period={period}
          onTabChange={setTab}
          onExport={handleExport}
        />
        {tab === 'overview' && (
          <OverviewCards
            overview={overview}
            loading={loadingOverview}
            trendData={trendData}
            trendLoading={loadingTrend}
            period={period}
          />
        )}
        {tab === 'models' && <ModelDistribution data={modelStats} loading={loadingModels} />}
        {tab === 'users' && <TopUsers data={userStats} loading={loadingUsers} />}
        {tab === 'trends' && (
          <div className="space-y-4">
            <TrendChart data={trendData} />
            <HourlyDistribution data={hourlyData} />
          </div>
        )}
      </div>

      {/* Vendor breakdown */}
      <VendorBreakdownCard vendorStats={vendorStats} loadingVendors={loadingVendors} />

      {/* Aggregated query */}
      <AggregatedQueryCard period={period} />
    </div>
  )
}