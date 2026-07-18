import { useEffect, useState, useCallback } from 'react'
import { get } from '@/lib/api'
import type { DashboardHealth } from '@/types'
import {
  Loader2,
  AlertTriangle,
  Activity,
  RefreshCw,
} from 'lucide-react'
import FeatureDescription from '@/components/admin/FeatureDescription'
import HealthStatsCards from './system-health/HealthStatsCards'
import ServiceList from './system-health/ServiceList'
import SystemMetrics from './system-health/SystemMetrics'

/* ════════════════════════════════════════
   SystemHealthPanel — Entry component
   ── Data fetching ── Error / Loading ── Layout
   ════════════════════════════════════════ */
export default function SystemHealthPanel() {
  const [health, setHealth] = useState<DashboardHealth | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchHealth = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await get<DashboardHealth>('/api/v1/admin/dashboard/health')
      setHealth(data)
    } catch (err: any) {
      setError(err.message || '获取健康数据失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchHealth()
  }, [fetchHealth])

  /* ── Loading state (no cached data) ── */
  if (loading && !health) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="animate-spin text-slate-400" size={24} />
      </div>
    )
  }

  /* ── Error state (no cached data) ── */
  if (error && !health) {
    return (
      <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm">
        <AlertTriangle size={16} />
        {error}
      </div>
    )
  }

  const h = health!

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity size={20} className="text-slate-700" />
          <h2 className="text-lg font-semibold text-slate-800">系统健康</h2>
          <FeatureDescription page="admin/system-health" className="ml-2" />
        </div>
        <button
          onClick={fetchHealth}
          className="flex items-center gap-1 px-3 py-1.5 text-xs text-slate-600 bg-white rounded-lg border border-slate-200 hover:bg-slate-50 transition"
        >
          <RefreshCw size={13} />
          刷新
        </button>
      </div>

      <HealthStatsCards health={h} />
      <ServiceList health={h} />
      <SystemMetrics health={h} />
    </div>
  )
}
