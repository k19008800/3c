import { useEffect, useState, useCallback } from 'react'
import { get, post, downloadUrl, del } from '@/lib/api'
import { Loader2, Gift, Plus, FileText, BarChart3, DollarSign, TrendingUp, AlertCircle, CheckCircle2 } from 'lucide-react'
import type { RedemptionCode, RedemptionStats, CodeTemplate, CostAnalysisData, AgentWallet } from './redemption/types'
import { downloadCsvFromData } from './redemption/types'
import RedemptionStatsCards, { StatCard } from './redemption/RedemptionStatsCards'
import CodeList from './redemption/CodeList'
import BatchCreateForm from './redemption/BatchCreateForm'
import DistributionPanel from './redemption/DistributionPanel'

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
  const [revokingId, setRevokingId] = useState<number | null>(null)
  const [exporting, setExporting] = useState(false)
  const [selectedCodeIds, setSelectedCodeIds] = useState<number[]>([])
  const [batchActionRunning, setBatchActionRunning] = useState(false)
  const [templates, setTemplates] = useState<CodeTemplate[]>([])
  const [templatesLoading, setTemplatesLoading] = useState(false)
  const [templateFormOpen, setTemplateFormOpen] = useState(false)
  const [templateForm, setTemplateForm] = useState({ name: '', tokenAmount: '', validDays: '30', maxPerUser: '1', userScope: 'all', remark: '' })
  const [templateSubmitting, setTemplateSubmitting] = useState(false)
  const [templateError, setTemplateError] = useState('')
  const [templateSuccess, setTemplateSuccess] = useState('')
  const [costData, setCostData] = useState<CostAnalysisData | null>(null)
  const [costLoading, setCostLoading] = useState(false)
  const [giftModalCodeId, setGiftModalCodeId] = useState<number | null>(null)
  const [giftModalCodeDisplay, setGiftModalCodeDisplay] = useState('')

  const totalPages = Math.ceil(codesTotal / pageSize)
  const [submitting, setSubmitting] = useState(false)

  const fetchWallet = useCallback(async () => { setWalletLoading(true); try { setWallet(await get<AgentWallet>('/api/v1/redemption/agent-wallet')) } catch { setWallet(null) } finally { setWalletLoading(false) } }, [])
  const fetchStats = useCallback(async () => { setStatsLoading(true); try { setStats(await get<RedemptionStats>('/api/v1/redemption/stats')) } catch { /* ignore */ } finally { setStatsLoading(false) } }, [])
  const fetchCodes = useCallback(async () => {
    setCodesLoading(true)
    try {
      const params: any = { page, pageSize }
      if (codesFilter.status) params.status = codesFilter.status
      const data = await get<{ list: RedemptionCode[]; total: number }>('/api/v1/redemption/codes', params)
      setCodes(data.list || []); setCodesTotal(data.total)
    } catch { /* ignore */ } finally { setCodesLoading(false) }
  }, [page, pageSize, codesFilter])
  const fetchTemplates = useCallback(async () => { setTemplatesLoading(true); try { setTemplates(await get<CodeTemplate[]>('/api/v1/agent/redemption/templates') || []) } catch { /* ignore */ } finally { setTemplatesLoading(false) } }, [])
  const fetchCostAnalysis = useCallback(async () => { setCostLoading(true); try { setCostData(await get<CostAnalysisData>('/api/v1/agent/redemption/cost-analysis')) } catch { /* ignore */ } finally { setCostLoading(false) } }, [])

  useEffect(() => { fetchWallet() }, [fetchWallet])
  useEffect(() => { fetchStats() }, [fetchStats])
  useEffect(() => { fetchCodes() }, [fetchCodes])
  useEffect(() => { if (tab === 'templates') fetchTemplates() }, [fetchTemplates, tab])
  useEffect(() => { if (tab === 'cost-analysis') fetchCostAnalysis() }, [fetchCostAnalysis, tab])

  const handleBatchCreate = useCallback(async (f: { name: string; amount: string; count: string; expiresAt: string; note: string }) => {
    try {
      await post('/api/v1/redemption/codes/batch', { name: f.name, amount: f.amount, count: parseInt(f.count, 10), expiresAt: f.expiresAt || undefined, note: f.note || undefined })
      fetchCodes(); fetchStats(); fetchWallet()
      return null
    } catch (err: any) { return err.message || '创建失败' }
  }, [fetchCodes, fetchStats, fetchWallet])

  const handleRevoke = useCallback(async (id: number) => {
    setRevokingId(id)
    try { await del(`/api/v1/redemption/codes/${id}`); fetchCodes(); fetchStats(); fetchWallet() }
    catch (err: any) { alert(err.message || '作废失败') }
    finally { setRevokingId(null) }
  }, [fetchCodes, fetchStats, fetchWallet])

  const handleExport = useCallback(async () => {
    setExporting(true)
    try {
      try { const data = await get<{ csv: string }>('/api/v1/agent/redemption/export'); downloadCsvFromData(data.csv, 'my-redemption-codes.csv') }
      catch { await downloadUrl('/api/v1/redemption/codes/export?status=unused', 'unused-codes.csv') }
    } catch {
      try { const data = await get<{ list: RedemptionCode[] }>('/api/v1/redemption/codes', { status: 'unused', pageSize: 10000 }); const codes_only = (data.list || []).map(c => c.code).join('\n'); const blob = new Blob([codes_only], { type: 'text/plain;charset=utf-8' }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'unused-codes.txt'; link.click(); URL.revokeObjectURL(link.href) }
      catch { /* ignore */ }
    } finally { setExporting(false) }
  }, [])

  const handleBatchAction = useCallback(async (action: 'disable' | 'enable') => {
    const actionLabel = action === 'disable' ? '停用' : '启用'
    if (selectedCodeIds.length === 0 || !confirm(`确认批量 ${actionLabel} 所选 ${selectedCodeIds.length} 个兑换码？`)) return
    setBatchActionRunning(true)
    try { await post('/api/v1/agent/redemption/batch-action', { action, codeIds: selectedCodeIds }); setSelectedCodeIds([]); fetchCodes(); fetchStats(); fetchWallet() }
    catch (err: any) { alert(err.message || `批量${actionLabel}失败`) }
    finally { setBatchActionRunning(false) }
  }, [selectedCodeIds, fetchCodes, fetchStats, fetchWallet])

  const handleCreateTemplate = useCallback(async () => {
    setTemplateError(''); setTemplateSuccess('')
    if (!templateForm.name || !templateForm.tokenAmount) { setTemplateError('请填写模板名称和 Token 数量'); return }
    setTemplateSubmitting(true)
    try {
      await post('/api/v1/agent/redemption/templates', { name: templateForm.name, tokenAmount: templateForm.tokenAmount, validDays: parseInt(templateForm.validDays, 10) || undefined, maxPerUser: parseInt(templateForm.maxPerUser, 10) || 1, userScope: templateForm.userScope, remark: templateForm.remark || undefined })
      setTemplateSuccess(`模板 "${templateForm.name}" 创建成功`); setTemplateForm({ name: '', tokenAmount: '', validDays: '30', maxPerUser: '1', userScope: 'all', remark: '' }); setTemplateFormOpen(false); fetchTemplates()
    } catch (err: any) { setTemplateError(err.message || '创建模板失败') } finally { setTemplateSubmitting(false) }
  }, [templateForm, fetchTemplates])

  const handleQuickCreate = useCallback(async (tmpl: CodeTemplate) => {
    if (!confirm(`使用模板 "${tmpl.name}" 快速创建兑换码批次？`)) return
    setSubmitting(true)
    try { await post('/api/v1/redemption/codes/batch', { name: `[模板] ${tmpl.name}`, amount: tmpl.tokenAmount, count: 1, note: `来自模板 ${tmpl.name}` }); fetchCodes(); fetchStats(); fetchWallet() }
    catch (err: any) { alert(err.message || '创建失败') } finally { setSubmitting(false) }
  }, [fetchCodes, fetchStats, fetchWallet])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3"><Gift size={28} className="text-purple-600" /><h1 className="text-2xl font-bold text-slate-900">兑换码管理</h1></div>
        <button onClick={() => setFormOpen(!formOpen)} className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition text-sm"><Plus size={16} />生成兑换码</button>
      </div>

      <BatchCreateForm open={formOpen} wallet={wallet} walletLoading={walletLoading} onSubmit={handleBatchCreate} onClose={() => setFormOpen(false)} />

      <div className="flex gap-1 bg-slate-100 p-1 rounded-lg w-fit">
        {(['stats', 'codes', 'templates', 'cost-analysis'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 rounded-md text-sm transition ${tab === t ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            {t === 'stats' ? '统计概览' : t === 'codes' ? '兑换码列表' : t === 'templates' ? '模板管理' : '成本分析'}
          </button>
        ))}
      </div>

      {tab === 'stats' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <RedemptionStatsCards loading={statsLoading} stats={stats} />
        </div>
      )}

      {tab === 'codes' && (
        <CodeList
          codes={codes} codesTotal={codesTotal} codesLoading={codesLoading}
          page={page} pageSize={pageSize} totalPages={totalPages}
          selectedCodeIds={selectedCodeIds} batchActionRunning={batchActionRunning}
          exporting={exporting} codesFilter={codesFilter} revokingId={revokingId}
          onPageChange={setPage} onPageSizeChange={setPageSize}
          onFilterChange={setCodesFilter}
          onSelectAllToggle={() => setSelectedCodeIds(prev => prev.length === codes.length ? [] : codes.map(c => c.id))}
          onClearSelection={() => setSelectedCodeIds([])}
          onToggleSelectCode={(id) => setSelectedCodeIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])}
          onBatchAction={handleBatchAction} onExport={handleExport}
          onRevoke={handleRevoke} onOpenGiftModal={(id, code) => { setGiftModalCodeId(id); setGiftModalCodeDisplay(code) }}
        />
      )}

      {tab === 'templates' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2"><FileText size={16} className="text-purple-500" />模板管理</h3>
              <button onClick={() => setTemplateFormOpen(!templateFormOpen)} className="flex items-center gap-1 px-3 py-1.5 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700 transition"><Plus size={14} />新建模板</button>
            </div>
            {templateFormOpen && (
              <div className="border-t border-slate-100 pt-4 space-y-4">
                {templateError && <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm"><AlertCircle size={16} />{templateError}</div>}
                {templateSuccess && <div className="flex items-center gap-2 text-green-700 bg-green-50 p-3 rounded-lg text-sm"><CheckCircle2 size={16} />{templateSuccess}</div>}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">模板名称 *</label>
                    <input type="text" value={templateForm.name} onChange={(e) => setTemplateForm(f => ({ ...f, name: e.target.value }))} placeholder="如：标准折扣码" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Token 数量 *</label>
                    <input type="number" step="0.01" min="0.01" value={templateForm.tokenAmount} onChange={(e) => setTemplateForm(f => ({ ...f, tokenAmount: e.target.value }))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">有效期（天）</label>
                    <input type="number" min="1" value={templateForm.validDays} onChange={(e) => setTemplateForm(f => ({ ...f, validDays: e.target.value }))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">每人限领</label>
                    <input type="number" min="1" value={templateForm.maxPerUser} onChange={(e) => setTemplateForm(f => ({ ...f, maxPerUser: e.target.value }))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">用户范围</label>
                    <select value={templateForm.userScope} onChange={(e) => setTemplateForm(f => ({ ...f, userScope: e.target.value }))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500">
                      <option value="all">全部用户</option><option value="new">新用户</option><option value="vip">VIP用户</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">备注</label>
                    <input type="text" value={templateForm.remark} onChange={(e) => setTemplateForm(f => ({ ...f, remark: e.target.value }))} placeholder="可选" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={handleCreateTemplate} disabled={templateSubmitting} className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 transition text-sm flex items-center gap-2">{templateSubmitting && <Loader2 className="animate-spin" size={16} />}保存模板</button>
                  <button onClick={() => setTemplateFormOpen(false)} className="px-4 py-2 border border-slate-300 text-slate-600 rounded-lg hover:bg-slate-50 transition text-sm">取消</button>
                </div>
              </div>
            )}
          </div>
          {templatesLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="animate-spin" size={24} /></div>
          ) : templates.length === 0 ? (
            <div className="bg-white rounded-xl py-12 text-center text-slate-400 text-sm shadow-sm border border-slate-200"><FileText size={40} className="mx-auto mb-2 opacity-50" />暂无模板，点击"新建模板"创建</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {templates.map(tmpl => (
                <div key={tmpl.id} className="bg-white rounded-xl p-5 shadow-sm border border-slate-200 hover:border-purple-200 transition">
                  <div className="flex items-center gap-2 mb-3"><FileText size={16} className="text-purple-500" /><h4 className="font-semibold text-slate-900">{tmpl.name}</h4></div>
                  <div className="space-y-2 text-sm text-slate-600">
                    <div className="flex justify-between"><span>Token 数量</span><span className="font-medium text-green-600">{tmpl.tokenAmount}</span></div>
                    {tmpl.validDays && <div className="flex justify-between"><span>有效期</span><span>{tmpl.validDays} 天</span></div>}
                    <div className="flex justify-between"><span>每人限领</span><span>{tmpl.maxPerUser}</span></div>
                    {tmpl.remark && <div className="text-xs text-slate-400 mt-1">{tmpl.remark}</div>}
                  </div>
                  <button onClick={() => handleQuickCreate(tmpl)} disabled={submitting} className="mt-4 w-full py-2 bg-purple-600 text-white rounded-lg text-xs hover:bg-purple-700 disabled:opacity-50 transition">快速创建兑换码</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'cost-analysis' && (
        <div className="space-y-6">
          {costLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="animate-spin" size={24} /></div>
          ) : costData ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard icon={BarChart3} label="总批次" value={String(costData.summary.totalBatches)} color="bg-purple-500" />
                <StatCard icon={DollarSign} label="总面值" value={`¥${costData.summary.totalFaceValue.toLocaleString()}`} color="bg-blue-500" />
                <StatCard icon={TrendingUp} label="总成本" value={`¥${costData.summary.totalCost.toLocaleString()}`} sub={`补贴 ¥${costData.summary.totalSubsidy.toLocaleString()}`} color="bg-orange-500" />
                <StatCard icon={TrendingUp} label="使用率" value={`${costData.summary.overallUsageRate}%`} sub={`锁定 ¥${costData.summary.lockedAmount.toLocaleString()}`} color="bg-green-500" />
              </div>
              {costData.batches.length > 0 && (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-x-auto">
                  <table className="w-full">
                    <thead><tr className="bg-slate-50 text-left">
                      <th className="px-4 py-3 text-sm font-medium text-slate-500">批次名称</th>
                      <th className="px-4 py-3 text-sm font-medium text-slate-500 text-right">总数</th>
                      <th className="px-4 py-3 text-sm font-medium text-slate-500 text-right">已用</th>
                      <th className="px-4 py-3 text-sm font-medium text-slate-500 text-right">使用率</th>
                      <th className="px-4 py-3 text-sm font-medium text-slate-500 text-right">面值</th>
                      <th className="px-4 py-3 text-sm font-medium text-slate-500 text-right">成本</th>
                      <th className="px-4 py-3 text-sm font-medium text-slate-500 text-right">补贴</th>
                      <th className="px-4 py-3 text-sm font-medium text-slate-500">状态</th>
                    </tr></thead>
                    <tbody className="divide-y divide-slate-200">
                      {costData.batches.map(b => (
                        <tr key={b.batchId} className="hover:bg-slate-50 transition">
                          <td className="px-4 py-3 text-sm font-medium text-slate-900">{b.batchName}</td>
                          <td className="px-4 py-3 text-sm text-right text-slate-700">{b.totalCount}</td>
                          <td className="px-4 py-3 text-sm text-right text-slate-700">{b.usedCount}</td>
                          <td className="px-4 py-3 text-sm text-right"><span className={`${b.usageRate > 50 ? 'text-green-600' : 'text-orange-600'}`}>{b.usageRate}%</span></td>
                          <td className="px-4 py-3 text-sm text-right text-slate-700">¥{b.faceValue.toLocaleString()}</td>
                          <td className="px-4 py-3 text-sm text-right text-red-600">¥{b.costAmount.toLocaleString()}</td>
                          <td className="px-4 py-3 text-sm text-right text-green-600">¥{b.subsidy.toLocaleString()}</td>
                          <td className="px-4 py-3"><span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${b.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>{b.status === 'active' ? '激活' : '已停用'}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : (
            <div className="bg-white rounded-xl py-12 text-center text-slate-400 text-sm shadow-sm border border-slate-200"><BarChart3 size={40} className="mx-auto mb-2 opacity-50" />暂无成本数据</div>
          )}
        </div>
      )}

      {giftModalCodeId !== null && (
        <DistributionPanel
          codeId={giftModalCodeId}
          codeDisplay={giftModalCodeDisplay}
          onClose={() => setGiftModalCodeId(null)}
          onSuccess={() => { alert('转赠成功！'); setGiftModalCodeId(null); fetchCodes() }}
        />
      )}
    </div>
  )
}

