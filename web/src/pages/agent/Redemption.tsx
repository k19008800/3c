import { useEffect, useState, useCallback } from 'react'
import { get, post, downloadUrl, del } from '@/lib/api'
import PaginationBar from '@/components/ui/PaginationBar'
import {
  Loader2, Gift, Plus, AlertCircle, CheckCircle2, Download, Trash2, Send, X,
  Package, Users, DollarSign, Hash, Wallet, AlertTriangle, BarChart3, TrendingUp,
  ToggleLeft, ToggleRight, FileSpreadsheet, FileText,
} from 'lucide-react'

// ── Types ──

interface RedemptionCode {
  id: number
  code: string
  amount: string
  status: string
  createdAt: string
  batchId: number
  batchName: string | null
}

interface RedemptionStats {
  totalBatches: number
  activeBatches: number
  totalCodes: number
  usedCodes: number
  totalRedeemed: number
  totalAmount: string
  totalUsers: number
}

interface CodeTemplate {
  id: number
  name: string
  type: string
  tokenAmount: string
  validDays: number | null
  maxPerUser: number
  userScope: string
  remark: string | null
  createdByType: string
  createdById: number
  createdAt: string
}

interface CostAnalysisData {
  summary: {
    totalBatches: number
    totalFaceValue: number
    totalUsedToken: number
    totalCost: number
    totalSubsidy: number
    overallUsageRate: number
    lockedAmount: number
  }
  batches: {
    batchId: number
    batchName: string
    totalCount: number
    usedCount: number
    usageRate: number
    faceValue: number
    costAmount: number
    subsidy: number
    status: string
  }[]
}

const codeStatusMap: Record<string, { label: string; color: string }> = {
  unused: { label: '未使用', color: 'bg-blue-100 text-blue-700' },
  used: { label: '已使用', color: 'bg-green-100 text-green-700' },
  expired: { label: '已过期', color: 'bg-slate-100 text-slate-500' },
  revoked: { label: '已作废', color: 'bg-red-100 text-red-700' },
  disabled: { label: '已停用', color: 'bg-orange-100 text-orange-700' },
}

interface AgentWallet {
  settledCommission: string
  pendingWithdraw: string
  frozenAmount: string
  redemptionLocked: string
  available: string
}

// ── Helper: download CSV from data object ──

function downloadCsvFromData(csv: string, filename: string) {
  const bom = '\uFEFF'
  const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = filename
  link.click()
  URL.revokeObjectURL(link.href)
}

// ── 兑换码管理（代理商）─-
//
// 【业务说明】
//   代理商兑换码运营面板，包含四个标签页：
//   1. 数据概览：批次/码数/金额/用户数等汇总统计
//   2. 兑换码列表：查看所有码及其状态，支持批量作废、转赠、CSV 导出
//   3. 模板管理：创建/管理兑换码模板（名称、面额、有效期、每人限领、适用范围）
//   4. 成本分析：兑换码发放与核销的成本统计
//
// 【权限要求】角色=agent
// 【数据来源】GET /api/v1/redemption/stats, GET /api/v1/redemption/codes, GET /api/v1/agent/redemption/templates, GET /api/v1/agent/redemption/cost-analysis

