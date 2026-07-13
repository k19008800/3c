import { useEffect, useState, useCallback } from 'react'
import { get } from '@/lib/api'
import PaginationBar from '@/components/ui/PaginationBar'
import {
  Loader2, Wallet, DollarSign, TrendingUp, TrendingDown, Minus,
  ArrowUpRight, ArrowDownRight, AlertCircle, RefreshCw, CalendarDays, Ban, Lock,
} from 'lucide-react'

// ── Types ──

interface SettlementData {
  account: {
    settledCommission: string
    pendingWithdraw: string
    frozenAmount: string
    redemptionLocked: string
    available: string
  }
  monthSummary: {
    deduction: number
    freeze: number
    unfreeze: number
    netChange: number
  }
  recentEntries: LedgerEntry[]
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
  remark: string | null
  createdAt: string
}

interface LedgerQueryResult {
  list: LedgerEntry[]
  total: number
  page: number
  pageSize: number
}

const balanceTypeMap: Record<string, string> = {
  commission: '佣金',
  redemption: '兑换',
  withdraw: '提现',
  deduction: '扣款',
  freeze: '冻结',
  unfreeze: '解冻',
  refund: '退款',
  adjustment: '调整',
}

const changeTypeMap: Record<string, { label: string; color: string; icon: any }> = {
  commission: { label: '佣金收入', color: 'text-green-600', icon: TrendingUp },
  deduction: { label: '扣款', color: 'text-red-600', icon: TrendingDown },
  freeze: { label: '冻结', color: 'text-orange-600', icon: Ban },
  unfreeze: { label: '解冻', color: 'text-green-600', icon: Lock },
  refund: { label: '退款', color: 'text-blue-600', icon: ArrowUpRight },
  withdraw: { label: '提现', color: 'text-red-600', icon: ArrowDownRight },
  adjustment: { label: '调整', color: 'text-purple-600', icon: Minus },
}

// ── Main Component ──

// ── 财务管理（代理商）─-
//
// 【业务说明】
//   代理商财务面板，包含两个标签页：
//   1. 结算单：展示账户余额概览（已结算佣金/待提现/冻结金额/兑换锁定额/可用余额），
//      以及本月变动汇总（扣款/冻结/解冻/净变动）
//   2. 资金流水：按余额类型和变动类型筛选的账务明细列表
//
// 【权限要求】角色=agent
// 【数据来源】GET /api/v1/agent/finance/settlement, GET /api/v1/agent/finance/ledger

