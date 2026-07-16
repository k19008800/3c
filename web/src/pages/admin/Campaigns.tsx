import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { get, post, patch } from '@/lib/api'
import type { PaginatedData } from '@/types'
import PaginationBar from '@/components/ui/PaginationBar'
import FeatureDescription from '@/components/admin/FeatureDescription'
import {
  Loader2,
  AlertCircle,
  Search,
  Plus,
  Pencil,
  Eye,
  XCircle,
  BarChart3,
  CheckCircle2,
  DollarSign,
  Megaphone,
} from 'lucide-react'

// ── Types ──

interface Campaign {
  id: number
  name: string
  description: string | null
  status: string // draft | active | ended | archived
  budget_amount: string
  start_at: string | null
  end_at: string | null
  createdAt: string
  updatedAt: string
}

interface CampaignStats {
  total: number
  active: number
  ended: number
  totalBudget: string
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

const emptyForm = {
  name: '',
  description: '',
  start_at: '',
  end_at: '',
  budget_amount: '0',
}

// ── Page ──

export default function AdminCampaigns() {
  const navigate = useNavigate()

  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [stats, setStats] = useState<CampaignStats>({ total: 0, active: 0, ended: 0, totalBudget: '0' })
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null)
  const [endConfirmId, setEndConfirmId] = useState<number | null>(null)

  const totalPages = Math.ceil(total / pageSize)

  const fetchCampaigns = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params: any = { page, pageSize }
      if (keyword) params.keyword = keyword
      if (statusFilter) params.status = statusFilter
      const data = await get<PaginatedData<Campaign>>('/api/v1/admin/campaigns', params)
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

