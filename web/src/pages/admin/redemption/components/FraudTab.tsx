import { Loader2, Shield, AlertTriangle, AlertCircle, Ban, Info, Search, X, Trash2, Check } from 'lucide-react'
import PaginationBar from '@/components/ui/PaginationBar'
import type { FraudStats, FraudEvent, BannedIp } from '../types'
import { fraudEventTypeMap, fraudSeverityConfig } from '../types'

interface StatCardProps {
  icon: any
  label: string
  value: string
  sub?: string
  color: string
}

function StatCard({ icon: Icon, label, value, sub, color }: StatCardProps) {
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

interface FraudTabProps {
  fraudStats: FraudStats | null
  fraudStatsLoading: boolean
  fraudEvents: FraudEvent[]
  fraudEventsTotal: number
  fraudEventsPage: number
  fraudEventsPageSize: number
  fraudEventsLoading: boolean
  fraudEventsTotalPages: number
  bannedIps: BannedIp[]
  bannedIpsLoading: boolean
  selectedFraudEventIds: number[]
  fraudEventsFilter: {
    eventType: string
    severity: string
    acknowledged: string
    ip: string
    startDate: string
    endDate: string
  }
  banIpInput: string
  banReason: string
  banningIp: boolean
  acknowledgingId: number | null
  riskActionRunning: boolean
  onFraudEventsPageChange: (page: number) => void
  onFraudEventsPageSizeChange: (size: number) => void
  onFraudEventsFilterChange: (key: string, value: string) => void
  onApplyFraudEventsFilter: () => void
  onResetFraudEventsFilter: () => void
  onToggleSelectFraudEvent: (id: number) => void
  onSelectAllFraudEvents: () => void
  onRiskBatchAction: (action: string) => void
  onClearSelectedFraudEvents: () => void
  onBanIp: () => void
  onUnbanIp: (ip: string) => void
  onAcknowledge: (id: number) => void
  onBanIpInputChange: (value: string) => void
  onBanReasonChange: (value: string) => void
}

export default function FraudTab({
  fraudStats,
  fraudStatsLoading,
  fraudEvents,
  fraudEventsTotal,
  fraudEventsPage,
  fraudEventsPageSize,
  fraudEventsLoading,
  fraudEventsTotalPages,
  bannedIps,
  bannedIpsLoading,
  selectedFraudEventIds,
  fraudEventsFilter,
  banIpInput,
  banReason,
  banningIp,
  acknowledgingId,
  riskActionRunning,
  onFraudEventsPageChange,
  onFraudEventsPageSizeChange,
  onFraudEventsFilterChange,
  onApplyFraudEventsFilter,
  onResetFraudEventsFilter,
  onToggleSelectFraudEvent,
  onSelectAllFraudEvents,
  onRiskBatchAction,
  onClearSelectedFraudEvents,
  onBanIp,
  onUnbanIp,
  onAcknowledge,
  onBanIpInputChange,
  onBanReasonChange,
}: FraudTabProps) {
  return (
    <div className="space-y-6">
      {/* Fraud overview */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
          <Shield size={16} className="text-red-500" />风控概览
        </h3>
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
        <div className="px-4 pt-4">
          <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
            <Info size={16} className="text-blue-500" />风控事件列表
          </h3>
        </div>
        <div className="px-4 border-b border-slate-100 pb-4">
          <div className="flex flex-wrap items-end gap-3">
            {([
              { key: 'eventType', label: '类型', type: 'select', options: [{ v: '', l: '全部' }, { v: 'brute_force', l: '爆破检测' }, { v: 'ip_anomaly', l: 'IP异常' }, { v: 'user_frequency', l: '高频兑换' }, { v: 'high_risk_score', l: '高风险评分' }, { v: 'manual_ban', l: '手动封禁' }] },
              { key: 'severity', label: '严重级别', type: 'select', options: [{ v: '', l: '全部' }, { v: 'warning', l: '警告' }, { v: 'high', l: '高危' }, { v: 'critical', l: '严重' }] },
              { key: 'acknowledged', label: '处理状态', type: 'select', options: [{ v: '', l: '全部' }, { v: 'false', l: '未处理' }, { v: 'true', l: '已处理' }] },
            ] as const).map(({ key, label, options }) => (
              <div key={key}>
                <label className="block text-xs text-slate-500 mb-1">{label}</label>
                <select 
                  value={(fraudEventsFilter as any)[key]} 
                  onChange={(e) => onFraudEventsFilterChange(key, e.target.value)}
                  className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                >
                  {options.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                </select>
              </div>
            ))}
            <div>
              <label className="block text-xs text-slate-500 mb-1">IP 搜索</label>
              <input 
                type="text" 
                value={fraudEventsFilter.ip} 
                onChange={(e) => onFraudEventsFilterChange('ip', e.target.value)}
                placeholder="搜索 IP" 
                className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm w-36 focus:outline-none focus:ring-2 focus:ring-red-500" 
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">起始日期</label>
              <input 
                type="datetime-local" 
                value={fraudEventsFilter.startDate} 
                onChange={(e) => onFraudEventsFilterChange('startDate', e.target.value)}
                className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500" 
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">结束日期</label>
              <input 
                type="datetime-local" 
                value={fraudEventsFilter.endDate} 
                onChange={(e) => onFraudEventsFilterChange('endDate', e.target.value)}
                className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500" 
              />
            </div>
            <div className="flex gap-2">
              <button 
                onClick={onApplyFraudEventsFilter}
                className="flex items-center gap-1 px-3 py-1.5 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 transition"
              >
                <Search size={14} />筛选
              </button>
              <button 
                onClick={onResetFraudEventsFilter}
                className="flex items-center gap-1 px-3 py-1.5 border border-slate-300 text-slate-600 rounded-lg text-sm hover:bg-slate-50 transition"
              >
                <X size={14} />重置
              </button>
            </div>
          </div>
        </div>

        {selectedFraudEventIds.length > 0 && (
          <div className="px-4 pb-2 flex items-center gap-3 bg-red-50 border-b border-red-100">
            <span className="text-sm text-red-700">已选 {selectedFraudEventIds.length} 个事件</span>
            <button 
              onClick={() => onRiskBatchAction('revoke_codes')} 
              disabled={riskActionRunning}
              className="flex items-center gap-1 px-3 py-1.5 bg-red-500 text-white rounded-lg text-xs hover:bg-red-600 disabled:opacity-50 transition"
            >
              {riskActionRunning ? <Loader2 className="animate-spin" size={12} /> : <Trash2 size={12} />}
              批量作废关联码
            </button>
            <button 
              onClick={() => onRiskBatchAction('ban_ip')} 
              disabled={riskActionRunning}
              className="flex items-center gap-1 px-3 py-1.5 bg-orange-500 text-white rounded-lg text-xs hover:bg-orange-600 disabled:opacity-50 transition"
            >
              {riskActionRunning ? <Loader2 className="animate-spin" size={12} /> : <Ban size={12} />}
              批量封禁IP
            </button>
            <button 
              onClick={() => onRiskBatchAction('acknowledge')} 
              disabled={riskActionRunning}
              className="flex items-center gap-1 px-3 py-1.5 bg-green-500 text-white rounded-lg text-xs hover:bg-green-600 disabled:opacity-50 transition"
            >
              {riskActionRunning ? <Loader2 className="animate-spin" size={12} /> : <Check size={12} />}
              批量确认
            </button>
            <button 
              onClick={onClearSelectedFraudEvents}
              className="flex items-center gap-1 px-3 py-1.5 text-slate-500 hover:text-slate-700 text-xs transition"
            >
              <X size={12} />取消
            </button>
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
                    <input 
                      type="checkbox" 
                      checked={selectedFraudEventIds.length === fraudEvents.length && fraudEvents.length > 0}
                      onChange={onSelectAllFraudEvents} 
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
                  const riskPct = Math.min(100, (ev.riskScore / 100) * 100)
                  const riskColor = ev.riskScore >= 80 ? 'bg-red-500' : ev.riskScore >= 50 ? 'bg-orange-500' : 'bg-amber-400'
                  const isSelected = selectedFraudEventIds.includes(ev.id)
                  return (
                    <tr key={ev.id} className={`hover:bg-slate-50 transition ${isSelected ? 'bg-red-50' : ''}`}>
                      <td className="px-4 py-3">
                        <input 
                          type="checkbox" 
                          checked={isSelected} 
                          onChange={() => onToggleSelectFraudEvent(ev.id)} 
                          className="rounded border-slate-300" 
                        />
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{new Date(ev.createdAt).toLocaleString('zh-CN')}</td>
                      <td className="px-4 py-3 text-sm text-slate-700">{fraudEventTypeMap[ev.eventType] || ev.eventType}</td>
                      <td className="px-4 py-3 text-sm font-mono text-slate-600">{ev.ip || '-'}</td>
                      <td className="px-4 py-3 text-sm text-slate-600">{ev.userId ?? '-'}</td>
                      <td className="px-4 py-3 text-sm font-mono text-slate-600 max-w-[100px] truncate" title={ev.code || ''}>
                        {ev.code ? ev.code.substring(0, 16) + (ev.code.length > 16 ? '…' : '') : '-'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 min-w-[80px]">
                          <div className="w-16 h-2 bg-slate-200 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${riskColor}`} style={{ width: `${riskPct}%` }} />
                          </div>
                          <span className="text-xs text-slate-500">{ev.riskScore}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${sevCfg.color}`}>
                          {sevCfg.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {ev.detail ? (
                          <span className="text-xs text-blue-600 cursor-help underline decoration-dotted" title={ev.detail}>
                            {ev.detail.length > 20 ? ev.detail.substring(0, 20) + '…' : ev.detail}
                          </span>
                        ) : <span className="text-xs text-slate-400">-</span>}
                      </td>
                      <td className="px-4 py-3">
                        {ev.acknowledged ? (
                          <span className="inline-flex items-center gap-1 text-xs text-green-600">
                            <Check size={14} />已处理
                          </span>
                        ) : (
                          <button 
                            onClick={() => onAcknowledge(ev.id)} 
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
            onPageChange={onFraudEventsPageChange} 
            pageSize={fraudEventsPageSize} 
            onPageSizeChange={onFraudEventsPageSizeChange} 
            total={fraudEventsTotal} 
            totalPages={fraudEventsTotalPages} 
          />
        )}
      </div>

      {/* IP bans */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 space-y-4">
        <div className="px-4 pt-4">
          <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
            <Ban size={16} className="text-slate-600" />IP 封禁管理
          </h3>
        </div>
        <div className="px-4 border-b border-slate-100 pb-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">IP 地址</label>
              <input 
                type="text" 
                value={banIpInput} 
                onChange={(e) => onBanIpInputChange(e.target.value)}
                placeholder="例如：192.168.1.1" 
                className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm w-44 focus:outline-none focus:ring-2 focus:ring-red-500" 
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">封禁原因（可选）</label>
              <input 
                type="text" 
                value={banReason} 
                onChange={(e) => onBanReasonChange(e.target.value)}
                placeholder="封禁原因" 
                className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm w-52 focus:outline-none focus:ring-2 focus:ring-red-500" 
              />
            </div>
            <div className="flex gap-2">
              <button 
                onClick={onBanIp} 
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
                      <button 
                        onClick={() => onUnbanIp(bip.ip)}
                        className="flex items-center gap-1 text-xs px-2.5 py-1 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
                      >
                        <Check size={14} />解封
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
  )
}