export default function AgentFinance() {
  const [tab, setTab] = useState<'settlement' | 'ledger'>('settlement')

  // Settlement state
  const [settlement, setSettlement] = useState<SettlementData | null>(null)
  const [settlementLoading, setSettlementLoading] = useState(true)
  const [settlementError, setSettlementError] = useState('')

  // Ledger state
  const [ledger, setLedger] = useState<LedgerEntry[]>([])
  const [ledgerTotal, setLedgerTotal] = useState(0)
  const [ledgerPage, setLedgerPage] = useState(1)
  const [ledgerPageSize, setLedgerPageSize] = useState(20)
  const [ledgerLoading, setLedgerLoading] = useState(false)
  const [ledgerError, setLedgerError] = useState('')
  const [ledgerFilter, setLedgerFilter] = useState({ balanceType: '', changeType: '' })

  const ledgerTotalPages = Math.ceil(ledgerTotal / ledgerPageSize)

  // ── Fetch Settlement ──

  const fetchSettlement = useCallback(async () => {
    setSettlementLoading(true)
    setSettlementError('')
    try {
      const data = await get<SettlementData>('/api/v1/agent/finance/settlement')
      setSettlement(data)
    } catch (err: any) {
      setSettlementError(err.message || '获取结算单失败')
    } finally {
      setSettlementLoading(false)
    }
  }, [])

  // ── Fetch Ledger ──

  const fetchLedger = useCallback(async () => {
    setLedgerLoading(true)
    setLedgerError('')
    try {
      const params: any = { page: ledgerPage, pageSize: ledgerPageSize }
      if (ledgerFilter.balanceType) params.balanceType = ledgerFilter.balanceType
      if (ledgerFilter.changeType) params.changeType = ledgerFilter.changeType
      const data = await get<LedgerQueryResult>('/api/v1/agent/finance/ledger', params)
      setLedger(data.list || [])
      setLedgerTotal(data.total)
    } catch (err: any) {
      setLedgerError(err.message || '获取资金流水失败')
    } finally {
      setLedgerLoading(false)
    }
  }, [ledgerPage, ledgerPageSize, ledgerFilter])

  useEffect(() => {
    if (tab === 'settlement') fetchSettlement()
  }, [fetchSettlement, tab])

  useEffect(() => {
    if (tab === 'ledger') fetchLedger()
  }, [fetchLedger, tab])

  const formatAmount = (val: string | number) => {
    const n = typeof val === 'string' ? parseFloat(val) : val
    return n.toFixed(6)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Wallet size={28} className="text-green-600" />
        <h1 className="text-2xl font-bold text-slate-900">财务管理</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-lg w-fit">
        {(['settlement', 'ledger'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-md text-sm transition ${tab === t ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            {t === 'settlement' ? '结算单' : '资金流水'}
          </button>
        ))}
      </div>

      {/* Tab: Settlement */}
      {tab === 'settlement' && (
        <div className="space-y-6">
          {settlementLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="animate-spin" size={24} />
            </div>
          ) : settlementError ? (
            <div className="flex items-center gap-2 text-red-600 bg-red-50 p-4 rounded-lg text-sm">
              <AlertCircle size={16} /> {settlementError}
            </div>
          ) : settlement ? (
            <>
              {/* Account overview cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white rounded-xl p-6 shadow-sm border border-green-200">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm text-slate-500">可用余额</p>
                      <p className="text-2xl font-bold text-green-600 mt-1">¥{formatAmount(settlement.account.available)}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-green-500">
                      <Wallet size={24} className="text-white" />
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm text-slate-500">已结算佣金</p>
                      <p className="text-2xl font-bold text-blue-600 mt-1">¥{formatAmount(settlement.account.settledCommission)}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-blue-500">
                      <DollarSign size={24} className="text-white" />
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm text-slate-500">提现处理中</p>
                      <p className="text-2xl font-bold text-amber-600 mt-1">¥{formatAmount(settlement.account.pendingWithdraw)}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-amber-500">
                      <TrendingUp size={24} className="text-white" />
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm text-slate-500">冻结金额</p>
                      <p className="text-2xl font-bold text-orange-600 mt-1">¥{formatAmount(settlement.account.frozenAmount)}</p>
                      <p className="text-xs text-slate-400 mt-1">兑换码锁定: ¥{formatAmount(settlement.account.redemptionLocked)}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-orange-500">
                      <Lock size={24} className="text-white" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Monthly summary */}
              <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
                <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2 mb-4">
                  <CalendarDays size={16} className="text-blue-500" />
                  本月汇总（近30天）
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center p-4 bg-red-50 rounded-lg">
                    <p className="text-xs text-red-500 font-medium">扣款</p>
                    <p className="text-lg font-bold text-red-600 mt-1">¥{settlement.monthSummary.deduction.toFixed(2)}</p>
                  </div>
                  <div className="text-center p-4 bg-orange-50 rounded-lg">
                    <p className="text-xs text-orange-500 font-medium">冻结</p>
                    <p className="text-lg font-bold text-orange-600 mt-1">¥{settlement.monthSummary.freeze.toFixed(2)}</p>
                  </div>
                  <div className="text-center p-4 bg-green-50 rounded-lg">
                    <p className="text-xs text-green-500 font-medium">解冻/退款</p>
                    <p className="text-lg font-bold text-green-600 mt-1">¥{settlement.monthSummary.unfreeze.toFixed(2)}</p>
                  </div>
                  <div className="text-center p-4 bg-blue-50 rounded-lg">
                    <p className="text-xs text-blue-500 font-medium">净变化</p>
                    <p className={`text-lg font-bold mt-1 ${settlement.monthSummary.netChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {settlement.monthSummary.netChange >= 0 ? '+' : ''}{settlement.monthSummary.netChange.toFixed(2)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Recent entries */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-200">
                <div className="px-6 pt-6 pb-0 flex items-center gap-2">
                  <RefreshCw size={16} className="text-slate-400" />
                  <h3 className="text-sm font-semibold text-slate-800">最近流水</h3>
                </div>
                {settlement.recentEntries.length === 0 ? (
                  <div className="py-12 text-center text-slate-400 text-sm">暂无流水记录</div>
                ) : (
                  <div className="overflow-x-auto mt-2">
                    <table className="w-full">
                      <thead>
                        <tr className="bg-slate-50 text-left">
                          <th className="px-4 py-3 text-sm font-medium text-slate-500">时间</th>
                          <th className="px-4 py-3 text-sm font-medium text-slate-500">类型</th>
                          <th className="px-4 py-3 text-sm font-medium text-slate-500">变动</th>
                          <th className="px-4 py-3 text-sm font-medium text-slate-500">变动前</th>
                          <th className="px-4 py-3 text-sm font-medium text-slate-500">变动后</th>
                          <th className="px-4 py-3 text-sm font-medium text-slate-500">备注</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {settlement.recentEntries.map(entry => {
                          const cfg = changeTypeMap[entry.changeType] || { label: entry.changeType, color: 'text-slate-600', icon: Minus }
                          const Icon = cfg.icon
                          return (
                            <tr key={entry.id} className="hover:bg-slate-50 transition">
                              <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                                {new Date(entry.createdAt).toLocaleString('zh-CN')}
                              </td>
                              <td className="px-4 py-3">
                                <span className={`flex items-center gap-1 text-sm ${cfg.color}`}>
                                  <Icon size={14} />
                                  {cfg.label}
                                </span>
                              </td>
                              <td className={`px-4 py-3 text-sm font-medium ${entry.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {entry.amount >= 0 ? '+' : ''}{entry.amount.toFixed(6)}
                              </td>
                              <td className="px-4 py-3 text-sm text-slate-600">{entry.balanceBefore.toFixed(6)}</td>
                              <td className="px-4 py-3 text-sm text-slate-600">{entry.balanceAfter.toFixed(6)}</td>
                              <td className="px-4 py-3 text-sm text-slate-500 max-w-[160px] truncate" title={entry.remark || ''}>
                                {entry.remark || '-'}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                <div className="p-4 text-center">
                  <button
                    onClick={() => setTab('ledger')}
                    className="text-sm text-blue-600 hover:text-blue-800 transition"
                  >
                    查看全部流水 →
                  </button>
                </div>
              </div>
            </>
          ) : null}
        </div>
      )}

      {/* Tab: Ledger */}
      {tab === 'ledger' && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 space-y-4">
          {/* Filter bar */}
          <div className="p-4 border-b border-slate-100">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1">余额类型</label>
                <select
                  value={ledgerFilter.balanceType}
                  onChange={(e) => setLedgerFilter(f => ({ ...f, balanceType: e.target.value }))}
                  className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  <option value="">全部</option>
                  <option value="commission">佣金</option>
                  <option value="redemption">兑换</option>
                  <option value="withdraw">提现</option>
                  <option value="deduction">扣款</option>
                  <option value="freeze">冻结</option>
                  <option value="adjustment">调整</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">变动类型</label>
                <select
                  value={ledgerFilter.changeType}
                  onChange={(e) => setLedgerFilter(f => ({ ...f, changeType: e.target.value }))}
                  className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  <option value="">全部</option>
                  <option value="commission">佣金收入</option>
                  <option value="deduction">扣款</option>
                  <option value="freeze">冻结</option>
                  <option value="unfreeze">解冻</option>
                  <option value="refund">退款</option>
                  <option value="withdraw">提现</option>
                  <option value="adjustment">调整</option>
                </select>
              </div>
              <div className="flex gap-2">
                <button onClick={() => { setLedgerPage(1); fetchLedger() }}
                  className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 transition">
                  <RefreshCw size={14} />
                  查询
                </button>
                <button onClick={() => {
                  setLedgerFilter({ balanceType: '', changeType: '' })
                  setLedgerPage(1)
                }}
                  className="flex items-center gap-1 px-3 py-1.5 border border-slate-300 text-slate-600 rounded-lg text-sm hover:bg-slate-50 transition">
                  <AlertCircle size={14} />
                  重置
                </button>
              </div>
            </div>
          </div>

          {/* Ledger table */}
          {ledgerLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="animate-spin" size={24} />
            </div>
          ) : ledgerError ? (
            <div className="flex items-center gap-2 text-red-600 bg-red-50 p-4 rounded-lg text-sm m-4">
              <AlertCircle size={16} /> {ledgerError}
            </div>
          ) : ledger.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-sm">暂无资金流水</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50 text-left">
                    <th className="px-4 py-3 text-sm font-medium text-slate-500">时间</th>
                    <th className="px-4 py-3 text-sm font-medium text-slate-500">余额类型</th>
                    <th className="px-4 py-3 text-sm font-medium text-slate-500">变动类型</th>
                    <th className="px-4 py-3 text-sm font-medium text-slate-500 text-right">变动金额</th>
                    <th className="px-4 py-3 text-sm font-medium text-slate-500 text-right">变动前</th>
                    <th className="px-4 py-3 text-sm font-medium text-slate-500 text-right">变动后</th>
                    <th className="px-4 py-3 text-sm font-medium text-slate-500">参考</th>
                    <th className="px-4 py-3 text-sm font-medium text-slate-500">备注</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {ledger.map(entry => {
                    const cfg = changeTypeMap[entry.changeType] || { label: entry.changeType, color: 'text-slate-600', icon: Minus }
                    const Icon = cfg.icon
                    return (
                      <tr key={entry.id} className="hover:bg-slate-50 transition">
                        <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                          {new Date(entry.createdAt).toLocaleString('zh-CN')}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-700">
                          {balanceTypeMap[entry.balanceType] || entry.balanceType}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`flex items-center gap-1 text-sm ${cfg.color}`}>
                            <Icon size={14} />
                            {cfg.label}
                          </span>
                        </td>
                        <td className={`px-4 py-3 text-sm font-medium text-right ${entry.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {entry.amount >= 0 ? '+' : ''}{entry.amount.toFixed(6)}
                        </td>
                        <td className="px-4 py-3 text-sm text-right text-slate-600 font-mono">{entry.balanceBefore.toFixed(6)}</td>
                        <td className="px-4 py-3 text-sm text-right text-slate-600 font-mono">{entry.balanceAfter.toFixed(6)}</td>
                        <td className="px-4 py-3 text-sm text-slate-500">
                          {entry.refType ? `${entry.refType}#${entry.refId || ''}` : '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-500 max-w-[160px] truncate" title={entry.remark || ''}>
                          {entry.remark || '-'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          {ledgerTotalPages > 0 && (
            <PaginationBar page={ledgerPage} onPageChange={setLedgerPage} pageSize={ledgerPageSize} onPageSizeChange={setLedgerPageSize} total={ledgerTotal} totalPages={ledgerTotalPages} />
          )}
        </div>
      )}
    </div>
  )
}
