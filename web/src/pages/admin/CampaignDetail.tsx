import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { get, post, patch } from '@/lib/api'
import {
  Loader2,
  AlertCircle,
  ArrowLeft,
  RefreshCw,
  Plus,
  Calendar,
  DollarSign,
  Users,
  CheckCircle2,
  X,
  Gift,
  BarChart3,
} from 'lucide-react'
import FeatureDescription from '@/components/admin/FeatureDescription'

// ── Types ──

interface Campaign {
  id: number
  name: string
  description: string | null
  status: string
  budget_amount: string
  start_at: string | null
  end_at: string | null
  createdAt: string
  updatedAt: string
}

interface Allocation {
  agent_id: number
  agent_name: string
  allocated: number
  used: number
  token_amount: number
  valid_days: number
}

// ── Status helpers ──

const statusLabel: Record<string, string> = {
  draft: '草稿',
  active: '进行中',
  ended: '已结束',
  archived: '已归档',
}

const statusColor: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-600',
  active: 'bg-green-100 text-green-700',
  ended: 'bg-blue-100 text-blue-700',
  archived: 'bg-slate-200 text-slate-500',
}

const statusOptions = [
  { value: 'draft', label: '草稿' },
  { value: 'active', label: '进行中' },
  { value: 'ended', label: '已结束' },
  { value: 'archived', label: '已归档' },
]

// ── Page ──

