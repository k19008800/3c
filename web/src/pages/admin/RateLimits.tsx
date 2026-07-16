import { useEffect, useState, useCallback } from 'react'
import { get, patch, del, post } from '@/lib/api'
import PaginationBar from '@/components/ui/PaginationBar'
import { Loader2, AlertCircle, CheckCircle2, Edit2, Save, X, Trash2, Activity, Users, Globe, Zap, Search, Plus } from 'lucide-react'
import FeatureDescription from '@/components/admin/FeatureDescription'

// ── Types ──

interface RateLimitRule {
  key: string
  label: string
  value: string
  isDefault: boolean
}

interface WaterLevels {
  globalRpm: { current: number; limit: number }
  globalTpm: { current: number; limit: number }
  userRpmTotal: { current: number; label: string }
  userTpmTotal: { current: number; label: string }
  activeUsersInWindow: number
  activeKeysInWindow: number
  totalKeyRpm: number
}

interface OverrideItem {
  quotaId: number
  userId: number
  userEmail: string | null
  userNickname: string | null
  userType: string | null
  rpmLimit: number | null
  tpmLimit: number | null
  currentRpm: number
  currentTpm: number
  periodStart: string | null
  periodEnd: string | null
  setByRole: string | null
  updatedAt: string | null
}

interface HitItem {
  id: number
  userId: number
  userEmail: string | null
  userNickname: string | null
  modelName: string | null
  errorMessage: string | null
  requestTokens: string | null
  createdAt: string | null
}

// ── 分组标签 ──

const GROUP_MAP: Record<string, string> = {
  rate_limit_personal_rpm: '个人用户',
  rate_limit_personal_tpm: '个人用户',
  rate_limit_enterprise_rpm: '企业用户',
  rate_limit_enterprise_tpm: '企业用户',
  rate_limit_global_rpm: '全局兜底',
  rate_limit_global_tpm: '全局兜底',
}

function groupKey(key: string): string {
  return GROUP_MAP[key] || '其他'
}

// Pagination replaced by PaginationBar

// ── 水位条组件 ──

