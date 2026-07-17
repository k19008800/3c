// ============================================================
//  CampaignDetail.tsx — 活动详情整合入口
//  集成 CampaignInfo / CampaignRedemptions / CampaignMetrics
// ============================================================

import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { get, patch } from '@/lib/api'
import {
  Loader2,
  AlertCircle,
  ArrowLeft,
  RefreshCw,
  CheckCircle2,
  Users,
  Gift,
  BarChart3,
} from 'lucide-react'
import FeatureDescription from '@/components/admin/FeatureDescription'
import CampaignInfo from './CampaignInfo'
import CampaignRedemptions from './CampaignRedemptions'
import CampaignMetrics from './CampaignMetrics'
import type { Campaign, Allocation } from './types'
import { statusLabel } from './types'

type TabKey = 'info' | 'codes' | 'stats'

/** Tab 配置 */
const TABS: { key: TabKey; label: string; icon: React.ComponentType<{ size?: number }> }[] = [
  { key: 'info', label: '代理分配', icon: Users },
  { key: 'codes', label: '活动码管理', icon: Gift },
  { key: 'stats', label: '活动效果', icon: BarChart3 },
]

export default function CampaignDetailPage() {
  const { id: campaignId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const id = parseInt(campaignId || '0', 10)

  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [allocations, setAllocations] = useState<Allocation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [activeTab, setActiveTab] = useState<TabKey>('info')

  const fetchCampaign = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setError('')
    setMessage('')
    try {
      const data = await get<{ campaign: Campaign; allocations: Allocation[] }>(
        `/api/v1/admin/campaigns/${id}`,
      )
      setCampaign(data.campaign)
      setAllocations(data.allocations || [])
    } catch (err: any) {
      setError(err.message || '获取活动详情失败')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    fetchCampaign()
  }, [fetchCampaign])

  const handleStatusChange = useCallback(
    async (newStatus: string) => {
      if (!campaign) return
      try {
        await patch(`/api/v1/admin/campaigns/${id}/status`, {
          status: newStatus,
        })
        setMessage(
          `活动状态已更新为「${statusLabel[newStatus] || newStatus}」`,
        )
        fetchCampaign()
      } catch (err: any) {
        setError(err.message || '状态更新失败')
      }
    },
    [campaign, id, fetchCampaign],
  )

  // 加载中
  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="animate-spin" size={32} />
      </div>
    )
  }

  // 错误状态（无数据）
  if (error && !campaign) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => navigate('/admin/campaigns')}
          className="flex items-center gap-1 text-sm text-slate-600 hover:text-slate-800"
        >
          <ArrowLeft size={16} />
          返回活动列表
        </button>
        <div className="flex items-center gap-2 text-red-600 bg-red-50 p-4 rounded-lg">
          <AlertCircle size={20} />
          <span>{error}</span>
        </div>
      </div>
    )
  }

  if (!campaign) return null

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/admin/campaigns')}
            className="p-2 rounded-lg hover:bg-slate-100 text-slate-600 transition"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              {campaign.name}
            </h1>
            <FeatureDescription page="admin/campaigns/detail" className="ml-2" />
            {campaign.description && (
              <p className="text-sm text-slate-500 mt-0.5">
                {campaign.description}
              </p>
            )}
          </div>
        </div>
        <button
          onClick={fetchCampaign}
          className="flex items-center gap-1 px-3 py-2 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition"
        >
          <RefreshCw size={14} />
          刷新
        </button>
      </div>

      {/* Flash messages */}
      {message && (
        <div className="flex items-center gap-2 p-3 text-sm rounded-lg bg-green-50 text-green-700">
          <CheckCircle2 size={16} />
          {message}
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 p-3 text-sm rounded-lg bg-red-50 text-red-600">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {/* Tab navigation */}
      <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === key
                ? 'bg-white text-indigo-600 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'info' && (
        <CampaignInfo
          campaign={campaign}
          allocations={allocations}
          onStatusChange={handleStatusChange}
          onRefresh={fetchCampaign}
        />
      )}
      {activeTab === 'codes' && <CampaignRedemptions campaignId={id} />}
      {activeTab === 'stats' && <CampaignMetrics campaignId={id} />}
    </div>
  )
}
