/**
 * VendorSelfMgmt — 供应商自助管理（入口页面）
 *
 * 业务定位：
 *   3cloud 为上游 AI 模型供应商提供的自助管理入口。
 *   供应商通过 X-Vendor-Key 鉴权后自行管理模型、定价、API Key、
 *   查看调用统计和健康状态，无需平台运营代操作。
 *
 * 权限模型：
 *   - 鉴权: X-Vendor-Key header → SHA-256 哈希 → vendor_api_keys 表
 *   - 作用域: 仅可管理本供应商的资源（vendorId 隔离）
 *   - 管理员后台: admin/vendors 页面可查看所有供应商
 */

import { useEffect, useState, useCallback, useMemo } from 'react'
import { Key, Users, Activity, TrendingUp, Shield, AlertCircle, X, Loader2 } from 'lucide-react'
import api from '@/lib/api'
import FeatureDescription from '@/components/admin/FeatureDescription'

import type { VendorInfo, VendorModelInfo, VendorStats, VendorHealthItem, ActiveTab } from './vendor-self/types'
import ProfilePanel from './vendor-self/ProfilePanel'
import ModelList from './vendor-self/ModelList'
import OverviewCards from './vendor-self/OverviewCards'
import UsageStats from './vendor-self/UsageStats'
import ApiKeyPanel from './vendor-self/ApiKeyPanel'

// ── Tabs ──

const TABS: Array<{ k: ActiveTab; label: string; icon: any }> = [
  { k: 'info', label: '基本信息', icon: Users },
  { k: 'models', label: '模型管理', icon: Activity },
  { k: 'stats', label: '调用统计', icon: TrendingUp },
  { k: 'health', label: '健康状态', icon: Shield },
]

// ── 主页面 ──

