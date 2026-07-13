import { useEffect, useState, useCallback, useRef } from 'react'
import { get, downloadUrl } from '@/lib/api'
import type { AgentCommission, AgentCommissionSummary, PaginatedData } from '@/types'
import { usePagePreferences } from '@/hooks/use-page-preferences'
import PaginationBar from '@/components/ui/PaginationBar'
import {
  Loader2, AlertCircle,
  DollarSign, TrendingUp, Clock, CheckCircle2,
  Search, Download, X, Info, FileText, ArrowUpRight,
} from 'lucide-react'

// ── helpers ──

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  settled: 'bg-green-50 text-green-700 border-green-200',
  cancelled: 'bg-slate-50 text-slate-500 border-slate-200',
}
const STATUS_LABEL: Record<string, string> = {
  pending: '待结算',
  settled: '已结算',
  cancelled: '已取消',
}

const TYPE_OPTIONS = [
  { value: '', label: '全部类型' },
  { value: 'sale', label: '销售佣金' },
  { value: 'team', label: '团队佣金' },
  { value: 'activity', label: '活动奖励' },
  { value: 'renewal', label: '续费佣金' },
]

const STATUS_OPTIONS = [
  { value: '', label: '全部状态' },
  { value: 'pending', label: '待结算' },
  { value: 'settled', label: '已结算' },
  { value: 'cancelled', label: '已取消' },
]

function fmt4(v: string | number | null | undefined): string {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '0'))
  return n.toFixed(4)
}

function fmt2(v: string | number | null | undefined): string {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '0'))
  return n.toFixed(2)
}

// ══════════════════════════════════════════════
//  Detail Drawer Component
// ══════════════════════════════════════════════

