import { useEffect, useState, useCallback } from 'react'
import { get, downloadUrl } from '@/lib/api'
import PaginationBar from '@/components/ui/PaginationBar'
import {
  BarChart3, TrendingDown, Calendar, RefreshCw, ArrowDownRight,
  MinusCircle, PlusCircle, RotateCcw, Wallet,
  Filter, Download,
} from 'lucide-react'

// ── Types ──

interface SettlementData {
  period: string
  openingBalance: number
  monthDeduction: number
  monthFreeze: number
  monthUnfreeze: number
  monthRefund: number
  closingBalance: number
}

interface LedgerEntry {
  id: number
  balanceType: string
  changeType: string
  amount: number
  balanceBefore: number
  balanceAfter: number
  refType: string | null
  refId: number | null
  refCodeId: number | null
  remark: string | null
  createdAt: string
}

// ── Tab Enum ──

type TabKey = 'settlement' | 'ledger'

// ── Labels ──

const CHANGE_TYPE_LABEL: Record<string, string> = {
  deduction: '扣费',
  freeze: '冻结',
  unfreeze: '解冻',
  refund: '退款',
}

const BALANCE_TYPE_LABEL: Record<string, string> = {
  available: '可用余额',
  frozen: '冻结余额',
}

const CHANGE_TYPE_ICON: Record<string, any> = {
  deduction: ArrowDownRight,
  freeze: MinusCircle,
  unfreeze: PlusCircle,
  refund: RotateCcw,
}

const CHANGE_TYPE_COLOR: Record<string, string> = {
  deduction: 'text-red-600',
  freeze: 'text-amber-600',
  unfreeze: 'text-green-600',
  refund: 'text-blue-600',
}

function formatAmount(v: number | string): string {
  const n = typeof v === 'string' ? parseFloat(v) : v
  if (isNaN(n)) return '0.00'
  return n.toFixed(4)
}

// Format micro-unit amounts (1/1,000,000 yuan) to yuan
function fmtMicro(v: number): string {
  return (v / 1_000_000).toFixed(4)
}

// ════════════════════════════════════════════

// ── 财务对账（代理商）─-
//
// 【业务说明】
//   代理商月度财务对账面板，包含两个标签页：
//   1. 月度对账：选择月份查看期初余额、本月扣费/冻结/解冻/退款变动、期末余额，
//      支持按日期范围导出 CSV 对账单
//   2. 资金流水：按余额类型和变动类型筛选的账务明细，支持 CSV 导出
//
// 【权限要求】角色=agent
// 【数据来源】GET /api/v1/agent/finance/settlement?period=, GET /api/v1/agent/finance/ledger

export default function AgentReconciliation() {
  const [activeTab, setActiveTab] = useState<TabKey>('settlement')

  const tabs: { key: TabKey; label: string; icon: any }[] = [
    { key: 'settlement', label: '月度对账', icon: BarChart3 },
    { key: 'ledger', label: '资金流水', icon: Wallet },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <BarChart3 size={28} className="text-indigo-600" />
        <h1 className="text-2xl font-bold text-slate-900">财务对账</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === t.key
                ? 'bg-white text-indigo-600 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <t.icon size={16} />
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'settlement' ? <SettlementPanel /> : <LedgerPanel />}
    </div>
  )
}

// ════════════════════════════════════════════
//  月度对账面板
// ════════════════════════════════════════════

