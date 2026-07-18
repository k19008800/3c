import { useEffect, useState, useCallback } from 'react'
import { get, put, del } from '@/lib/api'
import {
  Loader2, RefreshCw, Users, Plus, Key, Activity, TrendingUp, Shield,
  Save, Edit3, Trash2,
} from 'lucide-react'
import VendorOnboardingGuide from './components/VendorOnboardingGuide'
import StatusBadge from './vendor-dashboard/StatusBadge'
import type { VendorInfo, VendorModelInfo, VendorStats, VendorHealthItem } from './vendor-dashboard/types'
import RevenuePanel from './vendor-dashboard/RevenuePanel'
import SystemStatus from './vendor-dashboard/SystemStatus'
import RecentAlerts from './vendor-dashboard/RecentAlerts'
import ModelFormModal from './vendor-dashboard/ModelFormModal'
import KeyRotateModal from './vendor-dashboard/KeyRotateModal'

// ── Main ──

export default function VendorDashboard() {
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
  const [showModelModal, setShowModelModal] = useState(false)
  const [editingModel, setEditingModel] = useState<VendorModelInfo | null>(null)
  const [showKeyModal, setShowKeyModal] = useState(false)
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
    const fetchers: Record<string, () => void> = { stats: fetchStats, health: fetchHealth, models: fetchModels, info: fetchInfo }
    fetchers[tab]?.()
  }

  const handleSaveProfile = async () => {
    setSavingProfile(true); setError('')
    try { await put('/api/vendor/me', profileForm); setEditProfile(false); fetchInfo() }
    catch (e: any) { setError(e.message || '保存失败') }
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

  // ── Render ──

  return (
    <div className="space-y-6">
      {showOnboarding && <VendorOnboardingGuide onDismiss={handleDismissOnboarding} />}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">供应商工作台</h1>
          <p className="text-sm text-slate-500 mt-0.5">欢迎回来{info ? `，${info.name}` : ''}</p>
        </div>
        {info && (
          <div className="flex items-center gap-2">
            <StatusBadge status={info.status} />
            <button onClick={() => setShowKeyModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-lg text-xs hover:bg-slate-50 transition">
              <RefreshCw size={13} />轮换 Key
            </button>
          </div>
        )}
      </div>

      <RecentAlerts message={error} onDismiss={() => setError('')} />

      {loading && !info && (
        <div className="flex justify-center py-12"><Loader2 className="animate-spin text-blue-500" size={28} /></div>
      )}

      {!loading && !info && !error && (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <Key size={40} className="mx-auto text-slate-300 mb-4" />
          <h3 className="text-lg font-semibold text-slate-700 mb-2">开始使用供应商门户</h3>
          <p className="text-sm text-slate-500 max-w-md mx-auto mb-6">
            您的供应商账号已就绪。点击下方按钮加载您的供应商信息，开始管理模型和数据。
          </p>
          <button onClick={fetchInfo}
            className="px-6 py-2.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition inline-flex items-center gap-2">
            <RefreshCw size={16} />加载供应商信息
          </button>
        </div>
      )}

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
                {(['contactName', 'contactPhone', 'contactEmail'] as const).map(f => (
                  <div key={f}>
                    <label className="block text-xs text-slate-500 mb-1">{f === 'contactName' ? '联系人' : f === 'contactPhone' ? '电话' : '邮箱'}</label>
                    <input value={profileForm[f]}
                      onChange={e => setProfileForm(p => ({ ...p, [f]: e.target.value }))}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-sm" />
                  </div>
                ))}
                <div className="col-span-2 md:col-span-1 flex items-end gap-2">
                  <button onClick={handleSaveProfile} disabled={savingProfile}
                    className="flex-1 px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1">
                    {savingProfile ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />}保存
                  </button>
                  <button onClick={() => setEditProfile(false)} className="px-3 py-1.5 text-slate-500 text-sm">取消</button>
                </div>
              </div>
            ) : (
              <InfoFields info={info} onEdit={() => setEditProfile(true)} />
            )}
          </div>

          {/* Tab bar */}
          <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit">
            {([
              { k: 'info' as const, label: '基本信息', icon: Users },
              { k: 'models' as const, label: '模型管理', icon: Activity },
              { k: 'stats' as const, label: '调用统计', icon: TrendingUp },
              { k: 'health' as const, label: '健康状态', icon: Shield },
            ]).map(t => (
              <button key={t.k} onClick={() => handleTabChange(t.k)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition ${
                  activeTab === t.k ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}>
                <t.icon size={13} />{t.label}
              </button>
            ))}
          </div>

          {/* Info tab */}
          {activeTab === 'info' && <InfoTabContent info={info} onKeyRotate={() => setShowKeyModal(true)} />}

          {/* Models tab */}
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
                <div className="text-center py-12 text-slate-400 text-sm">暂无模型映射，点击"添加模型"开始</div>
              ) : (
                <ModelsTable models={models} onEdit={(m) => { setEditingModel(m); setShowModelModal(true) }} onDelete={handleDeleteModel} />
              )}
            </div>
          )}

          {/* Stats tab */}
          {activeTab === 'stats' && (
            loading ? <div className="flex justify-center py-12"><Loader2 className="animate-spin" size={24} /></div> : <RevenuePanel stats={stats} />
          )}

          {/* Health tab */}
          {activeTab === 'health' && (
            <SystemStatus items={health} loading={loading} />
          )}
        </>
      )}

      <ModelFormModal open={showModelModal} edit={editingModel}
        onClose={() => { setShowModelModal(false); setEditingModel(null) }} onSaved={fetchModels} />
      <KeyRotateModal open={showKeyModal} onClose={() => setShowKeyModal(false)}
        onRotated={(k) => { if (k) fetchInfo() }} />
    </div>
  )
}