function DetailDrawer({
  commission,
  open,
  onClose,
}: {
  commission: AgentCommission | null
  open: boolean
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    if (open) document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node) && (e.target as HTMLElement).closest('.drawer-overlay')) {
        onClose()
      }
    }
    if (open) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open, onClose])

  if (!commission) return null

  const calc = commission.calcDetail
  const rule = commission.ruleSnapshot

  return (
    <div
      className={`fixed inset-0 z-50 transition-opacity duration-300 ${open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
    >
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/30 drawer-overlay" />

      {/* Drawer panel */}
      <div
        ref={ref}
        className={`absolute top-0 right-0 h-full w-full max-w-lg bg-white shadow-2xl transition-transform duration-300 overflow-y-auto ${open ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-slate-200 px-5 py-4 flex items-center justify-between z-10">
          <h2 className="text-lg font-semibold text-slate-900">佣金详情</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-100 transition">
            <X size={20} />
          </button>
        </div>

        <div className="p-5 space-y-6">
          {/* 客户信息 */}
          <section>
            <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">客户信息</h3>
            <div className="bg-slate-50 rounded-lg p-4 space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-slate-500">昵称</span>
                <span className="text-sm font-medium text-slate-800">{commission.customerName || '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-slate-500">邮箱</span>
                <span className="text-sm text-slate-700">{commission.customerEmail || '-'}</span>
              </div>
              {commission.sourceOrderId && (
                <div className="flex justify-between">
                  <span className="text-sm text-slate-500">关联订单</span>
                  <span className="text-sm font-mono text-slate-700">{commission.sourceOrderId}</span>
                </div>
              )}
            </div>
          </section>

          {/* 计算明细 */}
          <section>
            <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">计算明细</h3>
            <div className="bg-slate-50 rounded-lg p-4 space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-slate-500">调用成本</span>
                <span className="text-sm font-medium text-slate-800">¥{fmt4(commission.callCost)}</span>
              </div>
              {calc && (
                <>
                  {calc.inputTokens && (
                    <div className="flex justify-between text-xs text-slate-400">
                      <span>输入 Tokens</span>
                      <span>{calc.inputTokens}</span>
                    </div>
                  )}
                  {calc.outputTokens && (
                    <div className="flex justify-between text-xs text-slate-400">
                      <span>输出 Tokens</span>
                      <span>{calc.outputTokens}</span>
                    </div>
                  )}
                </>
              )}
              {commission.feeRate && (
                <div className="flex justify-between">
                  <span className="text-sm text-slate-500">手续费率</span>
                  <span className="text-sm text-slate-700">{commission.feeRate}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-sm text-slate-500">手续费</span>
                <span className="text-sm text-slate-700">-¥{fmt4(commission.feeAmount)}</span>
              </div>
              <div className="border-t border-slate-200 pt-2 flex justify-between">
                <span className="text-sm font-semibold text-slate-700">净佣金</span>
                <span className="text-sm font-semibold text-green-600">+¥{fmt4(commission.netAmount)}</span>
              </div>
            </div>
          </section>

          {/* 规则快照 */}
          {rule && (
            <section>
              <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">分佣规则</h3>
              <div className="bg-blue-50/60 rounded-lg p-4">
                {rule.commissionRate != null && (
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">分佣比例</span>
                    <span className="font-medium text-blue-700">{(Number(rule.commissionRate) * 100).toFixed(1)}%</span>
                  </div>
                )}
                {rule.ruleName && (
                  <div className="flex justify-between text-sm mt-1">
                    <span className="text-slate-500">规则名称</span>
                    <span className="text-slate-700">{rule.ruleName}</span>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* 基本信息 */}
          <section>
            <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">基本信息</h3>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-slate-500">类型</span>
                <span className="text-sm font-medium">{commission.commissionTypeLabel}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-500">状态</span>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_BADGE[commission.status] || ''}`}>
                  {commission.status === 'settled' && <CheckCircle2 size={12} />}
                  {STATUS_LABEL[commission.status] || commission.status}
                </span>
              </div>
              {commission.voucherNo && (
                <div className="flex justify-between">
                  <span className="text-sm text-slate-500">凭证号</span>
                  <span className="text-sm font-mono text-slate-700">{commission.voucherNo}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-sm text-slate-500">创建时间</span>
                <span className="text-sm text-slate-700">{new Date(commission.createdAt).toLocaleString('zh-CN')}</span>
              </div>
              {commission.settledAt && (
                <div className="flex justify-between">
                  <span className="text-sm text-slate-500">结算时间</span>
                  <span className="text-sm text-slate-700">{new Date(commission.settledAt).toLocaleString('zh-CN')}</span>
                </div>
              )}
            </div>
          </section>

          {/* 查看关联客户订单 */}
          {commission.sourceCustomerId && (
            <a
              href={`/agent/clients`}
              className="flex items-center justify-center gap-1 w-full py-2.5 text-sm text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition font-medium"
            >
              查看该客户全部订单 <ArrowUpRight size={14} />
            </a>
          )}
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════
//  Main Page
// ══════════════════════════════════════════════

// ── 佣金记录（代理商）─-
//
// 【业务说明】
//   代理商佣金明细，支持按类型（销售/团队/活动/续费）、状态（待结算/已结算/已取消）、
//   日期范围和客户名称筛选。顶部汇总卡片展示累计/待结算/已结算金额。
//   点击行可打开详情抽屉查看该笔佣金的完整信息（来源客户、关联订单、结算时间）。
//
// 【权限要求】角色=agent
// 【数据来源】GET /api/v1/agent/commissions, GET /api/v1/agent/commissions/summary

export default function AgentCommissions() {
  const [rows, setRows] = useState<AgentCommission[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // 汇总
  const [summary, setSummary] = useState<AgentCommissionSummary | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(true)

  // 筛选
  const [statusFilter, setStatusFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [customerSearch, setCustomerSearch] = useState('')

  // 详情抽屉
  const [detailCommission, setDetailCommission] = useState<AgentCommission | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)

  const { filters, loaded: prefsLoaded, updateFilter } = usePagePreferences('agent_commissions')

  // 恢复筛选
  useEffect(() => {
    if (prefsLoaded && filters) {
      if (filters.status) setStatusFilter(filters.status)
      if (filters.type) setTypeFilter(filters.type)
      if (filters.startDate) setStartDate(filters.startDate)
      if (filters.endDate) setEndDate(filters.endDate)
      if (filters.customerSearch) setCustomerSearch(filters.customerSearch)
    }
  }, [prefsLoaded])

  const totalPages = Math.ceil(total / pageSize)

  // 构建查询参数
  const buildParams = useCallback(() => {
    const params: Record<string, string | number> = { page, pageSize }
    if (statusFilter) params.status = statusFilter
    if (typeFilter) params.commissionType = typeFilter
    if (startDate) params.startDate = startDate
    if (endDate) params.endDate = endDate
    if (customerSearch) params.customerSearch = customerSearch
    return params
  }, [page, pageSize, statusFilter, typeFilter, startDate, endDate, customerSearch])

  // 获取列表
  const fetchData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await get<PaginatedData<AgentCommission>>('/api/v1/agent/commissions', buildParams())
      setRows(res.list)
      setTotal(res.total)
    } catch (err: any) {
      setError(err.message || '获取佣金记录失败')
    } finally {
      setLoading(false)
    }
  }, [buildParams])

  // 获取汇总
  const fetchSummary = useCallback(async () => {
    setSummaryLoading(true)
    try {
      const res = await get<AgentCommissionSummary>('/api/v1/agent/commissions/summary')
      setSummary(res)
    } catch {
      // 静默失败，不影响主列表
    } finally {
      setSummaryLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])
  useEffect(() => { fetchSummary() }, [fetchSummary])

  // 重新获取（含分页重置）
  const handleSearch = () => {
    setPage(1)
    updateFilter('status', statusFilter)
    updateFilter('type', typeFilter)
    updateFilter('startDate', startDate)
    updateFilter('endDate', endDate)
    updateFilter('customerSearch', customerSearch)
  }

  const handleReset = () => {
    setStatusFilter('')
    setTypeFilter('')
    setStartDate('')
    setEndDate('')
    setCustomerSearch('')
    setPage(1)
  }

  // 导出 CSV
  const handleExport = async () => {
    try {
      const params = new URLSearchParams()
      if (statusFilter) params.set('status', statusFilter)
      if (typeFilter) params.set('commissionType', typeFilter)
      if (startDate) params.set('startDate', startDate)
      if (endDate) params.set('endDate', endDate)
      const qs = params.toString()
      await downloadUrl(
        `/api/v1/agent/commissions/export${qs ? '?' + qs : ''}`,
        `commission_export_${Date.now()}.csv`,
      )
    } catch (err: any) {
      setError(err.message || '导出失败')
    }
  }

  // 打开详情
  const openDetail = (row: AgentCommission) => {
    setDetailCommission(row)
    setDrawerOpen(true)
  }

  // 汇总卡片配置
  const summaryCards = [
    {
      label: '累计佣金',
      value: summary ? `¥${fmt2(summary.totalCommission)}` : '-',
      icon: DollarSign,
      color: 'text-green-600',
      bg: 'bg-green-50',
    },
    {
      label: '本月佣金',
      value: summary ? `¥${fmt2(summary.monthCommission)}` : '-',
      sub: summary ? `${summary.monthCount} 笔` : '',
      icon: TrendingUp,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
    },
    {
      label: '待结算',
      value: summary ? `¥${fmt2(summary.pendingAmount)}` : '-',
      sub: summary ? `${summary.pendingCount} 笔` : '',
      icon: Clock,
      color: 'text-amber-600',
      bg: 'bg-amber-50',
    },
    {
      label: '已结算',
      value: summary ? `¥${fmt2(summary.settledAmount)}` : '-',
      sub: summary ? `${summary.settledCount} 笔` : '',
      icon: CheckCircle2,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
    },
  ]

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">分佣记录</h1>

      {error && (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm">
          <AlertCircle size={16} />
          {error}
          <button onClick={() => setError('')} className="ml-auto p-0.5 hover:bg-red-100 rounded">
            <X size={14} />
          </button>
        </div>
      )}

      {/* ── 汇总卡片 ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {summaryCards.map((card) => (
          <div key={card.label} className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${card.bg}`}>
                {summaryLoading ? (
                  <Loader2 size={20} className={`animate-spin ${card.color}`} />
                ) : (
                  <card.icon size={20} className={card.color} />
                )}
              </div>
              <div>
                <p className="text-xs text-slate-500">{card.label}</p>
                <p className={`text-xl font-bold ${card.color}`}>{card.value}</p>
                {card.sub && <p className="text-[10px] text-slate-400 mt-0.5">{card.sub}</p>}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── 筛选区 ── */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
        <div className="flex flex-wrap items-end gap-3">
          {/* 状态 */}
          <div>
            <label className="block text-xs text-slate-500 mb-1">状态</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[100px]"
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* 类型 */}
          <div>
            <label className="block text-xs text-slate-500 mb-1">类型</label>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[120px]"
            >
              {TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* 日期范围 */}
          <div>
            <label className="block text-xs text-slate-500 mb-1">开始日期</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">结束日期</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* 客户搜索 */}
          <div>
            <label className="block text-xs text-slate-500 mb-1">客户</label>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                placeholder="客户昵称/邮箱"
                className="pl-8 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-44"
              />
            </div>
          </div>

          {/* 按钮 */}
          <div className="flex gap-2">
            <button
              onClick={handleSearch}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition"
            >
              查询
            </button>
            <button
              onClick={handleReset}
              className="px-4 py-2 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition"
            >
              重置
            </button>
            <button
              onClick={handleExport}
              className="flex items-center gap-1 px-4 py-2 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition"
            >
              <Download size={14} />
              导出
            </button>
          </div>
        </div>
      </div>

      {/* ── 表格 ── */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 text-left">
                <th className="px-4 py-3 text-sm font-medium text-slate-500">ID</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">客户</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">调用成本</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">佣金金额</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">净佣金</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">类型</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">状态</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">凭证号</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">创建时间</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr><td colSpan={10} className="text-center py-16"><Loader2 className="animate-spin inline-block" size={24} /></td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={10} className="text-center py-16 text-slate-400">暂无佣金记录</td></tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50 transition">
                    <td className="px-4 py-3 text-sm text-slate-600">{r.id}</td>
                    <td className="px-4 py-3">
                      <div>
                        <p className="text-sm text-slate-800">{r.customerName || '-'}</p>
                        {r.customerEmail && <p className="text-xs text-slate-400">{r.customerEmail}</p>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">¥{fmt4(r.callCost)}</td>
                    <td className="px-4 py-3 text-sm font-medium text-green-600">¥{fmt4(r.commissionAmount)}</td>
                    <td className="px-4 py-3 text-sm text-slate-700">¥{fmt4(r.netAmount)}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{r.commissionTypeLabel || '-'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_BADGE[r.status] || 'bg-slate-100 text-slate-700'}`}>
                        {r.status === 'settled' && <CheckCircle2 size={11} />}
                        {STATUS_LABEL[r.status] || r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs font-mono text-slate-500">{r.voucherNo || '-'}</td>
                    <td className="px-4 py-3 text-sm text-slate-500 whitespace-nowrap">
                      {new Date(r.createdAt).toLocaleString('zh-CN')}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => openDetail(r)}
                        className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 transition"
                      >
                        <Info size={13} />
                        详情
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* ── 增强分页：条数选择 + 跳转 + 前后翻 ── */}
        {total > 0 && (
          <PaginationBar
            page={page}
            onPageChange={setPage}
            pageSize={pageSize}
            onPageSizeChange={setPageSize}
            total={total}
            totalPages={totalPages}
          />
        )}
      </div>

      {/* ── 详情抽屉 ── */}
      <DetailDrawer
        commission={detailCommission}
        open={drawerOpen}
        onClose={() => { setDrawerOpen(false); setDetailCommission(null) }}
      />
    </div>
  )
}