function SettlementPanel() {
  const [period, setPeriod] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const [data, setData] = useState<SettlementData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Date range filters for export
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  const fetchSettlement = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await get<any>(`/api/v1/agent/finance/settlement?period=${period}`)
      // map backend response {account, monthSummary, recentEntries} -> SettlementData
      if (res?.account && res?.monthSummary) {
        const settled = parseFloat(res.account.settledCommission ?? '0')
        const pending = parseFloat(res.account.pendingWithdraw ?? '0')
        const frozen = parseFloat(res.account.frozenAmount ?? '0')
        const locked = parseFloat(res.account.redemptionLocked ?? '0')
        const available = parseFloat(res.account.available ?? '0')
        setData({
          period,
          openingBalance: settled,
          monthDeduction: Math.abs(res.monthSummary.deduction ?? 0),
          monthFreeze: Math.abs(res.monthSummary.freeze ?? 0),
          monthUnfreeze: Math.abs(res.monthSummary.unfreeze ?? 0),
          monthRefund: 0,
          closingBalance: available,
        })
      } else {
        setData(null)
      }
    } catch (e: any) {
      setError(e.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }, [period])

  useEffect(() => { fetchSettlement() }, [fetchSettlement])

  const items = data ? [
    { label: '期初余额', value: formatAmount(data.openingBalance), color: 'text-slate-700' },
    { label: '本月扣费', value: `-${formatAmount(data.monthDeduction)}`, color: 'text-red-600' },
    { label: '本月冻结', value: `-${formatAmount(data.monthFreeze)}`, color: 'text-amber-600' },
    { label: '本月解冻', value: data.monthUnfreeze > 0 ? `+${formatAmount(data.monthUnfreeze)}` : formatAmount(data.monthUnfreeze), color: 'text-green-600' },
    { label: '本月退款', value: data.monthRefund > 0 ? `+${formatAmount(data.monthRefund)}` : formatAmount(data.monthRefund), color: 'text-blue-600' },
    { label: '期末余额', value: formatAmount(data.closingBalance), color: 'text-indigo-600 font-bold' },
  ] : []

  // Generate month options for the last 12 months
  const monthOptions = (() => {
    const now = new Date()
    const opts: { value: string; label: string }[] = []
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      opts.push({
        value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        label: `${d.getFullYear()}年${d.getMonth() + 1}月`,
      })
    }
    return opts
  })()

  const handleExportCSV = () => {
    const params = new URLSearchParams()
    params.set('period', period)
    if (startDate) params.set('startDate', startDate)
    if (endDate) params.set('endDate', endDate)
    const filename = `对账报表_${period}${startDate ? '_' + startDate : ''}${endDate ? '_' + endDate : ''}.csv`
    downloadUrl(`/api/v1/agent/finance/settlement/export?${params.toString()}`, filename).catch(() => {
      // fallback: open in new tab
      const token = localStorage.getItem('accessToken')
      window.open(`/api/v1/agent/finance/settlement/export?${params.toString()}&token=${encodeURIComponent(token || '')}`, '_blank')
    })
  }

  return (
    <div className="space-y-6">
      {/* Month selector + Date range + Export */}
      <div className="flex flex-wrap items-center gap-3">
        <Calendar size={16} className="text-slate-500" />
        <select
          value={period}
          onChange={e => setPeriod(e.target.value)}
          className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
        >
          {monthOptions.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <div className="h-6 w-px bg-slate-200" />
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">起始</span>
          <input
            type="date"
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
            className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500 text-xs w-36"
          />
          <span className="text-xs text-slate-500">结束</span>
          <input
            type="date"
            value={endDate}
            onChange={e => setEndDate(e.target.value)}
            className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500 text-xs w-36"
          />
        </div>
        <div className="flex-1" />
        <button
          onClick={handleExportCSV}
          className="flex items-center gap-1 px-3 py-2 text-sm text-green-700 border border-green-300 rounded-lg hover:bg-green-50 transition"
        >
          <Download size={14} /> 导出 CSV
        </button>
        <button
          onClick={fetchSettlement}
          disabled={loading}
          className="flex items-center gap-1 px-3 py-2 text-sm text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          刷新
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <RefreshCw size={24} className="animate-spin text-slate-400" />
        </div>
      ) : data ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((item, i) => (
            <div
              key={i}
              className={`bg-white border border-slate-200 rounded-xl p-5 ${i === items.length - 1 ? 'ring-2 ring-indigo-500' : ''}`}
            >
              <div className="text-sm text-slate-500 mb-2">{item.label}</div>
              <div className={`text-xl ${item.color}`}>
                ¥ {item.value}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 text-slate-400">
          暂无对账数据
        </div>
      )}
    </div>
  )
}

