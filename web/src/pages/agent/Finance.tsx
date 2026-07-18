import { useEffect, useState, useCallback, useMemo } from 'react'
import { get } from '@/lib/api'
import { Loader2, Wallet, AlertCircle } from 'lucide-react'
import type { SettlementData, LedgerEntry, LedgerQueryResult } from './finance/types'
import FinanceStatsCards from './finance/FinanceStatsCards'
import BalanceHistory from './finance/BalanceHistory'
import TransactionList from './finance/TransactionList'

// ── 财务管理（代理商）──
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

  const ledgerTotalPages = useMemo(() => Math.ceil(ledgerTotal / ledgerPageSize), [ledgerTotal, ledgerPageSize])

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

  const tabs = useMemo(() => [
    { key: 'settlement' as const, label: '结算单' },
    { key: 'ledger' as const, label: '资金流水' },
  ], [])

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Wallet size={28} className="text-green-600" />
        <h1 className="text-2xl font-bold text-slate-900">财务管理</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-lg w-fit">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-md text-sm transition ${tab === t.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            {t.label}
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
              <FinanceStatsCards account={settlement.account} monthSummary={settlement.monthSummary} />
              <BalanceHistory entries={settlement.recentEntries} onViewAll={() => setTab('ledger')} />
            </>
          ) : null}
        </div>
      )}

      {/* Tab: Ledger */}
      {tab === 'ledger' && (
        <TransactionList
          entries={ledger}
          total={ledgerTotal}
          page={ledgerPage}
          pageSize={ledgerPageSize}
          totalPages={ledgerTotalPages}
          loading={ledgerLoading}
          error={ledgerError}
          filter={ledgerFilter}
          onFilterChange={setLedgerFilter}
          onQuery={() => { setLedgerPage(1); fetchLedger() }}
          onReset={() => { setLedgerFilter({ balanceType: '', changeType: '' }); setLedgerPage(1) }}
          onPageChange={setLedgerPage}
          onPageSizeChange={setLedgerPageSize}
        />
      )}
    </div>
  )
}
