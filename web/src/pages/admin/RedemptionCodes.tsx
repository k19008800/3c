import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { get, post, del, patch, downloadUrl } from '@/lib/api'
import PaginationBar from '@/components/ui/PaginationBar'
import FeatureDescription from '@/components/admin/FeatureDescription'
import {
  Loader2, Gift, Plus, AlertCircle, CheckCircle2, Download, Trash2,
  Package, Users, DollarSign, Hash, Pencil, ToggleLeft, ToggleRight, Search, X,
  Handshake, Shield, TrendingUp, AlertTriangle, Ban, Info, Check, EyeOff, Send,
  FileSpreadsheet, Calendar,
} from 'lucide-react'

// ── Sub-components ──
import StatsCards from './redemption/StatsCards'
import BatchCreateForm from './redemption/BatchCreateForm'
import AgentOverview from './redemption/AgentOverview'
import AgentCodeDetail from './redemption/AgentCodeDetail'
import CodeList from './redemption/CodeList'
import { GiftModal, BatchEditModal } from './redemption/CodeDetail'
import type {
  RedemptionStats, RedemptionBatch, RedemptionCode, AdminRedemptionLog,
  AuditLogItem, FraudStats, FraudEvent, BannedIp, AgentOverviewItem,
} from './redemption/types'
import {
  codeStatusMap, batchStatusMap, fraudEventTypeMap, fraudSeverityConfig,
  toDatetimeLocal, downloadCsvFromData,
} from './redemption/types'

type TabKey = 'stats' | 'batches' | 'codes' | 'logs' | 'fraud' | 'agentOverview' | 'agentDetail' | 'auditLogs' | 'reports'

