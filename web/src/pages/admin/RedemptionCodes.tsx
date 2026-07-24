import { useState } from 'react'
import { Gift, Plus, Download, Loader2 } from 'lucide-react'
import { downloadUrl } from '@/lib/api'
import FeatureDescription from '@/components/admin/FeatureDescription'
import StatsCards from './redemption/StatsCards'
import BatchCreateForm from './redemption/BatchCreateForm'
import AgentOverview from './redemption/AgentOverview'
import AgentCodeDetail from './redemption/AgentCodeDetail'
import CodeList from './redemption/CodeList'
import { GiftModal, BatchEditModal } from './redemption/CodeDetail'
import { BatchesTab, LogsTab, FraudTab, AuditLogsTab, ReportsTab } from './redemption/components'
import {
  useRedemptionStats,
  useRedemptionBatches,
  useRedemptionCodes,
  useRedemptionLogsAuto,
  useRedemptionFraudAuto,
  useRedemptionAgentAuto,
  useRedemptionAuditAuto,
} from './redemption/hooks'
import type { RedemptionBatch, RedemptionCode } from './redemption/types'

type TabKey = 'stats' | 'batches' | 'codes' | 'logs' | 'fraud' | 'agentOverview' | 'agentDetail' | 'auditLogs' | 'reports'