export default function AdminVendorSelfMgmt() {
  const [vendorKey, setVendorKey] = useState(localStorage.getItem('vendor_demo_key') || '')
  const [activeTab, setActiveTab] = useState<ActiveTab>('info')
  const [info, setInfo] = useState<VendorInfo | null>(null)
  const [models, setModels] = useState<VendorModelInfo[]>([])
  const [stats, setStats] = useState<VendorStats | null>(null)
  const [health, setHealth] = useState<VendorHealthItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showKeyModal, setShowKeyModal] = useState(false)

  // ── Vendor API helper ──
  const headers = useMemo(() => ({ 'X-Vendor-Key': vendorKey }), [vendorKey])

  const vendorApi = useMemo(() => ({
    async get(path: string) {
      const res = await api.get(path, { headers })
      if (res.data.code !== 0) throw new Error(res.data.message || '请求失败')
      return res.data.data
    },
  }), [headers])

  // ── Data fetchers ──
  const fetchInfo = useCallback(async () => {
    if (!vendorKey) return
    setLoading(true); setError('')
    try { setInfo(await vendorApi.get('/api/vendor/me')) }
    catch (e: any) { setError(e.message || '获取信息失败') }
    finally { setLoading(false) }
  }, [vendorKey, vendorApi])

  const fetchModels = useCallback(async () => {
    if (!vendorKey) return
    setLoading(true); setError('')
    try { setModels((await vendorApi.get('/api/vendor/models')) || []) }
    catch (e: any) { setError(e.message || '获取模型列表失败') }
    finally { setLoading(false) }
  }, [vendorKey, vendorApi])

  const fetchStats = useCallback(async () => {
    if (!vendorKey) return
    setLoading(true); setError('')
    try { setStats(await vendorApi.get('/api/vendor/stats')) }
    catch (e: any) { setError(e.message || '获取统计失败') }
    finally { setLoading(false) }
  }, [vendorKey, vendorApi])

  const fetchHealth = useCallback(async () => {
    if (!vendorKey) return
    setLoading(true); setError('')
    try { setHealth((await vendorApi.get('/api/vendor/health')) || []) }
    catch (e: any) { setError(e.message || '获取健康数据失败') }
    finally { setLoading(false) }
  }, [vendorKey, vendorApi])

  useEffect(() => { if (vendorKey) { fetchInfo(); fetchModels() } }, [vendorKey])

  const handleTabChange = useCallback((tab: ActiveTab) => {
    setActiveTab(tab); setError('')
    const m = { stats: fetchStats, health: fetchHealth, models: fetchModels, info: fetchInfo }
    m[tab]?.()
  }, [fetchStats, fetchHealth, fetchModels, fetchInfo])

  const handleKeyRotated = useCallback((k: string) => {
    if (k) { setVendorKey(k); localStorage.setItem('vendor_demo_key', k); fetchInfo() }
  }, [fetchInfo])

  const handleApplyKey = useCallback(() => {
    localStorage.setItem('vendor_demo_key', vendorKey); fetchInfo(); fetchModels()
  }, [vendorKey, fetchInfo, fetchModels])

  // ── Render ──
  return (
    <div className="space-y-6">
      <div className="flex items-center">
        <h1 className="text-2xl font-bold text-slate-900">供应商自助管理</h1>
        <FeatureDescription page="admin/vendor-self" className="ml-2" />
      </div>

      {/* Key Input (before auth) */}
      {!info && !loading && (
        <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200 space-y-4">
          <div className="flex items-center gap-3">
            <Key size={22} className="text-slate-400" />
            <div>
              <h2 className="font-semibold text-slate-800">输入供应商 Key</h2>
              <p className="text-sm text-slate-500 mt-0.5">
                使用平台分配的 X-Vendor-Key 进行身份验证，即可自助管理模型和查看数据。
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="relative flex-1">
              <input
                type="password" value={vendorKey}
                onChange={e => setVendorKey(e.target.value)}
                placeholder="输入 X-Vendor-Key"
                className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              onClick={handleApplyKey}
              className="px-6 py-2.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition"
            >验证</button>
          </div>
        </div>
      )}

      {/* Loading (initial) */}
      {loading && !info && !error && (
        <div className="flex justify-center py-12">
          <Loader2 className="animate-spin" size={24} />
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm">
          <AlertCircle size={16} />{error}
          <button onClick={() => setError('')} className="ml-auto text-red-500"><X size={16} /></button>
        </div>
      )}

      {/* Authenticated content */}
      {vendorKey && info && (
        <>
          <ProfilePanel
            info={info}
            vendorKey={vendorKey}
            onInfoUpdated={fetchInfo}
            onOpenKeyModal={() => setShowKeyModal(true)}
          />

          {/* Tab bar */}
          <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit">
            {TABS.map(tab => (
              <button
                key={tab.k}
                onClick={() => handleTabChange(tab.k)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition ${
                  activeTab === tab.k
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <tab.icon size={13} />{tab.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          {activeTab === 'info' && null /* ProfilePanel already shows info */}
          {activeTab === 'models' && (
            <ModelList models={models} loading={loading} vendorKey={vendorKey} onRefresh={fetchModels} />
          )}
          {activeTab === 'stats' && <UsageStats stats={stats} loading={loading} />}
          {activeTab === 'health' && <HealthTable health={health} loading={loading} />}
        </>
      )}

      {/* No vendor key (before any input) */}
      {!vendorKey && <VendorIntro />}

      {/* Modals */}
      <ApiKeyPanel
        open={showKeyModal}
        vendorKey={vendorKey}
        onClose={() => setShowKeyModal(false)}
        onRotated={handleKeyRotated}
      />
    </div>
  )
}

// ── 健康状态表格 ──

function HealthTable({ health, loading }: { health: VendorHealthItem[]; loading: boolean }) {
  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="animate-spin" size={24} /></div>
  }
  if (health.length === 0) {
    return <div className="text-center py-12 text-slate-400 text-sm">暂无健康数据</div>
  }

  return (
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
            const scoreColor = score >= 90
              ? 'text-green-600'
              : score >= 70
                ? 'text-amber-600'
                : 'text-red-600'
            return (
              <tr key={h.vendorModelId} className="hover:bg-slate-50">
                <td className="px-4 py-2.5 font-medium text-slate-700">{h.modelName}</td>
                <td className="px-4 py-2.5 font-mono text-slate-500">{h.upstreamModelName}</td>
                <td className="px-4 py-2.5 text-center">
                  {h.isDown ? (
                    <span className="text-red-600 font-medium">宕机</span>
                  ) : h.status ? (
                    <span className="text-green-600">正常</span>
                  ) : (
                    <span className="text-slate-400">禁用</span>
                  )}
                </td>
                <td className={`px-4 py-2.5 text-right font-mono font-bold ${scoreColor}`}>
                  {score.toFixed(1)}
                </td>
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
  )
}

// ── 引导页（未输入 Key 时） ──

function VendorIntro() {
  const features = [
    { icon: Activity, title: '模型管理', desc: '上下架模型、调整定价、配置权重' },
    { icon: TrendingUp, title: '调用统计', desc: '查看调用量、Token 消耗、营收报表' },
    { icon: Shield, title: '健康监控', desc: '实时健康分、故障检测、熔断状态' },
    { icon: Key, title: 'Key 管理', desc: '自助轮换 API Key，旧 Key 即时失效' },
  ]

  return (
    <div className="bg-slate-50 rounded-xl border border-slate-200 p-12 text-center">
      <Key size={40} className="mx-auto text-slate-300 mb-4" />
      <h3 className="text-lg font-semibold text-slate-700 mb-2">供应商自助管理</h3>
      <p className="text-sm text-slate-500 max-w-md mx-auto">
        此页面为 3cloud 上游 AI 模型供应商提供自助管理功能。供应商可通过平台分配的 X-Vendor-Key 登录后：
      </p>
      <div className="grid grid-cols-2 gap-3 mt-6 max-w-lg mx-auto text-left">
        {features.map(({ icon: I, title, desc }) => (
          <div key={title} className="flex items-start gap-3 p-3 bg-white rounded-lg border border-slate-200">
            <I size={18} className="text-blue-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-slate-700">{title}</p>
              <p className="text-xs text-slate-400 mt-0.5">{desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
