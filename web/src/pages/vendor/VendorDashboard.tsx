/**
 * 供应商 Dashboard — 独立供应商门户首页
 *
 * 从 admin/VendorSelfMgmt.tsx 迁移核心功能，适配独立供应商路由。
 * 鉴权方式：X-Vendor-Key header（通过 JWT 中的 vendorId 自动获取）。
 */

import { useEffect, useState, useCallback } from 'react'
import api, { get, post, put, del } from '@/lib/api'
import { useAuth } from '@/hooks/use-auth'
import {
  Loader2, AlertCircle, RefreshCw, Users, Plus, Key, Activity, Shield,
  TrendingUp, DollarSign, Save, X, BarChart3, Clock, Zap, Edit3, Trash2,
  ChevronRight, Bell, CheckCircle2,
} from 'lucide-react'
import VendorOnboardingGuide from './components/VendorOnboardingGuide'

// ── Types ──

interface VendorInfo {
  id: number; name: string; baseUrl: string; status: string
  description: string | null; companyName: string | null
  contactName: string | null; contactPhone: string | null; contactEmail: string | null
  createdAt: string; vendorKeyPrefix: string | null; vendorKeyActive: boolean | null
}

interface VendorModelInfo {
  id: number; modelId: number; modelName: string; upstreamModelName: string
  apiEndpoint: string; costPriceInput: string; costPriceOutput: string
  sellPriceInput: string; sellPriceOutput: string; weight: number; status: boolean
  rpmLimit: number | null; tpmLimit: number | null
  healthScore: string | number | null; isDown: boolean; circuitState: string
  circuitFailCount: number; createdAt: string
}

interface VendorStats {
  totalCalls: number; todayCalls: number; totalRevenue: string
  totalTokens?: number; successRate?: number; avgDuration?: number
  modelStats: Array<{ modelName: string; calls: number; totalTokens: number; revenue: string }>
  dailyTrend?: Array<{ date: string; calls: number; tokens: number }>
  hourlyTrend?: Array<{ hour: number; calls: number }>
}

interface VendorHealthItem {
  vendorModelId: number; modelName: string; upstreamModelName: string
  status: boolean; healthScore: number | string | null
  healthSamples: number | null; consecutiveSuccess: number | null
  lastHealthCheckAt: string | null; isDown: boolean
}

// ── Helpers ──

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万`
  return n.toLocaleString()
}

function fmtCost(n: string | number): string {
  const v = typeof n === 'string' ? parseFloat(n) : n
  if (isNaN(v)) return '¥0'
  if (v < 0.01) return `¥${v.toFixed(6)}`
  return `¥${v.toFixed(2)}`
}

// ── StatusBadge ──

function StatusBadge({ status }: { status: string | boolean }) {
  const isActive = status === true || status === 'active'
  const isPending = status === 'pending'
  return (
    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium border ${
      isActive ? 'bg-green-100 text-green-700 border-green-200' :
      isPending ? 'bg-yellow-100 text-yellow-700 border-yellow-200' :
      'bg-red-100 text-red-700 border-red-200'
    }`}>
      {isActive ? '已激活' : isPending ? '待审核' : '已禁用'}
    </span>
  )
}

// ── StatCard ──

function StatCard({ label, value, sub, color, icon: Icon }: {
  label: string; value: string; sub?: string; color: string; icon: any
}) {
  return (
    <div className={`rounded-lg border p-4 ${color}`}>
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs text-slate-500">{label}</p>
        <Icon size={16} className="text-slate-400" />
      </div>
      <p className="text-lg font-bold text-slate-800">{value}</p>
      {sub && <p className="text-[10px] text-slate-500 mt-0.5">{sub}</p>}
    </div>
  )
}

// ── ModelFormModal ──