export default function AdminCampaignDetail() {
  const { id: campaignId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const id = parseInt(campaignId || '0', 10)

  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [allocations, setAllocations] = useState<Allocation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const [showAllocModal, setShowAllocModal] = useState(false)
  const [activeTab, setActiveTab] = useState<'info' | 'codes' | 'stats'>('info')

  const fetchCampaign = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setError('')
    setMessage('')
    try {
      const data = await get<{ campaign: Campaign; allocations: Allocation[] }>(`/api/v1/admin/campaigns/${id}`)
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

  const handleStatusChange = async (newStatus: string) => {
    if (!campaign) return
    try {
      await patch(`/api/v1/admin/campaigns/${id}/status`, { status: newStatus })
      setMessage(`活动状态已更新为「${statusLabel[newStatus] || newStatus}」`)
      fetchCampaign()
    } catch (err: any) {
      setError(err.message || '状态更新失败')
    }
  }

  const handleAllocSuccess = () => {
    setShowAllocModal(false)
    fetchCampaign()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="animate-spin" size={32} />
      </div>
    )
  }

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
            <h1 className="text-2xl font-bold text-slate-900">{campaign.name}</h1>
            <FeatureDescription page="admin/campaigns/detail" className="ml-2" />
            {campaign.description && (
              <p className="text-sm text-slate-500 mt-0.5">{campaign.description}</p>
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

      {/* Basic info card */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div className="flex items-start justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-900">基本信息</h2>
          <div className="flex items-center gap-2">
            <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${statusColor[campaign.status] || statusColor.draft}`}>
              {statusLabel[campaign.status] || campaign.status}
            </span>
            <select
              value={campaign.status}
              onChange={(e) => handleStatusChange(e.target.value)}
              className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
            >
              {statusOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <InfoItem icon={Calendar} label="开始时间" value={campaign.start_at ? new Date(campaign.start_at).toLocaleString('zh-CN') : '未设置'} />
          <InfoItem icon={Calendar} label="结束时间" value={campaign.end_at ? new Date(campaign.end_at).toLocaleString('zh-CN') : '未设置'} />
          <InfoItem icon={DollarSign} label="预算金额" value={`¥${Number(campaign.budget_amount).toLocaleString()}`} />
          <InfoItem icon={Users} label="代理商分配" value={`${allocations.length} 个`} />
        </div>
      </div>

      {/* Tab navigation */}
      <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit">
        <button
          onClick={() => setActiveTab('info')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'info'
              ? 'bg-white text-indigo-600 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Users size={16} />
          代理分配
        </button>
        <button
          onClick={() => setActiveTab('codes')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'codes'
              ? 'bg-white text-indigo-600 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Gift size={16} />
          活动码管理
        </button>
        <button
          onClick={() => setActiveTab('stats')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'stats'
              ? 'bg-white text-indigo-600 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <BarChart3 size={16} />
          活动效果
        </button>
      </div>

      {/* Allocations tab */}
      {activeTab === 'info' && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
            <h2 className="text-lg font-semibold text-slate-900">代理分配</h2>
            <button
              onClick={() => setShowAllocModal(true)}
              className="flex items-center gap-1.5 px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
            >
              <Plus size={16} />
              增加分配
            </button>
          </div>

          <div className="overflow-x-auto">
            {allocations.length === 0 ? (
              <div className="py-12 text-center text-slate-400">暂无代理分配</div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50 text-left">
                    <th className="px-6 py-3 text-sm font-medium text-slate-500">代理商</th>
                    <th className="px-6 py-3 text-sm font-medium text-slate-500">分配数量</th>
                    <th className="px-6 py-3 text-sm font-medium text-slate-500">已使用</th>
                    <th className="px-6 py-3 text-sm font-medium text-slate-500">使用率</th>
                    <th className="px-6 py-3 text-sm font-medium text-slate-500">Token 数量</th>
                    <th className="px-6 py-3 text-sm font-medium text-slate-500">有效期 (天)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {allocations.map((a) => {
                    const usageRate = a.allocated > 0 ? Math.round((a.used / a.allocated) * 100) : 0
                    return (
                      <tr key={a.agent_id} className="hover:bg-slate-50 transition">
                        <td className="px-6 py-4 text-sm font-medium text-slate-900">{a.agent_name}</td>
                        <td className="px-6 py-4 text-sm text-slate-600 font-mono">{a.allocated.toLocaleString()}</td>
                        <td className="px-6 py-4 text-sm text-slate-600 font-mono">{a.used.toLocaleString()}</td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden min-w-[80px]">
                              <div
                                className={`h-full rounded-full transition-all ${
                                  usageRate >= 90
                                    ? 'bg-red-500'
                                    : usageRate >= 60
                                    ? 'bg-amber-500'
                                    : 'bg-green-500'
                                }`}
                                style={{ width: `${Math.min(usageRate, 100)}%` }}
                              />
                            </div>
                            <span className={`text-xs font-mono ${
                              usageRate >= 90
                                ? 'text-red-600'
                                : usageRate >= 60
                                ? 'text-amber-600'
                                : 'text-green-600'
                            }`}>
                              {usageRate}%
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-600 font-mono">{a.token_amount.toLocaleString()}</td>
                        <td className="px-6 py-4 text-sm text-slate-600">{a.valid_days}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Codes tab */}
      {activeTab === 'codes' && (
        <CampaignCodesPanel campaignId={id} />
      )}

      {/* Stats tab */}
      {activeTab === 'stats' && (
        <CampaignStatsPanel campaignId={id} />
      )}

      {/* Allocation modal */}
      {showAllocModal && (
        <AllocationFormModal
          campaignId={id}
          onClose={() => setShowAllocModal(false)}
          onSuccess={handleAllocSuccess}
        />
      )}
    </div>
  )
}

// ── Info item ──

function InfoItem({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>
  label: string
  value: string
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-10 h-10 rounded-lg bg-slate-50 flex items-center justify-center shrink-0">
        <Icon size={20} className="text-slate-500" />
      </div>
      <div>
        <p className="text-xs text-slate-400">{label}</p>
        <p className="text-sm font-medium text-slate-800">{value}</p>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════
//  Campaign Codes Panel
// ════════════════════════════════════════════

interface CodeBatch {
  id: number
  count: number
  faceValue: string
  validDays: number
  createdAt: string
  usedCount: number
}

function CampaignCodesPanel({ campaignId }: { campaignId: number }) {
  const [batches, setBatches] = useState<CodeBatch[]>([])
  const [loading, setLoading] = useState(true)
  const [showGenerate, setShowGenerate] = useState(false)

  const fetchBatches = useCallback(async () => {
    setLoading(true)
    try {
      const res = await get<{ list: CodeBatch[] }>(`/api/v1/admin/campaigns/${campaignId}/codes`)
      setBatches(res.list || [])
    } catch {
      // fallback
    } finally {
      setLoading(false)
    }
  }, [campaignId])

  useEffect(() => { fetchBatches() }, [fetchBatches])

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
        <h2 className="text-lg font-semibold text-slate-900">兑换码管理</h2>
        <button
          onClick={() => setShowGenerate(true)}
          className="flex items-center gap-1.5 px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
        >
          <Plus size={16} />
          生成兑换码
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="animate-spin text-slate-400" size={24} />
        </div>
      ) : batches.length === 0 ? (
        <div className="py-12 text-center text-slate-400">暂无兑换码批次</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left">
                <th className="px-6 py-3 font-medium text-slate-500">批次 ID</th>
                <th className="px-6 py-3 font-medium text-slate-500 text-right">生成数量</th>
                <th className="px-6 py-3 font-medium text-slate-500 text-right">已使用</th>
                <th className="px-6 py-3 font-medium text-slate-500 text-right">面额</th>
                <th className="px-6 py-3 font-medium text-slate-500 text-right">有效期 (天)</th>
                <th className="px-6 py-3 font-medium text-slate-500">生成时间</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {batches.map((b) => (
                <tr key={b.id} className="hover:bg-slate-50 transition">
                  <td className="px-6 py-4 font-mono text-xs text-slate-500">#{b.id}</td>
                  <td className="px-6 py-4 text-right font-mono text-slate-600">{b.count.toLocaleString()}</td>
                  <td className="px-6 py-4 text-right font-mono text-slate-600">{b.usedCount}</td>
                  <td className="px-6 py-4 text-right font-mono text-indigo-600">¥{Number(b.faceValue).toFixed(2)}</td>
                  <td className="px-6 py-4 text-right text-slate-600">{b.validDays}</td>
                  <td className="px-6 py-4 text-xs text-slate-400">
                    {new Date(b.createdAt).toLocaleString('zh-CN')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showGenerate && (
        <GenerateCodesModal
          campaignId={campaignId}
          onClose={() => setShowGenerate(false)}
          onSuccess={() => { setShowGenerate(false); fetchBatches() }}
        />
      )}
    </div>
  )
}

// ════════════════════════════════════════════
//  Generate Codes Modal
// ════════════════════════════════════════════

function GenerateCodesModal({
  campaignId,
  onClose,
  onSuccess,
}: {
  campaignId: number
  onClose: () => void
  onSuccess: () => void
}) {
  const [count, setCount] = useState(100)
  const [faceValue, setFaceValue] = useState('')
  const [validDays, setValidDays] = useState(30)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async () => {
    setError('')
    if (count <= 0 || count > 10000) { setError('生成数量需在 1-10000 之间'); return }
    const fv = parseFloat(faceValue)
    if (!fv || fv <= 0) { setError('请输入有效面额'); return }
    if (validDays <= 0) { setError('有效期天数必须大于 0'); return }

    setSaving(true)
    try {
      await post(`/api/v1/admin/campaigns/${campaignId}/generate-codes`, {
        count,
        faceValue: fv,
        validDays,
      })
      onSuccess()
    } catch (err: any) {
      setError(err.message || '生成失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">生成兑换码</h2>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">&times;</button>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 text-sm rounded-lg bg-red-50 text-red-600">
              <AlertCircle size={16} /> {error}
            </div>
          )}

          <div>
            <label className="block text-xs text-slate-500 mb-1">生成数量 <span className="text-red-500">*</span></label>
            <input
              type="number"
              value={count}
              onChange={(e) => setCount(parseInt(e.target.value) || 0)}
              min={1}
              max={10000}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-500 mb-1">面额 <span className="text-red-500">*</span></label>
            <div className="relative">
              <span className="absolute left-3 top-2 text-slate-400 text-sm">¥</span>
              <input
                type="number"
                value={faceValue}
                onChange={(e) => setFaceValue(e.target.value)}
                placeholder="0.00"
                min={0.01}
                step={0.01}
                className="w-full pl-8 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-500 mb-1">有效期 (天) <span className="text-red-500">*</span></label>
            <input
              type="number"
              value={validDays}
              onChange={(e) => setValidDays(parseInt(e.target.value) || 0)}
              min={1}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button onClick={onClose} disabled={saving} className="px-4 py-2 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50">取消</button>
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              {saving ? '生成中...' : '生成兑换码'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════
//  Campaign Stats Panel
// ════════════════════════════════════════════

interface CampaignStats {
  participantCount: number
  redeemRate: number
  totalCommission: number
  roi: number
}

function CampaignStatsPanel({ campaignId }: { campaignId: number }) {
  const [stats, setStats] = useState<CampaignStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    setLoading(true)
    get<CampaignStats>(`/api/v1/admin/campaigns/${campaignId}/stats`)
      .then((data) => setStats(data))
      .catch((err: any) => setError(err.message || '获取活动统计数据失败'))
      .finally(() => setLoading(false))
  }, [campaignId])

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 flex justify-center">
        <Loader2 className="animate-spin text-slate-400" size={24} />
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm">
          <AlertCircle size={16} /> {error}
        </div>
      </div>
    )
  }

  if (!stats) return null

  const statCards = [
    { label: '参与用户数', value: stats.participantCount.toLocaleString(), color: 'text-blue-600 bg-blue-50' },
    { label: '兑换率', value: `${(stats.redeemRate * 100).toFixed(1)}%`, color: 'text-green-600 bg-green-50' },
    { label: '产生的佣金', value: `¥${stats.totalCommission.toFixed(2)}`, color: 'text-amber-600 bg-amber-50' },
    { label: 'ROI', value: `${(stats.roi * 100).toFixed(1)}%`, color: 'text-indigo-600 bg-indigo-50' },
  ]

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
      <h2 className="text-lg font-semibold text-slate-900 mb-4">活动效果</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card) => (
          <div key={card.label} className={`rounded-lg p-5 ${card.color.replace('text-', '').replace('bg-', '').split(' ').map(c => `bg-${c}`).join(' ')}`}>
            <p className="text-xs text-slate-500 mb-1">{card.label}</p>
            <p className="text-2xl font-bold text-slate-900">{card.value}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Allocation form modal ──

function AllocationFormModal({
  campaignId,
  onClose,
  onSuccess,
}: {
  campaignId: number
  onClose: () => void
  onSuccess: () => void
}) {
  const [agentId, setAgentId] = useState<number | ''>('')
  const [allocated, setAllocated] = useState(0)
  const [tokenAmount, setTokenAmount] = useState(0)
  const [validDays, setValidDays] = useState(30)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [agents, setAgents] = useState<Array<{ id: number; name: string }>>([])

  useEffect(() => {
    // Fetch agent list for dropdown
    get<{ list: Array<{ id: number; nickname: string; email: string }> }>('/api/v1/admin/agents', { page: 1, pageSize: 200 })
      .then((data) => {
        const list = (data.list || []).map((a) => ({
          id: a.id,
          name: a.nickname || a.email || `代理商 #${a.id}`,
        }))
        setAgents(list)
      })
      .catch(() => {
        // fallback if endpoint varies
        setAgents([])
      })
  }, [])

  const handleSubmit = async () => {
    setError('')
    if (!agentId) { setError('请选择代理商'); return }
    if (allocated <= 0) { setError('分配数量必须大于 0'); return }
    if (tokenAmount <= 0) { setError('Token 数量必须大于 0'); return }
    if (validDays <= 0) { setError('有效期天数必须大于 0'); return }

    setSaving(true)
    try {
      await post(`/api/v1/admin/campaigns/${campaignId}/allocations`, {
        agent_id: agentId,
        count: allocated,
        token_amount: tokenAmount,
        valid_days: validDays,
      })
      onSuccess()
    } catch (err: any) {
      setError(err.message || '分配失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl w-full max-w-md shadow-xl">
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">增加分配</h2>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl">&times;</button>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 text-sm rounded-lg bg-red-50 text-red-600">
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          <div className="space-y-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">代理商 <span className="text-red-500">*</span></label>
              <select
                value={agentId}
                onChange={(e) => setAgentId(e.target.value ? Number(e.target.value) : '')}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
              >
                <option value="">请选择代理商</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1">分配数量 <span className="text-red-500">*</span></label>
                <input
                  type="number"
                  value={allocated}
                  onChange={(e) => setAllocated(parseInt(e.target.value) || 0)}
                  min={1}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Token 数量 <span className="text-red-500">*</span></label>
                <input
                  type="number"
                  value={tokenAmount}
                  onChange={(e) => setTokenAmount(parseInt(e.target.value) || 0)}
                  min={1}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">有效期天数 <span className="text-red-500">*</span></label>
              <input
                type="number"
                value={validDays}
                onChange={(e) => setValidDays(parseInt(e.target.value) || 0)}
                min={1}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 border border-slate-300 rounded-lg"
            >
              取消
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition"
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              {saving ? '提交中...' : '确认分配'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