function WaterBar({ current, limit, label, unit }: { current: number; limit: number; label: string; unit: string }) {
  const pct = limit > 0 ? Math.min(100, (current / limit) * 100) : 0
  const color = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-yellow-500' : 'bg-emerald-500'

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4">
      <div className="flex justify-between items-center mb-2">
        <span className="text-sm font-medium text-slate-700">{label}</span>
        <span className="text-xs text-slate-400">{current.toLocaleString()} / {limit.toLocaleString()} {unit}</span>
      </div>
      <div className="w-full bg-slate-100 rounded-full h-2.5">
        <div className={`${color} h-2.5 rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

// ── 添加/编辑覆盖弹窗 ──

function OverrideDialog({
  open,
  editItem,
  onClose,
  onSaved,
}: {
  open: boolean
  editItem: OverrideItem | null
  onClose: () => void
  onSaved: () => void
}) {
  const [userId, setUserId] = useState('')
  const [rpmLimit, setRpmLimit] = useState('')
  const [tpmLimit, setTpmLimit] = useState('')
  const [periodStart, setPeriodStart] = useState('')
  const [periodEnd, setPeriodEnd] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (editItem) {
      setUserId(String(editItem.userId))
      setRpmLimit(editItem.rpmLimit !== null ? String(editItem.rpmLimit) : '')
      setTpmLimit(editItem.tpmLimit !== null ? String(editItem.tpmLimit) : '')
      setPeriodStart(editItem.periodStart ? editItem.periodStart.slice(0, 10) : '')
      setPeriodEnd(editItem.periodEnd ? editItem.periodEnd.slice(0, 10) : '')
    } else {
      setUserId('')
      setRpmLimit('')
      setTpmLimit('')
      setPeriodStart('')
      setPeriodEnd('')
    }
    setError('')
  }, [editItem, open])

  if (!open) return null

  const handleSave = async () => {
    setError('')

    if (!editItem && !userId.trim()) {
      setError('请输入用户ID')
      return
    }
    const rpmVal = rpmLimit.trim() ? parseInt(rpmLimit, 10) : null
    const tpmVal = tpmLimit.trim() ? parseInt(tpmLimit, 10) : null
    if (!rpmVal && !tpmVal) {
      setError('至少设置 RPM 或 TPM 之一')
      return
    }
    if ((rpmVal !== null && rpmVal < 1) || (tpmVal !== null && tpmVal < 1)) {
      setError('RPM 和 TPM 必须大于 0')
      return
    }

    setSaving(true)
    try {
      const body: any = {
        userId: editItem ? editItem.userId : parseInt(userId, 10),
        rpmLimit: rpmVal,
        tpmLimit: tpmVal,
      }
      if (periodStart) body.periodStart = periodStart + 'T00:00:00.000Z'
      if (periodEnd) body.periodEnd = periodEnd + 'T23:59:59.000Z'
      await post('/api/v1/admin/rate-limits/overrides', body)
      onSaved()
      onClose()
    } catch (err: any) {
      setError(err.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl border border-slate-200 p-6 w-full max-w-lg mx-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-slate-900">
            {editItem ? '编辑限流覆盖' : '添加限流覆盖'}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4">
          {!editItem && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">用户 ID</label>
              <input
                type="number"
                min="1"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="输入用户 ID"
              />
            </div>
          )}
          {editItem && (
            <div>
              {/* 当前水位展示 */}
              <div className="bg-slate-50 rounded-lg p-3 mb-3">
                <div className="text-xs text-slate-500 mb-2">当前实时水位（分钟窗口）</div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-xs text-slate-400">RPM</div>
                    <div className={`text-lg font-bold ${editItem.currentRpm > (editItem.rpmLimit ?? 99999) ? 'text-red-600' : editItem.currentRpm > ((editItem.rpmLimit ?? 99999) * 0.7) ? 'text-yellow-600' : 'text-slate-900'}`}>
                      {editItem.currentRpm.toLocaleString()}
                    </div>
                    <div className="text-xs text-slate-400">上限: {editItem.rpmLimit?.toLocaleString() ?? '无'}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-400">TPM</div>
                    <div className={`text-lg font-bold ${editItem.currentTpm > (editItem.tpmLimit ?? 99999999) ? 'text-red-600' : editItem.currentTpm > ((editItem.tpmLimit ?? 99999999) * 0.7) ? 'text-yellow-600' : 'text-slate-900'}`}>
                      {editItem.currentTpm.toLocaleString()}
                    </div>
                    <div className="text-xs text-slate-400">上限: {editItem.tpmLimit?.toLocaleString() ?? '无'}</div>
                  </div>
                </div>
              </div>
              <div className="text-sm text-slate-500">
                用户：<span className="font-medium text-slate-800">{editItem.userNickname || `ID:${editItem.userId}`}</span>
                {editItem.userEmail && <span className="ml-1">({editItem.userEmail})</span>}
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">RPM 限制（请求/分）</label>
            <input
              type="number"
              min="1"
              value={rpmLimit}
              onChange={(e) => setRpmLimit(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="留空表示不限制 RPM"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">TPM 限制（Token/分）</label>
            <input
              type="number"
              min="1"
              value={tpmLimit}
              onChange={(e) => setTpmLimit(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="留空表示不限制 TPM"
            />
          </div>

          {/* 有效期 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">生效日期</label>
              <input
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">过期日期</label>
              <input
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <p className="text-xs text-slate-400">留空则默认为当月</p>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 p-2 rounded">{error}</div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-slate-300 text-slate-600 rounded-lg text-sm hover:bg-slate-50 transition"
            >
              取消
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 transition"
            >
              {saving ? '保存中...' : '保存'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── 页面组件 ──

export default function AdminRateLimits() {
  // 规则
  const [rules, setRules] = useState<RateLimitRule[]>([])
  const [waterLevels, setWaterLevels] = useState<WaterLevels | null>(null)
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')

  // 覆盖
  const [overrides, setOverrides] = useState<OverrideItem[]>([])
  const [overrideTotal, setOverrideTotal] = useState(0)
  const [overrideLoading, setOverrideLoading] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [overridePage, setOverridePage] = useState(1)
  const OVERRIDE_PAGE_SIZE = 50

  // 覆盖弹窗
  const [showOverrideDialog, setShowOverrideDialog] = useState(false)
  const [editingOverride, setEditingOverride] = useState<OverrideItem | null>(null)

  // 命中
  const [hits, setHits] = useState<HitItem[]>([])
  const [hitsTotal, setHitsTotal] = useState(0)
  const [hitsTotalToday, setHitsTotalToday] = useState(0)
  const [hitsRange, setHitsRange] = useState<'1h' | '6h' | 'today'>('1h')
  const [hitsPage, setHitsPage] = useState(1)
  const HITS_PAGE_SIZE = 50

  // 通用
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')
  const [activeTab, setActiveTab] = useState<'rules' | 'overrides' | 'hits'>('rules')

  // ── 获取规则+水位 ──

  const fetchRules = useCallback(async () => {
    try {
      const res = await get<{ rules: RateLimitRule[]; waterLevels: WaterLevels }>('/api/v1/admin/rate-limits/rules')
      setRules(res.rules)
      setWaterLevels(res.waterLevels)
    } catch (err: any) {
      setError(err.message || '获取限流规则失败')
    } finally {
      setLoading(false)
    }
  }, [])

  // ── 获取覆盖 ──

  const fetchOverrides = useCallback(async (page: number = 1) => {
    setOverrideLoading(true)
    try {
      const params: any = { limit: OVERRIDE_PAGE_SIZE, offset: (page - 1) * OVERRIDE_PAGE_SIZE }
      // 如果是数字，同时按 ID 和文本搜索（兼容行为）
      if (searchText) {
        const numId = parseInt(searchText, 10)
        if (!isNaN(numId) && String(numId) === searchText) {
          params.user_id = searchText
        } else {
          params.search = searchText
        }
      }
      const res = await get<{ items: OverrideItem[]; total: number }>('/api/v1/admin/rate-limits/overrides', params)
      setOverrides(res.items)
      setOverrideTotal(res.total)
    } catch (err: any) {
      setError(err.message || '获取覆盖规则失败')
    } finally {
      setOverrideLoading(false)
    }
  }, [searchText])

  // ── 获取命中 ──

  const fetchHits = useCallback(async (page: number = 1) => {
    try {
      const res = await get<{ items: HitItem[]; total: number; total429Today: number }>(
        '/api/v1/admin/rate-limits/hits',
        { limit: HITS_PAGE_SIZE, offset: (page - 1) * HITS_PAGE_SIZE, range: hitsRange }
      )
      setHits(res.items)
      setHitsTotal(res.total)
      setHitsTotalToday(res.total429Today)
    } catch (err: any) {
      setError(err.message || '获取限流命中记录失败')
    }
  }, [hitsRange])

  // ── 初始加载 ──

  useEffect(() => { fetchRules() }, [fetchRules])
  useEffect(() => { if (activeTab === 'overrides') { setOverridePage(1); fetchOverrides(1) } }, [activeTab, fetchOverrides])
  useEffect(() => { if (activeTab === 'hits') { setHitsPage(1); fetchHits(1) } }, [activeTab, fetchHits, hitsRange])

  // ── 保存规则 ──

  const handleSaveRule = async (key: string) => {
    try {
      await patch('/api/v1/admin/rate-limits/rules', {
        rules: [{ key, value: editValue }],
      })
      setMsg(`限流规则 "${key}" 已更新（预计 120 秒内全节点生效）`)
      setEditingKey(null)
      fetchRules()
    } catch (err: any) {
      setError(err.message || '更新失败')
    }
  }

  // ── 删除覆盖 ──

  const handleDeleteOverride = async (quotaId: number) => {
    if (!confirm('确定清除该用户的限流覆盖？')) return
    try {
      await del(`/api/v1/admin/rate-limits/overrides/${quotaId}`)
      setMsg('限流覆盖已清除')
      fetchOverrides(overridePage)
    } catch (err: any) {
      setError(err.message || '删除失败')
    }
  }

  // ── 打开添加覆盖弹窗 ──

  const openAddOverride = () => {
    setEditingOverride(null)
    setShowOverrideDialog(true)
  }

  // ── 打开编辑覆盖弹窗 ──

  const openEditOverride = (item: OverrideItem) => {
    setEditingOverride(item)
    setShowOverrideDialog(true)
  }

  // ── 搜索覆盖 ──

  const handleSearchOverride = () => {
    setOverridePage(1)
    fetchOverrides(1)
  }

  // ── 按组规则渲染 ──

  const groupNames = [...new Set(rules.map((r) => groupKey(r.key)))]
  const groupedRules = groupNames.map((g) => ({
    group: g,
    rules: rules.filter((r) => groupKey(r.key) === g),
  }))

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="animate-spin" size={32} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">TPM/RPM 限流管理</h1>
        <FeatureDescription page="admin/rate-limits" className="ml-2" />
      </div>

      {msg && (
        <div className="flex items-center gap-2 text-green-700 bg-green-50 p-3 rounded-lg text-sm">
          <CheckCircle2 size={16} />
          {msg}
          <button onClick={() => setMsg('')} className="ml-auto text-green-500 hover:text-green-700">
            <X size={14} />
          </button>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm">
          <AlertCircle size={16} />
          {error}
          <button onClick={() => setError('')} className="ml-auto text-red-500 hover:text-red-700">
            <X size={14} />
          </button>
        </div>
      )}

      {/* ── Tab 切换 ── */}
      <div className="flex gap-2 border-b border-slate-200 pb-2">
        <button
          onClick={() => setActiveTab('rules')}
          className={`px-4 py-2 text-sm font-medium rounded-t-lg transition ${activeTab === 'rules' ? 'bg-white text-blue-600 border border-b-white border-slate-200 -mb-[3px]' : 'text-slate-500 hover:text-slate-700'}`}
        >
          <Zap size={16} className="inline mr-1" />
          规则配置 + 实时水位
        </button>
        <button
          onClick={() => setActiveTab('overrides')}
          className={`px-4 py-2 text-sm font-medium rounded-t-lg transition ${activeTab === 'overrides' ? 'bg-white text-blue-600 border border-b-white border-slate-200 -mb-[3px]' : 'text-slate-500 hover:text-slate-700'}`}
        >
          <Users size={16} className="inline mr-1" />
          用户覆盖规则
          {overrideTotal > 0 && <span className="ml-1.5 bg-blue-100 text-blue-700 text-xs px-1.5 py-0.5 rounded-full">{overrideTotal}</span>}
        </button>
        <button
          onClick={() => setActiveTab('hits')}
          className={`px-4 py-2 text-sm font-medium rounded-t-lg transition ${activeTab === 'hits' ? 'bg-white text-blue-600 border border-b-white border-slate-200 -mb-[3px]' : 'text-slate-500 hover:text-slate-700'}`}
        >
          <Activity size={16} className="inline mr-1" />
          限流命中事件
          {hitsTotalToday > 0 && <span className="ml-1.5 bg-red-100 text-red-700 text-xs px-1.5 py-0.5 rounded-full">{hitsTotalToday}</span>}
        </button>
      </div>

      {/* ──────────
           Tab 1: 规则配置 + 实时水位
           ────────── */}
      {activeTab === 'rules' && (
        <div className="space-y-6">
          {/* 实时水位 */}
          {waterLevels && (
            <div>
              <h2 className="text-lg font-semibold text-slate-800 mb-3 flex items-center gap-2">
                <Activity size={18} className="text-blue-500" />
                当前限流水位（分钟滑动窗口）</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <WaterBar current={waterLevels.globalRpm.current} limit={waterLevels.globalRpm.limit} label="全局 RPM" unit="次/分" />
                <WaterBar current={waterLevels.globalTpm.current} limit={waterLevels.globalTpm.limit} label="全局 TPM" unit="Token/分" />
                <div className="bg-white rounded-lg border border-slate-200 p-4 flex items-center gap-4">
                  <div className="flex-1">
                    <div className="text-sm font-medium text-slate-700">活跃用户（窗口内）</div>
                    <div className="text-2xl font-bold text-slate-900 mt-1">{waterLevels.activeUsersInWindow}</div>
                  </div>
                  <div className="w-px h-10 bg-slate-200" />
                  <div className="flex-1">
                    <div className="text-sm font-medium text-slate-700">活跃 API Key</div>
                    <div className="text-2xl font-bold text-slate-900 mt-1">{waterLevels.activeKeysInWindow}</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 规则编辑 */}
          <div>
            <h2 className="text-lg font-semibold text-slate-800 mb-3 flex items-center gap-2">
              <Globe size={18} className="text-blue-500" />
              限流规则设定
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {groupedRules.map((g) => (
                <div key={g.group} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                  <div className="bg-slate-50 px-4 py-2 border-b border-slate-200">
                    <h3 className="text-sm font-semibold text-slate-600">{g.group}</h3>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {g.rules.map((rule) => (
                      <div key={rule.key} className="px-4 py-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-slate-400 font-mono">{rule.key}</span>
                          {editingKey === rule.key ? (
                            <button onClick={() => setEditingKey(null)} className="text-slate-400 hover:text-slate-600">
                              <X size={14} />
                            </button>
                          ) : (
                            <button onClick={() => { setEditingKey(rule.key); setEditValue(rule.value) }} className="text-blue-500 hover:text-blue-700">
                              <Edit2 size={14} />
                            </button>
                          )}
                        </div>
                        <div className="mt-1">
                          {editingKey === rule.key ? (
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                min="1"
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                className="flex-1 px-2 py-1 border border-blue-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                autoFocus
                              />
                              <button
                                onClick={() => handleSaveRule(rule.key)}
                                className="text-green-600 hover:text-green-800"
                              >
                                <Save size={16} />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-baseline gap-2">
                              <span className="text-xl font-bold text-slate-900">
                                {parseInt(rule.value).toLocaleString()}
                              </span>
                              <span className="text-xs text-slate-400">
                                {rule.key.endsWith('rpm') ? '请求/分' : 'Token/分'}
                              </span>
                              {rule.isDefault && (
                                <span className="text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded">默认值</span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ──────────
           Tab 2: 用户覆盖规则
           ────────── */}
      {activeTab === 'overrides' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-xs">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="搜索用户 ID / 邮箱 / 昵称..."
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSearchOverride() }}
                className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              onClick={handleSearchOverride}
              className="px-4 py-2 bg-blue-50 text-blue-600 rounded-lg text-sm hover:bg-blue-100 transition"
            >
              搜索
            </button>
            <button
              onClick={openAddOverride}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition flex items-center gap-1.5"
            >
              <Plus size={16} />
              添加覆盖
            </button>
            <span className="text-sm text-slate-500">共{overrideTotal} 条覆盖规则</span>
          </div>

          {overrideLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="animate-spin" size={24} />
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-slate-50 text-left">
                      <th className="px-4 py-3 text-sm font-medium text-slate-500">用户</th>
                      <th className="px-4 py-3 text-sm font-medium text-slate-500">类型</th>
                      <th className="px-4 py-3 text-sm font-medium text-slate-500">RPM 覆盖</th>
                      <th className="px-4 py-3 text-sm font-medium text-slate-500">当前 RPM</th>
                      <th className="px-4 py-3 text-sm font-medium text-slate-500">TPM 覆盖</th>
                      <th className="px-4 py-3 text-sm font-medium text-slate-500">当前 TPM</th>
                      <th className="px-4 py-3 text-sm font-medium text-slate-500">有效期</th>
                      <th className="px-4 py-3 text-sm font-medium text-slate-500">设定人</th>
                      <th className="px-4 py-3 text-sm font-medium text-slate-500">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {overrides.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="text-center py-12 text-slate-400">
                          <div className="text-sm font-medium">暂无用户覆盖规则</div>
                          <div className="text-xs mt-1">点击「添加覆盖」为特定用户设置独立的 RPM/TPM 限流</div>
                        </td>
                      </tr>
                    ) : (
                      overrides.map((o) => (
                        <tr key={o.quotaId} className="hover:bg-slate-50 transition">
                          <td className="px-4 py-3">
                            <div className="text-sm font-medium text-slate-800">{o.userNickname || '未设置'}</div>
                            <div className="text-xs text-slate-400">ID: {o.userId} {o.userEmail ? `| ${o.userEmail}` : ''}</div>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`text-xs px-2 py-0.5 rounded-full ${o.userType === 'enterprise' ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-600'}`}>
                              {o.userType === 'enterprise' ? '企业' : '个人'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm font-mono text-blue-600">{o.rpmLimit?.toLocaleString() ?? '-'}</td>
                          <td className="px-4 py-3">
                            <span className={`text-sm font-mono ${o.currentRpm > (o.rpmLimit ?? 99999) ? 'text-red-500' : o.currentRpm > ((o.rpmLimit ?? 99999) * 0.7) ? 'text-yellow-600' : 'text-slate-600'}`}>
                              {o.currentRpm}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm font-mono text-blue-600">{o.tpmLimit?.toLocaleString() ?? '-'}</td>
                          <td className="px-4 py-3">
                            <span className={`text-sm font-mono ${o.currentTpm > (o.tpmLimit ?? 99999999) ? 'text-red-500' : o.currentTpm > ((o.tpmLimit ?? 99999999) * 0.7) ? 'text-yellow-600' : 'text-slate-600'}`}>
                              {o.currentTpm.toLocaleString()}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-500">
                            {o.periodStart ? new Date(o.periodStart).toLocaleDateString('zh-CN') : '-'}
                            ~{o.periodEnd ? new Date(o.periodEnd).toLocaleDateString('zh-CN') : '-'}
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-500">{o.setByRole === 'admin' ? '管理员' : '代理商'}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => openEditOverride(o)}
                                className="text-blue-400 hover:text-blue-600 transition"
                                title="编辑覆盖"
                              >
                                <Edit2 size={16} />
                              </button>
                              <button
                                onClick={() => handleDeleteOverride(o.quotaId)}
                                className="text-red-400 hover:text-red-600 transition"
                                title="清除覆盖"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              {overrideTotal > 0 && (
                <PaginationBar
                  page={overridePage}
                  onPageChange={(p) => { setOverridePage(p); fetchOverrides(p) }}
                  pageSize={OVERRIDE_PAGE_SIZE}
                  total={overrideTotal}
                  totalPages={Math.ceil(overrideTotal / OVERRIDE_PAGE_SIZE)}
                />
              )}
            </div>
          )}
        </div>
      )}

      {/* ──────────
           Tab 3: 限流命中事件
           ────────── */}
      {activeTab === 'hits' && (
        <div className="space-y-4">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 flex items-center gap-3">
              <AlertCircle size={20} className="text-red-500" />
              <div>
                <div className="text-sm text-red-700">今日限流次数</div>
                <div className="text-2xl font-bold text-red-600">{hitsTotalToday}</div>
              </div>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 flex items-center gap-3">
              <div>
                <div className="text-sm text-slate-500">当前查询范围</div>
                <div className="text-xl font-bold text-slate-700">{hitsTotal}</div>
              </div>
            </div>
            <div className="flex items-center gap-1 border border-slate-300 rounded-lg overflow-hidden">
              {(['1h', '6h', 'today'] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setHitsRange(r)}
                  className={`px-3 py-2 text-sm transition ${hitsRange === r ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
                >
                  {r === '1h' ? '近 1 小时' : r === '6h' ? '近 6 小时' : '今天'}
                </button>
              ))}
            </div>
            <button onClick={() => fetchHits(hitsPage)} className="px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition">
              刷新
            </button>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50 text-left">
                    <th className="px-4 py-3 text-sm font-medium text-slate-500">时间</th>
                    <th className="px-4 py-3 text-sm font-medium text-slate-500">用户</th>
                    <th className="px-4 py-3 text-sm font-medium text-slate-500">模型</th>
                    <th className="px-4 py-3 text-sm font-medium text-slate-500">错误信息</th>
                    <th className="px-4 py-3 text-sm font-medium text-slate-500">请求 Token</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {hits.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-center py-12 text-slate-400">
                        所选时间范围内无限流命中事件</td>
                    </tr>
                  ) : (
                    hits.map((h) => (
                      <tr key={h.id} className="hover:bg-slate-50 transition">
                        <td className="px-4 py-3 text-sm text-slate-500 whitespace-nowrap">
                          {h.createdAt ? new Date(h.createdAt).toLocaleString('zh-CN') : '-'}
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-sm text-slate-800">{h.userNickname || '未知'}</div>
                          <div className="text-xs text-slate-400">{h.userEmail || `ID: ${h.userId}`}</div>
                        </td>
                        <td className="px-4 py-3 text-sm font-mono text-slate-600">{h.modelName || '-'}</td>
                        <td className="px-4 py-3 text-sm text-red-600 max-w-xs truncate" title={h.errorMessage ?? ''}>{h.errorMessage || '-'}</td>
                        <td className="px-4 py-3 text-sm text-slate-500">{h.requestTokens ? parseInt(h.requestTokens).toLocaleString() : '-'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {hitsTotal > 0 && (
              <PaginationBar
                page={hitsPage}
                onPageChange={(p) => { setHitsPage(p); fetchHits(p) }}
                pageSize={HITS_PAGE_SIZE}
                total={hitsTotal}
                totalPages={Math.ceil(hitsTotal / HITS_PAGE_SIZE)}
              />
            )}
          </div>
        </div>
      )}

      {/* ── 添加/编辑覆盖弹窗 ── */}
      <OverrideDialog
        open={showOverrideDialog}
        editItem={editingOverride}
        onClose={() => { setShowOverrideDialog(false); setEditingOverride(null) }}
        onSaved={() => {
          setMsg(editingOverride ? '限流覆盖已更新' : '限流覆盖已添加')
          fetchOverrides(overridePage)
        }}
      />
    </div>
  )
}