export default function AdminRedemptionCodes() {
  const navigate = useNavigate()
  const [tab, setTab] = useState<TabKey>('stats')

  // ── Stats state ──
  const [stats, setStats] = useState<RedemptionStats | null>(null)
  const [statsLoading, setStatsLoading] = useState(true)

  // ── Batches state ──
  const [batches, setBatches] = useState<RedemptionBatch[]>([])
  const [batchesTotal, setBatchesTotal] = useState(0)
  const [batchPage, setBatchPage] = useState(1)
  const [batchPageSize, setBatchPageSize] = useState(20)
  const [batchesLoading, setBatchesLoading] = useState(true)

  // ── Codes state ──
  const [codes, setCodes] = useState<RedemptionCode[]>([])
  const [codesTotal, setCodesTotal] = useState(0)
  const [codePage, setCodePage] = useState(1)
  const [codePageSize, setCodePageSize] = useState(20)
  const [codesLoading, setCodesLoading] = useState(true)
  const [codesFilter, setCodesFilter] = useState<{ batchId?: string; status?: string }>({})
  const [selectedCodeIds, setSelectedCodeIds] = useState<number[]>([])
  const [batchActionRunning, setBatchActionRunning] = useState(false)

  // ── Batch creation state ──
  const [batchFormOpen, setBatchFormOpen] = useState(false)

  // ── Batch actions ──
  const [revokingId, setRevokingId] = useState<number | null>(null)
  const [exporting, setExporting] = useState(false)
  const [togglingBatchId, setTogglingBatchId] = useState<number | null>(null)
  const [exportingBatchId, setExportingBatchId] = useState<number | null>(null)

  // ── Agent state ──
  const [agentOverview, setAgentOverview] = useState<AgentOverviewItem[]>([])
  const [agentOverviewLoading, setAgentOverviewLoading] = useState(false)
  const [agentOverviewError, setAgentOverviewError] = useState('')
  const [selectedAgentId, setSelectedAgentId] = useState<number | null>(null)
  const [selectedAgentName, setSelectedAgentName] = useState('')
  const [agentCodes, setAgentCodes] = useState<any[]>([])
  const [agentCodesTotal, setAgentCodesTotal] = useState(0)
  const [agentCodesPage, setAgentCodesPage] = useState(1)
  const [agentCodesPageSize, setAgentCodesPageSize] = useState(20)
  const [agentCodesLoading, setAgentCodesLoading] = useState(false)
  const [forcingId, setForcingId] = useState<number | null>(null)

  // ── Edit modal state ──
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [editingBatch, setEditingBatch] = useState<RedemptionBatch | null>(null)

  // ── Logs state ──
  const [logs, setLogs] = useState<AdminRedemptionLog[]>([])
  const [logsTotal, setLogsTotal] = useState(0)
  const [logsPage, setLogsPage] = useState(1)
  const [logsPageSize, setLogsPageSize] = useState(20)
  const [logsLoading, setLogsLoading] = useState(false)
  const [logsFilter, setLogsFilter] = useState({ email: '', batchId: '', startDate: '', endDate: '', code: '' })
  const [logsFilterApplied, setLogsFilterApplied] = useState(false)

  // ── Fraud state ──
  const [fraudStats, setFraudStats] = useState<FraudStats | null>(null)
  const [fraudStatsLoading, setFraudStatsLoading] = useState(false)
  const [fraudEvents, setFraudEvents] = useState<FraudEvent[]>([])
  const [fraudEventsTotal, setFraudEventsTotal] = useState(0)
  const [fraudEventsPage, setFraudEventsPage] = useState(1)
  const [fraudEventsPageSize, setFraudEventsPageSize] = useState(20)
  const [fraudEventsLoading, setFraudEventsLoading] = useState(false)
  const [fraudEventsFilter, setFraudEventsFilter] = useState({ eventType: '', severity: '', acknowledged: '', ip: '', startDate: '', endDate: '' })
  const [bannedIps, setBannedIps] = useState<BannedIp[]>([])
  const [bannedIpsLoading, setBannedIpsLoading] = useState(false)
  const [banIpInput, setBanIpInput] = useState('')
  const [banReason, setBanReason] = useState('')
  const [banningIp, setBanningIp] = useState(false)
  const [acknowledgingId, setAcknowledgingId] = useState<number | null>(null)
  const [riskActionRunning, setRiskActionRunning] = useState(false)
  const [selectedFraudEventIds, setSelectedFraudEventIds] = useState<number[]>([])

  // ── Audit log state ──
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([])
  const [auditLogsTotal, setAuditLogsTotal] = useState(0)
  const [auditLogsPage, setAuditLogsPage] = useState(1)
  const [auditLogsPageSize, setAuditLogsPageSize] = useState(20)
  const [auditLogsLoading, setAuditLogsLoading] = useState(false)
  const [auditLogsFilter, setAuditLogsFilter] = useState({ startDate: '', endDate: '' })

  // ── Report state ──
  const [reportPeriod, setReportPeriod] = useState<string>(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const [reportExporting, setReportExporting] = useState<string | null>(null)

  // ── Gift modal state ──
  const [giftModalCodeId, setGiftModalCodeId] = useState<number | null>(null)
  const [giftModalCodeDisplay, setGiftModalCodeDisplay] = useState('')

  // ── Derived pagination ──
  const batchesTotalPages = Math.ceil(batchesTotal / batchPageSize)
  const codesTotalPages = Math.ceil(codesTotal / codePageSize)
  const logsTotalPages = Math.ceil(logsTotal / logsPageSize)
  const fraudEventsTotalPages = Math.ceil(fraudEventsTotal / fraudEventsPageSize)
  const auditLogsTotalPages = Math.ceil(auditLogsTotal / auditLogsPageSize)

  // ── Data fetching ──
  const fetchStats = useCallback(async () => {
    setStatsLoading(true)
    try { setStats(await get<RedemptionStats>('/api/v1/redemption/stats')) }
    catch { /* ignore */ } finally { setStatsLoading(false) }
  }, [])

  const fetchBatches = useCallback(async () => {
    setBatchesLoading(true)
    try {
      const data = await get<{ list: RedemptionBatch[]; total: number }>('/api/v1/redemption/codes', { page: batchPage, pageSize: batchPageSize })
      setBatches(data.list || [])
      setBatchesTotal(data.total)
    } catch { /* ignore */ } finally { setBatchesLoading(false) }
  }, [batchPage, batchPageSize])

  const fetchCodes = useCallback(async () => {
    setCodesLoading(true)
    try {
      const params: any = { page: codePage, pageSize: codePageSize }
      if (codesFilter.batchId) params.batchId = codesFilter.batchId
      if (codesFilter.status) params.status = codesFilter.status
      const data = await get<{ list: RedemptionCode[]; total: number }>('/api/v1/redemption/codes', params)
      setCodes(data.list || [])
      setCodesTotal(data.total)
    } catch { /* ignore */ } finally { setCodesLoading(false) }
  }, [codePage, codePageSize, codesFilter])

  const fetchLogs = useCallback(async () => {
    setLogsLoading(true)
    try {
      const params: any = { page: logsPage, pageSize: logsPageSize }
      if (logsFilterApplied) {
        if (logsFilter.email) params.email = logsFilter.email
        if (logsFilter.batchId) params.batchId = logsFilter.batchId
        if (logsFilter.startDate) params.startDate = logsFilter.startDate
        if (logsFilter.endDate) params.endDate = logsFilter.endDate
        if (logsFilter.code) params.code = logsFilter.code
      }
      const data = await get<{ list: AdminRedemptionLog[]; total: number }>('/api/v1/redemption/admin-logs', params)
      setLogs(data.list || [])
      setLogsTotal(data.total)
    } catch { /* ignore */ } finally { setLogsLoading(false) }
  }, [logsPage, logsPageSize, logsFilterApplied, logsFilter])

  const fetchFraudStats = useCallback(async () => {
    setFraudStatsLoading(true)
    try { setFraudStats(await get<FraudStats>('/api/v1/redemption/fraud/stats')) }
    catch { /* ignore */ } finally { setFraudStatsLoading(false) }
  }, [])

  const fetchFraudEvents = useCallback(async () => {
    setFraudEventsLoading(true)
    try {
      const params: any = { page: fraudEventsPage, pageSize: fraudEventsPageSize }
      if (fraudEventsFilter.eventType) params.eventType = fraudEventsFilter.eventType
      if (fraudEventsFilter.severity) params.severity = fraudEventsFilter.severity
      if (fraudEventsFilter.acknowledged) params.acknowledged = fraudEventsFilter.acknowledged
      if (fraudEventsFilter.ip) params.ip = fraudEventsFilter.ip
      if (fraudEventsFilter.startDate) params.startDate = fraudEventsFilter.startDate
      if (fraudEventsFilter.endDate) params.endDate = fraudEventsFilter.endDate
      const data = await get<{ list: FraudEvent[]; total: number }>('/api/v1/redemption/fraud-events', params)
      setFraudEvents(data.list || [])
      setFraudEventsTotal(data.total)
    } catch { /* ignore */ } finally { setFraudEventsLoading(false) }
  }, [fraudEventsPage, fraudEventsPageSize, fraudEventsFilter])

  const fetchBannedIps = useCallback(async () => {
    setBannedIpsLoading(true)
    try { setBannedIps((await get<{ list: BannedIp[] }>('/api/v1/redemption/fraud/banned-ips')).list || []) }
    catch { /* ignore */ } finally { setBannedIpsLoading(false) }
  }, [])

  const fetchAgentOverview = useCallback(async () => {
    setAgentOverviewLoading(true)
    setAgentOverviewError('')
    try { setAgentOverview((await get<{ list: AgentOverviewItem[] }>('/api/v1/admin/redemption/agent-overview')).list || []) }
    catch (err: any) { setAgentOverviewError(err.message || '获取代理数据失败') }
    finally { setAgentOverviewLoading(false) }
  }, [])

  const fetchAgentCodes = useCallback(async () => {
    if (!selectedAgentId) return
    setAgentCodesLoading(true)
    try {
      const data = await get<{ list: any[]; total: number }>(
        `/api/v1/admin/redemption/agent/${selectedAgentId}/detail`,
        { page: agentCodesPage, pageSize: agentCodesPageSize }
      )
      setAgentCodes(data.list || [])
      setAgentCodesTotal(data.total)
    } catch { /* ignore */ } finally { setAgentCodesLoading(false) }
  }, [selectedAgentId, agentCodesPage, agentCodesPageSize])

  const fetchAuditLogs = useCallback(async () => {
    setAuditLogsLoading(true)
    try {
      const params: any = { page: auditLogsPage, pageSize: auditLogsPageSize }
      if (auditLogsFilter.startDate) params.startDate = auditLogsFilter.startDate
      if (auditLogsFilter.endDate) params.endDate = auditLogsFilter.endDate
      const data = await get<{ list: AuditLogItem[]; total: number }>('/api/v1/admin/redemption/audit-logs', params)
      setAuditLogs(data.list || [])
      setAuditLogsTotal(data.total)
    } catch { /* ignore */ } finally { setAuditLogsLoading(false) }
  }, [auditLogsPage, auditLogsPageSize, auditLogsFilter])

  // ── Effects ──
  useEffect(() => { fetchStats() }, [fetchStats])
  useEffect(() => { fetchBatches() }, [fetchBatches])
  useEffect(() => { fetchCodes() }, [fetchCodes])
  useEffect(() => { if (tab === 'logs') fetchLogs() }, [fetchLogs, tab])
  useEffect(() => { if (tab === 'fraud') { fetchFraudStats(); fetchFraudEvents(); fetchBannedIps() } }, [fetchFraudStats, fetchFraudEvents, fetchBannedIps, tab])
  useEffect(() => { if (tab === 'agentOverview') fetchAgentOverview() }, [fetchAgentOverview, tab])
  useEffect(() => { if (tab === 'agentDetail' && selectedAgentId) fetchAgentCodes() }, [fetchAgentCodes, tab, selectedAgentId])
  useEffect(() => { if (tab === 'auditLogs') fetchAuditLogs() }, [fetchAuditLogs, tab])

  // ── Handlers ──

  const handleToggleBatchStatus = async (batch: RedemptionBatch) => {
    const newStatus = batch.status === 'active' ? 'disabled' : 'active'
    setTogglingBatchId(batch.id)
    try { await patch(`/api/v1/redemption/batches/${batch.id}`, { status: newStatus }); fetchBatches(); fetchStats() }
    catch (err: any) { alert(err.message || '状态切换失败') }
    finally { setTogglingBatchId(null) }
  }

  const handleOpenEditModal = (batch: RedemptionBatch) => {
    setEditingBatch(batch); setEditModalOpen(true)
  }

  const handleRevoke = async (id: number) => {
    setRevokingId(id)
    try { await del(`/api/v1/redemption/codes/${id}`); fetchCodes(); fetchStats() }
    catch (err: any) { alert(err.message || '作废失败') }
    finally { setRevokingId(null) }
  }

  const handleForceRevoke = async (codeId: number) => {
    setForcingId(codeId)
    try { await del(`/api/v1/redemption/codes/${codeId}`); fetchAgentCodes() }
    catch (err: any) { alert(err.message || '作废失败') } finally { setForcingId(null) }
  }

  const handleForceDisable = async (codeId: number) => {
    setForcingId(codeId)
    try { await patch(`/api/v1/redemption/codes/${codeId}`, { status: 'expired' }); fetchAgentCodes() }
    catch (err: any) { alert(err.message || '停用失败') } finally { setForcingId(null) }
  }

  const handleForceExtend = async (codeId: number) => {
    setForcingId(codeId)
    try {
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      await patch(`/api/v1/redemption/codes/${codeId}`, { expiresAt }); fetchAgentCodes()
    } catch (err: any) { alert(err.message || '延期失败') } finally { setForcingId(null) }
  }

  const handleViewAgentDetail = (agent: AgentOverviewItem) => {
    setSelectedAgentId(agent.agentId); setSelectedAgentName(agent.agentName)
    setAgentCodesPage(1); setTab('agentDetail')
  }

  const handleBackToAgentOverview = () => {
    setSelectedAgentId(null); setSelectedAgentName(''); setTab('agentOverview')
  }

  const handleGiftSuccess = () => {
    alert('转赠成功！'); setGiftModalCodeId(null); fetchCodes()
  }

  const handleExport = async () => {
    setExporting(true)
    try { await downloadUrl('/api/v1/redemption/codes/export?status=unused', 'unused-codes.csv') }
    catch {
      try {
        const data = await get<{ list: RedemptionCode[] }>('/api/v1/redemption/codes', { status: 'unused', pageSize: 10000 })
        const codes_only = (data.list || []).map(c => c.code).join('\n')
        const blob = new Blob([codes_only], { type: 'text/plain;charset=utf-8' })
        const link = document.createElement('a')
        link.href = URL.createObjectURL(blob); link.download = 'unused-codes.txt'; link.click()
        URL.revokeObjectURL(link.href)
      } catch { /* ignore */ }
    } finally { setExporting(false) }
  }

  const handleBatchExport = async (batchId: number) => {
    setExportingBatchId(batchId)
    try {
      const data = await get<{ list: RedemptionCode[] }>('/api/v1/redemption/codes', { batchId, pageSize: 10000 })
      const csv = '\uFEFFcode,amount,status,usedAt\n' + (data.list || []).map(c => `${c.code},${c.amount},${c.status},${c.usedAt || ''}`).join('\n')
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob); link.download = `batch-${batchId}-codes.csv`; link.click()
      URL.revokeObjectURL(link.href)
    } catch (err: any) { alert(err.message || '导出失败') } finally { setExportingBatchId(null) }
  }

  const handleBanIp = async () => {
    if (!banIpInput.trim()) return
    if (!confirm(`确认封禁 IP：${banIpInput.trim()}?`)) return
    setBanningIp(true)
    try { await post('/api/v1/redemption/fraud/ban-ip', { ip: banIpInput.trim(), reason: banReason.trim() || undefined }); setBanIpInput(''); setBanReason(''); fetchBannedIps(); fetchFraudStats() }
    catch (err: any) { alert(err.message || '封禁失败') } finally { setBanningIp(false) }
  }

  const handleUnbanIp = async (ip: string) => {
    if (!confirm(`确认解封 IP：${ip}?`)) return
    try { await post('/api/v1/redemption/fraud/unban-ip', { ip }); fetchBannedIps(); fetchFraudStats() }
    catch (err: any) { alert(err.message || '解封失败') }
  }

  const handleAcknowledge = async (id: number) => {
    setAcknowledgingId(id)
    try { await patch(`/api/v1/redemption/fraud-events/${id}/acknowledge`, {}); fetchFraudEvents() }
    catch {
      try { await patch(`/api/v1/redemption/fraud/events/${id}`, { acknowledged: true }); fetchFraudEvents() } catch { /* ignore */ }
    } finally { setAcknowledgingId(null) }
  }

  const handleApplyLogsFilter = () => { setLogsPage(1); setLogsFilterApplied(true) }
  const handleResetLogsFilter = () => { setLogsFilter({ email: '', batchId: '', startDate: '', endDate: '', code: '' }); setLogsPage(1); setLogsFilterApplied(false) }

  const handleToggleSelectCode = (id: number) => setSelectedCodeIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  const handleSelectAllCodes = () => setSelectedCodeIds(prev => prev.length === codes.length ? [] : codes.map(c => c.id))
  const handleClearCodeSelection = () => setSelectedCodeIds([])

  const handleBatchAction = async (action: 'disable' | 'enable' | 'revoke') => {
    if (selectedCodeIds.length === 0) return
    const actionLabel = action === 'disable' ? '停用' : action === 'enable' ? '启用' : '作废'
    if (!confirm(`确认批量 ${actionLabel} 所选的 ${selectedCodeIds.length} 个兑换码?`)) return
    setBatchActionRunning(true)
    try { await post('/api/v1/admin/redemption/batch-action', { action, codeIds: selectedCodeIds, reason: `管理员批量${actionLabel}` }); setSelectedCodeIds([]); fetchCodes(); fetchStats() }
    catch (err: any) { alert(err.message || `批量${actionLabel}失败`) } finally { setBatchActionRunning(false) }
  }

  const handleRiskBatchAction = async (action: 'revoke_codes' | 'ban_ip' | 'acknowledge') => {
    if (selectedFraudEventIds.length === 0) return
    const actionLabel = action === 'revoke_codes' ? '作废关联码' : action === 'ban_ip' ? '封禁关联IP' : '批量确认'
    if (!confirm(`确认执行 "${actionLabel}" 操作，涉及 ${selectedFraudEventIds.length} 个事件？`)) return
    setRiskActionRunning(true)
    try { await post('/api/v1/admin/redemption/risk-action', { action, eventIds: selectedFraudEventIds, reason: `管理员批量${actionLabel}` }); setSelectedFraudEventIds([]); fetchFraudEvents(); fetchFraudStats() }
    catch (err: any) { alert(err.message || `${actionLabel}失败`) } finally { setRiskActionRunning(false) }
  }

  const handleToggleSelectFraudEvent = (id: number) => setSelectedFraudEventIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  const handleSelectAllFraudEvents = () => setSelectedFraudEventIds(prev => prev.length === fraudEvents.length ? [] : fraudEvents.map(e => e.id))

  const handleExportReport = async (type: 'monthly' | 'agent' | 'campaign') => {
    const label = type === 'monthly' ? '月度' : type === 'agent' ? '代理' : '活动'
    setReportExporting(type)
    try { const data = await get<{ csv: string }>(`/api/v1/admin/finance/codes/reports/${type}`, { period: reportPeriod }); downloadCsvFromData(data, `redemption-report-${type}-${reportPeriod}.csv`) }
    catch (err: any) { alert(err.message || `${label}报表导出失败`) } finally { setReportExporting(null) }
  }

  const handleAdminExport = async (format: 'csv' | 'json' = 'csv') => {
    setExporting(true)
    try {
      if (format === 'csv') { downloadCsvFromData(await get<{ csv: string }>('/api/v1/admin/redemption/export', { format: 'csv' }), 'admin-redemption-codes.csv') }
      else {
        const data = await get<any[]>('/api/v1/admin/redemption/export', { format: 'json' })
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' })
        const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'admin-redemption-codes.json'; link.click()
        URL.revokeObjectURL(link.href)
      }
    } catch { handleExport() } finally { setExporting(false) }
  }

  const handleBatchCreated = () => { fetchBatches(); fetchStats() }

  // ── Tab label map ──
  const tabLabels: Record<string, string> = {
    stats: '兑换统计', batches: '批次列表', codes: '兑换码列表', logs: '兑换流水',
    fraud: '风控', auditLogs: '审计日志', reports: '报表导出',
    agentOverview: '代理总览', agentDetail: selectedAgentName ? `代理: ${selectedAgentName}` : '代理钻取',
  }

  // ══════════════════════════════════════════════════════════════
  //  RENDER
  // ══════════════════════════════════════════════════════════════

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Gift size={28} className="text-purple-600" />
          <h1 className="text-2xl font-bold text-slate-900">兑换码管理</h1>
          <FeatureDescription page="admin/redemption-codes" className="ml-2" />
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => handleAdminExport('csv')} disabled={exporting}
            className="flex items-center gap-2 px-3 py-2 border border-slate-300 text-slate-600 rounded-lg hover:bg-slate-50 transition text-sm">
            {exporting ? <Loader2 className="animate-spin" size={16} /> : <Download size={16} />}
            导出CSV
          </button>
          <button onClick={() => setBatchFormOpen(!batchFormOpen)}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition text-sm">
            <Plus size={16} />创建批次
          </button>
        </div>
      </div>

      {/* ── Batch creation form ── */}
      {batchFormOpen && (
        <BatchCreateForm onClose={() => setBatchFormOpen(false)} onSuccess={handleBatchCreated} />
      )}

      {/* ── Tabs ── */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-lg w-fit flex-wrap">
        {(['stats', 'batches', 'codes', 'logs', 'fraud', 'auditLogs', 'reports', 'agentOverview', 'agentDetail'] as const).map(t => {
          if (t === 'agentDetail' && tab !== 'agentDetail') return null
          return (
            <button key={t} onClick={() => { t === 'agentOverview' ? handleBackToAgentOverview() : setTab(t) }}
              className={`px-4 py-2 rounded-md text-sm transition ${tab === t ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              {tabLabels[t]}
            </button>
          )
        })}
      </div>

      {/* ── Tab: Stats ── */}
      {tab === 'stats' && <StatsCards stats={stats} loading={statsLoading} />}

      {/* ── Tab: Batches ── */}
      {tab === 'batches' && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200">
          {batchesLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="animate-spin" size={24} /></div>
          ) : batches.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-sm">暂无批次</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50 text-left">
                    <th className="px-4 py-3 text-sm font-medium text-slate-500">批次名称</th>
                    <th className="px-4 py-3 text-sm font-medium text-slate-500">面额</th>
                    <th className="px-4 py-3 text-sm font-medium text-slate-500">总数/已用</th>
                    <th className="px-4 py-3 text-sm font-medium text-slate-500">使用率</th>
                    <th className="px-4 py-3 text-sm font-medium text-slate-500">状态</th>
                    <th className="px-4 py-3 text-sm font-medium text-slate-500">过期时间</th>
                    <th className="px-4 py-3 text-sm font-medium text-slate-500">创建时间</th>
                    <th className="px-4 py-3 text-sm font-medium text-slate-500">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {batches.map(b => {
                    const usage = b.totalCount > 0 ? ((b.usedCount / b.totalCount) * 100).toFixed(1) : '0'
                    const isActive = b.status === 'active'
                    const isToggling = togglingBatchId === b.id
                    const st = batchStatusMap[b.status] || batchStatusMap.active
                    return (
                      <tr key={b.id} className="hover:bg-slate-50 transition">
                        <td className="px-4 py-3 text-sm font-medium text-slate-900">{b.name}</td>
                        <td className="px-4 py-3 text-sm text-green-600">￥{Number(b.amount).toFixed(2)}</td>
                        <td className="px-4 py-3 text-sm text-slate-600">{b.totalCount} / {b.usedCount}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-20 h-2 bg-slate-200 rounded-full overflow-hidden">
                              <div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.min(100, parseFloat(usage))}%` }} />
                            </div>
                            <span className="text-xs text-slate-500">{usage}%</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${st.color}`}>{st.label}</span>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-500">{b.expiresAt ? new Date(b.expiresAt).toLocaleString('zh-CN') : '永不过期'}</td>
                        <td className="px-4 py-3 text-sm text-slate-500 whitespace-nowrap">{new Date(b.createdAt).toLocaleString('zh-CN')}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <button onClick={() => handleToggleBatchStatus(b)} disabled={isToggling}
                              className={`flex items-center gap-1 text-xs px-2 py-1 rounded transition ${isActive ? 'text-orange-600 hover:bg-orange-50' : 'text-green-600 hover:bg-green-50'}`}>
                              {isToggling ? <Loader2 className="animate-spin" size={14} /> : isActive ? <ToggleLeft size={14} /> : <ToggleRight size={14} />}
                              {isActive ? '停用' : '启用'}
                            </button>
                            <button onClick={() => handleOpenEditModal(b)}
                              className="flex items-center gap-1 text-xs px-2 py-1 rounded text-blue-600 hover:bg-blue-50 transition"><Pencil size={14} />编辑</button>
                            <button onClick={() => handleBatchExport(b.id)} disabled={exportingBatchId === b.id}
                              className="flex items-center gap-1 text-xs px-2 py-1 rounded text-green-600 hover:bg-green-50 transition">
                              {exportingBatchId === b.id ? <Loader2 className="animate-spin" size={14} /> : <Download size={14} />}
                              导出CSV
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          {batchesTotalPages > 0 && (
            <PaginationBar page={batchPage} onPageChange={setBatchPage} pageSize={batchPageSize} onPageSizeChange={setBatchPageSize} total={batchesTotal} totalPages={batchesTotalPages} />
          )}
        </div>
      )}

      {/* ── Tab: Codes ── */}
      {tab === 'codes' && (
        <CodeList
          codes={codes} total={codesTotal} page={codePage} pageSize={codePageSize}
          loading={codesLoading} selectedCodeIds={selectedCodeIds}
          revokingId={revokingId} exporting={exporting} batchActionRunning={batchActionRunning}
          statusFilter={codesFilter.status}
          onPageChange={setCodePage} onPageSizeChange={setCodePageSize}
          onStatusFilterChange={(s) => setCodesFilter(f => ({ ...f, status: s }))}
          onRevoke={handleRevoke} onExport={handleExport}
          onToggleSelect={handleToggleSelectCode} onSelectAll={handleSelectAllCodes}
          onClearSelection={handleClearCodeSelection}
          onBatchAction={handleBatchAction}
          onGiftOpen={(id, display) => { setGiftModalCodeId(id); setGiftModalCodeDisplay(display) }}
        />
      )}

      {/* ── Tab: Logs ── */}
      {tab === 'logs' && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 space-y-4">
          <div className="p-4 border-b border-slate-100">
            <div className="flex flex-wrap items-end gap-3">
              {([
                { key: 'email', label: '邮箱', placeholder: '搜索用户邮箱', w: 'w-44' },
                { key: 'batchId', label: '批次ID', placeholder: '批次ID', w: 'w-28' },
              ] as const).map(({ key, label, placeholder, w }) => (
                <div key={key}>
                  <label className="block text-xs text-slate-500 mb-1">{label}</label>
                  <input type={key === 'batchId' ? 'number' : 'text'} value={(logsFilter as any)[key]}
                    onChange={(e) => setLogsFilter(f => ({ ...f, [key]: e.target.value }))}
                    placeholder={placeholder}
                    className={`px-3 py-1.5 border border-slate-300 rounded-lg text-sm ${w} focus:outline-none focus:ring-2 focus:ring-purple-500`} />
                </div>
              ))}
              <div>
                <label className="block text-xs text-slate-500 mb-1">起始日期</label>
                <input type="datetime-local" value={logsFilter.startDate}
                  onChange={(e) => setLogsFilter(f => ({ ...f, startDate: e.target.value }))}
                  className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">结束日期</label>
                <input type="datetime-local" value={logsFilter.endDate}
                  onChange={(e) => setLogsFilter(f => ({ ...f, endDate: e.target.value }))}
                  className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">兑换码</label>
                <input type="text" value={logsFilter.code}
                  onChange={(e) => setLogsFilter(f => ({ ...f, code: e.target.value }))}
                  placeholder="兑换码（模糊搜索）"
                  className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm w-40 focus:outline-none focus:ring-2 focus:ring-purple-500" />
              </div>
              <div className="flex gap-2">
                <button onClick={handleApplyLogsFilter}
                  className="flex items-center gap-1 px-3 py-1.5 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700 transition">
                  <Search size={14} />筛选</button>
                <button onClick={handleResetLogsFilter}
                  className="flex items-center gap-1 px-3 py-1.5 border border-slate-300 text-slate-600 rounded-lg text-sm hover:bg-slate-50 transition">
                  <X size={14} />重置</button>
              </div>
            </div>
          </div>
          {logsLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="animate-spin" size={24} /></div>
          ) : logs.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-sm">暂无兑换流水</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50 text-left">
                    <th className="px-4 py-3 text-sm font-medium text-slate-500">兑换码</th>
                    <th className="px-4 py-3 text-sm font-medium text-slate-500">面额</th>
                    <th className="px-4 py-3 text-sm font-medium text-slate-500">用户ID</th>
                    <th className="px-4 py-3 text-sm font-medium text-slate-500">邮箱</th>
                    <th className="px-4 py-3 text-sm font-medium text-slate-500">昵称</th>
                    <th className="px-4 py-3 text-sm font-medium text-slate-500">IP</th>
                    <th className="px-4 py-3 text-sm font-medium text-slate-500">批次</th>
                    <th className="px-4 py-3 text-sm font-medium text-slate-500">时间</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {logs.map(log => (
                    <tr key={log.id} className="hover:bg-slate-50 transition">
                      <td className="px-4 py-3 text-sm font-mono text-slate-700">{log.code}</td>
                      <td className="px-4 py-3 text-sm text-green-600">￥{Number(log.amount).toFixed(2)}</td>
                      <td className="px-4 py-3 text-sm text-slate-600">{log.userId}</td>
                      <td className="px-4 py-3 text-sm text-slate-600">{log.email || '-'}</td>
                      <td className="px-4 py-3 text-sm text-slate-600">{log.nickname || '-'}</td>
                      <td className="px-4 py-3 text-sm text-slate-500">{log.ip || '-'}</td>
                      <td className="px-4 py-3 text-sm text-slate-600">{log.batchName || String(log.batchId)}</td>
                      <td className="px-4 py-3 text-sm text-slate-500 whitespace-nowrap">{new Date(log.createdAt).toLocaleString('zh-CN')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {logsTotalPages > 0 && (
            <PaginationBar page={logsPage} onPageChange={setLogsPage} pageSize={logsPageSize} onPageSizeChange={setLogsPageSize} total={logsTotal} totalPages={logsTotalPages} />
          )}
        </div>
      )}

      {/* ── Tab: Fraud ── */}
      {tab === 'fraud' && (
        <div className="space-y-6">
          {/* Fraud overview */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2"><Shield size={16} className="text-red-500" />风控概览</h3>
            {fraudStatsLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="animate-spin" size={24} /></div>
            ) : fraudStats ? (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <StatCard icon={AlertTriangle} label="今日事件" value={String(fraudStats.todayEvents)} color="bg-amber-500" />
                  <StatCard icon={AlertCircle} label="未处理" value={String(fraudStats.unacknowledged)} color="bg-red-500" />
                  <StatCard icon={Shield} label="高危事件" value={String(fraudStats.bySeverity.critical)} color="bg-red-600" />
                  <StatCard icon={Ban} label="封禁 IP" value={String(fraudStats.bannedIpCount)} color="bg-slate-500" />
                </div>
                {Object.keys(fraudStats.byType).length > 0 && (
                  <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
                    <h4 className="text-xs font-medium text-slate-500 mb-3">事件类型分布</h4>
                    <div className="space-y-2">
                      {Object.entries(fraudStats.byType).map(([type, count]) => {
                        const maxCount = Math.max(...Object.values(fraudStats.byType), 1)
                        return (
                          <div key={type} className="flex items-center gap-3">
                            <span className="text-xs text-slate-600 w-28 shrink-0">{fraudEventTypeMap[type] || type}</span>
                            <div className="flex-1 h-5 bg-slate-100 rounded-full overflow-hidden">
                              <div className="h-full bg-red-400 rounded-full transition-all" style={{ width: `${(count / maxCount) * 100}%` }} />
                            </div>
                            <span className="text-xs text-slate-500 w-8 text-right">{count}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </>
            ) : null}
          </div>

          {/* Fraud events */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 space-y-4">
            <div className="px-4 pt-4"><h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2"><Info size={16} className="text-blue-500" />风控事件列表</h3></div>
            <div className="px-4 border-b border-slate-100 pb-4">
              <div className="flex flex-wrap items-end gap-3">
                {([
                  { key: 'eventType', label: '类型', type: 'select', options: [{ v: '', l: '全部' }, { v: 'brute_force', l: '爆破检测' }, { v: 'ip_anomaly', l: 'IP异常' }, { v: 'user_frequency', l: '高频兑换' }, { v: 'high_risk_score', l: '高风险评分' }, { v: 'manual_ban', l: '手动封禁' }] },
                  { key: 'severity', label: '严重级别', type: 'select', options: [{ v: '', l: '全部' }, { v: 'warning', l: '警告' }, { v: 'high', l: '高危' }, { v: 'critical', l: '严重' }] },
                  { key: 'acknowledged', label: '处理状态', type: 'select', options: [{ v: '', l: '全部' }, { v: 'false', l: '未处理' }, { v: 'true', l: '已处理' }] },
                ] as const).map(({ key, label, options }) => (
                  <div key={key}>
                    <label className="block text-xs text-slate-500 mb-1">{label}</label>
                    <select value={(fraudEventsFilter as any)[key]} onChange={(e) => setFraudEventsFilter(f => ({ ...f, [key]: e.target.value }))}
                      className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500">
                      {options.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                    </select>
                  </div>
                ))}
                <div>
                  <label className="block text-xs text-slate-500 mb-1">IP 搜索</label>
                  <input type="text" value={fraudEventsFilter.ip} onChange={(e) => setFraudEventsFilter(f => ({ ...f, ip: e.target.value }))}
                    placeholder="搜索 IP" className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm w-36 focus:outline-none focus:ring-2 focus:ring-red-500" />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">起始日期</label>
                  <input type="datetime-local" value={fraudEventsFilter.startDate} onChange={(e) => setFraudEventsFilter(f => ({ ...f, startDate: e.target.value }))}
                    className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500" />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">结束日期</label>
                  <input type="datetime-local" value={fraudEventsFilter.endDate} onChange={(e) => setFraudEventsFilter(f => ({ ...f, endDate: e.target.value }))}
                    className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500" />
                </div>
                <div className="flex gap-2">
                  <button onClick={() => { setFraudEventsPage(1); fetchFraudEvents() }}
                    className="flex items-center gap-1 px-3 py-1.5 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 transition"><Search size={14} />筛选</button>
                  <button onClick={() => { setFraudEventsFilter({ eventType: '', severity: '', acknowledged: '', ip: '', startDate: '', endDate: '' }); setFraudEventsPage(1) }}
                    className="flex items-center gap-1 px-3 py-1.5 border border-slate-300 text-slate-600 rounded-lg text-sm hover:bg-slate-50 transition"><X size={14} />重置</button>
                </div>
              </div>
            </div>

            {selectedFraudEventIds.length > 0 && (
              <div className="px-4 pb-2 flex items-center gap-3 bg-red-50 border-b border-red-100">
                <span className="text-sm text-red-700">已选 {selectedFraudEventIds.length} 个事件</span>
                <button onClick={() => handleRiskBatchAction('revoke_codes')} disabled={riskActionRunning}
                  className="flex items-center gap-1 px-3 py-1.5 bg-red-500 text-white rounded-lg text-xs hover:bg-red-600 disabled:opacity-50 transition">
                  {riskActionRunning ? <Loader2 className="animate-spin" size={12} /> : <Trash2 size={12} />}批量作废关联码</button>
                <button onClick={() => handleRiskBatchAction('ban_ip')} disabled={riskActionRunning}
                  className="flex items-center gap-1 px-3 py-1.5 bg-orange-500 text-white rounded-lg text-xs hover:bg-orange-600 disabled:opacity-50 transition">
                  {riskActionRunning ? <Loader2 className="animate-spin" size={12} /> : <Ban size={12} />}批量封禁IP</button>
                <button onClick={() => handleRiskBatchAction('acknowledge')} disabled={riskActionRunning}
                  className="flex items-center gap-1 px-3 py-1.5 bg-green-500 text-white rounded-lg text-xs hover:bg-green-600 disabled:opacity-50 transition">
                  {riskActionRunning ? <Loader2 className="animate-spin" size={12} /> : <Check size={12} />}批量确认</button>
                <button onClick={() => setSelectedFraudEventIds([])}
                  className="flex items-center gap-1 px-3 py-1.5 text-slate-500 hover:text-slate-700 text-xs transition"><X size={12} />取消</button>
              </div>
            )}

            {fraudEventsLoading ? (
              <div className="flex justify-center py-12"><Loader2 className="animate-spin" size={24} /></div>
            ) : fraudEvents.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-sm">暂无风控事件</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-slate-50 text-left">
                      <th className="px-4 py-3 text-sm font-medium text-slate-500 w-10">
                        <input type="checkbox" checked={selectedFraudEventIds.length === fraudEvents.length && fraudEvents.length > 0}
                          onChange={handleSelectAllFraudEvents} className="rounded border-slate-300" />
                      </th>
                      <th className="px-4 py-3 text-sm font-medium text-slate-500">时间</th>
                      <th className="px-4 py-3 text-sm font-medium text-slate-500">类型</th>
                      <th className="px-4 py-3 text-sm font-medium text-slate-500">IP</th>
                      <th className="px-4 py-3 text-sm font-medium text-slate-500">用户ID</th>
                      <th className="px-4 py-3 text-sm font-medium text-slate-500">兑换码</th>
                      <th className="px-4 py-3 text-sm font-medium text-slate-500">风险分</th>
                      <th className="px-4 py-3 text-sm font-medium text-slate-500">严重级别</th>
                      <th className="px-4 py-3 text-sm font-medium text-slate-500">详情</th>
                      <th className="px-4 py-3 text-sm font-medium text-slate-500">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {fraudEvents.map(ev => {
                      const sevCfg = fraudSeverityConfig[ev.severity] || { label: ev.severity, color: 'bg-slate-100 text-slate-700' }
                      const riskPct = Math.min(100, (ev.riskScore / 100) * 100)
                      const riskColor = ev.riskScore >= 80 ? 'bg-red-500' : ev.riskScore >= 50 ? 'bg-orange-500' : 'bg-amber-400'
                      const isSelected = selectedFraudEventIds.includes(ev.id)
                      return (
                        <tr key={ev.id} className={`hover:bg-slate-50 transition ${isSelected ? 'bg-red-50' : ''}`}>
                          <td className="px-4 py-3"><input type="checkbox" checked={isSelected} onChange={() => handleToggleSelectFraudEvent(ev.id)} className="rounded border-slate-300" /></td>
                          <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{new Date(ev.createdAt).toLocaleString('zh-CN')}</td>
                          <td className="px-4 py-3 text-sm text-slate-700">{fraudEventTypeMap[ev.eventType] || ev.eventType}</td>
                          <td className="px-4 py-3 text-sm font-mono text-slate-600">{ev.ip || '-'}</td>
                          <td className="px-4 py-3 text-sm text-slate-600">{ev.userId ?? '-'}</td>
                          <td className="px-4 py-3 text-sm font-mono text-slate-600 max-w-[100px] truncate" title={ev.code || ''}>{ev.code ? ev.code.substring(0, 16) + (ev.code.length > 16 ? '…' : '') : '-'}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2 min-w-[80px]">
                              <div className="w-16 h-2 bg-slate-200 rounded-full overflow-hidden">
                                <div className={`h-full rounded-full ${riskColor}`} style={{ width: `${riskPct}%` }} />
                              </div>
                              <span className="text-xs text-slate-500">{ev.riskScore}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3"><span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${sevCfg.color}`}>{sevCfg.label}</span></td>
                          <td className="px-4 py-3">
                            {ev.detail ? (
                              <span className="text-xs text-blue-600 cursor-help underline decoration-dotted" title={ev.detail}>
                                {ev.detail.length > 20 ? ev.detail.substring(0, 20) + '…' : ev.detail}
                              </span>
                            ) : <span className="text-xs text-slate-400">-</span>}
                          </td>
                          <td className="px-4 py-3">
                            {ev.acknowledged ? (
                              <span className="inline-flex items-center gap-1 text-xs text-green-600"><Check size={14} />已处理</span>
                            ) : (
                              <button onClick={() => handleAcknowledge(ev.id)} disabled={acknowledgingId === ev.id}
                                className="flex items-center gap-1 text-xs px-2.5 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition">
                                {acknowledgingId === ev.id ? <Loader2 className="animate-spin" size={14} /> : <Check size={14} />}确认
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {fraudEventsTotalPages > 0 && (
              <PaginationBar page={fraudEventsPage} onPageChange={setFraudEventsPage} pageSize={fraudEventsPageSize} onPageSizeChange={setFraudEventsPageSize} total={fraudEventsTotal} totalPages={fraudEventsTotalPages} />
            )}
          </div>

          {/* IP bans */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 space-y-4">
            <div className="px-4 pt-4"><h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2"><Ban size={16} className="text-slate-600" />IP 封禁管理</h3></div>
            <div className="px-4 border-b border-slate-100 pb-4">
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">IP 地址</label>
                  <input type="text" value={banIpInput} onChange={(e) => setBanIpInput(e.target.value)}
                    placeholder="例如：192.168.1.1" className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm w-44 focus:outline-none focus:ring-2 focus:ring-red-500" />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">封禁原因（可选）</label>
                  <input type="text" value={banReason} onChange={(e) => setBanReason(e.target.value)}
                    placeholder="封禁原因" className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm w-52 focus:outline-none focus:ring-2 focus:ring-red-500" />
                </div>
                <div className="flex gap-2">
                  <button onClick={handleBanIp} disabled={banningIp || !banIpInput.trim()}
                    className="flex items-center gap-1 px-3 py-1.5 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 disabled:opacity-50 transition">
                    {banningIp ? <Loader2 className="animate-spin" size={14} /> : <Ban size={14} />}封禁 IP</button>
                </div>
              </div>
            </div>
            {bannedIpsLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="animate-spin" size={24} /></div>
            ) : bannedIps.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-sm">暂无被封禁 IP</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-slate-50 text-left">
                      <th className="px-4 py-3 text-sm font-medium text-slate-500">IP</th>
                      <th className="px-4 py-3 text-sm font-medium text-slate-500">原因</th>
                      <th className="px-4 py-3 text-sm font-medium text-slate-500">封禁时间</th>
                      <th className="px-4 py-3 text-sm font-medium text-slate-500">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {bannedIps.map(bip => (
                      <tr key={bip.id} className="hover:bg-slate-50 transition">
                        <td className="px-4 py-3 text-sm font-mono text-slate-700">{bip.ip}</td>
                        <td className="px-4 py-3 text-sm text-slate-600">{bip.reason || '-'}</td>
                        <td className="px-4 py-3 text-sm text-slate-500 whitespace-nowrap">{new Date(bip.createdAt).toLocaleString('zh-CN')}</td>
                        <td className="px-4 py-3">
                          <button onClick={() => handleUnbanIp(bip.ip)}
                            className="flex items-center gap-1 text-xs px-2.5 py-1 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"><Check size={14} />解封</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Tab: Audit Logs ── */}
      {tab === 'auditLogs' && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 space-y-4">
          <div className="p-4 border-b border-slate-100">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1">起始日期</label>
                <input type="datetime-local" value={auditLogsFilter.startDate}
                  onChange={(e) => setAuditLogsFilter(f => ({ ...f, startDate: e.target.value }))}
                  className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">结束日期</label>
                <input type="datetime-local" value={auditLogsFilter.endDate}
                  onChange={(e) => setAuditLogsFilter(f => ({ ...f, endDate: e.target.value }))}
                  className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
              </div>
              <div className="flex gap-2">
                <button onClick={() => { setAuditLogsPage(1); fetchAuditLogs() }}
                  className="flex items-center gap-1 px-3 py-1.5 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700 transition"><Search size={14} />筛选</button>
                <button onClick={() => { setAuditLogsFilter({ startDate: '', endDate: '' }); setAuditLogsPage(1) }}
                  className="flex items-center gap-1 px-3 py-1.5 border border-slate-300 text-slate-600 rounded-lg text-sm hover:bg-slate-50 transition"><X size={14} />重置</button>
              </div>
            </div>
          </div>
          {auditLogsLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="animate-spin" size={24} /></div>
          ) : auditLogs.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-sm">暂无审计日志</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50 text-left">
                    <th className="px-4 py-3 text-sm font-medium text-slate-500">时间</th>
                    <th className="px-4 py-3 text-sm font-medium text-slate-500">操作人</th>
                    <th className="px-4 py-3 text-sm font-medium text-slate-500">操作类型</th>
                    <th className="px-4 py-3 text-sm font-medium text-slate-500">目标类型</th>
                    <th className="px-4 py-3 text-sm font-medium text-slate-500">详情</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {auditLogs.map(log => (
                    <tr key={log.id} className="hover:bg-slate-50 transition">
                      <td className="px-4 py-3 text-sm text-slate-500 whitespace-nowrap">{new Date(log.createdAt).toLocaleString('zh-CN')}</td>
                      <td className="px-4 py-3 text-sm text-slate-700">{log.operator}</td>
                      <td className="px-4 py-3 text-sm text-slate-600">{log.action}</td>
                      <td className="px-4 py-3 text-sm text-slate-600">{log.targetType}</td>
                      <td className="px-4 py-3 text-sm text-slate-500 max-w-[300px] truncate" title={log.detail}>{log.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {auditLogsTotalPages > 0 && (
            <PaginationBar page={auditLogsPage} onPageChange={setAuditLogsPage} pageSize={auditLogsPageSize} onPageSizeChange={setAuditLogsPageSize} total={auditLogsTotal} totalPages={auditLogsTotalPages} />
          )}
        </div>
      )}

      {/* ── Tab: Reports ── */}
      {tab === 'reports' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200 space-y-6">
            <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
              <FileSpreadsheet size={16} className="text-green-500" />报表导出
            </h3>
            <div className="flex items-center gap-4">
              <div>
                <label className="block text-xs text-slate-500 mb-1">报表月份</label>
                <input type="month" value={reportPeriod} onChange={(e) => setReportPeriod(e.target.value)}
                  className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {([
                { type: 'monthly' as const, icon: Calendar, label: '月度成本报表', desc: '按费用类型汇总的月度成本数据', cls: 'border-green-200 hover:bg-green-50', icls: 'text-green-500' },
                { type: 'agent' as const, icon: Users, label: '代理成本报表', desc: '按代理维度的成本汇总报表', cls: 'border-blue-200 hover:bg-blue-50', icls: 'text-blue-500' },
                { type: 'campaign' as const, icon: TrendingUp, label: '活动维度报表', desc: '按营销活动的成本和效果数据', cls: 'border-purple-200 hover:bg-purple-50', icls: 'text-purple-500' },
              ]).map(({ type, icon: Icon, label, desc, cls, icls }) => (
                <button key={type} onClick={() => handleExportReport(type)} disabled={reportExporting === type}
                  className={`flex flex-col items-center gap-3 p-6 border rounded-xl transition disabled:opacity-50 ${cls}`}>
                  {reportExporting === type ? <Loader2 className={`animate-spin ${icls}`} size={32} /> : <Icon size={32} className={icls} />}
                  <div className="text-center">
                    <p className="text-sm font-medium text-slate-900">{label}</p>
                    <p className="text-xs text-slate-400 mt-1">{desc}</p>
                  </div>
                  <span className={`text-xs flex items-center gap-1 ${icls}`}><Download size={12} />下载 CSV</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Tab: Agent Overview ── */}
      {tab === 'agentOverview' && (
        <AgentOverview
          agents={agentOverview}
          loading={agentOverviewLoading}
          error={agentOverviewError}
          onViewDetail={handleViewAgentDetail}
        />
      )}

      {/* ── Tab: Agent Detail ── */}
      {tab === 'agentDetail' && selectedAgentId && (
        <AgentCodeDetail
          agentName={selectedAgentName}
          codes={agentCodes}
          total={agentCodesTotal}
          page={agentCodesPage}
          pageSize={agentCodesPageSize}
          loading={agentCodesLoading}
          forcingId={forcingId}
          onPageChange={setAgentCodesPage}
          onPageSizeChange={setAgentCodesPageSize}
          onBack={handleBackToAgentOverview}
          onRevoke={handleForceRevoke}
          onDisable={handleForceDisable}
          onExtend={handleForceExtend}
        />
      )}

      {/* ── Batch Edit Modal ── */}
      {editModalOpen && editingBatch && (
        <BatchEditModal
          batch={editingBatch}
          onClose={() => { setEditModalOpen(false); setEditingBatch(null) }}
          onUpdated={() => { fetchBatches(); fetchStats() }}
        />
      )}

      {/* ── Gift Modal ── */}
      {giftModalCodeId !== null && (
        <GiftModal
          codeId={giftModalCodeId}
          codeDisplay={giftModalCodeDisplay}
          onClose={() => setGiftModalCodeId(null)}
          onSuccess={handleGiftSuccess}
        />
      )}
    </div>
  )
}

// ── StatCard (used locally for fraud stats) ──

function StatCard({ icon: Icon, label, value, sub, color }: { icon: any; label: string; value: string; sub?: string; color: string }) {
  return (
    <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-slate-500">{label}</p>
          <p className="text-2xl font-bold mt-1">{value}</p>
          {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
        </div>
        <div className={`p-3 rounded-lg ${color}`}><Icon size={24} className="text-white" /></div>
      </div>
    </div>
  )
}