export default function AdminRedemptionCodes() {
  const [tab, setTab] = useState<TabKey>('stats')
  const [batchFormOpen, setBatchFormOpen] = useState(false)
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [editingBatch, setEditingBatch] = useState<RedemptionBatch | null>(null)
  const [giftModalCodeId, setGiftModalCodeId] = useState<number | null>(null)
  const [giftModalCodeDisplay, setGiftModalCodeDisplay] = useState('')

  // Hooks
  const stats = useRedemptionStats()
  const batches = useRedemptionBatches()
  const codes = useRedemptionCodes()
  const logs = useRedemptionLogsAuto(tab === 'logs')
  const fraud = useRedemptionFraudAuto(tab === 'fraud')
  const agent = useRedemptionAgentAuto(tab === 'agentOverview' || tab === 'agentDetail')
  const audit = useRedemptionAuditAuto(tab === 'auditLogs')

  // Report state
  const [reportPeriod, setReportPeriod] = useState<string>(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const [reportExporting, setReportExporting] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)

  // Handlers
  const handleToggleBatchStatus = async (batch: RedemptionBatch) => {
    try {
      await batches.toggleStatus(batch, stats.refetch)
    } catch (err: any) {
      alert(err.message)
    }
  }

  const handleBatchExport = async (batchId: number) => {
    try {
      await batches.exportBatch(batchId)
    } catch (err: any) {
      alert(err.message)
    }
  }

  const handleRevoke = async (id: number) => {
    try {
      await codes.revoke(id, stats.refetch)
    } catch (err: any) {
      alert(err.message)
    }
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      await downloadUrl('/api/v1/redemption/codes/export?status=unused', 'unused-codes.csv')
    } catch {
      await codes.exportUnused()
    } finally {
      setExporting(false)
    }
  }

  const handleBatchAction = async (action: 'disable' | 'enable' | 'revoke') => {
    try {
      await codes.batchAction(action, stats.refetch)
    } catch (err: any) {
      alert(err.message)
    }
  }

  const handleGiftSuccess = () => {
    alert('转赠成功！')
    setGiftModalCodeId(null)
    codes.refetch()
  }

  const handleBatchCreated = () => {
    batches.refetch()
    stats.refetch()
  }

  const handleAdminExport = async (format: 'csv' | 'json' = 'csv') => {
    setExporting(true)
    try {
      const { get } = await import('@/lib/api')
      if (format === 'csv') {
        const data = await get<{ csv: string }>('/api/v1/admin/redemption/export', { format: 'csv' })
        const blob = new Blob([data.csv], { type: 'text/csv;charset=utf-8;' })
        const link = document.createElement('a')
        link.href = URL.createObjectURL(blob)
        link.download = 'admin-redemption-codes.csv'
        link.click()
        URL.revokeObjectURL(link.href)
      } else {
        const data = await get<any[]>('/api/v1/admin/redemption/export', { format: 'json' })
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' })
        const link = document.createElement('a')
        link.href = URL.createObjectURL(blob)
        link.download = 'admin-redemption-codes.json'
        link.click()
        URL.revokeObjectURL(link.href)
      }
    } catch {
      handleExport()
    } finally {
      setExporting(false)
    }
  }

  // Tab labels
  const tabLabels: Record<string, string> = {
    stats: '兑换统计',
    batches: '批次列表',
    codes: '兑换码列表',
    logs: '兑换流水',
    fraud: '风控',
    auditLogs: '审计日志',
    reports: '报表导出',
    agentOverview: '代理总览',
    agentDetail: agent.selectedName ? `代理: ${agent.selectedName}` : '代理钻取',
  }

  return (
    <div className="space-y-6">
      {/* Header */}
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
            <Plus size={16} />创建批次
          </button>
        </div>
      </div>

      {/* Batch creation form */}
      {batchFormOpen && (
        <BatchCreateForm onClose={() => setBatchFormOpen(false)} onSuccess={handleBatchCreated} />
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-lg w-fit flex-wrap">
        {(['stats', 'batches', 'codes', 'logs', 'fraud', 'auditLogs', 'reports', 'agentOverview', 'agentDetail'] as const).map(t => {
          if (t === 'agentDetail' && tab !== 'agentDetail') return null
          return (
            <button
              key={t}
              onClick={() => {
                t === 'agentOverview' ? agent.backToOverview() : setTab(t)
              }}
              className={`px-4 py-2 rounded-md text-sm transition ${tab === t ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              {tabLabels[t]}
            </button>
          )
        })}
      </div>

      {/* Tab content */}
      {tab === 'stats' && <StatsCards stats={stats.stats} loading={stats.loading} />}

      {tab === 'batches' && (
        <BatchesTab
          batches={batches.batches}
          total={batches.total}
          page={batches.page}
          pageSize={batches.pageSize}
          loading={batches.loading}
          togglingId={batches.togglingId}
          exportingId={batches.exportingId}
          totalPages={batches.totalPages}
          onPageChange={batches.setPage}
          onPageSizeChange={batches.setPageSize}
          onToggleStatus={handleToggleBatchStatus}
          onEdit={(batch) => { setEditingBatch(batch); setEditModalOpen(true) }}
          onExport={handleBatchExport}
        />
      )}

      {tab === 'codes' && (
        <CodeList
          codes={codes.codes}
          total={codes.total}
          page={codes.page}
          pageSize={codes.pageSize}
          loading={codes.loading}
          selectedCodeIds={codes.selectedIds}
          revokingId={codes.revokingId}
          exporting={exporting}
          batchActionRunning={codes.batchActionRunning}
          statusFilter={codes.filter.status}
          onPageChange={codes.setPage}
          onPageSizeChange={codes.setPageSize}
          onStatusFilterChange={(s) => codes.setFilter(f => ({ ...f, status: s }))}
          onRevoke={handleRevoke}
          onExport={handleExport}
          onToggleSelect={codes.toggleSelect}
          onSelectAll={codes.selectAll}
          onClearSelection={codes.clearSelection}
          onBatchAction={handleBatchAction}
          onGiftOpen={(id, display) => { setGiftModalCodeId(id); setGiftModalCodeDisplay(display) }}
        />
      )}

      {tab === 'logs' && (
        <LogsTab
          logs={logs.logs}
          total={logs.total}
          page={logs.page}
          pageSize={logs.pageSize}
          loading={logs.loading}
          filter={logs.filter}
          totalPages={logs.totalPages}
          onPageChange={logs.setPage}
          onPageSizeChange={logs.setPageSize}
          onFilterChange={logs.setFilter}
          onApplyFilter={logs.applyFilter}
          onResetFilter={logs.resetFilter}
        />
      )}

      {tab === 'fraud' && (
        <FraudTab
          fraudStats={fraud.stats}
          fraudStatsLoading={fraud.statsLoading}
          fraudEvents={fraud.events}
          fraudEventsTotal={fraud.eventsTotal}
          fraudEventsPage={fraud.eventsPage}
          fraudEventsPageSize={fraud.eventsPageSize}
          fraudEventsLoading={fraud.eventsLoading}
          fraudEventsTotalPages={fraud.eventsTotalPages}
          bannedIps={fraud.bannedIps}
          bannedIpsLoading={fraud.bannedIpsLoading}
          selectedFraudEventIds={fraud.selectedEventIds}
          fraudEventsFilter={fraud.eventsFilter}
          banIpInput=""
          banReason=""
          banningIp={fraud.banningIp}
          acknowledgingId={fraud.acknowledgingId}
          riskActionRunning={fraud.riskActionRunning}
          onFraudEventsPageChange={fraud.setEventsPage}
          onFraudEventsPageSizeChange={fraud.setEventsPageSize}
          onFraudEventsFilterChange={(key, value) => fraud.setEventsFilter(f => ({ ...f, [key]: value }))}
          onApplyFraudEventsFilter={fraud.fetchEvents}
          onResetFraudEventsFilter={() => fraud.setEventsFilter({ eventType: '', severity: '', acknowledged: '', ip: '', startDate: '', endDate: '' })}
          onToggleSelectFraudEvent={fraud.toggleSelectEvent}
          onSelectAllFraudEvents={fraud.selectAllEvents}
          onRiskBatchAction={(action: string) => fraud.riskBatchAction(action as 'revoke_codes' | 'ban_ip' | 'acknowledge')}
          onClearSelectedFraudEvents={() => fraud.toggleSelectEvent(0)}
          onBanIp={() => {}}
          onUnbanIp={async (ip: string) => { try { await fraud.unbanIp(ip) } catch (err: any) { alert(err.message) } }}
          onAcknowledge={fraud.acknowledge}
          onBanIpInputChange={() => {}}
          onBanReasonChange={() => {}}
        />
      )}

      {tab === 'auditLogs' && (
        <AuditLogsTab
          auditLogs={audit.logs}
          auditLogsTotal={audit.total}
          auditLogsPage={audit.page}
          auditLogsPageSize={audit.pageSize}
          auditLogsLoading={audit.loading}
          auditLogsTotalPages={audit.totalPages}
          auditLogsFilter={audit.filter}
          onAuditLogsPageChange={audit.setPage}
          onAuditLogsPageSizeChange={audit.setPageSize}
          onAuditLogsFilterChange={(key, value) => audit.setFilter(f => ({ ...f, [key]: value }))}
          onApplyAuditLogsFilter={audit.fetchLogs}
          onResetAuditLogsFilter={() => audit.setFilter({ startDate: '', endDate: '' })}
        />
      )}

      {tab === 'reports' && (
        <ReportsTab
          reportPeriod={reportPeriod}
          reportExporting={reportExporting as 'monthly' | 'agent' | 'campaign' | null}
          onReportPeriodChange={setReportPeriod}
          onExportReport={async (type: 'monthly' | 'agent' | 'campaign') => {
            const { get } = await import('@/lib/api')
            const { downloadCsvFromData } = await import('./redemption/types')
            setReportExporting(type)
            try {
              const data = await get<{ csv: string }>(`/api/v1/admin/finance/codes/reports/${type}`, { period: reportPeriod })
              downloadCsvFromData(data, `redemption-report-${type}-${reportPeriod}.csv`)
            } catch (err: any) {
              alert(err.message || '导出失败')
            } finally {
              setReportExporting(null)
            }
          }}
        />
      )}

      {tab === 'agentOverview' && (
        <AgentOverview
          agents={agent.overview}
          loading={agent.overviewLoading}
          error={agent.overviewError}
          onViewDetail={(a) => { agent.viewDetail(a); setTab('agentDetail') }}
        />
      )}

      {tab === 'agentDetail' && agent.selectedId && (
        <AgentCodeDetail
          agentName={agent.selectedName}
          codes={agent.codes}
          total={agent.codesTotal}
          page={agent.codesPage}
          pageSize={agent.codesPageSize}
          loading={agent.codesLoading}
          forcingId={agent.forcingId}
          onPageChange={agent.setCodesPage}
          onPageSizeChange={agent.setCodesPageSize}
          onBack={agent.backToOverview}
          onRevoke={async (id: number) => { try { await agent.forceRevoke(id) } catch (err: any) { alert(err.message) } }}
          onDisable={async (id: number) => { try { await agent.forceDisable(id) } catch (err: any) { alert(err.message) } }}
          onExtend={async (id: number) => { try { await agent.forceExtend(id) } catch (err: any) { alert(err.message) } }}
        />
      )}

      {/* Edit modal */}
      {editModalOpen && editingBatch && (
        <BatchEditModal
          batch={editingBatch}
          onClose={() => { setEditModalOpen(false); setEditingBatch(null) }}
          onUpdated={() => { setEditModalOpen(false); setEditingBatch(null); batches.refetch() }}
        />
      )}

      {/* Gift modal */}
      {giftModalCodeId && (
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