function ModelFormModal({ open, edit, onClose, onSaved }: {
  open: boolean; edit: VendorModelInfo | null; onClose: () => void; onSaved: () => void
}) {
  const [form, setForm] = useState({
    modelId: '', upstreamModelName: '', sellPriceInput: '', sellPriceOutput: '',
    weight: '100', status: true,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (edit) {
      setForm({
        modelId: String(edit.modelId),
        upstreamModelName: edit.upstreamModelName,
        sellPriceInput: edit.sellPriceInput,
        sellPriceOutput: edit.sellPriceOutput,
        weight: String(edit.weight),
        status: edit.status,
      })
    } else {
      setForm({ modelId: '', upstreamModelName: '', sellPriceInput: '', sellPriceOutput: '', weight: '100', status: true })
    }
    setError('')
  }, [edit, open])

  if (!open) return null

  const handleSave = async () => {
    if (!form.upstreamModelName.trim()) { setError('请输入上游模型名称'); return }
    setSaving(true); setError('')
    try {
      if (edit) {
        await put(`/api/vendor/models/${edit.id}`, {
          upstreamModelName: form.upstreamModelName,
          sellPriceInput: parseFloat(form.sellPriceInput) || 0,
          sellPriceOutput: parseFloat(form.sellPriceOutput) || 0,
          weight: parseInt(form.weight) || 100,
          status: form.status,
        })
      } else {
        await post('/api/vendor/models', {
          modelId: parseInt(form.modelId) || 0,
          upstreamModelName: form.upstreamModelName,
          sellPriceInput: parseFloat(form.sellPriceInput) || 0,
          sellPriceOutput: parseFloat(form.sellPriceOutput) || 0,
          weight: parseInt(form.weight) || 100,
          status: form.status,
        })
      }
      onSaved(); onClose()
    } catch (e: any) {
      setError(e?.response?.data?.message || e.message || '保存失败')
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-lg mx-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">{edit ? '编辑模型配置' : '添加模型映射'}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>
        {error && (
          <div className="flex items-center gap-2 text-red-600 bg-red-50 p-2 rounded text-sm mb-3">
            <AlertCircle size={16} />{error}
          </div>
        )}
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">上游模型名称</label>
            <input type="text" value={form.upstreamModelName}
              onChange={e => setForm(p => ({ ...p, upstreamModelName: e.target.value }))}
              placeholder="如: gpt-4o"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">售价Input (¥/token)</label>
              <input type="number" step="0.000001" value={form.sellPriceInput}
                onChange={e => setForm(p => ({ ...p, sellPriceInput: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">售价Output (¥/token)</label>
              <input type="number" step="0.000001" value={form.sellPriceOutput}
                onChange={e => setForm(p => ({ ...p, sellPriceOutput: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">权重 (0-100)</label>
              <input type="number" min="0" max="100" value={form.weight}
                onChange={e => setForm(p => ({ ...p, weight: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">状态</label>
              <select value={form.status ? 'true' : 'false'}
                onChange={e => setForm(p => ({ ...p, status: e.target.value === 'true' }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="true">启用</option>
                <option value="false">禁用</option>
              </select>
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={onClose}
              className="flex-1 px-4 py-2 border border-slate-300 text-slate-600 rounded-lg text-sm hover:bg-slate-50">取消</button>
            <button onClick={handleSave} disabled={saving}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-1">
              {saving ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />}
              {edit ? '保存' : '添加'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── KeyRotateModal ──

function KeyRotateModal({ open, onClose, onRotated }: {
  open: boolean; onClose: () => void; onRotated: (key: string) => void
}) {
  const [newKey, setNewKey] = useState('')
  const [generated, setGenerated] = useState('')
  const [rotating, setRotating] = useState(false)
  const [error, setError] = useState('')

  if (!open) return null

  const handleRotate = async () => {
    setRotating(true); setError('')
    try {
      const data = await put<{ key?: string }>('/api/vendor/key', { key: newKey || undefined })
      const k = data?.key || '新 Key 已生成'
      setGenerated(k)
      onRotated(k)
    } catch (e: any) {
      setError(e?.response?.data?.message || e.message || '轮换失败')
    } finally { setRotating(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">轮换 API Key</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>
        {error && (
          <div className="flex items-center gap-2 text-red-600 bg-red-50 p-2 rounded text-sm mb-3">
            <AlertCircle size={16} />{error}
          </div>
        )}
        {generated ? (
          <div className="space-y-3">
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-700">Key 轮换成功！请保存新 Key：</div>
            <code className="block p-3 bg-slate-100 rounded-lg text-sm font-mono break-all">{generated}</code>
            <button onClick={onClose} className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg text-sm">关闭</button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">输入新 Key 留空则自动生成。轮换后旧 Key 立即失效。</p>
            <input type="text" value={newKey} onChange={e => setNewKey(e.target.value)}
              placeholder="留空自动生成"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <button onClick={handleRotate} disabled={rotating}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-1">
              {rotating ? <Loader2 className="animate-spin" size={14} /> : <RefreshCw size={14} />}确认轮换
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ════════════════════════════════════════
//  VendorDashboard (Main)
// ════════════════════════════════════════

export default function VendorDashboard() {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState<'info' | 'models' | 'stats' | 'health'>('info')
  const [info, setInfo] = useState<VendorInfo | null>(null)
  const [models, setModels] = useState<VendorModelInfo[]>([])
  const [stats, setStats] = useState<VendorStats | null>(null)
  const [health, setHealth] = useState<VendorHealthItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [editProfile, setEditProfile] = useState(false)
  const [profileForm, setProfileForm] = useState({ contactName: '', contactPhone: '', contactEmail: '', description: '' })
  const [savingProfile, setSavingProfile] = useState(false)

  // Modals
  const [showModelModal, setShowModelModal] = useState(false)
  const [editingModel, setEditingModel] = useState<VendorModelInfo | null>(null)
  const [showKeyModal, setShowKeyModal] = useState(false)

  // Onboarding
  const [showOnboarding, setShowOnboarding] = useState(() => {
    const dismissed = localStorage.getItem('vendor_onboarding_dismissed')
    return dismissed !== 'true'
  })

  const fetchInfo = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const data = await get<VendorInfo>('/api/vendor/me')
      setInfo(data)
      setProfileForm({
        contactName: data.contactName || '',
        contactPhone: data.contactPhone || '',
        contactEmail: data.contactEmail || '',
        description: data.description || '',
      })
    } catch (e: any) { setError(e.message || '获取信息失败') }
    finally { setLoading(false) }
  }, [])

  const fetchModels = useCallback(async () => {
    setLoading(true); setError('')
    try { const data = await get<VendorModelInfo[]>('/api/vendor/models'); setModels(data || []) }
    catch (e: any) { setError(e.message || '获取模型列表失败') }
    finally { setLoading(false) }
  }, [])

  const fetchStats = useCallback(async () => {
    setLoading(true); setError('')
    try { const data = await get<VendorStats>('/api/vendor/stats'); setStats(data) }
    catch (e: any) { setError(e.message || '获取统计失败') }
    finally { setLoading(false) }
  }, [])

  const fetchHealth = useCallback(async () => {
    setLoading(true); setError('')
    try { const data = await get<VendorHealthItem[]>('/api/vendor/health'); setHealth(data || []) }
    catch (e: any) { setError(e.message || '获取健康数据失败') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchInfo(); fetchModels() }, [])

  const handleTabChange = (tab: typeof activeTab) => {
    setActiveTab(tab); setError('')
    switch (tab) {
      case 'stats': fetchStats(); break
      case 'health': fetchHealth(); break
      case 'models': fetchModels(); break
      case 'info': fetchInfo(); break
    }
  }

  const handleSaveProfile = async () => {
    setSavingProfile(true); setError('')
    try {
      await put('/api/vendor/me', profileForm)
      setEditProfile(false)
      fetchInfo()
    } catch (e: any) { setError(e.message || '保存失败') }
    finally { setSavingProfile(false) }
  }

  const handleDeleteModel = async (id: number, name: string) => {
    if (!confirm(`确认删除模型映射 "${name}" ？`)) return
    try { await del(`/api/vendor/models/${id}`); fetchModels() }
    catch (e: any) { setError(e?.response?.data?.message || e.message || '删除失败') }
  }

  const handleDismissOnboarding = () => {
    localStorage.setItem('vendor_onboarding_dismissed', 'true')
    setShowOnboarding(false)
  }

  // ════════════════════════════════

  return (
    <div className="space-y-6">
      {/* Onboarding Guide */}
      {showOnboarding && (
        <VendorOnboardingGuide onDismiss={handleDismissOnboarding} />
      )}

      {/* Title */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">供应商工作台</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            欢迎回来{info ? `，${info.name}` : ''}
          </p>
        </div>
        {info && (
          <div className="flex items-center gap-2">
            <StatusBadge status={info.status} />
            <button
              onClick={() => setShowKeyModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-lg text-xs hover:bg-slate-50 transition"
            >
              <RefreshCw size={13} />轮换 Key
            </button>
          </div>
        )}
      </div>

      {/* Error alert */}
      {error && (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm border border-red-200">
          <AlertCircle size={16} />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError('')} className="text-red-500 hover:text-red-700"><X size={16} /></button>
        </div>
      )}

      {/* Loading state */}
      {loading && !info && (
        <div className="flex justify-center py-12">
          <Loader2 className="animate-spin text-blue-500" size={28} />
        </div>
      )}

      {/* No vendor info — show setup prompt */}
      {!loading && !info && !error && (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <Key size={40} className="mx-auto text-slate-300 mb-4" />
          <h3 className="text-lg font-semibold text-slate-700 mb-2">开始使用供应商门户</h3>
          <p className="text-sm text-slate-500 max-w-md mx-auto mb-6">
            您的供应商账号已就绪。点击下方按钮加载您的供应商信息，开始管理模型和数据。
          </p>
          <button
            onClick={fetchInfo}
            className="px-6 py-2.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition inline-flex items-center gap-2"
          >
            <RefreshCw size={16} />加载供应商信息
          </button>
        </div>
      )}

      {/* Main content */}
      {info && (
        <>
          {/* Profile Card */}
          <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h2 className="text-lg font-bold text-slate-900">{info.name}</h2>
                <p className="text-sm text-slate-500 mt-0.5">{info.companyName || '-'} · {info.contactName || '-'}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-400">
                  Key: <code className="text-blue-600">{info.vendorKeyPrefix}****</code>
                </span>
                <StatusBadge status={info.status} />
              </div>
            </div>

            {editProfile ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">联系人</label>
                  <input value={profileForm.contactName}
                    onChange={e => setProfileForm(p => ({ ...p, contactName: e.target.value }))}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">电话</label>
                  <input value={profileForm.contactPhone}
                    onChange={e => setProfileForm(p => ({ ...p, contactPhone: e.target.value }))}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">邮箱</label>
                  <input value={profileForm.contactEmail}
                    onChange={e => setProfileForm(p => ({ ...p, contactEmail: e.target.value }))}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-sm" />
                </div>
                <div className="col-span-2 md:col-span-1 flex items-end gap-2">
                  <button onClick={handleSaveProfile} disabled={savingProfile}
                    className="flex-1 px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1">
                    {savingProfile ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />}保存
                  </button>
                  <button onClick={() => setEditProfile(false)} className="px-3 py-1.5 text-slate-500 text-sm">取消</button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 text-sm">
                <div>
                  <span className="text-slate-400">接口地址</span>
                  <p className="text-slate-700 font-mono text-xs mt-0.5">{info.baseUrl}</p>
                </div>
                <div>
                  <span className="text-slate-400">联系人</span>
                  <p className="text-slate-700">{info.contactName || '-'}</p>
                </div>
                <div>
                  <span className="text-slate-400">电话</span>
                  <p className="text-slate-700">{info.contactPhone || '-'}</p>
                </div>
                <div>
                  <span className="text-slate-400">邮箱</span>
                  <p className="text-slate-700">{info.contactEmail || '-'}</p>
                  <button onClick={() => setEditProfile(true)}
                    className="text-xs text-blue-500 hover:text-blue-700 mt-1">编辑资料</button>
                </div>
              </div>
            )}
          </div>

          {/* Tab bar */}
          <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit">
            {([
              { k: 'info' as const, label: '基本信息', icon: Users },
              { k: 'models' as const, label: '模型管理', icon: Activity },
              { k: 'stats' as const, label: '调用统计', icon: TrendingUp },
              { k: 'health' as const, label: '健康状态', icon: Shield },
            ]).map(tab => (
              <button key={tab.k} onClick={() => handleTabChange(tab.k)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition ${
                  activeTab === tab.k ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}>
                <tab.icon size={13} />{tab.label}
              </button>
            ))}
          </div>

          {/* Tab: info */}
          {activeTab === 'info' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200">
                <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
                  <Users size={16} />供应商资料
                </h3>
                <dl className="space-y-3 text-sm">
                  {[
                    ['名称', info.name],
                    ['公司', info.companyName || '-'],
                    ['状态', <StatusBadge key="s" status={info.status} />],
                    ['描述', info.description || '-'],
                    ['注册时间', new Date(info.createdAt).toLocaleString('zh-CN')],
                  ].map(([k, v]) => (
                    <div key={k as string} className="flex justify-between border-b border-slate-100 pb-2">
                      <span className="text-slate-500">{k}</span>
                      <span className="text-slate-700 font-medium">{v as any}</span>
                    </div>
                  ))}
                </dl>
              </div>
              <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200">
                <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
                  <Key size={16} />API 配置
                </h3>
                <dl className="space-y-3 text-sm">
                  {[
                    ['接口地址', info.baseUrl],
                    ['Key 前缀', `${info.vendorKeyPrefix}****`],
                    ['Key 状态', info.vendorKeyActive
                      ? <span key="k" className="text-green-600">已激活</span>
                      : <span key="k" className="text-red-600">未激活</span>],
                  ].map(([k, v]) => (
                    <div key={k as string} className="flex justify-between border-b border-slate-100 pb-2">
                      <span className="text-slate-500">{k}</span>
                      <span className="text-slate-700 font-medium">{v as any}</span>
                    </div>
                  ))}
                </dl>
                <div className="mt-4 flex gap-2">
                  <button onClick={() => setShowKeyModal(true)}
                    className="flex items-center gap-1 text-xs px-3 py-1.5 bg-amber-50 text-amber-700 rounded-lg hover:bg-amber-100 transition">
                    <RefreshCw size={12} />轮换 Key
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Tab: models */}
          {activeTab === 'models' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-500">共 {models.length} 个模型映射</span>
                <button onClick={() => { setEditingModel(null); setShowModelModal(true) }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition">
                  <Plus size={14} />添加模型
                </button>
              </div>
              {loading ? (
                <div className="flex justify-center py-12"><Loader2 className="animate-spin" size={24} /></div>
              ) : models.length === 0 ? (
                <div className="text-center py-12 text-slate-400 text-sm">
                  暂无模型映射，点击"添加模型"开始
                </div>
              ) : (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-slate-50 text-left">
                          <th className="px-4 py-2.5 font-medium text-slate-500">上游模型名</th>
                          <th className="px-4 py-2.5 font-medium text-slate-500">平台模型名</th>
                          <th className="px-4 py-2.5 font-medium text-slate-500 text-right">售价Input</th>
                          <th className="px-4 py-2.5 font-medium text-slate-500 text-right">售价Output</th>
                          <th className="px-4 py-2.5 font-medium text-slate-500 text-right">权重</th>
                          <th className="px-4 py-2.5 font-medium text-slate-500">状态</th>
                          <th className="px-4 py-2.5 font-medium text-slate-500">操作</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {models.map(m => (
                          <tr key={m.id} className="hover:bg-slate-50">
                            <td className="px-4 py-2.5 font-mono text-slate-700">{m.upstreamModelName}</td>
                            <td className="px-4 py-2.5 text-slate-600">{m.modelName}</td>
                            <td className="px-4 py-2.5 text-right font-mono text-slate-600">¥{Number(m.sellPriceInput).toFixed(6)}</td>
                            <td className="px-4 py-2.5 text-right font-mono text-slate-600">¥{Number(m.sellPriceOutput).toFixed(6)}</td>
                            <td className="px-4 py-2.5 text-right text-slate-600">{m.weight}</td>
                            <td className="px-4 py-2.5">
                              {m.status ? <span className="text-green-600">启用</span> : <span className="text-red-600">禁用</span>}
                            </td>
                            <td className="px-4 py-2.5">
                              <div className="flex items-center gap-2">
                                <button onClick={() => { setEditingModel(m); setShowModelModal(true) }}
                                  className="text-blue-500 hover:text-blue-700"><Edit3 size={13} /></button>
                                <button onClick={() => handleDeleteModel(m.id, m.upstreamModelName)}
                                  className="text-red-500 hover:text-red-700"><Trash2 size={13} /></button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Tab: stats */}
          {activeTab === 'stats' && (
            <div className="space-y-4">
              {loading ? (
                <div className="flex justify-center py-12"><Loader2 className="animate-spin" size={24} /></div>
              ) : !stats ? (
                <div className="text-center py-12 text-slate-400 text-sm">暂无统计数据</div>
              ) : (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <StatCard label="总调用次数" value={stats.totalCalls.toLocaleString()} icon={Activity} color="border-blue-200 bg-blue-50" />
                    <StatCard label="今日调用" value={stats.todayCalls.toLocaleString()} icon={Zap} color="border-purple-200 bg-purple-50" />
                    <StatCard label="总营收" value={fmtCost(stats.totalRevenue)} icon={DollarSign} color="border-green-200 bg-green-50" />
                    <StatCard label="总 Token" value={fmtTokens(stats.totalTokens || 0)} icon={BarChart3} color="border-amber-200 bg-amber-50" />
                  </div>
                  {stats.modelStats?.length > 0 && (
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                      <div className="px-4 py-3 border-b border-slate-100">
                        <h4 className="font-semibold text-sm text-slate-700">按模型统计</h4>
                      </div>
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-slate-50 text-left">
                            <th className="px-4 py-2 font-medium text-slate-500">模型</th>
                            <th className="px-4 py-2 font-medium text-slate-500 text-right">调用</th>
                            <th className="px-4 py-2 font-medium text-slate-500 text-right">Token</th>
                            <th className="px-4 py-2 font-medium text-slate-500 text-right">营收</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {stats.modelStats.map((m, i) => (
                            <tr key={i} className="hover:bg-slate-50">
                              <td className="px-4 py-2 font-medium text-slate-700">{m.modelName}</td>
                              <td className="px-4 py-2 text-right text-slate-600">{m.calls.toLocaleString()}</td>
                              <td className="px-4 py-2 text-right text-slate-600 font-mono">{fmtTokens(m.totalTokens)}</td>
                              <td className="px-4 py-2 text-right text-slate-900 font-mono font-medium">{fmtCost(m.revenue)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Tab: health */}
          {activeTab === 'health' && (
            <div className="space-y-4">
              {loading ? (
                <div className="flex justify-center py-12"><Loader2 className="animate-spin" size={24} /></div>
              ) : health.length === 0 ? (
                <div className="text-center py-12 text-slate-400 text-sm">暂无健康数据</div>
              ) : (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-slate-50 text-left">
                        <th className="px-4 py-2.5 font-medium text-slate-500">模型</th>
                        <th className="px-4 py-2.5 font-medium text-slate-500">上游名称</th>
                        <th className="px-4 py-2.5 font-medium text-slate-500 text-center">状态</th>
                        <th className="px-4 py-2.5 font-medium text-slate-500 text-right">健康分</th>
                        <th className="px-4 py-2.5 font-medium text-slate-500 text-right">采样数</th>
                        <th className="px-4 py-2.5 font-medium text-slate-500 text-right">连续成功</th>
                        <th className="px-4 py-2.5 font-medium text-slate-500">最近检测</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {health.map(h => {
                        const score = Number(h.healthScore || 0)
                        const scoreColor = score >= 90 ? 'text-green-600' : score >= 70 ? 'text-amber-600' : 'text-red-600'
                        return (
                          <tr key={h.vendorModelId} className="hover:bg-slate-50">
                            <td className="px-4 py-2.5 font-medium text-slate-700">{h.modelName}</td>
                            <td className="px-4 py-2.5 font-mono text-slate-500">{h.upstreamModelName}</td>
                            <td className="px-4 py-2.5 text-center">
                              {h.isDown
                                ? <span className="text-red-600 font-medium">宕机</span>
                                : h.status
                                  ? <span className="text-green-600">正常</span>
                                  : <span className="text-slate-400">禁用</span>}
                            </td>
                            <td className={`px-4 py-2.5 text-right font-mono font-bold ${scoreColor}`}>{score.toFixed(1)}</td>
                            <td className="px-4 py-2.5 text-right text-slate-500">{h.healthSamples ?? '-'}</td>
                            <td className="px-4 py-2.5 text-right text-slate-500">{h.consecutiveSuccess ?? '-'}</td>
                            <td className="px-4 py-2.5 text-slate-400">
                              {h.lastHealthCheckAt ? new Date(h.lastHealthCheckAt).toLocaleString('zh-CN') : '-'}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Modals */}
      <ModelFormModal
        open={showModelModal}
        edit={editingModel}
        onClose={() => { setShowModelModal(false); setEditingModel(null) }}
        onSaved={fetchModels}
      />
      <KeyRotateModal
        open={showKeyModal}
        onClose={() => setShowKeyModal(false)}
        onRotated={(k) => { if (k) { fetchInfo() } }}
      />
    </div>
  )
}