  useEffect(() => {
    fetchCampaigns()
  }, [fetchCampaigns])

  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  const handleEndCampaign = async () => {
    if (!endConfirmId) return
    try {
      await patch(`/api/v1/admin/campaigns/${endConfirmId}/status`, { status: 'ended' })
      setEndConfirmId(null)
      fetchCampaigns()
      fetchStats()
    } catch (err: any) {
      setError(err.message || '操作失败')
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">营销活动</h1>
        <FeatureDescription page="admin/campaigns" className="ml-2" />
        <button
          onClick={() => { setEditingCampaign(null); setShowCreateModal(true) }}
          className="flex items-center gap-1.5 px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
        >
          <Plus size={16} />
          新建活动
        </button>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard icon={Megaphone} label="活动总数" value={String(stats.total)} color="text-indigo-600" bg="bg-indigo-50" />
        <StatsCard icon={BarChart3} label="进行中" value={String(stats.active)} color="text-green-600" bg="bg-green-50" />
        <StatsCard icon={CheckCircle2} label="已结束" value={String(stats.ended)} color="text-blue-600" bg="bg-blue-50" />
        <StatsCard icon={DollarSign} label="总预算" value={`￥${Number(stats.totalBudget).toLocaleString()}`} color="text-amber-600" bg="bg-amber-50" />
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs text-slate-500 mb-1">搜索</label>
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={keyword}
                onChange={(e) => { setKeyword(e.target.value); setPage(1) }}
                onKeyDown={e => e.key === 'Enter' && fetchCampaigns()}
                placeholder="搜索活动名称"
                className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">状态</label>
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
            >
              <option value="">全部</option>
              <option value="draft">草稿</option>
              <option value="active">进行中</option>
              <option value="ended">已结束</option>
              <option value="archived">已归档</option>
            </select>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 text-left">
                <th className="px-4 py-3 text-sm font-medium text-slate-500">ID</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">名称</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">状态</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">开始时间</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">结束时间</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">预算 (￥)</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">创建时间</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={8} className="text-center py-12">
                    <Loader2 className="animate-spin inline-block" size={24} />
                  </td>
                </tr>
              ) : campaigns.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-slate-400">暂无活动</td>
                </tr>
              ) : (
                campaigns.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50 transition">
                    <td className="px-4 py-3 text-sm text-slate-600">{c.id}</td>
                    <td className="px-4 py-3 text-sm text-slate-900 font-medium max-w-[200px] truncate">
                      {c.name}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${statusColor[c.status] || statusColor.draft}`}>
                        {statusLabel[c.status] || c.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500 whitespace-nowrap">
                      {c.start_at ? new Date(c.start_at).toLocaleDateString('zh-CN') : '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500 whitespace-nowrap">
                      {c.end_at ? new Date(c.end_at).toLocaleDateString('zh-CN') : '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600 font-mono">
                      {(Number(c.budget_amount) || 0).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500 whitespace-nowrap">
                      {new Date(c.createdAt).toLocaleDateString('zh-CN')}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => navigate(`/admin/campaigns/${c.id}`)}
                          className="flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-800"
                        >
                          <Eye size={14} />
                          详情
                        </button>
                        <button
                          onClick={() => { setEditingCampaign(c); setShowCreateModal(true) }}
                          className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
                        >
                          <Pencil size={14} />
                          编辑
                        </button>
                        {c.status === 'active' && (
                          <button
                            onClick={() => setEndConfirmId(c.id)}
                            className="flex items-center gap-1 text-sm text-amber-600 hover:text-amber-800"
                          >
                            <XCircle size={14} />
                            提前结束
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {total > 0 && (
          <PaginationBar
            page={page}
            onPageChange={setPage}
            pageSize={pageSize}
            onPageSizeChange={setPageSize}
            total={total}
            totalPages={totalPages}
          />
        )}
      </div>

      {/* Create / Edit Modal */}
      {showCreateModal && (
        <CampaignFormModal
          campaign={editingCampaign}
          onClose={() => { setShowCreateModal(false); setEditingCampaign(null) }}
          onSuccess={() => { setShowCreateModal(false); setEditingCampaign(null); fetchCampaigns(); fetchStats() }}
        />
      )}

      {/* End Campaign Confirmation */}
      {endConfirmId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl w-full max-w-sm shadow-xl p-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-2">确认提前结束</h3>
            <p className="text-sm text-slate-600 mb-6">
              确定要提前结束该活动吗？结束后将无法重新激活。
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

// ── Stats Card ──

function StatsCard({
  icon: Icon,
  label,
  value,
  color,
  bg,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>
  label: string
  value: string
  color: string
  bg: string
}) {
  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200 flex items-center gap-4">
      <div className={`w-12 h-12 rounded-lg ${bg} flex items-center justify-center`}>
        <Icon size={24} className={color} />
      </div>
      <div>
        <p className="text-xs text-slate-500">{label}</p>
        <p className={`text-xl font-bold ${color}`}>{value}</p>
      </div>
    </div>
  )
}

// ── Campaign Form Modal ──

function CampaignFormModal({
  campaign,
  onClose,
  onSuccess,
}: {
  campaign: Campaign | null
  onClose: () => void
  onSuccess: () => void
}) {
  const isEdit = !!campaign
  const [form, setForm] = useState(
    isEdit
      ? {
          name: campaign!.name,
          description: campaign!.description || '',
          start_at: campaign!.start_at ? campaign!.start_at.slice(0, 16) : '',
          end_at: campaign!.end_at ? campaign!.end_at.slice(0, 16) : '',
          budget_amount: campaign!.budget_amount,
        }
      : { ...emptyForm }
  )
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = async () => {
    setMessage('')
    setError('')
    if (!form.name.trim()) { setError('请输入活动名称'); return }
    if (!form.budget_amount || Number(form.budget_amount) <= 0) { setError('请输入有效预算'); return }

    setSaving(true)
    try {
      const body = {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        start_at: form.start_at ? new Date(form.start_at).toISOString() : null,
        end_at: form.end_at ? new Date(form.end_at).toISOString() : null,
        budget_amount: form.budget_amount,
      }

      if (isEdit) {
        await patch(`/api/v1/admin/campaigns/${campaign!.id}`, body)
        setMessage('活动已更新')
      } else {
        await post('/api/v1/admin/campaigns', body)
        setMessage('活动已创建')
      }
      setTimeout(onSuccess, 800)
    } catch (err: any) {
      setError(err.message || (isEdit ? '更新失败' : '创建失败'))
    } finally {
      setSaving(false)
    }
  }

  const updateField = (key: string, value: any) =>
    setForm((f) => ({ ...f, [key]: value }))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl w-full max-w-lg shadow-xl">
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">{isEdit ? '编辑活动' : '新建活动'}</h2>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl">&times;</button>
          </div>

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

          <div className="space-y-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">
                活动名称 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => updateField('name', e.target.value)}
                placeholder="例如：暑期大促"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">描述</label>
              <textarea
                value={form.description}
                onChange={(e) => updateField('description', e.target.value)}
                placeholder="活动描述（选填）"
                rows={3}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1">开始时间</label>
                <input
                  type="datetime-local"
                  value={form.start_at}
                  onChange={(e) => updateField('start_at', e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">结束时间</label>
                <input
                  type="datetime-local"
                  value={form.end_at}
                  onChange={(e) => updateField('end_at', e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">
                预算金额 (￥) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                value={form.budget_amount}
                onChange={(e) => updateField('budget_amount', e.target.value)}
                min={0}
                step="0.01"
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
              {saving ? (isEdit ? '更新中...' : '创建中...') : (isEdit ? '保存' : '创建')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}