export default function AgentRedemption() {
  const [tab, setTab] = useState<'stats' | 'codes' | 'templates' | 'cost-analysis'>('stats')

  const [wallet, setWallet] = useState<AgentWallet | null>(null)
  const [walletLoading, setWalletLoading] = useState(true)

  const [stats, setStats] = useState<RedemptionStats | null>(null)
  const [statsLoading, setStatsLoading] = useState(true)

  const [codes, setCodes] = useState<RedemptionCode[]>([])
  const [codesTotal, setCodesTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [codesLoading, setCodesLoading] = useState(true)
  const [codesFilter, setCodesFilter] = useState<{ status?: string }>({})

  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState({ name: '', amount: '', count: '100', expiresAt: '', note: '' })
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')
  const [formSuccess, setFormSuccess] = useState('')

  const [revokingId, setRevokingId] = useState<number | null>(null)
  const [giftModalCodeId, setGiftModalCodeId] = useState<number | null>(null)
  const [giftModalCodeDisplay, setGiftModalCodeDisplay] = useState('')
  const [exporting, setExporting] = useState(false)

  // ── Batch selection state ──
  const [selectedCodeIds, setSelectedCodeIds] = useState<number[]>([])
  const [batchActionRunning, setBatchActionRunning] = useState(false)

  // ── Template state ──
  const [templates, setTemplates] = useState<CodeTemplate[]>([])
  const [templatesLoading, setTemplatesLoading] = useState(false)
  const [templateFormOpen, setTemplateFormOpen] = useState(false)
  const [templateForm, setTemplateForm] = useState({
    name: '',
    tokenAmount: '',
    validDays: '30',
    maxPerUser: '1',
    userScope: 'all',
    remark: '',
  })
  const [templateSubmitting, setTemplateSubmitting] = useState(false)
  const [templateError, setTemplateError] = useState('')
  const [templateSuccess, setTemplateSuccess] = useState('')

  // ── Cost analysis state ──
  const [costData, setCostData] = useState<CostAnalysisData | null>(null)
  const [costLoading, setCostLoading] = useState(false)

  const totalPages = Math.ceil(codesTotal / pageSize)

  const fetchWallet = useCallback(async () => {
    setWalletLoading(true)
    try {
      const data = await get<AgentWallet>('/api/v1/redemption/agent-wallet')
      setWallet(data)
    } catch { setWallet(null) }
    finally { setWalletLoading(false) }
  }, [])

  const fetchStats = useCallback(async () => {
    setStatsLoading(true)
    try {
      const data = await get<RedemptionStats>('/api/v1/redemption/stats')
      setStats(data)
    } catch { /* ignore */ } finally { setStatsLoading(false) }
  }, [])

  const fetchCodes = useCallback(async () => {
    setCodesLoading(true)
    try {
      const params: any = { page, pageSize }
      if (codesFilter.status) params.status = codesFilter.status
      const data = await get<{ list: RedemptionCode[]; total: number }>('/api/v1/redemption/codes', params)
      setCodes(data.list || [])
      setCodesTotal(data.total)
    } catch { /* ignore */ } finally { setCodesLoading(false) }
  }, [page, pageSize, codesFilter])

  const fetchTemplates = useCallback(async () => {
    setTemplatesLoading(true)
    try {
      const data = await get<CodeTemplate[]>('/api/v1/agent/redemption/templates')
      setTemplates(data || [])
    } catch { /* ignore */ } finally { setTemplatesLoading(false) }
  }, [])

  const fetchCostAnalysis = useCallback(async () => {
    setCostLoading(true)
    try {
      const data = await get<CostAnalysisData>('/api/v1/agent/redemption/cost-analysis')
      setCostData(data)
    } catch { /* ignore */ } finally { setCostLoading(false) }
  }, [])

  useEffect(() => { fetchWallet() }, [fetchWallet])
  useEffect(() => { fetchStats() }, [fetchStats])
  useEffect(() => { fetchCodes() }, [fetchCodes])
  useEffect(() => { if (tab === 'templates') fetchTemplates() }, [fetchTemplates, tab])
  useEffect(() => { if (tab === 'cost-analysis') fetchCostAnalysis() }, [fetchCostAnalysis, tab])

  const handleCreate = async () => {
    setFormError('')
    setFormSuccess('')
    if (!form.name || !form.amount || !form.count) {
      setFormError('请填写名称、面额和数量')
      return
    }
    setSubmitting(true)
    try {
      await post('/api/v1/redemption/codes/batch', {
        name: form.name,
        amount: form.amount,
        count: parseInt(form.count, 10),
        expiresAt: form.expiresAt || undefined,
        note: form.note || undefined,
      })
      setFormSuccess(`批次 "${form.name}" 创建成功`)
      setForm({ name: '', amount: '', count: '100', expiresAt: '', note: '' })
      setFormOpen(false)
      fetchCodes()
      fetchStats()
      fetchWallet()
    } catch (err: any) {
      setFormError(err.message || '创建失败')
    } finally { setSubmitting(false) }
  }

  const handleRevoke = async (id: number) => {
    setRevokingId(id)
    try {
      await del(`/api/v1/redemption/codes/${id}`)
      fetchCodes()
      fetchStats()
      fetchWallet()
    } catch (err: any) {
      alert(err.message || '作废失败')
    } finally { setRevokingId(null) }
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      // Try enhanced export endpoint first
      try {
        const data = await get<{ csv: string }>('/api/v1/agent/redemption/export')
        downloadCsvFromData(data.csv, 'my-redemption-codes.csv')
      } catch {
        // fallback to existing export
        await downloadUrl('/api/v1/redemption/codes/export?status=unused', 'unused-codes.csv')
      }
    } catch {
      try {
        const data = await get<{ list: RedemptionCode[] }>('/api/v1/redemption/codes', { status: 'unused', pageSize: 10000 })
        const codes_only = (data.list || []).map(c => c.code).join('\n')
        const blob = new Blob([codes_only], { type: 'text/plain;charset=utf-8' })
        const link = document.createElement('a')
        link.href = URL.createObjectURL(blob)
        link.download = 'unused-codes.txt'
        link.click()
        URL.revokeObjectURL(link.href)
      } catch { /* ignore */ }
    } finally { setExporting(false) }
  }

  // ── Batch selection handlers ──

  const handleToggleSelectCode = (id: number) => {
    setSelectedCodeIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  const handleSelectAllCodes = () => {
    if (selectedCodeIds.length === codes.length) {
      setSelectedCodeIds([])
    } else {
      setSelectedCodeIds(codes.map(c => c.id))
    }
  }

  const handleBatchAction = async (action: 'disable' | 'enable') => {
    if (selectedCodeIds.length === 0) return
    const actionLabel = action === 'disable' ? '停用' : '启用'
    if (!confirm(`确认批量 ${actionLabel} 所选 ${selectedCodeIds.length} 个兑换码？`)) return
    setBatchActionRunning(true)
    try {
      await post('/api/v1/agent/redemption/batch-action', {
        action,
        codeIds: selectedCodeIds,
      })
      setSelectedCodeIds([])
      fetchCodes()
      fetchStats()
      fetchWallet()
    } catch (err: any) {
      alert(err.message || `批量${actionLabel}失败`)
    } finally {
      setBatchActionRunning(false)
    }
  }

  // ── Template handlers ──

  const handleCreateTemplate = async () => {
    setTemplateError('')
    setTemplateSuccess('')
    if (!templateForm.name || !templateForm.tokenAmount) {
      setTemplateError('请填写模板名称和 Token 数量')
      return
    }
    setTemplateSubmitting(true)
    try {
      await post('/api/v1/agent/redemption/templates', {
        name: templateForm.name,
        tokenAmount: templateForm.tokenAmount,
        validDays: parseInt(templateForm.validDays, 10) || undefined,
        maxPerUser: parseInt(templateForm.maxPerUser, 10) || 1,
        userScope: templateForm.userScope,
        remark: templateForm.remark || undefined,
      })
      setTemplateSuccess(`模板 "${templateForm.name}" 创建成功`)
      setTemplateForm({ name: '', tokenAmount: '', validDays: '30', maxPerUser: '1', userScope: 'all', remark: '' })
      setTemplateFormOpen(false)
      fetchTemplates()
    } catch (err: any) {
      setTemplateError(err.message || '创建模板失败')
    } finally {
      setTemplateSubmitting(false)
    }
  }

  // ── Template quick-create redemption ──

  const handleQuickCreateFromTemplate = async (tmpl: CodeTemplate) => {
    if (!confirm(`使用模板 "${tmpl.name}" 快速创建兑换码批次？`)) return
    setSubmitting(true)
    try {
      await post('/api/v1/redemption/codes/batch', {
        name: `[模板] ${tmpl.name}`,
        amount: tmpl.tokenAmount,
        count: 1,
        note: `来自模板 ${tmpl.name}`,
      })
      setFormSuccess(`已根据模板 "${tmpl.name}" 创建兑换码`)
      fetchCodes()
      fetchStats()
      fetchWallet()
    } catch (err: any) {
      alert(err.message || '创建失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Gift size={28} className="text-purple-600" />
          <h1 className="text-2xl font-bold text-slate-900">兑换码管理</h1>
        </div>
        <button
          onClick={() => setFormOpen(!formOpen)}
          className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition text-sm"
        >
          <Plus size={16} />
          生成兑换码
        </button>
      </div>

      {/* Batch creation form */}
      {formOpen && (() => {
        const faceAmount = parseFloat(form.amount) || 0
        const count = parseInt(form.count, 10) || 0
        const totalNeeded = faceAmount * count
        const available = wallet ? parseFloat(wallet.available) : 0
        const exceeded = totalNeeded > 0 && totalNeeded > available

        return (
        <div className="bg-white rounded-xl p-6 shadow-sm border border-purple-200 space-y-4">
          <h3 className="font-semibold text-slate-900">生成兑换码批次</h3>
          <p className="text-sm text-slate-500">消耗代理余额生成兑换码，余额不足时无法创建</p>

          {walletLoading ? (
            <div className="flex items-center gap-2 text-sm text-slate-400"><Loader2 className="animate-spin" size={14} />加载余额...</div>
          ) : wallet ? (
            <div className={`rounded-lg p-4 border ${exceeded ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-200'}`}>
              <div className="flex items-center gap-2 mb-2">
                <Wallet size={18} className={exceeded ? 'text-red-500' : 'text-slate-500'} />
                <span className="text-sm font-medium text-slate-700">可提现余额</span>
              </div>
              <p className={`text-2xl font-bold ${exceeded ? 'text-red-600' : 'text-green-600'}`}>
                ¥{available.toFixed(2)}
              </p>
              <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-slate-500">
                <div>
                  <span className="block text-slate-400">已结算佣金</span>
                  <span className="font-medium text-slate-700">¥{parseFloat(wallet.settledCommission).toFixed(2)}</span>
                </div>
                <div>
                  <span className="block text-slate-400">兑换码锁定</span>
                  <span className="font-medium text-amber-600">¥{parseFloat(wallet.redemptionLocked).toFixed(2)}</span>
                </div>
                <div>
                  <span className="block text-slate-400">提现处理中</span>
                  <span className="font-medium text-slate-700">¥{parseFloat(wallet.pendingWithdraw).toFixed(2)}</span>
                </div>
              </div>

              {exceeded && (
                <div className="mt-3 flex items-center gap-2 text-red-700 bg-red-100 p-2 rounded-lg text-sm">
                  <AlertTriangle size={14} />
                  <span>余额不足！需 ¥{totalNeeded.toFixed(2)}，可用 ¥{available.toFixed(2)}，差额 ¥{(totalNeeded - available).toFixed(2)}</span>
                </div>
              )}

              {!exceeded && totalNeeded > 0 && (
                <div className="mt-3 flex items-center gap-2 text-sm text-slate-500">
                  <span>本批次总额：</span>
                  <span className="font-semibold text-purple-600">¥{totalNeeded.toFixed(2)}</span>
                  <span>· 生成后可用余额：</span>
                  <span className="font-semibold text-slate-700">¥{(available - totalNeeded).toFixed(2)}</span>
                </div>
              )}
            </div>
          ) : null}

          {formError && (
            <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm">
              <AlertCircle size={16} />
              {formError}
            </div>
          )}
          {formSuccess && (
            <div className="flex items-center gap-2 text-green-700 bg-green-50 p-3 rounded-lg text-sm">
              <CheckCircle2 size={16} />
              {formSuccess}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">批次名称 *</label>
              <input type="text" value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="如：客户回馈" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">面额 (¥) *</label>
              <input type="number" step="0.01" min="0.01" value={form.amount} onChange={(e) => setForm(f => ({ ...f, amount: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">数量 *</label>
              <input type="number" min="1" max="100000" value={form.count} onChange={(e) => setForm(f => ({ ...f, count: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">过期时间</label>
              <input type="datetime-local" value={form.expiresAt} onChange={(e) => setForm(f => ({ ...f, expiresAt: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">备注</label>
              <input type="text" value={form.note} onChange={(e) => setForm(f => ({ ...f, note: e.target.value }))}
                placeholder="可选" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleCreate} disabled={submitting || exceeded}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 transition text-sm flex items-center gap-2">
              {submitting && <Loader2 className="animate-spin" size={16} />}
              确认生成
            </button>
            <button onClick={() => setFormOpen(false)} className="px-4 py-2 border border-slate-300 text-slate-600 rounded-lg hover:bg-slate-50 transition text-sm">
              取消
            </button>
          </div>
        </div>
        )
      })()}

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-lg w-fit">
        {(['stats', 'codes', 'templates', 'cost-analysis'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-md text-sm transition ${tab === t ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            {t === 'stats' ? '统计概览' : t === 'codes' ? '兑换码列表' : t === 'templates' ? '模板管理' : '成本分析'}
          </button>
        ))}
      </div>

      {/* Tab: Stats */}
      {tab === 'stats' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {statsLoading ? (
            <div className="col-span-4 flex justify-center py-8"><Loader2 className="animate-spin" size={24} /></div>
          ) : stats ? (
            <>
              <StatCard icon={Package} label="总批次" value={String(stats.totalBatches)} sub={`活跃 ${stats.activeBatches}`} color="bg-purple-500" />
              <StatCard icon={Hash} label="总码数" value={String(stats.totalCodes)} sub={`已用 ${stats.usedCodes}`} color="bg-blue-500" />
              <StatCard icon={Users} label="兑换用户数" value={String(stats.totalUsers)} sub={`兑换次数 ${stats.totalRedeemed}`} color="bg-green-500" />
              <StatCard icon={DollarSign} label="兑换总额" value={`¥${Number(stats.totalAmount).toFixed(2)}`} color="bg-orange-500" />
            </>
          ) : null}
        </div>
      )}

      {/* Tab: Codes */}
      {tab === 'codes' && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 space-y-4">
          {/* Batch action toolbar */}
          {selectedCodeIds.length > 0 && (
            <div className="px-4 pt-4 pb-2 flex items-center gap-3 bg-purple-50 border-b border-purple-100">
              <span className="text-sm text-purple-700">已选 {selectedCodeIds.length} 个兑换码</span>
              <button
                onClick={() => handleBatchAction('disable')}
                disabled={batchActionRunning}
                className="flex items-center gap-1 px-3 py-1.5 bg-orange-500 text-white rounded-lg text-xs hover:bg-orange-600 disabled:opacity-50 transition"
              >
                {batchActionRunning ? <Loader2 className="animate-spin" size={12} /> : <ToggleLeft size={12} />}
                批量停用
              </button>
              <button
                onClick={() => handleBatchAction('enable')}
                disabled={batchActionRunning}
                className="flex items-center gap-1 px-3 py-1.5 bg-green-500 text-white rounded-lg text-xs hover:bg-green-600 disabled:opacity-50 transition"
              >
                {batchActionRunning ? <Loader2 className="animate-spin" size={12} /> : <ToggleRight size={12} />}
                批量启用
              </button>
              <button
                onClick={() => setSelectedCodeIds([])}
                className="flex items-center gap-1 px-3 py-1.5 text-slate-500 hover:text-slate-700 text-xs transition"
              >
                <X size={12} />
                取消
              </button>
            </div>
          )}

          <div className="p-4 flex items-center gap-4 border-b border-slate-100">
            <select value={codesFilter.status || ''} onChange={(e) => setCodesFilter(f => ({ ...f, status: e.target.value || undefined }))}
              className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500">
              <option value="">全部状态</option>
              <option value="unused">未使用</option>
              <option value="used">已使用</option>
              <option value="revoked">已作废</option>
            </select>
            <button onClick={() => { handleExport(); setExporting(true) }} disabled={exporting}
              className="flex items-center gap-1 px-3 py-1.5 border border-slate-300 rounded-lg text-sm hover:bg-slate-50 transition">
              {exporting ? <Loader2 className="animate-spin" size={14} /> : <Download size={14} />}
              导出
            </button>
          </div>

          {codesLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="animate-spin" size={24} /></div>
          ) : codes.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-sm">暂无兑换码</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50 text-left">
                    <th className="px-4 py-3 text-sm font-medium text-slate-500 w-10">
                      <input
                        type="checkbox"
                        checked={selectedCodeIds.length === codes.length && codes.length > 0}
                        onChange={handleSelectAllCodes}
                        className="rounded border-slate-300"
                      />
                    </th>
                    <th className="px-4 py-3 text-sm font-medium text-slate-500">兑换码</th>
                    <th className="px-4 py-3 text-sm font-medium text-slate-500">面额</th>
                    <th className="px-4 py-3 text-sm font-medium text-slate-500">状态</th>
                    <th className="px-4 py-3 text-sm font-medium text-slate-500">创建时间</th>
                    <th className="px-4 py-3 text-sm font-medium text-slate-500">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {codes.map(c => {
                    const sc = codeStatusMap[c.status] || { label: c.status, color: 'bg-slate-100 text-slate-700' }
                    const isSelected = selectedCodeIds.includes(c.id)
                    return (
                      <tr key={c.id} className={`hover:bg-slate-50 transition ${isSelected ? 'bg-purple-50' : ''}`}>
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleSelectCode(c.id)}
                            className="rounded border-slate-300"
                          />
                        </td>
                        <td className="px-4 py-3 text-sm font-mono text-slate-700">{c.code}</td>
                        <td className="px-4 py-3 text-sm font-medium text-green-600">¥{Number(c.amount).toFixed(2)}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${sc.color}`}>{sc.label}</span>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-500 whitespace-nowrap">{new Date(c.createdAt).toLocaleString('zh-CN')}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                          {c.status === 'unused' && (
                            <>
                            <button
                              onClick={() => {
                                setGiftModalCodeId(c.id)
                                setGiftModalCodeDisplay(c.code)
                              }}
                              className="flex items-center gap-1 text-xs text-purple-600 hover:text-purple-800 transition"
                            >
                              <Send size={12} />
                              转赠
                            </button>
                            <button onClick={() => handleRevoke(c.id)} disabled={revokingId === c.id}
                              className="flex items-center gap-1 text-xs text-red-600 hover:text-red-800 transition">
                              {revokingId === c.id ? <Loader2 className="animate-spin" size={12} /> : <Trash2 size={12} />}
                              作废
                            </button>
                            </>
                          )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          {totalPages > 0 && (
            <PaginationBar page={page} onPageChange={setPage} pageSize={pageSize} onPageSizeChange={setPageSize} total={codesTotal} totalPages={totalPages} />
          )}
        </div>
      )}

      {/* Tab: Templates */}
      {tab === 'templates' && (
        <div className="space-y-6">
          {/* Template form */}
          <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                <FileText size={16} className="text-purple-500" />
                模板管理
              </h3>
              <button
                onClick={() => setTemplateFormOpen(!templateFormOpen)}
                className="flex items-center gap-1 px-3 py-1.5 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700 transition"
              >
                <Plus size={14} />
                新建模板
              </button>
            </div>

            {templateFormOpen && (
              <div className="border-t border-slate-100 pt-4 space-y-4">
                {templateError && (
                  <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm">
                    <AlertCircle size={16} />
                    {templateError}
                  </div>
                )}
                {templateSuccess && (
                  <div className="flex items-center gap-2 text-green-700 bg-green-50 p-3 rounded-lg text-sm">
                    <CheckCircle2 size={16} />
                    {templateSuccess}
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">模板名称 *</label>
                    <input type="text" value={templateForm.name}
                      onChange={(e) => setTemplateForm(f => ({ ...f, name: e.target.value }))}
                      placeholder="如：标准折扣码" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Token 数量 *</label>
                    <input type="number" step="0.01" min="0.01" value={templateForm.tokenAmount}
                      onChange={(e) => setTemplateForm(f => ({ ...f, tokenAmount: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">有效期（天）</label>
                    <input type="number" min="1" value={templateForm.validDays}
                      onChange={(e) => setTemplateForm(f => ({ ...f, validDays: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">每人限领</label>
                    <input type="number" min="1" value={templateForm.maxPerUser}
                      onChange={(e) => setTemplateForm(f => ({ ...f, maxPerUser: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">用户范围</label>
                    <select value={templateForm.userScope}
                      onChange={(e) => setTemplateForm(f => ({ ...f, userScope: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500">
                      <option value="all">全部用户</option>
                      <option value="new">新用户</option>
                      <option value="vip">VIP用户</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">备注</label>
                    <input type="text" value={templateForm.remark}
                      onChange={(e) => setTemplateForm(f => ({ ...f, remark: e.target.value }))}
                      placeholder="可选" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={handleCreateTemplate} disabled={templateSubmitting}
                    className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 transition text-sm flex items-center gap-2">
                    {templateSubmitting && <Loader2 className="animate-spin" size={16} />}
                    保存模板
                  </button>
                  <button onClick={() => setTemplateFormOpen(false)}
                    className="px-4 py-2 border border-slate-300 text-slate-600 rounded-lg hover:bg-slate-50 transition text-sm">
                    取消
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Template list */}
          {templatesLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="animate-spin" size={24} /></div>
          ) : templates.length === 0 ? (
            <div className="bg-white rounded-xl py-12 text-center text-slate-400 text-sm shadow-sm border border-slate-200">
              <FileText size={40} className="mx-auto mb-2 opacity-50" />
              暂无模板，点击"新建模板"创建
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {templates.map(tmpl => (
                <div key={tmpl.id} className="bg-white rounded-xl p-5 shadow-sm border border-slate-200 hover:border-purple-200 transition">
                  <div className="flex items-center gap-2 mb-3">
                    <FileText size={16} className="text-purple-500" />
                    <h4 className="font-semibold text-slate-900">{tmpl.name}</h4>
                  </div>
                  <div className="space-y-2 text-sm text-slate-600">
                    <div className="flex justify-between">
                      <span>Token 数量</span>
                      <span className="font-medium text-green-600">{tmpl.tokenAmount}</span>
                    </div>
                    {tmpl.validDays && (
                      <div className="flex justify-between">
                        <span>有效期</span>
                        <span>{tmpl.validDays} 天</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span>每人限领</span>
                      <span>{tmpl.maxPerUser}</span>
                    </div>
                    {tmpl.remark && (
                      <div className="text-xs text-slate-400 mt-1">{tmpl.remark}</div>
                    )}
                  </div>
                  <button
                    onClick={() => handleQuickCreateFromTemplate(tmpl)}
                    disabled={submitting}
                    className="mt-4 w-full py-2 bg-purple-600 text-white rounded-lg text-xs hover:bg-purple-700 disabled:opacity-50 transition"
                  >
                    快速创建兑换码
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab: Cost Analysis */}
      {tab === 'cost-analysis' && (
        <div className="space-y-6">
          {costLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="animate-spin" size={24} /></div>
          ) : costData ? (
            <>
              {/* Summary cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard icon={BarChart3} label="总批次" value={String(costData.summary.totalBatches)} color="bg-purple-500" />
                <StatCard icon={DollarSign} label="总面值" value={`¥${costData.summary.totalFaceValue.toLocaleString()}`} color="bg-blue-500" />
                <StatCard icon={TrendingUp} label="总成本" value={`¥${costData.summary.totalCost.toLocaleString()}`} sub={`补贴 ¥${costData.summary.totalSubsidy.toLocaleString()}`} color="bg-orange-500" />
                <StatCard icon={TrendingUp} label="使用率" value={`${costData.summary.overallUsageRate}%`} sub={`锁定 ¥${costData.summary.lockedAmount.toLocaleString()}`} color="bg-green-500" />
              </div>

              {/* Batch detail table */}
              {costData.batches.length > 0 && (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-slate-50 text-left">
                        <th className="px-4 py-3 text-sm font-medium text-slate-500">批次名称</th>
                        <th className="px-4 py-3 text-sm font-medium text-slate-500 text-right">总数</th>
                        <th className="px-4 py-3 text-sm font-medium text-slate-500 text-right">已用</th>
                        <th className="px-4 py-3 text-sm font-medium text-slate-500 text-right">使用率</th>
                        <th className="px-4 py-3 text-sm font-medium text-slate-500 text-right">面值</th>
                        <th className="px-4 py-3 text-sm font-medium text-slate-500 text-right">成本</th>
                        <th className="px-4 py-3 text-sm font-medium text-slate-500 text-right">补贴</th>
                        <th className="px-4 py-3 text-sm font-medium text-slate-500">状态</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {costData.batches.map(b => (
                        <tr key={b.batchId} className="hover:bg-slate-50 transition">
                          <td className="px-4 py-3 text-sm font-medium text-slate-900">{b.batchName}</td>
                          <td className="px-4 py-3 text-sm text-right text-slate-700">{b.totalCount}</td>
                          <td className="px-4 py-3 text-sm text-right text-slate-700">{b.usedCount}</td>
                          <td className="px-4 py-3 text-sm text-right">
                            <span className={`${b.usageRate > 50 ? 'text-green-600' : 'text-orange-600'}`}>{b.usageRate}%</span>
                          </td>
                          <td className="px-4 py-3 text-sm text-right text-slate-700">¥{b.faceValue.toLocaleString()}</td>
                          <td className="px-4 py-3 text-sm text-right text-red-600">¥{b.costAmount.toLocaleString()}</td>
                          <td className="px-4 py-3 text-sm text-right text-green-600">¥{b.subsidy.toLocaleString()}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${b.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                              {b.status === 'active' ? '激活' : '已停用'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : (
            <div className="bg-white rounded-xl py-12 text-center text-slate-400 text-sm shadow-sm border border-slate-200">
              <BarChart3 size={40} className="mx-auto mb-2 opacity-50" />
              暂无成本数据
            </div>
          )}
        </div>
      )}

      {/* Gift Modal */}
      {giftModalCodeId !== null && (
        <GiftModal
          codeId={giftModalCodeId}
          codeDisplay={giftModalCodeDisplay}
          onClose={() => setGiftModalCodeId(null)}
          onSuccess={() => {
            alert('转赠成功！')
            setGiftModalCodeId(null)
            fetchCodes()
          }}
        />
      )}
    </div>
  )
}

function StatCard({ icon: Icon, label, value, sub, color }: { icon: any; label: string; value: string; sub?: string; color: string }) {
  return (
    <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-slate-500">{label}</p>
          <p className="text-2xl font-bold mt-1">{value}</p>
          {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
        </div>
        <div className={`p-3 rounded-lg ${color}`}>
          <Icon size={24} className="text-white" />
        </div>
      </div>
    </div>
  )
}

// ── Gift Modal ──

function GiftModal({
  codeId,
  codeDisplay,
  onClose,
  onSuccess,
}: {
  codeId: number
  codeDisplay: string
  onClose: () => void
  onSuccess: () => void
}) {
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async () => {
    if (!email.trim()) {
      setError('请输入接收方邮箱')
      return
    }
    setError('')
    setSubmitting(true)
    try {
      await post(`/api/v1/redemption/codes/${codeId}/gift`, {
        toEmail: email.trim(),
        message: message.trim() || undefined,
      })
      onSuccess()
      onClose()
    } catch (err: any) {
      setError(err.message || '转赠失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
            <Gift size={20} className="text-purple-600" />
            转赠兑换码
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition">
            <X size={20} />
          </button>
        </div>

        <p className="text-sm text-slate-500 mb-2">
          转赠兑换码：<span className="font-mono text-slate-700">{codeDisplay}</span>
        </p>

        {error && (
          <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm mb-4">
            <AlertCircle size={16} />
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">接收方邮箱 *</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="请输入接收方邮箱"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">留言（可选）</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="给对方留言..."
              rows={3}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition text-sm"
            >
              取消
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting || !email.trim()}
              className="flex-1 py-2.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 transition flex items-center justify-center gap-2 text-sm"
            >
              {submitting ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />}
              确认转赠
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
