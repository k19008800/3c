// ============================================================
//  Campaigns.tsx — 活动列表页（入口）
//  整合子组件：CampaignStatsCards / CampaignList / CampaignForm
// ============================================================

import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { get, patch } from '@/lib/api'
import type { PaginatedData } from '@/types'
import FilterBar from '@/components/ui/FilterBar'
import FeatureDescription from '@/components/admin/FeatureDescription'
import { usePersistedFilters } from '@/hooks/use-persisted-filters'
import { Plus, AlertCircle, Loader2 } from 'lucide-react'
import CampaignStatsCards from './campaigns/CampaignStatsCards'
import CampaignList from './campaigns/CampaignList'
import CampaignForm from './campaigns/CampaignForm'
import type { Campaign, CampaignStats } from './campaigns/types'

interface TrendPoint {
  value: number
  label?: string
}

export default function AdminCampaigns() {
  const navigate = useNavigate()

  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [stats, setStats] = useState<CampaignStats>({
    total: 0,
    active: 0,
    ended: 0,
    totalBudget: '0',
  })
  const [trendData, setTrendData] = useState<TrendPoint[]>([])
  const [trendLoading, setTrendLoading] = useState(false)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null)
  const [endConfirmId, setEndConfirmId] = useState<number | null>(null)

  // 持久化筛选
  const { filters, setFilter, setFilters, resetFilters, hasActiveFilters } =
    usePersistedFilters({
      storageKey: 'admin-campaigns',
      defaults: { keyword: '', status: '', page: 1, pageSize: 20 },
    })
  const { keyword, status: statusFilter, page, pageSize } = filters as {
    keyword: string
    status: string
    page: number
    pageSize: number
  }
  const totalPages = Math.ceil(total / pageSize)

  const fetchCampaigns = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params: any = { page, pageSize }
      if (keyword) params.keyword = keyword
      if (statusFilter) params.status = statusFilter
      const data = await get<PaginatedData<Campaign>>(
        '/api/v1/admin/campaigns',
        params,
      )
      setCampaigns(data.list)
      setTotal(data.total)
    } catch (err: any) {
      setError(err.message || '获取活动列表失败')
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, keyword, statusFilter])

  const fetchStats = useCallback(async () => {
    try {
      const s = await get<CampaignStats>('/api/v1/admin/campaigns/stats')
      if (s) setStats(s)
    } catch {
      // optional — backend may not have the stats endpoint yet
    }
  }, [])

  const fetchTrend = useCallback(async () => {
    setTrendLoading(true)
    try {
      const data = await get<{ list: TrendPoint[] }>(
        '/api/v1/admin/campaigns/trend',
      )
      if (data?.list) setTrendData(data.list)
    } catch {
      // optional — backend may not have trend endpoint yet
    } finally {
      setTrendLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchCampaigns()
  }, [fetchCampaigns])

  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  useEffect(() => {
    fetchTrend()
  }, [fetchTrend])

  const handleEndCampaign = useCallback(async () => {
    if (!endConfirmId) return
    try {
      await patch(`/api/v1/admin/campaigns/${endConfirmId}/status`, {
        status: 'ended',
      })
      setEndConfirmId(null)
      fetchCampaigns()
      fetchStats()
    } catch (err: any) {
      setError(err.message || '操作失败')
    }
  }, [endConfirmId, fetchCampaigns, fetchStats])

  const handleFormSuccess = useCallback(() => {
    setShowCreateModal(false)
    setEditingCampaign(null)
    fetchCampaigns()
    fetchStats()
  }, [fetchCampaigns, fetchStats])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">营销活动</h1>
        <FeatureDescription page="admin/campaigns" className="ml-2" />
        <button
          onClick={() => {
            setEditingCampaign(null)
            setShowCreateModal(true)
          }}
          className="flex items-center gap-1.5 px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
        >
          <Plus size={16} />
          新建活动
        </button>
      </div>

      {/* Stats cards */}
      <CampaignStatsCards
        stats={stats}
        trendData={trendData}
        trendLoading={trendLoading}
      />

      {/* Filters */}
      <FilterBar
        filters={{ keyword, status: statusFilter }}
        setFilter={(key, value) => setFilter(key as any, value)}
        resetFilters={resetFilters}
        hasActiveFilters={hasActiveFilters}
        onSearch={fetchCampaigns}
        fields={[
          {
            key: 'keyword',
            label: '搜索',
            type: 'text',
            placeholder: '搜索活动名称',
          },
          {
            key: 'status',
            label: '状态',
            type: 'select',
            options: [
              { value: '', label: '全部' },
              { value: 'draft', label: '草稿' },
              { value: 'active', label: '进行中' },
              { value: 'ended', label: '已结束' },
              { value: 'archived', label: '已归档' },
            ],
          },
        ]}
      />

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {/* Table */}
      <CampaignList
        campaigns={campaigns}
        loading={loading}
        error={error}
        total={total}
        page={page}
        pageSize={pageSize}
        totalPages={totalPages}
        onView={(id) => navigate(`/admin/campaigns/${id}`)}
        onEdit={(c) => {
          setEditingCampaign(c)
          setShowCreateModal(true)
        }}
        onEndConfirm={(id) => setEndConfirmId(id)}
        onPageChange={(p) => setFilter('page', p)}
        onPageSizeChange={(s) => setFilters({ pageSize: s, page: 1 })}
      />

      {/* Create / Edit Modal */}
      {showCreateModal && (
        <CampaignForm
          campaign={editingCampaign}
          onClose={() => {
            setShowCreateModal(false)
            setEditingCampaign(null)
          }}
          onSuccess={handleFormSuccess}
        />
      )}

      {/* End Campaign Confirmation */}
      {endConfirmId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl w-full max-w-sm shadow-xl p-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-2">
              确认提前结束
            </h3>
            <p className="text-sm text-slate-600 mb-6">
              确定要提前结束该活动吗?结束后将无法重新激活。
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setEndConfirmId(null)}
                className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 border border-slate-300 rounded-lg"
              >
                取消
              </button>
              <button
                onClick={handleEndCampaign}
                className="px-4 py-2 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700"
              >
                确认结束
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
