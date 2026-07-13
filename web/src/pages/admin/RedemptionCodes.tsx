import { useEffect, useState, useCallback } from 'react'

import { useNavigate } from 'react-router-dom'

import { get, post, del, patch, downloadUrl } from '@/lib/api'

import PaginationBar from '@/components/ui/PaginationBar'

import FeatureDescription from '@/components/admin/FeatureDescription'

import {

  Loader2, Gift, Plus, AlertCircle, CheckCircle2, Download, Trash2,

  Package, Users, DollarSign, Hash, Pencil, ToggleLeft, ToggleRight, Search, X,

  Handshake, Shield, TrendingUp, AlertTriangle, Ban, Info, RefreshCw, Check, Eye, EyeOff, Send,

  FileSpreadsheet, Calendar, BarChart3,

} from 'lucide-react'



// ── Types ──



interface AgentOverviewItem {

  agentId: number

  agentName: string

  issuedCount: number

  usedCount: number

  frozenTokens: string

  usageRate: number

  riskLevel: 'low' | 'medium' | 'high'

}



interface AgentCodeDetailItem {

  id: number

  code: string

  amount: string

  status: string

  usesLeft: number

  usedAt: string | null

  createdAt: string

  batchId: number

  batchName: string | null

}



interface RedemptionCode {

  id: number

  code: string

  amount: string

  status: string

  usesLeft: number

  usedAt: string | null

  createdAt: string

  batchId: number

  batchName: string | null

}



interface RedemptionBatch {

  id: number

  name: string

  amount: string

  totalCount: number

  usedCount: number

  maxUses: number

  status: string

  createdAt: string

  expiresAt: string | null

  note: string | null

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



interface AdminRedemptionLog {

  id: number

  code: string

  amount: string

  userId: number

  email: string | null

  nickname: string | null

  ip: string | null

  batchId: number

  batchName: string | null

  createdAt: string

}



// ── Audit log types ──



interface AuditLogItem {

  id: number

  operatorId: number

  operator: string

  action: string

  targetType: string

  targetId: number | null

  detail: string

  createdAt: string

}



// ── Report types ──



interface ReportData {

  csv: string

}



// ── Fraud types ──



interface FraudStats {

  todayEvents: number

  unacknowledged: number

  bySeverity: { critical: number; high: number; warning: number }

  byType: Record<string, number>

  bannedIpCount: number

}



interface FraudEvent {

  id: number

  eventType: string

  ip: string | null

  userId: number | null

  code: string | null

  riskScore: number

  severity: string

  detail: string | null

  acknowledged: boolean

  createdAt: string

}



interface BannedIp {

  id: number

  ip: string

  reason: string | null