// ── Sub-renders ──

const InfoFields = ({ info, onEdit }: { info: VendorInfo; onEdit: () => void }) => (
  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 text-sm">
    {[
      ['接口地址', <p key="a" className="text-slate-700 font-mono text-xs mt-0.5">{info.baseUrl}</p>],
      ['联系人', <p key="b" className="text-slate-700">{info.contactName || '-'}</p>],
      ['电话', <p key="c" className="text-slate-700">{info.contactPhone || '-'}</p>],
      ['邮箱', <div key="d"><p className="text-slate-700">{info.contactEmail || '-'}</p><button onClick={onEdit} className="text-xs text-blue-500 hover:text-blue-700 mt-1">编辑资料</button></div>],
    ].map(([k, v]) => (
      <div key={k as string}><span className="text-slate-400">{k}</span>{v as any}</div>
    ))}
  </div>
)

const InfoTabContent = ({ info, onKeyRotate }: { info: VendorInfo; onKeyRotate: () => void }) => (
  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
    <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200">
      <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2"><Users size={16} />供应商资料</h3>
      <dl className="space-y-3 text-sm">
        {[['名称', info.name],['公司', info.companyName || '-'],['状态', <StatusBadge key="s" status={info.status} />],['描述', info.description || '-'],['注册时间', new Date(info.createdAt).toLocaleString('zh-CN')]].map(([k, v]) => (
          <div key={k as string} className="flex justify-between border-b border-slate-100 pb-2"><span className="text-slate-500">{k}</span><span className="text-slate-700 font-medium">{v as any}</span></div>
        ))}
      </dl>
    </div>
    <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200">
      <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2"><Key size={16} />API 配置</h3>
      <dl className="space-y-3 text-sm">
        {[['接口地址', info.baseUrl],['Key 前缀', `${info.vendorKeyPrefix}****`],['Key 状态', info.vendorKeyActive ? <span key="k" className="text-green-600">已激活</span> : <span key="k" className="text-red-600">未激活</span>]].map(([k, v]) => (
          <div key={k as string} className="flex justify-between border-b border-slate-100 pb-2"><span className="text-slate-500">{k}</span><span className="text-slate-700 font-medium">{v as any}</span></div>
        ))}
      </dl>
      <div className="mt-4 flex gap-2">
        <button onClick={onKeyRotate} className="flex items-center gap-1 text-xs px-3 py-1.5 bg-amber-50 text-amber-700 rounded-lg hover:bg-amber-100 transition"><RefreshCw size={12} />轮换 Key</button>
      </div>
    </div>
  </div>
)

const ModelsTable = ({ models, onEdit, onDelete }: { models: VendorModelInfo[]; onEdit: (m: VendorModelInfo) => void; onDelete: (id: number, name: string) => void }) => (
  <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead><tr className="bg-slate-50 text-left">
          <th className="px-4 py-2.5 font-medium text-slate-500">上游模型名</th>
          <th className="px-4 py-2.5 font-medium text-slate-500">平台模型名</th>
          <th className="px-4 py-2.5 font-medium text-slate-500 text-right">售价Input</th>
          <th className="px-4 py-2.5 font-medium text-slate-500 text-right">售价Output</th>
          <th className="px-4 py-2.5 font-medium text-slate-500 text-right">权重</th>
          <th className="px-4 py-2.5 font-medium text-slate-500">状态</th>
          <th className="px-4 py-2.5 font-medium text-slate-500">操作</th>
        </tr></thead>
        <tbody className="divide-y divide-slate-100">
          {models.map(m => (
            <tr key={m.id} className="hover:bg-slate-50">
              <td className="px-4 py-2.5 font-mono text-slate-700">{m.upstreamModelName}</td>
              <td className="px-4 py-2.5 text-slate-600">{m.modelName}</td>
              <td className="px-4 py-2.5 text-right font-mono text-slate-600">¥{Number(m.sellPriceInput).toFixed(6)}</td>
              <td className="px-4 py-2.5 text-right font-mono text-slate-600">¥{Number(m.sellPriceOutput).toFixed(6)}</td>
              <td className="px-4 py-2.5 text-right text-slate-600">{m.weight}</td>
              <td className="px-4 py-2.5">{m.status ? <span className="text-green-600">启用</span> : <span className="text-red-600">禁用</span>}</td>
              <td className="px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <button onClick={() => onEdit(m)} className="text-blue-500 hover:text-blue-700"><Edit3 size={13} /></button>
                  <button onClick={() => onDelete(m.id, m.upstreamModelName)} className="text-red-500 hover:text-red-700"><Trash2 size={13} /></button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
)