// ════════════════════════════════════════════
//  资金流水面板
// ════════════════════════════════════════════

function LedgerPanel() {
  const [list, setList] = useState<LedgerEntry[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  const [loading, setLoading] = useState(false)
  const [balanceType, setBalanceType] = useState('')
  const [changeType, setChangeType] = useState('')

  const fetchLedger = useCallback(async (p: number) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(p), pageSize: String(pageSize) })
      if (balanceType) params.set('balanceType', balanceType)
      if (changeType) params.set('changeType', changeType)
      const res = await get<any>(`/api/v1/agent/finance/ledger?${params.toString()}`)
      setList(res?.list ?? [])
      setTotal(res?.total ?? 0)
    } catch (e: any) {
      console.error('Failed to load ledger', e)
    } finally {
      setLoading(false)
    }
  }, [pageSize, balanceType, changeType])

  useEffect(() => {
    setPage(1)
    fetchLedger(1)
  }, [balanceType, changeType])

  useEffect(() => {
    fetchLedger(page)
  }, [page])

  const totalPages = Math.ceil(total / pageSize)

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Filter size={14} className="text-slate-500" />
          <select
            value={balanceType}
            onChange={e => setBalanceType(e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm"
          >
            <option value="">全部余额类型</option>
            <option value="available">可用余额</option>
            <option value="frozen">冻结余额</option>
          </select>
          <select
            value={changeType}
            onChange={e => setChangeType(e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm"
          >
            <option value="">全部变更类型</option>
            <option value="deduction">扣费</option>
            <option value="freeze">冻结</option>
            <option value="unfreeze">解冻</option>
            <option value="refund">退款</option>
          </select>
        </div>
        <button
          onClick={() => fetchLedger(page)}
          disabled={loading}
          className="flex items-center gap-1 px-3 py-1.5 text-sm text-slate-500 hover:text-slate-700"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12">
            <RefreshCw size={24} className="animate-spin text-slate-400" />
          </div>
        ) : list.length === 0 ? (
          <div className="text-center py-12 text-slate-400">暂无资金流水记录</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="text-left px-4 py-3 font-medium text-slate-600">时间</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">类型</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">余额类型</th>
                    <th className="text-right px-4 py-3 font-medium text-slate-600">金额</th>
                    <th className="text-right px-4 py-3 font-medium text-slate-600">变更前</th>
                    <th className="text-right px-4 py-3 font-medium text-slate-600">变更后</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">备注</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map(entry => {
                    const IconComp = CHANGE_TYPE_ICON[entry.changeType]
                    return (
                      <tr key={entry.id} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                          {new Date(entry.createdAt).toLocaleString('zh-CN')}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 text-xs font-medium ${CHANGE_TYPE_COLOR[entry.changeType] || 'text-slate-600'}`}>
                            {IconComp && <IconComp size={12} />}
                            {CHANGE_TYPE_LABEL[entry.changeType] || entry.changeType}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-600 text-xs">
                          {BALANCE_TYPE_LABEL[entry.balanceType] || entry.balanceType}
                        </td>
                        <td className={`px-4 py-3 text-right font-mono text-xs ${entry.amount < 0 ? 'text-red-600' : 'text-green-600'}`}>
                          {entry.amount > 0 ? '+' : ''}{fmtMicro(entry.amount)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-xs text-slate-500">
                          {fmtMicro(entry.balanceBefore)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-xs text-slate-700">
                          {fmtMicro(entry.balanceAfter)}
                        </td>
                        <td className="px-4 py-3 text-slate-500 text-xs max-w-[200px] truncate" title={entry.remark || ''}>
                          {entry.remark || '-'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="px-4 py-3 border-t border-slate-200">
                <PaginationBar page={page} onPageChange={setPage} pageSize={pageSize} onPageSizeChange={() => {}} total={total} totalPages={totalPages} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