  createdAt: string

}



const fraudEventTypeMap: Record<string, string> = {

  brute_force: '爆破检测',

  ip_anomaly: 'IP异常',

  user_frequency: '高频兑换',

  code_leak: '码泄露',

  high_risk_score: '高风险评分',

  manual_ban: '手动封禁',

}



const fraudSeverityConfig: Record<string, { label: string; color: string }> = {

  warning: { label: '警告', color: 'bg-amber-100 text-amber-700' },

  high: { label: '高危', color: 'bg-orange-100 text-orange-700' },

  critical: { label: '严重', color: 'bg-red-100 text-red-700' },

}



// ── Status helpers ──



const codeStatusMap: Record<string, { label: string; color: string }> = {

  unused: { label: '未使用', color: 'bg-blue-100 text-blue-700' },

  used: { label: '已使用', color: 'bg-green-100 text-green-700' },

  expired: { label: '已过期', color: 'bg-slate-100 text-slate-500' },

  revoked: { label: '已作废', color: 'bg-red-100 text-red-700' },

  disabled: { label: '已停用', color: 'bg-orange-100 text-orange-700' },

}



const batchStatusMap: Record<string, { label: string; color: string }> = {

  active: { label: '激活', color: 'bg-green-100 text-green-700' },

  expired: { label: '已过期', color: 'bg-slate-100 text-slate-500' },

  disabled: { label: '已禁用', color: 'bg-red-100 text-red-700' },

}



// ── Helper: format datetime-local value from ISO string ──



function toDatetimeLocal(iso: string | null): string {

  if (!iso) return ''

  const d = new Date(iso)

  const pad = (n: number) => String(n).padStart(2, '0')

  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`

}



// ── Helper: download CSV from data object ──



function downloadCsvFromData(data: { csv: string }, filename: string) {

  const bom = '\uFEFF'

  const blob = new Blob([bom + data.csv], { type: 'text/csv;charset=utf-8;' })

  const link = document.createElement('a')

  link.href = URL.createObjectURL(blob)

  link.download = filename

  link.click()

  URL.revokeObjectURL(link.href)

}



// ── Main Component ──



const riskLevelConfig: Record<string, { label: string; color: string; icon: any }> = {

  low: { label: '低风险', color: 'bg-green-100 text-green-700', icon: Shield },

  medium: { label: '中风险', color: 'bg-amber-100 text-amber-700', icon: AlertTriangle },

  high: { label: '高风险', color: 'bg-red-100 text-red-700', icon: AlertTriangle },

}



export default function AdminRedemptionCodes() {

  const navigate = useNavigate()

  const [tab, setTab] = useState<'stats' | 'batches' | 'codes' | 'logs' | 'fraud' | 'agentOverview' | 'agentDetail' | 'auditLogs' | 'reports'>('stats')



  const [stats, setStats] = useState<RedemptionStats | null>(null)

  const [statsLoading, setStatsLoading] = useState(true)



  const [batches, setBatches] = useState<RedemptionBatch[]>([])

  const [batchesTotal, setBatchesTotal] = useState(0)

  const [batchPage, setBatchPage] = useState(1)

  const [batchPageSize, setBatchPageSize] = useState(20)

  const [batchesLoading, setBatchesLoading] = useState(true)



  const [codes, setCodes] = useState<RedemptionCode[]>([])

  const [codesTotal, setCodesTotal] = useState(0)

  const [codePage, setCodePage] = useState(1)

  const [codePageSize, setCodePageSize] = useState(20)

  const [codesLoading, setCodesLoading] = useState(true)

  const [codesFilter, setCodesFilter] = useState<{ batchId?: string; status?: string }>({})



  // ── Batch selection state ──

  const [selectedCodeIds, setSelectedCodeIds] = useState<number[]>([])

  const [batchActionRunning, setBatchActionRunning] = useState(false)



  const [batchFormOpen, setBatchFormOpen] = useState(false)

  const [batchForm, setBatchForm] = useState({ name: '', amount: '', count: '100', expiresAt: '', maxUses: '1', note: '' })

  const [batchSubmitting, setBatchSubmitting] = useState(false)

  const [batchError, setBatchError] = useState('')

  const [batchSuccess, setBatchSuccess] = useState('')



  const [revokingId, setRevokingId] = useState<number | null>(null)

  const [exporting, setExporting] = useState(false)



  // ── Agent overview state ──



  const [agentOverview, setAgentOverview] = useState<AgentOverviewItem[]>([])

  const [agentOverviewLoading, setAgentOverviewLoading] = useState(false)

  const [agentOverviewError, setAgentOverviewError] = useState('')

  const [selectedAgentId, setSelectedAgentId] = useState<number | null>(null)

  const [selectedAgentName, setSelectedAgentName] = useState('')

  const [agentCodes, setAgentCodes] = useState<AgentCodeDetailItem[]>([])

  const [agentCodesTotal, setAgentCodesTotal] = useState(0)

  const [agentCodesPage, setAgentCodesPage] = useState(1)

  const [agentCodesPageSize, setAgentCodesPageSize] = useState(20)

  const [agentCodesLoading, setAgentCodesLoading] = useState(false)

  const [forcingId, setForcingId] = useState<number | null>(null)



  // ── Batch edit modal state ──



  const [editModalOpen, setEditModalOpen] = useState(false)

  const [editingBatch, setEditingBatch] = useState<RedemptionBatch | null>(null)

  const [editForm, setEditForm] = useState({ name: '', expiresAt: '', note: '', maxUses: '1' })

  const [editSubmitting, setEditSubmitting] = useState(false)

  const [editError, setEditError] = useState('')



  // ── Batch status toggling state ──



  const [togglingBatchId, setTogglingBatchId] = useState<number | null>(null)



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

  const [fraudEventsFilter, setFraudEventsFilter] = useState({

    eventType: '',

    severity: '',

    acknowledged: '',

    ip: '',

    startDate: '',

    endDate: '',

  })

  const [bannedIps, setBannedIps] = useState<BannedIp[]>([])

  const [bannedIpsLoading, setBannedIpsLoading] = useState(false)

  const [banIpInput, setBanIpInput] = useState('')

  const [banReason, setBanReason] = useState('')

  const [banningIp, setBanningIp] = useState(false)

  const [acknowledgingId, setAcknowledgingId] = useState<number | null>(null)



  // ── Risk action state ──

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

  const [exportingBatchId, setExportingBatchId] = useState<number | null>(null)



  const batchesTotalPages = Math.ceil(batchesTotal / batchPageSize)

  const codesTotalPages = Math.ceil(codesTotal / codePageSize)

  const logsTotalPages = Math.ceil(logsTotal / logsPageSize)

  const fraudEventsTotalPages = Math.ceil(fraudEventsTotal / fraudEventsPageSize)

  const auditLogsTotalPages = Math.ceil(auditLogsTotal / auditLogsPageSize)



  // ── Fetch Stats ──



  const fetchStats = useCallback(async () => {

    setStatsLoading(true)

    try {

      const data = await get<RedemptionStats>('/api/v1/redemption/stats')

      setStats(data)

    } catch { /* ignore */ } finally {

      setStatsLoading(false)

    }

  }, [])



  // ── Fetch Batches ──



  const fetchBatches = useCallback(async () => {

    setBatchesLoading(true)

    try {

      const data = await get<{ list: RedemptionBatch[]; total: number }>('/api/v1/redemption/codes', {

        page: batchPage,

        pageSize: batchPageSize,

      })

      setBatches(data.list || [])

      setBatchesTotal(data.total)

    } catch { /* ignore */ } finally {

      setBatchesLoading(false)

    }

  }, [batchPage, batchPageSize])



  // ── Fetch Codes ──



  const fetchCodes = useCallback(async () => {

    setCodesLoading(true)

    try {

      const params: any = { page: codePage, pageSize: codePageSize }

      if (codesFilter.batchId) params.batchId = codesFilter.batchId

      if (codesFilter.status) params.status = codesFilter.status

      const data = await get<{ list: RedemptionCode[]; total: number }>('/api/v1/redemption/codes', params)

      setCodes(data.list || [])

      setCodesTotal(data.total)

    } catch { /* ignore */ } finally {

      setCodesLoading(false)

    }

  }, [codePage, codePageSize, codesFilter])



  // ── Fetch Logs ──



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

    } catch { /* ignore */ } finally {

      setLogsLoading(false)

    }

  }, [logsPage, logsPageSize, logsFilterApplied, logsFilter.email, logsFilter.batchId, logsFilter.startDate, logsFilter.endDate, logsFilter.code])



  // ── Fetch Fraud Stats ──



  const fetchFraudStats = useCallback(async () => {

    setFraudStatsLoading(true)

    try {

      const data = await get<FraudStats>('/api/v1/redemption/fraud/stats')

      setFraudStats(data)

    } catch { /* ignore */ } finally {

      setFraudStatsLoading(false)

    }

  }, [])



  // ── Fetch Fraud Events ──



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

    } catch { /* ignore */ } finally {

      setFraudEventsLoading(false)

    }

  }, [fraudEventsPage, fraudEventsPageSize, fraudEventsFilter])



  // ── Fetch Banned IPs ──



  const fetchBannedIps = useCallback(async () => {

    setBannedIpsLoading(true)

    try {

      const data = await get<{ list: BannedIp[] }>('/api/v1/redemption/fraud/banned-ips')

      setBannedIps(data.list || [])

    } catch { /* ignore */ } finally {

      setBannedIpsLoading(false)

    }

  }, [])



  // ── Ban IP ──



  const handleBanIp = async () => {

    if (!banIpInput.trim()) return

    if (!confirm(`确认封禁 IP：${banIpInput.trim()}?`)) return

    setBanningIp(true)

    try {

      await post('/api/v1/redemption/fraud/ban-ip', { ip: banIpInput.trim(), reason: banReason.trim() || undefined })

      setBanIpInput('')

      setBanReason('')

      fetchBannedIps()

      fetchFraudStats()

    } catch (err: any) {

      alert(err.message || '封禁失败')

    } finally {

      setBanningIp(false)

    }

  }



  // ── Unban IP ──



  const handleUnbanIp = async (ip: string) => {

    if (!confirm(`确认解封 IP：${ip}?`)) return

    try {

      await post('/api/v1/redemption/fraud/unban-ip', { ip })

      fetchBannedIps()

      fetchFraudStats()

    } catch (err: any) {

      alert(err.message || '解封失败')

    }

  }



  // ── Acknowledge event ──



  const handleAcknowledge = async (id: number) => {

    setAcknowledgingId(id)

    try {

      await patch(`/api/v1/redemption/fraud-events/${id}/acknowledge`, {})

      fetchFraudEvents()

    } catch (err: any) {

      try {

        await patch(`/api/v1/redemption/fraud/events/${id}`, { acknowledged: true })

        fetchFraudEvents()

      } catch {

        alert(err.message || '确认失败')

      }

    } finally {

      setAcknowledgingId(null)

    }

  }



  // ── Fetch Agent Overview ──



  const fetchAgentOverview = useCallback(async () => {

    setAgentOverviewLoading(true)

    setAgentOverviewError('')

    try {

      const data = await get<{ list: AgentOverviewItem[] }>('/api/v1/admin/redemption/agent-overview')

      setAgentOverview(data.list || [])

    } catch (err: any) {

      setAgentOverviewError(err.message || '获取代理数据失败')

    } finally {

      setAgentOverviewLoading(false)

    }

  }, [])



  // ── Fetch Agent Codes Detail ──



  const fetchAgentCodes = useCallback(async () => {

    if (!selectedAgentId) return

    setAgentCodesLoading(true)

    try {

      const data = await get<{ list: AgentCodeDetailItem[]; total: number }>(

        `/api/v1/admin/redemption/agent/${selectedAgentId}/detail`,

        { page: agentCodesPage, pageSize: agentCodesPageSize }

      )

      setAgentCodes(data.list || [])

      setAgentCodesTotal(data.total)

    } catch {

      // ignore

    } finally {

      setAgentCodesLoading(false)

    }

  }, [selectedAgentId, agentCodesPage, agentCodesPageSize])



  // ── Fetch Audit Logs ──



  const fetchAuditLogs = useCallback(async () => {

    setAuditLogsLoading(true)

    try {

      const params: any = { page: auditLogsPage, pageSize: auditLogsPageSize }

      if (auditLogsFilter.startDate) params.startDate = auditLogsFilter.startDate

      if (auditLogsFilter.endDate) params.endDate = auditLogsFilter.endDate

      const data = await get<{ list: AuditLogItem[]; total: number }>('/api/v1/admin/redemption/audit-logs', params)

      setAuditLogs(data.list || [])

      setAuditLogsTotal(data.total)

    } catch { /* ignore */ } finally {

      setAuditLogsLoading(false)

    }

  }, [auditLogsPage, auditLogsPageSize, auditLogsFilter])



  useEffect(() => { fetchStats() }, [fetchStats])

  useEffect(() => { fetchBatches() }, [fetchBatches])

  useEffect(() => { fetchCodes() }, [fetchCodes])

  useEffect(() => { if (tab === 'logs') fetchLogs() }, [fetchLogs, tab])

  useEffect(() => { if (tab === 'fraud') { fetchFraudStats(); fetchFraudEvents(); fetchBannedIps() } }, [fetchFraudStats, fetchFraudEvents, fetchBannedIps, tab])

  useEffect(() => { if (tab === 'agentOverview') fetchAgentOverview() }, [fetchAgentOverview, tab])

  useEffect(() => { if (tab === 'agentDetail' && selectedAgentId) fetchAgentCodes() }, [fetchAgentCodes, tab, selectedAgentId])

  useEffect(() => { if (tab === 'auditLogs') fetchAuditLogs() }, [fetchAuditLogs, tab])



  // ── Batch Create ──



  const handleCreateBatch = async () => {

    setBatchError('')

    setBatchSuccess('')

    if (!batchForm.name || !batchForm.amount || !batchForm.count) {

      setBatchError('请填写批次名称、面额和数量')

      return

    }

    setBatchSubmitting(true)

    try {

      await post('/api/v1/redemption/codes/batch', {

        name: batchForm.name,

        amount: batchForm.amount,

        count: parseInt(batchForm.count, 10),

        expiresAt: batchForm.expiresAt || undefined,

        maxUses: parseInt(batchForm.maxUses, 10) || 1,

        note: batchForm.note || undefined,

      })

      setBatchSuccess(`批次 "${batchForm.name}" 创建成功`)

      setBatchForm({ name: '', amount: '', count: '100', expiresAt: '', maxUses: '1', note: '' })

      setBatchFormOpen(false)

      fetchBatches()

      fetchStats()

    } catch (err: any) {

      setBatchError(err.message || '创建批次失败')

    } finally {

      setBatchSubmitting(false)

    }

  }



  // ── Batch Status Toggle ──



  const handleToggleBatchStatus = async (batch: RedemptionBatch) => {

    const newStatus = batch.status === 'active' ? 'disabled' : 'active'

    setTogglingBatchId(batch.id)

    try {

      await patch(`/api/v1/redemption/batches/${batch.id}`, { status: newStatus })

      fetchBatches()

      fetchStats()

    } catch (err: any) {

      alert(err.message || '状态切换失败')

    } finally {

      setTogglingBatchId(null)

    }

  }



  // ── Batch Edit Modal ──



  const handleOpenEditModal = (batch: RedemptionBatch) => {

    setEditingBatch(batch)

    setEditForm({

      name: batch.name,

      expiresAt: toDatetimeLocal(batch.expiresAt),

      note: batch.note || '',

      maxUses: String(batch.maxUses),

    })

    setEditError('')

    setEditModalOpen(true)

  }



  const handleUpdateBatch = async () => {

    if (!editingBatch) return

    setEditError('')

    if (!editForm.name) {

      setEditError('批次名称不能为空')

      return

    }

    setEditSubmitting(true)

    try {

      await patch(`/api/v1/redemption/batches/${editingBatch.id}`, {

        name: editForm.name,

        expiresAt: editForm.expiresAt || null,

        note: editForm.note || null,

        maxUses: parseInt(editForm.maxUses, 10) || 1,

      })

      setEditModalOpen(false)

      setEditingBatch(null)

      fetchBatches()

      fetchStats()

    } catch (err: any) {

      setEditError(err.message || '更新批次失败')

    } finally {

      setEditSubmitting(false)

    }

  }



  // ── Revoke Code ──



  const handleRevoke = async (id: number) => {

    setRevokingId(id)

    try {

      await del(`/api/v1/redemption/codes/${id}`)

      fetchCodes()

      fetchStats()

    } catch (err: any) {

      alert(err.message || '作废失败')

    } finally {

      setRevokingId(null)

    }

  }



  // ── Agent force operations ──



  const handleForceRevoke = async (codeId: number) => {

    setForcingId(codeId)

    try {

      await del(`/api/v1/redemption/codes/${codeId}`)

      fetchAgentCodes()

    } catch (err: any) {

      alert(err.message || '作废失败')

    } finally {

      setForcingId(null)

    }

  }



  const handleForceDisable = async (codeId: number) => {

    setForcingId(codeId)

    try {

      await patch(`/api/v1/redemption/codes/${codeId}`, { status: 'expired' })

      fetchAgentCodes()

    } catch (err: any) {

      alert(err.message || '停用失败')

    } finally {

      setForcingId(null)

    }

  }



  const handleForceExtend = async (codeId: number) => {

    setForcingId(codeId)

    try {

      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

      await patch(`/api/v1/redemption/codes/${codeId}`, { expiresAt })

      fetchAgentCodes()

    } catch (err: any) {

      alert(err.message || '寤舵湡失败')

    } finally {

      setForcingId(null)

    }

  }



  // ── Agent navigation ──



  const handleViewAgentDetail = (agent: AgentOverviewItem) => {

    setSelectedAgentId(agent.agentId)

    setSelectedAgentName(agent.agentName)

    setAgentCodesPage(1)

    setTab('agentDetail')

  }



  const handleBackToAgentOverview = () => {

    setSelectedAgentId(null)

    setSelectedAgentName('')

    setTab('agentOverview')

  }



  // ── Gift success handler ──



  const handleGiftSuccess = () => {

    alert('转赠成功！')

    setGiftModalCodeId(null)

    fetchCodes()

  }



  // ── Export unused ──



  const handleExport = async () => {

    setExporting(true)

    try {

      await downloadUrl('/api/v1/redemption/codes/export?status=unused', 'unused-codes.csv')

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

    } finally {

      setExporting(false)

    }

  }



  // ── Batch Export CSV ──



  const handleBatchExport = async (batchId: number) => {

    setExportingBatchId(batchId)

    try {

      const data = await get<{ list: RedemptionCode[] }>('/api/v1/redemption/codes', { batchId, pageSize: 10000 })

      const codes = data.list || []

      const bom = '\uFEFF'

      const csv = 'code,amount,status,usedAt\n' + codes.map(c => `${c.code},${c.amount},${c.status},${c.usedAt || ''}`).join('\n')

      const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' })

      const link = document.createElement('a')

      link.href = URL.createObjectURL(blob)

      link.download = `batch-${batchId}-codes.csv`

      link.click()

      URL.revokeObjectURL(link.href)

    } catch (err: any) {

      alert(err.message || '导出失败')

    } finally {

      setExportingBatchId(null)

    }

  }



  // ── Logs filter actions ──



  const handleApplyLogsFilter = () => {

    setLogsPage(1)

    setLogsFilterApplied(true)

  }



  const handleResetLogsFilter = () => {

    setLogsFilter({ email: '', batchId: '', startDate: '', endDate: '', code: '' })

    setLogsPage(1)

    setLogsFilterApplied(false)

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



  const handleBatchAction = async (action: 'disable' | 'enable' | 'revoke') => {

    if (selectedCodeIds.length === 0) return

    const actionLabel = action === 'disable' ? '停用' : action === 'enable' ? '启用' : '作废'

    if (!confirm(`确认批量 ${actionLabel} 所选的 ${selectedCodeIds.length} 个兑换码?`)) return

    setBatchActionRunning(true)

    try {

      await post('/api/v1/admin/redemption/batch-action', {

        action,

        codeIds: selectedCodeIds,

        reason: `管理绔壒閲${actionLabel}`,

      })

      setSelectedCodeIds([])

      fetchCodes()

      fetchStats()

    } catch (err: any) {

      alert(err.message || `批量${actionLabel}失败`)

    } finally {

      setBatchActionRunning(false)

    }

  }



  // ── Enhanced Export (admin export endpoint) ──



  const handleAdminExport = async (format: 'csv' | 'json' = 'csv') => {

    setExporting(true)

    try {

      if (format === 'csv') {

        const data = await get<{ csv: string }>('/api/v1/admin/redemption/export', { format: 'csv' })

        downloadCsvFromData(data, 'admin-redemption-codes.csv')

      } else {

        // JSON export - download via blob

        const data = await get<any[]>('/api/v1/admin/redemption/export', { format: 'json' })

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' })

        const link = document.createElement('a')

        link.href = URL.createObjectURL(blob)

        link.download = 'admin-redemption-codes.json'

        link.click()

        URL.revokeObjectURL(link.href)

      }

    } catch {

      // fallback to existing export

      handleExport()

    } finally {

      setExporting(false)

    }

  }



  // ── Risk batch action ──



  const handleRiskBatchAction = async (action: 'revoke_codes' | 'ban_ip' | 'acknowledge') => {

    if (selectedFraudEventIds.length === 0) return

    const actionLabel = action === 'revoke_codes' ? '作废关联码' : action === 'ban_ip' ? '封禁关联IP' : '批量确认'

    if (!confirm(`确认执行 "${actionLabel}" 操作，涉及 ${selectedFraudEventIds.length} 个事件？`)) return

    setRiskActionRunning(true)

    try {

      await post('/api/v1/admin/redemption/risk-action', {

        action,

        eventIds: selectedFraudEventIds,

        reason: `管理绔壒閲${actionLabel}`,

      })

      setSelectedFraudEventIds([])

      fetchFraudEvents()

      fetchFraudStats()

    } catch (err: any) {

      alert(err.message || `${actionLabel}失败`)

    } finally {

      setRiskActionRunning(false)

    }

  }



  const handleToggleSelectFraudEvent = (id: number) => {

    setSelectedFraudEventIds(prev =>

      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]

    )

  }



  const handleSelectAllFraudEvents = () => {

    if (selectedFraudEventIds.length === fraudEvents.length) {

      setSelectedFraudEventIds([])

    } else {

      setSelectedFraudEventIds(fraudEvents.map(e => e.id))

    }

  }



  // ── Report export handler ──



  const handleExportReport = async (type: 'monthly' | 'agent' | 'campaign') => {

    const label = type === 'monthly' ? '月度' : type === 'agent' ? '代理' : '活动'

    setReportExporting(type)

    try {

      const data = await get<{ csv: string }>(`/api/v1/admin/finance/codes/reports/${type}`, {

        period: reportPeriod,

      })

      downloadCsvFromData(data, `redemption-report-${type}-${reportPeriod}.csv`)

    } catch (err: any) {

      alert(err.message || `${label}报表导出失败`)

    } finally {

      setReportExporting(null)

    }

  }



  // ── Batch Export CSV ──



  return (

    <div className="space-y-6">

      <div className="flex items-center justify-between">

        <div className="flex items-center gap-3">

          <Gift size={28} className="text-purple-600" />

          <h1 className="text-2xl font-bold text-slate-900">兑换码管理</h1>

          <FeatureDescription page="admin/redemption-codes" className="ml-2" />
        </div>

        <div className="flex items-center gap-2">

          <button

            onClick={() => handleAdminExport('csv')}

            disabled={exporting}

            className="flex items-center gap-2 px-3 py-2 border border-slate-300 text-slate-600 rounded-lg hover:bg-slate-50 transition text-sm"

          >

            {exporting ? <Loader2 className="animate-spin" size={16} /> : <Download size={16} />}

            导出CSV

          </button>

          <button

            onClick={() => setBatchFormOpen(!batchFormOpen)}

            className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition text-sm"

          >

            <Plus size={16} />

            创建批次

          </button>

        </div>

      </div>



      {/* Batch creation form */}

      {batchFormOpen && (

        <div className="bg-white rounded-xl p-6 shadow-sm border border-purple-200 space-y-4">

          <h3 className="font-semibold text-slate-900">创建兑换码批次</h3>



          {batchError && (

            <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm">

              <AlertCircle size={16} />

              {batchError}

            </div>

          )}

          {batchSuccess && (

            <div className="flex items-center gap-2 text-green-700 bg-green-50 p-3 rounded-lg text-sm">

              <CheckCircle2 size={16} />

              {batchSuccess}

            </div>

          )}



          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">

            <div>

              <label className="block text-sm font-medium text-slate-700 mb-1">批次名称 *</label>

              <input type="text" value={batchForm.name} onChange={(e) => setBatchForm(f => ({ ...f, name: e.target.value }))}

                placeholder="例如：7月促销" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />

            </div>

            <div>

              <label className="block text-sm font-medium text-slate-700 mb-1">面额 (￥) *</label>

              <input type="number" step="0.01" min="0.01" value={batchForm.amount} onChange={(e) => setBatchForm(f => ({ ...f, amount: e.target.value }))}

                placeholder="濡傦細10" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />

            </div>

            <div>

              <label className="block text-sm font-medium text-slate-700 mb-1">数量 *</label>

              <input type="number" min="1" max="100000" value={batchForm.count} onChange={(e) => setBatchForm(f => ({ ...f, count: e.target.value }))}

                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />

            </div>

            <div>

              <label className="block text-sm font-medium text-slate-700 mb-1">过期时间</label>

              <input type="datetime-local" value={batchForm.expiresAt} onChange={(e) => setBatchForm(f => ({ ...f, expiresAt: e.target.value }))}

                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />

            </div>

            <div>

              <label className="block text-sm font-medium text-slate-700 mb-1">最大使用次数</label>

              <input type="number" min="1" value={batchForm.maxUses} onChange={(e) => setBatchForm(f => ({ ...f, maxUses: e.target.value }))}

                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />

            </div>

            <div>

              <label className="block text-sm font-medium text-slate-700 mb-1">备注</label>

              <input type="text" value={batchForm.note} onChange={(e) => setBatchForm(f => ({ ...f, note: e.target.value }))}

                placeholder="可选" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />

            </div>

          </div>



          <div className="flex gap-2">

            <button onClick={handleCreateBatch} disabled={batchSubmitting}

              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 transition text-sm flex items-center gap-2">

              {batchSubmitting && <Loader2 className="animate-spin" size={16} />}

              确认创建

            </button>

            <button onClick={() => setBatchFormOpen(false)} className="px-4 py-2 border border-slate-300 text-slate-600 rounded-lg hover:bg-slate-50 transition text-sm">

              取消

            </button>

          </div>

        </div>

      )}



      {/* Tabs */}

      <div className="flex gap-1 bg-slate-100 p-1 rounded-lg w-fit flex-wrap">

        {(['stats', 'batches', 'codes', 'logs', 'fraud', 'auditLogs', 'reports', 'agentOverview', 'agentDetail'] as const).map(t => {

          if (t === 'agentDetail' && tab !== 'agentDetail') return null

          return (

            <button key={t} onClick={() => {

              if (t === 'agentOverview') {

                handleBackToAgentOverview()

              } else {

                setTab(t)

              }

            }}

              className={`px-4 py-2 rounded-md text-sm transition ${tab === t ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>

              {t === 'stats' ? '兑换统计' : t === 'batches' ? '批次列表' : t === 'codes' ? '兑换码列表' : t === 'logs' ? '兑换流水' : t === 'fraud' ? '风控' : t === 'auditLogs' ? '审计日志' : t === 'reports' ? '报表导出' : t === 'agentOverview' ? '代理总览' : selectedAgentName ? `代理: ${selectedAgentName}` : '代理钻取'}

            </button>

          )

        })}

      </div>



      {/* Tab: Stats */}

      {tab === 'stats' && (

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">

          {statsLoading ? (

            <div className="col-span-4 flex justify-center py-8">

              <Loader2 className="animate-spin" size={24} />

            </div>

          ) : stats ? (

            <>

              <StatCard icon={Package} label="总批次数" value={String(stats.totalBatches)} sub={`活跃 ${stats.activeBatches}`} color="bg-purple-500" />

              <StatCard icon={Hash} label="总码数" value={String(stats.totalCodes)} sub={`已用 ${stats.usedCodes} / 使用率 ${stats.totalCodes > 0 ? ((stats.usedCodes / stats.totalCodes) * 100).toFixed(1) : 0}%`} color="bg-blue-500" />

              <StatCard icon={Users} label="兑换用户数" value={String(stats.totalUsers)} sub={`兑换次数 ${stats.totalRedeemed}`} color="bg-green-500" />

              <StatCard icon={DollarSign} label="兑换总额" value={`￥${Number(stats.totalAmount).toFixed(2)}`} color="bg-orange-500" />

            </>

          ) : null}

        </div>

      )}



      {/* Tab: Batches */}

      {tab === 'batches' && (

        <div className="bg-white rounded-xl shadow-sm border border-slate-200">

          {batchesLoading ? (

            <div className="flex justify-center py-12">

              <Loader2 className="animate-spin" size={24} />

            </div>

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

                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${(batchStatusMap[b.status] || batchStatusMap.active).color}`}>

                            {(batchStatusMap[b.status] || batchStatusMap.active).label}

                          </span>

                        </td>

                        <td className="px-4 py-3 text-sm text-slate-500">{b.expiresAt ? new Date(b.expiresAt).toLocaleString('zh-CN') : '永不过期'}</td>

                        <td className="px-4 py-3 text-sm text-slate-500 whitespace-nowrap">{new Date(b.createdAt).toLocaleString('zh-CN')}</td>

                        <td className="px-4 py-3">

                          <div className="flex items-center gap-2">

                            <button

                              onClick={() => handleToggleBatchStatus(b)}

                              disabled={isToggling}

                              title={isActive ? '停用' : '启用'}

                              className={`flex items-center gap-1 text-xs px-2 py-1 rounded transition ${

                                isActive

                                  ? 'text-orange-600 hover:bg-orange-50'

                                  : 'text-green-600 hover:bg-green-50'

                              }`}

                            >

                              {isToggling ? (

                                <Loader2 className="animate-spin" size={14} />

                              ) : isActive ? (

                                <ToggleLeft size={14} />

                              ) : (

                                <ToggleRight size={14} />

                              )}

                              {isActive ? '停用' : '启用'}

                            </button>

                            <button

                              onClick={() => handleOpenEditModal(b)}

                              className="flex items-center gap-1 text-xs px-2 py-1 rounded text-blue-600 hover:bg-blue-50 transition"

                            >

                              <Pencil size={14} />

                              编辑

                            </button>

                            <button

                              onClick={() => handleBatchExport(b.id)}

                              disabled={exportingBatchId === b.id}

                              className="flex items-center gap-1 text-xs px-2 py-1 rounded text-green-600 hover:bg-green-50 transition"

                            >

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



      {/* Tab: Codes */}

      {tab === 'codes' && (

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 space-y-4">

          {/* Batch action toolbar */}

          {selectedCodeIds.length > 0 && (

            <div className="px-4 pt-4 pb-2 flex items-center gap-3 bg-purple-50 border-b border-purple-100">

              <span className="text-sm text-purple-700">已选 ${selectedCodeIds.length} 个兑换码</span>

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

                onClick={() => handleBatchAction('revoke')}

                disabled={batchActionRunning}

                className="flex items-center gap-1 px-3 py-1.5 bg-red-500 text-white rounded-lg text-xs hover:bg-red-600 disabled:opacity-50 transition"

              >

                {batchActionRunning ? <Loader2 className="animate-spin" size={12} /> : <Trash2 size={12} />}

                批量作废

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

              导出未使用ㄧ爜

            </button>

          </div>



          {codesLoading ? (

            <div className="flex justify-center py-12">

              <Loader2 className="animate-spin" size={24} />

            </div>

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

                    <th className="px-4 py-3 text-sm font-medium text-slate-500">批次</th>

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

                        <td className="px-4 py-3 text-sm text-slate-600">{c.batchName || '-'}</td>

                        <td className="px-4 py-3 text-sm font-medium text-green-600">￥{Number(c.amount).toFixed(2)}</td>

                        <td className="px-4 py-3">

                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${sc.color}`}>{sc.label}</span>

                        </td>

                        <td className="px-4 py-3 text-sm text-slate-500 whitespace-nowrap">{new Date(c.createdAt).toLocaleString('zh-CN')}</td>

                        <td className="px-4 py-3">

                          {c.status === 'unused' && (

                            <div className="flex items-center gap-2">

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

                            </div>

                          )}

                        </td>

                      </tr>

                    )

                  })}

                </tbody>

              </table>

            </div>

          )}

          {codesTotalPages > 0 && (

            <PaginationBar page={codePage} onPageChange={setCodePage} pageSize={codePageSize} onPageSizeChange={setCodePageSize} total={codesTotal} totalPages={codesTotalPages} />

          )}

        </div>

      )}



      {/* Tab: Logs */}

      {tab === 'logs' && (

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 space-y-4">

          <div className="p-4 border-b border-slate-100">

            <div className="flex flex-wrap items-end gap-3">

              <div>

                <label className="block text-xs text-slate-500 mb-1">邮箱</label>

                <input

                  type="text" value={logsFilter.email}

                  onChange={(e) => setLogsFilter(f => ({ ...f, email: e.target.value }))}

                  placeholder="搜索用户邮箱"

                  className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm w-44 focus:outline-none focus:ring-2 focus:ring-purple-500"

                />

              </div>

              <div>

                <label className="block text-xs text-slate-500 mb-1">批次ID</label>

                <input

                  type="number" value={logsFilter.batchId}

                  onChange={(e) => setLogsFilter(f => ({ ...f, batchId: e.target.value }))}

                  placeholder="批次ID"

                  className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm w-28 focus:outline-none focus:ring-2 focus:ring-purple-500"

                />

              </div>

              <div>

                <label className="block text-xs text-slate-500 mb-1">起始日期</label>

                <input

                  type="datetime-local" value={logsFilter.startDate}

                  onChange={(e) => setLogsFilter(f => ({ ...f, startDate: e.target.value }))}

                  className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"

                />

              </div>

              <div>

                <label className="block text-xs text-slate-500 mb-1">结束日期</label>

                <input

                  type="datetime-local" value={logsFilter.endDate}

                  onChange={(e) => setLogsFilter(f => ({ ...f, endDate: e.target.value }))}

                  className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"

                />

              </div>

              <div>

                <label className="block text-xs text-slate-500 mb-1">兑换码</label>

                <input

                  type="text" value={logsFilter.code}

                  onChange={(e) => setLogsFilter(f => ({ ...f, code: e.target.value }))}

                  placeholder="兑换码（模糊搜索）"

                  className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm w-40 focus:outline-none focus:ring-2 focus:ring-purple-500"

                />

              </div>

              <div className="flex gap-2">

                <button onClick={handleApplyLogsFilter}

                  className="flex items-center gap-1 px-3 py-1.5 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700 transition">

                  <Search size={14} />

                  筛选</button>

                <button onClick={handleResetLogsFilter}

                  className="flex items-center gap-1 px-3 py-1.5 border border-slate-300 text-slate-600 rounded-lg text-sm hover:bg-slate-50 transition">

                  <X size={14} />

                  重置

                </button>

              </div>

            </div>

          </div>



          {logsLoading ? (

            <div className="flex justify-center py-12">

              <Loader2 className="animate-spin" size={24} />

            </div>

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



      {/* Tab: Fraud */}

      {tab === 'fraud' && (

        <div className="space-y-6">

          <div className="space-y-4">

            <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">

              <Shield size={16} className="text-red-500" />

              风控概览

            </h3>

            {fraudStatsLoading ? (

              <div className="flex justify-center py-8">

                <Loader2 className="animate-spin" size={24} />

              </div>

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

                        const pct = (count / maxCount) * 100

                        return (

                          <div key={type} className="flex items-center gap-3">

                            <span className="text-xs text-slate-600 w-28 shrink-0">{fraudEventTypeMap[type] || type}</span>

                            <div className="flex-1 h-5 bg-slate-100 rounded-full overflow-hidden">

                              <div

                                className="h-full bg-red-400 rounded-full transition-all"

                                style={{ width: `${pct}%` }}

                              />

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



          <div className="bg-white rounded-xl shadow-sm border border-slate-200 space-y-4">

            <div className="px-4 pt-4">

              <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">

                <Info size={16} className="text-blue-500" />

                风控事件列表

              </h3>

            </div>

            <div className="px-4 border-b border-slate-100 pb-4">

              <div className="flex flex-wrap items-end gap-3">

                <div>

                  <label className="block text-xs text-slate-500 mb-1">类型</label>

                  <select

                    value={fraudEventsFilter.eventType}

                    onChange={(e) => setFraudEventsFilter(f => ({ ...f, eventType: e.target.value }))}

                    className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"

                  >

                    <option value="">全部</option>

                    <option value="brute_force">爆破检测</option>

                    <option value="ip_anomaly">IP异常</option>

                    <option value="user_frequency">高频兑换</option>

                    <option value="code_leak">碼佹硠闇</option>

                    <option value="high_risk_score">高风险评分</option>

                    <option value="manual_ban">手动封禁</option>

                  </select>

                </div>

                <div>

                  <label className="block text-xs text-slate-500 mb-1">严重级别</label>

                  <select

                    value={fraudEventsFilter.severity}

                    onChange={(e) => setFraudEventsFilter(f => ({ ...f, severity: e.target.value }))}

                    className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"

                  >

                    <option value="">全部</option>

                    <option value="warning">警告</option>

                    <option value="high">高危</option>

                    <option value="critical">严重</option>

                  </select>

                </div>

                <div>

                  <label className="block text-xs text-slate-500 mb-1">处理状态</label>

                  <select

                    value={fraudEventsFilter.acknowledged}

                    onChange={(e) => setFraudEventsFilter(f => ({ ...f, acknowledged: e.target.value }))}

                    className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"

                  >

                    <option value="">全部</option>

                    <option value="false">未处理</option>

                    <option value="true">已处理</option>

                  </select>

                </div>

                <div>

                  <label className="block text-xs text-slate-500 mb-1">IP 搜索</label>

                  <input

                    type="text" value={fraudEventsFilter.ip}

                    onChange={(e) => setFraudEventsFilter(f => ({ ...f, ip: e.target.value }))}

                    placeholder="搜索 IP"

                    className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm w-36 focus:outline-none focus:ring-2 focus:ring-red-500"

                  />

                </div>

                <div>

                  <label className="block text-xs text-slate-500 mb-1">起始日期</label>

                  <input

                    type="datetime-local" value={fraudEventsFilter.startDate}

                    onChange={(e) => setFraudEventsFilter(f => ({ ...f, startDate: e.target.value }))}

                    className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"

                  />

                </div>

                <div>

                  <label className="block text-xs text-slate-500 mb-1">结束日期</label>

                  <input

                    type="datetime-local" value={fraudEventsFilter.endDate}

                    onChange={(e) => setFraudEventsFilter(f => ({ ...f, endDate: e.target.value }))}

                    className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"

                  />

                </div>

                <div className="flex gap-2">

                  <button

                    onClick={() => { setFraudEventsPage(1); fetchFraudEvents() }}

                    className="flex items-center gap-1 px-3 py-1.5 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 transition"

                  >

                    <Search size={14} />

                    筛选</button>

                  <button

                    onClick={() => {

                      setFraudEventsFilter({ eventType: '', severity: '', acknowledged: '', ip: '', startDate: '', endDate: '' })

                      setFraudEventsPage(1)

                    }}

                    className="flex items-center gap-1 px-3 py-1.5 border border-slate-300 text-slate-600 rounded-lg text-sm hover:bg-slate-50 transition"

                  >

                    <X size={14} />

                    重置

                  </button>

                </div>

              </div>

            </div>



            {/* Risk batch action toolbar */}

            {selectedFraudEventIds.length > 0 && (

              <div className="px-4 pb-2 flex items-center gap-3 bg-red-50 border-b border-red-100">

                <span className="text-sm text-red-700">已选 ${selectedFraudEventIds.length} 个事件</span>

                <button

                  onClick={() => handleRiskBatchAction('revoke_codes')}

                  disabled={riskActionRunning}

                  className="flex items-center gap-1 px-3 py-1.5 bg-red-500 text-white rounded-lg text-xs hover:bg-red-600 disabled:opacity-50 transition"

                >

                  {riskActionRunning ? <Loader2 className="animate-spin" size={12} /> : <Trash2 size={12} />}

                  批量作废关联码</button>

                <button

                  onClick={() => handleRiskBatchAction('ban_ip')}

                  disabled={riskActionRunning}

                  className="flex items-center gap-1 px-3 py-1.5 bg-orange-500 text-white rounded-lg text-xs hover:bg-orange-600 disabled:opacity-50 transition"

                >

                  {riskActionRunning ? <Loader2 className="animate-spin" size={12} /> : <Ban size={12} />}

                  批量封禁IP

                </button>

                <button

                  onClick={() => handleRiskBatchAction('acknowledge')}

                  disabled={riskActionRunning}

                  className="flex items-center gap-1 px-3 py-1.5 bg-green-500 text-white rounded-lg text-xs hover:bg-green-600 disabled:opacity-50 transition"

                >

                  {riskActionRunning ? <Loader2 className="animate-spin" size={12} /> : <Check size={12} />}

                  批量确认

                </button>

                <button

                  onClick={() => setSelectedFraudEventIds([])}

                  className="flex items-center gap-1 px-3 py-1.5 text-slate-500 hover:text-slate-700 text-xs transition"

                >

                  <X size={12} />

                  取消

                </button>

              </div>

            )}



            {fraudEventsLoading ? (

              <div className="flex justify-center py-12">

                <Loader2 className="animate-spin" size={24} />

              </div>

            ) : fraudEvents.length === 0 ? (

              <div className="py-12 text-center text-slate-400 text-sm">暂无风控事件</div>

            ) : (

              <div className="overflow-x-auto">

                <table className="w-full">

                  <thead>

                    <tr className="bg-slate-50 text-left">

                      <th className="px-4 py-3 text-sm font-medium text-slate-500 w-10">

                        <input

                          type="checkbox"

                          checked={selectedFraudEventIds.length === fraudEvents.length && fraudEvents.length > 0}

                          onChange={handleSelectAllFraudEvents}

                          className="rounded border-slate-300"

                        />

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

                      const maxRiskScore = 100

                      const riskPct = Math.min(100, (ev.riskScore / maxRiskScore) * 100)

                      const riskColor = ev.riskScore >= 80 ? 'bg-red-500' : ev.riskScore >= 50 ? 'bg-orange-500' : 'bg-amber-400'

                      const isSelected = selectedFraudEventIds.includes(ev.id)

                      return (

                        <tr key={ev.id} className={`hover:bg-slate-50 transition ${isSelected ? 'bg-red-50' : ''}`}>

                          <td className="px-4 py-3">

                            <input

                              type="checkbox"

                              checked={isSelected}

                              onChange={() => handleToggleSelectFraudEvent(ev.id)}

                              className="rounded border-slate-300"

                            />

                          </td>

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

                          <td className="px-4 py-3">

                            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${sevCfg.color}`}>{sevCfg.label}</span>

                          </td>

                          <td className="px-4 py-3">

                            {ev.detail ? (

                              <span className="text-xs text-blue-600 cursor-help underline decoration-dotted" title={ev.detail}>

                                {ev.detail.length > 20 ? ev.detail.substring(0, 20) + '…' : ev.detail}

                              </span>

                            ) : (

                              <span className="text-xs text-slate-400">-</span>

                            )}

                          </td>

                          <td className="px-4 py-3">

                            {ev.acknowledged ? (

                              <span className="inline-flex items-center gap-1 text-xs text-green-600">

                                <Check size={14} />

                                已处理</span>

                            ) : (

                              <button

                                onClick={() => handleAcknowledge(ev.id)}

                                disabled={acknowledgingId === ev.id}

                                className="flex items-center gap-1 text-xs px-2.5 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition"

                              >

                                {acknowledgingId === ev.id ? <Loader2 className="animate-spin" size={14} /> : <Check size={14} />}

                                确认

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

              <PaginationBar

                page={fraudEventsPage}

                onPageChange={setFraudEventsPage}

                pageSize={fraudEventsPageSize}

                onPageSizeChange={setFraudEventsPageSize}

                total={fraudEventsTotal}

                totalPages={fraudEventsTotalPages}

              />

            )}

          </div>



          <div className="bg-white rounded-xl shadow-sm border border-slate-200 space-y-4">

            <div className="px-4 pt-4">

              <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">

                <Ban size={16} className="text-slate-600" />

                IP 封禁管理

              </h3>

            </div>

            <div className="px-4 border-b border-slate-100 pb-4">

              <div className="flex flex-wrap items-end gap-3">

                <div>

                  <label className="block text-xs text-slate-500 mb-1">IP 地址</label>

                  <input

                    type="text" value={banIpInput}

                    onChange={(e) => setBanIpInput(e.target.value)}

                    placeholder="濡傦細192.168.1.1"

                    className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm w-44 focus:outline-none focus:ring-2 focus:ring-red-500"

                  />

                </div>

                <div>

                  <label className="block text-xs text-slate-500 mb-1">封禁原因（可选）</label>

                  <input

                    type="text" value={banReason}

                    onChange={(e) => setBanReason(e.target.value)}

                    placeholder="封禁原因"

                    className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm w-52 focus:outline-none focus:ring-2 focus:ring-red-500"

                  />

                </div>

                <div className="flex gap-2">

                  <button

                    onClick={handleBanIp}

                    disabled={banningIp || !banIpInput.trim()}

                    className="flex items-center gap-1 px-3 py-1.5 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 disabled:opacity-50 transition"

                  >

                    {banningIp ? <Loader2 className="animate-spin" size={14} /> : <Ban size={14} />}

                    封禁 IP

                  </button>

                </div>

              </div>

            </div>



            {bannedIpsLoading ? (

              <div className="flex justify-center py-8">

                <Loader2 className="animate-spin" size={24} />

              </div>

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

                          <button

                            onClick={() => handleUnbanIp(bip.ip)}

                            className="flex items-center gap-1 text-xs px-2.5 py-1 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"

                          >

                            <Check size={14} />

                            解封

                          </button>

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



      {/* Tab: Audit Logs */}

      {tab === 'auditLogs' && (

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 space-y-4">

          <div className="p-4 border-b border-slate-100">

            <div className="flex flex-wrap items-end gap-3">

              <div>

                <label className="block text-xs text-slate-500 mb-1">起始日期</label>

                <input

                  type="datetime-local" value={auditLogsFilter.startDate}

                  onChange={(e) => setAuditLogsFilter(f => ({ ...f, startDate: e.target.value }))}

                  className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"

                />

              </div>

              <div>

                <label className="block text-xs text-slate-500 mb-1">结束日期</label>

                <input

                  type="datetime-local" value={auditLogsFilter.endDate}

                  onChange={(e) => setAuditLogsFilter(f => ({ ...f, endDate: e.target.value }))}

                  className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"

                />

              </div>

              <div className="flex gap-2">

                <button onClick={() => { setAuditLogsPage(1); fetchAuditLogs() }}

                  className="flex items-center gap-1 px-3 py-1.5 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700 transition">

                  <Search size={14} />

                  筛选</button>

                <button onClick={() => {

                  setAuditLogsFilter({ startDate: '', endDate: '' })

                  setAuditLogsPage(1)

                }}

                  className="flex items-center gap-1 px-3 py-1.5 border border-slate-300 text-slate-600 rounded-lg text-sm hover:bg-slate-50 transition">

                  <X size={14} />

                  重置

                </button>

              </div>

            </div>

          </div>



          {auditLogsLoading ? (

            <div className="flex justify-center py-12">

              <Loader2 className="animate-spin" size={24} />

            </div>

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



      {/* Tab: Reports */}

      {tab === 'reports' && (

        <div className="space-y-6">

          <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200 space-y-6">

            <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">

              <FileSpreadsheet size={16} className="text-green-500" />

              报表导出

            </h3>



            <div className="flex items-center gap-4">

              <div>

                <label className="block text-xs text-slate-500 mb-1">报表鏈堜唤</label>

                <input

                  type="month"

                  value={reportPeriod}

                  onChange={(e) => setReportPeriod(e.target.value)}

                  className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"

                />

              </div>

            </div>



            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

              <button

                onClick={() => handleExportReport('monthly')}

                disabled={reportExporting === 'monthly'}

                className="flex flex-col items-center gap-3 p-6 border border-green-200 rounded-xl hover:bg-green-50 transition disabled:opacity-50"

              >

                {reportExporting === 'monthly' ? (

                  <Loader2 className="animate-spin text-green-500" size={32} />

                ) : (

                  <Calendar size={32} className="text-green-500" />

                )}

                <div className="text-center">

                  <p className="text-sm font-medium text-slate-900">月度成本报表</p>

                  <p className="text-xs text-slate-400 mt-1">按费用类型汇总的月度成本数据</p>

                </div>

                <span className="text-xs text-green-600 flex items-center gap-1">

                  <Download size={12} /> 下载 CSV

                </span>

              </button>



              <button

                onClick={() => handleExportReport('agent')}

                disabled={reportExporting === 'agent'}

                className="flex flex-col items-center gap-3 p-6 border border-blue-200 rounded-xl hover:bg-blue-50 transition disabled:opacity-50"

              >

                {reportExporting === 'agent' ? (

                  <Loader2 className="animate-spin text-blue-500" size={32} />

                ) : (

                  <Users size={32} className="text-blue-500" />

                )}

                <div className="text-center">

                  <p className="text-sm font-medium text-slate-900">代理成本报表</p>

                  <p className="text-xs text-slate-400 mt-1">按代理维度的成本汇总报表</p>

                </div>

                <span className="text-xs text-blue-600 flex items-center gap-1">

                  <Download size={12} /> 下载 CSV

                </span>

              </button>



              <button

                onClick={() => handleExportReport('campaign')}

                disabled={reportExporting === 'campaign'}

                className="flex flex-col items-center gap-3 p-6 border border-purple-200 rounded-xl hover:bg-purple-50 transition disabled:opacity-50"

              >

                {reportExporting === 'campaign' ? (

                  <Loader2 className="animate-spin text-purple-500" size={32} />

                ) : (

                  <TrendingUp size={32} className="text-purple-500" />

                )}

                <div className="text-center">

                  <p className="text-sm font-medium text-slate-900">活动维度报表</p>

                  <p className="text-xs text-slate-400 mt-1">按营销活动的成本和效果数据</p>

                </div>

                <span className="text-xs text-purple-600 flex items-center gap-1">

                  <Download size={12} /> 下载 CSV

                </span>

              </button>

            </div>

          </div>

        </div>

      )}



      {/* Batch Edit Modal */}

      {editModalOpen && editingBatch && (

        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setEditModalOpen(false)}>

          <div className="bg-white rounded-xl p-6 shadow-xl border border-slate-200 w-full max-w-lg mx-4" onClick={e => e.stopPropagation()}>

            <h3 className="font-semibold text-slate-900 text-lg mb-4">编辑批次</h3>



            {editError && (

              <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm mb-4">

                <AlertCircle size={16} />

                {editError}

              </div>

            )}



            <div className="space-y-4">

              <div className="grid grid-cols-2 gap-4 pb-4 border-b border-slate-100">

                <div>

                  <label className="block text-xs text-slate-500 mb-1">面额（不可修改）</label>

                  <div className="px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-400 bg-slate-50">

                    ￥{Number(editingBatch.amount).toFixed(2)}

                  </div>

                </div>

                <div>

                  <label className="block text-xs text-slate-500 mb-1">总数量（不可修改）</label>

                  <div className="px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-400 bg-slate-50">

                    {editingBatch.totalCount}

                  </div>

                </div>

              </div>



              <div>

                <label className="block text-sm font-medium text-slate-700 mb-1">批次名称 *</label>

                <input type="text" value={editForm.name}

                  onChange={(e) => setEditForm(f => ({ ...f, name: e.target.value }))}

                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />

              </div>

              <div>

                <label className="block text-sm font-medium text-slate-700 mb-1">过期时间</label>

                <input type="datetime-local" value={editForm.expiresAt}

                  onChange={(e) => setEditForm(f => ({ ...f, expiresAt: e.target.value }))}

                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />

              </div>

              <div>

                <label className="block text-sm font-medium text-slate-700 mb-1">最大使用次数</label>

                <input type="number" min="1" value={editForm.maxUses}

                  onChange={(e) => setEditForm(f => ({ ...f, maxUses: e.target.value }))}

                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />

              </div>

              <div>

                <label className="block text-sm font-medium text-slate-700 mb-1">备注</label>

                <input type="text" value={editForm.note}

                  onChange={(e) => setEditForm(f => ({ ...f, note: e.target.value }))}

                  placeholder="可选" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />

              </div>

            </div>



            <div className="flex gap-2 mt-6">

              <button onClick={handleUpdateBatch} disabled={editSubmitting}

                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 transition text-sm flex items-center gap-2">

                {editSubmitting && <Loader2 className="animate-spin" size={16} />}

                保存修改

              </button>

              <button onClick={() => { setEditModalOpen(false); setEditingBatch(null) }}

                className="px-4 py-2 border border-slate-300 text-slate-600 rounded-lg hover:bg-slate-50 transition text-sm">

                取消

              </button>

            </div>

          </div>

        </div>

      )}



      {/* Tab: Agent Overview */}

      {tab === 'agentOverview' && (

        <div className="bg-white rounded-xl shadow-sm border border-slate-200">

          {agentOverviewLoading ? (

            <div className="flex justify-center py-12">

              <Loader2 className="animate-spin" size={24} />

            </div>

          ) : agentOverviewError ? (

            <div className="flex items-center gap-2 text-red-600 bg-red-50 p-4 rounded-lg text-sm m-4">

              <AlertCircle size={16} /> {agentOverviewError}

            </div>

          ) : agentOverview.length === 0 ? (

            <div className="py-12 text-center text-slate-400 text-sm">暂无代理数据</div>

          ) : (

            <div className="overflow-x-auto">

              <table className="w-full">

                <thead>

                  <tr className="bg-slate-50 text-left">

                    <th className="px-4 py-3 text-sm font-medium text-slate-500">代理名</th>

                    <th className="px-4 py-3 text-sm font-medium text-slate-500 text-right">发放量</th>

                    <th className="px-4 py-3 text-sm font-medium text-slate-500 text-right">使用量</th>

                    <th className="px-4 py-3 text-sm font-medium text-slate-500 text-right">冻结 Token</th>

                    <th className="px-4 py-3 text-sm font-medium text-slate-500 text-right">浣跨敤鐜</th>

                    <th className="px-4 py-3 text-sm font-medium text-slate-500">风险等级</th>

                    <th className="px-4 py-3 text-sm font-medium text-slate-500 text-right">操作</th>

                  </tr>

                </thead>

                <tbody className="divide-y divide-slate-200">

                  {agentOverview.map((agent) => {

                    const riskCfg = riskLevelConfig[agent.riskLevel] || riskLevelConfig.low

                    const RiskIcon = riskCfg.icon

                    return (

                      <tr key={agent.agentId} className="hover:bg-slate-50 transition">

                        <td className="px-4 py-3 text-sm font-medium text-slate-900">

                          <div className="flex items-center gap-2">

                            <Handshake size={16} className="text-slate-400" />

                            {agent.agentName}

                          </div>

                        </td>

                        <td className="px-4 py-3 text-sm text-right text-slate-700">{agent.issuedCount.toLocaleString()}</td>

                        <td className="px-4 py-3 text-sm text-right text-slate-700">{agent.usedCount.toLocaleString()}</td>

                        <td className="px-4 py-3 text-sm text-right text-orange-600">{Number(agent.frozenTokens).toFixed(2)}</td>

                        <td className="px-4 py-3 text-sm text-right">

                          <div className="flex items-center justify-end gap-2">

                            <div className="w-16 h-2 bg-slate-200 rounded-full overflow-hidden inline-block">

                              <div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.min(100, agent.usageRate * 100)}%` }} />

                            </div>

                            <span className="text-xs text-slate-500">{(agent.usageRate * 100).toFixed(1)}%</span>

                          </div>

                        </td>

                        <td className="px-4 py-3">

                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${riskCfg.color}`}>

                            <RiskIcon size={12} />

                            {riskCfg.label}

                          </span>

                        </td>

                        <td className="px-4 py-3 text-right">

                          <div className="flex items-center justify-end gap-2">

                            <button

                              onClick={() => handleViewAgentDetail(agent)}

                              className="px-2.5 py-1 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition"

                            >

                              查看详情

                            </button>

                            <button

                              className="px-2.5 py-1 text-xs font-medium text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-lg transition"

                            >

                              调整配额

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

        </div>

      )}



      {/* Tab: Agent Detail */}

      {tab === 'agentDetail' && selectedAgentId && (

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 space-y-4">

          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">

            <div className="flex items-center gap-2">

              <Handshake size={18} className="text-slate-500" />

              <h3 className="text-sm font-semibold text-slate-800">{selectedAgentName} - 兑换码列表</h3>

            </div>

            <button

              onClick={handleBackToAgentOverview}

              className="text-xs text-blue-600 hover:text-blue-800 px-2 py-1 bg-blue-50 rounded"

            >

              返回代理总览

            </button>

          </div>



          {agentCodesLoading ? (

            <div className="flex justify-center py-12">

              <Loader2 className="animate-spin" size={24} />

            </div>

          ) : agentCodes.length === 0 ? (

            <div className="py-8 text-center text-slate-400 text-sm">该代理暂无兑换码</div>

          ) : (

            <div className="overflow-x-auto">

              <table className="w-full">

                <thead>

                  <tr className="bg-slate-50 text-left">

                    <th className="px-4 py-3 text-sm font-medium text-slate-500">碼</th>

                    <th className="px-4 py-3 text-sm font-medium text-slate-500">批次</th>

                    <th className="px-4 py-3 text-sm font-medium text-slate-500">閲戦</th>

                    <th className="px-4 py-3 text-sm font-medium text-slate-500">状态</th>

                    <th className="px-4 py-3 text-sm font-medium text-slate-500">已用次数</th>

                    <th className="px-4 py-3 text-sm font-medium text-slate-500">创建时间</th>

                    <th className="px-4 py-3 text-sm font-medium text-slate-500">操作</th>

                  </tr>

                </thead>

                <tbody className="divide-y divide-slate-200">

                  {agentCodes.map(c => {

                    const sc = codeStatusMap[c.status] || { label: c.status, color: 'bg-slate-100 text-slate-700' }

                    return (

                      <tr key={c.id} className="hover:bg-slate-50 transition">

                        <td className="px-4 py-3 text-sm font-mono text-slate-700">{c.code}</td>

                        <td className="px-4 py-3 text-sm text-slate-600">{c.batchName || '-'}</td>

                        <td className="px-4 py-3 text-sm font-medium text-green-600">￥{Number(c.amount).toFixed(2)}</td>

                        <td className="px-4 py-3">

                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${sc.color}`}>{sc.label}</span>

                        </td>

                        <td className="px-4 py-3 text-sm text-slate-600">{c.usesLeft}/{c.usesLeft + 1}</td>

                        <td className="px-4 py-3 text-sm text-slate-500 whitespace-nowrap">{new Date(c.createdAt).toLocaleString('zh-CN')}</td>

                        <td className="px-4 py-3">

                          <div className="flex items-center gap-1">

                            <button onClick={() => handleForceRevoke(c.id)} disabled={forcingId === c.id}

                              className="flex items-center gap-0.5 text-xs text-red-600 hover:text-red-800 px-1 py-0.5 rounded">

                              {forcingId === c.id ? <Loader2 className="animate-spin" size={10} /> : <Trash2 size={10} />}

                              作废

                            </button>

                            <button onClick={() => handleForceDisable(c.id)} disabled={forcingId === c.id}

                              className="flex items-center gap-0.5 text-xs text-orange-600 hover:text-orange-800 px-1 py-0.5 rounded">

                              停用

                            </button>

                            <button onClick={() => handleForceExtend(c.id)} disabled={forcingId === c.id}

                              className="flex items-center gap-0.5 text-xs text-blue-600 hover:text-blue-800 px-1 py-0.5 rounded">

                              寤舵湡

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

          {agentCodesTotal > 0 && (

            <PaginationBar page={agentCodesPage} onPageChange={setAgentCodesPage} pageSize={agentCodesPageSize} onPageSizeChange={setAgentCodesPageSize} total={agentCodesTotal} totalPages={Math.ceil(agentCodesTotal / agentCodesPageSize)} />

          )}

        </div>

      )}



      {/* Gift Modal */}

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



// ── StatCard ──



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

            转赠兑换码</h3>

          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition">

            <X size={20} />

          </button>

        </div>



        <p className="text-sm text-slate-500 mb-2">

          转赠兑换码侊細<span className="font-mono text-slate-700">{codeDisplay}</span>

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